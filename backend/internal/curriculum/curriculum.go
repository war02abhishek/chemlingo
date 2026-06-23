package curriculum

import (
	"context"

	"github.com/chemlingo/backend/internal/store"
)

type topicDef struct {
	slug         string
	title        string
	icon         string
	position     int
	totalLessons int
}

type lessonDef struct {
	topicSlug   string
	slug        string
	title       string
	position    int
	gameMode    string
	conceptText string
	xpReward    int
	coinReward  int
}

var topics = []topicDef{
	{"physical-chemistry", "Physical Chemistry", "⚗️", 1, 5},
	{"organic-chemistry", "Organic Chemistry", "🧬", 2, 5},
	{"inorganic-chemistry", "Inorganic Chemistry", "🔩", 3, 5},
}

var lessons = []lessonDef{
	// Physical Chemistry
	{
		topicSlug:   "physical-chemistry",
		slug:        "states-of-matter",
		title:       "States of Matter",
		position:    1,
		gameMode:    "reaction_predictor",
		conceptText: "Matter exists in three primary states: solid, liquid, and gas. In a solid, particles are tightly packed in a fixed arrangement. In a liquid, particles can flow but remain close together. In a gas, particles are far apart and move freely.\n\nKey concepts: intermolecular forces, pressure, temperature, and the ideal gas law PV = nRT.",
		xpReward:    50,
		coinReward:  10,
	},
	{
		topicSlug:   "physical-chemistry",
		slug:        "atomic-structure",
		title:       "Atomic Structure",
		position:    2,
		gameMode:    "reaction_predictor",
		conceptText: "An atom consists of a nucleus (protons + neutrons) surrounded by electrons in energy shells. The atomic number (Z) equals the number of protons. The mass number (A) equals protons + neutrons.\n\nElectron configuration follows the Aufbau principle: electrons fill the lowest available energy level first.",
		xpReward:    50,
		coinReward:  10,
	},
	{
		topicSlug:   "physical-chemistry",
		slug:        "chemical-bonding",
		title:       "Chemical Bonding",
		position:    3,
		gameMode:    "reaction_predictor",
		conceptText: "Atoms form bonds to achieve a stable electron configuration (usually a full outer shell — the octet rule).\n\n• Ionic bonds: electron transfer between a metal and non-metal, forming oppositely charged ions.\n• Covalent bonds: electron sharing between non-metals.\n• Metallic bonds: a sea of delocalized electrons between metal cations.",
		xpReward:    60,
		coinReward:  12,
	},
	{
		topicSlug:   "physical-chemistry",
		slug:        "thermodynamics",
		title:       "Thermodynamics",
		position:    4,
		gameMode:    "reaction_predictor",
		conceptText: "Thermodynamics deals with energy changes in chemical reactions.\n\n• Enthalpy (ΔH): heat absorbed or released at constant pressure. Exothermic: ΔH < 0. Endothermic: ΔH > 0.\n• Hess's Law: the total enthalpy change is independent of the pathway.\n• Gibbs free energy: ΔG = ΔH − TΔS. Spontaneous when ΔG < 0.",
		xpReward:    60,
		coinReward:  12,
	},
	{
		topicSlug:   "physical-chemistry",
		slug:        "electrochemistry",
		title:       "Electrochemistry",
		position:    5,
		gameMode:    "reaction_predictor",
		conceptText: "Electrochemistry links electrical energy and chemical reactions.\n\n• Oxidation: loss of electrons (OIL — Oxidation Is Loss).\n• Reduction: gain of electrons (RIG — Reduction Is Gain).\n• Electrochemical cells convert chemical energy to electrical energy. The standard electrode potential (E°) determines the cell voltage.",
		xpReward:    70,
		coinReward:  14,
	},

	// Organic Chemistry
	{
		topicSlug:   "organic-chemistry",
		slug:        "hydrocarbons",
		title:       "Hydrocarbons",
		position:    1,
		gameMode:    "reaction_predictor",
		conceptText: "Hydrocarbons contain only carbon and hydrogen.\n\n• Alkanes (CₙH₂ₙ₊₂): single bonds only, saturated. Example: methane (CH₄).\n• Alkenes (CₙH₂ₙ): one double bond, unsaturated. Example: ethene (C₂H₄).\n• Alkynes (CₙH₂ₙ₋₂): one triple bond. Example: ethyne (C₂H₂).\n• Aromatic: contain benzene ring (C₆H₆).",
		xpReward:    50,
		coinReward:  10,
	},
	{
		topicSlug:   "organic-chemistry",
		slug:        "functional-groups",
		title:       "Functional Groups",
		position:    2,
		gameMode:    "reaction_predictor",
		conceptText: "Functional groups determine a molecule's chemical properties.\n\n• –OH (hydroxyl): alcohols\n• –COOH (carboxyl): carboxylic acids\n• –NH₂ (amino): amines\n• –CHO (aldehyde): aldehydes\n• C=O (carbonyl in chain): ketones\n• –COOR (ester linkage): esters",
		xpReward:    50,
		coinReward:  10,
	},
	{
		topicSlug:   "organic-chemistry",
		slug:        "organic-reactions",
		title:       "Organic Reactions",
		position:    3,
		gameMode:    "reaction_predictor",
		conceptText: "Key organic reaction types:\n\n• Addition: reactant adds across a double or triple bond (alkenes + HBr → haloalkane).\n• Substitution: atom/group replaced by another (alkane + Cl₂ → haloalkane + HCl).\n• Elimination: small molecule removed, forming a double bond.\n• Condensation: two molecules join with loss of water (forming esters, peptide bonds).",
		xpReward:    60,
		coinReward:  12,
	},
	{
		topicSlug:   "organic-chemistry",
		slug:        "polymers",
		title:       "Polymers",
		position:    4,
		gameMode:    "reaction_predictor",
		conceptText: "Polymers are long-chain molecules formed by repeated monomer units.\n\n• Addition polymerisation: monomers with double bonds link together (polyethylene from ethene).\n• Condensation polymerisation: monomers join with elimination of a small molecule such as water (nylon, polyester).\n\nBiopolymers: proteins (amino acids), DNA (nucleotides), starch (glucose).",
		xpReward:    60,
		coinReward:  12,
	},
	{
		topicSlug:   "organic-chemistry",
		slug:        "biomolecules",
		title:       "Biomolecules",
		position:    5,
		gameMode:    "reaction_predictor",
		conceptText: "Biological molecules are the building blocks of life.\n\n• Carbohydrates: CₙH₂ₙOₙ, energy source. Monosaccharides (glucose), disaccharides (sucrose), polysaccharides (starch, cellulose).\n• Proteins: amino acid polymers. Four levels of structure. Enzymes are proteins.\n• Lipids: fats and oils. Triglycerides formed by esterification of glycerol with fatty acids.\n• Nucleic acids: DNA stores genetic information; RNA carries instructions.",
		xpReward:    70,
		coinReward:  14,
	},

	// Inorganic Chemistry
	{
		topicSlug:   "inorganic-chemistry",
		slug:        "periodic-table",
		title:       "Periodic Table",
		position:    1,
		gameMode:    "reaction_predictor",
		conceptText: "The periodic table arranges elements by increasing atomic number. Elements in the same group share similar valence electron configurations and chemical properties.\n\nPeriodic trends:\n• Atomic radius decreases across a period (more protons pull electrons closer).\n• Ionisation energy increases across a period.\n• Electronegativity increases across a period and up a group.",
		xpReward:    50,
		coinReward:  10,
	},
	{
		topicSlug:   "inorganic-chemistry",
		slug:        "s-block",
		title:       "s-Block Elements",
		position:    2,
		gameMode:    "reaction_predictor",
		conceptText: "s-Block elements (Groups 1 and 2) have their outermost electrons in s-orbitals.\n\n• Group 1 (alkali metals): very reactive, form +1 ions, react vigorously with water producing H₂ and an alkaline solution.\n• Group 2 (alkaline earth metals): less reactive than Group 1, form +2 ions. Calcium reacts with water more slowly than sodium.",
		xpReward:    50,
		coinReward:  10,
	},
	{
		topicSlug:   "inorganic-chemistry",
		slug:        "p-block",
		title:       "p-Block Elements",
		position:    3,
		gameMode:    "reaction_predictor",
		conceptText: "p-Block elements (Groups 13–18) have their outermost electrons in p-orbitals.\n\nIncludes metals, metalloids, and non-metals. Notable groups:\n• Group 17 (halogens): highly electronegative, form –1 ions, exist as diatomic molecules.\n• Group 18 (noble gases): full outer shells, generally unreactive.\n• Oxides of non-metals are acidic; oxides of metals are basic.",
		xpReward:    60,
		coinReward:  12,
	},
	{
		topicSlug:   "inorganic-chemistry",
		slug:        "d-block",
		title:       "d-Block Elements",
		position:    4,
		gameMode:    "reaction_predictor",
		conceptText: "d-Block (transition metals, Groups 3–12) have electrons filling d-orbitals.\n\nKey characteristics:\n• Variable oxidation states (Fe²⁺/Fe³⁺, Cu⁺/Cu²⁺).\n• Form coloured compounds and complex ions.\n• Good catalysts (Fe in Haber process, V₂O₅ in Contact process).\n• Often paramagnetic due to unpaired d-electrons.",
		xpReward:    60,
		coinReward:  12,
	},
	{
		topicSlug:   "inorganic-chemistry",
		slug:        "coordination-compounds",
		title:       "Coordination Compounds",
		position:    5,
		gameMode:    "reaction_predictor",
		conceptText: "Coordination compounds have a central metal ion surrounded by ligands (electron-pair donors).\n\n• Coordination number: number of ligand atoms bonded to the central ion.\n• Ligands: monodentate (NH₃, Cl⁻), bidentate (en, oxalate), polydentate (EDTA).\n• Nomenclature: ligands named first, then metal with oxidation state.\n• Crystal field theory explains colour and magnetic properties.",
		xpReward:    70,
		coinReward:  14,
	},
}

// SeedTopics upserts all hardcoded topics and lessons into the database.
// Safe to call on every startup — uses ON CONFLICT DO UPDATE.
func SeedTopics(ctx context.Context, s *store.Store) error {
	for _, t := range topics {
		if err := s.UpsertTopic(ctx, t.slug, t.title, t.icon, t.position, t.totalLessons); err != nil {
			return err
		}
	}
	for _, l := range lessons {
		if err := s.UpsertLesson(ctx, l.topicSlug, l.slug, l.title, l.position, l.gameMode, l.conceptText, l.xpReward, l.coinReward); err != nil {
			return err
		}
	}
	return nil
}
