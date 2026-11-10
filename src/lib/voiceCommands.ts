// Turns what was said into actions to log. The rules must match the iOS app (VoiceCommands.swift);
// docs/fixtures/voice-commands.json holds the phrases and expected results both apps are tested against.
//
// The parser is deliberately conservative: questions, instructions ("give adrenaline"), plans
// ("adrenaline due") and contradictions log nothing, because a wrong entry is worse than asking again.

export type VoiceAction =
  | { type: "drug"; drug: "adrenaline" | "amiodarone" | "lidocaine"; dose: string | null }
  | { type: "analyse" }
  | { type: "rhythm"; rhythm: "VF" | "VT" | "PEA" | "Asystole" | "Shockable" | "Non-shockable" }
  | { type: "shock"; energy: string | null }
  | { type: "rosc" }
  | { type: "undo" }
  | { type: "airway"; device: "sga" | "ett" | "unspecified" }
  | { type: "access"; route: "IV" | "IO"; successful: boolean; gauge: string | null; location: string | null }
  | { type: "etco2"; value: number; unit: "kPa" | "mmHg" | null }
  // Handover ("resus started 10 minutes ago, 2 shocks, in VF"): what happened before eResus was started.
  | { type: "started"; time: VoiceTime } // when the first ambulance resource confirmed the arrest
  | { type: "given"; item: GivenItem; count: number } // times unknown
  | { type: "earlierRhythm"; rhythm: Rhythm } // recorded only; doesn't start a rhythm check
  | { type: "otherDrug"; drug: string; dose: string | null } // from the Other Meds list, by its listed name
  | { type: "procedure"; procedure: string } // a trauma intervention; thoracostomy without a side is refused
  | { type: "trauma" } // treat as a traumatic arrest
  | { type: "observation"; kind: ObservationKind; value: string }; // mostly post-ROSC

// shock, adrenaline, amiodarone, lidocaine, or an Other Meds drug or trauma intervention by name.
export type GivenItem = string;
export type ObservationKind = "spo2" | "bp" | "glucose" | "temperature" | "ecg";
type SaidReading = ObservationKind | "map";
type Rhythm = "VF" | "VT" | "PEA" | "Asystole" | "Shockable" | "Non-shockable";

// twelveHour: said without am/pm and could be either (e.g. "at 2:52"); the app picks the most recent.
export type VoiceTime = { clock: string; twelveHour?: true } | { secondsAgo: number };

// downtime: pre-arrival downtime isn't recorded, so it can never be counted towards ToR by mistake.
// countUnclear: "2 shocks" mid-arrest could be a running total; earlier doses need "before eResus" or similar.
export type VoiceReason = "question" | "instruction" | "notGiven" | "conflict" | "nothing" | "downtime" | "countUnclear";

export interface VoiceParse {
  actions: VoiceAction[];
  time: VoiceTime | null;
  reason: VoiceReason | null;
}

// Wake words for hands-free listening. Recognisers spell "eResus" in several ways.
export const WAKE_WORDS = {
  scribe: ["scribe"],
  eresus: ["eresus", "e resus", "ee resus", "e rescues", "e rescue", "eresas"],
} as const;

export type WakeWord = keyof typeof WAKE_WORDS;

// Words to bias recognition towards.
export const VOICE_VOCABULARY = [
  "adrenaline", "amiodarone", "lidocaine", "milligrams", "micrograms", "rhythm check", "VF", "VT", "PEA",
  "asystole", "shockable", "shock delivered", "joules", "ROSC", "undo", "i-gel", "intubated", "IV", "IO",
  "ETCO2", "kPa", "scribe", "eResus", "TXA", "tranexamic acid", "naloxone", "atropine", "calcium chloride",
  "sodium bicarbonate", "magnesium", "tenecteplase", "ketamine", "rocuronium", "pelvic binder", "tourniquet",
  "thoracostomy", "needle decompression", "sats", "BM", "blood pressure", "12 lead", "STEMI", "trauma",
];

// ---------------------------------------------------------------------------------------------
// Phrases. Longest match wins at each position.

type Kind =
  | { type: "drug"; drug: "adrenaline" | "amiodarone" | "lidocaine" }
  | { type: "analyse" }
  | { type: "rhythm"; rhythm: "VF" | "VT" | "PEA" | "Asystole" | "Shockable" | "Non-shockable" }
  | { type: "shock" }
  | { type: "rosc" }
  | { type: "undo" }
  | { type: "airway"; device: "sga" | "ett" | "unspecified" }
  | { type: "access"; route: "IV" | "IO" }
  | { type: "etco2" }
  | { type: "otherDrug"; drug: string }
  | { type: "procedure"; procedure: string }
  | { type: "trauma" }
  | { type: "observation"; kind: SaidReading };

const otherDrug = (phrases: string[], drug: string): [string, Kind][] => phrases.map((p) => [p, { type: "otherDrug", drug }]);
const procedure = (phrases: string[], name: string): [string, Kind][] => phrases.map((p) => [p, { type: "procedure", procedure: name }]);
const observation = (phrases: string[], kind: SaidReading): [string, Kind][] => phrases.map((p) => [p, { type: "observation", kind }]);

const PHRASES: [string, Kind][] = [
  ...["adrenaline", "adrenalin", "epinephrine", "epi", "adrenalines"].map((p): [string, Kind] => [p, { type: "drug", drug: "adrenaline" }]),
  ...["amiodarone", "amio", "amiodarone's", "cordarone"].map((p): [string, Kind] => [p, { type: "drug", drug: "amiodarone" }]),
  ...["lidocaine", "lignocaine", "lido", "xylocaine"].map((p): [string, Kind] => [p, { type: "drug", drug: "lidocaine" }]),
  ...[
    "rhythm check", "check rhythm", "check the rhythm", "analyse", "analyze", "analyse rhythm", "analyze rhythm",
    "analyse the rhythm", "analyze the rhythm", "analysing", "analyzing", "pulse check", "rhythm and pulse check",
    "pulse and rhythm check",
  ].map((p): [string, Kind] => [p, { type: "analyse" }]),
  ...["vf", "v f", "vfib", "v fib", "ventricular fibrillation"].map((p): [string, Kind] => [p, { type: "rhythm", rhythm: "VF" }]),
  ...["vt", "v t", "vtach", "v tach", "ventricular tachycardia", "pvt", "p vt"].map((p): [string, Kind] => [p, { type: "rhythm", rhythm: "VT" }]),
  ...["pea", "p e a", "pulseless electrical activity", "electrical activity"].map((p): [string, Kind] => [p, { type: "rhythm", rhythm: "PEA" }]),
  ...["asystole", "a systole", "asystolic", "flat line", "flatline", "flatlined"].map((p): [string, Kind] => [p, { type: "rhythm", rhythm: "Asystole" }]),
  ...["shockable", "shockable rhythm", "shock advised"].map((p): [string, Kind] => [p, { type: "rhythm", rhythm: "Shockable" }]),
  ...["non shockable", "nonshockable", "not shockable", "unshockable", "no shock advised", "shock not advised"].map(
    (p): [string, Kind] => [p, { type: "rhythm", rhythm: "Non-shockable" }],
  ),
  ...["shock", "shocks", "shocked", "shocking", "shock delivered", "shock given", "delivered shock", "defib", "defibbed", "defibrillated"].map(
    (p): [string, Kind] => [p, { type: "shock" }],
  ),
  ...[
    "rosc", "r o s c", "rosk", "return of spontaneous circulation", "return of circulation", "got a pulse",
    "got pulse", "pulse is back", "pulse back", "we have a pulse", "pulse present",
  ].map((p): [string, Kind] => [p, { type: "rosc" }]),
  ...["undo", "scratch that", "cancel that", "delete that", "remove that", "ignore that", "that is wrong"].map(
    (p): [string, Kind] => [p, { type: "undo" }],
  ),
  ...["i gel", "igel", "sga", "supraglottic", "supra glottic", "lma", "laryngeal mask"].map((p): [string, Kind] => [p, { type: "airway", device: "sga" }]),
  ...["intubated", "intubation", "tube is in", "tube in", "et tube", "ett", "endotracheal", "endotracheal tube"].map(
    (p): [string, Kind] => [p, { type: "airway", device: "ett" }],
  ),
  ...["airway in", "airway is in", "airway placed", "advanced airway"].map((p): [string, Kind] => [p, { type: "airway", device: "unspecified" }]),
  ...["iv", "i v", "cannula", "cannulated", "venflon"].map((p): [string, Kind] => [p, { type: "access", route: "IV" }]),
  ...["io", "i o", "intraosseous", "ez io", "ezio"].map((p): [string, Kind] => [p, { type: "access", route: "IO" }]),
  ...["etco2", "et co2", "etco 2", "et co 2", "e t c o 2", "e t co2", "end tidal", "end tidal co2", "co2", "capnography"].map((p): [string, Kind] => [p, { type: "etco2" }]),

  // Other Meds, by the name on the list. Short forms that are easily misheard in noise ("mag", "sux", "roc",
  // "calc") are left out on purpose. Bare "glucose" is a reading (below), not the drug.
  ...otherDrug(["atropine"], "Atropine"),
  ...otherDrug(["adenosine"], "Adenosine"),
  ...otherDrug(["calcium", "calcium chloride"], "Calcium chloride 10%"),
  ...otherDrug(["calcium gluconate"], "Calcium gluconate 10%"),
  ...otherDrug(["magnesium", "magnesium sulphate", "magnesium sulfate", "mag sulphate", "mag sulph"], "Magnesium sulphate"),
  ...otherDrug(["bicarb", "bicarbonate", "sodium bicarbonate", "sodium bicarb"], "Sodium bicarbonate 8.4%"),
  ...otherDrug(["adrenaline infusion", "adrenaline infusion started", "epinephrine infusion", "adrenaline drip", "adrenaline running"], "Adrenaline infusion"),
  ...otherDrug(["push dose adrenaline", "push dose epi", "push dose of adrenaline", "push dose epinephrine"], "Adrenaline push-dose"),
  ...otherDrug(["noradrenaline", "norad", "norepinephrine", "nor adrenaline", "nora adrenaline", "noradrenaline infusion"], "Noradrenaline infusion"),
  ...otherDrug(["naloxone", "narcan"], "Naloxone"),
  ...otherDrug(["glucagon"], "Glucagon"),
  ...otherDrug(["intralipid", "lipid emulsion", "lipid"], "Lipid emulsion 20%"),
  ...otherDrug(["flumazenil"], "Flumazenil"),
  ...otherDrug(["hydroxocobalamin", "cyanokit"], "Hydroxocobalamin"),
  ...otherDrug(["dextrose", "10 percent glucose", "glucose 10 percent"], "Glucose 10%"),
  ...otherDrug(["insulin", "insulin and dextrose", "insulin and glucose"], "Insulin & glucose"),
  ...otherDrug(["potassium chloride"], "Potassium chloride"),
  ...otherDrug(["hydrocortisone"], "Hydrocortisone"),
  ...otherDrug(["salbutamol", "ventolin"], "Salbutamol"),
  ...otherDrug(["ipratropium", "atrovent"], "Ipratropium bromide"),
  ...otherDrug(["alteplase"], "Alteplase"),
  ...otherDrug(["tenecteplase", "tnk"], "Tenecteplase"),
  ...otherDrug(["normal saline", "sodium chloride", "saline bolus", "bag of saline", "bolus of saline"], "Sodium chloride 0.9%"),
  ...otherDrug(["hartmann", "hartmanns", "hartmann is", "hartmann solution"], "Hartmann’s solution"),
  ...otherDrug(["packed red cells", "red cells", "unit of blood", "units of blood", "prbc", "prbcs"], "Packed red cells"),
  ...otherDrug(["whole blood"], "Whole blood"),
  ...otherDrug(["plasma", "ffp", "lyoplas"], "Plasma"),
  ...otherDrug(["fibrinogen"], "Fibrinogen concentrate"),
  ...otherDrug(["txa", "t x a", "tranexamic", "tranexamic acid"], "Tranexamic acid"),
  ...otherDrug(["ketamine"], "Ketamine"),
  ...otherDrug(["midazolam", "midaz"], "Midazolam"),
  ...otherDrug(["fentanyl"], "Fentanyl"),
  ...otherDrug(["morphine"], "Morphine"),
  ...otherDrug(["propofol"], "Propofol"),
  ...otherDrug(["rocuronium"], "Rocuronium"),
  ...otherDrug(["suxamethonium", "succinylcholine"], "Suxamethonium"),
  ...otherDrug(["ondansetron"], "Ondansetron"),

  // Trauma interventions. Chest procedures take their side from nearby words.
  ...procedure(["pelvic binder", "binder", "pelvic splint", "sam pelvic sling", "pelvic sling", "sam sling", "t pod", "prometheus"], "Pelvic binder"),
  ...procedure(["tourniquet", "tourniquets", "cat tourniquet", "tq"], "Tourniquet"),
  ...procedure(["traction splint", "kendrick", "kts"], "Traction splint"),
  ...procedure(
    ["wound packing", "packed the wound", "haemostatic", "hemostatic", "haemostatic dressing", "hemostatic dressing", "celox",
     "quikclot", "quick clot", "chitogauze", "packed it"],
    "Haemostatic dressing / packing",
  ),
  ...procedure(
    ["needle decompression", "needle decompressed", "needle thoracocentesis", "needled", "needle decompress",
     "needle thoracostomy", "needle thoracostomies", "decompressed the chest", "chest decompression", "needled the chest"],
    "Needle decompression",
  ),
  ...procedure(["thoracostomy", "thoracostomies", "finger thoracostomy", "simple thoracostomy", "finger thoracostomies"], "Thoracostomy"),
  // Never bare "thoracotomy": it's too close to "thoracostomy" for speech recognition.
  ...procedure(["clamshell", "clam shell", "resuscitative thoracotomy", "clamshell thoracotomy"], "Thoracotomy"),
  ...procedure(["reboa"], "REBOA"),
  ...procedure(
    ["critical care requested", "hems requested", "hems activated", "enhanced care requested", "critical care activated", "air ambulance requested",
     "doctor requested", "ccp requested", "critical care paramedic requested", "aircrew requested", "merit requested", "basics doctor requested"],
    "Enhanced / critical care requested",
  ),
  ...["trauma arrest", "traumatic arrest", "traumatic cardiac arrest", "trauma cardiac arrest", "arrest due to trauma"].map((p): [string, Kind] => [p, { type: "trauma" }]),

  // Readings, mostly after ROSC.
  ...observation(["sats", "sat", "spo2", "sp o2", "saturations", "saturating", "o2 sats", "oxygen sats", "oxygen saturation"], "spo2"),
  ...observation(["bp", "b p", "blood pressure", "pressure", "systolic", "systolic of"], "bp"),
  ...observation(["map", "mean arterial pressure"], "map"),
  ...observation(["bm", "b m", "cbg", "blood sugar", "blood glucose", "sugar", "sugars", "glucose", "blood sugars"], "glucose"),
  ...observation(["temp", "temperature", "temp is", "tympanic temp", "tympanic temperature"], "temperature"),
  ...observation(["12 lead", "12 lead ecg", "stemi", "nstemi", "st elevation", "st elevations"], "ecg"),
].map(([p, k]) => [p.replace(/'s$/, " is"), k]);

const QUESTION_STARTS = new Set(["is", "are", "should", "do", "does", "did", "can", "could", "what", "why", "when", "how", "who", "shall", "has"]);

// Words near a mention that mean it hasn't happened (yet).
const NOT_GIVEN_BEFORE = new Set([
  "no", "not", "without", "hold", "withhold", "withholding", "holding", "draw", "drawing", "prepare", "preparing",
  "get", "getting", "need", "needs", "want", "skip", "failed", "failure", "unable", "lost", "charging", "charge", "nil",
]);
const NOT_GIVEN_AFTER = new Set(["due", "next", "ready", "needed", "drawn", "prepared", "soon", "failed", "not"]);
const INSTRUCTION_BEFORE = new Set(["give", "giving", "administer"]);
const INSTRUCTION_AFTER = new Set(["please"]);

// Small words that can sit between an action and its number ("ETCO2 is 3.8", "adrenaline given 1 mg").
const FILLERS = new Set(["is", "of", "was", "now", "about", "around", "reading", "given", "at"]);

// When the arrest was confirmed. Kept narrow: "on scene" can mean arrival before the arrest, which would
// wrongly lengthen the ToR clock. "CPR started" is accepted because crews say it, but never alongside
// bystander or family wording, and the banner reads back what it was taken to mean.
const STARTED_ANCHORS = [
  "cpr started", "started cpr", "compressions started", "started compressions",
  "arrest confirmed", "confirmed arrest", "confirmed the arrest", "confirmed cardiac arrest", "cardiac arrest confirmed",
  "resus started", "started resus", "started the resus", "resuscitation started", "started resuscitation",
  "been going",
];
// Words that make a count history rather than something just done ("2 shocks before we arrived").
const HISTORY_MARKERS = ["before", "already", "earlier", "previously", "prior", "so far", "last"];
const DOWNTIME_PHRASES = ["downtime", "down time", "down for", "no flow", "noflow", "collapsed", "collapse", "bystander", "bystanders", "last seen"];
// Only a problem alongside a "started" anchor ("family started CPR", "found 10 minutes ago").
const DOWNTIME_WITH_STARTED = ["family", "public", "found", "999", "call", "called"];
const COUNT_WORDS: Record<string, number> = { once: 1, twice: 2, thrice: 3 };

const ACCESS_FAILURE = new Set(["failed", "fail", "unsuccessful", "missed", "tissued", "blown", "lost"]);

const UNITS: [string, string][] = [
  ["millimetres of mercury", "mmHg"], ["millimeters of mercury", "mmHg"], ["mm of mercury", "mmHg"], ["mm hg", "mmHg"],
  ["mmhg", "mmHg"], ["kilopascals", "kPa"], ["kilopascal", "kPa"], ["kpa", "kPa"],
  ["milligrams", "mg"], ["milligram", "mg"], ["mgs", "mg"], ["mg", "mg"], ["milli", "mg"],
  ["micrograms", "mcg"], ["microgram", "mcg"], ["mcg", "mcg"], ["ug", "mcg"], ["mics", "mcg"],
  ["joules", "J"], ["joule", "J"], ["j", "J"],
  ["grams", "g"], ["gram", "g"], ["millilitres", "ml"], ["milliliters", "ml"], ["mls", "ml"], ["ml", "ml"],
  ["millimoles", "mmol"], ["millimole", "mmol"], ["mmol", "mmol"], ["units", "units"],
  ["gauge", "G"], ["g", "G"],
];

const UNIT_FOR: Record<string, Kind["type"]> = {
  mg: "drug", mcg: "drug", g: "drug", ml: "drug", mmol: "drug", units: "drug", J: "shock", kPa: "etco2", mmHg: "etco2", G: "access",
};

const TARGET_WORDS = new Set(["target", "targets", "aim", "aiming", "keep", "titrate", "titrating", "goal", "above", "below", "between", "range", "over"]);
const UNSURE_WORDS = new Set(["query", "possible", "possibly", "suspected", "likely", "maybe", "probable", "questionable"]);
const GLUCOSE_DRUG_WORDS = new Set(["ml", "mls", "millilitres", "g", "grams", "percent", "give", "giving", "bolus"]);

const SITES: [string, string][] = [
  ["antecubital", "AC"], ["ac", "AC"], ["hand", "hand"], ["wrist", "wrist"], ["forearm", "forearm"], ["foot", "foot"],
  ["ankle", "ankle"], ["external jugular", "EJ"], ["jugular", "EJ"], ["ej", "EJ"], ["humerus", "humerus"],
  ["humeral", "humerus"], ["tibia", "tibia"], ["tibial", "tibia"], ["sternum", "sternum"], ["sternal", "sternum"],
];
const SITE_WORDS = new Set(SITES.flatMap(([phrase]) => phrase.split(" ")));

// ---------------------------------------------------------------------------------------------
// Normalising

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

export const formatNumber = (n: number): string => String(Math.round(n * 100) / 100);

export const normalise = (text: string): string[] => {
  let s = text.toLowerCase().replace(/[’‘]/g, "'");
  s = s.replace(/n't\b/g, " not").replace(/'ve\b/g, " have").replace(/'re\b/g, " are").replace(/'ll\b/g, " will").replace(/'s\b/g, " is");
  // "10%" stays a percentage, so "10% glucose" is the drug rather than a BM of 10.
  s = s.replace(/%/g, " percent ");
  // Dots go unless they're a decimal point: "v.f." -> "vf", "4.2" stays.
  s = s.replace(/(?<!\d)\.|\.(?!\d)/g, "");
  // Keep "14:52"; anything else that isn't a letter, digit or decimal point is a space.
  s = s.replace(/(\d):(\d)/g, "$1\u0000$2").replace(/[^\p{L}\p{N}.\u0000]+/gu, " ").replace(/\u0000/g, ":");
  // Split numbers glued to units or am/pm: "1mg" -> "1 mg", "2:52pm" -> "2:52 pm".
  s = s.replace(/(\d)([a-z])/g, "$1 $2");
  return numberWordsToDigits(s.trim().split(/\s+/).filter(Boolean));
};

// "three hundred" -> 300, "one hundred and fifty" -> 150, "four point five" -> 4.5,
// "fourteen fifty two" -> 14 52 (kept apart, as in a time).
const numberWordsToDigits = (words: string[]): string[] => {
  const out: string[] = [];
  let current: number | null = null;
  let decimal: string | null = null;
  const flush = () => {
    if (current !== null) out.push(decimal ? `${current}.${decimal}` : String(current));
    current = null;
    decimal = null;
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const value = NUMBER_WORDS[word];
    const startsNumber = value !== undefined && !(word === "oh" && current === null);
    if (decimal !== null) {
      if (value !== undefined && value < 10) {
        decimal += String(value);
        continue;
      }
      flush();
    }
    if (word === "hundred" && (current !== null || words[i - 1] === "a")) {
      if (current === null) out.pop(); // the "a" in "a hundred"
      current = (current ?? 1) * 100;
      continue;
    }
    if (word === "and" && current !== null && current % 100 === 0 && NUMBER_WORDS[words[i + 1]] !== undefined) continue;
    if (word === "point" && (current !== null || NUMBER_WORDS[words[i + 1]] !== undefined)) {
      current ??= 0;
      decimal = "";
      continue;
    }
    // "half a milligram" stays a number; "half past two" is a time.
    if (word === "half" && current === null && !["a", "past", "to"].includes(words[i + 1])) {
      out.push("0.5");
      continue;
    }
    if (startsNumber) {
      if (current === null) {
        current = value;
      } else if (value < 10 && current % 10 === 0 && current % 100 !== 0) {
        current += value; // twenty five
      } else if (value < 10 && current % 100 === 0) {
        current += value; // a hundred and five
      } else if (value >= 10 && current % 100 === 0 && current > 0) {
        current += value; // one hundred and fifty
      } else {
        flush();
        current = value; // fourteen fifty -> 14 50
      }
      continue;
    }
    flush();
    out.push(word);
  }
  flush();
  return out;
};

// ---------------------------------------------------------------------------------------------
// Times: "at 14:52", "at 1452", "at 2 52 pm", "2 minutes ago", "a minute ago"

const isNumber = (t: string | undefined) => t !== undefined && /^\d+(\.\d+)?$/.test(t);
const UNIT_WORDS = new Set(UNITS.flatMap(([u]) => u.split(" ")));

// A time starting at token i, with how many tokens it uses.
const timeAt = (tokens: string[], i: number): { time: VoiceTime; length: number } | null => {
  // Relative: N minutes/seconds ago
  const n = tokens[i] === "a" ? 1 : isNumber(tokens[i]) ? Number(tokens[i]) : null;
  if (n !== null && tokens[i + 2] === "ago") {
    const unit = tokens[i + 1];
    if (/^(minute|minutes|min|mins)$/.test(unit)) return { time: { secondsAgo: n * 60 }, length: 3 };
    if (/^(second|seconds|sec|secs)$/.test(unit)) return { time: { secondsAgo: n }, length: 3 };
  }

  if (tokens[i] !== "at") return null;
  let hours: number | null = null;
  let minutes: number | null = null;
  let used = 0;
  const a = tokens[i + 1];
  const b = tokens[i + 2];
  // "at quarter past 2", "at half past two", "at quarter to three"
  const spoken = tokens[i + 1] === "a" ? 1 : 0;
  const part = tokens[i + 1 + spoken];
  const relation = tokens[i + 2 + spoken];
  const hour = tokens[i + 3 + spoken];
  if ((part === "quarter" || part === "half") && (relation === "past" || relation === "to") && /^\d{1,2}$/.test(hour ?? "")) {
    const offset = part === "quarter" ? 15 : 30;
    if (!(part === "half" && relation === "to")) {
      hours = relation === "past" ? Number(hour) : (Number(hour) + 23) % 24;
      minutes = relation === "past" ? offset : 60 - offset;
      used = 3 + spoken;
    }
  } else if (a && /^\d{1,2}:\d{2}$/.test(a)) {
    [hours, minutes] = a.split(":").map(Number);
    used = 1;
  } else if (a && /^\d{3,4}$/.test(a) && !UNIT_WORDS.has(b ?? "")) {
    hours = Math.floor(Number(a) / 100);
    minutes = Number(a) % 100;
    used = 1;
  } else if (a && /^\d{1,2}$/.test(a) && b && /^\d{1,2}$/.test(b) && !UNIT_WORDS.has(tokens[i + 3] ?? "")) {
    hours = Number(a);
    minutes = Number(b);
    used = 2;
  }
  if (hours === null || minutes === null) return null;
  const meridiem = tokens[i + 1 + used];
  let twelveHour = hours >= 1 && hours <= 12;
  if (meridiem === "pm" || meridiem === "am") {
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    used += 1;
    twelveHour = false;
  }
  if (hours > 23 || minutes > 59) return null;
  const clock = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return { time: twelveHour ? { clock, twelveHour: true } : { clock }, length: 1 + used };
};

interface TimeSpan {
  time: VoiceTime;
  start: number;
  end: number;
}

const findTimes = (tokens: string[]): TimeSpan[] => {
  const times: TimeSpan[] = [];
  for (let i = 0; i < tokens.length; ) {
    const found = timeAt(tokens, i);
    if (found) {
      times.push({ time: found.time, start: i, end: Math.min(tokens.length, i + found.length) });
      i += found.length;
    } else {
      i += 1;
    }
  }
  return times;
};

// How long the resus has been going: "for 10 minutes", "10 minutes", "10 minutes in", "half an hour in".
const durationAt = (tokens: string[], i: number): { seconds: number; length: number } | null => {
  const start = tokens[i] === "for" ? i + 1 : i;
  if (!isNumber(tokens[start])) return null;
  const n = Number(tokens[start]);
  let unitIndex = start + 1;
  if (tokens[unitIndex] === "an" || tokens[unitIndex] === "a") unitIndex += 1;
  let seconds: number;
  if (/^(minute|minutes|min|mins)$/.test(tokens[unitIndex] ?? "")) seconds = n * 60;
  else if (/^(hour|hours)$/.test(tokens[unitIndex] ?? "")) seconds = n * 3600;
  else return null;
  let end = unitIndex + 1;
  if (tokens[end] === "in" || tokens[end] === "into") end += 1;
  return { seconds, length: end - i };
};

const findPhrase = (tokens: string[], phrases: string[]): { start: number; end: number } | null => {
  for (let i = 0; i < tokens.length; i++) {
    for (const phrase of phrases) {
      const length = matchAt(tokens, i, phrase);
      if (length) return { start: i, end: i + length };
    }
  }
  return null;
};

// ---------------------------------------------------------------------------------------------
// Parsing

interface Mention {
  kind: Kind;
  start: number;
  end: number; // exclusive
  quantities: Quantity[];
  count?: number;
}

interface Quantity {
  value: number;
  unit: string | null;
  start: number;
  end: number;
}

const matchAt = (tokens: string[], i: number, phrase: string): number => {
  const words = phrase.split(" ");
  for (let k = 0; k < words.length; k++) if (tokens[i + k] !== words[k]) return 0;
  return words.length;
};

const findQuantities = (tokens: string[]): Quantity[] => {
  const quantities: Quantity[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!isNumber(tokens[i])) continue;
    let unit: string | null = null;
    let length = 1;
    for (const [phrase, canonical] of UNITS) {
      const matched = matchAt(tokens, i + 1, phrase);
      if (matched) {
        unit = canonical;
        length += matched;
        break;
      }
    }
    quantities.push({ value: Number(tokens[i]), unit, start: i, end: i + length });
  }
  return quantities;
};

// Tokens between two spans, not counting filler words.
const gapBetween = (tokens: string[], a: { start: number; end: number }, b: { start: number; end: number }) => {
  const [from, to] = a.end <= b.start ? [a.end, b.start] : a.start >= b.end ? [b.end, a.start] : [0, 0];
  return tokens.slice(from, to).filter((t) => !FILLERS.has(t)).length;
};

const MAX_GAP: Record<Kind["type"], number> = {
  drug: 2, otherDrug: 2, shock: 2, etco2: 2, access: 4, analyse: 0, rhythm: 0, rosc: 0, undo: 0, airway: 0,
  procedure: 0, trauma: 0, observation: 0,
};

const kindKey = (kind: Kind) => JSON.stringify(kind);

export const parseVoiceCommand = (transcript: string): VoiceParse => {
  const nothing = (reason: VoiceReason): VoiceParse => ({ actions: [], time: null, reason });
  const all = normalise(transcript);
  if (all.length === 0) return nothing("nothing");
  if (QUESTION_STARTS.has(all[0])) return nothing("question");

  if (findPhrase(all, DOWNTIME_PHRASES)) return nothing("downtime");

  // A handover names when the arrest was confirmed. Its time belongs to that, not to the actions.
  const removed = new Set<number>();
  const removeRange = (from: number, to: number) => {
    for (let k = from; k < to; k++) removed.add(k);
  };
  let startedTime: VoiceTime | null = null;
  let isHandover = false;
  const times = findTimes(all);
  const anchor = findPhrase(all, STARTED_ANCHORS);
  if (anchor) {
    if (findPhrase(all, DOWNTIME_WITH_STARTED)) return nothing("downtime");
    removeRange(anchor.start, anchor.end);
    const t =
      times.find((t) => t.start >= anchor.end && t.start <= anchor.end + 5) ??
      times.find((t) => t.end <= anchor.start && t.end >= anchor.start - 3);
    if (t) {
      startedTime = t.time;
      isHandover = true;
      removeRange(t.start, t.end);
    } else {
      for (let i = anchor.end; i < Math.min(all.length, anchor.end + 5); i++) {
        const d = durationAt(all, i);
        if (!d) continue;
        startedTime = { secondsAgo: d.seconds };
        isHandover = true;
        removeRange(i, i + d.length);
        break;
      }
    }
  }
  // "we're 10 minutes in", "10 minutes into the resus"
  if (!startedTime) {
    for (let i = 0; i < all.length; i++) {
      const d = durationAt(all, i);
      if (!d || !["in", "into"].includes(all[i + d.length - 1])) continue;
      startedTime = { secondsAgo: d.seconds };
      isHandover = true;
      removeRange(i, i + d.length);
      break;
    }
  }
  const otherTimes = times.filter((t) => !removed.has(t.start));
  if (otherTimes.length > 1) return nothing("conflict");
  const time = otherTimes[0]?.time ?? null;
  if (otherTimes[0]) removeRange(otherTimes[0].start, otherTimes[0].end);
  const tokens = all.filter((_, i) => !removed.has(i));
  // Where the time was said, among the remaining words: in a handover it belongs to the drug just before it.
  const timePosition = otherTimes[0] ? all.slice(0, otherTimes[0].start).filter((_, i) => !removed.has(i)).length : null;
  const hasHistoryMarker = findPhrase(tokens, HISTORY_MARKERS) !== null;

  // Find mentions, longest phrase first at each position.
  const mentions: Mention[] = [];
  for (let i = 0; i < tokens.length; ) {
    let best: { length: number; kind: Kind } | null = null;
    for (const [phrase, kind] of PHRASES) {
      const length = matchAt(tokens, i, phrase);
      if (length && (!best || length > best.length)) best = { length, kind };
    }
    if (best) {
      mentions.push({ kind: best.kind, start: i, end: i + best.length, quantities: [] });
      i += best.length;
    } else {
      i += 1;
    }
  }

  // Counts ("2 shocks", "adrenaline x2", "shocked 3 times", "two doses of amio") mean given before, times unknown.
  // A count of 1 outside a handover is just the thing being done now, so its number stays a dose.
  const countTokens = new Set<number>();
  mentions.forEach((m, index) => {
    if (m.kind.type !== "drug" && m.kind.type !== "shock") return;
    const found = countAround(tokens, m, index > 0 ? mentions[index - 1].end : null);
    if (!found || !(isHandover || hasHistoryMarker || found.count > 1)) return;
    m.count = found.count;
    found.used.forEach((k) => countTokens.add(k));
  });

  // Attach each number to the nearest mention it can belong to; ties go to the earlier mention.
  for (const quantity of findQuantities(tokens)) {
    if (countTokens.has(quantity.start)) continue;
    if (mentions.some((m) => quantity.start >= m.start && quantity.start < m.end)) continue;
    let best: { mention: Mention; gap: number } | null = null;
    for (const mention of mentions) {
      const type = mention.kind.type;
      if (quantity.unit ? UNIT_FOR[quantity.unit] !== (type === "otherDrug" ? "drug" : type) : !["drug", "shock", "etco2"].includes(type)) continue;
      const gap = gapBetween(tokens, quantity, mention);
      if (gap > MAX_GAP[type] || (!quantity.unit && gap > 0)) continue;
      if (!best || gap < best.gap) best = { mention, gap };
    }
    best?.mention.quantities.push(quantity);
  }

  // Drop mentions that are plans, negatives or instructions.
  let droppedAsInstruction = false;
  let droppedAsNotGiven = false;
  // A negative or plan word applies to the mention next to it. If it might also reach past another
  // mention ("preparing adrenaline, amiodarone", "adrenaline, amiodarone due"), the phrase is refused.
  let unclearNegation = false;
  const kept = mentions.filter((m, index) => {
    if (m.kind.type === "undo" || m.kind.type === "access") return true;
    // A reading is a reading ("12 lead, no STEMI"); a missing number is handled when it's built.
    if (m.kind.type === "observation") return true;
    const previousEnd = index > 0 ? mentions[index - 1].end : 0;
    const nextStart = index + 1 < mentions.length ? mentions[index + 1].start : tokens.length;
    const before = tokens.slice(Math.max(previousEnd, m.start - 2), m.start);
    const after = tokens.slice(m.end, Math.min(nextStart, m.end + 2));
    if (before.some((w) => INSTRUCTION_BEFORE.has(w)) || after.some((w) => INSTRUCTION_AFTER.has(w))) {
      droppedAsInstruction = true;
      return false;
    }
    if (before.some((w) => NOT_GIVEN_BEFORE.has(w)) || after.some((w) => NOT_GIVEN_AFTER.has(w))) {
      droppedAsNotGiven = true;
      return false;
    }
    const wideBefore = tokens.slice(Math.max(0, m.start - 2), m.start);
    const wideAfter = tokens.slice(m.end, m.end + 2);
    if (
      wideBefore.some((w) => NOT_GIVEN_BEFORE.has(w) || INSTRUCTION_BEFORE.has(w)) ||
      wideAfter.some((w) => NOT_GIVEN_AFTER.has(w) || INSTRUCTION_AFTER.has(w))
    ) {
      unclearNegation = true;
    }
    return true;
  });
  if (unclearNegation) return nothing("notGiven");

  // Build actions, merging repeats and refusing contradictions.
  const actions: VoiceAction[] = [];
  const history: VoiceAction[] = [];
  let rhythmIndex = -1;
  let earlierRhythmIndex = -1;
  const drugIndex = new Map<string, number>();
  let shockIndex = -1;
  // In a handover, only the drug said just before the time is timed; the others are times unknown.
  const timedDrugMention =
    timePosition === null ? null : [...kept].reverse().find((m) => m.kind.type === "drug" && m.end <= timePosition) ?? null;

  const addGiven = (item: GivenItem, count: number): boolean => {
    const existing = history.find((a) => a.type === "given" && a.item === item) as Extract<VoiceAction, { type: "given" }> | undefined;
    if (existing) return existing.count === count;
    history.push({ type: "given", item, count });
    return true;
  };

  for (const m of kept) {
    const kind = m.kind;
    switch (kind.type) {
      case "drug": {
        const q = m.quantities[0];
        const dose = q ? `${formatNumber(q.value)} ${q.unit ?? "mg"}` : null;
        if (m.count !== undefined && (isHandover || hasHistoryMarker || m.count > 1)) {
          if (!isHandover && !hasHistoryMarker) return nothing("countUnclear");
          // "adrenaline x2, last 4 minutes ago": the last dose has a time, the others don't.
          if (time && tokens.includes("last")) {
            if (m.count > 1 && !addGiven(kind.drug, m.count - 1)) return nothing("conflict");
          } else {
            if (!addGiven(kind.drug, m.count)) return nothing("conflict");
            break;
          }
        } else if (isHandover && m !== timedDrugMention) {
          if (!addGiven(kind.drug, 1)) return nothing("conflict");
          break;
        }
        const existing = drugIndex.get(kind.drug);
        if (existing !== undefined) {
          const prior = actions[existing] as Extract<VoiceAction, { type: "drug" }>;
          if (prior.dose && dose && prior.dose !== dose) return nothing("conflict");
          prior.dose ??= dose;
          break;
        }
        drugIndex.set(kind.drug, actions.length);
        actions.push({ type: "drug", drug: kind.drug, dose });
        break;
      }
      case "rhythm": {
        if (isHandover) {
          if (earlierRhythmIndex >= 0) {
            const prior = history[earlierRhythmIndex] as Extract<VoiceAction, { type: "earlierRhythm" }>;
            const merged = mergeRhythms(prior.rhythm, kind.rhythm);
            if (!merged) return nothing("conflict");
            prior.rhythm = merged;
          } else {
            earlierRhythmIndex = history.length;
            history.push({ type: "earlierRhythm", rhythm: kind.rhythm });
          }
          break;
        }
        if (rhythmIndex >= 0) {
          const prior = actions[rhythmIndex] as Extract<VoiceAction, { type: "rhythm" }>;
          const merged = mergeRhythms(prior.rhythm, kind.rhythm);
          if (!merged) return nothing("conflict");
          prior.rhythm = merged;
          break;
        }
        rhythmIndex = actions.length;
        actions.push({ type: "rhythm", rhythm: kind.rhythm });
        break;
      }
      case "shock": {
        // A single shock outside a handover is one just delivered, as before.
        if (isHandover || (m.count !== undefined && (m.count > 1 || hasHistoryMarker))) {
          if (!isHandover && !hasHistoryMarker) return nothing("countUnclear");
          if (!addGiven("shock", m.count ?? 1)) return nothing("conflict");
          break;
        }
        const q = m.quantities[0];
        const energy = q && (q.unit === "J" || q.value >= 50) ? `${formatNumber(q.value)} J` : null;
        if (shockIndex >= 0) {
          const prior = actions[shockIndex] as Extract<VoiceAction, { type: "shock" }>;
          if (prior.energy && energy && prior.energy !== energy) return nothing("conflict");
          prior.energy ??= energy;
          break;
        }
        shockIndex = actions.length;
        actions.push({ type: "shock", energy });
        break;
      }
      case "access": {
        const window = tokens.slice(Math.max(0, m.start - 3), m.end + 3);
        const successful = !window.some((w) => ACCESS_FAILURE.has(w)) && tokens[m.start - 1] !== "no";
        const gaugeQuantity = m.quantities.find((q) => q.unit === "G");
        actions.push({
          type: "access",
          route: kind.route,
          successful,
          gauge: gaugeQuantity ? `${formatNumber(gaugeQuantity.value)}G` : null,
          location: findLocation(tokens, m),
        });
        break;
      }
      case "etco2": {
        const q = m.quantities[0];
        if (!q) break;
        actions.push({ type: "etco2", value: q.value, unit: (q.unit as "kPa" | "mmHg" | null) ?? null });
        break;
      }
      case "airway":
        actions.push({ type: "airway", device: kind.device });
        break;
      case "otherDrug": {
        // Before eResus: recorded as given then, time unknown.
        if (isHandover || hasHistoryMarker) {
          if (!addGiven(kind.drug, 1)) return nothing("conflict");
          break;
        }
        const q = m.quantities.find((q) => q.unit !== null);
        const dose = q ? `${formatNumber(q.value)} ${q.unit}` : null;
        const prior = actions.find((a) => a.type === "otherDrug" && a.drug === kind.drug) as
          | Extract<VoiceAction, { type: "otherDrug" }>
          | undefined;
        if (prior) {
          if (prior.dose && dose && prior.dose !== dose) return nothing("conflict");
          prior.dose ??= dose;
          break;
        }
        actions.push({ type: "otherDrug", drug: kind.drug, dose });
        break;
      }
      case "procedure": {
        const base = kind.procedure;
        let names = [base];
        if (base === "Thoracostomy" || base === "Needle decompression") {
          // Only words belonging to this mention: "IO left humerus, needle right" is one needle, on the right.
          const index = Math.max(0, kept.indexOf(m));
          const from = Math.max(index > 0 ? kept[index - 1].end : 0, m.start - 3);
          const to = Math.min(index + 1 < kept.length ? kept[index + 1].start : tokens.length, m.end + 3);
          const after = tokens.slice(m.end, Math.max(m.end, to));
          // Before it, only "left needle", "right sided thoracostomy": never a side that belongs to a site.
          const near = tokens.slice(Math.max(from, m.start - 2), Math.max(from, m.start));
          const before = near.some((t) => SITE_WORDS.has(t)) ? [] : near;
          const isSide = (t: string) => t === "left" || t === "right";
          const hasBothSides = (words: string[]) => words.includes("left") && words.includes("right");
          const both =
            [...before, ...after].some((t) => ["bilateral", "both", "thoracostomies"].includes(t)) || hasBothSides(after) || hasBothSides(before);
          // The side said after it wins: in "IO left humerus, needle right" the "left" is the IO's.
          const side = after.find(isSide) ?? [...before].reverse().find(isSide);
          if (both) {
            names = base === "Thoracostomy" ? ["Thoracostomy (bilateral)"] : ["Needle decompression (left)", "Needle decompression (right)"];
          } else if (side) {
            names = [`${base} (${side})`];
          }
        }
        // A chest procedure without a side goes through as said, and is refused with a request for the side.
        const needsSide = names.length === 1 && (names[0] === "Thoracostomy" || names[0] === "Needle decompression");
        for (const name of names) {
          if ((isHandover || hasHistoryMarker) && !needsSide) {
            if (!addGiven(name, 1)) return nothing("conflict");
          } else if (!actions.some((a) => a.type === "procedure" && a.procedure === name)) {
            actions.push({ type: "procedure", procedure: name });
          }
        }
        break;
      }
      case "trauma":
        if (!actions.some((a) => a.type === "trauma")) actions.push({ type: "trauma" });
        break;
      case "observation": {
        // Readings in a handover aren't current; leave them out.
        if (isHandover) break;
        const value = reading(kind.kind, tokens, m);
        if (value === null) break;
        // A MAP is logged with the blood pressures; one said alongside a full BP adds nothing.
        const said = kind.kind;
        const observed: ObservationKind = said === "map" ? "bp" : said;
        const prior = actions.find((a) => a.type === "observation" && a.kind === observed) as
          | Extract<VoiceAction, { type: "observation" }>
          | undefined;
        if (prior) {
          if (said === "map") break;
          if (prior.value.startsWith("MAP")) {
            prior.value = value;
            break;
          }
          if (prior.value !== value) return nothing("conflict");
          break;
        }
        actions.push({ type: "observation", kind: observed, value });
        break;
      }
      default: {
        // A rhythm check or ROSC mentioned in a handover is history, not something happening now.
        if (isHandover && kind.type !== "undo") break;
        // analyse, rosc and undo: merge immediate repeats.
        const last = actions[actions.length - 1];
        if (last && last.type === kind.type && kind.type !== "undo") break;
        actions.push({ type: kind.type } as VoiceAction);
      }
    }
  }

  // A shock after a non-shockable rhythm makes no sense.
  const rhythm = rhythmIndex >= 0 ? (actions[rhythmIndex] as Extract<VoiceAction, { type: "rhythm" }>).rhythm : null;
  if (shockIndex >= 0 && rhythm && !["VF", "VT", "Shockable"].includes(rhythm)) return nothing("conflict");
  // Only one antiarrhythmic is used in an arrest.
  const givenItems = history.flatMap((a) => (a.type === "given" ? [a.item] : []));
  if (givenItems.includes("amiodarone") && givenItems.includes("lidocaine")) return nothing("conflict");
  // A time with nothing to apply it to was meant for something we didn't catch.
  if (time && actions.length === 0 && history.length > 0) return nothing("conflict");

  // Shocks first, so an antiarrhythmic given before eResus is timed against the full shock count.
  const isShockHistory = (a: VoiceAction) => a.type === "given" && a.item === "shock";
  const orderedHistory = [...history.filter(isShockHistory), ...history.filter((a) => !isShockHistory(a))];
  const result: VoiceAction[] = [
    ...(startedTime ? [{ type: "started" as const, time: startedTime }] : []),
    ...orderedHistory,
    ...actions,
  ];
  if (result.length === 0) {
    return nothing(droppedAsInstruction ? "instruction" : droppedAsNotGiven ? "notGiven" : "nothing");
  }
  return { actions: result, time: actions.length ? time : null, reason: null };
};

// The value said after a reading ("sats 96", "BP 110 over 70", "BM 6.2", "temp 36.4", "12 lead, no STEMI"),
// formatted as it's logged. Null when there's no believable number, so nothing is logged.
const reading = (kind: SaidReading, tokens: string[], span: { start: number; end: number }): string | null => {
  const number = (start: number, skipping: Set<string>): { value: number; at: number } | null => {
    for (let i = start, skipped = 0; i < tokens.length && skipped <= 2; i++, skipped++) {
      if (isNumber(tokens[i])) return { value: Number(tokens[i]), at: i };
      if (!FILLERS.has(tokens[i]) && !skipping.has(tokens[i])) return null;
    }
    return null;
  };
  const within = (v: number, lo: number, hi: number) => v >= lo && v <= hi;
  // A target isn't a reading: "aim for sats 94 to 98", "keep the MAP above 65".
  const lead = tokens.slice(Math.max(0, span.start - 3), span.start);
  if (lead.some((t) => TARGET_WORDS.has(t) && (kind !== "bp" || t !== "over"))) return null;
  switch (kind) {
    case "ecg": {
      // One 12-lead per phrase, read from the whole of it ("no ST elevation on the 12 lead").
      const window = tokens;
      const index = window.findIndex(
        (t, i) => t === "stemi" || t === "nstemi" || ((t === "elevation" || t === "elevations") && i > 0 && window[i - 1] === "st"),
      );
      if (index < 0) return "Recorded, not yet interpreted";
      if (window[index] === "nstemi") return "No STEMI";
      const before = window.slice(Math.max(0, index - 3), index);
      if (before.includes("no") || before.includes("not") || before.includes("non")) return "No STEMI";
      return before.some((t) => UNSURE_WORDS.has(t)) ? "Possible STEMI" : "STEMI";
    }
    case "bp": {
      const systolic = number(span.end, new Set(["of"]));
      if (!systolic || !within(systolic.value, 40, 300)) return null;
      const diastolic = number(systolic.at + 1, new Set(["over", "on", "by"]));
      if (diastolic && within(diastolic.value, 20, 200) && diastolic.value < systolic.value) {
        const map = Math.round((systolic.value + 2 * diastolic.value) / 3);
        return `${Math.trunc(systolic.value)}/${Math.trunc(diastolic.value)} (MAP ${map})`;
      }
      // Post-ROSC crews often have a systolic only; it must be called that, never a lone number.
      const near = tokens.slice(Math.max(0, span.start - 1), systolic.at + 2);
      return near.includes("systolic") ? `${Math.trunc(systolic.value)} systolic` : null;
    }
    case "map": {
      const found = number(span.end, new Set(["of"]));
      return found && within(found.value, 20, 200) ? `MAP ${Math.trunc(found.value)}` : null;
    }
    default: {
      const found = number(span.end, new Set(["of", "are", "percent", "degrees", "mmol"]));
      if (!found) return null;
      // "Sats 94 to 98" is a range, so a target.
      if (tokens[found.at + 1] === "to" && found.at + 2 < tokens.length && isNumber(tokens[found.at + 2])) return null;
      // Glucose near a drug unit or an instruction is the drug, not a BM ("glucose 10 percent 100 ml").
      if (kind === "glucose" && tokens.slice(Math.max(0, span.start - 3), found.at + 4).some((t) => GLUCOSE_DRUG_WORDS.has(t))) return null;
      const v = found.value;
      if (kind === "spo2") return within(v, 50, 100) ? `${Math.trunc(v)}%` : null;
      if (kind === "glucose") return within(v, 0.5, 50) ? `${formatNumber(v)} mmol/L` : null;
      return within(v, 25, 43) ? `${formatNumber(v)} °C` : null;
    }
  }
};

// A count next to a shock or drug mention, and the tokens it used.
const countAround = (
  tokens: string[],
  span: { start: number; end: number },
  previousEnd: number | null,
): { count: number; used: number[] } | null => {
  const integer = (i: number): number | null => {
    const t = tokens[i];
    if (t === undefined || !/^\d+$/.test(t)) return null;
    const n = Number(t);
    return n >= 1 && n <= 10 ? n : null;
  };
  // Before: "2 shocks", "two doses of adrenaline". Not a number straight after another mention,
  // which is that mention's dose or energy ("adrenaline 1 amiodarone 300", "shock 2 adrenaline").
  // A plural ("3 shocks") settles it either way.
  const isPlural = tokens.slice(span.start, span.end).some((t) => t === "shocks" || t === "adrenalines");
  const before = integer(span.start - 1);
  if (before !== null && (previousEnd !== span.start - 1 || isPlural)) return { count: before, used: [span.start - 1] };
  if (tokens[span.start - 1] === "of" && ["doses", "dose", "rounds", "lots"].includes(tokens[span.start - 2] ?? "")) {
    const n = integer(span.start - 3);
    if (n !== null) return { count: n, used: [span.start - 3, span.start - 2, span.start - 1] };
  }
  // After, allowing one filler: "shocked 3 times", "adrenaline x2", "adrenaline given twice"
  let i = span.end;
  if (["given", "was", "delivered"].includes(tokens[i] ?? "")) i += 1;
  const word = tokens[i];
  if (word !== undefined && COUNT_WORDS[word] !== undefined) return { count: COUNT_WORDS[word], used: [i] };
  const x = word?.match(/^x(\d+)$/);
  if (x && Number(x[1]) >= 1 && Number(x[1]) <= 10) return { count: Number(x[1]), used: [i] };
  if (word === "x" || word === "times") {
    const n = integer(i + 1);
    if (n !== null) return { count: n, used: [i, i + 1] };
  }
  const n = integer(i);
  if (n !== null && tokens[i + 1] === "times") return { count: n, used: [i, i + 1] };
  return null;
};

// A specific rhythm refines a general one ("shock advised, VF" -> VF); two different ones conflict.
const mergeRhythms = (
  a: Extract<VoiceAction, { type: "rhythm" }>["rhythm"],
  b: Extract<VoiceAction, { type: "rhythm" }>["rhythm"],
): Extract<VoiceAction, { type: "rhythm" }>["rhythm"] | null => {
  if (a === b) return a;
  const shockable = ["VF", "VT"];
  const nonShockable = ["PEA", "Asystole"];
  if (a === "Shockable" && shockable.includes(b)) return b;
  if (b === "Shockable" && shockable.includes(a)) return a;
  if (a === "Non-shockable" && nonShockable.includes(b)) return b;
  if (b === "Non-shockable" && nonShockable.includes(a)) return a;
  return null;
};

const findLocation = (tokens: string[], m: Mention): string | null => {
  const from = Math.max(0, m.start - 4);
  const to = Math.min(tokens.length, m.end + 4);
  for (let i = from; i < to; i++) {
    for (const [phrase, site] of SITES) {
      const length = matchAt(tokens, i, phrase);
      if (!length) continue;
      const side = tokens[i - 1] === "left" || tokens[i - 1] === "right" ? tokens[i - 1] : null;
      const label = side ? `${side} ${site}` : site;
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
  }
  return null;
};

// Hands-free mode: finds the wake word and returns what follows it, or null if it wasn't said.
export const afterWakeWord = (transcript: string, wakeWord: WakeWord): string | null => {
  const tokens = normalise(transcript);
  for (let i = 0; i < tokens.length; i++) {
    for (const phrase of WAKE_WORDS[wakeWord]) {
      const length = matchAt(tokens, i, phrase);
      if (length) return tokens.slice(i + length).join(" ");
    }
  }
  return null;
};
