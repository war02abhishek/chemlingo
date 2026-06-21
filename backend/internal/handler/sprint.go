package handler

import (
	"net/http"
	"time"

	"github.com/chemlingo/backend/internal/model"
	"github.com/chemlingo/backend/internal/sprint"
	"github.com/chemlingo/backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type SprintHandler struct {
	store *store.Store
}

func NewSprintHandler(s *store.Store) *SprintHandler {
	return &SprintHandler{store: s}
}

// todaySprint returns the current UTC date as time.Time and "YYYY-MM-DD" string.
func todaySprint() (time.Time, string) {
	now := time.Now().UTC()
	return now, now.Format("2006-01-02")
}

// GetSprint handles GET /api/v1/sprint
// Returns today's 10 questions (without answers), the player's submission if any,
// their personal best, and seconds until next reset.
func (h *SprintHandler) GetSprint(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)
	now, date := todaySprint()

	questions := sprint.ForDate(now)

	sub, err := h.store.GetSprintSubmission(c.Request.Context(), playerID, date)
	if err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch sprint status"})
		return
	}

	personalBest, _ := h.store.GetSprintPersonalBest(c.Request.Context(), playerID)
	if sub != nil {
		sub.PersonalBest = personalBest
	}

	tomorrow := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
	secsToReset := int64(tomorrow.Sub(now).Seconds())

	c.JSON(http.StatusOK, gin.H{
		"date":          date,
		"questions":     questions,
		"my_submission": sub,
		"personal_best": personalBest,
		"secs_to_reset": secsToReset,
	})
}

// sprintAnswerPayload is one question's submission.
type sprintAnswerPayload struct {
	QuestionID    string `json:"question_id"`
	SelectedIndex int    `json:"selected_index"`
}

// sprintSubmitRequest is the POST body.
type sprintSubmitRequest struct {
	CompletionTimeMs int64                 `json:"completion_time_ms"`
	Answers          []sprintAnswerPayload `json:"answers"`
}

// SubmitSprint handles POST /api/v1/sprint/submit
// Validates selected option indices against today's generated questions,
// computes score, stores result, awards XP.
func (h *SprintHandler) SubmitSprint(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)
	now, date := todaySprint()

	existing, err := h.store.GetSprintSubmission(c.Request.Context(), playerID, date)
	if err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not check submission"})
		return
	}
	if existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "already submitted today", "submission": existing})
		return
	}

	var req sprintSubmitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	if req.CompletionTimeMs <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid completion_time_ms"})
		return
	}

	dayQuestions := sprint.ForDate(now)

	type questionResult struct {
		QuestionID     string `json:"question_id"`
		Correct        bool   `json:"correct"`
		SelectedIndex  int    `json:"selected_index"`
		CorrectIndex   int    `json:"correct_index"`
		CorrectOption  string `json:"correct_option"`
	}

	var results []questionResult
	correctCount := 0

	for _, a := range req.Answers {
		correct, correctIdx, correctOpt, found := sprint.ValidateByID(dayQuestions, a.QuestionID, a.SelectedIndex)
		if !found {
			continue
		}
		if correct {
			correctCount++
		}
		results = append(results, questionResult{
			QuestionID:    a.QuestionID,
			Correct:       correct,
			SelectedIndex: a.SelectedIndex,
			CorrectIndex:  correctIdx,
			CorrectOption: correctOpt,
		})
	}

	total := len(dayQuestions)
	score := sprint.Score(correctCount, req.CompletionTimeMs)
	xp := sprint.XPReward(correctCount, total, score)

	if err := h.store.SaveSprintSubmission(
		c.Request.Context(), playerID, date,
		score, correctCount, total, req.CompletionTimeMs, xp,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not save submission"})
		return
	}

	rank, _ := h.store.GetMySprintRank(c.Request.Context(), playerID, date)
	personalBest, _ := h.store.GetSprintPersonalBest(c.Request.Context(), playerID)

	c.JSON(http.StatusOK, gin.H{
		"score":              score,
		"correct_answers":    correctCount,
		"total_questions":    total,
		"completion_time_ms": req.CompletionTimeMs,
		"question_results":   results,
		"rewards":            gin.H{"xp": xp},
		"rank":               rank,
		"personal_best":      personalBest,
	})
}

// GetSprintLeaderboard handles GET /api/v1/sprint/leaderboard
// Optional ?date=YYYY-MM-DD defaults to today.
func (h *SprintHandler) GetSprintLeaderboard(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)

	date := c.Query("date")
	if date == "" {
		_, date = todaySprint()
	}

	entries, total, err := h.store.GetSprintLeaderboard(c.Request.Context(), date, 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch leaderboard"})
		return
	}
	if entries == nil {
		entries = make([]model.SprintLeaderboardEntry, 0)
	}

	myRank, _ := h.store.GetMySprintRank(c.Request.Context(), playerID, date)

	c.JSON(http.StatusOK, gin.H{
		"date":          date,
		"entries":       entries,
		"my_player_id":  playerID.String(),
		"my_rank":       myRank,
		"total_players": total,
	})
}
