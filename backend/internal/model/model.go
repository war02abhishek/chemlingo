package model

import (
	"time"

	"github.com/google/uuid"
)

type Student struct {
	ID                  uuid.UUID `json:"id"`
	InstituteID         uuid.UUID `json:"institute_id"`
	Email               string    `json:"email"`
	FullName            string    `json:"full_name"`
	Batch               string    `json:"batch"`
	CurrentStreak       int       `json:"current_streak"`
	MaxStreak           int       `json:"max_streak"`
	Catalysts           int       `json:"catalysts"`
	TotalXP             int       `json:"total_xp"`
	LastActiveAt        time.Time `json:"last_active_at"`
	Rating              int       `json:"rating"`
	Wins                int       `json:"wins"`
	Losses              int       `json:"losses"`
	Role                string    `json:"role"`
	Coins               int       `json:"coins"`
	Hearts              int       `json:"hearts"`
	NeedsPasswordChange bool      `json:"needs_password_change"`
	BatchName           string    `json:"batch_name,omitempty"`
}

// Profile is returned by GET /api/v1/profile.
type Profile struct {
	PlayerID            string    `json:"player_id"`
	Name                string    `json:"name"`
	Email               string    `json:"email"`
	Rating              int       `json:"rating"`
	Wins                int       `json:"wins"`
	Losses              int       `json:"losses"`
	Rank                string    `json:"rank"`
	RankEmoji           string    `json:"rank_emoji"`
	TotalXP             int       `json:"total_xp"`
	CurrentStreak       int       `json:"current_streak"`
	Coins               int       `json:"coins"`
	Hearts              int       `json:"hearts"`
	LastActiveAt        time.Time `json:"last_active_at"`
	BatchName           string    `json:"batch_name,omitempty"`
	NeedsPasswordChange bool      `json:"needs_password_change"`
	DailyChallengeDone  bool      `json:"daily_challenge_done"`
	DuelWonToday        bool      `json:"duel_won_today"`
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

// ── Curriculum ────────────────────────────────────────────────────────────────

// TopicWithProgress is returned by GET /api/v1/curriculum.
// LockReason: "" = unlocked, "self" = beat previous boss, "teacher" = waiting for teacher
type TopicWithProgress struct {
	ID               string `json:"id"`
	Slug             string `json:"slug"`
	Title            string `json:"title"`
	Icon             string `json:"icon"`
	Position         int    `json:"position"`
	TotalLessons     int    `json:"total_lessons"`
	LessonsCompleted int    `json:"lessons_completed"`
	BossDefeated     bool   `json:"boss_defeated"`
	LockReason       string `json:"lock_reason"`
}

// LessonWithStatus is returned inside a topic's lesson list.
type LessonWithStatus struct {
	ID          string `json:"id"`
	Slug        string `json:"slug"`
	Title       string `json:"title"`
	Position    int    `json:"position"`
	GameMode    string `json:"game_mode"`
	ConceptText string `json:"concept_text"`
	XPReward    int    `json:"xp_reward"`
	CoinReward  int    `json:"coin_reward"`
	Completed   bool   `json:"completed"`
	Score       int    `json:"score"`
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
