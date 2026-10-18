import type { Panel } from '../core/ui/panel';
import { BEATS_PER_SECOND, MOVEMENT } from '../watch/specs';
import { TIME_SCALES, WatchClock } from '../watch/watchClock';
import type { GhostView, WatchView } from './ghost';
import { formatAmplitude, formatDialTime, formatReserve } from './format';
import { SPEED_OPTIONS, speedIndex } from './speeds';
import type { WatchSound } from './sound';

/** The clock lives in a holder so that "şimdiki saate dön" can replace it (the clock has no seek). */
export interface ClockRef {
  clock: WatchClock;
}

export interface WatchUiHooks {
  sound: WatchSound;
  ghost: GhostView;
}

/** Panel handles other features use to keep the controls in sync. */
export interface WatchUiApi {
  update(fps: number): void;
  setSpeed(scale: number): void;
  setPaused(paused: boolean): void;
  setView(v: WatchView): void;
}

/** A clock showing the wall-clock time of `now`, keeping speed, pause and the wind of `from`. */
export function clockAt(from: WatchClock, now: Date): WatchClock {
  const c = WatchClock.fromDate(now, { timeScale: from.timeScale, windTurns: from.windTurns });
  c.paused = from.paused;
  return c;
}

/**
 * Upper half of the control panel: time (speeds, pause, single beat, the
 * readings) and the solid/ghost view. Disassembly, viewpoints, layers and
 * part info come from openUi.ts below these.
 */
export function buildWatchUi(panel: Panel, ref: ClockRef, o: WatchUiHooks): WatchUiApi {
  // ---------- Zaman ----------
  const time = panel.section('Zaman');
  const speedGrid = time.buttons<string>(
    SPEED_OPTIONS.map((s, i) => ({ id: String(i), label: s.label, title: s.title })),
    {
      columns: 3,
      selected: String(speedIndex(ref.clock.timeScale)),
      onSelect: (id) => setSpeed(SPEED_OPTIONS[Number(id)]!.scale),
    },
  );
  const controls = time.buttons<'pause' | 'step' | 'now'>(
    [
      { id: 'pause', label: '❚❚ Duraklat', title: 'Durdur / oynat (boşluk)' },
      { id: 'step', label: 'Bir vuruş ▸', title: 'Duraklatılmışken tek bir vuruş ilerlet (→)' },
      { id: 'now', label: 'Şimdiki saate dön', span: 2, title: 'Mekanizmayı bilgisayarın saatine ayarla' },
    ],
    {
      columns: 2,
      onSelect: (id) => {
        const c = ref.clock;
        if (id === 'pause') c.paused = !c.paused;
        else if (id === 'step') {
          if (c.paused) c.stepBeats(1);
        } else ref.clock = clockAt(c, new Date());
        sync();
      },
    },
  );
  const stepButton = controls.el.querySelectorAll('button')[1]!;

  // sound: off by default; the first click also unlocks Web Audio (autoplay policy)
  const soundGrid = time.buttons<'sound'>([{ id: 'sound', label: '🔈 Sesi aç', title: 'Vuruşlarla senkron, sentezlenmiş tik-tak (60× ve üstünde kısık vızıltı)' }], {
    columns: 1,
    onSelect: () => {
      void o.sound.setOn(!o.sound.on);
      soundGrid.setLabel('sound', o.sound.on ? '🔊 Sesi kapat' : '🔈 Sesi aç');
      soundGrid.setSelected(o.sound.on ? 'sound' : null);
    },
  });

  const reading = time.readout('Saatin gösterdiği');
  const beats = time.readout('Vuruş / saat');
  const amplitude = time.readout('Balans genliği');
  const reserve = time.readout('Güç rezervi');
  beats.set(`${(BEATS_PER_SECOND * 3600).toLocaleString('tr-TR')} (${MOVEMENT.frequencyHz} Hz)`);

  const sync = () => {
    const c = ref.clock;
    speedGrid.setSelected(String(speedIndex(c.timeScale)));
    controls.setLabel('pause', c.paused ? '▶ Oynat' : '❚❚ Duraklat');
    controls.setSelected(c.paused ? 'pause' : null);
    stepButton.disabled = !c.paused;
  };
  const setSpeed = (scale: number) => {
    ref.clock.timeScale = scale;
    ref.clock.paused = false;
    sync();
  };
  sync();

  // ---------- Görünüm ----------
  const look = panel.section('Görünüm');
  const viewGrid = look.buttons<WatchView>(
    [
      { id: 'solid', label: 'Katı', title: 'Plaka, köprüler ve kadran katı' },
      { id: 'ghost', label: 'Hayalet', title: 'Plaka, köprüler ve kadran yarı saydam: takım ve çıkış görünür' },
    ],
    { columns: 2, selected: o.ghost.mode, onSelect: (v) => setView(v) },
  );
  const setView = (v: WatchView) => {
    o.ghost.set(v);
    viewGrid.setSelected(v);
  };

  const footer = panel.footer('');

  // keyboard
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const c = ref.clock;
    if (e.code === 'Space') {
      e.preventDefault();
      c.paused = !c.paused;
      sync();
    } else if (e.code === 'ArrowRight' && c.paused) c.stepBeats(1);
  });

  const update = (fps: number) => {
    const c = ref.clock;
    reading.set(formatDialTime(c.t + c.handOffset)); // the hands, which the crown can set ahead of the movement
    amplitude.set(formatAmplitude(c.balanceAmplitude));
    reserve.set(c.running ? formatReserve(c.windTurns) : 'bitti');
    stepButton.disabled = !c.paused;
    footer.textContent = `Ø ${MOVEMENT.diameter.toLocaleString('tr-TR')} mm · ${Math.round(fps)} fps`;
  };
  return {
    update,
    setSpeed(scale) {
      if (!TIME_SCALES.includes(scale as (typeof TIME_SCALES)[number])) return;
      setSpeed(scale);
    },
    setPaused(paused) {
      ref.clock.paused = paused;
      sync();
    },
    setView,
  };
}
