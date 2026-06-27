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

// NEET Chemistry syllabus — Class 11 + 12 NCERT aligned.
// 7 topics × 3 lessons = 21 lessons total.

var topics = []topicDef{
	{"atomic-structure-periodicity", "Atomic Structure & Periodicity", "⚛️", 1, 3},
	{"physical-chemistry-1",        "Mole, Matter & Solutions",        "🧮", 2, 3},
	{"physical-chemistry-2",        "Thermodynamics & Equilibrium",    "🌡️", 3, 3},
	{"physical-chemistry-3",        "Electrochemistry & Kinetics",     "⚡", 4, 3},
	{"inorganic-chemistry",         "Inorganic Chemistry",             "🔩", 5, 3},
	{"organic-chemistry-1",         "Organic Chemistry I",             "🧪", 6, 3},
	{"organic-chemistry-2",         "Organic Chemistry II",            "🧬", 7, 3},
}

var lessons = []lessonDef{

	// ── Topic 1: Atomic Structure & Periodicity ──────────────────────────────
	{
		topicSlug: "atomic-structure-periodicity",
		slug:      "atomic-structure",
		title:     "Atomic Structure",
		position:  1,
		gameMode:  "periodic_sprint",
		conceptText: `An atom consists of a nucleus (protons + neutrons) surrounded by electrons in orbitals.

Key points:
• Atomic number (Z) = number of protons = number of electrons in a neutral atom
• Mass number (A) = protons + neutrons
• Isotopes have the same Z but different A

Quantum model: electrons occupy orbitals (s, p, d, f). Fill lowest energy first (Aufbau), max 2 electrons per orbital with opposite spins (Pauli), fill each sublevel singly before pairing (Hund's rule).

NEET tip: electronic configuration of Cr ([Ar] 3d⁵ 4s¹) and Cu ([Ar] 3d¹⁰ 4s¹) are exceptions — extra stability of half-filled and fully-filled d-orbitals.`,
		xpReward:   50,
		coinReward: 10,
	},
	{
		topicSlug: "atomic-structure-periodicity",
		slug:      "periodic-table-trends",
		title:     "Periodic Table & Trends",
		position:  2,
		gameMode:  "periodic_sprint",
		conceptText: `The modern periodic table arranges 118 elements by increasing atomic number. Elements in the same group (vertical column) have the same valence electron configuration and similar properties.

Key periodic trends (across a period, left → right):
• Atomic radius decreases (more protons attract electrons closer)
• Ionisation energy increases
• Electronegativity increases
• Electron affinity generally increases

Down a group:
• Atomic radius increases (more electron shells)
• Ionisation energy decreases
• Metallic character increases

NEET tip: know the blocks — s-block (Groups 1-2), p-block (Groups 13-18), d-block (Groups 3-12), f-block (lanthanides & actinides).`,
		xpReward:   50,
		coinReward: 10,
	},
	{
		topicSlug: "atomic-structure-periodicity",
		slug:      "chemical-bonding",
		title:     "Chemical Bonding",
		position:  3,
		gameMode:  "compound_builder",
		conceptText: `Atoms bond to achieve a stable electron configuration (octet rule).

Types of bonds:
• Ionic bond: electron transfer from metal to non-metal. NaCl — Na gives e⁻ to Cl.
• Covalent bond: electron sharing between non-metals. H₂O, CO₂.
• Coordinate bond: one atom donates both electrons (e.g. NH₄⁺, BF₃·NH₃).
• Metallic bond: sea of delocalised electrons.

VSEPR theory predicts molecular shapes based on electron pairs:
• 2 bond pairs → linear (CO₂)
• 3 bond pairs → trigonal planar (BF₃)
• 4 bond pairs → tetrahedral (CH₄)
• Lone pairs compress bond angles (H₂O is 104.5°, not 109.5°)

NEET tip: polarity depends on both bond polarity and molecular geometry. CO₂ is non-polar despite polar bonds.`,
		xpReward:   60,
		coinReward: 12,
	},

	// ── Topic 2: Mole, Matter & Solutions ───────────────────────────────────
	{
		topicSlug: "physical-chemistry-1",
		slug:      "mole-concept-stoichiometry",
		title:     "Mole Concept & Stoichiometry",
		position:  1,
		gameMode:  "reaction_predictor",
		conceptText: `1 mole = 6.022 × 10²³ particles (Avogadro's number). Molar mass = mass of 1 mole in grams.

Stoichiometry uses balanced equations to find amounts of reactants/products:
• Moles = mass / molar mass
• At STP: 1 mole of any gas = 22.4 L

Limiting reagent: the reactant that runs out first and determines product yield.

% yield = (actual yield / theoretical yield) × 100

Empirical formula: simplest whole-number ratio of atoms.
Molecular formula = n × empirical formula, where n = molecular mass / empirical formula mass.

NEET tip: always balance the equation first, then apply mole ratios from the stoichiometric coefficients.`,
		xpReward:   50,
		coinReward: 10,
	},
	{
		topicSlug: "physical-chemistry-1",
		slug:      "states-of-matter",
		title:     "States of Matter",
		position:  2,
		gameMode:  "reaction_predictor",
		conceptText: `Matter exists as solid, liquid, or gas depending on intermolecular forces vs kinetic energy.

Ideal Gas Law: PV = nRT (R = 8.314 J mol⁻¹ K⁻¹)
• Boyle's Law: P ∝ 1/V (constant T)
• Charles's Law: V ∝ T (constant P)
• Avogadro's Law: V ∝ n (constant T, P)

Real gases deviate from ideal behaviour at high pressure and low temperature. Van der Waals equation corrects for intermolecular attractions and finite molecular volume:
(P + a/V²)(V − b) = nRT

Liquids: surface tension, viscosity, vapour pressure. Boiling occurs when vapour pressure = atmospheric pressure.

NEET tip: at high pressure or low temperature, real gases show more deviation — Z (compressibility factor) ≠ 1.`,
		xpReward:   50,
		coinReward: 10,
	},
	{
		topicSlug: "physical-chemistry-1",
		slug:      "solutions-colligative-properties",
		title:     "Solutions & Colligative Properties",
		position:  3,
		gameMode:  "reaction_predictor",
		conceptText: `A solution is a homogeneous mixture. Solubility depends on temperature (solids usually increase with T; gases decrease with T).

Concentration units:
• Molarity (M) = moles of solute / litres of solution
• Molality (m) = moles of solute / kg of solvent
• Mole fraction (χ) = moles of component / total moles

Colligative properties depend only on the number of solute particles:
• Relative lowering of vapour pressure: ΔP/P° = χ₂
• Elevation of boiling point: ΔTb = Kb × m
• Depression of freezing point: ΔTf = Kf × m
• Osmotic pressure: π = MRT

NEET tip: for electrolytes, use the van't Hoff factor i (e.g. NaCl → i = 2, CaCl₂ → i = 3) to multiply colligative properties.`,
		xpReward:   60,
		coinReward: 12,
	},

	// ── Topic 3: Thermodynamics & Equilibrium ────────────────────────────────
	{
		topicSlug: "physical-chemistry-2",
		slug:      "thermodynamics",
		title:     "Thermodynamics",
		position:  1,
		gameMode:  "reaction_predictor",
		conceptText: `Thermodynamics studies energy changes in chemical and physical processes.

First Law: ΔU = q + w (energy is conserved)
• At constant pressure: ΔH = ΔU + PΔV = q_p

Enthalpy (ΔH):
• Exothermic: ΔH < 0 (heat released)
• Endothermic: ΔH > 0 (heat absorbed)
• Hess's Law: ΔH is independent of pathway

Entropy (ΔS): measure of disorder. Spontaneous processes increase total entropy of universe.

Gibbs Free Energy: ΔG = ΔH − TΔS
• ΔG < 0 → spontaneous
• ΔG = 0 → equilibrium
• ΔG > 0 → non-spontaneous

NEET tip: a reaction can be spontaneous even if endothermic, provided TΔS > ΔH (high T, large ΔS).`,
		xpReward:   60,
		coinReward: 12,
	},
	{
		topicSlug: "physical-chemistry-2",
		slug:      "chemical-equilibrium",
		title:     "Chemical Equilibrium",
		position:  2,
		gameMode:  "reaction_predictor",
		conceptText: `At equilibrium, rates of forward and reverse reactions are equal. Concentrations remain constant (not necessarily equal).

Equilibrium constant Kc = [products]^stoich / [reactants]^stoich (molar concentrations)
Kp uses partial pressures. Kp = Kc(RT)^Δn

Le Chatelier's Principle: if a system at equilibrium is disturbed, it shifts to counteract the change.
• Add reactant → shifts forward
• Increase pressure → shifts toward fewer moles of gas
• Increase temperature → shifts in endothermic direction

Ionic equilibrium:
• Weak acids: Ka = [H⁺][A⁻] / [HA]
• pH = −log[H⁺]
• Buffer: resists pH change (weak acid + its salt)

NEET tip: Kc > 1 means products are favoured; Kc < 1 means reactants are favoured at equilibrium.`,
		xpReward:   60,
		coinReward: 12,
	},
	{
		topicSlug: "physical-chemistry-2",
		slug:      "solid-state-surface-chemistry",
		title:     "Solid State & Surface Chemistry",
		position:  3,
		gameMode:  "compound_builder",
		conceptText: `Solid State:
Crystalline solids have a regular, repeating 3D arrangement. Unit cells are the smallest repeating unit.
• Cubic: simple (1 atom), BCC (2 atoms), FCC/CCP (4 atoms)
• Packing efficiency: FCC = 74%, BCC = 68%, simple = 52%
• Defects: Schottky (missing ions), Frenkel (displaced ions)

Properties: semiconductors, magnetic behaviour, electrical conductivity depend on crystal type.

Surface Chemistry:
• Adsorption: accumulation of molecules on a surface (physi- vs chemi-sorption)
• Catalysis: lowers activation energy. Homogeneous (same phase), heterogeneous (different phase)
• Colloids: 1–1000 nm particles. Tyndall effect, Brownian motion, electrophoresis.
• Types: sols, gels, emulsions, aerosols

NEET tip: in FCC, radius ratio r/R = 0.414 for octahedral voids and 0.225 for tetrahedral voids.`,
		xpReward:   70,
		coinReward: 14,
	},

	// ── Topic 4: Electrochemistry & Kinetics ────────────────────────────────
	{
		topicSlug: "physical-chemistry-3",
		slug:      "redox-electrochemistry",
		title:     "Redox & Electrochemistry",
		position:  1,
		gameMode:  "reaction_predictor",
		conceptText: `Redox reactions involve transfer of electrons.
• Oxidation: loss of electrons (OIL — Oxidation Is Loss)
• Reduction: gain of electrons (RIG — Reduction Is Gain)
• Oxidising agent gets reduced; reducing agent gets oxidised

Electrochemical cells:
• Galvanic/Voltaic cell: spontaneous redox → electrical energy. Anode (−): oxidation. Cathode (+): reduction.
• Electrolytic cell: electrical energy → non-spontaneous redox.

E°cell = E°cathode − E°anode
ΔG° = −nFE°cell (F = 96500 C mol⁻¹)
Nernst equation: E = E° − (RT/nF) ln Q

Faraday's laws: mass deposited ∝ charge passed and equivalent weight.

NEET tip: higher E° means stronger oxidising agent. SHE (Standard Hydrogen Electrode) E° = 0.00 V by definition.`,
		xpReward:   70,
		coinReward: 14,
	},
	{
		topicSlug: "physical-chemistry-3",
		slug:      "chemical-kinetics",
		title:     "Chemical Kinetics",
		position:  2,
		gameMode:  "reaction_predictor",
		conceptText: `Chemical kinetics studies the rate and mechanism of reactions.

Rate of reaction = −Δ[reactant]/Δt = Δ[product]/Δt
Rate law: Rate = k[A]^m[B]^n  (m, n determined experimentally, not from stoichiometry)
• Zero order: rate = k (t₁/₂ = [A]₀/2k)
• First order: rate = k[A] (t₁/₂ = 0.693/k — independent of concentration)
• Second order: rate = k[A]²

Arrhenius equation: k = Ae^(−Ea/RT)
ln(k₂/k₁) = (Ea/R)(1/T₁ − 1/T₂)

Higher temperature → more molecules exceed Ea → faster reaction.

NEET tip: first-order reactions are most common in NEET. Half-life of radioactive decay is always first order.`,
		xpReward:   60,
		coinReward: 12,
	},
	{
		topicSlug: "physical-chemistry-3",
		slug:      "hydrogen-s-block",
		title:     "Hydrogen & s-Block Elements",
		position:  3,
		gameMode:  "periodic_sprint",
		conceptText: `Hydrogen:
• Most abundant element in universe. Three isotopes: protium (¹H), deuterium (²H), tritium (³H).
• Forms ionic (H⁻), covalent (HCl), and metallic hydrides.
• Hard water contains Ca²⁺ and Mg²⁺. Removed by ion exchange or boiling.

s-Block (Groups 1 & 2):
• Group 1 (alkali metals): Li, Na, K, Rb, Cs, Fr. Soft, low density, react with water to give H₂ + MOH.
• Group 2 (alkaline earth metals): Be, Mg, Ca, Sr, Ba, Ra. Harder, higher melting points.

Key compounds:
• NaOH (caustic soda): by chlor-alkali process
• Na₂CO₃ (washing soda): Solvay process
• CaO (quicklime) → Ca(OH)₂ (slaked lime) + CO₂
• Plaster of Paris: CaSO₄·½H₂O

NEET tip: Li shows anomalous properties similar to Mg (diagonal relationship). Beryllium also shows anomalous properties.`,
		xpReward:   50,
		coinReward: 10,
	},

	// ── Topic 5: Inorganic Chemistry ─────────────────────────────────────────
	{
		topicSlug: "inorganic-chemistry",
		slug:      "p-block-elements",
		title:     "p-Block Elements",
		position:  1,
		gameMode:  "periodic_sprint",
		conceptText: `p-Block spans Groups 13–18 and includes metals, metalloids, and non-metals.

Group 13 (Boron family): B, Al, Ga, In, Tl. Al is most abundant metal in Earth's crust. B shows similarity to Si (diagonal relationship).

Group 14 (Carbon family): C, Si, Ge, Sn, Pb. Carbon forms allotropes: diamond, graphite, fullerene. SiO₂ is the basis of glass and cement.

Group 15 (Nitrogen family): N₂ (78% of air), P, As, Sb, Bi. N forms oxides NO, NO₂, N₂O (laughing gas). HNO₃ is a strong oxidising acid.

Group 16 (Chalcogens): O, S, Se, Te. SO₂ causes acid rain. H₂SO₄ produced by Contact process.

Group 17 (Halogens): F, Cl, Br, I, At. Most electronegative elements. Cl₂ is a disinfectant. HF etches glass.

Group 18 (Noble gases): He, Ne, Ar, Kr, Xe. Full outer shells. Xe forms compounds (XeF₂, XeF₄).

NEET tip: know the oxoacids of N, P, S, Cl and their structures.`,
		xpReward:   60,
		coinReward: 12,
	},
	{
		topicSlug: "inorganic-chemistry",
		slug:      "d-f-block-elements",
		title:     "d & f Block Elements",
		position:  2,
		gameMode:  "periodic_sprint",
		conceptText: `d-Block (transition metals, Groups 3–12): Sc to Zn in each period. Have partially filled d-orbitals.

Properties:
• Variable oxidation states (Fe²⁺/Fe³⁺, Mn²⁺/⁴⁺/⁷⁺)
• Form coloured compounds (due to d-d electron transitions)
• Paramagnetic due to unpaired d-electrons
• Good catalysts: Fe (Haber process), V₂O₅ (Contact process), Ni (hydrogenation), Pt (catalytic converter)
• Form interstitial compounds with H, C, N

Important elements:
• Iron (Fe): cast iron, steel; Fe₂O₃ (rust); Fe₃O₄ (magnetite)
• Copper (Cu): electrical wiring; CuSO₄·5H₂O (blue vitriol)
• Zinc (Zn): galvanisation; ZnO (white zinc)

f-Block: lanthanides (Ce–Lu) and actinides (Th–Lr). Lanthanide contraction causes similar sizes of 5d metals.

NEET tip: know the colour of key transition metal ions — Cu²⁺ (blue), Fe³⁺ (yellow/brown), Cr³⁺ (green), Mn²⁺ (pale pink), Ni²⁺ (green).`,
		xpReward:   60,
		coinReward: 12,
	},
	{
		topicSlug: "inorganic-chemistry",
		slug:      "coordination-compounds-metallurgy",
		title:     "Coordination Compounds & Metallurgy",
		position:  3,
		gameMode:  "compound_builder",
		conceptText: `Coordination Compounds:
• Central metal ion surrounded by ligands (Lewis bases / electron-pair donors)
• Coordination number = number of ligand atoms bonded to metal
• Ligands: monodentate (NH₃, Cl⁻, H₂O), bidentate (en, oxalate), polydentate (EDTA — hexadentate)
• IUPAC naming: ligands alphabetically first, then metal with oxidation state in Roman numerals

Isomerism in coordination compounds: ionisation, linkage, coordinate, geometric (cis-trans), optical.

Werner's theory and Crystal Field Theory explain colour and magnetic properties.

Metallurgy:
• Crushing → Concentration (froth flotation, magnetic, hydraulic) → Smelting/Roasting → Reduction → Refining
• Thermite reaction: Al reduces metal oxides (Fe₂O₃ + 2Al → Al₂O₃ + 2Fe)
• Electrolytic refining: Cu, Ag, Au purified at cathode

NEET tip: [Fe(CN)₆]⁴⁻ has low spin with Fe²⁺; [Fe(H₂O)₆]²⁺ has high spin. CN⁻ is a strong field ligand.`,
		xpReward:   70,
		coinReward: 14,
	},

	// ── Topic 6: Organic Chemistry I ────────────────────────────────────────
	{
		topicSlug: "organic-chemistry-1",
		slug:      "basic-organic-hydrocarbons",
		title:     "Basic Organic Concepts & Hydrocarbons",
		position:  1,
		gameMode:  "reaction_predictor",
		conceptText: `Organic chemistry is the study of carbon compounds. Carbon forms 4 covalent bonds and creates chains, rings, and branches.

Hybridisation:
• sp³: single bonds, tetrahedral (CH₄, alkanes)
• sp²: one double bond, trigonal planar (alkenes, benzene)
• sp: triple bond, linear (alkynes, CO₂)

Hydrocarbons (C and H only):
• Alkanes CₙH₂ₙ₊₂: combustion; free radical halogenation
• Alkenes CₙH₂ₙ: electrophilic addition (Markovnikov's rule for HX addition)
• Alkynes CₙH₂ₙ₋₂: more reactive; forms acetylide ions with NaNH₂
• Benzene C₆H₆: aromatic; electrophilic aromatic substitution (EAS — halogenation, nitration, sulfonation, Friedel-Crafts)

Reaction intermediates: carbocation, carbanion, free radical, carbene.

NEET tip: Markovnikov's rule — in HX addition to alkenes, H adds to carbon with more H atoms (forms more stable carbocation).`,
		xpReward:   60,
		coinReward: 12,
	},
	{
		topicSlug: "organic-chemistry-1",
		slug:      "haloalkanes-alcohols-ethers",
		title:     "Haloalkanes, Alcohols & Ethers",
		position:  2,
		gameMode:  "reaction_predictor",
		conceptText: `Haloalkanes (R–X):
• Nucleophilic substitution: SN1 (via carbocation; racemisation) and SN2 (backside attack; inversion of configuration — Walden inversion)
• Elimination: E1 (weak base, high T) and E2 (strong base); gives Zaitsev product (more substituted alkene)
• Uses: DDT (pesticide), chloroform (solvent), freons (refrigerants)

Alcohols (R–OH):
• Primary, secondary, tertiary classification
• Lucas test: ZnCl₂/HCl — tertiary reacts immediately; secondary reacts in 5 min; primary no reaction at room temp
• Oxidation: 1° → aldehyde → carboxylic acid; 2° → ketone; 3° → no reaction with mild oxidising agents
• Dehydration with H₂SO₄ at 170°C → alkene; at 140°C → ether

Ethers (R–O–R'):
• Prepared by Williamson synthesis: R–O⁻ + R'–X → R–O–R'
• Relatively unreactive; cleaved only by HI/HBr

NEET tip: SN2 prefers primary substrates; SN1 prefers tertiary substrates.`,
		xpReward:   60,
		coinReward: 12,
	},
	{
		topicSlug: "organic-chemistry-1",
		slug:      "aldehydes-ketones-carboxylic-acids",
		title:     "Aldehydes, Ketones & Carboxylic Acids",
		position:  3,
		gameMode:  "reaction_predictor",
		conceptText: `Aldehydes (R–CHO) and Ketones (R–CO–R'):
• Nucleophilic addition to C=O
• Aldehydes are more reactive than ketones (less steric hindrance; +I effect of alkyl groups)
• Tollens' test (silver mirror): aldehydes only
• Fehling's test (brick-red Cu₂O): aldehydes only (not aromatic)
• Iodoform test (yellow CHI₃): CH₃CO– group (acetaldehyde, methyl ketones, ethanol, secondary alcohols with CH₃)
• Aldol condensation: α-H present; base catalyst; forms β-hydroxy carbonyl

Carboxylic Acids (R–COOH):
• Stronger acids than alcohols/phenols due to resonance stabilisation of carboxylate ion
• Reactions: esterification, acid chloride/anhydride formation, decarboxylation
• Acidity order: HCOOH > CH₃COOH > C₂H₅COOH (alkyl groups reduce acidity by +I effect)

NEET tip: know the characteristic tests to distinguish aldehydes, ketones, and carboxylic acids.`,
		xpReward:   70,
		coinReward: 14,
	},

	// ── Topic 7: Organic Chemistry II ───────────────────────────────────────
	{
		topicSlug: "organic-chemistry-2",
		slug:      "amines-diazonium",
		title:     "Amines & Diazonium Salts",
		position:  1,
		gameMode:  "reaction_predictor",
		conceptText: `Amines (–NH₂, –NHR, –NR₂): nitrogen with lone pair makes them basic and nucleophilic.

Basicity order: aliphatic > ammonia > aromatic amines (lone pair delocalised into ring in aniline)
Basicity of aliphatic amines: 2° > 3° > 1° (in gas phase); in water: 2° > 1° > 3° (solvation effects)

Preparation:
• Gabriel phthalimide synthesis → primary amines only
• Hofmann degradation of amides → primary amines (C–C bond breaks)
• Reductive amination of carbonyl compounds

Diazonium salts (Ar–N₂⁺ X⁻):
• Formed: ArNH₂ + NaNO₂ + HCl at 0–5°C (Sandmeyer reaction conditions)
• Reactions: replace –N₂⁺ with –Cl (Sandmeyer), –Br, –CN, –OH, –F (Balz-Schiemann), –H (hypophosphorous acid)
• Coupling reactions with activated aromatic rings → azo dyes

NEET tip: diazonium coupling is electrophilic substitution on the activated ring. Aniline is a weaker base than cyclohexylamine.`,
		xpReward:   60,
		coinReward: 12,
	},
	{
		topicSlug: "organic-chemistry-2",
		slug:      "biomolecules",
		title:     "Biomolecules",
		position:  2,
		gameMode:  "reaction_predictor",
		conceptText: `Carbohydrates (Cₙ(H₂O)ₘ): energy molecules.
• Monosaccharides: glucose (aldohexose), fructose (ketohexose). Open-chain and cyclic (Haworth) forms.
• Disaccharides: sucrose (glucose + fructose; non-reducing), maltose/lactose (reducing sugars)
• Polysaccharides: starch (amylose + amylopectin), cellulose (structural; β-glycosidic bonds), glycogen (energy store)

Proteins: polymers of α-amino acids linked by peptide bonds (–CO–NH–).
• 4 structural levels: primary (sequence), secondary (α-helix/β-sheet via H-bonds), tertiary (3D folding), quaternary (multiple subunits)
• Denaturation: loss of 3D structure by heat, pH change

Nucleic Acids: DNA (deoxyribose, ATGC, double helix, base pairs A=T and G≡C) and RNA (ribose, AUGC, single-stranded).

Lipids: triglycerides (glycerol + 3 fatty acids via ester bonds). Saturated (no double bond) vs unsaturated.

Vitamins: A, D, E, K (fat-soluble); B-complex, C (water-soluble).

NEET tip: sucrose is NOT a reducing sugar because the anomeric carbons of both glucose and fructose are involved in the glycosidic bond.`,
		xpReward:   60,
		coinReward: 12,
	},
	{
		topicSlug: "organic-chemistry-2",
		slug:      "polymers-everyday-chemistry",
		title:     "Polymers & Everyday Chemistry",
		position:  3,
		gameMode:  "reaction_predictor",
		conceptText: `Polymers are large molecules formed by repeated monomer units.

Addition polymers (no by-product):
• Polyethylene (ethene), PVC (vinyl chloride), Teflon (tetrafluoroethene), polystyrene

Condensation polymers (lose small molecule like H₂O or HCl):
• Nylon-6,6: hexamethylene diamine + adipic acid (polyamide)
• Dacron/Terylene: ethylene glycol + terephthalic acid (polyester)
• Bakelite: phenol + formaldehyde (thermosetting; cross-linked)

Natural rubber: cis-polyisoprene; vulcanisation with S increases strength.

Chemistry in Everyday Life:
• Drugs: analgesics (aspirin, paracetamol), antibiotics (penicillin, streptomycin), antiseptics (dettol, boric acid), antacids (Mg(OH)₂, Al(OH)₃), antihistamines
• Soaps and detergents: cleansing action via micelles. Soaps are sodium salts of fatty acids; fail in hard water (form scum). Synthetic detergents work in hard water.
• Artificial sweeteners: saccharin, aspartame

NEET tip: Nylon-6 is made from caprolactam (ring-opening polymerisation), while Nylon-6,6 needs two monomers (condensation).`,
		xpReward:   60,
		coinReward: 12,
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
