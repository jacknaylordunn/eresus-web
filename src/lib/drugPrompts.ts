// When the drug buttons light up and what the line under each title says (matches iOS ArrestViewModel).
// Kept outside the React view model so it can be tested on its own.
import { TimeFormatter } from "@/utils/time";

export interface DrugPromptInput {
  isAdrenalineAvailable: boolean;
  isTraumaArrest: boolean;
  hideAdrenalinePrompt: boolean;
  hideAdrenalineDueWarning: boolean;
  hideAmiodaronePrompt: boolean;
  /** Seconds until the next adrenaline dose; null when no timed dose has been given. */
  timeUntilAdrenaline: number | null;
  adrenalineCount: number;
  amiodaroneCount: number;
  lidocaineCount: number;
  shockCount: number;
  /** Shocks counted for drug timing (stacked shocks count as one). */
  drugTimingShockCount: number;
  shockCountForAmiodarone1: number | null;
  lastRhythmNonShockable: boolean;
  antiarrhythmicGiven: "none" | "amiodarone" | "lidocaine";
}

export interface DrugPrompts {
  shouldShowAdrenalinePrompt: boolean;
  isAdrenalineDue: boolean;
  isAdrenalineHighlighted: boolean;
  shouldShowAmiodaroneFirstDosePrompt: boolean;
  shouldShowAmiodaroneReminder: boolean;
  isAmiodaroneHighlighted: boolean;
  shouldShowLidocaineReminder: boolean;
  adrenalineButtonDetail: string | null;
  amiodaroneButtonDetail: string | null;
  lidocaineButtonDetail: string | null;
}

export const drugPrompts = (s: DrugPromptInput): DrugPrompts => {
  // Traumatic arrest: HOTT comes before drugs, so drug reminders stay quiet.
  const shouldShowAdrenalinePrompt =
    s.isAdrenalineAvailable &&
    !s.hideAdrenalinePrompt &&
    !s.isTraumaArrest &&
    !(s.timeUntilAdrenaline !== null && s.timeUntilAdrenaline <= 0) &&
    s.adrenalineCount === 0 &&
    (s.drugTimingShockCount >= 3 || s.lastRhythmNonShockable);

  const isAdrenalineDue =
    s.isAdrenalineAvailable &&
    !s.hideAdrenalineDueWarning &&
    !s.isTraumaArrest &&
    s.timeUntilAdrenaline !== null &&
    s.timeUntilAdrenaline <= 0;

  // Not once lidocaine has been chosen, and not while drugs are withheld for severe hypothermia.
  const shouldShowAmiodaroneFirstDosePrompt =
    !s.isTraumaArrest &&
    s.drugTimingShockCount >= 3 &&
    s.amiodaroneCount === 0 &&
    !s.hideAmiodaronePrompt &&
    s.antiarrhythmicGiven !== "lidocaine" &&
    s.isAdrenalineAvailable;

  const shouldShowAmiodaroneReminder =
    !s.isTraumaArrest &&
    s.shockCountForAmiodarone1 !== null &&
    s.amiodaroneCount === 1 &&
    s.shockCount >= s.shockCountForAmiodarone1 + 2 &&
    !s.hideAmiodaronePrompt &&
    s.isAdrenalineAvailable;

  // RCUK 2025: if lidocaine is used instead of amiodarone, a further 50 mg after five defibrillation attempts.
  const shouldShowLidocaineReminder =
    !s.isTraumaArrest &&
    s.antiarrhythmicGiven === "lidocaine" &&
    s.lidocaineCount === 1 &&
    s.drugTimingShockCount >= 5 &&
    !s.hideAmiodaronePrompt &&
    s.isAdrenalineAvailable;

  // The line under the Adrenaline button: the countdown, or why it's lit.
  let adrenalineButtonDetail: string | null = null;
  if (s.isAdrenalineAvailable) {
    if (shouldShowAdrenalinePrompt) adrenalineButtonDetail = "Give now";
    else if (isAdrenalineDue) adrenalineButtonDetail = "Due now";
    else if (s.timeUntilAdrenaline !== null && s.timeUntilAdrenaline > 0)
      adrenalineButtonDetail = `Next in ${TimeFormatter.format(s.timeUntilAdrenaline)}`;
  }

  return {
    shouldShowAdrenalinePrompt,
    isAdrenalineDue,
    isAdrenalineHighlighted: shouldShowAdrenalinePrompt || isAdrenalineDue,
    shouldShowAmiodaroneFirstDosePrompt,
    shouldShowAmiodaroneReminder,
    isAmiodaroneHighlighted: shouldShowAmiodaroneFirstDosePrompt || shouldShowAmiodaroneReminder,
    shouldShowLidocaineReminder,
    adrenalineButtonDetail,
    amiodaroneButtonDetail: shouldShowAmiodaroneFirstDosePrompt
      ? "1st dose due"
      : shouldShowAmiodaroneReminder
        ? "2nd dose due"
        : null,
    lidocaineButtonDetail: shouldShowLidocaineReminder ? "2nd dose due" : null,
  };
};

/** "Not now" on a lit Adrenaline button: hides the prompt if it's showing, otherwise the due warning. */
export const adrenalineDismissal = (prompts: Pick<DrugPrompts, "shouldShowAdrenalinePrompt">) =>
  prompts.shouldShowAdrenalinePrompt ? ("prompt" as const) : ("dueWarning" as const);
