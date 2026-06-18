package handler

import (
	"context"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type LeaderboardHandler struct {
	redis *redis.Client
}

func NewLeaderboardHandler(r *redis.Client) *LeaderboardHandler {
	return &LeaderboardHandler{redis: r}
}

func instituteKey(instituteID uuid.UUID) string {
	return fmt.Sprintf("leaderboard:institute:%s", instituteID)
}

func (h *LeaderboardHandler) GetLeaderboard(c *gin.Context) {
	instituteID := c.MustGet("institute_id").(uuid.UUID)

	results, err := h.redis.ZRevRangeWithScores(context.Background(), instituteKey(instituteID), 0, 49).Result()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch leaderboard"})
		return
	}

	entries := make([]gin.H, 0, len(results))
	for i, r := range results {
		entries = append(entries, gin.H{
			"rank":       i + 1,
			"student_id": r.Member,
			"xp":         int(r.Score),
		})
	}

	c.JSON(http.StatusOK, gin.H{"leaderboard": entries})
}

// SyncXP is called after each drill attempt to keep Redis in sync
func SyncXP(r *redis.Client, instituteID, studentID uuid.UUID, xpDelta int) error {
	return r.ZIncrBy(context.Background(), instituteKey(instituteID), float64(xpDelta), studentID.String()).Err()
}
