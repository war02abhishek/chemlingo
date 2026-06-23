package handler

import (
	"net/http"
	"time"

	"github.com/chemlingo/backend/internal/predictor"
	"github.com/chemlingo/backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// playerUUID extracts the authenticated student's UUID from context.
func playerUUID(c *gin.Context) (uuid.UUID, bool) {
	v, ok := c.Get("student_id")
	if !ok {
		return uuid.UUID{}, false
	}
	id, ok := v.(uuid.UUID)
	return id, ok
}

type PredictorHandler struct {
	store *store.Store
}

func NewPredictorHandler(s *store.Store) *PredictorHandler {
	return &PredictorHandler{store: s}
}

// GET /api/v1/predictor/lesson/:lesson_id
// Returns 5 seeded questions WITHOUT correct answers.
func (h *PredictorHandler) GetLessonQuestions(c *gin.Context) {
	lessonID := c.Param("lesson_id")
	if lessonID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "lesson_id required"})
		return
	}
	questions := predictor.ForLesson(lessonID)
	c.JSON(http.StatusOK, gin.H{"questions": questions})
}

// POST /api/v1/predictor/lesson/:lesson_id/submit
// Validates answers, saves completion, awards XP + coins.
type submitPredictorReq struct {
	Answers    []predictorAnswer `json:"answers" binding:"required"`
	ElapsedMs  int64             `json:"elapsed_ms"`
}

type predictorAnswer struct {
	QuestionID    string `json:"question_id"`
	SelectedIndex int    `json:"selected_index"`
}

func (h *PredictorHandler) SubmitLesson(c *gin.Context) {
	lessonID := c.Param("lesson_id")
	var req submitPredictorReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate each answer
	correct := 0
	type Result struct {
		QuestionID   string `json:"question_id"`
		Correct      bool   `json:"correct"`
		CorrectIndex int    `json:"correct_index"`
	}
	results := make([]Result, 0, len(req.Answers))

	for _, a := range req.Answers {
		isCorrect, correctIdx, found := predictor.ValidateAnswer(lessonID, a.QuestionID, a.SelectedIndex)
		if !found {
			continue
		}
		if isCorrect {
			correct++
		}
		results = append(results, Result{
			QuestionID:   a.QuestionID,
			Correct:      isCorrect,
			CorrectIndex: correctIdx,
		})
	}

	total := len(req.Answers)
	score := predictor.Score(correct, req.ElapsedMs)
	xpEarned := predictor.XPReward(score, correct, total)

	// Save lesson completion + award XP + coins
	ctx := c.Request.Context()
	coinReward := 10
	if pid, ok := playerUUID(c); ok {
		if lesson, lerr := h.store.GetLessonByID(ctx, lessonID); lerr == nil && lesson != nil {
			coinReward = lesson.CoinReward
		}
		_ = h.store.SaveLessonCompletion(ctx, pid, lessonID, score, xpEarned, coinReward)
	}

	c.JSON(http.StatusOK, gin.H{
		"correct":      correct,
		"total":        total,
		"score":        score,
		"xp_earned":   xpEarned,
		"coins_earned": coinReward,
		"results":      results,
		"completed_at": time.Now().UTC(),
	})
}

// GET /api/v1/predictor/practice
// Returns a single random question for quick practice.
func (h *PredictorHandler) GetPracticeQuestion(c *gin.Context) {
	q := predictor.ForPractice()
	c.JSON(http.StatusOK, gin.H{"question": q})
}
