import { describe, expect, it } from 'vitest';
import { BAR_ROOTS, MELODY, midiToFreq } from '../systems/bgm';

describe('midiToFreq', () => {
  it('maps A4 (69) to 440 Hz and doubles per octave', () => {
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(81)).toBe(880);
    expect(midiToFreq(57)).toBe(220);
  });
});

describe('BGM loop data', () => {
  it('is 8 bars of 8 eighth steps, matching the chord roots', () => {
    expect(MELODY.length).toBe(64);
    expect(BAR_ROOTS.length).toBe(8);
  });

  it('stays in a singable music-box range (with rests allowed)', () => {
    for (const note of MELODY) {
      if (note === null) continue;
      expect(note).toBeGreaterThanOrEqual(72);
      expect(note).toBeLessThanOrEqual(88);
    }
  });
});
