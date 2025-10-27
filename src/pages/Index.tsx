import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  Heart, 
  HeartPulse, 
  Play, 
  StopCircle, 
  Zap, 
  Syringe, 
  Activity,
  Clock,
  CheckCircle
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { getDeviceId } from '@/lib/device';
import { TimeFormatter } from '@/utils/time';
import { HapticManager } from '@/utils/haptics';
import { toast } from 'sonner';
import { 
  ArrestState, 
  UIState, 
  EventType, 
  PatientAgeCategory,
  type EventLog 
} from '@/types/arrest';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

const CPR_CYCLE_DURATION = 120; // 2 minutes
const ADRENALINE_INTERVAL = 240; // 4 minutes

const Index = () => {
  const [arrestState, setArrestState] = useState<ArrestState>(ArrestState.Pending);
  const [uiState, setUiState] = useState<UIState>(UIState.Default);
  const [masterTime, setMasterTime] = useState(0);
  const [cprTime, setCprTime] = useState(CPR_CYCLE_DURATION);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [shockCount, setShockCount] = useState(0);
  const [adrenalineCount, setAdrenalineCount] = useState(0);
  const [lastAdrenalineTime, setLastAdrenalineTime] = useState<number | null>(null);
  const [cprCycleStartTime, setCprCycleStartTime] = useState(0);
  
  const timerRef = useRef<number | null>(null);
  const deviceId = getDeviceId();
  const totalArrestTime = masterTime;

  const timeUntilAdrenaline = lastAdrenalineTime !== null 
    ? ADRENALINE_INTERVAL - (totalArrestTime - lastAdrenalineTime)
    : null;

  // Timer logic
  const tick = () => {
    if (!startTime) return;
    const newMasterTime = Math.floor((Date.now() - startTime) / 1000);
    setMasterTime(newMasterTime);

    if (arrestState === ArrestState.Active && uiState === UIState.Default) {
      const newCprTime = CPR_CYCLE_DURATION - (newMasterTime - cprCycleStartTime);
      
      if (newCprTime <= 10 && newCprTime > 0) {
        HapticManager.impact('light');
      }
      
      if (newCprTime < 0) {
        HapticManager.notification('warning');
        logEvent("CPR Cycle Complete", EventType.Cpr);
        setCprCycleStartTime(newMasterTime);
        setCprTime(CPR_CYCLE_DURATION);
      } else {
        setCprTime(newCprTime);
      }
    }
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(tick, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if ((arrestState === ArrestState.Active || arrestState === ArrestState.Rosc) && !timerRef.current) {
      startTimer();
    } else if ((arrestState === ArrestState.Pending || arrestState === ArrestState.Ended) && timerRef.current) {
      stopTimer();
    }
    return () => stopTimer();
  }, [arrestState]);

  // Firebase sync
  const saveStateToDb = async (updates: any) => {
    if (!db) return;
    
    try {
      const docRef = doc(db, 'artifacts', 'eresus-web-app', 'users', deviceId, 'arrestLogs', 'arrest_log');
      await setDoc(docRef, {
        ...updates,
        lastUpdated: Date.now()
      }, { merge: true });
    } catch (error) {
      console.error("Error saving state:", error);
    }
  };

  const logEvent = (message: string, type: EventType) => {
    const newEvent: EventLog = {
      id: crypto.randomUUID(),
      timestamp: totalArrestTime,
      message,
      type
    };
    
    const updatedEvents = [newEvent, ...events];
    setEvents(updatedEvents);
    saveStateToDb({ events: updatedEvents });
    HapticManager.impact();
    
    toast(message, {
      description: `At ${TimeFormatter.format(totalArrestTime)}`,
    });
  };

  // Arrest actions
  const startArrest = () => {
    const now = Date.now();
    setStartTime(now);
    setArrestState(ArrestState.Active);
    setCprCycleStartTime(0);
    setCprTime(CPR_CYCLE_DURATION);
    logEvent(`Arrest Started at ${new Date(now).toLocaleTimeString()}`, EventType.Status);
    saveStateToDb({ 
      startTime: now, 
      arrestState: ArrestState.Active,
      cprCycleStartTime: 0
    });
  };

  const analyseRhythm = () => {
    setUiState(UIState.Analyzing);
    logEvent("Rhythm analysis. Pausing CPR.", EventType.Analysis);
    saveStateToDb({ uiState: UIState.Analyzing });
  };

  const logShockableRhythm = () => {
    setUiState(UIState.ShockAdvised);
    logEvent("Rhythm is Shockable (VF/pVT)", EventType.Rhythm);
    saveStateToDb({ uiState: UIState.ShockAdvised });
  };

  const logNonShockableRhythm = () => {
    logEvent("Rhythm is Non-Shockable (Asystole/PEA)", EventType.Rhythm);
    resumeCPR();
  };

  const deliverShock = () => {
    const newShockCount = shockCount + 1;
    setShockCount(newShockCount);
    logEvent(`Shock ${newShockCount} Delivered`, EventType.Shock);
    saveStateToDb({ shockCount: newShockCount });
    resumeCPR();
  };

  const resumeCPR = () => {
    setUiState(UIState.Default);
    const newCycleStartTime = totalArrestTime;
    setCprCycleStartTime(newCycleStartTime);
    setCprTime(CPR_CYCLE_DURATION);
    logEvent("Resuming CPR", EventType.Cpr);
    saveStateToDb({ uiState: UIState.Default, cprCycleStartTime: newCycleStartTime });
  };

  const logAdrenaline = () => {
    const newAdrenalineCount = adrenalineCount + 1;
    setAdrenalineCount(newAdrenalineCount);
    setLastAdrenalineTime(totalArrestTime);
    logEvent(`Adrenaline Given - Dose ${newAdrenalineCount}`, EventType.Drug);
    saveStateToDb({ 
      adrenalineCount: newAdrenalineCount,
      lastAdrenalineTime: totalArrestTime
    });
  };

  const achieveROSC = () => {
    setArrestState(ArrestState.Rosc);
    setUiState(UIState.Default);
    logEvent("Return of Spontaneous Circulation (ROSC)", EventType.Status);
    saveStateToDb({ arrestState: ArrestState.Rosc, uiState: UIState.Default });
  };

  const endArrest = () => {
    setArrestState(ArrestState.Ended);
    stopTimer();
    logEvent("Arrest Ended (Patient Deceased)", EventType.Status);
    saveStateToDb({ arrestState: ArrestState.Ended });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <HeartPulse className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">eResus</h1>
          </div>
          <p className="text-sm text-muted-foreground">Cardiac Arrest Clinical Scribe</p>
        </div>

        {/* Main Timer Display */}
        <Card className="p-6 text-center">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Total Arrest Time</div>
            <div className="text-6xl font-bold font-mono">{TimeFormatter.format(totalArrestTime)}</div>
            <div className="text-sm text-muted-foreground">
              {arrestState === ArrestState.Pending && "Ready to start"}
              {arrestState === ArrestState.Active && "Arrest in progress"}
              {arrestState === ArrestState.Rosc && "ROSC achieved"}
              {arrestState === ArrestState.Ended && "Arrest ended"}
            </div>
          </div>
        </Card>

        {/* CPR Cycle Timer */}
        {arrestState === ArrestState.Active && uiState === UIState.Default && (
          <Card className="p-4 bg-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <span className="font-semibold">CPR Cycle</span>
              </div>
              <div className={`text-2xl font-mono font-bold ${cprTime <= 10 ? 'text-emergency-warning' : ''}`}>
                {TimeFormatter.format(cprTime)}
              </div>
            </div>
          </Card>
        )}

        {/* Adrenaline Reminder */}
        {timeUntilAdrenaline !== null && timeUntilAdrenaline <= 0 && arrestState === ArrestState.Active && (
          <Card className="p-4 bg-emergency-warning/10 border-emergency-warning">
            <div className="flex items-center gap-2 text-emergency-warning">
              <Clock className="h-5 w-5" />
              <span className="font-semibold">Adrenaline Due</span>
            </div>
          </Card>
        )}

        {/* Main Actions */}
        {arrestState === ArrestState.Pending && (
          <Button 
            onClick={startArrest}
            size="lg" 
            className="w-full h-16 text-lg"
          >
            <Play className="mr-2 h-6 w-6" />
            Start Arrest
          </Button>
        )}

        {arrestState === ArrestState.Active && (
          <div className="grid gap-3">
            {uiState === UIState.Default && (
              <>
                <Button 
                  onClick={analyseRhythm}
                  size="lg"
                  variant="secondary"
                  className="w-full h-14"
                >
                  <Activity className="mr-2 h-5 w-5" />
                  Analyse Rhythm
                </Button>

                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    onClick={logAdrenaline}
                    variant="outline"
                    className="h-14"
                  >
                    <Syringe className="mr-2 h-5 w-5" />
                    Adrenaline ({adrenalineCount})
                  </Button>

                  <Button 
                    onClick={achieveROSC}
                    variant="default"
                    className="h-14 bg-status-rosc hover:bg-status-rosc/90"
                  >
                    <CheckCircle className="mr-2 h-5 w-5" />
                    ROSC
                  </Button>
                </div>

                <Button 
                  onClick={endArrest}
                  variant="destructive"
                  className="w-full"
                >
                  <StopCircle className="mr-2 h-5 w-5" />
                  End Arrest
                </Button>
              </>
            )}

            {uiState === UIState.Analyzing && (
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  onClick={logShockableRhythm}
                  size="lg"
                  className="h-16 bg-status-shockable hover:bg-status-shockable/90"
                >
                  Shockable
                </Button>
                <Button 
                  onClick={logNonShockableRhythm}
                  size="lg"
                  variant="destructive"
                  className="h-16"
                >
                  Non-Shockable
                </Button>
              </div>
            )}

            {uiState === UIState.ShockAdvised && (
              <Button 
                onClick={deliverShock}
                size="lg"
                className="w-full h-16 text-lg bg-emergency-critical hover:bg-emergency-critical/90"
              >
                <Zap className="mr-2 h-6 w-6" />
                Deliver Shock ({shockCount + 1})
              </Button>
            )}
          </div>
        )}

        {/* Statistics */}
        <Card className="p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{shockCount}</div>
              <div className="text-xs text-muted-foreground">Shocks</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{adrenalineCount}</div>
              <div className="text-xs text-muted-foreground">Adrenaline</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{events.length}</div>
              <div className="text-xs text-muted-foreground">Events</div>
            </div>
          </div>
        </Card>

        {/* Event Log */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Event Log
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No events recorded yet</p>
            ) : (
              events.map((event) => (
                <div 
                  key={event.id} 
                  className="text-sm p-2 rounded bg-muted/50 flex justify-between items-start"
                >
                  <span>{event.message}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {TimeFormatter.format(event.timestamp)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Index;
