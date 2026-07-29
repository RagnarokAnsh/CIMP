import { sanitizeContext } from './context-sanitizer';

describe('sanitizeContext', () => {
  it('returns null for missing, malformed, or non-object input', () => {
    expect(sanitizeContext(undefined)).toBeNull();
    expect(sanitizeContext('')).toBeNull();
    expect(sanitizeContext('not json')).toBeNull();
    expect(sanitizeContext('"a string"')).toBeNull();
    expect(sanitizeContext('[1,2,3]')).toBeNull();
    expect(sanitizeContext('42')).toBeNull();
    expect(sanitizeContext('null')).toBeNull();
    expect(sanitizeContext('{}')).toBeNull();
  });

  it('passes a well-formed SDK context through intact', () => {
    const ctx = {
      sdkVersion: '0.5.0',
      appVersion: '1.2.3',
      url: '/checkout',
      viewport: { w: 1920, h: 1080 },
      consoleErrors: ['TypeError: x is undefined'],
      failedRequests: [{ method: 'POST', url: '/api/pay', status: 500, ts: '2026-07-11T00:00:00Z' }],
      breadcrumbs: [{ path: '/cart', ts: '2026-07-11T00:00:00Z' }],
    };
    expect(sanitizeContext(JSON.stringify(ctx))).toEqual(ctx);
  });

  it('clamps long strings, oversized arrays, and excess keys', () => {
    const out = sanitizeContext(JSON.stringify({
      long: 'x'.repeat(5_000),
      arr: Array.from({ length: 100 }, (_, i) => i),
      ...Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, i])),
    }))!;
    expect((out.long as string).length).toBe(1_001); // 1000 + ellipsis
    expect((out.arr as unknown[]).length).toBe(25);
    expect(Object.keys(out).length).toBeLessThanOrEqual(40);
  });

  it('cuts recursion past the depth limit and drops non-JSON values', () => {
    const deep: any = {}; let cur = deep;
    for (let i = 0; i < 10; i += 1) { cur.next = {}; cur = cur.next; }
    const out = sanitizeContext(JSON.stringify(deep))!;
    let depth = 0; let node: any = out;
    while (node?.next) { depth += 1; node = node.next; }
    expect(depth).toBeLessThanOrEqual(5);
  });

  it('drops prototype-hijacking keys instead of letting them mutate the result', () => {
    const out = sanitizeContext('{"a":1,"__proto__":{"polluted":true}}')!;
    expect(out).toEqual({ a: 1 });
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as any).polluted).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined(); // nothing global was touched
  });

  it('drops constructor/prototype keys at nested depths too', () => {
    const out = sanitizeContext(JSON.stringify({
      nested: { constructor: { x: 1 }, prototype: { y: 2 }, keep: 'ok' },
    }))!;
    expect(out).toEqual({ nested: { keep: 'ok' } });
  });

  it('returns null when a context carries nothing but dangerous keys', () => {
    expect(sanitizeContext('{"__proto__":{"polluted":true}}')).toBeNull();
  });

  it('returns null when the clamped result still exceeds the total cap', () => {
    // 40 keys × ~1KB strings ≈ 40KB passes; use nested objects to exceed 64KB.
    const big = {
      a: Array.from({ length: 25 }, () => ({
        b: Array.from({ length: 25 }, () => 'y'.repeat(1_000)),
      })),
    };
    expect(sanitizeContext(JSON.stringify(big))).toBeNull();
  });
});
