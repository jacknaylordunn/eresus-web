// Button colours by purpose, shared by the adult and newborn screens.
// Matches ButtonTone and ButtonHighlight in the iOS app (Theme.swift); colours live in src/index.css.

export type ButtonTone = "standard" | "primary" | "danger" | "dangerTint" | "positive" | "slate";

export const TONE_CLASSES: Record<ButtonTone, string> = {
  standard: "bg-tone-tint text-tone-on-tint",
  primary: "bg-tone-accent text-tone-on-accent",
  danger: "bg-tone-danger text-tone-on-danger",
  dangerTint: "bg-tone-danger-tint text-tone-on-danger-tint",
  positive: "bg-tone-positive text-tone-on-positive",
  slate: "bg-tone-slate text-tone-on-slate",
};

// Why a button is pulsing. Kept to two so the colour alone tells you what kind of moment it is:
// handsOff = pause compressions (rhythm check due, shock advised), drugDue = a drug reminder is showing.
export type ButtonHighlight = "handsOff" | "drugDue";

export const HIGHLIGHT_CLASSES: Record<ButtonHighlight, string> = {
  handsOff: "bg-tone-danger text-tone-on-danger halo-danger",
  drugDue: "bg-tone-alert text-tone-on-alert halo-alert",
};
