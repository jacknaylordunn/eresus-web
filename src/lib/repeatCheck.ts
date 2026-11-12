// Catching a drug or intervention logged twice by mistake (matches iOS ArrestViewModel lastEntry/repeatCheck).
import { DRUG_GROUPS, hhmm } from "./arrestRecord";

export interface LoggedEntry {
  /** Seconds on the arrest clock. */
  timestamp: number;
  message: string;
  /** Seconds since 1970 when it was logged; missing on older logs. */
  clock?: number;
}

const TRAUMA_PREFIX = "Trauma: ";

// Entries for a drug or intervention, newest first: "Adrenaline (1mg) Given – Dose 2", "Tourniquet (voice)",
// "Tranexamic acid before eResus, time unknown (estimated)". "Adrenaline" doesn't match "Adrenaline infusion".
export const entries = <E extends LoggedEntry>(events: E[], name: string): E[] =>
  events.filter((event) => {
    let rest = event.message;
    if (rest.startsWith(TRAUMA_PREFIX)) rest = rest.slice(TRAUMA_PREFIX.length);
    if (!rest.startsWith(name)) return false;
    const tail = rest.slice(name.length);
    return tail === "" || tail.startsWith(" (") || tail.startsWith(" Given") || tail.startsWith(" before eResus");
  });

export const lastEntry = <E extends LoggedEntry>(events: E[], name: string): E | undefined => entries(events, name)[0];

// Normally given once, so any second entry is checked: a second gram of TXA or a repeat thrombolytic is a
// deliberate decision.
export const SINGLE_DOSE_DRUGS = new Set(["Tranexamic acid", "Alteplase", "Tenecteplase"]);
// Arrest drugs come every few minutes, so a repeat within two (half the interval) is probably the same dose
// logged twice, e.g. by two crew members.
export const ARREST_DRUGS = new Set(["Adrenaline", "Amiodarone", "Lidocaine"]);
// Two units can go up at once through two lines, so a quick second tap is asked about, never dropped.
export const FLUIDS_AND_BLOOD = new Set(
  [...(DRUG_GROUPS.find((g) => g.kind === "fluids")?.drugs ?? []), "O-negative blood"].filter((d) => !SINGLE_DOSE_DRUGS.has(d)),
);

// Whether logging this again looks like a duplicate: a double tap (ignored) or something to ask about first.
export type RepeatCheck = { kind: "new" } | { kind: "doubleTap" } | { kind: "confirm"; message: string };

/** Doses given so far, for the antiarrhythmic course check. */
export interface RepeatCounts {
  amiodarone?: number;
  lidocaine?: number;
}

/**
 * @param nowSeconds wall-clock seconds since 1970
 * @param totalArrestTime the arrest clock now, used for entries without a wall-clock time
 */
export const repeatCheck = (
  events: LoggedEntry[],
  name: string,
  nowSeconds: number = Date.now() / 1000,
  totalArrestTime = 0,
  counts: RepeatCounts = {},
): RepeatCheck => {
  const previous = entries(events, name);
  const event = previous[0];
  if (!event) return { kind: "new" };
  // Wall clock, because the arrest clock stops while paused.
  const ago = event.clock !== undefined ? nowSeconds - event.clock : Math.max(0, totalArrestTime - event.timestamp);
  if (ago < 3 && !FLUIDS_AND_BLOOD.has(name)) return { kind: "doubleTap" };
  // RCUK gives an antiarrhythmic twice at most; a third is checked whenever it comes.
  if ((name === "Amiodarone" && (counts.amiodarone ?? 0) >= 2) || (name === "Lidocaine" && (counts.lidocaine ?? 0) >= 2)) {
    const times = previous
      .slice(0, 2)
      .reverse()
      .filter((e) => e.clock !== undefined)
      .map((e) => hhmm(new Date((e.clock as number) * 1000)));
    const when = times.length === 2 ? ` (at ${times[0]} and ${times[1]})` : "";
    return { kind: "confirm", message: `${name} has already been given twice${when}. A third dose is outside the usual 2-dose course.` };
  }
  const window = ARREST_DRUGS.has(name) ? 120 : 60;
  if (ago < window || SINGLE_DOSE_DRUGS.has(name)) {
    return {
      kind: "confirm",
      message: repeatMessage(
        name,
        ago,
        event.clock !== undefined ? new Date(event.clock * 1000) : null,
        event.message.includes(" before eResus"),
      ),
    };
  }
  return { kind: "new" };
};

// What the repeat question says, e.g. "Adrenaline was logged 20 seconds ago."
export const repeatMessage = (name: string, ago: number, at: Date | null, beforeEResus = false): string => {
  if (beforeEResus) return `${name} was recorded as given before eResus.`;
  const when = ago < 60 ? `${Math.floor(ago)} seconds ago` : at ? `at ${hhmm(at)}` : "earlier";
  return `${name} was logged ${when}.`;
};

/** The wall-clock time an entry was last logged, for "✓ HH:mm" on list rows. */
export const loggedAt = (events: LoggedEntry[], name: string): Date | null => {
  const clock = lastEntry(events, name)?.clock;
  return clock !== undefined ? new Date(clock * 1000) : null;
};

// A voice phrase that would log something just logged ("Adrenaline given" … "Adrenaline given, thanks") is
// refused: closed-loop calls mustn't become two doses. Back-dated phrases (with a spoken time) aren't checked.
export const voiceRepeatRefusal = (
  events: LoggedEntry[],
  name: string,
  spokenTime: number | null,
  nowSeconds: number = Date.now() / 1000,
  totalArrestTime = 0,
  counts: RepeatCounts = {},
): string | null => {
  if (spokenTime !== null) return null;
  const check = repeatCheck(events, name, nowSeconds, totalArrestTime, counts);
  switch (check.kind) {
    case "new":
      return null;
    case "doubleTap":
      return `${name} was just logged, so it wasn't logged twice.`;
    case "confirm":
      return `${check.message} Not logged: if this is another, log it by hand.`;
  }
};
