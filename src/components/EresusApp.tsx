import React, { useState, useEffect, useRef, createContext, useContext, useMemo, lazy, Suspense, useCallback } from 'react';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { 
  getFirestore, 
  Firestore, 
  doc, 
  collection, 
  addDoc, 
  setDoc, 
  deleteDoc, 
  query, 
  onSnapshot,
  Timestamp,
  getDocs,
  where,
  getDoc,
  updateDoc,
  FieldValue,
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { 
  getAuth, 
  Auth, 
  signInAnonymously as fbSignInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  linkWithCredential,
  EmailAuthProvider,
  User,
  browserLocalPersistence,
  setPersistence
} from 'firebase/auth';
import { 
  Heart, 
  Book,
  Settings, 
  RotateCw,
  Square,
  Undo, 
  Clipboard, 
  Activity,
  Zap, 
  Syringe, 
  Pill, 
  AirVent,
  Gauge, 
  HeartPulse, 
  XSquare, 
  ChevronRight, 
  Circle, 
  CheckCircle2, 
  Bolt, 
  Timer, 
  Volume2, 
  VolumeX, 
  AlertTriangle,
  FileText,
  Plus,
  Minus,
  Moon,
  Sun,
  Laptop,
  QrCode,
  Check,
  Pencil,
  User as UserIcon,
  ExternalLink,
  BarChart3,
  Droplet,
  Users,
  Shield,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import NewbornLifeSupport from './NewbornLifeSupport';

//============================================================================
// GLOBAL FIREBASE CONFIG & APP ID
//============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyApZm9LsylboePKP85bKe8x6RayZKbWneI",
  authDomain: "eresus-6e65e.firebaseapp.com",
  projectId: "eresus-6e65e",
  storageBucket: "eresus-6e65e.firebasestorage.app",
  messagingSenderId: "118352301751",
  appId: "1:118352301751:web:22d9d6d5cae48b979e8732",
  measurementId: "G-H2H7SMTZK7"
};

const appId = 'eresus-6e65e';
const initialAuthToken = null;

//============================================================================
// TYPE DEFINITIONS
//============================================================================

export interface SavedArrestLog {
  id?: string;
  startTime: Timestamp;
  totalDuration: number;
  finalOutcome: string;
  userId: string;
}

export interface Event {
  id?: string;
  timestamp: number;
  message: string;
  type: EventType;
}

export enum ArrestState {
  Pending = "PENDING",
  Active = "ACTIVE",
  Rosc = "ROSC",
  Ended = "DECEASED",
}

export enum EventType {
  Status = "status",
  Cpr = "cpr",
  Shock = "shock",
  Analysis = "analysis",
  Rhythm = "rhythm",
  Drug = "drug",
  Airway = "airway",
  Etco2 = "etco2",
  Cause = "cause",
  VascularAccess = "vascularAccess",
}

export enum UIState {
  Default = "default",
  Analyzing = "analyzing",
  ShockAdvised = "shockAdvised",
}

export enum AntiarrhythmicDrug {
  None = "none",
  Amiodarone = "amiodarone",
  Lidocaine = "lidocaine",
}

export enum HypothermiaStatus {
  None = "none",
  Severe = "severe",
  Moderate = "moderate",
  Normothermic = "normothermic",
}

export enum AirwayAdjunctType {
  SGA = "sga",
  ETT = "ett",
  Unspecified = "unspecified",
}

export const getAirwayAdjunctDisplayName = (type: AirwayAdjunctType): string => {
  switch (type) {
    case AirwayAdjunctType.SGA: return "Supraglottic Airway (i-Gel)";
    case AirwayAdjunctType.ETT: return "Endotracheal Tube";
    case AirwayAdjunctType.Unspecified: return "Unspecified";
  }
};

export enum AppearanceMode {
  System = "System",
  Light = "Light",
  Dark = "Dark",
}

export type DrugToLog = 
  | { type: 'adrenaline' }
  | { type: 'amiodarone' }
  | { type: 'lidocaine' }
  | { type: 'other'; name: string };

export const getDrugLogTitle = (drug: DrugToLog): string => {
  switch (drug.type) {
    case 'adrenaline': return 'Adrenaline';
    case 'amiodarone': return 'Amiodarone';
    case 'lidocaine': return 'Lidocaine';
    case 'other': return drug.name;
  }
};

export interface ChecklistItem {
  id: string;
  name: string;
  isCompleted: boolean;
  hypothermiaStatus: HypothermiaStatus;
}

export interface UndoState {
  arrestState: ArrestState;
  masterTime: number;
  cprTime: number;
  timeOffset: number;
  events: Event[];
  shockCount: number;
  adrenalineCount: number;
  amiodaroneCount: number;
  lidocaineCount: number;
  lastAdrenalineTime: number | null;
  antiarrhythmicGiven: AntiarrhythmicDrug;
  shockCountForAmiodarone1: number | null;
  airwayPlaced: boolean;
  reversibleCauses: ChecklistItem[];
  postROSCTasks: ChecklistItem[];
  postMortemTasks: ChecklistItem[];
  startTime: Date | null;
  uiState: UIState;
  patientAgeCategory: PatientAgeCategory | null;
  hideAdrenalinePrompt?: boolean;
  hideAmiodaronePrompt?: boolean;
  lastRhythmNonShockable?: boolean;
  airwayAdjunct?: AirwayAdjunctType | null;
  roscTime?: number | null;
  isTimerPaused?: boolean;
  pauseStartTime?: Date | null;
  torTime?: number | null;
  vodTime?: number | null;
  vodChecklist?: ChecklistItem[];
}

export interface PDFIdentifiable {
  id: string;
  pdfUrl: string;
  title: string;
}

//============================================================================
// APP CONSTANTS & SETTINGS
//============================================================================

const useAppStorage = <T,>(key: string, defaultValue: T): [T, (value: T) => void] => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(error);
      return defaultValue;
    }
  });

  const setValue = (value: T) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
};

const useAppSettings = () => {
  const [cprCycleDuration, setCprCycleDuration] = useAppStorage('cprCycleDuration', 120);
  const [adrenalineInterval, setAdrenalineInterval] = useAppStorage('adrenalineInterval', 240);
  const [metronomeBPM, setMetronomeBPM] = useAppStorage('metronomeBPM', 110);
  const [appearanceMode, setAppearanceMode] = useAppStorage<AppearanceMode>('appearanceMode', AppearanceMode.System);
  const [showDosagePrompts, setShowDosagePrompts] = useAppStorage('showDosagePrompts', false);
  const [researchModeEnabled, setResearchModeEnabled] = useAppStorage('researchModeEnabled', true);
  const [hasRespondedToResearchTerms, setHasRespondedToResearchTerms] = useAppStorage('hasRespondedToResearchTerms', false);
  const [askForPatientInfo, setAskForPatientInfo] = useAppStorage('askForPatientInfo', false);
  const [userOrganization, setUserOrganization] = useAppStorage('userOrganization', '');
  const [_settingsSyncedFrom, _setSettingsSyncedFrom] = useAppStorage('settingsSyncedFromUid', '');

  const syncSettingsToFirestore = useCallback((db: Firestore, userId: string, isAnonymous: boolean) => {
    if (isAnonymous) return;
    try {
      const settingsDocPath = `/artifacts/${appId}/users/${userId}/settings/research`;
      setDoc(doc(db, settingsDocPath), {
        researchModeEnabled,
        askForPatientInfo,
        userOrganization,
        hasRespondedToResearchTerms,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(console.error);
    } catch { /* non-critical */ }
  }, [researchModeEnabled, askForPatientInfo, userOrganization, hasRespondedToResearchTerms]);

  const loadSettingsFromFirestore = useCallback(async (db: Firestore, userId: string) => {
    try {
      const settingsDocPath = `/artifacts/${appId}/users/${userId}/settings/research`;
      const settingsDoc = await getDoc(doc(db, settingsDocPath));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        if (data.researchModeEnabled !== undefined) setResearchModeEnabled(data.researchModeEnabled);
        if (data.askForPatientInfo !== undefined) setAskForPatientInfo(data.askForPatientInfo);
        if (data.userOrganization) setUserOrganization(data.userOrganization);
        if (data.hasRespondedToResearchTerms !== undefined) setHasRespondedToResearchTerms(data.hasRespondedToResearchTerms);
        _setSettingsSyncedFrom(userId);
      }
    } catch (e) {
      console.error("Error loading settings from Firestore:", e);
    }
  }, []);

  return {
    cprCycleDuration, setCprCycleDuration,
    adrenalineInterval, setAdrenalineInterval,
    metronomeBPM, setMetronomeBPM,
    appearanceMode, setAppearanceMode,
    showDosagePrompts, setShowDosagePrompts,
    researchModeEnabled, setResearchModeEnabled,
    hasRespondedToResearchTerms, setHasRespondedToResearchTerms,
    askForPatientInfo, setAskForPatientInfo,
    userOrganization, setUserOrganization,
    syncSettingsToFirestore, loadSettingsFromFirestore,
  };
};
type AppSettingsContextType = ReturnType<typeof useAppSettings>;
const AppSettingsContext = createContext<AppSettingsContextType | null>(null);
const useSettings = () => useContext(AppSettingsContext)!;

// Age conversion helpers (two-way sync between demographics and drug calculator)
const ageStringToCategory = (ageStr: string): PatientAgeCategory | null => {
  const age = parseInt(ageStr);
  if (isNaN(age) || age < 0) return null;
  if (age >= 12) return PatientAgeCategory.Adult;
  if (age === 11) return PatientAgeCategory.ElevenYears;
  if (age === 10) return PatientAgeCategory.TenYears;
  if (age === 9) return PatientAgeCategory.NineYears;
  if (age === 8) return PatientAgeCategory.EightYears;
  if (age === 7) return PatientAgeCategory.SevenYears;
  if (age === 6) return PatientAgeCategory.SixYears;
  if (age === 5) return PatientAgeCategory.FiveYears;
  if (age === 4) return PatientAgeCategory.FourYears;
  if (age === 3) return PatientAgeCategory.ThreeYears;
  if (age === 2) return PatientAgeCategory.TwoYears;
  if (age === 1) return PatientAgeCategory.TwelveMonths;
  return PatientAgeCategory.PostBirthToOneMonth;
};

const categoryToAgeString = (cat: PatientAgeCategory): string => {
  switch (cat) {
    case PatientAgeCategory.Adult: return '';
    case PatientAgeCategory.ElevenYears: return '11';
    case PatientAgeCategory.TenYears: return '10';
    case PatientAgeCategory.NineYears: return '9';
    case PatientAgeCategory.EightYears: return '8';
    case PatientAgeCategory.SevenYears: return '7';
    case PatientAgeCategory.SixYears: return '6';
    case PatientAgeCategory.FiveYears: return '5';
    case PatientAgeCategory.FourYears: return '4';
    case PatientAgeCategory.ThreeYears: return '3';
    case PatientAgeCategory.TwoYears: return '2';
    case PatientAgeCategory.EighteenMonths: return '1';
    case PatientAgeCategory.TwelveMonths: return '1';
    case PatientAgeCategory.NineMonths: return '0';
    case PatientAgeCategory.SixMonths: return '0';
    case PatientAgeCategory.ThreeMonths: return '0';
    case PatientAgeCategory.OneMonth: return '0';
    case PatientAgeCategory.PostBirthToOneMonth: return '0';
    case PatientAgeCategory.AtBirth: return '0';
    default: return '';
  }
};

const isPatientPaediatric = (ageStr: string, ageCategory: PatientAgeCategory | null): boolean => {
  if (ageCategory && ageCategory !== PatientAgeCategory.Adult) return true;
  const age = parseInt(ageStr);
  return !isNaN(age) && age < 16;
};

const AppConstants = {
  reversibleCausesTemplate: (): ChecklistItem[] => [
    { id: 'hypoxia', name: "Hypoxia", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'hypovolemia', name: "Hypovolemia", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'hypo-hyperkalaemia', name: "Hypo/Hyperkalaemia", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'hypothermia', name: "Hypothermia", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'toxins', name: "Toxins", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'tamponade', name: "Tamponade", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'tension-pneumothorax', name: "Tension Pneumothorax", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'thrombosis', name: "Thrombosis", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None }
  ],
  
  postROSCTasksTemplate: (): ChecklistItem[] => [
    { id: 'ventilation', name: "Optimise Ventilation & Oxygenation", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'ecg', name: "12-Lead ECG", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'hypotension', name: "Treat Hypotension (SBP < 90)", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'glucose', name: "Check Blood Glucose", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'temp', name: "Consider Temperature Control", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'causes', name: "Identify & Treat Causes", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None }
  ],
  
  postMortemTasksTemplate: (): ChecklistItem[] => [
    { id: 'reposition', name: "Reposition body & remove lines/tubes", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'docs', name: "Complete documentation", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'determine', name: "Determine expected/unexpected death", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'coroner', name: "Contact Coroner (if unexpected)", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'handling', name: "Follow local body handling procedure", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'leaflet', name: "Provide leaflet to bereaved relatives", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'donation', name: "Consider organ/tissue donation", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None }
  ],

  vodChecklistTemplate: (): ChecklistItem[] => [
    { id: 'ab', name: "A/B: Apnoea / Absent Breathing", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'c', name: "C: Absent Circulation (Pulse/Heart sounds)", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'd', name: "D: Disability (Unresponsive / GCS 3)", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: 'e', name: "E: 5 mins continuous asystole on ECG", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
  ],
  
  otherDrugs: [
    "Adenosine", "Adrenaline 1:1000", "Adrenaline 1:10,000", "Amiodarone (Further Dose)",
    "Atropine", "Calcium chloride", "Glucose", "Hartmann's solution", "Magnesium sulphate",
    "Midazolam", "Naloxone", "Potassium chloride", "Sodium bicarbonate", "Sodium chloride", "Tranexamic acid"
  ].sort(),

  pdfAlgorithms: [
    { id: 'adult', pdfUrl: "https://www.resus.org.uk/sites/default/files/2025-10/Adult%20ALS%20algorithm%202025.pdf", title: "Adult ALS" },
    { id: 'paeds', pdfUrl: "https://www.resus.org.uk/sites/default/files/2025-10/Paediatric%20advanced%20life%20support%20algorithm%202025.pdf", title: "Paediatric ALS" },
    { id: 'newborn', pdfUrl: "https://www.resus.org.uk/sites/default/files/2025-10/Newborn%20life%20support%20algorithm%202025.pdf", title: "Newborn LS" },
    { id: 'post', pdfUrl: "https://www.resus.org.uk/sites/default/files/2025-10/Adult%20post-resuscitation%20care%202025.pdf", title: "Post Arrest Care" }
  ]
};

//============================================================================
// APP SERVICES
//============================================================================

const TimeFormatter = {
  format: (timeInterval: number): string => {
    const time = Math.max(0, timeInterval);
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
};

const HapticManager = {
  impact: (style: 'light' | 'medium' | 'heavy' = 'light') => {
    if (window.navigator.vibrate) {
      let duration = 10;
      if (style === 'medium') duration = 20;
      if (style === 'heavy') duration = 30;
      window.navigator.vibrate(duration);
    }
  },
  notification: (type: 'success' | 'warning' | 'error') => {
    if (window.navigator.vibrate) {
      if (type === 'success') window.navigator.vibrate([10, 50, 10]);
      if (type === 'warning') window.navigator.vibrate([20, 50, 20]);
      if (type === 'error') window.navigator.vibrate([30, 50, 30, 50, 30]);
    }
  }
};

class MetronomeService {
  private audioContext: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private _isPlaying = false;
  private bpm = 110;
  private unlocked = false;

  private async initAudioContext() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.error("Web Audio API not supported:", e);
        return false;
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.error("Error resuming audio context:", e);
        return false;
      }
    }
    return this.audioContext.state === 'running';
  }

  public async unlock() {
    if (this.unlocked) return true;
    const success = await this.initAudioContext();
    if (success && this.audioContext) {
      try {
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        gain.gain.value = 0;
        oscillator.connect(gain);
        gain.connect(this.audioContext.destination);
        oscillator.start(0);
        oscillator.stop(0.001);
        this.unlocked = true;
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  private playSound() {
    if (!this.audioContext || this.audioContext.state !== 'running') return;
    try {
      const context = this.audioContext;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      gain.gain.setValueAtTime(0.3, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.05);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + 0.05);
    } catch (e) {
      console.error("Error playing metronome sound:", e);
    }
  }

  public async toggle(bpm: number) {
    this.bpm = bpm;
    if (this._isPlaying) {
      this.stop();
      return false;
    } else {
      await this.start();
      return this._isPlaying;
    }
  }

  public async start() {
    if (this._isPlaying) return;
    await this.unlock();
    const ready = await this.initAudioContext();
    if (!ready || !this.audioContext || this.audioContext.state !== 'running') return;
    const interval = 60000 / this.bpm;
    this._isPlaying = true;
    this.playSound();
    this.timer = setInterval(() => this.playSound(), interval);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._isPlaying = false;
  }
  
  public get isPlaying() {
    return this._isPlaying;
  }
}
const metronomeService = new MetronomeService();

//============================================================================
// DOSAGE CALCULATOR
//============================================================================

export enum PatientAgeCategory {
  Adult = "≥12 years / Adult",
  ElevenYears = "11 years",
  TenYears = "10 years",
  NineYears = "9 years",
  EightYears = "8 years",
  SevenYears = "7 years",
  SixYears = "6 years",
  FiveYears = "5 years",
  FourYears = "4 years",
  ThreeYears = "3 years",
  TwoYears = "2 years",
  EighteenMonths = "18 months",
  TwelveMonths = "12 months",
  NineMonths = "9 months",
  SixMonths = "6 months",
  ThreeMonths = "3 months",
  OneMonth = "1 month",
  PostBirthToOneMonth = "Post-birth to 1 month",
  AtBirth = "At birth",
}
export const allPatientAgeCategories = Object.values(PatientAgeCategory);

const DosageCalculator = {
  calculateAdrenalineDose: (age: PatientAgeCategory): string => {
    switch (age) {
      case PatientAgeCategory.Adult: return "1mg";
      case PatientAgeCategory.ElevenYears: return "350mcg";
      case PatientAgeCategory.TenYears: return "320mcg";
      case PatientAgeCategory.NineYears: return "300mcg";
      case PatientAgeCategory.EightYears: return "260mcg";
      case PatientAgeCategory.SevenYears: return "230mcg";
      case PatientAgeCategory.SixYears: return "210mcg";
      case PatientAgeCategory.FiveYears: return "190mcg";
      case PatientAgeCategory.FourYears: return "160mcg";
      case PatientAgeCategory.ThreeYears: return "140mcg";
      case PatientAgeCategory.TwoYears: return "120mcg";
      case PatientAgeCategory.EighteenMonths: return "110mcg";
      case PatientAgeCategory.TwelveMonths: return "100mcg";
      case PatientAgeCategory.NineMonths: return "90mcg";
      case PatientAgeCategory.SixMonths: return "80mcg";
      case PatientAgeCategory.ThreeMonths: return "60mcg";
      case PatientAgeCategory.OneMonth: return "50mcg";
      case PatientAgeCategory.PostBirthToOneMonth: return "50mcg";
      case PatientAgeCategory.AtBirth: return "70mcg";
      default: return "N/A";
    }
  },

  calculateAmiodaroneDose: (age: PatientAgeCategory, doseNumber: number): string | null => {
    switch (age) {
      case PatientAgeCategory.Adult:
        return doseNumber === 1 ? "300mg" : "150mg";
      case PatientAgeCategory.ElevenYears:
        return doseNumber === 1 ? "180mg" : "180mg";
      case PatientAgeCategory.TenYears:
        return doseNumber === 1 ? "160mg" : "160mg";
      case PatientAgeCategory.NineYears:
        return doseNumber === 1 ? "150mg" : "150mg";
      case PatientAgeCategory.EightYears:
        return doseNumber === 1 ? "130mg" : "130mg";
      case PatientAgeCategory.SevenYears:
        return doseNumber === 1 ? "120mg" : "120mg";
      case PatientAgeCategory.SixYears:
        return doseNumber === 1 ? "100mg" : "100mg";
      case PatientAgeCategory.FiveYears:
        return doseNumber === 1 ? "100mg" : "100mg";
      case PatientAgeCategory.FourYears:
        return doseNumber === 1 ? "80mg" : "80mg";
      case PatientAgeCategory.ThreeYears:
        return doseNumber === 1 ? "70mg" : "60mg";
      case PatientAgeCategory.TwoYears:
        return doseNumber === 1 ? "60mg" : "60mg";
      case PatientAgeCategory.EighteenMonths:
        return doseNumber === 1 ? "55mg" : "55mg";
      case PatientAgeCategory.TwelveMonths:
        return doseNumber === 1 ? "50mg" : "50mg";
      case PatientAgeCategory.NineMonths:
        return doseNumber === 1 ? "45mg" : "45mg";
      case PatientAgeCategory.SixMonths:
        return doseNumber === 1 ? "40mg" : "40mg";
      case PatientAgeCategory.ThreeMonths:
        return doseNumber === 1 ? "30mg" : "30mg";
      case PatientAgeCategory.OneMonth:
        return doseNumber === 1 ? "25mg" : "25mg";
      case PatientAgeCategory.PostBirthToOneMonth:
      case PatientAgeCategory.AtBirth:
        return null;
      default: return null;
    }
  }
};

//============================================================================
// FIREBASE CONTEXT & AUTH
//============================================================================
interface FirebaseContextType {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
  user: User | null;
  userId: string;
  isAnonymous: boolean;
}
const FirebaseContext = createContext<FirebaseContextType | null>(null);
const useFirebase = () => useContext(FirebaseContext)!;

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ client_id: '118352301751-uqa88f4vsfkquo2o0rairbo61s38kl1j.apps.googleusercontent.com' });

const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

const migrateAnonymousLogs = async (db: Firestore, oldUserId: string, newUserId: string) => {
  if (oldUserId === newUserId) return;
  try {
    const oldLogsPath = `/artifacts/${appId}/users/${oldUserId}/logs`;
    const newLogsPath = `/artifacts/${appId}/users/${newUserId}/logs`;
    const oldLogsSnap = await getDocs(collection(db, oldLogsPath));
    
    for (const logDoc of oldLogsSnap.docs) {
      const data = logDoc.data();
      const newLogRef = doc(db, newLogsPath, logDoc.id);
      await setDoc(newLogRef, { ...data, userId: newUserId });
      
      const oldEventsSnap = await getDocs(collection(db, `${oldLogsPath}/${logDoc.id}/events`));
      for (const eventDoc of oldEventsSnap.docs) {
        await setDoc(doc(db, `${newLogsPath}/${logDoc.id}/events`, eventDoc.id), eventDoc.data());
      }
      
      for (const eventDoc of oldEventsSnap.docs) {
        await deleteDoc(doc(db, `${oldLogsPath}/${logDoc.id}/events`, eventDoc.id));
      }
      await deleteDoc(doc(db, oldLogsPath, logDoc.id));
    }
    console.log(`Migrated ${oldLogsSnap.size} logs from ${oldUserId} to ${newUserId}`);
  } catch (e) {
    console.error("Error migrating logs:", e);
  }
};

const FirebaseProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [services, setServices] = useState<FirebaseContextType | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);
      const auth = getAuth(app);
      
      setPersistence(auth, browserLocalPersistence).catch(console.error);
      
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          const oldUserId = localStorage.getItem('eresus_user_id');
          if (oldUserId && oldUserId !== user.uid && !user.isAnonymous) {
            migrateAnonymousLogs(db, oldUserId, user.uid);
          }
          localStorage.setItem('eresus_user_id', user.uid);
          
          setServices({
            app, db, auth,
            user,
            userId: user.uid,
            isAnonymous: user.isAnonymous,
          });
        } else {
          try {
            await fbSignInAnonymously(auth);
          } catch (e) {
            console.error("Anonymous sign-in failed, falling back to device ID:", e);
            const getOrCreateUserId = () => {
              const stored = localStorage.getItem('eresus_user_id');
              if (stored) return stored;
              const newId = crypto.randomUUID();
              localStorage.setItem('eresus_user_id', newId);
              return newId;
            };
            setServices({
              app, db, auth,
              user: null,
              userId: getOrCreateUserId(),
              isAnonymous: true,
            });
          }
        }
        setAuthReady(true);
      });
      
      return () => unsubscribe();
    } catch (e) {
      console.error("Failed to initialize Firebase", e);
    }
  }, []);

  if (!services || !authReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <img 
          src="https://145955222.fs1.hubspotusercontent-eu1.net/hubfs/145955222/eResus/eResus.svg" 
          alt="eResus" 
          className="w-24 h-24 rounded-2xl animate-pulse"
        />
      </div>
    );
  }

  return (
    <FirebaseContext.Provider value={services}>
      {children}
    </FirebaseContext.Provider>
  );
};


//============================================================================
// CORE LOGIC: useArrestViewModel
//============================================================================

const ARREST_SESSION_KEY = 'eresus_arrest_session';

// Helper to extract real-world clock time from event messages
const extractRealWorldTime = (events: Event[], searchPatterns: string[]): string | null => {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  for (const event of sorted) {
    for (const pattern of searchPatterns) {
      if (event.message.toLowerCase().includes(pattern.toLowerCase())) {
        // Try to extract HH:MM from the message
        const timeMatch = event.message.match(/(\d{1,2}:\d{2}:\d{2})/);
        if (timeMatch) {
          // Return HH:MM format
          const parts = timeMatch[1].split(':');
          return `${parts[0]}:${parts[1]}`;
        }
        // If no clock time in message, return the arrest-relative time
        return TimeFormatter.format(event.timestamp);
      }
    }
  }
  return null;
};

const extractFirstEventTime = (events: Event[], searchPatterns: string[], startTime: Date | null): string | null => {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  for (const event of sorted) {
    for (const pattern of searchPatterns) {
      if (event.message.toLowerCase().includes(pattern.toLowerCase())) {
        if (startTime) {
          const eventDate = new Date(startTime.getTime() + event.timestamp * 1000);
          return `${String(eventDate.getHours()).padStart(2,'0')}:${String(eventDate.getMinutes()).padStart(2,'0')}`;
        }
        return TimeFormatter.format(event.timestamp);
      }
    }
  }
  return null;
};

const extractLastEventTime = (events: Event[], searchPatterns: string[], startTime: Date | null): string | null => {
  const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp);
  for (const event of sorted) {
    for (const pattern of searchPatterns) {
      if (event.message.toLowerCase().includes(pattern.toLowerCase())) {
        if (startTime) {
          const eventDate = new Date(startTime.getTime() + event.timestamp * 1000);
          return `${String(eventDate.getHours()).padStart(2,'0')}:${String(eventDate.getMinutes()).padStart(2,'0')}`;
        }
        return TimeFormatter.format(event.timestamp);
      }
    }
  }
  return null;
};

const useArrestViewModel = () => {
  const { db, userId, user } = useFirebase();
  const { cprCycleDuration, adrenalineInterval, showDosagePrompts, researchModeEnabled, askForPatientInfo, userOrganization } = useSettings();

  const savedSession = useRef<any>(null);
  const didRestore = useRef(false);
  
  if (!didRestore.current) {
    try {
      const raw = localStorage.getItem(ARREST_SESSION_KEY);
      if (raw) savedSession.current = JSON.parse(raw);
    } catch { /* ignore */ }
    didRestore.current = true;
  }
  const s = savedSession.current;

  const hasRecoverableArrest = s != null && (s.arrestState === ArrestState.Active || s.arrestState === ArrestState.Rosc);

  const [arrestState, setArrestState] = useState<ArrestState>(hasRecoverableArrest ? ArrestState.Pending : (s?.arrestState ?? ArrestState.Pending));
  const [masterTime, setMasterTime] = useState<number>(0);
  const [cprTime, setCprTime] = useState<number>(cprCycleDuration);
  const [timeOffset, setTimeOffset] = useState<number>(s?.timeOffset ?? 0);
  const [uiState, setUiState] = useState<UIState>(s?.uiState ?? UIState.Default);
  const [events, setEvents] = useState<Event[]>(s?.events ?? []);

  const [shockCount, setShockCount] = useState(s?.shockCount ?? 0);
  const [adrenalineCount, setAdrenalineCount] = useState(s?.adrenalineCount ?? 0);
  const [amiodaroneCount, setAmiodaroneCount] = useState(s?.amiodaroneCount ?? 0);
  const [lidocaineCount, setLidocaineCount] = useState(s?.lidocaineCount ?? 0);

  const [airwayPlaced, setAirwayPlaced] = useState(s?.airwayPlaced ?? false);
  const [antiarrhythmicGiven, setAntiarrhythmicGiven] = useState<AntiarrhythmicDrug>(s?.antiarrhythmicGiven ?? AntiarrhythmicDrug.None);

  const [reversibleCauses, setReversibleCauses] = useState<ChecklistItem[]>(s?.reversibleCauses ?? AppConstants.reversibleCausesTemplate());
  const [postROSCTasks, setPostROSCTasks] = useState<ChecklistItem[]>(s?.postROSCTasks ?? AppConstants.postROSCTasksTemplate());
  const [postMortemTasks, setPostMortemTasks] = useState<ChecklistItem[]>(s?.postMortemTasks ?? AppConstants.postMortemTasksTemplate());
  const [patientAgeCategory, setPatientAgeCategory] = useState<PatientAgeCategory | null>(s?.patientAgeCategory ?? null);
  
  // v1.2 Research State
  const [patientAgeStr, setPatientAgeStr] = useState(s?.patientAgeStr ?? '');
  const [patientGenderStr, setPatientGenderStr] = useState(s?.patientGenderStr ?? '');
  const [initialRhythm, setInitialRhythm] = useState<string | null>(s?.initialRhythm ?? null);
  const [showPatientInfoPrompt, setShowPatientInfoPrompt] = useState(false);

  // v1.3 TOR/VOD State
  const [torTime, setTorTime] = useState<number | null>(s?.torTime ?? null);
  const [vodTime, setVodTime] = useState<number | null>(s?.vodTime ?? null);
  const [vodChecklist, setVodChecklist] = useState<ChecklistItem[]>(s?.vodChecklist ?? AppConstants.vodChecklistTemplate());
  const [vodConfirmed, setVodConfirmed] = useState(s?.vodConfirmed ?? false);

  // Private State
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<Date | null>(s?.startTime ? new Date(s.startTime) : null);
  const cprCycleStartTimeRef = useRef<number>(s?.cprCycleStartTime ?? 0);
  const lastAdrenalineTimeRef = useRef<number | null>(s?.lastAdrenalineTime ?? null);
  const shockCountForAmiodarone1Ref = useRef<number | null>(s?.shockCountForAmiodarone1 ?? null);
  const savedArrestStateRef = useRef<ArrestState | null>(hasRecoverableArrest ? s.arrestState : null);
  const [undoHistory, setUndoHistory] = useState<UndoState[]>([]);
  const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(hasRecoverableArrest);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const pauseStartTimeRef = useRef<Date | null>(null);
  
  const [hideAdrenalinePrompt, setHideAdrenalinePrompt] = useState(false);
  const [hideAmiodaronePrompt, setHideAmiodaronePrompt] = useState(false);
  const [lastRhythmNonShockable, setLastRhythmNonShockable] = useState(false);
  const [roscTime, setRoscTime] = useState<number | null>(null);
  const [airwayAdjunct, setAirwayAdjunct] = useState<AirwayAdjunctType | null>(null);

  // Computed
  const totalArrestTime = useMemo(() => masterTime + timeOffset, [masterTime, timeOffset]);
  const canUndo = undoHistory.length > 0;

  const isAdrenalineAvailable = useMemo(() => {
    return reversibleCauses.find(item => item.name === "Hypothermia")?.hypothermiaStatus !== HypothermiaStatus.Severe;
  }, [reversibleCauses]);

  // Amiodarone and Lidocaine are now always available (can be pressed anytime during arrest)
  const isAmiodaroneAvailable = true;
  const isLidocaineAvailable = true;

  const timeUntilAdrenaline = useMemo(() => {
    const lastAdrenalineTime = lastAdrenalineTimeRef.current;
    if (lastAdrenalineTime === null) return null;
    const hypothermiaStatus = reversibleCauses.find(item => item.name === "Hypothermia")?.hypothermiaStatus;
    const interval = hypothermiaStatus === HypothermiaStatus.Moderate ? adrenalineInterval * 2 : adrenalineInterval;
    const timeSince = totalArrestTime - lastAdrenalineTime;
    return interval - timeSince;
  }, [totalArrestTime, reversibleCauses, adrenalineInterval]);

  const shouldShowAmiodaroneReminder = useMemo(() => {
    const shockCountDose1 = shockCountForAmiodarone1Ref.current;
    if (shockCountDose1 === null) return false;
    return amiodaroneCount === 1 && shockCount >= shockCountDose1 + 2 && !hideAmiodaronePrompt;
  }, [amiodaroneCount, shockCount, hideAmiodaronePrompt]);
  
  const shouldShowAmiodaroneFirstDosePrompt = useMemo(() => {
      return shockCount >= 3 && amiodaroneCount === 0 && !hideAmiodaronePrompt;
  }, [shockCount, amiodaroneCount, hideAmiodaronePrompt]);

  const shouldShowAdrenalinePrompt = useMemo(() => {
    if (!isAdrenalineAvailable || hideAdrenalinePrompt) return false;
    if (timeUntilAdrenaline !== null && timeUntilAdrenaline <= 0) return false;
    if (adrenalineCount === 0) {
      if (shockCount >= 3) return true;
      if (lastRhythmNonShockable) return true;
    }
    return false;
  }, [shockCount, adrenalineCount, isAdrenalineAvailable, hideAdrenalinePrompt, 
      timeUntilAdrenaline, lastRhythmNonShockable]);

  // Session Persistence
  useEffect(() => {
    if (arrestState === ArrestState.Pending) {
      localStorage.removeItem(ARREST_SESSION_KEY);
      return;
    }
    const session = {
      arrestState,
      timeOffset,
      uiState,
      events,
      shockCount,
      adrenalineCount,
      amiodaroneCount,
      lidocaineCount,
      airwayPlaced,
      antiarrhythmicGiven,
      reversibleCauses,
      postROSCTasks,
      postMortemTasks,
      patientAgeCategory,
      startTime: startTimeRef.current?.toISOString() ?? null,
      cprCycleStartTime: cprCycleStartTimeRef.current,
      lastAdrenalineTime: lastAdrenalineTimeRef.current,
      shockCountForAmiodarone1: shockCountForAmiodarone1Ref.current,
      patientAgeStr, patientGenderStr, initialRhythm,
      torTime, vodTime, vodChecklist, vodConfirmed,
    };
    try {
      localStorage.setItem(ARREST_SESSION_KEY, JSON.stringify(session));
    } catch { /* storage full */ }
  }, [arrestState, timeOffset, uiState, events, shockCount, adrenalineCount, 
      amiodaroneCount, lidocaineCount, airwayPlaced, antiarrhythmicGiven, 
      reversibleCauses, postROSCTasks, postMortemTasks, patientAgeCategory,
      patientAgeStr, patientGenderStr, initialRhythm, torTime, vodTime, vodChecklist, vodConfirmed]);

  // Session recovery
  const resumeRecoveredSession = () => {
    if (!savedArrestStateRef.current || !s) return;
    setArrestState(s.arrestState);
    setMasterTime(s.masterTime || 0);
    setCprTime(s.cprTime ?? cprCycleDuration);
    setTimeOffset(s.timeOffset ?? 0);
    setUiState(s.uiState ?? UIState.Default);
    setEvents(s.events ?? []);
    setShockCount(s.shockCount ?? 0);
    setAdrenalineCount(s.adrenalineCount ?? 0);
    setAmiodaroneCount(s.amiodaroneCount ?? 0);
    setLidocaineCount(s.lidocaineCount ?? 0);
    setAirwayPlaced(s.airwayPlaced ?? false);
    setAntiarrhythmicGiven(s.antiarrhythmicGiven ?? AntiarrhythmicDrug.None);
    setReversibleCauses(s.reversibleCauses ?? AppConstants.reversibleCausesTemplate());
    setPostROSCTasks(s.postROSCTasks ?? AppConstants.postROSCTasksTemplate());
    setPostMortemTasks(s.postMortemTasks ?? AppConstants.postMortemTasksTemplate());
    setPatientAgeCategory(s.patientAgeCategory ?? null);
    setPatientAgeStr(s.patientAgeStr ?? '');
    setPatientGenderStr(s.patientGenderStr ?? '');
    setInitialRhythm(s.initialRhythm ?? null);
    setTorTime(s.torTime ?? null);
    setVodTime(s.vodTime ?? null);
    setVodChecklist(s.vodChecklist ?? AppConstants.vodChecklistTemplate());
    setVodConfirmed(s.vodConfirmed ?? false);
    
    if (s.startTime) {
      startTimeRef.current = new Date(s.startTime);
      const elapsed = (Date.now() - new Date(s.startTime).getTime()) / 1000;
      setMasterTime(elapsed);
    }
    cprCycleStartTimeRef.current = s.cprCycleStartTime ?? 0;
    lastAdrenalineTimeRef.current = s.lastAdrenalineTime ?? null;
    shockCountForAmiodarone1Ref.current = s.shockCountForAmiodarone1 ?? null;
    
    setShowRecoveryPrompt(false);
    savedArrestStateRef.current = null;
  };
  
  const discardRecoveredSession = async () => {
    // Save the recovered session to logbook before discarding
    if (startTimeRef.current && events.length > 0) {
      try {
        await saveLogToDatabase();
      } catch (e) {
        console.error("Error saving recovered session:", e);
      }
    }
    setShowRecoveryPrompt(false);
    savedArrestStateRef.current = null;
    performReset(false, false);
  };

  // Timer
  const startTimer = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      if (!startTimeRef.current) return;
      const elapsed = (Date.now() - startTimeRef.current.getTime()) / 1000;
      setMasterTime(elapsed);
    }, 200);
  };
  
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const logEvent = (message: string, type: EventType) => {
    const newEvent: Event = { timestamp: totalArrestTime, message, type };
    setEvents(prevEvents => [newEvent, ...prevEvents]);
    HapticManager.impact();
  };

  // Undo
  const saveUndoState = () => {
    const currentState: UndoState = {
      arrestState, masterTime, cprTime, timeOffset, events,
      shockCount, adrenalineCount, amiodaroneCount, lidocaineCount,
      lastAdrenalineTime: lastAdrenalineTimeRef.current,
      antiarrhythmicGiven,
      shockCountForAmiodarone1: shockCountForAmiodarone1Ref.current,
      airwayPlaced, reversibleCauses, postROSCTasks, postMortemTasks,
      startTime: startTimeRef.current, uiState, patientAgeCategory,
      hideAdrenalinePrompt, hideAmiodaronePrompt, lastRhythmNonShockable,
      airwayAdjunct, roscTime, isTimerPaused,
      pauseStartTime: pauseStartTimeRef.current,
      torTime, vodTime, vodChecklist,
    };
    setUndoHistory(prev => [...prev, currentState]);
  };

  const undo = () => {
    if (undoHistory.length === 0) return;
    const lastState = undoHistory[undoHistory.length - 1];
    setUndoHistory(prev => prev.slice(0, -1));
    
    setArrestState(lastState.arrestState);
    setMasterTime(lastState.masterTime);
    setCprTime(lastState.cprTime);
    setTimeOffset(lastState.timeOffset);
    setEvents(lastState.events);
    setShockCount(lastState.shockCount);
    setAdrenalineCount(lastState.adrenalineCount);
    setAmiodaroneCount(lastState.amiodaroneCount);
    setLidocaineCount(lastState.lidocaineCount);
    lastAdrenalineTimeRef.current = lastState.lastAdrenalineTime;
    setAntiarrhythmicGiven(lastState.antiarrhythmicGiven);
    shockCountForAmiodarone1Ref.current = lastState.shockCountForAmiodarone1;
    setAirwayPlaced(lastState.airwayPlaced);
    setReversibleCauses(lastState.reversibleCauses);
    setPostROSCTasks(lastState.postROSCTasks);
    setPostMortemTasks(lastState.postMortemTasks);
    startTimeRef.current = lastState.startTime;
    setUiState(lastState.uiState);
    setPatientAgeCategory(lastState.patientAgeCategory);
    setHideAdrenalinePrompt(lastState.hideAdrenalinePrompt ?? false);
    setHideAmiodaronePrompt(lastState.hideAmiodaronePrompt ?? false);
    setLastRhythmNonShockable(lastState.lastRhythmNonShockable ?? false);
    setAirwayAdjunct(lastState.airwayAdjunct ?? null);
    setRoscTime(lastState.roscTime ?? null);
    setIsTimerPaused(lastState.isTimerPaused ?? false);
    pauseStartTimeRef.current = lastState.pauseStartTime ?? null;
    setTorTime(lastState.torTime ?? null);
    setVodTime(lastState.vodTime ?? null);
    setVodChecklist(lastState.vodChecklist ?? AppConstants.vodChecklistTemplate());
    
    if ((lastState.arrestState === ArrestState.Active || lastState.arrestState === ArrestState.Rosc) && !lastState.isTimerPaused) {
      startTimer();
    } else {
      stopTimer();
    }
  };
  
  const pauseArrest = () => {
    saveUndoState();
    setIsTimerPaused(true);
    pauseStartTimeRef.current = new Date();
    stopTimer();
    logEvent("Arrest Timer Paused", EventType.Status);
  };

  const resumeArrest = () => {
    saveUndoState();
    setIsTimerPaused(false);
    if (pauseStartTimeRef.current && startTimeRef.current) {
      const pausedDuration = (Date.now() - pauseStartTimeRef.current.getTime());
      startTimeRef.current = new Date(startTimeRef.current.getTime() + pausedDuration);
    }
    pauseStartTimeRef.current = null;
    startTimer();
    logEvent("Arrest Timer Resumed", EventType.Status);
  };

  // Timer Lifecycle
  useEffect(() => {
    if ((arrestState === ArrestState.Active || arrestState === ArrestState.Rosc) && !isTimerPaused) {
      startTimer();
    } else {
      stopTimer();
    }
    return stopTimer;
  }, [arrestState, isTimerPaused]);
  
  useEffect(() => {
    if (arrestState === ArrestState.Active && uiState === UIState.Default) {
      const newCprTime = cprCycleDuration - (totalArrestTime - cprCycleStartTimeRef.current);
      setCprTime(prevCprTime => {
          if (newCprTime <= 10 && newCprTime > 0) HapticManager.impact('light');
          if (prevCprTime > 0 && newCprTime <= 0) HapticManager.notification('warning');
          if (newCprTime < 0) return 0;
          return newCprTime;
      });
    }
  }, [totalArrestTime, arrestState, uiState, cprCycleDuration]); 

  useEffect(() => {
    setCprTime(cprCycleDuration);
  }, [cprCycleDuration]);

  // Core Actions
  const startArrest = (priorEvents?: Event[], priorTimeOffset?: number, priorStartTime?: Date) => {
    saveUndoState();
    
    if (priorStartTime) {
      startTimeRef.current = priorStartTime;
      const elapsed = (Date.now() - priorStartTime.getTime()) / 1000;
      setTimeOffset(priorTimeOffset ?? 0);
      setMasterTime(elapsed);
      setEvents(priorEvents ?? []);
      cprCycleStartTimeRef.current = elapsed + (priorTimeOffset ?? 0);
    } else {
      startTimeRef.current = new Date();
      cprCycleStartTimeRef.current = 0;
    }
    
    setArrestState(ArrestState.Active);
    setInitialRhythm(null);
    logEvent(`${priorStartTime ? 'Transitioned to Paediatric ALS' : 'Arrest Started'} at ${new Date().toLocaleTimeString()}`, EventType.Status);
    
    if (!priorStartTime) {
      if (researchModeEnabled || askForPatientInfo) {
        setShowPatientInfoPrompt(true);
      }
    }
  };

  const analyseRhythm = () => {
    saveUndoState();
    setHideAdrenalinePrompt(false);
    setLastRhythmNonShockable(false);
    setUiState(UIState.Analyzing);
    logEvent("Rhythm analysis. Pausing CPR.", EventType.Analysis);
  };

  const logRhythm = (rhythm: string, isShockable: boolean) => {
    saveUndoState();
    if (initialRhythm === null) {
      setInitialRhythm(rhythm);
    }
    logEvent(`Rhythm is ${rhythm}`, EventType.Rhythm);
    setLastRhythmNonShockable(!isShockable);
    if (!isShockable) setHideAdrenalinePrompt(false);
    if (isShockable) {
      setUiState(UIState.ShockAdvised);
    } else {
      resumeCPR();
    }
  };

  const deliverShock = () => {
    saveUndoState();
    setShockCount(c => c + 1);
    setHideAdrenalinePrompt(false);
    setHideAmiodaronePrompt(false);
    logEvent(`Shock ${shockCount + 1} Delivered`, EventType.Shock);
    resumeCPR();
  };

  const resumeCPR = () => {
    if (!startTimeRef.current) return;
    const currentMasterTime = (Date.now() - startTimeRef.current.getTime()) / 1000;
    const currentTotalArrestTime = currentMasterTime + timeOffset;
    setUiState(UIState.Default);
    cprCycleStartTimeRef.current = currentTotalArrestTime;
    setCprTime(cprCycleDuration);
    logEvent("Resuming CPR.", EventType.Cpr);
  };

  const logAdrenaline = (dosage: string | null = null) => {
    saveUndoState();
    setAdrenalineCount(c => c + 1);
    lastAdrenalineTimeRef.current = totalArrestTime;
    setLastRhythmNonShockable(false);
    setHideAdrenalinePrompt(false);
    const dosageText = (showDosagePrompts && dosage) ? ` (${dosage})` : "";
    logEvent(`Adrenaline${dosageText} Given – Dose ${adrenalineCount + 1}`, EventType.Drug);
  };

  const logAmiodarone = (dosage: string | null = null) => {
    saveUndoState();
    setAmiodaroneCount(c => c + 1);
    setAntiarrhythmicGiven(AntiarrhythmicDrug.Amiodarone);
    if (amiodaroneCount === 0) {
      shockCountForAmiodarone1Ref.current = shockCount;
    }
    setHideAmiodaronePrompt(false);
    const dosageText = (showDosagePrompts && dosage) ? ` (${dosage})` : "";
    logEvent(`Amiodarone${dosageText} Given – Dose ${amiodaroneCount + 1}`, EventType.Drug);
  };
  
  const logLidocaine = (dosage: string | null = null) => {
    saveUndoState();
    setLidocaineCount(c => c + 1);
    setAntiarrhythmicGiven(AntiarrhythmicDrug.Lidocaine);
    const dosageText = (showDosagePrompts && dosage) ? ` (${dosage})` : "";
    logEvent(`Lidocaine${dosageText} Given – Dose ${lidocaineCount + 1}`, EventType.Drug);
  };

  const logOtherDrug = (drug: string, dosage: string | null = null) => {
    saveUndoState();
    const dosageText = (showDosagePrompts && dosage) ? ` (${dosage})` : "";
    logEvent(`${drug}${dosageText} Given`, EventType.Drug);
  };
  
  // Allow multiple airway attempts (no longer restricted by airwayPlaced)
  const logAirwayPlacedFn = (type?: AirwayAdjunctType) => {
    saveUndoState();
    setAirwayPlaced(true);
    if (type) {
      setAirwayAdjunct(type);
      logEvent(`Advanced Airway Placed – ${getAirwayAdjunctDisplayName(type)}`, EventType.Airway);
    } else {
      logEvent("Advanced Airway Placed", EventType.Airway);
    }
  };

  // New: Vascular Access logging
  const logVascularAccess = (accessType: 'IV' | 'IO', location: string, gauge: string, successful: boolean) => {
    saveUndoState();
    const parts = [`Vascular Access (${accessType})`];
    if (location || gauge) {
      const details = [location, gauge].filter(Boolean).join(', ');
      parts[0] += ` – ${details}`;
    }
    parts[0] += successful ? ' – Secured' : ' – Failed';
    logEvent(parts[0], EventType.VascularAccess);
  };

  const logEtco2 = (value: string) => {
    saveUndoState();
    if (value && !isNaN(Number(value)) && Number(value) > 0) {
      logEvent(`ETCO2: ${value} mmHg`, EventType.Etco2);
    }
  };

  const achieveROSC = () => {
    saveUndoState();
    setArrestState(ArrestState.Rosc);
    setUiState(UIState.Default);
    setRoscTime(totalArrestTime);
    logEvent("Return of Spontaneous Circulation (ROSC)", EventType.Status);
  };

  // TOR = Termination of Resuscitation (CPR stops, but not yet VOD)
  const confirmTOR = () => {
    saveUndoState();
    setArrestState(ArrestState.Ended);
    setTorTime(totalArrestTime);
    stopTimer();
    logEvent(`Termination of Resuscitation (TOR) at ${new Date().toLocaleTimeString()}`, EventType.Status);
  };

  // VOD = Verification of Death (after 5-min observation)
  const confirmVOD = () => {
    saveUndoState();
    setVodTime(totalArrestTime);
    setVodConfirmed(true);
    logEvent(`Verification of Death (VOD) confirmed at ${new Date().toLocaleTimeString()}`, EventType.Status);
  };

  // Toggle VOD checklist items
  const toggleVodChecklistItem = (itemId: string) => {
    saveUndoState();
    setVodChecklist(prev => prev.map(i => i.id === itemId ? { ...i, isCompleted: !i.isCompleted } : i));
  };

  // Legacy endArrest (used for backward compat or direct ending)
  const endArrest = () => {
    confirmTOR();
  };

  const reArrest = () => {
    if (!startTimeRef.current) return;
    saveUndoState();
    const currentMasterTime = (Date.now() - startTimeRef.current.getTime()) / 1000;
    const currentTotalArrestTime = currentMasterTime + timeOffset;
    setArrestState(ArrestState.Active);
    cprCycleStartTimeRef.current = currentTotalArrestTime;
    setCprTime(cprCycleDuration);
    setTorTime(null);
    setVodTime(null);
    setVodConfirmed(false);
    setVodChecklist(AppConstants.vodChecklistTemplate());
    logEvent("Patient Re-Arrested. CPR Resumed.", EventType.Status);
  };
  
  const addTimeOffset = (seconds: number) => {
      saveUndoState();
      setTimeOffset(t => t + seconds);
      logEvent(`Time offset added: +${seconds / 60} min`, EventType.Status);
  };

  const toggleChecklistItemCompletion = (item: ChecklistItem) => {
    saveUndoState();
    const updateList = (list: ChecklistItem[]) => 
      list.map(i => i.id === item.id ? { ...i, isCompleted: !i.isCompleted } : i);
      
    setReversibleCauses(updateList);
    setPostROSCTasks(updateList);
    setPostMortemTasks(updateList);
    
    const status = !item.isCompleted ? "checked" : "unchecked";
    logEvent(`${item.name} ${status}`, EventType.Cause);
  };

  const setHypothermiaStatus = (status: HypothermiaStatus) => {
    saveUndoState();
    setReversibleCauses(list => 
      list.map(i => 
        i.name === "Hypothermia" 
        ? { ...i, hypothermiaStatus: status, isCompleted: (status !== HypothermiaStatus.None) } 
        : i
      )
    );
    logEvent(`Hypothermia status set to: ${status}`, EventType.Cause);
  };

  // Dynamically count lidocaine from events (fixes iOS parity issue)
  const dynamicLidocaineCount = useMemo(() => {
    return events.filter(e => e.message.toLowerCase().includes('lidocaine') && e.message.toLowerCase().includes('given')).length;
  }, [events]);
  
  const copySummaryToClipboard = () => {
    const startText = startTimeRef.current ? `${String(startTimeRef.current.getHours()).padStart(2,'0')}:${String(startTimeRef.current.getMinutes()).padStart(2,'0')}` : "Unknown";
    const dateText = startTimeRef.current ? startTimeRef.current.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : "Unknown";
    
    const demoText = (patientAgeStr || patientGenderStr) 
      ? `${patientAgeStr ? `${patientAgeStr} y/o` : ''} ${patientGenderStr || ''}`.trim()
      : '';
    
    // Extract real-world times
    const firstIVIO = extractFirstEventTime(events, ['vascular access'], startTimeRef.current);
    const firstAirway = extractFirstEventTime(events, ['advanced airway'], startTimeRef.current);
    const firstAdrenaline = extractFirstEventTime(events, ['adrenaline'], startTimeRef.current);
    const lastAdrenaline = extractLastEventTime(events, ['adrenaline'], startTimeRef.current);
    
    const roscText = roscTime !== null ? (startTimeRef.current 
      ? `ROSC at: ${(() => { const d = new Date(startTimeRef.current.getTime() + roscTime * 1000); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })()}`
      : `ROSC at: ${TimeFormatter.format(roscTime)}`) : null;
    const torText = torTime !== null ? (startTimeRef.current
      ? `TOR at: ${(() => { const d = new Date(startTimeRef.current.getTime() + torTime * 1000); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })()}`
      : `TOR at: ${TimeFormatter.format(torTime)}`) : null;
    const vodText = vodTime !== null ? (startTimeRef.current
      ? `VOD at: ${(() => { const d = new Date(startTimeRef.current.getTime() + vodTime * 1000); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })()}`
      : `VOD at: ${TimeFormatter.format(vodTime)}`) : null;

    const summaryText = `eResus Event Summary

${dateText}
${demoText ? demoText + '\n' : ''}Start Time: ${startText}
${roscText ? roscText + '\n' : ''}${torText ? torText + '\n' : ''}${vodText ? vodText + '\n' : ''}Total Duration: ${TimeFormatter.format(totalArrestTime)}

CRITICAL INTERVENTIONS (REAL-WORLD TIME)
Initial Rhythm: ${initialRhythm || 'None'}
First IV / IO: ${firstIVIO || 'None'}
First Airway: ${firstAirway || 'None'}

Last Adrenaline: ${lastAdrenaline || 'None'}

Shocks: ${shockCount}  |  Adrenaline: ${adrenalineCount}  |  Amiodarone: ${amiodaroneCount}  |  Lidocaine: ${Math.max(lidocaineCount, dynamicLidocaineCount)}

--- Event Log ---
${[...events].sort((a, b) => a.timestamp - b.timestamp).map(e => `[${TimeFormatter.format(e.timestamp)}] ${e.message}`).join('\n')}`;
    navigator.clipboard.writeText(summaryText.trim())
      .then(() => HapticManager.notification('success'))
      .catch(err => console.error("Failed to copy summary: ", err));
  };
  
  const saveLogToDatabase = async () => {
    if (!startTimeRef.current) return;
    
    let finalOutcome: string;
    switch (arrestState) {
      case ArrestState.Rosc: finalOutcome = "ROSC"; break;
      case ArrestState.Ended: finalOutcome = "Deceased"; break;
      default: finalOutcome = "Incomplete";
    }
    
    try {
      const logsCollectionPath = `/artifacts/${appId}/users/${userId}/logs`;
      
      const newLogDoc: any = {
        startTime: Timestamp.fromDate(startTimeRef.current),
        totalDuration: totalArrestTime,
        finalOutcome: finalOutcome,
        userId: userId,
        shockCount,
        adrenalineCount,
        amiodaroneCount,
        lidocaineCount: Math.max(lidocaineCount, dynamicLidocaineCount),
        roscTime: roscTime ?? null,
        torTime: torTime ?? null,
        vodTime: vodTime ?? null,
        patientAge: patientAgeStr || null,
        patientGender: patientGenderStr || null,
        initialRhythm: initialRhythm || null,
        organization: userOrganization || null,
        isSynced: false,
      };
      
      const logDocRef = await addDoc(collection(db, logsCollectionPath), newLogDoc);
      
      const eventsCollectionRef = collection(db, `${logsCollectionPath}/${logDocRef.id}/events`);
      for (const event of events) {
        await addDoc(eventsCollectionRef, event);
      }
      
      if (researchModeEnabled) {
        try {
          const researchData: any = {
            startTime: Timestamp.fromDate(startTimeRef.current),
            totalDuration: totalArrestTime,
            finalOutcome,
            shockCount,
            adrenalineCount,
            amiodaroneCount,
            lidocaineCount: Math.max(lidocaineCount, dynamicLidocaineCount),
            patientAge: patientAgeStr || 'Unknown',
            patientGender: patientGenderStr || 'Unknown',
            initialRhythm: initialRhythm || 'Unknown',
            organization: userOrganization || 'Unknown',
            uid: userId,
            timestamp: serverTimestamp(),
          };
          if (roscTime !== null) researchData.roscTime = roscTime;
          if (torTime !== null) researchData.torTime = torTime;
          if (vodTime !== null) researchData.vodTime = vodTime;
          
          await setDoc(doc(db, 'arrestLogs', logDocRef.id), researchData);
          
          for (const event of events) {
            await addDoc(collection(db, `arrestLogs/${logDocRef.id}/events`), {
              timestamp: event.timestamp,
              message: event.message,
              type: event.type,
            });
          }
          
          await updateDoc(doc(db, logsCollectionPath, logDocRef.id), { isSynced: true });
        } catch (e) {
          console.error("Error uploading to research collection:", e);
        }
      }
      
    } catch (e) {
      console.error("Error saving log to Firestore: ", e);
    }
  };
  
  const performReset = async (shouldSaveLog: boolean, shouldCopy: boolean) => {
    if (shouldSaveLog && startTimeRef.current) {
      await saveLogToDatabase();
    }
    if (shouldCopy) {
      copySummaryToClipboard();
    }
    
    stopTimer();
    setArrestState(ArrestState.Pending);
    setMasterTime(0);
    setCprTime(cprCycleDuration);
    setTimeOffset(0);
    setUiState(UIState.Default);
    setEvents([]);
    setShockCount(0);
    setAdrenalineCount(0);
    setAmiodaroneCount(0);
    setLidocaineCount(0);
    setAirwayPlaced(false);
    setAntiarrhythmicGiven(AntiarrhythmicDrug.None);
    lastAdrenalineTimeRef.current = null;
    shockCountForAmiodarone1Ref.current = null;
    startTimeRef.current = null;
    setUndoHistory([]);
    setIsTimerPaused(false);
    pauseStartTimeRef.current = null;
    setPatientAgeCategory(null);
    setReversibleCauses(AppConstants.reversibleCausesTemplate());
    setPostROSCTasks(AppConstants.postROSCTasksTemplate());
    setPostMortemTasks(AppConstants.postMortemTasksTemplate());
    setHideAdrenalinePrompt(false);
    setHideAmiodaronePrompt(false);
    setLastRhythmNonShockable(false);
    setAirwayAdjunct(null);
    setRoscTime(null);
    setTorTime(null);
    setVodTime(null);
    setVodChecklist(AppConstants.vodChecklistTemplate());
    setVodConfirmed(false);
    setPatientAgeStr('');
    setPatientGenderStr('');
    setInitialRhythm(null);
    setShowPatientInfoPrompt(false);
    localStorage.removeItem(ARREST_SESSION_KEY);
  };

  // Offline Log Sweeper
  const syncOfflineLogs = useCallback(async () => {
    if (!researchModeEnabled) return;
    try {
      const logsCollectionPath = `/artifacts/${appId}/users/${userId}/logs`;
      const q = query(collection(db, logsCollectionPath), where("isSynced", "==", false));
      const snapshot = await getDocs(q);
      for (const logDoc of snapshot.docs) {
        const data = logDoc.data();
        try {
          const researchData: any = {
            startTime: data.startTime,
            totalDuration: data.totalDuration,
            finalOutcome: data.finalOutcome,
            shockCount: data.shockCount ?? 0,
            adrenalineCount: data.adrenalineCount ?? 0,
            amiodaroneCount: data.amiodaroneCount ?? 0,
            lidocaineCount: data.lidocaineCount ?? 0,
            patientAge: data.patientAge || 'Unknown',
            patientGender: data.patientGender || 'Unknown',
            initialRhythm: data.initialRhythm || 'Unknown',
            organization: data.organization || 'Unknown',
            uid: userId,
            timestamp: serverTimestamp(),
          };
          if (data.roscTime) researchData.roscTime = data.roscTime;
          if (data.torTime) researchData.torTime = data.torTime;
          if (data.vodTime) researchData.vodTime = data.vodTime;
          
          await setDoc(doc(db, 'arrestLogs', logDoc.id), researchData);
          
          const eventsSnap = await getDocs(collection(db, `${logsCollectionPath}/${logDoc.id}/events`));
          for (const eventDoc of eventsSnap.docs) {
            await addDoc(collection(db, `arrestLogs/${logDoc.id}/events`), eventDoc.data());
          }
          
          await updateDoc(doc(db, logsCollectionPath, logDoc.id), { isSynced: true });
        } catch (e) {
          console.error("Error syncing offline log:", e);
        }
      }
      if (snapshot.size > 0) console.log(`Synced ${snapshot.size} offline logs`);
    } catch (e) {
      console.error("Error sweeping offline logs:", e);
    }
  }, [db, userId, researchModeEnabled]);

  useEffect(() => {
    syncOfflineLogs();
    const handleFocus = () => syncOfflineLogs();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') syncOfflineLogs();
    });
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [syncOfflineLogs]);

  // QR Session Transfer
  const generateTransferState = () => {
    return {
      arrestState, masterTime, cprTime, timeOffset, events,
      shockCount, adrenalineCount, amiodaroneCount, lidocaineCount,
      airwayPlaced, antiarrhythmicGiven, reversibleCauses, postROSCTasks,
      postMortemTasks, patientAgeCategory, uiState,
      hideAdrenalinePrompt, hideAmiodaronePrompt, lastRhythmNonShockable,
      airwayAdjunct, roscTime, isTimerPaused,
      startTime: startTimeRef.current?.toISOString() ?? null,
      cprCycleStartTime: cprCycleStartTimeRef.current,
      lastAdrenalineTime: lastAdrenalineTimeRef.current,
      shockCountForAmiodarone1: shockCountForAmiodarone1Ref.current,
      initialRhythm, patientAgeStr, patientGenderStr,
      torTime, vodTime, vodChecklist, vodConfirmed,
    };
  };

  const hostSessionTransfer = async (): Promise<string | null> => {
    try {
      const state = generateTransferState();
      const transferId = String(Math.floor(100000 + Math.random() * 900000));
      await setDoc(doc(db, 'transfers', transferId), {
        stateData: JSON.stringify(state),
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
      });
      return transferId;
    } catch (e) {
      console.error("Error hosting session transfer:", e);
      return null;
    }
  };

  const receiveSessionTransfer = async (transferId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const normalizedTransferId = transferId.replace(/\D/g, '').slice(0, 6);
      if (normalizedTransferId.length !== 6) {
        return { success: false, error: 'Enter a valid 6-digit transfer code.' };
      }

      const transferRef = doc(db, 'transfers', normalizedTransferId);
      const transferDoc = await getDoc(transferRef);
      if (!transferDoc.exists()) {
        return { success: false, error: 'Transfer not found. Check the code and try again.' };
      }

      const data = transferDoc.data();
      const expiresAt = data.expiresAt instanceof Timestamp
        ? data.expiresAt.toDate()
        : data.expiresAt?.toDate?.() ?? null;

      if (expiresAt && expiresAt.getTime() <= Date.now()) {
        try {
          await deleteDoc(transferRef);
        } catch {
          // Ignore cleanup failures for expired transfers
        }
        return { success: false, error: 'This transfer code has expired. Generate a new code and try again.' };
      }

      const state = JSON.parse(data.stateData);

      // --- Normalize iOS format to PWA format ---

      // 1. startTime: iOS uses Apple reference date (seconds since Jan 1, 2001)
      //    PWA uses ISO date string. Detect and convert.
      const APPLE_EPOCH = Date.UTC(2001, 0, 1); // Jan 1 2001 in ms
      let normalizedStartTime: Date | null = null;
      if (state.startTime != null) {
        if (typeof state.startTime === 'number') {
          // Apple reference date: convert to JS Date
          normalizedStartTime = new Date(APPLE_EPOCH + state.startTime * 1000);
        } else if (typeof state.startTime === 'string') {
          normalizedStartTime = new Date(state.startTime);
        }
      }

      // 2. events: iOS base64-encodes as eventsData, PWA uses events array
      let normalizedEvents: any[] = state.events ?? [];
      if (!state.events && state.eventsData) {
        try {
          const decoded = atob(state.eventsData);
          normalizedEvents = JSON.parse(decoded);
        } catch {
          console.warn('Failed to decode iOS eventsData');
          normalizedEvents = [];
        }
      }

      // 3. uiState: iOS uses object {"default":{}}, PWA uses string "default"
      let normalizedUiState = state.uiState;
      if (typeof state.uiState === 'object' && state.uiState !== null) {
        // Extract the key name from the iOS enum-style object
        const keys = Object.keys(state.uiState);
        if (keys.length > 0) {
          normalizedUiState = keys[0]; // "default" | "analyzing" | "shockAdvised"
        }
      }

      // 4. arrestState: iOS may use lowercase, normalize
      const normalizedArrestState = typeof state.arrestState === 'string'
        ? state.arrestState.toUpperCase()
        : state.arrestState;

      // Stop any existing timer first
      stopTimer();

      // Set the start time ref FIRST so the timer can use it
      if (normalizedStartTime) {
        startTimeRef.current = normalizedStartTime;
      }
      cprCycleStartTimeRef.current = state.cprCycleStartTime ?? 0;
      lastAdrenalineTimeRef.current = state.lastAdrenalineTime ?? null;
      shockCountForAmiodarone1Ref.current = state.shockCountForAmiodarone1 ?? null;

      // Calculate the current real elapsed time from original start
      const realElapsed = startTimeRef.current
        ? (Date.now() - startTimeRef.current.getTime()) / 1000
        : state.masterTime;

      // Add a transfer event with the correct timestamp
      const transferEvent: Event = {
        timestamp: realElapsed,
        message: 'Session Transferred from another device',
        type: EventType.Status,
      };

      // Set ALL state at once
      setArrestState(normalizedArrestState);
      setMasterTime(realElapsed);
      setCprTime(state.cprTime);
      setTimeOffset(state.timeOffset);
      setEvents([...normalizedEvents, transferEvent]);
      setShockCount(state.shockCount);
      setAdrenalineCount(state.adrenalineCount);
      setAmiodaroneCount(state.amiodaroneCount);
      setLidocaineCount(state.lidocaineCount);
      setAirwayPlaced(state.airwayPlaced);
      setAntiarrhythmicGiven(state.antiarrhythmicGiven);
      setReversibleCauses(state.reversibleCauses);
      setPostROSCTasks(state.postROSCTasks);
      setPostMortemTasks(state.postMortemTasks);
      setPatientAgeCategory(state.patientAgeCategory);
      setUiState(normalizedUiState);
      setHideAdrenalinePrompt(state.hideAdrenalinePrompt ?? false);
      setHideAmiodaronePrompt(state.hideAmiodaronePrompt ?? false);
      setLastRhythmNonShockable(state.lastRhythmNonShockable ?? false);
      setAirwayAdjunct(state.airwayAdjunct ?? null);
      setRoscTime(state.roscTime ?? null);
      setIsTimerPaused(state.isTimerPaused ?? false);
      setInitialRhythm(state.initialRhythm ?? null);
      setPatientAgeStr(state.patientAgeStr ?? '');
      setPatientGenderStr(state.patientGenderStr ?? '');
      setTorTime(state.torTime ?? null);
      setVodTime(state.vodTime ?? null);
      setVodChecklist(state.vodChecklist ?? AppConstants.vodChecklistTemplate());
      setVodConfirmed(state.vodConfirmed ?? false);
      setUndoHistory([]);

      // Delete the transfer document
      try {
        await deleteDoc(transferRef);
      } catch {
        /* non-critical */
      }

      // Start timer if arrest is active and not paused
      if ((state.arrestState === ArrestState.Active || state.arrestState === ArrestState.Rosc) && !state.isTimerPaused) {
        // Use setTimeout to ensure state has settled before starting timer
        setTimeout(() => startTimer(), 50);
      }

      HapticManager.notification('success');
      return { success: true };
    } catch (e: any) {
      console.error('Error receiving session transfer:', e);
      if (e?.code === 'permission-denied') {
        return { success: false, error: 'Transfer access is blocked by Firestore rules. Update the transfers read rule and try again.' };
      }
      return { success: false, error: 'Transfer not found. Check the code and try again.' };
    }
  };

  return {
    // State
    arrestState, masterTime, cprTime, timeOffset, uiState, events,
    shockCount, adrenalineCount, amiodaroneCount, lidocaineCount,
    airwayPlaced, antiarrhythmicGiven, reversibleCauses, postROSCTasks,
    postMortemTasks, patientAgeCategory, isTimerPaused,
    hideAdrenalinePrompt, hideAmiodaronePrompt, roscTime, airwayAdjunct,
    startTime: startTimeRef.current,
    // v1.2 research
    patientAgeStr, setPatientAgeStr, patientGenderStr, setPatientGenderStr,
    initialRhythm, showPatientInfoPrompt, setShowPatientInfoPrompt,
    // v1.3 TOR/VOD
    torTime, vodTime, vodChecklist, vodConfirmed,
    dynamicLidocaineCount,
    
    // Computed
    totalArrestTime, canUndo, isAdrenalineAvailable, isAmiodaroneAvailable,
    isLidocaineAvailable, timeUntilAdrenaline, shouldShowAmiodaroneReminder,
    shouldShowAdrenalinePrompt, shouldShowAmiodaroneFirstDosePrompt,
    
    // Recovery
    showRecoveryPrompt, resumeRecoveredSession, discardRecoveredSession,
    
    // Actions
    startArrest, analyseRhythm, logRhythm, deliverShock, resumeCPR,
    logAdrenaline, logAmiodarone, logLidocaine, logOtherDrug,
    logAirwayPlaced: logAirwayPlacedFn,
    logVascularAccess,
    logEtco2, achieveROSC, endArrest, confirmTOR, confirmVOD,
    toggleVodChecklistItem,
    reArrest, addTimeOffset,
    toggleChecklistItemCompletion, setHypothermiaStatus, setPatientAgeCategory,
    performReset, undo, copySummaryToClipboard, pauseArrest, resumeArrest,
    setHideAdrenalinePrompt, setHideAmiodaronePrompt,
    // v1.2 transfer
    hostSessionTransfer, receiveSessionTransfer, generateTransferState,
  };
};

type ArrestViewModelType = ReturnType<typeof useArrestViewModel>;
const ArrestContext = createContext<ArrestViewModelType | null>(null);
const useArrest = () => useContext(ArrestContext)!;

//============================================================================
// MODAL COMPONENTS
//============================================================================

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md mx-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <XSquare size={24} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[70vh]">
          {children}
        </div>
      </div>
    </div>
  );
};

// Patient Info Prompt (with two-way age sync)
const PatientInfoPromptView: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { patientAgeStr, setPatientAgeStr, patientGenderStr, setPatientGenderStr, setPatientAgeCategory } = useArrest();
  
  const handleSave = () => {
    // Two-way sync: convert demographic age to drug calculator category
    if (patientAgeStr) {
      const category = ageStringToCategory(patientAgeStr);
      if (category) {
        setPatientAgeCategory(category);
      }
    }
    onClose();
  };
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Patient Info">
      <div className="space-y-4">
        <h3 className="text-blue-600 dark:text-blue-400 font-semibold">Patient Demographics</h3>
        <div className="space-y-2">
          <input
            type="number"
            value={patientAgeStr}
            onChange={(e) => setPatientAgeStr(e.target.value)}
            placeholder="Approx Age (e.g. 45)"
            className="w-full p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white"
          />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg">
            <span className="text-gray-700 dark:text-gray-300">Gender</span>
            <select
              value={patientGenderStr}
              onChange={(e) => setPatientGenderStr(e.target.value)}
              className="bg-transparent text-gray-900 dark:text-white text-right"
            >
              <option value="">Unknown</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">These details help ambulance trusts understand demographic differences in cardiac arrest outcomes.</p>
        <ActionButton title="Save" backgroundColor="bg-blue-600" foregroundColor="text-white" onClick={handleSave} />
      </div>
    </Modal>
  );
};

// Research Consent View
const ResearchConsentView: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { researchModeEnabled, setResearchModeEnabled, setHasRespondedToResearchTerms, userOrganization, setUserOrganization } = useSettings();
  const { db } = useFirebase();
  const [orgName, setOrgName] = useState(userOrganization || 'Independent / None');
  const [availableOrgs, setAvailableOrgs] = useState<string[]>(['Independent / None']);

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = onSnapshot(collection(db, 'organizations'), (snapshot) => {
      const orgs = snapshot.docs.map(d => d.data().name as string).filter(Boolean).sort();
      setAvailableOrgs(['Independent / None', ...orgs]);
    }, () => { /* ignore errors */ });
    return () => unsubscribe();
  }, [isOpen, db]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/95 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <BarChart3 size={64} className="text-blue-500 mx-auto" />
        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">Help Advance Science</h2>
        <p className="text-sm text-center text-gray-600 dark:text-gray-400">
          eResus is partnering with researchers to track the effectiveness of interventions. By enrolling, your app will automatically upload anonymised records when an arrest concludes.
        </p>
        <a href="https://tech.aegismedicalsolutions.co.uk/eresus/data-policy" target="_blank" rel="noopener noreferrer"
          className="block text-center text-sm text-blue-600 dark:text-blue-400 underline">
          Read the Data Collection Policy & Agreement
        </a>
        <div className="space-y-2">
          <label className="text-xs text-gray-500 dark:text-gray-400">Select your Ambulance Trust / Organisation:</label>
          <select value={orgName} onChange={(e) => setOrgName(e.target.value)}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white text-sm">
            {availableOrgs.map(org => <option key={org} value={org}>{org}</option>)}
          </select>
        </div>
        <button onClick={() => {
          setResearchModeEnabled(true);
          setUserOrganization(orgName);
          setHasRespondedToResearchTerms(true);
          onClose();
        }} className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold active:scale-95 transition-transform">
          Enroll & Accept Terms
        </button>
        <button onClick={() => {
          setResearchModeEnabled(false);
          setHasRespondedToResearchTerms(true);
          onClose();
        }} className="w-full py-2 text-gray-500 dark:text-gray-400 font-medium">
          No, Opt Out
        </button>
      </div>
    </div>
  );
};

// Session Transfer Modal
const SessionTransferModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { hostSessionTransfer, receiveSessionTransfer } = useArrest();
  const [hostedCode, setHostedCode] = useState<string | null>(null);
  const [isHosting, setIsHosting] = useState(false);
  const [receiveCode, setReceiveCode] = useState('');
  const [isReceiving, setIsReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState('');
  const [mode, setMode] = useState<'menu' | 'send' | 'receive'>('menu');

  const handleHost = async () => {
    setIsHosting(true);
    const code = await hostSessionTransfer();
    setHostedCode(code);
    setIsHosting(false);
  };

  const handleReceive = async () => {
    if (receiveCode.length !== 6) return;
    setIsReceiving(true);
    setReceiveError('');
    const result = await receiveSessionTransfer(receiveCode);
    setIsReceiving(false);
    if (result.success) {
      onClose();
    } else {
      setReceiveError(result.error || 'Transfer not found. Check the code and try again.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Transfer Arrest">
      <div className="space-y-4">
        {mode === 'menu' && (
          <>
            <ActionButton title="Send to Another Device" icon={<QrCode size={18} />}
              backgroundColor="bg-purple-600" foregroundColor="text-white"
              onClick={() => { setMode('send'); handleHost(); }} />
            <ActionButton title="Receive from Another Device" icon={<QrCode size={18} />}
              backgroundColor="bg-blue-600" foregroundColor="text-white"
              onClick={() => setMode('receive')} />
          </>
        )}
        {mode === 'send' && (
          <div className="text-center space-y-4">
            {isHosting ? (
              <p className="text-gray-600 dark:text-gray-400 animate-pulse">Preparing Transfer...</p>
            ) : hostedCode ? (
              <>
                <p className="font-semibold text-gray-700 dark:text-gray-300">Scan on receiving device or enter code:</p>
                <div className="flex justify-center">
                  <QRCodeSVG value={hostedCode} size={180} />
                </div>
                <p className="font-mono text-3xl font-bold text-gray-900 dark:text-white tracking-widest">{hostedCode}</p>
              </>
            ) : (
              <p className="text-red-500">Failed to generate transfer code.</p>
            )}
          </div>
        )}
        {mode === 'receive' && (
          <div className="space-y-4">
            <p className="text-sm text-center text-gray-600 dark:text-gray-400">Enter the 6-digit code shown on the sending device:</p>
            <input type="text" value={receiveCode} onChange={(e) => setReceiveCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000" maxLength={6}
              className="w-full text-center text-3xl font-mono font-bold p-4 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl text-gray-900 dark:text-white tracking-[0.5em]" />
            {receiveError && <p className="text-sm text-red-500 text-center">{receiveError}</p>}
            <ActionButton title={isReceiving ? "Receiving..." : "Receive Session"}
              backgroundColor="bg-blue-600" foregroundColor="text-white"
              onClick={handleReceive} disabled={receiveCode.length !== 6 || isReceiving} />
          </div>
        )}
      </div>
    </Modal>
  );
};

// Edit Log Patient Info Modal (initial rhythm is read-only / auto-captured)
const EditLogPatientInfoModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  logId: string;
  currentAge?: string;
  currentGender?: string;
  currentRhythm?: string;
}> = ({ isOpen, onClose, logId, currentAge, currentGender, currentRhythm }) => {
  const { db, userId } = useFirebase();
  const [age, setAge] = useState(currentAge || '');
  const [gender, setGender] = useState(currentGender || '');

  const handleSave = async () => {
    try {
      const logPath = `/artifacts/${appId}/users/${userId}/logs/${logId}`;
      await updateDoc(doc(db, logPath), {
        patientAge: age || null,
        patientGender: gender || null,
      });
      
      try {
        const researchDocRef = doc(db, 'arrestLogs', logId);
        const researchDoc = await getDoc(researchDocRef);
        if (researchDoc.exists()) {
          await updateDoc(researchDocRef, {
            patientAge: age || 'Unknown',
            patientGender: gender || 'Unknown',
          });
        }
      } catch (e) {
        console.warn("Could not update research log:", e);
      }
      
      onClose();
    } catch (e) {
      console.error("Error updating log:", e);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Patient Info">
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Approx Age</label>
          <input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 45"
            className="w-full p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Gender</label>
          <select value={gender} onChange={(e) => setGender(e.target.value)}
            className="w-full p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white">
            <option value="">Unknown</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
        {currentRhythm && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Initial Rhythm</label>
            <p className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-400">{currentRhythm} (auto-captured)</p>
          </div>
        )}
        <ActionButton title="Save" backgroundColor="bg-blue-600" foregroundColor="text-white" onClick={handleSave} />
      </div>
    </Modal>
  );
};

// Install Instructions Modal (first-time PWA users)
const InstallInstructionsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isMac = /macintosh|mac os x/.test(ua) && !isIOS;
  const isWindows = /windows/.test(ua);

  const getInstructions = () => {
    if (isIOS) return {
      device: 'iPhone / iPad',
      steps: [
        'Tap the Share button at the bottom of Safari',
        'Scroll down and tap "Add to Home Screen"',
        'Tap "Add" in the top right corner'
      ]
    };
    if (isAndroid) return {
      device: 'Android',
      steps: [
        'Tap the three-dot menu (⋮) in Chrome',
        'Tap "Add to Home screen" or "Install app"',
        'Confirm by tapping "Add"'
      ]
    };
    if (isMac) return {
      device: 'Mac',
      steps: [
        'In Safari: File → "Add to Dock"',
        'In Chrome: click the install icon (⊕) in the address bar',
        'Or use Menu → "Install eResus…"'
      ]
    };
    if (isWindows) return {
      device: 'Windows',
      steps: [
        'In Chrome/Edge: click the install icon (⊕) in the address bar',
        'Or use Menu → "Install eResus…"',
        'The app will appear in your Start menu'
      ]
    };
    return {
      device: 'your device',
      steps: [
        'Look for an "Install" or "Add to Home Screen" option in your browser menu',
        'This creates a shortcut for quick, full-screen access',
        'The app works offline once installed'
      ]
    };
  };

  const info = getInstructions();
  
  return (
    <div className="fixed inset-0 bg-gray-900/95 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-5 max-h-[90vh] overflow-y-auto">
         <div className="flex flex-col items-center space-y-3">
          <img 
            src="https://145955222.fs1.hubspotusercontent-eu1.net/hubfs/145955222/eResus/eResus.svg" 
            alt="eResus" 
            className="w-20 h-20 rounded-2xl shadow-lg"
          />
          <h2 className="text-xl font-bold text-center text-gray-900 dark:text-white">Install eResus</h2>
          <p className="text-sm text-center text-gray-500 dark:text-gray-400">
            Add eResus to your home screen for instant access, offline support, and a full-screen experience.
          </p>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            {info.device}
          </p>
          <ol className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            {info.steps.map((step, i) => (
              <li key={i} className="flex items-start space-x-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <button onClick={onClose} className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold active:scale-95 transition-transform">
          Continue to App
        </button>
      </div>
    </div>
  );
};

// Account Prompt View (onboarding sign-up prompt)
const AccountPromptView: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { auth, user, isAnonymous } = useFirebase();
  const [showAuthModal, setShowAuthModal] = useState(false);

  if (!isOpen) return null;

  // If user signed in during this prompt, auto-close
  if (user && !isAnonymous) {
    onClose();
    return null;
  }

  return (
    <>
      {!showAuthModal && (
        <div className="fixed inset-0 bg-gray-900/95 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <img 
              src="https://145955222.fs1.hubspotusercontent-eu1.net/hubfs/145955222/eResus/eResus.svg" 
              alt="eResus" 
              className="w-16 h-16 mx-auto rounded-2xl shadow-lg"
            />
            <h2 className="text-xl font-bold text-center text-gray-900 dark:text-white">Create an Account</h2>
            <p className="text-sm text-center text-gray-600 dark:text-gray-400">
              Sign up to unlock extra features and keep your data safe.
            </p>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
              <div className="flex items-start space-x-3">
                <RotateCw size={18} className="text-blue-500 mt-0.5 shrink-0" />
                <p><strong>Sync across devices</strong> — access your arrest logs from any phone, tablet, or computer.</p>
              </div>
              <div className="flex items-start space-x-3">
                <Shield size={18} className="text-green-500 mt-0.5 shrink-0" />
                <p><strong>Protect your data</strong> — anonymous logs are tied to this device only and can be lost if you clear your browser.</p>
              </div>
              <div className="flex items-start space-x-3">
                <Users size={18} className="text-purple-500 mt-0.5 shrink-0" />
                <p><strong>Transfer arrests</strong> — seamlessly hand over active arrests between signed-in devices.</p>
              </div>
            </div>
            <button 
              onClick={() => setShowAuthModal(true)}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold active:scale-95 transition-transform">
              Sign Up / Sign In
            </button>
            <button 
              onClick={onClose}
              className="w-full py-2 text-gray-500 dark:text-gray-400 font-medium">
              Skip for Now
            </button>
          </div>
        </div>
      )}
      <AuthView isOpen={showAuthModal} onClose={() => {
        setShowAuthModal(false);
      }} />
    </>
  );
};

// ============================================================================
// NEW: Vascular Access Modal (Log IV/IO)
// ============================================================================
const VascularAccessModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { logVascularAccess } = useArrest();
  const [accessType, setAccessType] = useState<'IV' | 'IO'>('IV');
  const [location, setLocation] = useState('');
  const [gauge, setGauge] = useState('');
  const [successful, setSuccessful] = useState(true);

  const handleSave = () => {
    logVascularAccess(accessType, location, gauge, successful);
    onClose();
    setLocation('');
    setGauge('');
    setSuccessful(true);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log Vascular Access">
      <div className="space-y-4">
        <h3 className="text-blue-600 dark:text-blue-400 font-semibold text-sm">Access Details</h3>
        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl space-y-4">
          {/* IV/IO Toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            <button
              onClick={() => setAccessType('IV')}
              className={`flex-1 py-2.5 text-center font-semibold transition-colors ${
                accessType === 'IV' 
                  ? 'bg-gray-400 dark:bg-gray-500 text-white' 
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >IV</button>
            <button
              onClick={() => setAccessType('IO')}
              className={`flex-1 py-2.5 text-center font-semibold transition-colors ${
                accessType === 'IO' 
                  ? 'bg-gray-400 dark:bg-gray-500 text-white' 
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >IO</button>
          </div>

          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (e.g. Left AC, Tibia) - Optional"
            className="w-full p-3 bg-transparent border-b border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
          />
          <input
            type="text"
            value={gauge}
            onChange={(e) => setGauge(e.target.value)}
            placeholder="Gauge (e.g. 18G, Pink) - Optional"
            className="w-full p-3 bg-transparent border-b border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none"
          />
          <div className="flex justify-between items-center">
            <span className="text-gray-800 dark:text-gray-200 font-medium">Successful Placement</span>
            <button
              onClick={() => setSuccessful(!successful)}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
              transition-colors duration-200 ease-in-out
              ${successful ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 
              transition duration-200 ease-in-out ${successful ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>
        <ActionButton title="Save" backgroundColor="bg-blue-600" foregroundColor="text-white" onClick={handleSave} />
      </div>
    </Modal>
  );
};

// ============================================================================
// NEW: TOR Guidance Modal (JRCALC Compliant)
// ============================================================================
const TORGuidanceModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirmTOR: () => void }> = ({ isOpen, onClose, onConfirmTOR }) => {
  const { totalArrestTime, patientAgeStr, patientAgeCategory, initialRhythm } = useArrest();
  
  const isPaediatric = isPatientPaediatric(patientAgeStr, patientAgeCategory);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Clinical Guidance">
      <div className="space-y-5">
        <div className="text-center space-y-2">
          <AlertTriangle size={48} className="text-orange-500 mx-auto" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Termination of Resuscitation</h3>
          <p className="text-gray-600 dark:text-gray-400">Current Duration: {TimeFormatter.format(totalArrestTime)}</p>
        </div>

        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            JRCALC Guidelines ({isPaediatric ? 'Paediatric' : 'Adult'})
          </h4>
          
          {isPaediatric ? (
            <div className="space-y-3 text-sm text-gray-800 dark:text-gray-200">
              <p className="font-semibold">Paediatric / Infant Arrest</p>
              <p>All paediatric cardiac arrests should be conveyed to the Emergency Department unless there is a clear reason not to (e.g. DNACPR, expected death).</p>
              <p>Consider continuing resuscitation for at least <strong>60 minutes</strong> from the time of arrest.</p>
              <p>Contact paediatric specialist for advice early.</p>
            </div>
          ) : (
            <div className="space-y-4 text-sm text-gray-800 dark:text-gray-200">
              {/* Asystole guidance */}
              <div className={`${initialRhythm === 'Asystole' ? 'p-3 border-2 border-blue-500 rounded-lg bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <p className="font-bold">Asystole 
                  {initialRhythm === 'Asystole' && <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase font-bold">Logged Initial Rhythm</span>}
                </p>
                <p className="mt-1">Discontinue at any point if inappropriate. At 45 mins, cessation is appropriate unless there is a compelling reason to continue.</p>
              </div>
              
              {/* PEA guidance */}
              <div className={`${initialRhythm === 'PEA' ? 'p-3 border-2 border-blue-500 rounded-lg bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <p className="font-bold">PEA
                  {initialRhythm === 'PEA' && <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase font-bold">Logged Initial Rhythm</span>}
                </p>
                <p className="mt-1">At 45 mins, consider cessation if rate &lt;40 bpm and QRS width &gt;120msecs. Otherwise, seek advice.</p>
              </div>
              
              {/* VF/VT guidance */}
              <div className={`${(initialRhythm === 'VF' || initialRhythm === 'VT') ? 'p-3 border-2 border-blue-500 rounded-lg bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <p className="font-bold text-blue-600 dark:text-blue-400">VF / VT
                  {(initialRhythm === 'VF' || initialRhythm === 'VT') && <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase font-bold">Logged Initial Rhythm</span>}
                </p>
                <p className="mt-1">Follow local pathway for refractory arrest. Seek advice at 45 mins. Cessation may be appropriate.</p>
              </div>

              <hr className="border-gray-300 dark:border-gray-600" />

              {/* ROSC Considerations */}
              <div>
                <p className="font-bold">ROSC Considerations</p>
                <ul className="mt-1 space-y-1 list-disc list-inside text-sm">
                  <li>Transient (&lt;10 mins): Disregard and consider TOR based on guidance above.</li>
                  <li>Sustained (&gt;10 mins) then re-arrest: Discuss with a senior clinician.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <ActionButton
          title="Confirm TOR (Stop CPR)"
          icon={<Shield size={18} />}
          backgroundColor="bg-red-600"
          foregroundColor="text-white"
          onClick={() => { onConfirmTOR(); onClose(); }}
        />
        <ActionButton
          title="Cancel & Continue Resuscitation"
          backgroundColor="bg-blue-50 dark:bg-blue-900/30"
          foregroundColor="text-blue-600 dark:text-blue-400"
          onClick={onClose}
        />
      </div>
    </Modal>
  );
};

// ============================================================================
// NEW: PLIIE (Breaking Bad News) Modal
// ============================================================================
const PLIIEModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const sections = [
    {
      letter: 'P', title: 'Prepare', color: 'bg-blue-500',
      items: [
        'Check and tidy uniform/clothing, remove gloves, wash hands.',
        'Talk to staff prior to going to the family.',
        "Ensure you have the patient's details.",
      ]
    },
    {
      letter: 'L', title: 'Location', color: 'bg-blue-500',
      items: [
        'Find somewhere private.',
        'Turn down radios and ignore mobile phones.',
      ]
    },
    {
      letter: 'I', title: 'Introduce', color: 'bg-blue-500',
      items: [
        'Introduce your name/role and other staff.',
        'Confirm the name of the deceased before speaking.',
        'Ask family to introduce themselves and establish relationship.',
      ]
    },
    {
      letter: 'I', title: 'Information', color: 'bg-blue-500',
      items: [
        'Adopt a position at the same level as the relative.',
        'Use simple language, avoid jargon.',
        "Ensure the word 'dead' or 'died' is introduced early.",
        'Allow periods of silence to absorb information.',
      ]
    },
    {
      letter: 'E', title: 'Empathy', color: 'bg-blue-500',
      items: [
        'Offer condolences sincerely.',
        'Allow time for tears and emotional responses.',
        'Do not rush — be patient and present.',
      ]
    },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Clinical Guidance">
      <div className="space-y-5">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Breaking Bad News (PLIIE)</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          When it becomes clear that the resuscitation attempt is unlikely to have a successful outcome, take time to prepare relatives. Anticipate varying grief reactions.
        </p>
        
        {sections.map((section, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center space-x-3">
              <span className={`w-8 h-8 rounded-full ${section.color} text-white flex items-center justify-center font-bold text-sm`}>
                {section.letter}
              </span>
              <h4 className="font-bold text-gray-900 dark:text-white">{section.title}</h4>
            </div>
            <ul className="space-y-1 ml-11">
              {section.items.map((item, j) => (
                <li key={j} className="text-sm text-gray-700 dark:text-gray-300 flex items-start">
                  <span className="mr-2 text-gray-400">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
};

// ============================================================================
// SUMMARY VIEW (Redesigned to match iOS)
// ============================================================================
const SummaryView: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => {
  const { 
    events, startTime, shockCount, adrenalineCount, amiodaroneCount, lidocaineCount,
    totalArrestTime, roscTime, copySummaryToClipboard, initialRhythm,
    patientAgeStr, patientGenderStr, torTime, vodTime, dynamicLidocaineCount
  } = useArrest();
  const [copied, setCopied] = useState(false);

  const sortedEvents = useMemo(() => 
    [...events].sort((a, b) => a.timestamp - b.timestamp), 
    [events]
  );

  const handleCopy = () => {
    copySummaryToClipboard();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Real-world clock times
  const startTimeStr = startTime ? `${String(startTime.getHours()).padStart(2,'0')}:${String(startTime.getMinutes()).padStart(2,'0')}` : "Unknown";
  const dateStr = startTime ? startTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : "Unknown";
  
  const getRealWorldTime = (offsetSeconds: number | null): string | null => {
    if (offsetSeconds === null || !startTime) return null;
    const d = new Date(startTime.getTime() + offsetSeconds * 1000);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };
  
  const firstIVIO = extractFirstEventTime(events, ['vascular access'], startTime);
  const firstAirway = extractFirstEventTime(events, ['advanced airway'], startTime);
  const firstAdrenaline = extractFirstEventTime(events, ['adrenaline'], startTime);
  const lastAdrenaline = extractLastEventTime(events, ['adrenaline'], startTime);
  
  const demoText = (patientAgeStr || patientGenderStr) 
    ? `${patientAgeStr ? `${patientAgeStr} y/o` : ''} ${patientGenderStr || ''}`.trim()
    : '';

  const effectiveLidocaine = Math.max(lidocaineCount, dynamicLidocaineCount);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Event Summary">
      <div className="flex flex-col space-y-4">
        {/* Date & Demographics */}
        <div className="space-y-1">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">{dateStr}</h3>
          {demoText && (
            <p className="text-blue-600 dark:text-blue-400 font-semibold flex items-center space-x-2">
              <UserIcon size={16} />
              <span>{demoText}</span>
            </p>
          )}
        </div>

        {/* Times */}
        <div className="space-y-1 text-sm">
          <p className="text-gray-700 dark:text-gray-300">Start Time: {startTimeStr}</p>
          {roscTime !== null && (
            <p className="text-green-600 dark:text-green-400 font-semibold">ROSC at: {getRealWorldTime(roscTime)}</p>
          )}
          {torTime !== null && (
            <p className="text-red-500 font-semibold">TOR at: {getRealWorldTime(torTime)}</p>
          )}
          {vodTime !== null && (
            <p className="text-red-500 font-semibold">VOD at: {getRealWorldTime(vodTime)}</p>
          )}
          <p className="text-gray-700 dark:text-gray-300">Total Duration: {TimeFormatter.format(totalArrestTime)}</p>
        </div>

        {/* Critical Interventions */}
        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Critical Interventions (Real-World Time)
          </h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-700 dark:text-gray-300">Initial Rhythm:</span>
              <span className="font-bold text-gray-900 dark:text-white">{initialRhythm || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700 dark:text-gray-300">First IV / IO:</span>
              <span className="font-bold text-gray-900 dark:text-white">{firstIVIO || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700 dark:text-gray-300">First Airway:</span>
              <span className="font-bold text-gray-900 dark:text-white">{firstAirway || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700 dark:text-gray-300">Last Adrenaline:</span>
              <span className="font-bold text-gray-900 dark:text-white">{lastAdrenaline || 'None'}</span>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex justify-around py-3">
          <div className="text-center">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{shockCount}</span>
            <p className="text-xs text-gray-500 dark:text-gray-400">Shocks</p>
          </div>
          <div className="text-center">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{adrenalineCount}</span>
            <p className="text-xs text-gray-500 dark:text-gray-400">Adrenaline</p>
          </div>
          <div className="text-center">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{amiodaroneCount}</span>
            <p className="text-xs text-gray-500 dark:text-gray-400">Amiodarone</p>
          </div>
          <div className="text-center">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{effectiveLidocaine}</span>
            <p className="text-xs text-gray-500 dark:text-gray-400">Lidocaine</p>
          </div>
        </div>

        {/* Event Log */}
        <div className="border-t border-gray-200 dark:border-gray-600 pt-3">
          <h4 className="font-bold text-gray-900 dark:text-white mb-2">Event Log</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto font-mono text-sm">
            {sortedEvents.map((event, index) => (
              <div key={index} className="flex">
                <span className={`font-bold w-16 flex-shrink-0 ${getEventTypeColor(event.type)}`}>
                  [{TimeFormatter.format(event.timestamp)}]
                </span>
                <span className="ml-2 text-gray-800 dark:text-gray-200">{event.message}</span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex space-x-3">
          <ActionButton
            title="Done"
            backgroundColor="bg-gray-200 dark:bg-gray-700"
            foregroundColor="text-gray-800 dark:text-gray-200"
            onClick={onClose}
          />
          <button
            onClick={handleCopy}
            className={`flex-1 flex items-center justify-center space-x-2 h-14 rounded-xl font-semibold shadow-md transition-all duration-300 active:scale-95 ${
              copied 
                ? 'bg-green-600 text-white' 
                : 'bg-blue-600 text-white'
            }`}
          >
            {copied ? <Check size={18} /> : <Clipboard size={18} />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};

const ResetModalView: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => {
  const { performReset } = useArrest();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reset Arrest Log?">
      <div className="flex flex-col items-center text-center space-y-4">
        <RotateCw size={48} className="text-red-500" />
        <p className="text-lg text-gray-700 dark:text-gray-300">
          This will save the current log. This action cannot be undone.
        </p>
        
        <ActionButton
          title="Copy, Save & Reset"
          icon={<Clipboard size={18} />}
          backgroundColor="bg-blue-600"
          foregroundColor="text-white"
          onClick={() => {
            performReset(true, true);
            onClose();
          }}
        />
        <ActionButton
          title="Reset & Save"
          icon={<RotateCw size={18} />}
          backgroundColor="bg-red-600"
          foregroundColor="text-white"
          onClick={() => {
            performReset(true, false);
            onClose();
          }}
        />
        <button
          onClick={onClose}
          className="text-gray-600 dark:text-gray-400 font-medium py-2 px-4 rounded-lg"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
};

const HypothermiaModal: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => {
  const { setHypothermiaStatus } = useArrest();
  
  const onConfirm = (status: HypothermiaStatus) => {
    setHypothermiaStatus(status);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Set Hypothermia Status">
      <div className="flex flex-col space-y-3">
        <p className="text-center text-gray-600 dark:text-gray-400 mb-2">
          Select the patient's temperature range to apply the correct guidelines.
        </p>
        <ActionButton title="Severe (< 30°C)" backgroundColor="bg-blue-600" foregroundColor="text-white" onClick={() => onConfirm(HypothermiaStatus.Severe)} />
        <ActionButton title="Moderate (30-35°C)" backgroundColor="bg-orange-500" foregroundColor="text-white" onClick={() => onConfirm(HypothermiaStatus.Moderate)} />
        <ActionButton title="Clear / Normothermic" backgroundColor="bg-green-600" foregroundColor="text-white" onClick={() => onConfirm(HypothermiaStatus.Normothermic)} />
      </div>
    </Modal>
  );
};

const OtherDrugsModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  onSelectDrug: (drug: DrugToLog) => void;
}> = ({ isOpen, onClose, onSelectDrug }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log Other Medication">
      <div className="flex flex-col space-y-2">
        {AppConstants.otherDrugs.map(drug => (
          <button
            key={drug}
            onClick={() => onSelectDrug({ type: 'other', name: drug })}
            className="w-full text-left p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-white"
          >
            {drug}
          </button>
        ))}
      </div>
    </Modal>
  );
};

const Etco2ModalView: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => {
  const { logEtco2 } = useArrest();
  const [value, setValue] = useState("");
  
  const onConfirm = () => {
    logEtco2(value);
    onClose();
    setValue("");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log ETCO2 Value">
      <div className="flex flex-col space-y-4">
        <p className="text-center text-gray-600 dark:text-gray-400">
          Enter the current end-tidal CO2 reading in mmHg.
        </p>
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g., 35"
          autoFocus
          className="text-center text-2xl font-bold p-3 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <ActionButton
          title="Log Value"
          icon={<Gauge size={18} />}
          backgroundColor="bg-blue-600"
          foregroundColor="text-white"
          onClick={onConfirm}
          disabled={!value || isNaN(Number(value))}
        />
      </div>
    </Modal>
  );
};

// Airway Adjunct Modal (now allows multiple attempts)
const AirwayAdjunctModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
}> = ({ isOpen, onClose }) => {
  const { logAirwayPlaced } = useArrest();
  
  const handleSelect = (type: AirwayAdjunctType) => {
    logAirwayPlaced(type);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Select Airway Adjunct">
      <div className="flex flex-col space-y-4">
        <p className="text-center text-gray-600 dark:text-gray-400">
          Choose the type of advanced airway placed.
        </p>
        <ActionButton title="Supraglottic Airway (i-Gel)" backgroundColor="bg-blue-600" foregroundColor="text-white" onClick={() => handleSelect(AirwayAdjunctType.SGA)} />
        <ActionButton title="Endotracheal Tube" backgroundColor="bg-indigo-600" foregroundColor="text-white" onClick={() => handleSelect(AirwayAdjunctType.ETT)} />
        <ActionButton title="Unspecified" backgroundColor="bg-gray-500" foregroundColor="text-white" onClick={() => handleSelect(AirwayAdjunctType.Unspecified)} />
      </div>
    </Modal>
  );
};

// Dosage Entry Modal (with two-way age sync)
const DosageEntryModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  drug: DrugToLog;
}> = ({ isOpen, onClose, drug }) => {
  const { logAdrenaline, logAmiodarone, logLidocaine, logOtherDrug, setPatientAgeCategory, amiodaroneCount, patientAgeCategory, setPatientAgeStr, patientAgeStr } = useArrest();
  const [age, setAge] = useState<PatientAgeCategory>(patientAgeCategory || PatientAgeCategory.Adult);
  const [manualAmount, setManualAmount] = useState("");
  const [manualUnit, setManualUnit] = useState("mg");

  const onConfirm = (dosage: string, ageVal: PatientAgeCategory | null) => {
    if (ageVal) {
      setPatientAgeCategory(ageVal);
      // Two-way sync: update demographic age from drug calculator
      const ageStr = categoryToAgeString(ageVal);
      if (ageStr && ageStr !== patientAgeStr) {
        setPatientAgeStr(ageStr);
      }
    }
    
    switch (drug.type) {
      case 'adrenaline': logAdrenaline(dosage); break;
      case 'amiodarone': logAmiodarone(dosage); break;
      case 'lidocaine': logLidocaine(dosage); break;
      case 'other': logOtherDrug(drug.name, dosage); break;
    }
    onClose();
    setManualAmount("");
    setManualUnit("mg");
  };

  const calculatedDose = useMemo(() => {
    if (drug.type === 'adrenaline') {
      return DosageCalculator.calculateAdrenalineDose(age);
    }
    if (drug.type === 'amiodarone') {
      return DosageCalculator.calculateAmiodaroneDose(age, amiodaroneCount + 1);
    }
    return null;
  }, [age, drug, amiodaroneCount]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Log ${getDrugLogTitle(drug)}`}>
      <div className="flex flex-col space-y-4">
        {(drug.type === 'adrenaline' || drug.type === 'amiodarone') ? (
          <>
            <div className="space-y-2">
              <h4 className="text-blue-600 dark:text-blue-400 font-semibold text-sm">Patient Age</h4>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="text-gray-800 dark:text-gray-200">Age Category</span>
                  <select
                    value={age}
                    onChange={(e) => setAge(e.target.value as PatientAgeCategory)}
                    className="bg-transparent text-blue-600 dark:text-blue-400 font-medium text-right"
                  >
                    {allPatientAgeCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <h4 className="text-blue-600 dark:text-blue-400 font-semibold text-sm">Calculated Dose</h4>
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                {calculatedDose ? (
                  <div className="space-y-3">
                    <p className="text-center text-3xl font-bold text-gray-900 dark:text-white">{calculatedDose}</p>
                    <ActionButton
                      title="Log Calculated Dose"
                      backgroundColor="bg-blue-600"
                      foregroundColor="text-white"
                      onClick={() => onConfirm(calculatedDose, age)}
                    />
                  </div>
                ) : (
                  <p className="text-center text-gray-500 dark:text-gray-400">N/A for this age group.</p>
                )}
              </div>
            </div>
            
            {/* Manual Override - Redesigned to match iOS */}
            <div className="space-y-2">
              <h4 className="text-gray-500 dark:text-gray-400 font-semibold text-sm">Manual Override</h4>
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl space-y-3">
                <div className="flex items-center space-x-3">
                  <input
                    type="number"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    placeholder="Amount"
                    className="flex-grow p-3 bg-transparent border-b border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none text-center"
                  />
                  <span className="text-gray-500 dark:text-gray-400 font-medium">Unit</span>
                  <select
                    value={manualUnit}
                    onChange={(e) => setManualUnit(e.target.value)}
                    className="bg-transparent text-blue-600 dark:text-blue-400 font-medium"
                  >
                    <option>mg</option>
                    <option>mcg</option>
                    <option>g</option>
                    <option>ml</option>
                  </select>
                </div>
                <ActionButton
                  title="Log Manual Dose"
                  backgroundColor="bg-gray-400 dark:bg-gray-600"
                  foregroundColor="text-white"
                  onClick={() => onConfirm(`${manualAmount}${manualUnit}`, age)}
                  disabled={!manualAmount}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 className="font-semibold text-gray-800 dark:text-gray-200">Manual Override</h4>
            <div className="flex space-x-2">
              <input
                type="number"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder="Amount"
                className="flex-grow p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-md text-gray-900 dark:text-white"
              />
              <select
                value={manualUnit}
                onChange={(e) => setManualUnit(e.target.value)}
                className="p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-md text-gray-900 dark:text-white"
              >
                <option>mg</option>
                <option>mcg</option>
                <option>g</option>
                <option>ml</option>
              </select>
            </div>
            <ActionButton
              title="Log Manual Dose"
              backgroundColor="bg-gray-500"
              foregroundColor="text-white"
              onClick={() => onConfirm(`${manualAmount}${manualUnit}`, null)}
              disabled={!manualAmount}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

//============================================================================
// REUSABLE UI COMPONENTS
//============================================================================

interface ActionButtonProps {
  title: string;
  icon?: React.ReactNode;
  backgroundColor: string;
  foregroundColor: string;
  height?: string;
  fontSize?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  title, icon, backgroundColor, foregroundColor,
  height = "h-14", fontSize = "text-base",
  onClick, disabled = false, className = ""
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center justify-center space-x-2 w-full px-4 rounded-xl 
        font-semibold shadow-md
        transition-all duration-150 ease-in-out
        active:scale-95 active:shadow-inner
        disabled:opacity-40 disabled:cursor-not-allowed
        ${height} ${fontSize} ${backgroundColor} ${foregroundColor} ${className}
      `}
    >
      {icon}
      <span>{title}</span>
    </button>
  );
};

// Header & Timers
const HeaderView: React.FC = () => {
  const { arrestState, masterTime, timeOffset, totalArrestTime, addTimeOffset, cprTime, uiState, isTimerPaused, analyseRhythm } = useArrest();
  
  const isRhythmCheckDue = arrestState === ArrestState.Active && uiState === UIState.Default && cprTime <= 0;
  
  const stateInfo = {
    [ArrestState.Pending]: { text: "PENDING", color: "bg-gray-500" },
    [ArrestState.Active]: { text: "ACTIVE", color: "bg-red-500" },
    [ArrestState.Rosc]: { text: "ROSC", color: "bg-green-500" },
    [ArrestState.Ended]: { text: "DECEASED", color: "bg-black" },
  };

  const handleHeaderTap = () => {
    if (isRhythmCheckDue && !isTimerPaused) {
      analyseRhythm();
    }
  };

  const headerBg = isTimerPaused 
    ? 'bg-orange-100 dark:bg-orange-900/30' 
    : isRhythmCheckDue 
      ? 'bg-red-600' 
      : 'bg-white dark:bg-gray-800';

  return (
    <div 
      className={`p-4 shadow-md transition-colors duration-300 ${headerBg} ${isRhythmCheckDue && !isTimerPaused ? 'cursor-pointer' : ''}`}
      onClick={handleHeaderTap}
    >
      <div className="flex justify-between items-center mb-3">
        <div className="flex flex-col items-start space-y-1">
          {isRhythmCheckDue && !isTimerPaused ? (
            <h1 className="text-2xl font-bold text-white leading-tight">RHYTHM CHECK DUE</h1>
          ) : (
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">eResus</h1>
          )}
          <span
            className={`px-2 py-0.5 rounded-lg text-xs font-black text-white ${
              isTimerPaused 
                ? 'bg-orange-500' 
                : isRhythmCheckDue 
                  ? 'bg-white/30' 
                  : stateInfo[arrestState].color
            }`}
          >
            {isTimerPaused ? 'PAUSED' : stateInfo[arrestState].text}
          </span>
        </div>
        
        <div className="flex flex-col items-end">
          <div className="flex items-baseline">
            {timeOffset > 0 && (
              <span className={`font-mono font-bold text-2xl mr-1 ${
                isRhythmCheckDue && !isTimerPaused ? 'text-white' : 'text-blue-600 dark:text-blue-400'
              }`}>
                {Math.floor(timeOffset / 60)}+
              </span>
            )}
            <span className={`font-mono font-bold text-4xl ${
              isRhythmCheckDue && !isTimerPaused ? 'text-white' : 'text-blue-600 dark:text-blue-400'
            }`}>
              {TimeFormatter.format(masterTime + timeOffset)}
            </span>
          </div>
          {(arrestState === ArrestState.Active || arrestState === ArrestState.Pending) && !isTimerPaused && (
            <div className="flex space-x-1 mt-1">
              <button onClick={(e) => { e.stopPropagation(); addTimeOffset(60); }} className={`px-2 py-0.5 text-xs rounded ${isRhythmCheckDue ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>+1m</button>
              <button onClick={(e) => { e.stopPropagation(); addTimeOffset(300); }} className={`px-2 py-0.5 text-xs rounded ${isRhythmCheckDue ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>+5m</button>
              <button onClick={(e) => { e.stopPropagation(); addTimeOffset(600); }} className={`px-2 py-0.5 text-xs rounded ${isRhythmCheckDue ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}>+10m</button>
            </div>
          )}
        </div>
      </div>
      
      {/* Stats Row */}
      {arrestState !== ArrestState.Pending && (
        <StatsRow />
      )}
    </div>
  );
};

const StatsRow: React.FC = () => {
  const { shockCount, adrenalineCount, amiodaroneCount, lidocaineCount, dynamicLidocaineCount, cprTime, uiState, arrestState, isTimerPaused } = useArrest();
  
  const isRhythmCheckDue = arrestState === ArrestState.Active && uiState === UIState.Default && cprTime <= 0 && !isTimerPaused;
  
  return (
    <div className="flex justify-around">
      <StatItem label="Shocks" value={shockCount} color={`font-bold ${isRhythmCheckDue ? 'text-white' : 'text-orange-500'}`} isDue={isRhythmCheckDue} />
      <StatItem label="Adrenaline" value={adrenalineCount} color={`font-bold ${isRhythmCheckDue ? 'text-white' : 'text-red-500'}`} isDue={isRhythmCheckDue} />
      <StatItem label="Amiodarone" value={amiodaroneCount} color={`font-bold ${isRhythmCheckDue ? 'text-white' : 'text-pink-500'}`} isDue={isRhythmCheckDue} />
      <StatItem label="Lidocaine" value={Math.max(lidocaineCount, dynamicLidocaineCount)} color={`font-bold ${isRhythmCheckDue ? 'text-white' : 'text-purple-500'}`} isDue={isRhythmCheckDue} />
    </div>
  );
};

const StatItem: React.FC<{ label: string; value: number; color: string; isDue?: boolean }> = ({ label, value, color, isDue }) => (
  <div className={`flex flex-col items-center ${color}`}>
    <span className="font-mono font-bold text-lg">{value}</span>
    <span className={`text-[10px] font-semibold uppercase ${isDue ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>{label}</span>
  </div>
);

const CPRTimerView: React.FC = () => {
  const { cprTime } = useArrest();
  const { cprCycleDuration } = useSettings();
  
  const percentage = (cprTime / cprCycleDuration);
  const strokeDasharray = 2 * Math.PI * 52;
  const strokeDashoffset = strokeDasharray * (1 - percentage);
  const isEnding = cprTime <= 10;
  
  return (
    <div className="relative w-56 h-56">
      <svg className="w-full h-full" viewBox="0 0 120 120">
        <circle className="text-gray-200 dark:text-gray-700" strokeWidth="10" stroke="currentColor" fill="transparent" r="52" cx="60" cy="60" />
        <circle
          className={`transition-all duration-1000 linear ${isEnding ? 'text-red-500' : 'text-blue-600'}`}
          strokeWidth="10" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset}
          strokeLinecap="round" stroke="currentColor" fill="transparent" r="52" cx="60" cy="60"
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-mono font-bold text-5xl ${isEnding ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
          {TimeFormatter.format(cprTime)}
        </span>
        <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">CPR Cycle</span>
      </div>
    </div>
  );
};

// Screen State Views
const IosAppStoreBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('eResusAppStoreBannerDismissed') === 'true');
  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  
  if (!isIos || dismissed) return null;
  
  return (
    <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center space-x-3">
      <img src="https://145955222.fs1.hubspotusercontent-eu1.net/hubfs/145955222/eResus.jpg" className="w-12 h-12 rounded-xl flex-shrink-0" alt="eResus" />
      <div className="flex-grow min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">eResus is now on the App Store</p>
        <a href="https://apps.apple.com/gb/app/eresus/id6753123316" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 font-medium">Download for iOS →</a>
      </div>
      <button onClick={() => { localStorage.setItem('eResusAppStoreBannerDismissed', 'true'); setDismissed(true); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0">
        <XSquare size={20} />
      </button>
    </div>
  );
};

const PendingView: React.FC<{ 
  onShowPdf: (pdf: PDFIdentifiable) => void;
  onShowNewborn: () => void;
}> = ({ onShowPdf, onShowNewborn }) => {
  const { startArrest, showRecoveryPrompt, resumeRecoveredSession, discardRecoveredSession, receiveSessionTransfer } = useArrest();
  const [showReceiveTransfer, setShowReceiveTransfer] = useState(false);
  const [receiveCode, setReceiveCode] = useState('');
  const [isReceiving, setIsReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState('');

  const handleReceive = async () => {
    if (receiveCode.length !== 6) return;
    setIsReceiving(true);
    setReceiveError('');
    const result = await receiveSessionTransfer(receiveCode);
    setIsReceiving(false);
    if (result.success) {
      setShowReceiveTransfer(false);
      setReceiveCode('');
    } else {
      setReceiveError(result.error || 'Transfer not found. Check the code and try again.');
    }
  };

  return (
    <div className="p-4 space-y-8">
      {showRecoveryPrompt && (
        <div className="p-4 bg-orange-50 dark:bg-orange-900/30 border-2 border-orange-400 dark:border-orange-600 rounded-xl space-y-3">
          <div className="flex items-center space-x-2">
            <AlertTriangle size={24} className="text-orange-500 flex-shrink-0" />
            <h3 className="font-bold text-gray-900 dark:text-white">Session Recovery</h3>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300">An active arrest session was interrupted. Would you like to resume it?</p>
          <div className="flex space-x-3">
            <ActionButton title="Resume" backgroundColor="bg-green-600" foregroundColor="text-white" height="h-12" onClick={resumeRecoveredSession} />
            <ActionButton title="Save & Close" backgroundColor="bg-gray-500" foregroundColor="text-white" height="h-12" onClick={discardRecoveredSession} />
          </div>
        </div>
      )}
      <IosAppStoreBanner />
      <ActionButton title="Start Arrest" backgroundColor="bg-red-600" foregroundColor="text-white" height="h-20" fontSize="text-2xl" onClick={startArrest} />
      
      <ActionButton title="Newborn Life Support" backgroundColor="bg-purple-600" foregroundColor="text-white" height="h-16" fontSize="text-lg" onClick={onShowNewborn} />
      <AlgorithmGridView onShowPdf={onShowPdf} />
      
      {/* Receive Transfer - subtle pill button */}
      {!showReceiveTransfer ? (
        <div className="flex justify-center pt-2">
          <button 
            onClick={() => setShowReceiveTransfer(true)}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors active:scale-[0.97]"
          >
            <QrCode size={14} />
            Receive Transfer
          </button>
        </div>
      ) : (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-center text-gray-900 dark:text-white">Receive Arrest Transfer</h3>
          <p className="text-sm text-center text-gray-600 dark:text-gray-400">Enter the 6-digit code shown on the sending device:</p>
          <input 
            type="text" 
            value={receiveCode} 
            onChange={(e) => setReceiveCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000" 
            maxLength={6}
            className="w-full text-center text-3xl font-mono font-bold p-4 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl text-gray-900 dark:text-white tracking-[0.5em]" 
          />
          {receiveError && <p className="text-sm text-red-500 text-center">{receiveError}</p>}
          <ActionButton 
            title={isReceiving ? "Receiving..." : "Receive Session"} 
            backgroundColor="bg-green-600" 
            foregroundColor="text-white" 
            onClick={handleReceive} 
            disabled={receiveCode.length !== 6 || isReceiving} 
          />
          <ActionButton 
            title="Cancel" 
            backgroundColor="bg-gray-200 dark:bg-gray-700" 
            foregroundColor="text-gray-700 dark:text-gray-300" 
            onClick={() => { setShowReceiveTransfer(false); setReceiveCode(''); setReceiveError(''); }} 
          />
        </div>
      )}
    </div>
  );
};

const ActiveArrestContentView: React.FC<{ 
  onShowPdf: (pdf: PDFIdentifiable) => void;
  onShowOtherDrugs: () => void;
  onShowEtco2: () => void;
  onShowHypothermia: () => void;
  onShowAirwayAdjunct: () => void;
  onShowVascularAccess: () => void;
  onLogAdrenaline: () => void;
  onLogAmiodarone: () => void;
  onLogLidocaine: () => void;
  onShowTOR: () => void;
}> = (props) => {
  const {
    cprTime, uiState, timeUntilAdrenaline, shouldShowAdrenalinePrompt,
    shouldShowAmiodaroneFirstDosePrompt, shouldShowAmiodaroneReminder,
    events, reversibleCauses, isTimerPaused, setHideAdrenalinePrompt, setHideAmiodaronePrompt
  } = useArrest();
  const { metronomeBPM } = useSettings();
  const [isMetronomeOn, setIsMetronomeOn] = useState(metronomeService.isPlaying);

  const toggleMetronome = async () => {
    const isPlaying = await metronomeService.toggle(metronomeBPM);
    setIsMetronomeOn(isPlaying);
  };
  
  useEffect(() => {
    return () => {
      metronomeService.stop();
      setIsMetronomeOn(false);
    };
  }, []);

  return (
    <div className={`p-4 space-y-6 pb-36 transition-opacity ${isTimerPaused ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="relative flex justify-center">
        <CPRTimerView />
        <button
          onClick={toggleMetronome}
          className={`absolute bottom-4 right-4 w-12 h-12 rounded-full flex items-center justify-center
          shadow-lg transition-colors
          ${isMetronomeOn ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400'}`}
        >
          {isMetronomeOn ? <Volume2 size={24} /> : <VolumeX size={24} />}
        </button>
      </div>

      {timeUntilAdrenaline !== null && timeUntilAdrenaline > 0 && (
        <AdrenalineTimerView timeRemaining={timeUntilAdrenaline} />
      )}
      {timeUntilAdrenaline !== null && timeUntilAdrenaline <= 0 && (
        <AdrenalineDueWarning onClick={props.onLogAdrenaline} />
      )}
      {shouldShowAdrenalinePrompt && <AdrenalinePromptView onClick={props.onLogAdrenaline} onDismiss={() => setHideAdrenalinePrompt(true)} />}
      {shouldShowAmiodaroneFirstDosePrompt && <AmiodaronePromptView onClick={props.onLogAmiodarone} onDismiss={() => setHideAmiodaronePrompt(true)} />}
      {shouldShowAmiodaroneReminder && <AmiodaroneReminderView onClick={props.onLogAmiodarone} onDismiss={() => setHideAmiodaronePrompt(true)} />}

      <ActionGridView {...props} />
      
      <AlgorithmGridView onShowPdf={props.onShowPdf} />
      
      <ChecklistView 
        title="Reversible Causes (4 H's & 4 T's)" 
        items={reversibleCauses} 
        onToggle={useArrest().toggleChecklistItemCompletion}
        onHypothermiaClick={props.onShowHypothermia}
      />
      
      <EventLogView events={events} />
      
      <TransferArrestPill />
    </div>
  );
};

const RoscView: React.FC<{
  onShowPdf: (pdf: PDFIdentifiable) => void;
  onShowOtherDrugs: () => void;
}> = ({ onShowPdf, onShowOtherDrugs }) => {
  const { reArrest, postROSCTasks, toggleChecklistItemCompletion, events } = useArrest();

  return (
    <div className="p-4 space-y-6 pb-36">
      <ActionButton
        title="Patient Re-Arrested"
        icon={<RotateCw size={20} />}
        backgroundColor="bg-orange-500"
        foregroundColor="text-white"
        height="h-16"
        fontSize="text-lg"
        onClick={reArrest}
      />
      <ActionButton
        title="Administer Medication"
        icon={<Syringe size={20} />}
        backgroundColor="bg-gray-600"
        foregroundColor="text-white"
        height="h-16"
        fontSize="text-lg"
        onClick={onShowOtherDrugs}
      />
      
      <ChecklistView 
        title="Post-ROSC Care" 
        items={postROSCTasks} 
        onToggle={toggleChecklistItemCompletion}
      />
      
      <AlgorithmGridView onShowPdf={onShowPdf} />
      <EventLogView events={events} />
      <TransferArrestPill />
    </div>
  );
};

// ============================================================================
// ENDED VIEW — Now includes VOD Checklist + Care After Death + PLIIE
// ============================================================================
const EndedView: React.FC<{
  onShowPdf: (pdf: PDFIdentifiable) => void;
}> = ({ onShowPdf }) => {
  const { postMortemTasks, toggleChecklistItemCompletion, events, vodChecklist, vodConfirmed, confirmVOD, toggleVodChecklistItem } = useArrest();
  const [showPLIIE, setShowPLIIE] = useState(false);
  
  const allVodChecked = vodChecklist.every(item => item.isCompleted);
  
  return (
    <div className="p-4 space-y-6 pb-36">
      {/* Phase 1: VOD Checklist (if not yet confirmed) */}
      {!vodConfirmed && (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Verification of Death (VOD)</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Assess for a minimum of 5 minutes after asystole onset.
          </p>
          
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400">VOD Criteria</h4>
            {vodChecklist.map((item) => {
              // Parse bold markdown-style letters
              const parts = item.name.split(': ');
              const letter = parts[0];
              const description = parts.slice(1).join(': ');
              
              return (
                <button
                  key={item.id}
                  onClick={() => toggleVodChecklistItem(item.id)}
                  className="w-full flex items-start space-x-3 p-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {item.isCompleted ? (
                    <CheckCircle2 size={24} className="text-green-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle size={24} className="text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5" />
                  )}
                  <span className={`text-sm ${item.isCompleted ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
                    <strong>{letter}:</strong> {description}
                  </span>
                </button>
              );
            })}
          </div>
          
          <ActionButton
            title="Confirm VOD"
            icon={<Shield size={18} />}
            backgroundColor={allVodChecked ? "bg-blue-600" : "bg-gray-400 dark:bg-gray-600"}
            foregroundColor="text-white"
            onClick={confirmVOD}
            disabled={!allVodChecked}
          />
        </div>
      )}

      {/* Phase 2: Care After Death (after VOD confirmed) */}
      {vodConfirmed && (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Care After Death</h3>
          
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-700 dark:text-red-300">
              If suspicious or unnatural circumstances are suspected, leave equipment in situ, minimize contamination, and contact the Police.
            </p>
          </div>
          
          <ActionButton
            title="Breaking Bad News (PLIIE)"
            icon={<Users size={18} />}
            backgroundColor="bg-blue-600"
            foregroundColor="text-white"
            onClick={() => setShowPLIIE(true)}
          />

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Actions Following Death</h4>
            {postMortemTasks.map(item => (
              <button
                key={item.id}
                onClick={() => toggleChecklistItemCompletion(item)}
                className="w-full flex items-start space-x-3 p-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {item.isCompleted ? (
                  <CheckCircle2 size={20} className="text-green-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <Circle size={20} className="text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5" />
                )}
                <span className={`text-sm ${item.isCompleted ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
                  {item.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <AlgorithmGridView onShowPdf={onShowPdf} />
      <EventLogView events={events} />
      <TransferArrestPill />
      
      <PLIIEModal isOpen={showPLIIE} onClose={() => setShowPLIIE(false)} />
    </div>
  );
};

// Transfer Arrest Pill
const TransferArrestPill: React.FC = () => {
  const [showTransfer, setShowTransfer] = useState(false);
  return (
    <>
      <button
        onClick={() => setShowTransfer(true)}
        className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-semibold text-sm transition-all active:scale-95"
      >
        <QrCode size={16} />
        <span>Transfer Arrest</span>
      </button>
      <SessionTransferModal isOpen={showTransfer} onClose={() => setShowTransfer(false)} />
    </>
  );
};

// ============================================================================
// ACTION GRID VIEW — Updated with IV/IO, green flash, TOR
// ============================================================================
const ActionGridView: React.FC<{
  onShowOtherDrugs: () => void;
  onShowEtco2: () => void;
  onShowAirwayAdjunct: () => void;
  onShowVascularAccess: () => void;
  onLogAdrenaline: () => void;
  onLogAmiodarone: () => void;
  onLogLidocaine: () => void;
  onShowTOR: () => void;
}> = (props) => {
  const { 
    uiState, analyseRhythm, logRhythm, achieveROSC, deliverShock, 
    isAdrenalineAvailable, isAmiodaroneAvailable, isLidocaineAvailable,
  } = useArrest();
  
  // Green success flash states
  const [airwayFlash, setAirwayFlash] = useState(false);
  const [ivioFlash, setIvioFlash] = useState(false);
  
  const handleAirway = () => {
    props.onShowAirwayAdjunct();
    // Flash will be triggered after modal closes — we track via event count
  };
  
  const handleIVIO = () => {
    props.onShowVascularAccess();
  };
  
  return (
    <div className="space-y-6">
      {/* Rhythm Analysis */}
      {uiState === UIState.Default && (
        <ActionButton
          title="Analyse Rhythm"
          icon={<Activity size={20} />}
          backgroundColor="bg-blue-600"
          foregroundColor="text-white"
          height="h-16"
          fontSize="text-lg"
          onClick={analyseRhythm}
        />
      )}
      {uiState === UIState.Analyzing && (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-3">
          <h3 className="text-center font-semibold text-gray-700 dark:text-gray-300">Select Rhythm</h3>
          <div className="grid grid-cols-2 gap-3">
            <ActionButton title="VF" backgroundColor="bg-orange-500" foregroundColor="text-white" onClick={() => logRhythm("VF", true)} />
            <ActionButton title="VT" backgroundColor="bg-orange-500" foregroundColor="text-white" onClick={() => logRhythm("VT", true)} />
            <ActionButton title="PEA" backgroundColor="bg-gray-500" foregroundColor="text-white" onClick={() => logRhythm("PEA", false)} />
            <ActionButton title="Asystole" backgroundColor="bg-gray-500" foregroundColor="text-white" onClick={() => logRhythm("Asystole", false)} />
          </div>
          <ActionButton
            title="ROSC"
            icon={<Heart size={18} />}
            backgroundColor="bg-green-600"
            foregroundColor="text-white"
            onClick={achieveROSC}
          />
        </div>
      )}
      {uiState === UIState.ShockAdvised && (
        <ActionButton
          title="Deliver Shock"
          icon={<Bolt size={20} />}
          backgroundColor="bg-orange-500"
          foregroundColor="text-white"
          height="h-16"
          fontSize="text-lg"
          onClick={deliverShock}
        />
      )}
      
      {/* Medications */}
      <div className="space-y-3">
        <h3 className="text-center font-semibold text-gray-700 dark:text-gray-300">Medications</h3>
        <div className="grid grid-cols-2 gap-3">
          <ActionButton title="Adrenaline" icon={<Syringe size={16} />} backgroundColor="bg-pink-500" foregroundColor="text-white" height="h-12" fontSize="text-sm" onClick={props.onLogAdrenaline} disabled={!isAdrenalineAvailable} />
          <ActionButton title="Amiodarone" icon={<Syringe size={16} />} backgroundColor="bg-purple-600" foregroundColor="text-white" height="h-12" fontSize="text-sm" onClick={props.onLogAmiodarone} disabled={!isAmiodaroneAvailable} />
          <ActionButton title="Lidocaine" icon={<Syringe size={16} />} backgroundColor="bg-indigo-600" foregroundColor="text-white" height="h-12" fontSize="text-sm" onClick={props.onLogLidocaine} disabled={!isLidocaineAvailable} />
          <ActionButton title="Other Meds..." icon={<Pill size={16} />} backgroundColor="bg-gray-500" foregroundColor="text-white" height="h-12" fontSize="text-sm" onClick={props.onShowOtherDrugs} />
        </div>
      </div>
      
      {/* Procedures */}
      <div className="space-y-3">
        <h3 className="text-center font-semibold text-gray-700 dark:text-gray-300">Procedures</h3>
        <div className="grid grid-cols-2 gap-3">
          <ActionButton title="Adv. Airway" icon={<AirVent size={16} />} backgroundColor="bg-blue-500" foregroundColor="text-white" height="h-12" fontSize="text-sm" onClick={handleAirway} />
          <ActionButton title="Log ETCO2" icon={<Gauge size={16} />} backgroundColor="bg-teal-500" foregroundColor="text-white" height="h-12" fontSize="text-sm" onClick={props.onShowEtco2} />
        </div>
        {/* Full-width IV/IO button */}
        <ActionButton 
          title="Log IV / IO" 
          icon={<Droplet size={16} />} 
          backgroundColor="bg-fuchsia-600" 
          foregroundColor="text-white" 
          height="h-12" 
          fontSize="text-sm" 
          onClick={handleIVIO} 
        />
      </div>
      
      {/* Patient Status */}
      <div className="space-y-3">
        <h3 className="text-center font-semibold text-gray-700 dark:text-gray-300">Patient Status</h3>
        <div className="grid grid-cols-2 gap-3">
          <ActionButton title="ROSC" icon={<HeartPulse size={16} />} backgroundColor="bg-green-600" foregroundColor="text-white" height="h-12" fontSize="text-sm" onClick={achieveROSC} />
          <ActionButton title="TOR" icon={<XSquare size={16} />} backgroundColor="bg-red-600" foregroundColor="text-white" height="h-12" fontSize="text-sm" onClick={props.onShowTOR} />
        </div>
      </div>
    </div>
  );
};

const AdrenalineTimerView: React.FC<{ timeRemaining: number }> = ({ timeRemaining }) => (
  <div className="flex items-center justify-center space-x-2 p-3 rounded-2xl bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold">
    <Timer size={20} />
    <span>Adrenaline due in: {TimeFormatter.format(timeRemaining)}</span>
  </div>
);

const AdrenalineDueWarning: React.FC<{ onClick?: () => void }> = ({ onClick }) => (
  <button onClick={onClick} className="flex items-center justify-center space-x-2 p-3 rounded-2xl bg-red-600 text-white font-bold animate-pulse w-full cursor-pointer active:scale-95 transition-transform">
    <AlertTriangle size={20} />
    <span>Adrenaline Due — Tap to Log</span>
  </button>
);

const AmiodaroneReminderView: React.FC<{ onClick?: () => void; onDismiss?: () => void }> = ({ onClick, onDismiss }) => (
  <div className="relative">
    <button onClick={onClick} className="flex items-center justify-center space-x-2 p-3 rounded-2xl bg-purple-600 text-white font-bold animate-pulse w-full cursor-pointer active:scale-95 transition-transform">
      <Syringe size={20} />
      <span>Consider 2nd Amiodarone — Tap to Log</span>
    </button>
    {onDismiss && <button onClick={(e) => { e.stopPropagation(); onDismiss(); }} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-800 text-white flex items-center justify-center text-xs">✕</button>}
  </div>
);

const AdrenalinePromptView: React.FC<{ onClick?: () => void; onDismiss?: () => void }> = ({ onClick, onDismiss }) => (
  <div className="relative">
    <button onClick={onClick} className="flex items-center justify-center space-x-2 p-3 rounded-2xl bg-pink-500 text-white font-bold animate-pulse w-full cursor-pointer active:scale-95 transition-transform">
      <Syringe size={20} />
      <span>Consider Adrenaline — Tap to Log</span>
    </button>
    {onDismiss && <button onClick={(e) => { e.stopPropagation(); onDismiss(); }} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-800 text-white flex items-center justify-center text-xs">✕</button>}
  </div>
);

const AmiodaronePromptView: React.FC<{ onClick?: () => void; onDismiss?: () => void }> = ({ onClick, onDismiss }) => (
  <div className="relative">
    <button onClick={onClick} className="flex items-center justify-center space-x-2 p-3 rounded-2xl bg-purple-500 text-white font-bold animate-pulse w-full cursor-pointer active:scale-95 transition-transform">
      <Syringe size={20} />
      <span>Consider Amiodarone — Tap to Log</span>
    </button>
    {onDismiss && <button onClick={(e) => { e.stopPropagation(); onDismiss(); }} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-800 text-white flex items-center justify-center text-xs">✕</button>}
  </div>
);

const ChecklistView: React.FC<{
  title: string;
  items: ChecklistItem[];
  onToggle: (item: ChecklistItem) => void;
  onHypothermiaClick?: () => void;
}> = ({ title, items, onToggle, onHypothermiaClick }) => (
  <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-3">
    <h3 className="text-center font-semibold text-gray-700 dark:text-gray-300">{title}</h3>
    {items.map(item => (
      <button
        key={item.id}
        onClick={() => {
          if (item.name === "Hypothermia" && onHypothermiaClick) {
            onHypothermiaClick();
          } else {
            onToggle(item);
          }
        }}
        className="w-full flex items-center space-x-3 p-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        {item.isCompleted ? (
          <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />
        ) : (
          <Circle size={20} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
        )}
        <span className={`text-sm ${item.isCompleted ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
          {item.name}
          {item.name === "Hypothermia" && item.hypothermiaStatus !== HypothermiaStatus.None && (
            <span className="ml-2 text-xs text-blue-500">[{item.hypothermiaStatus}]</span>
          )}
        </span>
        {item.name === "Hypothermia" && <ChevronRight size={16} className="text-gray-400 ml-auto" />}
      </button>
    ))}
  </div>
);

const EventLogView: React.FC<{ events: Event[] }> = ({ events }) => {
  const sortedEvents = useMemo(() => 
    [...events].sort((a, b) => a.timestamp - b.timestamp), 
    [events]
  );
  
  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-2">
      <h3 className="font-semibold text-gray-700 dark:text-gray-300">Event Log</h3>
      <div className="space-y-2 max-h-60 overflow-y-auto font-mono text-sm">
        {sortedEvents.map((event, index) => (
          <div key={index} className="flex">
            <span className={`font-bold w-16 flex-shrink-0 ${getEventTypeColor(event.type)}`}>
              [{TimeFormatter.format(event.timestamp)}]
            </span>
            <span className="ml-2 text-gray-800 dark:text-gray-200">{event.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const AlgorithmGridView: React.FC<{ onShowPdf: (pdf: PDFIdentifiable) => void }> = ({ onShowPdf }) => (
  <div className="space-y-3">
    <h3 className="text-center font-semibold text-gray-700 dark:text-gray-300">Resuscitation Council UK</h3>
    <div className="grid grid-cols-2 gap-3">
      {AppConstants.pdfAlgorithms.map(pdf => (
        <button
          key={pdf.id}
          onClick={() => onShowPdf(pdf)}
          className="p-4 text-center font-semibold text-sm
           bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-2xl
           hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors active:scale-95"
        >
          {pdf.title}
        </button>
      ))}
    </div>
  </div>
);

const BottomControlsView: React.FC<{
  onShowSummary: () => void;
  onShowReset: () => void;
}> = ({ onShowSummary, onShowReset }) => {
  const { undo, canUndo, isTimerPaused, pauseArrest, resumeArrest } = useArrest();
  
  return (
    <div className="fixed bottom-0 left-0 right-0 p-3 pb-[72px] bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 z-10">
      <div className="flex space-x-3">
        {isTimerPaused ? (
          <>
            <ActionButton title="Resume" icon={<Heart size={18} />} backgroundColor="bg-green-600" foregroundColor="text-white" height="h-12" onClick={resumeArrest} />
            <ActionButton title="Summary" backgroundColor="bg-blue-600" foregroundColor="text-white" height="h-12" onClick={onShowSummary} />
            <ActionButton title="Reset" icon={<RotateCw size={18} />} backgroundColor="bg-red-600" foregroundColor="text-white" height="h-12" onClick={onShowReset} />
          </>
        ) : (
          <>
            <ActionButton title="Undo" icon={<Undo size={18} />} backgroundColor="bg-gray-200 dark:bg-gray-700" foregroundColor="text-gray-800 dark:text-gray-200" height="h-12" onClick={undo} disabled={!canUndo} />
            <ActionButton title="Summary" backgroundColor="bg-blue-600" foregroundColor="text-white" height="h-12" onClick={onShowSummary} />
            <ActionButton title="Stop" icon={<Square size={18} />} backgroundColor="bg-red-600" foregroundColor="text-white" height="h-12" onClick={pauseArrest} />
          </>
        )}
      </div>
    </div>
  );
};

// Helper for event log colors
const getEventTypeColor = (type: EventType): string => {
  switch (type) {
    case EventType.Status: return "text-green-500";
    case EventType.Cpr: return "text-cyan-500";
    case EventType.Shock: return "text-orange-500";
    case EventType.Analysis: return "text-blue-500";
    case EventType.Rhythm: return "text-purple-500";
    case EventType.Drug: return "text-pink-500";
    case EventType.Airway: return "text-teal-500";
    case EventType.Etco2: return "text-indigo-500";
    case EventType.Cause: return "text-gray-500";
    case EventType.VascularAccess: return "text-fuchsia-500";
    default: return "text-gray-800 dark:text-gray-200";
  }
};

//============================================================================
// MAIN VIEWS
//============================================================================

// ArrestView
const ArrestView: React.FC<{
  onShowPdf: (pdf: PDFIdentifiable) => void;
  onShowNewborn: () => void;
}> = ({ onShowPdf, onShowNewborn }) => {
  const viewModel = useArrest();
  const { showDosagePrompts } = useSettings();
  
  const [showOtherDrugsModal, setShowOtherDrugsModal] = useState(false);
  const [showEtco2Modal, setShowEtco2Modal] = useState(false);
  const [showHypothermiaModal, setShowHypothermiaModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showAirwayAdjunctModal, setShowAirwayAdjunctModal] = useState(false);
  const [showVascularAccessModal, setShowVascularAccessModal] = useState(false);
  const [showTORModal, setShowTORModal] = useState(false);
  const [drugToLog, setDrugToLog] = useState<DrugToLog | null>(null);
  const [drugConfirmation, setDrugConfirmation] = useState<{ drug: DrugToLog, dose: string } | null>(null);

  const handleLogDrug = (drug: DrugToLog) => {
    if (showDosagePrompts) {
      if (viewModel.patientAgeCategory && (drug.type === 'adrenaline' || drug.type === 'amiodarone')) {
        let dose: string | null = null;
        if (drug.type === 'adrenaline') {
          dose = DosageCalculator.calculateAdrenalineDose(viewModel.patientAgeCategory);
        } else {
          dose = DosageCalculator.calculateAmiodaroneDose(viewModel.patientAgeCategory, viewModel.amiodaroneCount + 1);
        }
        
        if (dose) {
          setDrugConfirmation({ drug, dose });
          return;
        }
      }
      setDrugToLog(drug);
    } else {
      switch (drug.type) {
        case 'adrenaline': viewModel.logAdrenaline(); break;
        case 'amiodarone': viewModel.logAmiodarone(); break;
        case 'lidocaine': viewModel.logLidocaine(); break;
        case 'other': viewModel.logOtherDrug(drug.name); break;
      }
    }
  };

  const handleConfirmDrug = (confirmed: boolean) => {
    if (drugConfirmation && confirmed) {
      switch (drugConfirmation.drug.type) {
        case 'adrenaline': viewModel.logAdrenaline(drugConfirmation.dose); break;
        case 'amiodarone': viewModel.logAmiodarone(drugConfirmation.dose); break;
      }
    } else if (drugConfirmation) {
      setDrugToLog(drugConfirmation.drug);
    }
    setDrugConfirmation(null);
  };
  
  const handleSelectOtherDrug = (drug: DrugToLog) => {
    setShowOtherDrugsModal(false);
    handleLogDrug(drug);
  };

  return (
    <div className="flex flex-col h-full">
      <HeaderView />
      
      <div className="flex-grow overflow-y-auto bg-gray-100 dark:bg-gray-900">
        {viewModel.arrestState === ArrestState.Pending && <PendingView onShowPdf={onShowPdf} onShowNewborn={onShowNewborn} />}
        {viewModel.arrestState === ArrestState.Active && (
          <ActiveArrestContentView
            onShowPdf={onShowPdf}
            onShowOtherDrugs={() => setShowOtherDrugsModal(true)}
            onShowEtco2={() => setShowEtco2Modal(true)}
            onShowHypothermia={() => setShowHypothermiaModal(true)}
            onShowAirwayAdjunct={() => setShowAirwayAdjunctModal(true)}
            onShowVascularAccess={() => setShowVascularAccessModal(true)}
            onLogAdrenaline={() => handleLogDrug({ type: 'adrenaline' })}
            onLogAmiodarone={() => handleLogDrug({ type: 'amiodarone' })}
            onLogLidocaine={() => handleLogDrug({ type: 'lidocaine' })}
            onShowTOR={() => setShowTORModal(true)}
          />
        )}
        {viewModel.arrestState === ArrestState.Rosc && (
          <RoscView 
            onShowPdf={onShowPdf}
            onShowOtherDrugs={() => setShowOtherDrugsModal(true)}
          />
        )}
        {viewModel.arrestState === ArrestState.Ended && <EndedView onShowPdf={onShowPdf} />}
      </div>
      
      {viewModel.arrestState !== ArrestState.Pending && (
        <BottomControlsView 
          onShowSummary={() => setShowSummaryModal(true)}
          onShowReset={() => setShowResetModal(true)}
        />
      )}
      
      {/* Modals */}
      <SummaryView isOpen={showSummaryModal} onClose={() => setShowSummaryModal(false)} />
      <ResetModalView isOpen={showResetModal} onClose={() => setShowResetModal(false)} />
      <HypothermiaModal isOpen={showHypothermiaModal} onClose={() => setShowHypothermiaModal(false)} />
      <Etco2ModalView isOpen={showEtco2Modal} onClose={() => setShowEtco2Modal(false)} />
      <AirwayAdjunctModal isOpen={showAirwayAdjunctModal} onClose={() => setShowAirwayAdjunctModal(false)} />
      <VascularAccessModal isOpen={showVascularAccessModal} onClose={() => setShowVascularAccessModal(false)} />
      <TORGuidanceModal isOpen={showTORModal} onClose={() => setShowTORModal(false)} onConfirmTOR={viewModel.confirmTOR} />
      <OtherDrugsModal 
        isOpen={showOtherDrugsModal} 
        onClose={() => setShowOtherDrugsModal(false)} 
        onSelectDrug={handleSelectOtherDrug}
      />
      {drugToLog && (
        <DosageEntryModal 
          isOpen={!!drugToLog}
          onClose={() => setDrugToLog(null)}
          drug={drugToLog}
        />
      )}
      
      {/* Drug Confirmation Alert */}
      {drugConfirmation && (
        <Modal isOpen={!!drugConfirmation} onClose={() => setDrugConfirmation(null)} title="Confirm Dosage">
          <div className="text-center space-y-4">
            <p className="text-lg text-gray-800 dark:text-gray-200">
              Confirm <span className="font-bold">{drugConfirmation.dose}</span> {getDrugLogTitle(drugConfirmation.drug)} given?
            </p>
            <div className="flex space-x-3">
              <ActionButton title="Cancel" backgroundColor="bg-gray-200 dark:bg-gray-700" foregroundColor="text-gray-800 dark:text-gray-200" onClick={() => handleConfirmDrug(false)} />
              <ActionButton title="Change" backgroundColor="bg-orange-500" foregroundColor="text-white" onClick={() => handleConfirmDrug(false)} />
              <ActionButton title="Confirm" backgroundColor="bg-blue-600" foregroundColor="text-white" onClick={() => handleConfirmDrug(true)} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// LogbookView
const LogbookView: React.FC = () => {
  const { db, userId } = useFirebase();
  const { askForPatientInfo, researchModeEnabled } = useSettings();
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [selectedLogEvents, setSelectedLogEvents] = useState<Event[]>([]);
  const [editingLog, setEditingLog] = useState<any | null>(null);
  const [longPressLog, setLongPressLog] = useState<string | null>(null);
  
  useEffect(() => {
    const logsCollectionPath = `/artifacts/${appId}/users/${userId}/logs`;
    const q = query(collection(db, logsCollectionPath), where("userId", "==", userId));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedLogs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      fetchedLogs.sort((a: any, b: any) => b.startTime.toMillis() - a.startTime.toMillis());
      setLogs(fetchedLogs);
    }, (error) => {
      console.error("Error fetching logs: ", error);
    });
    
    return () => unsubscribe();
  }, [db, userId]);

  const openLog = async (log: any) => {
    if (!log.id) return;
    setSelectedLog(log);
    try {
      const eventsCollectionPath = `/artifacts/${appId}/users/${userId}/logs/${log.id}/events`;
      const eventsSnapshot = await getDocs(collection(db, eventsCollectionPath));
      const fetchedEvents: Event[] = eventsSnapshot.docs.map(d => d.data() as Event);
      fetchedEvents.sort((a, b) => a.timestamp - b.timestamp);
      setSelectedLogEvents(fetchedEvents);
    } catch (e) {
      console.error("Error fetching log events: ", e);
      setSelectedLogEvents([]);
    }
  };

  const deleteLog = async (logId: string) => {
    if (window.confirm("Are you sure you want to delete this log?")) {
      try {
        const logDocPath = `/artifacts/${appId}/users/${userId}/logs/${logId}`;
        await deleteDoc(doc(db, logDocPath));
      } catch (e) {
        console.error("Error deleting log: ", e);
      }
    }
  };

  const hasPatientInfo = (log: any) => !!(log.patientAge && log.patientAge !== 'Unknown') || !!(log.patientGender && log.patientGender !== 'Unknown');

  const getPatientInfoText = (log: any) => {
    const parts: string[] = [];
    if (log.patientAge && log.patientAge !== 'Unknown') parts.push(`${log.patientAge} y/o`);
    if (log.patientGender && log.patientGender !== 'Unknown') parts.push(log.patientGender);
    return parts.join(' ');
  };

  // Dynamic lidocaine count from events
  const getDynamicLidocaineCount = (logEvents: Event[]): number => {
    return logEvents.filter(e => e.message.toLowerCase().includes('lidocaine') && e.message.toLowerCase().includes('given')).length;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 bg-white dark:bg-gray-800 shadow-md">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Logbook</h1>
      </div>
      
      <div className="flex-grow overflow-y-auto bg-gray-100 dark:bg-gray-900 p-4 space-y-3">
        {logs.length === 0 && (
          <p className="text-center text-gray-500 dark:text-gray-400 pt-10">No saved logs.</p>
        )}
        {logs.map((log: any) => (
          <div 
            key={log.id} 
            className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow relative"
            onContextMenu={(e) => { e.preventDefault(); setLongPressLog(longPressLog === log.id ? null : log.id); }}
          >
            <div className="flex justify-between items-start">
              <div onClick={() => openLog(log)} className="flex-grow text-left cursor-pointer">
                <h3 className="font-semibold text-gray-900 dark:text-white">{log.startTime.toDate().toLocaleDateString()}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {log.startTime.toDate().toLocaleTimeString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Duration: {TimeFormatter.format(log.totalDuration)} | Outcome: {log.finalOutcome}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  Shocks: {log.shockCount ?? 0} | Adr: {log.adrenalineCount ?? 0} | Amio: {log.amiodaroneCount ?? 0} | Lido: {log.lidocaineCount ?? 0}
                </p>
                {hasPatientInfo(log) ? (
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-1">{getPatientInfoText(log)}</p>
                ) : (
                  <span
                    onClick={(e) => { e.stopPropagation(); setEditingLog(log); }}
                    className="inline-block mt-2 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-full cursor-pointer"
                  >
                    + Add Patient Info
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end space-y-1 flex-shrink-0 ml-2">
                <button onClick={() => setEditingLog(log)} className="p-1.5 text-gray-400 hover:text-blue-500">
                  <Pencil size={16} />
                </button>
                <button onClick={() => log.id && deleteLog(log.id)} className="p-1.5 text-gray-400 hover:text-red-500">
                  <XSquare size={16} />
                </button>
              </div>
            </div>
            
            {longPressLog === log.id && (
              <div className="absolute top-full left-4 right-4 mt-1 bg-white dark:bg-gray-700 rounded-lg shadow-xl z-10 border border-gray-200 dark:border-gray-600 overflow-hidden">
                <button onClick={() => { setEditingLog(log); setLongPressLog(null); }}
                  className="w-full text-left px-4 py-3 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center space-x-2">
                  <Pencil size={14} /> <span>Edit Patient Info</span>
                </button>
                <button onClick={() => { openLog(log); setLongPressLog(null); }}
                  className="w-full text-left px-4 py-3 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center space-x-2">
                  <FileText size={14} /> <span>View Summary</span>
                </button>
                <button onClick={() => { log.id && deleteLog(log.id); setLongPressLog(null); }}
                  className="w-full text-left px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-2">
                  <XSquare size={14} /> <span>Delete</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* Log Detail Modal */}
      {selectedLog && (
        <Modal 
          isOpen={!!selectedLog} 
          onClose={() => setSelectedLog(null)} 
          title="Log Summary"
        >
          <div className="flex flex-col space-y-4">
            {/* Date and demographics */}
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {selectedLog.startTime.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </h3>
              {hasPatientInfo(selectedLog) && (
                <p className="text-blue-600 dark:text-blue-400 font-semibold flex items-center space-x-2">
                  <UserIcon size={14} />
                  <span>{getPatientInfoText(selectedLog)}</span>
                </p>
              )}
            </div>

            <div className="space-y-1 text-sm">
              <p className="text-gray-700 dark:text-gray-300">
                Start Time: {selectedLog.startTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
              {selectedLog.roscTime != null && (
                <p className="text-green-600 dark:text-green-400 font-semibold">ROSC achieved</p>
              )}
              {selectedLog.torTime != null && (
                <p className="text-red-500 font-semibold">TOR at {selectedLog.startTime ? new Date(selectedLog.startTime.toDate().getTime() + selectedLog.torTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : TimeFormatter.format(selectedLog.torTime)}</p>
              )}
              {selectedLog.vodTime != null && (
                <p className="text-red-500 font-semibold">VOD at {selectedLog.startTime ? new Date(selectedLog.startTime.toDate().getTime() + selectedLog.vodTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : TimeFormatter.format(selectedLog.vodTime)}</p>
              )}
              <p className="text-gray-700 dark:text-gray-300">
                Total Duration: {TimeFormatter.format(selectedLog.totalDuration)}
              </p>
            </div>

            {/* Critical Interventions */}
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-1 text-sm">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Critical Interventions</h4>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Initial Rhythm:</span>
                <span className="font-bold text-gray-900 dark:text-white">{selectedLog.initialRhythm || 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">First IV / IO:</span>
                <span className="font-bold text-gray-900 dark:text-white">{extractFirstEventTime(selectedLogEvents, ['vascular access'], selectedLog.startTime?.toDate()) || 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">First Airway:</span>
                <span className="font-bold text-gray-900 dark:text-white">{extractFirstEventTime(selectedLogEvents, ['advanced airway'], selectedLog.startTime?.toDate()) || 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Last Adrenaline:</span>
                <span className="font-bold text-gray-900 dark:text-white">{extractLastEventTime(selectedLogEvents, ['adrenaline'], selectedLog.startTime?.toDate()) || 'None'}</span>
              </div>
            </div>
            
            {/* Stats */}
            <div className="flex justify-around py-2">
              <div className="text-center"><span className="text-lg font-bold text-gray-900 dark:text-white">{selectedLog.shockCount ?? 0}</span><p className="text-xs text-gray-500">Shocks</p></div>
              <div className="text-center"><span className="text-lg font-bold text-gray-900 dark:text-white">{selectedLog.adrenalineCount ?? 0}</span><p className="text-xs text-gray-500">Adrenaline</p></div>
              <div className="text-center"><span className="text-lg font-bold text-gray-900 dark:text-white">{selectedLog.amiodaroneCount ?? 0}</span><p className="text-xs text-gray-500">Amiodarone</p></div>
              <div className="text-center"><span className="text-lg font-bold text-gray-900 dark:text-white">{Math.max(selectedLog.lidocaineCount ?? 0, getDynamicLidocaineCount(selectedLogEvents))}</span><p className="text-xs text-gray-500">Lidocaine</p></div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-700 rounded-lg font-mono text-sm">
              {selectedLogEvents.map((event, index) => (
                <div key={index} className="flex">
                  <span className={`font-bold w-16 flex-shrink-0 ${getEventTypeColor(event.type)}`}>
                    [{TimeFormatter.format(event.timestamp)}]
                  </span>
                  <span className="ml-2 text-gray-800 dark:text-gray-200">{event.message}</span>
                </div>
              ))}
            </div>
            
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  const startText = selectedLog.startTime ? selectedLog.startTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unknown';
                  const dateText = selectedLog.startTime ? selectedLog.startTime.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Unknown';
                  const patientInfo = hasPatientInfo(selectedLog) ? getPatientInfoText(selectedLog) : '';
                  const evtsSorted = selectedLogEvents.sort((a, b) => a.timestamp - b.timestamp);
                  const text = `eResus — Arrest Summary\nDate: ${dateText}\n${patientInfo ? `Patient: ${patientInfo}\n` : ''}Start Time: ${startText}\nInitial Rhythm: ${selectedLog.initialRhythm || 'None'}\n${selectedLog.torTime != null ? `TOR: ${selectedLog.startTime ? new Date(selectedLog.startTime.toDate().getTime() + selectedLog.torTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : TimeFormatter.format(selectedLog.torTime)}\n` : ''}${selectedLog.vodTime != null ? `VOD: ${selectedLog.startTime ? new Date(selectedLog.startTime.toDate().getTime() + selectedLog.vodTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : TimeFormatter.format(selectedLog.vodTime)}\n` : ''}Total Duration: ${TimeFormatter.format(selectedLog.totalDuration)}\n\nShocks: ${selectedLog.shockCount ?? 0}  |  Adrenaline: ${selectedLog.adrenalineCount ?? 0}  |  Amiodarone: ${selectedLog.amiodaroneCount ?? 0}  |  Lidocaine: ${Math.max(selectedLog.lidocaineCount ?? 0, getDynamicLidocaineCount(selectedLogEvents))}\n\n--- Event Log ---\n${evtsSorted.map(e => `[${TimeFormatter.format(e.timestamp)}] ${e.message}`).join('\n')}`;
                  navigator.clipboard.writeText(text.trim()).catch(console.error);
                  if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
                }}
                className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-bold flex items-center justify-center space-x-2 active:scale-95 transition-transform"
              >
                <Clipboard size={18} />
                <span>Copy</span>
              </button>
              <div className="flex-1"><ActionButton title="Close" backgroundColor="bg-blue-600" foregroundColor="text-white" onClick={() => setSelectedLog(null)} /></div>
            </div>
          </div>
        </Modal>
      )}
      
      {editingLog && (
        <EditLogPatientInfoModal
          isOpen={!!editingLog}
          onClose={() => setEditingLog(null)}
          logId={editingLog.id}
          currentAge={editingLog.patientAge}
          currentGender={editingLog.patientGender}
          currentRhythm={editingLog.initialRhythm}
        />
      )}
    </div>
  );
};

// AuthView
const AuthView: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { auth, user, isAnonymous, db, userId } = useFirebase();
  const settings = useSettings();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email);
        setResetSent(true);
      } else if (mode === 'register') {
        if (user && user.isAnonymous) {
          const credential = EmailAuthProvider.credential(email, password);
          await linkWithCredential(user, credential);
        } else {
          await createUserWithEmailAndPassword(auth, email, password);
        }
        onClose();
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        onClose();
      }
    } catch (e: any) {
      setError(e.message || 'An error occurred');
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Google sign-in failed');
    }
    setLoading(false);
  };

  const handleAppleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithPopup(auth, appleProvider);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Apple sign-in failed');
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Sign out failed');
    }
  };

  if (user && !isAnonymous) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Account">
        <div className="space-y-4 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
            <UserIcon size={32} className="text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-gray-700 dark:text-gray-300">Signed in as</p>
          <p className="font-semibold text-gray-900 dark:text-white">{user.email || user.displayName || 'Connected Account'}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Your arrest logs are synced across all your signed-in devices.</p>
          <ActionButton title="Sign Out" backgroundColor="bg-red-600" foregroundColor="text-white" onClick={handleSignOut} />
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === 'reset' ? 'Reset Password' : mode === 'register' ? 'Create Account' : 'Sign In'}>
      <div className="space-y-4">
        {mode === 'reset' && resetSent ? (
          <div className="text-center space-y-3">
            <CheckCircle2 size={48} className="text-green-500 mx-auto" />
            <p className="text-gray-700 dark:text-gray-300">Password reset email sent to <strong>{email}</strong>.</p>
            <ActionButton title="Back to Sign In" backgroundColor="bg-blue-600" foregroundColor="text-white" onClick={() => { setMode('login'); setResetSent(false); }} />
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              {mode === 'reset' 
                ? 'Enter your email to receive a password reset link.'
                : 'Sign in to sync your arrest logs across devices.'}
            </p>
            
            {mode !== 'reset' && (
              <div className="space-y-2">
                <button onClick={handleGoogleSignIn} disabled={loading}
                  className="w-full flex items-center justify-center space-x-3 py-3 px-4 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl font-medium text-gray-800 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 active:scale-95 transition-all disabled:opacity-50">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>Continue with Google</span>
                </button>
                <button onClick={handleAppleSignIn} disabled={loading}
                  className="w-full flex items-center justify-center space-x-3 py-3 px-4 bg-black text-white rounded-xl font-medium hover:bg-gray-900 active:scale-95 transition-all disabled:opacity-50">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  <span>Continue with Apple</span>
                </button>
                
                <div className="flex items-center space-x-3 py-2">
                  <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">or</span>
                  <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600" />
                </div>
              </div>
            )}
            
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address"
              className="w-full p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white" />
            {mode !== 'reset' && (
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white" />
            )}
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <ActionButton
              title={loading ? 'Please wait...' : mode === 'reset' ? 'Send Reset Link' : mode === 'register' ? 'Create Account' : 'Sign In with Email'}
              backgroundColor="bg-blue-600" foregroundColor="text-white" onClick={handleSubmit} disabled={loading}
            />
            {mode === 'login' && (
              <>
                <button onClick={() => { setMode('register'); setError(''); }} className="w-full text-center text-sm text-blue-600 dark:text-blue-400">Don't have an account? Create one</button>
                <button onClick={() => { setMode('reset'); setError(''); }} className="w-full text-center text-sm text-gray-500 dark:text-gray-400">Forgot password?</button>
              </>
            )}
            {mode === 'register' && (
              <button onClick={() => { setMode('login'); setError(''); }} className="w-full text-center text-sm text-blue-600 dark:text-blue-400">Already have an account? Sign in</button>
            )}
            {mode === 'reset' && (
              <button onClick={() => { setMode('login'); setError(''); setResetSent(false); }} className="w-full text-center text-sm text-blue-600 dark:text-blue-400">Back to Sign In</button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

// SettingsView
const SettingsView: React.FC = () => {
  const {
    cprCycleDuration, setCprCycleDuration,
    adrenalineInterval, setAdrenalineInterval,
    metronomeBPM, setMetronomeBPM,
    appearanceMode, setAppearanceMode,
    showDosagePrompts, setShowDosagePrompts,
    researchModeEnabled, setResearchModeEnabled,
    askForPatientInfo, setAskForPatientInfo,
    userOrganization, setUserOrganization,
  } = useSettings();
  const { user, isAnonymous, db } = useFirebase();
  
  const [availableOrgs, setAvailableOrgs] = useState<string[]>(['Independent / None']);
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'organizations'), (snapshot) => {
      const orgs = snapshot.docs.map(d => d.data().name as string).filter(Boolean).sort();
      setAvailableOrgs(['Independent / None', ...orgs]);
    }, (err) => {
      console.error("Error listening to organizations:", err);
    });
    return () => unsubscribe();
  }, [db]);

  const appearanceOptions = [
    { value: AppearanceMode.System, label: "System", icon: <Laptop size={20} /> },
    { value: AppearanceMode.Light, label: "Light", icon: <Sun size={20} /> },
    { value: AppearanceMode.Dark, label: "Dark", icon: <Moon size={20} /> },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 bg-white dark:bg-gray-800 shadow-md">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
      </div>
      
      <div className="flex-grow overflow-y-auto bg-gray-100 dark:bg-gray-900 p-4 space-y-6">
        {/* Account */}
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 flex items-center space-x-2">
            <UserIcon size={18} />
            <span>Account</span>
          </h3>
          {user && !isAnonymous ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-900 dark:text-white font-medium">{user.email}</p>
                <p className="text-xs text-green-600 dark:text-green-400">Signed in</p>
              </div>
              <button onClick={() => setShowAuthModal(true)} className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                Manage
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">Anonymous</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Sign in to sync logs across devices</p>
              </div>
              <button onClick={() => setShowAuthModal(true)} className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg active:scale-95 transition-transform">
                Sign In
              </button>
            </div>
          )}
        </div>
        
        {/* Timers */}
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300">Timers</h3>
          <SettingStepper label="CPR Cycle" value={cprCycleDuration} onChange={setCprCycleDuration} min={60} max={300} step={10} unit="seconds" />
          <SettingStepper label="Adrenaline Interval" value={adrenalineInterval / 60} onChange={(val) => setAdrenalineInterval(val * 60)} min={2} max={10} step={1} unit="minutes" />
        </div>
        
        {/* Metronome */}
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300">Metronome</h3>
          <SettingStepper label="BPM" value={metronomeBPM} onChange={setMetronomeBPM} min={80} max={140} step={5} unit="BPM" />
        </div>
        
        {/* Medications */}
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300">Medications</h3>
          <SettingToggle label="Show Dosage Prompts" enabled={showDosagePrompts} onChange={setShowDosagePrompts}
            description="When enabled, the app will ask for patient age or a manual dose when you log Adrenaline, Amiodarone, or other drugs." />
        </div>
        
        {/* Research & Data */}
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 flex items-center space-x-2">
            <BarChart3 size={18} />
            <span>Research & Data</span>
          </h3>
          <SettingToggle label="Research Mode" enabled={researchModeEnabled} onChange={setResearchModeEnabled}
            description="When enabled, anonymised arrest data is uploaded to help improve cardiac arrest outcomes research." />
          {researchModeEnabled ? (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-gray-800 dark:text-gray-200">Ask for Patient Info</span>
                <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">Required</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Mandatory when Research Mode is enabled.</p>
            </div>
          ) : (
            <SettingToggle label="Ask for Patient Info" enabled={askForPatientInfo} onChange={setAskForPatientInfo}
              description="Prompt for approximate patient age and gender when starting an arrest." />
          )}
          <div className="space-y-2">
            <span className="text-gray-800 dark:text-gray-200 text-sm">Organisation</span>
            <select value={userOrganization || 'Independent / None'} onChange={(e) => setUserOrganization(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white text-sm">
              {availableOrgs.map(org => <option key={org} value={org}>{org}</option>)}
            </select>
          </div>
          <a href="https://tech.aegismedicalsolutions.co.uk/eresus/data-policy" target="_blank" rel="noopener noreferrer"
            className="text-sm text-blue-600 dark:text-blue-400 underline flex items-center space-x-1">
            <ExternalLink size={14} />
            <span>Data Collection Policy</span>
          </a>
        </div>
        
        {/* Appearance */}
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300">Appearance</h3>
          <div className="flex space-x-2">
            {appearanceOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setAppearanceMode(opt.value)}
                className={`flex-1 flex flex-col items-center space-y-1 p-3 rounded-xl border-2
                ${appearanceMode === opt.value 
                  ? 'bg-blue-100 dark:bg-blue-900 border-blue-500 text-blue-700 dark:text-blue-300' 
                  : 'bg-gray-100 dark:bg-gray-700 border-transparent text-gray-600 dark:text-gray-400'
                }`}
              >
                {opt.icon}
                <span className="text-sm font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
        
        {/* Developer Info */}
        <div className="text-center py-4 space-y-1">
          <p className="text-xs text-gray-400 dark:text-gray-500">eResus v1.2</p>
          <a 
            href="https://tech.aegismedicalsolutions.co.uk" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
          >
            Developed by Aegis Medical Solutions Ltd
          </a>
        </div>
      </div>
      
      <AuthView isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
};

const SettingStepper: React.FC<{
  label: string; value: number; onChange: (value: number) => void;
  min: number; max: number; step: number; unit: string;
}> = ({ label, value, onChange, min, max, step, unit }) => (
  <div className="flex justify-between items-center">
    <span className="text-gray-800 dark:text-gray-200">{label}</span>
    <div className="flex items-center space-x-3">
      <button onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min}
        className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 disabled:opacity-50">
        <Minus size={16} className="mx-auto" />
      </button>
      <span className="font-semibold w-20 text-center text-gray-900 dark:text-white">{value} {unit}</span>
      <button onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max}
        className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 disabled:opacity-50">
        <Plus size={16} className="mx-auto" />
      </button>
    </div>
  </div>
);

const SettingToggle: React.FC<{
  label: string; enabled: boolean; onChange: (enabled: boolean) => void; description: string;
}> = ({ label, enabled, onChange, description }) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center">
      <span className="text-gray-800 dark:text-gray-200">{label}</span>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
        transition-colors duration-200 ease-in-out focus:outline-none
        ${enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 
          transition duration-200 ease-in-out
          ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
    <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
  </div>
);

//============================================================================
// PDF VIEWER
//============================================================================
const PDFView: React.FC<{ pdf: PDFIdentifiable; onClose: () => void; }> = ({ pdf, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex justify-between items-center p-4 flex-shrink-0 bg-gray-900">
        <h2 className="text-lg font-semibold text-white truncate flex-1 mr-4">{pdf.title}</h2>
        <button onClick={onClose} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex-shrink-0 transition-colors">
          Done
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <object data={pdf.pdfUrl} type="application/pdf" className="w-full h-full" style={{ minHeight: 'calc(100vh - 80px)' }}>
          <iframe src={`https://docs.google.com/viewer?url=${encodeURIComponent(pdf.pdfUrl)}&embedded=true`}
            title={pdf.title} className="w-full h-full border-0" style={{ minHeight: 'calc(100vh - 80px)' }} />
        </object>
      </div>
    </div>
  );
};


//============================================================================
// APP ENTRY POINT
//============================================================================

type TabID = 'arrest' | 'logbook' | 'settings';

const AppContent: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<TabID>('arrest');
  const [pdfToShow, setPdfToShow] = useState<PDFIdentifiable | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(() => {
    const hasSeenInstructions = localStorage.getItem('eResusSeenInstallInstructions');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone 
      || document.referrer.includes('android-app://');
    return !hasSeenInstructions && !isStandalone;
  });
  const [showNewborn, setShowNewborn] = useState(() => {
    return localStorage.getItem('eresus_active_view') === 'nls';
  });
  
  useEffect(() => {
    localStorage.setItem('eresus_active_view', showNewborn ? 'nls' : 'main');
  }, [showNewborn]);

  const arrestViewModel = useArrestViewModel();
  const { appearanceMode, hasRespondedToResearchTerms, syncSettingsToFirestore, loadSettingsFromFirestore, researchModeEnabled, askForPatientInfo, userOrganization } = useSettings();
  const { db, userId, isAnonymous, user } = useFirebase();
  const [showAccountPrompt, setShowAccountPrompt] = useState(false);
  const [showResearchConsent, setShowResearchConsent] = useState(false);
  const settingsSyncedRef = useRef(false);

  useEffect(() => {
    if (!settingsSyncedRef.current) return;
    syncSettingsToFirestore(db, userId, isAnonymous);
  }, [researchModeEnabled, askForPatientInfo, userOrganization, hasRespondedToResearchTerms, db, userId, isAnonymous]);

  useEffect(() => {
    if (!isAnonymous && user) {
      loadSettingsFromFirestore(db, userId).then(() => {
        settingsSyncedRef.current = true;
      });
    } else {
      settingsSyncedRef.current = true;
    }
  }, [isAnonymous, userId, user]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (appearanceMode === AppearanceMode.Dark || 
        (appearanceMode === AppearanceMode.System && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [appearanceMode]);
  
  
  const hasSeenAccountPrompt = localStorage.getItem('eResusSeenAccountPrompt');

  useEffect(() => {
    if (!showInstallModal && !hasSeenAccountPrompt && isAnonymous) {
      setShowAccountPrompt(true);
    } else if (!showInstallModal && !hasRespondedToResearchTerms) {
      setShowResearchConsent(true);
    }
  }, [showInstallModal, hasRespondedToResearchTerms, isAnonymous]);

  const handleCloseAccountPrompt = () => {
    localStorage.setItem('eResusSeenAccountPrompt', 'true');
    setShowAccountPrompt(false);
    if (!hasRespondedToResearchTerms) {
      setShowResearchConsent(true);
    }
  };
  
  const handleCloseInstallModal = () => {
    localStorage.setItem('eResusSeenInstallInstructions', 'true');
    setShowInstallModal(false);
  };

  const handleNLSTransition = (data: { events: { timestamp: number; message: string; type: string }[]; startTime: Date; timeOffset: number }) => {
    const convertedEvents: Event[] = data.events.map(e => ({
      timestamp: e.timestamp,
      message: e.message,
      type: e.type as EventType,
    }));
    setShowNewborn(false);
    arrestViewModel.startArrest(convertedEvents, data.timeOffset, data.startTime);
  };

  const renderTab = () => {
    switch (currentTab) {
      case 'arrest':
        if (showNewborn) {
          return <NewbornLifeSupport onBack={() => setShowNewborn(false)} onTransitionToALS={handleNLSTransition} />;
        }
        return <ArrestView onShowPdf={setPdfToShow} onShowNewborn={() => setShowNewborn(true)} />;
      case 'logbook':
        return <LogbookView />;
      case 'settings':
        return <SettingsView />;
    }
  };

  return (
    <ArrestContext.Provider value={arrestViewModel}>
      <div className="h-screen w-screen flex flex-col font-sans bg-background">
        <main className="flex-grow overflow-hidden">
          {renderTab()}
        </main>
        
        <nav className="flex justify-around p-2 bg-card border-t border-border z-20">
          <TabButton label="Arrest" icon={<HeartPulse size={24} />} isActive={currentTab === 'arrest'} onClick={() => setCurrentTab('arrest')} />
          <TabButton label="Logbook" icon={<Book size={24} />} isActive={currentTab === 'logbook'} onClick={() => setCurrentTab('logbook')} />
          <TabButton label="Settings" icon={<Settings size={24} />} isActive={currentTab === 'settings'} onClick={() => setCurrentTab('settings')} />
        </nav>

        {pdfToShow && <PDFView pdf={pdfToShow} onClose={() => setPdfToShow(null)} />}
        <InstallInstructionsModal isOpen={showInstallModal} onClose={handleCloseInstallModal} />
        <AccountPromptView isOpen={showAccountPrompt} onClose={handleCloseAccountPrompt} />
        <ResearchConsentView isOpen={showResearchConsent} onClose={() => setShowResearchConsent(false)} />
        <PatientInfoPromptView isOpen={arrestViewModel.showPatientInfoPrompt} onClose={() => arrestViewModel.setShowPatientInfoPrompt(false)} />
      </div>
    </ArrestContext.Provider>
  );
}

const App: React.FC = () => {
  const settings = useAppSettings();

  return (
    <AppSettingsContext.Provider value={settings}>
      <AppContent />
    </AppSettingsContext.Provider>
  );
};

const TabButton: React.FC<{
  label: string; icon: React.ReactNode; isActive: boolean; onClick: () => void;
}> = ({ label, icon, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center w-20 p-1 rounded-lg transition-colors
    ${isActive 
      ? 'text-blue-600 dark:text-blue-400' 
      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
    }`}
  >
    {icon}
    <span className="text-xs font-medium">{label}</span>
  </button>
);

const AppWrapper: React.FC = () => (
  <FirebaseProvider>
    <App />
  </FirebaseProvider>
);

export default AppWrapper;
