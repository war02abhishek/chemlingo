package main

import (
	"context"
	"fmt"
	"log"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	db, err := pgxpool.New(context.Background(), "postgres://chemlingo:chemlingo_secret@localhost:5432/chemlingo")
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer db.Close()

	schema := `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS institutes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    batch VARCHAR(50),
    current_streak INT DEFAULT 0,
    max_streak INT DEFAULT 0,
    catalysts INT DEFAULT 0,
    total_xp INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO institutes (name, slug) VALUES ('Demo Institute', 'demo') ON CONFLICT (slug) DO NOTHING;
`

	_, err = db.Exec(context.Background(), schema)
	if err != nil {
		log.Fatalf("exec: %v", err)
	}
	fmt.Println("Schema applied")
}
