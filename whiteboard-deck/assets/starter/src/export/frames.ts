import type { Deck } from '../model.ts';
import type { BoardTimeline } from '../engine/timeline.ts';

export interface PresenterFrame {
  key: string;
  boardId: string;
  beatId: string;
  elements: string[];
  labels: string[];
  notes: string[];
}

export function completedTargets(timeline: BoardTimeline, beatIndex: number): Set<string> {
  if (!Number.isInteger(beatIndex) || beatIndex < 0 || beatIndex >= timeline.beats.length) {
    throw new Error(`Invalid completed beat index ${beatIndex}.`);
  }
  return new Set(timeline.beats.slice(0, beatIndex + 1).flatMap((beat) => beat.actions.map((action) => action.target)));
}

export function presenterFrame(deck: Deck, boardIndex: number, beatIndex: number, targets: ReadonlySet<string>): PresenterFrame {
  const board = deck.boards[boardIndex];
  const beat = board?.beats[beatIndex];
  if (!board || !beat) throw new Error('Unknown presenter frame.');
  const elements = board.elements.filter((element) => targets.has(element.id));
  if (elements.length !== targets.size) throw new Error('The timeline contains an unknown frame target.');
  const labels = elements.flatMap((element) => element.kind === 'text' ? [element.text] : []);
  const key = `whiteboard-deck:${board.id}/${beat.id}`;
  const sourceIds = new Set([
    ...beat.sources,
    ...elements.flatMap((element) => element.kind === 'text' && element.source ? [element.source] : []),
  ]);
  const final = boardIndex === deck.boards.length - 1 && beatIndex === board.beats.length - 1;
  const sources = final ? deck.sources : deck.sources.filter((source) => sourceIds.has(source.id));
  const notes = [
    key, `${board.title} / Step ${beatIndex + 1}: ${beat.title}`,
    'Native progressive-slide adaptation. Original stroke playback is in the HTML.',
    beat.notes, 'Visible board labels:', ...labels,
    final ? 'Complete source ledger:' : 'Sources for this step and visible source labels:',
    ...sources.flatMap((source) => [
      source.title, source.url, `Checked: ${source.checked}`,
      `Supports: ${source.supports}`, `Caveat: ${source.caveat}`,
    ]),
  ].flatMap((line) => line.split(/\r?\n/)).filter((line) => line.length > 0);
  return { key, boardId: board.id, beatId: beat.id, elements: elements.map((element) => element.id), labels, notes };
}
