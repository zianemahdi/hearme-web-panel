// Web Audio API emergency siren synthesizer for HearMe
class SirenPlayer {
  private ctx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private intervalId: number | null = null;
  private isPlaying: boolean = false;

  public start(volume: number = 0.4) {
    if (this.isPlaying) return;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      
      this.gain = this.ctx.createGain();
      this.gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
      this.gain.gain.exponentialRampToValueAtTime(volume, this.ctx.currentTime + 0.1);
      this.gain.connect(this.ctx.destination);

      this.osc1 = this.ctx.createOscillator();
      this.osc2 = this.ctx.createOscillator();

      this.osc1.type = 'sawtooth';
      this.osc2.type = 'sine';

      this.osc1.frequency.setValueAtTime(650, this.ctx.currentTime);
      this.osc2.frequency.setValueAtTime(950, this.ctx.currentTime);

      this.osc1.connect(this.gain);
      this.osc2.connect(this.gain);

      this.osc1.start();
      this.osc2.start();
      this.isPlaying = true;

      // Modulate frequency to create dual-tone alarm / siren sweep
      let high = false;
      this.intervalId = window.setInterval(() => {
        if (!this.ctx || !this.osc1 || !this.osc2 || !this.isPlaying) return;
        const now = this.ctx.currentTime;
        if (high) {
          this.osc1.frequency.exponentialRampToValueAtTime(600, now + 0.25);
          this.osc2.frequency.exponentialRampToValueAtTime(850, now + 0.25);
        } else {
          this.osc1.frequency.exponentialRampToValueAtTime(1100, now + 0.25);
          this.osc2.frequency.exponentialRampToValueAtTime(1450, now + 0.25);
        }
        high = !high;
      }, 300);
    } catch (e) {
      console.warn('AudioContext not allowed or supported', e);
    }
  }

  public stop() {
    if (!this.isPlaying) return;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.gain && this.ctx) {
      try {
        this.gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
        setTimeout(() => {
          this.cleanup();
        }, 150);
      } catch {
        this.cleanup();
      }
    } else {
      this.cleanup();
    }
  }

  private cleanup() {
    try {
      this.osc1?.stop();
      this.osc2?.stop();
      this.osc1?.disconnect();
      this.osc2?.disconnect();
      this.gain?.disconnect();
      this.ctx?.close();
    } catch {
      // ignore
    }
    this.ctx = null;
    this.osc1 = null;
    this.osc2 = null;
    this.gain = null;
    this.isPlaying = false;
  }

  public getStatus(): boolean {
    return this.isPlaying;
  }
}

export const siren = new SirenPlayer();
