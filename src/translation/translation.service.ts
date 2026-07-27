// Machine-translation seam, chosen by env exactly like storage/ and scanning/.
//
// The default is a no-op that reports itself disabled, so an unconfigured
// deployment behaves as it always has: messages are stored and shown verbatim.
// Nothing in the request path ever depends on a translation succeeding — a
// provider outage degrades to "show the original", never to a failed reply.

export interface TranslationResult {
  /** Translated text, or the input unchanged when translation was a no-op. */
  text: string;
  /** BCP-47-ish code the provider detected for the SOURCE text, when it can. */
  detectedSourceLocale: string | null;
}

export abstract class TranslationService {
  /** False when unconfigured — callers skip the work entirely. */
  abstract isEnabled(): boolean;

  /**
   * Translate `text` into `targetLocale`. Implementations must never throw for
   * ordinary failures (provider down, unsupported pair) — return the input
   * unchanged so the caller can fall back to the original.
   */
  abstract translate(
    text: string,
    targetLocale: string,
    sourceLocale?: string,
  ): Promise<TranslationResult>;

  /** Best-effort language detection; null when unknown or disabled. */
  abstract detect(text: string): Promise<string | null>;
}

/** Normalize "en-GB" / "EN_gb" → "en". Providers key on the base language. */
export function baseLocale(locale: string | null | undefined): string | null {
  if (!locale) return null;
  const base = locale.trim().toLowerCase().replace('_', '-').split('-')[0];
  return /^[a-z]{2,3}$/.test(base) ? base : null;
}
