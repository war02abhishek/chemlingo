package model

import (
	"time"

	"github.com/google/uuid"
)

type Student struct {
	ID            uuid.UUID `json:"id"`
	InstituteID   uuid.UUID `json:"institute_id"`
	Email         string    `json:"email"`
	FullName      string    `json:"full_name"`
	Batch         string    `json:"batch"`
	CurrentStreak int       `json:"current_streak"`
	MaxStreak     int       `json:"max_streak"`
	Catalysts     int       `json:"catalysts"`
	TotalXP       int       `json:"total_xp"`
	LastActiveAt  time.Time `json:"last_active_at"`
}
