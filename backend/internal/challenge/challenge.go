// Package challenge implements the deterministic daily-challenge system.
// Every UTC calendar date maps to the same ordered set of 5 equations for all players.
package challenge

import (
	"hash/fnv"
	"math/rand"
	"time"
)

// Question mirrors the duel Equation format so the frontend can reuse the same
// equation-display component. Answers is intentionally NOT exported in JSON —
// the client submits guesses and the server validates them here.
type Question struct {
	ID           string   `json:"id"`
	Display      string   `json:"display"`       // equation without coefficients
	Labels       []string `json:"labels"`        // one entry per term
	SeparatorIdx int      `json:"separator_idx"` // → appears before labels[SeparatorIdx]
	Difficulty   string   `json:"difficulty"`
	ChipMax      int      `json:"chip_max"`
	answers      []int    // unexported — used only server-side for validation
}

// pool is the equation bank (15 equations). Questions are picked deterministically
// each day so every player gets the same 5.
//
// All equations are verified balanced below:
//   eq1:  2H₂ + O₂ → 2H₂O
//   eq2:  N₂ + 3H₂ → 2NH₃
//   eq3:  4Fe + 3O₂ → 2Fe₂O₃
//   eq4:  2Al + 6HCl → 2AlCl₃ + 3H₂
//   eq5:  C₃H₈ + 5O₂ → 3CO₂ + 4H₂O
//   eq6:  4Na + O₂ → 2Na₂O
//   eq7:  Ca + 2H₂O → Ca(OH)₂ + H₂
//   eq8:  CH₄ + 2O₂ → CO₂ + 2H₂O
//   eq9:  C₂H₅OH + 3O₂ → 2CO₂ + 3H₂O
//   eq10: 2KClO₃ → 2KCl + 3O₂
//   eq11: 2Mg + O₂ → 2MgO
//   eq12: Fe₃O₄ + 4H₂ → 3Fe + 4H₂O
//   eq13: P₄ + 5O₂ → 2P₂O₅
//   eq14: 2C₂H₂ + 5O₂ → 4CO₂ + 2H₂O
//   eq15: 2NaOH + H₂SO₄ → Na₂SO₄ + 2H₂O
var pool = []Question{
	{
		ID: "dc_h2o", Display: "H₂ + O₂ → H₂O",
		Labels: []string{"H₂", "O₂", "H₂O"}, SeparatorIdx: 2,
		Difficulty: "easy", ChipMax: 4, answers: []int{2, 1, 2},
	},
	{
		ID: "dc_nh3", Display: "N₂ + H₂ → NH₃",
		Labels: []string{"N₂", "H₂", "NH₃"}, SeparatorIdx: 2,
		Difficulty: "easy", ChipMax: 4, answers: []int{1, 3, 2},
	},
	{
		ID: "dc_fe2o3", Display: "Fe + O₂ → Fe₂O₃",
		Labels: []string{"Fe", "O₂", "Fe₂O₃"}, SeparatorIdx: 2,
		Difficulty: "medium", ChipMax: 6, answers: []int{4, 3, 2},
	},
	{
		ID: "dc_alcl3", Display: "Al + HCl → AlCl₃ + H₂",
		Labels: []string{"Al", "HCl", "AlCl₃", "H₂"}, SeparatorIdx: 2,
		Difficulty: "medium", ChipMax: 8, answers: []int{2, 6, 2, 3},
	},
	{
		ID: "dc_propane", Display: "C₃H₈ + O₂ → CO₂ + H₂O",
		Labels: []string{"C₃H₈", "O₂", "CO₂", "H₂O"}, SeparatorIdx: 2,
		Difficulty: "hard", ChipMax: 6, answers: []int{1, 5, 3, 4},
	},
	{
		ID: "dc_na2o", Display: "Na + O₂ → Na₂O",
		Labels: []string{"Na", "O₂", "Na₂O"}, SeparatorIdx: 2,
		Difficulty: "easy", ChipMax: 4, answers: []int{4, 1, 2},
	},
	{
		ID: "dc_ca_h2o", Display: "Ca + H₂O → Ca(OH)₂ + H₂",
		Labels: []string{"Ca", "H₂O", "Ca(OH)₂", "H₂"}, SeparatorIdx: 2,
		Difficulty: "medium", ChipMax: 4, answers: []int{1, 2, 1, 1},
	},
	{
		ID: "dc_methane", Display: "CH₄ + O₂ → CO₂ + H₂O",
		Labels: []string{"CH₄", "O₂", "CO₂", "H₂O"}, SeparatorIdx: 2,
		Difficulty: "easy", ChipMax: 4, answers: []int{1, 2, 1, 2},
	},
	{
		ID: "dc_ethanol", Display: "C₂H₅OH + O₂ → CO₂ + H₂O",
		Labels: []string{"C₂H₅OH", "O₂", "CO₂", "H₂O"}, SeparatorIdx: 2,
		Difficulty: "medium", ChipMax: 4, answers: []int{1, 3, 2, 3},
	},
	{
		ID: "dc_kclo3", Display: "KClO₃ → KCl + O₂",
		Labels: []string{"KClO₃", "KCl", "O₂"}, SeparatorIdx: 1,
		Difficulty: "medium", ChipMax: 4, answers: []int{2, 2, 3},
	},
	{
		ID: "dc_mgo", Display: "Mg + O₂ → MgO",
		Labels: []string{"Mg", "O₂", "MgO"}, SeparatorIdx: 2,
		Difficulty: "easy", ChipMax: 4, answers: []int{2, 1, 2},
	},
	{
		ID: "dc_fe3o4", Display: "Fe₃O₄ + H₂ → Fe + H₂O",
		Labels: []string{"Fe₃O₄", "H₂", "Fe", "H₂O"}, SeparatorIdx: 2,
		Difficulty: "hard", ChipMax: 6, answers: []int{1, 4, 3, 4},
	},
	{
		ID: "dc_p2o5", Display: "P₄ + O₂ → P₂O₅",
		Labels: []string{"P₄", "O₂", "P₂O₅"}, SeparatorIdx: 2,
		Difficulty: "medium", ChipMax: 6, answers: []int{1, 5, 2},
	},
	{
		ID: "dc_acetylene", Display: "C₂H₂ + O₂ → CO₂ + H₂O",
		Labels: []string{"C₂H₂", "O₂", "CO₂", "H₂O"}, SeparatorIdx: 2,
		Difficulty: "hard", ChipMax: 6, answers: []int{2, 5, 4, 2},
	},
	{
		ID: "dc_naoh_h2so4", Display: "NaOH + H₂SO₄ → Na₂SO₄ + H₂O",
		Labels: []string{"NaOH", "H₂SO₄", "Na₂SO₄", "H₂O"}, SeparatorIdx: 2,
		Difficulty: "medium", ChipMax: 4, answers: []int{2, 1, 1, 2},
	},
}

const questionsPerChallenge = 5

// ForDate returns the 5 questions for a given UTC date, deterministically seeded
// by the date string so every player on every server gets the same set.
func ForDate(date time.Time) []Question {
	key := date.UTC().Format("2006-01-02")
	h := fnv.New32a()
	h.Write([]byte(key))
	rng := rand.New(rand.NewSource(int64(h.Sum32())))

	perm := rng.Perm(len(pool))
	out := make([]Question, questionsPerChallenge)
	for i := 0; i < questionsPerChallenge; i++ {
		out[i] = pool[perm[i]]
	}
	return out
}

// Validate checks whether the submitted coefficients match the correct answers.
func Validate(q Question, coefficients []int) bool {
	if len(coefficients) != len(q.answers) {
		return false
	}
	for i, c := range q.answers {
		if coefficients[i] != c {
			return false
		}
	}
	return true
}

// ValidateByID looks up a question from the day's set by ID and validates it.
// Returns (correct, found).
func ValidateByID(dayQuestions []Question, id string, coefficients []int) (bool, bool) {
	for _, q := range dayQuestions {
		if q.ID == id {
			return Validate(q, coefficients), true
		}
	}
	return false, false
}

// Score computes the challenge score.
//   score = correctAnswers * 200 + clamp(0, 300 - elapsedSecs)
// Max accuracy points: 1000 (5/5). Max speed bonus: 300 (instant). Total max: 1300.
func Score(correctAnswers int, elapsedMs int64) int {
	elapsedSecs := elapsedMs / 1000
	speedBonus := int(300 - elapsedSecs)
	if speedBonus < 0 {
		speedBonus = 0
	}
	return correctAnswers*200 + speedBonus
}

// XPReward returns XP earned for a challenge result.
func XPReward(correctAnswers, totalQuestions int, score int) int {
	xp := 50 // participation
	xp += correctAnswers * 20
	if correctAnswers == totalQuestions {
		xp += 100 // perfect accuracy
	}
	if score >= 1100 {
		xp += 50 // fast + accurate
	}
	return xp
}
