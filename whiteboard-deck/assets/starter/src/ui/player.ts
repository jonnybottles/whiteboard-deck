import type { Board, Deck, Source } from '../model.ts';
import { Playback } from '../engine/playback.ts';
import { BoardRenderer } from '../engine/renderer.ts';

function required<K extends keyof HTMLElementTagNameMap>(id: string, tag: K): HTMLElementTagNameMap[K] {
  const value = document.querySelector<HTMLElementTagNameMap[K]>(`${tag}#${id}`);
  if (!value) throw new Error(`The presentation is missing ${tag}#${id}.`);
  return value;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, content?: string, className?: string): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (content !== undefined) result.textContent = content;
  if (className) result.className = className;
  return result;
}

export class Presentation {
  private readonly abort = new AbortController();
  private readonly svg: SVGSVGElement;
  private renderer?: BoardRenderer;
  private rendererIndex = -1;
  private frame?: number;
  private lastFrame?: number;
  private renderedBoard = -1;
  private panelKey = '';
  private announcementKey = '';
  private fullscreenReturnFocus?: HTMLElement | SVGElement;
  private readonly playback: Playback;
  private readonly controls = {
    start: required('start', 'button'),
    previous: required('previous', 'button'),
    play: required('play', 'button'),
    next: required('next', 'button'),
    replay: required('replay', 'button'),
    autoplay: required('autoplay', 'button'),
    all: required('show-all', 'button'),
    notes: required('notes', 'button'),
    fullscreen: required('fullscreen', 'button'),
    speed: required('speed', 'select'),
    select: required('board-select', 'select'),
    instant: required('instant', 'input'),
  };
  private readonly panel = required('detail-panel', 'aside');
  private readonly panelMode = required('panel-mode', 'select');
  private readonly panelContent = required('panel-content', 'div');
  private readonly overlay = required('start-overlay', 'div');
  private readonly progress = required('beat-progress', 'div');
  private readonly help = required('shortcuts-dialog', 'dialog');

  private get isPresenting(): boolean {
    return document.fullscreenElement === document.documentElement;
  }

  constructor(private readonly deck: Deck) {
    const svg = document.querySelector<SVGSVGElement>('svg#board');
    if (!svg) throw new Error('The SVG whiteboard is missing.');
    this.svg = svg;
    this.playback = new Playback(deck.boards.length, (index) => {
      if (this.rendererIndex !== index) {
        this.renderer = new BoardRenderer(this.svg, deck.boards[index]!, deck.sources);
        this.rendererIndex = index;
      }
      return this.renderer!.timeline;
    });
    required('deck-title', 'h1').textContent = deck.title;
    required('deck-caption', 'p').textContent = deck.caption;
    document.title = `${deck.title} | ${deck.subtitle}`;
    for (const [index, board] of deck.boards.entries()) {
      const option = node('option', `${String(index + 1).padStart(2, '0')} / ${board.title}`);
      option.value = String(index);
      this.controls.select.append(option);
    }
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.playback.setReducedMotion(motion.matches);
    motion.addEventListener('change', (event) => this.act(() => this.playback.setReducedMotion(event.matches)), { signal: this.abort.signal });
    this.bind();
    this.render();
  }

  private bind(): void {
    const bind = (button: HTMLButtonElement, action: () => void) => {
      button.addEventListener('click', () => this.act(action), { signal: this.abort.signal });
    };
    bind(this.controls.start, () => this.playback.next());
    bind(this.controls.previous, () => this.playback.previous());
    bind(this.controls.next, () => this.playback.next());
    bind(this.controls.play, () => this.playback.playPause());
    bind(this.controls.replay, () => this.playback.replay());
    bind(this.controls.autoplay, () => this.playback.toggleAutoplay());
    bind(this.controls.all, () => this.playback.showAll());
    bind(this.controls.notes, () => this.togglePanel());
    bind(required('close-panel', 'button'), () => {
      this.togglePanel(false);
      this.controls.notes.focus();
    });
    bind(required('help', 'button'), () => this.openHelp());
    bind(required('close-help', 'button'), () => this.help.close());
    this.controls.fullscreen.addEventListener('click', () => void this.toggleFullscreen(), { signal: this.abort.signal });
    this.controls.speed.addEventListener('change', () => this.act(() => this.playback.setSpeed(Number(this.controls.speed.value))), { signal: this.abort.signal });
    this.controls.select.addEventListener('change', () => this.act(() => this.playback.selectBoard(Number(this.controls.select.value))), { signal: this.abort.signal });
    this.controls.instant.addEventListener('change', () => this.act(() => this.playback.setReducedMotion(this.controls.instant.checked)), { signal: this.abort.signal });
    this.panelMode.addEventListener('change', () => this.render(), { signal: this.abort.signal });
    window.addEventListener('keydown', (event) => this.keydown(event), { signal: this.abort.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.act(() => this.playback.pause());
    }, { signal: this.abort.signal });
    document.addEventListener('fullscreenchange', () => {
      this.controls.fullscreen.setAttribute('aria-label', this.isPresenting ? 'Leave presenter view' : 'Enter presenter view');
      if (this.isPresenting) {
        if (this.help.open) this.help.close();
        this.svg.focus({ preventScroll: true });
      } else {
        const previous = this.fullscreenReturnFocus;
        this.fullscreenReturnFocus = undefined;
        (previous?.isConnected ? previous : this.svg).focus({ preventScroll: true });
      }
    }, { signal: this.abort.signal });
    window.addEventListener('pagehide', (event) => {
      if (event.persisted) this.act(() => this.playback.pause());
      else this.dispose();
    }, { signal: this.abort.signal });
  }

  private act(action: () => void): void {
    try {
      if (this.frame !== undefined) cancelAnimationFrame(this.frame);
      this.frame = undefined;
      this.lastFrame = undefined;
      action();
      this.render();
      this.schedule();
    } catch (error) {
      this.fail(error);
    }
  }

  private schedule(): void {
    if (this.playback.state.running && this.frame === undefined) {
      this.frame = requestAnimationFrame((now) => this.tick(now));
    }
  }

  private tick(now: number): void {
    this.frame = undefined;
    try {
      if (!this.playback.state.running) return;
      const delta = this.lastFrame === undefined ? 0 : Math.min(80, Math.max(0, now - this.lastFrame));
      this.lastFrame = now;
      this.playback.advance(delta);
      this.render();
      if (this.playback.state.running) this.schedule();
      else this.lastFrame = undefined;
    } catch (error) {
      this.fail(error);
    }
  }

  private render(): void {
    const s = this.playback.state;
    const board = this.deck.boards[s.board]!;
    const timeline = this.playback.timeline;
    this.renderer!.render(this.playback.time, s.active !== null && !s.reducedMotion);
    this.svg.dataset.completed = String(s.completed);
    this.svg.dataset.active = s.active === null ? '' : String(s.active);
    this.svg.dataset.running = String(s.running);
    this.svg.dataset.time = this.playback.time.toFixed(2);
    if (this.renderedBoard !== s.board) {
      this.renderedBoard = s.board;
      this.progress.replaceChildren();
      for (const [index, beat] of board.beats.entries()) {
        const button = node('button');
        button.type = 'button';
        button.setAttribute('aria-label', `Show through step ${index + 1}: ${beat.title}`);
        button.title = `${index + 1}. ${beat.title}`;
        button.addEventListener('click', () => this.act(() => this.playback.seekBoundary(index + 1)));
        this.progress.append(button);
      }
      required('board-number', 'span').textContent = `${String(s.board + 1).padStart(2, '0')} / ${String(this.deck.boards.length).padStart(2, '0')}`;
      required('board-name', 'span').textContent = board.title;
      required('board-theme', 'span').textContent = board.theme;
      required('start-title', 'h2').textContent = board.intro;
      required('start-description', 'p').textContent = s.board === 0 ? 'One thought at a time. Move at your own pace.' : 'A fresh board. Draw the next part of the story.';
    }
    [...this.progress.children].forEach((button, index) => {
      button.classList.toggle('complete', index < s.completed);
      button.classList.toggle('active', index === s.active);
      button.setAttribute('aria-current', index === s.active || (s.active === null && index === s.completed - 1) ? 'step' : 'false');
    });
    this.overlay.hidden = s.active !== null || s.completed > 0;
    this.controls.previous.disabled = s.board === 0 && s.completed === 0 && s.active === null;
    this.controls.next.disabled = this.playback.atEnd;
    this.controls.play.disabled = this.playback.atEnd;
    this.controls.autoplay.disabled = s.reducedMotion || this.playback.atEnd;
    this.controls.autoplay.setAttribute('aria-pressed', String(s.autoplay));
    this.controls.instant.checked = s.reducedMotion;
    this.controls.speed.value = String(s.speed);
    this.controls.select.value = String(s.board);
    this.controls.play.setAttribute('aria-label', s.running ? 'Pause drawing' : 'Play current step');
    const icon = document.querySelector<SVGPathElement>('#play-icon path');
    if (icon) icon.setAttribute('d', s.running ? 'M8 5v14M16 5v14' : 'm9 5 10 7-10 7Z');
    const nextLabel = this.playback.atEnd ? 'End of deck' : s.active !== null ? 'Finish step' : s.completed === timeline.beats.length ? 'Next board' : 'Next step';
    if (this.controls.next.dataset.label !== nextLabel) {
      this.controls.next.dataset.label = nextLabel;
      const arrow = node('span', '\u2192');
      arrow.setAttribute('aria-hidden', 'true');
      this.controls.next.replaceChildren(document.createTextNode(`${nextLabel} `), arrow);
    }
    const currentIndex = s.active ?? Math.max(0, s.completed - 1);
    const current = board.beats[currentIndex]!;
    required('step-count', 'span').textContent = `${String(s.active === null ? s.completed : s.active + 1).padStart(2, '0')} / ${String(board.beats.length).padStart(2, '0')}`;
    required('step-title', 'span').textContent = s.active === null && s.completed === 0 ? 'Ready when you are' : current.title;
    required('playback-status', 'span').textContent = s.running ? s.autoplay ? 'Autoplay / drawing' : 'Drawing' : s.active !== null ? 'Paused' : s.completed === board.beats.length ? 'Board complete' : 'Presenter mode';
    const announcementKey = `${s.board}:${s.completed}:${s.active}`;
    if (announcementKey !== this.announcementKey) {
      this.announcementKey = announcementKey;
      required('announcement', 'p').textContent = `${board.title}. ${s.active !== null ? `Drawing step ${s.active + 1}: ${current.title}` : s.completed ? `Step ${s.completed} complete.` : 'Blank canvas, ready to draw.'}`;
    }
    this.renderPanel(board, currentIndex);
  }

  private renderPanel(board: Board, currentIndex: number): void {
    const key = `${board.id}:${currentIndex}:${this.panelMode.value}:${this.panel.hidden}`;
    if (key === this.panelKey || this.panel.hidden) return;
    this.panelKey = key;
    this.panelContent.replaceChildren();
    if (this.panelMode.value === 'notes') {
      const beat = board.beats[currentIndex]!;
      this.panelContent.append(node('p', `Step ${currentIndex + 1} / ${board.beats.length}`, 'note-eyebrow'), node('h3', beat.title), node('p', beat.notes));
      this.panelContent.append(node('h4', 'The whole board'), node('p', board.description));
      if (beat.sources.length) {
        this.panelContent.append(node('h4', 'Sources for this step'));
        for (const id of beat.sources) this.panelContent.append(this.sourceEntry(this.deck.sources.find((source) => source.id === id)!));
      }
    } else if (this.panelMode.value === 'transcript') {
      this.panelContent.append(node('h3', board.title), node('p', board.description));
      for (const [index, beat] of board.beats.entries()) {
        const section = node('section', undefined, 'transcript-step');
        section.append(node('h4', `${index + 1}. ${beat.title}`));
        for (const action of beat.actions) {
          const element = board.elements.find((item) => item.id === action.target);
          if (element?.kind === 'text') section.append(node('p', element.text));
        }
        this.panelContent.append(section);
      }
    } else if (this.panelMode.value === 'sources') {
      this.panelContent.append(node('h3', 'Sources, not live services'), node('p', 'These notes are stored in the file. Opening an external source is optional and needs an internet connection.'));
      for (const source of this.deck.sources) this.panelContent.append(this.sourceEntry(source));
    } else throw new Error(`Unknown companion view ${this.panelMode.value}.`);
  }

  private sourceEntry(source: Source): HTMLElement {
    const entry = node('div', undefined, 'source-entry');
    const link = node('a', source.title);
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    entry.append(link, node('span', `Checked ${source.checked}`, 'source-date'), node('p', source.supports));
    if (source.caveat) entry.append(node('p', source.caveat, 'caveat'));
    return entry;
  }

  private togglePanel(open = this.panel.hidden): void {
    this.panel.hidden = !open;
    this.controls.notes.setAttribute('aria-expanded', String(open));
    this.panelKey = '';
  }

  private openHelp(): void {
    this.playback.pause();
    if (!this.help.open) this.help.showModal();
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.fullscreenEnabled) {
        const focused = document.activeElement;
        this.fullscreenReturnFocus = focused instanceof HTMLElement || focused instanceof SVGElement ? focused : undefined;
        await document.documentElement.requestFullscreen();
      }
      else throw new Error('Fullscreen is not available in this browser context. The presentation still works in the normal window.');
    } catch (error) {
      this.fullscreenReturnFocus = undefined;
      this.showError(error);
    }
  }

  private keydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.altKey || event.metaKey || this.help.open) return;
    const key = event.key.toLowerCase();
    if (this.isPresenting && (key === 'escape' || key === 'f')) {
      event.preventDefault();
      if (!event.repeat) void this.toggleFullscreen();
      return;
    }
    if (this.isPresenting && (key === 'n' || key === '?')) return;
    if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea, [contenteditable="true"]')
      && !(key === 'f' && event.target === this.controls.fullscreen)) return;
    const actions: Record<string, (() => void) | undefined> = {
      ' ': () => this.playback.next(),
      arrowright: () => this.playback.next(),
      pagedown: () => this.playback.next(),
      arrowleft: () => this.playback.previous(),
      pageup: () => this.playback.previous(),
      k: () => this.playback.playPause(),
      r: () => this.playback.replay(),
      a: () => this.playback.toggleAutoplay(),
      n: () => this.togglePanel(),
      '?': () => this.openHelp(),
      f: () => { void this.toggleFullscreen(); },
    };
    const action = actions[key];
    if (!action || (event.repeat && ![' ', 'arrowright', 'arrowleft', 'pageup', 'pagedown'].includes(key))) return;
    event.preventDefault();
    this.act(action);
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(error);
    const target = required('error', 'p');
    target.textContent = message;
    target.hidden = false;
  }

  private fail(error: unknown): void {
    this.playback.pause();
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.showError(error);
  }

  dispose(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.playback.pause();
    this.abort.abort();
  }
}
