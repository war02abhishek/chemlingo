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

	// Seed student
	var studentID string
	err = db.QueryRow(context.Background(), `
		INSERT INTO students (institute_id, email, password_hash, full_name, batch, role)
		VALUES ($1, 'test@chemlingo.com', $2, 'Test User', 'JEE2026', 'student')
		ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
		RETURNING id
	`, instituteID, string(hash)).Scan(&studentID)
	if err != nil {
		log.Fatalf("insert student: %v", err)
	}
	fmt.Printf("Student: id=%s email=test@chemlingo.com password=password123\n", studentID)

	// Seed teacher
	var teacherID string
	err = db.QueryRow(context.Background(), `
		INSERT INTO students (institute_id, email, password_hash, full_name, batch, role)
		VALUES ($1, 'teacher@flasky.com', $2, 'Ms. Sharma', 'FACULTY', 'teacher')
		ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'teacher'
		RETURNING id
	`, instituteID, string(hash)).Scan(&teacherID)
	if err != nil {
		log.Fatalf("insert teacher: %v", err)
	}
	fmt.Printf("Teacher: id=%s email=teacher@flasky.com password=password123\n", teacherID)
}
