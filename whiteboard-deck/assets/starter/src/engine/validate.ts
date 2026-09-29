import { BOARD_HEIGHT, BOARD_WIDTH, defaultEffect } from '../model.ts';
import type { Deck } from '../model.ts';
import { layoutText } from './layout.ts';

const validId = /^[a-z][a-z0-9-]*$/;

function uniqueId(id: string, seen: Set<string>, context: string): void {
  if (!validId.test(id) || seen.has(id)) throw new Error(`Invalid or duplicate ID "${id}" in ${context}.`);
  seen.add(id);
}

export function validateDeck(deck: Deck): void {
  if (!validId.test(deck.id) || !deck.title.trim() || !deck.boards.length) {
    throw new Error('A deck needs a valid ID, title and at least one board.');
  }
  const sourceIds = new Set<string>();
  for (const source of deck.sources) {
    uniqueId(source.id, sourceIds, 'sources');
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error(`Source ${source.id} must use a credential-free HTTPS URL.`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source.checked) || !source.supports.trim()) {
      throw new Error(`Source ${source.id} needs a checked date and a supported-claims summary.`);
    }
  }
  const boardIds = new Set<string>();
  for (const board of deck.boards) {
    uniqueId(board.id, boardIds, 'boards');
    if (!board.title.trim() || !board.beats.length) throw new Error(`Board ${board.id} needs a title and beats.`);
    const elementIds = new Set<string>();
    const labels: { id: string; x: number; y: number; width: number; height: number }[] = [];
    for (const element of board.elements) {
      uniqueId(element.id, elementIds, board.id);
      if (![element.x, element.y].every(Number.isFinite) || element.x < 0 || element.y < 0) {
        throw new Error(`Invalid position for ${board.id}/${element.id}.`);
      }
      let right: number;
      let bottom: number;
      if (element.kind === 'text') {
        if (!element.text || !Number.isFinite(element.size) || element.size < 12 || !Number.isFinite(element.maxWidth) || element.maxWidth <= 0) {
          throw new Error(`Invalid text layout for ${element.id}.`);
        }
        const layout = layoutText(element);
        labels.push({ id: element.id, x: element.x, y: element.y, width: layout.width, height: layout.height });
        right = element.x + layout.width;
        bottom = element.y + layout.height;
        if (element.source && !sourceIds.has(element.source)) throw new Error(`Unknown source on ${element.id}.`);
      } else if (element.kind === 'arrow') {
        if (element.points.length < 2 || !element.points.flat().every(Number.isFinite) || element.points.flat().some((value) => value < 0)) {
          throw new Error(`Arrow ${element.id} needs at least two valid points.`);
        }
        right = Math.max(...element.points.map((point) => point[0]));
        bottom = Math.max(...element.points.map((point) => point[1]));
      } else {
        if (![element.width, element.height].every((value) => Number.isFinite(value) && value > 0)) {
          throw new Error(`Invalid dimensions for ${element.id}.`);
        }
        right = element.x + element.width;
        bottom = element.y + element.height;
        if (element.kind === 'path' && (!element.paths.length || element.paths.some((path) => !/^[Mm][\d\s.,+\-EeMmLlHhVvCcSsQqTtAaZz]+$/.test(path)))) {
          throw new Error(`Invalid SVG path data for ${element.id}.`);
        }
      }
      if (right > BOARD_WIDTH - 12 || bottom > BOARD_HEIGHT - 12) {
        throw new Error(`${board.id}/${element.id} exceeds the whiteboard bounds (${right.toFixed(1)}, ${bottom.toFixed(1)}).`);
      }
    }
    for (const [index, first] of labels.entries()) {
      for (const second of labels.slice(index + 1)) {
        const horizontal = Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
        const vertical = Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
        if (horizontal > 2 && vertical > 2) {
          throw new Error(`Text overlap in ${board.id}: ${first.id} and ${second.id}. Check wrapping, size and position.`);
        }
      }
    }
    const revealed = new Set<string>();
    const beatIds = new Set<string>();
    for (const beat of board.beats) {
      uniqueId(beat.id, beatIds, board.id);
      if (!beat.actions.length || !beat.notes.trim()) throw new Error(`Beat ${beat.id} needs actions and speaker notes.`);
      for (const source of beat.sources) {
        if (!sourceIds.has(source)) throw new Error(`Unknown source ${source} in ${beat.id}.`);
      }
      for (const action of beat.actions) {
        if (!elementIds.has(action.target) || revealed.has(action.target)) {
          throw new Error(`Unknown or repeated reveal target ${action.target} in ${beat.id}.`);
        }
        const element = board.elements.find((item) => item.id === action.target)!;
        const effect = action.effect ?? defaultEffect(element);
        if (element.kind === 'text' && effect !== 'write') {
          throw new Error(`Text ${element.id} must use real handwriting, not ${effect}.`);
        }
        if (element.kind !== 'text' && effect === 'write') throw new Error(`Only text may use write: ${element.id}.`);
        if (action.delay !== undefined && (!Number.isFinite(action.delay) || action.delay < 0)) throw new Error(`Invalid delay on ${action.target}.`);
        if (action.duration !== undefined && (!Number.isFinite(action.duration) || action.duration <= 0)) throw new Error(`Invalid duration on ${action.target}.`);
        revealed.add(action.target);
      }
    }
    for (const id of elementIds) {
      if (!revealed.has(id)) throw new Error(`Element ${board.id}/${id} is never revealed.`);
    }
  }
}
