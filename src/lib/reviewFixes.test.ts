// Mirrors ReviewFixTests in eResusTests/TraumaAndROSCTests.swift (iOS).
import { describe, expect, it } from "vitest";
import {
  ageTextForCategory,
  areDrugPromptsQuietened,
  checklistToggleEntry,
  currentRhythm,
  currentRhythmLine,
  isPaediatric,
  isTraumaArrest,
  meetsTarget,
  torCaution,
  TRAUMA_MARKS_ARREST,
  TRAUMA_OFF_ENTRY,
  TRAUMA_ON_ENTRY,
  TRAUMA_PROMPTS_RESTORED_ENTRY,
  type LoggedEvent,
} from "./arrestRecord";
import { buildSummary } from "./arrestSummary";
import { drugPrompts, type DrugPromptInput } from "./drugPrompts";

// Newest first, as the view model keeps them.
const log = (...entries: [number, string, string][]): LoggedEvent[] =>
  entries.map(([timestamp, message, type]) => ({ timestamp, message, type })).reverse();

const summaryOf = (events: LoggedEvent[], patientAge: string | null = null) =>
  buildSummary({
    events,
    totalTime: 60,
    startTime: null,
    shockCount: 0,
    adrenalineCount: 1,
    amiodaroneCount: 0,
    lidocaineCount: 0,
    patientAge,
    patientGender: null,
  });

describe("review fixes", () => {
  it("takes paediatric from the age recorded", () => {
    expect(isPaediatric(null, "")).toBeNull();
    expect(isPaediatric(false, "")).toBe(true); // 12 months
    expect(isPaediatric(true, "")).toBeNull(); // adult dosing category starts at 12
    expect(isPaediatric(true, "12")).toBe(true);
    expect(isPaediatric(true, "13")).toBe(false);
    expect(isPaediatric(true, "15")).toBe(false);
    expect(isPaediatric(null, "6 months")).toBe(true);
    expect(isPaediatric(null, "Newborn")).toBe(true);
    expect(isPaediatric(null, "17")).toBe(false);
    expect(isPaediatric(null, "45")).toBe(false);
    expect(isPaediatric(null, "about 40")).toBeNull();
    expect(isPaediatric(null, "", true)).toBe(true);
  });

  it("uses the current rhythm for ToR", () => {
    const events = log(
      [0, "Rhythm analysis. Pausing CPR.", "analysis"],
      [5, "Rhythm is Asystole", "rhythm"],
      [125, "Rhythm analysis. Pausing CPR.", "analysis"],
      [130, "Rhythm is VF", "rhythm"],
    );
    expect(currentRhythm(events)).toBe("VF");
    expect(currentRhythm([])).toBeNull();
    expect(currentRhythmLine("VF", "Asystole")).toBe("Current rhythm: VF; initial rhythm: Asystole.");
    expect(currentRhythmLine(null, null)).toBe("Current rhythm: not named yet.");
  });

  it("warns to continue when hypothermia is recorded", () => {
    expect(torCaution([{ name: "Hypothermia", hypothermiaStatus: "moderate" }])).toBe(
      "Hypothermia recorded: continue resuscitation and convey for rewarming unless senior advice says otherwise.",
    );
    expect(torCaution([{ name: "Hypothermia", hypothermiaStatus: "severe" }])).not.toBeNull();
    expect(torCaution([{ name: "Hypothermia", hypothermiaStatus: "normothermic" }])).toBeNull();
  });

  it("doesn't quieten prompts for minor trauma care", () => {
    expect(TRAUMA_MARKS_ARREST.has("Haemostatic dressing / packing")).toBe(false);
    expect(TRAUMA_MARKS_ARREST.has("Traction splint")).toBe(false);
    expect(TRAUMA_MARKS_ARREST.has("Enhanced / critical care requested")).toBe(false);
    for (const name of ["Pelvic binder", "Tourniquet", "Thoracotomy", "REBOA", "Needle decompression (left)", "Thoracostomy (bilateral)"]) {
      expect(TRAUMA_MARKS_ARREST.has(name)).toBe(true);
    }
    const events = log([0, TRAUMA_ON_ENTRY, "status"], [1, "Pelvic binder", "airway"]);
    expect(isTraumaArrest(events)).toBe(true);
    expect(areDrugPromptsQuietened(events)).toBe(true);
  });

  it("brings prompts back once HOTT is addressed", () => {
    let events = log([0, TRAUMA_ON_ENTRY, "status"]);
    const input: DrugPromptInput = {
      isAdrenalineAvailable: true,
      areDrugPromptsQuietened: areDrugPromptsQuietened(events),
      hideAdrenalinePrompt: false,
      hideAdrenalineDueWarning: false,
      hideAmiodaronePrompt: false,
      timeUntilAdrenaline: null,
      adrenalineCount: 0,
      amiodaroneCount: 0,
      lidocaineCount: 0,
      shockCount: 0,
      drugTimingShockCount: 0,
      shockCountForAmiodarone1: null,
      lastRhythmNonShockable: true, // PEA
      antiarrhythmicGiven: "none",
    };
    expect(drugPrompts(input).adrenalineButtonDetail).toBeNull();
    events = [{ timestamp: 30, message: TRAUMA_PROMPTS_RESTORED_ENTRY, type: "status" }, ...events];
    expect(isTraumaArrest(events)).toBe(true);
    expect(areDrugPromptsQuietened(events)).toBe(false);
    expect(drugPrompts({ ...input, areDrugPromptsQuietened: areDrugPromptsQuietened(events) }).adrenalineButtonDetail).toBe(
      "1st dose due",
    );
    // Trauma switched on again later quietens them again; off restores them.
    events = [{ timestamp: 60, message: TRAUMA_ON_ENTRY, type: "status" }, ...events];
    expect(areDrugPromptsQuietened(events)).toBe(true);
    events = [{ timestamp: 90, message: TRAUMA_OFF_ENTRY, type: "status" }, ...events];
    expect(areDrugPromptsQuietened(events)).toBe(false);
  });

  it("leaves the target unticked for off-target readings", () => {
    expect(meetsTarget("bp", "78/40")).toBe(false);
    expect(meetsTarget("bp", "120/80")).toBe(true);
    expect(meetsTarget("spo2", "86%")).toBe(false);
    expect(meetsTarget("spo2", "96%")).toBe(true);
    expect(meetsTarget("spo2", "100%")).toBe(false);
    expect(meetsTarget("glucose", "2.1 mmol/L")).toBe(true);
  });

  it("doesn't take push-dose adrenaline as the first arrest dose", () => {
    const summary = summaryOf(
      log(
        [0, "Arrest Started at 10:00", "status"],
        [10, "Adrenaline push-dose (10 mcg) Given", "drug"],
        [20, "Adrenaline (1mg) Given – Dose 1", "drug"],
      ),
      "6 months",
    );
    expect(summary.firstAdrenaline?.timestamp).toBe(20);
    expect(summary.demographics).toBe("6 months");
    expect(summary.timedFrom).toBe("eResus start");
    expect(summary.copyText).toContain("TIMELINE (clock / T+ from eResus start)");
  });

  it("times from the arrest being confirmed when time was added", () => {
    const summary = summaryOf(log([300, "Arrest Started at 10:05", "status"]), "45");
    expect(summary.timedFrom).toBe("arrest confirmed");
    expect(summary.demographics).toBe("45 y");
  });

  it("shows stacked shocks, the entry-marker key and the initial rhythm without markers", () => {
    const summary = summaryOf(
      log(
        [0, "Arrest Started at 10:00", "status"],
        [5, "Rhythm is VF (lock screen)", "rhythm"],
        [10, "3 Stacked Shocks Delivered (count as one for drug timing)", "shock"],
        [20, "Adrenaline (1mg) Given – Dose 1 (voice)", "drug"],
      ),
    );
    expect(summary.initialRhythm).toBe("VF");
    expect(summary.copyText).toContain("Shocks: 0 (incl. 3 stacked)");
    expect(summary.hasEntryMarkers).toBe(true);
    expect(summary.copyText).toContain("(voice) = entered by voice;");
  });

  it("keeps infant ages in months from the dose dialog", () => {
    expect(ageTextForCategory("6 years", false)).toBe("6");
    expect(ageTextForCategory("6 months", false)).toBe("6 months");
    expect(ageTextForCategory("1 month", false)).toBe("1 month");
    expect(ageTextForCategory("≥12 years / Adult", true)).toBeNull();
    expect(ageTextForCategory("At birth", false)).toBeNull();
  });

  it("logs checklist ticks in plain words", () => {
    expect(checklistToggleEntry("Hypoxia", true, true)).toBe("Reversible cause Hypoxia: considered");
    expect(checklistToggleEntry("Hypoxia", false, true)).toBe("Reversible cause Hypoxia: unticked");
    expect(checklistToggleEntry("**12-Lead ECG**", true, false)).toBe("12-Lead ECG: ticked");
    expect(checklistToggleEntry("12-Lead ECG", false, false)).toBe("12-Lead ECG: unticked");
  });
});
