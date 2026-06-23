package store

import (
	"context"

	"github.com/chemlingo/backend/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
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
	return s.MigrateTeacher(ctx)
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
		SELECT id, institute_id, email, full_name, batch,
		       current_streak, max_streak, catalysts, total_xp, last_active_at,
		       rating, wins, losses,
		       COALESCE(role, 'student'), COALESCE(coins, 0), COALESCE(hearts, 3)
		FROM students WHERE email = $1
	`, email).Scan(
		&st.ID, &st.InstituteID, &st.Email, &st.FullName, &st.Batch,
		&st.CurrentStreak, &st.MaxStreak, &st.Catalysts, &st.TotalXP, &st.LastActiveAt,
		&st.Rating, &st.Wins, &st.Losses,
		&st.Role, &st.Coins, &st.Hearts,
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

// GetProfile returns a player's full profile.
func (s *Store) GetProfile(ctx context.Context, playerID uuid.UUID) (*model.Profile, error) {
	var p model.Profile
	var id uuid.UUID
	err := s.db.QueryRow(ctx, `
		SELECT id, full_name, email, rating, wins, losses,
		       COALESCE(total_xp, 0), COALESCE(current_streak, 0),
		       COALESCE(coins, 0), COALESCE(hearts, 3)
		FROM students WHERE id = $1
	`, playerID).Scan(
		&id, &p.Name, &p.Email, &p.Rating, &p.Wins, &p.Losses,
		&p.TotalXP, &p.CurrentStreak, &p.Coins, &p.Hearts,
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

// GetTopicsWithProgress returns all topics with per-student progress data.
func (s *Store) GetTopicsWithProgress(ctx context.Context, playerID uuid.UUID) ([]model.TopicWithProgress, error) {
	rows, err := s.db.Query(ctx, `
		SELECT t.id, t.slug, t.title, t.icon, t.position, t.total_lessons,
		       COALESCE(tp.lessons_completed, 0),
		       COALESCE(tp.boss_defeated, FALSE)
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
		var id uuid.UUID
		if err := rows.Scan(&id, &tw.Slug, &tw.Title, &tw.Icon, &tw.Position, &tw.TotalLessons,
			&tw.LessonsCompleted, &tw.BossDefeated); err != nil {
			return nil, err
		}
		tw.ID = id.String()
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

// SaveLessonCompletion records a lesson completion, awards XP + coins, and updates topic_progress.
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

	_, err = tx.Exec(ctx, `
		INSERT INTO lesson_completions (player_id, lesson_id, score)
		VALUES ($1, $2, $3)
		ON CONFLICT (player_id, lesson_id) DO NOTHING
	`, playerID, lid, score)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		UPDATE students SET total_xp = total_xp + $1, coins = coins + $2 WHERE id = $3
	`, xpReward, coinReward, playerID)
	if err != nil {
		return err
	}

	// Upsert topic_progress (increment lessons_completed if this is a new completion)
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

// ── Teacher / Batch ───────────────────────────────────────────────────────────

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
	ID             string `json:"id"`
	Name           string `json:"name"`
	StudentCount   int    `json:"student_count"`
	CurrentTopicID string `json:"current_topic_id"`
}

func (s *Store) GetTeacherBatches(ctx context.Context, teacherID uuid.UUID) ([]BatchRow, error) {
	rows, err := s.db.Query(ctx, `
		SELECT b.id, b.name,
		       COUNT(bs.student_id) AS student_count,
		       COALESCE(b.current_topic_id::TEXT, '') AS current_topic_id
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
		if err := rows.Scan(&br.ID, &br.Name, &br.StudentCount, &br.CurrentTopicID); err != nil {
			continue
		}
		batches = append(batches, br)
	}
	return batches, nil
}

func (s *Store) CreateBatch(ctx context.Context, teacherID uuid.UUID, name string) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `
		INSERT INTO batches (name, teacher_id) VALUES ($1, $2) RETURNING id::TEXT
	`, name, teacherID).Scan(&id)
	return id, err
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
