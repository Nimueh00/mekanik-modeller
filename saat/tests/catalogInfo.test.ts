import { describe, expect, it } from 'vitest';
import { LAYERS, PARTS } from '../src/watch/catalog';
import { CAGE_RATIO } from '../src/watch/automatic';
import { AUTOMATIC, DATE, ESCAPEMENT, HAIRSPRING, KEYLESS, MOVEMENT, RATCHET, TRAIN } from '../src/watch/specs';
import { REV_PER_HOUR } from '../src/watch/train';

const parts = Object.values(PARTS);

/** Makers and calibre families that must not appear in the texts (generic wording only). */
const BRANDS = [
  'Hamilton', 'Tissot', 'Longines', 'Powermatic', 'Swatch', 'Rolex', 'Omega', 'Seiko', 'Citizen', 'Patek', 'Glucydur', 'Nivarox', 'Nivachron', 'Incabloc', 'Kif', 'Parechoc',
];

describe('katalog: parça bilgi metinleri', () => {
  it('her parçada boş olmayan işlev, malzeme ve not var', () => {
    expect(parts.length).toBeGreaterThan(40);
    for (const p of parts) {
      expect(p.info.function.trim().length, `${p.id}.function`).toBeGreaterThan(20);
      expect(p.info.material.trim().length, `${p.id}.material`).toBeGreaterThan(3); // "Çelik" is a complete answer
      expect(p.info.notes.trim().length, `${p.id}.notes`).toBeGreaterThan(20);
    }
  });

  it('işlev 1–3 cümle, metinler makul uzunlukta, tek satır', () => {
    for (const p of parts) {
      const sentences = p.info.function.split(/[.!?](?:\s|$)/).filter((s) => s.trim()).length;
      expect(sentences, `${p.id}: işlev ${sentences} cümle`).toBeLessThanOrEqual(3);
      for (const k of ['function', 'material', 'notes'] as const) {
        expect(p.info[k].length, `${p.id}.${k}`).toBeLessThan(420);
        expect(p.info[k], `${p.id}.${k}`).not.toMatch(/\n|  /);
        expect(p.info[k], `${p.id}.${k}`).toBe(p.info[k].trim());
      }
    }
  });

  it('metinlerde marka adı yok (Hamilton, Tissot, Longines, Powermatic, Swatch, ETA …)', () => {
    for (const p of parts) {
      const text = [p.nameTr, p.info.function, p.info.material, p.info.notes].join(' ');
      for (const b of BRANDS) expect(text.toLowerCase(), `${p.id}: ${b}`).not.toContain(b.toLowerCase());
      expect(text, `${p.id}: ETA`).not.toMatch(/\bETA\b/);
    }
  });

  it('parça kimlikleri ve katmanlar benzersiz ve tutarlı', () => {
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length);
    const layers = new Set<string>(LAYERS.map((l) => l.id));
    for (const p of parts) expect(layers, p.id).toContain(p.group);
  });

  it('metinlerdeki sayılar özelliklerle (specs.ts, train.ts) uyuşuyor', () => {
    const notes = (id: string) => (parts.find((p) => p.id === id)!.info as { function: string; material: string; notes: string });
    const all = (id: string) => Object.values(notes(id)).join(' ');
    expect(all('balance')).toContain('21.600');
    expect(all('balance')).toContain(`Ø ${String(ESCAPEMENT.balance.diameter).replace('.', ',')} mm`);
    expect(all('balance')).toContain(`≈ ${ESCAPEMENT.balance.amplitudeFullDeg}°`);
    expect(all('balance')).toContain(`≈ ${ESCAPEMENT.balance.amplitudeEmptyDeg}°`);
    expect(all('hairspring')).toContain(`${HAIRSPRING.turns} turluk`);
    expect(all('escape-wheel')).toContain(`${TRAIN.escape.wheel.teeth} diş`);
    expect(all('escape-wheel')).toContain(`dakikada ${Math.abs(REV_PER_HOUR.escape) / 60} tur`);
    expect(all('fourth-wheel')).toContain(`${TRAIN.fourth.wheel.teeth} diş`);
    expect(all('fourth-wheel')).toContain(`${TRAIN.fourth.wheel.teeth}/${TRAIN.escape.pinion.teeth} = ${TRAIN.fourth.wheel.teeth / TRAIN.escape.pinion.teeth}:1`);
    expect(all('third-wheel')).toContain(`${TRAIN.third.wheel.teeth} diş`);
    expect(all('centre-wheel')).toContain(`${TRAIN.centre.wheel.teeth} diş`);
    expect(all('barrel')).toContain('10 saatte');
    expect(all('centre-wheel')).toContain(`${TRAIN.barrel.wheel.teeth} diş`);
    expect(all('ratchet-wheel')).toContain(`${RATCHET.gear.teeth} dişli`);
    expect(all('ratchet-wheel')).toContain(`${RATCHET.saw.teeth} testere`);
    expect(all('date-ring')).toContain(`${DATE.ringTeeth} iç dişli`);
    expect(all('date-driver')).toContain(`${DATE.driver.teeth} diş`);
    expect(all('plate')).toContain(`Ø ${String(MOVEMENT.diameter).replace('.', ',')} mm`);
    expect(all('hour-wheel')).toContain('4:1');
    expect(all('reduction-wheel')).toContain('1/72');
  });

  it('rulman kafesi oranı CAGE_RATIO ile aynı (≈ %67)', () => {
    const pct = Math.round(CAGE_RATIO * 100);
    expect(pct).toBe(67);
    const info = PARTS.rotorBearing.info;
    expect(info.notes).toContain(`%${pct}`);
    expect(info.notes).toContain(`${String(AUTOMATIC.bearing.outerRadius).replace('.', ',')} / (${String(AUTOMATIC.bearing.innerRadius).replace('.', ',')} + ${String(AUTOMATIC.bearing.outerRadius).replace('.', ',')})`);
  });

  it('taç oranları metinlerde özelliklerle aynı (0,83 yelkovan turu, 192°, 50 dakika)', () => {
    expect(PARTS.slidingPinion.info.notes).toContain('0,83');
    expect(PARTS.dateCorrector.info.notes).toContain('192°');
    expect(PARTS.settingWheel.info.notes).toContain('50 dakika');
    expect(KEYLESS.windingPinion.teeth).toBe(10);
    expect(PARTS.windingPinion.info.notes).toContain(`${KEYLESS.windingPinion.teeth} yaprak`);
  });
});
