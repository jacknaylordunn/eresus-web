import React, { useEffect, useRef, useState } from "react";
import { AudioWaveform, Mic } from "lucide-react";
import { checkVoiceCommandAvailability, VoiceCommandListener } from "@/utils/voiceCommandListener";

// Hold to speak a command; release to act on it. Only shown when voice commands are switched on
// and the browser can recognise speech on the device.
const VoiceCommandButton: React.FC<{ enabled: boolean; onTranscript: (transcript: string) => void; className?: string }> = ({
  enabled,
  onTranscript,
  className = "",
}) => {
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState("");
  const listenerRef = useRef<VoiceCommandListener | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    checkVoiceCommandAvailability().then((status) => {
      if (!cancelled) setAvailable(status === "available");
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled || !available) return null;

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    if (listening) return;
    listenerRef.current ??= new VoiceCommandListener(setLiveText);
    setLiveText("");
    if (listenerRef.current.start()) {
      setListening(true);
      navigator.vibrate?.(15);
    }
  };

  const stop = () => {
    if (!listening) return;
    listenerRef.current?.stop((transcript) => {
      setListening(false);
      setLiveText("");
      onTranscript(transcript);
    });
  };

  return (
    <div className={`absolute flex flex-col items-end gap-1 ${className}`}>
      <button
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Hold to speak a command"
        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all select-none touch-none
        ${listening ? "bg-tone-danger text-tone-on-danger scale-110" : "bg-white dark:bg-gray-700 text-tone-accent"}`}
      >
        {listening ? <AudioWaveform size={26} /> : <Mic size={26} />}
      </button>
      {listening && liveText && (
        <span className="max-w-[10rem] px-2 py-1 rounded-lg bg-card text-xs text-foreground shadow">{liveText}</span>
      )}
    </div>
  );
};

export default VoiceCommandButton;
