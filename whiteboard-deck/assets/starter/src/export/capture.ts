import '../styles.css';
import './capture.css';
import { deck as authoredDeck } from '../content/deck.ts';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../model.ts';
import type { Deck } from '../model.ts';
import { BoardRenderer } from '../engine/renderer.ts';
import { validateDeck } from '../engine/validate.ts';
import { completedTargets, presenterFrame } from './frames.ts';
import type { PresenterFrame } from './frames.ts';

export interface CaptureAPI {
  load(deck: Deck): void;
  info(): { title: string; count: number };
  render(index: number): PresenterFrame;
}

declare global {
  interface Window { whiteboardExport: CaptureAPI }
}

function checkGeometry(svg: SVGSVGElement): void {
  for (const path of svg.querySelectorAll<SVGPathElement>('[data-stroke]')) {
    const box = path.getBBox();
    const matrix = path.getCTM();
    if (!matrix) throw new Error('A captured stroke has no coordinate transform.');
    const padding = Number.parseFloat(getComputedStyle(path).strokeWidth) / 2
      * Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
    const corners = [
      new DOMPoint(box.x, box.y), new DOMPoint(box.x + box.width, box.y),
      new DOMPoint(box.x, box.y + box.height), new DOMPoint(box.x + box.width, box.y + box.height),
    ].map((point) => point.matrixTransform(matrix));
    if (!Number.isFinite(padding) || corners.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)
      || point.x - padding < 0 || point.y - padding < 0
      || point.x + padding > BOARD_WIDTH || point.y + padding > BOARD_HEIGHT)) {
      throw new Error(`Off-board artwork: ${path.closest<SVGGElement>('[data-element]')?.dataset.element}.`);
    }
  }
  const labels = [...svg.querySelectorAll<SVGGElement>('[data-kind="text"]')];
  for (const [index, first] of labels.entries()) {
    const a = first.getBBox();
    for (const second of labels.slice(index + 1)) {
      const b = second.getBBox();
      const x = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const y = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (x > 2 && y > 2) throw new Error(`Captured label overlap: ${first.dataset.element} / ${second.dataset.element}.`);
    }
  }
}

const measurement = document.querySelector<SVGSVGElement>('#measurement');
const capture = document.getElementById('capture');
if (!measurement || !capture) throw new Error('Missing export-only capture surface.');
const svg = measurement;
const surface = capture;
let deck: Deck;
let renderer: BoardRenderer | undefined;
let currentBoard = -1;

window.whiteboardExport = {
  load(value) {
    validateDeck(value);
    deck = value;
    renderer = undefined;
    currentBoard = -1;
    surface.replaceChildren();
  },
  info() {
    return { title: deck.title, count: deck.boards.reduce((total, board) => total + board.beats.length, 0) };
  },
  render(index) {
    if (!Number.isInteger(index) || index < 0) throw new Error('Invalid frame index.');
    let remaining = index;
    const boardIndex = deck.boards.findIndex((board) => {
      if (remaining < board.beats.length) return true;
      remaining -= board.beats.length;
      return false;
    });
    const board = deck.boards[boardIndex];
    if (!board) throw new Error('Frame index exceeds the deck.');
    if (!renderer || currentBoard !== boardIndex) {
      renderer = new BoardRenderer(svg, board, deck.sources);
      currentBoard = boardIndex;
    }
    const targets = completedTargets(renderer.timeline, remaining);
    renderer.render(renderer.timeline.beats[remaining]!.end, false);
    const clone = svg.cloneNode(true);
    if (!(clone instanceof SVGSVGElement)) throw new Error('Cannot clone the rendered board.');
    clone.id = 'board';
    clone.removeAttribute('aria-hidden');
    // Boundary equality can start a future non-ink effect; never capture future nodes.
    for (const element of clone.querySelectorAll<SVGGElement>('[data-element]')) {
      if (!targets.has(element.dataset.element ?? '')) element.remove();
    }
    clone.querySelector('[data-pen]')?.remove();
    surface.replaceChildren(clone);
    checkGeometry(clone);
    const frame = presenterFrame(deck, boardIndex, remaining, targets);
    const actual = [...clone.querySelectorAll<SVGGElement>('[data-element]')].map((element) => element.dataset.element);
    if (JSON.stringify(actual) !== JSON.stringify(frame.elements)) throw new Error('Captured reveal order differs from the model.');
    if ([...clone.querySelectorAll<SVGGElement>('[data-element]')].some((element) => element.dataset.progress !== '1.0000')) {
      throw new Error(`An element is incomplete at ${frame.key}.`);
    }
    return frame;
  },
};
window.whiteboardExport.load(authoredDeck);
