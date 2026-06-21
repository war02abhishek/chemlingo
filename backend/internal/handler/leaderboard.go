package handler

import (
	"net/http"

	"github.com/chemlingo/backend/internal/duel"
	"github.com/chemlingo/backend/internal/model"
	"github.com/chemlingo/backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type LeaderboardHandler struct {
	store *store.Store
}

func NewLeaderboardHandler(s *store.Store) *LeaderboardHandler {
	return &LeaderboardHandler{store: s}
}

// GetLeaderboard handles GET /api/v1/leaderboard
// Returns top-50 entries plus the requesting player's own entry (for the sticky row).
func (h *LeaderboardHandler) GetLeaderboard(c *gin.Context) {
	playerID := c.MustGet("student_id").(uuid.UUID)

	entries, total, err := h.store.GetLeaderboard(c.Request.Context(), 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch leaderboard"})
		return
	}
	if entries == nil {
		entries = make([]model.LeaderboardEntry, 0)
	}
	for i := range entries {
		entries[i].Rank = duel.TierForRating(entries[i].Rating)
		entries[i].RankEmoji = rankEmoji(entries[i].Rank)
	}

	// Fetch the requesting player's own entry so the frontend can render a
	// sticky "your rank" row even when the player is outside the top 50.
	myEntry, err := h.store.GetPlayerLeaderboardEntry(c.Request.Context(), playerID)
	if err == nil {
		myEntry.Rank = duel.TierForRating(myEntry.Rating)
		myEntry.RankEmoji = rankEmoji(myEntry.Rank)
	} else {
		myEntry = nil
	}

	c.JSON(http.StatusOK, gin.H{
		"entries":       entries,
		"my_entry":      myEntry,
		"my_player_id":  playerID.String(),
		"total_players": total,
	})
}

// GetPublicProfile handles GET /api/v1/players/:id/profile
// Returns a player's public profile, recent match history, and global rank.
func (h *LeaderboardHandler) GetPublicProfile(c *gin.Context) {
	idStr := c.Param("id")
	playerID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid player id"})
		return
	}

	profile, err := h.store.GetProfile(c.Request.Context(), playerID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "player not found"})
		return
	}
	profile.Rank = duel.TierForRating(profile.Rating)
	profile.RankEmoji = rankEmoji(profile.Rank)
	profile.Email = "" // hide email for public view

	history, err := h.store.GetMatchHistory(c.Request.Context(), playerID, 10)
	if err != nil || history == nil {
		history = make([]model.DuelResult, 0)
	}

	rankEntry, err := h.store.GetPlayerLeaderboardEntry(c.Request.Context(), playerID)
	globalRank := 0
	if err == nil {
		globalRank = rankEntry.Position
	}

	c.JSON(http.StatusOK, gin.H{
		"profile":     profile,
		"history":     history,
		"global_rank": globalRank,
	})
}
