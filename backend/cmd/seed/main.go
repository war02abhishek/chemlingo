package main

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	db, err := pgxpool.New(context.Background(), "postgres://chemlingo:chemlingo_secret@localhost:5432/chemlingo")
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer db.Close()

	hash, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("bcrypt: %v", err)
	}

	var instituteID string
	err = db.QueryRow(context.Background(), `SELECT id FROM institutes WHERE slug = 'demo'`).Scan(&instituteID)
	if err != nil {
		log.Fatalf("get institute: %v", err)
	}

	var studentID string
	err = db.QueryRow(context.Background(), `
		INSERT INTO students (institute_id, email, password_hash, full_name, batch)
		VALUES ($1, 'test@chemlingo.com', $2, 'Test User', 'JEE2026')
		ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
		RETURNING id
	`, instituteID, string(hash)).Scan(&studentID)
	if err != nil {
		log.Fatalf("insert student: %v", err)
	}

	fmt.Printf("Created student: id=%s email=test@chemlingo.com password=password123\n", studentID)
}
