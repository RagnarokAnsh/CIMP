// Sanitizes the SDK-supplied diagnostics context before it touches the DB.
// The fragment transport means this is raw reporter-controlled input: parse
// defensively, clamp every dimension, and never throw — a bad context must
// not fail the issue report it rides on.

const MAX_TOTAL_BYTES = 64 * 1024;
const MAX_STRING = 1_000;
const MAX_ARRAY_ITEMS = 25;
const MAX_OBJECT_KEYS = 40;
const MAX_DEPTH = 5;

// JSON.parse creates `__proto__` as a plain OWN property, so it survives
// Object.keys — but `out['__proto__'] = v` on a normal object literal hits
// Object.prototype's __proto__ SETTER instead of creating a key: the entry is
// silently swallowed and the sanitized object comes back with a hijacked
// prototype. Nothing global is polluted (the accumulator is fresh and
// JSON.stringify walks own keys only), so this is defensive hardening rather
// than a live RCE — but reporter-controlled input must not be able to hand
// downstream code an object whose inherited members it chose.
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function clampValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return undefined;
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((v) => clampValue(v, depth + 1))
      .filter((v) => v !== undefined);
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    // Drop the dangerous keys before slicing, so a padded payload can't spend
    // the key budget on entries we were going to discard anyway.
    const keys = Object.keys(value as object).filter((k) => !DANGEROUS_KEYS.has(k));
    for (const key of keys.slice(0, MAX_OBJECT_KEYS)) {
      const clamped = clampValue((value as Record<string, unknown>)[key], depth + 1);
      if (clamped !== undefined) out[key.slice(0, 100)] = clamped;
    }
    return out;
  }
  return undefined; // functions/symbols/undefined
}

/**
 * Parse and clamp a raw context JSON string. Returns null (never throws) for
 * anything that isn't a plain object, doesn't parse, or exceeds the total
 * size cap even after clamping.
 */
export function sanitizeContext(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

  const clamped = clampValue(parsed, 0) as Record<string, unknown>;
  if (Object.keys(clamped).length === 0) return null;

  const serialized = JSON.stringify(clamped);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_TOTAL_BYTES) return null;
  return clamped;
}
