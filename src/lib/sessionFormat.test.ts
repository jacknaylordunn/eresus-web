// Decodes the shared fixtures in docs/fixtures, which the iOS app's tests also use,
// so both apps are held to the same session format (docs/session-format.md).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeSession, encodeSession, parseStateData, SESSION_FORMAT_VERSION } from "./sessionFormat";

const fixture = (name: string) =>
  readFileSync(new URL(`../../docs/fixtures/${name}.json`, import.meta.url), "utf8");

const CYCLE = 120;

describe("session format", () => {
  it("decodes version 1 from older iOS builds", () => {
    const session = decodeSession(parseStateData(fixture("session-ios-v1")), CYCLE);

    expect(session.formatVersion).toBe(1);
    expect(session.arrestType).toBe("GENERAL");
    expect(session.shockCount).toBe(2);
    expect(session.stackedShockExtra).toBe(0);
    // No cprCycleStartTime in v1: derived from masterTime + timeOffset - (cycle - cprTime).
    expect(session.cprCycleStartTime).toBe(640);
    expect(session.startTime?.toISOString()).toBe("2026-11-01T10:00:00.000Z");
    expect(session.events).toHaveLength(3);
    expect(session.events[0].message).toBe("Shock 2 Delivered");
    expect(session.uiState).toBe("default");
  });

  it("decodes version 2 with stacked shocks", () => {
    const session = decodeSession(parseStateData(fixture("session-v2")), CYCLE);

    expect(session.formatVersion).toBe(2);
    expect(session.shockCount).toBe(4);
    expect(session.stackedShockExtra).toBe(2);
    expect(session.cprCycleStartTime).toBe(630);
    expect(session.lastAdrenalineTime).toBe(650);
  });

  it("round-trips through the iOS-compatible encoding", () => {
    const original = decodeSession(parseStateData(fixture("session-v2")), CYCLE);
    const wire = JSON.parse(encodeSession({ ...original, torTime: 900, vodTime: 1200, vodConfirmed: true }));

    expect(wire.formatVersion).toBe(SESSION_FORMAT_VERSION);
    // Fields iOS 1.2 requires must still be present in the shape it expects.
    expect(typeof wire.eventsData).toBe("string");
    expect(wire.uiState).toEqual({ default: {} });
    expect(typeof wire.startTime).toBe("number");
    expect(wire.nlsPretermTasks).toEqual([]);

    const again = decodeSession(wire, CYCLE);
    expect(again.stackedShockExtra).toBe(2);
    expect(again.cprCycleStartTime).toBe(630);
    expect(again.startTime?.getTime()).toBe(original.startTime?.getTime());
    expect(again.events.map((e) => e.message)).toEqual(original.events.map((e) => e.message));
    // TOR and VOD used to be dropped on PWA-to-PWA transfers.
    expect(again.torTime).toBe(900);
    expect(again.vodTime).toBe(1200);
    expect(again.vodConfirmed).toBe(true);
  });

  it("gives iOS UUID ids and supported event types", () => {
    const original = decodeSession(parseStateData(fixture("session-v2")), CYCLE);
    const wire = JSON.parse(
      encodeSession({
        ...original,
        events: [{ timestamp: 10, message: "Vascular Access (IV) – Failed", type: "vascularAccess" }],
        reversibleCauses: [{ id: "hypoxia", name: "Hypoxia", isCompleted: true, hypothermiaStatus: "none" }],
      }),
    );
    const events = JSON.parse(Buffer.from(wire.eventsData, "base64").toString("utf8"));
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    expect(events[0].type).toBe("status");
    expect(events[0].id).toMatch(uuid);
    expect(wire.reversibleCauses[0].id).toMatch(uuid);
  });

  it("accepts base64 stateData from older PWA builds", () => {
    const base64 = Buffer.from(fixture("session-ios-v1"), "utf8").toString("base64");
    expect(decodeSession(parseStateData(base64), CYCLE).shockCount).toBe(2);
  });
});
