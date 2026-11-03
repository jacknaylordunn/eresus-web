// Push-to-talk speech recognition for voice commands. Recognition must run on the device: Chrome 139+
// supports this with processLocally once the language pack is installed. Where that isn't possible we
// report voice commands as unavailable rather than letting the browser send audio to a server.
import { VOICE_VOCABULARY } from "@/lib/voiceCommands";

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

export class VoiceCommandListener {
  private recognition: LocalSpeechRecognition | null = null;
  private transcript = "";
  private onFinish: ((transcript: string) => void) | null = null;
  private finishTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private onTranscriptChange: (transcript: string) => void) {}

  get isListening() {
    return this.recognition !== null;
  }

  start(): boolean {
    const Recognition = recognitionClass();
    if (!Recognition || this.recognition) return false;

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

    this.transcript = "";
    recognition.onresult = (event: any) => {
      this.transcript = Array.from(event.results as ArrayLike<any>)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      this.onTranscriptChange(this.transcript);
    };
    recognition.onerror = () => this.finish();
    recognition.onend = () => this.finish();

    try {
      recognition.start();
    } catch {
      return false;
    }
    this.recognition = recognition;
    return true;
  }

  // Called when the button is released; the final words arrive shortly after.
  stop(onFinish: (transcript: string) => void) {
    if (!this.recognition) return;
    this.onFinish = onFinish;
    this.recognition.stop();
    // Don't wait indefinitely if the recogniser never ends cleanly.
    this.finishTimer = setTimeout(() => this.finish(), 1500);
  }

  private finish() {
    if (!this.recognition) return;
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.finishTimer = null;
    this.recognition.onresult = null;
    this.recognition.onerror = null;
    this.recognition.onend = null;
    this.recognition.abort();
    this.recognition = null;
    const callback = this.onFinish;
    this.onFinish = null;
    callback?.(this.transcript);
  }
}
