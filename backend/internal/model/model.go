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
	Rating        int       `json:"rating"`
	Wins          int       `json:"wins"`
	Losses        int       `json:"losses"`
}

// Profile is returned by GET /api/v1/profile.
type Profile struct {
	PlayerID  string `json:"player_id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Rating    int    `json:"rating"`
	Wins      int    `json:"wins"`
	Losses    int    `json:"losses"`
	Rank      string `json:"rank"`
	RankEmoji string `json:"rank_emoji"`
}

// DuelResult is one entry in GET /api/v1/profile/history.
type DuelResult struct {
	MatchID             string    `json:"match_id"`
	Result              string    `json:"result"`
	PlayerRatingBefore  int       `json:"player_rating_before"`
	RatingChange        int       `json:"rating_change"`
	OpponentName        string    `json:"opponent_name"`
	OpponentRatingBefore int      `json:"opponent_rating_before"`
	PlayedAt            time.Time `json:"played_at"`
}

// DailyChallengeSubmission is stored per player per day.
type DailyChallengeSubmission struct {
	Score            int    `json:"score"`
	CorrectAnswers   int    `json:"correct_answers"`
	TotalQuestions   int    `json:"total_questions"`
	CompletionTimeMs int64  `json:"completion_time_ms"`
	CompletedAt      string `json:"completed_at"`
	Rewards          struct {
		XP int `json:"xp"`
	} `json:"rewards"`
}

// DailyChallengeLeaderboardEntry is one row in the daily leaderboard.
type DailyChallengeLeaderboardEntry struct {
	PlayerID         string `json:"player_id"`
	Name             string `json:"name"`
	Score            int    `json:"score"`
	CorrectAnswers   int    `json:"correct_answers"`
	TotalQuestions   int    `json:"total_questions"`
	CompletionTimeMs int64  `json:"completion_time_ms"`
	Position         int    `json:"position"`
}

// LeaderboardEntry is one row returned by GET /api/v1/leaderboard.
type LeaderboardEntry struct {
	PlayerID  string `json:"player_id"`
	Name      string `json:"name"`
	Rating    int    `json:"rating"`
	Wins      int    `json:"wins"`
	Losses    int    `json:"losses"`
	Rank      string `json:"rank"`
	RankEmoji string `json:"rank_emoji"`
	Position  int    `json:"position"`
}

// SprintSubmission is returned by GET /api/v1/sprint and stored per player per day.
type SprintSubmission struct {
	Score            int    `json:"score"`
	CorrectAnswers   int    `json:"correct_answers"`
	TotalQuestions   int    `json:"total_questions"`
	CompletionTimeMs int64  `json:"completion_time_ms"`
	CompletedAt      string `json:"completed_at"`
	Rewards          struct {
		XP int `json:"xp"`
	} `json:"rewards"`
	PersonalBest int `json:"personal_best"`
}

// SprintLeaderboardEntry is one row in the sprint leaderboard.
type SprintLeaderboardEntry struct {
	PlayerID         string `json:"player_id"`
	Name             string `json:"name"`
	Score            int    `json:"score"`
	CorrectAnswers   int    `json:"correct_answers"`
	TotalQuestions   int    `json:"total_questions"`
	CompletionTimeMs int64  `json:"completion_time_ms"`
	Position         int    `json:"position"`
}

// CompoundSubmission is stored per player per day for Compound Builder.
type CompoundSubmission struct {
	Score            int    `json:"score"`
	CorrectAnswers   int    `json:"correct_answers"`
	TotalQuestions   int    `json:"total_questions"`
	CompletionTimeMs int64  `json:"completion_time_ms"`
	CompletedAt      string `json:"completed_at"`
	Rewards          struct {
		XP int `json:"xp"`
	} `json:"rewards"`
	PersonalBest int `json:"personal_best"`
}

// CompoundLeaderboardEntry is one row in the compound builder leaderboard.
type CompoundLeaderboardEntry struct {
	PlayerID         string `json:"player_id"`
	Name             string `json:"name"`
	Score            int    `json:"score"`
	CorrectAnswers   int    `json:"correct_answers"`
	TotalQuestions   int    `json:"total_questions"`
	CompletionTimeMs int64  `json:"completion_time_ms"`
	Position         int    `json:"position"`
}

// MatchResultRecord is the internal struct passed to Store.RecordMatchResult.
type MatchResultRecord struct {
	MatchID           string
	P0ID, P1ID        uuid.UUID
	P0RatingBefore    int
	P1RatingBefore    int
	P0Delta, P1Delta  int
	P0Result, P1Result string // "win" | "loss" | "tie"
}
