import { describe, expect, it } from "vitest";
import { buildSummary, type SummaryInput } from "./arrestSummary";

const base: SummaryInput = {
  events: [],
  totalTime: 600,
  startTime: new Date(2026, 10, 18, 10, 0, 0),
  shockCount: 0,
  adrenalineCount: 0,
  amiodaroneCount: 0,
  lidocaineCount: 0,
};

describe("summary outcome", () => {
  const events = [{ timestamp: 0, message: "Arrest Started at 10:00:00", type: "status" }];

  it("is in progress while the arrest is live", () => {
    expect(buildSummary({ ...base, events }).outcomeLabel).toBe("In progress");
  });

  it("is unknown for a saved log reset without ROSC or a stop", () => {
    const summary = buildSummary({ ...base, events, isLive: false });
    expect(summary.outcomeLabel).toBe("Unknown");
    expect(summary.copyText).toContain("Outcome: Unknown");
  });

  it("keeps ROSC for a saved log", () => {
    const withROSC = [...events, { timestamp: 300, message: "Return of Spontaneous Circulation (ROSC)", type: "status" }];
    expect(buildSummary({ ...base, events: withROSC, isLive: false }).outcomeLabel).toBe("ROSC");
  });
});

describe("newborn summary", () => {
  const events = [
    { timestamp: 0, message: "Newborn (Term) Life Support Started at 10:00:00", type: "status" },
    { timestamp: 60, message: "Moved to Airway & Inflation Breaths", type: "airway" },
    { timestamp: 120, message: "Started Chest Compressions (3:1 Ratio, 100% O₂)", type: "cpr" },
    { timestamp: 150, message: "Glucose 10% Given", type: "drug" },
    { timestamp: 240, message: "HR > 100 / Spontaneous Breathing Established", type: "status" },
  ];
  const summary = buildSummary({ ...base, events, patientAge: "Newborn" });

  it("is recognised as newborn", () => {
    expect(summary.isNewborn).toBe(true);
    expect(summary.outcomeLabel).toBe("Breathing");
  });

  it("copies newborn milestones and drugs, not shocks or adrenaline counts", () => {
    expect(summary.copyText).toContain("Inflation breaths:");
    expect(summary.copyText).toContain("Compressions started:");
    expect(summary.copyText).toContain("Drug: Glucose 10% Given");
    expect(summary.copyText).not.toContain("Shocks:");
    expect(summary.copyText).toContain("Outcome: HR > 100, breathing");
  });
});
