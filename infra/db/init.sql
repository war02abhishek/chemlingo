-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- ============================================
-- CORE ENTITIES (Multi-tenant B2B)
-- ============================================

CREATE TABLE institutes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    theme_color VARCHAR(7) DEFAULT '#6366F1',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    batch VARCHAR(50),
    current_streak INT DEFAULT 0,
    max_streak INT DEFAULT 0,
    catalysts INT DEFAULT 0, -- streak freezes
    total_xp INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_students_institute ON students(institute_id);
CREATE INDEX idx_students_email ON students(email);

-- ============================================
-- CONTENT STRUCTURE (Extensible)
-- ============================================

CREATE TYPE drill_type AS ENUM (
    'reaction_matcher',
    'trend_slider',
    'color_precipitate_id',
    'exception_boss_fight',
    'mcq', -- for future
    'fill_blank' -- for future
);

CREATE TYPE difficulty_level AS ENUM ('easy', 'medium', 'hard', 'boss');

CREATE TABLE topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    parent_id UUID REFERENCES topics(id), -- for subtopics
    order_index INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Semantic search ready with pgvector
CREATE TABLE drills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    type drill_type NOT NULL,
    difficulty difficulty_level NOT NULL,
    question_data JSONB NOT NULL, -- flexible schema per drill type
    correct_answer JSONB NOT NULL,
    explanation TEXT,
    tags TEXT[], -- e.g., ['inert_pair_effect', 'p_block']
    embedding vector(1536), -- for AI-driven question similarity
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drills_topic ON drills(topic_id);
CREATE INDEX idx_drills_type ON drills(type);
CREATE INDEX idx_drills_embedding ON drills USING ivfflat (embedding vector_cosine_ops);

-- ============================================
-- STUDENT PROGRESS (SRS + Attempts)
-- ============================================

CREATE TABLE drill_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    drill_id UUID NOT NULL REFERENCES drills(id) ON DELETE CASCADE,
    is_correct BOOLEAN NOT NULL,
    time_taken_ms INT NOT NULL,
    submitted_answer JSONB,
    xp_earned INT DEFAULT 0,
    attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attempts_student ON drill_attempts(student_id);
CREATE INDEX idx_attempts_drill ON drill_attempts(drill_id);

-- Spaced Repetition Schedule (SM-2 algorithm)
CREATE TABLE srs_schedule (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    drill_id UUID NOT NULL REFERENCES drills(id) ON DELETE CASCADE,
    ease_factor FLOAT DEFAULT 2.5,
    interval_days INT DEFAULT 1,
    repetitions INT DEFAULT 0,
    next_review_at TIMESTAMPTZ DEFAULT NOW(),
    last_reviewed_at TIMESTAMPTZ,
    UNIQUE(student_id, drill_id)
);

CREATE INDEX idx_srs_next_review ON srs_schedule(student_id, next_review_at);

-- ============================================
-- B2B FEATURES (Institute Dashboard)
-- ============================================

CREATE TABLE homework_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES students(id), -- teacher account
    title VARCHAR(255) NOT NULL,
    drill_ids UUID[] NOT NULL,
    batch VARCHAR(50), -- null = all batches
    unlock_after_drill_id UUID REFERENCES drills(id), -- gateway lesson
    due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_homework_institute ON homework_assignments(institute_id);

-- ============================================
-- ROW-LEVEL SECURITY (Multi-tenancy)
-- ============================================

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE drill_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE srs_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Students can only see their own data
CREATE POLICY student_isolation ON students
    FOR ALL
    USING (id = current_setting('app.current_student_id')::UUID);

CREATE POLICY attempt_isolation ON drill_attempts
    FOR ALL
    USING (student_id = current_setting('app.current_student_id')::UUID);

CREATE POLICY srs_isolation ON srs_schedule
    FOR ALL
    USING (student_id = current_setting('app.current_student_id')::UUID);

-- Policy: Homework visible to institute members only
CREATE POLICY homework_isolation ON homework_assignments
    FOR SELECT
    USING (
        institute_id IN (
            SELECT institute_id FROM students 
            WHERE id = current_setting('app.current_student_id')::UUID
        )
    );

-- ============================================
-- SEED DATA (Development)
-- ============================================

INSERT INTO institutes (name, slug) VALUES 
    ('Demo Institute', 'demo'),
    ('Allen Career Institute', 'allen');

INSERT INTO topics (name, slug, order_index) VALUES
    ('p-Block Elements', 'p-block', 1),
    ('d & f-Block Elements', 'd-f-block', 2),
    ('Coordination Compounds', 'coordination', 3),
    ('Qualitative Analysis', 'qualitative', 4);

-- Sample drill (Reaction Matcher)
INSERT INTO drills (topic_id, type, difficulty, question_data, correct_answer, explanation, tags) VALUES
(
    (SELECT id FROM topics WHERE slug = 'p-block'),
    'reaction_matcher',
    'medium',
    '{
        "reactants": ["XeF4", "H2O"],
        "options": ["Xe + O2 + HF", "XeO3 + HF", "Xe + HF", "XeF6 + H2"]
    }'::jsonb,
    '{"product": "Xe + O2 + HF", "stoichiometry": "6XeF4 + 12H2O → 4Xe + 2XeO3 + 24HF"}'::jsonb,
    'XeF4 undergoes hydrolysis. The Xe in +4 state disproportionates.',
    ARRAY['xenon', 'hydrolysis', 'p-block']
);
