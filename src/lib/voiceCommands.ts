// The phrase list and matching rules must match the iOS app (VoiceCommands.swift).
// docs/fixtures/voice-commands.json holds the test phrases both apps check against.

export type VoiceCommand =
  | "adrenaline"
  | "amiodarone"
  | "lidocaine"
  | "analyse"
  | "vf"
  | "vt"
  | "pea"
  | "asystole"
  | "shock"
  | "rosc"
  | "undo";

const PHRASES: Record<VoiceCommand, string[]> = {
  adrenaline: ["adrenaline", "adrenalin", "epinephrine", "epi"],
  amiodarone: ["amiodarone", "amio"],
  lidocaine: ["lidocaine", "lignocaine"],
  analyse: [
    "analyse rhythm",
    "analyze rhythm",
    "analyse the rhythm",
    "analyze the rhythm",
    "rhythm check",
    "check rhythm",
    "check the rhythm",
  ],
  vf: ["vf", "v f", "ventricular fibrillation"],
  vt: ["vt", "v t", "ventricular tachycardia", "pulseless vt"],
  pea: ["pea", "p e a", "pulseless electrical activity"],
  asystole: ["asystole", "a systole"],
  shock: ["shock", "shocked", "shock delivered"],
  rosc: ["rosc", "r o s c", "return of spontaneous circulation"],
  undo: ["undo", "scratch that", "cancel that"],
};

// Words to bias recognition towards.
export const VOICE_VOCABULARY = [
  "adrenaline",
  "amiodarone",
  "lidocaine",
  "analyse rhythm",
  "rhythm check",
  "VF",
  "VT",
  "PEA",
  "asystole",
  "shock",
  "ROSC",
  "undo",
];

// Lower case, dots between letters dropped ("v.f." -> "vf"), everything else that isn't a letter or digit is a space.
const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

const containsPhrase = (heard: string[], phrase: string): boolean => {
  const target = phrase.split(" ");
  for (let start = 0; start + target.length <= heard.length; start++) {
    if (target.every((word, i) => heard[start + i] === word)) return true;
  }
  return false;
};

// Whole-word phrase matching. Exactly one command must be heard; none or several means do nothing,
// because a wrong entry in the record is worse than asking again.
export const matchVoiceCommand = (transcript: string): VoiceCommand | null => {
  const heard = words(transcript);
  if (heard.length === 0) return null;
  const matches = (Object.keys(PHRASES) as VoiceCommand[]).filter((command) =>
    PHRASES[command].some((phrase) => containsPhrase(heard, phrase)),
  );
  return matches.length === 1 ? matches[0] : null;
};
