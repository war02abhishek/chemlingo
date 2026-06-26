package handler

import (
	"net/http"
	"strconv"

	"github.com/chemlingo/backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type QuestionsHandler struct {
	store *store.Store
}

func NewQuestionsHandler(s *store.Store) *QuestionsHandler {
	return &QuestionsHandler{store: s}
}

// POST /api/v1/teacher/questions
func (h *QuestionsHandler) Create(c *gin.Context) {
	teacherID, _ := c.Get("student_id")
	tid, _ := teacherID.(uuid.UUID)

	var in store.CreateQuestionInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if in.Prompt == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "prompt is required"})
		return
	}
	if in.Difficulty == "" {
		in.Difficulty = "medium"
	}
	if in.Type == "" {
		in.Type = "mcq"
	}

	id, err := h.store.CreateQuestion(c.Request.Context(), tid, in)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "status": "draft"})
}

// PUT /api/v1/teacher/questions/:id/approve
func (h *QuestionsHandler) Approve(c *gin.Context) {
	qid := c.Param("id")
	if err := h.store.ApproveQuestion(c.Request.Context(), qid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "approved"})
}

// GET /api/v1/teacher/questions?topic_id=&status=&limit=
func (h *QuestionsHandler) List(c *gin.Context) {
	topicID := c.Query("topic_id")
	status := c.Query("status")
	limit := 50
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}

	qs, err := h.store.ListQuestions(c.Request.Context(), topicID, status, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"questions": qs, "total": len(qs)})
}

// GET /api/v1/teacher/questions/:id/approve  (alias for approve — convenience)
// GET /api/v1/questions?mode=duel&topic_slug=&limit=  (student-facing, approved only)
func (h *QuestionsHandler) ListApproved(c *gin.Context) {
	mode := c.Query("mode")
	if mode == "" {
		mode = "duel"
	}
	topicSlug := c.Query("topic_slug")
	limit := 10
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}

	qs, err := h.store.GetApprovedQuestionsForMode(c.Request.Context(), mode, topicSlug, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Strip correct_index for student-facing endpoint
	type publicQ struct {
		ID         string   `json:"id"`
		Type       string   `json:"type"`
		Prompt     string   `json:"prompt"`
		Options    []string `json:"options"`
		Concept    string   `json:"concept"`
		Difficulty string   `json:"difficulty"`
		IsPYQ      bool     `json:"is_pyq"`
		PyqExam    string   `json:"pyq_exam,omitempty"`
		PyqYear    int      `json:"pyq_year,omitempty"`
	}
	out := make([]publicQ, 0, len(qs))
	for _, q := range qs {
		out = append(out, publicQ{
			ID: q.ID, Type: q.Type, Prompt: q.Prompt,
			Options: q.Options, Concept: q.Concept, Difficulty: q.Difficulty,
			IsPYQ: q.IsPYQ, PyqExam: q.PyqExam, PyqYear: q.PyqYear,
		})
	}
	c.JSON(http.StatusOK, gin.H{"questions": out})
}

// POST /api/v1/questions/submit  — submit answers against question bank, get explanations back
func (h *QuestionsHandler) Submit(c *gin.Context) {
	var body struct {
		Answers []struct {
			QuestionID    string `json:"question_id"`
			SelectedIndex int    `json:"selected_index"`
		} `json:"answers"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Fetch full questions (with answers) for validation
	ids := make([]string, 0, len(body.Answers))
	for _, a := range body.Answers {
		ids = append(ids, a.QuestionID)
	}
	questions, err := h.store.GetQuestionsByIDs(c.Request.Context(), ids)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type resultItem struct {
		QuestionID    string   `json:"question_id"`
		Correct       bool     `json:"correct"`
		CorrectIndex  int      `json:"correct_index"`
		Explanation   string   `json:"explanation"`
		Options       []string `json:"options"`
	}
	qMap := make(map[string]store.QuestionRow, len(questions))
	for _, q := range questions {
		qMap[q.ID] = q
	}

	results := make([]resultItem, 0, len(body.Answers))
	correct := 0
	for _, a := range body.Answers {
		q, ok := qMap[a.QuestionID]
		if !ok {
			continue
		}
		ci := 0
		if q.CorrectIndex != nil {
			ci = *q.CorrectIndex
		}
		isCorrect := a.SelectedIndex == ci
		if isCorrect {
			correct++
		}
		results = append(results, resultItem{
			QuestionID:   a.QuestionID,
			Correct:      isCorrect,
			CorrectIndex: ci,
			Explanation:  q.Explanation,
			Options:      q.Options,
		})
	}

	total := len(body.Answers)
	score := 0
	if total > 0 {
		score = correct * 100 / total
	}
	c.JSON(http.StatusOK, gin.H{
		"correct": correct,
		"total":   total,
		"score":   score,
		"results": results,
	})
}
