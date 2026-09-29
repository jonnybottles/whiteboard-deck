import { defaultEffect, isInkEffect } from '../model.ts';
import type { Board, Effect } from '../model.ts';

export interface ActionSpan {
  target: string;
  effect: Effect;
  start: number;
  end: number;
}

export interface BeatSpan {
  start: number;
  end: number;
  actions: ActionSpan[];
}

export interface BoardTimeline {
  beats: BeatSpan[];
  duration: number;
}

export function compileTimeline(board: Board, naturalDurations: ReadonlyMap<string, number>): BoardTimeline {
  let cursor = 0;
  let inkEnd = 0;
  const beats: BeatSpan[] = [];
  for (const beat of board.beats) {
    const start = cursor;
    let previousStart = cursor;
    const actions: ActionSpan[] = [];
    for (const action of beat.actions) {
      const element = board.elements.find((item) => item.id === action.target);
      if (!element) throw new Error(`Cannot compile unknown target ${action.target}.`);
      const effect = action.effect ?? defaultEffect(element);
      const natural = naturalDurations.get(element.id);
      if (natural === undefined) throw new Error(`Missing measured duration for ${element.id}.`);
      const duration = action.duration ?? (isInkEffect(effect) ? natural : 650);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid measured duration for ${element.id}.`);
      let actionStart = (action.withPrevious ? previousStart : cursor) + (action.delay ?? 0);
      if (isInkEffect(effect)) actionStart = Math.max(actionStart, inkEnd);
      const end = actionStart + duration;
      actions.push({ target: action.target, effect, start: actionStart, end });
      if (isInkEffect(effect)) inkEnd = end;
      previousStart = actionStart;
      cursor = Math.max(cursor, end);
    }
    beats.push({ start, end: cursor, actions });
  }
  return { beats, duration: cursor };
}
