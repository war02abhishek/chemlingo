package duel

// LoadEquations returns the seeded equation bank.
// Easy equations are served in round 1, medium in round 2, hard in round 3.
// Add more entries here as the content library grows.
func LoadEquations() []Equation {
	return []Equation{
		{
			ID:           "eq_h2o",
			Raw:          "2 H₂ + O₂ → 2 H₂O",
			Display:      "H₂ + O₂ → H₂O",
			Labels:       []string{"H₂", "O₂", "H₂O"},
			SeparatorIdx: 2, // → before slot 2 (product side)
			Answers:      []int{2, 1, 2},
			Difficulty:   "easy",
			ChipMax:      6,
		},
		{
			ID:           "eq_nh3",
			Raw:          "N₂ + 3 H₂ → 2 NH₃",
			Display:      "N₂ + H₂ → NH₃",
			Labels:       []string{"N₂", "H₂", "NH₃"},
			SeparatorIdx: 2,
			Answers:      []int{1, 3, 2},
			Difficulty:   "easy",
			ChipMax:      6,
		},
		{
			ID:           "eq_fe2o3",
			Raw:          "4 Fe + 3 O₂ → 2 Fe₂O₃",
			Display:      "Fe + O₂ → Fe₂O₃",
			Labels:       []string{"Fe", "O₂", "Fe₂O₃"},
			SeparatorIdx: 2,
			Answers:      []int{4, 3, 2},
			Difficulty:   "medium",
			ChipMax:      6,
		},
		{
			ID:           "eq_alcl3",
			Raw:          "2 Al + 6 HCl → 2 AlCl₃ + 3 H₂",
			Display:      "Al + HCl → AlCl₃ + H₂",
			Labels:       []string{"Al", "HCl", "AlCl₃", "H₂"},
			SeparatorIdx: 2,
			Answers:      []int{2, 6, 2, 3},
			Difficulty:   "medium",
			ChipMax:      8,
		},
		{
			// Combustion of propane: C₃H₈ + 5 O₂ → 3 CO₂ + 4 H₂O
			ID:           "eq_propane",
			Raw:          "C₃H₈ + 5 O₂ → 3 CO₂ + 4 H₂O",
			Display:      "C₃H₈ + O₂ → CO₂ + H₂O",
			Labels:       []string{"C₃H₈", "O₂", "CO₂", "H₂O"},
			SeparatorIdx: 2,
			Answers:      []int{1, 5, 3, 4},
			Difficulty:   "hard",
			ChipMax:      6,
		},
	}
}
