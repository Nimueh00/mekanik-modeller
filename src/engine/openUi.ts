import type { CameraRig } from '../core/cameraRig';
import type { Disassembly } from '../core/disassembly';
import type { LabelSystem } from '../core/labels';
import type { PartRegistry } from '../core/registry';
import type { Selection } from '../core/selection';
import type { Panel } from '../core/ui/panel';
import { CAMERA_PRESETS } from './presentation';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** Panel sections for disassembly, camera, layers, labels and part info (VISION §5, top half). */
export function buildOpenUi(
  panel: Panel,
  o: { disassembly: Disassembly; rig: CameraRig; registry: PartRegistry; labels: LabelSystem; selection: Selection },
): void {
  const { disassembly, rig, registry, labels, selection } = o;

  // ---------- İçini aç ----------
  const open = panel.section('İçini aç');
  const slider = open.slider({
    min: 0,
    max: 100,
    step: 0.1,
    value: 0,
    format: (v) => `${Math.round(v)}%`,
    onInput: (v) => {
      disassembly.stopAnimation();
      disassembly.setAmount(v / 100);
      syncButtons();
    },
  });
  const presetsGrid = open.buttons<'close' | 'half' | 'full'>(
    [
      { id: 'close', label: 'Kapat' },
      { id: 'half', label: 'Yarım' },
      { id: 'full', label: 'Tam aç' },
    ],
    {
      columns: 3,
      onSelect: (id) => disassembly.animateTo(id === 'close' ? 0 : id === 'half' ? 0.5 : 1),
    },
  );
  const syncButtons = () => {
    const a = disassembly.amount;
    presetsGrid.setSelected(a < 0.005 ? 'close' : Math.abs(a - 0.5) < 0.005 ? 'half' : a > 0.995 ? 'full' : null);
  };
  disassembly.onChange((a) => {
    slider.set(a * 100);
    syncButtons();
  });
  const names = disassembly.timelineLayers().map((id) => registry.layer(id).shortTr ?? registry.layer(id).nameTr.toLowerCase());
  open.note(`Katmanlar sırayla ayrılır: ${names.join(' · ')}.`);
  syncButtons();

  // ---------- Bakış açısı ----------
  const view = panel.section('Bakış açısı');
  const viewGrid = view.buttons<string>(
    CAMERA_PRESETS.map((p, i) => ({
      id: p.id,
      label: p.label,
      title: p.title,
      span: i === CAMERA_PRESETS.length - 1 && CAMERA_PRESETS.length % 2 === 1 ? 2 : undefined,
    })),
    {
      columns: 2,
      selected: rig.activeId,
      onSelect: (id) => rig.go(CAMERA_PRESETS.find((p) => p.id === id)!),
    },
  );
  rig.onActive((id) => viewGrid.setSelected(id));

  // ---------- Katmanlar ----------
  const layers = panel.section('Katmanlar');
  layers.chips(
    registry.populatedLayers().map((l) => ({ id: l.id, label: l.shortTr ?? l.nameTr, title: l.nameTr })),
    (id, on) => {
      registry.setLayerVisible(id, on);
      const sel = selection.selected;
      if (sel && sel.def.group === id && !on) selection.select(null);
    },
  );
  const labelGrid = layers.buttons<'labels'>([{ id: 'labels', label: 'Etiketler: açık', span: 1 }], {
    columns: 1,
    selected: 'labels',
    onSelect: () => labels.setEnabled(!labels.enabled),
  });
  labels.onToggle((on) => {
    labelGrid.setLabel('labels', on ? 'Etiketler: açık' : 'Etiketler: kapalı');
    labelGrid.setSelected(on ? 'labels' : null);
  });

  // ---------- Parça bilgisi ----------
  const info = panel.section('Parça bilgisi');
  const card = el('div', 'part-info');
  info.append(card);
  const row = (label: string, text: string) => {
    const r = el('div', 'part-info-row');
    r.append(el('div', 'part-info-label', label), el('p', 'part-info-text', text));
    return r;
  };
  const showInfo = () => {
    const p = selection.selected;
    card.replaceChildren();
    if (!p) {
      card.append(el('p', 'part-info-empty', 'Bir parçaya ya da etiketine tıklayın: işlevi, malzemesi ve mühendislik notu burada görünür.'));
      return;
    }
    const close = el('button', 'pnl-btn pnl-btn-small part-info-close', 'Kaldır');
    close.type = 'button';
    close.addEventListener('click', () => selection.select(null));
    card.append(close, el('h3', 'part-info-name', p.def.nameTr));
    card.append(
      row('İşlevi', p.def.info.function),
      row('Malzemesi', p.def.info.material),
      row('Mühendislik notu', p.def.info.notes),
    );
  };
  showInfo();
  selection.onChange((p) => {
    showInfo();
    labels.setHighlighted(p?.def.id ?? null);
    if (p) info.scrollIntoView();
  });
  labels.onPick = (id) => selection.select(id);
}
