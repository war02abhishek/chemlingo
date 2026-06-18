package handler

import (
	"net/http"

	"github.com/chemlingo/backend/internal/model"
	"github.com/chemlingo/backend/internal/service"
	"github.com/chemlingo/backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type DrillHandler struct {
	store *store.Store
	redis *redis.Client
}

func NewDrillHandler(s *store.Store, r *redis.Client) *DrillHandler {
	return &DrillHandler{store: s, redis: r}
}

func (h *DrillHandler) GetDueDrills(c *gin.Context) {
	studentID := c.MustGet("student_id").(uuid.UUID)

	drills, err := h.store.GetDrillsDueForReview(c.Request.Context(), studentID, 10)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch drills"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"drills": drills})
}

func (h *DrillHandler) SubmitAttempt(c *gin.Context) {
	studentID := c.MustGet("student_id").(uuid.UUID)
	instituteID := c.MustGet("institute_id").(uuid.UUID)

	var req struct {
		DrillID     uuid.UUID              `json:"drill_id" binding:"required"`
		IsCorrect   bool                   `json:"is_correct"`
		TimeTakenMs int                    `json:"time_taken_ms" binding:"required"`
		Answer      map[string]interface{} `json:"answer"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	xp := service.CalcXP(req.IsCorrect, req.TimeTakenMs)
	quality := service.QualityFromAttempt(req.IsCorrect, req.TimeTakenMs)

	attempt := &model.DrillAttempt{
		StudentID:       studentID,
		DrillID:         req.DrillID,
		IsCorrect:       req.IsCorrect,
		TimeTakenMs:     req.TimeTakenMs,
		SubmittedAnswer: req.Answer,
		XPEarned:        xp,
	}

	if err := h.store.RecordAttempt(c.Request.Context(), attempt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record attempt"})
		return
	}

	// Load existing SRS card; fall back to defaults for first attempt on a drill
	card, err := h.store.GetSRSCard(c.Request.Context(), studentID, req.DrillID)
	if err != nil {
		card = &model.SRSCard{StudentID: studentID, DrillID: req.DrillID, EaseFactor: 2.5, IntervalDays: 1}
	}
	service.SM2(card, quality)
	if err := h.store.UpdateSRS(c.Request.Context(), card); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update SRS schedule"})
		return
	}

	if err := h.store.UpdateStudentXP(c.Request.Context(), studentID, xp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update XP"})
		return
	}

	// Keep Redis leaderboard in sync
	SyncXP(h.redis, instituteID, studentID, xp)

	c.JSON(http.StatusOK, gin.H{"xp_earned": xp, "next_review_in_days": card.IntervalDays})
}
