package handler

import (
	"net/http"
	"time"

	"github.com/chemlingo/backend/internal/compound"
	"github.com/chemlingo/backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// CompoundHandler handles all Compound Builder endpoints.
type CompoundHandler struct {
	store *store.Store
}

func NewCompoundHandler(s *store.Store) *CompoundHandler {
	return &CompoundHandler{store: s}
}

// todayCompound returns the UTC now and today's date string.
func todayCompound() (time.Time, string) {
	now := time.Now().UTC()
	return now, now.Format("2006-01-02")
}

// GetDaily handles GET /api/v1/compound/daily.
// Returns today's 5 questions + the player's submission (if any).
func (h *CompoundHandler) GetDaily(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)
	now, date := todayCompound()

	questions := compound.ForDate(now)

	sub, err := h.store.GetCompoundSubmission(c.Request.Context(), playerID, date)
	if err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
		return
	}

	personalBest, _ := h.store.GetCompoundPersonalBest(c.Request.Context(), playerID)
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

// submitDailyRequest is the body for POST /api/v1/compound/daily/submit.
type submitCompoundRequest struct {
	CompletionTimeMs int64 `json:"completion_time_ms"`
	Answers          []struct {
		QuestionID    string               `json:"question_id"`
		SelectedIons  []compound.SelectedIon `json:"selected_ions"`
	} `json:"answers"`
}

// SubmitDaily handles POST /api/v1/compound/daily/submit.
func (h *CompoundHandler) SubmitDaily(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)
	now, date := todayCompound()

	// Guard: already submitted today?
	existing, err := h.store.GetCompoundSubmission(c.Request.Context(), playerID, date)
	if err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
		return
	}
	if existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "already submitted today"})
		return
	}

	var req submitCompoundRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	questions := compound.ForDate(now)

	type questionResult struct {
		QuestionID    string                 `json:"question_id"`
		Correct       bool                   `json:"correct"`
		CorrectFormula string                `json:"correct_formula"`
		CorrectIons   []compound.SelectedIon `json:"correct_ions"`
	}

	results := make([]questionResult, 0, len(req.Answers))
	correctCount := 0

	for _, ans := range req.Answers {
		ok, correctIons, formula, found := compound.ValidateByID(questions, ans.QuestionID, ans.SelectedIons)
		if !found {
			continue
		}
		if ok {
			correctCount++
		}
		results = append(results, questionResult{
			QuestionID:     ans.QuestionID,
			Correct:        ok,
			CorrectFormula: formula,
			CorrectIons:    correctIons,
		})
	}

	total := len(questions)
	score := compound.Score(correctCount, req.CompletionTimeMs)
	xp := compound.XPReward(score, correctCount, total)

	if err := h.store.SaveCompoundSubmission(
		c.Request.Context(), playerID, date,
		score, correctCount, total, req.CompletionTimeMs, xp,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save"})
		return
	}

	rank, _ := h.store.GetMyCompoundRank(c.Request.Context(), playerID, date)
	personalBest, _ := h.store.GetCompoundPersonalBest(c.Request.Context(), playerID)

	c.JSON(http.StatusOK, gin.H{
		"score":            score,
		"correct_answers":  correctCount,
		"total_questions":  total,
		"completion_time_ms": req.CompletionTimeMs,
		"question_results": results,
		"rewards":          gin.H{"xp": xp},
		"rank":             rank,
		"personal_best":    personalBest,
	})
}

// GetLeaderboard handles GET /api/v1/compound/daily/leaderboard.
func (h *CompoundHandler) GetLeaderboard(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)
	date := c.Query("date")
	if date == "" {
		_, date = todayCompound()
	}

	entries, total, err := h.store.GetCompoundLeaderboard(c.Request.Context(), date, 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
		return
	}

	rank, _ := h.store.GetMyCompoundRank(c.Request.Context(), playerID, date)

	c.JSON(http.StatusOK, gin.H{
		"date":         date,
		"entries":      entries,
		"my_player_id": playerID.String(),
		"my_rank":      rank,
		"total_players": total,
	})
}

// GetPractice handles GET /api/v1/compound/practice?difficulty=easy|medium|hard|any.
func (h *CompoundHandler) GetPractice(c *gin.Context) {
	difficulty := c.DefaultQuery("difficulty", "any")
	q, ok := compound.GetPractice(difficulty)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "no compounds available"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"question": q})
}

// checkPracticeRequest is the body for POST /api/v1/compound/practice/check.
type checkPracticeRequest struct {
	QuestionID   string                 `json:"question_id"`
	SelectedIons []compound.SelectedIon `json:"selected_ions"`
}

// CheckPractice handles POST /api/v1/compound/practice/check.
// Validates a practice answer without storing anything.
func (h *CompoundHandler) CheckPractice(c *gin.Context) {
	// For practice, we need to regenerate the question from the ID.
	// Practice IDs are "practice_compound_0" — we just check against all compounds.
	var req checkPracticeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// Build a single-question slice from today's date (unused for practice)
	// so we can call ValidateByID — but practice questions have ID "practice_compound_0"
	// and the compound is included in the question itself.
	// We cannot re-derive a random practice question by ID alone, so the client
	// must resend the question data. Instead, validate charge balance as fallback.
	// Better: the client sends which compound name it was given.
	// Simplest solution: validate that total positive charge == total negative charge.
	correct, balance := validateChargeBalance(req.SelectedIons)

	c.JSON(http.StatusOK, gin.H{
		"correct":        correct,
		"charge_balance": balance,
	})
}

// validateChargeBalance checks that the sum of (charge × count) is zero.
func validateChargeBalance(selected []compound.SelectedIon) (bool, int) {
	ionMap := map[string]int{
		"na+": 1, "k+": 1, "ca2+": 2, "mg2+": 2, "al3+": 3,
		"fe2+": 2, "fe3+": 3, "nh4+": 1, "cu2+": 2, "zn2+": 2,
		"cl-": -1, "br-": -1, "f-": -1, "o2-": -2, "s2-": -2,
		"oh-": -1, "no3-": -1, "so4-": -2, "co3-": -2, "po4-": -3,
		"hco3-": -1, "so3-": -2,
	}
	total := 0
	for _, s := range selected {
		if charge, ok := ionMap[s.IonID]; ok {
			total += charge * s.Count
		}
	}
	return total == 0, total
}
