package handler

import (
	"net/http"

	"github.com/chemlingo/backend/internal/model"
	"github.com/chemlingo/backend/internal/predictor"
	"github.com/chemlingo/backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type CurriculumHandler struct {
	store *store.Store
}

func NewCurriculumHandler(s *store.Store) *CurriculumHandler {
	return &CurriculumHandler{store: s}
}

// GetCurriculum handles GET /api/v1/curriculum
func (h *CurriculumHandler) GetCurriculum(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)

	topics, err := h.store.GetTopicsWithProgress(c.Request.Context(), playerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load curriculum"})
		return
	}
	if topics == nil {
		topics = []model.TopicWithProgress{}
	}

	c.JSON(http.StatusOK, gin.H{"topics": topics})
}

// GetProgress handles GET /api/v1/curriculum/progress?topic=<slug>
func (h *CurriculumHandler) GetProgress(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)
	topicSlug := c.Query("topic")
	if topicSlug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "topic query param required"})
		return
	}

	lessons, err := h.store.GetLessonsForTopic(c.Request.Context(), topicSlug, playerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load lessons"})
		return
	}
	if lessons == nil {
		lessons = []model.LessonWithStatus{}
	}

	c.JSON(http.StatusOK, gin.H{"lessons": lessons})
}

// CompleteLesson handles POST /api/v1/lessons/:id/complete
func (h *CurriculumHandler) CompleteLesson(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)
	lessonID := c.Param("id")

	var req struct {
		Score int `json:"score"`
	}
	_ = c.ShouldBindJSON(&req)

	lesson, err := h.store.GetLessonByID(c.Request.Context(), lessonID)
	if err == pgx.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "lesson not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "lesson lookup failed"})
		return
	}

	if err := h.store.SaveLessonCompletion(
		c.Request.Context(), playerID, lessonID, req.Score, lesson.XPReward, lesson.CoinReward,
	); err != nil {
		c.JSON(http.StatusOK, gin.H{"xp_earned": 0, "coins_earned": 0, "already_done": true})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"xp_earned":    lesson.XPReward,
		"coins_earned": lesson.CoinReward,
		"already_done": false,
	})
}

// GetBossQuestions handles GET /api/v1/topics/:id/boss
func (h *CurriculumHandler) GetBossQuestions(c *gin.Context) {
	topicID := c.Param("id")
	if _, err := h.store.GetTopicByID(c.Request.Context(), topicID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "topic not found"})
		return
	}

	questions := predictor.ForBoss(topicID)
	c.JSON(http.StatusOK, gin.H{"questions": questions})
}

// SubmitBoss handles POST /api/v1/topics/:id/boss/submit
func (h *CurriculumHandler) SubmitBoss(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)
	topicID := c.Param("id")

	if _, err := h.store.GetTopicByID(c.Request.Context(), topicID); err != nil {
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

	questions := predictor.ForBossWithAnswers(topicID)
	qMap := make(map[string]predictor.Question, len(questions))
	for _, q := range questions {
		qMap[q.ID] = q
	}

	correct := 0
	type result struct {
		QuestionID   string `json:"question_id"`
		Correct      bool   `json:"correct"`
		CorrectIndex int    `json:"correct_index"`
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
		})
	}

	total := len(questions)
	passed := correct*10 >= total*7 // ≥70%
	score := correct * 100

	if err := h.store.SaveBossResult(c.Request.Context(), playerID, topicID, score, passed); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save result"})
		return
	}

	xpEarned, coinsEarned := 0, 0
	if passed {
		xpEarned, coinsEarned = 200, 50
	}

	c.JSON(http.StatusOK, gin.H{
		"correct":      correct,
		"total":        total,
		"score":        score,
		"passed":       passed,
		"xp_earned":    xpEarned,
		"coins_earned": coinsEarned,
		"results":      results,
	})
}
