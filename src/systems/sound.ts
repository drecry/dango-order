/**
 * Sound effects (Dango Order).
 *
 * Tiny WebAudio synth — no audio files to download, so the game stays
 * light and works offline. Effects are oscillator phrases with pitch
 * slides and springy "poyoon" (boing) pitch curves, the same engine
 * as Dango Tower's sound.ts so the family sounds related.
 * Browsers only allow audio after a user gesture; the first tap
 * unlocks the AudioContext (called from the title screen's first
 * interaction). Mute state is persisted in localStorage (see
 * logic/storage.ts) and shared with the BGM player (systems/bgm.ts).
 *
 * v2 — the cute-sound update:
 * - Tapping a dango onto the skewer pops with that kind's own pitch
 *   and character (anko deep, mitarashi sticky, golden sparkly...),
 *   climbing a little as the skewer grows.
 * - Serving rings the register ("cha-ching!") plus a happy jingle
 *   whose pitch climbs with the combo.
 * - A wrong tap buzzes softly, a leaving customer sighs, and the
 *   last 10 seconds tick once per second.
 */
import type { DangoKind } from '../constants/assets';
import { loadMuted, saveMuted } from '../logic/storage';

type Tone = {
  /** Oscillator frequency in Hz. */
  freq: number;
  /** Optional pitch slide target (exponential ramp over the note). */
  slideTo?: number;
  /** Start time offset in seconds. */
  at: number;
  /** Note length in seconds. */
  dur: number;
  /** 'sine' for soft pops, 'triangle' for chimes, 'sawtooth' for buzzes. */
  type: OscillatorType;
  /** Peak volume 0..1. */
  vol: number;
};

type Boing = {
  /** Resting pitch the spring settles toward, in Hz. */
  base: number;
  /** Start time offset in seconds. */
  at: number;
  /** Total length in seconds. */
  dur: number;
  /** Peak volume 0..1. */
  vol: number;
  /** Wobble rate in Hz (how fast the pitch springs back and forth). */
  wobbleHz?: number;
};

/** Effects master level. The BGM master runs at 0.37 (bgm.ts), so
 * effects sit clearly on top of the music (the family mix). */
const SE_MASTER_GAIN = 1.3;

/**
 * Per-kind tap character. One shared pop shape, colored per kind:
 * `freq` is the pop's base pitch; `extra` adds a signature garnish.
 */
const PICK_PROFILES: Record<
  DangoKind,
  { freq: number; extra?: 'airy' | 'thunk' | 'sparkle' }
> = {
  shiratama: { freq: 740 },
  anko: { freq: 300 },
  sakura: { freq: 660, extra: 'airy' },
  mitarashi: { freq: 340, extra: 'thunk' },
  yomogi: { freq: 520 },
  matcha: { freq: 990 },
  golden: { freq: 880, extra: 'sparkle' },
};

export class SoundFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted: boolean;

  constructor() {
    this.muted = loadMuted();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Toggle mute and persist it. Returns the new state. */
  toggleMuted(): boolean {
    this.muted = !this.muted;
    saveMuted(this.muted);
    return this.muted;
  }

  /** Create/resume the AudioContext. Call from a user gesture. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      // Audio is a nice-to-have; never break the game for it.
    }
  }

  /** The shared AudioContext (for the BGM player), or null. */
  context(): AudioContext | null {
    this.unlock();
    return this.ctx;
  }

  /** The effects master gain node, created with the context. */
  private out(): GainNode | null {
    this.unlock();
    if (!this.ctx) return null;
    if (!this.master) {
      this.master = this.ctx.createGain();
      this.master.gain.value = SE_MASTER_GAIN;
      this.master.connect(this.ctx.destination);
    }
    return this.master;
  }

  private play(tones: Tone[]): void {
    if (this.muted) return;
    const out = this.out();
    if (!this.ctx || !out) return;
    try {
      const now = this.ctx.currentTime;
      for (const tone of tones) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = tone.type;
        const start = now + tone.at;
        osc.frequency.setValueAtTime(tone.freq, start);
        if (tone.slideTo !== undefined) {
          osc.frequency.exponentialRampToValueAtTime(
            Math.max(30, tone.slideTo),
            start + tone.dur,
          );
        }
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(tone.vol, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur);
        osc.connect(gain).connect(out);
        osc.start(start);
        osc.stop(start + tone.dur + 0.05);
      }
    } catch {
      // Ignore audio errors.
    }
  }

  /**
   * A springy "poyoon": the pitch starts squashed low, overshoots,
   * and wobbles with decaying amplitude until it settles — the sound
   * of something soft and round.
   */
  private playBoing(boing: Boing): void {
    if (this.muted) return;
    const out = this.out();
    if (!this.ctx || !out) return;
    try {
      const start = this.ctx.currentTime + boing.at;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const wobble = boing.wobbleHz ?? 7;
      const points = 48;
      const curve = new Float32Array(points);
      for (let i = 0; i < points; i++) {
        const t = (i / (points - 1)) * boing.dur;
        const decay = Math.exp(-5.2 * (t / boing.dur));
        curve[i] =
          boing.base * (1 - 0.48 * Math.cos(2 * Math.PI * wobble * t) * decay);
      }
      osc.frequency.setValueCurveAtTime(curve, start, boing.dur);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(boing.vol, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + boing.dur);
      osc.connect(gain).connect(out);
      osc.start(start);
      osc.stop(start + boing.dur + 0.05);
    } catch {
      // Ignore audio errors.
    }
  }

  click(): void {
    this.play([{ freq: 660, at: 0, dur: 0.07, type: 'sine', vol: 0.15 }]);
  }

  /**
   * A dango tapped onto the skewer: a soft pop in that kind's own
   * voice. `stackIndex` is how many dango are already on the skewer —
   * the pop climbs a semitone per dango (capped), so a growing
   * skewer sounds like it is filling up.
   */
  pick(kind: DangoKind, stackIndex = 0): void {
    const profile = PICK_PROFILES[kind];
    const ladder = Math.pow(2, Math.min(Math.max(stackIndex, 0), 4) / 12);
    const f = profile.freq * ladder;
    if (kind === 'anko') {
      // Deep and round: a small "boyoon" instead of a pop.
      this.playBoing({ base: 190 * ladder, at: 0, dur: 0.22, vol: 0.2, wobbleHz: 6 });
      return;
    }
    this.play([
      {
        freq: f * 0.82,
        slideTo: f * 1.25,
        at: 0,
        dur: 0.09,
        type: 'sine',
        vol: 0.19,
      },
      { freq: f * 2, at: 0.01, dur: 0.05, type: 'sine', vol: 0.05 },
    ]);
    if (profile.extra === 'airy') {
      this.play([{ freq: f * 3, at: 0.02, dur: 0.16, type: 'sine', vol: 0.03 }]);
    } else if (profile.extra === 'thunk') {
      this.play([
        { freq: 170, slideTo: 85, at: 0, dur: 0.08, type: 'sine', vol: 0.08 },
      ]);
    } else if (profile.extra === 'sparkle') {
      this.play([
        { freq: f * 3, at: 0.03, dur: 0.09, type: 'sine', vol: 0.045 },
        { freq: f * 4, at: 0.09, dur: 0.11, type: 'sine', vol: 0.04 },
      ]);
    }
  }

  /** The register's "cha-ching!": two bright metallic pings. */
  private chaChing(at = 0): void {
    this.play([
      { freq: 1568, at, dur: 0.07, type: 'square', vol: 0.045 },
      { freq: 2093, at: at + 0.055, dur: 0.12, type: 'square', vol: 0.05 },
      { freq: 2637, at: at + 0.055, dur: 0.16, type: 'sine', vol: 0.06 },
    ]);
  }

  /**
   * An order served: register cha-ching plus a happy jingle that
   * climbs a semitone per combo step (capped at +8), so a hot
   * streak literally sounds hotter.
   */
  serve(combo = 1): void {
    const ratio = Math.pow(2, Math.min(Math.max(combo - 1, 0), 8) / 12);
    this.chaChing(0);
    this.play(
      [659, 784, 1047].map((freq, i) => ({
        freq: freq * ratio,
        at: 0.1 + i * 0.07,
        dur: 0.16,
        type: 'triangle' as OscillatorType,
        vol: 0.17,
      })),
    );
  }

  /** A VIP (Golden) order served: fanfare + register + sparkles. */
  vip(): void {
    this.chaChing(0.3);
    this.play(
      [523, 659, 784, 1047, 1319].map((freq, i) => ({
        freq,
        at: i * 0.08,
        dur: 0.2,
        type: 'triangle' as OscillatorType,
        vol: 0.18,
      })),
    );
    this.play([
      { freq: 2093, at: 0.42, dur: 0.12, type: 'sine', vol: 0.05 },
      { freq: 2637, at: 0.5, dur: 0.16, type: 'sine', vol: 0.045 },
    ]);
  }

  /** A wrong dango tapped: a soft, low buzz (never harsh). */
  wrong(): void {
    this.play([
      { freq: 185, slideTo: 150, at: 0, dur: 0.16, type: 'sawtooth', vol: 0.07 },
      { freq: 139, slideTo: 118, at: 0, dur: 0.16, type: 'sine', vol: 0.09 },
    ]);
  }

  /** A customer left unserved: a gentle two-note sigh. */
  miss(): void {
    this.play([
      { freq: 330, at: 0, dur: 0.16, type: 'sine', vol: 0.15 },
      { freq: 233, at: 0.14, dur: 0.26, type: 'sine', vol: 0.13 },
    ]);
  }

  /**
   * Countdown tick: a soft wooden knock, once per second over the
   * last 10 seconds; stronger over the last 3.
   */
  tick(strong: boolean): void {
    this.play([
      {
        freq: strong ? 1950 : 1560,
        at: 0,
        dur: 0.045,
        type: 'square',
        vol: strong ? 0.075 : 0.045,
      },
      {
        freq: strong ? 980 : 780,
        at: 0,
        dur: 0.06,
        type: 'sine',
        vol: strong ? 0.06 : 0.04,
      },
    ]);
  }

  /** Soft bright chime when a served Matcha buys more time. */
  timeBonus(): void {
    this.play([
      { freq: 880, at: 0, dur: 0.1, type: 'triangle', vol: 0.16 },
      { freq: 1318, at: 0.08, dur: 0.18, type: 'sine', vol: 0.14 },
    ]);
  }

  gameOver(): void {
    this.play([
      { freq: 392, at: 0, dur: 0.18, type: 'triangle', vol: 0.18 },
      { freq: 330, at: 0.16, dur: 0.18, type: 'triangle', vol: 0.18 },
      { freq: 262, at: 0.32, dur: 0.3, type: 'triangle', vol: 0.18 },
    ]);
  }
}

/** One shared sound instance for the whole game. */
export const sound = new SoundFX();
