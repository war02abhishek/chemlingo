package duel

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// ── Constants ─────────────────────────────────────────────────────────────────

const (
	RoundDuration = 60 * time.Second
	BetweenRounds = 3 * time.Second
	TotalRounds   = 3
	InitialHP     = 100.0
	MinDamage     = 5.0
)

// ── Domain types ──────────────────────────────────────────────────────────────

type MatchStatus string

const (
	StatusWaiting  MatchStatus = "waiting"
	StatusActive   MatchStatus = "active"
	StatusFinished MatchStatus = "finished"
)

// Equation is a single balancing challenge served to both players.
type Equation struct {
	ID           string   `json:"id"`
	Raw          string   `json:"raw"`          // "2 H₂ + O₂ → 2 H₂O"  (canonical form shown on correct)
	Display      string   `json:"display"`       // "H₂ + O₂ → H₂O"       (shown during the round)
	Labels       []string `json:"labels"`        // per-slot molecule label
	SeparatorIdx int      `json:"separator_idx"` // slot index where → is placed
	Answers      []int    `json:"answers"`       // lowest-integer coefficients
	Difficulty   string   `json:"difficulty"`    // "easy" | "medium" | "hard"
	ChipMax      int      `json:"chip_max"`      // highest chip value rendered
}

type PlayerInfo struct {
	PlayerID string `json:"player_id"`
	Name     string `json:"name"`
}

type PlayerProgress struct {
	PlayerID      string  `json:"player_id"`
	HP            float64 `json:"hp"`
	WrongAttempts int     `json:"wrong_attempts"`
	RoundsSolved  int     `json:"rounds_solved"`
	Solved        bool    `json:"solved"`
}

type MatchState struct {
	MatchID       string            `json:"match_id"`
	Status        MatchStatus       `json:"status"`
	Players       [2]PlayerInfo     `json:"players"`
	CurrentRound  int               `json:"current_round"`
	TotalRounds   int               `json:"total_rounds"`
	Equation      Equation          `json:"equation"`
	RoundStartsAt time.Time         `json:"round_starts_at"`
	RoundEndsAt   time.Time         `json:"round_ends_at"`
	Progress      [2]PlayerProgress `json:"progress"`
	Winner        string            `json:"winner,omitempty"`
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

// ── Typed payload structs ──────────────────────────────────────────────────────

type SubmitPayload struct {
	Coefficients []int `json:"coefficients"`
}

type ValidationResult struct {
	Correct       bool    `json:"correct"`
	Damage        float64 `json:"damage,omitempty"`
	WrongAttempts int     `json:"wrong_attempts"`
}

type RoundEndPayload struct {
	WinnerID    string  `json:"winner_id"`
	NextRoundIn float64 `json:"next_round_in"`
}

type MatchEndPayload struct {
	WinnerID   string     `json:"winner_id"`
	FinalState MatchState `json:"final_state"`
}

// ── Internal runtime types ────────────────────────────────────────────────────

// Client owns a single player's WebSocket connection and outbound write queue.
type Client struct {
	conn     *websocket.Conn
	playerID string
	send     chan []byte // buffered; writePump drains this
}

// Match holds all mutable state for one live game.
type Match struct {
	id           string
	state        MatchState
	clients      [2]*Client
	connectedCnt int // incremented on each WS attachment; starts round at 2
	mu           sync.Mutex
	roundEnded   bool // idempotency guard per round
	done         chan struct{}
	closeOnce    sync.Once
}

// finish closes m.done exactly once.
func (m *Match) finish() {
	m.closeOnce.Do(func() { close(m.done) })
}
