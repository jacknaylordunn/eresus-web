import React, {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  useMemo,
  lazy,
  Suspense,
  useCallback,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { initializeApp, FirebaseApp } from "firebase/app";
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
  Bytes,
  serverTimestamp,
  orderBy,
} from "firebase/firestore";
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
  setPersistence,
} from "firebase/auth";
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
  BellOff,
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
  AudioWaveform,
  Ear,
  Mic,
  Bandage,
  Stethoscope,
  PhoneOutgoing,
  Play,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import NewbornLifeSupport from "./NewbornLifeSupport";
import VoicePromptButton from "./VoicePromptButton";
import { adrenalineDismissal, drugPrompts, promptHidesAfterAnalysis } from "@/lib/drugPrompts";
import { loggedAt, repeatCheck, voiceRepeatRefusal } from "@/lib/repeatCheck";
import { formatNumber, parseVoiceCommand, type GivenItem, type VoiceAction, type VoiceTime, type WakeWord } from "@/lib/voiceCommands";
import {
  checkVoiceCommandAvailability,
  installVoiceCommandLanguage,
  voiceCommandListener,
} from "@/utils/voiceCommandListener";
import { VOICE_PROMPTS, type VoicePrompt, voicePromptPlayer } from "@/utils/voicePrompts";
import { decodeSession, encodeSession, parseStateData, type SessionSnapshot } from "@/lib/sessionFormat";
import { HIGHLIGHT_CLASSES, TONE_CLASSES, type ButtonHighlight, type ButtonTone } from "@/lib/tones";
import Modal from "./Modal";
import SummaryView from "./SummaryView";
import {
  DestinationSheet,
  HOTTCard,
  ObservationButton,
  ObservationSheet,
  OtherDrugsSheet,
  RepeatPromptModal,
  SomaticCriteriaSection,
  TraumaSheet,
} from "./ClinicalSheets";
import {
  ageTextForCategory,
  areDrugPromptsQuietened as promptsQuietenedFromLog,
  checklistToggleEntry,
  clockFor,
  completeTask,
  currentRhythm as currentRhythmFrom,
  currentRhythmLine,
  isPaediatric as isPaediatricFrom,
  meetsTarget,
  TOR_ADULT_EXCLUSIONS,
  torCaution as torCautionFrom,
  TRAUMA_MARKS_ARREST,
  TRAUMA_PROMPTS_RESTORED_ENTRY,
  DESTINATION_TASK,
  doseNote as checkDose,
  hhmm,
  isTraumaArrest as traumaFromLog,
  isTraumaProcedureName,
  latestObservation as latestObservationIn,
  observationEntry,
  POST_ROSC_TASKS,
  recentOtherDrugs,
  ROSC_OBSERVATION_ORDER,
  ROSC_OBSERVATIONS,
  TRAUMA_OFF_ENTRY,
  TRAUMA_ON_ENTRY,
  traumaEntryText,
  traumaInterventionCount as traumaCountIn,
  type DrugGroupKind,
  type ROSCObservation,
} from "@/lib/arrestRecord";
import { buildSummary } from "@/lib/arrestSummary";

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
  measurementId: "G-H2H7SMTZK7",
};

const appId = "eresus-6e65e";
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
  // Seconds since 1970 when it happened, kept as logged: the arrest clock stops while paused, so clock
  // times can't be worked out from it afterwards. Missing on logs from older builds.
  clock?: number;
}

// The message is the record: entries logged after the fact carry "(estimated)" (before any "(voice)").
export const isEstimated = (message: string) => message.includes("(estimated)");
export const CONFIRMED_ENTRY_PREFIXES = ["Cardiac arrest confirmed ~", "Born ~"];
const isConfirmedEntry = (event: Event) =>
  event.type === EventType.Status && CONFIRMED_ENTRY_PREFIXES.some((prefix) => event.message.startsWith(prefix));
// Seconds between the arrest being confirmed and eResus being started, read from the log's own entry.
export const timeBeforeStart = (events: { message: string }[]): number => {
  const entry = events.find((e) => CONFIRMED_ENTRY_PREFIXES.some((prefix) => e.message.startsWith(prefix)));
  const minutes = entry ? Number(entry.message.split("~")[1]?.split(" ")[0]) : 0;
  return Number.isFinite(minutes) ? minutes * 60 : 0;
};

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
    case AirwayAdjunctType.SGA:
      return "Supraglottic Airway (i-Gel)";
    case AirwayAdjunctType.ETT:
      return "Endotracheal Tube";
    case AirwayAdjunctType.Unspecified:
      return "Unspecified";
  }
};

export enum AppearanceMode {
  System = "System",
  Light = "Light",
  Dark = "Dark",
}

export type DrugToLog =
  | { type: "adrenaline" }
  | { type: "amiodarone" }
  | { type: "lidocaine" }
  | { type: "other"; name: string };

export const getDrugLogTitle = (drug: DrugToLog): string => {
  switch (drug.type) {
    case "adrenaline":
      return "Adrenaline";
    case "amiodarone":
      return "Amiodarone";
    case "lidocaine":
      return "Lidocaine";
    case "other":
      return drug.name;
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
  hideAdrenalineDueWarning?: boolean;
  lastRhythmNonShockable?: boolean;
  airwayAdjunct?: AirwayAdjunctType | null;
  roscTime?: number | null;
  isTimerPaused?: boolean;
  pauseStartTime?: Date | null;
  torTime?: number | null;
  vodTime?: number | null;
  vodChecklist?: ChecklistItem[];
  cprCycleStartTime?: number;
  stackedShockExtra?: number;
}

export interface PDFIdentifiable {
  id: string;
  pdfUrl: string;
  /** Original cross-origin URL (for fallback viewers like Google Docs) */
  upstreamUrl?: string;
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
  const [cprCycleDuration, setCprCycleDuration] = useAppStorage("cprCycleDuration", 120);
  const [adrenalineInterval, setAdrenalineInterval] = useAppStorage("adrenalineInterval", 240);
  const [metronomeBPM, setMetronomeBPM] = useAppStorage("metronomeBPM", 110);
  const [appearanceMode, setAppearanceMode] = useAppStorage<AppearanceMode>("appearanceMode", AppearanceMode.System);
  const [showDosagePrompts, setShowDosagePrompts] = useAppStorage("showDosagePrompts", false);
  const [voicePromptsEnabled, setVoicePromptsEnabled] = useAppStorage("voicePromptsEnabled", true);
  const [voicePromptsToneOnly, setVoicePromptsToneOnly] = useAppStorage("voicePromptsToneOnly", false);
  const [rhythmCheckWarning, setRhythmCheckWarning] = useAppStorage("rhythmCheckWarning", 15); // 0 = off
  const [promptRhythmCheck, setPromptRhythmCheck] = useAppStorage("promptRhythmCheck", true);
  const [promptAdrenaline, setPromptAdrenaline] = useAppStorage("promptAdrenaline", true);
  const [promptAntiarrhythmic, setPromptAntiarrhythmic] = useAppStorage("promptAntiarrhythmic", true);
  const [etco2Unit, setEtco2Unit] = useAppStorage<"kPa" | "mmHg">("etco2Unit", "kPa");
  const [voiceCommandsEnabled, setVoiceCommandsEnabled] = useAppStorage("voiceCommandsEnabled", false);
  const [voiceHandsFree, setVoiceHandsFree] = useAppStorage("voiceHandsFree", false);
  const [voiceWakeWord, setVoiceWakeWord] = useAppStorage<WakeWord>("voiceWakeWord", "scribe");
  const [researchModeEnabled, setResearchModeEnabled] = useAppStorage("researchModeEnabled", false);
  const [hasRespondedToResearchTerms, setHasRespondedToResearchTerms] = useAppStorage(
    "hasRespondedToResearchTerms",
    false,
  );
  const [askForPatientInfo, setAskForPatientInfo] = useAppStorage("askForPatientInfo", false);
  const [userOrganization, setUserOrganization] = useAppStorage("userOrganization", "");
  const [_settingsSyncedFrom, _setSettingsSyncedFrom] = useAppStorage("settingsSyncedFromUid", "");

  const syncSettingsToFirestore = useCallback(
    (db: Firestore, userId: string, isAnonymous: boolean) => {
      if (isAnonymous) return;
      try {
        const settingsDocPath = `/artifacts/${appId}/users/${userId}/settings/research`;
        setDoc(
          doc(db, settingsDocPath),
          {
            researchModeEnabled,
            askForPatientInfo,
            userOrganization,
            hasRespondedToResearchTerms,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ).catch(console.error);
      } catch {
        /* non-critical */
      }
    },
    [researchModeEnabled, askForPatientInfo, userOrganization, hasRespondedToResearchTerms],
  );

  const loadSettingsFromFirestore = useCallback(async (db: Firestore, userId: string) => {
    try {
      const settingsDocPath = `/artifacts/${appId}/users/${userId}/settings/research`;
      const settingsDoc = await getDoc(doc(db, settingsDocPath));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        if (data.researchModeEnabled !== undefined) setResearchModeEnabled(data.researchModeEnabled);
        if (data.askForPatientInfo !== undefined) setAskForPatientInfo(data.askForPatientInfo);
        if (data.userOrganization) setUserOrganization(data.userOrganization);
        if (data.hasRespondedToResearchTerms === true)
          setHasRespondedToResearchTerms(true);
        _setSettingsSyncedFrom(userId);
      }
    } catch (e) {
      console.error("Error loading settings from Firestore:", e);
    }
  }, []);

  // Apply dark mode to document
  useEffect(() => {
    const applyTheme = (mode: AppearanceMode) => {
      const root = document.documentElement;
      if (mode === AppearanceMode.Dark) {
        root.classList.add('dark');
      } else if (mode === AppearanceMode.Light) {
        root.classList.remove('dark');
      } else {
        // System
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    };

    applyTheme(appearanceMode);

    // Listen for system theme changes when in System mode
    if (appearanceMode === AppearanceMode.System) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        if (e.matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [appearanceMode]);

  return {
    cprCycleDuration,
    setCprCycleDuration,
    adrenalineInterval,
    setAdrenalineInterval,
    metronomeBPM,
    setMetronomeBPM,
    appearanceMode,
    setAppearanceMode,
    showDosagePrompts,
    setShowDosagePrompts,
    voicePromptsEnabled,
    setVoicePromptsEnabled,
    voicePromptsToneOnly,
    setVoicePromptsToneOnly,
    rhythmCheckWarning,
    setRhythmCheckWarning,
    promptRhythmCheck,
    setPromptRhythmCheck,
    promptAdrenaline,
    setPromptAdrenaline,
    promptAntiarrhythmic,
    setPromptAntiarrhythmic,
    etco2Unit,
    setEtco2Unit,
    voiceCommandsEnabled,
    setVoiceCommandsEnabled,
    voiceHandsFree,
    setVoiceHandsFree,
    voiceWakeWord,
    setVoiceWakeWord,
    researchModeEnabled,
    setResearchModeEnabled,
    hasRespondedToResearchTerms,
    setHasRespondedToResearchTerms,
    askForPatientInfo,
    setAskForPatientInfo,
    userOrganization,
    setUserOrganization,
    syncSettingsToFirestore,
    loadSettingsFromFirestore,
  };
};
type AppSettingsContextType = ReturnType<typeof useAppSettings>;
const AppSettingsContext = createContext<AppSettingsContextType | null>(null);
const useSettings = () => useContext(AppSettingsContext)!;

// Age conversion helpers (two-way sync between demographics and drug calculator)
const ageStringToCategory = (ageStr: string): PatientAgeCategory | null => {
  const trimmed = ageStr.trim();
  // "6 months" from the dose dialog is that category, not 6 years.
  const exact = allPatientAgeCategories.find((cat) => cat === trimmed);
  if (exact) return exact;
  // Only a bare number is years (as iOS Int(ageStr)); other text isn't guessed at.
  if (!/^\d+$/.test(trimmed)) return null;
  const age = Number(trimmed);
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

const AppConstants = {
  reversibleCausesTemplate: (): ChecklistItem[] => [
    { id: "hypoxia", name: "Hypoxia", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "hypovolemia", name: "Hypovolaemia", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    {
      id: "hypo-hyperkalaemia",
      name: "Hypo/Hyperkalaemia",
      isCompleted: false,
      hypothermiaStatus: HypothermiaStatus.None,
    },
    { id: "hypothermia", name: "Hypothermia", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "toxins", name: "Toxins", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    { id: "tamponade", name: "Tamponade", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    {
      id: "tension-pneumothorax",
      name: "Tension Pneumothorax",
      isCompleted: false,
      hypothermiaStatus: HypothermiaStatus.None,
    },
    { id: "thrombosis", name: "Thrombosis", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
  ],

  postROSCTasksTemplate: (): ChecklistItem[] =>
    POST_ROSC_TASKS.map((task) => ({ ...task, isCompleted: false, hypothermiaStatus: HypothermiaStatus.None })),

  postMortemTasksTemplate: (): ChecklistItem[] => [
    {
      id: "reposition",
      name: "Reposition body & remove lines/tubes",
      isCompleted: false,
      hypothermiaStatus: HypothermiaStatus.None,
    },
    { id: "docs", name: "Complete documentation", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    {
      id: "determine",
      name: "Determine expected/unexpected death",
      isCompleted: false,
      hypothermiaStatus: HypothermiaStatus.None,
    },
    {
      id: "coroner",
      name: "Contact Coroner (if unexpected)",
      isCompleted: false,
      hypothermiaStatus: HypothermiaStatus.None,
    },
    {
      id: "handling",
      name: "Follow local body handling procedure",
      isCompleted: false,
      hypothermiaStatus: HypothermiaStatus.None,
    },
    {
      id: "leaflet",
      name: "Provide leaflet to bereaved relatives",
      isCompleted: false,
      hypothermiaStatus: HypothermiaStatus.None,
    },
    {
      id: "donation",
      name: "Consider organ/tissue donation",
      isCompleted: false,
      hypothermiaStatus: HypothermiaStatus.None,
    },
  ],

  vodChecklistTemplate: (): ChecklistItem[] => [
    { id: "ab", name: "A/B: Apnoea / Absent Breathing", isCompleted: false, hypothermiaStatus: HypothermiaStatus.None },
    {
      id: "c",
      name: "C: Absent Circulation (Pulse/Heart sounds)",
      isCompleted: false,
      hypothermiaStatus: HypothermiaStatus.None,
    },
    {
      id: "d",
      name: "D: Disability (Unresponsive / GCS 3)",
      isCompleted: false,
      hypothermiaStatus: HypothermiaStatus.None,
    },
    {
      id: "e",
      name: "E: 5 mins continuous asystole on ECG",
      isCompleted: false,
      hypothermiaStatus: HypothermiaStatus.None,
    },
  ],

  pdfAlgorithms: [
    {
      id: "adult",
      // Same-origin proxy path served by service worker (offline-cacheable).
      // SW maps this to the upstream Resus Council PDF URL.
      pdfUrl: "/cached-pdf/adult.pdf",
      upstreamUrl:
        "https://www.resus.org.uk/sites/default/files/2025-10/Adult%20ALS%20algorithm%202025.pdf",
      title: "Adult ALS",
    },
    {
      id: "paeds",
      pdfUrl: "/cached-pdf/paeds.pdf",
      upstreamUrl:
        "https://www.resus.org.uk/sites/default/files/2025-10/Paediatric%20advanced%20life%20support%20algorithm%202025.pdf",
      title: "Paediatric ALS",
    },
    {
      id: "newborn",
      pdfUrl: "/cached-pdf/newborn.pdf",
      upstreamUrl:
        "https://www.resus.org.uk/sites/default/files/2025-10/Newborn%20life%20support%20algorithm%202025.pdf",
      title: "Newborn LS",
    },
    {
      id: "post",
      pdfUrl: "/cached-pdf/post.pdf",
      upstreamUrl:
        "https://www.resus.org.uk/sites/default/files/2025-10/Adult%20post-resuscitation%20care%202025.pdf",
      title: "Post Arrest Care",
    },
  ],
};

//============================================================================
// APP SERVICES
//============================================================================

const TimeFormatter = {
  format: (timeInterval: number): string => {
    const time = Math.max(0, timeInterval);
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  },
};

const HapticManager = {
  impact: (style: "light" | "medium" | "heavy" = "light") => {
    if (window.navigator.vibrate) {
      let duration = 10;
      if (style === "medium") duration = 20;
      if (style === "heavy") duration = 30;
      window.navigator.vibrate(duration);
    }
  },
  notification: (type: "success" | "warning" | "error") => {
    if (window.navigator.vibrate) {
      if (type === "success") window.navigator.vibrate([10, 50, 10]);
      if (type === "warning") window.navigator.vibrate([20, 50, 20]);
      if (type === "error") window.navigator.vibrate([30, 50, 30, 50, 30]);
    }
  },
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
    if (this.audioContext && this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.error("Error resuming audio context:", e);
        return false;
      }
    }
    return this.audioContext.state === "running";
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
    if (!this.audioContext || this.audioContext.state !== "running") return;
    try {
      const context = this.audioContext;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
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
    if (!ready || !this.audioContext || this.audioContext.state !== "running") return;
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
      case PatientAgeCategory.Adult:
        return "1mg";
      case PatientAgeCategory.ElevenYears:
        return "350mcg";
      case PatientAgeCategory.TenYears:
        return "320mcg";
      case PatientAgeCategory.NineYears:
        return "300mcg";
      case PatientAgeCategory.EightYears:
        return "260mcg";
      case PatientAgeCategory.SevenYears:
        return "230mcg";
      case PatientAgeCategory.SixYears:
        return "210mcg";
      case PatientAgeCategory.FiveYears:
        return "190mcg";
      case PatientAgeCategory.FourYears:
        return "160mcg";
      case PatientAgeCategory.ThreeYears:
        return "140mcg";
      case PatientAgeCategory.TwoYears:
        return "120mcg";
      case PatientAgeCategory.EighteenMonths:
        return "110mcg";
      case PatientAgeCategory.TwelveMonths:
        return "100mcg";
      case PatientAgeCategory.NineMonths:
        return "90mcg";
      case PatientAgeCategory.SixMonths:
        return "80mcg";
      case PatientAgeCategory.ThreeMonths:
        return "60mcg";
      case PatientAgeCategory.OneMonth:
        return "50mcg";
      case PatientAgeCategory.PostBirthToOneMonth:
        return "50mcg";
      case PatientAgeCategory.AtBirth:
        return "70mcg";
      default:
        return "N/A";
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
      default:
        return null;
    }
  },
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
googleProvider.setCustomParameters({
  client_id: "118352301751-uqa88f4vsfkquo2o0rairbo61s38kl1j.apps.googleusercontent.com",
});

const appleProvider = new OAuthProvider("apple.com");
appleProvider.addScope("email");
appleProvider.addScope("name");

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
          const oldUserId = localStorage.getItem("eresus_user_id");
          if (oldUserId && oldUserId !== user.uid && !user.isAnonymous) {
            migrateAnonymousLogs(db, oldUserId, user.uid);
          }
          localStorage.setItem("eresus_user_id", user.uid);

          setServices({
            app,
            db,
            auth,
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
              const stored = localStorage.getItem("eresus_user_id");
              if (stored) return stored;
              const newId = crypto.randomUUID();
              localStorage.setItem("eresus_user_id", newId);
              return newId;
            };
            setServices({
              app,
              db,
              auth,
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

  return <FirebaseContext.Provider value={services}>{children}</FirebaseContext.Provider>;
};

//============================================================================
// OFFLINE LOG QUEUE
//============================================================================
const OFFLINE_LOG_QUEUE_KEY = "eresus_offline_log_queue";

interface OfflineLogEntry {
  logData: any;
  events: Event[];
  userId: string;
  researchModeEnabled: boolean;
  queuedAt: number;
}

const getOfflineLogQueue = (): OfflineLogEntry[] => {
  try {
    const raw = localStorage.getItem(OFFLINE_LOG_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const addToOfflineLogQueue = (entry: OfflineLogEntry) => {
  try {
    const queue = getOfflineLogQueue();
    queue.push(entry);
    localStorage.setItem(OFFLINE_LOG_QUEUE_KEY, JSON.stringify(queue));
  } catch { /* storage full */ }
};

const clearOfflineLogQueue = () => {
  try { localStorage.removeItem(OFFLINE_LOG_QUEUE_KEY); } catch { }
};

const removeFromOfflineLogQueue = (index: number) => {
  try {
    const queue = getOfflineLogQueue();
    queue.splice(index, 1);
    localStorage.setItem(OFFLINE_LOG_QUEUE_KEY, JSON.stringify(queue));
  } catch { }
};

//============================================================================
// CORE LOGIC: useArrestViewModel
//============================================================================

const ARREST_SESSION_KEY = "eresus_arrest_session";

// Lidocaine doses in a log: one "Given" entry per dose, plus "Lidocaine ×2 before eResus" entries.
export const lidocaineDosesIn = (events: { message: string }[]): number =>
  events.reduce((total, e) => {
    const message = e.message.toLowerCase();
    if (message.includes("lidocaine") && message.includes("given")) return total + 1;
    const before = e.message.match(/^Lidocaine ×(\d+) before eResus/);
    return before ? total + Number(before[1]) : total;
  }, 0);

const useArrestViewModel = () => {
  const { db, userId, user } = useFirebase();
  const {
    cprCycleDuration,
    adrenalineInterval,
    showDosagePrompts,
    researchModeEnabled,
    hasRespondedToResearchTerms,
    askForPatientInfo,
    userOrganization,
    voicePromptsEnabled,
    voicePromptsToneOnly,
    rhythmCheckWarning,
    promptRhythmCheck,
    promptAdrenaline,
    promptAntiarrhythmic,
    etco2Unit,
  } = useSettings();
  // Nothing is uploaded until the user has actively opted in, even if a stored or cloud-synced flag says otherwise.
  const researchActive = researchModeEnabled && hasRespondedToResearchTerms;

  const savedSession = useRef<any>(null);
  const didRestore = useRef(false);

  if (!didRestore.current) {
    try {
      const raw = localStorage.getItem(ARREST_SESSION_KEY);
      if (raw) savedSession.current = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    didRestore.current = true;
  }
  const s = savedSession.current;

  const hasRecoverableArrest =
    s != null && (s.arrestState === ArrestState.Active || s.arrestState === ArrestState.Rosc);

  const [arrestState, setArrestState] = useState<ArrestState>(
    hasRecoverableArrest ? ArrestState.Pending : (s?.arrestState ?? ArrestState.Pending),
  );
  const [masterTime, setMasterTime] = useState<number>(0);
  const [cprTime, setCprTime] = useState<number>(cprCycleDuration);
  const [timeOffset, setTimeOffset] = useState<number>(s?.timeOffset ?? 0);
  const [uiState, setUiState] = useState<UIState>(s?.uiState ?? UIState.Default);
  const [events, setEvents] = useState<Event[]>(s?.events ?? []);

  const [shockCount, setShockCount] = useState(s?.shockCount ?? 0);
  // 2 when the first shocks were three stacked shocks: RCUK counts them as one shock for drug timing.
  const [stackedShockExtra, setStackedShockExtra] = useState<number>(s?.stackedShockExtra ?? 0);
  const drugTimingShockCount = shockCount - stackedShockExtra;
  const [adrenalineCount, setAdrenalineCount] = useState(s?.adrenalineCount ?? 0);
  const [amiodaroneCount, setAmiodaroneCount] = useState(s?.amiodaroneCount ?? 0);
  const [lidocaineCount, setLidocaineCount] = useState(s?.lidocaineCount ?? 0);

  const [airwayPlaced, setAirwayPlaced] = useState(s?.airwayPlaced ?? false);
  const [antiarrhythmicGiven, setAntiarrhythmicGiven] = useState<AntiarrhythmicDrug>(
    s?.antiarrhythmicGiven ?? AntiarrhythmicDrug.None,
  );

  const [reversibleCauses, setReversibleCauses] = useState<ChecklistItem[]>(
    s?.reversibleCauses ?? AppConstants.reversibleCausesTemplate(),
  );
  const [postROSCTasks, setPostROSCTasks] = useState<ChecklistItem[]>(
    s?.postROSCTasks ?? AppConstants.postROSCTasksTemplate(),
  );
  const [postMortemTasks, setPostMortemTasks] = useState<ChecklistItem[]>(
    s?.postMortemTasks ?? AppConstants.postMortemTasksTemplate(),
  );
  const [patientAgeCategory, setPatientAgeCategory] = useState<PatientAgeCategory | null>(
    s?.patientAgeCategory ?? null,
  );

  // v1.2 Research State
  const [patientAgeStr, setPatientAgeStr] = useState(s?.patientAgeStr ?? "");
  const [patientGenderStr, setPatientGenderStr] = useState(s?.patientGenderStr ?? "");
  const [initialRhythm, setInitialRhythm] = useState<string | null>(s?.initialRhythm ?? null);
  const [showPatientInfoPrompt, setShowPatientInfoPrompt] = useState(false);

  // v1.3 TOR/VOD State
  const [torTime, setTorTime] = useState<number | null>(s?.torTime ?? null);
  const [vodTime, setVodTime] = useState<number | null>(s?.vodTime ?? null);
  const [vodChecklist, setVodChecklist] = useState<ChecklistItem[]>(
    s?.vodChecklist ?? AppConstants.vodChecklistTemplate(),
  );
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
  const [hideAdrenalineDueWarning, setHideAdrenalineDueWarning] = useState(false);
  const [lastRhythmNonShockable, setLastRhythmNonShockable] = useState(false);
  const [roscTime, setRoscTime] = useState<number | null>(s?.roscTime ?? null);
  const [airwayAdjunct, setAirwayAdjunct] = useState<AirwayAdjunctType | null>(null);

  // Computed
  const totalArrestTime = useMemo(() => masterTime + timeOffset, [masterTime, timeOffset]);
  // JRCALC ToR timing runs from when the first ambulance resource (crew or CFR) confirmed the arrest,
  // which includes any time entered as before eResus was started.
  const resuscitationTime = totalArrestTime;
  const canUndo = undoHistory.length > 0;

  const isAdrenalineAvailable = useMemo(() => {
    return reversibleCauses.find((item) => item.name === "Hypothermia")?.hypothermiaStatus !== HypothermiaStatus.Severe;
  }, [reversibleCauses]);

  // Once one antiarrhythmic is chosen the other is blocked, and amiodarone is withheld in severe
  // hypothermia along with adrenaline (matches iOS).
  const isAmiodaroneAvailable = antiarrhythmicGiven !== AntiarrhythmicDrug.Lidocaine && isAdrenalineAvailable;
  // Like amiodarone and adrenaline, withheld in severe hypothermia (RCUK: below 30 °C; matches iOS).
  const isLidocaineAvailable = antiarrhythmicGiven !== AntiarrhythmicDrug.Amiodarone && isAdrenalineAvailable;

  const currentAdrenalineInterval =
    reversibleCauses.find((item) => item.name === "Hypothermia")?.hypothermiaStatus === HypothermiaStatus.Moderate
      ? adrenalineInterval * 2
      : adrenalineInterval;

  const timeUntilAdrenaline = useMemo(() => {
    const lastAdrenalineTime = lastAdrenalineTimeRef.current;
    if (lastAdrenalineTime === null) return null;
    return currentAdrenalineInterval - (totalArrestTime - lastAdrenalineTime);
  }, [totalArrestTime, currentAdrenalineInterval]);

  // Adrenaline was given before eResus but nobody knows when. There's no timer to run, so the screen asks;
  // if nobody answers, the next rhythm check treats it as due rather than staying silent.
  const isLastAdrenalineTimeUnknown = adrenalineCount > 0 && lastAdrenalineTimeRef.current === null && isAdrenalineAvailable;

  // Traumatic arrest: HOTT comes before drugs, so drug reminders stay quiet. Read from the log, so it survives
  // a reload, an undo and a transfer (matches iOS).
  const isTraumaArrest = useMemo(() => traumaFromLog(events), [events]);
  // Drug reminders are quiet from the trauma entry until HOTT is marked as addressed or it's not trauma.
  const areDrugPromptsQuietened = useMemo(() => promptsQuietenedFromLog(events), [events]);
  const traumaInterventionCount = useMemo(() => traumaCountIn(events), [events]);

  // Which drug buttons are lit and the line under each title (src/lib/drugPrompts.ts; matches iOS).
  const {
    shouldShowAdrenalinePrompt,
    isAdrenalineDue,
    isAdrenalineHighlighted,
    shouldShowAmiodaroneFirstDosePrompt,
    shouldShowAmiodaroneReminder,
    isAmiodaroneHighlighted,
    shouldShowLidocaineReminder,
    adrenalineButtonDetail,
    amiodaroneButtonDetail,
    lidocaineButtonDetail,
  } = drugPrompts({
    isAdrenalineAvailable,
    areDrugPromptsQuietened,
    hideAdrenalinePrompt,
    hideAdrenalineDueWarning,
    hideAmiodaronePrompt,
    timeUntilAdrenaline,
    adrenalineCount,
    amiodaroneCount,
    lidocaineCount,
    shockCount,
    drugTimingShockCount,
    shockCountForAmiodarone1: shockCountForAmiodarone1Ref.current,
    lastRhythmNonShockable,
    antiarrhythmicGiven,
  });

  // "Not now" on a lit Adrenaline button.
  const dismissAdrenalinePrompt = () => {
    if (adrenalineDismissal({ shouldShowAdrenalinePrompt }) === "prompt") setHideAdrenalinePrompt(true);
    else setHideAdrenalineDueWarning(true);
  };

  const isRhythmCheckDue = arrestState === ArrestState.Active && uiState === UIState.Default && cprTime <= 0;

  // Spoken prompts fire when the matching on-screen prompt appears, so voice and display never disagree.
  const activePromptsRef = useRef<Set<VoicePrompt>>(new Set());
  useEffect(() => {
    if (arrestState !== ArrestState.Active || isTimerPaused) {
      activePromptsRef.current = new Set();
      return;
    }

    const current = new Set<VoicePrompt>();
    if (uiState === UIState.Default) {
      if (cprTime <= 0) {
        current.add("rhythm_check_due");
      } else if (rhythmCheckWarning > 0 && cprTime <= rhythmCheckWarning) {
        current.add("prepare_rhythm_check");
      }
    }
    if (shouldShowAdrenalinePrompt) current.add("consider_adrenaline");
    if (isAdrenalineDue) current.add("adrenaline_due");
    if (shouldShowAmiodaroneFirstDosePrompt) current.add("consider_amiodarone");
    if (shouldShowAmiodaroneReminder) current.add("consider_amiodarone_second");
    if (shouldShowLidocaineReminder) current.add("consider_lidocaine_second");

    const enabled: Record<VoicePrompt, boolean> = {
      rhythm_check_due: promptRhythmCheck,
      reassess_newborn: promptRhythmCheck,
      prepare_rhythm_check: rhythmCheckWarning > 0,
      adrenaline_due: promptAdrenaline,
      consider_adrenaline: promptAdrenaline,
      consider_amiodarone: promptAntiarrhythmic,
      consider_amiodarone_second: promptAntiarrhythmic,
      consider_lidocaine_second: promptAntiarrhythmic,
    };
    // Hidden (another app in front, or the screen off): nothing can be heard, so leave the prompts to be
    // announced when the page is next on screen rather than marking them as said.
    if (document.visibilityState === "hidden") return;
    // Only announce prompts that have just appeared, in priority order.
    if (voicePromptsEnabled) {
      for (const prompt of VOICE_PROMPTS) {
        if (current.has(prompt) && !activePromptsRef.current.has(prompt) && enabled[prompt]) {
          voicePromptPlayer.play(prompt, voicePromptsToneOnly);
        }
      }
    }
    activePromptsRef.current = current;
  }, [
    arrestState,
    isTimerPaused,
    uiState,
    cprTime,
    shouldShowAdrenalinePrompt,
    isAdrenalineDue,
    shouldShowAmiodaroneFirstDosePrompt,
    shouldShowAmiodaroneReminder,
    shouldShowLidocaineReminder,
    voicePromptsEnabled,
    voicePromptsToneOnly,
    rhythmCheckWarning,
    promptRhythmCheck,
    promptAdrenaline,
    promptAntiarrhythmic,
  ]);

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
      stackedShockExtra,
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
      patientAgeStr,
      patientGenderStr,
      initialRhythm,
      roscTime,
      torTime,
      vodTime,
      vodChecklist,
      vodConfirmed,
      // A reload while paused mustn't add the paused time to the arrest and ToR clocks (matches iOS).
      isTimerPaused,
      pauseStartTime: pauseStartTimeRef.current?.toISOString() ?? null,
      hideAmiodaronePrompt,
      hideAdrenalineDueWarning,
      lastRhythmNonShockable,
    };
    try {
      localStorage.setItem(ARREST_SESSION_KEY, JSON.stringify(session));
    } catch {
      /* storage full */
    }
  }, [
    arrestState,
    timeOffset,
    uiState,
    events,
    shockCount,
    stackedShockExtra,
    adrenalineCount,
    amiodaroneCount,
    lidocaineCount,
    airwayPlaced,
    antiarrhythmicGiven,
    reversibleCauses,
    postROSCTasks,
    postMortemTasks,
    patientAgeCategory,
    patientAgeStr,
    patientGenderStr,
    initialRhythm,
    roscTime,
    torTime,
    vodTime,
    vodChecklist,
    vodConfirmed,
    isTimerPaused,
    hideAmiodaronePrompt,
    hideAdrenalineDueWarning,
    lastRhythmNonShockable,
  ]);

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
    setStackedShockExtra(s.stackedShockExtra ?? 0);
    setAdrenalineCount(s.adrenalineCount ?? 0);
    setAmiodaroneCount(s.amiodaroneCount ?? 0);
    setLidocaineCount(s.lidocaineCount ?? 0);
    setAirwayPlaced(s.airwayPlaced ?? false);
    setAntiarrhythmicGiven(s.antiarrhythmicGiven ?? AntiarrhythmicDrug.None);
    setReversibleCauses(s.reversibleCauses ?? AppConstants.reversibleCausesTemplate());
    setPostROSCTasks(s.postROSCTasks ?? AppConstants.postROSCTasksTemplate());
    setPostMortemTasks(s.postMortemTasks ?? AppConstants.postMortemTasksTemplate());
    setPatientAgeCategory(s.patientAgeCategory ?? null);
    setPatientAgeStr(s.patientAgeStr ?? "");
    setPatientGenderStr(s.patientGenderStr ?? "");
    setInitialRhythm(s.initialRhythm ?? null);
    setRoscTime(s.roscTime ?? null);
    setTorTime(s.torTime ?? null);
    setVodTime(s.vodTime ?? null);
    setVodChecklist(s.vodChecklist ?? AppConstants.vodChecklistTemplate());
    setVodConfirmed(s.vodConfirmed ?? false);

    setHideAmiodaronePrompt(s.hideAmiodaronePrompt ?? false);
    setHideAdrenalineDueWarning(s.hideAdrenalineDueWarning ?? false);
    setLastRhythmNonShockable(s.lastRhythmNonShockable ?? false);
    if (s.startTime) {
      startTimeRef.current = new Date(s.startTime);
      // Paused: the clock stays where it stopped, and resuming later drops the paused time as usual.
      const pausedAt = s.isTimerPaused && s.pauseStartTime ? new Date(s.pauseStartTime) : null;
      pauseStartTimeRef.current = pausedAt;
      setIsTimerPaused(pausedAt !== null);
      const elapsed = ((pausedAt?.getTime() ?? Date.now()) - new Date(s.startTime).getTime()) / 1000;
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

  // The first event an action logs is marked "(voice)" so the record shows how it was entered.
  const nextEventFromVoiceRef = useRef(false);
  // Set while acting on a spoken time ("adrenaline at 14:52"); events and timers use it instead of now.
  const eventTimeOverrideRef = useRef<number | null>(null);
  const performFromVoice = (time: number | null, action: () => void) => {
    nextEventFromVoiceRef.current = true;
    eventTimeOverrideRef.current = time;
    action();
    nextEventFromVoiceRef.current = false;
    eventTimeOverrideRef.current = null;
  };

  // Now on the total-time scale, read from the clock rather than state so it is exact to the second.
  const liveTotalTime = () => {
    if (!startTimeRef.current) return totalArrestTime;
    const until = isTimerPaused && pauseStartTimeRef.current ? pauseStartTimeRef.current.getTime() : Date.now();
    return (until - startTimeRef.current.getTime()) / 1000 + timeOffset;
  };

  // When the current action happened, on the total-time scale. Usually now; earlier for a spoken time.
  const actionTime = () => eventTimeOverrideRef.current ?? liveTotalTime();

  // The moment a spoken time refers to. Null if it's in the future.
  const dateFor = (time: VoiceTime, now: Date = new Date()): Date | null => {
    let date: Date;
    if ("secondsAgo" in time) {
      date = new Date(now.getTime() - time.secondsAgo * 1000);
    } else {
      const [h, m] = time.clock.split(":").map(Number);
      if (isNaN(h) || isNaN(m)) return null;
      // "2:52" said in the afternoon means 14:52: take the most recent matching time.
      const hours = time.twelveHour ? [h % 12, (h % 12) + 12] : [h];
      const latest = now.getTime() + 60_000;
      const candidates = hours
        .flatMap((hour) => {
          const today = new Date(now);
          today.setHours(hour, m, 0, 0);
          return [today.getTime(), today.getTime() - 86_400_000];
        })
        .filter((t) => t <= latest);
      if (candidates.length === 0) return null;
      date = new Date(Math.max(...candidates));
    }
    return date.getTime() <= now.getTime() + 60_000 ? date : null;
  };

  // Converts a spoken time to the total-time scale. Null if it's in the future or before the arrest began.
  const arrestTime = (time: VoiceTime, now: Date = new Date()): number | null => {
    const date = dateFor(time, now);
    if (!date) return null;
    const current = actionTime();
    const total = current - (now.getTime() - date.getTime()) / 1000;
    if (total < 0) return null;
    return Math.min(total, current);
  };

  const logEvent = (message: string, type: EventType) => {
    const fromVoice = nextEventFromVoiceRef.current;
    nextEventFromVoiceRef.current = false;
    const timestamp = eventTimeOverrideRef.current ?? totalArrestTime;
    // Anything not logged at the moment it happened is an estimate, and the record says so.
    let finalMessage = message;
    if (eventTimeOverrideRef.current !== null && !isEstimated(message)) finalMessage += " (estimated)";
    if (fromVoice) finalMessage += " (voice)";
    // Back-dated entries: the same distance before now as on the arrest clock.
    const liveTotal = arrestState === ArrestState.Ended ? timestamp : liveTotalTime();
    const clock = eventTimeOverrideRef.current === null ? Date.now() / 1000 : clockFor(timestamp, liveTotal);
    const newEvent: Event = { timestamp, message: finalMessage, type, clock };
    // Newest first; a back-dated entry goes into its place in the timeline.
    setEvents((prevEvents) => {
      const index = prevEvents.findIndex((event) => event.timestamp <= timestamp);
      if (index === -1) return [...prevEvents, newEvent];
      return [...prevEvents.slice(0, index), newEvent, ...prevEvents.slice(index)];
    });
    HapticManager.impact();
  };

  // Undo
  const saveUndoState = () => {
    const currentState: UndoState = {
      arrestState,
      masterTime,
      cprTime,
      timeOffset,
      events,
      shockCount,
      adrenalineCount,
      amiodaroneCount,
      lidocaineCount,
      lastAdrenalineTime: lastAdrenalineTimeRef.current,
      antiarrhythmicGiven,
      shockCountForAmiodarone1: shockCountForAmiodarone1Ref.current,
      airwayPlaced,
      reversibleCauses,
      postROSCTasks,
      postMortemTasks,
      startTime: startTimeRef.current,
      uiState,
      patientAgeCategory,
      hideAdrenalinePrompt,
      hideAmiodaronePrompt,
      hideAdrenalineDueWarning,
      lastRhythmNonShockable,
      airwayAdjunct,
      roscTime,
      isTimerPaused,
      pauseStartTime: pauseStartTimeRef.current,
      torTime,
      vodTime,
      vodChecklist,
      cprCycleStartTime: cprCycleStartTimeRef.current,
      stackedShockExtra,
    };
    setUndoHistory((prev) => [...prev, currentState]);
  };

  const undo = () => {
    if (undoHistory.length === 0) return;
    setUndoHistory((prev) => prev.slice(0, -1));
    applyUndoState(undoHistory[undoHistory.length - 1]);
  };

  // Reverts everything done since undoDepth was `depth`, e.g. all the actions from one spoken phrase.
  const undoToDepth = (depth: number) => {
    if (depth < 0 || depth >= undoHistory.length) return;
    setUndoHistory((prev) => prev.slice(0, depth));
    applyUndoState(undoHistory[depth]);
  };

  const applyUndoState = (lastState: UndoState) => {
    setArrestState(lastState.arrestState);
    setMasterTime(lastState.masterTime);
    setCprTime(lastState.cprTime);
    setTimeOffset(lastState.timeOffset);
    setEvents(lastState.events);
    setShockCount(lastState.shockCount);
    setStackedShockExtra(lastState.stackedShockExtra ?? 0);
    setAdrenalineCount(lastState.adrenalineCount);
    setAmiodaroneCount(lastState.amiodaroneCount);
    setLidocaineCount(lastState.lidocaineCount);
    lastAdrenalineTimeRef.current = lastState.lastAdrenalineTime;
    if (lastState.cprCycleStartTime !== undefined) {
      cprCycleStartTimeRef.current = lastState.cprCycleStartTime;
    }
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
    setHideAdrenalineDueWarning(lastState.hideAdrenalineDueWarning ?? false);
    setLastRhythmNonShockable(lastState.lastRhythmNonShockable ?? false);
    setAirwayAdjunct(lastState.airwayAdjunct ?? null);
    setRoscTime(lastState.roscTime ?? null);
    setIsTimerPaused(lastState.isTimerPaused ?? false);
    pauseStartTimeRef.current = lastState.pauseStartTime ?? null;
    setTorTime(lastState.torTime ?? null);
    setVodTime(lastState.vodTime ?? null);
    setVodChecklist(lastState.vodChecklist ?? AppConstants.vodChecklistTemplate());

    if (
      (lastState.arrestState === ArrestState.Active || lastState.arrestState === ArrestState.Rosc) &&
      !lastState.isTimerPaused
    ) {
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
    voicePromptPlayer.stopAll();
    logEvent("Arrest Timer Paused", EventType.Status);
  };

  const resumeArrest = () => {
    saveUndoState();
    setIsTimerPaused(false);
    if (pauseStartTimeRef.current && startTimeRef.current) {
      const pausedDuration = Date.now() - pauseStartTimeRef.current.getTime();
      startTimeRef.current = new Date(startTimeRef.current.getTime() + pausedDuration);
    }
    pauseStartTimeRef.current = null;
    startTimer();
    logEvent("Arrest Timer Resumed", EventType.Status);
  };

  // Keep the screen on for the whole case; an auto-lock mid-arrest hides the cycle timer and prompts.
  // The browser drops the lock whenever the page is hidden, so it is re-requested on return.
  useEffect(() => {
    if (arrestState !== ArrestState.Active && arrestState !== ArrestState.Rosc) return;
    if (!("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const requestLock = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release();
        } else {
          sentinel = lock;
        }
      } catch {
        // Refused (e.g. low battery mode); the app still works, the screen may just dim.
      }
    };

    requestLock();
    document.addEventListener("visibilitychange", requestLock);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", requestLock);
      sentinel?.release();
    };
  }, [arrestState]);

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
      setCprTime((prevCprTime) => {
        if (newCprTime <= 10 && newCprTime > 0) HapticManager.impact("light");
        if (prevCprTime > 0 && newCprTime <= 0) HapticManager.notification("warning");
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
    voicePromptPlayer.unlock();
    // A mute from the last case shouldn't silently carry into the next one.
    voicePromptPlayer.setMutedForCase(false);

    if (priorStartTime) {
      startTimeRef.current = priorStartTime;
      const elapsed = (Date.now() - priorStartTime.getTime()) / 1000;
      setTimeOffset(priorTimeOffset ?? 0);
      setMasterTime(elapsed);
      setEvents(priorEvents ?? []);
      cprCycleStartTimeRef.current = elapsed + (priorTimeOffset ?? 0);
    } else {
      startTimeRef.current = new Date();
      // Downtime can be entered before Start, so the first cycle begins at the current total time.
      cprCycleStartTimeRef.current = timeOffset;
      // Time added before Start counts back from the Start tap, which is now.
      setEvents((prev) =>
        prev.map((e) => (isConfirmedEntry(e) ? { ...e, clock: Date.now() / 1000 - timeOffset } : e)),
      );
    }

    setArrestState(ArrestState.Active);
    setInitialRhythm(null);
    logEvent(`${priorStartTime ? "Transitioned to Paediatric ALS" : "Arrest Started"} at ${hhmm(new Date())}`, EventType.Status);

    if (!priorStartTime) {
      if (researchActive || askForPatientInfo) {
        setShowPatientInfoPrompt(true);
      }
    }
  };

  const analyseRhythm = () => {
    saveUndoState();
    // "Not now" lasts until the next rhythm check, not the rest of the arrest.
    const hides = promptHidesAfterAnalysis();
    setHideAdrenalinePrompt(hides.hideAdrenalinePrompt);
    setHideAdrenalineDueWarning(hides.hideAdrenalineDueWarning);
    setLastRhythmNonShockable(false);
    setUiState(UIState.Analyzing);
    logEvent("Rhythm analysis. Pausing CPR.", EventType.Analysis);
    // After the analysis entry, so a "(voice)" mark goes on the right one.
    if (isLastAdrenalineTimeUnknown) markLastAdrenalineTime(null);
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

  const deliverShock = (energy: string | null = null) => {
    saveUndoState();
    setShockCount((c) => c + 1);
    setHideAdrenalinePrompt(false);
    setHideAmiodaronePrompt(false);
    const energyText = energy ? ` (${energy})` : "";
    logEvent(`Shock ${shockCount + 1} Delivered${energyText}`, EventType.Shock);
    resumeCPR();
  };

  // RCUK 2025: for a witnessed, monitored VF/pVT arrest with a defibrillator immediately available,
  // up to three stacked shocks may be given. They count as the first shock for drug timing.
  const deliverStackedShocks = () => {
    if (shockCount !== 0) return;
    saveUndoState();
    setShockCount(3);
    setStackedShockExtra(2);
    setHideAdrenalinePrompt(false);
    setHideAmiodaronePrompt(false);
    logEvent("3 Stacked Shocks Delivered (count as one for drug timing)", EventType.Shock);
    resumeCPR();
  };

  const resumeCPR = () => {
    if (!startTimeRef.current) return;
    setUiState(UIState.Default);
    cprCycleStartTimeRef.current = actionTime();
    setCprTime(cprCycleDuration);
    logEvent("Resuming CPR.", EventType.Cpr);
  };

  // alwaysRecordDose: a dose that was spoken is recorded even when dosage prompts are switched off.
  const logAdrenaline = (dosage: string | null = null, alwaysRecordDose = false) => {
    saveUndoState();
    setAdrenalineCount((c) => c + 1);
    // A dose logged late ("adrenaline at 14:52") mustn't restart the timer from before a later dose.
    lastAdrenalineTimeRef.current = Math.max(lastAdrenalineTimeRef.current ?? actionTime(), actionTime());
    setLastRhythmNonShockable(false);
    setHideAdrenalinePrompt(false);
    setHideAdrenalineDueWarning(false);
    const dosageText = (showDosagePrompts || alwaysRecordDose) && dosage ? ` (${dosage})` : "";
    logEvent(`Adrenaline${dosageText} Given – Dose ${adrenalineCount + 1}`, EventType.Drug);
  };

  const logAmiodarone = (dosage: string | null = null, alwaysRecordDose = false) => {
    saveUndoState();
    setAmiodaroneCount((c) => c + 1);
    setAntiarrhythmicGiven(AntiarrhythmicDrug.Amiodarone);
    if (amiodaroneCount === 0) {
      shockCountForAmiodarone1Ref.current = shockCount;
    }
    setHideAmiodaronePrompt(false);
    const dosageText = (showDosagePrompts || alwaysRecordDose) && dosage ? ` (${dosage})` : "";
    logEvent(`Amiodarone${dosageText} Given – Dose ${amiodaroneCount + 1}`, EventType.Drug);
  };

  const logLidocaine = (dosage: string | null = null, alwaysRecordDose = false) => {
    saveUndoState();
    setLidocaineCount((c) => c + 1);
    setAntiarrhythmicGiven(AntiarrhythmicDrug.Lidocaine);
    const dosageText = (showDosagePrompts || alwaysRecordDose) && dosage ? ` (${dosage})` : "";
    logEvent(`Lidocaine${dosageText} Given – Dose ${lidocaineCount + 1}`, EventType.Drug);
  };

  const logOtherDrug = (drug: string, dosage: string | null = null, alwaysRecordDose = false) => {
    saveUndoState();
    const dosageText = (showDosagePrompts || alwaysRecordDose) && dosage ? ` (${dosage})` : "";
    logEvent(`${drug}${dosageText} Given`, EventType.Drug);
  };

  // The first trauma procedure marks the arrest as traumatic; it can be switched off again.
  const logTraumaProcedure = (procedure: string) => {
    saveUndoState();
    // Requesting critical care happens in medical arrests too, and after ROSC nothing should quieten prompts.
    if (!isTraumaArrest && arrestState === ArrestState.Active && TRAUMA_MARKS_ARREST.has(procedure)) {
      logEvent(TRAUMA_ON_ENTRY, EventType.Status);
    }
    logEvent(traumaEntryText(procedure), EventType.Airway);
  };

  const setTraumaArrest = (isTrauma: boolean) => {
    if (isTrauma === isTraumaArrest) return;
    saveUndoState();
    logEvent(isTrauma ? TRAUMA_ON_ENTRY : TRAUMA_OFF_ENTRY, EventType.Status);
  };

  // Still traumatic, but HOTT is dealt with: back to standard ALS drug prompts without recording "not trauma".
  const restoreDrugPrompts = () => {
    if (!areDrugPromptsQuietened) return;
    saveUndoState();
    logEvent(TRAUMA_PROMPTS_RESTORED_ENTRY, EventType.Status);
  };

  const completePostROSCTask = (name: string) => {
    if (arrestState === ArrestState.Rosc) setPostROSCTasks((tasks) => completeTask(tasks, name));
  };

  const logObservation = (observation: ROSCObservation, value: string) => {
    saveUndoState();
    logEvent(observationEntry(observation, value), observation === "etco2" ? EventType.Etco2 : EventType.Status);
    // A reading off target leaves the target unticked: a tick must mean it's achieved, not just measured.
    if (meetsTarget(observation, value)) completePostROSCTask(ROSC_OBSERVATIONS[observation].checklistItem);
  };

  const logDestination = (text: string) => {
    saveUndoState();
    logEvent(text, EventType.Status);
    completePostROSCTask(DESTINATION_TASK);
  };

  const latestObservation = (observation: ROSCObservation) => latestObservationIn(events, observation);

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
  const logVascularAccess = (accessType: "IV" | "IO", location: string, gauge: string, successful: boolean) => {
    saveUndoState();
    const parts = [`Vascular Access (${accessType})`];
    if (location || gauge) {
      const details = [location, gauge].filter(Boolean).join(", ");
      parts[0] += ` – ${details}`;
    }
    parts[0] += successful ? " – Secured" : " – Failed";
    logEvent(parts[0], EventType.VascularAccess);
  };

  const logEtco2 = (value: string, spokenUnit: "kPa" | "mmHg" | null = null) => {
    // Some keyboards produce a comma as the decimal separator.
    const reading = Number(value.replace(",", "."));
    if (!value || isNaN(reading) || reading <= 0) return;
    saveUndoState();
    const unit = spokenUnit ?? etco2Unit;
    const formatted = unit === "kPa" ? reading.toFixed(1) : String(Math.round(reading));
    logEvent(`ETCO2: ${formatted} ${unit}`, EventType.Etco2);
    completePostROSCTask(ROSC_OBSERVATIONS.etco2.checklistItem);
  };

  const achieveROSC = () => {
    saveUndoState();
    setArrestState(ArrestState.Rosc);
    setUiState(UIState.Default);
    setRoscTime(actionTime());
    voicePromptPlayer.stopAll();
    logEvent("Return of Spontaneous Circulation (ROSC)", EventType.Status);
  };

  // TOR = Termination of Resuscitation (CPR stops, but not yet VOD)
  const confirmTOR = () => {
    saveUndoState();
    setArrestState(ArrestState.Ended);
    setTorTime(totalArrestTime);
    stopTimer();
    voicePromptPlayer.stopAll();
    logEvent("Termination of Resuscitation (TOR)", EventType.Status);
  };

  // VOD = Verification of Death (after 5-min observation)
  const confirmVOD = () => {
    saveUndoState();
    setVodTime(totalArrestTime);
    setVodConfirmed(true);
    logEvent("Verification of Death (VOD) Confirmed", EventType.Status);
  };

  // Toggle VOD checklist items
  const toggleVodChecklistItem = (itemId: string) => {
    saveUndoState();
    setVodChecklist((prev) => prev.map((i) => (i.id === itemId ? { ...i, isCompleted: !i.isCompleted } : i)));
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
    setTimeBeforeStart(timeOffset + seconds);
  };

  // How long before the Start tap the first ambulance resource confirmed the arrest. Everything already
  // recorded keeps its real moment, so it all moves by the same amount. Returns false, changing nothing,
  // if that would put an entry before 00:00 (matches iOS).
  const setTimeBeforeStart = (offset: number): boolean => {
    const newOffset = Math.max(0, offset);
    const delta = newOffset - timeOffset;
    if (delta === 0) return true;
    const kept = events.filter((e) => !isConfirmedEntry(e));
    if (kept.length > 0 && Math.min(...kept.map((e) => e.timestamp)) + delta < 0) return false;
    if (cprCycleStartTimeRef.current + delta < 0) return false;

    saveUndoState();
    setTimeOffset(newOffset);
    cprCycleStartTimeRef.current += delta;
    if (lastAdrenalineTimeRef.current !== null) lastAdrenalineTimeRef.current += delta;
    setRoscTime((t) => (t === null ? t : t + delta));
    setTorTime((t) => (t === null ? t : t + delta));
    setVodTime((t) => (t === null ? t : t + delta));
    setEvents((prev) => {
      const shifted = prev.filter((e) => !isConfirmedEntry(e)).map((e) => ({ ...e, timestamp: e.timestamp + delta }));
      if (newOffset > 0) {
        // Its clock time is the Start tap's, less the time added.
        const started = shifted.find((e) => e.message.startsWith("Arrest Started") || e.message.includes("Life Support Started"));
        const clock =
          started?.clock !== undefined ? started.clock - started.timestamp : Date.now() / 1000 - newOffset;
        shifted.push({
          timestamp: 0,
          message: `Cardiac arrest confirmed ~${Math.round(newOffset / 60)} min before eResus was started (estimated)`,
          type: EventType.Status,
          clock,
        });
      }
      return shifted;
    });
    return true;
  };

  // Shocks and drugs given before eResus, times unknown, recorded at the moment eResus was started.
  // Several at once share one undo step. Returns false if it conflicts with the antiarrhythmic already recorded.
  const logBeforeStart = (counts: Partial<Record<GivenItem, number>>): boolean => {
    const shocks = counts.shock ?? 0;
    const adrenaline = counts.adrenaline ?? 0;
    const amiodarone = counts.amiodarone ?? 0;
    const lidocaine = counts.lidocaine ?? 0;
    if (amiodarone > 0 && (antiarrhythmicGiven === AntiarrhythmicDrug.Lidocaine || lidocaine > 0)) return false;
    if (lidocaine > 0 && antiarrhythmicGiven === AntiarrhythmicDrug.Amiodarone) return false;
    if (shocks + adrenaline + amiodarone + lidocaine === 0) return true;
    if (arrestState !== ArrestState.Active) return false;

    saveUndoState();
    const entries: [string, EventType][] = [];
    if (shocks > 0) {
      setShockCount((c) => c + shocks);
      setHideAdrenalinePrompt(false);
      setHideAmiodaronePrompt(false);
      // Amiodarone recorded before the shocks was timed from too few shocks; now the count is known.
      const anchor = shockCountForAmiodarone1Ref.current;
      if (amiodarone === 0 && amiodaroneCount > 0 && anchor !== null && anchor < 3 + stackedShockExtra) {
        shockCountForAmiodarone1Ref.current = Math.min(3 + stackedShockExtra, shockCount + shocks);
      }
      entries.push([shocks === 1 ? "1 shock" : `${shocks} shocks`, EventType.Shock]);
    }
    if (adrenaline > 0) {
      setAdrenalineCount((c) => c + adrenaline);
      entries.push([`Adrenaline ×${adrenaline}`, EventType.Drug]);
    }
    if (amiodarone > 0) {
      setAmiodaroneCount((c) => c + amiodarone);
      setAntiarrhythmicGiven(AntiarrhythmicDrug.Amiodarone);
      // RCUK: the first dose follows the 3rd shock. If fewer shocks are known the count is probably
      // incomplete, so time the next dose from now rather than waiting for shocks that already happened.
      if (shockCountForAmiodarone1Ref.current === null) {
        const totalShocks = shockCount + shocks;
        shockCountForAmiodarone1Ref.current = totalShocks - stackedShockExtra >= 3 ? 3 + stackedShockExtra : totalShocks;
      }
      entries.push([`Amiodarone ×${amiodarone}`, EventType.Drug]);
    }
    if (lidocaine > 0) {
      setLidocaineCount((c) => c + lidocaine);
      setAntiarrhythmicGiven(AntiarrhythmicDrug.Lidocaine);
      entries.push([`Lidocaine ×${lidocaine}`, EventType.Drug]);
    }
    for (const [message, type] of entries) logAtStart(`${message} before eResus, times unknown (estimated)`, type);
    return true;
  };

  // A drug or trauma intervention from before eResus, said in a handover. Recorded at the start, time unknown.
  const logOtherBeforeStart = (name: string): boolean => {
    if (arrestState !== ArrestState.Active) return false;
    saveUndoState();
    const isProcedure = isTraumaProcedureName(name);
    if (!isTraumaArrest && TRAUMA_MARKS_ARREST.has(name)) logEvent(TRAUMA_ON_ENTRY, EventType.Status);
    logAtStart(`${name} before eResus, time unknown (estimated)`, isProcedure ? EventType.Airway : EventType.Drug);
    return true;
  };

  // A rhythm from before eResus: recorded only, it doesn't start a rhythm check or advise a shock.
  const logEarlierRhythm = (rhythm: string) => {
    saveUndoState();
    if (initialRhythm === null) setInitialRhythm(rhythm);
    logAtStart(`Rhythm before eResus: ${rhythm} (estimated)`, EventType.Rhythm);
  };

  const setLastAdrenaline = (minutesAgo: number | null) => {
    if (!isLastAdrenalineTimeUnknown) return;
    saveUndoState();
    markLastAdrenalineTime(minutesAgo);
  };

  const markLastAdrenalineTime = (minutesAgo: number | null) => {
    if (minutesAgo !== null) {
      lastAdrenalineTimeRef.current = actionTime() - minutesAgo * 60;
      logEvent(`Last adrenaline ~${minutesAgo} min ago (estimated)`, EventType.Status);
    } else {
      lastAdrenalineTimeRef.current = actionTime() - currentAdrenalineInterval;
      logEvent("Last adrenaline time unknown: treated as due now", EventType.Status);
    }
  };

  const logAtStart = (message: string, type: EventType) => {
    const previous = eventTimeOverrideRef.current;
    eventTimeOverrideRef.current = timeOffset;
    logEvent(message, type);
    eventTimeOverrideRef.current = previous;
  };

  const toggleChecklistItemCompletion = (item: ChecklistItem) => {
    saveUndoState();
    const updateList = (list: ChecklistItem[]) =>
      list.map((i) => (i.id === item.id ? { ...i, isCompleted: !i.isCompleted } : i));

    setReversibleCauses(updateList);
    setPostROSCTasks(updateList);
    setPostMortemTasks(updateList);

    // Plain words for the record: "checked" could be read as "excluded" or "target achieved".
    const isCause = reversibleCauses.some((cause) => cause.name === item.name);
    logEvent(checklistToggleEntry(item.name, !item.isCompleted, isCause), EventType.Cause);
  };

  const setHypothermiaStatus = (status: HypothermiaStatus) => {
    saveUndoState();
    setReversibleCauses((list) =>
      list.map((i) =>
        i.name === "Hypothermia"
          ? { ...i, hypothermiaStatus: status, isCompleted: status !== HypothermiaStatus.None }
          : i,
      ),
    );
    logEvent(`Hypothermia status set to: ${status}`, EventType.Cause);
  };

  // RCUK 2025: consider IO if IV access isn't achieved within two attempts.
  // Counts the iOS wording too, since transferred sessions can contain either.
  const failedIVAttempts = useMemo(
    () =>
      events.filter(
        (e) =>
          (e.message.startsWith("Vascular Access (IV)") && e.message.endsWith("Failed")) ||
          (e.message.startsWith("IV Access") && e.message.endsWith("- Unsuccessful")),
      ).length,
    [events],
  );

  // Dynamically count lidocaine from events (fixes iOS parity issue)
  const dynamicLidocaineCount = useMemo(() => lidocaineDosesIn(events), [events]);

  const summaryInput = () => ({
    events,
    totalTime: totalArrestTime,
    startTime: startTimeRef.current,
    shockCount,
    adrenalineCount,
    amiodaroneCount,
    lidocaineCount: Math.max(lidocaineCount, dynamicLidocaineCount),
    patientAge: patientAgeStr || null,
    patientGender: patientGenderStr || null,
  });

  const copySummaryToClipboard = () => {
    navigator.clipboard
      .writeText(buildSummary(summaryInput()).copyText)
      .then(() => HapticManager.notification("success"))
      .catch((err) => console.error("Failed to copy summary: ", err));
  };

  const saveLogToDatabase = async () => {
    if (!startTimeRef.current) return;

    let finalOutcome: string;
    switch (arrestState) {
      case ArrestState.Rosc:
        finalOutcome = "ROSC";
        break;
      case ArrestState.Ended:
        finalOutcome = "Deceased";
        break;
      default:
        finalOutcome = "Incomplete";
    }

    const logData: any = {
      startTime: startTimeRef.current.toISOString(),
      totalDuration: totalArrestTime,
      finalOutcome,
      userId,
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
      timeBeforeStart: timeBeforeStart(events),
      // 3: event times count from when the arrest was confirmed, including time before eResus was started.
      // Sessions from older builds added "downtime" that may have been before arrival (matches iOS).
      timingVersion: events.some((e) => e.message.startsWith("Time offset added")) ? 2 : 3,
    };

    // Clock times stay in the user's own logbook; the research copy below leaves them out, as iOS does.
    const eventsCopy = events.map((e) => ({
      timestamp: e.timestamp,
      message: e.message,
      type: e.type,
      estimated: isEstimated(e.message),
      ...(e.clock !== undefined ? { clock: e.clock } : {}),
    }));

    if (!navigator.onLine) {
      // Queue for later sync
      addToOfflineLogQueue({
        logData,
        events: eventsCopy,
        userId,
        researchModeEnabled: researchActive,
        queuedAt: Date.now(),
      });
      console.log("Offline: arrest log queued for sync");
      HapticManager.notification("warning");
      return;
    }

    try {
      const logsCollectionPath = `/artifacts/${appId}/users/${userId}/logs`;

      const firestoreLogDoc = {
        ...logData,
        startTime: Timestamp.fromDate(startTimeRef.current),
      };

      const logDocRef = await addDoc(collection(db, logsCollectionPath), firestoreLogDoc);

      const eventsCollectionRef = collection(db, `${logsCollectionPath}/${logDocRef.id}/events`);
      for (const event of eventsCopy) {
        await addDoc(eventsCollectionRef, event);
      }

      if (researchActive) {
        try {
          const researchData: any = {
            startTime: Timestamp.fromDate(startTimeRef.current),
            totalDuration: totalArrestTime,
            finalOutcome,
            shockCount,
            adrenalineCount,
            amiodaroneCount,
            lidocaineCount: Math.max(lidocaineCount, dynamicLidocaineCount),
            patientAge: patientAgeStr || "Unknown",
            patientGender: patientGenderStr || "Unknown",
            initialRhythm: initialRhythm || "Unknown",
            organization: userOrganization || "Unknown",
            uid: userId,
            timestamp: serverTimestamp(),
            timeBeforeStart: logData.timeBeforeStart,
            timingVersion: logData.timingVersion,
          };
          if (roscTime !== null) researchData.roscTime = roscTime;
          if (torTime !== null) researchData.torTime = torTime;
          if (vodTime !== null) researchData.vodTime = vodTime;

          await setDoc(doc(db, "arrestLogs", logDocRef.id), researchData);

          for (const event of eventsCopy) {
            await addDoc(collection(db, `arrestLogs/${logDocRef.id}/events`), {
              timestamp: event.timestamp,
              message: event.message,
              type: event.type,
              estimated: isEstimated(event.message),
            });
          }

          await updateDoc(doc(db, logsCollectionPath, logDocRef.id), { isSynced: true });
        } catch (e) {
          console.error("Error uploading to research collection:", e);
        }
      }
    } catch (e) {
      console.error("Error saving log to Firestore, queuing offline: ", e);
      // Queue for later sync on any Firestore failure
      addToOfflineLogQueue({
        logData,
        events: eventsCopy,
        userId,
        researchModeEnabled: researchActive,
        queuedAt: Date.now(),
      });
      HapticManager.notification("warning");
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
    setStackedShockExtra(0);
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
    setHideAdrenalineDueWarning(false);
    setLastRhythmNonShockable(false);
    setAirwayAdjunct(null);
    setRoscTime(null);
    setTorTime(null);
    setVodTime(null);
    setVodChecklist(AppConstants.vodChecklistTemplate());
    setVodConfirmed(false);
    setPatientAgeStr("");
    setPatientGenderStr("");
    setInitialRhythm(null);
    setShowPatientInfoPrompt(false);
    localStorage.removeItem(ARREST_SESSION_KEY);
  };

  // Flush localStorage offline queue
  const flushOfflineLogQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    const queue = getOfflineLogQueue();
    if (queue.length === 0) return;

    console.log(`Flushing ${queue.length} offline queued logs`);
    const failedIndices: number[] = [];

    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i];
      try {
        const logsCollectionPath = `/artifacts/${appId}/users/${entry.userId}/logs`;
        const firestoreLogDoc = {
          ...entry.logData,
          startTime: Timestamp.fromDate(new Date(entry.logData.startTime)),
        };
        const logDocRef = await addDoc(collection(db, logsCollectionPath), firestoreLogDoc);

        for (const event of entry.events) {
          await addDoc(collection(db, `${logsCollectionPath}/${logDocRef.id}/events`), event);
        }

        if (entry.researchModeEnabled) {
          try {
            const researchData: any = {
              startTime: Timestamp.fromDate(new Date(entry.logData.startTime)),
              totalDuration: entry.logData.totalDuration,
              finalOutcome: entry.logData.finalOutcome,
              shockCount: entry.logData.shockCount ?? 0,
              adrenalineCount: entry.logData.adrenalineCount ?? 0,
              amiodaroneCount: entry.logData.amiodaroneCount ?? 0,
              lidocaineCount: entry.logData.lidocaineCount ?? 0,
              patientAge: entry.logData.patientAge || "Unknown",
              patientGender: entry.logData.patientGender || "Unknown",
              initialRhythm: entry.logData.initialRhythm || "Unknown",
              organization: entry.logData.organization || "Unknown",
              uid: entry.userId,
              timestamp: serverTimestamp(),
              // Logs queued by older builds have no timing version; leave it off rather than guess.
              ...(entry.logData.timingVersion ? { timeBeforeStart: entry.logData.timeBeforeStart ?? 0, timingVersion: entry.logData.timingVersion } : {}),
            };
            if (entry.logData.roscTime !== null) researchData.roscTime = entry.logData.roscTime;
            if (entry.logData.torTime !== null) researchData.torTime = entry.logData.torTime;
            if (entry.logData.vodTime !== null) researchData.vodTime = entry.logData.vodTime;

            await setDoc(doc(db, "arrestLogs", logDocRef.id), researchData);
            for (const event of entry.events) {
              await addDoc(collection(db, `arrestLogs/${logDocRef.id}/events`), {
                timestamp: event.timestamp,
                message: event.message,
                type: event.type,
                estimated: isEstimated(event.message),
              });
            }
            await updateDoc(doc(db, logsCollectionPath, logDocRef.id), { isSynced: true });
          } catch (e) {
            console.error("Error syncing queued research data:", e);
          }
        }
      } catch (e) {
        console.error("Error flushing queued log:", e);
        failedIndices.push(i);
      }
    }

    // Keep only failed entries
    if (failedIndices.length === 0) {
      clearOfflineLogQueue();
    } else {
      const remaining = failedIndices.map(i => queue[i]);
      try { localStorage.setItem(OFFLINE_LOG_QUEUE_KEY, JSON.stringify(remaining)); } catch { }
    }

    if (queue.length - failedIndices.length > 0) {
      console.log(`Successfully synced ${queue.length - failedIndices.length} queued logs`);
    }
  }, [db]);

  // Offline Log Sweeper (existing Firestore-based)
  const syncOfflineLogs = useCallback(async () => {
    // Always try to flush the localStorage queue first
    await flushOfflineLogQueue();

    if (!researchActive || !user) return;
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
            patientAge: data.patientAge || "Unknown",
            patientGender: data.patientGender || "Unknown",
            initialRhythm: data.initialRhythm || "Unknown",
            organization: data.organization || "Unknown",
            uid: userId,
            timestamp: serverTimestamp(),
          };
          if (data.roscTime) researchData.roscTime = data.roscTime;
          if (data.torTime) researchData.torTime = data.torTime;
          if (data.vodTime) researchData.vodTime = data.vodTime;

          await setDoc(doc(db, "arrestLogs", logDoc.id), researchData);

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
  }, [db, userId, user, researchActive, flushOfflineLogQueue]);

  useEffect(() => {
    syncOfflineLogs();
    const handleFocus = () => syncOfflineLogs();
    const handleOnline = () => {
      console.log("Device back online, syncing queued logs...");
      syncOfflineLogs();
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncOfflineLogs();
    });
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
    };
  }, [syncOfflineLogs]);

  // QR Session Transfer
  const generateTransferState = (): SessionSnapshot => ({
    arrestState,
    masterTime,
    cprTime,
    timeOffset,
    events,
    shockCount,
    stackedShockExtra,
    adrenalineCount,
    amiodaroneCount,
    lidocaineCount,
    airwayPlaced,
    antiarrhythmicGiven,
    reversibleCauses,
    postROSCTasks,
    postMortemTasks,
    patientAgeCategory,
    uiState,
    hideAdrenalinePrompt,
    hideAmiodaronePrompt,
    lastRhythmNonShockable,
    airwayAdjunct,
    roscTime,
    isTimerPaused,
    startTime: startTimeRef.current,
    cprCycleStartTime: cprCycleStartTimeRef.current,
    lastAdrenalineTime: lastAdrenalineTimeRef.current,
    shockCountForAmiodarone1: shockCountForAmiodarone1Ref.current,
    initialRhythm,
    patientAgeStr,
    patientGenderStr,
    torTime,
    vodTime,
    vodChecklist,
    vodConfirmed,
  });

  const hostSessionTransfer = async (): Promise<string | null> => {
    try {
      const state = generateTransferState();
      // Pick a code that isn't already in use, so two crews transferring at once can't overwrite each other.
      let transferId: string | null = null;
      for (let attempt = 0; attempt < 5 && !transferId; attempt++) {
        const candidate = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
        if (!(await getDoc(doc(db, "transfers", candidate))).exists()) transferId = candidate;
      }
      if (!transferId) return null;
      // Firestore Bytes, which iOS reads as Data. See docs/session-format.md.
      const encodedStateData = Bytes.fromUint8Array(new TextEncoder().encode(encodeSession(state)));
      await setDoc(doc(db, "transfers", transferId), {
        stateData: encodedStateData,
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
      const normalizedTransferId = transferId.replace(/\D/g, "").slice(0, 6);
      if (normalizedTransferId.length !== 6) {
        return { success: false, error: "Enter a valid 6-digit transfer code." };
      }

      const transferRef = doc(db, "transfers", normalizedTransferId);
      const transferDoc = await getDoc(transferRef);
      if (!transferDoc.exists()) {
        return { success: false, error: "Transfer not found. Check the code and try again." };
      }

      const data = transferDoc.data();
      const expiresAt =
        data.expiresAt instanceof Timestamp ? data.expiresAt.toDate() : (data.expiresAt?.toDate?.() ?? null);

      if (expiresAt && expiresAt.getTime() <= Date.now()) {
        try {
          await deleteDoc(transferRef);
        } catch {
          // Ignore cleanup failures for expired transfers
        }
        return { success: false, error: "This transfer code has expired. Generate a new code and try again." };
      }

      // stateData is Bytes (current), or a JSON or base64 string from older builds.
      const rawStateData = data.stateData;
      const stateText =
        rawStateData instanceof Bytes ? new TextDecoder().decode(rawStateData.toUint8Array()) : String(rawStateData);
      const wire = parseStateData(stateText);

      // The web app has no newborn transfer support yet. Refuse rather than silently treating it as ALS,
      // and leave the code valid so it can still be received on an iPhone or iPad.
      if (wire.arrestType === "NEWBORN") {
        return {
          success: false,
          error:
            "This is a newborn life support session. It can't be opened in the web app yet. Receive it on an iPhone or iPad with eResus instead.",
        };
      }

      const session = decodeSession(wire, cprCycleDuration);

      stopTimer();
      startTimeRef.current = session.startTime;
      cprCycleStartTimeRef.current = session.cprCycleStartTime;
      lastAdrenalineTimeRef.current = session.lastAdrenalineTime;
      shockCountForAmiodarone1Ref.current = session.shockCountForAmiodarone1;

      // The sender's masterTime is stale by the time it arrives, so recompute from the start time.
      const realElapsed = session.startTime ? (Date.now() - session.startTime.getTime()) / 1000 : session.masterTime;

      const transferEvent: Event = {
        timestamp: realElapsed + session.timeOffset,
        message: "Session Transferred from another device",
        type: EventType.Status,
        clock: Date.now() / 1000,
      };

      setArrestState(session.arrestState as ArrestState);
      setMasterTime(realElapsed);
      setCprTime(session.cprTime);
      setTimeOffset(session.timeOffset);
      setEvents([transferEvent, ...(session.events as Event[])]);
      setShockCount(session.shockCount);
      setStackedShockExtra(session.stackedShockExtra);
      setAdrenalineCount(session.adrenalineCount);
      setAmiodaroneCount(session.amiodaroneCount);
      setLidocaineCount(session.lidocaineCount);
      setAirwayPlaced(session.airwayPlaced);
      setAntiarrhythmicGiven(session.antiarrhythmicGiven as AntiarrhythmicDrug);
      setReversibleCauses(session.reversibleCauses as ChecklistItem[]);
      setPostROSCTasks(session.postROSCTasks as ChecklistItem[]);
      setPostMortemTasks(session.postMortemTasks as ChecklistItem[]);
      setPatientAgeCategory(session.patientAgeCategory as PatientAgeCategory | null);
      setUiState(session.uiState as UIState);
      setHideAdrenalinePrompt(session.hideAdrenalinePrompt);
      setHideAmiodaronePrompt(session.hideAmiodaronePrompt);
      setHideAdrenalineDueWarning(false);
      setLastRhythmNonShockable(session.lastRhythmNonShockable);
      setAirwayAdjunct(session.airwayAdjunct as AirwayAdjunctType | null);
      setRoscTime(session.roscTime);
      setIsTimerPaused(session.isTimerPaused);
      setInitialRhythm(session.initialRhythm);
      setPatientAgeStr(session.patientAgeStr);
      setPatientGenderStr(session.patientGenderStr);
      setTorTime(session.torTime);
      setVodTime(session.vodTime);
      setVodChecklist((session.vodChecklist as ChecklistItem[] | null) ?? AppConstants.vodChecklistTemplate());
      setVodConfirmed(session.vodConfirmed);
      setUndoHistory([]);

      // Delete the transfer document
      try {
        await deleteDoc(transferRef);
      } catch {
        /* non-critical */
      }

      // Start timer if arrest is active and not paused
      if (
        (session.arrestState === ArrestState.Active || session.arrestState === ArrestState.Rosc) &&
        !session.isTimerPaused
      ) {
        // Use setTimeout to ensure state has settled before starting timer
        setTimeout(() => startTimer(), 50);
      }

      HapticManager.notification("success");
      return { success: true };
    } catch (e: any) {
      console.error("Error receiving session transfer:", e);
      if (e?.code === "permission-denied") {
        return {
          success: false,
          error: "Transfer access is blocked by Firestore rules. Update the transfers read rule and try again.",
        };
      }
      return { success: false, error: "Transfer not found. Check the code and try again." };
    }
  };

  return {
    // State
    arrestState,
    masterTime,
    cprTime,
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
    isTimerPaused,
    hideAdrenalinePrompt,
    hideAmiodaronePrompt,
    roscTime,
    airwayAdjunct,
    startTime: startTimeRef.current,
    // v1.2 research
    patientAgeStr,
    setPatientAgeStr,
    patientGenderStr,
    setPatientGenderStr,
    initialRhythm,
    showPatientInfoPrompt,
    setShowPatientInfoPrompt,
    // v1.3 TOR/VOD
    torTime,
    vodTime,
    vodChecklist,
    vodConfirmed,
    dynamicLidocaineCount,

    // Computed
    totalArrestTime,
    resuscitationTime,
    isRhythmCheckDue,
    isAdrenalineHighlighted,
    isAmiodaroneHighlighted,
    shouldShowLidocaineReminder,
    failedIVAttempts,
    canUndo,
    isAdrenalineAvailable,
    isAmiodaroneAvailable,
    isLidocaineAvailable,
    timeUntilAdrenaline,
    shouldShowAmiodaroneReminder,
    shouldShowAdrenalinePrompt,
    shouldShowAmiodaroneFirstDosePrompt,
    adrenalineButtonDetail,
    amiodaroneButtonDetail,
    lidocaineButtonDetail,
    dismissAdrenalinePrompt,
    isTraumaArrest,
    areDrugPromptsQuietened,
    restoreDrugPrompts,
    isPaediatric: isPaediatricFrom(
      patientAgeCategory === null ? null : patientAgeCategory === PatientAgeCategory.Adult,
      patientAgeStr,
    ),
    currentRhythm: currentRhythmFrom(events),
    torCaution: torCautionFrom(reversibleCauses),
    traumaInterventionCount,
    summaryInput,

    // Recovery
    showRecoveryPrompt,
    resumeRecoveredSession,
    discardRecoveredSession,

    // Actions
    startArrest,
    analyseRhythm,
    logRhythm,
    deliverShock,
    resumeCPR,
    logAdrenaline,
    logAmiodarone,
    logLidocaine,
    logOtherDrug,
    logTraumaProcedure,
    setTraumaArrest,
    logObservation,
    logDestination,
    latestObservation,
    logAirwayPlaced: logAirwayPlacedFn,
    logVascularAccess,
    logEtco2,
    achieveROSC,
    endArrest,
    confirmTOR,
    confirmVOD,
    toggleVodChecklistItem,
    reArrest,
    addTimeOffset,
    toggleChecklistItemCompletion,
    setHypothermiaStatus,
    setPatientAgeCategory,
    performReset,
    undo,
    undoToDepth,
    undoDepth: undoHistory.length,
    copySummaryToClipboard,
    pauseArrest,
    resumeArrest,
    setHideAdrenalinePrompt,
    setHideAmiodaronePrompt,
    deliverStackedShocks,
    stackedShockExtra,
    performFromVoice,
    drugTimingShockCount,
    arrestTime,
    dateFor,
    setTimeBeforeStart,
    logBeforeStart,
    logOtherBeforeStart,
    logEarlierRhythm,
    setLastAdrenaline,
    isLastAdrenalineTimeUnknown,
    // v1.2 transfer
    hostSessionTransfer,
    receiveSessionTransfer,
    generateTransferState,
  };
};

type ArrestViewModelType = ReturnType<typeof useArrestViewModel>;
const ArrestContext = createContext<ArrestViewModelType | null>(null);
const useArrest = () => useContext(ArrestContext)!;

//============================================================================
// MODAL COMPONENTS
//============================================================================

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
        <p className="text-xs text-gray-500 dark:text-gray-400">
          These details help ambulance trusts understand demographic differences in cardiac arrest outcomes.
        </p>
        <ActionButton title="Save" backgroundColor="bg-blue-600" foregroundColor="text-white" onClick={handleSave} />
      </div>
    </Modal>
  );
};

// Research Consent View
const ResearchConsentView: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const {
    researchModeEnabled,
    setResearchModeEnabled,
    setHasRespondedToResearchTerms,
    userOrganization,
    setUserOrganization,
  } = useSettings();
  const { db } = useFirebase();
  const [orgName, setOrgName] = useState(userOrganization || "Independent / None");
  const [availableOrgs, setAvailableOrgs] = useState<string[]>(["Independent / None"]);

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = onSnapshot(
      collection(db, "organizations"),
      (snapshot) => {
        const orgs = snapshot.docs
          .map((d) => d.data().name as string)
          .filter(Boolean)
          .sort();
        setAvailableOrgs(["Independent / None", ...orgs]);
      },
      () => {
        /* ignore errors */
      },
    );
    return () => unsubscribe();
  }, [isOpen, db]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/95 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <BarChart3 size={64} className="text-blue-500 mx-auto" />
        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">Help Advance Science</h2>
        <p className="text-sm text-center text-gray-600 dark:text-gray-400">
          eResus is partnering with researchers to track the effectiveness of interventions. By enrolling, your app will
          automatically upload anonymised records when an arrest concludes.
        </p>
        <a
          href="https://tech.aegismedicalsolutions.co.uk/eresus/data-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-sm text-blue-600 dark:text-blue-400 underline"
        >
          Read the Data Collection Policy & Agreement
        </a>
        <div className="space-y-2">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Select your Ambulance Trust / Organisation:
          </label>
          <select
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white text-sm"
          >
            {availableOrgs.map((org) => (
              <option key={org} value={org}>
                {org}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => {
            setResearchModeEnabled(true);
            setUserOrganization(orgName);
            setHasRespondedToResearchTerms(true);
            onClose();
          }}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold active:scale-95 transition-transform"
        >
          Enroll & Accept Terms
        </button>
        <button
          onClick={() => {
            setResearchModeEnabled(false);
            setHasRespondedToResearchTerms(true);
            onClose();
          }}
          className="w-full py-2 text-gray-500 dark:text-gray-400 font-medium"
        >
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
  const [receiveCode, setReceiveCode] = useState("");
  const [isReceiving, setIsReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState("");
  const [mode, setMode] = useState<"menu" | "send" | "receive">("menu");

  const handleHost = async () => {
    setIsHosting(true);
    const code = await hostSessionTransfer();
    setHostedCode(code);
    setIsHosting(false);
  };

  const handleReceive = async () => {
    if (receiveCode.length !== 6) return;
    setIsReceiving(true);
    setReceiveError("");
    const result = await receiveSessionTransfer(receiveCode);
    setIsReceiving(false);
    if (result.success) {
      onClose();
    } else {
      setReceiveError(result.error || "Transfer not found. Check the code and try again.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Transfer Arrest">
      <div className="space-y-4">
        {mode === "menu" && (
          <>
            <ActionButton
              title="Send to Another Device"
              icon={<QrCode size={18} />}
              backgroundColor="bg-purple-600"
              foregroundColor="text-white"
              onClick={() => {
                setMode("send");
                handleHost();
              }}
            />
            <ActionButton
              title="Receive from Another Device"
              icon={<QrCode size={18} />}
              backgroundColor="bg-blue-600"
              foregroundColor="text-white"
              onClick={() => setMode("receive")}
            />
          </>
        )}
        {mode === "send" && (
          <div className="text-center space-y-4">
            {isHosting ? (
              <p className="text-gray-600 dark:text-gray-400 animate-pulse">Preparing Transfer...</p>
            ) : hostedCode ? (
              <>
                <p className="font-semibold text-gray-700 dark:text-gray-300">
                  Scan on receiving device or enter code:
                </p>
                <div className="flex justify-center">
                  <QRCodeSVG value={hostedCode} size={180} />
                </div>
                <p className="font-mono text-3xl font-bold text-gray-900 dark:text-white tracking-widest">
                  {hostedCode}
                </p>
              </>
            ) : (
              <p className="text-red-500">Failed to generate transfer code.</p>
            )}
          </div>
        )}
        {mode === "receive" && (
          <div className="space-y-4">
            <p className="text-sm text-center text-gray-600 dark:text-gray-400">
              Enter the 6-digit code shown on the sending device:
            </p>
            <input
              type="text"
              value={receiveCode}
              onChange={(e) => setReceiveCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="w-full text-center text-3xl font-mono font-bold p-4 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl text-gray-900 dark:text-white tracking-[0.5em]"
            />
            {receiveError && <p className="text-sm text-red-500 text-center">{receiveError}</p>}
            <ActionButton
              title={isReceiving ? "Receiving..." : "Receive Session"}
              backgroundColor="bg-blue-600"
              foregroundColor="text-white"
              onClick={handleReceive}
              disabled={receiveCode.length !== 6 || isReceiving}
            />
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
  const [age, setAge] = useState(currentAge || "");
  const [gender, setGender] = useState(currentGender || "");

  const handleSave = async () => {
    try {
      const logPath = `/artifacts/${appId}/users/${userId}/logs/${logId}`;
      await updateDoc(doc(db, logPath), {
        patientAge: age || null,
        patientGender: gender || null,
      });

      try {
        const researchDocRef = doc(db, "arrestLogs", logId);
        const researchDoc = await getDoc(researchDocRef);
        if (researchDoc.exists()) {
          await updateDoc(researchDocRef, {
            patientAge: age || "Unknown",
            patientGender: gender || "Unknown",
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
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="e.g. 45"
            className="w-full p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Gender</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="w-full p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white"
          >
            <option value="">Unknown</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
        {currentRhythm && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Initial Rhythm</label>
            <p className="p-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-400">
              {currentRhythm} (auto-captured)
            </p>
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
    if (isIOS)
      return {
        device: "iPhone / iPad",
        steps: [
          "Tap the Share button at the bottom of Safari",
          'Scroll down and tap "Add to Home Screen"',
          'Tap "Add" in the top right corner',
        ],
      };
    if (isAndroid)
      return {
        device: "Android",
        steps: [
          "Tap the three-dot menu (⋮) in Chrome",
          'Tap "Add to Home screen" or "Install app"',
          'Confirm by tapping "Add"',
        ],
      };
    if (isMac)
      return {
        device: "Mac",
        steps: [
          'In Safari: File → "Add to Dock"',
          "In Chrome: click the install icon (⊕) in the address bar",
          'Or use Menu → "Install eResus…"',
        ],
      };
    if (isWindows)
      return {
        device: "Windows",
        steps: [
          "In Chrome/Edge: click the install icon (⊕) in the address bar",
          'Or use Menu → "Install eResus…"',
          "The app will appear in your Start menu",
        ],
      };
    return {
      device: "your device",
      steps: [
        'Look for an "Install" or "Add to Home Screen" option in your browser menu',
        "This creates a shortcut for quick, full-screen access",
        "The app works offline once installed",
      ],
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

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold active:scale-95 transition-transform"
        >
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
                <p>
                  <strong>Sync across devices</strong> - access your arrest logs from any phone, tablet, or computer.
                </p>
              </div>
              <div className="flex items-start space-x-3">
                <Shield size={18} className="text-green-500 mt-0.5 shrink-0" />
                <p>
                  <strong>Protect your data</strong> - anonymous logs are tied to this device only and can be lost if
                  you clear your browser.
                </p>
              </div>
              <div className="flex items-start space-x-3">
                <Users size={18} className="text-purple-500 mt-0.5 shrink-0" />
                <p>
                  <strong>Transfer arrests</strong> - seamlessly hand over active arrests between signed-in devices.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowAuthModal(true)}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold active:scale-95 transition-transform"
            >
              Sign Up / Sign In
            </button>
            <button onClick={onClose} className="w-full py-2 text-gray-500 dark:text-gray-400 font-medium">
              Skip for Now
            </button>
          </div>
        </div>
      )}
      <AuthView
        isOpen={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
        }}
      />
    </>
  );
};

// ============================================================================
// NEW: Vascular Access Modal (Log IV/IO)
// ============================================================================
const VascularAccessModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { logVascularAccess, failedIVAttempts } = useArrest();
  const [accessType, setAccessType] = useState<"IV" | "IO">("IV");

  // RCUK 2025: after two failed IV attempts, default to IO.
  useEffect(() => {
    if (isOpen) setAccessType(failedIVAttempts >= 2 ? "IO" : "IV");
  }, [isOpen, failedIVAttempts]);
  const [location, setLocation] = useState("");
  const [gauge, setGauge] = useState("");
  const [successful, setSuccessful] = useState(true);

  const handleSave = () => {
    logVascularAccess(accessType, location, gauge, successful);
    onClose();
    setLocation("");
    setGauge("");
    setSuccessful(true);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log Vascular Access">
      <div className="space-y-4">
        {failedIVAttempts >= 2 && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-tone-tint text-tone-on-tint text-sm">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <span>{failedIVAttempts} IV attempts unsuccessful. Consider IO access (RCUK 2025).</span>
          </div>
        )}
        <h3 className="text-tone-accent font-semibold text-sm">Access Details</h3>
        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl space-y-4">
          {/* IV/IO Toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
            <button
              onClick={() => setAccessType("IV")}
              className={`flex-1 py-2.5 text-center font-semibold transition-colors ${
                accessType === "IV"
                  ? "bg-gray-400 dark:bg-gray-500 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              }`}
            >
              IV
            </button>
            <button
              onClick={() => setAccessType("IO")}
              className={`flex-1 py-2.5 text-center font-semibold transition-colors ${
                accessType === "IO"
                  ? "bg-gray-400 dark:bg-gray-500 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              }`}
            >
              IO
            </button>
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
              ${successful ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 
              transition duration-200 ease-in-out ${successful ? "translate-x-5" : "translate-x-0"}`}
              />
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
const TORGuidanceModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirmTOR: () => void }> = ({
  isOpen,
  onClose,
  onConfirmTOR,
}) => {
  const { resuscitationTime, timeOffset, initialRhythm, isTraumaArrest, isPaediatric: recordedPaediatric, currentRhythm, torCaution } =
    useArrest();
  // Null when nobody has recorded an age: then both sets of guidance show until Adult or Child is picked here.
  const [chosenPaediatric, setChosenPaediatric] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isOpen) setChosenPaediatric(null);
  }, [isOpen]);
  const knownPaediatric = recordedPaediatric ?? chosenPaediatric;
  const isPaediatric = knownPaediatric ?? false;
  const thresholdTime = isPaediatric ? 3600 : 2700; // 60 mins vs 45 mins

  // JRCALC ToR rests on the rhythm now, persisting despite ALS, not the first one seen.
  const rhythmCard = (title: string, matches: string[], text: string, titleClass = "") => {
    const highlighted = currentRhythm !== null && matches.includes(currentRhythm);
    return (
      <div className={highlighted ? "p-3 border-2 border-blue-500 rounded-lg bg-blue-50 dark:bg-blue-900/20" : ""}>
        <p className={`font-bold ${titleClass}`}>
          {title}
          {highlighted && (
            <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase font-bold">
              Current rhythm
            </span>
          )}
        </p>
        <p className="mt-1">{text}</p>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Clinical Guidance">
      <div className="space-y-5">
        <div className="text-center space-y-2">
          <AlertTriangle size={48} className="text-orange-500 mx-auto" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Termination of Resuscitation</h3>
          <p
            className={`font-semibold ${resuscitationTime >= thresholdTime ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`}
          >
            Resuscitation Time: {timeOffset > 0 ? "~" : ""}
            {TimeFormatter.format(resuscitationTime)}
            {timeOffset > 0 ? " (estimated)" : ""}
          </p>
          {/* With no time added, the clock started with eResus, so say that rather than claim more. */}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {timeOffset > 0
              ? `Timed from when the first ambulance resource (crew or CFR) confirmed cardiac arrest, including about ${Math.round(timeOffset / 60)} min before eResus was started (estimated).`
              : "Timed from when eResus was started. If the arrest was confirmed earlier, add the time with +1/+5/+10."}
          </p>
        </div>

        {recordedPaediatric === null && (
          <div
            role="radiogroup"
            aria-label="Patient"
            aria-description="No age recorded. Shows the guidance for the patient."
            className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-700"
          >
            {[
              { label: "Adult", value: false },
              { label: "Child (under 13)", value: true },
            ].map(({ label, value }) => (
              <button
                key={label}
                role="radio"
                aria-checked={chosenPaediatric === value}
                onClick={() => setChosenPaediatric(value)}
                className={`min-h-11 rounded-lg text-sm font-semibold ${
                  chosenPaediatric === value
                    ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow"
                    : "text-gray-600 dark:text-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {torCaution && (
          <div className="flex items-start gap-2 p-4 rounded-xl bg-tone-alert text-tone-on-alert text-sm font-semibold">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>{torCaution}</span>
          </div>
        )}

        {knownPaediatric !== false && (
          <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              JRCALC Guidelines (Paediatric)
            </h4>
            <div className="space-y-3 text-sm text-gray-800 dark:text-gray-200">
              {/* Same wording as the iOS ToR sheet. */}
              <ul className="space-y-2">
                <li>
                  • Consider termination after <strong>60 minutes</strong> of resuscitation.
                </li>
                <li>
                  • Ceasing resuscitation on scene should ONLY be considered if senior clinicians are present or senior
                  advice has been sought.
                </li>
                <li>• The child must still be conveyed to an ED (unless care plan states otherwise).</li>
                <li>
                  • Resuscitation should ALWAYS be continued in: hypothermia, suspected overdose/poisoning, or pregnancy.
                </li>
              </ul>
            </div>
          </div>
        )}

        {knownPaediatric !== true && (
          <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              JRCALC Guidelines (Adult)
            </h4>
            <div className="space-y-4 text-sm text-gray-800 dark:text-gray-200">
              <p className="text-xs text-gray-500 dark:text-gray-400">{currentRhythmLine(currentRhythm, initialRhythm)}</p>
              {rhythmCard(
                "Asystole",
                ["Asystole"],
                "Discontinue at any point if inappropriate. At 45 mins, cessation is appropriate unless there is a compelling reason to continue.",
              )}
              {rhythmCard(
                "PEA",
                ["PEA"],
                "At 45 mins, consider cessation if rate <40 bpm and QRS width >120msecs. Otherwise, seek advice.",
              )}
              {rhythmCard(
                "VF / VT",
                ["VF", "VT"],
                "Follow local pathway for refractory arrest. Seek advice at 45 mins. Cessation may be appropriate.",
                "text-blue-600 dark:text-blue-400",
              )}

              <hr className="border-gray-300 dark:border-gray-600" />

              {/* ROSC Considerations */}
              <div>
                <p className="font-bold">ROSC Considerations</p>
                <ul className="mt-1 space-y-1 list-disc list-inside text-sm">
                  <li>Transient (&lt;10 mins): Disregard and consider TOR based on guidance above.</li>
                  <li>Sustained (&gt;10 mins) then re-arrest: Discuss with a senior clinician.</li>
                </ul>
              </div>
              <p className="text-xs font-semibold">{TOR_ADULT_EXCLUSIONS}</p>
            </div>
          </div>
        )}

        {/* The same ToR rules apply to traumatic arrest (JRCALC); the somatic criteria are met more often. */}
        {isOpen && <SomaticCriteriaSection isPaediatric={isPaediatric} initiallyExpanded={isTraumaArrest} />}

        <ActionButton
          title="Confirm TOR (Stop CPR)"
          tone="danger"
          icon={<Shield size={18} />}
          onClick={() => {
            onConfirmTOR();
            onClose();
          }}
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
      letter: "P",
      title: "Prepare",
      color: "bg-blue-500",
      items: [
        "Check and tidy uniform/clothing, remove gloves, wash hands.",
        "Talk to staff prior to going to the family.",
        "Ensure you have the patient's details.",
      ],
    },
    {
      letter: "L",
      title: "Location",
      color: "bg-blue-500",
      items: ["Find somewhere private.", "Turn down radios and ignore mobile phones."],
    },
    {
      letter: "I",
      title: "Introduce",
      color: "bg-blue-500",
      items: [
        "Introduce your name/role and other staff.",
        "Confirm the name of the deceased before speaking.",
        "Ask family to introduce themselves and establish relationship.",
      ],
    },
    {
      letter: "I",
      title: "Information",
      color: "bg-blue-500",
      items: [
        "Adopt a position at the same level as the relative.",
        "Use simple language, avoid jargon.",
        "Ensure the word 'dead' or 'died' is introduced early.",
        "Allow periods of silence to absorb information.",
      ],
    },
    {
      letter: "E",
      title: "Empathy",
      color: "bg-blue-500",
      items: [
        "Offer condolences sincerely.",
        "Allow time for tears and emotional responses.",
        "Do not rush - be patient and present.",
      ],
    },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Clinical Guidance">
      <div className="space-y-5">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Breaking Bad News (PLIIE)</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          When it becomes clear that the resuscitation attempt is unlikely to have a successful outcome, take time to
          prepare relatives. Anticipate varying grief reactions.
        </p>

        {sections.map((section, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center space-x-3">
              <span
                className={`w-8 h-8 rounded-full ${section.color} text-white flex items-center justify-center font-bold text-sm`}
              >
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

const ResetModalView: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { performReset } = useArrest();
  const isOffline = !navigator.onLine;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reset Arrest Log?">
      <div className="flex flex-col items-center text-center space-y-4">
        <RotateCw size={48} className="text-red-500" />
        <p className="text-lg text-gray-700 dark:text-gray-300">
          This will save the current log. This action cannot be undone.
        </p>
        {isOffline && (
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-4 py-2 rounded-xl text-sm">
            <AlertTriangle size={16} />
            <span>You're offline. Log will be saved locally and synced when reconnected.</span>
          </div>
        )}

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
        <button onClick={onClose} className="text-gray-600 dark:text-gray-400 font-medium py-2 px-4 rounded-lg">
          Cancel
        </button>
      </div>
    </Modal>
  );
};

const HypothermiaModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
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
        <ActionButton
          title="Severe (< 30°C)"
          tone="primary"
          onClick={() => onConfirm(HypothermiaStatus.Severe)}
        />
        <ActionButton
          title="Moderate (30-35°C)"
          tone="primary"
          onClick={() => onConfirm(HypothermiaStatus.Moderate)}
        />
        <ActionButton
          title="Clear / Normothermic"
          tone="primary"
          onClick={() => onConfirm(HypothermiaStatus.Normothermic)}
        />
      </div>
    </Modal>
  );
};

const Etco2ModalView: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { logEtco2 } = useArrest();
  const { etco2Unit, setEtco2Unit } = useSettings();
  const [value, setValue] = useState("");

  const reading = Number(value.replace(",", "."));
  const [min, max] = etco2Unit === "kPa" ? [0.1, 20] : [1, 150];
  const isValid = value !== "" && !isNaN(reading) && reading >= min && reading <= max;
  // A typical mmHg reading entered while set to kPa is the most likely slip, so name it.
  const validationMessage =
    value === "" || isValid
      ? null
      : etco2Unit === "kPa" && reading > 20
        ? "That looks like mmHg. Switch the unit above."
        : `Enter a value between ${min} and ${max} ${etco2Unit}.`;

  const onConfirm = () => {
    logEtco2(value);
    onClose();
    setValue("");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log ETCO2 Value">
      <div className="flex flex-col space-y-4">
        <SegmentedSetting
          label="Unit"
          value={etco2Unit}
          options={[
            { value: "kPa", label: "kPa" },
            { value: "mmHg", label: "mmHg" },
          ]}
          onChange={(unit) => setEtco2Unit(unit as "kPa" | "mmHg")}
        />
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={etco2Unit === "kPa" ? "e.g., 4.5" : "e.g., 35"}
          autoFocus
          className="text-center text-2xl font-bold p-3 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-tone-accent"
        />
        {validationMessage && <p className="text-sm text-center text-tone-danger">{validationMessage}</p>}
        <ActionButton
          title="Log Value"
          icon={<Gauge size={18} />}
          tone="primary"
          onClick={onConfirm}
          disabled={!isValid}
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
        <p className="text-center text-gray-600 dark:text-gray-400">Choose the type of advanced airway placed.</p>
        <ActionButton
          title="Supraglottic Airway (i-Gel)"
          backgroundColor="bg-blue-600"
          foregroundColor="text-white"
          onClick={() => handleSelect(AirwayAdjunctType.SGA)}
        />
        <ActionButton
          title="Endotracheal Tube"
          backgroundColor="bg-indigo-600"
          foregroundColor="text-white"
          onClick={() => handleSelect(AirwayAdjunctType.ETT)}
        />
        <ActionButton
          title="Unspecified"
          backgroundColor="bg-gray-500"
          foregroundColor="text-white"
          onClick={() => handleSelect(AirwayAdjunctType.Unspecified)}
        />
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
  const {
    logAdrenaline,
    logAmiodarone,
    logLidocaine,
    logOtherDrug,
    setPatientAgeCategory,
    amiodaroneCount,
    patientAgeCategory,
    setPatientAgeStr,
    patientAgeStr,
  } = useArrest();
  const [age, setAge] = useState<PatientAgeCategory>(patientAgeCategory || PatientAgeCategory.Adult);
  const [manualAmount, setManualAmount] = useState("");
  const [manualUnit, setManualUnit] = useState("mg");
  // A second tap while the dialog is closing would log the dose twice.
  const didConfirmRef = useRef(false);

  const onConfirm = (dosage: string, ageVal: PatientAgeCategory | null) => {
    if (didConfirmRef.current) return;
    didConfirmRef.current = true;
    if (ageVal) {
      setPatientAgeCategory(ageVal);
      // Two-way sync: years as a bare number ("6"), months kept as months ("6 months"), so an infant isn't
      // recorded as 6 years old. Adult records nothing.
      const ageStr = ageTextForCategory(ageVal, ageVal === PatientAgeCategory.Adult);
      if (ageStr && ageStr !== patientAgeStr) {
        setPatientAgeStr(ageStr);
      }
    }

    switch (drug.type) {
      case "adrenaline":
        logAdrenaline(dosage);
        break;
      case "amiodarone":
        logAmiodarone(dosage);
        break;
      case "lidocaine":
        logLidocaine(dosage);
        break;
      case "other":
        logOtherDrug(drug.name, dosage);
        break;
    }
    onClose();
    setManualAmount("");
    setManualUnit("mg");
  };

  const calculatedDose = useMemo(() => {
    if (drug.type === "adrenaline") {
      return DosageCalculator.calculateAdrenalineDose(age);
    }
    if (drug.type === "amiodarone") {
      return DosageCalculator.calculateAmiodaroneDose(age, amiodaroneCount + 1);
    }
    return null;
  }, [age, drug, amiodaroneCount]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Log ${getDrugLogTitle(drug)}`}>
      <div className="flex flex-col space-y-4">
        {drug.type === "adrenaline" || drug.type === "amiodarone" ? (
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
                    {allPatientAgeCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
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

// Older call sites still pass colour classes; read their intent so they pick up the calm palette.
const toneFromLegacyColour = (backgroundColor = ""): ButtonTone => {
  if (backgroundColor.includes("bg-red")) return "danger";
  if (/bg-(blue|green)-(5|6)00/.test(backgroundColor)) return "primary";
  return "standard";
};

interface ActionButtonProps {
  title: string;
  icon?: React.ReactNode;
  tone?: ButtonTone;
  highlight?: ButtonHighlight;
  backgroundColor?: string;
  foregroundColor?: string;
  height?: string;
  fontSize?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  /** A second line under the title, such as a drug countdown or which dose is due. */
  detail?: string | null;
  /** Offers a small "Not now" bell-slash button that quietens the button's reminder. */
  onNotNow?: () => void;
}

// The four drug buttons share one height, tall enough for a detail line, so the grid never jumps as lines come and go.
const DRUG_BUTTON_HEIGHT = "h-16 py-1";

const ActionButton: React.FC<ActionButtonProps> = ({
  title,
  icon,
  tone,
  highlight,
  backgroundColor,
  height = "h-14",
  fontSize = "text-base",
  onClick,
  disabled = false,
  className = "",
  detail,
  onNotNow,
}) => {
  const [flash, setFlash] = useState(false);
  const colours = highlight ? HIGHLIGHT_CLASSES[highlight] : TONE_CLASSES[tone ?? toneFromLegacyColour(backgroundColor)];

  const button = (
    <button
      aria-label={detail ? `${title}, ${detail}` : undefined}
      onClick={() => {
        onClick();
        // A brief ring on release confirms the tap even when nothing else on screen changes.
        setFlash(true);
        setTimeout(() => setFlash(false), 350);
      }}
      disabled={disabled}
      className={`
        flex items-center justify-center space-x-2 w-full px-4 rounded-xl
        font-semibold
        transition-all duration-150 ease-out
        active:scale-95 active:brightness-90
        disabled:opacity-40 disabled:cursor-not-allowed
        ${flash ? "ring-2 ring-tone-accent ring-offset-2 ring-offset-background" : ""}
        ${height} ${fontSize} ${colours} ${className}
      `}
    >
      {icon}
      {detail ? (
        <span className="flex flex-col items-start leading-tight">
          <span className="line-clamp-2">{title}</span>
          <span className={`text-xs font-bold tabular-nums ${highlight ? "" : "opacity-80"}`}>{detail}</span>
        </span>
      ) : (
        // Centred in the button's height, at most two lines.
        <span className="line-clamp-2 text-center leading-tight">{title}</span>
      )}
    </button>
  );

  if (!onNotNow) return button;
  // "Not now" replaces the old banners' dismiss buttons: a small bell-slash in the corner, offered only while lit.
  return (
    <div className="relative">
      {button}
      <button
        onClick={onNotNow}
        aria-label={`Not now: ${title}`}
        title="Not now"
        className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900 shadow flex items-center justify-center active:scale-95 transition-transform"
      >
        <BellOff size={14} aria-hidden="true" />
      </button>
    </div>
  );
};

// The arrest state, coloured by meaning: red is kept for "act now", so an arrest in progress is green.
const StateBadge: React.FC = () => {
  const { arrestState, isTimerPaused } = useArrest();
  const label = isTimerPaused
    ? "PAUSED"
    : { [ArrestState.Pending]: "READY", [ArrestState.Active]: "ACTIVE", [ArrestState.Rosc]: "ROSC", [ArrestState.Ended]: "DECEASED" }[
        arrestState
      ];
  const colour =
    isTimerPaused || arrestState === ArrestState.Pending || arrestState === ArrestState.Ended
      ? "bg-tone-slate text-tone-on-slate"
      : arrestState === ArrestState.Active
        ? "bg-tone-accent text-tone-on-accent"
        : "bg-tone-positive text-tone-on-positive";
  return <span className={`px-2 py-0.5 rounded-lg text-xs font-black ${colour}`}>{label}</span>;
};

// Time spent on the arrest before eResus was started. Three buttons while it's likely to be needed (before
// Start and for the first few minutes), then one "+ Time" menu so they don't sit there all arrest.
const TimeOffsetButtons: React.FC<{ onAdd: (seconds: number) => void }> = ({ onAdd }) => {
  const { arrestState, masterTime } = useArrest();
  const [open, setOpen] = useState(false);
  const isCompact = arrestState === ArrestState.Active && masterTime > 180;
  const chip = "h-8 rounded-full bg-tone-tint text-tone-on-tint text-xs font-semibold active:scale-95 transition-transform";

  if (isCompact) {
    return (
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Add time before eResus"
          aria-expanded={open}
          className={`${chip} flex items-center gap-1 px-3`}
        >
          <Plus size={14} aria-hidden="true" />
          Time
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full mt-1 z-30 w-56 rounded-xl shadow-lg overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              {[1, 5, 10].map((minutes) => (
                <button
                  key={minutes}
                  onClick={() => {
                    onAdd(minutes * 60);
                    setOpen(false);
                  }}
                  className="block w-full text-left px-4 py-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  +{minutes} min before eResus
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {[1, 5, 10].map((minutes) => (
        <button
          key={minutes}
          onClick={(e) => {
            e.stopPropagation();
            onAdd(minutes * 60);
          }}
          aria-label={`Add ${minutes} minute${minutes === 1 ? "" : "s"} before eResus`}
          className={`${chip} w-[42px] font-mono`}
        >
          +{minutes}
        </button>
      ))}
      <span className="text-xs text-gray-500 dark:text-gray-400">min</span>
    </div>
  );
};

const spokenDuration = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)} minutes ${total % 60} seconds`;
};

// Header & Timers
const HeaderView: React.FC<{ onAddTime?: () => void }> = ({ onAddTime }) => {
  const {
    arrestState,
    timeOffset,
    totalArrestTime,
    addTimeOffset,
    cprTime,
    uiState,
    isTimerPaused,
    analyseRhythm,
    roscTime,
  } = useArrest();
  const [showTimeCorrection, setShowTimeCorrection] = useState(false);
  const [showBeforeEResus, setShowBeforeEResus] = useState(false);

  const isRhythmCheckDue = arrestState === ArrestState.Active && uiState === UIState.Default && cprTime <= 0;
  const showsDue = isRhythmCheckDue && !isTimerPaused;
  const canCorrectTime = timeOffset > 0 && !isRhythmCheckDue && arrestState !== ArrestState.Ended;
  const canAddBeforeEResus = arrestState === ArrestState.Active && !isRhythmCheckDue && !isTimerPaused;

  const handleHeaderTap = () => {
    if (showsDue) analyseRhythm();
  };

  const headerBg = isTimerPaused
    ? "bg-tone-slate/15"
    : isRhythmCheckDue
      ? "bg-tone-danger-solid"
      : "bg-white dark:bg-gray-800";
  // Frozen clocks (paused, ended) look frozen; on the red header, white.
  const clockColour =
    isTimerPaused || arrestState === ArrestState.Ended
      ? "text-gray-500 dark:text-gray-400"
      : showsDue
        ? "text-white"
        : "text-tone-accent";

  // Time since the arrest was confirmed. "~" when part of it is estimated; tapping it then lets a
  // mis-tapped +10 be corrected. Not disabled: a disabled button swallows the tap the header needs when a
  // rhythm check is due.
  const clockButton = (large: boolean, colour: string, prefix = "") => (
    <button
      type="button"
      tabIndex={canCorrectTime ? 0 : -1}
      onClick={(e) => {
        if (!canCorrectTime) return;
        e.stopPropagation();
        setShowTimeCorrection(true);
      }}
      aria-label={
        timeOffset > 0
          ? `${prefix}${TimeFormatter.format(totalArrestTime)}, including about ${Math.round(timeOffset / 60)} minutes estimated`
          : undefined
      }
      className={`flex items-baseline font-mono font-bold ${canCorrectTime ? "" : "pointer-events-none"} ${colour}`}
    >
      {prefix && <span className="font-sans font-semibold mr-1">{prefix}</span>}
      {timeOffset > 0 && <span className={`${large ? "text-2xl" : ""} mr-0.5`}>~</span>}
      <span className={large ? "text-4xl" : ""}>{TimeFormatter.format(totalArrestTime)}</span>
    </button>
  );

  return (
    <div
      className={`relative z-10 px-4 pt-3 pb-3 shadow-md transition-colors duration-300 ${headerBg} ${showsDue ? "cursor-pointer" : ""}`}
      onClick={handleHeaderTap}
    >
      {/* The same height in every state, so the screen below never jumps when the buttons go or a check falls due. */}
      <div className="flex justify-between items-start gap-2 h-[104px]">
        <div className={`flex flex-col items-start gap-1.5 min-w-0 ${showsDue ? "text-white" : "text-gray-900 dark:text-white"}`}>
          {showsDue ? (
            <>
              {/* The whole header is the button now; say so in words, not just colour. */}
              <h1 className="text-2xl font-extrabold leading-tight">RHYTHM CHECK DUE</h1>
              <p className="font-semibold">Tap to analyse</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold leading-tight">eResus</h1>
              <StateBadge />
              {/* Under the badge, where there's room, rather than adding a row to the header. */}
              {(arrestState === ArrestState.Active || arrestState === ArrestState.Pending) && !isTimerPaused && (
                <TimeOffsetButtons
                  onAdd={(seconds) => {
                    addTimeOffset(seconds);
                    onAddTime?.();
                  }}
                />
              )}
            </>
          )}
        </div>

        <div className="flex flex-col items-end flex-shrink-0">
          {arrestState === ArrestState.Rosc && roscTime !== null ? (
            <>
              {/* After ROSC the time that matters most is since ROSC; the arrest clock stays alongside. */}
              <span
                className="font-mono font-bold text-4xl text-tone-positive"
                aria-label={`${spokenDuration(totalArrestTime - roscTime)} since ROSC`}
              >
                {TimeFormatter.format(totalArrestTime - roscTime)}
              </span>
              <span className="flex items-baseline gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                <span>since ROSC</span>
                {clockButton(false, "text-gray-500 dark:text-gray-400", "· Arrest")}
              </span>
            </>
          ) : (
            <>
              {clockButton(true, clockColour)}
              <span className={`text-sm ${showsDue ? "text-white" : "text-gray-500 dark:text-gray-400"}`}>
                {arrestState === ArrestState.Pending ? "\u00a0" : "since arrest"}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Stats Row. Tapping it adds shocks and drugs given before eResus was started. */}
      {arrestState !== ArrestState.Pending && (
        <button
          type="button"
          tabIndex={canAddBeforeEResus ? 0 : -1}
          className={`block w-full mt-2 text-left ${canAddBeforeEResus ? "" : "pointer-events-none"}`}
          aria-describedby={canAddBeforeEResus ? "before-eresus-hint" : undefined}
          onClick={(e) => {
            if (!canAddBeforeEResus) return;
            e.stopPropagation();
            setShowBeforeEResus(true);
          }}
        >
          <StatsRow />
          <span id="before-eresus-hint" className="sr-only">
            Add shocks or drugs given before eResus was started
          </span>
        </button>
      )}
      {/* Outside the header, so the backdrop isn't under the bottom bar and its taps don't reach the header. */}
      {createPortal(
        <div onClick={(e) => e.stopPropagation()}>
          <TimeCorrectionModal isOpen={showTimeCorrection} onClose={() => setShowTimeCorrection(false)} />
          <BeforeEResusModal isOpen={showBeforeEResus} onClose={() => setShowBeforeEResus(false)} />
        </div>,
        document.body,
      )}
    </div>
  );
};

const TimeCorrectionModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { timeOffset, setTimeBeforeStart } = useArrest();
  const [refused, setRefused] = useState(false);
  const minutes = Math.round(timeOffset / 60);
  const close = () => {
    setRefused(false);
    onClose();
  };
  const correct = (seconds: number) => {
    if (setTimeBeforeStart(timeOffset - seconds)) close();
    else setRefused(true);
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={`~${minutes} min before eResus (estimated)`}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Time between the first ambulance resource confirming arrest and starting eResus, included in the clock and ToR
          timing.
        </p>
        {refused && (
          <p className="text-sm text-tone-danger">
            <strong>Can't reduce it that far.</strong> Some entries are earlier than that, so the time wasn't changed.
          </p>
        )}
        <button onClick={() => correct(60)} className="w-full py-3 rounded-xl font-semibold bg-tone-tint text-tone-on-tint">
          Remove 1 min
        </button>
        {timeOffset >= 300 && (
          <button onClick={() => correct(300)} className="w-full py-3 rounded-xl font-semibold bg-tone-tint text-tone-on-tint">
            Remove 5 min
          </button>
        )}
        <button
          onClick={() => correct(timeOffset)}
          className="w-full py-3 rounded-xl font-semibold bg-tone-danger text-tone-on-danger"
        >
          Clear
        </button>
      </div>
    </Modal>
  );
};

// Shocks and drugs given before eResus was started, which keep the drug prompts in step.
// Times aren't known, so they're recorded at the moment eResus was started and marked as estimated.
const BEFORE_ITEMS: [GivenItem, string][] = [
  ["shock", "Shocks"],
  ["adrenaline", "Adrenaline"],
  ["amiodarone", "Amiodarone"],
  ["lidocaine", "Lidocaine"],
];

const BeforeEResusModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { logBeforeStart, antiarrhythmicGiven, drugTimingShockCount } = useArrest();
  const [counts, setCounts] = useState<Partial<Record<GivenItem, number>>>({});
  const close = () => {
    setCounts({});
    onClose();
  };
  // One antiarrhythmic per arrest, as on the main screen.
  const isAllowed = (item: GivenItem) =>
    item === "amiodarone"
      ? antiarrhythmicGiven !== AntiarrhythmicDrug.Lidocaine && !counts.lidocaine
      : item === "lidocaine"
        ? antiarrhythmicGiven !== AntiarrhythmicDrug.Amiodarone && !counts.amiodarone
        : true;
  const change = (item: GivenItem, by: number) =>
    setCounts((c) => ({ ...c, [item]: Math.min(10, Math.max(0, (c[item] ?? 0) + by)) }));
  const hasAny = Object.values(counts).some((n) => (n ?? 0) > 0);
  const antiarrhythmicBeforeThirdShock =
    (counts.amiodarone ?? 0) + (counts.lidocaine ?? 0) > 0 && drugTimingShockCount + (counts.shock ?? 0) < 3;

  return (
    <Modal isOpen={isOpen} onClose={close} title="Given before eResus">
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {BEFORE_ITEMS.map(([item, label]) => {
          const value = counts[item] ?? 0;
          const allowed = isAllowed(item);
          return (
            <div key={item} className={`flex items-center justify-between py-2 ${allowed ? "" : "opacity-40"}`}>
              <span className="font-semibold text-gray-900 dark:text-white">{label}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => change(item, -1)}
                  disabled={!allowed || value === 0}
                  aria-label={`One fewer ${label.toLowerCase()}`}
                  className="w-11 h-11 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-tone-accent disabled:opacity-40"
                >
                  <Minus size={20} />
                </button>
                <span className="w-8 text-center font-mono text-xl font-bold text-gray-900 dark:text-white" aria-live="polite">
                  {value}
                </span>
                <button
                  onClick={() => change(item, 1)}
                  disabled={!allowed || value === 10}
                  aria-label={`One more ${label.toLowerCase()}`}
                  className="w-11 h-11 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-tone-accent disabled:opacity-40"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {antiarrhythmicBeforeThirdShock && (
        <p className="mt-3 p-3 rounded-xl text-sm font-semibold bg-tone-alert/25 text-tone-on-alert">
          Amiodarone and lidocaine are usually given after the 3rd shock. Add the shocks given too, so the next dose is
          prompted at the right time.
        </p>
      )}
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        Recorded as given before eResus, times unknown (estimated). If you know when the last adrenaline was, you can choose it
        on the arrest screen.
      </p>
      <button
        disabled={!hasAny}
        onClick={() => {
          logBeforeStart(counts);
          close();
        }}
        className="mt-4 w-full py-3 rounded-xl font-semibold bg-tone-accent text-tone-on-accent disabled:opacity-40"
      >
        Add
      </button>
    </Modal>
  );
};

const StatsRow: React.FC = () => {
  const {
    shockCount,
    adrenalineCount,
    amiodaroneCount,
    lidocaineCount,
    dynamicLidocaineCount,
    cprTime,
    uiState,
    arrestState,
    isTimerPaused,
    antiarrhythmicGiven,
  } = useArrest();

  const isRhythmCheckDue =
    arrestState === ArrestState.Active && uiState === UIState.Default && cprTime <= 0 && !isTimerPaused;
  const color = `font-bold ${isRhythmCheckDue ? "text-white" : "text-foreground"}`;
  // One antiarrhythmic per arrest, so one slot: amiodarone until lidocaine is the one given.
  const usesLidocaine = antiarrhythmicGiven === AntiarrhythmicDrug.Lidocaine;

  return (
    <div className="flex">
      <StatItem label="Shocks" value={shockCount} color={color} isDue={isRhythmCheckDue} />
      <StatItem label="Adrenaline" value={adrenalineCount} color={color} isDue={isRhythmCheckDue} />
      <StatItem
        label={usesLidocaine ? "Lidocaine" : "Amiodarone"}
        value={usesLidocaine ? Math.max(lidocaineCount, dynamicLidocaineCount) : amiodaroneCount}
        color={color}
        isDue={isRhythmCheckDue}
      />
    </div>
  );
};

const StatItem: React.FC<{ label: string; value: number; color: string; isDue?: boolean }> = ({
  label,
  value,
  color,
  isDue,
}) => (
  <div className={`flex-1 flex flex-col items-center justify-center min-h-11 ${color}`}>
    <span className="font-mono font-bold text-lg">{value}</span>
    <span className={`text-xs font-semibold ${isDue ? "text-white" : "text-gray-500 dark:text-gray-400"}`}>
      {label}
    </span>
  </div>
);

const useVoiceListener = () =>
  useSyncExternalStore(voiceCommandListener.subscribe, voiceCommandListener.getState);

// Only true once the browser has confirmed it can recognise speech on the device.
const useVoiceCommandsAvailable = () => {
  const { voiceCommandsEnabled } = useSettings();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!voiceCommandsEnabled) return;
    let cancelled = false;
    checkVoiceCommandAvailability().then((status) => {
      if (!cancelled) setAvailable(status === "available");
    });
    return () => {
      cancelled = true;
    };
  }, [voiceCommandsEnabled]);
  return voiceCommandsEnabled && available;
};

// Press and hold to speak, then let go (matches iOS). Only a deliberate hold turns the microphone on,
// never a tap or a brush.
const usePushToTalk = (onVoiceTranscript: ((transcript: string) => void) | undefined, label: string) => {
  const voiceAvailable = useVoiceCommandsAvailable() && onVoiceTranscript !== undefined;
  const [isPressed, setIsPressed] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTalking = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsPressed(true);
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      if (voiceCommandListener.startPushToTalk()) navigator.vibrate?.(15);
    }, 350);
  };
  const stopTalking = () => {
    setIsPressed(false);
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    voiceCommandListener.stopPushToTalk((transcript) => onVoiceTranscript?.(transcript));
  };
  const pushToTalk = voiceAvailable
    ? {
        onPointerDown: startTalking,
        onPointerUp: stopTalking,
        onPointerLeave: stopTalking,
        onPointerCancel: stopTalking,
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
        role: "button",
        "aria-label": label,
      }
    : {};
  return { voiceAvailable, isPressed, pushToTalk };
};

// Holding anywhere on the ring is push-to-talk: speak, then let go (matches iOS).
const CPRTimerView: React.FC<{ onVoiceTranscript?: (transcript: string) => void }> = ({ onVoiceTranscript }) => {
  const { cprTime, isRhythmCheckDue } = useArrest();
  const { cprCycleDuration } = useSettings();
  const listener = useVoiceListener();
  const { voiceAvailable, isPressed, pushToTalk } = usePushToTalk(onVoiceTranscript, "Press and hold to speak a command");

  // Agrees with the header: a check that's due shows as due, not as time left in the next cycle.
  const percentage = isRhythmCheckDue ? 1 : cprTime / cprCycleDuration;
  const strokeDasharray = 2 * Math.PI * 52;
  const strokeDashoffset = strokeDasharray * (1 - percentage);
  const isEnding = isRhythmCheckDue || cprTime <= 10;

  return (
    <div
      className={`relative w-52 h-52 ${
        voiceAvailable ? "select-none touch-none rounded-full motion-safe:transition-transform motion-safe:duration-200" : ""
      } ${isPressed ? "motion-safe:scale-95" : ""}`}
      {...pushToTalk}
    >
      <svg className="w-full h-full" viewBox="0 0 120 120">
        <circle
          className="text-gray-200 dark:text-gray-700"
          strokeWidth="9"
          stroke="currentColor"
          fill="transparent"
          r="52"
          cx="60"
          cy="60"
        />
        <circle
          className={`transition-all duration-1000 linear ${isEnding ? "text-tone-danger" : "text-tone-accent"}`}
          strokeWidth="9"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r="52"
          cx="60"
          cy="60"
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-mono font-bold text-5xl ${isEnding ? "text-tone-danger" : "text-gray-900 dark:text-white"}`}>
          {isRhythmCheckDue ? "0:00" : TimeFormatter.format(cprTime)}
        </span>
        <span
          className={`text-xs font-semibold uppercase ${isRhythmCheckDue ? "text-tone-danger" : "text-gray-500 dark:text-gray-400"}`}
        >
          {isRhythmCheckDue ? "Check rhythm" : "CPR Cycle"}
        </span>
      </div>
      {voiceAvailable && listener.isPushToTalkActive && <PushToTalkRing transcript={listener.transcript} />}
    </div>
  );
};

// The listening state of the ring (matches iOS). Browsers don't expose the recogniser's audio level,
// so the halo bumps as each word arrives instead of following loudness.
const PushToTalkRing: React.FC<{ transcript: string }> = ({ transcript }) => (
  <div className="absolute inset-0 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:duration-300">
    <div className="absolute inset-0 rounded-full border-[10px] border-tone-danger motion-safe:animate-ptt-ripple motion-reduce:hidden" />
    <div
      key={transcript.split(" ").length}
      className="absolute inset-0 rounded-full border-[18px] border-tone-danger opacity-20 motion-safe:animate-ptt-bump"
    />
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 120 120">
      <circle className="fill-card" r="50" cx="60" cy="60" />
      <circle
        className="text-tone-danger motion-safe:animate-ptt-draw"
        strokeWidth="10"
        strokeLinecap="round"
        stroke="currentColor"
        fill="transparent"
        strokeDasharray="326.7"
        r="52"
        cx="60"
        cy="60"
        transform="rotate(-90 60 60)"
      />
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-12 text-center">
      {/* The timer gives way to a microphone as listening starts. */}
      <Mic
        size={44}
        strokeWidth={2.5}
        className={`text-tone-danger motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300 ${
          transcript ? "" : "motion-safe:animate-pulse"
        }`}
      />
      <span className="font-semibold text-sm text-foreground line-clamp-4">{transcript || "Listening…"}</span>
    </div>
  </div>
);

const VoiceListeningStatus: React.FC<{ holdHint?: string; className?: string }> = ({
  holdHint = "Hold the ring to talk.",
  className = "-mt-4 justify-center",
}) => {
  const listener = useVoiceListener();
  const { voiceWakeWord } = useSettings();
  if (!listener.isHandsFreeActive || listener.isPushToTalkActive) return null;
  const wakeWord = voiceWakeWord === "eresus" ? "eResus" : "Scribe";
  // Long transcripts are cut from the start so the latest words stay visible.
  return (
    <p
      className={`${className} flex items-center gap-1.5 text-xs ${
        listener.heardWakeWord ? "text-tone-danger" : "text-gray-500 dark:text-gray-400"
      }`}
    >
      {listener.heardWakeWord ? <AudioWaveform size={14} className="shrink-0" /> : <Ear size={14} className="shrink-0" />}
      <span className="truncate [direction:rtl]">
        <bdi>
          {listener.heardWakeWord
            ? `“${wakeWord}” heard: ${listener.transcript}`
            : `Listening for “${wakeWord}”. ${holdHint}`}
        </bdi>
      </span>
    </p>
  );
};

// Screen State Views
const IosAppStoreBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("eResusAppStoreBannerDismissed") === "true");
  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (!isIos || dismissed) return null;

  return (
    <div className="p-4 bg-tone-tint rounded-xl border border-tone-accent/30 flex items-center space-x-3">
      <img
        src="https://145955222.fs1.hubspotusercontent-eu1.net/hubfs/145955222/eResus.jpg"
        className="w-12 h-12 rounded-xl flex-shrink-0"
        alt="eResus"
      />
      <div className="flex-grow min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">eResus is now on the App Store</p>
        <a
          href="https://apps.apple.com/gb/app/eresus/id6753123316"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-tone-accent font-medium"
        >
          Download for iOS →
        </a>
      </div>
      <button
        onClick={() => {
          localStorage.setItem("eResusAppStoreBannerDismissed", "true");
          setDismissed(true);
        }}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
      >
        <XSquare size={20} />
      </button>
    </div>
  );
};

const PendingView: React.FC<{
  onShowPdf: (pdf: PDFIdentifiable) => void;
  onShowNewborn: () => void;
  needsSetup?: boolean;
  onStartSetup?: () => void;
}> = ({ onShowPdf, onShowNewborn, needsSetup = false, onStartSetup }) => {
  const { startArrest, showRecoveryPrompt, resumeRecoveredSession, discardRecoveredSession, receiveSessionTransfer } =
    useArrest();
  const [showReceiveTransfer, setShowReceiveTransfer] = useState(false);
  const [receiveCode, setReceiveCode] = useState("");
  const [isReceiving, setIsReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState("");

  const handleReceive = async () => {
    if (receiveCode.length !== 6) return;
    setIsReceiving(true);
    setReceiveError("");
    const result = await receiveSessionTransfer(receiveCode);
    setIsReceiving(false);
    if (result.success) {
      setShowReceiveTransfer(false);
      setReceiveCode("");
    } else {
      setReceiveError(result.error || "Transfer not found. Check the code and try again.");
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
          <p className="text-sm text-gray-700 dark:text-gray-300">
            An active arrest session was interrupted. Would you like to resume it?
          </p>
          <div className="flex space-x-3">
            <ActionButton
              title="Resume"
              tone="primary"
              height="h-12"
              onClick={resumeRecoveredSession}
            />
            <ActionButton
              title="Save & Close"
              backgroundColor="bg-gray-500"
              foregroundColor="text-white"
              height="h-12"
              onClick={discardRecoveredSession}
            />
          </div>
        </div>
      )}
      <IosAppStoreBanner />
      <ActionButton
        title="Start Arrest"
        tone="primary"
        height="h-20"
        fontSize="text-2xl"
        onClick={startArrest}
      />

      <ActionButton
        title="Newborn Life Support"
        tone="standard"
        height="h-16"
        fontSize="text-lg"
        onClick={onShowNewborn}
      />
      <AlgorithmGridView onShowPdf={onShowPdf} />

      {needsSetup && onStartSetup && (
        <button
          onClick={onStartSetup}
          className="w-full flex items-center gap-3 p-4 text-left rounded-xl bg-card border border-border active:scale-[0.99] transition-transform"
        >
          <Settings size={20} className="text-muted-foreground shrink-0" />
          <span className="flex-grow">
            <span className="block text-sm font-semibold text-foreground">Finish setting up eResus</span>
            <span className="block text-xs text-muted-foreground">Install, account and research options. About a minute.</span>
          </span>
          <ChevronRight size={16} className="text-muted-foreground shrink-0" />
        </button>
      )}

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
          <p className="text-sm text-center text-gray-600 dark:text-gray-400">
            Enter the 6-digit code shown on the sending device:
          </p>
          <input
            type="text"
            value={receiveCode}
            onChange={(e) => setReceiveCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
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
            onClick={() => {
              setShowReceiveTransfer(false);
              setReceiveCode("");
              setReceiveError("");
            }}
          />
        </div>
      )}
    </div>
  );
};

// Lucide has no metronome; drawn to match the iOS glyph so the speaker icon can mean spoken prompts.
const MetronomeIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 3h6l4 18H5L9 3z" />
    <path d="M12 16l6-9" />
    <path d="M7 16h10" />
  </svg>
);


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
  onShowTrauma: () => void;
  onVoiceTranscript?: (transcript: string) => void;
}> = (props) => {
  const {
    cprTime,
    uiState,
    isTraumaArrest,
    setTraumaArrest,
    areDrugPromptsQuietened,
    restoreDrugPrompts,
    isAdrenalineHighlighted,
    isAmiodaroneHighlighted,
    shouldShowLidocaineReminder,
    events,
    reversibleCauses,
    isTimerPaused,
    isLastAdrenalineTimeUnknown,
    setLastAdrenaline,
    totalArrestTime,
  } = useArrest();
  const { voicePromptsEnabled } = useSettings();
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

  // Bring the next thing to press to the middle of the screen, however the step was started
  // (button, red header or voice).
  const previousUiStateRef = useRef(uiState);
  useEffect(() => {
    if (previousUiStateRef.current === uiState) return;
    previousUiStateRef.current = uiState;
    const target =
      uiState !== UIState.Default
        ? "arrest-primary-action"
        : isAdrenalineHighlighted || isAmiodaroneHighlighted || shouldShowLidocaineReminder
          ? "arrest-medications"
          : null;
    if (!target) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(target)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  }, [uiState, isAdrenalineHighlighted, isAmiodaroneHighlighted, shouldShowLidocaineReminder]);

  return (
    <div className={`p-4 space-y-4 pb-36 transition-opacity ${isTimerPaused ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="relative flex justify-center">
        <CPRTimerView onVoiceTranscript={props.onVoiceTranscript} />
        <button
          onClick={toggleMetronome}
          aria-label={isMetronomeOn ? "Turn metronome off" : "Turn metronome on"}
          className={`absolute bottom-4 right-4 w-12 h-12 rounded-full flex items-center justify-center
          shadow-lg transition-colors
          ${isMetronomeOn ? "bg-tone-accent text-tone-on-accent" : "bg-white dark:bg-gray-700 text-tone-accent"}`}
        >
          <MetronomeIcon size={24} />
        </button>
        <VoicePromptButton enabled={voicePromptsEnabled} className="bottom-4 left-4" />
      </div>
      <VoiceListeningStatus />

      {isTraumaArrest && (
        <HOTTCard
          compact
          onOpen={props.onShowTrauma}
          onRestorePrompts={areDrugPromptsQuietened ? restoreDrugPrompts : undefined}
          onNotTrauma={() => setTraumaArrest(false)}
        />
      )}

      {isLastAdrenalineTimeUnknown && <AdrenalineTimeUnknownView totalTime={totalArrestTime} onSelect={setLastAdrenaline} />}

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

const SectionTitle: React.FC<{ title: string }> = ({ title }) => (
  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</h3>
);

const RoscView: React.FC<{
  onShowPdf: (pdf: PDFIdentifiable) => void;
  onOpenDrugs: (focus: DrugGroupKind | null) => void;
  onShowEtco2: () => void;
  onVoiceTranscript?: (transcript: string) => void;
}> = ({ onShowPdf, onOpenDrugs, onShowEtco2, onVoiceTranscript }) => {
  const {
    reArrest,
    postROSCTasks,
    toggleChecklistItemCompletion,
    events,
    latestObservation,
    logObservation,
    logDestination,
    totalArrestTime,
    isTraumaArrest,
  } = useArrest();
  const [observationToLog, setObservationToLog] = useState<ROSCObservation | null>(null);
  const [showDestination, setShowDestination] = useState(false);
  const listener = useVoiceListener();
  const { voiceAvailable, isPressed, pushToTalk } = usePushToTalk(onVoiceTranscript, "Hold to talk");
  const talking = voiceAvailable && listener.isPushToTalkActive;

  return (
    <div className="p-4 space-y-6 pb-36">
      {/* First and alone, so it can be hit in a second. Undo in the bar below reverses a mistap. */}
      <ActionButton
        title="Patient Re-Arrested"
        tone="danger"
        icon={<RotateCw size={20} />}
        height="h-16"
        fontSize="text-lg"
        onClick={reArrest}
      />

      {voiceAvailable && (
        // The ring isn't on this screen, so the microphone gets its own hold target.
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-[52px] w-[52px] shrink-0 select-none touch-none items-center justify-center rounded-full text-white motion-safe:transition-transform motion-safe:duration-200 ${
                talking ? "bg-tone-danger motion-safe:animate-pulse" : "bg-tone-accent"
              } ${isPressed ? "motion-safe:scale-95" : ""}`}
              {...pushToTalk}
            >
              <Mic size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{talking ? "Listening…" : "Hold to talk"}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {talking && listener.transcript ? listener.transcript : "“Sats 96”, “BP 110 over 70”, “BM 6.2”, “ketamine 100 mg”"}
              </p>
            </div>
          </div>
          <VoiceListeningStatus holdHint="Hold the mic to talk." className="" />
        </div>
      )}

      <div className="space-y-2">
        <SectionTitle title="Observations" />
        <div className="grid grid-cols-2 gap-3">
          {ROSC_OBSERVATION_ORDER.map((observation) => (
            <ObservationButton
              key={observation}
              observation={observation}
              latest={latestObservation(observation)}
              now={totalArrestTime}
              onClick={() => (observation === "etco2" ? onShowEtco2() : setObservationToLog(observation))}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle title="Medications" />
        <div className="grid grid-cols-2 gap-3">
          <ActionButton title="Sedation / RSI..." icon={<Syringe size={16} />} tone="standard" height="h-12" fontSize="text-sm" onClick={() => onOpenDrugs("sedation")} />
          <ActionButton title="Fluids & Blood..." icon={<Droplet size={16} />} tone="standard" height="h-12" fontSize="text-sm" onClick={() => onOpenDrugs("fluids")} />
          <ActionButton title="Vasopressors..." icon={<HeartPulse size={16} />} tone="standard" height="h-12" fontSize="text-sm" onClick={() => onOpenDrugs("arrest")} />
          <ActionButton title="Other Meds..." icon={<Pill size={16} />} tone="standard" height="h-12" fontSize="text-sm" onClick={() => onOpenDrugs(null)} />
        </div>
      </div>

      {isTraumaArrest && <HOTTCard compact />}

      <ChecklistView title="Post-ROSC Care" items={postROSCTasks} onToggle={toggleChecklistItemCompletion} />

      <div className="space-y-2">
        <SectionTitle title="Conveyance" />
        <div className="grid grid-cols-2 gap-3">
          <ActionButton title="Destination..." icon={<Stethoscope size={16} />} tone="slate" height="h-12" fontSize="text-sm" onClick={() => setShowDestination(true)} />
          <ActionButton title="Pre-alert Given" icon={<PhoneOutgoing size={16} />} tone="slate" height="h-12" fontSize="text-sm" onClick={() => logDestination("Pre-alert given")} />
        </div>
      </div>

      <EventLogView events={events} />
      <AlgorithmGridView onShowPdf={onShowPdf} />
      <TransferArrestPill />

      <ObservationSheet
        observation={observationToLog}
        onClose={() => setObservationToLog(null)}
        onConfirm={(value) => observationToLog && logObservation(observationToLog, value)}
      />
      <DestinationSheet
        isOpen={showDestination}
        onClose={() => setShowDestination(false)}
        traumatic={isTraumaArrest}
        onConfirm={logDestination}
      />
    </div>
  );
};

// ============================================================================
// ENDED VIEW — Now includes VOD Checklist + Care After Death + PLIIE
// ============================================================================
const EndedView: React.FC<{
  onShowPdf: (pdf: PDFIdentifiable) => void;
}> = ({ onShowPdf }) => {
  const {
    postMortemTasks,
    toggleChecklistItemCompletion,
    events,
    vodChecklist,
    vodConfirmed,
    confirmVOD,
    toggleVodChecklistItem,
  } = useArrest();
  const [showPLIIE, setShowPLIIE] = useState(false);

  const allVodChecked = vodChecklist.every((item) => item.isCompleted);

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
              const parts = item.name.split(": ");
              const letter = parts[0];
              const description = parts.slice(1).join(": ");

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
                  <span
                    className={`text-sm ${item.isCompleted ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-800 dark:text-gray-200"}`}
                  >
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
              If suspicious or unnatural circumstances are suspected, leave equipment in situ, minimize contamination,
              and contact the Police.
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
            {postMortemTasks.map((item) => (
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
                <span
                  className={`text-sm ${item.isCompleted ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-800 dark:text-gray-200"}`}
                >
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
        className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-full bg-tone-tint text-tone-on-tint font-semibold text-sm transition-all active:scale-95"
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
  onShowTrauma: () => void;
}> = (props) => {
  const {
    traumaInterventionCount,
    uiState,
    analyseRhythm,
    logRhythm,
    achieveROSC,
    deliverShock,
    deliverStackedShocks,
    shockCount,
    isAdrenalineAvailable,
    isAmiodaroneAvailable,
    isLidocaineAvailable,
    isRhythmCheckDue,
    isAdrenalineHighlighted,
    isAmiodaroneHighlighted,
    shouldShowLidocaineReminder,
    adrenalineButtonDetail,
    amiodaroneButtonDetail,
    lidocaineButtonDetail,
    dismissAdrenalinePrompt,
    setHideAmiodaronePrompt,
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
      <div id="arrest-primary-action" className="space-y-6 scroll-mt-4">
      {/* Rhythm Analysis */}
      {uiState === UIState.Default && (
        <ActionButton
          title="Analyse Rhythm"
          tone="primary"
          highlight={isRhythmCheckDue ? "handsOff" : undefined}
          icon={<Activity size={20} />}
          height="h-16"
          fontSize="text-lg"
          onClick={analyseRhythm}
        />
      )}
      {uiState === UIState.Analyzing && (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-3">
          <h3 className="text-center font-semibold text-gray-700 dark:text-gray-300">Select Rhythm</h3>
          <div className="grid grid-cols-2 gap-3">
            <ActionButton
              title="VF"
              tone="danger"
              onClick={() => logRhythm("VF", true)}
            />
            <ActionButton
              title="VT"
              tone="danger"
              onClick={() => logRhythm("VT", true)}
            />
            <ActionButton
              title="PEA"
              tone="slate"
              onClick={() => logRhythm("PEA", false)}
            />
            <ActionButton
              title="Asystole"
              tone="slate"
              onClick={() => logRhythm("Asystole", false)}
            />
          </div>
          <ActionButton
            title="ROSC"
            tone="positive"
            icon={<Heart size={18} />}
            onClick={achieveROSC}
          />
        </div>
      )}
      {uiState === UIState.ShockAdvised && (
        <ActionButton
          title="Deliver Shock"
          tone="danger"
          highlight="handsOff"
          icon={<Bolt size={20} />}
          height="h-16"
          fontSize="text-lg"
          onClick={() => deliverShock()}
        />
      )}
      {uiState === UIState.ShockAdvised && shockCount === 0 && (
        // Only offered for the first shocks; RCUK limits stacked shocks to witnessed, monitored arrests.
        <div className="space-y-1">
          <ActionButton
            title="3 Stacked Shocks"
            tone="dangerTint"
            icon={<Zap size={18} />}
            onClick={deliverStackedShocks}
          />
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">Witnessed, monitored VF/pVT only</p>
        </div>
      )}
      </div>

      {/* Medications */}
      <div id="arrest-medications" className="space-y-3">
        <h3 className="text-center font-semibold text-gray-700 dark:text-gray-300">Medications</h3>
        <div className="grid grid-cols-2 gap-3">
          <ActionButton
            title="Adrenaline"
            tone="standard"
            highlight={isAdrenalineHighlighted ? "drugDue" : undefined}
            detail={adrenalineButtonDetail}
            onNotNow={isAdrenalineHighlighted ? dismissAdrenalinePrompt : undefined}
            icon={<Syringe size={16} />}
            height={DRUG_BUTTON_HEIGHT}
            fontSize="text-sm"
            onClick={props.onLogAdrenaline}
            disabled={!isAdrenalineAvailable}
          />
          <ActionButton
            title="Amiodarone"
            tone="standard"
            highlight={isAmiodaroneHighlighted ? "drugDue" : undefined}
            detail={amiodaroneButtonDetail}
            onNotNow={isAmiodaroneHighlighted ? () => setHideAmiodaronePrompt(true) : undefined}
            icon={<Syringe size={16} />}
            height={DRUG_BUTTON_HEIGHT}
            fontSize="text-sm"
            onClick={props.onLogAmiodarone}
            disabled={!isAmiodaroneAvailable}
          />
          <ActionButton
            title="Lidocaine"
            tone="standard"
            highlight={shouldShowLidocaineReminder ? "drugDue" : undefined}
            detail={lidocaineButtonDetail}
            onNotNow={shouldShowLidocaineReminder ? () => setHideAmiodaronePrompt(true) : undefined}
            icon={<Syringe size={16} />}
            height={DRUG_BUTTON_HEIGHT}
            fontSize="text-sm"
            onClick={props.onLogLidocaine}
            disabled={!isLidocaineAvailable}
          />
          <ActionButton
            title="Other Meds..."
            tone="standard"
            icon={<Pill size={16} />}
            height={DRUG_BUTTON_HEIGHT}
            fontSize="text-sm"
            onClick={props.onShowOtherDrugs}
          />
        </div>
      </div>

      {/* Procedures */}
      <div className="space-y-3">
        <h3 className="text-center font-semibold text-gray-700 dark:text-gray-300">Procedures</h3>
        <div className="grid grid-cols-2 gap-3">
          <ActionButton
            title="Adv. Airway"
            tone="standard"
            icon={<AirVent size={16} />}
            height="h-12"
            fontSize="text-sm"
            onClick={handleAirway}
          />
          <ActionButton
            title="Log ETCO2"
            tone="standard"
            icon={<Gauge size={16} />}
            height="h-12"
            fontSize="text-sm"
            onClick={props.onShowEtco2}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ActionButton
            title="Log IV / IO"
            tone="standard"
            icon={<Droplet size={16} />}
            height="h-12"
            fontSize="text-sm"
            onClick={handleIVIO}
          />
          <ActionButton
            title={traumaInterventionCount > 0 ? `Trauma (${traumaInterventionCount})` : "Trauma..."}
            tone={traumaInterventionCount > 0 ? "primary" : "standard"}
            icon={traumaInterventionCount > 0 ? <CheckCircle2 size={16} /> : <Bandage size={16} />}
            height="h-12"
            fontSize="text-sm"
            onClick={props.onShowTrauma}
          />
        </div>
      </div>

      {/* Patient Status */}
      <div className="space-y-3">
        <h3 className="text-center font-semibold text-gray-700 dark:text-gray-300">Patient Status</h3>
        <div className="grid grid-cols-2 gap-3">
          <ActionButton
            title="ROSC"
            tone="positive"
            icon={<HeartPulse size={16} />}
            height="h-12"
            fontSize="text-sm"
            onClick={achieveROSC}
          />
          <ActionButton
            title="TOR"
            tone="dangerTint"
            icon={<XSquare size={16} />}
            height="h-12"
            fontSize="text-sm"
            onClick={props.onShowTOR}
          />
        </div>
      </div>
    </div>
  );
};

// Adrenaline was given before eResus at an unknown time. Choosing roughly when starts the usual timer;
// "Don't know" makes it due now. Left alone, the next rhythm check does the same (matches iOS).
// totalTime: the arrest clock now; a choice earlier than 00:00 isn't offered.
const AdrenalineTimeUnknownView: React.FC<{ totalTime: number; onSelect: (minutesAgo: number | null) => void }> = ({
  totalTime,
  onSelect,
}) => (
  <div className="p-3 rounded-2xl bg-tone-tint text-tone-on-tint space-y-2">
    <div className="flex items-center justify-center gap-2 font-bold">
      <Syringe size={20} />
      <span>Last adrenaline: time unknown</span>
    </div>
    <div className="flex gap-2">
      {([[2, "~2 min ago"], [4, "~4 min ago"], [null, "Don't know"]] as [number | null, string][])
        .filter(([minutes]) => minutes === null || totalTime >= minutes * 60)
        .map(([minutes, label]) => (
        <button
          key={label}
          onClick={() => onSelect(minutes)}
          className="flex-1 min-h-11 px-2 rounded-xl text-sm font-semibold bg-white/60 dark:bg-white/10 active:scale-95 transition-transform"
        >
          {label}
        </button>
      ))}
    </div>
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
    {items.map((item) => (
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
        <span
          className={`text-sm ${item.isCompleted ? "text-gray-400 dark:text-gray-500 line-through" : "text-gray-800 dark:text-gray-200"}`}
        >
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
  // Reversed first, so entries logged in the same second keep the order they were logged in.
  const sortedEvents = useMemo(() => [...events].reverse().sort((a, b) => a.timestamp - b.timestamp), [events]);

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
      {AppConstants.pdfAlgorithms.map((pdf) => (
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
  const { undo, canUndo, isTimerPaused, pauseArrest, resumeArrest, arrestState } = useArrest();
  // The tab bar is hidden during an arrest, so the bar sits on the home indicator instead.
  const tabBarHidden = arrestState === ArrestState.Active || arrestState === ArrestState.Rosc;

  // Tinted rather than solid, so they don't compete with Analyse Rhythm or Deliver Shock above.
  return (
    <div
      className={`fixed bottom-0 left-0 right-0 p-3 ${tabBarHidden ? "pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "pb-[72px]"} bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 z-10`}
    >
      <div className="flex space-x-3">
        {isTimerPaused ? (
          <>
            <ActionButton title="Resume" tone="primary" icon={<Play size={18} />} height="h-12" onClick={resumeArrest} />
            <ActionButton title="Summary" tone="standard" height="h-12" onClick={onShowSummary} />
            <ActionButton title="Reset" tone="dangerTint" icon={<RotateCw size={18} />} height="h-12" onClick={onShowReset} />
          </>
        ) : (
          <>
            <ActionButton title="Undo" tone="standard" icon={<Undo size={18} />} height="h-12" onClick={undo} disabled={!canUndo} />
            <ActionButton title="Summary" tone="standard" height="h-12" onClick={onShowSummary} />
            <ActionButton title="Stop" tone="dangerTint" icon={<Square size={18} />} height="h-12" onClick={pauseArrest} />
          </>
        )}
      </div>
    </div>
  );
};

// Helper for event log colors
const getEventTypeColor = (type: EventType): string => {
  switch (type) {
    case EventType.Status:
      return "text-green-500";
    case EventType.Cpr:
      return "text-cyan-500";
    case EventType.Shock:
      return "text-orange-500";
    case EventType.Analysis:
      return "text-blue-500";
    case EventType.Rhythm:
      return "text-purple-500";
    case EventType.Drug:
      return "text-pink-500";
    case EventType.Airway:
      return "text-teal-500";
    case EventType.Etco2:
      return "text-indigo-500";
    case EventType.Cause:
      return "text-gray-500";
    case EventType.VascularAccess:
      return "text-fuchsia-500";
    default:
      return "text-gray-800 dark:text-gray-200";
  }
};

//============================================================================
// MAIN VIEWS
//============================================================================

// ArrestView
const ArrestView: React.FC<{
  onShowPdf: (pdf: PDFIdentifiable) => void;
  onShowNewborn: () => void;
  needsSetup?: boolean;
  onStartSetup?: () => void;
}> = ({ onShowPdf, onShowNewborn, needsSetup = false, onStartSetup }) => {
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
  const [showTraumaModal, setShowTraumaModal] = useState(false);
  const [otherDrugsFocus, setOtherDrugsFocus] = useState<DrugGroupKind | null>(null);
  const [drugToLog, setDrugToLog] = useState<DrugToLog | null>(null);
  const [drugConfirmation, setDrugConfirmation] = useState<{ drug: DrugToLog; dose: string } | null>(null);

  // A double tap is dropped; a repeat soon after (or a second TXA, or a third antiarrhythmic) is asked about
  // first (matches iOS checkRepeat).
  const [repeatPrompt, setRepeatPrompt] = useState<{ message: string; proceed: () => void } | null>(null);
  const repeatCounts = { amiodarone: viewModel.amiodaroneCount, lidocaine: viewModel.lidocaineCount };
  const checkRepeatFor = (name: string) =>
    repeatCheck(viewModel.events, name, Date.now() / 1000, viewModel.totalArrestTime, repeatCounts);
  const checkRepeat = (name: string, proceed: () => void) => {
    const check = checkRepeatFor(name);
    if (check.kind === "new") proceed();
    else if (check.kind === "doubleTap") {
      // Said, so a gloved tap that did nothing isn't taken for a second dose logged.
      HapticManager.notification("warning");
      showVoiceFeedback(`${name} already logged`, true);
    } else {
      HapticManager.notification("warning");
      setRepeatPrompt({ message: check.message, proceed });
    }
  };

  const handleLogDrug = (drug: DrugToLog) => {
    checkRepeat(getDrugLogTitle(drug), () => proceedLogDrug(drug));
  };

  const proceedLogDrug = (drug: DrugToLog) => {
    if (showDosagePrompts) {
      if (viewModel.patientAgeCategory && (drug.type === "adrenaline" || drug.type === "amiodarone")) {
        let dose: string | null = null;
        if (drug.type === "adrenaline") {
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
        case "adrenaline":
          viewModel.logAdrenaline();
          break;
        case "amiodarone":
          viewModel.logAmiodarone();
          break;
        case "lidocaine":
          viewModel.logLidocaine();
          break;
        case "other":
          viewModel.logOtherDrug(drug.name);
          break;
      }
    }
  };

  const handleConfirmDrug = (confirmed: boolean) => {
    if (drugConfirmation && confirmed) {
      switch (drugConfirmation.drug.type) {
        case "adrenaline":
          viewModel.logAdrenaline(drugConfirmation.dose);
          break;
        case "amiodarone":
          viewModel.logAmiodarone(drugConfirmation.dose);
          break;
      }
    } else if (drugConfirmation) {
      setDrugToLog(drugConfirmation.drug);
    }
    setDrugConfirmation(null);
  };

  const handleSelectOtherDrug = (name: string) => {
    setShowOtherDrugsModal(false);
    handleLogDrug({ type: "other", name });
  };

  const openDrugs = (focus: DrugGroupKind | null) => {
    setOtherDrugsFocus(focus);
    setShowOtherDrugsModal(true);
  };

  // Voice commands
  // undoDepth: Undo goes back to here, reversing everything from that one phrase.
  const [voiceFeedback, setVoiceFeedback] = useState<{ id: number; message: string; succeeded: boolean; undoDepth: number | null } | null>(
    null,
  );
  // A phrase can hold several actions ("rhythm check VF shock delivered"). They run one per render so
  // each sees the state the previous one left, exactly as separate taps would.
  const [voiceRun, setVoiceRun] = useState<{
    heard: string;
    actions: VoiceAction[];
    index: number;
    // A handover's "started" runs first and can move the clock, so the spoken time is read after it.
    spokenTime: VoiceTime | null;
    time: number | null;
    depthBefore: number;
    done: string[];
    notes: string[];
    stoppedBecause: string | null;
  } | null>(null);
  const { etco2Unit, voiceHandsFree, voiceWakeWord } = useSettings();
  const voiceAvailable = useVoiceCommandsAvailable();

  // The first time someone adds time before eResus, point them to where earlier shocks and drugs go.
  const hasShownBeforeEResusHintRef = useRef(false);
  useEffect(() => {
    if (viewModel.arrestState === ArrestState.Pending) hasShownBeforeEResusHintRef.current = false;
  }, [viewModel.arrestState]);
  const showBeforeEResusHint = () => {
    // Never over a voice result, which may still be offering Undo.
    if (hasShownBeforeEResusHintRef.current || voiceFeedback || viewModel.arrestState !== ArrestState.Active) return;
    hasShownBeforeEResusHintRef.current = true;
    showVoiceFeedback("Given shocks or drugs before eResus? Tap the counters at the top to add them.", true);
  };

  // Logging a trauma intervention can quieten the drug prompts; say so, so it's never silent.
  const wasTraumaRef = useRef(viewModel.isTraumaArrest);
  useEffect(() => {
    const wasTrauma = wasTraumaRef.current;
    wasTraumaRef.current = viewModel.isTraumaArrest;
    // A phrase being run says it in its own result.
    if (!viewModel.isTraumaArrest || wasTrauma || voiceFeedback || voiceRun || viewModel.arrestState !== ArrestState.Active) return;
    showVoiceFeedback(
      "Treated as a traumatic arrest: HOTT first, drug prompts quietened. Use Not trauma or Prompts on in the HOTT card to change this.",
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewModel.isTraumaArrest]);

  const showVoiceFeedback = (message: string, succeeded: boolean, undoDepth: number | null = null) => {
    const id = Date.now();
    setVoiceFeedback({ id, message, succeeded, undoDepth });
    // Long enough to read and reach Undo mid-compressions; a refusal stays longer, as it needs acting on.
    setTimeout(() => setVoiceFeedback((current) => (current?.id === id ? null : current)), succeeded ? 12000 : 20000);
  };

  const handleVoiceTranscript = (transcript: string) => {
    const heard = transcript ? `Heard “${transcript}”.` : "Nothing heard.";
    const parse = parseVoiceCommand(transcript);

    if (parse.reason) {
      navigator.vibrate?.([30, 50, 30]);
      const explanation = {
        question: "That sounded like a question; nothing logged.",
        instruction: "That sounded like an instruction. Say it once done, e.g. “adrenaline given”.",
        notGiven: "That sounded like something not yet done; nothing logged.",
        conflict: "That contained conflicting details; nothing logged. Please say it again.",
        nothing: "No command recognised; nothing logged.",
        downtime:
          "Downtime before arrival isn't recorded. To set the clock, say when the arrest was confirmed, e.g. “resus started 10 minutes ago”.",
        countUnclear: "For shocks or drugs given before eResus, say so, e.g. “2 shocks before eResus”; nothing logged.",
      }[parse.reason];
      showVoiceFeedback(`${heard} ${explanation}`, false);
      return;
    }

    setVoiceRun({
      heard,
      actions: parse.actions,
      index: 0,
      spokenTime: parse.time,
      time: null,
      depthBefore: viewModel.undoDepth,
      done: [],
      notes: [],
      stoppedBecause: null,
    });
  };

  const handleVoiceTranscriptRef = useRef(handleVoiceTranscript);
  handleVoiceTranscriptRef.current = handleVoiceTranscript;

  useEffect(() => {
    if (!voiceRun) return;
    const action = voiceRun.actions[voiceRun.index];
    if (action && !voiceRun.stoppedBecause) {
      // History entries sit at the moment eResus was started; only what happened since takes the spoken time.
      if (!["started", "given", "earlierRhythm"].includes(action.type) && voiceRun.spokenTime) {
        const time = viewModel.arrestTime(voiceRun.spokenTime);
        setVoiceRun(
          time === null
            ? { ...voiceRun, spokenTime: null, stoppedBecause: "That time is in the future or before the arrest was confirmed; not logged." }
            : { ...voiceRun, spokenTime: null, time },
        );
        return;
      }
      const result = performVoiceAction(action, voiceRun.time);
      if (result === "continue") {
        setVoiceRun({ ...voiceRun });
      } else if ("failure" in result) {
        setVoiceRun({ ...voiceRun, stoppedBecause: result.failure });
      } else {
        setVoiceRun({
          ...voiceRun,
          index: voiceRun.index + 1,
          done: [...voiceRun.done, result.summary],
          notes: result.note ? [...voiceRun.notes, result.note] : voiceRun.notes,
        });
      }
      return;
    }

    let message = voiceRun.heard;
    if (voiceRun.done.length > 0) {
      const when = voiceRun.time !== null ? ` at ${clockText(voiceRun.time)}` : "";
      message += ` Logged: ${voiceRun.done.join(", ")}${when}.`;
    }
    if (voiceRun.stoppedBecause) message += ` ${voiceRun.stoppedBecause}`;
    if (voiceRun.notes.length > 0) message += ` ${voiceRun.notes.join(" ")}`;

    const succeeded = voiceRun.done.length > 0;
    navigator.vibrate?.(succeeded && !voiceRun.stoppedBecause ? 20 : [30, 50, 30]);
    const canUndo = succeeded && viewModel.undoDepth > voiceRun.depthBefore;
    showVoiceFeedback(message, succeeded, canUndo ? voiceRun.depthBefore : null);
    setVoiceRun(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceRun]);

  // Live (not back-dated) voice entries of something just logged are refused, so closed-loop calls aren't two doses.
  const voiceRefusal = (name: string, time: number | null) =>
    voiceRepeatRefusal(viewModel.events, name, time, Date.now() / 1000, viewModel.totalArrestTime, repeatCounts);

  // Each action only applies when a tap would make sense at this point in the algorithm (matches iOS).
  // "continue" means it has done the first half and wants the next render to finish.
  const performVoiceAction = (
    action: VoiceAction,
    time: number | null,
  ): { summary: string; note?: string } | { failure: string } | "continue" => {
    const vm = viewModel;
    if (action.type === "undo") {
      if (!vm.canUndo) return { failure: "Nothing to undo." };
      vm.undo();
      return { summary: "undo" };
    }
    // Drugs, readings and interventions are also logged after ROSC; everything else needs an active arrest.
    const worksAfterROSC = action.type === "otherDrug" || action.type === "observation" || action.type === "procedure";
    const stateAllows = vm.arrestState === ArrestState.Active || (worksAfterROSC && vm.arrestState === ArrestState.Rosc);
    if (!stateAllows || vm.isTimerPaused) {
      return { failure: "Voice commands work during an active adult arrest." };
    }

    switch (action.type) {
      case "started": {
        const confirmed = vm.dateFor(action.time);
        if (!confirmed) return { failure: "That time is in the future; the clock wasn't changed." };
        // Whole minutes: it's an estimate, and the clock shouldn't pretend otherwise.
        const offset = Math.round(((Date.now() - confirmed.getTime()) / 1000 - vm.masterTime) / 60) * 60;
        if (offset < 0) return { failure: "eResus was started before then; the clock wasn't changed." };
        let moved = false;
        vm.performFromVoice(null, () => {
          moved = vm.setTimeBeforeStart(offset);
        });
        if (!moved) return { failure: "Earlier entries are before that time; the clock wasn't changed." };
        return {
          summary: offset === 0 ? "arrest confirmed when eResus was started" : `arrest confirmed ~${offset / 60} min before eResus`,
        };
      }
      case "given": {
        const { item, count } = action;
        let added = false;
        if (!["shock", "adrenaline", "amiodarone", "lidocaine"].includes(item)) {
          vm.performFromVoice(null, () => {
            added = vm.logOtherBeforeStart(item);
          });
          if (!added) return { failure: `${item} wasn't added.` };
          return { summary: `${item} before eResus` };
        }
        vm.performFromVoice(null, () => {
          added = vm.logBeforeStart({ [item]: count });
        });
        if (!added) {
          const other = item === "amiodarone" ? "Lidocaine" : "Amiodarone";
          return { failure: `${other} is already recorded, so ${item} wasn't added.` };
        }
        const name = item.charAt(0).toUpperCase() + item.slice(1);
        const summary = item === "shock" ? (count === 1 ? "1 shock" : `${count} shocks`) : `${name} ×${count}`;
        // An antiarrhythmic before the 3rd shock is unusual; the shock count is probably incomplete.
        const note =
          (item === "amiodarone" || item === "lidocaine") && vm.drugTimingShockCount < 3
            ? `${name} is usually given after the 3rd shock: say how many shocks were given.`
            : undefined;
        return { summary: `${summary} before eResus`, note };
      }
      case "earlierRhythm": {
        const name =
          action.rhythm === "Shockable" ? "Shockable rhythm" : action.rhythm === "Non-shockable" ? "Non-shockable rhythm" : action.rhythm;
        vm.performFromVoice(null, () => vm.logEarlierRhythm(name));
        return { summary: `${name} before eResus` };
      }
      case "drug": {
        const { drug, dose } = action;
        const refusal = voiceRefusal(drug.charAt(0).toUpperCase() + drug.slice(1), time);
        if (refusal) return { failure: refusal };
        if (drug === "adrenaline") {
          if (!vm.isAdrenalineAvailable) return { failure: "Adrenaline is withheld (severe hypothermia)." };
          vm.performFromVoice(time, () => vm.logAdrenaline(dose, true));
        } else if (drug === "amiodarone") {
          if (!vm.isAmiodaroneAvailable) return { failure: "Amiodarone isn't available now." };
          vm.performFromVoice(time, () => vm.logAmiodarone(dose, true));
        } else {
          if (!vm.isLidocaineAvailable) return { failure: "Lidocaine isn't available now." };
          vm.performFromVoice(time, () => vm.logLidocaine(dose, true));
        }
        const name = drug.charAt(0).toUpperCase() + drug.slice(1);
        return { summary: dose ? `${name} ${dose}` : name, note: doseNote(drug, dose) ?? undefined };
      }
      case "otherDrug": {
        const { drug, dose } = action;
        const refusal = voiceRefusal(drug, time);
        if (refusal) return { failure: refusal };
        vm.performFromVoice(time, () => vm.logOtherDrug(drug, dose, true));
        return { summary: dose ? `${drug} ${dose}` : drug };
      }
      case "procedure": {
        // Chest procedures need a side; guessing one would put the wrong side on the record.
        if (!isTraumaProcedureName(action.procedure)) return { failure: `${action.procedure}: say left, right or both.` };
        const refusal = voiceRefusal(action.procedure, time);
        if (refusal) return { failure: refusal };
        // Only a definitive TCA intervention during the arrest marks it as traumatic (as logTraumaProcedure decides).
        const marksTrauma =
          !vm.isTraumaArrest && vm.arrestState === ArrestState.Active && TRAUMA_MARKS_ARREST.has(action.procedure);
        vm.performFromVoice(time, () => vm.logTraumaProcedure(action.procedure));
        return {
          summary: action.procedure,
          note: marksTrauma ? "Treated as a traumatic arrest: HOTT first, drug prompts quietened." : undefined,
        };
      }
      case "trauma":
        if (vm.isTraumaArrest) return { summary: "traumatic arrest (already set)" };
        vm.performFromVoice(null, () => vm.setTraumaArrest(true));
        return { summary: "traumatic arrest: HOTT first, drug prompts quietened" };
      case "observation": {
        const { kind, value } = action;
        vm.performFromVoice(null, () => vm.logObservation(kind, value));
        return { summary: `${ROSC_OBSERVATIONS[kind].title} ${value}` };
      }
      case "analyse":
        if (vm.uiState !== UIState.Default) return { failure: "A rhythm check is already in progress." };
        vm.performFromVoice(time, vm.analyseRhythm);
        return { summary: "rhythm check" };
      case "rhythm": {
        if (vm.uiState === UIState.ShockAdvised) return { failure: "A shock is already advised." };
        // "VF" on its own starts the rhythm check first, as the buttons would.
        if (vm.uiState === UIState.Default) {
          vm.performFromVoice(time, vm.analyseRhythm);
          return "continue";
        }
        const shockable = ["VF", "VT", "Shockable"].includes(action.rhythm);
        const name =
          action.rhythm === "Shockable" ? "Shockable rhythm" : action.rhythm === "Non-shockable" ? "Non-shockable rhythm" : action.rhythm;
        vm.performFromVoice(time, () => vm.logRhythm(name, shockable));
        return { summary: name };
      }
      case "shock": {
        if (vm.uiState !== UIState.ShockAdvised) return { failure: "Log a shockable rhythm before a shock." };
        const shockNumber = vm.shockCount + 1;
        vm.performFromVoice(time, () => vm.deliverShock(action.energy));
        return { summary: action.energy ? `shock ${shockNumber} ${action.energy}` : `shock ${shockNumber}` };
      }
      case "rosc":
        vm.performFromVoice(time, vm.achieveROSC);
        return { summary: "ROSC" };
      case "airway": {
        const type = action.device as AirwayAdjunctType;
        vm.performFromVoice(time, () => vm.logAirwayPlaced(type));
        return { summary: type === AirwayAdjunctType.Unspecified ? "advanced airway" : getAirwayAdjunctDisplayName(type) };
      }
      case "access": {
        const { route, successful, gauge, location } = action;
        vm.performFromVoice(time, () => vm.logVascularAccess(route, location ?? "", gauge ?? "", successful));
        const detail = [gauge, location].filter(Boolean).join(", ");
        return { summary: `${route} ${successful ? "access" : "failed"}${detail ? ` (${detail})` : ""}` };
      }
      case "etco2": {
        const unit = action.unit ?? etco2Unit;
        // Below 5 mmHg is far more likely a kPa reading said out of habit.
        const [min, max] = unit === "kPa" ? [0.1, 20] : [5, 150];
        if (action.value < min || action.value > max) {
          return { failure: `ETCO2 ${formatNumber(action.value)} ${unit} is outside the expected range; not logged.` };
        }
        vm.performFromVoice(time, () => vm.logEtco2(String(action.value), unit));
        return { summary: `ETCO2 ${formatNumber(action.value)} ${unit}` };
      }
    }
  };

  // A gentle check, not a block: logs what was said but flags a dose that differs from the expected one.
  // Checked before the dose is logged, so the counts are of doses already given.
  const doseNote = (drug: string, dose: string | null): string | null => {
    const age = viewModel.patientAgeCategory ?? PatientAgeCategory.Adult;
    const isAdult = age === PatientAgeCategory.Adult;
    const expected =
      drug === "adrenaline"
        ? DosageCalculator.calculateAdrenalineDose(age)
        : drug === "amiodarone"
          ? DosageCalculator.calculateAmiodaroneDose(age, viewModel.amiodaroneCount + 1)
          : drug === "lidocaine" && isAdult
            ? viewModel.lidocaineCount === 0
              ? "100mg"
              : "50mg"
            : null;
    return checkDose(drug, dose, expected, isAdult);
  };

  const clockText = (total: number) =>
    new Date(Date.now() + (total - viewModel.totalArrestTime) * 1000).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

  // Hands-free listens only while an adult arrest is running on screen, or after ROSC.
  const shouldListenHandsFree =
    voiceAvailable &&
    voiceHandsFree &&
    (viewModel.arrestState === ArrestState.Active || viewModel.arrestState === ArrestState.Rosc) &&
    !viewModel.isTimerPaused;
  useEffect(() => {
    if (shouldListenHandsFree) {
      voiceCommandListener.startHandsFree(voiceWakeWord, (command) => handleVoiceTranscriptRef.current(command));
    } else {
      voiceCommandListener.stopHandsFree();
    }
  }, [shouldListenHandsFree, voiceWakeWord]);
  useEffect(() => () => voiceCommandListener.stopHandsFree(), []);

  return (
    <div className="flex flex-col h-full">
      <HeaderView onAddTime={showBeforeEResusHint} />

      <div className="flex-grow overflow-y-auto bg-gray-100 dark:bg-gray-900">
        {viewModel.arrestState === ArrestState.Pending && (
          <PendingView onShowPdf={onShowPdf} onShowNewborn={onShowNewborn} needsSetup={needsSetup} onStartSetup={onStartSetup} />
        )}
        {viewModel.arrestState === ArrestState.Active && (
          <ActiveArrestContentView
            onShowPdf={onShowPdf}
            onShowOtherDrugs={() => setShowOtherDrugsModal(true)}
            onShowEtco2={() => setShowEtco2Modal(true)}
            onShowHypothermia={() => setShowHypothermiaModal(true)}
            onShowAirwayAdjunct={() => setShowAirwayAdjunctModal(true)}
            onShowVascularAccess={() => setShowVascularAccessModal(true)}
            onLogAdrenaline={() => handleLogDrug({ type: "adrenaline" })}
            onLogAmiodarone={() => handleLogDrug({ type: "amiodarone" })}
            onLogLidocaine={() => handleLogDrug({ type: "lidocaine" })}
            onShowTOR={() => setShowTORModal(true)}
            onShowTrauma={() => setShowTraumaModal(true)}
            onVoiceTranscript={handleVoiceTranscript}
          />
        )}
        {viewModel.arrestState === ArrestState.Rosc && (
          <RoscView
            onShowPdf={onShowPdf}
            onOpenDrugs={openDrugs}
            onShowEtco2={() => setShowEtco2Modal(true)}
            onVoiceTranscript={handleVoiceTranscript}
          />
        )}
        {viewModel.arrestState === ArrestState.Ended && <EndedView onShowPdf={onShowPdf} />}
      </div>

      {voiceFeedback && viewModel.arrestState !== ArrestState.Pending && (
        // Shows what was heard and what it did, with Undo one tap away.
        <div
          className={`mx-3 mb-2 flex items-center gap-3 p-3 rounded-xl shadow text-sm ${
            voiceFeedback.succeeded ? "bg-tone-tint text-tone-on-tint" : "bg-tone-alert text-tone-on-alert"
          }`}
        >
          <span className="flex-grow">{voiceFeedback.message}</span>
          {voiceFeedback.undoDepth !== null && (
            <button
              onClick={() => {
                viewModel.undoToDepth(voiceFeedback.undoDepth!);
                setVoiceFeedback(null);
              }}
              className="px-3 py-1.5 rounded-lg font-semibold bg-tone-accent text-tone-on-accent"
            >
              Undo
            </button>
          )}
        </div>
      )}
      {viewModel.arrestState !== ArrestState.Pending && (
        <BottomControlsView
          onShowSummary={() => setShowSummaryModal(true)}
          onShowReset={() => setShowResetModal(true)}
        />
      )}

      {/* Modals */}
      <SummaryView
        isOpen={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        typeColour={(type) => getEventTypeColor(type as EventType)}
        {...viewModel.summaryInput()}
      />
      <ResetModalView isOpen={showResetModal} onClose={() => setShowResetModal(false)} />
      <HypothermiaModal isOpen={showHypothermiaModal} onClose={() => setShowHypothermiaModal(false)} />
      <Etco2ModalView isOpen={showEtco2Modal} onClose={() => setShowEtco2Modal(false)} />
      <AirwayAdjunctModal isOpen={showAirwayAdjunctModal} onClose={() => setShowAirwayAdjunctModal(false)} />
      <VascularAccessModal isOpen={showVascularAccessModal} onClose={() => setShowVascularAccessModal(false)} />
      <TORGuidanceModal
        isOpen={showTORModal}
        onClose={() => setShowTORModal(false)}
        onConfirmTOR={viewModel.confirmTOR}
      />
      <OtherDrugsSheet
        isOpen={showOtherDrugsModal}
        onClose={() => {
          setShowOtherDrugsModal(false);
          setOtherDrugsFocus(null);
        }}
        focus={otherDrugsFocus}
        recent={recentOtherDrugs(viewModel.events)}
        lastGiven={(drug) => loggedAt(viewModel.events, drug)}
        onSelect={handleSelectOtherDrug}
      />
      <TraumaSheet
        isOpen={showTraumaModal}
        onClose={() => setShowTraumaModal(false)}
        isTrauma={viewModel.isTraumaArrest}
        onSetTrauma={viewModel.setTraumaArrest}
        onLogProcedure={viewModel.logTraumaProcedure}
        repeatCheckFor={checkRepeatFor}
        loggedAt={(name) => loggedAt(viewModel.events, name)}
        onDrug={handleSelectOtherDrug}
        onFluids={() => openDrugs("fluids")}
      />
      {drugToLog && <DosageEntryModal isOpen={!!drugToLog} onClose={() => setDrugToLog(null)} drug={drugToLog} />}

      {repeatPrompt && (
        <RepeatPromptModal
          message={repeatPrompt.message}
          onCancel={() => setRepeatPrompt(null)}
          onConfirm={() => {
            const { proceed } = repeatPrompt;
            setRepeatPrompt(null);
            proceed();
          }}
        />
      )}

      {/* Drug Confirmation Alert */}
      {drugConfirmation && (
        <Modal isOpen={!!drugConfirmation} onClose={() => setDrugConfirmation(null)} title="Confirm Dosage">
          <div className="text-center space-y-4">
            <p className="text-lg text-gray-800 dark:text-gray-200">
              Confirm <span className="font-bold">{drugConfirmation.dose}</span>{" "}
              {getDrugLogTitle(drugConfirmation.drug)} given?
            </p>
            <div className="flex space-x-3">
              <ActionButton
                title="Cancel"
                backgroundColor="bg-gray-200 dark:bg-gray-700"
                foregroundColor="text-gray-800 dark:text-gray-200"
                onClick={() => handleConfirmDrug(false)}
              />
              <ActionButton
                title="Change"
                backgroundColor="bg-orange-500"
                foregroundColor="text-white"
                onClick={() => handleConfirmDrug(false)}
              />
              <ActionButton
                title="Confirm"
                backgroundColor="bg-blue-600"
                foregroundColor="text-white"
                onClick={() => handleConfirmDrug(true)}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// LogbookView
const LogbookView: React.FC = () => {
  const { db, userId, user } = useFirebase();
  const { askForPatientInfo, researchModeEnabled } = useSettings();
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [selectedLogEvents, setSelectedLogEvents] = useState<Event[]>([]);
  const [editingLog, setEditingLog] = useState<any | null>(null);
  const [longPressLog, setLongPressLog] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLogs([]);
      return;
    }
    const logsCollectionPath = `/artifacts/${appId}/users/${userId}/logs`;
    const q = query(collection(db, logsCollectionPath), where("userId", "==", userId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedLogs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        fetchedLogs.sort((a: any, b: any) => b.startTime.toMillis() - a.startTime.toMillis());
        setLogs(fetchedLogs);
      },
      (error) => {
        console.error("Error fetching logs: ", error);
      },
    );

    return () => unsubscribe();
  }, [db, userId, user]);

  const openLog = async (log: any) => {
    if (!log.id) return;
    setSelectedLog(log);
    try {
      const eventsCollectionPath = `/artifacts/${appId}/users/${userId}/logs/${log.id}/events`;
      const eventsSnapshot = await getDocs(collection(db, eventsCollectionPath));
      const fetchedEvents: Event[] = eventsSnapshot.docs.map((d) => d.data() as Event);
      // Newest first, like a live log.
      fetchedEvents.sort((a, b) => b.timestamp - a.timestamp);
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

  const hasPatientInfo = (log: any) =>
    !!(log.patientAge && log.patientAge !== "Unknown") || !!(log.patientGender && log.patientGender !== "Unknown");

  const getPatientInfoText = (log: any) => {
    const parts: string[] = [];
    if (log.patientAge && log.patientAge !== "Unknown") parts.push(`${log.patientAge} y/o`);
    if (log.patientGender && log.patientGender !== "Unknown") parts.push(log.patientGender);
    return parts.join(" ");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 bg-white dark:bg-gray-800 shadow-md">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Logbook</h1>
      </div>

      <div className="flex-grow overflow-y-auto bg-gray-100 dark:bg-gray-900 p-4 space-y-3">
        {logs.length === 0 && <p className="text-center text-gray-500 dark:text-gray-400 pt-10">No saved logs.</p>}
        {logs.map((log: any) => (
          <div
            key={log.id}
            className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow relative"
            onContextMenu={(e) => {
              e.preventDefault();
              setLongPressLog(longPressLog === log.id ? null : log.id);
            }}
          >
            <div className="flex justify-between items-start">
              <div onClick={() => openLog(log)} className="flex-grow text-left cursor-pointer">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {log.startTime.toDate().toLocaleDateString()}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {log.startTime.toDate().toLocaleTimeString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Duration: {TimeFormatter.format(log.totalDuration)} | Outcome: {log.finalOutcome}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  Shocks: {log.shockCount ?? 0} | Adr: {log.adrenalineCount ?? 0} | Amio: {log.amiodaroneCount ?? 0} |
                  Lido: {log.lidocaineCount ?? 0}
                </p>
                {hasPatientInfo(log) ? (
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-1">
                    {getPatientInfoText(log)}
                  </p>
                ) : (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingLog(log);
                    }}
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
                <button
                  onClick={() => {
                    setEditingLog(log);
                    setLongPressLog(null);
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center space-x-2"
                >
                  <Pencil size={14} /> <span>Edit Patient Info</span>
                </button>
                <button
                  onClick={() => {
                    openLog(log);
                    setLongPressLog(null);
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center space-x-2"
                >
                  <FileText size={14} /> <span>View Summary</span>
                </button>
                <button
                  onClick={() => {
                    log.id && deleteLog(log.id);
                    setLongPressLog(null);
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-2"
                >
                  <XSquare size={14} /> <span>Delete</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedLog && (
        <SummaryView
          isOpen
          onClose={() => setSelectedLog(null)}
          events={selectedLogEvents}
          totalTime={selectedLog.totalDuration}
          startTime={selectedLog.startTime?.toDate() ?? null}
          shockCount={selectedLog.shockCount ?? 0}
          adrenalineCount={selectedLog.adrenalineCount ?? 0}
          amiodaroneCount={selectedLog.amiodaroneCount ?? 0}
          lidocaineCount={Math.max(selectedLog.lidocaineCount ?? 0, lidocaineDosesIn(selectedLogEvents))}
          patientAge={selectedLog.patientAge && selectedLog.patientAge !== "Unknown" ? selectedLog.patientAge : null}
          patientGender={selectedLog.patientGender && selectedLog.patientGender !== "Unknown" ? selectedLog.patientGender : null}
          typeColour={(type) => getEventTypeColor(type as EventType)}
        />
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, email);
        setResetSent(true);
      } else if (mode === "register") {
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
      setError(e.message || "An error occurred");
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (e: any) {
      setError(e.message || "Google sign-in failed");
    }
    setLoading(false);
  };

  const handleAppleSignIn = async () => {
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, appleProvider);
      onClose();
    } catch (e: any) {
      setError(e.message || "Apple sign-in failed");
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    try {
      settings.setResearchModeEnabled(false);
      await signOut(auth);
      onClose();
    } catch (e: any) {
      setError(e.message || "Sign out failed");
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
          <p className="font-semibold text-gray-900 dark:text-white">
            {user.email || user.displayName || "Connected Account"}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Your arrest logs are synced across all your signed-in devices.
          </p>
          <ActionButton
            title="Sign Out"
            tone="dangerTint"
            onClick={handleSignOut}
          />
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "reset" ? "Reset Password" : mode === "register" ? "Create Account" : "Sign In"}
    >
      <div className="space-y-4">
        {mode === "reset" && resetSent ? (
          <div className="text-center space-y-3">
            <CheckCircle2 size={48} className="text-green-500 mx-auto" />
            <p className="text-gray-700 dark:text-gray-300">
              Password reset email sent to <strong>{email}</strong>.
            </p>
            <ActionButton
              title="Back to Sign In"
              backgroundColor="bg-blue-600"
              foregroundColor="text-white"
              onClick={() => {
                setMode("login");
                setResetSent(false);
              }}
            />
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              {mode === "reset"
                ? "Enter your email to receive a password reset link."
                : "Sign in to sync your arrest logs across devices."}
            </p>

            {mode !== "reset" && (
              <div className="space-y-2">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full flex items-center justify-center space-x-3 py-3 px-4 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl font-medium text-gray-800 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 active:scale-95 transition-all disabled:opacity-50"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>
                <button
                  onClick={handleAppleSignIn}
                  disabled={loading}
                  className="w-full flex items-center justify-center space-x-3 py-3 px-4 bg-black text-white rounded-xl font-medium hover:bg-gray-900 active:scale-95 transition-all disabled:opacity-50"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
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

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="w-full p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white"
            />
            {mode !== "reset" && (
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white"
              />
            )}
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <ActionButton
              title={
                loading
                  ? "Please wait..."
                  : mode === "reset"
                    ? "Send Reset Link"
                    : mode === "register"
                      ? "Create Account"
                      : "Sign In with Email"
              }
              backgroundColor="bg-blue-600"
              foregroundColor="text-white"
              onClick={handleSubmit}
              disabled={loading}
            />
            {mode === "login" && (
              <>
                <button
                  onClick={() => {
                    setMode("register");
                    setError("");
                  }}
                  className="w-full text-center text-sm text-blue-600 dark:text-blue-400"
                >
                  Don't have an account? Create one
                </button>
                <button
                  onClick={() => {
                    setMode("reset");
                    setError("");
                  }}
                  className="w-full text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  Forgot password?
                </button>
              </>
            )}
            {mode === "register" && (
              <button
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
                className="w-full text-center text-sm text-blue-600 dark:text-blue-400"
              >
                Already have an account? Sign in
              </button>
            )}
            {mode === "reset" && (
              <button
                onClick={() => {
                  setMode("login");
                  setError("");
                  setResetSent(false);
                }}
                className="w-full text-center text-sm text-blue-600 dark:text-blue-400"
              >
                Back to Sign In
              </button>
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
    cprCycleDuration,
    setCprCycleDuration,
    adrenalineInterval,
    setAdrenalineInterval,
    metronomeBPM,
    setMetronomeBPM,
    appearanceMode,
    setAppearanceMode,
    showDosagePrompts,
    setShowDosagePrompts,
    researchModeEnabled,
    setResearchModeEnabled,
    setHasRespondedToResearchTerms,
    askForPatientInfo,
    setAskForPatientInfo,
    userOrganization,
    setUserOrganization,
    voicePromptsEnabled,
    setVoicePromptsEnabled,
    voicePromptsToneOnly,
    setVoicePromptsToneOnly,
    rhythmCheckWarning,
    setRhythmCheckWarning,
    promptRhythmCheck,
    setPromptRhythmCheck,
    promptAdrenaline,
    setPromptAdrenaline,
    promptAntiarrhythmic,
    setPromptAntiarrhythmic,
    etco2Unit,
    setEtco2Unit,
    voiceCommandsEnabled,
    setVoiceCommandsEnabled,
    voiceHandsFree,
    setVoiceHandsFree,
    voiceWakeWord,
    setVoiceWakeWord,
  } = useSettings();
  const [voiceCommandsMessage, setVoiceCommandsMessage] = useState<string | null>(null);

  // Enabling checks for on-device recognition and downloads the language pack if needed (needs a tap).
  const toggleVoiceCommands = async (enable: boolean) => {
    if (!enable) {
      setVoiceCommandsEnabled(false);
      setVoiceCommandsMessage(null);
      return;
    }
    let status = await checkVoiceCommandAvailability();
    if (status === "downloadable" || status === "downloading") {
      setVoiceCommandsMessage("Downloading English (UK) speech recognition to this device…");
      status = (await installVoiceCommandLanguage()) ? "available" : await checkVoiceCommandAvailability();
    }
    if (status === "available") {
      setVoiceCommandsEnabled(true);
      setVoiceCommandsMessage(null);
    } else {
      setVoiceCommandsMessage(
        "This browser can't recognise speech on the device, so voice commands aren't available. They need a recent version of Google Chrome, or the eResus iPhone app.",
      );
    }
  };
  const { user, isAnonymous, db } = useFirebase();

  const [availableOrgs, setAvailableOrgs] = useState<string[]>(["Independent / None"]);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "organizations"),
      (snapshot) => {
        const orgs = snapshot.docs
          .map((d) => d.data().name as string)
          .filter(Boolean)
          .sort();
        setAvailableOrgs(["Independent / None", ...orgs]);
      },
      (err) => {
        console.error("Error listening to organizations:", err);
      },
    );
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
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-lg"
              >
                Manage
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-300">Anonymous</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Sign in to sync logs across devices</p>
              </div>
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg active:scale-95 transition-transform"
              >
                Sign In
              </button>
            </div>
          )}
        </div>

        {/* Timers */}
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300">Timers</h3>
          <SettingStepper
            label="CPR Cycle"
            value={cprCycleDuration}
            onChange={setCprCycleDuration}
            min={60}
            max={300}
            step={10}
            unit="seconds"
          />
          <SettingStepper
            label="Adrenaline Interval"
            value={adrenalineInterval / 60}
            onChange={(val) => setAdrenalineInterval(val * 60)}
            min={2}
            max={10}
            step={1}
            unit="minutes"
          />
        </div>

        {/* Metronome */}
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300">Metronome</h3>
          <SettingStepper
            label="BPM"
            value={metronomeBPM}
            onChange={setMetronomeBPM}
            min={80}
            max={140}
            step={5}
            unit="BPM"
          />
        </div>

        {/* Spoken Prompts */}
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300">Spoken Prompts</h3>
          <SettingToggle
            label="Spoken Prompts"
            enabled={voicePromptsEnabled}
            onChange={setVoicePromptsEnabled}
            description="Announces key events such as rhythm checks and drug reminders. The speaker button on the arrest screen mutes them for the current case."
          />
          {voicePromptsEnabled && (
            <>
              <SegmentedSetting
                label="Style"
                value={voicePromptsToneOnly ? "tone" : "voice"}
                options={[
                  { value: "voice", label: "Voice" },
                  { value: "tone", label: "Tone Only" },
                ]}
                onChange={(value) => setVoicePromptsToneOnly(value === "tone")}
              />
              <SegmentedSetting
                label="Rhythm Check Warning"
                value={String(rhythmCheckWarning)}
                options={[
                  { value: "0", label: "Off" },
                  { value: "10", label: "10 s" },
                  { value: "15", label: "15 s" },
                  { value: "30", label: "30 s" },
                ]}
                onChange={(value) => setRhythmCheckWarning(Number(value))}
              />
              <SettingToggle
                label="Rhythm Check / Reassessment Due"
                enabled={promptRhythmCheck}
                onChange={setPromptRhythmCheck}
                description="Announced when the CPR cycle ends, or when a newborn reassessment is due."
              />
              <SettingToggle
                label="Adrenaline Reminders"
                enabled={promptAdrenaline}
                onChange={setPromptAdrenaline}
                description="Consider adrenaline, and when a repeat dose is due."
              />
              <SettingToggle
                label="Amiodarone / Lidocaine Reminders"
                enabled={promptAntiarrhythmic}
                onChange={setPromptAntiarrhythmic}
                description="After the third and fifth shocks."
              />
            </>
          )}
        </div>

        {/* Voice Commands */}
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300">Voice Commands (Experimental)</h3>
          <SettingToggle
            label="Voice Commands"
            enabled={voiceCommandsEnabled}
            onChange={toggleVoiceCommands}
            description="Press and hold the CPR ring and speak, e.g. “rhythm check VF, shock delivered 200 joules” or “1 mg adrenaline at 14:52”. Understands drugs and doses, rhythms, shocks, ROSC, airway, IV/IO, ETCO2, times and “undo”. Speech is recognised on this device only and nothing is sent anywhere. Check each entry: anything logged by voice is marked (voice) and the banner's Undo reverses the whole phrase."
          />
          {voiceCommandsMessage && <p className="text-sm text-tone-danger">{voiceCommandsMessage}</p>}
          {voiceCommandsEnabled && (
            <SettingToggle
              label="Hands-Free Wake Word"
              enabled={voiceHandsFree}
              onChange={setVoiceHandsFree}
              description={`Say the wake word, then the command: “${voiceWakeWord === "eresus" ? "eResus" : "Scribe"}, adrenaline 1 mg”. The microphone is only on during an active arrest, and the browser shows its microphone indicator while it listens.`}
            />
          )}
          {voiceCommandsEnabled && voiceHandsFree && (
            <SegmentedSetting
              label="Wake Word"
              value={voiceWakeWord}
              options={[
                { value: "scribe", label: "Scribe" },
                { value: "eresus", label: "eResus" },
              ]}
              onChange={(value) => setVoiceWakeWord(value as WakeWord)}
            />
          )}
        </div>

        {/* Capnography */}
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300">Capnography</h3>
          <SegmentedSetting
            label="ETCO2 Unit"
            value={etco2Unit}
            options={[
              { value: "kPa", label: "kPa" },
              { value: "mmHg", label: "mmHg" },
            ]}
            onChange={(unit) => setEtco2Unit(unit as "kPa" | "mmHg")}
          />
        </div>

        {/* Medications */}
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300">Medications</h3>
          <SettingToggle
            label="Show Dosage Prompts"
            enabled={showDosagePrompts}
            onChange={setShowDosagePrompts}
            description="When enabled, the app will ask for patient age or a manual dose when you log Adrenaline, Amiodarone, or other drugs."
          />
        </div>

        {/* Research & Data */}
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 flex items-center space-x-2">
            <BarChart3 size={18} />
            <span>Research & Data</span>
          </h3>
          <SettingToggle
            label="Research Mode"
            enabled={researchModeEnabled}
            onChange={(enabled) => {
              // Switching it on here is an active choice, so it counts as consent.
              if (enabled) setHasRespondedToResearchTerms(true);
              setResearchModeEnabled(enabled);
            }}
            description="When enabled, anonymised arrest data is uploaded to help improve cardiac arrest outcomes research."
          />
          {researchModeEnabled ? (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-gray-800 dark:text-gray-200">Ask for Patient Info</span>
                <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                  Required
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Mandatory when Research Mode is enabled.</p>
            </div>
          ) : (
            <SettingToggle
              label="Ask for Patient Info"
              enabled={askForPatientInfo}
              onChange={setAskForPatientInfo}
              description="Prompt for approximate patient age and gender when starting an arrest."
            />
          )}
          <div className="space-y-2">
            <span className="text-gray-800 dark:text-gray-200 text-sm">Organisation</span>
            <select
              value={userOrganization || "Independent / None"}
              onChange={(e) => setUserOrganization(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white text-sm"
            >
              {availableOrgs.map((org) => (
                <option key={org} value={org}>
                  {org}
                </option>
              ))}
            </select>
          </div>
          <a
            href="https://tech.aegismedicalsolutions.co.uk/eresus/data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 dark:text-blue-400 underline flex items-center space-x-1"
          >
            <ExternalLink size={14} />
            <span>Data Collection Policy</span>
          </a>
        </div>

        {/* Appearance */}
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300">Appearance</h3>
          <div className="flex space-x-2">
            {appearanceOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAppearanceMode(opt.value)}
                className={`flex-1 flex flex-col items-center space-y-1 p-3 rounded-xl border-2
                ${
                  appearanceMode === opt.value
                    ? "bg-blue-100 dark:bg-blue-900 border-blue-500 text-blue-700 dark:text-blue-300"
                    : "bg-gray-100 dark:bg-gray-700 border-transparent text-gray-600 dark:text-gray-400"
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
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}> = ({ label, value, onChange, min, max, step, unit }) => (
  <div className="flex justify-between items-center">
    <span className="text-gray-800 dark:text-gray-200">{label}</span>
    <div className="flex items-center space-x-3">
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 disabled:opacity-50"
      >
        <Minus size={16} className="mx-auto" />
      </button>
      <span className="font-semibold w-20 text-center text-gray-900 dark:text-white">
        {value} {unit}
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 disabled:opacity-50"
      >
        <Plus size={16} className="mx-auto" />
      </button>
    </div>
  </div>
);

const SegmentedSetting: React.FC<{
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}> = ({ label, value, options, onChange }) => (
  <div className="space-y-2">
    <span className="text-gray-800 dark:text-gray-200">{label}</span>
    <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
            value === option.value
              ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow"
              : "text-gray-600 dark:text-gray-400"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

const SettingToggle: React.FC<{
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  description: string;
}> = ({ label, enabled, onChange, description }) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center">
      <span className="text-gray-800 dark:text-gray-200">{label}</span>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
        transition-colors duration-200 ease-in-out focus:outline-none
        ${enabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 
          transition duration-200 ease-in-out
          ${enabled ? "translate-x-5" : "translate-x-0"}`}
        />
      </button>
    </div>
    <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
  </div>
);

//============================================================================
// PDF VIEWER
//============================================================================
const PDFView: React.FC<{ pdf: PDFIdentifiable; onClose: () => void }> = ({ pdf, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex justify-between items-center p-4 flex-shrink-0 bg-gray-900">
        <h2 className="text-lg font-semibold text-white truncate flex-1 mr-4">{pdf.title}</h2>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex-shrink-0 transition-colors"
        >
          Done
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <object
          data={pdf.pdfUrl}
          type="application/pdf"
          className="w-full h-full"
          style={{ minHeight: "calc(100vh - 80px)" }}
        >
          <iframe
            src={`https://docs.google.com/viewer?url=${encodeURIComponent(pdf.upstreamUrl ?? pdf.pdfUrl)}&embedded=true`}
            title={pdf.title}
            className="w-full h-full border-0"
            style={{ minHeight: "calc(100vh - 80px)" }}
          />
        </object>
      </div>
    </div>
  );
};

//============================================================================
// APP ENTRY POINT
//============================================================================

type TabID = "arrest" | "logbook" | "settings";

const AppContent: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<TabID>("arrest");
  const [pdfToShow, setPdfToShow] = useState<PDFIdentifiable | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isStandalone] = useState(
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone ||
      document.referrer.includes("android-app://"),
  );
  const [showNewborn, setShowNewborn] = useState(() => {
    return localStorage.getItem("eresus_active_view") === "nls";
  });

  useEffect(() => {
    localStorage.setItem("eresus_active_view", showNewborn ? "nls" : "main");
  }, [showNewborn]);

  const arrestViewModel = useArrestViewModel();
  const {
    appearanceMode,
    hasRespondedToResearchTerms,
    syncSettingsToFirestore,
    loadSettingsFromFirestore,
    researchModeEnabled,
    askForPatientInfo,
    userOrganization,
    voicePromptsEnabled,
    voicePromptsToneOnly,
    promptRhythmCheck,
  } = useSettings();
  const { db, userId, isAnonymous, user } = useFirebase();
  const [showAccountPrompt, setShowAccountPrompt] = useState(false);
  const [showResearchConsent, setShowResearchConsent] = useState(false);
  const settingsSyncedRef = useRef(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    if (!settingsSyncedRef.current) return;
    syncSettingsToFirestore(db, userId, isAnonymous);
  }, [researchModeEnabled, askForPatientInfo, userOrganization, hasRespondedToResearchTerms, db, userId, isAnonymous]);

  useEffect(() => {
    setSettingsLoaded(false);
    if (!isAnonymous && user) {
      loadSettingsFromFirestore(db, userId).then(() => {
        settingsSyncedRef.current = true;
        setSettingsLoaded(true);
      });
    } else {
      settingsSyncedRef.current = true;
      setSettingsLoaded(true);
    }
  }, [isAnonymous, userId, user]);

  // Setup never opens on launch, so a first-time user at a job can press Start straight away.
  // It runs once the first case has been reset, or from the card on the start screen.
  const hasSeenInstall = !!localStorage.getItem("eResusSeenInstallInstructions");
  const hasSeenAccountPrompt = !!localStorage.getItem("eResusSeenAccountPrompt");
  const needsSetup =
    (!hasSeenInstall && !isStandalone) || (!hasSeenAccountPrompt && isAnonymous) || !hasRespondedToResearchTerms;
  const [setupInProgress, setSetupInProgress] = useState(false);

  const startSetup = () => {
    if (arrestViewModel.arrestState === ArrestState.Pending) setSetupInProgress(true);
  };

  // Steps through install, account and research consent one at a time while a setup run is in progress.
  useEffect(() => {
    if (!setupInProgress || showInstallModal || showAccountPrompt || showResearchConsent) return;
    if (!hasSeenInstall && !isStandalone) {
      setShowInstallModal(true);
    } else if (!hasSeenAccountPrompt && isAnonymous) {
      setShowAccountPrompt(true);
    } else if (!hasRespondedToResearchTerms) {
      // After signing in, wait for their saved settings in case they've already answered on another device.
      if (settingsLoaded) setShowResearchConsent(true);
    } else {
      setSetupInProgress(false);
    }
  }, [
    setupInProgress,
    showInstallModal,
    showAccountPrompt,
    showResearchConsent,
    hasSeenInstall,
    hasSeenAccountPrompt,
    isStandalone,
    isAnonymous,
    hasRespondedToResearchTerms,
    settingsLoaded,
  ]);

  const previousArrestStateRef = useRef(arrestViewModel.arrestState);
  useEffect(() => {
    const previous = previousArrestStateRef.current;
    previousArrestStateRef.current = arrestViewModel.arrestState;
    if (arrestViewModel.arrestState === ArrestState.Pending && previous !== ArrestState.Pending && needsSetup) {
      const timer = setTimeout(startSetup, 600);
      return () => clearTimeout(timer);
    }
  }, [arrestViewModel.arrestState]);

  const handleCloseAccountPrompt = () => {
    localStorage.setItem("eResusSeenAccountPrompt", "true");
    setShowAccountPrompt(false);
  };

  const handleCloseInstallModal = () => {
    localStorage.setItem("eResusSeenInstallInstructions", "true");
    setShowInstallModal(false);
  };

  const handleCloseResearchConsent = () => {
    // Closing without choosing ends this run; the card stays until they answer.
    setSetupInProgress(false);
    setShowResearchConsent(false);
  };

  const handleNLSTransition = (data: {
    events: { timestamp: number; message: string; type: string }[];
    startTime: Date;
    timeOffset: number;
  }) => {
    const convertedEvents: Event[] = data.events.map((e) => ({
      timestamp: e.timestamp,
      message: e.message,
      type: e.type as EventType,
    }));
    setShowNewborn(false);
    arrestViewModel.startArrest(convertedEvents, data.timeOffset, data.startTime);
  };

  const hideTabBar =
    currentTab === "arrest" &&
    !showNewborn &&
    (arrestViewModel.arrestState === ArrestState.Active || arrestViewModel.arrestState === ArrestState.Rosc);

  const renderTab = () => {
    switch (currentTab) {
      case "arrest":
        if (showNewborn) {
          return (
            <NewbornLifeSupport
              onBack={() => setShowNewborn(false)}
              onTransitionToALS={handleNLSTransition}
              voicePrompts={{
                enabled: voicePromptsEnabled,
                toneOnly: voicePromptsToneOnly,
                reassess: promptRhythmCheck,
              }}
            />
          );
        }
        return (
          <ArrestView
            onShowPdf={setPdfToShow}
            onShowNewborn={() => setShowNewborn(true)}
            needsSetup={needsSetup}
            onStartSetup={startSetup}
          />
        );
      case "logbook":
        return <LogbookView />;
      case "settings":
        return <SettingsView />;
    }
  };

  return (
    <ArrestContext.Provider value={arrestViewModel}>
      <div className="h-screen w-screen flex flex-col font-sans bg-background">
        <main className="flex-grow overflow-hidden">{renderTab()}</main>

        {/* Logbook and Settings aren't needed mid-arrest; hiding the tab bar brings the drugs above the fold. */}
        {!hideTabBar && (
        <nav className="flex justify-around p-2 bg-card border-t border-border z-20">
          <TabButton
            label="Arrest"
            icon={<HeartPulse size={24} />}
            isActive={currentTab === "arrest"}
            onClick={() => setCurrentTab("arrest")}
          />
          <TabButton
            label="Logbook"
            icon={<Book size={24} />}
            isActive={currentTab === "logbook"}
            onClick={() => setCurrentTab("logbook")}
          />
          <TabButton
            label="Settings"
            icon={<Settings size={24} />}
            isActive={currentTab === "settings"}
            onClick={() => setCurrentTab("settings")}
          />
        </nav>
        )}

        {pdfToShow && <PDFView pdf={pdfToShow} onClose={() => setPdfToShow(null)} />}
        <InstallInstructionsModal isOpen={showInstallModal} onClose={handleCloseInstallModal} />
        <AccountPromptView isOpen={showAccountPrompt} onClose={handleCloseAccountPrompt} />
        <ResearchConsentView isOpen={showResearchConsent} onClose={handleCloseResearchConsent} />
        <PatientInfoPromptView
          isOpen={arrestViewModel.showPatientInfoPrompt}
          onClose={() => arrestViewModel.setShowPatientInfoPrompt(false)}
        />
      </div>
    </ArrestContext.Provider>
  );
};

const App: React.FC = () => {
  const settings = useAppSettings();

  return (
    <AppSettingsContext.Provider value={settings}>
      <AppContent />
    </AppSettingsContext.Provider>
  );
};

const TabButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}> = ({ label, icon, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center w-20 p-1 rounded-lg transition-colors
    ${
      isActive
        ? "text-blue-600 dark:text-blue-400"
        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
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
