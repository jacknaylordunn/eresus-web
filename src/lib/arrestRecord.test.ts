// Mirrors eResusTests/TraumaAndROSCTests.swift in the iOS app, for the logic that lives outside the React view model.
import { describe, expect, it } from "vitest";
import {
  bpEntry,
  clockFor,
  completeTask,
  DESTINATION_TASK,
  destinations,
  doseNote,
  drugGroupsFor,
  isTraumaArrest,
  latestObservation,
  observationEntry,
  observationValue,
  OTHER_DRUGS,
  POST_ROSC_TASKS,
  recentOtherDrugs,
  ROSC_OBSERVATION_ORDER,
  ROSC_OBSERVATIONS,
  TRAUMA_OFF_ENTRY,
  TRAUMA_ON_ENTRY,
  traumaEntryText,
  traumaInterventionCount,
  type LoggedEvent,
} from "./arrestRecord";
import { ascii, buildSummary } from "./arrestSummary";

// A log built the way the app builds it: newest first.
const log = (...entries: [number, string, string, number?][]): LoggedEvent[] =>
  entries.map(([timestamp, message, type, clock]) => ({ timestamp, message, type, clock })).reverse();

describe("traumatic arrest", () => {
  it("is turned on by the first intervention and logged once", () => {
    const events = log(
      [0, "Arrest Started at 10:00", "status"],
      [30, TRAUMA_ON_ENTRY, "status"],
      [30, traumaEntryText("Pelvic binder"), "airway"],
      [60, traumaEntryText("Thoracostomy (left)"), "airway"],
    );
    expect(isTraumaArrest(events)).toBe(true);
    expect(traumaInterventionCount(events)).toBe(2);
    expect(events.filter((e) => e.message === TRAUMA_ON_ENTRY)).toHaveLength(1);
  });

  it("follows the newest on/off entry, so undo and switching off both work", () => {
    expect(isTraumaArrest([])).toBe(false);
    const on = log([10, TRAUMA_ON_ENTRY, "status"]);
    expect(isTraumaArrest(on)).toBe(true);
    const off = log([10, TRAUMA_ON_ENTRY, "status"], [20, TRAUMA_OFF_ENTRY, "status"]);
    expect(isTraumaArrest(off)).toBe(false);
    // Undoing the later entries leaves the earlier state.
    expect(isTraumaArrest(off.slice(1))).toBe(true);
    // Voice marks don't hide it.
    expect(isTraumaArrest(log([10, `${TRAUMA_ON_ENTRY} (voice)`, "status"]))).toBe(true);
  });

  it("labels a custom intervention", () => {
    expect(traumaEntryText("Splinted femur")).toBe("Trauma: Splinted femur");
    expect(traumaEntryText("REBOA")).toBe("REBOA");
    expect(traumaInterventionCount(log([5, "Trauma: Splinted femur", "airway"]))).toBe(1);
    // An airway entry that isn't trauma doesn't count.
    expect(traumaInterventionCount(log([5, "Advanced Airway Placed", "airway"]))).toBe(0);
  });

  it("puts the major trauma centre first after a traumatic arrest", () => {
    expect(destinations(true)[0]).toBe("Major trauma centre");
    expect(destinations(false)[0]).toBe("PPCI centre");
    expect(destinations(false)).toContain("Major trauma centre");
  });
});

describe("post-ROSC observations", () => {
  it("finds the latest value of each observation from the log", () => {
    const events = log(
      [600, observationEntry("bp", "110/70 (MAP 83)"), "status"],
      [610, observationEntry("spo2", "96%"), "status"],
      [620, "ETCO2: 4.8 kPa", "etco2"],
      [700, observationEntry("spo2", "98%"), "status"],
    );
    expect(latestObservation(events, "bp")?.value).toBe("110/70 (MAP 83)");
    expect(latestObservation(events, "spo2")).toEqual({ value: "98%", time: 700 });
    expect(latestObservation(events, "etco2")?.value.startsWith("4.8")).toBe(true);
    expect(latestObservation(events, "glucose")).toBeNull();
  });

  it("ticks the matching checklist rows", () => {
    let tasks = POST_ROSC_TASKS.map((t) => ({ ...t, isCompleted: false }));
    tasks = completeTask(tasks, ROSC_OBSERVATIONS.bp.checklistItem);
    tasks = completeTask(tasks, DESTINATION_TASK);
    const done = tasks.filter((t) => t.isCompleted).map((t) => t.name);
    expect(done).toEqual(["SBP > 100 mmHg (MAP > 65)", "Destination & pre-alert"]);
  });

  it("has a checklist row for every observation", () => {
    const names = new Set(POST_ROSC_TASKS.map((t) => t.name));
    for (const observation of ROSC_OBSERVATION_ORDER) {
      expect(names.has(ROSC_OBSERVATIONS[observation].checklistItem)).toBe(true);
    }
    expect(names.has(DESTINATION_TASK)).toBe(true);
  });

  it("checks values before they are logged", () => {
    expect(bpEntry("110", "70")?.value).toBe("110/70 (MAP 83)");
    expect(bpEntry("70", "110")).toBeNull();
    expect(observationValue("spo2", "96")).toEqual({ value: "96%" });
    expect(observationValue("temperature", "36,4")).toEqual({ value: "36.4 °C" });
    expect(observationValue("glucose", "5.2")).toEqual({ value: "5.2 mmol/L" });
    expect(observationValue("spo2", "120")).toEqual({ error: "Enter a value between 1 and 100." });
    // Very low sats and deep hypothermia are real readings.
    expect(observationValue("spo2", "40")).toEqual({ value: "40%" });
    expect(observationValue("temperature", "18")).toEqual({ value: "18 °C" });
    expect(observationValue("temperature", "12")).toEqual({ error: "Enter a value between 13 and 45." });
    expect(observationValue("spo2", "")).toBeNull();
  });
});

describe("other medications", () => {
  it("leave out arrest doses counted by the main buttons", () => {
    expect(OTHER_DRUGS).not.toContain("Adrenaline 1:10,000");
    expect(OTHER_DRUGS.some((d) => d.startsWith("Amiodarone") || d.startsWith("Lidocaine"))).toBe(false);
    expect(new Set(OTHER_DRUGS).size).toBe(OTHER_DRUGS.length);
    for (const drug of ["Tranexamic acid", "Calcium chloride 10%", "Tenecteplase", "Ketamine", "Naloxone", "Whole blood"]) {
      expect(OTHER_DRUGS).toContain(drug);
    }
  });

  it("show the focused group first, and newborn drugs first for a newborn", () => {
    expect(drugGroupsFor(false, "sedation")[0].kind).toBe("sedation");
    expect(drugGroupsFor(true)[0].kind).toBe("newborn");
    expect(drugGroupsFor(false).some((g) => g.kind === "newborn")).toBe(false);
  });

  it("list recent drugs most recent first, without repeats", () => {
    const events = log(
      [10, "Ketamine (50mg) Given", "drug"],
      [20, "Adrenaline Given – Dose 1", "drug"],
      [30, "Tranexamic acid Given", "drug"],
      [40, "Ketamine Given", "drug"],
    );
    expect(recentOtherDrugs(events)).toEqual(["Ketamine", "Tranexamic acid"]);
  });
});

describe("voice dose check", () => {
  it("compares with the dose for the age, ignoring spacing and spelled-out units", () => {
    expect(doseNote("adrenaline", "1 mg", "1mg", true)).toBeNull();
    expect(doseNote("adrenaline", "1 milligrams", "1mg", true)).toBeNull();
    expect(doseNote("amiodarone", "300 mg", "150mg", true)).toBe("Check the amiodarone dose: usual adult dose is 150mg.");
    expect(doseNote("adrenaline", "1 mg", "210mcg", false)).toBe(
      "Check the adrenaline dose: calculated dose for this age is 210mcg.",
    );
    expect(doseNote("adrenaline", null, "1mg", true)).toBeNull();
  });
});

describe("summary", () => {
  const start = new Date(2026, 10, 5, 14, 0, 0);
  const at = (minutes: number) => start.getTime() / 1000 + minutes * 60;

  it("uses stored clock times, so a pause doesn't shift them", () => {
    // Paused for 10 minutes after 2 minutes: the start time moved on, the stored clock times didn't.
    const events = log(
      [0, "Arrest Started at 14:00", "status", at(0)],
      [180, "Adrenaline (1mg) Given – Dose 1", "drug", at(13)],
    );
    const s = buildSummary({
      events,
      totalTime: 200,
      startTime: new Date(start.getTime() + 10 * 60_000),
      shockCount: 0,
      adrenalineCount: 1,
      amiodaroneCount: 0,
      lidocaineCount: 0,
    });
    expect(s.time(s.firstAdrenaline!)).toBe("14:13");
    // An entry from an older build is worked out from the start.
    expect(s.time({ timestamp: 60, message: "Old entry", type: "status" })).toBe("14:11");
  });

  it("back-dates clock times by the same distance as the arrest clock", () => {
    const now = at(10) * 1000;
    expect(clockFor(300, 600, now)).toBe(at(5));
  });

  it("doesn't report a re-arrest after ROSC as ROSC", () => {
    const events = log(
      [0, "Arrest Started at 14:00", "status", at(0)],
      [300, "Return of Spontaneous Circulation (ROSC)", "status", at(5)],
    );
    const input = { totalTime: 400, startTime: start, shockCount: 0, adrenalineCount: 0, amiodaroneCount: 0, lidocaineCount: 0 };
    expect(buildSummary({ ...input, events }).outcome.kind).toBe("rosc");
    const reArrested = [{ timestamp: 400, message: "Patient Re-Arrested. CPR Resumed.", type: "status", clock: at(6) }, ...events];
    const s = buildSummary({ ...input, events: reArrested });
    expect(s.outcome.kind).toBe("inProgress");
    expect(s.outcomeLabel).toBe("Re-arrested");
    expect(s.copyText).toContain("First ROSC: 14:05 (T+05:00)");
    expect(s.copyText).toContain("Re-arrest: 14:06 (T+06:40)");
  });

  it("copies plain ASCII, 24-hour times and one antiarrhythmic", () => {
    const events = log(
      [0, "Cardiac arrest confirmed ~10 min before eResus was started (estimated)", "status", at(-10)],
      [600, "Arrest Started at 14:00", "status", at(0)],
      [600, "Adrenaline ×2 before eResus, times unknown (estimated)", "drug", at(0)],
      [900, "Return of Spontaneous Circulation (ROSC)", "status", at(5)],
      [960, observationEntry("spo2", "96%"), "status", at(6)],
      [1000, observationEntry("temperature", "36.4 °C"), "status", at(7)],
      [1100, "Conveying to: PPCI centre", "status", at(8)],
    );
    const text = buildSummary({
      events,
      totalTime: 1200,
      startTime: start,
      shockCount: 0,
      adrenalineCount: 2,
      amiodaroneCount: 0,
      lidocaineCount: 0,
      patientAge: "64",
      patientGender: "Male",
    }).copyText;
    expect([...text].every((c) => c.charCodeAt(0) < 128)).toBe(true);
    expect(text.startsWith("eRESUS ARREST SUMMARY 05/11/2026\nPt: 64 y Male\nArrest confirmed: ~13:50 (est)")).toBe(true);
    expect(text).toContain("eResus started: 14:00 (T+10:00)");
    expect(text).toContain("Outcome: ROSC 14:05 (T+15:00)");
    expect(text).toContain("Adrenaline: 2 (first ~14:00, T+10)");
    expect(text).toContain("SpO2 96%");
    expect(text).toContain("Temperature 36.4 deg C");
    expect(text).toContain("Conveying to: PPCI centre 14:08");
    expect(text).toContain("Adrenaline x2 before eResus, times unknown (est)");
    expect(text).not.toContain("Lidocaine");
    expect(text).not.toContain("Amiodarone");
    expect(text).toContain("Verify against ePR");
    expect(/ (am|pm)\b/i.test(text)).toBe(false);
  });

  it("keeps entries logged in the same second in the order they were logged", () => {
    const events = log([30, TRAUMA_ON_ENTRY, "status"], [30, "Pelvic binder", "airway"]);
    const s = buildSummary({ events, totalTime: 60, startTime: start, shockCount: 0, adrenalineCount: 0, amiodaroneCount: 0, lidocaineCount: 0 });
    expect(s.events.map((e) => e.message)).toEqual([TRAUMA_ON_ENTRY, "Pelvic binder"]);
  });

  it("replaces typography an ePR box might mangle", () => {
    expect(ascii("SpO₂ 94–98% · 36 °C")).toBe("SpO2 94-98% - 36 deg C");
  });
});
