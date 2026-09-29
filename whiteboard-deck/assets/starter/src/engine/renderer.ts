import { isInkEffect } from '../model.ts';
import type { Board, BoardElement, Source } from '../model.ts';
import { layoutText, seededValue } from './layout.ts';
import { boundsOf, shapePaths, svgNode } from './svg.ts';
import type { Bounds } from './svg.ts';
import { compileTimeline } from './timeline.ts';
import type { ActionSpan, BoardTimeline } from './timeline.ts';

interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

interface Stroke {
  node: SVGPathElement;
  length: number;
  start: number;
  end: number;
  transform: Transform;
}

interface ElementView {
  element: BoardElement;
  root: SVGGElement;
  anchor?: SVGAElement;
  strokes: Stroke[];
  duration: number;
  bounds: Bounds;
  clip: SVGClipPathElement;
  clipParts: SVGElement[];
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const identity: Transform = { x: 0, y: 0, scale: 1, rotation: 0 };

export class BoardRenderer {
  readonly timeline: BoardTimeline;
  private readonly views = new Map<string, ElementView>();
  private readonly actions: ActionSpan[];
  private readonly nib = svgNode('g', { class: 'pen-nib', 'aria-hidden': 'true', 'data-pen': 'true' });
  private readonly defs = svgNode('defs');

  constructor(private readonly svg: SVGSVGElement, readonly board: Board, sources: readonly Source[]) {
    const title = svgNode('title', { id: 'svg-board-title' });
    title.textContent = board.title;
    const description = svgNode('desc', { id: 'svg-board-description' });
    description.textContent = `${board.description} A full readable transcript is available in Notes and sources.`;
    svg.replaceChildren(title, description, this.defs);
    svg.setAttribute('aria-labelledby', 'svg-board-title');
    svg.setAttribute('aria-describedby', 'svg-board-description');
    svg.setAttribute('data-board', board.id);

    for (const element of board.elements) {
      const view = this.createElement(element, sources);
      this.views.set(element.id, view);
    }
    this.nib.append(
      svgNode('path', { d: 'M0 0 5-12 26-33 37-22 16-2Z', class: 'pen-body' }),
      svgNode('path', { d: 'M0 0 5-12 16-2Z', class: 'pen-tip' }),
      svgNode('path', { d: 'm10-17 11 11', class: 'pen-band' }),
    );
    svg.append(this.nib);
    this.timeline = compileTimeline(board, new Map([...this.views].map(([id, view]) => [id, view.duration])));
    this.actions = this.timeline.beats.flatMap((beat) => beat.actions);
    for (const action of this.actions) this.prepareClip(this.views.get(action.target)!, action);
    this.render(-1, false);
  }

  private createElement(element: BoardElement, sources: readonly Source[]): ElementView {
    const root = svgNode('g', {
      'data-element': element.id,
      'data-kind': element.kind,
      class: `board-element ink-${element.color ?? 'ink'}`,
    });
    const clip = svgNode('clipPath', { id: `clip-${this.board.id}-${element.id}`, clipPathUnits: 'userSpaceOnUse' });
    this.defs.append(clip);
    const view: ElementView = {
      element, root, strokes: [], duration: 0, bounds: boundsOf(element), clip, clipParts: [],
    };
    let target: SVGGElement | SVGAElement = root;
    if (element.kind === 'text' && element.source) {
      const source = sources.find((item) => item.id === element.source);
      if (!source) throw new Error(`Missing source ${element.source}.`);
      const anchor = svgNode('a', {
        href: source.url, target: '_blank', rel: 'noopener noreferrer',
        'aria-label': `Open source: ${source.title}`, role: 'link', tabindex: -1,
        class: 'source-link', 'data-source': source.id,
      });
      root.append(anchor);
      target = anchor;
      view.anchor = anchor;
    }
    this.svg.append(root);
    let cursor = 0;
    const addStroke = (d: string, transform: Transform, width: number, character?: string, index?: number) => {
      const path = svgNode('path', {
        d, fill: 'none', 'stroke-width': width, 'aria-hidden': 'true',
        transform: `translate(${transform.x} ${transform.y}) rotate(${transform.rotation}) scale(${transform.scale})`,
        'data-stroke': 'true',
      });
      if (character !== undefined) {
        path.dataset.character = character;
        path.dataset.characterIndex = String(index);
      }
      target.append(path);
      const length = path.getTotalLength();
      if (!Number.isFinite(length) || length <= 0) throw new Error(`Empty or invalid stroke on ${element.id}.`);
      const pace = 0.94 + seededValue(element.id, view.strokes.length) * 0.14;
      const duration = Math.max(30, length * transform.scale / (element.kind === 'text' ? 0.7 : 1.2)) * pace;
      const stroke: Stroke = { node: path, length, start: cursor, end: cursor + duration, transform };
      view.strokes.push(stroke);
      path.style.strokeDasharray = `${length} ${length}`;
      path.style.strokeDashoffset = String(length);
      cursor += duration + 22;
    };

    if (element.kind === 'text') {
      root.dataset.label = element.text;
      const layout = layoutText(element);
      if (view.anchor) {
        view.anchor.append(svgNode('rect', {
          x: element.x - 5, y: element.y - 3,
          width: layout.width + 10, height: layout.height + 6,
          fill: 'var(--cp-board-paper)', 'fill-opacity': 0, stroke: 'none',
          'aria-hidden': 'true', 'data-link-hitbox': 'true',
        }));
      }
      let previousY = element.y;
      for (const placed of layout.glyphs) {
        if (placed.y - previousY > element.size * 0.8) cursor += 100;
        previousY = placed.y;
        if (placed.character === ' ') {
          cursor += 105;
          continue;
        }
        for (const d of placed.glyph.strokes) {
          addStroke(d, { x: placed.x, y: placed.y, scale: placed.scale, rotation: placed.rotation }, 1.85, placed.character, placed.index);
        }
        cursor += /[.,!?;:]/.test(placed.character) ? 140 : 28;
      }
      if (view.anchor) {
        addStroke(`M${element.x} ${element.y + element.size * 1.05} Q${element.x + layout.width / 2} ${element.y + element.size * 1.05 - 2} ${element.x + layout.width} ${element.y + element.size * 1.05}`, identity, 1.6);
      }
    } else {
      const transform = element.kind === 'path' ? { ...identity, x: element.x, y: element.y } : identity;
      for (const d of shapePaths(element)) addStroke(d, transform, element.kind === 'highlight' ? element.height : 2.7);
      if (element.kind === 'highlight') {
        root.classList.add('marker-highlight');
        for (const stroke of view.strokes) stroke.node.setAttribute('stroke-linecap', 'butt');
      }
    }
    view.duration = Math.max(1, cursor);
    return view;
  }

  private prepareClip(view: ElementView, action: ActionSpan): void {
    const { bounds: b } = view;
    if (['wipe', 'bars', 'wheel'].includes(action.effect)) {
      view.root.setAttribute('clip-path', `url(#${view.clip.id})`);
    }
    if (action.effect === 'wipe') {
      const rect = svgNode('rect', { x: b.x, y: b.y, width: b.width, height: 0 });
      view.clip.append(rect);
      view.clipParts.push(rect);
    }
    if (action.effect === 'bars') {
      for (let index = 0; index < 12; index++) {
        const rect = svgNode('rect', { x: b.x, y: b.y + index * b.height / 12, width: 0, height: b.height / 12 + 0.5 });
        view.clip.append(rect);
        view.clipParts.push(rect);
      }
    }
    if (action.effect === 'wheel') {
      const path = svgNode('path');
      view.clip.append(path);
      view.clipParts.push(path);
    }
  }

  private strokePoint(stroke: Stroke, progress: number): { x: number; y: number } {
    const point = stroke.node.getPointAtLength(stroke.length * clamp(progress));
    const { x, y, scale, rotation } = stroke.transform;
    const radians = rotation * Math.PI / 180;
    return {
      x: x + scale * (point.x * Math.cos(radians) - point.y * Math.sin(radians)),
      y: y + scale * (point.x * Math.sin(radians) + point.y * Math.cos(radians)),
    };
  }

  private penAt(view: ElementView, elapsed: number): { x: number; y: number; lifted: boolean } | undefined {
    let previous: Stroke | undefined;
    for (const stroke of view.strokes) {
      if (elapsed >= stroke.start && elapsed <= stroke.end) {
        return { ...this.strokePoint(stroke, (elapsed - stroke.start) / (stroke.end - stroke.start)), lifted: false };
      }
      if (elapsed < stroke.start) {
        const end = this.strokePoint(stroke, 0);
        if (!previous) return { ...end, lifted: true };
        const begin = this.strokePoint(previous, 1);
        const progress = clamp((elapsed - previous.end) / (stroke.start - previous.end));
        return {
          x: begin.x + (end.x - begin.x) * progress,
          y: begin.y + (end.y - begin.y) * progress - Math.sin(progress * Math.PI) * 7,
          lifted: true,
        };
      }
      previous = stroke;
    }
    return previous ? { ...this.strokePoint(previous, 1), lifted: true } : undefined;
  }

  render(time: number, showPen: boolean): void {
    let pen: { x: number; y: number; lifted: boolean } | undefined;
    for (const action of this.actions) {
      const view = this.views.get(action.target)!;
      const progress = clamp((time - action.start) / (action.end - action.start));
      const visible = time >= action.start;
      const ink = isInkEffect(action.effect);
      const elapsed = progress * view.duration;
      view.root.style.opacity = visible ? String(action.effect === 'fade' || action.effect === 'descend' ? progress : 1) : '0';
      view.root.dataset.progress = progress.toFixed(4);
      view.root.setAttribute('transform', action.effect === 'descend' ? `translate(0 ${-18 * (1 - progress)})` : '');
      for (const stroke of view.strokes) {
        const written = ink ? clamp((elapsed - stroke.start) / (stroke.end - stroke.start)) : visible ? 1 : 0;
        stroke.node.style.visibility = written > 0 ? 'visible' : 'hidden';
        stroke.node.style.strokeDashoffset = String(stroke.length * (1 - written));
      }
      if (view.anchor) {
        const ready = progress === 1;
        view.anchor.setAttribute('tabindex', ready ? '0' : '-1');
        view.anchor.setAttribute('aria-hidden', String(!ready));
        view.anchor.style.pointerEvents = ready ? 'auto' : 'none';
      }
      const b = view.bounds;
      if (action.effect === 'wipe') view.clipParts[0]!.setAttribute('height', String(b.height * progress));
      if (action.effect === 'bars') {
        view.clipParts.forEach((rect, index) => {
          rect.setAttribute('width', String(b.width * progress));
          rect.setAttribute('x', String(b.x + (index % 2 ? b.width * (1 - progress) : 0)));
        });
      }
      if (action.effect === 'wheel') {
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        const radius = Math.hypot(b.width, b.height);
        const angle = progress * Math.PI * 2 - Math.PI / 2;
        const d = progress >= 1
          ? `M${b.x} ${b.y}h${b.width}v${b.height}h${-b.width}Z`
          : `M${cx} ${cy}L${cx} ${cy - radius}A${radius} ${radius} 0 ${progress > 0.5 ? 1 : 0} 1 ${cx + radius * Math.cos(angle)} ${cy + radius * Math.sin(angle)}Z`;
        view.clipParts[0]!.setAttribute('d', d);
      }
      if (showPen && ink && visible && progress < 1) pen = this.penAt(view, elapsed);
    }
    this.nib.style.display = pen ? '' : 'none';
    if (pen) {
      this.nib.setAttribute('transform', `translate(${pen.x} ${pen.y})`);
      this.nib.classList.toggle('lifted', pen.lifted);
    }
  }
}
