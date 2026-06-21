package handler

import (
	"net/http"

	"github.com/chemlingo/backend/internal/duel"
	"github.com/chemlingo/backend/internal/model"
	"github.com/chemlingo/backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ProfileHandler struct {
	store *store.Store
}

func NewProfileHandler(s *store.Store) *ProfileHandler {
	return &ProfileHandler{store: s}
}

// GetProfile handles GET /api/v1/profile
func (h *ProfileHandler) GetProfile(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)
	profile, err := h.store.GetProfile(c.Request.Context(), playerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch profile"})
		return
	}
	profile.Rank = duel.TierForRating(profile.Rating)
	profile.RankEmoji = rankEmoji(profile.Rank)
	c.JSON(http.StatusOK, profile)
}

// GetHistory handles GET /api/v1/profile/history
func (h *ProfileHandler) GetHistory(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)
	history, err := h.store.GetMatchHistory(c.Request.Context(), playerID, 20)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch history"})
		return
	}
	if history == nil {
		history = make([]model.DuelResult, 0)
	}
	c.JSON(http.StatusOK, gin.H{"history": history})
}

func rankEmoji(rank string) string {
	switch rank {
	case "Bronze":
		return "🥉"
	case "Silver":
		return "🥈"
	case "Gold":
		return "🥇"
	case "Platinum":
		return "💠"
	case "Diamond":
		return "💎"
	case "Master":
		return "👑"
	default:
		return "🎮"
	}
}
