// Mirrors DrugButtonDetailTests in eResusTests/TraumaAndROSCTests.swift (iOS).
import { describe, expect, it } from "vitest";
import { adrenalineDismissal, drugPrompts, promptHidesAfterAnalysis, type DrugPromptInput } from "./drugPrompts";

// A started arrest with nothing given yet.
const started = (): DrugPromptInput => ({
  isAdrenalineAvailable: true,
  areDrugPromptsQuietened: false,
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
  lastRhythmNonShockable: false,
  antiarrhythmicGiven: "none",
});

// The same state changes the view model makes.
const shock = (s: DrugPromptInput): DrugPromptInput => ({
  ...s,
  shockCount: s.shockCount + 1,
  drugTimingShockCount: s.drugTimingShockCount + 1,
  lastRhythmNonShockable: false,
  hideAdrenalinePrompt: false,
  hideAmiodaronePrompt: false,
});
const nonShockable = (s: DrugPromptInput): DrugPromptInput => ({ ...s, lastRhythmNonShockable: true, hideAdrenalinePrompt: false });
const giveAdrenaline = (s: DrugPromptInput, interval = 240): DrugPromptInput => ({
  ...s,
  adrenalineCount: s.adrenalineCount + 1,
  timeUntilAdrenaline: interval,
  lastRhythmNonShockable: false,
  hideAdrenalinePrompt: false,
  hideAdrenalineDueWarning: false,
});
const giveAmiodarone = (s: DrugPromptInput): DrugPromptInput => ({
  ...s,
  amiodaroneCount: s.amiodaroneCount + 1,
  antiarrhythmicGiven: "amiodarone",
  shockCountForAmiodarone1: s.amiodaroneCount === 0 ? s.shockCount : s.shockCountForAmiodarone1,
  hideAmiodaronePrompt: false,
});
const repeat = (s: DrugPromptInput, n: number, f: (s: DrugPromptInput) => DrugPromptInput) =>
  Array.from({ length: n }).reduce<DrugPromptInput>((acc) => f(acc), s);

describe("drug button detail", () => {
  it("adrenaline shows 1st dose due, then the countdown, then Due now", () => {
    let s = started();
    expect(drugPrompts(s).adrenalineButtonDetail).toBeNull();
    s = nonShockable(s);
    expect(drugPrompts(s).adrenalineButtonDetail).toBe("1st dose due");
    expect(drugPrompts(s).isAdrenalineHighlighted).toBe(true);
    s = giveAdrenaline(s);
    expect(drugPrompts(s).adrenalineButtonDetail).toBe("Next in 04:00");
    expect(drugPrompts(s).isAdrenalineHighlighted).toBe(false);
    s = { ...s, timeUntilAdrenaline: 61 };
    expect(drugPrompts(s).adrenalineButtonDetail).toBe("Next in 01:01");
    s = { ...s, timeUntilAdrenaline: 0 };
    expect(drugPrompts(s).adrenalineButtonDetail).toBe("Due now");
    expect(drugPrompts(s).isAdrenalineHighlighted).toBe(true);
  });

  it("adrenaline due can be dismissed, and the next dose clears it", () => {
    // The only dose was five minutes ago: the next one is due.
    let s: DrugPromptInput = { ...giveAdrenaline(started()), timeUntilAdrenaline: -60 };
    const before = drugPrompts(s);
    expect(before.adrenalineButtonDetail).toBe("Due now");
    expect(before.isAdrenalineHighlighted).toBe(true);
    expect(adrenalineDismissal(before)).toBe("dueWarning");
    s = { ...s, hideAdrenalineDueWarning: true };
    expect(drugPrompts(s).adrenalineButtonDetail).toBeNull();
    expect(drugPrompts(s).isAdrenalineHighlighted).toBe(false);
    s = giveAdrenaline(s);
    expect(drugPrompts(s).adrenalineButtonDetail).toBe("Next in 04:00");
  });

  it("Not now on 1st dose due hides the prompt rather than the due warning", () => {
    let s = nonShockable(started());
    expect(adrenalineDismissal(drugPrompts(s))).toBe("prompt");
    s = { ...s, hideAdrenalinePrompt: true };
    expect(drugPrompts(s).adrenalineButtonDetail).toBeNull();
    expect(drugPrompts(s).isAdrenalineHighlighted).toBe(false);
  });

  // Mirrors RepeatEntryTests.notNowLastsUntilTheNextRhythmCheck (iOS).
  it("Not now on a due adrenaline lasts until the next rhythm check", () => {
    let s: DrugPromptInput = { ...giveAdrenaline(started()), timeUntilAdrenaline: 0 };
    expect(adrenalineDismissal(drugPrompts(s))).toBe("dueWarning");
    s = { ...s, hideAdrenalineDueWarning: true };
    expect(drugPrompts(s).isAdrenalineHighlighted).toBe(false);
    s = { ...s, ...promptHidesAfterAnalysis() };
    expect(drugPrompts(s).isAdrenalineDue).toBe(true);
  });

  it("amiodarone shows which dose is due", () => {
    let s = repeat(started(), 3, shock);
    expect(drugPrompts(s).amiodaroneButtonDetail).toBe("1st dose due");
    s = giveAmiodarone(s);
    expect(drugPrompts(s).amiodaroneButtonDetail).toBeNull();
    s = repeat(s, 2, shock);
    expect(drugPrompts(s).amiodaroneButtonDetail).toBe("2nd dose due");
    expect(drugPrompts(s).isAmiodaroneHighlighted).toBe(true);
    s = { ...s, hideAmiodaronePrompt: true };
    expect(drugPrompts(s).amiodaroneButtonDetail).toBeNull();
    expect(drugPrompts(s).isAmiodaroneHighlighted).toBe(false);
  });

  it("lidocaine shows its second dose after five shocks", () => {
    let s: DrugPromptInput = { ...repeat(started(), 3, shock), antiarrhythmicGiven: "lidocaine", lidocaineCount: 1 };
    expect(drugPrompts(s).lidocaineButtonDetail).toBeNull();
    s = repeat(s, 2, shock);
    expect(drugPrompts(s).lidocaineButtonDetail).toBe("2nd dose due");
    expect(drugPrompts(s).amiodaroneButtonDetail).toBeNull();
  });

  it("trauma quietens the buttons", () => {
    let s: DrugPromptInput = { ...started(), areDrugPromptsQuietened: true };
    s = nonShockable(s);
    expect(drugPrompts(s).adrenalineButtonDetail).toBeNull();
    s = repeat(s, 3, shock);
    expect(drugPrompts(s).amiodaroneButtonDetail).toBeNull();
    expect(drugPrompts(s).isAdrenalineHighlighted).toBe(false);
    expect(drugPrompts(s).isAmiodaroneHighlighted).toBe(false);
  });

  it("shows nothing on adrenaline while it's withheld", () => {
    const s: DrugPromptInput = { ...giveAdrenaline(started()), isAdrenalineAvailable: false };
    expect(drugPrompts(s).adrenalineButtonDetail).toBeNull();
  });
});
