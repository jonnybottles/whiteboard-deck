import type { BoardTimeline } from './timeline.ts';

export interface PlaybackState {
  board: number;
  completed: number;
  active: number | null;
  elapsed: number;
  running: boolean;
  autoplay: boolean;
  speed: number;
  reducedMotion: boolean;
}

export class Playback {
  readonly state: PlaybackState = {
    board: 0, completed: 0, active: null, elapsed: 0,
    running: false, autoplay: false, speed: 1, reducedMotion: false,
  };
  private readonly hold = 850;

  constructor(readonly boardCount: number, private readonly load: (index: number) => BoardTimeline) {
    if (!Number.isInteger(boardCount) || boardCount < 1) throw new Error('Playback needs at least one board.');
  }

  get timeline(): BoardTimeline {
    return this.load(this.state.board);
  }

  get time(): number {
    const s = this.state;
    if (s.active !== null) {
      const beat = this.timeline.beats[s.active]!;
      return Math.min(beat.end, beat.start + s.elapsed);
    }
    return s.completed ? this.timeline.beats[s.completed - 1]!.end : -1;
  }

  get atEnd(): boolean {
    return this.state.board === this.boardCount - 1 && this.state.completed === this.timeline.beats.length;
  }

  private finish(): void {
    const s = this.state;
    if (s.active !== null) s.completed = s.active + 1;
    s.active = null;
    s.elapsed = 0;
    s.running = false;
  }

  private startNext(): boolean {
    const s = this.state;
    if (s.completed === this.timeline.beats.length) {
      if (s.board === this.boardCount - 1) return false;
      this.selectBoard(s.board + 1);
    }
    s.active = s.completed;
    s.elapsed = 0;
    s.running = true;
    if (s.reducedMotion) this.finish();
    return true;
  }

  next(): void {
    if (this.state.active !== null) this.finish();
    else this.startNext();
  }

  previous(): void {
    const s = this.state;
    s.running = false;
    if (s.active !== null) {
      s.active = null;
      s.elapsed = 0;
    } else if (s.completed > 0) {
      s.completed--;
    } else if (s.board > 0) {
      this.selectBoard(s.board - 1);
      this.showAll();
    }
  }

  playPause(): void {
    const s = this.state;
    if (s.running) s.running = false;
    else if (s.active !== null) {
      s.running = true;
      if (s.reducedMotion) this.finish();
    } else this.startNext();
  }

  pause(): void {
    this.state.running = false;
  }

  replay(): void {
    this.selectBoard(this.state.board);
    this.startNext();
  }

  selectBoard(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.boardCount) throw new Error(`Invalid board index ${index}.`);
    Object.assign(this.state, { board: index, completed: 0, active: null, elapsed: 0, running: false });
    this.load(index);
  }

  seekBoundary(completed: number): void {
    if (!Number.isInteger(completed) || completed < 0 || completed > this.timeline.beats.length) throw new Error('Invalid step boundary.');
    Object.assign(this.state, { completed, active: null, elapsed: 0, running: false });
  }

  showAll(): void {
    this.seekBoundary(this.timeline.beats.length);
  }

  setSpeed(value: number): void {
    if (![0.5, 1, 1.5, 2].includes(value)) throw new Error(`Unsupported playback speed ${value}.`);
    this.state.speed = value;
  }

  setReducedMotion(value: boolean): void {
    this.state.reducedMotion = value;
    if (value) {
      this.state.autoplay = false;
      this.finish();
    }
  }

  toggleAutoplay(): void {
    const s = this.state;
    if (s.reducedMotion) return;
    s.autoplay = !s.autoplay;
    if (s.autoplay && !s.running) this.playPause();
  }

  advance(realDelta: number): void {
    if (!Number.isFinite(realDelta) || realDelta < 0) throw new Error('Playback delta must be finite and nonnegative.');
    let remaining = realDelta * this.state.speed;
    const s = this.state;
    while (remaining > 0 && s.running && s.active !== null) {
      const beat = this.timeline.beats[s.active]!;
      const limit = beat.end - beat.start + (s.autoplay ? this.hold : 0);
      const consumed = Math.min(remaining, Math.max(0, limit - s.elapsed));
      s.elapsed += consumed;
      remaining -= consumed;
      if (s.elapsed >= limit) {
        this.finish();
        if (s.autoplay && !this.startNext()) s.autoplay = false;
      }
    }
  }
}
