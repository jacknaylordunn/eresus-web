import React, { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { voicePromptPlayer } from "@/utils/voicePrompts";

// Mirrors the metronome button: filled when prompts are audible, plain when muted for this case.
// Used on both the adult and newborn screens; position it with the parent's `relative` container.
const VoicePromptButton: React.FC<{ enabled: boolean; className?: string }> = ({ enabled, className = "" }) => {
  const [muted, setMuted] = useState(voicePromptPlayer.mutedForCase);

  useEffect(() => voicePromptPlayer.subscribe(setMuted), []);

  if (!enabled) return null;
  const isOn = !muted;
  return (
    <button
      onClick={() => {
        voicePromptPlayer.unlock();
        voicePromptPlayer.setMutedForCase(isOn);
      }}
      aria-label={isOn ? "Mute spoken prompts" : "Unmute spoken prompts"}
      className={`absolute w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors
      ${isOn ? "bg-tone-accent text-tone-on-accent" : "bg-white dark:bg-gray-700 text-tone-accent"} ${className}`}
    >
      {isOn ? <Volume2 size={24} /> : <VolumeX size={24} />}
    </button>
  );
};

export default VoicePromptButton;
