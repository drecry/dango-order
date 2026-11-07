/**
 * Background music (Dango Order).
 *
 * Order's OWN original music, composed and rendered for this game
 * (v2), in the same synth family as Dango Tower's tracks:
 *   menu  (title / result) -> order-menu.mp3: calm and warm
 *           (74 BPM, G major, 25.9 s loop, -19 LUFS) — soft pads, a
 *           springy "boyoon" bass, a scooping "nururin" melody.
 *   game  (gameplay)       -> order-game.mp3: the cheerful partner
 *           (122 BPM, G major, 31.5 s loop, -17 LUFS) — bouncy
 *           eighth-note poyo bass, backbeat plucks, denser melody.
 * Tracks crossfade when the scene switches; asking for the track
 * that is already playing is a no-op.
 *
 * Mix: the music sits well UNDER the sound effects. The track runs
 * through FILE_GAIN and the BGM master gain, while effects run
 * through their own hotter master (see systems/sound.ts).
 *
 * If a track cannot be loaded (offline first visit, decode
 * failure), the player falls back to the generative music-box loop
 * below (shared with Dango Tower), so the game is never silent for
 * a code reason.
 *
 * The mute setting is shared with the effects: a small sync timer
 * keeps the BGM master gain at 0 while muted.
 */
import { sound } from './sound';

/** Convert a MIDI note number to a frequency in Hz. */
export const midiToFreq = (midi: number): number =>
  440 * Math.pow(2, (midi - 69) / 12);

export type BgmTrack = 'menu' | 'game';

const TRACK_URLS: Record<BgmTrack, string> = {
  menu: `${import.meta.env.BASE_URL}assets/audio/order-menu.mp3`,
  game: `${import.meta.env.BASE_URL}assets/audio/order-game.mp3`,
};

/** BGM master level (the effects master runs at 1.3 — see sound.ts). */
const BGM_GAIN = 0.37;
/** Trim for the original tracks (mastered soft: -19 / -17 LUFS). */
const FILE_GAIN = 0.8;
/** Crossfade length when switching tracks, in seconds. */
const FADE_SEC = 0.4;

// ---------------------------------------------------------------------
// Generative fallback (the v3.2 music-box loop, kept as a safety net)
// ---------------------------------------------------------------------

const BPM = 96;
/** One eighth note, in seconds. */
const STEP_SEC = 60 / BPM / 2;
const STEPS_PER_BAR = 8;

/** Chord roots per bar (MIDI): C3, A2, F2, G2 — twice around. */
export const BAR_ROOTS: readonly number[] = [48, 45, 41, 43, 48, 45, 41, 43];

/** Chord color tones per bar (third + fifth, MIDI), played softly. */
const BAR_CHORD_TONES: readonly (readonly [number, number])[] = [
  [64, 67], // C: E, G
  [60, 64], // Am: C, E
  [65, 69], // F: A, C
  [59, 62], // G: B, D
  [64, 67],
  [60, 64],
  [65, 69],
  [59, 62], // G: B, D
];

/** The fallback melody: 8 bars × 8 eighth steps (null = rest). */
export const MELODY: readonly (number | null)[] = [
  72, 76, 79, 81, 79, 76, 74, 76,
  72, 76, 81, 84, 81, 76, 74, 72,
  77, 81, 79, 76, 77, 81, 84, 81,
  79, 83, 86, 83, 79, 76, 74, null,
  84, 81, 79, 76, 79, 81, 79, 76,
  81, 84, 88, 84, 81, 79, 76, 74,
  77, 81, 84, 81, 79, 76, 77, 74,
  74, 76, 79, 83, 81, 79, 76, null,
];

const TOTAL_STEPS = MELODY.length;

// ---------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------

class BgmPlayer {
  /** BGM master gain node (music -> destination). */
  private out: GainNode | null = null;
  /** The track the scenes most recently asked for. */
  private want: BgmTrack | null = null;
  /** The track actually playing (file mode). */
  private current: BgmTrack | null = null;
  private source: AudioBufferSourceNode | null = null;
  private sourceGain: GainNode | null = null;
  private buffers = new Map<BgmTrack, AudioBuffer>();
  private loading = new Map<BgmTrack, Promise<AudioBuffer | null>>();
  /** True once file mode failed and the generative loop took over. */
  private generative = false;
  private genTimer: ReturnType<typeof setInterval> | null = null;
  private genStep = 0;
  private genNextAt = 0;
  private muteTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Start (or switch) the music for a scene. Idempotent: asking for
   * the track that is already playing does nothing.
   */
  start(track: BgmTrack = 'game'): void {
    this.want = track;
    const ctx = sound.context();
    if (!ctx) return;
    this.ensureOut(ctx);
    this.startMuteSync(ctx);
    if (this.generative) {
      this.startGenerative(ctx);
      return;
    }
    if (this.current === track && this.source) return;
    void this.playTrack(track, ctx);
  }

  /** Stop everything (not used by the scenes; kept for completeness). */
  stop(): void {
    this.want = null;
    this.current = null;
    this.stopSource();
    if (this.genTimer !== null) {
      clearInterval(this.genTimer);
      this.genTimer = null;
    }
    if (this.muteTimer !== null) {
      clearInterval(this.muteTimer);
      this.muteTimer = null;
    }
  }

  private ensureOut(ctx: AudioContext): void {
    if (this.out) return;
    this.out = ctx.createGain();
    this.out.gain.value = sound.isMuted ? 0 : BGM_GAIN;
    this.out.connect(ctx.destination);
  }

  /** Keep the master gain in step with the shared mute setting. */
  private startMuteSync(ctx: AudioContext): void {
    if (this.muteTimer !== null) return;
    this.muteTimer = setInterval(() => {
      if (!this.out) return;
      const target = sound.isMuted ? 0 : BGM_GAIN;
      this.out.gain.setTargetAtTime(target, ctx.currentTime, 0.06);
    }, 200);
  }

  private async loadBuffer(
    track: BgmTrack,
    ctx: AudioContext,
  ): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(track);
    if (cached) return cached;
    let pending = this.loading.get(track);
    if (!pending) {
      pending = (async () => {
        try {
          const response = await fetch(TRACK_URLS[track]);
          if (!response.ok) return null;
          const bytes = await response.arrayBuffer();
          const buffer = await ctx.decodeAudioData(bytes);
          this.buffers.set(track, buffer);
          return buffer;
        } catch {
          return null;
        }
      })();
      this.loading.set(track, pending);
    }
    return pending;
  }

  private async playTrack(track: BgmTrack, ctx: AudioContext): Promise<void> {
    const buffer = await this.loadBuffer(track, ctx);
    if (this.want === null) return; // stopped while loading
    if (buffer === null) {
      // File mode failed: fall back to the generative loop.
      this.generative = true;
      this.startGenerative(ctx);
      return;
    }
    if (this.want !== track) {
      // A newer request arrived while this was loading.
      void this.playTrack(this.want, ctx);
      return;
    }
    if (this.current === track && this.source) return;
    this.switchTo(track, buffer, ctx);
  }

  private switchTo(
    track: BgmTrack,
    buffer: AudioBuffer,
    ctx: AudioContext,
  ): void {
    const now = ctx.currentTime;
    // Fade the old track out and stop it.
    if (this.source && this.sourceGain) {
      const oldSource = this.source;
      const oldGain = this.sourceGain;
      oldGain.gain.setTargetAtTime(0, now, FADE_SEC / 3);
      window.setTimeout(() => {
        try {
          oldSource.stop();
        } catch {
          // Already stopped.
        }
      }, FADE_SEC * 1000 + 120);
    }
    // Start the new track, fading in.
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.setTargetAtTime(FILE_GAIN, now, FADE_SEC / 3);
    source.connect(gain).connect(this.out as GainNode);
    source.start();
    this.source = source;
    this.sourceGain = gain;
    this.current = track;
  }

  private stopSource(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // Already stopped.
      }
      this.source = null;
      this.sourceGain = null;
    }
  }

  // ----- generative fallback -----

  private startGenerative(ctx: AudioContext): void {
    if (this.genTimer !== null) return;
    this.genStep = 0;
    this.genNextAt = ctx.currentTime + 0.08;
    this.genTimer = setInterval(() => this.genTick(ctx), 90);
  }

  private genTick(ctx: AudioContext): void {
    if (this.genNextAt < ctx.currentTime - 0.25) {
      this.genNextAt = ctx.currentTime + 0.05;
    }
    while (this.genNextAt < ctx.currentTime + 0.18) {
      this.scheduleStep(this.genStep, this.genNextAt, ctx);
      this.genStep = (this.genStep + 1) % TOTAL_STEPS;
      this.genNextAt += STEP_SEC;
    }
  }

  private scheduleStep(step: number, at: number, ctx: AudioContext): void {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const inBar = step % STEPS_PER_BAR;
    if (inBar === 0 || inBar === 4) {
      this.note(ctx, midiToFreq(BAR_ROOTS[bar] + 12), at, 0.55, 'sine', 0.11);
    }
    if (inBar === 0) {
      for (const tone of BAR_CHORD_TONES[bar]) {
        this.note(ctx, midiToFreq(tone), at, 1.4, 'triangle', 0.028);
      }
    }
    const melody = MELODY[step];
    if (melody !== null) {
      this.note(ctx, midiToFreq(melody), at, 0.3, 'triangle', 0.13);
      this.note(ctx, midiToFreq(melody + 12), at, 0.18, 'sine', 0.04);
    }
  }

  /** One soft music-box note with a quick attack and a long fade. */
  private note(
    ctx: AudioContext,
    freq: number,
    at: number,
    dur: number,
    type: OscillatorType,
    vol: number,
  ): void {
    if (!this.out) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(vol, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain).connect(this.out);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    } catch {
      // Ignore audio errors.
    }
  }
}

/** The shared BGM player. */
export const bgm = new BgmPlayer();
