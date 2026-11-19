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
  // A saved log is finished: with no ROSC or stop recorded, its outcome is unknown, not in progress.
  isLive?: boolean;
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
  // Newborn life support: no shocks or antiarrhythmics, and the milestones are breaths, ventilation and compressions.
  const isNewborn = events.some(
    (e) => e.message.includes("Life Support Started") && (e.message.startsWith("Newborn") || e.message.startsWith("Preterm")),
  );
  const isLive = input.isLive ?? true;

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
    outcome.kind === "rosc"
      ? isNewborn ? "Breathing" : "ROSC"
      : outcome.kind === "stopped"
        ? "Resuscitation stopped"
        : !isLive
          ? "Unknown"
          : reArrests.length === 0 ? "In progress" : isNewborn ? "Stopped breathing" : "Re-arrested";
  // What the outcome event is called in a row or the copied text.
  const outcomeEventLabel = outcome.kind === "rosc" ? (isNewborn ? "HR > 100, breathing" : "ROSC") : "Resuscitation stopped";

  const firstWith = (prefix: string) => events.find((e) => e.message.startsWith(prefix));
  const firstInflationBreaths = firstWith("Moved to Airway & Inflation Breaths");
  const firstVentilation = firstWith("Started Ventilation Breaths");
  const firstCompressions = firstWith("Started Chest Compressions");
  // Every drug logged, in order, for summaries where the arrest counters don't apply.
  const drugsGiven = events.filter((e) => e.type === "drug");

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
  const firstAdrenaline = events.find(
    (e) =>
      ["Adrenaline (", "Adrenaline Given", "Adrenaline given", "Adrenaline ×"].some((prefix) => e.message.startsWith(prefix)) ||
      /^Adrenaline \d/.test(e.message),
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

  // Laid out to paste cleanly into an ePR, Notes or an email: a heading, short labelled sections, one fact a
  // line, no column padding (it only lines up in a fixed-width font) and as few brackets as possible (matches iOS).
  const copyText = (() => {
    const lines: string[] = [];
    const section = (title: string, rows: (string | null | undefined)[]) => {
      const kept = rows.filter((row): row is string => !!row);
      if (kept.length === 0) return;
      lines.push("", title, ...kept);
    };
    const at = (event: LoggedEvent) => `${time(event)}, T+${format(event.timestamp)}`;
    const s = input.startTime;

    lines.push(isNewborn ? "NEWBORN LIFE SUPPORT SUMMARY" : "CARDIAC ARREST SUMMARY");
    if (s) lines.push(`Date: ${String(s.getDate()).padStart(2, "0")}/${String(s.getMonth() + 1).padStart(2, "0")}/${s.getFullYear()}`);
    if (demographics) lines.push(`Patient: ${demographics}`);
    lines.push(`Outcome: ${outcome.event ? `${outcomeEventLabel} at ${at(outcome.event)}` : outcomeLabel}`);

    const keyTimes: (string | null)[] = [];
    if (isNewborn) {
      keyTimes.push(startedEvent ? `Birth / NLS started: ${hhmm(clock(startedEvent))}` : null);
    } else {
      keyTimes.push(confirmedEvent ? `Arrest confirmed: ${time(confirmedEvent)}, estimated` : null);
      keyTimes.push(startedEvent ? `eResus started: ${hhmm(clock(startedEvent))}, T+${format(startedEvent.timestamp)}` : null);
    }
    if (reArrests.length > 0 && firstROSC) {
      keyTimes.push(`${isNewborn ? "First HR > 100" : "First ROSC"}: ${at(firstROSC)}`);
      for (const event of reArrests) keyTimes.push(`${isNewborn ? "Stopped breathing" : "Re-arrest"}: ${at(event)}`);
    }
    keyTimes.push(outcome.event ? `${outcomeEventLabel}: ${at(outcome.event)}` : null);
    keyTimes.push(vod ? `Death verified: ${time(vod)}` : null);
    section("KEY TIMES", keyTimes);

    const treatment: (string | null)[] = [];
    if (isNewborn) {
      treatment.push(firstInflationBreaths ? `Inflation breaths: ${at(firstInflationBreaths)}` : null);
      treatment.push(firstVentilation ? `Ventilation started: ${at(firstVentilation)}` : null);
      treatment.push(firstCompressions ? `Compressions started: ${at(firstCompressions)}` : null);
      for (const event of drugsGiven) treatment.push(`${event.message}, ${time(event)}`);
    } else {
      treatment.push(initialRhythm ? `Initial rhythm: ${initialRhythm}` : null);
      treatment.push(
        `Shocks: ${input.shockCount}` + (firstShock ? `, first at ${time(firstShock)}` : "") + (stackedShocks ? ", including 3 stacked" : ""),
      );
      treatment.push(`Adrenaline: ${input.adrenalineCount}` + (firstAdrenaline ? `, first at ${at(firstAdrenaline)}` : ""));
      if (antiarrhythmic.count > 0) treatment.push(`${antiarrhythmic.name}: ${antiarrhythmic.count}`);
    }
    treatment.push(firstAccess ? `First IV/IO: ${time(firstAccess)}` : null);
    treatment.push(firstAirway ? `First airway: ${time(firstAirway)}` : null);
    section("TREATMENT", treatment);

    section("HANDOVER", [
      destination ? `Destination: ${destination.message.replace("Conveying to: ", "")}, ${time(destination)}` : null,
      preAlert ? `Pre-alert: ${time(preAlert)}` : null,
    ]);

    section("TIMELINE", [
      `Clock | Time from ${isNewborn ? "birth" : timedFrom} | Entry`,
      ...events.map((event) => `${time(event)} | T+${format(event.timestamp)} | ${event.message}`),
    ]);

    section("NOTES", [
      hasEstimates ? "~ or est marks a time entered after the event." : null,
      hasEntryMarkers ? "Entries marked voice, lock screen or Dynamic Island were logged that way rather than by tapping in eResus." : null,
      "Generated by eResus, a scribe aid. Check against the ePR.",
    ]);
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
    outcomeEventLabel,
    isNewborn,
    isLive,
    firstInflationBreaths,
    firstVentilation,
    firstCompressions,
    drugsGiven,
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
