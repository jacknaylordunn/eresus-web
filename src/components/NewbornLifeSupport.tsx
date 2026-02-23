import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Heart,
  Wind,
  Activity,
  Timer,
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
} from 'lucide-react';
import {
  getFirestore,
  collection,
  addDoc,
  Timestamp,
} from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';

// ============================================================================
// NLS TYPES & ENUMS
// ============================================================================

enum NLSStep {
  Start = "START",
  BirthType = "BIRTH_TYPE",
  InitialAssessment = "INITIAL_ASSESSMENT",
  BreathingAssessment = "BREATHING_ASSESSMENT",
  CPAP = "CPAP",
  InflationBreaths = "INFLATION_BREATHS",
  ReassessAfterInflation = "REASSESS_AFTER_INFLATION",
  VentilationBreaths = "VENTILATION_BREATHS",
  ChestCompressions = "CHEST_COMPRESSIONS",
  DrugsAndAccess = "DRUGS_AND_ACCESS",
  Stabilised = "STABILISED",
  Ended = "ENDED",
}

enum NLSBirthType {
  Preterm = "PRETERM",
  Term = "TERM",
}

interface NLSEvent {
  timestamp: number;
  message: string;
  category: string;
}

// ============================================================================
// TIME FORMATTER
// ============================================================================
const formatTime = (seconds: number): string => {
  const t = Math.max(0, seconds);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// ============================================================================
// CHECKLIST DATA
// ============================================================================
const getSpO2Targets = () => [
  { time: '2 min', target: '60%' },
  { time: '3 min', target: '70-75%' },
  { time: '5 min', target: '80-85%' },
  { time: '10 min', target: '85-95%' },
];

const getChestNotMovingChecklist = () => [
  { id: 'mask', label: 'Check mask seal', done: false },
  { id: 'head', label: 'Reposition head & jaw', done: false },
  { id: 'twoperson', label: '2-person airway support', done: false },
  { id: 'suction', label: 'Suction (if visible obstruction)', done: false },
  { id: 'oropharyngeal', label: 'Oropharyngeal airway', done: false },
];

const getPostStabilisationChecklist = () => [
  { id: 'parents', label: 'Update parents', done: false },
  { id: 'records', label: 'Complete records', done: false },
  { id: 'debrief', label: 'Debrief team', done: false },
  { id: 'temp', label: 'Check temperature', done: false },
  { id: 'glucose', label: 'Check blood glucose', done: false },
  { id: 'transfer', label: 'Arrange transfer/care', done: false },
];

const getConsiderFactors = () => [
  { id: 'hypovolaemia', label: 'Hypovolaemia', done: false },
  { id: 'pneumothorax', label: 'Pneumothorax', done: false },
  { id: 'congenital', label: 'Congenital abnormality', done: false },
  { id: 'glucose', label: 'Blood glucose', done: false },
];

// ============================================================================
// FIREBASE HELPERS
// ============================================================================
const getFirebaseDb = () => {
  const apps = getApps();
  if (apps.length > 0) {
    return getFirestore(apps[0]);
  }
  return null;
};

const getUserId = (): string => {
  const stored = localStorage.getItem('eresus_user_id');
  if (stored) return stored;
  const newId = crypto.randomUUID();
  localStorage.setItem('eresus_user_id', newId);
  return newId;
};

// ============================================================================
// SHARED UI COMPONENTS (matching arrest page style)
// ============================================================================

const ActionButton: React.FC<{
  title: string;
  icon?: React.ReactNode;
  backgroundColor: string;
  foregroundColor: string;
  height?: string;
  fontSize?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}> = ({ title, icon, backgroundColor, foregroundColor, height = "h-14", fontSize = "text-base", onClick, disabled = false, className = "" }) => (
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

const CounterItem: React.FC<{ label: string; value: number | string; color: string }> = ({ label, value, color }) => (
  <div className={`flex flex-col items-center ${color}`}>
    <span className="font-mono font-bold text-lg">{value}</span>
    <span className="text-[10px] font-semibold uppercase text-gray-500 dark:text-gray-400">{label}</span>
  </div>
);

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md mx-auto overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <XSquare size={24} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[70vh]">{children}</div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN NLS COMPONENT
// ============================================================================

interface NewbornLifeSupportProps {
  onBack: () => void;
}

const NewbornLifeSupport: React.FC<NewbornLifeSupportProps> = ({ onBack }) => {
  // --- State ---
  const [step, setStep] = useState<NLSStep>(NLSStep.Start);
  const [birthType, setBirthType] = useState<NLSBirthType | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<NLSEvent[]>([]);
  const startTimeRef = useRef<Date | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Undo
  const [undoStack, setUndoStack] = useState<Array<{
    step: NLSStep;
    events: NLSEvent[];
    inflationBreathsGiven: number;
    chestMoving: boolean | null;
    ventilationStartTime: number | null;
    compressionCycles: number;
    fio2: string;
    adrenalineGiven: number;
    volumeGiven: boolean;
    vascularAccess: boolean;
  }>>([]);

  // Step-specific state
  const [inflationBreathsGiven, setInflationBreathsGiven] = useState(0);
  const [chestMoving, setChestMoving] = useState<boolean | null>(null);
  const [ventilationStartTime, setVentilationStartTime] = useState<number | null>(null);
  const [compressionCycles, setCompressionCycles] = useState(0);
  const [fio2, setFio2] = useState('21');
  const [heartRate, setHeartRate] = useState<string>('');
  const [adrenalineGiven, setAdrenalineGiven] = useState(0);
  const [volumeGiven, setVolumeGiven] = useState(false);
  const [vascularAccess, setVascularAccess] = useState(false);

  // Checklists
  const [chestNotMovingChecks, setChestNotMovingChecks] = useState(getChestNotMovingChecklist());
  const [postStabilisation, setPostStabilisation] = useState(getPostStabilisationChecklist());
  const [considerFactors, setConsiderFactors] = useState(getConsiderFactors());

  // Modals
  const [showSummary, setShowSummary] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showConfirmBack, setShowConfirmBack] = useState(false);

  // --- Timer ---
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedTime((Date.now() - startTimeRef.current.getTime()) / 1000);
        }
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  // --- Save undo snapshot ---
  const saveUndo = () => {
    setUndoStack(prev => [...prev.slice(-19), {
      step,
      events: [...events],
      inflationBreathsGiven,
      chestMoving,
      ventilationStartTime,
      compressionCycles,
      fio2,
      adrenalineGiven,
      volumeGiven,
      vascularAccess,
    }]);
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setStep(last.step);
    setEvents(last.events);
    setInflationBreathsGiven(last.inflationBreathsGiven);
    setChestMoving(last.chestMoving);
    setVentilationStartTime(last.ventilationStartTime);
    setCompressionCycles(last.compressionCycles);
    setFio2(last.fio2);
    setAdrenalineGiven(last.adrenalineGiven);
    setVolumeGiven(last.volumeGiven);
    setVascularAccess(last.vascularAccess);
    setUndoStack(prev => prev.slice(0, -1));
    if (navigator.vibrate) navigator.vibrate(10);
  };

  // --- Event Logger ---
  const logEvent = (message: string, category: string = 'action') => {
    setEvents(prev => [{ timestamp: elapsedTime, message, category }, ...prev]);
  };

  // --- Save to logbook ---
  const saveToLogbook = async () => {
    if (!startTimeRef.current) return;
    try {
      const db = getFirebaseDb();
      if (!db) return;
      const userId = getUserId();
      const appId = 'eresus-6e65e';
      const logsCollectionPath = `/artifacts/${appId}/users/${userId}/logs`;
      
      const outcome = step === NLSStep.Stabilised ? 'Stabilised' : 
                       step === NLSStep.Ended ? 'NLS Complete' : 'NLS Incomplete';

      const logDoc = {
        startTime: Timestamp.fromDate(startTimeRef.current),
        totalDuration: elapsedTime,
        finalOutcome: outcome,
        userId: userId,
        type: 'NLS',
        birthType: birthType,
      };

      const logDocRef = await addDoc(collection(db, logsCollectionPath), logDoc);

      const eventsCollectionRef = collection(db, `${logsCollectionPath}/${logDocRef.id}/events`);
      for (const event of events) {
        await addDoc(eventsCollectionRef, {
          timestamp: event.timestamp,
          message: event.message,
          type: event.category,
        });
      }
    } catch (e) {
      console.error("Error saving NLS log:", e);
    }
  };

  // --- Copy summary ---
  const copySummary = () => {
    const sorted = [...events].reverse();
    const text = `eResus — Newborn Life Support Summary
Total Time: ${formatTime(elapsedTime)}
Birth Type: ${birthType === NLSBirthType.Preterm ? 'Preterm (<32 weeks)' : 'Term/Near-term'}

--- Event Log ---
${sorted.map(e => `[${formatTime(e.timestamp)}] ${e.message}`).join('\n')}`;
    navigator.clipboard.writeText(text.trim()).catch(console.error);
    if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
  };

  // --- Actions ---
  const startClock = (type: NLSBirthType) => {
    startTimeRef.current = new Date();
    setIsRunning(true);
    setBirthType(type);
    setStep(NLSStep.InitialAssessment);
    logEvent(`Clock started — ${type === NLSBirthType.Preterm ? 'Preterm' : 'Term'} birth`, 'status');
    if (navigator.vibrate) navigator.vibrate(20);
  };

  const completeInitialAssessment = () => {
    saveUndo();
    setStep(NLSStep.BreathingAssessment);
    logEvent('Initial assessment complete', 'status');
  };

  const assessBreathing = (breathing: boolean) => {
    saveUndo();
    if (breathing) {
      setStep(NLSStep.CPAP);
      logEvent('Breathing — CPAP initiated', 'status');
    } else {
      setStep(NLSStep.InflationBreaths);
      logEvent('Not breathing — inflation breaths', 'status');
    }
  };

  const logInflationBreath = () => {
    saveUndo();
    const newCount = inflationBreathsGiven + 1;
    setInflationBreathsGiven(newCount);
    logEvent(`Inflation breath ${newCount}`, 'action');
    if (newCount >= 5) logEvent('5 inflation breaths complete', 'status');
  };

  const proceedToReassess = () => {
    saveUndo();
    setStep(NLSStep.ReassessAfterInflation);
    logEvent('Reassessing HR & chest rise', 'status');
  };

  const assessChestMovement = (moving: boolean) => {
    saveUndo();
    setChestMoving(moving);
    if (moving) {
      setStep(NLSStep.VentilationBreaths);
      setVentilationStartTime(elapsedTime);
      logEvent('Chest moving — ventilation', 'status');
    } else {
      logEvent('Chest not moving — check airway', 'status');
    }
  };

  const proceedToCompressions = () => {
    saveUndo();
    setStep(NLSStep.ChestCompressions);
    logEvent('HR <60 — compressions 3:1', 'action');
    setFio2('100');
    logEvent('FiO₂ increased to 100%', 'action');
  };

  const logCompressionCycle = () => {
    saveUndo();
    const newCount = compressionCycles + 1;
    setCompressionCycles(newCount);
    logEvent(`Compression cycle ${newCount}`, 'action');
  };

  const proceedToDrugs = () => {
    saveUndo();
    setStep(NLSStep.DrugsAndAccess);
    logEvent('HR <60 — drugs & vascular access', 'action');
  };

  const logAdrenaline = () => {
    saveUndo();
    const newCount = adrenalineGiven + 1;
    setAdrenalineGiven(newCount);
    logEvent(`Adrenaline dose ${newCount} (10-30 mcg/kg IV)`, 'drug');
  };

  const logVascularAccess = () => {
    saveUndo();
    setVascularAccess(true);
    logEvent('Vascular access (UVC/IO)', 'action');
  };

  const logVolume = () => {
    saveUndo();
    setVolumeGiven(true);
    logEvent('Volume 10ml/kg 0.9% NaCl', 'drug');
  };

  const stabilise = () => {
    saveUndo();
    setStep(NLSStep.Stabilised);
    logEvent('Baby stabilised — HR ≥60', 'status');
  };

  const endResuscitation = () => {
    setStep(NLSStep.Ended);
    setIsRunning(false);
    logEvent('Resuscitation ended', 'status');
  };

  const logHR = () => {
    if (heartRate) {
      saveUndo();
      logEvent(`Heart rate: ${heartRate} bpm`, 'status');
      setHeartRate('');
    }
  };

  const performReset = async (shouldSave: boolean, shouldCopy: boolean) => {
    if (shouldSave) await saveToLogbook();
    if (shouldCopy) copySummary();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRunning(false);
    setStep(NLSStep.Start);
    setBirthType(null);
    setElapsedTime(0);
    setEvents([]);
    setUndoStack([]);
    setInflationBreathsGiven(0);
    setChestMoving(null);
    setVentilationStartTime(null);
    setCompressionCycles(0);
    setFio2('21');
    setHeartRate('');
    setAdrenalineGiven(0);
    setVolumeGiven(false);
    setVascularAccess(false);
    setChestNotMovingChecks(getChestNotMovingChecklist());
    setPostStabilisation(getPostStabilisationChecklist());
    setConsiderFactors(getConsiderFactors());
    startTimeRef.current = null;
  };

  const handleBack = () => {
    if (isRunning) {
      setShowConfirmBack(true);
    } else {
      onBack();
    }
  };

  const confirmBack = async () => {
    await saveToLogbook();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRunning(false);
    setShowConfirmBack(false);
    onBack();
  };

  // Ventilation timer
  const ventilationElapsed = ventilationStartTime !== null ? elapsedTime - ventilationStartTime : 0;
  const ventilation30sDue = ventilationElapsed >= 30 && step === NLSStep.VentilationBreaths;

  // Header state
  const isReassessDue = ventilation30sDue;
  
  const stepLabel = (() => {
    switch (step) {
      case NLSStep.InitialAssessment: return 'ASSESSMENT';
      case NLSStep.BreathingAssessment: return 'BREATHING';
      case NLSStep.CPAP: return 'CPAP';
      case NLSStep.InflationBreaths: return 'INFLATION';
      case NLSStep.ReassessAfterInflation: return 'REASSESS';
      case NLSStep.VentilationBreaths: return 'VENTILATION';
      case NLSStep.ChestCompressions: return 'COMPRESSIONS';
      case NLSStep.DrugsAndAccess: return 'DRUGS';
      case NLSStep.Stabilised: return 'STABILISED';
      case NLSStep.Ended: return 'COMPLETE';
      default: return 'PENDING';
    }
  })();

  const stepColor = (() => {
    switch (step) {
      case NLSStep.Stabilised: return 'bg-green-500';
      case NLSStep.Ended: return 'bg-gray-600';
      case NLSStep.ChestCompressions: 
      case NLSStep.DrugsAndAccess: return 'bg-red-500';
      default: return 'bg-blue-500';
    }
  })();

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900">
      {/* ===== HEADER (matching arrest page) ===== */}
      <div className={`p-4 shadow-md transition-colors duration-300 ${
        isReassessDue ? 'bg-red-600 animate-pulse' : 'bg-white dark:bg-gray-800'
      }`}>
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center space-x-3">
            <button onClick={handleBack} className={`p-1 rounded ${isReassessDue ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>
              <ArrowLeft size={24} />
            </button>
            <div className="flex flex-col items-start space-y-1">
              {isReassessDue ? (
                <h1 className="text-3xl font-bold text-white">Reassess HR</h1>
              ) : (
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Newborn LS</h1>
              )}
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-0.5 rounded-lg text-xs font-black text-white ${isReassessDue ? 'bg-white/30' : stepColor}`}>
                  {stepLabel}
                </span>
                {birthType && (
                  <span className={`px-2 py-0.5 rounded-lg text-xs font-black text-white ${
                    birthType === NLSBirthType.Preterm ? 'bg-purple-500' : 'bg-blue-500'
                  }`}>
                    {birthType === NLSBirthType.Preterm ? 'PRETERM' : 'TERM'}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className={`font-mono font-bold text-4xl ${isReassessDue ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`}>
            {formatTime(elapsedTime)}
          </div>
        </div>

        {/* Counters row */}
        {isRunning && step !== NLSStep.Start && (
          <div className="flex justify-around pt-2 border-t border-gray-200 dark:border-gray-700">
            <CounterItem label="Breaths" value={inflationBreathsGiven} color={isReassessDue ? 'text-white' : 'text-orange-500'} />
            <CounterItem label="Cycles" value={compressionCycles} color={isReassessDue ? 'text-white' : 'text-red-500'} />
            <CounterItem label="Adrenaline" value={adrenalineGiven} color={isReassessDue ? 'text-white' : 'text-pink-500'} />
            <CounterItem label="FiO₂" value={`${fio2}%`} color={isReassessDue ? 'text-white' : 'text-cyan-500'} />
          </div>
        )}
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-grow overflow-y-auto p-4 space-y-4 pb-36">
        
        {/* START */}
        {step === NLSStep.Start && (
          <div className="space-y-6 pt-4">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Newborn Life Support</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">RCUK Guidelines 2025</p>
            </div>
            <ActionButton
              title="Term / Near-term Birth"
              backgroundColor="bg-blue-600"
              foregroundColor="text-white"
              height="h-16"
              fontSize="text-lg"
              onClick={() => startClock(NLSBirthType.Term)}
            />
            <ActionButton
              title="Preterm Birth (<32 weeks)"
              backgroundColor="bg-purple-600"
              foregroundColor="text-white"
              height="h-16"
              fontSize="text-lg"
              onClick={() => startClock(NLSBirthType.Preterm)}
            />
          </div>
        )}

        {/* INITIAL ASSESSMENT */}
        {step === NLSStep.InitialAssessment && (
          <div className="space-y-4">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-3">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">Initial Assessment (~60s)</h3>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                {birthType === NLSBirthType.Preterm ? (
                  <>
                    <TaskItem label="Plastic bag (undried)" highlight />
                    <TaskItem label="Delay cord clamping" />
                  </>
                ) : (
                  <>
                    <TaskItem label="Dry the baby" />
                    <TaskItem label="Delay cord clamping" />
                  </>
                )}
                <TaskItem label="Stimulate & thermal care" />
                <TaskItem label="SpO₂ ± ECG monitoring" />
              </div>
            </div>
            <ActionButton
              title="Assessment Complete"
              icon={<ChevronRight size={18} />}
              backgroundColor="bg-green-600"
              foregroundColor="text-white"
              height="h-16"
              fontSize="text-lg"
              onClick={completeInitialAssessment}
            />
          </div>
        )}

        {/* BREATHING ASSESSMENT */}
        {step === NLSStep.BreathingAssessment && (
          <div className="space-y-4">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">Is the baby breathing?</h3>
            </div>
            <ActionButton title="Breathing" backgroundColor="bg-green-600" foregroundColor="text-white" height="h-16" fontSize="text-lg" onClick={() => assessBreathing(true)} />
            <ActionButton title="Not Breathing" backgroundColor="bg-red-600" foregroundColor="text-white" height="h-16" fontSize="text-lg" onClick={() => assessBreathing(false)} />
          </div>
        )}

        {/* CPAP */}
        {step === NLSStep.CPAP && (
          <div className="space-y-4">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-2">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">CPAP 5-8 cm H₂O</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                FiO₂: {birthType === NLSBirthType.Preterm ? '>30%' : '21%'} — titrate to SpO₂
              </p>
            </div>
            <ActionButton title="Breathing Inadequate" icon={<AlertTriangle size={18} />} backgroundColor="bg-orange-500" foregroundColor="text-white" height="h-14" onClick={() => { saveUndo(); logEvent('Breathing inadequate — inflation breaths', 'status'); setStep(NLSStep.InflationBreaths); }} />
            <ActionButton title="Baby Stabilised" icon={<CheckCircle2 size={18} />} backgroundColor="bg-green-600" foregroundColor="text-white" height="h-14" onClick={stabilise} />
          </div>
        )}

        {/* INFLATION BREATHS */}
        {step === NLSStep.InflationBreaths && (
          <div className="space-y-4">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-2">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">
                5 Inflation Breaths — {birthType === NLSBirthType.Preterm ? '25' : '30'} cm H₂O
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {birthType === NLSBirthType.Preterm ? 'FiO₂ >30% • PEEP 6 cm H₂O' : 'Air (21%)'}
              </p>
            </div>

            <div className="flex items-center justify-center space-x-4">
              <span className="text-5xl font-bold font-mono text-gray-900 dark:text-white">{inflationBreathsGiven}/5</span>
            </div>
            
            <ActionButton
              title="Log Breath"
              icon={<Wind size={18} />}
              backgroundColor={inflationBreathsGiven >= 5 ? 'bg-gray-400' : 'bg-orange-500'}
              foregroundColor="text-white"
              height="h-14"
              onClick={logInflationBreath}
              disabled={inflationBreathsGiven >= 5}
            />

            {inflationBreathsGiven >= 5 && (
              <ActionButton
                title="Reassess"
                icon={<ChevronRight size={18} />}
                backgroundColor="bg-blue-600"
                foregroundColor="text-white"
                height="h-16"
                fontSize="text-lg"
                onClick={proceedToReassess}
              />
            )}
          </div>
        )}

        {/* REASSESS AFTER INFLATION */}
        {step === NLSStep.ReassessAfterInflation && (
          <div className="space-y-4">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">Chest moving with ventilation?</h3>
            </div>

            {chestMoving === null && (
              <div className="grid grid-cols-2 gap-3">
                <ActionButton title="Moving" backgroundColor="bg-green-600" foregroundColor="text-white" onClick={() => assessChestMovement(true)} />
                <ActionButton title="Not Moving" backgroundColor="bg-red-600" foregroundColor="text-white" onClick={() => assessChestMovement(false)} />
              </div>
            )}

            {chestMoving === false && (
              <div className="space-y-3">
                <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-2">
                  <h3 className="font-semibold text-gray-700 dark:text-gray-300">Airway Checks</h3>
                  {chestNotMovingChecks.map(check => (
                    <button key={check.id} onClick={() => setChestNotMovingChecks(prev => prev.map(c => c.id === check.id ? { ...c, done: !c.done } : c))} className="flex items-center space-x-3 w-full text-left">
                      {check.done ? <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" /> : <Circle size={20} className="text-gray-400 flex-shrink-0" />}
                      <span className={`text-sm text-gray-800 dark:text-gray-200 ${check.done ? 'line-through' : ''}`}>{check.label}</span>
                    </button>
                  ))}
                </div>
                <ActionButton title="Retry Inflation Breaths" icon={<RotateCw size={18} />} backgroundColor="bg-orange-500" foregroundColor="text-white" onClick={() => { saveUndo(); logEvent('Retrying inflation breaths', 'action'); setInflationBreathsGiven(0); setStep(NLSStep.InflationBreaths); }} />
                <ActionButton title="Chest Now Moving" icon={<CheckCircle2 size={18} />} backgroundColor="bg-green-600" foregroundColor="text-white" onClick={() => assessChestMovement(true)} />
              </div>
            )}
          </div>
        )}

        {/* VENTILATION */}
        {step === NLSStep.VentilationBreaths && (
          <div className="space-y-4">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-2">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">Ventilation ~30 breaths/min</h3>
              <div className="text-center">
                <span className={`font-mono text-4xl font-bold ${ventilation30sDue ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
                  {formatTime(ventilationElapsed)}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">ventilation time</p>
              </div>
            </div>

            {ventilation30sDue && (
              <div className="flex items-center justify-center space-x-2 p-3 rounded-2xl bg-red-600 text-white font-bold animate-pulse">
                <AlertTriangle size={20} />
                <span>30s — Reassess Heart Rate</span>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <input
                type="number"
                value={heartRate}
                onChange={(e) => setHeartRate(e.target.value)}
                placeholder="HR (bpm)"
                className="flex-grow p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl text-gray-900 dark:text-white text-center text-lg"
              />
              <ActionButton title="Log HR" backgroundColor="bg-blue-600" foregroundColor="text-white" onClick={logHR} disabled={!heartRate} className="w-28 flex-shrink-0" />
            </div>

            <ActionButton title="HR ≥60 — Stabilised" icon={<CheckCircle2 size={18} />} backgroundColor="bg-green-600" foregroundColor="text-white" height="h-14" onClick={stabilise} />
            {ventilation30sDue && (
              <ActionButton title="HR <60 — Compressions" icon={<Heart size={18} />} backgroundColor="bg-red-600" foregroundColor="text-white" height="h-14" onClick={proceedToCompressions} />
            )}
          </div>
        )}

        {/* CHEST COMPRESSIONS */}
        {step === NLSStep.ChestCompressions && (
          <div className="space-y-4">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-2">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">Compressions 3:1</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Lower ⅓ sternum • 100% O₂ • 15 cycles then reassess</p>
            </div>

            <ActionButton title="Log Cycle" icon={<Heart size={18} />} backgroundColor="bg-red-600" foregroundColor="text-white" height="h-14" onClick={logCompressionCycle} />
            <ActionButton title="HR ≥60 — Stabilised" icon={<CheckCircle2 size={18} />} backgroundColor="bg-green-600" foregroundColor="text-white" onClick={stabilise} />
            <ActionButton title="HR <60 — Drugs" icon={<Syringe size={18} />} backgroundColor="bg-orange-600" foregroundColor="text-white" onClick={proceedToDrugs} />
          </div>
        )}

        {/* DRUGS & ACCESS */}
        {step === NLSStep.DrugsAndAccess && (
          <div className="space-y-4">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-3">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">Drugs & Vascular Access</h3>
              <div className="grid grid-cols-2 gap-3">
                <ActionButton
                  title={vascularAccess ? "Access ✓" : "Vascular Access"}
                  icon={<Zap size={16} />}
                  backgroundColor={vascularAccess ? 'bg-green-600' : 'bg-blue-600'}
                  foregroundColor="text-white"
                  height="h-12"
                  fontSize="text-sm"
                  onClick={logVascularAccess}
                  disabled={vascularAccess}
                />
                <ActionButton
                  title={`Adrenaline (${adrenalineGiven})`}
                  icon={<Syringe size={16} />}
                  backgroundColor="bg-pink-600"
                  foregroundColor="text-white"
                  height="h-12"
                  fontSize="text-sm"
                  onClick={logAdrenaline}
                />
                <ActionButton
                  title={volumeGiven ? "Volume ✓" : "Volume 10ml/kg"}
                  icon={<Activity size={16} />}
                  backgroundColor={volumeGiven ? 'bg-green-600' : 'bg-indigo-600'}
                  foregroundColor="text-white"
                  height="h-12"
                  fontSize="text-sm"
                  onClick={logVolume}
                  disabled={volumeGiven}
                />
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-2">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">Consider</h3>
              {considerFactors.map(f => (
                <button key={f.id} onClick={() => setConsiderFactors(prev => prev.map(c => c.id === f.id ? { ...c, done: !c.done } : c))} className="flex items-center space-x-3 w-full text-left">
                  {f.done ? <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" /> : <Circle size={20} className="text-gray-400 flex-shrink-0" />}
                  <span className={`text-sm text-gray-800 dark:text-gray-200 ${f.done ? 'line-through' : ''}`}>{f.label}</span>
                </button>
              ))}
            </div>

            <ActionButton title="HR ≥60 — Stabilised" icon={<CheckCircle2 size={18} />} backgroundColor="bg-green-600" foregroundColor="text-white" height="h-14" onClick={stabilise} />
          </div>
        )}

        {/* STABILISED / ENDED */}
        {(step === NLSStep.Stabilised || step === NLSStep.Ended) && (
          <div className="space-y-4">
            <div className={`p-4 rounded-xl text-center ${step === NLSStep.Ended ? 'bg-gray-200 dark:bg-gray-700' : 'bg-green-100 dark:bg-green-900/30'}`}>
              <CheckCircle2 size={40} className={`mx-auto mb-2 ${step === NLSStep.Ended ? 'text-gray-500' : 'text-green-600'}`} />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {step === NLSStep.Ended ? 'Complete' : 'Baby Stabilised'}
              </h2>
            </div>

            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-2">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">Post-stabilisation</h3>
              {postStabilisation.map(task => (
                <button key={task.id} onClick={() => setPostStabilisation(prev => prev.map(c => c.id === task.id ? { ...c, done: !c.done } : c))} className="flex items-center space-x-3 w-full text-left">
                  {task.done ? <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" /> : <Circle size={20} className="text-gray-400 flex-shrink-0" />}
                  <span className={`text-sm text-gray-800 dark:text-gray-200 ${task.done ? 'line-through' : ''}`}>{task.label}</span>
                </button>
              ))}
            </div>

            {step !== NLSStep.Ended && (
              <ActionButton title="End Resuscitation" icon={<XSquare size={18} />} backgroundColor="bg-red-600" foregroundColor="text-white" onClick={endResuscitation} />
            )}
          </div>
        )}

        {/* SpO2 Reference */}
        {isRunning && step !== NLSStep.Start && (
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-2">
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-center text-sm">Pre-ductal SpO₂ Targets</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {getSpO2Targets().map(t => (
                <div key={t.time} className="flex justify-between px-3 py-1 bg-gray-50 dark:bg-gray-700 rounded">
                  <span className="text-gray-500 dark:text-gray-400">{t.time}</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{t.target}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Event Log */}
        {events.length > 0 && (
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-3">
            <h3 className="font-semibold text-gray-700 dark:text-gray-300">Event Log</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto font-mono text-sm">
              {events.map((event, i) => (
                <div key={i} className="flex">
                  <span className="font-bold w-16 flex-shrink-0 text-blue-500">[{formatTime(event.timestamp)}]</span>
                  <span className="ml-2 text-gray-800 dark:text-gray-200">{event.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== BOTTOM CONTROLS (matching arrest footer) ===== */}
      {isRunning && (
        <div className="fixed bottom-0 left-0 right-0 p-3 pb-[72px] bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 z-10">
          <div className="flex space-x-3">
            <ActionButton
              title="Undo"
              icon={<Undo size={18} />}
              backgroundColor="bg-gray-200 dark:bg-gray-700"
              foregroundColor="text-gray-800 dark:text-gray-200"
              height="h-12"
              onClick={undo}
              disabled={undoStack.length === 0}
            />
            <ActionButton
              title="Summary"
              backgroundColor="bg-blue-600"
              foregroundColor="text-white"
              height="h-12"
              onClick={() => setShowSummary(true)}
            />
            <ActionButton
              title="Reset"
              icon={<RotateCw size={18} />}
              backgroundColor="bg-red-600"
              foregroundColor="text-white"
              height="h-12"
              onClick={() => setShowReset(true)}
            />
          </div>
        </div>
      )}

      {/* ===== MODALS ===== */}
      <Modal isOpen={showSummary} onClose={() => setShowSummary(false)} title="NLS Event Summary">
        <div className="flex flex-col space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Total Time: {formatTime(elapsedTime)}
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-700 rounded-lg font-mono text-sm">
            {[...events].reverse().map((e, i) => (
              <div key={i} className="flex">
                <span className="font-bold w-16 flex-shrink-0 text-blue-500">[{formatTime(e.timestamp)}]</span>
                <span className="ml-2 text-gray-800 dark:text-gray-200">{e.message}</span>
              </div>
            ))}
          </div>
          <ActionButton
            title="Copy to Clipboard"
            icon={<Clipboard size={18} />}
            backgroundColor="bg-blue-600"
            foregroundColor="text-white"
            onClick={() => { copySummary(); setShowSummary(false); }}
          />
        </div>
      </Modal>

      <Modal isOpen={showReset} onClose={() => setShowReset(false)} title="Reset NLS?">
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
            onClick={() => { performReset(true, true); setShowReset(false); }}
          />
          <ActionButton
            title="Reset & Save"
            icon={<RotateCw size={18} />}
            backgroundColor="bg-red-600"
            foregroundColor="text-white"
            onClick={() => { performReset(true, false); setShowReset(false); }}
          />
          <button onClick={() => setShowReset(false)} className="text-gray-600 dark:text-gray-400 font-medium py-2 px-4 rounded-lg">
            Cancel
          </button>
        </div>
      </Modal>

      <Modal isOpen={showConfirmBack} onClose={() => setShowConfirmBack(false)} title="Leave NLS?">
        <div className="text-center space-y-4">
          <p className="text-gray-700 dark:text-gray-300">Session will be saved to logbook.</p>
          <div className="flex space-x-3">
            <ActionButton title="Stay" backgroundColor="bg-gray-200 dark:bg-gray-700" foregroundColor="text-gray-800 dark:text-gray-200" onClick={() => setShowConfirmBack(false)} />
            <ActionButton title="Save & Leave" backgroundColor="bg-red-600" foregroundColor="text-white" onClick={confirmBack} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ============================================================================
// SMALL HELPER COMPONENTS
// ============================================================================

const TaskItem: React.FC<{ label: string; highlight?: boolean }> = ({ label, highlight }) => (
  <div className="flex items-center space-x-2">
    <ChevronRight size={14} className={highlight ? 'text-purple-500' : 'text-gray-400'} />
    <span className={`text-sm ${highlight ? 'font-semibold text-purple-700 dark:text-purple-300' : 'text-gray-700 dark:text-gray-300'}`}>
      {label}
    </span>
  </div>
);

export default NewbornLifeSupport;
