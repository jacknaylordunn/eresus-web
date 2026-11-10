// Catching a drug or intervention logged twice by mistake (matches iOS ArrestViewModel lastEntry/repeatCheck).
import { hhmm } from "./arrestRecord";

export interface LoggedEntry {
  /** Seconds on the arrest clock. */
  timestamp: number;
  message: string;
  /** Seconds since 1970 when it was logged; missing on older logs. */
  clock?: number;
}

const TRAUMA_PREFIX = "Trauma: ";

// The latest entry for a drug or intervention ("Adrenaline (1mg) Given – Dose 2", "Tourniquet (voice)"), so a
// repeat can be caught. "Adrenaline" doesn't match "Adrenaline infusion". Events are newest first.
export const lastEntry = <E extends LoggedEntry>(events: E[], name: string): E | undefined =>
  events.find((event) => {
    let rest = event.message;
    if (rest.startsWith(TRAUMA_PREFIX)) rest = rest.slice(TRAUMA_PREFIX.length);
    if (!rest.startsWith(name)) return false;
    const tail = rest.slice(name.length);
    return tail === "" || tail.startsWith(" (") || tail.startsWith(" Given");
  });

// Drugs normally given once, so any second entry is checked: TXA's second gram is a deliberate decision.
export const SINGLE_DOSE_DRUGS = new Set(["Tranexamic acid"]);

// Whether logging this again looks like a duplicate: a double tap (ignored) or a repeat soon after (confirmed).
export type RepeatCheck = { kind: "new" } | { kind: "doubleTap" } | { kind: "confirm"; ago: number; at: Date | null };

/**
 * @param nowSeconds wall-clock seconds since 1970
 * @param totalArrestTime the arrest clock now, used for entries without a wall-clock time
 */
export const repeatCheck = (
  events: LoggedEntry[],
  name: string,
  nowSeconds: number = Date.now() / 1000,
  totalArrestTime = 0,
): RepeatCheck => {
  const event = lastEntry(events, name);
  if (!event) return { kind: "new" };
  // Wall clock, because the arrest clock stops while paused.
  const ago = event.clock !== undefined ? nowSeconds - event.clock : Math.max(0, totalArrestTime - event.timestamp);
  if (ago < 3) return { kind: "doubleTap" };
  if (ago < 60 || SINGLE_DOSE_DRUGS.has(name)) {
    return {
      kind: "confirm",
      ago,
      at: event.clock !== undefined ? new Date(event.clock * 1000) : null,
    };
  }
  return { kind: "new" };
};

// What the repeat question says, e.g. "Adrenaline was logged 20 seconds ago."
export const repeatMessage = (name: string, ago: number, at: Date | null): string => {
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
): string | null => {
  if (spokenTime !== null) return null;
  const check = repeatCheck(events, name, nowSeconds, totalArrestTime);
  switch (check.kind) {
    case "new":
      return null;
    case "doubleTap":
      return `${name} was just logged, so it wasn't logged twice.`;
    case "confirm":
      return `${repeatMessage(name, check.ago, check.at)} Not logged twice: if this is another, log it by hand.`;
  }
};
