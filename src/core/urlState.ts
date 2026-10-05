/**
 * Shareable state in the URL hash (`#a=0.5&cam=…&p=piston-3`).
 *
 * Machine independent: the app supplies `capture()` (current state → flat
 * key/value pairs) and `apply()` (pairs → state). The hash is rewritten with
 * `history.replaceState` (no history spam, no reload) at most every
 * `interval` ms and only when something changed. A hash is used rather than
 * the query string so the static build works on any host, including a
 * sub-directory of GitHub Pages, without server rewrites.
 */
export type StateMap = Record<string, string>;

export class UrlState {
  private last = '';
  private timer: number | null = null;

  constructor(
    private capture: () => StateMap,
    private apply: (s: StateMap) => void,
    private interval = 500,
  ) {
    window.addEventListener('hashchange', () => {
      if (location.hash.slice(1) !== this.last) this.load();
    });
  }

  /** Read the current hash and apply it (call once the app is ready). */
  load(): void {
    const s = UrlState.parse(location.hash);
    this.last = location.hash.slice(1);
    if (Object.keys(s).length) this.apply(s);
  }

  /** Start writing the state back to the URL. */
  start(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.write(), this.interval);
  }

  /** Full URL of the current state (e.g. for a "copy link" button). */
  link(): string {
    this.write();
    return location.href;
  }

  private write(): void {
    const q = new URLSearchParams(this.capture()).toString().replace(/%2C/g, ',');
    if (q === this.last) return;
    this.last = q;
    history.replaceState(null, '', `${location.pathname}${location.search}${q ? `#${q}` : ''}`);
  }

  static parse(hash: string): StateMap {
    const out: StateMap = {};
    for (const [k, v] of new URLSearchParams(hash.replace(/^#/, ''))) out[k] = v;
    return out;
  }
}
