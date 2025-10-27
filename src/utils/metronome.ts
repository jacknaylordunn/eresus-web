export class MetronomeManager {
  private audioContext: AudioContext | null = null;
  private timer: number | null = null;
  private isPlaying = false;
  private bpm = 110;

  private setupAudioContext() {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.error("Web Audio API is not supported in this browser");
      }
    }
  }

  private playBeep() {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime);

    gainNode.gain.setValueAtTime(0.5, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + 0.1);
  }

  setBPM(newBpm: number) {
    this.bpm = newBpm;
    if (this.isPlaying) {
      this.stop();
      this.start();
    }
  }

  start() {
    if (this.isPlaying) return;
    this.setupAudioContext();
    if (!this.audioContext) return;
    if (this.audioContext.state === 'suspended') this.audioContext.resume();

    const interval = 60000 / this.bpm;
    this.timer = window.setInterval(() => this.playBeep(), interval);
    this.isPlaying = true;
    this.playBeep();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.isPlaying = false;
  }

  toggle(bpm: number): boolean {
    if (this.isPlaying) {
      this.stop();
      return false;
    } else {
      this.setBPM(bpm);
      this.start();
      return true;
    }
  }
}

export const metronome = new MetronomeManager();
