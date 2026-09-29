import type { ArrowElement, BoardElement, BoxElement, Point } from '../model.ts';
import { layoutText } from './layout.ts';

const NS = 'http://www.w3.org/2000/svg';

export function svgNode<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boundsOf(element: BoardElement): Bounds {
  if (element.kind === 'text') {
    const layout = layoutText(element);
    return { x: element.x - 8, y: element.y - 8, width: layout.width + 16, height: layout.height + 16 };
  }
  if (element.kind === 'arrow') {
    const xs = element.points.map((point) => point[0]);
    const ys = element.points.map((point) => point[1]);
    const x = Math.min(...xs) - 16;
    const y = Math.min(...ys) - 16;
    return { x, y, width: Math.max(...xs) - x + 16, height: Math.max(...ys) - y + 16 };
  }
  return { x: element.x - 8, y: element.y - 8, width: element.width + 16, height: element.height + 16 };
}

function cloud({ x, y, width: w, height: h }: BoxElement): string {
  const p = (a: number, b: number) => `${x + a * w} ${y + b * h}`;
  return `M${p(0.14, 0.9)}
    C${p(-0.02, 0.95)} ${p(-0.03, 0.64)} ${p(0.07, 0.58)}
    C${p(-0.03, 0.43)} ${p(0.04, 0.19)} ${p(0.2, 0.22)}
    C${p(0.18, 0.03)} ${p(0.4, -0.02)} ${p(0.48, 0.1)}
    C${p(0.6, -0.07)} ${p(0.8, 0.05)} ${p(0.81, 0.18)}
    C${p(0.99, 0.11)} ${p(1.04, 0.34)} ${p(0.95, 0.45)}
    C${p(1.08, 0.64)} ${p(0.99, 0.85)} ${p(0.87, 0.85)}
    C${p(0.89, 1.01)} ${p(0.65, 0.99)} ${p(0.54, 0.95)}
    C${p(0.38, 1.04)} ${p(0.2, 0.98)} ${p(0.14, 0.9)}Z`;
}

export function shapePaths(element: Exclude<BoardElement, { kind: 'text' }>): string[] {
  if (element.kind === 'path') return [...element.paths];
  if (element.kind === 'arrow') return arrowPaths(element);
  const { x, y, width: w, height: h } = element;
  if (element.kind === 'cloud') return [cloud(element)];
  if (element.kind === 'highlight') return [`M${x} ${y + h / 2} Q${x + w / 2} ${y + h / 2 - 2} ${x + w} ${y + h / 2}`];
  if (element.kind === 'ellipse') {
    return [`M${x + w / 2} ${y} C${x + w * 1.18} ${y - 2} ${x + w * 1.12} ${y + h + 4} ${x + w / 2} ${y + h}
      C${x - w * 0.16} ${y + h + 2} ${x - w * 0.17} ${y + 1} ${x + w / 2} ${y}`];
  }
  return [`M${x + 10} ${y + 1} Q${x + w * 0.5} ${y - 2} ${x + w - 9} ${y + 2}
    Q${x + w + 1} ${y + 2} ${x + w} ${y + 12}
    L${x + w - 1} ${y + h - 10} Q${x + w} ${y + h + 1} ${x + w - 10} ${y + h}
    Q${x + w * 0.4} ${y + h + 2} ${x + 8} ${y + h - 1}
    Q${x - 1} ${y + h} ${x + 1} ${y + h - 12}
    L${x + 2} ${y + 11} Q${x} ${y + 1} ${x + 10} ${y + 1}`];
}

function arrowPaths(element: ArrowElement): string[] {
  const first = element.points[0]!;
  const last = element.points[element.points.length - 1]!;
  const before = element.points[element.points.length - 2]!;
  const angle = Math.atan2(last[1] - before[1], last[0] - before[0]);
  const point = (offset: number): Point => [
    last[0] - 12 * Math.cos(angle + offset),
    last[1] - 12 * Math.sin(angle + offset),
  ];
  const left = point(0.43);
  const right = point(-0.43);
  return [
    `M${first.join(' ')} ${element.points.slice(1).map((item) => `L${item.join(' ')}`).join(' ')}`,
    `M${left.join(' ')} L${last.join(' ')} L${right.join(' ')}`,
  ];
}
