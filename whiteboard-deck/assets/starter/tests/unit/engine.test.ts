import { describe, expect, it } from 'vitest';
import { GLYPHS } from '../../src/assets/marker-glyphs.ts';
import { layoutText } from '../../src/engine/layout.ts';
import { Playback } from '../../src/engine/playback.ts';
import { compileTimeline } from '../../src/engine/timeline.ts';
import type { BoardTimeline } from '../../src/engine/timeline.ts';
import { validateDeck } from '../../src/engine/validate.ts';
import { deck } from '../../src/content/deck.ts';
import { beat, text } from '../../src/content/helpers.ts';
import type { Deck } from '../../src/model.ts';

const fixture: Deck = {
  id: 'fixture', title: 'A test board', subtitle: 'Contract tests', caption: 'Fictitious example', sources: [],
  boards: [{
    id: 'sample', title: 'A sample', theme: 'TEST', intro: 'Draw a sample', description: 'A test fixture.',
    elements: [text('title', 60, 60, 40, 'A sample', 800), text('subtitle', 60, 150, 26, 'Keep it readable.', 900)],
    beats: [beat('first', 'First thought', ['title', 'subtitle'], 'This is a test fixture.')],
  }],
};

const timeline: BoardTimeline = {
  duration: 300,
  beats: [
    { start: 0, end: 100, actions: [] },
    { start: 100, end: 300, actions: [] },
  ],
};
const player = () => new Playback(2, () => timeline);

describe('handwritten content', () => {
  it('provides explicit centerline strokes for every printable ASCII character', () => {
    for (let index = 32; index <= 126; index++) {
      const glyph = GLYPHS[String.fromCharCode(index)];
      expect(glyph, String.fromCharCode(index)).toBeDefined();
      expect(glyph!.advance).toBeGreaterThan(0);
      if (index > 32) expect(glyph!.strokes.length).toBeGreaterThan(0);
    }
  });
  it('lays out the full line before drawing and seeds variation deterministically', () => {
    const label = text('sample', 10, 20, 28, 'Foundry writes.\nThen thinks.', 400);
    const first = layoutText(label);
    expect(first).toEqual(layoutText(label));
    expect(first.lines).toEqual(['Foundry writes.', 'Then thinks.']);
    expect(first.glyphs.some((glyph) => glyph.rotation !== 0)).toBe(true);
    expect(first.height).toBeGreaterThan(28);
  });
  it('wraps words, but rejects unsupported characters and impossible word widths', () => {
    expect(layoutText(text('wrap', 0, 0, 28, 'one two three', 130)).lines.length).toBeGreaterThan(1);
    expect(() => layoutText(text('unicode', 0, 0, 28, '\u2603', 300))).toThrow('Unsupported handwriting character');
    expect(() => layoutText(text('narrow', 0, 0, 28, 'Foundry', 12))).toThrow('exceeds maxWidth');
  });
  it('validates the complete authored deck', () => {
    expect(() => validateDeck(deck)).not.toThrow();
  });
  it('rejects orphaned, duplicated and non-handwritten labels', () => {
    const first = fixture.boards[0]!;
    const emptyBeat = { ...first.beats[0]!, actions: [{ target: 'title' }] };
    expect(() => validateDeck({ ...fixture, boards: [{ ...first, beats: [emptyBeat] }] })).toThrow('never revealed');
    expect(() => validateDeck({ ...fixture, boards: [{ ...first, elements: [...first.elements, first.elements[0]!] }] })).toThrow('duplicate');
    const beat = first.beats[0]!;
    expect(() => validateDeck({ ...fixture, boards: [{ ...first, beats: [{ ...beat, actions: [{ target: 'title', effect: 'fade' }, ...beat.actions.slice(1)] }] }] })).toThrow('real handwriting');
  });
  it('serializes ink even when requested as a with-previous group', () => {
    const first = fixture.boards[0]!;
    const compiled = compileTimeline({
      ...first,
      beats: [{ ...first.beats[0]!, actions: [{ target: 'title' }, { target: 'subtitle', withPrevious: true }] }],
    }, new Map([['title', 100], ['subtitle', 200]]));
    expect(compiled.beats[0]!.actions[1]!.start).toBe(100);
    expect(compiled.duration).toBe(300);
  });
  it('rejects labels whose wrapping would collide with another label', () => {
    const first = fixture.boards[0]!;
    const elements = first.elements.map((element) => element.id === 'subtitle' ? { ...element, x: 65, y: 65 } : element);
    expect(() => validateDeck({ ...fixture, boards: [{ ...first, elements }] })).toThrow('Text overlap');
  });
});

describe('playback boundaries', () => {
  it('starts blank and first next starts rather than skips', () => {
    const p = player();
    expect(p.time).toBe(-1);
    p.next();
    expect(p.state.active).toBe(0);
    expect(p.time).toBe(0);
    p.advance(35);
    expect(p.time).toBe(35);
    p.next();
    expect(p.state.completed).toBe(1);
    expect(p.state.active).toBeNull();
    expect(p.time).toBe(100);
    expect(p.state.running).toBe(false);
  });
  it('cancels an active step and restores the prior completed boundary', () => {
    const p = player();
    p.next(); p.next(); p.next(); p.advance(80);
    p.previous();
    expect(p.time).toBe(100);
    expect(p.state.completed).toBe(1);
    p.previous();
    expect(p.time).toBe(-1);
  });
  it('pauses and changes speed without resetting progress', () => {
    const p = player();
    p.next(); p.advance(20); p.pause(); p.advance(100);
    expect(p.time).toBe(20);
    p.setSpeed(2);
    p.playPause(); p.advance(20);
    expect(p.time).toBe(60);
  });
  it('finishes a paused step on next without skipping another', () => {
    const p = player();
    p.next(); p.advance(20); p.pause(); p.next();
    expect(p.state.completed).toBe(1);
    expect(p.state.active).toBeNull();
  });
  it('autoplays to the final boundary, including all boards, then stops', () => {
    const p = player();
    p.toggleAutoplay(); p.advance(10000);
    expect(p.state.board).toBe(1);
    expect(p.state.completed).toBe(2);
    expect(p.time).toBe(300);
    expect(p.state.running).toBe(false);
    expect(p.state.autoplay).toBe(false);
  });
  it('previous at a board start opens the previous completed board', () => {
    const p = player();
    p.selectBoard(1); p.previous();
    expect(p.state.board).toBe(0);
    expect(p.state.completed).toBe(2);
  });
  it('replay, select and seeking cancel previous progress', () => {
    const p = player();
    p.next(); p.advance(50); p.selectBoard(1);
    expect(p.time).toBe(-1);
    expect(p.state.running).toBe(false);
    p.showAll(); p.replay();
    expect(p.time).toBe(0);
    expect(p.state.active).toBe(0);
    p.seekBoundary(1);
    expect(p.time).toBe(100);
    expect(p.state.active).toBeNull();
  });
  it('instant mode finishes requested steps and disables autoplay', () => {
    const p = player();
    p.toggleAutoplay(); p.advance(20); p.setReducedMotion(true);
    expect(p.state.completed).toBe(1);
    expect(p.state.autoplay).toBe(false);
    p.next();
    expect(p.state.completed).toBe(2);
    expect(p.state.running).toBe(false);
    p.next();
    expect(p.state.board).toBe(1);
    expect(p.state.completed).toBe(1);
  });
  it('rejects invalid inputs rather than hiding state errors', () => {
    const p = player();
    expect(() => p.advance(-1)).toThrow();
    expect(() => p.setSpeed(9)).toThrow();
    expect(() => p.selectBoard(10)).toThrow();
    expect(() => p.seekBoundary(-1)).toThrow();
  });
});
