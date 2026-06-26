package handler

import (
	"net/http"
	"time"

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

func todayUTC() (time.Time, string) {
	now := time.Now().UTC()
	return now, now.Format("2006-01-02")
}

// publicDailyQuestion is the question shape sent to the student (no correct_index).
type publicDailyQuestion struct {
	ID         string   `json:"id"`
	Type       string   `json:"type"`       // mcq | element_id | true_false | balancing
	Prompt     string   `json:"prompt"`
	Options    []string `json:"options"`    // always present for choice types
	Concept    string   `json:"concept"`
	Difficulty string   `json:"difficulty"`
	IsPYQ      bool     `json:"is_pyq"`
	PyqExam    string   `json:"pyq_exam,omitempty"`
	PyqYear    int      `json:"pyq_year,omitempty"`
}

// GetChallenge handles GET /api/v1/daily-challenge
func (h *DailyChallengeHandler) GetChallenge(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)
	now, date := todayUTC()

	questions, err := h.store.GetDailyQuestions(c.Request.Context(), date)
	if err != nil || len(questions) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load daily questions"})
		return
	}

	sub, err := h.store.GetDailyChallengeSubmission(c.Request.Context(), playerID, date)
	if err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch submission"})
		return
	}

	tomorrow := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, time.UTC)
	secsToReset := int64(tomorrow.Sub(now).Seconds())

	pub := make([]publicDailyQuestion, 0, len(questions))
	for _, q := range questions {
		opts := q.Options
		if opts == nil {
			opts = []string{}
		}
		pub = append(pub, publicDailyQuestion{
			ID: q.ID, Type: q.Type, Prompt: q.Prompt,
			Options: opts, Concept: q.Concept, Difficulty: q.Difficulty,
			IsPYQ: q.IsPYQ, PyqExam: q.PyqExam, PyqYear: q.PyqYear,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"date":          date,
		"questions":     pub,
		"my_submission": sub,
		"secs_to_reset": secsToReset,
	})
}

// dailyAnswerPayload supports both choice-based and balancing questions.
type dailyAnswerPayload struct {
	QuestionID    string `json:"question_id"`
	SelectedIndex int    `json:"selected_index"` // for mcq / element_id / true_false
	Coefficients  []int  `json:"coefficients"`   // for balancing type
}

type dailySubmitRequest struct {
	CompletionTimeMs int64                `json:"completion_time_ms"`
	Answers          []dailyAnswerPayload `json:"answers"`
}

// SubmitChallenge handles POST /api/v1/daily-challenge/submit
func (h *DailyChallengeHandler) SubmitChallenge(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)
	_, date := todayUTC()

	existing, err := h.store.GetDailyChallengeSubmission(c.Request.Context(), playerID, date)
	if err != nil && err != pgx.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not check submission"})
		return
	}
	if existing != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "already submitted today", "submission": existing})
		return
	}

	var req dailySubmitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	if req.CompletionTimeMs <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid completion_time_ms"})
		return
	}

	// Fetch full questions (with answers) for the submitted IDs
	ids := make([]string, 0, len(req.Answers))
	for _, a := range req.Answers {
		ids = append(ids, a.QuestionID)
	}
	fullQs, err := h.store.GetQuestionsByIDs(c.Request.Context(), ids)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch questions"})
		return
	}
	qMap := make(map[string]store.QuestionRow, len(fullQs))
	for _, q := range fullQs {
		qMap[q.ID] = q
	}

	type questionResult struct {
		QuestionID string `json:"question_id"`
		Correct    bool   `json:"correct"`
	}
	var results []questionResult
	correctCount := 0

	for _, a := range req.Answers {
		q, ok := qMap[a.QuestionID]
		if !ok {
			continue
		}
		var correct bool
		if q.Type == "balancing" {
			// balancing: compare coefficient arrays
			correct = validateCoeffs(q, a.Coefficients)
		} else {
			// mcq / element_id / true_false: compare selected index
			correct = q.CorrectIndex != nil && *q.CorrectIndex == a.SelectedIndex
		}
		if correct {
			correctCount++
		}
		results = append(results, questionResult{QuestionID: a.QuestionID, Correct: correct})
	}

	total := len(req.Answers)
	score := calcScore(correctCount, total, req.CompletionTimeMs)
	xp := calcXP(correctCount, total, score)

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

// ── helpers ───────────────────────────────────────────────────────────────────

func validateCoeffs(_ store.QuestionRow, _ []int) bool {
	// Balancing questions are not yet in the question bank; always false for now.
	return false
}

func calcScore(correct, total int, timeMs int64) int {
	if total == 0 {
		return 0
	}
	base := correct * 200
	perfect := 0
	if correct == total {
		perfect = 100
	}
	speed := 0
	if timeMs > 0 && timeMs < 90_000 {
		speed = 50
	}
	return base + perfect + speed
}

func calcXP(correct, total, score int) int {
	xp := 50 // completion bonus
	xp += correct * 20
	if correct == total {
		xp += 100
	}
	if score >= 1100 {
		xp += 50
	}
	return xp
}
