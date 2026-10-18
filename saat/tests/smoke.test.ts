import { describe, expect, it } from 'vitest';
import { MachineClock } from '../src/core/clock';
import { gearRadii, involuteGearOutline } from '../src/core/geometry/gear';

describe('saat iskeleti', () => {
  it('çark dişinin en uç noktası gearRadii(...).tip ile eşleşir', () => {
    const outline = involuteGearOutline({ teeth: 80, module: 1.2 });
    const farthest = Math.max(...outline.map(([x, y]) => Math.hypot(x, y)));
    expect(Math.abs(farthest - gearRadii(80, 1.2).tip)).toBeLessThanOrEqual(1e-9);
  });

  it('makine saati oluşturulabilir ve krank açısı 0 ile başlar', () => {
    const clock = new MachineClock({ rpm: 60 });
    expect(clock.crankAngle).toBe(0);
  });
});
