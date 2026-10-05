import './coach.css';

export interface CoachAction {
  label: string;
  primary?: boolean;
  /** Visually de-emphasised (e.g. "end tour"). */
  quiet?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export interface CoachContent {
  /** Small caption above the title, e.g. "Tur · 3 / 6". */
  kicker?: string;
  title: string;
  /** Paragraphs of body text. */
  body: string[];
  /** Optional choice buttons (quiz answers), shown as a grid under the text. */
  choices?: { label: string; state?: 'correct' | 'wrong' | 'dim'; onClick?: () => void }[];
  /** Feedback line under the choices. */
  feedback?: { text: string; tone: 'good' | 'bad' | 'info' };
  /** Progress dots: total and current index. */
  progress?: { total: number; current: number; onPick?: (i: number) => void };
  actions: CoachAction[];
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * A floating card over the 3D view for guided content (a tour step, a quiz
 * question). Machine independent: callers render plain content objects.
 * Sits bottom-left on wide screens and at the top on phones (where the panel
 * is a bottom sheet). `Escape` triggers the action marked `quiet`.
 */
export class CoachCard {
  readonly el = h('section', 'coach');
  private escape: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-live', 'polite');
    parent.append(this.el);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.visible && this.escape) this.escape();
    });
  }

  get visible(): boolean {
    return this.el.classList.contains('is-open');
  }

  show(c: CoachContent): void {
    this.el.replaceChildren();
    // scrolling content above a fixed footer, so the buttons stay reachable on small screens
    const el = h('div', 'coach-main');
    this.el.append(el);
    if (c.kicker) el.append(h('div', 'coach-kicker', c.kicker));
    el.append(h('h2', 'coach-title', c.title));
    for (const p of c.body) el.append(h('p', 'coach-text', p));
    if (c.choices) {
      const grid = h('div', 'coach-choices');
      for (const ch of c.choices) {
        const b = h('button', `coach-choice${ch.state ? ` is-${ch.state}` : ''}`, ch.label);
        b.type = 'button';
        if (ch.onClick) b.addEventListener('click', ch.onClick);
        else b.disabled = true;
        grid.append(b);
      }
      el.append(grid);
    }
    if (c.feedback) el.append(h('p', `coach-feedback is-${c.feedback.tone}`, c.feedback.text));
    const foot = h('div', 'coach-foot');
    if (c.progress) {
      const dots = h('div', 'coach-dots');
      for (let i = 0; i < c.progress.total; i++) {
        const d = h('button', `coach-dot${i === c.progress.current ? ' is-on' : i < c.progress.current ? ' is-done' : ''}`);
        d.type = 'button';
        d.setAttribute('aria-label', `${i + 1}`);
        const pick = c.progress.onPick;
        if (pick) d.addEventListener('click', () => pick(i));
        else d.tabIndex = -1;
        dots.append(d);
      }
      foot.append(dots);
    }
    const acts = h('div', 'coach-actions');
    this.escape = null;
    for (const a of c.actions) {
      const b = h('button', `pnl-btn coach-btn${a.primary ? ' is-primary' : ''}${a.quiet ? ' is-quiet' : ''}`, a.label);
      b.type = 'button';
      b.disabled = !!a.disabled;
      b.addEventListener('click', a.onClick);
      if (a.quiet) this.escape = a.onClick;
      acts.append(b);
    }
    foot.append(acts);
    this.el.append(foot);
    this.el.classList.add('is-open');
  }

  hide(): void {
    this.el.classList.remove('is-open');
    this.escape = null;
  }
}
