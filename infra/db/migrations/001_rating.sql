-- Rating system: run once against the existing database.
-- Safe to re-run (all statements are idempotent).

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS rating INT NOT NULL DEFAULT 1200,
  ADD COLUMN IF NOT EXISTS wins   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS losses INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS duel_results (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id            TEXT        NOT NULL,
    player_id           UUID        NOT NULL REFERENCES students(id),
    opponent_id         UUID        NOT NULL REFERENCES students(id),
    player_rating_before INT        NOT NULL,
    opponent_rating_before INT      NOT NULL,
    rating_change       INT         NOT NULL,
    result              TEXT        NOT NULL CHECK (result IN ('win', 'loss', 'tie')),
    played_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_duel_results_player
    ON duel_results(player_id, played_at DESC);
