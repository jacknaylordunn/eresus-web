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
  | { type: "etco2"; value: number; unit: "kPa" | "mmHg" | null };

// twelveHour: said without am/pm and could be either (e.g. "at 2:52"); the app picks the most recent.
export type VoiceTime = { clock: string; twelveHour?: true } | { secondsAgo: number };

export type VoiceReason = "question" | "instruction" | "notGiven" | "conflict" | "nothing";

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
  "ETCO2", "kPa", "scribe", "eResus",
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
  | { type: "etco2" };

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
  ...["shock", "shocked", "shocking", "shock delivered", "shock given", "delivered shock", "defib", "defibrillated"].map(
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
].map(([p, k]) => [p.replace(/'s$/, " is"), k]);

const QUESTION_STARTS = new Set(["is", "are", "should", "do", "does", "did", "can", "could", "what", "why", "when", "how", "who", "shall", "has"]);

// Words near a mention that mean it hasn't happened (yet).
const NOT_GIVEN_BEFORE = new Set([
  "no", "not", "without", "hold", "withhold", "withholding", "holding", "draw", "drawing", "prepare", "preparing",
  "get", "getting", "need", "needs", "want", "skip", "failed", "failure", "unable", "lost", "charging", "charge",
]);
const NOT_GIVEN_AFTER = new Set(["due", "next", "ready", "needed", "drawn", "prepared", "soon", "failed", "not"]);
const INSTRUCTION_BEFORE = new Set(["give", "giving", "administer"]);
const INSTRUCTION_AFTER = new Set(["please"]);

// Small words that can sit between an action and its number ("ETCO2 is 3.8", "adrenaline given 1 mg").
const FILLERS = new Set(["is", "of", "was", "now", "about", "around", "reading", "given", "at"]);

const ACCESS_FAILURE = new Set(["failed", "fail", "unsuccessful", "missed", "tissued", "blown", "lost"]);

const UNITS: [string, string][] = [
  ["millimetres of mercury", "mmHg"], ["millimeters of mercury", "mmHg"], ["mm of mercury", "mmHg"], ["mm hg", "mmHg"],
  ["mmhg", "mmHg"], ["kilopascals", "kPa"], ["kilopascal", "kPa"], ["kpa", "kPa"],
  ["milligrams", "mg"], ["milligram", "mg"], ["mgs", "mg"], ["mg", "mg"], ["milli", "mg"],
  ["micrograms", "mcg"], ["microgram", "mcg"], ["mcg", "mcg"], ["ug", "mcg"], ["mics", "mcg"],
  ["joules", "J"], ["joule", "J"], ["j", "J"],
  ["gauge", "G"], ["g", "G"],
];

const UNIT_FOR: Record<string, Kind["type"]> = { mg: "drug", mcg: "drug", J: "shock", kPa: "etco2", mmHg: "etco2", G: "access" };

const SITES: [string, string][] = [
  ["antecubital", "AC"], ["ac", "AC"], ["hand", "hand"], ["wrist", "wrist"], ["forearm", "forearm"], ["foot", "foot"],
  ["ankle", "ankle"], ["external jugular", "EJ"], ["jugular", "EJ"], ["ej", "EJ"], ["humerus", "humerus"],
  ["humeral", "humerus"], ["tibia", "tibia"], ["tibial", "tibia"], ["sternum", "sternum"], ["sternal", "sternum"],
];

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

const extractTime = (tokens: string[]): { time: VoiceTime | null; rest: string[] } => {
  for (let i = 0; i < tokens.length; i++) {
    // Relative: N minutes/seconds ago
    const n = tokens[i] === "a" ? 1 : isNumber(tokens[i]) ? Number(tokens[i]) : null;
    if (n !== null && tokens[i + 2] === "ago") {
      const unit = tokens[i + 1];
      const seconds = /^(minute|minutes|min|mins)$/.test(unit) ? n * 60 : /^(second|seconds|sec|secs)$/.test(unit) ? n : null;
      if (seconds !== null) return { time: { secondsAgo: seconds }, rest: [...tokens.slice(0, i), ...tokens.slice(i + 3)] };
    }

    if (tokens[i] !== "at") continue;
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
    if (hours === null || minutes === null) continue;
    const meridiem = tokens[i + 1 + used];
    let twelveHour = hours >= 1 && hours <= 12;
    if (meridiem === "pm" || meridiem === "am") {
      if (meridiem === "pm" && hours < 12) hours += 12;
      if (meridiem === "am" && hours === 12) hours = 0;
      used += 1;
      twelveHour = false;
    }
    if (hours > 23 || minutes > 59) continue;
    const clock = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    const time: VoiceTime = twelveHour ? { clock, twelveHour: true } : { clock };
    return { time, rest: [...tokens.slice(0, i), ...tokens.slice(i + 1 + used)] };
  }
  return { time: null, rest: tokens };
};

// ---------------------------------------------------------------------------------------------
// Parsing

interface Mention {
  kind: Kind;
  start: number;
  end: number; // exclusive
  quantities: Quantity[];
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
  drug: 2, shock: 2, etco2: 2, access: 4, analyse: 0, rhythm: 0, rosc: 0, undo: 0, airway: 0,
};

const kindKey = (kind: Kind) => JSON.stringify(kind);

export const parseVoiceCommand = (transcript: string): VoiceParse => {
  const nothing = (reason: VoiceReason): VoiceParse => ({ actions: [], time: null, reason });
  const all = normalise(transcript);
  if (all.length === 0) return nothing("nothing");
  if (QUESTION_STARTS.has(all[0])) return nothing("question");

  const { time, rest: tokens } = extractTime(all);

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

  // Attach each number to the nearest mention it can belong to; ties go to the earlier mention.
  for (const quantity of findQuantities(tokens)) {
    if (mentions.some((m) => quantity.start >= m.start && quantity.start < m.end)) continue;
    let best: { mention: Mention; gap: number } | null = null;
    for (const mention of mentions) {
      const type = mention.kind.type;
      if (quantity.unit ? UNIT_FOR[quantity.unit] !== type : !["drug", "shock", "etco2"].includes(type)) continue;
      const gap = gapBetween(tokens, quantity, mention);
      if (gap > MAX_GAP[type] || (!quantity.unit && gap > 0)) continue;
      if (!best || gap < best.gap) best = { mention, gap };
    }
    best?.mention.quantities.push(quantity);
  }

  // Drop mentions that are plans, negatives or instructions.
  let droppedAsInstruction = false;
  let droppedAsNotGiven = false;
  const kept = mentions.filter((m) => {
    if (m.kind.type === "undo" || m.kind.type === "access") return true;
    const before = tokens.slice(Math.max(0, m.start - 2), m.start);
    const after = tokens.slice(m.end, m.end + 2);
    if (before.some((w) => INSTRUCTION_BEFORE.has(w)) || after.some((w) => INSTRUCTION_AFTER.has(w))) {
      droppedAsInstruction = true;
      return false;
    }
    if (before.some((w) => NOT_GIVEN_BEFORE.has(w)) || after.some((w) => NOT_GIVEN_AFTER.has(w))) {
      droppedAsNotGiven = true;
      return false;
    }
    return true;
  });

  // Build actions, merging repeats and refusing contradictions.
  const actions: VoiceAction[] = [];
  let rhythmIndex = -1;
  const drugIndex = new Map<string, number>();
  let shockIndex = -1;

  for (const m of kept) {
    const kind = m.kind;
    switch (kind.type) {
      case "drug": {
        const q = m.quantities[0];
        const dose = q ? `${formatNumber(q.value)} ${q.unit ?? "mg"}` : null;
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
      default: {
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

  if (actions.length === 0) {
    return nothing(droppedAsInstruction ? "instruction" : droppedAsNotGiven ? "notGiven" : "nothing");
  }
  return { actions, time, reason: null };
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
