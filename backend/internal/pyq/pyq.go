package pyq

// Question is a previous year exam question.
type Question struct {
	ID           string   `json:"id"`
	Exam         string   `json:"exam"`         // "JEE Main" | "JEE Advanced" | "NEET"
	Year         int      `json:"year"`
	Statement    string   `json:"statement"`    // question text
	Options      []string `json:"options"`
	CorrectIndex int      `json:"correct_index"`
	Explanation  string   `json:"explanation"`
	TopicSlug    string   `json:"-"`
}

var bank = []Question{

	// ─── Physical Chemistry ───────────────────────────────────────────────────

	{
		ID: "pyq_pc_001", Exam: "JEE Main", Year: 2023, TopicSlug: "physical-chemistry",
		Statement:    "Which of the following has the highest molar entropy at 25°C?",
		Options:      []string{"H₂O(l)", "H₂O(g)", "H₂O(s)", "All equal"},
		CorrectIndex: 1,
		Explanation:  "Gases have the highest entropy among the three states of matter.",
	},
	{
		ID: "pyq_pc_002", Exam: "JEE Main", Year: 2022, TopicSlug: "physical-chemistry",
		Statement:    "For the reaction N₂ + 3H₂ ⇌ 2NH₃, if Kp = 1.5 × 10⁻⁵ at 25°C, what is Kc? (R = 0.082 L·atm/mol·K)",
		Options:      []string{"0.037", "6.08 × 10⁻⁴", "1.5 × 10⁻⁵", "3.7"},
		CorrectIndex: 0,
		Explanation:  "Kp = Kc(RT)^Δn; Δn = 2−4 = −2; Kc = Kp/(RT)^(−2) ≈ 0.037.",
	},
	{
		ID: "pyq_pc_003", Exam: "JEE Advanced", Year: 2021, TopicSlug: "physical-chemistry",
		Statement:    "The de Broglie wavelength of a particle moving with velocity v is λ. When the velocity is doubled, the wavelength becomes:",
		Options:      []string{"λ/2", "2λ", "λ/4", "4λ"},
		CorrectIndex: 0,
		Explanation:  "λ = h/mv; doubling v halves λ.",
	},
	{
		ID: "pyq_pc_004", Exam: "NEET", Year: 2023, TopicSlug: "physical-chemistry",
		Statement:    "Which quantum number determines the shape of an orbital?",
		Options:      []string{"Principal (n)", "Azimuthal (l)", "Magnetic (m)", "Spin (s)"},
		CorrectIndex: 1,
		Explanation:  "The azimuthal quantum number l defines the shape: l=0 (s), l=1 (p), l=2 (d).",
	},
	{
		ID: "pyq_pc_005", Exam: "JEE Main", Year: 2021, TopicSlug: "physical-chemistry",
		Statement:    "The work done during an isothermal reversible expansion of an ideal gas from V₁ to V₂ is:",
		Options:      []string{"nRT ln(V₁/V₂)", "nRT ln(V₂/V₁)", "nR(T₂−T₁)", "Zero"},
		CorrectIndex: 1,
		Explanation:  "W = −nRT ln(V₂/V₁) for system; work done by system = nRT ln(V₂/V₁).",
	},
	{
		ID: "pyq_pc_006", Exam: "JEE Advanced", Year: 2022, TopicSlug: "physical-chemistry",
		Statement:    "For a first-order reaction, the half-life is 10 min. What fraction remains after 40 min?",
		Options:      []string{"1/2", "1/4", "1/8", "1/16"},
		CorrectIndex: 3,
		Explanation:  "40 min = 4 half-lives; fraction = (1/2)⁴ = 1/16.",
	},
	{
		ID: "pyq_pc_007", Exam: "NEET", Year: 2022, TopicSlug: "physical-chemistry",
		Statement:    "Which of the following solutions will have the highest boiling point?",
		Options:      []string{"1 M NaCl", "1 M glucose", "1 M CaCl₂", "1 M AlCl₃"},
		CorrectIndex: 3,
		Explanation:  "AlCl₃ → Al³⁺ + 3Cl⁻ gives i=4 particles, the highest van't Hoff factor.",
	},
	{
		ID: "pyq_pc_008", Exam: "JEE Main", Year: 2020, TopicSlug: "physical-chemistry",
		Statement:    "The standard electrode potential of the following half-reaction is most positive for:",
		Options:      []string{"Zn²⁺/Zn (−0.76 V)", "Cu²⁺/Cu (+0.34 V)", "Fe²⁺/Fe (−0.44 V)", "Ag⁺/Ag (+0.80 V)"},
		CorrectIndex: 3,
		Explanation:  "Ag⁺/Ag has E° = +0.80 V, the highest among the options.",
	},
	{
		ID: "pyq_pc_009", Exam: "JEE Advanced", Year: 2020, TopicSlug: "physical-chemistry",
		Statement:    "At STP, the volume of one mole of any ideal gas is approximately:",
		Options:      []string{"22.4 L", "22.7 L", "24.0 L", "11.2 L"},
		CorrectIndex: 0,
		Explanation:  "At STP (0°C, 1 atm), one mole of ideal gas occupies 22.4 L (molar volume).",
	},
	{
		ID: "pyq_pc_010", Exam: "NEET", Year: 2021, TopicSlug: "physical-chemistry",
		Statement:    "According to Hess's law, ΔH for a reaction is:",
		Options:      []string{"Path-dependent", "Path-independent", "Always negative", "Always zero"},
		CorrectIndex: 1,
		Explanation:  "Hess's law states enthalpy change is independent of the path taken.",
	},

	// ─── Organic Chemistry ────────────────────────────────────────────────────

	{
		ID: "pyq_oc_001", Exam: "JEE Main", Year: 2023, TopicSlug: "organic-chemistry",
		Statement:    "Which reagent is used to distinguish between aldehydes and ketones?",
		Options:      []string{"Fehling's solution", "NaOH", "HCl", "H₂SO₄"},
		CorrectIndex: 0,
		Explanation:  "Fehling's solution gives a brick-red precipitate with aldehydes but not ketones.",
	},
	{
		ID: "pyq_oc_002", Exam: "JEE Advanced", Year: 2022, TopicSlug: "organic-chemistry",
		Statement:    "The IUPAC name of CH₃–CH(OH)–CH₂–CH₃ is:",
		Options:      []string{"1-Butanol", "2-Butanol", "3-Butanol", "Sec-butanol"},
		CorrectIndex: 1,
		Explanation:  "OH is on carbon 2 of the 4-carbon chain: butan-2-ol (2-Butanol).",
	},
	{
		ID: "pyq_oc_003", Exam: "NEET", Year: 2023, TopicSlug: "organic-chemistry",
		Statement:    "Which of the following is an electrophilic substitution reaction?",
		Options:      []string{"Halogenation of alkane", "Nitration of benzene", "Hydration of alkene", "Saponification of ester"},
		CorrectIndex: 1,
		Explanation:  "Nitration of benzene (ArH + HNO₃ → ArNO₂) is a classic electrophilic aromatic substitution.",
	},
	{
		ID: "pyq_oc_004", Exam: "JEE Main", Year: 2022, TopicSlug: "organic-chemistry",
		Statement:    "The major product of addition of HBr to propene by Markovnikov's rule is:",
		Options:      []string{"1-Bromopropane", "2-Bromopropane", "1,2-Dibromopropane", "Propan-1-ol"},
		CorrectIndex: 1,
		Explanation:  "H adds to the less-substituted carbon; Br adds to C2 → 2-bromopropane.",
	},
	{
		ID: "pyq_oc_005", Exam: "JEE Advanced", Year: 2021, TopicSlug: "organic-chemistry",
		Statement:    "Which of the following compounds shows optical isomerism?",
		Options:      []string{"CH₂Cl₂", "CHCl₃", "CH₃CHClCH₃", "CH₃CH(OH)COOH"},
		CorrectIndex: 3,
		Explanation:  "Lactic acid (CH₃CH(OH)COOH) has a chiral centre (4 different groups on α-carbon).",
	},
	{
		ID: "pyq_oc_006", Exam: "NEET", Year: 2022, TopicSlug: "organic-chemistry",
		Statement:    "Nylon-6,6 is formed from the polymerisation of:",
		Options:      []string{"Hexamethylenediamine and adipic acid", "Caprolactam", "Ethylene glycol and terephthalic acid", "Styrene and butadiene"},
		CorrectIndex: 0,
		Explanation:  "Nylon-6,6 is a condensation polymer of hexamethylenediamine (6C) and adipic acid (6C).",
	},
	{
		ID: "pyq_oc_007", Exam: "JEE Main", Year: 2021, TopicSlug: "organic-chemistry",
		Statement:    "The functional group present in carboxylic acids is:",
		Options:      []string{"–CHO", "–COOH", "–OH", "–COO–"},
		CorrectIndex: 1,
		Explanation:  "Carboxylic acids contain the –COOH (carboxyl) group.",
	},
	{
		ID: "pyq_oc_008", Exam: "JEE Advanced", Year: 2020, TopicSlug: "organic-chemistry",
		Statement:    "Which of the following is NOT a reducing sugar?",
		Options:      []string{"Glucose", "Fructose", "Sucrose", "Maltose"},
		CorrectIndex: 2,
		Explanation:  "Sucrose has no free anomeric –OH group; it is a non-reducing sugar.",
	},
	{
		ID: "pyq_oc_009", Exam: "NEET", Year: 2021, TopicSlug: "organic-chemistry",
		Statement:    "The reaction of an alcohol with a carboxylic acid in the presence of H₂SO₄ gives:",
		Options:      []string{"Ether", "Ester", "Aldehyde", "Ketone"},
		CorrectIndex: 1,
		Explanation:  "Esterification: R–COOH + R'–OH ⇌ R–COO–R' + H₂O.",
	},
	{
		ID: "pyq_oc_010", Exam: "JEE Main", Year: 2020, TopicSlug: "organic-chemistry",
		Statement:    "Baeyer's reagent (cold dilute KMnO₄) is used to test for:",
		Options:      []string{"Aromatic compounds", "Unsaturation in organic compounds", "Aldehydes", "Carboxylic acids"},
		CorrectIndex: 1,
		Explanation:  "Cold dilute KMnO₄ (Baeyer's reagent) decolourises in the presence of C=C or C≡C bonds.",
	},

	// ─── Inorganic Chemistry ─────────────────────────────────────────────────

	{
		ID: "pyq_ic_001", Exam: "JEE Main", Year: 2023, TopicSlug: "inorganic-chemistry",
		Statement:    "Which of the following is the correct electronic configuration of Fe²⁺?",
		Options:      []string{"[Ar] 3d⁶ 4s²", "[Ar] 3d⁶", "[Ar] 3d⁴ 4s²", "[Ar] 3d⁵ 4s¹"},
		CorrectIndex: 1,
		Explanation:  "Fe is [Ar] 3d⁶ 4s²; Fe²⁺ loses the two 4s electrons → [Ar] 3d⁶.",
	},
	{
		ID: "pyq_ic_002", Exam: "JEE Advanced", Year: 2022, TopicSlug: "inorganic-chemistry",
		Statement:    "Which oxide of nitrogen is used as an anaesthetic?",
		Options:      []string{"NO", "N₂O", "NO₂", "N₂O₅"},
		CorrectIndex: 1,
		Explanation:  "N₂O (nitrous oxide) is commonly called 'laughing gas' and is used as an anaesthetic.",
	},
	{
		ID: "pyq_ic_003", Exam: "NEET", Year: 2023, TopicSlug: "inorganic-chemistry",
		Statement:    "The most electronegative element in the periodic table is:",
		Options:      []string{"Oxygen", "Nitrogen", "Chlorine", "Fluorine"},
		CorrectIndex: 3,
		Explanation:  "Fluorine (F) has the highest electronegativity (3.98 on the Pauling scale).",
	},
	{
		ID: "pyq_ic_004", Exam: "JEE Main", Year: 2022, TopicSlug: "inorganic-chemistry",
		Statement:    "Which of the following compounds exhibits the highest lattice energy?",
		Options:      []string{"NaF", "NaCl", "KCl", "KBr"},
		CorrectIndex: 0,
		Explanation:  "Lattice energy ∝ charge/ionic radii. NaF has the smallest ions, giving the highest lattice energy.",
	},
	{
		ID: "pyq_ic_005", Exam: "JEE Advanced", Year: 2021, TopicSlug: "inorganic-chemistry",
		Statement:    "In which of the following does the central atom have sp³d² hybridisation?",
		Options:      []string{"SF₄", "SF₆", "PCl₅", "BrF₃"},
		CorrectIndex: 1,
		Explanation:  "SF₆ has 6 bonding pairs; S is sp³d² hybridised → octahedral geometry.",
	},
	{
		ID: "pyq_ic_006", Exam: "NEET", Year: 2022, TopicSlug: "inorganic-chemistry",
		Statement:    "The oxidation state of Cr in K₂Cr₂O₇ is:",
		Options:      []string{"+3", "+4", "+6", "+7"},
		CorrectIndex: 2,
		Explanation:  "2K(+1) + 2Cr(x) + 7O(−2) = 0 → 2 + 2x − 14 = 0 → x = +6.",
	},
	{
		ID: "pyq_ic_007", Exam: "JEE Main", Year: 2021, TopicSlug: "inorganic-chemistry",
		Statement:    "Which of the following is a chelating ligand?",
		Options:      []string{"NH₃", "Cl⁻", "EDTA", "H₂O"},
		CorrectIndex: 2,
		Explanation:  "EDTA (ethylenediaminetetraacetic acid) is a hexadentate chelating ligand.",
	},
	{
		ID: "pyq_ic_008", Exam: "JEE Advanced", Year: 2020, TopicSlug: "inorganic-chemistry",
		Statement:    "Which of the following is a diamagnetic species?",
		Options:      []string{"O₂", "NO", "N₂", "NO₂"},
		CorrectIndex: 2,
		Explanation:  "N₂ has all electrons paired in MOs (σ and σ*, π), making it diamagnetic.",
	},
	{
		ID: "pyq_ic_009", Exam: "NEET", Year: 2021, TopicSlug: "inorganic-chemistry",
		Statement:    "The process used for the extraction of aluminium from bauxite is:",
		Options:      []string{"Smelting", "Hall-Héroult process", "Bessemer process", "Thermite process"},
		CorrectIndex: 1,
		Explanation:  "Aluminium is extracted by electrolysis of molten Al₂O₃ in the Hall-Héroult process.",
	},
	{
		ID: "pyq_ic_010", Exam: "JEE Main", Year: 2020, TopicSlug: "inorganic-chemistry",
		Statement:    "Which group of the periodic table contains only non-metals?",
		Options:      []string{"Group 1", "Group 14", "Group 17", "Group 2"},
		CorrectIndex: 2,
		Explanation:  "Group 17 (halogens: F, Cl, Br, I, At) are all non-metals.",
	},
}

// ForTopic returns all PYQ questions for a given topic slug (answers included for internal use).
func ForTopic(topicSlug string) []Question {
	out := make([]Question, 0, 10)
	for _, q := range bank {
		if q.TopicSlug == topicSlug {
			out = append(out, q)
		}
	}
	return out
}

// ForTopicPublic strips CorrectIndex and Explanation for the client-facing response.
func ForTopicPublic(topicSlug string) []Question {
	src := ForTopic(topicSlug)
	out := make([]Question, len(src))
	for i, q := range src {
		q.CorrectIndex = -1
		out[i] = q
	}
	return out
}
