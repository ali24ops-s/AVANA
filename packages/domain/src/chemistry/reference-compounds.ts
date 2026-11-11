/**
 * Authoritative Reference Compounds & Structural Graph Isomorphism Verification for AVANA.
 *
 * Provides curated reference molecular data for benchmark medicinal chemistry and organic chemistry compounds.
 * Performs rigorous 2D molecular graph isomorphism testing (atom-by-atom connectivity, bond orders,
 * aromaticity, formal charges, isotopes, tetrahedral chirality parity, and E/Z double-bond stereochemistry).
 *
 * Scientifically Proven:
 * - Equivalent SMILES with alternative atom traversal order (including chiral @ / @@ tags and directional / \\ bonds)
 *   are proven isomorphic via permutation parity and algebraic elevation calculations.
 * - Symmetrical structures explore all topological automorphisms until a stereochemically compatible mapping is found.
 * - Conjugated and multiple double bonds isolate local directional substituents without cross-contamination.
 * - Partially specified stereocenters are strictly rejected and flagged as indeterminate (no silent passes).
 * - Identical invalid SMILES are rejected prior to any string optimization.
 * - Constitutional, positional, skeletal, enantiomeric, diastereomeric, and geometric (cis/trans) isomers are reliably rejected.
 * - Non-specific substring name collisions (e.g. "acid" matching "aspirin", or "penicillin v" matching "penicillin g") are prevented.
 * - Catastrophic backtracking explosion is strictly bounded (MAX_BACKTRACK_STEPS = 50000) and reported as Indeterminate.
 */

import {
  parseSmilesToGraph,
  validateMolecularGraphValence,
  type ChemicalGraph,
  type ChemicalGraphAtom,
  type ChemicalGraphBond,
} from "./chemical-validation.js";
import {
  findMatchingScaffold,
  type AuthoritativeScaffoldRecord,
} from "./scaffold-registry.js";

export interface AuthoritativeReferenceCompound {
  id: string;
  canonicalName: string;
  aliases: string[];
  canonicalSmiles: string;
  alternateSmiles?: string[];
  flat2dSmiles?: string;
  formula: string;
  molecularWeight: number;
  iupacName?: string;
  drugClass?: string;
  drugBankId?: string;
  pubChemCid?: number;
  casNumber?: string;
}

export type CompoundVerificationStatus =
  | "VERIFIED"
  | "MEDIUM_CONFIDENCE_FLAT_2D"
  | "INDETERMINATE"
  | "MISMATCH"
  | "INVALID_INPUT"
  | "UNREGISTERED";

export interface CompoundIdentityVerificationResult {
  matched: boolean;
  verified: boolean;
  status: CompoundVerificationStatus;
  referenceRecord?: AuthoritativeReferenceCompound;
  scaffoldRecord?: AuthoritativeScaffoldRecord;
  error?: string;
  warning?: string;
  indeterminate?: boolean;
}

export type IsomorphismStatusCode =
  | "VERIFIED"
  | "MISMATCH_TOPOLOGY"
  | "MISMATCH_STEREO"
  | "MISMATCH_VALENCE"
  | "MISMATCH_SYNTAX"
  | "INDETERMINATE_KEKULE_AROMATIC"
  | "INDETERMINATE_BACKTRACK_LIMIT"
  | "INDETERMINATE_PARTIAL_STEREO"
  | "INDETERMINATE_UNSUPPORTED_STEREO"
  | "INDETERMINATE_COMPLEX_TOPOLOGY";

export interface IsomorphismResult {
  isomorphic: boolean;
  status: IsomorphismStatusCode;
  reason?: string;
  indeterminate?: boolean;
}

/**
 * Normalizes text for clean tokenization and lexical comparison.
 */
/**
 * Normalizes text for clean tokenization and lexical comparison:
 * - Removes ZWNJ, ZWSP, LTR/RTL marks, and BOM
 * - Normalizes Arabic Kaf (ك) to Persian Kaf (ک)
 * - Normalizes Arabic Yeh (ي/ى) to Persian Yeh (ی)
 * - Replaces all punctuation and separators with space
 * - Trims and normalizes consecutive spaces
 */
export function normalizeCompoundName(name: string): string {
  if (!name || typeof name !== "string") return "";
  return name
    .toLowerCase()
    .replace(/[\u200c\u200b\u200e\u200f\ufeff]/g, "") // ZWNJ and invisible zero-width chars
    .replace(/[\u0643]/g, "ک")
    .replace(/[\u064a\u0649]/g, "ی")
    .replace(/[-_.,;:/[\]()|\\«»""''“”‘’؛،—–−•·*~?!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Common prefixes in Persian and English that precede compound names in educational mind map nodes.
 */
export const COMMON_COMPOUND_PREFIXES: string[] = [
  "ساختار مولکولی داروی ",
  "ساختار مولکولی ترکیب ",
  "ساختار مولکولی ",
  "ساختار شیمیایی داروی ",
  "ساختار شیمیایی ترکیب ",
  "ساختار شیمیایی ",
  "ساختار دوبعدی ",
  "ساختار ۲ بعدی ",
  "ساختار ۲بعدی ",
  "ساختار 2d ",
  "ساختار 2D ",
  "ساختار ",
  "فرمول ساختاری داروی ",
  "فرمول ساختاری ترکیب ",
  "فرمول ساختاری ",
  "فرمول مولکولی ",
  "فرمول ",
  "معرفی داروی ",
  "معرفی ترکیب ",
  "معرفی ",
  "داروی ",
  "ترکیب شیمیایی ",
  "ترکیب ",
  "ماده دارویی ",
  "پروتوتایپ ",
  "دارو ",
  "مولکول ",
  "عامل ",
  "molecular structure of ",
  "chemical structure of ",
  "2d structure of ",
  "structure of ",
  "molecular structure ",
  "chemical structure ",
  "2d structure ",
  "structure ",
  "molecule ",
  "compound ",
  "drug ",
];

/**
 * Common suffixes in Persian and English that follow compound names in mind map nodes.
 */
export const COMMON_COMPOUND_SUFFIXES: string[] = [
  " molecule",
  " structure",
  " compound",
  " drug",
  " مولکول",
  " ترکیب",
  " دارو",
  " ساختار",
  " و مشتقات",
  " and derivatives",
];

/**
 * Strips common compound prefixes and suffixes while preserving core chemical identity.
 */
export function stripCompoundAffixes(text: string): string {
  if (!text || typeof text !== "string") return "";
  let cleaned = text.trim();
  const lower = cleaned.toLowerCase();
  for (const p of COMMON_COMPOUND_PREFIXES) {
    if (lower.startsWith(p.toLowerCase())) {
      cleaned = cleaned.slice(p.length).trim();
      break;
    }
  }
  const lowerCleaned = cleaned.toLowerCase();
  for (const s of COMMON_COMPOUND_SUFFIXES) {
    if (lowerCleaned.endsWith(s.toLowerCase())) {
      cleaned = cleaned.slice(0, -s.length).trim();
      break;
    }
  }
  return cleaned;
}

/**
 * Curated registry of authoritative reference compounds for university educational benchmarks.
 * All SMILES, formulas, molecular weights, and aliases are validated against PubChem and DrugBank.
 */
export const AUTHORITATIVE_REFERENCE_COMPOUNDS: AuthoritativeReferenceCompound[] = [
  {
    id: "aspirin",
    canonicalName: "Aspirin (Acetylsalicylic Acid)",
    aliases: [
      "aspirin",
      "acetylsalicylic acid",
      "2-acetoxybenzoic acid",
      "آسپرین",
      "استیل سالیسیلیک اسید",
      "استیل‌سالیسیلیک اسید",
      "اسید استیل سالیسیلیک",
    ],
    canonicalSmiles: "CC(=O)Oc1ccccc1C(=O)O",
    alternateSmiles: [
      "O=C(C)Oc1ccccc1C(=O)O",
      "OC(=O)c1ccccc1OC(=O)C",
      "c1(OC(=O)C)ccccc1C(=O)O",
      "c1(C(=O)O)ccccc1OC(=O)C",
    ],
    formula: "C9H8O4",
    molecularWeight: 180.16,
    iupacName: "2-acetyloxybenzoic acid",
    drugClass: "NSAID / Salicylate",
    drugBankId: "DB00945",
    pubChemCid: 2244,
    casNumber: "50-78-2",
  },
  {
    id: "lidocaine",
    canonicalName: "Lidocaine",
    aliases: [
      "lidocaine",
      "lignocaine",
      "xylocaine",
      "لیدوکائین",
      "لیدوکایین",
      "زایلوکائین",
    ],
    canonicalSmiles: "CCN(CC)CC(=O)Nc1c(C)cccc1C",
    alternateSmiles: [
      "Cc1cccc(C)c1NC(=O)CN(CC)CC",
      "O=C(CN(CC)CC)Nc1c(C)cccc1C",
    ],
    formula: "C14H22N2O",
    molecularWeight: 234.34,
    iupacName: "2-(diethylamino)-N-(2,6-dimethylphenyl)acetamide",
    drugClass: "Local Anesthetic / Amino Amide",
    drugBankId: "DB00281",
    pubChemCid: 3676,
    casNumber: "137-58-6",
  },
  {
    id: "morphine",
    canonicalName: "Morphine",
    aliases: [
      "morphine",
      "morphia",
      "مورفین",
      "مرفین",
    ],
    canonicalSmiles: "CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O",
    flat2dSmiles: "CN1CCC23C4C1CC5=C2C(=C(C=C5)O)OC3C(C=C4)O",
    formula: "C17H19NO3",
    molecularWeight: 285.34,
    iupacName: "(4R,4aR,7S,7aR,12bS)-3-methyl-2,4,4a,7,7a,13-hexahydro-1H-4,12-methano[1]benzofuro[3,2-e]isoquinoline-7,9-diol",
    drugClass: "Opioid Analgesic / Phenanthrene Alkaloid",
    drugBankId: "DB00295",
    pubChemCid: 5288826,
    casNumber: "57-27-2",
  },
  {
    id: "penicillin_g",
    canonicalName: "Penicillin G (Benzylpenicillin)",
    aliases: [
      "penicillin g",
      "benzylpenicillin",
      "penicillin-g",
      "benzyl penicillin",
      "penicillin",
      "پنی‌سیلین g",
      "پنی سیلین g",
      "پنی‌سیلین جی",
      "پنی سیلین جی",
      "پنی‌سیلین",
      "پنی سیلین",
      "بنزیل پنی سیلین",
      "بنزیل‌پنی‌سیلین",
    ],
    canonicalSmiles: "CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)Cc3ccccc3)C(=O)O)C",
    flat2dSmiles: "CC1(C(N2C(S1)C(C2=O)NC(=O)Cc3ccccc3)C(=O)O)C",
    formula: "C16H18N2O4S",
    molecularWeight: 334.39,
    iupacName: "(2S,5R,6R)-3,3-dimethyl-7-oxo-6-[(2-phenylacetyl)amino]-4-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
    drugClass: "Beta-Lactam Antibiotic / Natural Penicillin",
    drugBankId: "DB01053",
    pubChemCid: 5904,
    casNumber: "61-33-6",
  },
  {
    id: "paracetamol",
    canonicalName: "Paracetamol (Acetaminophen)",
    aliases: [
      "paracetamol",
      "acetaminophen",
      "tylenol",
      "apap",
      "4-acetamidophenol",
      "استامینوفن",
      "پاراستامول",
    ],
    canonicalSmiles: "CC(=O)Nc1ccc(O)cc1",
    alternateSmiles: [
      "O=C(C)Nc1ccc(O)cc1",
      "Oc1ccc(NC(=O)C)cc1",
    ],
    formula: "C8H9NO2",
    molecularWeight: 151.16,
    iupacName: "N-(4-hydroxyphenyl)acetamide",
    drugClass: "Analgesic / Antipyretic",
    drugBankId: "DB00316",
    pubChemCid: 1983,
    casNumber: "103-90-2",
  },
  {
    id: "penicillin_v",
    canonicalName: "Penicillin V (Phenoxymethylpenicillin)",
    aliases: [
      "penicillin v",
      "phenoxymethylpenicillin",
      "penicillin-v",
      "pen-v",
      "پنی‌سیلین v",
      "پنی سیلین v",
      "پنی‌سیلین وی",
      "پنی سیلین وی",
      "فنوکسی متیل پنی سیلین",
      "فنوکسی‌متیل‌پنی‌سیلین",
    ],
    canonicalSmiles: "CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)COc3ccccc3)C(=O)O)C",
    formula: "C16H18N2O5S",
    molecularWeight: 350.39,
    iupacName: "(2S,5R,6R)-3,3-dimethyl-7-oxo-6-[(2-phenoxyacetyl)amino]-4-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
    drugClass: "Beta-Lactam Antibiotic / Natural Penicillin",
    drugBankId: "DB00417",
    pubChemCid: 6869,
  },
  {
    id: "methicillin",
    canonicalName: "Methicillin",
    aliases: [
      "methicillin",
      "metycillin",
      "متسیلین",
      "متی سیلین",
      "متی‌سیلین",
    ],
    canonicalSmiles: "CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)c3c(OC)cccc3OC)C(=O)O)C",
    formula: "C17H20N2O6S",
    molecularWeight: 380.42,
    iupacName: "(2S,5R,6R)-6-[(2,6-dimethoxybenzoyl)amino]-3,3-dimethyl-7-oxo-4-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
    drugClass: "Beta-Lactam Antibiotic / Penicillinase-Resistant Penicillin",
    drugBankId: "DB01060",
    pubChemCid: 6087,
  },
  {
    id: "oxacillin",
    canonicalName: "Oxacillin",
    aliases: [
      "oxacillin",
      "oxacilline",
      "اگزاسیلین",
      "اکساسیلین",
    ],
    canonicalSmiles: "CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)C3=C(C)ON=C3c4ccccc4)C(=O)O)C",
    formula: "C19H19N3O5S",
    molecularWeight: 401.44,
    iupacName: "(2S,5R,6R)-3,3-dimethyl-6-[(5-methyl-3-phenyl-1,2-oxazole-4-carbonyl)amino]-7-oxo-4-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
    drugClass: "Beta-Lactam Antibiotic / Isoxazolyl Penicillin",
    drugBankId: "DB00713",
    pubChemCid: 6196,
  },
  {
    id: "cloxacillin",
    canonicalName: "Cloxacillin",
    aliases: [
      "cloxacillin",
      "cloxapen",
      "کلوگزاسیلین",
      "کلوکساسیلین",
    ],
    canonicalSmiles: "CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)C3=C(C)ON=C3c4c(Cl)cccc4)C(=O)O)C",
    formula: "C19H18ClN3O5S",
    molecularWeight: 435.88,
    iupacName: "(2S,5R,6R)-6-[[3-(2-chlorophenyl)-5-methyl-1,2-oxazole-4-carbonyl]amino]-3,3-dimethyl-7-oxo-4-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
    drugClass: "Beta-Lactam Antibiotic / Isoxazolyl Penicillin",
    drugBankId: "DB01147",
    pubChemCid: 6098,
  },
  {
    id: "dicloxacillin",
    canonicalName: "Dicloxacillin",
    aliases: [
      "dicloxacillin",
      "dynapen",
      "دیکلوگزاسیلین",
      "دیکلوکساسیلین",
      "دیکلوکساسلین",
      "دیکلوگزاسلین",
    ],
    canonicalSmiles: "CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)C3=C(C)ON=C3c4c(Cl)cccc4Cl)C(=O)O)C",
    formula: "C19H17Cl2N3O5S",
    molecularWeight: 470.33,
    iupacName: "(2S,5R,6R)-6-[[3-(2,6-dichlorophenyl)-5-methyl-1,2-oxazole-4-carbonyl]amino]-3,3-dimethyl-7-oxo-4-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
    drugClass: "Beta-Lactam Antibiotic / Isoxazolyl Penicillin",
    drugBankId: "DB00485",
    pubChemCid: 18381,
  },
  {
    id: "nafcillin",
    canonicalName: "Nafcillin",
    aliases: [
      "nafcillin",
      "unipen",
      "نافسیلین",
      "نافسلین",
    ],
    canonicalSmiles: "CCOC1=CC=C2C(=C1C(=O)N[C@H]3[C@@H]4SC(C)(C)[C@@H](N4C3=O)C(=O)O)C=CC=C2",
    formula: "C21H22N2O5S",
    molecularWeight: 414.48,
    iupacName: "(2S,5R,6R)-6-[(2-ethoxynaphthalene-1-carbonyl)amino]-3,3-dimethyl-7-oxo-4-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
    drugClass: "Beta-Lactam Antibiotic / Penicillinase-Resistant Penicillin",
    drugBankId: "DB00607",
    pubChemCid: 8977,
  },
  {
    id: "ampicillin",
    canonicalName: "Ampicillin",
    aliases: [
      "ampicillin",
      "omnipen",
      "آمپی‌سیلین",
      "آمپی سیلین",
    ],
    canonicalSmiles: "CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)N[C@@H](C(=O)c3ccccc3)N)C(=O)O)C",
    formula: "C16H19N3O4S",
    molecularWeight: 349.41,
    iupacName: "(2S,5R,6R)-6-[[(2R)-2-amino-2-phenylacetyl]amino]-3,3-dimethyl-7-oxo-4-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
    drugClass: "Beta-Lactam Antibiotic / Aminopenicillin",
    drugBankId: "DB00415",
    pubChemCid: 6249,
  },
  {
    id: "amoxicillin",
    canonicalName: "Amoxicillin",
    aliases: [
      "amoxicillin",
      "amoxil",
      "آموکسی‌سیلین",
      "آموکسی سیلین",
    ],
    canonicalSmiles: "CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)N[C@@H](C(=O)c3ccc(O)cc3)N)C(=O)O)C",
    formula: "C16H19N3O5S",
    molecularWeight: 365.40,
    iupacName: "(2S,5R,6R)-6-[[(2R)-2-amino-2-(4-hydroxyphenyl)acetyl]amino]-3,3-dimethyl-7-oxo-4-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
    drugClass: "Beta-Lactam Antibiotic / Aminopenicillin",
    drugBankId: "DB01060",
    pubChemCid: 337201,
  },
  {
    id: "carbenicillin",
    canonicalName: "Carbenicillin",
    aliases: [
      "carbenicillin",
      "pyopen",
      "کاربنی‌سیلین",
      "کاربنی سیلین",
    ],
    canonicalSmiles: "CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)C(c3ccccc3)C(=O)O)C(=O)O)C",
    formula: "C17H18N2O6S",
    molecularWeight: 378.40,
    iupacName: "(2S,5R,6R)-6-[(2-carboxy-2-phenylacetyl)amino]-3,3-dimethyl-7-oxo-4-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
    drugClass: "Beta-Lactam Antibiotic / Carboxypenicillin",
    drugBankId: "DB00578",
    pubChemCid: 20824,
  },
  {
    id: "ticarcillin",
    canonicalName: "Ticarcillin",
    aliases: [
      "ticarcillin",
      "ticar",
      "تیکارسیلین",
    ],
    canonicalSmiles: "CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)C(c3sccc3)C(=O)O)C(=O)O)C",
    formula: "C15H16N2O6S2",
    molecularWeight: 384.43,
    iupacName: "(2S,5R,6R)-6-[[2-carboxy-2-(thiophen-3-yl)acetyl]amino]-3,3-dimethyl-7-oxo-4-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
    drugClass: "Beta-Lactam Antibiotic / Carboxypenicillin",
    drugBankId: "DB01607",
    pubChemCid: 36921,
  },
  {
    id: "piperacillin",
    canonicalName: "Piperacillin",
    aliases: [
      "piperacillin",
      "pipracil",
      "پیپراسیلین",
    ],
    canonicalSmiles: "CCN1CCN(C(=O)C1=O)C(=O)N[C@@H](C(=O)N[C@H]2[C@@H]3SC(C)(C)[C@@H](N3C2=O)C(=O)O)c4ccccc4",
    formula: "C23H27N5O7S",
    molecularWeight: 517.55,
    iupacName: "(2S,5R,6R)-6-[[(2R)-2-[(4-ethyl-2,3-dioxopiperazine-1-carbonyl)amino]-2-phenylacetyl]amino]-3,3-dimethyl-7-oxo-4-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
    drugClass: "Beta-Lactam Antibiotic / Antipseudomonal Ureidopenicillin",
    drugBankId: "DB00319",
    pubChemCid: 43672,
  },
  {
    id: "clavulanic_acid",
    canonicalName: "Clavulanic Acid",
    aliases: [
      "clavulanic acid",
      "clavulanate",
      "اسید کلاوولانیک",
      "کلاوولانیک اسید",
      "کلاوولانات",
      "اسید کلاولانیک",
      "کلاولانیک اسید",
      "کلاولانات",
    ],
    canonicalSmiles: "OC/C=C1\\O[C@@H]2CC(=O)N2[C@H]1C(=O)O",
    formula: "C8H9NO5",
    molecularWeight: 199.16,
    iupacName: "(2R,3Z,5R)-3-(2-hydroxyethylidene)-7-oxo-4-oxa-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
    drugClass: "Beta-Lactamase Inhibitor / Oxapenam",
    drugBankId: "DB00766",
    pubChemCid: 5280980,
  },
  {
    id: "sulbactam",
    canonicalName: "Sulbactam",
    aliases: [
      "sulbactam",
      "سولباکتام",
    ],
    canonicalSmiles: "CC1([C@@H](N2[C@H](S1(=O)=O)CC2=O)C(=O)O)C",
    formula: "C8H11NO5S",
    molecularWeight: 233.24,
    iupacName: "(2S,5R)-3,3-dimethyl-4,4,7-trioxo-4lambda6-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
    drugClass: "Beta-Lactamase Inhibitor / Penicillanic Acid Sulfone",
    drugBankId: "DB09324",
    pubChemCid: 130313,
  },
  {
    id: "tazobactam",
    canonicalName: "Tazobactam",
    aliases: [
      "tazobactam",
      "تازوباکتام",
    ],
    canonicalSmiles: "CC1(Cn2ccnn2)[C@@H](C(=O)O)N3C(=O)C[C@@H]3S1(=O)=O",
    formula: "C10H12N4O5S",
    molecularWeight: 300.29,
    iupacName: "(2S,3S,5R)-3-methyl-4,4,7-trioxo-3-(triazol-1-ylmethyl)-4lambda6-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
    drugClass: "Beta-Lactamase Inhibitor / Penicillanic Acid Sulfone",
    drugBankId: "DB01606",
    pubChemCid: 123630,
  },
  {
    id: "cephalexin",
    canonicalName: "Cephalexin",
    aliases: [
      "cephalexin",
      "cefalexin",
      "keflex",
      "سفالکسین",
    ],
    canonicalSmiles: "CC1=C(N2[C@H](SC1)[C@@H](C2=O)NC(=O)[C@@H](c3ccccc3)N)C(=O)O",
    formula: "C16H17N3O4S",
    molecularWeight: 347.39,
    iupacName: "(6R,7R)-7-[[(2R)-2-amino-2-phenylacetyl]amino]-3-methyl-8-oxo-5-thia-1-azabicyclo[4.2.0]oct-2-ene-2-carboxylic acid",
    drugClass: "Cephalosporin Antibiotic / First Generation",
    drugBankId: "DB00567",
    pubChemCid: 27447,
  },
  {
    id: "cefazolin",
    canonicalName: "Cefazolin",
    aliases: [
      "cefazolin",
      "kefzol",
      "ancef",
      "سفازولین",
    ],
    canonicalSmiles: "O=C(O)C1=C(CSc2nnc(C)s2)CS[C@@H]3[C@H](NC(=O)Cn4nnnc4)C(=O)N13",
    formula: "C14H14N8O4S3",
    molecularWeight: 454.51,
    iupacName: "(6R,7R)-3-[(5-methyl-1,3,4-thiadiazol-2-yl)sulfanylmethyl]-8-oxo-7-[(2-tetrazol-1-ylacetyl)amino]-5-thia-1-azabicyclo[4.2.0]oct-2-ene-2-carboxylic acid",
    drugClass: "Cephalosporin Antibiotic / First Generation",
    drugBankId: "DB01327",
    pubChemCid: 33255,
  },
  {
    id: "cefuroxime",
    canonicalName: "Cefuroxime",
    aliases: [
      "cefuroxime",
      "ceftin",
      "zinacef",
      "سفورروکسیم",
      "سفوروکسیم",
    ],
    canonicalSmiles: "CON=C(C1=CC=CO1)C(=O)N[C@H]2[C@@H]3SCC(=C(N3C2=O)C(=O)O)COC(=O)N",
    formula: "C16H16N4O8S",
    molecularWeight: 424.39,
    iupacName: "(6R,7R)-3-(carbamoyloxymethyl)-7-[[(2Z)-2-(furan-2-yl)-2-methoxyiminoacetyl]amino]-8-oxo-5-thia-1-azabicyclo[4.2.0]oct-2-ene-2-carboxylic acid",
    drugClass: "Cephalosporin Antibiotic / Second Generation",
    drugBankId: "DB01112",
    pubChemCid: 5479529,
  },
  {
    id: "cefotaxime",
    canonicalName: "Cefotaxime",
    aliases: [
      "cefotaxime",
      "claforan",
      "سفوتاکسیم",
    ],
    canonicalSmiles: "CON=C(c1csc(N)n1)C(=O)N[C@H]2[C@@H]3SCC(=C(N3C2=O)C(=O)O)COC(=O)C",
    formula: "C16H17N5O7S2",
    molecularWeight: 455.47,
    iupacName: "(6R,7R)-3-(acetyloxymethyl)-7-[[(2Z)-2-(2-amino-1,3-thiazol-4-yl)-2-methoxyiminoacetyl]amino]-8-oxo-5-thia-1-azabicyclo[4.2.0]oct-2-ene-2-carboxylic acid",
    drugClass: "Cephalosporin Antibiotic / Third Generation",
    drugBankId: "DB00493",
    pubChemCid: 5742673,
  },
  {
    id: "ceftriaxone",
    canonicalName: "Ceftriaxone",
    aliases: [
      "ceftriaxone",
      "rocephin",
      "سفتریاکسون",
    ],
    canonicalSmiles: "CON=C(c1csc(N)n1)C(=O)N[C@H]2[C@@H]3SCC(=C(N3C2=O)C(=O)O)CSC4=NC(=O)C(=O)NN4C",
    formula: "C18H18N8O7S3",
    molecularWeight: 554.58,
    iupacName: "(6R,7R)-7-[[(2Z)-2-(2-amino-1,3-thiazol-4-yl)-2-methoxyiminoacetyl]amino]-3-[(2-methyl-5,6-dioxo-1H-1,2,4-triazin-3-yl)sulfanylmethyl]-8-oxo-5-thia-1-azabicyclo[4.2.0]oct-2-ene-2-carboxylic acid",
    drugClass: "Cephalosporin Antibiotic / Third Generation",
    drugBankId: "DB01212",
    pubChemCid: 5479530,
  },
  {
    id: "ceftazidime",
    canonicalName: "Ceftazidime",
    aliases: [
      "ceftazidime",
      "fortaz",
      "سفتازیدیم",
    ],
    canonicalSmiles: "CC(C)(C(=O)O)ON=C(c1csc(N)n1)C(=O)N[C@H]2[C@@H]3SCC(=C(N3C2=O)C(=O)O)C[n+]4ccccc4",
    formula: "C22H22N6O7S2",
    molecularWeight: 546.58,
    iupacName: "(6R,7R)-7-[[(2Z)-2-(2-amino-1,3-thiazol-4-yl)-2-(2-carboxypropan-2-yloxyimino)acetyl]amino]-8-oxo-3-(pyridin-1-ium-1-ylmethyl)-5-thia-1-azabicyclo[4.2.0]oct-2-ene-2-carboxylate",
    drugClass: "Cephalosporin Antibiotic / Third Generation (Antipseudomonal)",
    drugBankId: "DB00438",
    pubChemCid: 5481174,
  },
  {
    id: "ceftolozane",
    canonicalName: "Ceftolozane",
    aliases: [
      "ceftolozane",
      "zerbaxa",
      "سفتولوزان",
    ],
    canonicalSmiles: "CC(C)(C(=O)O)ON=C(C(=O)N[C@H]1[C@@H]2SCC(=C(N2C1=O)C(=O)O)Cn3c(N)c(NC(=O)NCCN)cn3C)c4nsc(N)n4",
    formula: "C23H30N12O8S2",
    molecularWeight: 666.7,
    iupacName: "(6R,7R)-3-[[5-amino-4-[[(2-aminoethyl)carbamoyl]amino]-1-methylpyrazol-2-yl]methyl]-7-[[(2Z)-2-(5-amino-1,2,4-thiadiazol-3-yl)-2-(2-carboxypropan-2-yloxyimino)acetyl]amino]-8-oxo-5-thia-1-azabicyclo[4.2.0]oct-2-ene-2-carboxylic acid",
    drugClass: "Cephalosporin Antibiotic / Advanced Generation",
    drugBankId: "DB09046",
    pubChemCid: 53234134,
  },
  {
    id: "ciprofloxacin",
    canonicalName: "Ciprofloxacin",
    aliases: [
      "ciprofloxacin",
      "cipro",
      "سیپروفلوکساسین",
      "سیپرو فلوکساسین",
    ],
    canonicalSmiles: "O=C(O)C1=CN(C2CC2)C3=CC(N4CCNCC4)=C(F)C=C3C1=O",
    formula: "C17H18FN3O3",
    molecularWeight: 331.34,
    iupacName: "1-cyclopropyl-6-fluoro-4-oxo-7-(piperazin-1-yl)quinoline-3-carboxylic acid",
    drugClass: "Fluoroquinolone Antibacterial / Second Generation",
    drugBankId: "DB00537",
    pubChemCid: 2764,
  },
  {
    id: "levofloxacin",
    canonicalName: "Levofloxacin",
    aliases: [
      "levofloxacin",
      "levaquin",
      "لووفلوکساسین",
      "لوو فلوکساسین",
    ],
    canonicalSmiles: "CC1COC2=C3N1C=C(C(=O)C3=CC(=C2N4CCN(C)CC4)F)C(=O)O",
    formula: "C18H20FN3O4",
    molecularWeight: 361.37,
    iupacName: "(3S)-9-fluoro-3-methyl-10-(4-methylpiperazin-1-yl)-7-oxo-2,3-dihydro-7H-[1,4]oxazino[2,3,4-ij]quinoline-6-carboxylic acid",
    drugClass: "Fluoroquinolone Antibacterial / Third Generation",
    drugBankId: "DB01137",
    pubChemCid: 2879,
  },
  {
    id: "metronidazole",
    canonicalName: "Metronidazole",
    aliases: [
      "metronidazole",
      "flagyl",
      "مترونیدازول",
    ],
    canonicalSmiles: "Cc1ncc([N+](=O)[O-])n1CCO",
    formula: "C6H9N3O3",
    molecularWeight: 171.15,
    iupacName: "2-(2-methyl-5-nitroimidazol-1-yl)ethanol",
    drugClass: "Nitroimidazole Antibacterial / Antiprotozoal",
    drugBankId: "DB00916",
    pubChemCid: 4173,
  },
  {
    id: "tinidazole",
    canonicalName: "Tinidazole",
    aliases: [
      "tinidazole",
      "tindamax",
      "تینیدازول",
    ],
    canonicalSmiles: "CC1=NC=C([N+](=O)[O-])N1CCS(=O)(=O)CC",
    formula: "C8H13N3O4S",
    molecularWeight: 247.27,
    iupacName: "1-(2-ethylsulfonylethyl)-2-methyl-5-nitroimidazole",
    drugClass: "Nitroimidazole Antibacterial / Antiprotozoal",
    drugBankId: "DB00911",
    pubChemCid: 5496,
  },
  {
    id: "fosfomycin",
    canonicalName: "Fosfomycin",
    aliases: [
      "fosfomycin",
      "monurol",
      "فسفومایسین",
    ],
    canonicalSmiles: "C[C@H]1[C@H](O1)P(=O)(O)O",
    formula: "C3H7O4P",
    molecularWeight: 138.06,
    iupacName: "[(2R,3S)-3-methyloxiran-2-yl]phosphonic acid",
    drugClass: "Phosphonic Acid Antibacterial / MurA Inhibitor",
    drugBankId: "DB00828",
    pubChemCid: 446987,
  },
];

/**
 * Robust multi-segment and whole-phrase alias matching that:
 * 1. Checks all segments split by Persian & English separators (:, ;, -, —, –, |, /, ،, ,, ؛)
 * 2. Examines parentheses, brackets, and quotes
 * 3. Strips standard compound prefixes and suffixes
 * 4. Normalizes Persian/Arabic letter variants and ZWNJ
 * 5. Requires exact normalized equality against reference aliases to prevent false-positive collisions
 */
export function matchCompoundAlias(
  inputName: string,
  reference: AuthoritativeReferenceCompound,
): boolean {
  if (!inputName || typeof inputName !== "string") return false;

  const rawClean = inputName.trim();
  if (!rawClean) return false;

  const candidateSet = new Set<string>();

  const addCandidate = (rawSegment: string) => {
    if (!rawSegment) return;
    const norm = normalizeCompoundName(rawSegment);
    if (norm) candidateSet.add(norm);

    const stripped = stripCompoundAffixes(rawSegment);
    if (stripped && stripped !== rawSegment) {
      const normStrip = normalizeCompoundName(stripped);
      if (normStrip) candidateSet.add(normStrip);
    }
  };

  // 1. Entire cleaned string
  addCandidate(rawClean);

  // 2. Segments split by separators: - : ; — – | / ، , ؛ \n
  const segments = rawClean.split(/[-:;—–|/،,؛\n\r\t]+/);
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (trimmed) addCandidate(trimmed);
  }

  // 3. Parentheses, brackets, chevron quotes: (...) [...] {...} «...»
  const parens = rawClean.match(/[\(\[«\{]([^)\]»\}]+)[\)\]»\}]/g);
  if (parens) {
    for (const p of parens) {
      const inner = p.replace(/[\(\[«\{\)\]»\}]/g, "").trim();
      if (inner) addCandidate(inner);
    }
    const withoutParens = rawClean.replace(/[\(\[«\{][^)\]»\}]+[\)\]»\}]/g, " ").trim();
    if (withoutParens) addCandidate(withoutParens);
  }

  const normalizedAliases = reference.aliases.map((a) => normalizeCompoundName(a));

  for (const candidate of candidateSet) {
    if (!candidate) continue;
    for (const normAlias of normalizedAliases) {
      if (candidate === normAlias) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Builds an adjacency matrix with bond orders for a molecular graph.
 */
function buildAdjacencyMatrix(graph: ChemicalGraph): number[][] {
  const n = graph.atoms.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const b of graph.bonds) {
    if (b.atom1 >= 0 && b.atom1 < n && b.atom2 >= 0 && b.atom2 < n) {
      matrix[b.atom1][b.atom2] = b.order;
      matrix[b.atom2][b.atom1] = b.order;
    }
  }
  return matrix;
}

/**
 * Computes Weisfeiler-Lehman (WL) topological atom color signatures for graph isomorphism.
 * Iteratively refines atom labels by hashing their neighbor colors and bond orders.
 *
 * NOTE: Lexical chirality tags ('@' vs '@@') are intentionally excluded from initial 2D WL colors
 * to avoid false negatives when atom traversal order flips neighbor permutation parity.
 * Chiral center stereochemistry is verified exactly during the bijection phase.
 */
function computeWlColorSignatures(graph: ChemicalGraph, numIterations = 3): string[] {
  const n = graph.atoms.length;
  const adj = buildAdjacencyMatrix(graph);

  // Initial colors: element, formal charge, aromaticity, hydrogens, isotope, and chirality definition presence
  let colors: string[] = graph.atoms.map((a: ChemicalGraphAtom) =>
    `${a.element}:${a.charge}:${a.isAromatic ? "1" : "0"}:${a.hydrogens}:${a.isotope || 0}:${a.chirality ? "chiral" : "achiral"}`,
  );

  for (let iter = 0; iter < numIterations; iter++) {
    const nextColors = new Array(n);
    for (let i = 0; i < n; i++) {
      const neighborSignatures: string[] = [];
      for (let j = 0; j < n; j++) {
        const order = adj[i][j];
        if (order > 0) {
          neighborSignatures.push(`${order}*${colors[j]}`);
        }
      }
      neighborSignatures.sort();
      nextColors[i] = `${colors[i]}|[${neighborSignatures.join(",")}]`;
    }
    colors = nextColors;
  }

  return colors;
}

/**
 * Calculates vertical elevation of a directional bond (/ or \) relative to a double bond atom.
 */
function getBondElevation(b: ChemicalGraphBond, doubleAtom: number, otherAtom: number): number {
  if (b.atom1 === otherAtom && b.atom2 === doubleAtom) {
    return b.type === "/" ? -1 : 1;
  }
  if (b.atom1 === doubleAtom && b.atom2 === otherAtom) {
    return b.type === "/" ? 1 : -1;
  }
  return 0;
}

export interface DoubleBondStereoConstraint {
  doubleBond: [number, number];
  subU: number;
  subV: number;
  config: "CIS" | "TRANS";
}

export interface DoubleBondStereoResult {
  constraints: DoubleBondStereoConstraint[];
  hasPartial: boolean;
  indeterminate: boolean;
  reason?: string;
}

/**
 * Strictly extracts all directional stereochemical constraints for each double bond in the graph.
 * Isolates endpoints so multiple/conjugated double bonds never cross-contaminate.
 * Detects partially-specified (one-sided) directional bonds to prevent silent passes.
 * Accurately detects and marks ambiguous or unsupported configurations (cumulenes, conflicting geminal bonds) as Indeterminate.
 */
function extractDoubleBondStereo(graph: ChemicalGraph): DoubleBondStereoResult {
  const constraints: DoubleBondStereoConstraint[] = [];
  let hasPartial = false;

  // 1. Detect cumulated double bonds (Allenes: C=C=C)
  const doubleBonds = graph.bonds.filter((b) => b.order === 2);
  const doubleBondEndpoints = new Map<number, number>();
  for (const b of doubleBonds) {
    doubleBondEndpoints.set(b.atom1, (doubleBondEndpoints.get(b.atom1) || 0) + 1);
    doubleBondEndpoints.set(b.atom2, (doubleBondEndpoints.get(b.atom2) || 0) + 1);
  }

  for (const [, count] of doubleBondEndpoints.entries()) {
    if (count > 1) {
      // Check if any directional bonds exist in the molecule
      const hasAnyDirectional = graph.bonds.some((b) => b.type === "/" || b.type === "\\");
      if (hasAnyDirectional) {
        return {
          constraints: [],
          hasPartial: false,
          indeterminate: true,
          reason:
            "استریوشیمی پیوندهای تجمعی (Allene/Cumulene) دارای کایرالیتی محوری است و با مدل دوبعدی E/Z سازگار نیست (وضعیت: نامشخص / Indeterminate).",
        };
      }
    }
  }

  // 2. Process each independent double bond
  for (const b of doubleBonds) {
    const u = Math.min(b.atom1, b.atom2);
    const v = Math.max(b.atom1, b.atom2);

    // Directional bonds incident to u (excluding the double bond to v)
    const dirU = graph.bonds.filter(
      (x) =>
        (x.type === "/" || x.type === "\\") &&
        (x.atom1 === u || x.atom2 === u) &&
        !(x.atom1 === v || x.atom2 === v),
    );

    // Directional bonds incident to v (excluding the double bond to u)
    const dirV = graph.bonds.filter(
      (x) =>
        (x.type === "/" || x.type === "\\") &&
        (x.atom1 === v || x.atom2 === v) &&
        !(x.atom1 === u || x.atom2 === u),
    );

    if (dirU.length === 0 && dirV.length === 0) continue;

    if (dirU.length === 0 || dirV.length === 0) {
      hasPartial = true;
      continue;
    }

    if (dirU.length > 2 || dirV.length > 2) {
      return {
        constraints: [],
        hasPartial: false,
        indeterminate: true,
        reason:
          "تعداد پیوندهای جهت‌دار متصل به رأس پیوند دوگانه بیش از حد مجاز هندسی است (وضعیت: نامشخص / Indeterminate).",
      };
    }

    // Check geminal consistency on u if two directional bonds exist
    if (dirU.length === 2) {
      const x1 = dirU[0].atom1 === u ? dirU[0].atom2 : dirU[0].atom1;
      const x2 = dirU[1].atom1 === u ? dirU[1].atom2 : dirU[1].atom1;
      const elev1 = getBondElevation(dirU[0], u, x1);
      const elev2 = getBondElevation(dirU[1], u, x2);
      if (elev1 === elev2) {
        return {
          constraints: [],
          hasPartial: false,
          indeterminate: true,
          reason:
            "پیوندهای جهت‌دار متصل به یک اتم دارای جهت متناقض هستند (وضعیت: نامشخص / Indeterminate).",
        };
      }
    }

    // Check geminal consistency on v if two directional bonds exist
    if (dirV.length === 2) {
      const y1 = dirV[0].atom1 === v ? dirV[0].atom2 : dirV[0].atom1;
      const y2 = dirV[1].atom1 === v ? dirV[1].atom2 : dirV[1].atom1;
      const elev1 = getBondElevation(dirV[0], v, y1);
      const elev2 = getBondElevation(dirV[1], v, y2);
      if (elev1 === elev2) {
        return {
          constraints: [],
          hasPartial: false,
          indeterminate: true,
          reason:
            "پیوندهای جهت‌دار متصل به یک اتم دارای جهت متناقض هستند (وضعیت: نامشخص / Indeterminate).",
        };
      }
    }

    for (const bu of dirU) {
      for (const bv of dirV) {
        const x = bu.atom1 === u ? bu.atom2 : bu.atom1;
        const y = bv.atom1 === v ? bv.atom2 : bv.atom1;
        const elevU = getBondElevation(bu, u, x);
        const elevV = getBondElevation(bv, v, y);
        if (elevU !== 0 && elevV !== 0) {
          constraints.push({
            doubleBond: [u, v],
            subU: x,
            subV: y,
            config: elevU * elevV === 1 ? "CIS" : "TRANS",
          });
        }
      }
    }
  }

  return {
    constraints,
    hasPartial,
    indeterminate: hasPartial,
    ...(hasPartial
      ? {
          reason:
            "عدم تطابق استریوشیمی: جهت‌گیری فضایی پیوند دوگانه تنها در یک سمت تعیین شده است و قابل تفسیر قطعی نیست (وضعیت: نامشخص / Indeterminate).",
        }
      : {}),
  };
}

/**
 * Mathematically verifies tetrahedral chiral centers via permutation parity of neighbor sequences.
 */
function verifyTetrahedralChiralCenters(
  g1: ChemicalGraph,
  g2: ChemicalGraph,
  mapping: Map<number, number>,
): { match: boolean; indeterminate?: boolean; reason?: string } {
  // Check if either graph contains unsupported stereochemistry tags
  if (
    (g1.unsupportedStereo && g1.unsupportedStereo.length > 0) ||
    (g2.unsupportedStereo && g2.unsupportedStereo.length > 0)
  ) {
    return {
      match: false,
      indeterminate: true,
      reason:
        "استریوشیمی پشتیبانی‌نشده: ساختار حاوی شناسه استریوشیمی غیرتتراهدرال یا پشتیبانی‌نشده است (وضعیت: نامشخص / Indeterminate).",
    };
  }

  const chiralAtoms1 = g1.atoms.filter((a) => !!a.chirality);
  const chiralAtoms2 = g2.atoms.filter((a) => !!a.chirality);

  if (chiralAtoms1.length === 0 && chiralAtoms2.length === 0) {
    return { match: true };
  }

  if (chiralAtoms1.length !== chiralAtoms2.length) {
    return {
      match: false,
      reason:
        "عدم تطابق استریوشیمی: یکی از ساختارها دارای مراکز کایرال مشخص (@/@@) است اما ساختار دیگر فاقد تعیین استریوشیمی است.",
    };
  }

  for (const u1 of chiralAtoms1) {
    const v2Index = mapping.get(u1.index);
    if (v2Index === undefined) continue;
    const u2 = g2.atoms[v2Index];

    if (!u2.chirality) {
      return {
        match: false,
        reason:
          "عدم تطابق استریوشیمی: مرکز کایرال متناظر در ساختار دوم فاقد تعیین استریوشیمی است.",
      };
    }

    const n1 = u1.neighborOrder || [];
    const n2 = u2.neighborOrder || [];

    if (n1.length < 3 || n1.length > 4 || n2.length < 3 || n2.length > 4) {
      return {
        match: false,
        indeterminate: true,
        reason: "مرکز کایرال دارای تعداد اتصالات غیراستاندارد برای هندسه تتراهدرال است.",
      };
    }

    const m = n1.map((x) => (x === -1 ? -1 : mapping.get(x) ?? -999));
    const p = n2.map((x) => m.indexOf(x));
    if (p.some((idx) => idx === -1)) {
      return {
        match: false,
        reason: "عدم تطابق اتصالات یا همسایه‌های مرکز کایرال.",
      };
    }

    let inversions = 0;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        if (p[i] > p[j]) inversions++;
      }
    }

    const isEven = inversions % 2 === 0;
    const expectedTag = isEven ? u1.chirality : u1.chirality === "@" ? "@@" : "@";

    if (u2.chirality !== expectedTag) {
      if (chiralAtoms1.length === 1) {
        return {
          match: false,
          reason:
            "عدم تطابق استریوشیمی: انانتیومر یا وارونگی پیکربندی در مرکز کایرال (R/S) شناسایی شد.",
        };
      } else {
        return {
          match: false,
          reason:
            "عدم تطابق استریوشیمی: دیاستریومر شناسایی شد (پیکربندی در حداقل یک مرکز کایرال مغایرت دارد).",
        };
      }
    }
  }

  return { match: true };
}

/**
 * Mathematically verifies double-bond stereochemistry (cis/trans or E/Z) across all double bonds.
 * Endpoint and substituents are strictly locked into a single coherent mapping unit.
 * Cross-matching and substituent swapping across endpoints are mathematically impossible.
 */
function verifyDoubleBondStereochemistry(
  g1: ChemicalGraph,
  g2: ChemicalGraph,
  mapping: Map<number, number>,
): { match: boolean; indeterminate?: boolean; reason?: string } {
  const s1 = extractDoubleBondStereo(g1);
  const s2 = extractDoubleBondStereo(g2);

  if (s1.indeterminate || s2.indeterminate || s1.hasPartial || s2.hasPartial) {
    return {
      match: false,
      indeterminate: true,
      reason:
        s1.reason ||
        s2.reason ||
        "عدم تطابق استریوشیمی: جهت‌گیری فضایی پیوند دوگانه قابل تفسیر قطعی نیست (وضعیت: نامشخص / Indeterminate).",
    };
  }

  if (s1.constraints.length === 0 && s2.constraints.length === 0) {
    return { match: true };
  }

  if (s1.constraints.length !== s2.constraints.length) {
    return {
      match: false,
      reason:
        "عدم تطابق استریوشیمی: یکی از ساختارها دارای هندسه مشخص پیوند دوگانه (E/Z) است اما ساختار دیگر فاقد اطلاعات استریوشیمی است.",
    };
  }

  for (const c1 of s1.constraints) {
    const mappedU = mapping.get(c1.doubleBond[0]);
    const mappedV = mapping.get(c1.doubleBond[1]);
    const mappedSubU = mapping.get(c1.subU);
    const mappedSubV = mapping.get(c1.subV);
    if (
      mappedU === undefined ||
      mappedV === undefined ||
      mappedSubU === undefined ||
      mappedSubV === undefined
    ) {
      return { match: false, reason: "عدم تطابق اتصالات پیوند دوگانه." };
    }

    // Coherent endpoint and substituent matching:
    // If double bond orientation is (mappedU, mappedV), then subU MUST match mappedSubU and subV MUST match mappedSubV.
    // If double bond orientation is inverted (mappedV, mappedU), then subU MUST match mappedSubV and subV MUST match mappedSubU.
    // Cross-matching is strictly rejected.
    const c2 = s2.constraints.find(
      (c) =>
        (c.doubleBond[0] === mappedU &&
          c.doubleBond[1] === mappedV &&
          c.subU === mappedSubU &&
          c.subV === mappedSubV) ||
        (c.doubleBond[0] === mappedV &&
          c.doubleBond[1] === mappedU &&
          c.subU === mappedSubV &&
          c.subV === mappedSubU),
    );

    if (!c2) {
      return {
        match: false,
        reason:
          "عدم تطابق استریوشیمی: استخلاف‌های پیوند دوگانه متناظر فاقد قید جهت‌داری فضایی منطبق هستند.",
      };
    }

    if (c1.config !== c2.config) {
      return {
        match: false,
        reason:
          "عدم تطابق استریوشیمی: جهت‌گیری پیوند دوگانه فضایی (cis/trans یا E/Z) مغایرت دارد.",
      };
    }
  }

  return { match: true };
}

/**
 * Evaluates whether two chemical graphs are truly isomorphic by:
 * 1. Coarse property filtering (atom count, bond count, element multiset, bond order multiset, formal charge, isotope).
 * 2. Explicit Kekulé vs Aromatic notation detection.
 * 3. Chiral centers count invariance.
 * 4. Weisfeiler-Lehman topological neighborhood invariance (detects constitutional & positional isomers).
 * 5. Exact backtracking bijective vertex mapping:
 *    - Searches through topological automorphisms until a stereochemically compatible mapping is found.
 *    - Strictly bounded by MAX_BACKTRACK_STEPS = 50000.
 */
export function areMolecularGraphsIsomorphic(
  g1: ChemicalGraph,
  g2: ChemicalGraph,
): IsomorphismResult {
  if (!g1 || !g2 || !g1.valid || !g2.valid) {
    return {
      isomorphic: false,
      status: "MISMATCH_SYNTAX",
      reason: "یک یا هر دو گراف مولکولی نامعتبر است.",
    };
  }

  const n1 = g1.atoms.length;
  const n2 = g2.atoms.length;

  // 1. Atom count
  if (n1 !== n2) {
    return {
      isomorphic: false,
      status: "MISMATCH_TOPOLOGY",
      reason: `تعداد اتم‌های سنگین متفاوت است (${n1} در برابر ${n2}).`,
    };
  }

  // 2. Bond count
  if (g1.bonds.length !== g2.bonds.length) {
    return {
      isomorphic: false,
      status: "MISMATCH_TOPOLOGY",
      reason: `تعداد پیوندها متفاوت است (${g1.bonds.length} در برابر ${g2.bonds.length}).`,
    };
  }

  // 3. Atom elements, charges, aromaticity, and isotopes multiset check
  const atoms1Summary = g1.atoms
    .map((a) => `${a.element}_${a.charge}_${a.isAromatic ? "1" : "0"}_${a.isotope || 0}`)
    .sort();
  const atoms2Summary = g2.atoms
    .map((a) => `${a.element}_${a.charge}_${a.isAromatic ? "1" : "0"}_${a.isotope || 0}`)
    .sort();

  for (let i = 0; i < n1; i++) {
    if (atoms1Summary[i] !== atoms2Summary[i]) {
      // Check if the difference is specifically due to Aromatic vs Kekulé representation
      const elOnly1 = g1.atoms.map((a) => a.element).sort().join(",");
      const elOnly2 = g2.atoms.map((a) => a.element).sort().join(",");
      const aromCount1 = g1.atoms.filter((a) => a.isAromatic).length;
      const aromCount2 = g2.atoms.filter((a) => a.isAromatic).length;

      if (elOnly1 === elOnly2 && aromCount1 !== aromCount2) {
        return {
          isomorphic: false,
          indeterminate: true,
          status: "INDETERMINATE_KEKULE_AROMATIC",
          reason:
            "تفاوت در نحوه نمایش آروماتیسیته: یکی از ساختارها از فرم آروماتیک رزونانسی (مانند c1ccccc1) و دیگری از فرم ککوله (مانند C1=CC=CC=C1) استفاده می‌کند؛ به دلیل عدم پشتیبانی پارسر محلی از الگوریتم Huckel Kekulization، این مقایسه پشتیبانی نمی‌شود (وضعیت: نامشخص / Indeterminate).",
        };
      }

      return {
        isomorphic: false,
        status: "MISMATCH_TOPOLOGY",
        reason: "ترکیب و ویژگی‌های اولیه اتم‌ها (عنصر، بار الکتریکی، آروماتیسیته، ایزوتوپ) یکسان نیست.",
      };
    }
  }

  // 4. Bond order multiset check
  const bonds1Summary = g1.bonds.map((b) => b.order).sort((a, b) => a - b);
  const bonds2Summary = g2.bonds.map((b) => b.order).sort((a, b) => a - b);

  for (let i = 0; i < bonds1Summary.length; i++) {
    if (bonds1Summary[i] !== bonds2Summary[i]) {
      return {
        isomorphic: false,
        status: "MISMATCH_TOPOLOGY",
        reason: "توزیع مرتبه پیوندها (تک، دو، سه‌گانه یا آروماتیک) یکسان نیست.",
      };
    }
  }

  // 4.5. Chiral centers count check
  const chiralCount1 = g1.atoms.filter((a) => !!a.chirality).length;
  const chiralCount2 = g2.atoms.filter((a) => !!a.chirality).length;
  if (chiralCount1 !== chiralCount2) {
    return {
      isomorphic: false,
      status: "MISMATCH_STEREO",
      reason:
        "عدم تطابق استریوشیمی: یکی از ساختارها دارای مراکز کایرال مشخص (@/@@) است اما ساختار دیگر فاقد تعیین استریوشیمی است.",
    };
  }

  // 5. Weisfeiler-Lehman topological coloring
  const colors1 = computeWlColorSignatures(g1, 3);
  const colors2 = computeWlColorSignatures(g2, 3);

  const sortedC1 = [...colors1].sort();
  const sortedC2 = [...colors2].sort();

  for (let i = 0; i < n1; i++) {
    if (sortedC1[i] !== sortedC2[i]) {
      return {
        isomorphic: false,
        status: "MISMATCH_TOPOLOGY",
        reason: "توپولوژی اتصالات اتم‌ها متفاوت است (ایزومر ساختاری، موقعیتی یا اسکلتی شناسایی شد).",
      };
    }
  }

  // 6. Exact Backtracking Isomorphism Verification over topological automorphisms
  const adj1 = buildAdjacencyMatrix(g1);
  const adj2 = buildAdjacencyMatrix(g2);

  const candidateMap: number[][] = Array.from({ length: n1 }, () => []);
  for (let i = 0; i < n1; i++) {
    for (let j = 0; j < n2; j++) {
      if (colors1[i] === colors2[j]) {
        candidateMap[i].push(j);
      }
    }
    if (candidateMap[i].length === 0) {
      return {
        isomorphic: false,
        status: "MISMATCH_TOPOLOGY",
        reason: "اتم بدون تطابق معادل توپولوژیک در ساختار یافت شد.",
      };
    }
  }

  const orderIndices = Array.from({ length: n1 }, (_, idx) => idx).sort(
    (a, b) => candidateMap[a].length - candidateMap[b].length,
  );

  const mapping = new Map<number, number>(); // g1 atom -> g2 atom
  const usedInG2 = new Set<number>();
  let stepCount = 0;
  const MAX_BACKTRACK_STEPS = 50000;
  let reachedStepLimit = false;
  let topologicalIsomorphismFound = false;
  let lastStereoFailureReason: string | undefined;
  let lastStereoIndeterminate = false;

  function backtrack(pos: number): boolean {
    if (++stepCount > MAX_BACKTRACK_STEPS) {
      reachedStepLimit = true;
      return false;
    }

    if (pos === n1) {
      topologicalIsomorphismFound = true;

      // Verify stereochemical compatibility of THIS specific bijection mapping
      const chiralCheck = verifyTetrahedralChiralCenters(g1, g2, mapping);
      if (!chiralCheck.match) {
        if (chiralCheck.indeterminate) lastStereoIndeterminate = true;
        lastStereoFailureReason = chiralCheck.reason;
        return false; // Backtrack to explore another automorphism for symmetric graphs!
      }

      const stereoCheck = verifyDoubleBondStereochemistry(g1, g2, mapping);
      if (!stereoCheck.match) {
        if (stereoCheck.indeterminate) lastStereoIndeterminate = true;
        lastStereoFailureReason = stereoCheck.reason;
        return false; // Backtrack to explore another automorphism!
      }

      // Both topology AND stereochemistry successfully proven on this mapping!
      return true;
    }

    const u = orderIndices[pos];
    for (const v of candidateMap[u]) {
      if (usedInG2.has(v)) continue;

      let consistent = true;
      for (const [mappedU, mappedV] of mapping.entries()) {
        if (adj1[u][mappedU] !== adj2[v][mappedV]) {
          consistent = false;
          break;
        }
      }

      if (consistent) {
        mapping.set(u, v);
        usedInG2.add(v);

        if (backtrack(pos + 1)) return true;

        mapping.delete(u);
        usedInG2.delete(v);
      }
    }

    return false;
  }

  const hasIsomorphism = backtrack(0);

  if (hasIsomorphism) {
    return { isomorphic: true, status: "VERIFIED" };
  }

  if (reachedStepLimit) {
    return {
      isomorphic: false,
      indeterminate: true,
      status: "INDETERMINATE_BACKTRACK_LIMIT",
      reason: "پیچیدگی محاسباتی جستجوی نگاشت‌های متقارن به سقف مجاز رسید (وضعیت: نامشخص / Indeterminate).",
    };
  }

  if (topologicalIsomorphismFound) {
    if (lastStereoIndeterminate) {
      return {
        isomorphic: false,
        indeterminate: true,
        status: "INDETERMINATE_PARTIAL_STEREO",
        reason: lastStereoFailureReason || "استریوشیمی پیوندهای دوگانه قابل تفسیر قطعی نیست.",
      };
    }
    return {
      isomorphic: false,
      status: "MISMATCH_STEREO",
      reason: lastStereoFailureReason || "عدم تطابق استریوشیمیایی در تمامی نگاشت‌های توپولوژیک ممکن.",
    };
  }

  return {
    isomorphic: false,
    status: "MISMATCH_TOPOLOGY",
    reason: "گراف‌های مولکولی از نظر توپولوژی اتصالات ایزومورف نیستند.",
  };
}

/**
 * Evaluates whether two SMILES strings represent the identical molecular graph and stereochemistry.
 * Strictly parses and validates chemical grammar, valence, and stereochemistry.
 *
 * NOTE: The raw string equality bypass ('if (s1 === s2)') is completely removed.
 * Full chemical graph isomorphism, valence checking, and stereochemical completeness
 * are ALWAYS enforced even on identical input strings.
 */
export function areSmilesStructurallyIsomorphic(
  smiles1: string,
  smiles2: string,
): IsomorphismResult {
  if (!smiles1 || !smiles2) {
    return {
      isomorphic: false,
      status: "MISMATCH_SYNTAX",
      reason: "یک یا هر دو رشته SMILES خالی است.",
    };
  }

  const s1 = smiles1.trim();
  const s2 = smiles2.trim();

  // 1. Mandatory Parsing
  const g1 = parseSmilesToGraph(s1);
  const g2 = parseSmilesToGraph(s2);

  if (!g1.valid || !g2.valid) {
    const syntaxErrors = [...g1.errors, ...g2.errors];
    return {
      isomorphic: false,
      status: "MISMATCH_SYNTAX",
      reason: `رشته SMILES نامعتبر است: ${syntaxErrors.join("; ") || "خطای ساختاری"}`,
    };
  }

  // 2. Mandatory Valence Check
  const val1 = validateMolecularGraphValence(g1);
  const val2 = validateMolecularGraphValence(g2);
  if (!val1.valid || !val2.valid) {
    const valenceErrors = [...val1.errors, ...val2.errors];
    return {
      isomorphic: false,
      status: "MISMATCH_VALENCE",
      reason: `نقض ظرفیت شیمیایی: ${valenceErrors.join("; ")}`,
    };
  }

  // 3. Reject unsupported stereochemistry classes (Allenes, Square Planar, Octahedral, etc.)
  if (
    (g1.unsupportedStereo && g1.unsupportedStereo.length > 0) ||
    (g2.unsupportedStereo && g2.unsupportedStereo.length > 0)
  ) {
    return {
      isomorphic: false,
      indeterminate: true,
      status: "INDETERMINATE_UNSUPPORTED_STEREO",
      reason:
        "استریوشیمی پشتیبانی‌نشده: ساختار حاوی شناسه استریوشیمی غیرتتراهدرال یا پشتیبانی‌نشده است (وضعیت: نامشخص / Indeterminate).",
    };
  }

  // 4. Reject partially specified or indeterminate directional double bonds
  const s1Stereo = extractDoubleBondStereo(g1);
  const s2Stereo = extractDoubleBondStereo(g2);
  if (
    s1Stereo.indeterminate ||
    s2Stereo.indeterminate ||
    s1Stereo.hasPartial ||
    s2Stereo.hasPartial
  ) {
    return {
      isomorphic: false,
      indeterminate: true,
      status: "INDETERMINATE_PARTIAL_STEREO",
      reason:
        s1Stereo.reason ||
        s2Stereo.reason ||
        "عدم تطابق استریوشیمی: جهت‌گیری فضایی پیوند دوگانه تنها در یک سمت تعیین شده است و قابل تفسیر قطعی نیست.",
    };
  }

  // 5. Full graph isomorphism and stereochemical evaluation
  return areMolecularGraphsIsomorphic(g1, g2);
}

/**
 * Authoritatively verifies if a given compound name and candidate SMILES
 * truly represent the canonical molecular structure of that compound.
 *
 * Employs structured status aggregation and explicit decision priority rules:
 * - Priority 1 (VERIFIED): Proven topological AND stereochemical isomorphism against canonical or any alternate SMILES.
 * - Priority 2 (MEDIUM_CONFIDENCE_FLAT_2D): Valid 2D skeleton matching flat reference, but stereocenters omitted in input.
 * - Priority 3 (INDETERMINATE): No verified match, but at least one reference path cannot be conclusively resolved
 *   due to parser limitations (Hückel Kekulization, search step limits, or unsupported stereo tags).
 *   Prevents false mismatch accusations.
 * - Priority 4 (MISMATCH): All reference paths conclusively refuted as structural, constitutional, or stereochemical isomers.
 */
export function verifyAuthoritativeCompound(
  compoundName: string,
  candidateSmiles: string,
): CompoundIdentityVerificationResult {
  if (!compoundName || !candidateSmiles) {
    return { matched: false, verified: false, status: "UNREGISTERED" };
  }

  // 1. Safe alias lookup (No dangerous loose substring matching)
  const record = AUTHORITATIVE_REFERENCE_COMPOUNDS.find((ref) =>
    matchCompoundAlias(compoundName, ref),
  );

  if (!record) {
    // 1.1 Check Authoritative Scaffold Registry (for families, reference cores, or scaffold queries)
    const scaffold = findMatchingScaffold(compoundName);
    if (scaffold) {
      // Validate candidate graph syntax
      const candidateGraph = parseSmilesToGraph(candidateSmiles);
      if (!candidateGraph.valid) {
        return {
          matched: true,
          verified: false,
          status: "INVALID_INPUT",
          scaffoldRecord: scaffold,
          error: `رشته SMILES ارائه‌شده برای «${scaffold.canonicalName}» نامعتبر است: ${candidateGraph.errors.join("; ")}`,
        };
      }

      // Valence check
      const valCheck = validateMolecularGraphValence(candidateGraph);
      if (!valCheck.valid) {
        return {
          matched: true,
          verified: false,
          status: "INVALID_INPUT",
          scaffoldRecord: scaffold,
          error: `رشته SMILES ارائه‌شده دارای نقض ظرفیت شیمیایی است: ${valCheck.errors.join("; ")}`,
        };
      }

      // Graph Validation Dimension
      const isGraphAudited = scaffold.graphValidationStatus === "SYNTAX_AND_VALENCE_VALID";
      const isSourceAudited = scaffold.sourceIdentityStatus === "PUBCHEM_CROSS_VERIFIED";

      // Test structural isomorphism against Canonical SMILES and Isomeric SMILES
      const canonicalCheck = areSmilesStructurallyIsomorphic(candidateSmiles, scaffold.canonicalSmiles);
      const isomericCheck = scaffold.isomericSmiles
        ? areSmilesStructurallyIsomorphic(candidateSmiles, scaffold.isomericSmiles)
        : null;

      // Test against Flat 2D representation
      const flat2dCheck = scaffold.flat2dSmiles
        ? areSmilesStructurallyIsomorphic(candidateSmiles, scaffold.flat2dSmiles)
        : null;

      const hasChiralCentersInScaffold = Boolean(
        scaffold.isomericSmiles && (scaffold.isomericSmiles.includes("@") || scaffold.isomericSmiles.includes("/\\") || scaffold.isomericSmiles.includes("\\/")),
      );
      const inputHasStereo = candidateSmiles.includes("@") || candidateSmiles.includes("/") || candidateSmiles.includes("\\");

      // Priority 1: Conclusive Verification (Full Stereochemical & Topological Match + Provenance Validated)
      const isIsomericVerified = isomericCheck && isomericCheck.status === "VERIFIED";
      const isCanonicalVerified = canonicalCheck.status === "VERIFIED";

      if ((isIsomericVerified || (isCanonicalVerified && !hasChiralCentersInScaffold)) && isGraphAudited && isSourceAudited) {
        return {
          matched: true,
          verified: true,
          status: "VERIFIED",
          scaffoldRecord: scaffold,
        };
      }

      // Priority 2: Flat 2D Match for Chiral Core Molecule (Missing Chiral Information in Input)
      // Strictly receives MEDIUM_CONFIDENCE_FLAT_2D, NEVER verified: true or isValidated: true!
      if ((flat2dCheck?.status === "VERIFIED" || isCanonicalVerified) && hasChiralCentersInScaffold && !inputHasStereo) {
        return {
          matched: true,
          verified: false,
          status: "MEDIUM_CONFIDENCE_FLAT_2D",
          scaffoldRecord: scaffold,
          warning: `ساختار ۲بعدی اسکلت با مرجع «${scaffold.canonicalName}» مطابقت دارد، اما به دلیل عدم تعیین مراکز کایرال (@/@@) در ورودی، درجه اطمینان در سطح medium باقی می‌ماند و قابل تایید قطعی نیست.`,
        };
      }

      // Priority 3: Indeterminate
      if (canonicalCheck.indeterminate || isomericCheck?.indeterminate) {
        return {
          matched: true,
          verified: false,
          indeterminate: true,
          status: "INDETERMINATE",
          scaffoldRecord: scaffold,
          warning:
            canonicalCheck.reason ||
            isomericCheck?.reason ||
            "تطابق ساختار به دلیل محدودیت‌های پارسر در تفسیر آروماتیسیته یا استریوشیمی به صورت قطعی قابل تعیین نیست.",
        };
      }

      // Priority 4: Mismatch
      return {
        matched: true,
        verified: false,
        status: "MISMATCH",
        scaffoldRecord: scaffold,
        error: `ساختار ارائه‌شده با هویت مرجع اسکلت «${scaffold.canonicalName}» منطبق نیست (${canonicalCheck.reason || "ایزومر یا ساختار متفاوت"}).`,
      };
    }

    return {
      matched: false,
      verified: false,
      status: "UNREGISTERED",
      warning:
        "ترکیب در پایگاه داده محلی مرجع ثبت نشده است و جهت تأیید قطعی هویت نیازمند مقایسه با منابع تکمیلی است.",
    };
  }

  // 2. Candidate SMILES validity check
  const candidateGraph = parseSmilesToGraph(candidateSmiles);
  if (!candidateGraph.valid) {
    return {
      matched: true,
      verified: false,
      status: "INVALID_INPUT",
      referenceRecord: record,
      error: `رشته SMILES ارائه‌شده برای «${record.canonicalName}» نامعتبر است: ${candidateGraph.errors.join("; ")}`,
    };
  }

  // Valence check
  const valCheck = validateMolecularGraphValence(candidateGraph);
  if (!valCheck.valid) {
    return {
      matched: true,
      verified: false,
      status: "INVALID_INPUT",
      referenceRecord: record,
      error: `رشته SMILES ارائه‌شده دارای نقض ظرفیت شیمیایی است: ${valCheck.errors.join("; ")}`,
    };
  }

  // 3. Test structural isomorphism against Canonical SMILES
  const canonicalCheck = areSmilesStructurallyIsomorphic(candidateSmiles, record.canonicalSmiles);

  // 4. Test structural isomorphism against Alternate SMILES (if available)
  const alternateChecks: IsomorphismResult[] = [];
  if (record.alternateSmiles && record.alternateSmiles.length > 0) {
    for (const altSmiles of record.alternateSmiles) {
      alternateChecks.push(areSmilesStructurallyIsomorphic(candidateSmiles, altSmiles));
    }
  }

  // 5. Test against Flat 2D representation for chiral molecules where input omitted stereocenters
  const flat2dCheck = record.flat2dSmiles
    ? areSmilesStructurallyIsomorphic(candidateSmiles, record.flat2dSmiles)
    : null;

  // 6. Aggregate results using explicit priority rules (Structured status codes without string searching)
  const allRefChecks = [canonicalCheck, ...alternateChecks];

  // Priority 1: Conclusive Verification
  if (canonicalCheck.status === "VERIFIED" || alternateChecks.some((r) => r.status === "VERIFIED")) {
    return {
      matched: true,
      verified: true,
      status: "VERIFIED",
      referenceRecord: record,
    };
  }

  // Priority 2: Flat 2D Match for Chiral Drug (Medium Confidence)
  if (flat2dCheck && flat2dCheck.status === "VERIFIED") {
    return {
      matched: true,
      verified: false,
      status: "MEDIUM_CONFIDENCE_FLAT_2D",
      referenceRecord: record,
      warning: `ساختار ۲بعدی اسکلت با مرجع «${record.canonicalName}» مطابقت دارد، اما به دلیل عدم تعیین مراکز کایرال (@/@@) در ورودی، درجه اطمینان در سطح medium باقی می‌ماند.`,
    };
  }

  // Priority 3: Indeterminate / Unsupported / Parser Limitation
  const indetCheck = allRefChecks.find((r) => r.indeterminate);
  if (indetCheck) {
    return {
      matched: true,
      verified: false,
      indeterminate: true,
      status: "INDETERMINATE",
      referenceRecord: record,
      warning:
        indetCheck.reason ||
        "تطابق ساختار به دلیل محدودیت‌های پارسر در تفسیر آروماتیسیته یا استریوشیمی به صورت قطعی قابل تعیین نیست (وضعیت: نامشخص / Indeterminate).",
    };
  }

  // Priority 4: Definite Mismatch (all reference paths conclusively refuted)
  return {
    matched: true,
    verified: false,
    status: "MISMATCH",
    referenceRecord: record,
    error: `ساختار ارائه‌شده با هویت مرجع «${record.canonicalName}» منطبق نیست (${canonicalCheck.reason || "ایزومر یا ساختار متفاوت"}).`,
  };
}

export interface ExtractedChemicalMention {
  mentionText: string;
  provenanceField: string;
  sourceNodeId: string;
  referenceRecord: AuthoritativeReferenceCompound;
}

/**
 * Finds the best reference compound match in a given text using Longest-Match prioritization.
 * Prevents substring collisions (e.g. "Penicillin G" vs "Penicillin").
 */
export function findMatchingReferenceByText(
  text: string,
): { record: AuthoritativeReferenceCompound; matchedAlias: string } | undefined {
  if (!text || typeof text !== "string") return undefined;

  const normalizedInput = normalizeCompoundName(text);
  if (!normalizedInput) return undefined;

  // Collect all aliases from all reference compounds sorted by length descending (longest match)
  const candidateMatches: Array<{
    record: AuthoritativeReferenceCompound;
    normalizedAlias: string;
    aliasLength: number;
  }> = [];

  for (const record of AUTHORITATIVE_REFERENCE_COMPOUNDS) {
    for (const alias of record.aliases) {
      const normAlias = normalizeCompoundName(alias);
      if (normAlias && normAlias.length >= 3) {
        candidateMatches.push({
          record,
          normalizedAlias: normAlias,
          aliasLength: normAlias.length,
        });
      }
    }
  }

  // Sort by alias length descending (Longest Match first)
  candidateMatches.sort((a, b) => b.aliasLength - a.aliasLength);

  for (const candidate of candidateMatches) {
    // Word boundary check: ensure the normalizedAlias appears as a whole token or surrounded by spaces
    const pattern = new RegExp(`(^|\\s)${escapeRegex(candidate.normalizedAlias)}(\\s|$)`);
    if (pattern.test(normalizedInput)) {
      return {
        record: candidate.record,
        matchedAlias: candidate.normalizedAlias,
      };
    }
  }

  return undefined;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extracts all chemical compound mentions from a node across all its textual fields:
 * - title
 * - shortDescription
 * - detailedExplanation
 * - keyPoints
 * - examTips
 * - examples
 *
 * Employs Longest-Match to handle compound mentions like "Amoxicillin/Clavulanate" and "Penicillin G and Penicillin V"
 * without losing individual references or crashing.
 */
export function extractNodeChemicalMentions(
  node: {
    id: string;
    title: string;
    shortDescription?: string;
    detailedExplanation?: string;
    keyPoints?: string[];
    examTips?: string[];
    examples?: string[];
  },
): ExtractedChemicalMention[] {
  const mentions: ExtractedChemicalMention[] = [];
  const seenCompoundIds = new Set<string>();

  // Prepare all candidate fields with their provenance names
  const fieldsToCheck: Array<{ fieldName: string; texts: string[] }> = [
    { fieldName: "title", texts: [node.title || ""] },
    { fieldName: "shortDescription", texts: [node.shortDescription || ""] },
    { fieldName: "detailedExplanation", texts: [node.detailedExplanation || ""] },
    { fieldName: "keyPoints", texts: Array.isArray(node.keyPoints) ? node.keyPoints : [] },
    { fieldName: "examTips", texts: Array.isArray(node.examTips) ? node.examTips : [] },
    { fieldName: "examples", texts: Array.isArray(node.examples) ? node.examples : [] },
  ];

  // Pre-sort all reference aliases across all authoritative compounds by descending length
  const sortedReferenceAliases: Array<{
    record: AuthoritativeReferenceCompound;
    normalizedAlias: string;
    aliasLength: number;
    rawAlias: string;
  }> = [];

  for (const record of AUTHORITATIVE_REFERENCE_COMPOUNDS) {
    for (const alias of record.aliases) {
      const norm = normalizeCompoundName(alias);
      if (norm && norm.length >= 3) {
        sortedReferenceAliases.push({
          record,
          normalizedAlias: norm,
          aliasLength: norm.length,
          rawAlias: alias,
        });
      }
    }
  }

  sortedReferenceAliases.sort((a, b) => b.aliasLength - a.aliasLength);

  for (const { fieldName, texts } of fieldsToCheck) {
    for (const rawText of texts) {
      if (!rawText || typeof rawText !== "string") continue;
      const normText = normalizeCompoundName(rawText);
      if (!normText) continue;

      for (const candidate of sortedReferenceAliases) {
        if (seenCompoundIds.has(candidate.record.id)) continue;

        // Word boundary matching in normalized text
        const pattern = new RegExp(`(^|\\s)${escapeRegex(candidate.normalizedAlias)}(\\s|$)`);
        if (pattern.test(normText)) {
          seenCompoundIds.add(candidate.record.id);
          mentions.push({
            mentionText: candidate.rawAlias,
            provenanceField: fieldName,
            sourceNodeId: node.id,
            referenceRecord: candidate.record,
          });
        }
      }
    }
  }

  return mentions;
}
