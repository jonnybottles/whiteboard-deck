import type { Action, ArrowElement, Beat, BoxElement, InkColor, PathElement, Point, TextElement } from '../model.ts';

export function text(id: string, x: number, y: number, size: number, value: string, maxWidth: number, color: InkColor = 'ink', source?: string): TextElement {
  return { kind: 'text', id, x, y, size, text: value, maxWidth, color, ...(source ? { source } : {}) };
}

export function box(id: string, x: number, y: number, width: number, height: number, color: InkColor = 'ink', kind: BoxElement['kind'] = 'box'): BoxElement {
  return { kind, id, x, y, width, height, color };
}

export function arrow(id: string, points: readonly Point[], color: InkColor = 'blue'): ArrowElement {
  return { kind: 'arrow', id, x: 0, y: 0, points, color };
}

export function path(id: string, x: number, y: number, width: number, height: number, paths: readonly string[], color: InkColor = 'ink'): PathElement {
  return { kind: 'path', id, x, y, width, height, paths, color };
}

export function beat(id: string, title: string, targets: readonly (string | Action)[], notes: string, sources: readonly string[] = []): Beat {
  return { id, title, actions: targets.map((target) => typeof target === 'string' ? { target } : target), notes, sources };
}
