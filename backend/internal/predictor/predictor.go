package predictor

import (
	"hash/fnv"
	"math/rand"
)

type Question struct {
	ID           string   `json:"id"`
	Prompt       string   `json:"prompt"`        // full display e.g. "H₂ + Cl₂ → (UV light)"
	Reactants    string   `json:"reactants"`     // left of arrow e.g. "H₂ + Cl₂"
	Condition    string   `json:"condition"`     // catalyst/condition e.g. "UV light" or ""
	Concept      string   `json:"concept"`       // topic chip label
	Options      []string `json:"options"`       // 4 choices
	CorrectIndex int      `json:"correct_index"` // included for educational feedback
	TopicSlug    string   `json:"-"`
}

// All reaction predictor questions
var allQuestions = []Question{
	// Physical Chemistry
	{ID: "rp_h2_cl2", Prompt: "H₂ + Cl₂ →", Reactants: "H₂ + Cl₂", Condition: "", Concept: "Combination", Options: []string{"HCl", "H₂Cl", "HCl₂", "H₂Cl₂"}, CorrectIndex: 0, TopicSlug: "physical-chemistry"},
	{ID: "rp_na_h2o", Prompt: "2Na + 2H₂O →", Reactants: "2Na + 2H₂O", Condition: "", Concept: "Metal + water", Options: []string{"Na₂O + H₂", "2NaOH + H₂", "Na₂O₂ + H₂", "NaH + H₂O"}, CorrectIndex: 1, TopicSlug: "physical-chemistry"},
	{ID: "rp_ca_o2", Prompt: "2Ca + O₂ →", Reactants: "2Ca + O₂", Condition: "", Concept: "Oxidation", Options: []string{"Ca₂O", "CaO₂", "2CaO", "Ca₂O₂"}, CorrectIndex: 2, TopicSlug: "physical-chemistry"},
	{ID: "rp_hcl_naoh", Prompt: "HCl + NaOH →", Reactants: "HCl + NaOH", Condition: "", Concept: "Neutralisation", Options: []string{"NaCl + H₂O", "Na + HClO", "NaH + ClOH", "NaOCl + H₂"}, CorrectIndex: 0, TopicSlug: "physical-chemistry"},
	{ID: "rp_mg_o2", Prompt: "2Mg + O₂ →", Reactants: "2Mg + O₂", Condition: "", Concept: "Combustion", Options: []string{"MgO₂", "Mg₂O", "2MgO", "Mg₂O₂"}, CorrectIndex: 2, TopicSlug: "physical-chemistry"},
	{ID: "rp_h2so4_naoh", Prompt: "H₂SO₄ + 2NaOH →", Reactants: "H₂SO₄ + 2NaOH", Condition: "", Concept: "Acid-base", Options: []string{"Na₂SO₄ + H₂O", "Na₂SO₄ + 2H₂O", "NaSO₄ + H₂O", "Na₂SO₃ + 2H₂O"}, CorrectIndex: 1, TopicSlug: "physical-chemistry"},
	{ID: "rp_zn_hcl", Prompt: "Zn + 2HCl →", Reactants: "Zn + 2HCl", Condition: "", Concept: "Displacement", Options: []string{"ZnCl + H₂", "ZnCl₂ + H₂", "ZnH₂ + Cl₂", "ZnCl₂ + H₂O"}, CorrectIndex: 1, TopicSlug: "physical-chemistry"},
	{ID: "rp_fe_s", Prompt: "Fe + S →", Reactants: "Fe + S", Condition: "heat Δ", Concept: "Combination", Options: []string{"FeSO₄", "FeS", "Fe₂S", "FeS₂"}, CorrectIndex: 1, TopicSlug: "physical-chemistry"},

	// Organic Chemistry
	{ID: "rp_ch4_cl2", Prompt: "CH₄ + Cl₂ → (UV light)", Reactants: "CH₄ + Cl₂", Condition: "UV light", Concept: "Free radical", Options: []string{"CHCl₃", "CH₃Cl + HCl", "CCl₄", "CH₂Cl₂ + H₂"}, CorrectIndex: 1, TopicSlug: "organic-chemistry"},
	{ID: "rp_ethene_h2", Prompt: "CH₂=CH₂ + H₂ →", Reactants: "CH₂=CH₂ + H₂", Condition: "Ni catalyst", Concept: "Hydrogenation", Options: []string{"CH₃CHO", "CH₃CH₃", "CH₂CH₂H₂", "C₂H₄"}, CorrectIndex: 1, TopicSlug: "organic-chemistry"},
	{ID: "rp_ethanol_oxidation", Prompt: "C₂H₅OH + [O] →", Reactants: "C₂H₅OH + [O]", Condition: "", Concept: "Oxidation", Options: []string{"CH₃COOH", "C₂H₄", "CH₃CHO", "C₂H₆"}, CorrectIndex: 2, TopicSlug: "organic-chemistry"},
	{ID: "rp_ester_form", Prompt: "CH₃COOH + C₂H₅OH →", Reactants: "CH₃COOH + C₂H₅OH", Condition: "H⁺ catalyst", Concept: "Esterification", Options: []string{"CH₃COOC₂H₅ + H₂O", "CH₃COC₂H₅ + H₂", "CH₃OHC₂H₅ + CO₂", "C₂H₅COOCH₃ + H₂O"}, CorrectIndex: 0, TopicSlug: "organic-chemistry"},
	{ID: "rp_propene_hbr", Prompt: "CH₃CH=CH₂ + HBr →", Reactants: "CH₃CH=CH₂ + HBr", Condition: "Markovnikov", Concept: "Addition", Options: []string{"CH₃CH₂CH₂Br", "CH₃CHBrCH₃", "CH₂BrCH=CH₂", "CH₃CH₂CHBr₂"}, CorrectIndex: 1, TopicSlug: "organic-chemistry"},
	{ID: "rp_benzene_nitration", Prompt: "C₆H₆ + HNO₃ →", Reactants: "C₆H₆ + HNO₃", Condition: "H₂SO₄ catalyst", Concept: "Nitration", Options: []string{"C₆H₅NO₂ + H₂O", "C₆H₅OH + NO₂", "C₆H₆NO₃ + H", "C₆H₄NO₂ + H₂"}, CorrectIndex: 0, TopicSlug: "organic-chemistry"},
	{ID: "rp_alkene_combustion", Prompt: "C₂H₄ + 3O₂ →", Reactants: "C₂H₄ + 3O₂", Condition: "", Concept: "Combustion", Options: []string{"2CO + 2H₂O", "2CO₂ + 2H₂O", "CO₂ + H₂O", "2CO₂ + 4H₂O"}, CorrectIndex: 1, TopicSlug: "organic-chemistry"},
	{ID: "rp_saponification", Prompt: "Fat + NaOH →", Reactants: "Fat + NaOH", Condition: "saponification", Concept: "Saponification", Options: []string{"Soap + Glycerol", "Fatty acid + Na", "Ester + Water", "Soap + CO₂"}, CorrectIndex: 0, TopicSlug: "organic-chemistry"},

	// Inorganic Chemistry
	{ID: "rp_fe_cuso4", Prompt: "Fe + CuSO₄ →", Reactants: "Fe + CuSO₄", Condition: "", Concept: "Displacement", Options: []string{"FeSO₄ + Cu", "Fe₂SO₄ + Cu₂", "Fe(SO₄)₂ + Cu", "FeO + CuS"}, CorrectIndex: 0, TopicSlug: "inorganic-chemistry"},
	{ID: "rp_cl2_naoh", Prompt: "Cl₂ + 2NaOH →", Reactants: "Cl₂ + 2NaOH", Condition: "", Concept: "Disproportionation", Options: []string{"NaCl + NaClO + H₂O", "2NaCl + H₂O₂", "NaClO₂ + H₂", "Na₂ClO + H₂O"}, CorrectIndex: 0, TopicSlug: "inorganic-chemistry"},
	{ID: "rp_cu_hno3_conc", Prompt: "Cu + 4HNO₃ (conc) →", Reactants: "Cu + 4HNO₃", Condition: "concentrated", Concept: "Oxidation", Options: []string{"Cu(NO₃)₂ + 2NO₂ + 2H₂O", "CuNO₃ + NO₂ + H₂O", "Cu(NO₃)₂ + NO + H₂O", "CuO + N₂ + H₂O"}, CorrectIndex: 0, TopicSlug: "inorganic-chemistry"},
	{ID: "rp_al_naoh", Prompt: "2Al + 2NaOH + 2H₂O →", Reactants: "2Al + 2NaOH + 2H₂O", Condition: "", Concept: "Amphoteric", Options: []string{"Al₂O₃ + NaH + H₂", "2NaAlO₂ + 3H₂", "Al(OH)₃ + NaH", "Al₂(OH)₃ + H₂"}, CorrectIndex: 1, TopicSlug: "inorganic-chemistry"},
	{ID: "rp_kclo3_heat", Prompt: "2KClO₃ →", Reactants: "2KClO₃", Condition: "MnO₂, heat", Concept: "Decomposition", Options: []string{"2KCl + 3O₂", "K₂O + Cl₂ + 3O", "KClO + O₂", "KCl + ClO₂ + O"}, CorrectIndex: 0, TopicSlug: "inorganic-chemistry"},
	{ID: "rp_n2_h2", Prompt: "N₂ + 3H₂ →", Reactants: "N₂ + 3H₂", Condition: "Haber process", Concept: "Synthesis", Options: []string{"N₂H₃", "2NH₃", "NH₄", "2NH₂"}, CorrectIndex: 1, TopicSlug: "inorganic-chemistry"},
	{ID: "rp_so2_o2", Prompt: "2SO₂ + O₂ →", Reactants: "2SO₂ + O₂", Condition: "V₂O₅ catalyst", Concept: "Contact process", Options: []string{"SO₃", "2SO₃", "S₂O₅", "2SO₂O"}, CorrectIndex: 1, TopicSlug: "inorganic-chemistry"},
	{ID: "rp_pb_pbo2", Prompt: "Pb + PbO₂ + 2H₂SO₄ →", Reactants: "Pb + PbO₂ + 2H₂SO₄", Condition: "lead cell", Concept: "Electrochemistry", Options: []string{"2PbSO₄ + 2H₂O", "PbSO₃ + H₂O + O₂", "2Pb + H₂SO₃", "Pb₂O₃ + H₂"}, CorrectIndex: 0, TopicSlug: "inorganic-chemistry"},
	{ID: "rp_caco3_heat", Prompt: "CaCO₃ →", Reactants: "CaCO₃", Condition: "heat Δ", Concept: "Decomposition", Options: []string{"CaO + CO₂", "Ca + CO₃", "Ca(OH)₂ + CO", "CaCO + O₂"}, CorrectIndex: 0, TopicSlug: "inorganic-chemistry"},
	{ID: "rp_fe2o3_co", Prompt: "Fe₂O₃ + 3CO →", Reactants: "Fe₂O₃ + 3CO", Condition: "blast furnace", Concept: "Reduction", Options: []string{"2Fe + 3CO₂", "FeO + CO₂", "Fe + 3CO₂", "2Fe₃O₄ + CO₂"}, CorrectIndex: 0, TopicSlug: "inorganic-chemistry"},
}

// seed returns a deterministic seed from a string key (lesson ID or date).
func seed(key string) int64 {
	h := fnv.New32a()
	h.Write([]byte(key))
	return int64(h.Sum32())
}

// ForLesson returns 5 questions for a lesson, seeded by lesson ID.
// correct_index is included to support the educational check/feedback UI.
func ForLesson(lessonID string) []Question {
	rng := rand.New(rand.NewSource(seed(lessonID)))
	perm := rng.Perm(len(allQuestions))
	result := make([]Question, 0, 5)
	for _, i := range perm[:5] {
		result = append(result, allQuestions[i])
	}
	return result
}

// ForLessonWithAnswers returns questions with answers intact for server-side validation.
func ForLessonWithAnswers(lessonID string) []Question {
	rng := rand.New(rand.NewSource(seed(lessonID)))
	perm := rng.Perm(len(allQuestions))
	result := make([]Question, 0, 5)
	for _, i := range perm[:5] {
		result = append(result, allQuestions[i])
	}
	return result
}

// ForBoss returns 10 questions for a Boss Battle, seeded by topic ID.
func ForBoss(topicID string) []Question {
	rng := rand.New(rand.NewSource(seed("boss:" + topicID)))
	perm := rng.Perm(len(allQuestions))
	count := 10
	if len(allQuestions) < count {
		count = len(allQuestions)
	}
	result := make([]Question, 0, count)
	for _, i := range perm[:count] {
		result = append(result, allQuestions[i])
	}
	return result
}

// ForBossWithAnswers returns 10 boss battle questions with answers for server-side validation.
func ForBossWithAnswers(topicID string) []Question {
	return ForBoss(topicID)
}

// ForPractice returns one random question (different each call).
func ForPractice() Question {
	q := allQuestions[rand.Intn(len(allQuestions))]
	q.CorrectIndex = -1
	return q
}

// ValidateAnswer checks if selectedIndex is correct for the given question ID.
func ValidateAnswer(lessonID, questionID string, selectedIndex int) (correct bool, correctIndex int, found bool) {
	questions := ForLessonWithAnswers(lessonID)
	for _, q := range questions {
		if q.ID == questionID {
			return selectedIndex == q.CorrectIndex, q.CorrectIndex, true
		}
	}
	return false, 0, false
}

// Score computes lesson score: 100 per correct answer + speed bonus.
func Score(correct int, elapsedMs int64) int {
	base := correct * 100
	elapsedSecs := elapsedMs / 1000
	speedBonus := max64(0, 300-elapsedSecs) * int64(correct) / 5
	return base + int(speedBonus)
}

// XPReward computes XP earned.
func XPReward(score, correct, total int) int {
	xp := 25 + correct*10
	if correct == total {
		xp += 50
	}
	if score > 600 {
		xp += 30
	}
	return xp
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
