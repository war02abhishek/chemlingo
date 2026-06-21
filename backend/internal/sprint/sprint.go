// Package sprint implements the Periodic Table Sprint game mode.
// Questions are seeded by UTC date so all players get the same 10 questions per day.
package sprint

import (
	"fmt"
	"hash/fnv"
	"math/rand"
	"time"
)

// Element holds the periodic-table properties needed for question generation.
type Element struct {
	Name         string
	Symbol       string
	AtomicNumber int
	Group        int
	Period       int
}

// QuestionType identifies the kind of question shown to the player.
type QuestionType string

const (
	AtomicNumberQ QuestionType = "atomic_number" // "Which element has atomic number N?"
	SymbolQ       QuestionType = "symbol"         // "What is the symbol for X?"
	GroupQ        QuestionType = "group"           // "Which element belongs to Group G?"
	PeriodQ       QuestionType = "period"          // "Which element is in Period P?"
)

// Question is one sprint question with 4 MCQ options.
// correctIndex is unexported — used server-side only for validation.
type Question struct {
	ID           string       `json:"id"`
	Type         QuestionType `json:"type"`
	Prompt       string       `json:"prompt"`
	Options      []string     `json:"options"` // exactly 4 choices
	correctIndex int
}

// elements is the pool of 30 representative elements used for question generation.
var elements = []Element{
	{Name: "Hydrogen", Symbol: "H", AtomicNumber: 1, Group: 1, Period: 1},
	{Name: "Helium", Symbol: "He", AtomicNumber: 2, Group: 18, Period: 1},
	{Name: "Lithium", Symbol: "Li", AtomicNumber: 3, Group: 1, Period: 2},
	{Name: "Beryllium", Symbol: "Be", AtomicNumber: 4, Group: 2, Period: 2},
	{Name: "Boron", Symbol: "B", AtomicNumber: 5, Group: 13, Period: 2},
	{Name: "Carbon", Symbol: "C", AtomicNumber: 6, Group: 14, Period: 2},
	{Name: "Nitrogen", Symbol: "N", AtomicNumber: 7, Group: 15, Period: 2},
	{Name: "Oxygen", Symbol: "O", AtomicNumber: 8, Group: 16, Period: 2},
	{Name: "Fluorine", Symbol: "F", AtomicNumber: 9, Group: 17, Period: 2},
	{Name: "Neon", Symbol: "Ne", AtomicNumber: 10, Group: 18, Period: 2},
	{Name: "Sodium", Symbol: "Na", AtomicNumber: 11, Group: 1, Period: 3},
	{Name: "Magnesium", Symbol: "Mg", AtomicNumber: 12, Group: 2, Period: 3},
	{Name: "Aluminium", Symbol: "Al", AtomicNumber: 13, Group: 13, Period: 3},
	{Name: "Silicon", Symbol: "Si", AtomicNumber: 14, Group: 14, Period: 3},
	{Name: "Phosphorus", Symbol: "P", AtomicNumber: 15, Group: 15, Period: 3},
	{Name: "Sulfur", Symbol: "S", AtomicNumber: 16, Group: 16, Period: 3},
	{Name: "Chlorine", Symbol: "Cl", AtomicNumber: 17, Group: 17, Period: 3},
	{Name: "Argon", Symbol: "Ar", AtomicNumber: 18, Group: 18, Period: 3},
	{Name: "Potassium", Symbol: "K", AtomicNumber: 19, Group: 1, Period: 4},
	{Name: "Calcium", Symbol: "Ca", AtomicNumber: 20, Group: 2, Period: 4},
	{Name: "Iron", Symbol: "Fe", AtomicNumber: 26, Group: 8, Period: 4},
	{Name: "Copper", Symbol: "Cu", AtomicNumber: 29, Group: 11, Period: 4},
	{Name: "Zinc", Symbol: "Zn", AtomicNumber: 30, Group: 12, Period: 4},
	{Name: "Bromine", Symbol: "Br", AtomicNumber: 35, Group: 17, Period: 4},
	{Name: "Krypton", Symbol: "Kr", AtomicNumber: 36, Group: 18, Period: 4},
	{Name: "Silver", Symbol: "Ag", AtomicNumber: 47, Group: 11, Period: 5},
	{Name: "Iodine", Symbol: "I", AtomicNumber: 53, Group: 17, Period: 5},
	{Name: "Gold", Symbol: "Au", AtomicNumber: 79, Group: 11, Period: 6},
	{Name: "Mercury", Symbol: "Hg", AtomicNumber: 80, Group: 12, Period: 6},
	{Name: "Lead", Symbol: "Pb", AtomicNumber: 82, Group: 14, Period: 6},
}

const questionsPerSprint = 10

// ForDate returns 10 sprint questions for the given UTC date.
// The result is deterministic: all players on all servers get the same questions.
func ForDate(date time.Time) []Question {
	key := date.UTC().Format("2006-01-02") + "_sprint"
	h := fnv.New32a()
	h.Write([]byte(key))
	rng := rand.New(rand.NewSource(int64(h.Sum32())))
	dateStr := date.UTC().Format("2006-01-02")

	// Shuffle to determine which element is the subject of each question.
	subjectPerm := rng.Perm(len(elements))

	qtypes := []QuestionType{AtomicNumberQ, SymbolQ, GroupQ, PeriodQ}

	questions := make([]Question, questionsPerSprint)
	for i := 0; i < questionsPerSprint; i++ {
		questions[i] = makeQuestion(rng, i, dateStr, qtypes[i%len(qtypes)], subjectPerm[i])
	}
	return questions
}

func makeQuestion(rng *rand.Rand, idx int, dateStr string, qtype QuestionType, subjectIdx int) Question {
	subject := elements[subjectIdx]

	// Pick 3 distractors using a shuffled pass; for group/period questions the
	// distractor must not share the same property value as the subject.
	distractorPerm := rng.Perm(len(elements))
	picked := map[int]bool{subjectIdx: true}
	var distractors []Element

	for _, i := range distractorPerm {
		if len(distractors) == 3 {
			break
		}
		if picked[i] {
			continue
		}
		d := elements[i]
		if qtype == GroupQ && d.Group == subject.Group {
			continue
		}
		if qtype == PeriodQ && d.Period == subject.Period {
			continue
		}
		picked[i] = true
		distractors = append(distractors, d)
	}
	// Fallback: relax constraints if the pool is exhausted (shouldn't happen in practice).
	for _, i := range distractorPerm {
		if len(distractors) == 3 {
			break
		}
		if picked[i] {
			continue
		}
		picked[i] = true
		distractors = append(distractors, elements[i])
	}

	var prompt, correctOption string
	opts := [4]string{}

	switch qtype {
	case AtomicNumberQ:
		prompt = fmt.Sprintf("Which element has atomic number %d?", subject.AtomicNumber)
		correctOption = subject.Name
		opts[0], opts[1], opts[2], opts[3] = subject.Name, distractors[0].Name, distractors[1].Name, distractors[2].Name
	case SymbolQ:
		prompt = fmt.Sprintf("What is the symbol for %s?", subject.Name)
		correctOption = subject.Symbol
		opts[0], opts[1], opts[2], opts[3] = subject.Symbol, distractors[0].Symbol, distractors[1].Symbol, distractors[2].Symbol
	case GroupQ:
		prompt = fmt.Sprintf("Which element belongs to Group %d?", subject.Group)
		correctOption = subject.Name
		opts[0], opts[1], opts[2], opts[3] = subject.Name, distractors[0].Name, distractors[1].Name, distractors[2].Name
	case PeriodQ:
		prompt = fmt.Sprintf("Which element is in Period %d?", subject.Period)
		correctOption = subject.Name
		opts[0], opts[1], opts[2], opts[3] = subject.Name, distractors[0].Name, distractors[1].Name, distractors[2].Name
	}

	// Shuffle the 4 options so the correct one isn't always first.
	rng.Shuffle(4, func(i, j int) { opts[i], opts[j] = opts[j], opts[i] })

	correctIndex := 0
	for i, o := range opts {
		if o == correctOption {
			correctIndex = i
			break
		}
	}

	return Question{
		ID:           fmt.Sprintf("sprint_%s_%d", dateStr, idx),
		Type:         qtype,
		Prompt:       prompt,
		Options:      opts[:],
		correctIndex: correctIndex,
	}
}

// ValidateByID looks up a question from the day's set and validates the selected option index.
// Returns (correct, found).
func ValidateByID(questions []Question, id string, selectedIndex int) (correct bool, correctIndex int, correctOption string, found bool) {
	for _, q := range questions {
		if q.ID == id {
			return selectedIndex == q.correctIndex, q.correctIndex, q.Options[q.correctIndex], true
		}
	}
	return false, 0, "", false
}

// Score computes the sprint score.
//
//	correctAnswers * 100 + clamp(0, 500 - elapsedSecs)
//
// Max: 1000 accuracy + 500 speed = 1500.
func Score(correctAnswers int, elapsedMs int64) int {
	elapsedSecs := elapsedMs / 1000
	speedBonus := int(500 - elapsedSecs)
	if speedBonus < 0 {
		speedBonus = 0
	}
	return correctAnswers*100 + speedBonus
}

// XPReward returns XP earned for a sprint result.
func XPReward(correctAnswers, totalQuestions, score int) int {
	xp := 30 // participation
	xp += correctAnswers * 10
	if correctAnswers == totalQuestions {
		xp += 50 // perfect accuracy
	}
	if score >= 1300 {
		xp += 30 // fast + accurate
	}
	return xp
}
