package model

import (
	"time"

	"github.com/google/uuid"
)

type DrillType string

const (
	ReactionMatcher     DrillType = "reaction_matcher"
	TrendSlider         DrillType = "trend_slider"
	ColorPrecipitateID  DrillType = "color_precipitate_id"
	ExceptionBossFight  DrillType = "exception_boss_fight"
)

type Difficulty string

const (
	Easy   Difficulty = "easy"
	Medium Difficulty = "medium"
	Hard   Difficulty = "hard"
	Boss   Difficulty = "boss"
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

type Drill struct {
	ID           uuid.UUID              `json:"id"`
	TopicID      uuid.UUID              `json:"topic_id"`
	Type         DrillType              `json:"type"`
	Difficulty   Difficulty             `json:"difficulty"`
	QuestionData map[string]interface{} `json:"question_data"`
	Tags         []string               `json:"tags"`
}

type DrillAttempt struct {
	StudentID       uuid.UUID              `json:"student_id"`
	DrillID         uuid.UUID              `json:"drill_id"`
	IsCorrect       bool                   `json:"is_correct"`
	TimeTakenMs     int                    `json:"time_taken_ms"`
	SubmittedAnswer map[string]interface{} `json:"submitted_answer"`
	XPEarned        int                    `json:"xp_earned"`
}

type SRSCard struct {
	StudentID     uuid.UUID  `json:"student_id"`
	DrillID       uuid.UUID  `json:"drill_id"`
	EaseFactor    float64    `json:"ease_factor"`
	IntervalDays  int        `json:"interval_days"`
	Repetitions   int        `json:"repetitions"`
	NextReviewAt  time.Time  `json:"next_review_at"`
	LastReviewedAt *time.Time `json:"last_reviewed_at"`
}

type LeaderboardEntry struct {
	StudentID uuid.UUID `json:"student_id"`
	FullName  string    `json:"full_name"`
	TotalXP   int       `json:"total_xp"`
	Rank      int       `json:"rank"`
}
