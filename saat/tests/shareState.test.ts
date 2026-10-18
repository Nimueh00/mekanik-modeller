import { describe, expect, it } from 'vitest';
import { UrlState } from '../src/core/urlState';
import { DEFAULT_SPEED_INDEX, decodeShare, encodeShare, type ShareView } from '../src/ui/shareState';
import { PARTS } from '../src/watch/catalog';
import { TIME_SCALES } from '../src/watch/watchClock';

const known = new Set<string>(Object.values(PARTS).map((p) => p.id));
const base: ShareView = { open: 0, camera: [-190, 120, 500, 0, 0, 0], part: null, view: 'solid', speed: DEFAULT_SPEED_INDEX, pausedAt: null };

/** Through the real hash text, as the browser would carry it. */
const viaHash = (s: ShareView) => decodeShare(UrlState.parse(`#${new URLSearchParams(encodeShare(s)).toString().replace(/%2C/g, ',')}`), known);

describe('paylaşılabilir URL: kodla → çöz', () => {
  it('varsayılan görünüm yalnızca kamerayı yazar', () => {
    expect(encodeShare(base)).toEqual({ cam: '-190,120,500,0,0,0' });
  });

  it('gerçek hız 1 sırasında; varsayılan dizin TIME_SCALES içinde 1’i gösterir', () => {
    expect(TIME_SCALES[DEFAULT_SPEED_INDEX]).toBe(1);
  });

  it('tüm alanlar gidiş-dönüşte korunur', () => {
    const view: ShareView = { open: 0.625, camera: [10, -20, 30, 1, 2, 3], part: 'hairspring', view: 'ghost', speed: 0, pausedAt: 123456.78 };
    const d = viaHash(view);
    expect(d).toEqual({ open: 0.625, camera: [10, -20, 30, 1, 2, 3], part: 'hairspring', view: 'ghost', speed: 0, pausedAt: 123456.78 });
  });

  it('her hız dizini gidiş-dönüşte korunur', () => {
    TIME_SCALES.forEach((_, i) => {
      const d = viaHash({ ...base, speed: i });
      expect(d.speed).toBe(i === DEFAULT_SPEED_INDEX ? null : i); // the default is left out of the link
    });
  });

  it('açıklık üç ondalığa yuvarlanır, kapalıyken yazılmaz; saat yalnızca duraklatılmışsa yazılır', () => {
    expect(encodeShare({ ...base, open: 0.00049 }).a).toBeUndefined();
    expect(encodeShare({ ...base, open: 1 / 3 }).a).toBe('0.333');
    expect(encodeShare(base).t).toBeUndefined();
    expect(encodeShare({ ...base, pausedAt: 0 }).t).toBe('0.00');
  });

  it('kamera tam sayıya yuvarlanır', () => {
    expect(encodeShare({ ...base, camera: [1.4, 2.6, -1.4, 0, 0, 100.5] }).cam).toBe('1,3,-1,0,0,101');
    expect(viaHash({ ...base, camera: [1.4, 2.6, -1.4, 0, 0, 100.5] }).camera).toEqual([1, 3, -1, 0, 0, 101]);
  });
});

describe('paylaşılabilir URL: bozuk değerler yok sayılır', () => {
  const dec = (s: Record<string, string>) => decodeShare(s, known);
  const none = { open: null, camera: null, part: null, view: null, speed: null, pausedAt: null };

  it('boş durum: hepsi null', () => {
    expect(dec({})).toEqual(none);
  });

  it('sayı olmayan, boş ve sonsuz değerler', () => {
    expect(dec({ a: 'abc', t: 'x', s: 'x', cam: 'a,b,c,d,e,f' })).toEqual(none);
    expect(dec({ a: '', t: '  ', s: '', cam: '' })).toEqual(none); // an empty value is not 0
    expect(dec({ a: 'Infinity', t: 'NaN', cam: '1,2,3,4,5,Infinity' })).toEqual(none);
  });

  it('aralık dışı açıklık sıkıştırılır, saat ve hız reddedilir', () => {
    expect(dec({ a: '5' }).open).toBe(1);
    expect(dec({ a: '-2' }).open).toBe(0);
    expect(dec({ t: '-5' }).pausedAt).toBeNull();
    expect(dec({ t: '1e12' }).pausedAt).toBeNull();
    expect(dec({ s: '-1' }).speed).toBeNull();
    expect(dec({ s: String(TIME_SCALES.length) }).speed).toBeNull();
    expect(dec({ s: '1.5' }).speed).toBeNull();
  });

  it('kamera: altı sayı değilse ya da saçma büyüklükteyse yok sayılır', () => {
    expect(dec({ cam: '1,2,3' }).camera).toBeNull();
    expect(dec({ cam: '1,2,3,4,5,6,7' }).camera).toBeNull();
    expect(dec({ cam: '1,2,3,4,5,1e9' }).camera).toBeNull();
    expect(dec({ cam: '1,2,,4,5,6' }).camera).toBeNull();
    expect(dec({ cam: '1,2,3,4,5,6' }).camera).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('bilinmeyen parça ve görünüm yok sayılır; geçerli olanlar korunur', () => {
    expect(dec({ p: 'no-such-part' }).part).toBeNull();
    expect(dec({ p: '' }).part).toBeNull();
    expect(dec({ p: 'balance' }).part).toBe('balance');
    expect(dec({ v: 'xray' }).view).toBeNull();
    expect(dec({ v: 'ghost' }).view).toBe('ghost');
    expect(dec({ v: 'solid' }).view).toBe('solid');
  });

  it('bir değer bozuksa ötekiler yine uygulanır', () => {
    const d = dec({ a: 'zzz', p: 'lever', v: 'ghost', cam: '1,2', s: '4', t: '99' });
    expect(d).toEqual({ open: null, camera: null, part: 'lever', view: 'ghost', speed: 4, pausedAt: 99 });
  });

  it('tanınmayan anahtarlar zarar vermez', () => {
    expect(dec({ foo: 'bar', __proto__: 'x' } as never)).toEqual(none);
  });
});
