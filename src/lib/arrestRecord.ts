// Clinical lists and log-derived state shared by the arrest screens. Matches Models.swift and
// ArrestViewModel.swift in the iOS app: the log text is the record, so wording must stay identical.

export interface LoggedEvent {
  timestamp: number;
  message: string;
  type: string;
  // Seconds since 1970 when it happened. Missing on entries from older builds.
  clock?: number;
}

// MARK: Traumatic cardiac arrest

// HOTT comes before drugs, so drug reminders stay quiet. The buttons still work.
export const TRAUMA_ON_ENTRY = "Traumatic cardiac arrest: HOTT first, drug prompts quietened";
export const TRAUMA_OFF_ENTRY = "Not a traumatic arrest: drug prompts restored";

export const TRAUMA_EARLY_ACTIONS = ["Enhanced / critical care requested"];

export const TRAUMA_GROUPS: { title: string; procedures: string[] }[] = [
  { title: "Haemorrhage", procedures: ["Tourniquet", "Haemostatic dressing / packing", "Pelvic binder", "Traction splint"] },
  {
    title: "Chest",
    procedures: [
      "Needle decompression (left)",
      "Needle decompression (right)",
      "Thoracostomy (left)",
      "Thoracostomy (right)",
      "Thoracostomy (bilateral)",
    ],
  },
  { title: "Enhanced care", procedures: ["Thoracotomy", "REBOA"] },
];

const TRAUMA_NAMES = new Set([...TRAUMA_EARLY_ACTIONS, ...TRAUMA_GROUPS.flatMap((g) => g.procedures)]);

export const isTraumaProcedureName = (name: string): boolean => TRAUMA_NAMES.has(name);

// Read from the log (newest first), so it survives a reload, an undo and a transfer without extra state.
export const isTraumaArrest = (events: { message: string }[]): boolean => {
  for (const event of events) {
    if (event.message.startsWith(TRAUMA_ON_ENTRY)) return true;
    if (event.message.startsWith(TRAUMA_OFF_ENTRY)) return false;
  }
  return false;
};

export const traumaInterventionCount = (events: { message: string; type: string }[]): number =>
  events.filter((e) => e.type === "airway" && (TRAUMA_NAMES.has(e.message) || e.message.startsWith("Trauma: "))).length;

export const traumaEntryText = (procedure: string): string =>
  TRAUMA_NAMES.has(procedure) ? procedure : `Trauma: ${procedure}`;

// MARK: Medications

export type DrugGroupKind = "arrest" | "fluids" | "sedation" | "reversal" | "metabolic" | "thrombolysis" | "newborn";

export interface DrugGroup {
  kind: DrugGroupKind;
  title: string;
  drugs: string[];
}

// The main buttons cover arrest-dose adrenaline, amiodarone and lidocaine; they're left out here so every
// dose counts towards their timers.
export const DRUG_GROUPS: DrugGroup[] = [
  {
    kind: "arrest",
    title: "Arrest & peri-arrest",
    drugs: [
      "Adenosine",
      "Adrenaline 1:1000 (IM)",
      "Adrenaline infusion",
      "Adrenaline push-dose",
      "Atropine",
      "Calcium chloride 10%",
      "Calcium gluconate 10%",
      "Magnesium sulphate",
      "Noradrenaline infusion",
      "Sodium bicarbonate 8.4%",
    ],
  },
  {
    kind: "fluids",
    title: "Fluids & blood",
    drugs: [
      "Fibrinogen concentrate",
      "Hartmann’s solution",
      "Packed red cells",
      "Plasma",
      "Sodium chloride 0.9%",
      "Tranexamic acid",
      "Whole blood",
    ],
  },
  {
    kind: "sedation",
    title: "Sedation & RSI",
    drugs: ["Fentanyl", "Ketamine", "Midazolam", "Morphine", "Ondansetron", "Propofol", "Rocuronium", "Suxamethonium"],
  },
  {
    kind: "reversal",
    title: "Reversal & toxicology",
    drugs: ["Flumazenil", "Glucagon", "Hydroxocobalamin", "Lipid emulsion 20%", "Naloxone"],
  },
  {
    kind: "metabolic",
    title: "Metabolic & respiratory",
    drugs: ["Glucose 10%", "Hydrocortisone", "Insulin & glucose", "Ipratropium bromide", "Potassium chloride", "Salbutamol"],
  },
  { kind: "thrombolysis", title: "Thrombolysis", drugs: ["Alteplase", "Tenecteplase"] },
];

export const NEWBORN_DRUGS: DrugGroup = {
  kind: "newborn",
  title: "Newborn",
  drugs: ["Glucose 10%", "Sodium chloride 0.9%", "O-negative blood"],
};

export const OTHER_DRUGS: string[] = DRUG_GROUPS.flatMap((g) => g.drugs);

export const drugGroupsFor = (newborn: boolean, focus: DrugGroupKind | null = null): DrugGroup[] => {
  const groups = newborn ? [NEWBORN_DRUGS, ...DRUG_GROUPS] : [...DRUG_GROUPS];
  const index = groups.findIndex((g) => g.kind === focus);
  if (index > 0) groups.unshift(...groups.splice(index, 1));
  return groups;
};

// Listed drugs already given this arrest, most recent first.
export const recentOtherDrugs = (events: { message: string; type: string }[]): string[] => {
  const seen: string[] = [];
  for (const event of events) {
    if (event.type !== "drug") continue;
    const name = OTHER_DRUGS.find((drug) => event.message.startsWith(`${drug} `));
    if (name && !seen.includes(name)) seen.push(name);
  }
  return seen.slice(0, 4);
};

// MARK: Post-ROSC

export const DESTINATION_TASK = "Destination & pre-alert";

// RCUK post-resuscitation care. Logging the matching observation ticks the row.
export const POST_ROSC_TASKS: { id: string; name: string }[] = [
  { id: "airway", name: "Airway & ventilation" },
  { id: "spo2", name: "SpO₂ 94–98%" },
  { id: "ecg", name: "12-Lead ECG" },
  { id: "bp", name: "SBP > 100 mmHg (MAP > 65)" },
  { id: "glucose", name: "Check Blood Glucose" },
  { id: "temp", name: "Temperature: avoid fever" },
  { id: "causes", name: "Identify & Treat Causes" },
  { id: "destination", name: DESTINATION_TASK },
];

export type ROSCObservation = "ecg" | "bp" | "spo2" | "etco2" | "glucose" | "temperature";

// Each is logged as "<prefix> <value>", so the latest can be found again from the log alone.
export const ROSC_OBSERVATIONS: Record<ROSCObservation, { title: string; logPrefix: string; checklistItem: string }> = {
  ecg: { title: "12-Lead ECG", logPrefix: "12-lead ECG:", checklistItem: "12-Lead ECG" },
  bp: { title: "BP", logPrefix: "BP", checklistItem: "SBP > 100 mmHg (MAP > 65)" },
  spo2: { title: "SpO₂", logPrefix: "SpO₂", checklistItem: "SpO₂ 94–98%" },
  etco2: { title: "ETCO₂", logPrefix: "ETCO2:", checklistItem: "Airway & ventilation" },
  glucose: { title: "Glucose", logPrefix: "Blood glucose", checklistItem: "Check Blood Glucose" },
  temperature: { title: "Temp", logPrefix: "Temperature", checklistItem: "Temperature: avoid fever" },
};

export const ROSC_OBSERVATION_ORDER: ROSCObservation[] = ["ecg", "bp", "spo2", "etco2", "glucose", "temperature"];

export const observationEntry = (observation: ROSCObservation, value: string): string =>
  `${ROSC_OBSERVATIONS[observation].logPrefix} ${value}`;

// The latest logged value and when, for the post-ROSC buttons. Events are newest first.
export const latestObservation = (
  events: { message: string; timestamp: number }[],
  observation: ROSCObservation,
): { value: string; time: number } | null => {
  const prefix = `${ROSC_OBSERVATIONS[observation].logPrefix} `;
  const event = events.find((e) => e.message.startsWith(prefix));
  return event ? { value: event.message.slice(prefix.length), time: event.timestamp } : null;
};

export const completeTask = <T extends { name: string; isCompleted: boolean }>(tasks: T[], name: string): T[] =>
  tasks.map((task) => (task.name === name ? { ...task, isCompleted: true } : task));

export const ECG_RESULTS = ["STEMI", "No STEMI", "Recorded, not yet interpreted"];

const OBSERVATION_RANGES: Partial<Record<ROSCObservation, [number, number]>> = {
  spo2: [50, 100],
  glucose: [0.5, 50],
  temperature: [25, 43],
};

const parseNumber = (text: string): number | null => {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
};

const trim = (value: number): string => (value === Math.round(value) ? String(value) : value.toFixed(1));

export const bpEntry = (systolic: string, diastolic: string): { value: string; map: number } | null => {
  const sys = parseNumber(systolic);
  const dia = parseNumber(diastolic);
  if (sys === null || dia === null || sys < 40 || sys > 300 || dia < 20 || dia > 200 || dia >= sys) return null;
  const map = Math.round((sys + 2 * dia) / 3);
  return { value: `${Math.trunc(sys)}/${Math.trunc(dia)} (MAP ${map})`, map };
};

// The value to log for SpO₂, glucose or temperature, or why it can't be logged yet.
export const observationValue = (
  observation: ROSCObservation,
  text: string,
): { value: string } | { error: string } | null => {
  const range = OBSERVATION_RANGES[observation];
  const number = parseNumber(text);
  if (!range || text.trim() === "") return null;
  if (number === null || number < range[0] || number > range[1]) {
    return { error: `Enter a value between ${trim(range[0])} and ${trim(range[1])}.` };
  }
  const value = trim(number);
  const unit = observation === "spo2" ? "%" : observation === "glucose" ? " mmol/L" : " °C";
  return { value: `${value}${unit}` };
};

export const observationPlaceholder: Partial<Record<ROSCObservation, string>> = {
  spo2: "SpO₂ %",
  glucose: "mmol/L",
  temperature: "°C",
};

// JRCALC: after a traumatic arrest, convey to a major trauma centre unless the airway, ventilation or
// haemorrhage can't be safely managed on the way.
export const destinations = (traumatic: boolean): string[] => {
  const medical = ["PPCI centre", "Cardiac arrest centre", "Nearest ED"];
  return traumatic ? ["Major trauma centre", "Nearest ED (trauma unit)", ...medical.slice(0, -1)] : [...medical, "Major trauma centre"];
};

// MARK: Clock times

// Back-dated entries keep the same distance before now as on the arrest clock.
export const clockFor = (timestamp: number, liveTotal: number, nowMs: number = Date.now()): number =>
  nowMs / 1000 + (timestamp - liveTotal);

// Always 24-hour: ePRs and handovers use it, whatever the device is set to.
export const hhmm = (date: Date | null): string =>
  date ? `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` : "--:--";

// MARK: Voice dose check

// A gentle check, not a block. Checked before the dose is logged, so the counts are of doses already given.
export const doseNote = (drug: string, dose: string | null, expected: string | null, isAdult: boolean): string | null => {
  if (!dose || !expected) return null;
  const normalise = (text: string) =>
    text.toLowerCase().replace(/ /g, "").replace(/micrograms/g, "mcg").replace(/milligrams/g, "mg");
  if (normalise(dose) === normalise(expected)) return null;
  return `Check the ${drug} dose: ${isAdult ? "usual adult dose" : "calculated dose for this age"} is ${expected}.`;
};
