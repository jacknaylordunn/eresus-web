// Enums
export enum ArrestState {
  Pending = "PENDING",
  Active = "ACTIVE",
  Rosc = "ROSC",
  Ended = "ENDED"
}

export enum UIState {
  Default = "DEFAULT",
  Analyzing = "ANALYZING",
  ShockAdvised = "SHOCK_ADVISED"
}

export enum EventType {
  Status = "STATUS",
  Cpr = "CPR",
  Shock = "SHOCK",
  Analysis = "ANALYSIS",
  Rhythm = "RHYTHM",
  Drug = "DRUG",
  Airway = "AIRWAY",
  Etco2 = "ETCO2",
  Cause = "CAUSE"
}

export enum AntiarrhythmicDrug {
  None = "NONE",
  Amiodarone = "AMIODARONE",
  Lidocaine = "LIDOCAINE"
}

export enum HypothermiaStatus {
  None = "NONE",
  Severe = "SEVERE",
  Moderate = "MODERATE",
  Normothermic = "NORMOTHERMIC"
}

export enum AppearanceMode {
  System = "System",
  Light = "Light",
  Dark = "Dark"
}

export enum DrugToLogType {
  Adrenaline,
  Amiodarone,
  Lidocaine,
  Other
}

export enum PatientAgeCategory {
  Adult = "ADULT",
  Paediatric = "PAEDIATRIC",
  Neonate = "NEONATE"
}

// Complex Types
export type DrugToLog =
  | { type: DrugToLogType.Adrenaline; title: 'Adrenaline' }
  | { type: DrugToLogType.Amiodarone; title: 'Amiodarone' }
  | { type: DrugToLogType.Lidocaine; title: 'Lidocaine' }
  | { type: DrugToLogType.Other; title: string };

export type ChecklistItem = {
  id: string;
  name: string;
  isCompleted: boolean;
  hypothermiaStatus: HypothermiaStatus;
};

export type EventLog = {
  id: string;
  timestamp: number;
  message: string;
  type: EventType;
};

// Firestore Document Structure
export type ArrestDocument = {
  startTime: number | null;
  totalDuration: number;
  finalOutcome: string;
  events: EventLog[];
  arrestState?: ArrestState;
  masterTime?: number;
  cprTime?: number;
  timeOffset?: number;
  uiState?: UIState;
  shockCount?: number;
  adrenalineCount?: number;
  amiodaroneCount?: number;
  lidocaineCount?: number;
  airwayPlaced?: boolean;
  antiarrhythmicGiven?: AntiarrhythmicDrug;
  lastAdrenalineTime?: number | null;
  shockCountForAmiodarone1?: number | null;
  reversibleCauses?: ChecklistItem[];
  postROSCTasks?: ChecklistItem[];
  postMortemTasks?: ChecklistItem[];
  patientAgeCategory?: PatientAgeCategory | null;
  cprCycleStartTime?: number;
};

export type PDFIdentifiable = {
  id: string;
  pdfName: string;
  title: string;
};

// App Settings
export type AppSettings = {
  cprCycleDuration: number;
  adrenalineInterval: number;
  metronomeBPM: number;
  appearanceMode: AppearanceMode;
  showDosagePrompts: boolean;
};
