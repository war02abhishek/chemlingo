package handler

import (
	"net/http"
	"time"

	"github.com/chemlingo/backend/internal/challenge"
	"github.com/chemlingo/backend/internal/model"
	"github.com/chemlingo/backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type DailyChallengeHandler struct {
	store *store.Store
}

func NewDailyChallengeHandler(s *store.Store) *DailyChallengeHandler {
	return &DailyChallengeHandler{store: s}
}

// todayUTC returns today's date string in UTC.
func todayUTC() (time.Time, string) {
	now := time.Now().UTC()
	return now, now.Format("2006-01-02")
}

// GetChallenge handles GET /api/v1/daily-challenge
// Returns today's questions (without answers) and the player's existing submission if any.
func (h *DailyChallengeHandler) GetChallenge(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)
	now, date := todayUTC()

	questions := challenge.ForDate(now)

	// Check if player already submitted today.
	sub, err := h.store.GetDailyChallengeSubmission(c.Request.Context(), playerID, date)
	if err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch challenge status"})
		return
	}

	// Compute seconds until next reset (next UTC midnight).
	tomorrow := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
	secsToReset := int64(tomorrow.Sub(now).Seconds())

	c.JSON(http.StatusOK, gin.H{
		"date":           date,
		"questions":      questions,
		"my_submission":  sub,  // null if not yet submitted
		"secs_to_reset":  secsToReset,
	})
}

// submitAnswerPayload is one question's submission.
type submitAnswerPayload struct {
	QuestionID   string `json:"question_id"`
	Coefficients []int  `json:"coefficients"`
}

// submitRequest is the POST body for submitting a completed challenge.
type submitRequest struct {
	CompletionTimeMs int64                 `json:"completion_time_ms"`
	Answers          []submitAnswerPayload `json:"answers"`
}

// SubmitChallenge handles POST /api/v1/daily-challenge/submit
// Validates answers, computes score, stores result, awards XP.
func (h *DailyChallengeHandler) SubmitChallenge(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)
	now, date := todayUTC()

	// Guard: only one submission per day.
	existing, err := h.store.GetDailyChallengeSubmission(c.Request.Context(), playerID, date)
	if err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not check submission"})
		return
	}
	if existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "already submitted today", "submission": existing})
		return
	}

	var req submitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	if req.CompletionTimeMs <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid completion_time_ms"})
		return
	}

	dayQuestions := challenge.ForDate(now)

	// Validate each submitted answer.
	type questionResult struct {
		QuestionID string `json:"question_id"`
		Correct    bool   `json:"correct"`
	}
	var results []questionResult
	correctCount := 0

	for _, a := range req.Answers {
		correct, found := challenge.ValidateByID(dayQuestions, a.QuestionID, a.Coefficients)
		if !found {
			continue // skip unknown question IDs
		}
		if correct {
			correctCount++
		}
		results = append(results, questionResult{QuestionID: a.QuestionID, Correct: correct})
	}

	total := len(dayQuestions)
	score := challenge.Score(correctCount, req.CompletionTimeMs)
	xp := challenge.XPReward(correctCount, total, score)

	if err := h.store.SaveDailyChallengeSubmission(
		c.Request.Context(), playerID, date,
		score, correctCount, total, req.CompletionTimeMs, xp,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not save submission"})
		return
	}

	rank, _ := h.store.GetMyDailyChallengeRank(c.Request.Context(), playerID, date)

	c.JSON(http.StatusOK, gin.H{
		"score":              score,
		"correct_answers":    correctCount,
		"total_questions":    total,
		"completion_time_ms": req.CompletionTimeMs,
		"question_results":   results,
		"rewards":            gin.H{"xp": xp},
		"rank":               rank,
	})
}

// GetLeaderboard handles GET /api/v1/daily-challenge/leaderboard
// Optional ?date=YYYY-MM-DD defaults to today.
func (h *DailyChallengeHandler) GetLeaderboard(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)

	date := c.Query("date")
	if date == "" {
		_, date = todayUTC()
	}

	entries, total, err := h.store.GetDailyChallengeLeaderboard(c.Request.Context(), date, 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch leaderboard"})
		return
	}
	if entries == nil {
		entries = make([]model.DailyChallengeLeaderboardEntry, 0)
	}

	myRank, _ := h.store.GetMyDailyChallengeRank(c.Request.Context(), playerID, date)

	c.JSON(http.StatusOK, gin.H{
		"date":          date,
		"entries":       entries,
		"my_player_id":  playerID.String(),
		"my_rank":       myRank,
		"total_players": total,
	})
}
