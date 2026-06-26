package handler

import (
	"net/http"

	"github.com/chemlingo/backend/internal/pyq"
	"github.com/chemlingo/backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type PYQHandler struct{ store *store.Store }

func NewPYQHandler(s *store.Store) *PYQHandler { return &PYQHandler{store: s} }

// GetPYQQuestions handles GET /api/v1/topics/:id/pyq
// Returns questions without correct answers.
func (h *PYQHandler) GetPYQQuestions(c *gin.Context) {
	topicID := c.Param("id")
	slug, err := h.store.GetTopicSlugByID(c.Request.Context(), topicID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "topic not found"})
		return
	}

	playerID := c.MustGet("student_id").(uuid.UUID)
	bestScore, _ := h.store.GetPYQBestScore(c.Request.Context(), playerID, slug)

	questions := pyq.ForTopicPublic(slug)
	c.JSON(http.StatusOK, gin.H{
		"topic_slug":  slug,
		"questions":   questions,
		"best_score":  bestScore,
		"total":       len(questions),
	})
}

// SubmitPYQ handles POST /api/v1/topics/:id/pyq/submit
func (h *PYQHandler) SubmitPYQ(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)
	topicID := c.Param("id")

	slug, err := h.store.GetTopicSlugByID(c.Request.Context(), topicID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "topic not found"})
		return
	}

	var req struct {
		Answers []struct {
			QuestionID    string `json:"question_id"`
			SelectedIndex int    `json:"selected_index"`
		} `json:"answers"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	allQs := pyq.ForTopic(slug)
	qMap := make(map[string]pyq.Question, len(allQs))
	for _, q := range allQs {
		qMap[q.ID] = q
	}

	correct := 0
	type result struct {
		QuestionID   string `json:"question_id"`
		Correct      bool   `json:"correct"`
		CorrectIndex int    `json:"correct_index"`
		Explanation  string `json:"explanation"`
	}
	results := make([]result, 0, len(req.Answers))
	for _, a := range req.Answers {
		q, ok := qMap[a.QuestionID]
		if !ok {
			continue
		}
		isCorrect := a.SelectedIndex == q.CorrectIndex
		if isCorrect {
			correct++
		}
		results = append(results, result{
			QuestionID:   a.QuestionID,
			Correct:      isCorrect,
			CorrectIndex: q.CorrectIndex,
			Explanation:  q.Explanation,
		})
	}

	total := len(allQs)
	xpEarned := correct * 15
	coinsEarned := correct * 5

	if err := h.store.SavePYQSession(c.Request.Context(), playerID, slug, correct, total); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"correct":      correct,
		"total":        total,
		"score":        correct * 100 / max(total, 1),
		"xp_earned":   xpEarned,
		"coins_earned": coinsEarned,
		"results":     results,
	})
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
