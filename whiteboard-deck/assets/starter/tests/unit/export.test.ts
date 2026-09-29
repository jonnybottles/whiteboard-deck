import { describe, expect, it } from 'vitest';
import { deck } from '../../src/content/deck.ts';
import { compileTimeline } from '../../src/engine/timeline.ts';
import { completedTargets, presenterFrame } from '../../src/export/frames.ts';

describe('progressive frame contract', () => {
  it('uses compiled cumulative targets in element layer order and retains notes', () => {
    for (const [boardIndex, board] of deck.boards.entries()) {
      const timeline = compileTimeline(board, new Map(board.elements.map((element) => [element.id, 100])));
      const expected = new Set<string>();
      for (const [beatIndex, beat] of board.beats.entries()) {
        for (const action of beat.actions) expected.add(action.target);
        const targets = completedTargets(timeline, beatIndex);
        expect(targets).toEqual(expected);
        const frame = presenterFrame(deck, boardIndex, beatIndex, targets);
        expect(frame.elements).toEqual(board.elements.filter((element) => expected.has(element.id)).map((element) => element.id));
        expect(frame.notes.join('\n')).toContain(beat.notes);
        expect(frame.key).toBe(`whiteboard-deck:${board.id}/${beat.id}`);
      }
    }
  });
  it('keeps the whole source ledger in the last frame without extra slides', () => {
    const boardIndex = deck.boards.length - 1;
    const board = deck.boards[boardIndex]!;
    const frame = presenterFrame(deck, boardIndex, board.beats.length - 1, new Set(board.elements.map((element) => element.id)));
    for (const source of deck.sources) {
      expect(frame.notes).toContain(source.url);
      expect(frame.notes).toContain(`Checked: ${source.checked}`);
    }
  });
  it('rejects invalid frame selection instead of returning an empty success', () => {
    const timeline = { beats: [], duration: 0 };
    expect(() => completedTargets(timeline, 0)).toThrow('Invalid completed beat');
    expect(() => presenterFrame(deck, -1, 0, new Set())).toThrow('Unknown presenter frame');
  });
});
