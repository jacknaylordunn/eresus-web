// Spoken prompts. Order is priority: when several fall due together they play in this order.
// File names and wording must match the iOS app (Resources/VoicePrompts) so both apps sound the same.
export const VOICE_PROMPTS = [
  "rhythm_check_due",
  "reassess_newborn",
  "prepare_rhythm_check",
  "adrenaline_due",
  "consider_adrenaline",
  "consider_amiodarone",
  "consider_amiodarone_second",
  "consider_lidocaine_second",
] as const;

export type VoicePrompt = (typeof VOICE_PROMPTS)[number];

export const VOICE_PROMPT_TEXT: Record<VoicePrompt, string> = {
  rhythm_check_due: "Rhythm check due.",
  reassess_newborn: "Reassess heart rate and chest rise.",
  prepare_rhythm_check: "Prepare for rhythm check.",
  adrenaline_due: "Adrenaline due.",
  consider_adrenaline: "Consider adrenaline.",
  consider_amiodarone: "Consider amiodarone.",
  consider_amiodarone_second: "Consider second dose of amiodarone.",
  consider_lidocaine_second: "Consider second dose of lidocaine.",
};

type Listener = (mutedForCase: boolean) => void;

class VoicePromptPlayer {
  private context: AudioContext | null = null;
  private buffers = new Map<VoicePrompt, AudioBuffer>();
  private queue: VoicePrompt[] = [];
  private current: AudioScheduledSourceNode | null = null;
  private toneOnly = false;
  private listeners = new Set<Listener>();
  private _mutedForCase = false;

  get mutedForCase() {
    return this._mutedForCase;
  }

  // Quick mute from the arrest screen; cleared when the next arrest starts.
  setMutedForCase(muted: boolean) {
    this._mutedForCase = muted;
    if (muted) this.stopAll();
    this.listeners.forEach((listener) => listener(muted));
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Browsers only allow audio after a user gesture, so call this from a tap such as Start Arrest.
  unlock() {
    try {
      // iOS Safari otherwise silences Web Audio when the ring/silent switch is on.
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = "playback";

      if (!this.context) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.context = new AudioContextClass();
      }
      if (this.context.state === "suspended") void this.context.resume();
      void this.loadClips();
    } catch {
      // No audio available; the on-screen prompts still work.
    }
  }

  play(prompt: VoicePrompt, toneOnly: boolean) {
    if (this._mutedForCase || !this.context || this.queue.includes(prompt)) return;
    this.toneOnly = toneOnly;

    const wasIdle = this.queue.length === 0 && this.current === null;
    this.queue.push(prompt);
    // One chime per burst, so simultaneous prompts don't each get their own tone.
    if (wasIdle) this.playChimeThenNext();
  }

  stopAll() {
    this.queue = [];
    const current = this.current;
    this.current = null;
    if (current) {
      current.onended = null;
      try {
        current.stop();
      } catch {
        // Already finished.
      }
    }
  }

  private async loadClips() {
    const context = this.context;
    if (!context) return;
    await Promise.all(
      VOICE_PROMPTS.filter((prompt) => !this.buffers.has(prompt)).map(async (prompt) => {
        try {
          const response = await fetch(`/audio/prompts/${prompt}.mp3`);
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          this.buffers.set(prompt, buffer);
        } catch {
          // Missing clip: that prompt falls back to the chime alone.
        }
      }),
    );
  }

  // Two soft rising notes, similar to a defibrillator's attention tone.
  private playChimeThenNext() {
    const context = this.context;
    if (!context) return;
    const start = context.currentTime;
    const notes = [
      { frequency: 660, offset: 0, duration: 0.14 },
      { frequency: 880, offset: 0.14, duration: 0.22 },
    ];
    let last: OscillatorNode | null = null;
    for (const note of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = note.frequency;
      gain.gain.setValueAtTime(0.0001, start + note.offset);
      gain.gain.exponentialRampToValueAtTime(0.5, start + note.offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.offset + note.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + note.offset);
      oscillator.stop(start + note.offset + note.duration);
      last = oscillator;
    }
    if (last) {
      this.current = last;
      last.onended = () => this.playNext();
    }
  }

  private playNext() {
    const context = this.context;
    const prompt = this.queue.shift();
    if (!context || !prompt) {
      this.current = null;
      return;
    }
    const buffer = this.buffers.get(prompt);
    if (this.toneOnly || !buffer) {
      this.playNext();
      return;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => this.playNext();
    this.current = source;
    source.start();
  }
}

export const voicePromptPlayer = new VoicePromptPlayer();
