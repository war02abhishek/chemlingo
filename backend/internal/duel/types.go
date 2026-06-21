package duel

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ── Constants ─────────────────────────────────────────────────────────────────

const (
	BetweenRounds = 0 // no forced pause between rounds — players advance instantly
	TotalRounds   = 4

	// If a player disconnects and forfeits, add this penalty per unsolved round.
	ForfeitPenaltyMs = int64(5 * 60 * 1000) // 5 min per round

	keyQueue      = "chemlingo:queue"
	keyMatch      = "chemlingo:match:"    // + matchID  (HASH)
	keyConn       = "chemlingo:conn:"     // + matchID:playerID (STRING, SETNX)
	chanMatch     = "chemlingo:match:"    // + matchID  (Pub/Sub channel)

	matchTTL        = 2 * time.Hour
	connTTL         = 90 * time.Second
	reconnectWindow = 30 * time.Second
)

// ── Domain types ──────────────────────────────────────────────────────────────

type MatchStatus string

const (
	StatusWaiting  MatchStatus = "waiting"
	StatusActive   MatchStatus = "active"
	StatusFinished MatchStatus = "finished"
)

type Equation struct {
	ID           string   `json:"id"`
	Raw          string   `json:"raw"`
	Display      string   `json:"display"`
	Labels       []string `json:"labels"`
	SeparatorIdx int      `json:"separator_idx"`
	Answers      []int    `json:"answers"`
	Difficulty   string   `json:"difficulty"`
	ChipMax      int      `json:"chip_max"`
}

type PlayerInfo struct {
	PlayerID string `json:"player_id"`
	Name     string `json:"name"`
}

// PlayerProgress is independent per-player state in the race.
type PlayerProgress struct {
	PlayerID       string    `json:"player_id"`
	CurrentRound   int       `json:"current_round"`    // 1-indexed; which equation they're solving
	RoundStartedAt time.Time `json:"round_started_at"` // when they started the current equation
	TotalTimeMs    int64     `json:"total_time_ms"`    // cumulative solved time
	WrongAttempts  int       `json:"wrong_attempts"`   // for the current equation
	RoundsSolved   int       `json:"rounds_solved"`    // how many equations completed
	Finished       bool      `json:"finished"`         // true when all equations solved
}

// MatchState is stored in Redis and broadcast to both players.
type MatchState struct {
	MatchID     string            `json:"match_id"`
	Status      MatchStatus       `json:"status"`
	Players     [2]PlayerInfo     `json:"players"`
	TotalRounds int               `json:"total_rounds"`
	Equations   []Equation        `json:"equations"` // same set for both players, picked at match start
	Progress    [2]PlayerProgress `json:"progress"`
	Winner      string            `json:"winner,omitempty"`
}

// ── WS message envelopes ──────────────────────────────────────────────────────

type IncomingMsg struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type OutgoingMsg struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// ── Typed payload structs ─────────────────────────────────────────────────────

type SubmitPayload struct {
	Coefficients []int `json:"coefficients"`
}

type ValidationResult struct {
	Correct       bool  `json:"correct"`
	SolveTimeMs   int64 `json:"solve_time_ms,omitempty"`
	WrongAttempts int   `json:"wrong_attempts"`
}

// RatingChange carries per-player Elo movement included in the match_end payload.
type RatingChange struct {
	PlayerID string `json:"player_id"`
	Before   int    `json:"before"`
	Delta    int    `json:"delta"` // negative on loss
	After    int    `json:"after"`
}

type MatchEndPayload struct {
	WinnerID      string         `json:"winner_id"` // "" = tie
	FinalState    MatchState     `json:"final_state"`
	RatingChanges [2]RatingChange `json:"rating_changes"`
}

// ── Client — owns one WebSocket connection ────────────────────────────────────

type Client struct {
	conn     *websocket.Conn
	playerID string
	matchID  string
	send     chan []byte
	once     sync.Once
}

func (c *Client) close() {
	c.once.Do(func() { close(c.send) })
}
