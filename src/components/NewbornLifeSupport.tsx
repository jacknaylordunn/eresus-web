import React, { useState, useEffect, useRef } from 'react';
import { TONE_CLASSES, type ButtonTone } from '@/lib/tones';
import { voicePromptPlayer } from '@/utils/voicePrompts';
import VoicePromptButton from './VoicePromptButton';
import {
  Heart,
  Wind,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clipboard,
  RotateCw,
  ChevronRight,
  XSquare,
  Syringe,
  Volume2,
  VolumeX,
  ArrowLeft,
  Undo,
  Zap,
  Activity,
  Square,
  Play,
  Pill,
  AirVent,
  Droplets,
  Users,
} from 'lucide-react';
import {
  getFirestore,
  collection,
  addDoc,
  Timestamp,
} from 'firebase/firestore';
import { getApps } from 'firebase/app';

// ============================================================================
// NLS TYPES — matches iOS NLSState enum exactly
// ============================================================================

enum NLSState {
  InitialAssessment = "INITIAL_ASSESSMENT",
  InflationBreaths = "INFLATION_BREATHS",
  OptimiseAirway = "OPTIMISE_AIRWAY",
  AdvancedAirway = "ADVANCED_AIRWAY",
  Ventilation = "VENTILATION",
  ContinueVentilation = "CONTINUE_VENTILATION",
  Compressions = "COMPRESSIONS",
}

enum NLSBirthType {
  Preterm = "PRETERM",
  Term = "TERM",
}

enum NLSArrestState {
  Pending = "PENDING",
  Active = "ACTIVE",
  Rosc = "ROSC",
  Ended = "ENDED",
}

interface NLSEvent {
  timestamp: number;
  message: string;
  category: string;
}

// ============================================================================
// HELPERS
// ============================================================================
const formatTime = (seconds: number): string => {
  const t = Math.max(0, seconds);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatTimeSplit = (seconds: number): { mins: string; secs: string } => {
  const t = Math.max(0, seconds);
  return {
    mins: String(Math.floor(t / 60)).padStart(2, '0'),
    secs: String(Math.floor(t % 60)).padStart(2, '0'),
  };
};

const NLS_SESSION_KEY = 'eresus_nls_session';

const getFirebaseDb = () => {
  const apps = getApps();
  if (apps.length > 0) return getFirestore(apps[0]);
  return null;
};

const getUserId = (): string => {
  const stored = localStorage.getItem('eresus_user_id');
  if (stored) return stored;
  const newId = crypto.randomUUID();
  localStorage.setItem('eresus_user_id', newId);
  return newId;
};

// iOS SpO2 table: 3 rows (no 2 min row)
const getSpO2Targets = () => [
  { time: '3 min', target: '70-75%' },
  { time: '5 min', target: '80-85%' },
  { time: '10 min', target: '85-95%' },
];

const nlsPretermTasksTemplate = [
  { id: 'cpap', name: 'Consider CPAP (5-8 cm H₂O) if breathing', isCompleted: false },
  { id: 'glucose', name: 'Check Blood Glucose', isCompleted: false },
  { id: 'spo2', name: 'Titrate O₂ to target SpO₂', isCompleted: false },
];

// ============================================================================
// METRONOME (3:1 ratio for NLS — matches iOS precisely)
// Uses AudioContext lookahead scheduling for rock-solid timing.
// Pattern: 3 compressions (low tick) + 1 ventilation (high chirp) = 120 events/min
// ============================================================================
class NLSMetronome {
  private audioContext: AudioContext | null = null;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private _isPlaying = false;
  private nextCycleTime = 0;
  private unlocked = false;

  // Lookahead scheduling constants
  private readonly SCHEDULE_AHEAD = 0.15; // seconds to schedule ahead
  private readonly TIMER_INTERVAL = 25;   // ms between scheduler checks

  // 3:1 NLS rhythm: 2-second cycle
  // 3 compressions in first ~1s (at 0, 0.33, 0.66s) then 1 breath (~1.0s mark)
  // Total cycle = 2.0s → effective compression rate ~180/min
  private readonly CYCLE_DURATION = 2.0;
  private readonly COMPRESSION_TIMES = [0, 0.333, 0.666]; // relative to cycle start
  private readonly BREATH_TIME = 1.0; // relative to cycle start

  private async initContext() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch { return false; }
    }
    if (this.audioContext.state === 'suspended') {
      try { await this.audioContext.resume(); } catch { return false; }
    }
    return this.audioContext.state === 'running';
  }

  async unlock() {
    if (this.unlocked) return true;
    const ok = await this.initContext();
    if (ok && this.audioContext) {
      const osc = this.audioContext.createOscillator();
      const g = this.audioContext.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(this.audioContext.destination);
      osc.start(0);
      osc.stop(0.001);
      this.unlocked = true;
    }
    return this.unlocked;
  }

  private scheduleCompression(time: number, isAccent: boolean) {
    if (!this.audioContext) return;
    const ctx = this.audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const freq = isAccent ? 880 : 800;
    const vol = isAccent ? 0.45 : 0.3;
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.05);
  }

  private scheduleBreath(time: number) {
    if (!this.audioContext) return;
    const ctx = this.audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, time);
    osc.frequency.exponentialRampToValueAtTime(800, time + 0.15);
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  private scheduler = () => {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    while (this.nextCycleTime < now + this.SCHEDULE_AHEAD) {
      // Schedule 3 compressions
      this.COMPRESSION_TIMES.forEach((offset, i) => {
        this.scheduleCompression(this.nextCycleTime + offset, i === 0);
      });
      // Schedule 1 breath
      this.scheduleBreath(this.nextCycleTime + this.BREATH_TIME);
      this.nextCycleTime += this.CYCLE_DURATION;
    }
  };

  async start() {
    if (this._isPlaying) return;
    await this.unlock();
    const ok = await this.initContext();
    if (!ok || !this.audioContext) return;

    this._isPlaying = true;
    this.nextCycleTime = this.audioContext.currentTime + 0.05;
    this.schedulerTimer = setInterval(this.scheduler, this.TIMER_INTERVAL);
  }

  stop() {
    if (this.schedulerTimer) { clearInterval(this.schedulerTimer); this.schedulerTimer = null; }
    this._isPlaying = false;
  }

  get isPlaying() { return this._isPlaying; }
}

const nlsMetronome = new NLSMetronome();

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface NLSTransitionData {
  events: { timestamp: number; message: string; type: string }[];
  startTime: Date;
  timeOffset: number;
}

interface NewbornLifeSupportProps {
  onBack: () => void;
  onTransitionToALS?: (data: NLSTransitionData) => void;
  voicePrompts?: { enabled: boolean; toneOnly: boolean; reassess: boolean };
}

const NewbornLifeSupport: React.FC<NewbornLifeSupportProps> = ({ onBack, onTransitionToALS, voicePrompts }) => {
  // --- Restore saved session ---
  const savedNls = useRef<any>(null);
  const didRestore = useRef(false);
  if (!didRestore.current) {
    try {
      const raw = localStorage.getItem(NLS_SESSION_KEY);
      if (raw) savedNls.current = JSON.parse(raw);
    } catch { /* ignore */ }
    didRestore.current = true;
  }
  const ns = savedNls.current;
  const hasRecoverableSession = ns != null && ns.arrestState === NLSArrestState.Active;

  // --- Core state ---
  const [arrestState, setArrestState] = useState<NLSArrestState>(hasRecoverableSession ? NLSArrestState.Pending : NLSArrestState.Pending);
  const [nlsState, setNlsState] = useState<NLSState>(ns?.nlsState ?? NLSState.InitialAssessment);
  const [birthType, setBirthType] = useState<NLSBirthType | null>(ns?.birthType ?? null);
  const [isPreterm, setIsPreterm] = useState(ns?.isPreterm ?? false);
  const [masterTime, setMasterTime] = useState(0);
  const [timeOffset, setTimeOffset] = useState(ns?.timeOffset ?? 0);
  const [nlsCycleDuration, setNlsCycleDuration] = useState(ns?.nlsCycleDuration ?? 60);
  const [cprTime, setCprTime] = useState(ns?.cprTime ?? 60);
  const [isRhythmCheckDue, setIsRhythmCheckDue] = useState(false);
  const [events, setEvents] = useState<NLSEvent[]>(ns?.events ?? []);

  // Counters
  const [adrenalineCount, setAdrenalineCount] = useState(ns?.adrenalineCount ?? 0);
  const [inflationBreathsGiven, setInflationBreathsGiven] = useState(ns?.inflationBreathsGiven ?? 0);
  const [compressionCycles, setCompressionCycles] = useState(ns?.compressionCycles ?? 0);
  const [fio2, setFio2] = useState(ns?.fio2 ?? '21');
  const [vascularAccess, setVascularAccess] = useState(ns?.vascularAccess ?? false);
  const [volumeGiven, setVolumeGiven] = useState(ns?.volumeGiven ?? false);
  const [airwayPlaced, setAirwayPlaced] = useState(ns?.airwayPlaced ?? false);
  const [nlsPretermTasks, setNlsPretermTasks] = useState(ns?.nlsPretermTasks ?? nlsPretermTasksTemplate.map(t => ({ ...t })));
  const [showAirwayModal, setShowAirwayModal] = useState(false);
  const [showOtherDrugsModal, setShowOtherDrugsModal] = useState(false);
  // Timer refs
  const startTimeRef = useRef<Date | null>(ns?.startTime ? new Date(ns.startTime) : null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cprCycleStartTimeRef = useRef(ns?.cprCycleStartTime ?? 0);

  // Metronome
  const [metronomeOn, setMetronomeOn] = useState(false);

  // Undo
  const [undoStack, setUndoStack] = useState<any[]>([]);

  // Modals
  const [showSummary, setShowSummary] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showConfirmBack, setShowConfirmBack] = useState(false);
  const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(hasRecoverableSession);

  // Stop/Pause
  const [isStopped, setIsStopped] = useState(false);
  const pauseStartRef = useRef<Date | null>(null);

  // Computed
  const totalArrestTime = masterTime + timeOffset;

  // --- Session Persistence ---
  useEffect(() => {
    if (arrestState === NLSArrestState.Pending) {
      if (!showRecoveryPrompt) localStorage.removeItem(NLS_SESSION_KEY);
      return;
    }
    const session = {
      arrestState, nlsState, birthType, isPreterm, events, timeOffset,
      nlsCycleDuration, cprTime, adrenalineCount, inflationBreathsGiven,
      compressionCycles, fio2, vascularAccess, volumeGiven, airwayPlaced,
      startTime: startTimeRef.current?.toISOString() ?? null,
      cprCycleStartTime: cprCycleStartTimeRef.current,
    };
    try { localStorage.setItem(NLS_SESSION_KEY, JSON.stringify(session)); } catch { }
  }, [arrestState, nlsState, birthType, isPreterm, events, timeOffset,
      nlsCycleDuration, cprTime, adrenalineCount, inflationBreathsGiven,
      compressionCycles, fio2, vascularAccess, volumeGiven, airwayPlaced, showRecoveryPrompt]);

  // --- Timer ---
  useEffect(() => {
    if (arrestState === NLSArrestState.Active && startTimeRef.current && !isStopped) {
      timerRef.current = setInterval(() => {
        if (!startTimeRef.current) return;
        const newMaster = (Date.now() - startTimeRef.current.getTime()) / 1000;
        setMasterTime(newMaster);
        
        const total = newMaster + timeOffset;
        const cycleDur = nlsCycleDuration;
        const newCpr = cycleDur - (total - cprCycleStartTimeRef.current);
        setCprTime(newCpr);
        
        if (newCpr <= 0) {
          setIsRhythmCheckDue(true);
        }
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [arrestState, timeOffset, nlsCycleDuration, isStopped]);

  // --- Undo ---
  const saveUndo = () => {
    setUndoStack(prev => [...prev.slice(-19), {
      arrestState, nlsState, events: [...events], adrenalineCount,
      inflationBreathsGiven, compressionCycles, fio2, vascularAccess,
      volumeGiven, isRhythmCheckDue, nlsCycleDuration, airwayPlaced, timeOffset,
      cprCycleStartTime: cprCycleStartTimeRef.current,
    }]);
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setArrestState(last.arrestState);
    setNlsState(last.nlsState);
    setEvents(last.events);
    setAdrenalineCount(last.adrenalineCount);
    setInflationBreathsGiven(last.inflationBreathsGiven);
    setCompressionCycles(last.compressionCycles);
    setFio2(last.fio2);
    setVascularAccess(last.vascularAccess);
    setVolumeGiven(last.volumeGiven);
    setIsRhythmCheckDue(last.isRhythmCheckDue);
    setNlsCycleDuration(last.nlsCycleDuration);
    setAirwayPlaced(last.airwayPlaced ?? false);
    if (last.timeOffset !== undefined) setTimeOffset(last.timeOffset);
    cprCycleStartTimeRef.current = last.cprCycleStartTime;
    setUndoStack(prev => prev.slice(0, -1));
    // If undoing back to compressions, restart metronome; otherwise stop it
    if (last.nlsState === NLSState.Compressions && last.arrestState === NLSArrestState.Active) {
      nlsMetronome.start().then(() => setMetronomeOn(nlsMetronome.isPlaying));
    } else {
      nlsMetronome.stop();
      setMetronomeOn(false);
    }
    if (navigator.vibrate) navigator.vibrate(10);
  };

  // --- Event Logger ---
  const logEvent = (message: string, category: string = 'status') => {
    setEvents(prev => [{ timestamp: totalArrestTime, message, category }, ...prev]);
    if (navigator.vibrate) navigator.vibrate(10);
  };

  // --- Reset NLS Timer ---
  const resetNLSTimer = () => {
    cprCycleStartTimeRef.current = totalArrestTime;
    setCprTime(nlsCycleDuration);
    setIsRhythmCheckDue(false);
  };

  // --- Advance NLS (matches iOS exactly) ---
  const advanceNLS = (state: NLSState) => {
    saveUndo();
    setNlsState(state);
    setIsRhythmCheckDue(false);

    // Stop metronome when leaving compressions
    if (state !== NLSState.Compressions && nlsMetronome.isPlaying) {
      nlsMetronome.stop();
      setMetronomeOn(false);
    }

    let dur = 30;
    switch (state) {
      case NLSState.InitialAssessment:
        dur = 60;
        logEvent("Returned to Initial Assessment");
        break;
      case NLSState.InflationBreaths:
        logEvent("Moved to Airway & Inflation Breaths", "airway");
        break;
      case NLSState.OptimiseAirway:
        logEvent("Moved to Optimise Airway Troubleshooting", "airway");
        break;
      case NLSState.AdvancedAirway:
        logEvent("Moved to Advanced Airway interventions", "airway");
        break;
      case NLSState.Ventilation:
        logEvent("Started Ventilation Breaths (30/min)", "airway");
        break;
      case NLSState.ContinueVentilation:
        logEvent("Continuing Ventilation (HR ≥ 60)", "airway");
        break;
      case NLSState.Compressions:
        logEvent("Started Chest Compressions (3:1 Ratio, 100% O₂)", "cpr");
        setFio2('100');
        // Auto-start metronome when entering compressions (matches iOS)
        nlsMetronome.start().then(() => setMetronomeOn(nlsMetronome.isPlaying));
        break;
    }

    setNlsCycleDuration(dur);
    setCprTime(dur);
    cprCycleStartTimeRef.current = totalArrestTime;
  };

  // Stop metronome when leaving compressions (matches iOS)
  useEffect(() => {
    if (nlsState !== NLSState.Compressions && metronomeOn) {
      nlsMetronome.stop();
      setMetronomeOn(false);
    }
  }, [nlsState]);

  // --- Core Actions ---
  const startNewborn = (preterm: boolean) => {
    // Browsers only allow audio after a tap, and a mute from the last case shouldn't carry over.
    voicePromptPlayer.unlock();
    voicePromptPlayer.setMutedForCase(false);
    startTimeRef.current = new Date();
    setIsPreterm(preterm);
    setBirthType(preterm ? NLSBirthType.Preterm : NLSBirthType.Term);
    setArrestState(NLSArrestState.Active);
    setNlsState(NLSState.InitialAssessment);
    setNlsCycleDuration(60);
    setCprTime(60);
    cprCycleStartTimeRef.current = 0;

    const typeStr = preterm ? "Preterm (<32w) Life Support" : "Newborn (Term) Life Support";
    logEvent(`${typeStr} Started at ${new Date().toLocaleTimeString()}`);
    if (preterm) {
      logEvent("Placed in plastic bag + radiant heat.");
    } else {
      logEvent("Dried and wrapped. Stimulated.");
    }
  };

  const achieveROSC = () => {
    saveUndo();
    setArrestState(NLSArrestState.Rosc);
    setIsRhythmCheckDue(false);
    nlsMetronome.stop();
    setMetronomeOn(false);
    logEvent("HR > 100 / Spontaneous Breathing Established");
  };

  const endResuscitation = () => {
    saveUndo();
    setArrestState(NLSArrestState.Ended);
    if (timerRef.current) clearInterval(timerRef.current);
    nlsMetronome.stop();
    setMetronomeOn(false);
    logEvent("Resuscitation Ended");
  };

  const reArrest = () => {
    saveUndo();
    logEvent("Baby Stopped Breathing. Transitioning to Paediatric ALS.", "status");
    
    // Build transition data — carry the entire NLS log into the arrest view
    const transitionData: NLSTransitionData = {
      events: [...events, { timestamp: totalArrestTime, message: "Baby Stopped Breathing. Transitioning to Paediatric ALS.", category: "status" } as any].map(e => ({
        timestamp: e.timestamp,
        message: e.message,
        type: e.category ?? 'status',
      })),
      startTime: startTimeRef.current!,
      timeOffset,
    };
    
    // Clean up NLS
    if (timerRef.current) clearInterval(timerRef.current);
    nlsMetronome.stop();
    setMetronomeOn(false);
    localStorage.removeItem(NLS_SESSION_KEY);
    
    if (onTransitionToALS) {
      onTransitionToALS(transitionData);
    } else {
      onBack();
    }
  };

  const reassessPatient = () => {
    saveUndo();
    resetNLSTimer();
    logEvent("Reassessed Patient HR and Chest Rise");
  };

  const addTimeOffset = (seconds: number) => {
    saveUndo();
    setTimeOffset(prev => prev + seconds);
    // The cycle start is on the total-time scale, so move it with the offset or the
    // reassessment falls due early (matches the adult screen and iOS).
    cprCycleStartTimeRef.current += seconds;
    logEvent(`Time offset added: +${Math.round(seconds / 60)} min`);
  };

  const toggleMetronome = async () => {
    if (metronomeOn) {
      nlsMetronome.stop();
      setMetronomeOn(false);
    } else {
      await nlsMetronome.start();
      setMetronomeOn(nlsMetronome.isPlaying);
    }
  };

  // Pause / Resume
  const pauseArrest = () => {
    setIsStopped(true);
    pauseStartRef.current = new Date();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    nlsMetronome.stop();
    setMetronomeOn(false);
    logEvent("Timer Paused");
  };

  const resumeArrest = () => {
    setIsStopped(false);
    if (pauseStartRef.current && startTimeRef.current) {
      const pausedMs = Date.now() - pauseStartRef.current.getTime();
      startTimeRef.current = new Date(startTimeRef.current.getTime() + pausedMs);
    }
    pauseStartRef.current = null;
    logEvent("Timer Resumed");
  };

  // --- Save to logbook ---
  const saveToLogbook = async () => {
    if (!startTimeRef.current) return;
    try {
      const db = getFirebaseDb();
      if (!db) return;
      const userId = getUserId();
      const appId = 'eresus-6e65e';
      const path = `/artifacts/${appId}/users/${userId}/logs`;
      const outcome = arrestState === NLSArrestState.Rosc ? 'ROSC' :
                      arrestState === NLSArrestState.Ended ? 'Complete' : 'Incomplete';
      const logDoc = {
        startTime: Timestamp.fromDate(startTimeRef.current),
        totalDuration: totalArrestTime,
        finalOutcome: outcome,
        userId, type: 'NLS', birthType,
      };
      const logDocRef = await addDoc(collection(db, path), logDoc);
      const eventsRef = collection(db, `${path}/${logDocRef.id}/events`);
      for (const event of events) {
        await addDoc(eventsRef, { timestamp: event.timestamp, message: event.message, type: event.category });
      }
    } catch (e) { console.error("Error saving NLS log:", e); }
  };

  const copySummary = () => {
    const sorted = [...events].reverse();
    const text = `eResus — Newborn Life Support Summary\nStart Time: ${startTimeRef.current?.toLocaleTimeString() ?? 'Unknown'}\nTotal Time: ${formatTime(totalArrestTime)}\nBirth Type: ${isPreterm ? 'Preterm (<32 weeks)' : 'Term/Near-term'}\nAdrenaline doses: ${adrenalineCount}\n\n--- Event Log ---\n${sorted.map(e => `[${formatTime(e.timestamp)}] ${e.message}`).join('\n')}`;
    navigator.clipboard.writeText(text.trim()).catch(console.error);
    if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
  };

  const performReset = async (shouldSave: boolean, shouldCopy: boolean) => {
    if (shouldSave) await saveToLogbook();
    if (shouldCopy) copySummary();
    if (timerRef.current) clearInterval(timerRef.current);
    nlsMetronome.stop();
    setMetronomeOn(false);
    setArrestState(NLSArrestState.Pending);
    setNlsState(NLSState.InitialAssessment);
    setBirthType(null);
    setIsPreterm(false);
    setMasterTime(0);
    setTimeOffset(0);
    setCprTime(60);
    setNlsCycleDuration(60);
    setIsRhythmCheckDue(false);
    setEvents([]);
    setUndoStack([]);
    setAdrenalineCount(0);
    setInflationBreathsGiven(0);
    setCompressionCycles(0);
    setFio2('21');
    setVascularAccess(false);
    setVolumeGiven(false);
    setAirwayPlaced(false);
    setIsStopped(false);
    pauseStartRef.current = null;
    startTimeRef.current = null;
    cprCycleStartTimeRef.current = 0;
    localStorage.removeItem(NLS_SESSION_KEY);
  };

  // Recovery
  const resumeSession = () => {
    setShowRecoveryPrompt(false);
    if (ns) {
      setArrestState(NLSArrestState.Active);
      setNlsState(ns.nlsState);
    }
  };

  const discardSession = async () => {
    setShowRecoveryPrompt(false);
    if (startTimeRef.current && events.length > 0) {
      try {
        const db = getFirebaseDb();
        if (db) {
          const userId = getUserId();
          const appId = 'eresus-6e65e';
          const path = `/artifacts/${appId}/users/${userId}/logs`;
          const logDocRef = await addDoc(collection(db, path), {
            startTime: Timestamp.fromDate(startTimeRef.current),
            totalDuration: totalArrestTime,
            finalOutcome: 'NLS Incomplete (recovered)',
            userId, type: 'NLS', birthType,
          });
          const eventsRef = collection(db, `${path}/${logDocRef.id}/events`);
          for (const event of events) {
            await addDoc(eventsRef, { timestamp: event.timestamp, message: event.message, type: event.category });
          }
        }
      } catch (e) { console.error(e); }
    }
    await performReset(false, false);
  };

  const handleBack = () => {
    if (arrestState === NLSArrestState.Active) {
      setShowConfirmBack(true);
    } else {
      localStorage.removeItem(NLS_SESSION_KEY);
      onBack();
    }
  };

  const confirmBack = async () => {
    await saveToLogbook();
    if (timerRef.current) clearInterval(timerRef.current);
    nlsMetronome.stop();
    setShowConfirmBack(false);
    localStorage.removeItem(NLS_SESSION_KEY);
    onBack();
  };

  // Cleanup metronome on unmount
  useEffect(() => {
    return () => { nlsMetronome.stop(); };
  }, []);

  // --- Computed display ---
  const mainTimeSplit = formatTimeSplit(totalArrestTime);
  const isActive = arrestState === NLSArrestState.Active;
  const isDue = isRhythmCheckDue && isActive && !isStopped;

  // Spoken prompt when the reassessment falls due, matching the "REASSESS PATIENT" header (as on iOS).
  const wasDueRef = useRef(false);
  useEffect(() => {
    if (isDue && !wasDueRef.current && voicePrompts?.enabled && voicePrompts.reassess) {
      voicePromptPlayer.play('reassess_newborn', voicePrompts.toneOnly);
    }
    if (!isActive || isStopped) voicePromptPlayer.stopAll();
    wasDueRef.current = isDue;
  }, [isDue, isActive, isStopped, voicePrompts]);

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* ===== HEADER — matches iOS HeaderView for NLS ===== */}
      <div 
        className={`relative z-10 px-4 pt-4 pb-3 shadow-md transition-colors duration-300 ${
          isStopped 
            ? 'bg-tone-alert/20' 
            : isDue 
              ? 'bg-tone-danger cursor-pointer' 
              : 'bg-card'
        }`}
        onClick={() => { if (isDue) reassessPatient(); }}
      >
        <div className="flex justify-between items-center mb-2">
          <div>
            <div>
              {isDue ? (
                <h1 className="text-2xl font-bold text-white leading-tight">REASSESS PATIENT</h1>
              ) : (
                <h1 className="text-3xl font-bold text-foreground">eResus</h1>
              )}
              <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                isStopped ? 'bg-tone-alert text-tone-on-alert' :
                isDue ? 'bg-white/30 text-white' :
                arrestState === NLSArrestState.Active ? 'bg-tone-danger text-tone-on-danger' :
                arrestState === NLSArrestState.Rosc ? 'bg-tone-accent text-tone-on-accent' :
                arrestState === NLSArrestState.Ended ? 'bg-gray-800 text-white' :
                'bg-muted text-muted-foreground'
              }`}>
                {isStopped ? 'PAUSED' :
                 arrestState === NLSArrestState.Active ? 'ACTIVE' :
                 arrestState === NLSArrestState.Rosc ? 'ROSC' :
                 arrestState === NLSArrestState.Ended ? 'ENDED' : 'PENDING'}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="flex items-baseline">
              {timeOffset > 0 && (
                <span className={`font-mono font-bold text-2xl mr-1 ${
                  isDue ? 'text-white' : 'text-primary'
                }`}>
                  {Math.floor(timeOffset / 60)}+
                </span>
              )}
              <span className={`font-mono font-bold text-4xl ${
                isDue ? 'text-white' : 'text-primary'
              }`}>
                {mainTimeSplit.mins}<span className="mx-0.5">:</span>{mainTimeSplit.secs}
              </span>
            </div>
            {isActive && !isStopped && (
              <div className="flex space-x-1 mt-1">
                {[1, 5, 10].map(m => (
                  <button key={m} onClick={(e) => { e.stopPropagation(); addTimeOffset(m * 60); }}
                    className={`px-2 py-0.5 text-xs font-semibold rounded ${
                      isDue 
                        ? 'bg-white/20 text-white' 
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    }`}>
                    +{m}m
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* No counters row for NLS (matches iOS - counters only for general arrest) */}
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-grow overflow-y-auto px-4 pb-40 space-y-4 pt-4 bg-background">
        
        {/* NLS Square Timer (matches iOS NLSSquareTimerView) */}
        {isActive && (
          <div className={`transition-opacity ${isStopped ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="relative flex justify-center">
              <NLSSquareTimer time={cprTime} totalDuration={nlsCycleDuration} />
              <VoicePromptButton enabled={voicePrompts?.enabled ?? false} className="bottom-0 left-0" />
            </div>
          </div>
        )}

        {/* ===== PENDING — Birth type selection ===== */}
        {arrestState === NLSArrestState.Pending && !showRecoveryPrompt && (
          <div className="space-y-4 pt-4">
            <p className="text-center text-muted-foreground text-sm font-semibold">Select Newborn Type</p>
            <NLSActionButton color="bg-purple-600" label="Term (≥32 Weeks)" onClick={() => startNewborn(false)} height="h-16" fontSize="text-xl" />
            <NLSActionButton color="bg-indigo-500" label="Preterm (<32 Weeks)" onClick={() => startNewborn(true)} height="h-16" fontSize="text-xl" />
            <button onClick={onBack} className="w-full text-center text-primary font-semibold py-2">
              Back to Arrest View
            </button>
          </div>
        )}

        {/* Recovery prompt */}
        {showRecoveryPrompt && (
          <div className="p-4 bg-tone-alert/15 border-2 border-tone-alert rounded-xl space-y-3 mt-2">
            <div className="flex items-center space-x-2">
              <AlertTriangle size={24} className="text-tone-alert flex-shrink-0" />
              <h3 className="font-bold text-gray-900 dark:text-white">Session Recovery</h3>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">An active NLS session was interrupted. Resume?</p>
            <div className="flex space-x-3">
              <NLSActionButton tone="primary" label="Resume" onClick={resumeSession} />
              <NLSActionButton color="bg-gray-500" label="Save & Discard" onClick={discardSession} />
            </div>
          </div>
        )}

        {/* ===== ACTIVE WIZARD CONTENT (dimmed when paused) ===== */}
        {isActive && (
          <div className={`space-y-4 transition-opacity ${isStopped ? 'opacity-50 pointer-events-none' : ''}`}>
            {/* WIZARD CARD - matches iOS WizardInstructionBlock + WizardQuestionBlock */}
            {nlsState === NLSState.InitialAssessment && (
              <WizardCard
                label="INITIAL ASSESSMENT"
                title="Assess tone, breathing and heart rate."
                bullets={isPreterm ? [
                  "Place undried body in a plastic bag + radiant heat.",
                  "If breathing consider: CPAP 5–8 cm H₂O and ≥ 30% FiO₂.",
                  "Ensure an open airway.",
                ] : [
                  "Delay cord clamping. Stimulate. Thermal care.",
                  "Ensure an open airway.",
                ]}
                question="Is the baby breathing adequately?"
                actions={
                  <div className="grid grid-cols-2 gap-3">
                    <NLSActionButton color="bg-blue-600" icon={<Wind size={18} />} label="No (Inadequate)"
                      onClick={() => advanceNLS(NLSState.InflationBreaths)} />
                    <NLSActionButton color="bg-green-500" icon={<Heart size={18} />} label="Yes (Adequate)"
                      onClick={achieveROSC} />
                  </div>
                }
              />
            )}

            {nlsState === NLSState.InflationBreaths && (
              <WizardCard
                label="AIRWAY & INFLATION BREATHS"
                title="Give 5 inflation breaths."
                bullets={isPreterm ? [
                  "Initial PIP 25 cm H₂O, PEEP 6 cm H₂O.",
                  "≥ 30% FiO₂.",
                  "SpO₂ +/- ECG monitoring.",
                ] : [
                  "30 cm H₂O, air (21%).",
                  "PEEP 6 cm H₂O, if possible.",
                  "SpO₂ +/- ECG monitoring.",
                ]}
                question="Reassess heart rate and chest rise. Is the chest moving?"
                actions={
                  <div className="grid grid-cols-2 gap-3">
                    <NLSActionButton color="bg-orange-500" icon={<AlertTriangle size={18} />} label="Chest NOT Moving"
                      onClick={() => advanceNLS(NLSState.OptimiseAirway)} />
                    <NLSActionButton color="bg-blue-500" icon={<Wind size={18} />} label="Chest Moving"
                      onClick={() => advanceNLS(NLSState.Ventilation)} />
                  </div>
                }
              />
            )}

            {nlsState === NLSState.OptimiseAirway && (
              <WizardCard
                label="TROUBLESHOOT AIRWAY"
                title="Troubleshoot airway and repeat 5 inflation breaths."
                bullets={[
                  "Check mask, head and jaw position.",
                  "2 person support.",
                ]}
                question="Reassess heart rate and chest rise. Is the chest moving now?"
                actions={
                  <div className="grid grid-cols-2 gap-3">
                    <NLSActionButton color="bg-orange-500" icon={<RotateCw size={18} />} label="Chest NOT Moving"
                      onClick={() => advanceNLS(NLSState.AdvancedAirway)} />
                    <NLSActionButton color="bg-blue-500" icon={<Wind size={18} />} label="Chest Moving"
                      onClick={() => advanceNLS(NLSState.Ventilation)} />
                  </div>
                }
              />
            )}

            {nlsState === NLSState.AdvancedAirway && (
              <WizardCard
                label="ADVANCED AIRWAY"
                title="Consider advanced airway interventions and repeat 5 inflation breaths."
                bullets={[
                  "Consider: SGA, Suction, Tracheal tube.",
                  "Consider increasing Inflation pressures.",
                ]}
                question="Reassess heart rate and chest rise. Is the chest moving now?"
                actions={
                  <div className="grid grid-cols-2 gap-3">
                    <NLSActionButton color="bg-orange-500" icon={<RotateCw size={18} />} label="Chest NOT Moving"
                      onClick={() => {
                        // iOS: logs and resets timer, doesn't change state
                        saveUndo();
                        logEvent("Chest still not moving. Advanced airway interventions continued.");
                        resetNLSTimer();
                      }} />
                    <NLSActionButton color="bg-blue-500" icon={<Wind size={18} />} label="Chest Moving"
                      onClick={() => advanceNLS(NLSState.Ventilation)} />
                  </div>
                }
              />
            )}

            {nlsState === NLSState.Ventilation && (
              <WizardCard
                label="VENTILATION"
                title="Start ventilation breaths (30 min⁻¹)."
                bullets={[]}
                question="Reassess after 30 seconds. What is the Heart Rate?"
                actions={
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <NLSActionButton tone="primary" icon={<Heart size={18} />} label="HR < 60 min⁻¹" sublabel="(Start CPR)"
                        onClick={() => advanceNLS(NLSState.Compressions)} height="h-16" />
                      <NLSActionButton color="bg-blue-500" icon={<Wind size={18} />} label="HR ≥ 60 min⁻¹" sublabel="(Continue Vent.)"
                        onClick={() => advanceNLS(NLSState.ContinueVentilation)} height="h-16" />
                    </div>
                    <NLSActionButton color="bg-green-500" icon={<Heart size={18} />} label="Breathing normally" onClick={achieveROSC} />
                  </div>
                }
              />
            )}

            {nlsState === NLSState.ContinueVentilation && (
              <WizardCard
                label="CONTINUE VENTILATION"
                title="Continue ventilations until confident baby is breathing adequately and HR is stable."
                bullets={[
                  "Maintain ventilation rate at 30 min⁻¹.",
                  "Assess breathing and heart rate regularly.",
                ]}
                question="Reassess every 30 seconds."
                actions={
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <NLSActionButton tone="primary" icon={<Heart size={18} />} label="HR < 60 min⁻¹" sublabel="(Start CPR)"
                        onClick={() => advanceNLS(NLSState.Compressions)} height="h-16" />
                      <NLSActionButton color="bg-blue-500" icon={<Wind size={18} />} label="Not Breathing" sublabel="(Cont. Vent)"
                        onClick={() => {
                          saveUndo();
                          logEvent("Ventilation continued (Not breathing adequately)");
                          resetNLSTimer();
                        }} height="h-16" />
                    </div>
                    <NLSActionButton color="bg-green-500" icon={<Heart size={18} />} label="Breathing normally" onClick={achieveROSC} />
                  </div>
                }
              />
            )}

            {nlsState === NLSState.Compressions && (
              <>
                <WizardCard
                  label="CHEST COMPRESSIONS"
                  title="Start chest compressions (3:1 ratio)."
                  bullets={[
                    "Synchronise compressions and ventilation.",
                    "100% Oxygen.",
                    "Consider SGA or intubation.",
                    "If HR remains < 60: Vascular access, drugs, check blood glucose, consider other factors.",
                  ]}
                  question=""
                  actions={
                    <div className="space-y-3">
                      {/* Metronome button - matches iOS */}
                      <button onClick={toggleMetronome}
                        className={`w-full py-4 rounded-xl font-bold text-base flex items-center justify-center space-x-2 active:scale-95 transition-all ${
                          metronomeOn 
                            ? 'bg-tone-accent text-tone-on-accent' 
                            : 'bg-tone-tint text-tone-on-tint border border-tone-accent/30'
                        }`}>
                        {metronomeOn ? <VolumeX size={20} /> : <Volume2 size={20} />}
                        <span>{metronomeOn ? 'STOP 3:1 METRONOME' : 'START 3:1 METRONOME'}</span>
                      </button>

                      <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                        <p className="text-sm font-bold text-center mb-3 text-gray-900 dark:text-white">
                          Reassess every 30 seconds. Does HR remain &lt; 60 min⁻¹?
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <NLSActionButton tone="primary" icon={<Heart size={18} />} label="Yes (HR < 60)" sublabel="(Continue CPR)"
                          onClick={() => {
                            saveUndo();
                            logEvent("Compressions continued (HR < 60)", "cpr");
                            resetNLSTimer();
                          }} height="h-16" />
                        <NLSActionButton color="bg-blue-500" icon={<Wind size={18} />} label="No (HR ≥ 60)" sublabel="(Stop CPR)"
                          onClick={() => advanceNLS(NLSState.Ventilation)} height="h-16" />
                      </div>
                      <NLSActionButton color="bg-green-500" icon={<Heart size={18} />} label="Breathing normally" onClick={achieveROSC} />
                    </div>
                  }
                />
              </>
            )}

            {/* ===== ADVANCED PROCEDURES (matches iOS - always visible during active) ===== */}
            <div className="p-4 bg-card rounded-xl shadow-sm space-y-3">
              <h3 className="text-center font-semibold text-muted-foreground">Advanced Procedures</h3>
              <div className="grid grid-cols-2 gap-3">
                <NLSActionButton color="bg-purple-600" icon={<Droplets size={16} />} label="Vascular Access" 
                  onClick={() => { saveUndo(); setVascularAccess(true); logEvent("Vascular Access Secured"); }}
                  disabled={vascularAccess} height="h-12" fontSize="text-sm" />
                <NLSActionButton color="bg-pink-600" icon={<Syringe size={16} />} label={`Adrenaline (${adrenalineCount})`}
                  onClick={() => { saveUndo(); setAdrenalineCount(p => p + 1); logEvent(`Adrenaline dose ${adrenalineCount + 1} (10-30 mcg/kg IV)`, "drug"); }}
                  height="h-12" fontSize="text-sm" />
                <NLSActionButton color="bg-indigo-600" icon={<AirVent size={16} />} label="Intubation / SGA" 
                  onClick={() => setShowAirwayModal(true)}
                  disabled={airwayPlaced} height="h-12" fontSize="text-sm" />
                <NLSActionButton color="bg-gray-500" icon={<Pill size={16} />} label="Other Meds / Vol..."
                  onClick={() => setShowOtherDrugsModal(true)}
                  height="h-12" fontSize="text-sm" />
              </div>
              <NLSActionButton color="bg-red-600" icon={<XSquare size={16} />} label="End Resus" onClick={endResuscitation} height="h-12" fontSize="text-sm" />
            </div>

            {/* ===== SpO₂ Table (matches iOS - 3 rows + footer) ===== */}
            <SpO2Table />

            {/* Preterm tasks checklist */}
            {isPreterm && (
              <div className="p-4 bg-card rounded-xl shadow-sm space-y-3">
                <h3 className="font-semibold text-muted-foreground">Preterm &lt; 32 Weeks Tasks</h3>
                {nlsPretermTasks.map((task, idx) => (
                  <button key={task.id} onClick={() => {
                    saveUndo();
                    setNlsPretermTasks(prev => prev.map((t, i) => i === idx ? { ...t, isCompleted: !t.isCompleted } : t));
                    logEvent(`${task.name} ${!task.isCompleted ? 'checked' : 'unchecked'}`);
                  }} className="flex items-center w-full text-left space-x-3">
                    {task.isCompleted ? (
                      <CheckCircle2 size={24} className="text-tone-positive flex-shrink-0" />
                    ) : (
                      <Circle size={24} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    )}
                    <span className={`text-gray-900 dark:text-white ${task.isCompleted ? 'line-through' : ''}`}>{task.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Event Log */}
            <NLSEventLog events={events} />
          </div>
        )}

        {/* ===== ROSC (matches iOS RoscView for NLS) ===== */}
        {arrestState === NLSArrestState.Rosc && (
          <div className="space-y-4 mt-2">
            <NLSActionButton tone="danger" icon={<RotateCw size={20} />} label="Baby Stopped Breathing" 
              onClick={reArrest} height="h-16" fontSize="text-lg" />
            <NLSActionButton color="bg-blue-600" icon={<Droplets size={20} />} label="Check Blood Glucose"
              onClick={() => { saveUndo(); logEvent("Blood Glucose Checked"); }} height="h-14" />
            <NLSEventLog events={events} />
          </div>
        )}

        {/* ===== ENDED (matches iOS EndedView for NLS) ===== */}
        {arrestState === NLSArrestState.Ended && (
          <div className="space-y-4 mt-2">
            <NLSActionButton color="bg-gray-500" icon={<Users size={20} />} label="Update Parents & Complete Records"
              onClick={() => { saveUndo(); logEvent("Updated Parents & Records"); }} height="h-14" />
            <NLSEventLog events={events} />
          </div>
        )}
      </div>

      {/* ===== BOTTOM CONTROLS (matches iOS BottomControlsView) ===== */}
      {arrestState !== NLSArrestState.Pending && (
        <div className="fixed bottom-0 left-0 right-0 p-3 pb-[72px] bg-background/80 backdrop-blur-md border-t border-border z-10">
          <div className="flex space-x-3">
            {isStopped ? (
              <>
                <button onClick={resumeArrest}
                  className="flex-1 py-3 rounded-xl bg-tone-accent text-tone-on-accent font-bold flex items-center justify-center space-x-2 active:scale-95 transition-transform">
                  <Play size={18} />
                  <span>Resume</span>
                </button>
                <button onClick={() => setShowSummary(true)}
                  className="flex-1 py-3 rounded-xl bg-tone-accent text-tone-on-accent font-bold flex items-center justify-center space-x-2 active:scale-95 transition-transform">
                  <span>Summary</span>
                </button>
                <button onClick={() => setShowReset(true)}
                  className="flex-1 py-3 rounded-xl bg-tone-danger text-tone-on-danger font-bold flex items-center justify-center space-x-2 active:scale-95 transition-transform">
                  <RotateCw size={18} />
                  <span>Reset</span>
                </button>
              </>
            ) : (
              <>
                <button onClick={undo} disabled={undoStack.length === 0}
                  className="flex-1 py-3 rounded-xl bg-tone-accent text-tone-on-accent font-bold flex items-center justify-center space-x-2 active:scale-95 transition-transform disabled:opacity-40">
                  <Undo size={18} />
                  <span>Undo</span>
                </button>
                <button onClick={() => setShowSummary(true)}
                  className="flex-1 py-3 rounded-xl bg-tone-accent text-tone-on-accent font-bold flex items-center justify-center space-x-2 active:scale-95 transition-transform">
                  <span>Summary</span>
                </button>
                <button onClick={pauseArrest}
                  className="flex-1 py-3 rounded-xl bg-tone-danger text-tone-on-danger font-bold flex items-center justify-center space-x-2 active:scale-95 transition-transform">
                  <Square size={18} />
                  <span>Stop</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== MODALS ===== */}
      <NLSModal isOpen={showSummary} onClose={() => setShowSummary(false)} title="NLS Event Summary">
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong>Start:</strong> {startTimeRef.current ? startTimeRef.current.toLocaleTimeString() : "Unknown"}
            </p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">Total Time: {formatTime(totalArrestTime)}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Birth Type: {isPreterm ? 'Preterm' : 'Term'} | Adrenaline: {adrenalineCount}
            </p>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-700 rounded-lg font-mono text-sm">
            {[...events].reverse().map((e, i) => (
              <div key={i} className="flex">
                <span className="font-bold w-16 flex-shrink-0 text-tone-accent">[{formatTime(e.timestamp)}]</span>
                <span className="ml-2 text-gray-800 dark:text-gray-200">{e.message}</span>
              </div>
            ))}
          </div>
          <button onClick={() => { copySummary(); setShowSummary(false); }}
            className="w-full py-3 rounded-xl bg-tone-accent text-tone-on-accent font-bold flex items-center justify-center space-x-2 active:scale-95 transition-transform">
            <Clipboard size={18} />
            <span>Copy to Clipboard</span>
          </button>
        </div>
      </NLSModal>

      <NLSModal isOpen={showReset} onClose={() => setShowReset(false)} title="Reset NLS?">
        <div className="flex flex-col items-center text-center space-y-4">
          <RotateCw size={48} className="text-tone-danger" />
          <p className="text-gray-700 dark:text-gray-300">This will save the current log. Cannot be undone.</p>
          <button onClick={() => { performReset(true, true); setShowReset(false); }}
            className="w-full py-3 rounded-xl bg-tone-accent text-tone-on-accent font-bold active:scale-95 transition-transform">
            Copy, Save & Reset
          </button>
          <button onClick={() => { performReset(true, false); setShowReset(false); }}
            className="w-full py-3 rounded-xl bg-tone-danger text-tone-on-danger font-bold active:scale-95 transition-transform">
            Reset & Save
          </button>
          <button onClick={() => setShowReset(false)} className="text-gray-500 font-medium py-2">Cancel</button>
        </div>
      </NLSModal>

      <NLSModal isOpen={showConfirmBack} onClose={() => setShowConfirmBack(false)} title="Leave NLS?">
        <div className="text-center space-y-4">
          <p className="text-gray-700 dark:text-gray-300">Session will be saved to logbook.</p>
          <div className="flex space-x-3">
            <button onClick={() => setShowConfirmBack(false)}
              className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-bold active:scale-95 transition-transform">Stay</button>
            <button onClick={confirmBack}
              className="flex-1 py-3 rounded-xl bg-tone-danger text-tone-on-danger font-bold active:scale-95 transition-transform">Save & Leave</button>
          </div>
        </div>
      </NLSModal>

      {/* Airway Adjunct Modal */}
      <NLSModal isOpen={showAirwayModal} onClose={() => setShowAirwayModal(false)} title="Select Airway Adjunct">
        <div className="flex flex-col space-y-4">
          <p className="text-center text-gray-600 dark:text-gray-400">Choose the type of advanced airway placed.</p>
          <NLSActionButton color="bg-blue-600" label="Supraglottic Airway (i-Gel)" onClick={() => { saveUndo(); setAirwayPlaced(true); logEvent("Advanced Airway Placed - Supraglottic Airway (i-Gel)", "airway"); setShowAirwayModal(false); }} />
          <NLSActionButton color="bg-indigo-600" label="Endotracheal Tube" onClick={() => { saveUndo(); setAirwayPlaced(true); logEvent("Advanced Airway Placed - Endotracheal Tube", "airway"); setShowAirwayModal(false); }} />
          <NLSActionButton color="bg-gray-500" label="Unspecified" onClick={() => { saveUndo(); setAirwayPlaced(true); logEvent("Advanced Airway Placed - Unspecified", "airway"); setShowAirwayModal(false); }} />
        </div>
      </NLSModal>

      {/* Other Drugs Modal */}
      <NLSModal isOpen={showOtherDrugsModal} onClose={() => setShowOtherDrugsModal(false)} title="Log Other Medication">
        <div className="flex flex-col space-y-2">
          {['Adenosine','Adrenaline 1:1000','Adrenaline 1:10,000','Amiodarone (Further Dose)','Atropine','Calcium chloride','Glucose','Hartmann\'s solution','Magnesium sulphate','Midazolam','Naloxone','Potassium chloride','Sodium bicarbonate','Sodium chloride','Tranexamic acid','Volume 10ml/kg 0.9% NaCl'].sort().map(drug => (
            <button key={drug} onClick={() => { saveUndo(); logEvent(`${drug} Given`, "drug"); setShowOtherDrugsModal(false); }}
              className="w-full text-left p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-white">
              {drug}
            </button>
          ))}
        </div>
      </NLSModal>
    </div>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// NLS Square Timer — matches iOS NLSSquareTimerView
const NLSSquareTimer: React.FC<{ time: number; totalDuration: number }> = ({ time, totalDuration }) => {
  const isEnding = time <= 10;
  return (
    <div className={`px-8 py-3 rounded-2xl shadow-sm text-center border-[3px] ${
      isEnding 
        ? 'border-tone-danger bg-card' 
        : 'border-primary/60 bg-card'
    }`}>
      <div className={`font-mono text-4xl font-bold ${isEnding ? 'text-tone-danger' : 'text-foreground'}`}>
        {formatTime(Math.max(0, time))}
      </div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Reassess In
      </div>
    </div>
  );
};

// Wizard Card — matches iOS WizardInstructionBlock + WizardQuestionBlock inside a card
const WizardCard: React.FC<{
  label: string;
  title: string;
  bullets: string[];
  question: string;
  actions: React.ReactNode;
}> = ({ label, title, bullets, question, actions }) => (
  <div className="p-4 bg-card rounded-2xl shadow-sm space-y-3">
    <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">{label}</p>
    <h2 className="text-xl font-extrabold leading-tight text-foreground">{title}</h2>
    {bullets.length > 0 && (
      <div className="space-y-2 pt-1">
        {bullets.map((b, i) => (
          <div key={i} className="flex items-start space-x-2 text-sm">
            <ChevronRight size={10} className="text-tone-accent mt-1.5 flex-shrink-0 font-black" />
            <span className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: b }} />
          </div>
        ))}
      </div>
    )}
    {question && (
      <div className="border-t border-border pt-3">
        <p className="text-sm font-bold text-center mb-3 text-foreground">{question}</p>
      </div>
    )}
    {actions}
  </div>
);

// SpO2 Table — matches iOS SpO2TargetTable
const SpO2Table: React.FC = () => (
  <div className="rounded-xl overflow-hidden border-2 border-tone-accent bg-card shadow-sm">
    <div className="bg-tone-accent py-2 text-center text-sm font-bold text-white">
      Acceptable Pre-ductal SpO₂
    </div>
    <div>
      {getSpO2Targets().map((t, i) => (
        <div key={t.time} className={`flex ${i < getSpO2Targets().length - 1 ? 'border-b border-border' : ''}`}>
          <div className="flex-1 py-2 text-center text-sm text-muted-foreground border-r border-border">{t.time}</div>
          <div className="flex-1 py-2 text-center text-sm text-muted-foreground">{t.target}</div>
        </div>
      ))}
    </div>
    <div className="py-1.5 text-center text-xs italic text-muted-foreground border-t border-border">
      Titrate O₂ to achieve target SpO₂
    </div>
  </div>
);

// NLS Action Button
// Older call sites name a colour; read their intent so they pick up the calm palette (matches iOS tones).
const toneFromColour = (color: string): ButtonTone => {
  if (color.includes('bg-red')) return 'danger';
  if (color.includes('bg-green')) return 'positive';
  return 'standard';
};

const NLSActionButton: React.FC<{
  color?: string;
  tone?: ButtonTone;
  icon?: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick: () => void;
  disabled?: boolean;
  height?: string;
  fontSize?: string;
}> = ({ color = '', tone, icon, label, sublabel, onClick, disabled = false, height = 'h-14', fontSize = 'text-base' }) => (
  <button onClick={onClick}
    disabled={disabled}
    className={`${TONE_CLASSES[tone ?? toneFromColour(color)]} ${height} w-full rounded-xl font-semibold ${fontSize} flex items-center justify-center space-x-2 active:scale-95 active:brightness-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed`}>
    {icon}
    <div className="text-center leading-tight">
      <div>{label}</div>
      {sublabel && <div className="text-xs font-normal opacity-80">{sublabel}</div>}
    </div>
  </button>
);

// Event Log
const NLSEventLog: React.FC<{ events: NLSEvent[] }> = ({ events }) => (
  <div className="p-4 bg-card rounded-xl shadow-sm space-y-3">
    <h3 className="font-semibold text-muted-foreground">Event Log</h3>
    <div className="space-y-2 max-h-60 overflow-y-auto font-mono text-sm">
      {events.length === 0 ? (
        <p className="text-muted-foreground italic">No events logged yet.</p>
      ) : (
        events.map((e, i) => (
          <div key={i} className="flex">
            <span className="font-bold w-16 flex-shrink-0 text-primary">[{formatTime(e.timestamp)}]</span>
            <span className="ml-2 text-foreground">{e.message}</span>
          </div>
        ))
      )}
    </div>
  </div>
);

// Modal
const NLSModal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-md mx-auto overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><XSquare size={24} /></button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[70vh]">{children}</div>
      </div>
    </div>
  );
};

export default NewbornLifeSupport;
