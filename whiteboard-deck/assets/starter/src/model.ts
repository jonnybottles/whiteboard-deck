export type InkColor = 'ink' | 'blue' | 'rose' | 'muted' | 'amber';
export type Effect = 'write' | 'draw' | 'fade' | 'descend' | 'wipe' | 'bars' | 'wheel';
export type Point = readonly [number, number];

interface BaseElement {
  id: string;
  x: number;
  y: number;
  color?: InkColor;
}

export interface TextElement extends BaseElement {
  kind: 'text';
  text: string;
  size: number;
  maxWidth: number;
  lineHeight?: number;
  source?: string;
}

export interface BoxElement extends BaseElement {
  kind: 'box' | 'cloud' | 'ellipse' | 'highlight';
  width: number;
  height: number;
}

export interface PathElement extends BaseElement {
  kind: 'path';
  paths: readonly string[];
  width: number;
  height: number;
}

export interface ArrowElement extends BaseElement {
  kind: 'arrow';
  points: readonly Point[];
}

export type BoardElement = TextElement | BoxElement | PathElement | ArrowElement;

export interface Action {
  target: string;
  effect?: Effect;
  withPrevious?: boolean;
  delay?: number;
  duration?: number;
}

export interface Beat {
  id: string;
  title: string;
  actions: readonly Action[];
  notes: string;
  sources: readonly string[];
}

export interface Board {
  id: string;
  title: string;
  theme: string;
  intro: string;
  description: string;
  elements: readonly BoardElement[];
  beats: readonly Beat[];
}

export interface Source {
  id: string;
  title: string;
  url: string;
  checked: string;
  supports: string;
  caveat: string;
}

export interface Deck {
  id: string;
  title: string;
  subtitle: string;
  caption: string;
  boards: readonly Board[];
  sources: readonly Source[];
}

export const BOARD_WIDTH = 1500;
export const BOARD_HEIGHT = 900;

export function isInkEffect(effect: Effect): boolean {
  return effect === 'write' || effect === 'draw';
}

export function defaultEffect(element: BoardElement): Effect {
  return element.kind === 'text' ? 'write' : 'draw';
}
