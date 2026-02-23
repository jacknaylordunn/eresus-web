import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Baby,
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
  Thermometer,
  Volume2,
  VolumeX,
  ArrowLeft,
} from 'lucide-react';

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
  { id: 'suction', label: 'Consider suction (if visible obstruction)', done: false },
  { id: 'oropharyngeal', label: 'Consider oropharyngeal airway', done: false },
];

const getPostStabilisationChecklist = () => [
  { id: 'parents', label: 'Update parents', done: false },
  { id: 'records', label: 'Complete records', done: false },
  { id: 'debrief', label: 'Debrief team', done: false },
  { id: 'temp', label: 'Check temperature', done: false },
  { id: 'glucose', label: 'Check blood glucose', done: false },
  { id: 'transfer', label: 'Arrange appropriate transfer/care', done: false },
];

const getConsiderFactors = () => [
  { id: 'hypovolaemia', label: 'Hypovolaemia', done: false },
  { id: 'pneumothorax', label: 'Pneumothorax', done: false },
  { id: 'congenital', label: 'Congenital abnormality', done: false },
  { id: 'glucose', label: 'Check blood glucose', done: false },
];

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

  // Step-specific state
  const [inflationBreathsGiven, setInflationBreathsGiven] = useState(0);
  const [chestMoving, setChestMoving] = useState<boolean | null>(null);
  const [ventilationStartTime, setVentilationStartTime] = useState<number | null>(null);
  const [compressionCycles, setCompressionCycles] = useState(0);
  const [fio2, setFio2] = useState('21'); // % oxygen
  const [heartRate, setHeartRate] = useState<string>('');
  const [adrenalineGiven, setAdrenalineGiven] = useState(0);
  const [volumeGiven, setVolumeGiven] = useState(false);
  const [vascularAccess, setVascularAccess] = useState(false);

  // Checklists
  const [chestNotMovingChecks, setChestNotMovingChecks] = useState(getChestNotMovingChecklist());
  const [postStabilisation, setPostStabilisation] = useState(getPostStabilisationChecklist());
  const [considerFactors, setConsiderFactors] = useState(getConsiderFactors());

  // Show modals
  const [showSummary, setShowSummary] = useState(false);
  const [showConfirmEnd, setShowConfirmEnd] = useState(false);
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

  // --- Event Logger ---
  const logEvent = (message: string, category: string = 'action') => {
    setEvents(prev => [{ timestamp: elapsedTime, message, category }, ...prev]);
  };

  // --- Actions ---
  const startClock = (type: NLSBirthType) => {
    startTimeRef.current = new Date();
    setIsRunning(true);
    setBirthType(type);
    setStep(NLSStep.InitialAssessment);
    logEvent(`Clock started — ${type === NLSBirthType.Preterm ? 'Preterm (<32 weeks)' : 'Term/Near-term'} birth`, 'status');
    if (navigator.vibrate) navigator.vibrate(20);
  };

  const completeInitialAssessment = () => {
    setStep(NLSStep.BreathingAssessment);
    logEvent('Initial assessment complete: Dried, stimulated, thermal care applied', 'assessment');
    if (birthType === NLSBirthType.Preterm) {
      logEvent('Baby placed in plastic bag (preterm)', 'assessment');
    }
  };

  const assessBreathing = (breathing: boolean) => {
    if (breathing) {
      setStep(NLSStep.CPAP);
      logEvent('Baby IS breathing — initiating CPAP', 'assessment');
    } else {
      setStep(NLSStep.InflationBreaths);
      logEvent('Baby NOT breathing — proceeding to inflation breaths', 'assessment');
    }
  };

  const logInflationBreath = () => {
    const newCount = inflationBreathsGiven + 1;
    setInflationBreathsGiven(newCount);
    logEvent(`Inflation breath ${newCount} delivered`, 'intervention');
    if (newCount >= 5) {
      logEvent('5 inflation breaths completed', 'milestone');
    }
  };

  const proceedToReassess = () => {
    setStep(NLSStep.ReassessAfterInflation);
    logEvent('Reassessing heart rate and chest rise after inflation breaths', 'assessment');
  };

  const assessChestMovement = (moving: boolean) => {
    setChestMoving(moving);
    if (moving) {
      setStep(NLSStep.VentilationBreaths);
      setVentilationStartTime(elapsedTime);
      logEvent('Chest IS moving — continuing ventilation breaths', 'assessment');
    } else {
      logEvent('Chest NOT moving — checking airway', 'assessment');
    }
  };

  const proceedToCompressions = () => {
    setStep(NLSStep.ChestCompressions);
    logEvent('HR <60 after 30s ventilation — starting chest compressions 3:1', 'intervention');
    logEvent('Increase FiO2 to 100%', 'intervention');
    setFio2('100');
  };

  const logCompressionCycle = () => {
    const newCount = compressionCycles + 1;
    setCompressionCycles(newCount);
    logEvent(`Compression cycle ${newCount} completed (15 sets of 3:1)`, 'intervention');
  };

  const proceedToDrugs = () => {
    setStep(NLSStep.DrugsAndAccess);
    logEvent('HR remains <60 — considering drugs and vascular access', 'intervention');
  };

  const logAdrenaline = () => {
    const newCount = adrenalineGiven + 1;
    setAdrenalineGiven(newCount);
    logEvent(`Adrenaline dose ${newCount} given (10-30 mcg/kg IV)`, 'drug');
  };

  const logVascularAccess = () => {
    setVascularAccess(true);
    logEvent('Vascular access obtained (UVC/IO)', 'intervention');
  };

  const logVolume = () => {
    setVolumeGiven(true);
    logEvent('Intravascular volume given (10 ml/kg 0.9% NaCl)', 'drug');
  };

  const stabilise = () => {
    setStep(NLSStep.Stabilised);
    logEvent('Baby stabilised — HR >60', 'status');
  };

  const endResuscitation = () => {
    setStep(NLSStep.Ended);
    setIsRunning(false);
    logEvent('Resuscitation ended', 'status');
  };

  const logFiO2Change = (newFio2: string) => {
    setFio2(newFio2);
    logEvent(`FiO2 changed to ${newFio2}%`, 'intervention');
  };

  const logHR = () => {
    if (heartRate) {
      logEvent(`Heart rate: ${heartRate} bpm`, 'assessment');
      setHeartRate('');
    }
  };

  const copySummary = () => {
    const sorted = [...events].reverse();
    const text = `eResus — Newborn Life Support Summary
Total Time: ${formatTime(elapsedTime)}
Birth Type: ${birthType === NLSBirthType.Preterm ? 'Preterm (<32 weeks)' : 'Term/Near-term'}

--- Event Log ---
${sorted.map(e => `[${formatTime(e.timestamp)}] ${e.message}`).join('\n')}`;
    navigator.clipboard.writeText(text).catch(console.error);
  };

  const handleBack = () => {
    if (isRunning) {
      setShowConfirmBack(true);
    } else {
      onBack();
    }
  };

  const confirmBack = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRunning(false);
    setShowConfirmBack(false);
    onBack();
  };

  // Ventilation timer (30s countdown to check HR)
  const ventilationElapsed = ventilationStartTime !== null ? elapsedTime - ventilationStartTime : 0;
  const ventilation30sDue = ventilationElapsed >= 30 && step === NLSStep.VentilationBreaths;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <div className={`p-4 shadow-md transition-colors duration-300 ${
        ventilation30sDue ? 'bg-red-600 animate-pulse' : 'bg-white dark:bg-gray-800'
      }`}>
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <button onClick={handleBack} className={`p-1 rounded ${ventilation30sDue ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`}>
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className={`text-2xl font-bold ${ventilation30sDue ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                {ventilation30sDue ? 'Reassess HR' : 'Newborn LS'}
              </h1>
              {birthType && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                  birthType === NLSBirthType.Preterm 
                    ? 'bg-purple-500 text-white' 
                    : 'bg-blue-500 text-white'
                }`}>
                  {birthType === NLSBirthType.Preterm ? 'PRETERM' : 'TERM'}
                </span>
              )}
            </div>
          </div>
          <div className={`font-mono font-bold text-3xl ${ventilation30sDue ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`}>
            {formatTime(elapsedTime)}
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-grow overflow-y-auto p-4 space-y-4 pb-36">
        {step === NLSStep.Start && <StartStep onStart={startClock} />}
        
        {step === NLSStep.InitialAssessment && (
          <InitialAssessmentStep 
            birthType={birthType!} 
            onComplete={completeInitialAssessment} 
          />
        )}

        {step === NLSStep.BreathingAssessment && (
          <BreathingAssessmentStep onAssess={assessBreathing} />
        )}

        {step === NLSStep.CPAP && (
          <CPAPStep 
            birthType={birthType!}
            fio2={fio2}
            onFio2Change={logFiO2Change}
            onNotBreathing={() => {
              logEvent('Baby stopped breathing — moving to inflation breaths', 'assessment');
              setStep(NLSStep.InflationBreaths);
            }}
            onStabilised={stabilise}
          />
        )}

        {step === NLSStep.InflationBreaths && (
          <InflationBreathsStep
            birthType={birthType!}
            breathsGiven={inflationBreathsGiven}
            onLogBreath={logInflationBreath}
            onProceed={proceedToReassess}
          />
        )}

        {step === NLSStep.ReassessAfterInflation && (
          <ReassessStep
            chestNotMovingChecks={chestNotMovingChecks}
            onToggleCheck={(id) => setChestNotMovingChecks(prev => 
              prev.map(c => c.id === id ? { ...c, done: !c.done } : c)
            )}
            onChestMoving={() => assessChestMovement(true)}
            onChestNotMoving={() => assessChestMovement(false)}
            onRetryInflation={() => {
              logEvent('Retrying inflation breaths after airway adjustments', 'intervention');
              setInflationBreathsGiven(0);
              setStep(NLSStep.InflationBreaths);
            }}
            chestMoving={chestMoving}
          />
        )}

        {step === NLSStep.VentilationBreaths && (
          <VentilationStep
            ventilationElapsed={ventilationElapsed}
            is30sDue={ventilation30sDue}
            heartRate={heartRate}
            onHeartRateChange={setHeartRate}
            onLogHR={logHR}
            onHRAbove60={stabilise}
            onHRBelow60={proceedToCompressions}
          />
        )}

        {step === NLSStep.ChestCompressions && (
          <CompressionsStep
            compressionCycles={compressionCycles}
            onLogCycle={logCompressionCycle}
            onHRAbove60={stabilise}
            onHRStillBelow60={proceedToDrugs}
          />
        )}

        {step === NLSStep.DrugsAndAccess && (
          <DrugsStep
            vascularAccess={vascularAccess}
            adrenalineGiven={adrenalineGiven}
            volumeGiven={volumeGiven}
            considerFactors={considerFactors}
            onLogVascularAccess={logVascularAccess}
            onLogAdrenaline={logAdrenaline}
            onLogVolume={logVolume}
            onToggleFactor={(id) => setConsiderFactors(prev =>
              prev.map(c => c.id === id ? { ...c, done: !c.done } : c)
            )}
            onHRAbove60={stabilise}
          />
        )}

        {(step === NLSStep.Stabilised || step === NLSStep.Ended) && (
          <StabilisedStep
            postStabilisation={postStabilisation}
            onToggle={(id) => setPostStabilisation(prev =>
              prev.map(c => c.id === id ? { ...c, done: !c.done } : c)
            )}
            isEnded={step === NLSStep.Ended}
            onEnd={endResuscitation}
          />
        )}

        {/* SpO2 Targets Reference - always visible during resuscitation */}
        {isRunning && step !== NLSStep.Start && (
          <SpO2Reference />
        )}

        {/* Event Log */}
        {events.length > 0 && (
          <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-3">
            <h3 className="font-semibold text-gray-700 dark:text-gray-300">Event Log</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto font-mono text-sm">
              {events.map((event, i) => (
                <div key={i} className="flex">
                  <span className="font-bold w-16 flex-shrink-0 text-blue-500">
                    [{formatTime(event.timestamp)}]
                  </span>
                  <span className="ml-2 text-gray-800 dark:text-gray-200">{event.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      {isRunning && (
        <div className="fixed bottom-0 left-0 right-0 p-3 pb-[72px] bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 z-10">
          <div className="flex space-x-3">
            <NLSButton
              title="Summary"
              bgColor="bg-blue-600"
              onClick={() => setShowSummary(true)}
            />
            <NLSButton
              title="End"
              bgColor="bg-red-600"
              onClick={() => setShowConfirmEnd(true)}
            />
          </div>
        </div>
      )}

      {/* Summary Modal */}
      {showSummary && (
        <NLSModal title="NLS Event Summary" onClose={() => setShowSummary(false)}>
          <div className="space-y-4">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              Total Time: {formatTime(elapsedTime)}
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-700 rounded-lg font-mono text-sm">
              {[...events].reverse().map((e, i) => (
                <div key={i} className="flex">
                  <span className="font-bold w-16 flex-shrink-0 text-blue-500">[{formatTime(e.timestamp)}]</span>
                  <span className="ml-2 text-gray-800 dark:text-gray-200">{e.message}</span>
                </div>
              ))}
            </div>
            <NLSButton title="Copy to Clipboard" bgColor="bg-blue-600" onClick={() => { copySummary(); setShowSummary(false); }} />
          </div>
        </NLSModal>
      )}

      {/* Confirm End Modal */}
      {showConfirmEnd && (
        <NLSModal title="End Resuscitation?" onClose={() => setShowConfirmEnd(false)}>
          <div className="text-center space-y-4">
            <p className="text-gray-700 dark:text-gray-300">This will stop the timer and end the session.</p>
            <div className="flex space-x-3">
              <NLSButton title="Cancel" bgColor="bg-gray-400" onClick={() => setShowConfirmEnd(false)} />
              <NLSButton title="Copy & End" bgColor="bg-blue-600" onClick={() => { copySummary(); endResuscitation(); setShowConfirmEnd(false); }} />
              <NLSButton title="End" bgColor="bg-red-600" onClick={() => { endResuscitation(); setShowConfirmEnd(false); }} />
            </div>
          </div>
        </NLSModal>
      )}

      {/* Confirm Back Modal */}
      {showConfirmBack && (
        <NLSModal title="Leave NLS?" onClose={() => setShowConfirmBack(false)}>
          <div className="text-center space-y-4">
            <p className="text-gray-700 dark:text-gray-300">Resuscitation is still in progress. Are you sure?</p>
            <div className="flex space-x-3">
              <NLSButton title="Stay" bgColor="bg-gray-400" onClick={() => setShowConfirmBack(false)} />
              <NLSButton title="Leave" bgColor="bg-red-600" onClick={confirmBack} />
            </div>
          </div>
        </NLSModal>
      )}
    </div>
  );
};

// ============================================================================
// STEP COMPONENTS
// ============================================================================

const StartStep: React.FC<{ onStart: (type: NLSBirthType) => void }> = ({ onStart }) => (
  <div className="space-y-6">
    <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg text-center space-y-4">
      <Baby size={48} className="mx-auto text-blue-500" />
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Newborn Life Support</h2>
      <p className="text-gray-600 dark:text-gray-400">RCUK Guidelines 2025</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Select birth type to start the clock and begin guided resuscitation.
      </p>
    </div>
    <NLSButton
      title="Term / Near-term Birth"
      bgColor="bg-blue-600"
      height="h-16"
      fontSize="text-lg"
      onClick={() => onStart(NLSBirthType.Term)}
    />
    <NLSButton
      title="Preterm Birth (<32 weeks)"
      bgColor="bg-purple-600"
      height="h-16"
      fontSize="text-lg"
      onClick={() => onStart(NLSBirthType.Preterm)}
    />
  </div>
);

const InitialAssessmentStep: React.FC<{
  birthType: NLSBirthType;
  onComplete: () => void;
}> = ({ birthType, onComplete }) => (
  <div className="space-y-4">
    <StepCard
      title="Initial Assessment"
      subtitle="Approx 60 seconds"
      icon={<Activity size={24} className="text-blue-500" />}
    >
      <div className="space-y-3">
        <TaskItem label="Start clock / note time of birth" />
        {birthType === NLSBirthType.Preterm ? (
          <>
            <TaskItem label="Place undried body in plastic bag" highlight />
            <TaskItem label="Delay cord clamping" />
          </>
        ) : (
          <>
            <TaskItem label="Dry the baby" />
            <TaskItem label="Delay cord clamping if possible" />
          </>
        )}
        <TaskItem label="Stimulate" />
        <TaskItem label="Thermal care + radiant heat" />
        <TaskItem label="Keep baby warm" />
        <TaskItem label="Call for help if needed" />
        <TaskItem label="Apply SpO₂ ± ECG monitoring" />
      </div>
    </StepCard>
    <NLSButton
      title="Initial Assessment Complete →"
      bgColor="bg-green-600"
      height="h-14"
      onClick={onComplete}
    />
  </div>
);

const BreathingAssessmentStep: React.FC<{
  onAssess: (breathing: boolean) => void;
}> = ({ onAssess }) => (
  <div className="space-y-4">
    <StepCard
      title="Assess Breathing"
      icon={<Wind size={24} className="text-cyan-500" />}
    >
      <p className="text-gray-600 dark:text-gray-400">
        Is the baby making adequate respiratory effort?
      </p>
    </StepCard>
    <NLSButton
      title="Baby IS Breathing"
      bgColor="bg-green-600"
      height="h-14"
      onClick={() => onAssess(true)}
    />
    <NLSButton
      title="Baby NOT Breathing"
      bgColor="bg-red-600"
      height="h-14"
      onClick={() => onAssess(false)}
    />
  </div>
);

const CPAPStep: React.FC<{
  birthType: NLSBirthType;
  fio2: string;
  onFio2Change: (v: string) => void;
  onNotBreathing: () => void;
  onStabilised: () => void;
}> = ({ birthType, fio2, onFio2Change, onNotBreathing, onStabilised }) => (
  <div className="space-y-4">
    <StepCard
      title="CPAP"
      icon={<Wind size={24} className="text-green-500" />}
    >
      <div className="space-y-2">
        <p className="text-gray-700 dark:text-gray-300 font-semibold">CPAP 5-8 cm H₂O</p>
        <p className="text-gray-600 dark:text-gray-400">
          FiO₂: {birthType === NLSBirthType.Preterm ? '>30%' : '21% (air)'} — titrate to SpO₂ targets
        </p>
        <div className="flex items-center space-x-2 mt-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">FiO₂ %:</label>
          <input
            type="number"
            value={fio2}
            onChange={(e) => onFio2Change(e.target.value)}
            className="w-20 p-2 text-center border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded text-gray-900 dark:text-white"
          />
        </div>
      </div>
    </StepCard>
    <p className="text-center text-sm text-gray-500 dark:text-gray-400">
      Monitor breathing continuously. If breathing becomes inadequate:
    </p>
    <NLSButton
      title="Breathing Inadequate → Inflation Breaths"
      bgColor="bg-orange-500"
      height="h-14"
      onClick={onNotBreathing}
    />
    <NLSButton
      title="Baby Stabilised ✓"
      bgColor="bg-green-600"
      height="h-14"
      onClick={onStabilised}
    />
  </div>
);

const InflationBreathsStep: React.FC<{
  birthType: NLSBirthType;
  breathsGiven: number;
  onLogBreath: () => void;
  onProceed: () => void;
}> = ({ birthType, breathsGiven, onLogBreath, onProceed }) => (
  <div className="space-y-4">
    <StepCard
      title="Inflation Breaths"
      icon={<Wind size={24} className="text-orange-500" />}
    >
      <div className="space-y-2">
        <p className="text-gray-700 dark:text-gray-300 font-semibold">
          Give 5 inflation breaths at {birthType === NLSBirthType.Preterm ? '25' : '30'} cm H₂O
        </p>
        <p className="text-gray-600 dark:text-gray-400">
          FiO₂: {birthType === NLSBirthType.Preterm ? '>30%' : 'Air (21%)'}
        </p>
        {birthType === NLSBirthType.Preterm && (
          <p className="text-gray-600 dark:text-gray-400">PEEP 6 cm H₂O</p>
        )}
        <p className="text-gray-600 dark:text-gray-400">Look for chest rise with each breath</p>
      </div>
    </StepCard>

    <div className="flex items-center justify-center space-x-4">
      <span className="text-4xl font-bold text-gray-900 dark:text-white">{breathsGiven}/5</span>
      <NLSButton
        title="Log Breath"
        bgColor={breathsGiven >= 5 ? 'bg-gray-400' : 'bg-orange-500'}
        onClick={onLogBreath}
        disabled={breathsGiven >= 5}
        className="w-40"
      />
    </div>

    {breathsGiven >= 5 && (
      <NLSButton
        title="Reassess Heart Rate & Chest Rise →"
        bgColor="bg-blue-600"
        height="h-14"
        onClick={onProceed}
      />
    )}
  </div>
);

const ReassessStep: React.FC<{
  chestNotMovingChecks: Array<{ id: string; label: string; done: boolean }>;
  onToggleCheck: (id: string) => void;
  onChestMoving: () => void;
  onChestNotMoving: () => void;
  onRetryInflation: () => void;
  chestMoving: boolean | null;
}> = ({ chestNotMovingChecks, onToggleCheck, onChestMoving, onChestNotMoving, onRetryInflation, chestMoving }) => (
  <div className="space-y-4">
    <StepCard
      title="Reassess Heart Rate & Chest Rise"
      icon={<Heart size={24} className="text-red-500" />}
    >
      <p className="text-gray-600 dark:text-gray-400">Is the chest moving with ventilation?</p>
    </StepCard>

    {chestMoving === null && (
      <div className="grid grid-cols-2 gap-3">
        <NLSButton title="Chest Moving ✓" bgColor="bg-green-600" onClick={onChestMoving} />
        <NLSButton title="Chest NOT Moving" bgColor="bg-red-600" onClick={onChestNotMoving} />
      </div>
    )}

    {chestMoving === false && (
      <div className="space-y-3">
        <StepCard title="Chest Not Moving — Check:" icon={<AlertTriangle size={24} className="text-red-500" />}>
          <div className="space-y-2">
            {chestNotMovingChecks.map(check => (
              <button
                key={check.id}
                onClick={() => onToggleCheck(check.id)}
                className="flex items-center space-x-3 w-full text-left"
              >
                {check.done ? (
                  <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />
                ) : (
                  <Circle size={20} className="text-gray-400 flex-shrink-0" />
                )}
                <span className={`text-gray-800 dark:text-gray-200 ${check.done ? 'line-through' : ''}`}>
                  {check.label}
                </span>
              </button>
            ))}
          </div>
        </StepCard>
        <NLSButton
          title="Retry Inflation Breaths"
          bgColor="bg-orange-500"
          height="h-14"
          onClick={onRetryInflation}
        />
        <NLSButton
          title="Chest Now Moving ✓"
          bgColor="bg-green-600"
          height="h-14"
          onClick={onChestMoving}
        />
      </div>
    )}
  </div>
);

const VentilationStep: React.FC<{
  ventilationElapsed: number;
  is30sDue: boolean;
  heartRate: string;
  onHeartRateChange: (v: string) => void;
  onLogHR: () => void;
  onHRAbove60: () => void;
  onHRBelow60: () => void;
}> = ({ ventilationElapsed, is30sDue, heartRate, onHeartRateChange, onLogHR, onHRAbove60, onHRBelow60 }) => (
  <div className="space-y-4">
    <StepCard
      title="Ventilation Breaths"
      subtitle="Continue ventilation at ~30 breaths/min"
      icon={<Wind size={24} className="text-blue-500" />}
    >
      <div className="space-y-2">
        <p className="text-gray-600 dark:text-gray-400">
          Maintain chest movement with ventilation breaths. Reassess HR after 30 seconds.
        </p>
        <div className="text-center">
          <span className={`font-mono text-3xl font-bold ${is30sDue ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
            {formatTime(ventilationElapsed)}
          </span>
          <p className="text-xs text-gray-500">ventilation time</p>
        </div>
      </div>
    </StepCard>

    {is30sDue && (
      <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-xl border-2 border-red-500 space-y-3 animate-pulse">
        <h3 className="font-bold text-red-700 dark:text-red-300 text-center">
          ⚠️ 30 Seconds — Reassess Heart Rate
        </h3>
        <p className="text-center text-gray-700 dark:text-gray-300">
          If HR is still &lt;60 after effective ventilation for 30 seconds → start chest compressions
        </p>
      </div>
    )}

    <div className="flex items-center space-x-2">
      <input
        type="number"
        value={heartRate}
        onChange={(e) => onHeartRateChange(e.target.value)}
        placeholder="HR (bpm)"
        className="flex-grow p-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-xl text-gray-900 dark:text-white text-center text-lg"
      />
      <NLSButton title="Log HR" bgColor="bg-blue-600" onClick={onLogHR} disabled={!heartRate} className="w-28" />
    </div>

    <NLSButton
      title="HR ≥60 — Baby Stabilising ✓"
      bgColor="bg-green-600"
      height="h-14"
      onClick={onHRAbove60}
    />
    {is30sDue && (
      <NLSButton
        title="HR <60 → Start Chest Compressions"
        bgColor="bg-red-600"
        height="h-14"
        onClick={onHRBelow60}
      />
    )}
  </div>
);

const CompressionsStep: React.FC<{
  compressionCycles: number;
  onLogCycle: () => void;
  onHRAbove60: () => void;
  onHRStillBelow60: () => void;
}> = ({ compressionCycles, onLogCycle, onHRAbove60, onHRStillBelow60 }) => (
  <div className="space-y-4">
    <StepCard
      title="Chest Compressions"
      subtitle="3 compressions : 1 ventilation"
      icon={<Heart size={24} className="text-red-600" />}
    >
      <div className="space-y-2">
        <p className="text-gray-700 dark:text-gray-300 font-semibold">Synchronise 3:1 ratio</p>
        <p className="text-gray-600 dark:text-gray-400">Lower 1/3 of sternum, depth ~1/3 of chest AP diameter</p>
        <p className="text-gray-600 dark:text-gray-400">100% Oxygen</p>
        <p className="text-gray-600 dark:text-gray-400">
          15 cycles of 3 compressions : 1 ventilation, then reassess
        </p>
      </div>
    </StepCard>

    <div className="flex items-center justify-center space-x-4">
      <span className="text-3xl font-bold text-gray-900 dark:text-white">Cycles: {compressionCycles}</span>
      <NLSButton title="Log Cycle" bgColor="bg-red-600" onClick={onLogCycle} className="w-32" />
    </div>

    <NLSButton
      title="HR ≥60 — Baby Stabilising ✓"
      bgColor="bg-green-600"
      height="h-14"
      onClick={onHRAbove60}
    />
    <NLSButton
      title="HR Remains <60 → Consider Drugs"
      bgColor="bg-orange-600"
      height="h-14"
      onClick={onHRStillBelow60}
    />
  </div>
);

const DrugsStep: React.FC<{
  vascularAccess: boolean;
  adrenalineGiven: number;
  volumeGiven: boolean;
  considerFactors: Array<{ id: string; label: string; done: boolean }>;
  onLogVascularAccess: () => void;
  onLogAdrenaline: () => void;
  onLogVolume: () => void;
  onToggleFactor: (id: string) => void;
  onHRAbove60: () => void;
}> = ({ vascularAccess, adrenalineGiven, volumeGiven, considerFactors, onLogVascularAccess, onLogAdrenaline, onLogVolume, onToggleFactor, onHRAbove60 }) => (
  <div className="space-y-4">
    <StepCard
      title="Drugs & Vascular Access"
      subtitle="HR remains <60 bpm"
      icon={<Syringe size={24} className="text-purple-600" />}
    >
      <div className="space-y-2">
        <p className="text-gray-600 dark:text-gray-400">Continue chest compressions while obtaining access and giving drugs.</p>
      </div>
    </StepCard>

    <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-3">
      <h3 className="font-semibold text-gray-700 dark:text-gray-300">Interventions</h3>
      <NLSButton
        title={vascularAccess ? "Vascular Access ✓" : "Log Vascular Access (UVC/IO)"}
        bgColor={vascularAccess ? 'bg-green-600' : 'bg-blue-600'}
        onClick={onLogVascularAccess}
        disabled={vascularAccess}
      />
      <NLSButton
        title={`Adrenaline (10-30 mcg/kg IV) — Dose ${adrenalineGiven + 1}`}
        bgColor="bg-pink-600"
        onClick={onLogAdrenaline}
      />
      <NLSButton
        title={volumeGiven ? "Volume Given ✓" : "Give Volume (10ml/kg 0.9% NaCl)"}
        bgColor={volumeGiven ? 'bg-green-600' : 'bg-indigo-600'}
        onClick={onLogVolume}
        disabled={volumeGiven}
      />
    </div>

    <StepCard title="Consider Other Factors" icon={<AlertTriangle size={24} className="text-orange-500" />}>
      <div className="space-y-2">
        {considerFactors.map(f => (
          <button
            key={f.id}
            onClick={() => onToggleFactor(f.id)}
            className="flex items-center space-x-3 w-full text-left"
          >
            {f.done ? (
              <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />
            ) : (
              <Circle size={20} className="text-gray-400 flex-shrink-0" />
            )}
            <span className={`text-gray-800 dark:text-gray-200 ${f.done ? 'line-through' : ''}`}>
              {f.label}
            </span>
          </button>
        ))}
      </div>
    </StepCard>

    <NLSButton
      title="HR ≥60 — Baby Stabilising ✓"
      bgColor="bg-green-600"
      height="h-14"
      onClick={onHRAbove60}
    />
  </div>
);

const StabilisedStep: React.FC<{
  postStabilisation: Array<{ id: string; label: string; done: boolean }>;
  onToggle: (id: string) => void;
  isEnded: boolean;
  onEnd: () => void;
}> = ({ postStabilisation, onToggle, isEnded, onEnd }) => (
  <div className="space-y-4">
    <div className="p-6 bg-green-100 dark:bg-green-900/30 rounded-xl text-center space-y-2">
      <CheckCircle2 size={48} className="mx-auto text-green-600" />
      <h2 className="text-2xl font-bold text-green-800 dark:text-green-300">
        {isEnded ? 'Resuscitation Complete' : 'Baby Stabilised'}
      </h2>
    </div>

    <StepCard title="Post-stabilisation Tasks" icon={<Clipboard size={24} className="text-blue-500" />}>
      <div className="space-y-2">
        {postStabilisation.map(task => (
          <button
            key={task.id}
            onClick={() => onToggle(task.id)}
            className="flex items-center space-x-3 w-full text-left"
          >
            {task.done ? (
              <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />
            ) : (
              <Circle size={20} className="text-gray-400 flex-shrink-0" />
            )}
            <span className={`text-gray-800 dark:text-gray-200 ${task.done ? 'line-through' : ''}`}>
              {task.label}
            </span>
          </button>
        ))}
      </div>
    </StepCard>

    {!isEnded && (
      <NLSButton
        title="End Resuscitation"
        bgColor="bg-red-600"
        height="h-14"
        onClick={onEnd}
      />
    )}
  </div>
);

// ============================================================================
// SHARED NLS UI COMPONENTS
// ============================================================================

const SpO2Reference: React.FC = () => (
  <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-2">
    <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-center">
      Acceptable Pre-ductal SpO₂
    </h3>
    <div className="grid grid-cols-2 gap-2 text-sm">
      {getSpO2Targets().map(t => (
        <div key={t.time} className="flex justify-between px-3 py-1 bg-gray-50 dark:bg-gray-700 rounded">
          <span className="text-gray-600 dark:text-gray-400">{t.time}</span>
          <span className="font-semibold text-gray-900 dark:text-white">{t.target}</span>
        </div>
      ))}
    </div>
  </div>
);

const StepCard: React.FC<{
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, icon, children }) => (
  <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-3">
    <div className="flex items-center space-x-3">
      {icon}
      <div>
        <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
    </div>
    {children}
  </div>
);

const TaskItem: React.FC<{ label: string; highlight?: boolean }> = ({ label, highlight }) => (
  <div className="flex items-center space-x-2">
    <ChevronRight size={16} className={highlight ? 'text-purple-500' : 'text-gray-400'} />
    <span className={`text-sm ${highlight ? 'font-semibold text-purple-700 dark:text-purple-300' : 'text-gray-700 dark:text-gray-300'}`}>
      {label}
    </span>
  </div>
);

const NLSButton: React.FC<{
  title: string;
  bgColor: string;
  height?: string;
  fontSize?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}> = ({ title, bgColor, height = 'h-12', fontSize = 'text-base', onClick, disabled = false, className = '' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`
      flex items-center justify-center w-full px-4 rounded-xl 
      font-semibold text-white shadow-md
      transition-all duration-150 ease-in-out
      active:scale-95 active:shadow-inner
      disabled:opacity-40 disabled:cursor-not-allowed
      ${height} ${fontSize} ${bgColor} ${className}
    `}
  >
    {title}
  </button>
);

const NLSModal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <XSquare size={24} />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  </div>
);

export default NewbornLifeSupport;
