// Mirrors RepeatEntryTests in eResusTests/TraumaAndROSCTests.swift (iOS).
import { describe, expect, it } from "vitest";
import { traumaEntryText } from "./arrestRecord";
import { lastEntry, loggedAt, repeatCheck, repeatMessage, voiceRepeatRefusal, type LoggedEntry } from "./repeatCheck";

const NOW = 1_800_000_000; // wall-clock seconds
// Newest first, as the view model keeps them; logged "now" unless a clock is given.
const log = (events: LoggedEntry[], message: string, clock = NOW, timestamp = 0): LoggedEntry[] => [
  { timestamp, message, clock },
  ...events,
];

describe("repeat entries", () => {
  it("catches a double tap and asks about a repeat", () => {
    let events: LoggedEntry[] = [];
    expect(repeatCheck(events, "Adrenaline", NOW)).toEqual({ kind: "new" });
    events = log(events, "Adrenaline (1mg) Given – Dose 1");
    expect(repeatCheck(events, "Adrenaline", NOW).kind).toBe("doubleTap");
    const later = repeatCheck(events, "Adrenaline", NOW + 20);
    expect(later.kind).toBe("confirm");
    if (later.kind === "confirm") {
      expect(later.ago).toBeCloseTo(20, 0);
      expect(repeatMessage("Adrenaline", later.ago, later.at)).toBe("Adrenaline was logged 20 seconds ago.");
    }
    expect(repeatCheck(events, "Adrenaline", NOW + 200)).toEqual({ kind: "new" });
    // Other drugs and amiodarone are tracked on their own.
    expect(repeatCheck(events, "Amiodarone", NOW)).toEqual({ kind: "new" });
  });

  it("falls back to the arrest clock for entries without a wall-clock time", () => {
    const events: LoggedEntry[] = [{ timestamp: 100, message: "Lidocaine Given – Dose 1" }];
    expect(repeatCheck(events, "Lidocaine", NOW, 101).kind).toBe("doubleTap");
    expect(repeatCheck(events, "Lidocaine", NOW, 130).kind).toBe("confirm");
    expect(repeatCheck(events, "Lidocaine", NOW, 200).kind).toBe("new");
  });

  it("doesn't count similar names", () => {
    const events = log([], "Adrenaline infusion Given");
    expect(repeatCheck(events, "Adrenaline", NOW)).toEqual({ kind: "new" });
    expect(lastEntry(events, "Adrenaline infusion")).toBeDefined();
  });

  it("always asks about a second TXA, with the time it was given", () => {
    const events = log([], "Tranexamic acid (1g) Given");
    const check = repeatCheck(events, "Tranexamic acid", NOW + 900);
    expect(check.kind).toBe("confirm");
    if (check.kind !== "confirm") return;
    expect(check.at).not.toBeNull();
    const message = repeatMessage("Tranexamic acid", 900, check.at);
    expect(message).toMatch(/^Tranexamic acid was logged at \d{2}:\d{2}\.$/);
    const at = new Date(NOW * 1000);
    const hhmm = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
    expect(message).toBe(`Tranexamic acid was logged at ${hhmm}.`);
  });

  it("tracks trauma procedures, including voice and custom entries", () => {
    let events = log([], `${traumaEntryText("Pelvic binder")} (voice)`);
    expect(lastEntry(events, "Pelvic binder")).toBeDefined();
    expect(repeatCheck(events, "Pelvic binder", NOW).kind).toBe("doubleTap");
    events = log(events, traumaEntryText("Splinted leg"));
    expect(lastEntry(events, "Splinted leg")?.message).toBe("Trauma: Splinted leg");
    expect(loggedAt(events, "Splinted leg")).toEqual(new Date(NOW * 1000));
    expect(loggedAt(events, "Tourniquet")).toBeNull();
  });
});

describe("voice repeat refusal", () => {
  it("refuses a closed-loop repeat of a live voice entry", () => {
    const events = log([], "Adrenaline (1mg) Given – Dose 1 (voice)");
    expect(voiceRepeatRefusal(events, "Adrenaline", null, NOW + 1)).toBe(
      "Adrenaline was just logged, so it wasn't logged twice.",
    );
    expect(voiceRepeatRefusal(events, "Adrenaline", null, NOW + 10)).toBe(
      "Adrenaline was logged 10 seconds ago. Not logged twice: if this is another, log it by hand.",
    );
    expect(voiceRepeatRefusal(events, "Adrenaline", null, NOW + 300)).toBeNull();
    expect(voiceRepeatRefusal(events, "Amiodarone", null, NOW + 1)).toBeNull();
  });

  it("skips the check for back-dated phrases", () => {
    const events = log([], "Adrenaline Given – Dose 1");
    expect(voiceRepeatRefusal(events, "Adrenaline", 120, NOW + 1)).toBeNull();
  });
});
