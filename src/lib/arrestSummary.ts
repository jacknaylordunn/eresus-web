// The arrest summary on screen and the plain text copied into an ePR. Matches SummaryView.swift in the
// iOS app; the copied format is the same in both apps.
import { hhmm, type LoggedEvent } from "./arrestRecord";

export interface SummaryInput {
  events: LoggedEvent[]; // any order
  totalTime: number;
  startTime: Date | null;
  shockCount: number;
  adrenalineCount: number;
  amiodaroneCount: number;
  lidocaineCount: number;
  patientAge?: string | null;
  patientGender?: string | null;
}

export type Outcome = "rosc" | "stopped" | "inProgress";

const CONFIRMED_PREFIXES = ["Cardiac arrest confirmed ~", "Born ~"];

const format = (seconds: number): string => {
  const time = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`;
};

const isEstimated = (event: LoggedEvent) => event.message.includes("(estimated)");
const isROSC = (event: LoggedEvent) => event.message.includes("(ROSC)") || event.message.startsWith("HR > 100");

// ePR free-text boxes can mangle anything beyond plain ASCII, so the copy sticks to it.
export const ascii = (text: string): string => {
  const replacements: [string, string][] = [
    ["×", "x"], ["₂", "2"], ["≥", ">="], ["≤", "<="], ["–", "-"], ["—", "-"], ["’", "'"], ["‘", "'"],
    ["“", '"'], ["”", '"'], ["°", " deg "], ["·", "-"], ["…", "..."], ["µ", "mc"],
    [" (estimated)", " (est)"], ["(lock screen)", "(lock scr)"],
  ];
  let result = text;
  for (const [from, to] of replacements) result = result.split(from).join(to);
  result = result.split("  ").join(" ");
  return [...result].filter((char) => char.charCodeAt(0) < 128).join("");
};

export const buildSummary = (input: SummaryInput) => {
  // Oldest first; entries logged at the same second keep the order they were logged in (input is newest first).
  const events = input.events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => (a.event.timestamp !== b.event.timestamp ? a.event.timestamp - b.event.timestamp : b.index - a.index))
    .map(({ event }) => event);

  const startedEvent = events.find((e) => e.message.startsWith("Arrest Started") || e.message.includes("Life Support Started"));

  // Older logs have no stored clock time; theirs is worked out from the start, which is right unless paused.
  const clock = (event: LoggedEvent): Date | null => {
    if (typeof event.clock === "number") return new Date(event.clock * 1000);
    if (!input.startTime) return null;
    return new Date(input.startTime.getTime() + (event.timestamp - (startedEvent?.timestamp ?? 0)) * 1000);
  };
  const time = (event: LoggedEvent) => (isEstimated(event) ? "~" : "") + hhmm(clock(event));
  const minutesIn = (event: LoggedEvent) => `T+${Math.floor(event.timestamp / 60)}`;

  const confirmedEvent = events.find((e) => e.type === "status" && CONFIRMED_PREFIXES.some((p) => e.message.startsWith(p)));
  const firstROSC = events.find(isROSC);
  const reArrests = events.filter((e) => e.message.startsWith("Patient Re-Arrested") || e.message.startsWith("Baby Stopped Breathing"));
  const stopped = events.find((e) => e.message.startsWith("Termination of Resuscitation") || e.message.startsWith("Resuscitation Ended"));
  const vod = events.find((e) => e.message.includes("Verification of Death"));
  const destination = [...events].reverse().find((e) => e.message.startsWith("Conveying to:"));
  const preAlert = events.find((e) => e.message.startsWith("Pre-alert given"));

  // From the order of events, so a re-arrest after ROSC isn't reported as ROSC.
  const outcome = ((): { kind: Outcome; event: LoggedEvent | null } => {
    if (stopped) return { kind: "stopped", event: stopped };
    const lastROSC = [...events].reverse().find(isROSC);
    if (lastROSC && reArrests.every((e) => e.timestamp < lastROSC.timestamp)) return { kind: "rosc", event: lastROSC };
    return { kind: "inProgress", event: null };
  })();

  const outcomeLabel =
    outcome.kind === "rosc" ? "ROSC" : outcome.kind === "stopped" ? "Resuscitation stopped" : reArrests.length === 0 ? "In progress" : "Re-arrested";

  const rhythmEvent = events.find((e) => e.type === "rhythm");
  const initialRhythm = rhythmEvent
    ? rhythmEvent.message
        .replace("Rhythm before eResus: ", "")
        .replace("Rhythm is ", "")
        .replace(" (estimated)", "")
        .replace(" (voice)", "")
        .replace(" (lock screen)", "")
        .replace(" (Dynamic Island)", "")
    : null;

  const firstShock = events.find((e) => e.type === "shock" || (e.message.startsWith("Shock") && e.message.includes("before eResus")));
  // Arrest-dose adrenaline only (the main button or a handover count), not push-dose, infusion or IM.
  const firstAdrenaline = events.find((e) =>
    ["Adrenaline (", "Adrenaline Given", "Adrenaline ×"].some((prefix) => e.message.startsWith(prefix)),
  );
  // Times are from the arrest being confirmed only when time before eResus was added; otherwise from eResus starting.
  const timedFrom = (startedEvent?.timestamp ?? 0) > 0 ? "arrest confirmed" : "eResus start";
  const stackedShocks = events.some((e) => e.message.startsWith("3 Stacked Shocks"));
  const hasEntryMarkers = events.some(
    (e) => e.message.includes("(voice)") || e.message.includes("(lock screen)") || e.message.includes("(Dynamic Island)"),
  );
  // iOS logs "- Successful", the PWA "– Secured".
  const firstAccess = events.find((e) => e.message.includes("Access") && (e.message.includes("Successful") || e.message.includes("Secured")));
  const firstAirway = events.find((e) => e.message.startsWith("Advanced Airway"));

  // One antiarrhythmic per arrest: lidocaine only when it was the one given.
  const antiarrhythmic =
    input.lidocaineCount > 0 ? { name: "Lidocaine", count: input.lidocaineCount } : { name: "Amiodarone", count: input.amiodaroneCount };

  const age = input.patientAge?.trim() ?? "";
  const gender = input.patientGender?.trim() ?? "";
  // A bare number is years; "6 months" and "Newborn" stand as they are.
  const ageText = age === "" ? "" : /^[+-]?\d+$/.test(age) ? `${age} y` : age;
  const demographics = [ageText, gender].filter(Boolean).join(" ") || null;

  const hasEstimates = events.some(isEstimated);

  const copyText = (() => {
    const lines: string[] = [];
    const s = input.startTime;
    const date = s ? `${String(s.getDate()).padStart(2, "0")}/${String(s.getMonth() + 1).padStart(2, "0")}/${s.getFullYear()}` : "";
    lines.push(`eRESUS ARREST SUMMARY ${date}`.trim());
    if (demographics) lines.push(`Pt: ${demographics}`);
    if (confirmedEvent) lines.push(`Arrest confirmed: ${time(confirmedEvent)} (est)`);
    if (startedEvent) lines.push(`eResus started: ${hhmm(clock(startedEvent))} (T+${format(startedEvent.timestamp)})`);
    const outcomeLine = () =>
      outcome.event
        ? `Outcome: ${outcome.kind === "rosc" ? "ROSC" : "TOR"} ${time(outcome.event)} (T+${format(outcome.event.timestamp)})`
        : `Outcome: ${outcomeLabel}`;
    if (reArrests.length > 0 && firstROSC) {
      lines.push(`First ROSC: ${time(firstROSC)} (T+${format(firstROSC.timestamp)})`);
      for (const event of reArrests) lines.push(`Re-arrest: ${time(event)} (T+${format(event.timestamp)})`);
    }
    lines.push(outcomeLine());
    if (vod) lines.push(`VOD: ${time(vod)}`);
    if (initialRhythm) lines.push(`Initial rhythm: ${initialRhythm}`);
    lines.push(
      `Shocks: ${input.shockCount}` + (stackedShocks ? " (incl. 3 stacked)" : "") + (firstShock ? ` (first ${time(firstShock)})` : ""),
    );
    lines.push(`Adrenaline: ${input.adrenalineCount}` + (firstAdrenaline ? ` (first ${time(firstAdrenaline)}, ${minutesIn(firstAdrenaline)})` : ""));
    if (antiarrhythmic.count > 0) lines.push(`${antiarrhythmic.name}: ${antiarrhythmic.count}`);
    if (firstAccess) lines.push(`First IV/IO: ${time(firstAccess)}`);
    if (firstAirway) lines.push(`First airway: ${time(firstAirway)}`);
    if (destination) lines.push(`${destination.message} ${time(destination)}`);
    if (preAlert) lines.push(`Pre-alert: ${time(preAlert)}`);
    if (hasEstimates) lines.push("Times marked ~/est were entered after the fact.");
    if (hasEntryMarkers) lines.push("(voice) = entered by voice; (lock screen)/(Dynamic Island) = tapped outside the app.");
    lines.push("");
    lines.push(`TIMELINE (clock / T+ from ${timedFrom})`);
    for (const event of events) lines.push(`${time(event)} (${format(event.timestamp)}) ${event.message}`);
    lines.push("");
    lines.push("Generated by eResus (scribe aid). Verify against ePR.");
    return ascii(lines.join("\n"));
  })();

  return {
    events,
    startedEvent,
    clock,
    time,
    minutesIn,
    confirmedEvent,
    firstROSC,
    reArrests,
    stopped,
    vod,
    destination,
    preAlert,
    outcome,
    outcomeLabel,
    initialRhythm,
    firstShock,
    firstAdrenaline,
    firstAccess,
    firstAirway,
    antiarrhythmic,
    demographics,
    hasEstimates,
    timedFrom,
    stackedShocks,
    hasEntryMarkers,
    copyText,
    format,
  };
};

export type ArrestSummary = ReturnType<typeof buildSummary>;
