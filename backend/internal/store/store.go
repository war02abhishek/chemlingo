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
		SELECT id, institute_id, email, full_name, batch, current_streak, max_streak, catalysts, total_xp, last_active_at
		FROM students WHERE email = $1
	`, email).Scan(
		&st.ID, &st.InstituteID, &st.Email, &st.FullName, &st.Batch,
		&st.CurrentStreak, &st.MaxStreak, &st.Catalysts, &st.TotalXP, &st.LastActiveAt,
	)
	if err != nil {
		return nil, err
	}
	return &st, nil
}
