import './panel.css';

/**
 * Machine-independent side panel: a header with a hide button and a stack of
 * titled sections. Sections expose small building blocks (button grids,
 * sliders, readouts) so later phases can add "İçini aç", "Bakış açısı",
 * "Katmanlar", … without touching the panel itself.
 */

export interface ButtonOption<T extends string> {
  id: T;
  label: string;
  title?: string;
  /** Grid columns to span (default 1). */
  span?: number;
}

export interface ButtonGrid<T extends string> {
  el: HTMLElement;
  setSelected(id: T | null): void;
  setLabel(id: T, label: string): void;
}

export interface SliderOptions {
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onInput: (v: number) => void;
  /** Optional captions under the slider ends. */
  minLabel?: string;
  maxLabel?: string;
}

export interface Slider {
  el: HTMLElement;
  set(v: number): void;
}

export interface Readout {
  el: HTMLElement;
  set(value: string): void;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class PanelSection {
  readonly el: HTMLElement;
  readonly body: HTMLElement;

  constructor(title: string) {
    this.el = h('section', 'pnl-section');
    const head = h('h2', 'pnl-section-title');
    head.append(h('span', undefined, title), h('i', 'pnl-rule'));
    this.body = h('div', 'pnl-section-body');
    this.el.append(head, this.body);
  }

  buttons<T extends string>(
    options: ButtonOption<T>[],
    opts: { columns: number; selected?: T | null; onSelect: (id: T) => void },
  ): ButtonGrid<T> {
    const grid = h('div', 'pnl-grid');
    grid.style.setProperty('--cols', String(opts.columns));
    const byId = new Map<T, HTMLButtonElement>();
    for (const o of options) {
      const b = h('button', 'pnl-btn', o.label);
      b.type = 'button';
      if (o.title) b.title = o.title;
      if (o.span) b.style.gridColumn = `span ${o.span}`;
      b.addEventListener('click', () => opts.onSelect(o.id));
      byId.set(o.id, b);
      grid.append(b);
    }
    const api: ButtonGrid<T> = {
      el: grid,
      setSelected(id) {
        for (const [k, b] of byId) b.classList.toggle('is-active', k === id);
      },
      setLabel(id, label) {
        const b = byId.get(id);
        if (b) b.textContent = label;
      },
    };
    api.setSelected(opts.selected ?? null);
    this.body.append(grid);
    return api;
  }

  /** Pill-shaped on/off toggles. */
  chips(
    options: { id: string; label: string; title?: string }[],
    onToggle: (id: string, on: boolean) => void,
  ): { el: HTMLElement; set(id: string, on: boolean): void } {
    const wrap = h('div', 'pnl-chips');
    const byId = new Map<string, HTMLButtonElement>();
    for (const o of options) {
      const b = h('button', 'pnl-chip is-on', o.label);
      b.type = 'button';
      if (o.title) b.title = o.title;
      b.setAttribute('aria-pressed', 'true');
      b.addEventListener('click', () => {
        const on = !b.classList.contains('is-on');
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
        onToggle(o.id, on);
      });
      byId.set(o.id, b);
      wrap.append(b);
    }
    this.body.append(wrap);
    return {
      el: wrap,
      set(id, on) {
        const b = byId.get(id);
        if (!b) return;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      },
    };
  }

  slider(o: SliderOptions): Slider {
    const wrap = h('div', 'pnl-slider');
    const row = h('div', 'pnl-slider-row');
    const input = h('input', 'pnl-range');
    input.type = 'range';
    input.min = String(o.min);
    input.max = String(o.max);
    input.step = String(o.step);
    const out = h('output', 'pnl-slider-value');
    row.append(input, out);
    wrap.append(row);
    if (o.minLabel || o.maxLabel) {
      const cap = h('div', 'pnl-slider-caps');
      cap.append(h('span', undefined, o.minLabel ?? ''), h('span', undefined, o.maxLabel ?? ''));
      wrap.append(cap);
    }
    const paint = (v: number) => {
      out.textContent = o.format(v);
      const t = (v - o.min) / (o.max - o.min);
      input.style.setProperty('--fill', `${(t * 100).toFixed(2)}%`);
    };
    input.addEventListener('input', () => {
      const v = Number(input.value);
      paint(v);
      o.onInput(v);
    });
    const api: Slider = {
      el: wrap,
      set(v) {
        input.value = String(v);
        paint(v);
      },
    };
    api.set(o.value);
    this.body.append(wrap);
    return api;
  }

  /** Collapsible/scrollable-into-view helper for sections that update dynamically. */
  scrollIntoView(): void {
    this.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  readout(label: string, initial = '—'): Readout {
    const row = h('div', 'pnl-readout');
    const v = h('span', 'pnl-readout-value', initial);
    row.append(h('span', 'pnl-readout-label', label), v);
    this.body.append(row);
    let last = initial;
    return {
      el: row,
      set(value) {
        if (value !== last) {
          v.textContent = value;
          last = value;
        }
      },
    };
  }

  note(text: string): HTMLElement {
    const p = h('p', 'pnl-note', text);
    this.body.append(p);
    return p;
  }

  append(...els: HTMLElement[]): void {
    this.body.append(...els);
  }
}

export class Panel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private reopen: HTMLButtonElement;
  private listeners: ((open: boolean) => void)[] = [];
  private sections = new Map<string, PanelSection>();
  open = true;

  constructor(parent: HTMLElement, opts: { title: string; hideLabel: string; showLabel: string }) {
    this.el = h('aside', 'pnl');
    this.el.setAttribute('aria-label', opts.title);
    const header = h('header', 'pnl-header');
    const title = h('h1', 'pnl-title', opts.title);
    const hide = h('button', 'pnl-btn pnl-btn-small', opts.hideLabel);
    hide.type = 'button';
    hide.addEventListener('click', () => this.setOpen(false));
    header.append(title, hide);
    this.body = h('div', 'pnl-body');
    this.el.append(header, this.body);

    this.reopen = h('button', 'pnl-btn pnl-reopen', opts.showLabel);
    this.reopen.type = 'button';
    this.reopen.addEventListener('click', () => this.setOpen(true));

    parent.append(this.el, this.reopen);
    this.setOpen(true);
  }

  section(title: string): PanelSection {
    const s = new PanelSection(title);
    this.body.append(s.el);
    this.sections.set(title, s);
    return s;
  }

  /** A section by its title (e.g. to scroll to it or mask it). */
  find(title: string): PanelSection | undefined {
    return this.sections.get(title);
  }

  footer(text: string): HTMLElement {
    const f = h('footer', 'pnl-footer', text);
    this.body.append(f);
    return f;
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.el.classList.toggle('is-hidden', !open);
    this.reopen.classList.toggle('is-visible', !open);
    for (const l of this.listeners) l(open);
  }

  /** Width the panel occupies on the right edge (0 when hidden or on narrow screens). */
  get occupiedWidth(): number {
    if (!this.open || window.innerWidth < 760) return 0;
    return this.el.getBoundingClientRect().width;
  }

  /** Height the panel occupies at the bottom (bottom-sheet layout on narrow screens). */
  get occupiedHeight(): number {
    if (!this.open || window.innerWidth >= 760) return 0;
    return this.el.getBoundingClientRect().height;
  }

  onToggle(l: (open: boolean) => void): void {
    this.listeners.push(l);
  }
}
