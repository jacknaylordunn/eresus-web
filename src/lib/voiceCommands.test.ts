// Runs the shared phrase list in docs/fixtures/voice-commands.json, which the iOS app's tests also use.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchVoiceCommand } from "./voiceCommands";

const cases: { heard: string; command: string | null }[] = JSON.parse(
  readFileSync(new URL("../../docs/fixtures/voice-commands.json", import.meta.url), "utf8"),
);

describe("voice commands", () => {
  it.each(cases)('"$heard" -> $command', ({ heard, command }) => {
    expect(matchVoiceCommand(heard)).toBe(command);
  });
});
