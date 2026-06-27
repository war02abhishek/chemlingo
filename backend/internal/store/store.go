package store

import (
	"context"
	"fmt"

	"github.com/chemlingo/backend/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type Store struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

// Migrate runs idempotent schema changes needed for the rating system.
// Called once at startup so no external migration tool is required.
func (s *Store) Migrate(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
		CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

		CREATE TABLE IF NOT EXISTS institutes (
		    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
		    name       VARCHAR(255) NOT NULL,
		    slug       VARCHAR(100) UNIQUE NOT NULL,
		    is_active  BOOLEAN     DEFAULT TRUE,
		    created_at TIMESTAMPTZ DEFAULT NOW()
		);

		INSERT INTO institutes (name, slug)
		VALUES ('Demo Institute', 'demo')
		ON CONFLICT (slug) DO NOTHING;

		CREATE TABLE IF NOT EXISTS students (
		    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
		    institute_id    UUID        NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
		    email           VARCHAR(255) UNIQUE NOT NULL,
		    password_hash   VARCHAR(255) NOT NULL,
		    full_name       VARCHAR(255) NOT NULL,
		    batch           VARCHAR(50),
		    current_streak  INT         DEFAULT 0,
		    max_streak      INT         DEFAULT 0,
		    catalysts       INT         DEFAULT 0,
		    total_xp        INT         DEFAULT 0,
		    created_at      TIMESTAMPTZ DEFAULT NOW(),
		    last_active_at  TIMESTAMPTZ DEFAULT NOW()
		);

		ALTER TABLE students
		  ADD COLUMN IF NOT EXISTS rating  INT NOT NULL DEFAULT 1200,
		  ADD COLUMN IF NOT EXISTS wins    INT NOT NULL DEFAULT 0,
		  ADD COLUMN IF NOT EXISTS losses  INT NOT NULL DEFAULT 0;

		CREATE TABLE IF NOT EXISTS duel_results (
		    id                     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
		    match_id               TEXT        NOT NULL,
		    player_id              UUID        NOT NULL REFERENCES students(id),
		    opponent_id            UUID        NOT NULL REFERENCES students(id),
		    player_rating_before   INT         NOT NULL,
		    opponent_rating_before INT         NOT NULL,
		    rating_change          INT         NOT NULL,
		    result                 TEXT        NOT NULL CHECK (result IN ('win','loss','tie')),
		    played_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS idx_duel_results_player
		    ON duel_results(player_id, played_at DESC);

		CREATE INDEX IF NOT EXISTS idx_students_rating
		    ON students(rating DESC, id ASC);
	`)
	if err != nil {
		return err
	}
	if err := s.MigrateDailyChallenge(ctx); err != nil {
		return err
	}
	if err := s.MigrateSprint(ctx); err != nil {
		return err
	}
	if err := s.MigrateCompound(ctx); err != nil {
		return err
	}
	if err := s.MigrateStudentExtensions(ctx); err != nil {
		return err
	}
	if err := s.MigrateCurriculum(ctx); err != nil {
		return err
	}
	if err := s.MigrateTeacher(ctx); err != nil {
		return err
	}
	return s.MigrateBatchTopicTracking(ctx)
}

// GetLeaderboard returns the top-N players ordered by rating, plus total player count.
func (s *Store) GetLeaderboard(ctx context.Context, limit int) ([]model.LeaderboardEntry, int, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, full_name, rating, wins, losses, position, total_cnt
		FROM (
			SELECT id, full_name, rating, wins, losses,
			       ROW_NUMBER() OVER (ORDER BY rating DESC, id ASC) AS position,
			       COUNT(*) OVER ()                                  AS total_cnt
			FROM students
		) ranked
		ORDER BY position
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var entries []model.LeaderboardEntry
	total := 0
	for rows.Next() {
		var e model.LeaderboardEntry
		var id uuid.UUID
		if err := rows.Scan(&id, &e.Name, &e.Rating, &e.Wins, &e.Losses, &e.Position, &total); err != nil {
			return nil, 0, err
		}
		e.PlayerID = id.String()
		entries = append(entries, e)
	}
	return entries, total, nil
}

// GetPlayerLeaderboardEntry returns a single player's rank entry (position + stats).
func (s *Store) GetPlayerLeaderboardEntry(ctx context.Context, playerID uuid.UUID) (*model.LeaderboardEntry, error) {
	var e model.LeaderboardEntry
	var id uuid.UUID
	err := s.db.QueryRow(ctx, `
		SELECT id, full_name, rating, wins, losses, position
		FROM (
			SELECT id, full_name, rating, wins, losses,
			       ROW_NUMBER() OVER (ORDER BY rating DESC, id ASC) AS position
			FROM students
		) ranked
		WHERE id = $1
	`, playerID).Scan(&id, &e.Name, &e.Rating, &e.Wins, &e.Losses, &e.Position)
	if err != nil {
		return nil, err
	}
	e.PlayerID = id.String()
	return &e, nil
}

func (s *Store) CreateStudent(ctx context.Context, email, passwordHash, fullName, role string) (*model.Student, error) {
	var st model.Student
	err := s.db.QueryRow(ctx, `
		WITH inst AS (SELECT id FROM institutes WHERE slug = 'demo' LIMIT 1)
		INSERT INTO students (institute_id, email, password_hash, full_name, batch, role)
		SELECT id, $1, $2, $3, '', $4 FROM inst
		RETURNING id, institute_id, email, full_name, batch,
		          current_streak, max_streak, catalysts, total_xp, last_active_at,
		          rating, wins, losses,
		          COALESCE(role, 'student'), COALESCE(coins, 0), COALESCE(hearts, 3)
	`, email, passwordHash, fullName, role).Scan(
		&st.ID, &st.InstituteID, &st.Email, &st.FullName, &st.Batch,
		&st.CurrentStreak, &st.MaxStreak, &st.Catalysts, &st.TotalXP, &st.LastActiveAt,
		&st.Rating, &st.Wins, &st.Losses,
		&st.Role, &st.Coins, &st.Hearts,
	)
	return &st, err
}

func (s *Store) GetPasswordHash(ctx context.Context, email string) (string, uuid.UUID, error) {
	var hash string
	var id uuid.UUID
	err := s.db.QueryRow(ctx,
		"SELECT id, password_hash FROM students WHERE email = $1", email,
	).Scan(&id, &hash)
	return hash, id, err
}

func (s *Store) GetStudentByEmail(ctx context.Context, email string) (*model.Student, error) {
	var st model.Student
	err := s.db.QueryRow(ctx, `
		SELECT s.id, s.institute_id, s.email, s.full_name, COALESCE(s.batch, ''),
		       s.current_streak, s.max_streak, s.catalysts, s.total_xp, s.last_active_at,
		       s.rating, s.wins, s.losses,
		       COALESCE(s.role, 'student'), COALESCE(s.coins, 0), COALESCE(s.hearts, 3),
		       COALESCE(s.needs_password_change, FALSE),
		       COALESCE(b.name, '')
		FROM students s
		LEFT JOIN batch_students bs ON bs.student_id = s.id
		LEFT JOIN batches b ON b.id = bs.batch_id
		WHERE s.email = $1
		LIMIT 1
	`, email).Scan(
		&st.ID, &st.InstituteID, &st.Email, &st.FullName, &st.Batch,
		&st.CurrentStreak, &st.MaxStreak, &st.Catalysts, &st.TotalXP, &st.LastActiveAt,
		&st.Rating, &st.Wins, &st.Losses,
		&st.Role, &st.Coins, &st.Hearts,
		&st.NeedsPasswordChange, &st.BatchName,
	)
	if err != nil {
		return nil, err
	}
	return &st, nil
}

// GetStudentRatings returns the current Elo ratings for two players.
func (s *Store) GetStudentRatings(ctx context.Context, p0ID, p1ID uuid.UUID) (r0, r1 int, err error) {
	rows, err := s.db.Query(ctx,
		"SELECT id, rating FROM students WHERE id = ANY($1)",
		[]string{p0ID.String(), p1ID.String()},
	)
	if err != nil {
		return 0, 0, err
	}
	defer rows.Close()
	ratings := map[string]int{}
	for rows.Next() {
		var id uuid.UUID
		var r int
		if err := rows.Scan(&id, &r); err != nil {
			return 0, 0, err
		}
		ratings[id.String()] = r
	}
	r0 = ratings[p0ID.String()]
	r1 = ratings[p1ID.String()]
	if r0 == 0 {
		r0 = 1200
	}
	if r1 == 0 {
		r1 = 1200
	}
	return r0, r1, nil
}

// RecordMatchResult atomically: updates both players' ratings/wins/losses and
// inserts two rows into duel_results.
func (s *Store) RecordMatchResult(ctx context.Context, r model.MatchResultRecord) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	winsP0, lossesP0 := deltaWL(r.P0Result)
	winsP1, lossesP1 := deltaWL(r.P1Result)

	_, err = tx.Exec(ctx, `
		UPDATE students
		SET rating  = GREATEST(0, rating + $1),
		    wins    = wins + $2,
		    losses  = losses + $3
		WHERE id = $4`,
		r.P0Delta, winsP0, lossesP0, r.P0ID,
	)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		UPDATE students
		SET rating  = GREATEST(0, rating + $1),
		    wins    = wins + $2,
		    losses  = losses + $3
		WHERE id = $4`,
		r.P1Delta, winsP1, lossesP1, r.P1ID,
	)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO duel_results
		    (match_id, player_id, opponent_id, player_rating_before, opponent_rating_before, rating_change, result)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		r.MatchID, r.P0ID, r.P1ID, r.P0RatingBefore, r.P1RatingBefore, r.P0Delta, r.P0Result,
	)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO duel_results
		    (match_id, player_id, opponent_id, player_rating_before, opponent_rating_before, rating_change, result)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		r.MatchID, r.P1ID, r.P0ID, r.P1RatingBefore, r.P0RatingBefore, r.P1Delta, r.P1Result,
	)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// GetProfile returns a player's full profile with lazy streak reset.
func (s *Store) GetProfile(ctx context.Context, playerID uuid.UUID) (*model.Profile, error) {
	var p model.Profile
	var id uuid.UUID
	err := s.db.QueryRow(ctx, `
		SELECT s.id, s.full_name, s.email, s.rating, s.wins, s.losses,
		       COALESCE(s.total_xp, 0),
		       CASE WHEN DATE(s.last_active_at) >= CURRENT_DATE - 1
		            THEN COALESCE(s.current_streak, 0)
		            ELSE 0
		       END AS current_streak,
		       COALESCE(s.coins, 0),
		       CASE WHEN s.hearts_last_refill < NOW() - INTERVAL '24 hours'
		            THEN 3
		            ELSE COALESCE(s.hearts, 3)
		       END AS hearts,
		       s.last_active_at,
		       COALESCE(b.name, ''),
		       COALESCE(s.needs_password_change, FALSE),
		       EXISTS (
		           SELECT 1 FROM daily_challenge_submissions
		           WHERE player_id = s.id AND challenge_date = CURRENT_DATE
		       ) AS daily_challenge_done,
		       EXISTS (
		           SELECT 1 FROM duel_results
		           WHERE player_id = s.id AND result = 'win'
		             AND DATE(played_at) = CURRENT_DATE
		       ) AS duel_won_today
		FROM students s
		LEFT JOIN batch_students bs ON bs.student_id = s.id
		LEFT JOIN batches b ON b.id = bs.batch_id
		WHERE s.id = $1
		LIMIT 1
	`, playerID).Scan(
		&id, &p.Name, &p.Email, &p.Rating, &p.Wins, &p.Losses,
		&p.TotalXP, &p.CurrentStreak, &p.Coins, &p.Hearts, &p.LastActiveAt,
		&p.BatchName, &p.NeedsPasswordChange,
		&p.DailyChallengeDone, &p.DuelWonToday,
	)
	if err != nil {
		return nil, err
	}
	p.PlayerID = id.String()
	return &p, nil
}

// GetMatchHistory returns recent duel results for a player (newest first).
func (s *Store) GetMatchHistory(ctx context.Context, playerID uuid.UUID, limit int) ([]model.DuelResult, error) {
	rows, err := s.db.Query(ctx, `
		SELECT dr.match_id, dr.result,
		       dr.player_rating_before, dr.rating_change,
		       s.full_name, dr.opponent_rating_before,
		       dr.played_at
		FROM duel_results dr
		JOIN students s ON s.id = dr.opponent_id
		WHERE dr.player_id = $1
		ORDER BY dr.played_at DESC
		LIMIT $2`,
		playerID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []model.DuelResult
	for rows.Next() {
		var d model.DuelResult
		if err := rows.Scan(
			&d.MatchID, &d.Result,
			&d.PlayerRatingBefore, &d.RatingChange,
			&d.OpponentName, &d.OpponentRatingBefore,
			&d.PlayedAt,
		); err != nil {
			return nil, err
		}
		results = append(results, d)
	}
	return results, nil
}

// ── Daily challenge ───────────────────────────────────────────────────────────

// MigrateDailyChallenge creates the daily challenge submission table.
// Called from the main Migrate once at startup.
func (s *Store) MigrateDailyChallenge(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS daily_challenge_submissions (
		    id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
		    player_id            UUID        NOT NULL REFERENCES students(id),
		    challenge_date       DATE        NOT NULL,
		    score                INT         NOT NULL DEFAULT 0,
		    correct_answers      INT         NOT NULL DEFAULT 0,
		    total_questions      INT         NOT NULL DEFAULT 5,
		    completion_time_ms   BIGINT      NOT NULL DEFAULT 0,
		    xp_earned            INT         NOT NULL DEFAULT 0,
		    completed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		    UNIQUE(player_id, challenge_date)
		);

		CREATE INDEX IF NOT EXISTS idx_dc_date_score
		    ON daily_challenge_submissions(challenge_date, score DESC, completion_time_ms ASC);
	`)
	return err
}

// GetDailyChallengeSubmission returns the player's submission for a date, or nil if not submitted.
func (s *Store) GetDailyChallengeSubmission(ctx context.Context, playerID uuid.UUID, date string) (*model.DailyChallengeSubmission, error) {
	var sub model.DailyChallengeSubmission
	var completedAt string
	err := s.db.QueryRow(ctx, `
		SELECT score, correct_answers, total_questions, completion_time_ms, xp_earned,
		       TO_CHAR(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM daily_challenge_submissions
		WHERE player_id = $1 AND challenge_date = $2::date
	`, playerID, date).Scan(
		&sub.Score, &sub.CorrectAnswers, &sub.TotalQuestions,
		&sub.CompletionTimeMs, &sub.Rewards.XP, &completedAt,
	)
	if err != nil {
		return nil, err // pgx.ErrNoRows if not found
	}
	sub.CompletedAt = completedAt
	return &sub, nil
}

// SaveDailyChallengeSubmission inserts a new submission (fails if duplicate).
func (s *Store) SaveDailyChallengeSubmission(
	ctx context.Context,
	playerID uuid.UUID,
	date string,
	score, correctAnswers, totalQuestions int,
	completionTimeMs int64,
	xpEarned int,
) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO daily_challenge_submissions
		    (player_id, challenge_date, score, correct_answers, total_questions, completion_time_ms, xp_earned)
		VALUES ($1, $2::date, $3, $4, $5, $6, $7)
	`, playerID, date, score, correctAnswers, totalQuestions, completionTimeMs, xpEarned)
	if err != nil {
		return err
	}

	// Award XP
	_, err = tx.Exec(ctx,
		"UPDATE students SET total_xp = total_xp + $1 WHERE id = $2",
		xpEarned, playerID,
	)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// GetDailyChallengeLeaderboard returns top-N submissions for a date plus total participant count.
func (s *Store) GetDailyChallengeLeaderboard(ctx context.Context, date string, limit int) ([]model.DailyChallengeLeaderboardEntry, int, error) {
	rows, err := s.db.Query(ctx, `
		SELECT s.id, s.full_name,
		       dcs.score, dcs.correct_answers, dcs.total_questions, dcs.completion_time_ms,
		       ROW_NUMBER() OVER (ORDER BY dcs.score DESC, dcs.completion_time_ms ASC) AS position,
		       COUNT(*) OVER () AS total_cnt
		FROM daily_challenge_submissions dcs
		JOIN students s ON s.id = dcs.player_id
		WHERE dcs.challenge_date = $1::date
		ORDER BY dcs.score DESC, dcs.completion_time_ms ASC
		LIMIT $2
	`, date, limit)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var entries []model.DailyChallengeLeaderboardEntry
	total := 0
	for rows.Next() {
		var e model.DailyChallengeLeaderboardEntry
		var id uuid.UUID
		if err := rows.Scan(&id, &e.Name, &e.Score, &e.CorrectAnswers, &e.TotalQuestions,
			&e.CompletionTimeMs, &e.Position, &total); err != nil {
			return nil, 0, err
		}
		e.PlayerID = id.String()
		entries = append(entries, e)
	}
	return entries, total, nil
}

// GetMyDailyChallengeRank returns the player's position for a given date (1-indexed).
func (s *Store) GetMyDailyChallengeRank(ctx context.Context, playerID uuid.UUID, date string) (int, error) {
	var pos int
	err := s.db.QueryRow(ctx, `
		SELECT position FROM (
			SELECT player_id,
			       ROW_NUMBER() OVER (ORDER BY score DESC, completion_time_ms ASC) AS position
			FROM daily_challenge_submissions
			WHERE challenge_date = $1::date
		) ranked
		WHERE player_id = $2
	`, date, playerID).Scan(&pos)
	return pos, err
}

// ── Sprint ────────────────────────────────────────────────────────────────────

// MigrateSprint creates the sprint submissions table.
// Called from the main Migrate once at startup.
func (s *Store) MigrateSprint(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS sprint_submissions (
		    id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
		    player_id            UUID        NOT NULL REFERENCES students(id),
		    sprint_date          DATE        NOT NULL,
		    score                INT         NOT NULL DEFAULT 0,
		    correct_answers      INT         NOT NULL DEFAULT 0,
		    total_questions      INT         NOT NULL DEFAULT 10,
		    completion_time_ms   BIGINT      NOT NULL DEFAULT 0,
		    xp_earned            INT         NOT NULL DEFAULT 0,
		    completed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		    UNIQUE(player_id, sprint_date)
		);

		CREATE INDEX IF NOT EXISTS idx_sprint_date_score
		    ON sprint_submissions(sprint_date, score DESC, completion_time_ms ASC);
	`)
	return err
}

// GetSprintSubmission returns the player's submission for a date, or nil if not submitted.
func (s *Store) GetSprintSubmission(ctx context.Context, playerID uuid.UUID, date string) (*model.SprintSubmission, error) {
	var sub model.SprintSubmission
	var completedAt string
	err := s.db.QueryRow(ctx, `
		SELECT score, correct_answers, total_questions, completion_time_ms, xp_earned,
		       TO_CHAR(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM sprint_submissions
		WHERE player_id = $1 AND sprint_date = $2::date
	`, playerID, date).Scan(
		&sub.Score, &sub.CorrectAnswers, &sub.TotalQuestions,
		&sub.CompletionTimeMs, &sub.Rewards.XP, &completedAt,
	)
	if err != nil {
		return nil, err
	}
	sub.CompletedAt = completedAt
	return &sub, nil
}

// SaveSprintSubmission inserts a new submission and awards XP (fails if duplicate).
func (s *Store) SaveSprintSubmission(
	ctx context.Context,
	playerID uuid.UUID,
	date string,
	score, correctAnswers, totalQuestions int,
	completionTimeMs int64,
	xpEarned int,
) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO sprint_submissions
		    (player_id, sprint_date, score, correct_answers, total_questions, completion_time_ms, xp_earned)
		VALUES ($1, $2::date, $3, $4, $5, $6, $7)
	`, playerID, date, score, correctAnswers, totalQuestions, completionTimeMs, xpEarned)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx,
		"UPDATE students SET total_xp = total_xp + $1 WHERE id = $2",
		xpEarned, playerID,
	)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// GetSprintLeaderboard returns top-N submissions for a date plus total participant count.
func (s *Store) GetSprintLeaderboard(ctx context.Context, date string, limit int) ([]model.SprintLeaderboardEntry, int, error) {
	rows, err := s.db.Query(ctx, `
		SELECT st.id, st.full_name,
		       ss.score, ss.correct_answers, ss.total_questions, ss.completion_time_ms,
		       ROW_NUMBER() OVER (ORDER BY ss.score DESC, ss.completion_time_ms ASC) AS position,
		       COUNT(*) OVER () AS total_cnt
		FROM sprint_submissions ss
		JOIN students st ON st.id = ss.player_id
		WHERE ss.sprint_date = $1::date
		ORDER BY ss.score DESC, ss.completion_time_ms ASC
		LIMIT $2
	`, date, limit)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var entries []model.SprintLeaderboardEntry
	total := 0
	for rows.Next() {
		var e model.SprintLeaderboardEntry
		var id uuid.UUID
		if err := rows.Scan(&id, &e.Name, &e.Score, &e.CorrectAnswers, &e.TotalQuestions,
			&e.CompletionTimeMs, &e.Position, &total); err != nil {
			return nil, 0, err
		}
		e.PlayerID = id.String()
		entries = append(entries, e)
	}
	return entries, total, nil
}

// GetMySprintRank returns the player's position for a given date (1-indexed).
func (s *Store) GetMySprintRank(ctx context.Context, playerID uuid.UUID, date string) (int, error) {
	var pos int
	err := s.db.QueryRow(ctx, `
		SELECT position FROM (
			SELECT player_id,
			       ROW_NUMBER() OVER (ORDER BY score DESC, completion_time_ms ASC) AS position
			FROM sprint_submissions
			WHERE sprint_date = $1::date
		) ranked
		WHERE player_id = $2
	`, date, playerID).Scan(&pos)
	return pos, err
}

// GetSprintPersonalBest returns the player's highest score across all sprint dates.
func (s *Store) GetSprintPersonalBest(ctx context.Context, playerID uuid.UUID) (int, error) {
	var best int
	err := s.db.QueryRow(ctx,
		"SELECT COALESCE(MAX(score), 0) FROM sprint_submissions WHERE player_id = $1",
		playerID,
	).Scan(&best)
	return best, err
}

// ── Compound Builder ──────────────────────────────────────────────────────────

// MigrateCompound creates the compound builder submission table.
func (s *Store) MigrateCompound(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS compound_submissions (
		    id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
		    player_id            UUID        NOT NULL REFERENCES students(id),
		    compound_date        DATE        NOT NULL,
		    score                INT         NOT NULL DEFAULT 0,
		    correct_answers      INT         NOT NULL DEFAULT 0,
		    total_questions      INT         NOT NULL DEFAULT 5,
		    completion_time_ms   BIGINT      NOT NULL DEFAULT 0,
		    xp_earned            INT         NOT NULL DEFAULT 0,
		    completed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		    UNIQUE(player_id, compound_date)
		);

		CREATE INDEX IF NOT EXISTS idx_compound_date_score
		    ON compound_submissions(compound_date, score DESC, completion_time_ms ASC);
	`)
	return err
}

// GetCompoundSubmission returns the player's submission for a date, or nil if not submitted.
func (s *Store) GetCompoundSubmission(ctx context.Context, playerID uuid.UUID, date string) (*model.CompoundSubmission, error) {
	var sub model.CompoundSubmission
	var completedAt string
	err := s.db.QueryRow(ctx, `
		SELECT score, correct_answers, total_questions, completion_time_ms, xp_earned,
		       TO_CHAR(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM compound_submissions
		WHERE player_id = $1 AND compound_date = $2::date
	`, playerID, date).Scan(
		&sub.Score, &sub.CorrectAnswers, &sub.TotalQuestions,
		&sub.CompletionTimeMs, &sub.Rewards.XP, &completedAt,
	)
	if err != nil {
		return nil, err
	}
	sub.CompletedAt = completedAt
	return &sub, nil
}

// SaveCompoundSubmission inserts a new submission and awards XP (fails if duplicate).
func (s *Store) SaveCompoundSubmission(
	ctx context.Context,
	playerID uuid.UUID,
	date string,
	score, correctAnswers, totalQuestions int,
	completionTimeMs int64,
	xpEarned int,
) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO compound_submissions
		    (player_id, compound_date, score, correct_answers, total_questions, completion_time_ms, xp_earned)
		VALUES ($1, $2::date, $3, $4, $5, $6, $7)
	`, playerID, date, score, correctAnswers, totalQuestions, completionTimeMs, xpEarned)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx,
		"UPDATE students SET total_xp = total_xp + $1 WHERE id = $2",
		xpEarned, playerID,
	)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// GetCompoundLeaderboard returns top-N submissions for a date plus total participant count.
func (s *Store) GetCompoundLeaderboard(ctx context.Context, date string, limit int) ([]model.CompoundLeaderboardEntry, int, error) {
	rows, err := s.db.Query(ctx, `
		SELECT st.id, st.full_name,
		       cs.score, cs.correct_answers, cs.total_questions, cs.completion_time_ms,
		       ROW_NUMBER() OVER (ORDER BY cs.score DESC, cs.completion_time_ms ASC) AS position,
		       COUNT(*) OVER () AS total_cnt
		FROM compound_submissions cs
		JOIN students st ON st.id = cs.player_id
		WHERE cs.compound_date = $1::date
		ORDER BY cs.score DESC, cs.completion_time_ms ASC
		LIMIT $2
	`, date, limit)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var entries []model.CompoundLeaderboardEntry
	total := 0
	for rows.Next() {
		var e model.CompoundLeaderboardEntry
		var id uuid.UUID
		if err := rows.Scan(&id, &e.Name, &e.Score, &e.CorrectAnswers, &e.TotalQuestions,
			&e.CompletionTimeMs, &e.Position, &total); err != nil {
			return nil, 0, err
		}
		e.PlayerID = id.String()
		entries = append(entries, e)
	}
	return entries, total, nil
}

// GetMyCompoundRank returns the player's leaderboard position for a date (1-indexed).
func (s *Store) GetMyCompoundRank(ctx context.Context, playerID uuid.UUID, date string) (int, error) {
	var pos int
	err := s.db.QueryRow(ctx, `
		SELECT position FROM (
			SELECT player_id,
			       ROW_NUMBER() OVER (ORDER BY score DESC, completion_time_ms ASC) AS position
			FROM compound_submissions
			WHERE compound_date = $1::date
		) ranked
		WHERE player_id = $2
	`, date, playerID).Scan(&pos)
	return pos, err
}

// GetCompoundPersonalBest returns the player's highest score across all compound dates.
func (s *Store) GetCompoundPersonalBest(ctx context.Context, playerID uuid.UUID) (int, error) {
	var best int
	err := s.db.QueryRow(ctx,
		"SELECT COALESCE(MAX(score), 0) FROM compound_submissions WHERE player_id = $1",
		playerID,
	).Scan(&best)
	return best, err
}

// ── Student extensions ────────────────────────────────────────────────────────

// MigrateStudentExtensions adds Flasky v1 columns to the students table.
func (s *Store) MigrateStudentExtensions(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
		ALTER TABLE students
		  ADD COLUMN IF NOT EXISTS coins              INT         NOT NULL DEFAULT 0,
		  ADD COLUMN IF NOT EXISTS hearts             INT         NOT NULL DEFAULT 3,
		  ADD COLUMN IF NOT EXISTS hearts_last_refill TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		  ADD COLUMN IF NOT EXISTS role               TEXT        NOT NULL DEFAULT 'student',
		  ADD COLUMN IF NOT EXISTS batch_id           UUID;
	`)
	return err
}

// AwardCoins atomically adds coins to a student's balance.
func (s *Store) AwardCoins(ctx context.Context, playerID uuid.UUID, amount int) error {
	_, err := s.db.Exec(ctx,
		"UPDATE students SET coins = coins + $1 WHERE id = $2",
		amount, playerID,
	)
	return err
}

// ── Curriculum ────────────────────────────────────────────────────────────────

// MigrateCurriculum creates topic, lesson, lesson_completion, and topic_progress tables.
func (s *Store) MigrateCurriculum(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS topics (
		    id            UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
		    slug          TEXT    UNIQUE NOT NULL,
		    title         TEXT    NOT NULL,
		    icon          TEXT,
		    position      INT     NOT NULL,
		    total_lessons INT     NOT NULL DEFAULT 5
		);

		CREATE TABLE IF NOT EXISTS lessons (
		    id           UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
		    topic_id     UUID    NOT NULL REFERENCES topics(id),
		    slug         TEXT    UNIQUE NOT NULL,
		    title        TEXT    NOT NULL,
		    position     INT     NOT NULL,
		    game_mode    TEXT    NOT NULL,
		    concept_text TEXT,
		    xp_reward    INT     NOT NULL DEFAULT 50,
		    coin_reward  INT     NOT NULL DEFAULT 10
		);

		CREATE TABLE IF NOT EXISTS lesson_completions (
		    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
		    player_id    UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
		    lesson_id    UUID        NOT NULL REFERENCES lessons(id),
		    score        INT,
		    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		    UNIQUE(player_id, lesson_id)
		);

		CREATE TABLE IF NOT EXISTS topic_progress (
		    player_id          UUID    NOT NULL REFERENCES students(id) ON DELETE CASCADE,
		    topic_id           UUID    NOT NULL REFERENCES topics(id),
		    lessons_completed  INT     NOT NULL DEFAULT 0,
		    boss_defeated      BOOLEAN NOT NULL DEFAULT FALSE,
		    PRIMARY KEY (player_id, topic_id)
		);
	`)
	return err
}

// UpsertTopic inserts or updates a topic by slug.
func (s *Store) UpsertTopic(ctx context.Context, slug, title, icon string, position, totalLessons int) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO topics (slug, title, icon, position, total_lessons)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (slug) DO UPDATE
		  SET title = EXCLUDED.title, icon = EXCLUDED.icon,
		      position = EXCLUDED.position, total_lessons = EXCLUDED.total_lessons
	`, slug, title, icon, position, totalLessons)
	return err
}

// UpsertLesson inserts or updates a lesson by slug (topic must exist first).
func (s *Store) UpsertLesson(ctx context.Context, topicSlug, slug, title string, position int, gameMode, conceptText string, xpReward, coinReward int) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO lessons (topic_id, slug, title, position, game_mode, concept_text, xp_reward, coin_reward)
		SELECT t.id, $2, $3, $4, $5, $6, $7, $8 FROM topics t WHERE t.slug = $1
		ON CONFLICT (slug) DO UPDATE
		  SET title = EXCLUDED.title, position = EXCLUDED.position,
		      game_mode = EXCLUDED.game_mode, concept_text = EXCLUDED.concept_text,
		      xp_reward = EXCLUDED.xp_reward, coin_reward = EXCLUDED.coin_reward
	`, topicSlug, slug, title, position, gameMode, conceptText, xpReward, coinReward)
	return err
}

// GetTopicsWithProgress returns all topics with per-student progress and lock status.
// Lock logic: if student is in a batch, teacher's current_topic gates access;
// otherwise self-study mode where boss defeat unlocks the next topic.
func (s *Store) GetTopicsWithProgress(ctx context.Context, playerID uuid.UUID) ([]model.TopicWithProgress, error) {
	rows, err := s.db.Query(ctx, `
		WITH student_batch AS (
		    SELECT b.current_topic_id,
		           COALESCE(t.position, 0) AS current_topic_pos
		    FROM batch_students bs
		    JOIN batches b ON b.id = bs.batch_id
		    LEFT JOIN topics t ON t.id = b.current_topic_id
		    WHERE bs.student_id = $1
		    LIMIT 1
		)
		SELECT
		    t.id::TEXT, t.slug, t.title, t.icon, t.position, t.total_lessons,
		    LEAST(COALESCE(tp.lessons_completed, 0), t.total_lessons),
		    COALESCE(tp.boss_defeated, FALSE),
		    CASE
		        WHEN NOT EXISTS (SELECT 1 FROM student_batch) THEN
		            CASE
		                WHEN t.position = 1 THEN ''
		                WHEN COALESCE((
		                    SELECT tp2.boss_defeated
		                    FROM topic_progress tp2
		                    JOIN topics t2 ON t2.id = tp2.topic_id
		                    WHERE tp2.player_id = $1 AND t2.position = t.position - 1
		                ), FALSE) THEN ''
		                ELSE 'self'
		            END
		        ELSE
		            CASE
		                WHEN t.position = 1 THEN ''
		                WHEN t.position <= (SELECT current_topic_pos FROM student_batch) THEN ''
		                ELSE 'teacher'
		            END
		    END AS lock_reason
		FROM topics t
		LEFT JOIN topic_progress tp ON tp.topic_id = t.id AND tp.player_id = $1
		ORDER BY t.position
	`, playerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []model.TopicWithProgress
	for rows.Next() {
		var tw model.TopicWithProgress
		if err := rows.Scan(&tw.ID, &tw.Slug, &tw.Title, &tw.Icon, &tw.Position, &tw.TotalLessons,
			&tw.LessonsCompleted, &tw.BossDefeated, &tw.LockReason); err != nil {
			return nil, err
		}
		results = append(results, tw)
	}
	return results, nil
}

// GetLessonsForTopic returns all lessons for a topic with completion status for a student.
func (s *Store) GetLessonsForTopic(ctx context.Context, topicSlug string, playerID uuid.UUID) ([]model.LessonWithStatus, error) {
	rows, err := s.db.Query(ctx, `
		SELECT l.id, l.slug, l.title, l.position, l.game_mode, l.concept_text, l.xp_reward, l.coin_reward,
		       (lc.id IS NOT NULL) AS completed, COALESCE(lc.score, 0)
		FROM lessons l
		JOIN topics t ON t.id = l.topic_id
		LEFT JOIN lesson_completions lc ON lc.lesson_id = l.id AND lc.player_id = $2
		WHERE t.slug = $1
		ORDER BY l.position
	`, topicSlug, playerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []model.LessonWithStatus
	for rows.Next() {
		var ls model.LessonWithStatus
		var id uuid.UUID
		if err := rows.Scan(&id, &ls.Slug, &ls.Title, &ls.Position, &ls.GameMode,
			&ls.ConceptText, &ls.XPReward, &ls.CoinReward, &ls.Completed, &ls.Score); err != nil {
			return nil, err
		}
		ls.ID = id.String()
		results = append(results, ls)
	}
	return results, nil
}

// GetLessonByID returns a single lesson's metadata (xp/coin rewards) by UUID string.
func (s *Store) GetLessonByID(ctx context.Context, lessonID string) (*model.LessonWithStatus, error) {
	lid, err := uuid.Parse(lessonID)
	if err != nil {
		return nil, err
	}
	var ls model.LessonWithStatus
	var id uuid.UUID
	err = s.db.QueryRow(ctx, `
		SELECT id, slug, title, position, game_mode, COALESCE(concept_text,''), xp_reward, coin_reward
		FROM lessons WHERE id = $1
	`, lid).Scan(&id, &ls.Slug, &ls.Title, &ls.Position, &ls.GameMode, &ls.ConceptText, &ls.XPReward, &ls.CoinReward)
	if err != nil {
		return nil, err
	}
	ls.ID = id.String()
	return &ls, nil
}

// SaveLessonCompletion records a lesson completion, awards XP + coins, updates streak and topic_progress.
// Returns an error wrapping pgx.ErrNoRows-like sentinel if lesson was already completed (idempotent guard).
func (s *Store) SaveLessonCompletion(ctx context.Context, playerID uuid.UUID, lessonID string, score, xpReward, coinReward int) error {
	lid, err := uuid.Parse(lessonID)
	if err != nil {
		return err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		INSERT INTO lesson_completions (player_id, lesson_id, score)
		VALUES ($1, $2, $3)
		ON CONFLICT (player_id, lesson_id) DO NOTHING
	`, playerID, lid, score)
	if err != nil {
		return err
	}

	if tag.RowsAffected() == 0 {
		// Already completed — no XP, no streak update
		return tx.Commit(ctx)
	}

	// Award XP + coins and update streak atomically
	_, err = tx.Exec(ctx, `
		WITH new_streak AS (
		  SELECT CASE
		    WHEN DATE(last_active_at) = CURRENT_DATE        THEN COALESCE(current_streak, 0)
		    WHEN DATE(last_active_at) = CURRENT_DATE - 1    THEN COALESCE(current_streak, 0) + 1
		    ELSE 1
		  END AS val
		  FROM students WHERE id = $3
		)
		UPDATE students SET
		  total_xp       = total_xp + $1,
		  coins          = coins + $2,
		  current_streak = (SELECT val FROM new_streak),
		  max_streak     = GREATEST(max_streak, (SELECT val FROM new_streak)),
		  last_active_at = NOW()
		WHERE id = $3
	`, xpReward, coinReward, playerID)
	if err != nil {
		return err
	}

	// Upsert topic_progress (increment lessons_completed only for first completion)
	_, err = tx.Exec(ctx, `
		INSERT INTO topic_progress (player_id, topic_id, lessons_completed)
		SELECT $1, l.topic_id, 1 FROM lessons l WHERE l.id = $2
		ON CONFLICT (player_id, topic_id) DO UPDATE
		  SET lessons_completed = topic_progress.lessons_completed + 1
	`, playerID, lid)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// GetTopicByID returns a topic's ID string (validates it exists).
func (s *Store) GetTopicByID(ctx context.Context, topicID string) (string, error) {
	tid, err := uuid.Parse(topicID)
	if err != nil {
		return "", err
	}
	var id uuid.UUID
	err = s.db.QueryRow(ctx, `SELECT id FROM topics WHERE id = $1`, tid).Scan(&id)
	return id.String(), err
}

// GetTopicSlugByID returns the slug of a topic given its UUID string.
func (s *Store) GetTopicSlugByID(ctx context.Context, topicID string) (string, error) {
	tid, err := uuid.Parse(topicID)
	if err != nil {
		return "", err
	}
	var slug string
	err = s.db.QueryRow(ctx, `SELECT slug FROM topics WHERE id = $1`, tid).Scan(&slug)
	return slug, err
}

const bossXP, bossCoins = 200, 50

// SaveBossResult records a boss battle attempt, marks topic as defeated on pass, and awards XP/coins.
func (s *Store) SaveBossResult(ctx context.Context, playerID uuid.UUID, topicID string, score int, passed bool) error {
	tid, err := uuid.Parse(topicID)
	if err != nil {
		return err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO boss_battle_submissions (player_id, topic_id, score, passed)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (player_id, topic_id) DO UPDATE
		  SET score = GREATEST(boss_battle_submissions.score, EXCLUDED.score),
		      passed = boss_battle_submissions.passed OR EXCLUDED.passed,
		      completed_at = NOW()
	`, playerID, tid, score, passed)
	if err != nil {
		return err
	}

	if passed {
		_, err = tx.Exec(ctx, `
			INSERT INTO topic_progress (player_id, topic_id, boss_defeated)
			VALUES ($1, $2, TRUE)
			ON CONFLICT (player_id, topic_id) DO UPDATE SET boss_defeated = TRUE
		`, playerID, tid)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			UPDATE students SET total_xp = total_xp + $1, coins = coins + $2 WHERE id = $3
		`, bossXP, bossCoins, playerID)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// ── Teacher / Batch ───────────────────────────────────────────────────────────

// MigrateBatchTopicTracking adds topic scheduling columns to the batches table.
func (s *Store) MigrateBatchTopicTracking(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
		ALTER TABLE batches ADD COLUMN IF NOT EXISTS topic_start_date TIMESTAMPTZ;
		ALTER TABLE batches ADD COLUMN IF NOT EXISTS topic_end_date   TIMESTAMPTZ;
		ALTER TABLE batches ADD COLUMN IF NOT EXISTS paused           BOOLEAN NOT NULL DEFAULT FALSE;
		ALTER TABLE batches ADD COLUMN IF NOT EXISTS extended_days    INT     NOT NULL DEFAULT 0;
	`)
	if err != nil {
		return err
	}
	return s.MigrateBatchExtensions(ctx)
}

// MigrateBatchExtensions adds batch_code (join codes) and needs_password_change (teacher-created accounts).
func (s *Store) MigrateBatchExtensions(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
		ALTER TABLE students ADD COLUMN IF NOT EXISTS needs_password_change BOOLEAN NOT NULL DEFAULT FALSE;
		ALTER TABLE batches  ADD COLUMN IF NOT EXISTS batch_code TEXT;
		CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_batch_code ON batches(batch_code) WHERE batch_code IS NOT NULL;
		UPDATE batches SET batch_code = UPPER(SUBSTRING(MD5(id::TEXT), 1, 6)) WHERE batch_code IS NULL;
	`)
	if err != nil {
		return err
	}
	if err := s.MigratePYQ(ctx); err != nil {
		return err
	}
	return s.MigrateQuestionBank(ctx)
}

// MigratePYQ creates the pyq_sessions table for tracking PYQ attempt results.
func (s *Store) MigratePYQ(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS pyq_sessions (
			id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
			player_id   UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
			topic_slug  TEXT        NOT NULL,
			score       INT         NOT NULL DEFAULT 0,
			correct     INT         NOT NULL DEFAULT 0,
			total       INT         NOT NULL DEFAULT 0,
			played_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_pyq_sessions_player ON pyq_sessions(player_id);
	`)
	return err
}

// SavePYQSession records the result of a PYQ attempt.
func (s *Store) SavePYQSession(ctx context.Context, playerID uuid.UUID, topicSlug string, correct, total int) error {
	score := 0
	if total > 0 {
		score = correct * 100 / total
	}
	xp := correct * 15
	coins := correct * 5
	_, err := s.db.Exec(ctx, `
		WITH ins AS (
			INSERT INTO pyq_sessions (player_id, topic_slug, score, correct, total)
			VALUES ($1, $2, $3, $4, $5)
		)
		UPDATE students
		SET total_xp = total_xp + $6,
		    coins    = coins + $7
		WHERE id = $1
	`, playerID, topicSlug, score, correct, total, xp, coins)
	return err
}

// GetPYQBestScore returns the best score (0–100) the player has achieved for a topic slug.
func (s *Store) GetPYQBestScore(ctx context.Context, playerID uuid.UUID, topicSlug string) (int, error) {
	var best int
	err := s.db.QueryRow(ctx, `
		SELECT COALESCE(MAX(score), 0) FROM pyq_sessions
		WHERE player_id = $1 AND topic_slug = $2
	`, playerID, topicSlug).Scan(&best)
	return best, err
}

// MigrateTeacher creates batch, batch_students, and boss_battle_submissions tables.
func (s *Store) MigrateTeacher(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS batches (
		    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
		    name             TEXT        NOT NULL,
		    teacher_id       UUID        NOT NULL REFERENCES students(id),
		    current_topic_id UUID        REFERENCES topics(id),
		    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS batch_students (
		    batch_id   UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
		    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
		    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		    PRIMARY KEY (batch_id, student_id)
		);

		CREATE TABLE IF NOT EXISTS boss_battle_submissions (
		    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
		    player_id    UUID        NOT NULL REFERENCES students(id),
		    topic_id     UUID        NOT NULL REFERENCES topics(id),
		    score        INT         NOT NULL DEFAULT 0,
		    passed       BOOLEAN     NOT NULL DEFAULT FALSE,
		    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		    UNIQUE(player_id, topic_id)
		);
	`)
	return err
}

// ── Teacher queries ────────────────────────────────────────────────────────

type TeacherOverview struct {
	ActiveStudents  int     `json:"active_students"`
	AvgStreak       float64 `json:"avg_streak"`
	LessonsThisWeek int     `json:"lessons_this_week"`
	AtRiskCount     int     `json:"at_risk_count"`
}

// GetTeacherOverview returns KPIs for the teacher's own batches.
func (s *Store) GetTeacherOverview(ctx context.Context, teacherID uuid.UUID) (TeacherOverview, error) {
	var ov TeacherOverview

	// Active students = joined teacher's batches and logged in within 7 days
	_ = s.db.QueryRow(ctx, `
		SELECT
		    COUNT(DISTINCT bs.student_id)                    AS active_students,
		    COALESCE(AVG(st.current_streak), 0)              AS avg_streak,
		    (
		        SELECT COUNT(*) FROM lesson_completions lc
		        JOIN batch_students bss ON bss.student_id = lc.player_id
		        JOIN batches b ON b.id = bss.batch_id
		        WHERE b.teacher_id = $1
		          AND lc.completed_at >= NOW() - INTERVAL '7 days'
		    )                                                 AS lessons_this_week,
		    SUM(CASE WHEN st.last_active_at < NOW() - INTERVAL '3 days' THEN 1 ELSE 0 END) AS at_risk
		FROM batch_students bs
		JOIN batches b    ON b.id = bs.batch_id AND b.teacher_id = $1
		JOIN students st  ON st.id = bs.student_id
	`, teacherID).Scan(&ov.ActiveStudents, &ov.AvgStreak, &ov.LessonsThisWeek, &ov.AtRiskCount)

	return ov, nil
}

type StudentRow struct {
	ID            string  `json:"id"`
	FullName      string  `json:"full_name"`
	Email         string  `json:"email"`
	CurrentStreak int     `json:"current_streak"`
	TotalXP       int     `json:"total_xp"`
	LessonsWeek   int     `json:"lessons_this_week"`
	LastActive    *string `json:"last_active"`
}

func (s *Store) GetBatchStudents(ctx context.Context, teacherID uuid.UUID, batchID string) ([]StudentRow, error) {
	q := `
		SELECT st.id, st.full_name, st.email,
		       st.current_streak, st.total_xp,
		       COUNT(lc.id) FILTER (WHERE lc.completed_at >= NOW() - INTERVAL '7 days') AS lessons_week,
		       MAX(lc.completed_at)::TEXT AS last_active
		FROM students st
		JOIN batch_students bs ON bs.student_id = st.id
		JOIN batches b         ON b.id = bs.batch_id AND b.teacher_id = $1
		LEFT JOIN lesson_completions lc ON lc.player_id = st.id
	`
	args := []any{teacherID}
	if batchID != "" {
		q += ` WHERE bs.batch_id = $2`
		args = append(args, batchID)
	}
	q += ` GROUP BY st.id ORDER BY st.full_name`

	rows, err := s.db.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var students []StudentRow
	for rows.Next() {
		var r StudentRow
		if err := rows.Scan(&r.ID, &r.FullName, &r.Email, &r.CurrentStreak, &r.TotalXP, &r.LessonsWeek, &r.LastActive); err != nil {
			continue
		}
		students = append(students, r)
	}
	return students, nil
}

type WeakLesson struct {
	LessonTitle string  `json:"lesson_title"`
	TopicTitle  string  `json:"topic_title"`
	AvgScore    float64 `json:"avg_score"`
	Struggling  int     `json:"struggling_count"`
}

func (s *Store) GetWeakLessons(ctx context.Context, teacherID uuid.UUID) ([]WeakLesson, error) {
	rows, err := s.db.Query(ctx, `
		SELECT l.title, t.title, COALESCE(AVG(lc.score), 0) AS avg_score,
		       COUNT(lc.id) FILTER (WHERE lc.score < 60) AS struggling
		FROM lesson_completions lc
		JOIN lessons l ON l.id = lc.lesson_id
		JOIN topics  t ON t.id = l.topic_id
		JOIN batch_students bs ON bs.student_id = lc.player_id
		JOIN batches b ON b.id = bs.batch_id AND b.teacher_id = $1
		GROUP BY l.id, l.title, t.title
		HAVING AVG(lc.score) < 70
		ORDER BY avg_score ASC
		LIMIT 10
	`, teacherID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []WeakLesson
	for rows.Next() {
		var w WeakLesson
		if err := rows.Scan(&w.LessonTitle, &w.TopicTitle, &w.AvgScore, &w.Struggling); err != nil {
			continue
		}
		result = append(result, w)
	}
	return result, nil
}

type BatchRow struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	StudentCount   int     `json:"student_count"`
	CurrentTopicID string  `json:"current_topic_id"`
	Paused         bool    `json:"paused"`
	TopicStartDate *string `json:"topic_start_date"`
	TopicEndDate   *string `json:"topic_end_date"`
	ExtendedDays   int     `json:"extended_days"`
	BatchCode      string  `json:"batch_code"`
}

func (s *Store) GetTeacherBatches(ctx context.Context, teacherID uuid.UUID) ([]BatchRow, error) {
	rows, err := s.db.Query(ctx, `
		SELECT b.id, b.name,
		       COUNT(bs.student_id) AS student_count,
		       COALESCE(b.current_topic_id::TEXT, '') AS current_topic_id,
		       b.paused,
		       TO_CHAR(b.topic_start_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       TO_CHAR(b.topic_end_date   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       b.extended_days,
		       COALESCE(b.batch_code, '')
		FROM batches b
		LEFT JOIN batch_students bs ON bs.batch_id = b.id
		WHERE b.teacher_id = $1
		GROUP BY b.id
		ORDER BY b.created_at
	`, teacherID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var batches []BatchRow
	for rows.Next() {
		var br BatchRow
		if err := rows.Scan(&br.ID, &br.Name, &br.StudentCount, &br.CurrentTopicID,
			&br.Paused, &br.TopicStartDate, &br.TopicEndDate, &br.ExtendedDays, &br.BatchCode); err != nil {
			continue
		}
		batches = append(batches, br)
	}
	return batches, nil
}

type StudentDetail struct {
	ID            string  `json:"id"`
	FullName      string  `json:"full_name"`
	Email         string  `json:"email"`
	CurrentStreak int     `json:"current_streak"`
	TotalXP       int     `json:"total_xp"`
	Rating        int     `json:"rating"`
	LastActive    *string `json:"last_active"`
	LessonsTotal  int     `json:"lessons_total"`
	AccuracyPct   float64 `json:"accuracy_pct"`
	Topics        []struct {
		TopicTitle       string `json:"topic_title"`
		LessonsCompleted int    `json:"lessons_completed"`
		TotalLessons     int    `json:"total_lessons"`
		BossDefeated     bool   `json:"boss_defeated"`
	} `json:"topics"`
	RecentLessons []struct {
		LessonTitle string  `json:"lesson_title"`
		TopicTitle  string  `json:"topic_title"`
		Score       int     `json:"score"`
		CompletedAt string  `json:"completed_at"`
	} `json:"recent_lessons"`
}

func (s *Store) GetStudentDetail(ctx context.Context, studentID string) (*StudentDetail, error) {
	sid, err := uuid.Parse(studentID)
	if err != nil {
		return nil, err
	}

	var d StudentDetail
	var last *string
	err = s.db.QueryRow(ctx, `
		SELECT id::TEXT, full_name, email,
		       CASE WHEN DATE(last_active_at) >= CURRENT_DATE - 1 THEN COALESCE(current_streak,0) ELSE 0 END,
		       COALESCE(total_xp,0), COALESCE(rating,1200),
		       TO_CHAR(last_active_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       (SELECT COUNT(*) FROM lesson_completions WHERE player_id = $1),
		       COALESCE((SELECT AVG(score)::FLOAT / 10.0 * 100 FROM boss_battle_submissions WHERE player_id = $1 AND passed = TRUE), 0)
		FROM students WHERE id = $1
	`, sid).Scan(&d.ID, &d.FullName, &d.Email, &d.CurrentStreak, &d.TotalXP, &d.Rating, &last, &d.LessonsTotal, &d.AccuracyPct)
	if err != nil {
		return nil, err
	}
	d.LastActive = last

	topicRows, err := s.db.Query(ctx, `
		SELECT t.title,
		       LEAST(COALESCE(tp.lessons_completed,0), t.total_lessons),
		       t.total_lessons, COALESCE(tp.boss_defeated,FALSE)
		FROM topics t
		LEFT JOIN topic_progress tp ON tp.topic_id = t.id AND tp.player_id = $1
		ORDER BY t.position
	`, sid)
	if err != nil {
		return nil, err
	}
	defer topicRows.Close()
	for topicRows.Next() {
		var row struct {
			TopicTitle       string `json:"topic_title"`
			LessonsCompleted int    `json:"lessons_completed"`
			TotalLessons     int    `json:"total_lessons"`
			BossDefeated     bool   `json:"boss_defeated"`
		}
		if err := topicRows.Scan(&row.TopicTitle, &row.LessonsCompleted, &row.TotalLessons, &row.BossDefeated); err != nil {
			continue
		}
		d.Topics = append(d.Topics, row)
	}

	lessonRows, err := s.db.Query(ctx, `
		SELECT l.title, t.title, lc.score,
		       TO_CHAR(lc.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM lesson_completions lc
		JOIN lessons l ON l.id = lc.lesson_id
		JOIN topics  t ON t.id = l.topic_id
		WHERE lc.player_id = $1
		ORDER BY lc.completed_at DESC LIMIT 10
	`, sid)
	if err != nil {
		return nil, err
	}
	defer lessonRows.Close()
	for lessonRows.Next() {
		var row struct {
			LessonTitle string  `json:"lesson_title"`
			TopicTitle  string  `json:"topic_title"`
			Score       int     `json:"score"`
			CompletedAt string  `json:"completed_at"`
		}
		if err := lessonRows.Scan(&row.LessonTitle, &row.TopicTitle, &row.Score, &row.CompletedAt); err != nil {
			continue
		}
		d.RecentLessons = append(d.RecentLessons, row)
	}

	if d.Topics == nil {
		d.Topics = []struct {
			TopicTitle       string `json:"topic_title"`
			LessonsCompleted int    `json:"lessons_completed"`
			TotalLessons     int    `json:"total_lessons"`
			BossDefeated     bool   `json:"boss_defeated"`
		}{}
	}
	if d.RecentLessons == nil {
		d.RecentLessons = []struct {
			LessonTitle string  `json:"lesson_title"`
			TopicTitle  string  `json:"topic_title"`
			Score       int     `json:"score"`
			CompletedAt string  `json:"completed_at"`
		}{}
	}
	return &d, nil
}

type AddStudentResult struct {
	Created      bool   `json:"created"`
	TempPassword string `json:"temp_password,omitempty"`
}

// AddStudentToBatch adds an existing student to a batch by email.
// If the email has no account, it auto-creates one with a temp password.
func (s *Store) AddStudentToBatch(ctx context.Context, batchID, email string) (*AddStudentResult, error) {
	bid, err := uuid.Parse(batchID)
	if err != nil {
		return nil, err
	}

	// Check if student already exists
	var exists bool
	if err := s.db.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM students WHERE email=$1 AND role='student')", email,
	).Scan(&exists); err != nil {
		return nil, err
	}

	result := &AddStudentResult{}

	if !exists {
		// Auto-create account with temp password
		tempPass := "flasky@" + email[:3]
		hash, err := bcrypt.GenerateFromPassword([]byte(tempPass), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		namePart := email
		if at := len(email); at > 0 {
			for i, c := range email {
				if c == '@' {
					namePart = email[:i]
					break
				}
			}
		}
		_, err = s.db.Exec(ctx, `
			WITH inst AS (SELECT id FROM institutes WHERE slug = 'demo' LIMIT 1)
			INSERT INTO students (institute_id, email, password_hash, full_name, batch, role, needs_password_change)
			SELECT id, $1, $2, $3, '', 'student', TRUE FROM inst
			ON CONFLICT (email) DO NOTHING
		`, email, string(hash), namePart)
		if err != nil {
			return nil, err
		}
		result.Created = true
		result.TempPassword = tempPass
	}

	_, err = s.db.Exec(ctx, `
		INSERT INTO batch_students (batch_id, student_id)
		SELECT $1, id FROM students WHERE email = $2 AND role = 'student'
		ON CONFLICT DO NOTHING
	`, bid, email)
	return result, err
}

func (s *Store) CreateBatch(ctx context.Context, teacherID uuid.UUID, name string) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `
		INSERT INTO batches (name, teacher_id, batch_code)
		VALUES ($1, $2, UPPER(SUBSTRING(MD5(gen_random_uuid()::TEXT), 1, 6)))
		RETURNING id::TEXT
	`, name, teacherID).Scan(&id)
	return id, err
}

// JoinBatchByCode lets a student join a batch using the 6-char batch code.
func (s *Store) JoinBatchByCode(ctx context.Context, playerID uuid.UUID, code string) (string, error) {
	var batchID, batchName string
	err := s.db.QueryRow(ctx,
		"SELECT id::TEXT, name FROM batches WHERE UPPER(batch_code) = UPPER($1)", code,
	).Scan(&batchID, &batchName)
	if err != nil {
		return "", fmt.Errorf("invalid batch code")
	}

	bid, _ := uuid.Parse(batchID)
	_, err = s.db.Exec(ctx, `
		INSERT INTO batch_students (batch_id, student_id) VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, bid, playerID)
	return batchName, err
}

// ChangePassword updates the student's password hash and clears needs_password_change.
func (s *Store) ChangePassword(ctx context.Context, playerID uuid.UUID, newPassword string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx,
		"UPDATE students SET password_hash=$1, needs_password_change=FALSE WHERE id=$2",
		string(hash), playerID,
	)
	return err
}

func deltaWL(result string) (wins, losses int) {
	switch result {
	case "win":
		return 1, 0
	case "loss":
		return 0, 1
	default:
		return 0, 0
	}
}

// ── Batch curriculum management ───────────────────────────────────────────────

type TopicSequenceRow struct {
	ID         string `json:"id"`
	Slug       string `json:"slug"`
	Title      string `json:"title"`
	Icon       string `json:"icon"`
	Position   int    `json:"position"`
	Status     string `json:"status"` // "done" | "current" | "locked"
	DayCurrent int    `json:"day_current"`
	DayTotal   int    `json:"day_total"`
	Paused     bool   `json:"paused"`
}

// GetBatchCurriculum returns the ordered topic sequence with status for a batch.
func (s *Store) GetBatchCurriculum(ctx context.Context, batchID string) ([]TopicSequenceRow, error) {
	bid, err := uuid.Parse(batchID)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.Query(ctx, `
		WITH bi AS (
			SELECT current_topic_id, paused, topic_start_date, topic_end_date, extended_days
			FROM batches WHERE id = $1
		),
		cp AS (
			SELECT COALESCE(t.position, 0) AS pos
			FROM bi LEFT JOIN topics t ON t.id = bi.current_topic_id
		)
		SELECT
			t.id::TEXT, t.slug, t.title, t.icon, t.position,
			CASE
				WHEN bi.current_topic_id IS NULL THEN 'locked'
				WHEN t.id = bi.current_topic_id THEN 'current'
				WHEN t.position < cp.pos THEN 'done'
				ELSE 'locked'
			END AS status,
			CASE WHEN t.id = bi.current_topic_id AND bi.topic_start_date IS NOT NULL THEN
				GREATEST(1, EXTRACT(EPOCH FROM (NOW() - bi.topic_start_date))/86400 + 1)::INT
			ELSE 0 END AS day_current,
			CASE WHEN t.id = bi.current_topic_id THEN
				COALESCE(
					GREATEST(1, EXTRACT(EPOCH FROM (bi.topic_end_date - COALESCE(bi.topic_start_date, NOW())))/86400)::INT,
					8
				)
			ELSE 0 END AS day_total,
			COALESCE(bi.paused, FALSE) AS paused
		FROM topics t, bi, cp
		ORDER BY t.position
	`, bid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []TopicSequenceRow
	for rows.Next() {
		var r TopicSequenceRow
		if err := rows.Scan(&r.ID, &r.Slug, &r.Title, &r.Icon, &r.Position,
			&r.Status, &r.DayCurrent, &r.DayTotal, &r.Paused); err != nil {
			continue
		}
		result = append(result, r)
	}
	if result == nil {
		result = []TopicSequenceRow{}
	}
	return result, nil
}

// AdvanceBatchTopic moves the batch's current topic to the next one in sequence.
func (s *Store) AdvanceBatchTopic(ctx context.Context, teacherID uuid.UUID, batchID string) error {
	bid, err := uuid.Parse(batchID)
	if err != nil {
		return err
	}
	var currentTopicID *string
	err = s.db.QueryRow(ctx, `
		SELECT current_topic_id::TEXT FROM batches WHERE id = $1 AND teacher_id = $2
	`, bid, teacherID).Scan(&currentTopicID)
	if err != nil {
		return err
	}
	currentPos := 0
	if currentTopicID != nil && *currentTopicID != "" {
		_ = s.db.QueryRow(ctx, `SELECT position FROM topics WHERE id = $1::UUID`, *currentTopicID).Scan(&currentPos)
	}
	var nextID string
	if err := s.db.QueryRow(ctx, `
		SELECT id::TEXT FROM topics WHERE position > $1 ORDER BY position LIMIT 1
	`, currentPos).Scan(&nextID); err != nil {
		return fmt.Errorf("already at last topic")
	}
	_, err = s.db.Exec(ctx, `
		UPDATE batches SET
			current_topic_id = $1::UUID,
			topic_start_date = NOW(),
			topic_end_date   = NOW() + INTERVAL '8 days',
			extended_days    = 0,
			paused           = FALSE
		WHERE id = $2 AND teacher_id = $3
	`, nextID, bid, teacherID)
	return err
}

// PauseBatchTopic toggles the paused flag on a batch.
func (s *Store) PauseBatchTopic(ctx context.Context, teacherID uuid.UUID, batchID string) error {
	bid, err := uuid.Parse(batchID)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx, `
		UPDATE batches SET paused = NOT paused WHERE id = $1 AND teacher_id = $2
	`, bid, teacherID)
	return err
}

// ExtendBatchTopic adds 2 days to the current topic's schedule.
func (s *Store) ExtendBatchTopic(ctx context.Context, teacherID uuid.UUID, batchID string) error {
	bid, err := uuid.Parse(batchID)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx, `
		UPDATE batches SET
			extended_days  = extended_days + 2,
			topic_end_date = COALESCE(topic_end_date, NOW()) + INTERVAL '2 days'
		WHERE id = $1 AND teacher_id = $2
	`, bid, teacherID)
	return err
}

// ── Question Bank ─────────────────────────────────────────────────────────────

// MigrateQuestionBank creates the central questions table, daily_challenge_log,
// adds concept_text to lessons, and seeds all hardcoded questions from the
// predictor and pyq packages into the DB (idempotent via external_id).
func (s *Store) MigrateQuestionBank(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
		-- Central question bank
		CREATE TABLE IF NOT EXISTS questions (
		    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
		    external_id    TEXT        UNIQUE,          -- stable key for idempotent seeding
		    type           TEXT        NOT NULL,        -- 'mcq' | 'balancing' | 'element_id'
		    topic_id       UUID        REFERENCES topics(id),
		    lesson_id      UUID        REFERENCES lessons(id),
		    prompt         TEXT        NOT NULL,
		    options        JSONB,                       -- MCQ: ["A","B","C","D"]
		    correct_index  INT,                         -- MCQ correct option
		    correct_answer JSONB,                       -- balancing: coefficient array
		    explanation    TEXT,
		    concept        TEXT,                        -- chip label e.g. "Neutralisation"
		    difficulty     TEXT        NOT NULL DEFAULT 'medium',
		    game_modes     TEXT[]      NOT NULL DEFAULT '{}',
		    is_pyq         BOOLEAN     NOT NULL DEFAULT FALSE,
		    pyq_exam       TEXT,
		    pyq_year       INT,
		    status         TEXT        NOT NULL DEFAULT 'draft',
		    created_by     UUID        REFERENCES students(id),
		    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_questions_topic    ON questions(topic_id);
		CREATE INDEX IF NOT EXISTS idx_questions_lesson   ON questions(lesson_id);
		CREATE INDEX IF NOT EXISTS idx_questions_status   ON questions(status);
		CREATE INDEX IF NOT EXISTS idx_questions_modes    ON questions USING GIN(game_modes);

		-- Track which questions were used in daily challenge (prevents repeats for 30 days)
		CREATE TABLE IF NOT EXISTS daily_challenge_log (
		    question_id UUID NOT NULL REFERENCES questions(id),
		    used_on     DATE NOT NULL,
		    PRIMARY KEY (question_id, used_on)
		);

		-- Concept text & publish status on lessons
		ALTER TABLE lessons ADD COLUMN IF NOT EXISTS concept_text TEXT;
		ALTER TABLE lessons ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
	`)
	if err != nil {
		return fmt.Errorf("MigrateQuestionBank schema: %w", err)
	}

	// Seed hardcoded MCQ predictor questions as approved, tagged for all game modes
	type seedQ struct {
		extID       string
		topicSlug   string
		prompt      string
		concept     string
		options     []string
		correctIdx  int
		explanation string
		gameModes   []string
		isPYQ       bool
		pyqExam     string
		pyqYear     int
	}

	predictorSeeds := []seedQ{
		// Physical Chemistry
		{extID: "rp_h2_cl2", topicSlug: "physical-chemistry", prompt: "H₂ + Cl₂ →", concept: "Combination", options: []string{"HCl", "H₂Cl", "HCl₂", "H₂Cl₂"}, correctIdx: 0, explanation: "H₂ and Cl₂ combine to form HCl (hydrogen chloride).", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_na_h2o", topicSlug: "physical-chemistry", prompt: "2Na + 2H₂O →", concept: "Metal + water", options: []string{"Na₂O + H₂", "2NaOH + H₂", "Na₂O₂ + H₂", "NaH + H₂O"}, correctIdx: 1, explanation: "Sodium reacts vigorously with water to give NaOH and H₂ gas.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_ca_o2", topicSlug: "physical-chemistry", prompt: "2Ca + O₂ →", concept: "Oxidation", options: []string{"Ca₂O", "CaO₂", "2CaO", "Ca₂O₂"}, correctIdx: 2, explanation: "Calcium burns in oxygen to form calcium oxide (CaO).", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_hcl_naoh", topicSlug: "physical-chemistry", prompt: "HCl + NaOH →", concept: "Neutralisation", options: []string{"NaCl + H₂O", "Na + HClO", "NaH + ClOH", "NaOCl + H₂"}, correctIdx: 0, explanation: "Acid-base neutralisation produces a salt (NaCl) and water.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_mg_o2", topicSlug: "physical-chemistry", prompt: "2Mg + O₂ →", concept: "Combustion", options: []string{"MgO₂", "Mg₂O", "2MgO", "Mg₂O₂"}, correctIdx: 2, explanation: "Magnesium burns in oxygen to produce magnesium oxide.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_h2so4_naoh", topicSlug: "physical-chemistry", prompt: "H₂SO₄ + 2NaOH →", concept: "Acid-base", options: []string{"Na₂SO₄ + H₂O", "Na₂SO₄ + 2H₂O", "NaSO₄ + H₂O", "Na₂SO₃ + 2H₂O"}, correctIdx: 1, explanation: "Sulfuric acid reacts with 2 moles of NaOH to give Na₂SO₄ and 2H₂O.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_zn_hcl", topicSlug: "physical-chemistry", prompt: "Zn + 2HCl →", concept: "Displacement", options: []string{"ZnCl + H₂", "ZnCl₂ + H₂", "ZnH₂ + Cl₂", "ZnCl₂ + H₂O"}, correctIdx: 1, explanation: "Zinc displaces hydrogen from HCl, forming zinc chloride and H₂ gas.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_fe_s", topicSlug: "physical-chemistry", prompt: "Fe + S → (heat)", concept: "Combination", options: []string{"FeSO₄", "FeS", "Fe₂S", "FeS₂"}, correctIdx: 1, explanation: "Iron and sulfur combine on heating to form iron(II) sulfide (FeS).", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		// Organic Chemistry
		{extID: "rp_ch4_cl2", topicSlug: "organic-chemistry", prompt: "CH₄ + Cl₂ → (UV light)", concept: "Free radical", options: []string{"CHCl₃", "CH₃Cl + HCl", "CCl₄", "CH₂Cl₂ + H₂"}, correctIdx: 1, explanation: "Free radical halogenation gives CH₃Cl (chloromethane) and HCl as the major first step.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_ethene_h2", topicSlug: "organic-chemistry", prompt: "CH₂=CH₂ + H₂ → (Ni)", concept: "Hydrogenation", options: []string{"CH₃CHO", "CH₃CH₃", "CH₂CH₂H₂", "C₂H₄"}, correctIdx: 1, explanation: "Catalytic hydrogenation of ethene (Ni catalyst) gives ethane.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_ethanol_ox", topicSlug: "organic-chemistry", prompt: "C₂H₅OH + [O] →", concept: "Oxidation", options: []string{"CH₃COOH", "C₂H₄", "CH₃CHO", "C₂H₆"}, correctIdx: 2, explanation: "Mild oxidation of ethanol gives acetaldehyde (CH₃CHO); further oxidation gives acetic acid.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_ester", topicSlug: "organic-chemistry", prompt: "CH₃COOH + C₂H₅OH → (H⁺)", concept: "Esterification", options: []string{"CH₃COOC₂H₅ + H₂O", "CH₃COC₂H₅ + H₂", "CH₃OHC₂H₅ + CO₂", "C₂H₅COOCH₃ + H₂O"}, correctIdx: 0, explanation: "Fischer esterification produces ethyl acetate and water.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_propene_hbr", topicSlug: "organic-chemistry", prompt: "CH₃CH=CH₂ + HBr →", concept: "Addition", options: []string{"CH₃CH₂CH₂Br", "CH₃CHBrCH₃", "CH₂BrCH=CH₂", "CH₃CH₂CHBr₂"}, correctIdx: 1, explanation: "Markovnikov addition: Br attaches to the more substituted carbon (C2), giving 2-bromopropane.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_benzene_no2", topicSlug: "organic-chemistry", prompt: "C₆H₆ + HNO₃ → (H₂SO₄)", concept: "Nitration", options: []string{"C₆H₅NO₂ + H₂O", "C₆H₅OH + NO₂", "C₆H₆NO₃ + H", "C₆H₄NO₂ + H₂"}, correctIdx: 0, explanation: "Electrophilic aromatic nitration gives nitrobenzene and water.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_c2h4_combustion", topicSlug: "organic-chemistry", prompt: "C₂H₄ + 3O₂ →", concept: "Combustion", options: []string{"2CO + 2H₂O", "2CO₂ + 2H₂O", "CO₂ + H₂O", "2CO₂ + 4H₂O"}, correctIdx: 1, explanation: "Complete combustion of ethene: C₂H₄ + 3O₂ → 2CO₂ + 2H₂O.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_saponification", topicSlug: "organic-chemistry", prompt: "Fat + NaOH → (saponification)", concept: "Saponification", options: []string{"Soap + Glycerol", "Fatty acid + Na", "Ester + Water", "Soap + CO₂"}, correctIdx: 0, explanation: "Saponification of fats with NaOH gives soap (sodium salt of fatty acid) + glycerol.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		// Inorganic Chemistry
		{extID: "rp_fe_cuso4", topicSlug: "inorganic-chemistry", prompt: "Fe + CuSO₄ →", concept: "Displacement", options: []string{"FeSO₄ + Cu", "Fe₂SO₄ + Cu₂", "Fe(SO₄)₂ + Cu", "FeO + CuS"}, correctIdx: 0, explanation: "Iron displaces copper from CuSO₄ (Fe is more reactive than Cu).", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_cl2_naoh", topicSlug: "inorganic-chemistry", prompt: "Cl₂ + 2NaOH →", concept: "Disproportionation", options: []string{"NaCl + NaClO + H₂O", "2NaCl + H₂O₂", "NaClO₂ + H₂", "Na₂ClO + H₂O"}, correctIdx: 0, explanation: "Cl₂ disproportionates in NaOH: one Cl is reduced (NaCl) and one is oxidised (NaClO).", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_cu_hno3", topicSlug: "inorganic-chemistry", prompt: "Cu + 4HNO₃ (conc) →", concept: "Oxidation", options: []string{"Cu(NO₃)₂ + 2NO₂ + 2H₂O", "CuNO₃ + NO₂ + H₂O", "Cu(NO₃)₂ + NO + H₂O", "CuO + N₂ + H₂O"}, correctIdx: 0, explanation: "Concentrated HNO₃ oxidises Cu, releasing NO₂ brown fumes.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_al_naoh", topicSlug: "inorganic-chemistry", prompt: "2Al + 2NaOH + 2H₂O →", concept: "Amphoteric", options: []string{"Al₂O₃ + NaH + H₂", "2NaAlO₂ + 3H₂", "Al(OH)₃ + NaH", "Al₂(OH)₃ + H₂"}, correctIdx: 1, explanation: "Al is amphoteric; it dissolves in NaOH to give sodium aluminate and H₂.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_kclo3", topicSlug: "inorganic-chemistry", prompt: "2KClO₃ → (MnO₂, heat)", concept: "Decomposition", options: []string{"2KCl + 3O₂", "K₂O + Cl₂ + 3O", "KClO + O₂", "KCl + ClO₂ + O"}, correctIdx: 0, explanation: "MnO₂ catalyses the decomposition of potassium chlorate to KCl and O₂.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_n2_h2", topicSlug: "inorganic-chemistry", prompt: "N₂ + 3H₂ → (Haber)", concept: "Synthesis", options: []string{"N₂H₃", "2NH₃", "NH₄", "2NH₂"}, correctIdx: 1, explanation: "Haber process: N₂ + 3H₂ ⇌ 2NH₃ at high temp/pressure with Fe catalyst.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_so2_o2", topicSlug: "inorganic-chemistry", prompt: "2SO₂ + O₂ → (V₂O₅)", concept: "Contact process", options: []string{"SO₃", "2SO₃", "S₂O₅", "2SO₂O"}, correctIdx: 1, explanation: "Contact process for H₂SO₄ manufacture: 2SO₂ + O₂ → 2SO₃ over V₂O₅ catalyst.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_pb_cell", topicSlug: "inorganic-chemistry", prompt: "Pb + PbO₂ + 2H₂SO₄ → (lead cell)", concept: "Electrochemistry", options: []string{"2PbSO₄ + 2H₂O", "PbSO₃ + H₂O + O₂", "2Pb + H₂SO₃", "Pb₂O₃ + H₂"}, correctIdx: 0, explanation: "Lead-acid battery discharge: both electrodes form PbSO₄.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_caco3", topicSlug: "inorganic-chemistry", prompt: "CaCO₃ → (heat)", concept: "Decomposition", options: []string{"CaO + CO₂", "Ca + CO₃", "Ca(OH)₂ + CO", "CaCO + O₂"}, correctIdx: 0, explanation: "Thermal decomposition of limestone gives quicklime (CaO) and CO₂.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "rp_fe2o3_co", topicSlug: "inorganic-chemistry", prompt: "Fe₂O₃ + 3CO → (blast furnace)", concept: "Reduction", options: []string{"2Fe + 3CO₂", "FeO + CO₂", "Fe + 3CO₂", "2Fe₃O₄ + CO₂"}, correctIdx: 0, explanation: "Iron ore is reduced by CO in a blast furnace to give iron and CO₂.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		// PYQ — Physical Chemistry
		{extID: "pyq_pc_001", topicSlug: "physical-chemistry", prompt: "Which of the following has the highest molar entropy at 25°C?", concept: "Thermodynamics", options: []string{"H₂O(l)", "H₂O(g)", "H₂O(s)", "All equal"}, correctIdx: 1, explanation: "Gases have the highest entropy among the three states of matter.", gameModes: []string{"daily", "boss", "lesson"}, isPYQ: true, pyqExam: "JEE Main", pyqYear: 2023},
		{extID: "pyq_pc_002", topicSlug: "physical-chemistry", prompt: "For N₂ + 3H₂ ⇌ 2NH₃, if Kp = 1.5×10⁻⁵ at 25°C, what is Kc?", concept: "Equilibrium", options: []string{"0.037", "6.08×10⁻⁴", "1.5×10⁻⁵", "3.7"}, correctIdx: 0, explanation: "Kp = Kc(RT)^Δn; Δn=−2; Kc ≈ 0.037.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Main", pyqYear: 2022},
		{extID: "pyq_pc_003", topicSlug: "physical-chemistry", prompt: "The de Broglie wavelength of a particle moving with velocity v is λ. When v is doubled, λ becomes:", concept: "Atomic structure", options: []string{"λ/2", "2λ", "λ/4", "4λ"}, correctIdx: 0, explanation: "λ = h/mv; doubling v halves λ.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Advanced", pyqYear: 2021},
		{extID: "pyq_pc_004", topicSlug: "physical-chemistry", prompt: "Which quantum number determines the shape of an orbital?", concept: "Atomic structure", options: []string{"Principal (n)", "Azimuthal (l)", "Magnetic (m)", "Spin (s)"}, correctIdx: 1, explanation: "The azimuthal quantum number l defines the shape: l=0(s), l=1(p), l=2(d).", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "NEET", pyqYear: 2023},
		{extID: "pyq_pc_005", topicSlug: "physical-chemistry", prompt: "Work done in isothermal reversible expansion of ideal gas from V₁ to V₂:", concept: "Thermodynamics", options: []string{"nRT ln(V₁/V₂)", "nRT ln(V₂/V₁)", "nR(T₂−T₁)", "Zero"}, correctIdx: 1, explanation: "W = nRT ln(V₂/V₁) for isothermal reversible expansion.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Main", pyqYear: 2021},
		{extID: "pyq_pc_006", topicSlug: "physical-chemistry", prompt: "First-order reaction, t½ = 10 min. Fraction remaining after 40 min?", concept: "Chemical kinetics", options: []string{"1/2", "1/4", "1/8", "1/16"}, correctIdx: 3, explanation: "40 min = 4 half-lives; (1/2)⁴ = 1/16.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Advanced", pyqYear: 2022},
		{extID: "pyq_pc_007", topicSlug: "physical-chemistry", prompt: "Which solution has the highest boiling point?", concept: "Colligative properties", options: []string{"1M NaCl", "1M glucose", "1M CaCl₂", "1M AlCl₃"}, correctIdx: 3, explanation: "AlCl₃ → 4 ions (i=4), highest van't Hoff factor → highest BP elevation.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "NEET", pyqYear: 2022},
		{extID: "pyq_pc_008", topicSlug: "physical-chemistry", prompt: "Which has the most positive standard electrode potential?", concept: "Electrochemistry", options: []string{"Zn²⁺/Zn (−0.76V)", "Cu²⁺/Cu (+0.34V)", "Fe²⁺/Fe (−0.44V)", "Ag⁺/Ag (+0.80V)"}, correctIdx: 3, explanation: "Ag⁺/Ag has E° = +0.80 V, the highest.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Main", pyqYear: 2020},
		{extID: "pyq_pc_009", topicSlug: "physical-chemistry", prompt: "Volume of 1 mole of ideal gas at STP (0°C, 1 atm) is approximately:", concept: "States of matter", options: []string{"22.4 L", "22.7 L", "24.0 L", "11.2 L"}, correctIdx: 0, explanation: "Molar volume at STP = 22.4 L/mol.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Advanced", pyqYear: 2020},
		{extID: "pyq_pc_010", topicSlug: "physical-chemistry", prompt: "According to Hess's law, ΔH for a reaction is:", concept: "Thermodynamics", options: []string{"Path-dependent", "Path-independent", "Always negative", "Always zero"}, correctIdx: 1, explanation: "Enthalpy is a state function; Hess's law states it is path-independent.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "NEET", pyqYear: 2021},
		// PYQ — Organic Chemistry
		{extID: "pyq_oc_001", topicSlug: "organic-chemistry", prompt: "Which reagent distinguishes aldehydes from ketones?", concept: "Carbonyl compounds", options: []string{"Fehling's solution", "NaOH", "HCl", "H₂SO₄"}, correctIdx: 0, explanation: "Fehling's gives brick-red precipitate with aldehydes; not ketones.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Main", pyqYear: 2023},
		{extID: "pyq_oc_002", topicSlug: "organic-chemistry", prompt: "IUPAC name of CH₃–CH(OH)–CH₂–CH₃:", concept: "Nomenclature", options: []string{"1-Butanol", "2-Butanol", "3-Butanol", "Sec-butanol"}, correctIdx: 1, explanation: "–OH on C2 of 4-carbon chain → butan-2-ol.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Advanced", pyqYear: 2022},
		{extID: "pyq_oc_003", topicSlug: "organic-chemistry", prompt: "Which is an electrophilic substitution reaction?", concept: "Reaction mechanisms", options: []string{"Halogenation of alkane", "Nitration of benzene", "Hydration of alkene", "Saponification"}, correctIdx: 1, explanation: "Nitration of benzene is the classic EAS (electrophilic aromatic substitution).", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "NEET", pyqYear: 2023},
		{extID: "pyq_oc_004", topicSlug: "organic-chemistry", prompt: "Major product of HBr + propene (Markovnikov):", concept: "Addition reactions", options: []string{"1-Bromopropane", "2-Bromopropane", "1,2-Dibromopropane", "Propan-1-ol"}, correctIdx: 1, explanation: "H adds to C1, Br to C2 → 2-bromopropane.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Main", pyqYear: 2022},
		{extID: "pyq_oc_005", topicSlug: "organic-chemistry", prompt: "Which shows optical isomerism?", concept: "Stereochemistry", options: []string{"CH₂Cl₂", "CHCl₃", "CH₃CHClCH₃", "CH₃CH(OH)COOH"}, correctIdx: 3, explanation: "Lactic acid has a chiral centre with 4 different groups.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Advanced", pyqYear: 2021},
		{extID: "pyq_oc_006", topicSlug: "organic-chemistry", prompt: "Nylon-6,6 is formed from:", concept: "Polymers", options: []string{"Hexamethylenediamine + adipic acid", "Caprolactam", "Ethylene glycol + terephthalic acid", "Styrene + butadiene"}, correctIdx: 0, explanation: "Nylon-6,6 is a condensation polymer of hexamethylenediamine (6C) and adipic acid (6C).", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "NEET", pyqYear: 2022},
		{extID: "pyq_oc_007", topicSlug: "organic-chemistry", prompt: "Functional group in carboxylic acids:", concept: "Functional groups", options: []string{"–CHO", "–COOH", "–OH", "–COO–"}, correctIdx: 1, explanation: "Carboxylic acids contain –COOH (carboxyl group).", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Main", pyqYear: 2021},
		{extID: "pyq_oc_008", topicSlug: "organic-chemistry", prompt: "Which is NOT a reducing sugar?", concept: "Carbohydrates", options: []string{"Glucose", "Fructose", "Sucrose", "Maltose"}, correctIdx: 2, explanation: "Sucrose has no free anomeric –OH; it is non-reducing.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Advanced", pyqYear: 2020},
		{extID: "pyq_oc_009", topicSlug: "organic-chemistry", prompt: "Alcohol + carboxylic acid (H₂SO₄) gives:", concept: "Esterification", options: []string{"Ether", "Ester", "Aldehyde", "Ketone"}, correctIdx: 1, explanation: "Fischer esterification: R-COOH + R'-OH → R-COO-R' + H₂O.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "NEET", pyqYear: 2021},
		{extID: "pyq_oc_010", topicSlug: "organic-chemistry", prompt: "Baeyer's reagent (cold dilute KMnO₄) tests for:", concept: "Unsaturation", options: []string{"Aromatic compounds", "Unsaturation (C=C or C≡C)", "Aldehydes", "Carboxylic acids"}, correctIdx: 1, explanation: "Cold dilute KMnO₄ decolourises in presence of C=C or C≡C bonds.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Main", pyqYear: 2020},
		// PYQ — Inorganic Chemistry
		{extID: "pyq_ic_001", topicSlug: "inorganic-chemistry", prompt: "Electronic configuration of Fe²⁺:", concept: "d-block elements", options: []string{"[Ar]3d⁶4s²", "[Ar]3d⁶", "[Ar]3d⁴4s²", "[Ar]3d⁵4s¹"}, correctIdx: 1, explanation: "Fe is [Ar]3d⁶4s²; Fe²⁺ loses 4s electrons → [Ar]3d⁶.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Main", pyqYear: 2023},
		{extID: "pyq_ic_002", topicSlug: "inorganic-chemistry", prompt: "Which oxide of nitrogen is used as anaesthetic?", concept: "p-block elements", options: []string{"NO", "N₂O", "NO₂", "N₂O₅"}, correctIdx: 1, explanation: "N₂O (nitrous oxide) = 'laughing gas', used as anaesthetic.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Advanced", pyqYear: 2022},
		{extID: "pyq_ic_003", topicSlug: "inorganic-chemistry", prompt: "Most electronegative element:", concept: "Periodic table", options: []string{"Oxygen", "Nitrogen", "Chlorine", "Fluorine"}, correctIdx: 3, explanation: "Fluorine has the highest electronegativity (3.98 Pauling scale).", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "NEET", pyqYear: 2023},
		{extID: "pyq_ic_004", topicSlug: "inorganic-chemistry", prompt: "Highest lattice energy among:", concept: "Chemical bonding", options: []string{"NaF", "NaCl", "KCl", "KBr"}, correctIdx: 0, explanation: "NaF: smallest ions → highest charge density → highest lattice energy.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Main", pyqYear: 2022},
		{extID: "pyq_ic_005", topicSlug: "inorganic-chemistry", prompt: "Which has sp³d² hybridisation?", concept: "Chemical bonding", options: []string{"SF₄", "SF₆", "PCl₅", "BrF₃"}, correctIdx: 1, explanation: "SF₆ has 6 bond pairs; S is sp³d² → octahedral.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Advanced", pyqYear: 2021},
		{extID: "pyq_ic_006", topicSlug: "inorganic-chemistry", prompt: "Oxidation state of Cr in K₂Cr₂O₇:", concept: "d-block elements", options: []string{"+3", "+4", "+6", "+7"}, correctIdx: 2, explanation: "2(+1) + 2x + 7(−2) = 0 → x = +6.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "NEET", pyqYear: 2022},
		{extID: "pyq_ic_007", topicSlug: "inorganic-chemistry", prompt: "Which is a chelating ligand?", concept: "Coordination compounds", options: []string{"NH₃", "Cl⁻", "EDTA", "H₂O"}, correctIdx: 2, explanation: "EDTA is hexadentate — forms 6 bonds with a metal ion.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Main", pyqYear: 2021},
		{extID: "pyq_ic_008", topicSlug: "inorganic-chemistry", prompt: "Which is diamagnetic?", concept: "Chemical bonding", options: []string{"O₂", "NO", "N₂", "NO₂"}, correctIdx: 2, explanation: "N₂ has all electrons paired in MOs → diamagnetic.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Advanced", pyqYear: 2020},
		{extID: "pyq_ic_009", topicSlug: "inorganic-chemistry", prompt: "Process for aluminium extraction from bauxite:", concept: "Metallurgy", options: []string{"Smelting", "Hall-Héroult process", "Bessemer process", "Thermite process"}, correctIdx: 1, explanation: "Electrolysis of molten Al₂O₃ in the Hall-Héroult process.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "NEET", pyqYear: 2021},
		{extID: "pyq_ic_010", topicSlug: "inorganic-chemistry", prompt: "Which periodic table group contains only non-metals?", concept: "Periodic table", options: []string{"Group 1", "Group 14", "Group 17", "Group 2"}, correctIdx: 2, explanation: "Group 17 (halogens: F, Cl, Br, I) are all non-metals.", gameModes: []string{"daily", "boss"}, isPYQ: true, pyqExam: "JEE Main", pyqYear: 2020},
	}

	for _, q := range predictorSeeds {
		// Look up topic_id by slug
		var topicID *uuid.UUID
		var tid uuid.UUID
		err := s.db.QueryRow(ctx, `SELECT id FROM topics WHERE slug = $1`, q.topicSlug).Scan(&tid)
		if err == nil {
			topicID = &tid
		}

		optJSON := fmt.Sprintf(`[%s]`, joinQuoted(q.options))

		_, err = s.db.Exec(ctx, `
			INSERT INTO questions
			  (external_id, type, topic_id, prompt, options, correct_index, explanation,
			   concept, difficulty, game_modes, is_pyq, pyq_exam, pyq_year, status)
			VALUES ($1,'mcq',$2,$3,$4::jsonb,$5,$6,$7,'medium',$8,$9,$10,$11,'approved')
			ON CONFLICT (external_id) DO NOTHING
		`, q.extID, topicID, q.prompt, optJSON, q.correctIdx, q.explanation,
			q.concept, q.gameModes, q.isPYQ, nilStr(q.pyqExam), nilInt(q.pyqYear),
		)
		if err != nil {
			return fmt.Errorf("seed question %s: %w", q.extID, err)
		}
	}

	// ── Seed element_id questions (periodic table) ────────────────────────────
	elementSeeds := []seedQ{
		{extID: "el_001", topicSlug: "inorganic-chemistry", prompt: "Which element has the symbol 'Na'?", concept: "Periodic table", options: []string{"Nitrogen", "Sodium", "Neon", "Nickel"}, correctIdx: 1, explanation: "Na comes from 'Natrium', the Latin name for Sodium.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "el_002", topicSlug: "inorganic-chemistry", prompt: "What is the atomic number of Carbon?", concept: "Periodic table", options: []string{"4", "6", "8", "12"}, correctIdx: 1, explanation: "Carbon (C) has atomic number 6 — 6 protons in its nucleus.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "el_003", topicSlug: "inorganic-chemistry", prompt: "Which element has the symbol 'Fe'?", concept: "Periodic table", options: []string{"Fluorine", "Fermium", "Iron", "Francium"}, correctIdx: 2, explanation: "Fe comes from 'Ferrum', the Latin name for Iron.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "el_004", topicSlug: "inorganic-chemistry", prompt: "The most abundant gas in Earth's atmosphere is:", concept: "Periodic table", options: []string{"Oxygen", "Argon", "Carbon dioxide", "Nitrogen"}, correctIdx: 3, explanation: "Nitrogen (N₂) makes up about 78% of Earth's atmosphere.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "el_005", topicSlug: "inorganic-chemistry", prompt: "Which element is a liquid at room temperature?", concept: "States of matter", options: []string{"Mercury", "Lead", "Tin", "Bismuth"}, correctIdx: 0, explanation: "Mercury (Hg) is the only metal that is liquid at standard room temperature (25°C).", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "el_006", topicSlug: "inorganic-chemistry", prompt: "Atomic number of Chlorine is:", concept: "Periodic table", options: []string{"15", "17", "19", "35"}, correctIdx: 1, explanation: "Chlorine (Cl) has atomic number 17.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "el_007", topicSlug: "inorganic-chemistry", prompt: "Which noble gas is used in advertising signs?", concept: "p-block elements", options: []string{"Helium", "Argon", "Neon", "Krypton"}, correctIdx: 2, explanation: "Neon gas glows bright red-orange when electricity passes through it — hence 'neon signs'.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "el_008", topicSlug: "inorganic-chemistry", prompt: "The element with the highest electronegativity is:", concept: "Periodic table", options: []string{"Oxygen", "Chlorine", "Fluorine", "Nitrogen"}, correctIdx: 2, explanation: "Fluorine (F) has the highest electronegativity of all elements (3.98 Pauling).", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "el_009", topicSlug: "physical-chemistry", prompt: "Which element is represented by the symbol 'K'?", concept: "Periodic table", options: []string{"Krypton", "Potassium", "Kinetic", "Calcium"}, correctIdx: 1, explanation: "K comes from 'Kalium', the Latin name for Potassium.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "el_010", topicSlug: "physical-chemistry", prompt: "Hydrogen has how many electrons in its outermost shell?", concept: "Atomic structure", options: []string{"0", "1", "2", "3"}, correctIdx: 1, explanation: "Hydrogen has only 1 electron, which is in its first (and only) shell.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "el_011", topicSlug: "inorganic-chemistry", prompt: "Which element has the symbol 'Au'?", concept: "Periodic table", options: []string{"Aluminium", "Astatine", "Gold", "Silver"}, correctIdx: 2, explanation: "Au comes from 'Aurum', the Latin word for Gold.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
		{extID: "el_012", topicSlug: "inorganic-chemistry", prompt: "Atomic number of Oxygen is:", concept: "Periodic table", options: []string{"6", "7", "8", "9"}, correctIdx: 2, explanation: "Oxygen (O) has atomic number 8.", gameModes: []string{"duel", "daily", "boss", "lesson"}},
	}

	for _, q := range elementSeeds {
		var topicID *uuid.UUID
		var tid uuid.UUID
		if err := s.db.QueryRow(ctx, `SELECT id FROM topics WHERE slug = $1`, q.topicSlug).Scan(&tid); err == nil {
			topicID = &tid
		}
		optJSON := fmt.Sprintf(`[%s]`, joinQuoted(q.options))
		_, err = s.db.Exec(ctx, `
			INSERT INTO questions
			  (external_id, type, topic_id, prompt, options, correct_index, explanation,
			   concept, difficulty, game_modes, is_pyq, pyq_exam, pyq_year, status)
			VALUES ($1,'element_id',$2,$3,$4::jsonb,$5,$6,$7,'easy',$8,false,null,null,'approved')
			ON CONFLICT (external_id) DO NOTHING
		`, q.extID, topicID, q.prompt, optJSON, q.correctIdx, q.explanation, q.concept, q.gameModes)
		if err != nil {
			return fmt.Errorf("seed element %s: %w", q.extID, err)
		}
	}

	// ── Seed true_false questions ─────────────────────────────────────────────
	tfSeeds := []seedQ{
		{extID: "tf_001", topicSlug: "physical-chemistry", prompt: "Exothermic reactions release heat to the surroundings.", concept: "Thermodynamics", options: []string{"True", "False"}, correctIdx: 0, explanation: "Exothermic reactions release energy (ΔH < 0), raising the temperature of the surroundings.", gameModes: []string{"daily", "boss", "lesson"}},
		{extID: "tf_002", topicSlug: "physical-chemistry", prompt: "All acids have a pH greater than 7.", concept: "Acid-base", options: []string{"True", "False"}, correctIdx: 1, explanation: "Acids have pH less than 7; pH 7 is neutral; bases are above 7.", gameModes: []string{"daily", "boss", "lesson"}},
		{extID: "tf_003", topicSlug: "organic-chemistry", prompt: "Alkanes are saturated hydrocarbons.", concept: "Hydrocarbons", options: []string{"True", "False"}, correctIdx: 0, explanation: "Alkanes contain only C–C single bonds — they are fully saturated.", gameModes: []string{"daily", "boss", "lesson"}},
		{extID: "tf_004", topicSlug: "inorganic-chemistry", prompt: "Noble gases readily form chemical compounds.", concept: "Periodic table", options: []string{"True", "False"}, correctIdx: 1, explanation: "Noble gases have full valence shells and are largely unreactive under normal conditions.", gameModes: []string{"daily", "boss", "lesson"}},
		{extID: "tf_005", topicSlug: "physical-chemistry", prompt: "In an ionic bond, electrons are shared between atoms.", concept: "Chemical bonding", options: []string{"True", "False"}, correctIdx: 1, explanation: "Ionic bonds involve transfer of electrons; sharing occurs in covalent bonds.", gameModes: []string{"daily", "boss", "lesson"}},
		{extID: "tf_006", topicSlug: "physical-chemistry", prompt: "Catalyst is consumed in the reaction it catalyses.", concept: "Chemical kinetics", options: []string{"True", "False"}, correctIdx: 1, explanation: "A catalyst speeds up a reaction but is regenerated — it is not consumed.", gameModes: []string{"daily", "boss", "lesson"}},
		{extID: "tf_007", topicSlug: "organic-chemistry", prompt: "Benzene undergoes electrophilic substitution rather than addition.", concept: "Reaction mechanisms", options: []string{"True", "False"}, correctIdx: 0, explanation: "Benzene's aromatic ring is preserved via substitution, not addition.", gameModes: []string{"daily", "boss", "lesson"}},
		{extID: "tf_008", topicSlug: "physical-chemistry", prompt: "Increasing pressure on a gas at constant temperature decreases its volume.", concept: "States of matter", options: []string{"True", "False"}, correctIdx: 0, explanation: "Boyle's Law: P and V are inversely proportional at constant T.", gameModes: []string{"daily", "boss", "lesson"}},
		{extID: "tf_009", topicSlug: "inorganic-chemistry", prompt: "Electroplating uses electrolysis.", concept: "Electrochemistry", options: []string{"True", "False"}, correctIdx: 0, explanation: "Electroplating deposits a metal layer on a surface using electrolysis (DC current).", gameModes: []string{"daily", "boss", "lesson"}},
		{extID: "tf_010", topicSlug: "organic-chemistry", prompt: "Diamond and graphite are allotropes of Carbon.", concept: "Carbon compounds", options: []string{"True", "False"}, correctIdx: 0, explanation: "Both are pure carbon but with different structures — diamond (tetrahedral) and graphite (layered).", gameModes: []string{"daily", "boss", "lesson"}},
	}

	for _, q := range tfSeeds {
		var topicID *uuid.UUID
		var tid uuid.UUID
		if err := s.db.QueryRow(ctx, `SELECT id FROM topics WHERE slug = $1`, q.topicSlug).Scan(&tid); err == nil {
			topicID = &tid
		}
		optJSON := fmt.Sprintf(`[%s]`, joinQuoted(q.options))
		_, err = s.db.Exec(ctx, `
			INSERT INTO questions
			  (external_id, type, topic_id, prompt, options, correct_index, explanation,
			   concept, difficulty, game_modes, is_pyq, pyq_exam, pyq_year, status)
			VALUES ($1,'true_false',$2,$3,$4::jsonb,$5,$6,$7,'easy',$8,false,null,null,'approved')
			ON CONFLICT (external_id) DO NOTHING
		`, q.extID, topicID, q.prompt, optJSON, q.correctIdx, q.explanation, q.concept, q.gameModes)
		if err != nil {
			return fmt.Errorf("seed tf %s: %w", q.extID, err)
		}
	}

	return nil
}

func joinQuoted(ss []string) string {
	out := make([]byte, 0, 128)
	for i, s := range ss {
		if i > 0 {
			out = append(out, ',')
		}
		out = append(out, '"')
		for _, c := range s {
			if c == '"' {
				out = append(out, '\\')
			}
			out = append(out, string(c)...)
		}
		out = append(out, '"')
	}
	return string(out)
}

func nilStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func nilInt(n int) interface{} {
	if n == 0 {
		return nil
	}
	return n
}

// ── Question bank CRUD ────────────────────────────────────────────────────────

type QuestionRow struct {
	ID           string   `json:"id"`
	ExternalID   string   `json:"external_id,omitempty"`
	Type         string   `json:"type"`
	TopicID      string   `json:"topic_id,omitempty"`
	LessonID     string   `json:"lesson_id,omitempty"`
	Prompt       string   `json:"prompt"`
	Options      []string `json:"options,omitempty"`
	CorrectIndex *int     `json:"correct_index,omitempty"`
	Explanation  string   `json:"explanation"`
	Concept      string   `json:"concept"`
	Difficulty   string   `json:"difficulty"`
	GameModes    []string `json:"game_modes"`
	IsPYQ        bool     `json:"is_pyq"`
	PyqExam      string   `json:"pyq_exam,omitempty"`
	PyqYear      int      `json:"pyq_year,omitempty"`
	Status       string   `json:"status"`
}

type CreateQuestionInput struct {
	Type         string   `json:"type"`
	TopicID      string   `json:"topic_id"`
	LessonID     string   `json:"lesson_id"`
	Prompt       string   `json:"prompt"`
	Options      []string `json:"options"`
	CorrectIndex int      `json:"correct_index"`
	Explanation  string   `json:"explanation"`
	Concept      string   `json:"concept"`
	Difficulty   string   `json:"difficulty"`
	GameModes    []string `json:"game_modes"`
	IsPYQ        bool     `json:"is_pyq"`
	PyqExam      string   `json:"pyq_exam"`
	PyqYear      int      `json:"pyq_year"`
}

func (s *Store) CreateQuestion(ctx context.Context, teacherID uuid.UUID, in CreateQuestionInput) (string, error) {
	optJSON := fmt.Sprintf(`[%s]`, joinQuoted(in.Options))
	var topicID, lessonID interface{}
	if in.TopicID != "" {
		if tid, err := uuid.Parse(in.TopicID); err == nil {
			topicID = tid
		}
	}
	if in.LessonID != "" {
		if lid, err := uuid.Parse(in.LessonID); err == nil {
			lessonID = lid
		}
	}
	var id uuid.UUID
	err := s.db.QueryRow(ctx, `
		INSERT INTO questions
		  (type, topic_id, lesson_id, prompt, options, correct_index, explanation,
		   concept, difficulty, game_modes, is_pyq, pyq_exam, pyq_year, status, created_by)
		VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,'draft',$14)
		RETURNING id
	`, in.Type, topicID, lessonID, in.Prompt, optJSON, in.CorrectIndex, in.Explanation,
		in.Concept, in.Difficulty, in.GameModes, in.IsPYQ, nilStr(in.PyqExam), nilInt(in.PyqYear), teacherID,
	).Scan(&id)
	return id.String(), err
}

func (s *Store) ApproveQuestion(ctx context.Context, questionID string) error {
	qid, err := uuid.Parse(questionID)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx, `UPDATE questions SET status='approved' WHERE id=$1`, qid)
	return err
}

func (s *Store) ListQuestions(ctx context.Context, topicID string, status string, limit int) ([]QuestionRow, error) {
	query := `
		SELECT id, COALESCE(external_id,''), type,
		       COALESCE(topic_id::TEXT,''), COALESCE(lesson_id::TEXT,''),
		       prompt,
		       COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text(options) v), '{}'),
		       correct_index,
		       COALESCE(explanation,''), COALESCE(concept,''),
		       difficulty, game_modes, is_pyq,
		       COALESCE(pyq_exam,''), COALESCE(pyq_year,0), status
		FROM questions
		WHERE ($1 = '' OR topic_id::TEXT = $1)
		  AND ($2 = '' OR status = $2)
		ORDER BY created_at DESC
		LIMIT $3
	`
	rows, err := s.db.Query(ctx, query, topicID, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []QuestionRow
	for rows.Next() {
		var q QuestionRow
		var cidx *int
		if err := rows.Scan(
			&q.ID, &q.ExternalID, &q.Type, &q.TopicID, &q.LessonID,
			&q.Prompt, &q.Options, &cidx,
			&q.Explanation, &q.Concept, &q.Difficulty, &q.GameModes,
			&q.IsPYQ, &q.PyqExam, &q.PyqYear, &q.Status,
		); err != nil {
			return nil, err
		}
		q.CorrectIndex = cidx
		out = append(out, q)
	}
	return out, rows.Err()
}

// GetApprovedQuestionsForMode returns questions approved for a given game mode,
// optionally filtered by topic slug.
func (s *Store) GetApprovedQuestionsForMode(ctx context.Context, gameMode string, topicSlug string, limit int) ([]QuestionRow, error) {
	var rows interface{ Next() bool; Scan(...interface{}) error; Close(); Err() error }
	var err error
	if topicSlug != "" {
		rows, err = s.db.Query(ctx, `
			SELECT q.id, COALESCE(q.external_id,''), q.type,
			       COALESCE(q.topic_id::TEXT,''), COALESCE(q.lesson_id::TEXT,''),
			       q.prompt,
			       COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text(q.options) v), '{}'),
			       q.correct_index,
			       COALESCE(q.explanation,''), COALESCE(q.concept,''),
			       q.difficulty, q.game_modes, q.is_pyq,
			       COALESCE(q.pyq_exam,''), COALESCE(q.pyq_year,0), q.status
			FROM questions q
			JOIN topics t ON t.id = q.topic_id
			WHERE q.status = 'approved'
			  AND $1 = ANY(q.game_modes)
			  AND t.slug = $2
			ORDER BY RANDOM()
			LIMIT $3
		`, gameMode, topicSlug, limit)
	} else {
		rows, err = s.db.Query(ctx, `
			SELECT id, COALESCE(external_id,''), type,
			       COALESCE(topic_id::TEXT,''), COALESCE(lesson_id::TEXT,''),
			       prompt,
			       COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text(options) v), '{}'),
			       correct_index,
			       COALESCE(explanation,''), COALESCE(concept,''),
			       difficulty, game_modes, is_pyq,
			       COALESCE(pyq_exam,''), COALESCE(pyq_year,0), status
			FROM questions
			WHERE status = 'approved' AND $1 = ANY(game_modes)
			ORDER BY RANDOM()
			LIMIT $2
		`, gameMode, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []QuestionRow
	for rows.Next() {
		var q QuestionRow
		var cidx *int
		if err := rows.Scan(
			&q.ID, &q.ExternalID, &q.Type, &q.TopicID, &q.LessonID,
			&q.Prompt, &q.Options, &cidx,
			&q.Explanation, &q.Concept, &q.Difficulty, &q.GameModes,
			&q.IsPYQ, &q.PyqExam, &q.PyqYear, &q.Status,
		); err != nil {
			return nil, err
		}
		q.CorrectIndex = cidx
		out = append(out, q)
	}
	return out, rows.Err()
}

// GetDailyQuestions returns today's 5-question set from the question bank.
// Idempotent: if a set was already selected for targetDate it returns the same set.
// Tries to pick a balanced mix across types; falls back to whatever is available.
func (s *Store) GetDailyQuestions(ctx context.Context, targetDate string) ([]QuestionRow, error) {
	// 1. Return already-selected set if it exists for this date
	existingRows, err := s.db.Query(ctx, `
		SELECT q.id, COALESCE(q.external_id,''), q.type,
		       COALESCE(q.topic_id::TEXT,''), COALESCE(q.lesson_id::TEXT,''),
		       q.prompt,
		       COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text(q.options) v), '{}'),
		       q.correct_index,
		       COALESCE(q.explanation,''), COALESCE(q.concept,''),
		       q.difficulty, q.game_modes, q.is_pyq,
		       COALESCE(q.pyq_exam,''), COALESCE(q.pyq_year,0), q.status
		FROM daily_challenge_log l
		JOIN questions q ON q.id = l.question_id
		WHERE l.used_on = $1::date
		ORDER BY l.question_id   -- stable order
	`, targetDate)
	if err != nil {
		return nil, err
	}
	existing := scanQuestionRows(existingRows)
	existingRows.Close()
	if len(existing) >= 5 {
		return existing, nil
	}

	// 2. Fresh selection — balanced across types, avoid last-30-days questions
	// Desired: 2 mcq, 1 element_id, 1 true_false, 1 any (fill from largest pool)
	typeLimits := []struct {
		qtype string
		limit int
	}{
		{"mcq", 2},
		{"element_id", 1},
		{"true_false", 1},
		{"mcq", 2}, // extra mcq to fill if others missing — handled by UNION dedup
	}

	alreadyLoggedIDs := make([]uuid.UUID, 0)
	for _, q := range existing {
		if u, err := uuid.Parse(q.ID); err == nil {
			alreadyLoggedIDs = append(alreadyLoggedIDs, u)
		}
	}

	seen := make(map[string]bool)
	var out []QuestionRow

	for _, tl := range typeLimits {
		if len(out) >= 5 {
			break
		}
		need := tl.limit
		rows, err := s.db.Query(ctx, `
			SELECT q.id, COALESCE(q.external_id,''), q.type,
			       COALESCE(q.topic_id::TEXT,''), COALESCE(q.lesson_id::TEXT,''),
			       q.prompt,
			       COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text(q.options) v), '{}'),
			       q.correct_index,
			       COALESCE(q.explanation,''), COALESCE(q.concept,''),
			       q.difficulty, q.game_modes, q.is_pyq,
			       COALESCE(q.pyq_exam,''), COALESCE(q.pyq_year,0), q.status
			FROM questions q
			WHERE q.status = 'approved'
			  AND 'daily' = ANY(q.game_modes)
			  AND q.type = $1
			  AND q.id NOT IN (
			      SELECT question_id FROM daily_challenge_log
			      WHERE used_on >= CURRENT_DATE - 30
			  )
			ORDER BY RANDOM()
			LIMIT $2
		`, tl.qtype, need)
		if err != nil {
			continue
		}
		qs := scanQuestionRows(rows)
		rows.Close()
		for _, q := range qs {
			if !seen[q.ID] && len(out) < 5 {
				seen[q.ID] = true
				out = append(out, q)
			}
		}
	}

	// 3. If still < 5 (pool depleted), fill with any approved daily question
	if len(out) < 5 {
		excludeIDs := make([]uuid.UUID, 0, len(out))
		for _, q := range out {
			if u, err := uuid.Parse(q.ID); err == nil {
				excludeIDs = append(excludeIDs, u)
			}
		}
		rows, err := s.db.Query(ctx, `
			SELECT q.id, COALESCE(q.external_id,''), q.type,
			       COALESCE(q.topic_id::TEXT,''), COALESCE(q.lesson_id::TEXT,''),
			       q.prompt,
			       COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text(q.options) v), '{}'),
			       q.correct_index,
			       COALESCE(q.explanation,''), COALESCE(q.concept,''),
			       q.difficulty, q.game_modes, q.is_pyq,
			       COALESCE(q.pyq_exam,''), COALESCE(q.pyq_year,0), q.status
			FROM questions q
			WHERE q.status = 'approved'
			  AND 'daily' = ANY(q.game_modes)
			  AND q.id != ALL($1)
			ORDER BY RANDOM()
			LIMIT $2
		`, excludeIDs, 5-len(out))
		if err == nil {
			qs := scanQuestionRows(rows)
			rows.Close()
			for _, q := range qs {
				if !seen[q.ID] {
					seen[q.ID] = true
					out = append(out, q)
				}
			}
		}
	}

	// 4. Log selected questions for this date (idempotent)
	for _, q := range out {
		qid, _ := uuid.Parse(q.ID)
		s.db.Exec(ctx, `
			INSERT INTO daily_challenge_log (question_id, used_on)
			VALUES ($1, $2::date)
			ON CONFLICT DO NOTHING
		`, qid, targetDate)
	}

	return out, nil
}

// scanQuestionRows is a helper that drains a pgx Rows into []QuestionRow.
func scanQuestionRows(rows interface {
	Next() bool
	Scan(...any) error
	Err() error
}) []QuestionRow {
	var out []QuestionRow
	for rows.Next() {
		var q QuestionRow
		var cidx *int
		if err := rows.Scan(
			&q.ID, &q.ExternalID, &q.Type, &q.TopicID, &q.LessonID,
			&q.Prompt, &q.Options, &cidx,
			&q.Explanation, &q.Concept, &q.Difficulty, &q.GameModes,
			&q.IsPYQ, &q.PyqExam, &q.PyqYear, &q.Status,
		); err == nil {
			q.CorrectIndex = cidx
			out = append(out, q)
		}
	}
	return out
}

// GetQuestionsByIDs fetches full question rows (including correct_index) for answer validation.
func (s *Store) GetQuestionsByIDs(ctx context.Context, ids []string) ([]QuestionRow, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	uids := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if u, err := uuid.Parse(id); err == nil {
			uids = append(uids, u)
		}
	}
	if len(uids) == 0 {
		return nil, nil
	}
	rows, err := s.db.Query(ctx, `
		SELECT id, COALESCE(external_id,''), type,
		       COALESCE(topic_id::TEXT,''), COALESCE(lesson_id::TEXT,''),
		       prompt,
		       COALESCE((SELECT array_agg(v) FROM jsonb_array_elements_text(options) v), '{}'),
		       correct_index,
		       COALESCE(explanation,''), COALESCE(concept,''),
		       difficulty, game_modes, is_pyq,
		       COALESCE(pyq_exam,''), COALESCE(pyq_year,0), status
		FROM questions
		WHERE id = ANY($1)
	`, uids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []QuestionRow
	for rows.Next() {
		var q QuestionRow
		var cidx *int
		if err := rows.Scan(
			&q.ID, &q.ExternalID, &q.Type, &q.TopicID, &q.LessonID,
			&q.Prompt, &q.Options, &cidx,
			&q.Explanation, &q.Concept, &q.Difficulty, &q.GameModes,
			&q.IsPYQ, &q.PyqExam, &q.PyqYear, &q.Status,
		); err != nil {
			return nil, err
		}
		q.CorrectIndex = cidx
		out = append(out, q)
	}
	return out, rows.Err()
}

// SeedDemoUsers inserts teacher@flasky.com and newstudent@flasky.com if they don't exist.
func (s *Store) SeedDemoUsers(ctx context.Context) error {
	const hash = "$2a$10$o3y5LIZrjS1mNNN2bnPuH.9xBCdE9uNUS82GW6QdT.9qtHFoosHgu" // password123
	if _, err := s.db.Exec(ctx, `
		INSERT INTO students (institute_id, email, password_hash, full_name, role)
		SELECT id, 'teacher@flasky.com', $1, 'Flasky Teacher', 'teacher'
		FROM institutes WHERE slug = 'demo'
		ON CONFLICT (email) DO NOTHING
	`, hash); err != nil {
		return err
	}
	_, err := s.db.Exec(ctx, `
		INSERT INTO students (institute_id, email, password_hash, full_name, role)
		SELECT id, 'newstudent@flasky.com', $1, 'Test Student', 'student'
		FROM institutes WHERE slug = 'demo'
		ON CONFLICT (email) DO NOTHING
	`, hash)
	return err
}
