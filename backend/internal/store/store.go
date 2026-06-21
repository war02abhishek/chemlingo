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
	return s.MigrateCompound(ctx)
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
		       rating, wins, losses
		FROM students WHERE email = $1
	`, email).Scan(
		&st.ID, &st.InstituteID, &st.Email, &st.FullName, &st.Batch,
		&st.CurrentStreak, &st.MaxStreak, &st.Catalysts, &st.TotalXP, &st.LastActiveAt,
		&st.Rating, &st.Wins, &st.Losses,
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

// GetProfile returns a player's public profile.
func (s *Store) GetProfile(ctx context.Context, playerID uuid.UUID) (*model.Profile, error) {
	var p model.Profile
	var id uuid.UUID
	err := s.db.QueryRow(ctx,
		"SELECT id, full_name, email, rating, wins, losses FROM students WHERE id = $1",
		playerID,
	).Scan(&id, &p.Name, &p.Email, &p.Rating, &p.Wins, &p.Losses)
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
