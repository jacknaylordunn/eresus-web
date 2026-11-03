// Runs the shared phrases in docs/fixtures/voice-commands.json, which the iOS app's tests also use.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { afterWakeWord, parseVoiceCommand } from "./voiceCommands";

const cases: { heard: string; expected: unknown }[] = JSON.parse(
  readFileSync(new URL("../../docs/fixtures/voice-commands.json", import.meta.url), "utf8"),
);

describe("voice command parser", () => {
  it.each(cases)('"$heard"', ({ heard, expected }) => {
    expect(parseVoiceCommand(heard)).toEqual(expected);
  });
});

describe("wake words", () => {
  it("returns what follows the wake word", () => {
    expect(afterWakeWord("Scribe, adrenaline 1 mg", "scribe")).toBe("adrenaline 1 mg");
    expect(afterWakeWord("ok so e resus rhythm check VF", "eresus")).toBe("rhythm check vf");
  });

  it("ignores speech without the wake word", () => {
    expect(afterWakeWord("adrenaline 1 mg", "scribe")).toBeNull();
    expect(afterWakeWord("adrenaline 1 mg", "eresus")).toBeNull();
  });
});
