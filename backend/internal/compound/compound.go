package compound

import (
	"fmt"
	"hash/fnv"
	mathrand "math/rand"
	"sort"
	"time"
)

const dailyQuestions = 5

// Ion is the public representation of a cation or anion.
type Ion struct {
	ID          string `json:"id"`
	Symbol      string `json:"symbol"`       // e.g. "Na⁺" — for display with charge
	BaseFormula string `json:"base_formula"` // e.g. "Na" — for building the formula preview
	Name        string `json:"name"`
	Charge      int    `json:"charge"`
	Polyatomic  bool   `json:"polyatomic"` // true → wrap in () when count > 1
}

// SelectedIon is what the client sends (and what the server stores as the answer).
type SelectedIon struct {
	IonID string `json:"ion_id"`
	Count int    `json:"count"`
}

// Question is the public-facing question struct. The correct answer is unexported.
type Question struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Difficulty    string `json:"difficulty"`
	Hint          string `json:"hint"`
	AvailableIons []Ion  `json:"available_ions"`
	formula       string        // unexported — returned only in result
	answer        []SelectedIon // unexported — server-side only
}

// CorrectAnswer surfaces the private fields for result generation.
func (q Question) CorrectAnswer() []SelectedIon { return q.answer }
func (q Question) Formula() string               { return q.formula }

// ── Ion definitions ──────────────────────────────────────────────────────────

var ionMap = map[string]Ion{
	// Cations
	"na+":  {ID: "na+", Symbol: "Na⁺", BaseFormula: "Na", Name: "Sodium", Charge: +1},
	"k+":   {ID: "k+", Symbol: "K⁺", BaseFormula: "K", Name: "Potassium", Charge: +1},
	"ca2+": {ID: "ca2+", Symbol: "Ca²⁺", BaseFormula: "Ca", Name: "Calcium", Charge: +2},
	"mg2+": {ID: "mg2+", Symbol: "Mg²⁺", BaseFormula: "Mg", Name: "Magnesium", Charge: +2},
	"al3+": {ID: "al3+", Symbol: "Al³⁺", BaseFormula: "Al", Name: "Aluminium", Charge: +3},
	"fe2+": {ID: "fe2+", Symbol: "Fe²⁺", BaseFormula: "Fe", Name: "Iron(II)", Charge: +2},
	"fe3+": {ID: "fe3+", Symbol: "Fe³⁺", BaseFormula: "Fe", Name: "Iron(III)", Charge: +3},
	"nh4+": {ID: "nh4+", Symbol: "NH₄⁺", BaseFormula: "NH₄", Name: "Ammonium", Charge: +1, Polyatomic: true},
	"cu2+": {ID: "cu2+", Symbol: "Cu²⁺", BaseFormula: "Cu", Name: "Copper(II)", Charge: +2},
	"zn2+": {ID: "zn2+", Symbol: "Zn²⁺", BaseFormula: "Zn", Name: "Zinc", Charge: +2},
	// Anions
	"cl-":   {ID: "cl-", Symbol: "Cl⁻", BaseFormula: "Cl", Name: "Chloride", Charge: -1},
	"br-":   {ID: "br-", Symbol: "Br⁻", BaseFormula: "Br", Name: "Bromide", Charge: -1},
	"f-":    {ID: "f-", Symbol: "F⁻", BaseFormula: "F", Name: "Fluoride", Charge: -1},
	"o2-":   {ID: "o2-", Symbol: "O²⁻", BaseFormula: "O", Name: "Oxide", Charge: -2},
	"s2-":   {ID: "s2-", Symbol: "S²⁻", BaseFormula: "S", Name: "Sulphide", Charge: -2},
	"oh-":   {ID: "oh-", Symbol: "OH⁻", BaseFormula: "OH", Name: "Hydroxide", Charge: -1, Polyatomic: true},
	"no3-":  {ID: "no3-", Symbol: "NO₃⁻", BaseFormula: "NO₃", Name: "Nitrate", Charge: -1, Polyatomic: true},
	"so4-":  {ID: "so4-", Symbol: "SO₄²⁻", BaseFormula: "SO₄", Name: "Sulphate", Charge: -2, Polyatomic: true},
	"co3-":  {ID: "co3-", Symbol: "CO₃²⁻", BaseFormula: "CO₃", Name: "Carbonate", Charge: -2, Polyatomic: true},
	"po4-":  {ID: "po4-", Symbol: "PO₄³⁻", BaseFormula: "PO₄", Name: "Phosphate", Charge: -3, Polyatomic: true},
	"hco3-": {ID: "hco3-", Symbol: "HCO₃⁻", BaseFormula: "HCO₃", Name: "Bicarbonate", Charge: -1, Polyatomic: true},
	"so3-":  {ID: "so3-", Symbol: "SO₃²⁻", BaseFormula: "SO₃", Name: "Sulphite", Charge: -2, Polyatomic: true},
}

// ── Compound definitions ─────────────────────────────────────────────────────

type cmpd struct {
	name    string
	formula string
	diff    string
	hint    string
	answer  []SelectedIon
	pool    []string // 6 ion IDs shown to the player
}

var easyCompounds = []cmpd{
	{
		name: "Sodium Chloride", formula: "NaCl", diff: "easy",
		hint:   "Sodium has valency +1, Chloride has valency −1. They combine 1:1.",
		answer: []SelectedIon{{"na+", 1}, {"cl-", 1}},
		pool:   []string{"na+", "k+", "ca2+", "cl-", "br-", "f-"},
	},
	{
		name: "Potassium Bromide", formula: "KBr", diff: "easy",
		hint:   "Both ions have single valency. They combine in equal numbers.",
		answer: []SelectedIon{{"k+", 1}, {"br-", 1}},
		pool:   []string{"na+", "k+", "mg2+", "cl-", "br-", "s2-"},
	},
	{
		name: "Calcium Oxide", formula: "CaO", diff: "easy",
		hint:   "Calcium is +2 and Oxide is −2. Equal and opposite charges → 1:1.",
		answer: []SelectedIon{{"ca2+", 1}, {"o2-", 1}},
		pool:   []string{"ca2+", "mg2+", "al3+", "o2-", "s2-", "cl-"},
	},
	{
		name: "Magnesium Fluoride", formula: "MgF₂", diff: "easy",
		hint:   "Mg is +2, F is −1. Need 2 fluorides to balance one magnesium.",
		answer: []SelectedIon{{"mg2+", 1}, {"f-", 2}},
		pool:   []string{"mg2+", "ca2+", "na+", "f-", "cl-", "br-"},
	},
	{
		name: "Aluminium Chloride", formula: "AlCl₃", diff: "easy",
		hint:   "Al is +3, Cl is −1. You need 3 chlorides per aluminium.",
		answer: []SelectedIon{{"al3+", 1}, {"cl-", 3}},
		pool:   []string{"al3+", "fe3+", "mg2+", "cl-", "br-", "f-"},
	},
	{
		name: "Sodium Oxide", formula: "Na₂O", diff: "easy",
		hint:   "Na is +1, O is −2. Need 2 sodium ions to balance one oxide.",
		answer: []SelectedIon{{"na+", 2}, {"o2-", 1}},
		pool:   []string{"na+", "k+", "ca2+", "o2-", "s2-", "cl-"},
	},
	{
		name: "Calcium Chloride", formula: "CaCl₂", diff: "easy",
		hint:   "Ca is +2, Cl is −1. Need 2 chlorides to balance calcium.",
		answer: []SelectedIon{{"ca2+", 1}, {"cl-", 2}},
		pool:   []string{"ca2+", "mg2+", "na+", "cl-", "br-", "f-"},
	},
	{
		name: "Iron(III) Chloride", formula: "FeCl₃", diff: "easy",
		hint:   "Fe(III) is +3, Cl is −1. Three chlorides balance one iron(III).",
		answer: []SelectedIon{{"fe3+", 1}, {"cl-", 3}},
		pool:   []string{"fe3+", "fe2+", "al3+", "cl-", "br-", "f-"},
	},
	{
		name: "Zinc Sulphide", formula: "ZnS", diff: "easy",
		hint:   "Zn is +2, S²⁻ is −2. Equal charges → 1:1 ratio.",
		answer: []SelectedIon{{"zn2+", 1}, {"s2-", 1}},
		pool:   []string{"zn2+", "cu2+", "ca2+", "s2-", "o2-", "cl-"},
	},
	{
		name: "Copper(II) Oxide", formula: "CuO", diff: "easy",
		hint:   "Cu²⁺ is +2, O²⁻ is −2. They balance 1:1.",
		answer: []SelectedIon{{"cu2+", 1}, {"o2-", 1}},
		pool:   []string{"cu2+", "zn2+", "fe2+", "o2-", "s2-", "cl-"},
	},
}

var mediumCompounds = []cmpd{
	{
		name: "Sodium Hydroxide", formula: "NaOH", diff: "medium",
		hint:   "Na⁺ (+1) balances OH⁻ (−1) in a 1:1 ratio.",
		answer: []SelectedIon{{"na+", 1}, {"oh-", 1}},
		pool:   []string{"na+", "k+", "ca2+", "oh-", "cl-", "no3-"},
	},
	{
		name: "Calcium Carbonate", formula: "CaCO₃", diff: "medium",
		hint:   "Ca²⁺ (+2) and CO₃²⁻ (−2) have matching magnitudes → 1:1.",
		answer: []SelectedIon{{"ca2+", 1}, {"co3-", 1}},
		pool:   []string{"ca2+", "mg2+", "na+", "co3-", "so4-", "cl-"},
	},
	{
		name: "Potassium Nitrate", formula: "KNO₃", diff: "medium",
		hint:   "K⁺ (+1) and NO₃⁻ (−1) combine 1:1.",
		answer: []SelectedIon{{"k+", 1}, {"no3-", 1}},
		pool:   []string{"k+", "na+", "ca2+", "no3-", "cl-", "oh-"},
	},
	{
		name: "Ammonium Chloride", formula: "NH₄Cl", diff: "medium",
		hint:   "NH₄⁺ (+1) and Cl⁻ (−1) combine in equal numbers.",
		answer: []SelectedIon{{"nh4+", 1}, {"cl-", 1}},
		pool:   []string{"nh4+", "na+", "k+", "cl-", "oh-", "no3-"},
	},
	{
		name: "Magnesium Nitrate", formula: "Mg(NO₃)₂", diff: "medium",
		hint:   "Mg²⁺ (+2) needs 2 nitrate ions (each −1) to balance.",
		answer: []SelectedIon{{"mg2+", 1}, {"no3-", 2}},
		pool:   []string{"mg2+", "ca2+", "na+", "no3-", "cl-", "so4-"},
	},
	{
		name: "Sodium Carbonate", formula: "Na₂CO₃", diff: "medium",
		hint:   "CO₃²⁻ (−2) needs 2 sodium ions (each +1) to balance.",
		answer: []SelectedIon{{"na+", 2}, {"co3-", 1}},
		pool:   []string{"na+", "k+", "ca2+", "co3-", "oh-", "cl-"},
	},
	{
		name: "Calcium Hydroxide", formula: "Ca(OH)₂", diff: "medium",
		hint:   "Ca²⁺ (+2) needs 2 hydroxide ions (each −1) to balance.",
		answer: []SelectedIon{{"ca2+", 1}, {"oh-", 2}},
		pool:   []string{"ca2+", "mg2+", "na+", "oh-", "cl-", "co3-"},
	},
	{
		name: "Iron(III) Hydroxide", formula: "Fe(OH)₃", diff: "medium",
		hint:   "Fe³⁺ (+3) needs 3 hydroxide ions (each −1) to balance.",
		answer: []SelectedIon{{"fe3+", 1}, {"oh-", 3}},
		pool:   []string{"fe3+", "fe2+", "al3+", "oh-", "cl-", "no3-"},
	},
	{
		name: "Ammonium Nitrate", formula: "NH₄NO₃", diff: "medium",
		hint:   "Both ammonium (+1) and nitrate (−1) have valency 1 → 1:1.",
		answer: []SelectedIon{{"nh4+", 1}, {"no3-", 1}},
		pool:   []string{"nh4+", "na+", "k+", "no3-", "cl-", "oh-"},
	},
	{
		name: "Copper(II) Sulphate", formula: "CuSO₄", diff: "medium",
		hint:   "Cu²⁺ (+2) and SO₄²⁻ (−2) have matching magnitudes → 1:1.",
		answer: []SelectedIon{{"cu2+", 1}, {"so4-", 1}},
		pool:   []string{"cu2+", "zn2+", "fe2+", "so4-", "cl-", "no3-"},
	},
}

var hardCompounds = []cmpd{
	{
		name: "Aluminium Sulphate", formula: "Al₂(SO₄)₃", diff: "hard",
		hint:   "Al³⁺ (+3) and SO₄²⁻ (−2): LCM of 3 and 2 is 6 → 2 aluminiums, 3 sulphates.",
		answer: []SelectedIon{{"al3+", 2}, {"so4-", 3}},
		pool:   []string{"al3+", "fe3+", "ca2+", "so4-", "no3-", "co3-"},
	},
	{
		name: "Calcium Phosphate", formula: "Ca₃(PO₄)₂", diff: "hard",
		hint:   "Ca²⁺ (+2) and PO₄³⁻ (−3): LCM is 6 → 3 calciums, 2 phosphates.",
		answer: []SelectedIon{{"ca2+", 3}, {"po4-", 2}},
		pool:   []string{"ca2+", "mg2+", "al3+", "po4-", "so4-", "co3-"},
	},
	{
		name: "Iron(III) Sulphate", formula: "Fe₂(SO₄)₃", diff: "hard",
		hint:   "Fe³⁺ (+3) and SO₄²⁻ (−2): LCM is 6 → 2 irons, 3 sulphates.",
		answer: []SelectedIon{{"fe3+", 2}, {"so4-", 3}},
		pool:   []string{"fe3+", "al3+", "cu2+", "so4-", "no3-", "co3-"},
	},
	{
		name: "Ammonium Phosphate", formula: "(NH₄)₃PO₄", diff: "hard",
		hint:   "NH₄⁺ (+1) and PO₄³⁻ (−3): need 3 ammoniums per phosphate.",
		answer: []SelectedIon{{"nh4+", 3}, {"po4-", 1}},
		pool:   []string{"nh4+", "na+", "k+", "po4-", "so4-", "co3-"},
	},
	{
		name: "Aluminium Phosphate", formula: "AlPO₄", diff: "hard",
		hint:   "Al³⁺ (+3) and PO₄³⁻ (−3) have equal magnitudes → 1:1.",
		answer: []SelectedIon{{"al3+", 1}, {"po4-", 1}},
		pool:   []string{"al3+", "fe3+", "mg2+", "po4-", "so4-", "co3-"},
	},
	{
		name: "Magnesium Phosphate", formula: "Mg₃(PO₄)₂", diff: "hard",
		hint:   "Mg²⁺ (+2) and PO₄³⁻ (−3): LCM is 6 → 3 magnesiums, 2 phosphates.",
		answer: []SelectedIon{{"mg2+", 3}, {"po4-", 2}},
		pool:   []string{"mg2+", "ca2+", "al3+", "po4-", "so4-", "co3-"},
	},
	{
		name: "Calcium Sulphate", formula: "CaSO₄", diff: "hard",
		hint:   "Ca²⁺ (+2) and SO₄²⁻ (−2) have equal magnitudes → 1:1.",
		answer: []SelectedIon{{"ca2+", 1}, {"so4-", 1}},
		pool:   []string{"ca2+", "mg2+", "zn2+", "so4-", "co3-", "no3-"},
	},
	{
		name: "Aluminium Hydroxide", formula: "Al(OH)₃", diff: "hard",
		hint:   "Al³⁺ (+3) needs 3 hydroxide ions (each −1) to balance.",
		answer: []SelectedIon{{"al3+", 1}, {"oh-", 3}},
		pool:   []string{"al3+", "fe3+", "mg2+", "oh-", "co3-", "so4-"},
	},
	{
		name: "Iron(III) Nitrate", formula: "Fe(NO₃)₃", diff: "hard",
		hint:   "Fe³⁺ (+3) needs 3 nitrate ions (each −1) to balance.",
		answer: []SelectedIon{{"fe3+", 1}, {"no3-", 3}},
		pool:   []string{"fe3+", "al3+", "cu2+", "no3-", "cl-", "so4-"},
	},
	{
		name: "Zinc Phosphate", formula: "Zn₃(PO₄)₂", diff: "hard",
		hint:   "Zn²⁺ (+2) and PO₄³⁻ (−3): LCM is 6 → 3 zincs, 2 phosphates.",
		answer: []SelectedIon{{"zn2+", 3}, {"po4-", 2}},
		pool:   []string{"zn2+", "cu2+", "ca2+", "po4-", "so4-", "co3-"},
	},
}

// ── Public API ───────────────────────────────────────────────────────────────

// ForDate returns 5 daily questions seeded by the UTC date (2 easy, 2 medium, 1 hard).
func ForDate(date time.Time) []Question {
	key := date.UTC().Format("2006-01-02") + "_compound"
	h := fnv.New32a()
	h.Write([]byte(key))
	rng := mathrand.New(mathrand.NewSource(int64(h.Sum32())))
	dateStr := date.UTC().Format("2006-01-02")

	ep := rng.Perm(len(easyCompounds))
	mp := rng.Perm(len(mediumCompounds))
	hp := rng.Perm(len(hardCompounds))

	return []Question{
		buildQuestion(dateStr, easyCompounds[ep[0]], 0),
		buildQuestion(dateStr, easyCompounds[ep[1]], 1),
		buildQuestion(dateStr, mediumCompounds[mp[0]], 2),
		buildQuestion(dateStr, mediumCompounds[mp[1]], 3),
		buildQuestion(dateStr, hardCompounds[hp[0]], 4),
	}
}

// GetPractice returns a random compound for the given difficulty (or "any").
func GetPractice(difficulty string) (Question, bool) {
	var pool []cmpd
	switch difficulty {
	case "easy":
		pool = easyCompounds
	case "medium":
		pool = mediumCompounds
	case "hard":
		pool = hardCompounds
	default:
		pool = append(append(easyCompounds, mediumCompounds...), hardCompounds...)
	}
	if len(pool) == 0 {
		return Question{}, false
	}
	rng := mathrand.New(mathrand.NewSource(time.Now().UnixNano()))
	return buildQuestion("practice", pool[rng.Intn(len(pool))], 0), true
}

// ValidateByID looks up the question and checks the selected ions.
func ValidateByID(questions []Question, id string, selected []SelectedIon) (correct bool, answer []SelectedIon, formula string, found bool) {
	for _, q := range questions {
		if q.ID == id {
			return validate(q, selected), q.answer, q.formula, true
		}
	}
	return false, nil, "", false
}

// Score computes the daily score: accuracy (100/q) + speed bonus (max 500).
func Score(correctAnswers int, elapsedMs int64) int {
	speedBonus := int(500 - elapsedMs/1000)
	if speedBonus < 0 {
		speedBonus = 0
	}
	return correctAnswers*100 + speedBonus
}

// XPReward computes XP earned.
func XPReward(score, correctAnswers, totalQuestions int) int {
	xp := 25 + correctAnswers*10
	if correctAnswers == totalQuestions {
		xp += 50
	}
	if score >= 800 {
		xp += 30
	}
	return xp
}

// ── helpers ──────────────────────────────────────────────────────────────────

func buildQuestion(dateStr string, c cmpd, idx int) Question {
	q := Question{
		ID:         fmt.Sprintf("%s_compound_%d", dateStr, idx),
		Name:       c.name,
		Difficulty: c.diff,
		Hint:       c.hint,
		formula:    c.formula,
		answer:     c.answer,
	}
	for _, id := range c.pool {
		if ion, ok := ionMap[id]; ok {
			q.AvailableIons = append(q.AvailableIons, ion)
		}
	}
	return q
}

func validate(q Question, selected []SelectedIon) bool {
	// Filter zeros, then sort both sides by ion ID
	filtered := make([]SelectedIon, 0, len(selected))
	for _, s := range selected {
		if s.Count > 0 {
			filtered = append(filtered, s)
		}
	}
	if len(filtered) != len(q.answer) {
		return false
	}
	sortIons := func(sl []SelectedIon) {
		sort.Slice(sl, func(i, j int) bool { return sl[i].IonID < sl[j].IonID })
	}
	sortIons(filtered)
	ans := make([]SelectedIon, len(q.answer))
	copy(ans, q.answer)
	sortIons(ans)
	for i := range ans {
		if filtered[i].IonID != ans[i].IonID || filtered[i].Count != ans[i].Count {
			return false
		}
	}
	return true
}
