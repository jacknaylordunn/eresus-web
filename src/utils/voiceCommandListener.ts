// Speech capture for voice commands. What was said is turned into actions by parseVoiceCommand.
// Two ways in:
// - push-to-talk: hold the CPR ring, speak, let go;
// - hands-free: say the wake word ("Scribe" or "eResus") then the command, and it acts after a short pause.
// Recognition must run on the device: Chrome 139+ supports this with processLocally once the language
// pack is installed. Where that isn't possible we report voice commands as unavailable rather than
// letting the browser send audio to a server. Hands-free only listens while an adult arrest is active.
import { afterWakeWord, VOICE_VOCABULARY, type WakeWord } from "@/lib/voiceCommands";

const LANG = "en-GB";

type Availability = "available" | "downloadable" | "downloading" | "unavailable";

// The on-device parts of the Web Speech API are newer than the TypeScript DOM types.
interface LocalSpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  processLocally: boolean;
  phrases?: unknown;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

interface LocalSpeechRecognitionClass {
  new (): LocalSpeechRecognition;
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<Availability>;
  install?: (options: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
}

const recognitionClass = (): LocalSpeechRecognitionClass | null => {
  const w = window as unknown as {
    SpeechRecognition?: LocalSpeechRecognitionClass;
    webkitSpeechRecognition?: LocalSpeechRecognitionClass;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

// Without processLocally support (Safari, Firefox, older Chrome) there's no way to keep audio on the device.
export const checkVoiceCommandAvailability = async (): Promise<Availability> => {
  const Recognition = recognitionClass();
  if (!Recognition?.available) return "unavailable";
  try {
    return await Recognition.available({ langs: [LANG], processLocally: true });
  } catch {
    return "unavailable";
  }
};

// Downloads the on-device language pack. Must be called from a tap.
export const installVoiceCommandLanguage = async (): Promise<boolean> => {
  const Recognition = recognitionClass();
  if (!Recognition?.install) return false;
  try {
    return await Recognition.install({ langs: [LANG], processLocally: true });
  } catch {
    return false;
  }
};

export interface VoiceListenerState {
  isPushToTalkActive: boolean;
  isHandsFreeActive: boolean;
  transcript: string;
  // Hands-free: the wake word has been heard and the command is being collected.
  heardWakeWord: boolean;
}

class VoiceCommandListener {
  private state: VoiceListenerState = { isPushToTalkActive: false, isHandsFreeActive: false, transcript: "", heardWakeWord: false };
  private listeners = new Set<() => void>();

  private recognition: LocalSpeechRecognition | null = null;
  private onPushToTalkFinish: ((transcript: string) => void) | null = null;
  private finishTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeWord: WakeWord = "scribe";
  private onHandsFreeCommand: ((command: string) => void) | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCommand = "";

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  private update(changes: Partial<VoiceListenerState>) {
    this.state = { ...this.state, ...changes };
    this.listeners.forEach((listener) => listener());
  }

  // Push-to-talk

  startPushToTalk(): boolean {
    if (this.state.isPushToTalkActive) return false;
    this.pauseHandsFree();
    this.update({ transcript: "" });
    const started = this.startRecognition(
      (text) => this.update({ transcript: text }),
      () => this.finishPushToTalk(),
    );
    if (!started) {
      this.resumeHandsFree();
      return false;
    }
    this.update({ isPushToTalkActive: true });
    return true;
  }

  // Called when the ring is released; the final words arrive shortly after.
  stopPushToTalk(onFinish: (transcript: string) => void) {
    if (!this.state.isPushToTalkActive) return;
    this.onPushToTalkFinish = onFinish;
    this.recognition?.stop();
    // Don't wait indefinitely if the recogniser never ends cleanly.
    this.finishTimer = setTimeout(() => this.finishPushToTalk(), 1500);
  }

  private finishPushToTalk() {
    if (!this.state.isPushToTalkActive) return;
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.finishTimer = null;
    const heard = this.state.transcript;
    this.update({ isPushToTalkActive: false });
    this.stopRecognition();
    const callback = this.onPushToTalkFinish;
    this.onPushToTalkFinish = null;
    callback?.(heard);
    this.resumeHandsFree();
  }

  // Hands-free

  startHandsFree(wakeWord: WakeWord, onCommand: (command: string) => void) {
    this.onHandsFreeCommand = onCommand;
    if (this.state.isHandsFreeActive && wakeWord === this.wakeWord) return;
    this.wakeWord = wakeWord;
    if (this.state.isHandsFreeActive) {
      this.pauseHandsFree();
    } else {
      this.update({ isHandsFreeActive: true });
    }
    if (!this.state.isPushToTalkActive) this.beginHandsFreeSession();
  }

  stopHandsFree() {
    if (!this.state.isHandsFreeActive) return;
    this.update({ isHandsFreeActive: false });
    this.onHandsFreeCommand = null;
    this.resetHandsFreeState();
    if (!this.state.isPushToTalkActive) this.stopRecognition();
  }

  private pauseHandsFree() {
    if (!this.state.isHandsFreeActive) return;
    this.resetHandsFreeState();
    this.stopRecognition();
  }

  private resumeHandsFree() {
    if (!this.state.isHandsFreeActive || this.state.isPushToTalkActive) return;
    this.beginHandsFreeSession();
  }

  private beginHandsFreeSession() {
    this.resetHandsFreeState();
    const started = this.startRecognition(
      (text) => this.handleHandsFree(text),
      () => {
        // Chrome ends continuous recognition after silence; start listening again.
        if (this.state.heardWakeWord) {
          this.deliverHandsFreeCommand();
        } else {
          this.stopRecognition();
          this.resumeHandsFree();
        }
      },
    );
    // Try again shortly if it couldn't start (e.g. the microphone was busy); otherwise keep each
    // session short so the transcript never grows long.
    this.restartTimer = setTimeout(
      () => {
        if (this.state.heardWakeWord) return;
        this.stopRecognition();
        this.resumeHandsFree();
      },
      started ? 45_000 : 2_000,
    );
  }

  private handleHandsFree(text: string) {
    this.update({ transcript: text });
    const command = afterWakeWord(text, this.wakeWord);
    if (command === null) return;
    this.pendingCommand = command;
    if (!this.state.heardWakeWord) this.update({ heardWakeWord: true });
    // Act once the speaker pauses; a longer wait if nothing has followed the wake word yet.
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this.deliverHandsFreeCommand(), command ? 1200 : 4000);
  }

  private deliverHandsFreeCommand() {
    const command = this.pendingCommand;
    this.stopRecognition();
    this.resetHandsFreeState();
    if (command) this.onHandsFreeCommand?.(command);
    this.resumeHandsFree();
  }

  private resetHandsFreeState() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.silenceTimer = null;
    this.restartTimer = null;
    this.pendingCommand = "";
    if (this.state.heardWakeWord) this.update({ heardWakeWord: false });
  }

  // Recognition

  private startRecognition(onText: (text: string) => void, onEnd: () => void): boolean {
    const Recognition = recognitionClass();
    if (!Recognition) return false;
    this.stopRecognition();

    const recognition = new Recognition();
    recognition.lang = LANG;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.processLocally = true;
    // Contextual biasing where supported; ignored elsewhere.
    try {
      const Phrase = (window as unknown as { SpeechRecognitionPhrase?: new (p: string, boost: number) => unknown })
        .SpeechRecognitionPhrase;
      if (Phrase) recognition.phrases = VOICE_VOCABULARY.map((p) => new Phrase(p, 5));
    } catch {
      // Not supported; recognition still works.
    }

    recognition.onresult = (event: any) => {
      const text = Array.from(event.results as ArrayLike<any>)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      onText(text);
    };
    recognition.onerror = () => onEnd();
    recognition.onend = () => onEnd();

    try {
      recognition.start();
    } catch {
      return false;
    }
    this.recognition = recognition;
    return true;
  }

  private stopRecognition() {
    const recognition = this.recognition;
    if (!recognition) return;
    this.recognition = null;
    // Detach first so a late result or end from this session is ignored.
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.abort();
  }
}

export const voiceCommandListener = new VoiceCommandListener();
