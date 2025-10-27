import { HypothermiaStatus, AppearanceMode, type ChecklistItem, type AppSettings } from '@/types/arrest';

export const AppConstants = {
  reversibleCausesTemplate: [
    { id: "hypoxia", name: "Hypoxia", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "hypovolemia", name: "Hypovolemia", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "hypo-hyperkalaemia", name: "Hypo/Hyperkalaemia", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "hypothermia", name: "Hypothermia", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "toxins", name: "Toxins", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "tamponade", name: "Tamponade", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "tension-pneumothorax", name: "Tension Pneumothorax", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "thrombosis", name: "Thrombosis", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None }
  ] as ChecklistItem[],
  
  postROSCTasksTemplate: [
    { id: "ventilation", name: "Optimise Ventilation & Oxygenation", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "ecg", name: "12-Lead ECG", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "hypotension", name: "Treat Hypotension (SBP < 90)", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "glucose", name: "Check Blood Glucose", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "temp", name: "Consider Temperature Control", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "causes", name: "Identify & Treat Causes", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None }
  ] as ChecklistItem[],
  
  postMortemTasksTemplate: [
    { id: "reposition", name: "Reposition body & remove lines/tubes", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "documentation", name: "Complete documentation", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "expected", name: "Determine expected/unexpected death", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "coroner", name: "Contact Coroner (if unexpected)", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "procedure", name: "Follow local body handling procedure", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "leaflet", name: "Provide leaflet to bereaved relatives", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "donation", name: "Consider organ/tissue donation", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None }
  ] as ChecklistItem[],
  
  otherDrugs: [
    "Adenosine", "Adrenaline 1:1000", "Adrenaline 1:10,000", "Amiodarone (Further Dose)",
    "Atropine", "Calcium chloride", "Glucose", "Hartmann's solution", "Magnesium sulphate",
    "Midazolam", "Naloxone", "Potassium chloride", "Sodium bicarbonate", "Sodium chloride", "Tranexamic acid"
  ].sort()
};

export const defaultSettings: AppSettings = {
  cprCycleDuration: 120,
  adrenalineInterval: 240,
  metronomeBPM: 110,
  appearanceMode: AppearanceMode.System,
  showDosagePrompts: false,
};
