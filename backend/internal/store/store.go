package store

import (
	"context"
	"encoding/json"
	"fmt"

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

// SetStudentContext enables Row-Level Security
func (s *Store) SetStudentContext(ctx context.Context, studentID uuid.UUID) error {
	_, err := s.db.Exec(ctx, "SET LOCAL app.current_student_id = $1", studentID)
	return err
}

func (s *Store) GetStudentByEmail(ctx context.Context, email string) (*model.Student, error) {
	var st model.Student
	err := s.db.QueryRow(ctx, `
		SELECT id, institute_id, email, full_name, batch, current_streak, max_streak, catalysts, total_xp, last_active_at
		FROM students WHERE email = $1
	`, email).Scan(&st.ID, &st.InstituteID, &st.Email, &st.FullName, &st.Batch, &st.CurrentStreak, &st.MaxStreak, &st.Catalysts, &st.TotalXP, &st.LastActiveAt)
	if err != nil {
		return nil, err
	}
	return &st, nil
}

func (s *Store) GetDrillsDueForReview(ctx context.Context, studentID uuid.UUID, limit int) ([]model.Drill, error) {
	rows, err := s.db.Query(ctx, `
		SELECT d.id, d.topic_id, d.type, d.difficulty, d.question_data, d.tags
		FROM drills d
		JOIN srs_schedule srs ON srs.drill_id = d.id
		WHERE srs.student_id = $1 AND srs.next_review_at <= NOW()
		ORDER BY srs.next_review_at
		LIMIT $2
	`, studentID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var drills []model.Drill
	for rows.Next() {
		var d model.Drill
		var qData []byte
		err := rows.Scan(&d.ID, &d.TopicID, &d.Type, &d.Difficulty, &qData, &d.Tags)
		if err != nil {
			return nil, err
		}
		json.Unmarshal(qData, &d.QuestionData)
		drills = append(drills, d)
	}
	return drills, nil
}

func (s *Store) RecordAttempt(ctx context.Context, attempt *model.DrillAttempt) error {
	answerJSON, _ := json.Marshal(attempt.SubmittedAnswer)
	_, err := s.db.Exec(ctx, `
		INSERT INTO drill_attempts (student_id, drill_id, is_correct, time_taken_ms, submitted_answer, xp_earned)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, attempt.StudentID, attempt.DrillID, attempt.IsCorrect, attempt.TimeTakenMs, answerJSON, attempt.XPEarned)
	return err
}

func (s *Store) UpdateSRS(ctx context.Context, card *model.SRSCard) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO srs_schedule (student_id, drill_id, ease_factor, interval_days, repetitions, next_review_at, last_reviewed_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
		ON CONFLICT (student_id, drill_id) 
		DO UPDATE SET ease_factor = $3, interval_days = $4, repetitions = $5, next_review_at = $6, last_reviewed_at = NOW()
	`, card.StudentID, card.DrillID, card.EaseFactor, card.IntervalDays, card.Repetitions, card.NextReviewAt)
	return err
}

func (s *Store) UpdateStudentXP(ctx context.Context, studentID uuid.UUID, xpDelta int) error {
	_, err := s.db.Exec(ctx, `
		UPDATE students SET total_xp = total_xp + $1, last_active_at = NOW() WHERE id = $2
	`, xpDelta, studentID)
	return err
}

func (s *Store) GetSRSCard(ctx context.Context, studentID, drillID uuid.UUID) (*model.SRSCard, error) {
	var card model.SRSCard
	err := s.db.QueryRow(ctx, `
		SELECT student_id, drill_id, ease_factor, interval_days, repetitions, next_review_at, last_reviewed_at
		FROM srs_schedule WHERE student_id = $1 AND drill_id = $2
	`, studentID, drillID).Scan(
		&card.StudentID, &card.DrillID, &card.EaseFactor, &card.IntervalDays,
		&card.Repetitions, &card.NextReviewAt, &card.LastReviewedAt,
	)
	if err != nil {
		return nil, err
	}
	return &card, nil
}

func (s *Store) GetPasswordHash(ctx context.Context, email string) (string, uuid.UUID, error) {
	var hash string
	var id uuid.UUID
	err := s.db.QueryRow(ctx, "SELECT id, password_hash FROM students WHERE email = $1", email).Scan(&id, &hash)
	return hash, id, err
}

func (s *Store) BeginTx(ctx context.Context) (context.Context, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	return context.WithValue(ctx, "tx", tx), nil
}

func (s *Store) CommitTx(ctx context.Context) error {
	tx, ok := ctx.Value("tx").(interface{ Commit(context.Context) error })
	if !ok {
		return fmt.Errorf("no transaction in context")
	}
	return tx.Commit(ctx)
}
