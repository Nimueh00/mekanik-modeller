import type { Panel } from '../core/ui/panel';
import type { CrownPosition } from '../watch/pose';
import { formatReserve } from './format';
import {
  CROWN_POSITIONS,
  type CrownDirection,
  drain,
  holdTurn,
  ineffectiveTurnNote,
  nudge,
  reserveFraction,
  secondsState,
  selectCrownPosition,
  setWrist,
} from './crown';
import type { ClockRef } from './watchUi';

/** How long the "this turn does nothing" note stays on screen after the last such turn, seconds. */
const NOTE_FLASH_SECONDS = 2.2;

export interface WindingUiApi {
  /** Per frame: applies a held turn button and keeps the section in step with the clock. */
  update(dt: number): void;
  /** Turn the crown by `deg` (positive = winding sense); used by the drag in the model. */
  turnBy(deg: number): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * "Kurma ve ayar" section: crown position, crown turning (buttons that keep
 * turning while held; the model's crown can also be dragged, see crownDrag.ts),
 * wrist motion, the reserve gauge and a way to empty the spring quickly. All
 * state lives in the clock; this only reads it every frame, so it stays right
 * when the clock is replaced ("şimdiki saate dön", a shared link, the tour).
 */
export function buildWindingUi(panel: Panel, ref: ClockRef): WindingUiApi {
  const sec = panel.section('Kurma ve ayar');

  // ---------- crown position ----------
  const positions = sec.buttons<string>(
    CROWN_POSITIONS.map((p) => ({ id: String(p.id), label: p.label, title: p.title })),
    {
      columns: 3,
      selected: String(ref.clock.crownPosition),
      onSelect: (id) => {
        selectCrownPosition(ref.clock, Number(id) as CrownPosition);
        sync();
      },
    },
  );
  const seconds = sec.readout('Saniye ibresi');
  const secondsValue = seconds.el.querySelector<HTMLElement>('.pnl-readout-value')!;

  // ---------- crown turning ----------
  let held: CrownDirection | null = null;
  let flash: { text: string; left: number } | null = null;
  const turnGrid = el('div', 'pnl-grid');
  turnGrid.style.setProperty('--cols', '2');
  const turnButton = (direction: CrownDirection, label: string, title: string) => {
    const b = el('button', 'pnl-btn crown-turn', label);
    b.type = 'button';
    b.title = title;
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      held = direction;
      b.classList.add('is-active');
      b.setPointerCapture(e.pointerId);
    });
    const release = () => {
      if (held === direction) held = null;
      b.classList.remove('is-active');
    };
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    // a keyboard press has no pointer hold: it makes one small turn (a mouse click is the end of a hold and does nothing more)
    b.addEventListener('click', (e) => {
      if (e.detail !== 0) return;
      turn(nudge(ref.clock, direction), direction);
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  };
  turnGrid.append(
    turnButton(-1, '◂ Çevir', 'Basılı tutun: taç saat yönünün tersine döner'),
    turnButton(1, 'Çevir ▸', 'Basılı tutun: taç saat yönünde döner'),
  );
  sec.append(turnGrid);

  const hint = sec.note('');
  const showTurnNote = (direction: CrownDirection) => {
    const text = ineffectiveTurnNote(ref.clock.crownPosition, direction);
    if (text) flash = { text, left: NOTE_FLASH_SECONDS };
  };
  const turn = (deg: number, direction: CrownDirection = deg >= 0 ? 1 : -1) => {
    if (deg !== 0) showTurnNote(direction);
  };

  // ---------- wrist motion, reserve ----------
  const extras = sec.buttons<'wrist' | 'drain'>(
    [
      { id: 'wrist', label: 'Bilek hareketi: kapalı', title: 'Rotoru sallar: kurma yönü ne olursa olsun zemberek kurulur' },
      { id: 'drain', label: 'Saati boşalt', title: 'Rezervi ≈ 2 saate indirir: 1 sa/s hızda saatin durması ve balansın sönmesi görülür' },
    ],
    {
      columns: 2,
      onSelect: (id) => {
        if (id === 'wrist') setWrist(ref.clock, !ref.clock.wrist.enabled);
        else drain(ref.clock);
        sync();
      },
    },
  );
  const reserve = sec.readout('Güç rezervi');
  const meter = el('div', 'pnl-meter');
  const fill = el('i', 'pnl-meter-fill');
  meter.append(fill);
  sec.append(meter);
  sec.note('Rezervi bilek hareketi ya da taçla artırın. “Saati boşalt”tan sonra hızı 1 sa/s yapın: rezerv bitince saat durur, balansın genliği söner.');

  // ---------- per-frame sync ----------
  let lastKey = '';
  const sync = () => {
    const c = ref.clock;
    const pos = CROWN_POSITIONS.find((p) => p.id === c.crownPosition)!;
    const second = secondsState(c);
    const shown = flash ? flash.text : pos.hint;
    const key = [c.crownPosition, c.wrist.enabled, second.text, shown, !!flash].join('|');
    if (key !== lastKey) {
      lastKey = key;
      positions.setSelected(String(c.crownPosition));
      extras.setLabel('wrist', c.wrist.enabled ? 'Bilek hareketi: açık' : 'Bilek hareketi: kapalı');
      extras.setSelected(c.wrist.enabled ? 'wrist' : null);
      seconds.set(second.text);
      secondsValue.classList.toggle('is-stopped', second.stopped);
      hint.textContent = shown;
      hint.classList.toggle('is-flash', !!flash);
    }
    const label = c.running ? formatReserve(c.windTurns) : 'bitti';
    reserve.set(label);
    fill.style.width = `${(reserveFraction(c.windTurns) * 100).toFixed(1)}%`;
  };
  sync();

  return {
    update(dt) {
      if (held !== null) turn(holdTurn(ref.clock, held, dt), held);
      if (flash) {
        flash.left -= dt;
        // while a turn that does nothing is still held, the note stays up
        if (held !== null && ineffectiveTurnNote(ref.clock.crownPosition, held)) flash.left = NOTE_FLASH_SECONDS;
        else if (flash.left <= 0) flash = null;
      }
      sync();
    },
    turnBy(deg) {
      if (deg === 0) return;
      ref.clock.turnCrown(deg);
      turn(deg);
    },
  };
}
