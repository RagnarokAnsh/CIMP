import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TranslationResult, TranslationService, baseLocale,
} from './translation.service';

const REQUEST_TIMEOUT_MS = 8_000;

// LibreTranslate-compatible provider (self-hostable, and the API shape most
// small translation services copy). Point TRANSLATE_API_URL at your instance.
//
// Every failure path returns the ORIGINAL text: a machine translation is a
// convenience layered on top of a message that is already stored and readable,
// so a provider outage must never surface as an error to the person replying.
@Injectable()
export class LibreTranslateService extends TranslationService {
  private readonly logger = new Logger(LibreTranslateService.name);
  private readonly apiUrl: string | undefined;
  private readonly apiKey: string | undefined;

  constructor(private readonly config: ConfigService) {
    super();
    this.apiUrl = this.config.get<string>('translation.apiUrl');
    this.apiKey = this.config.get<string>('translation.apiKey');
  }

  isEnabled(): boolean {
    return Boolean(this.apiUrl);
  }

  async translate(
    text: string,
    targetLocale: string,
    sourceLocale?: string,
  ): Promise<TranslationResult> {
    const target = baseLocale(targetLocale);
    if (!this.isEnabled() || !target || !text.trim()) {
      return { text, detectedSourceLocale: null };
    }
    const source = baseLocale(sourceLocale) ?? 'auto';
    if (source === target) return { text, detectedSourceLocale: source === 'auto' ? null : source };

    try {
      const res = await this.post('/translate', {
        q: text,
        source,
        target,
        format: 'text',
      });
      if (!res) return { text, detectedSourceLocale: null };
      const body = res as {
        translatedText?: string;
        detectedLanguage?: { language?: string };
      };
      return {
        text: body.translatedText?.trim() ? body.translatedText : text,
        detectedSourceLocale: baseLocale(body.detectedLanguage?.language) ?? null,
      };
    } catch (err) {
      this.logger.warn(`translate → ${target} failed: ${(err as Error).message}`);
      return { text, detectedSourceLocale: null };
    }
  }

  async detect(text: string): Promise<string | null> {
    if (!this.isEnabled() || !text.trim()) return null;
    try {
      const res = await this.post('/detect', { q: text });
      // LibreTranslate returns [{ confidence, language }], best first.
      const first = Array.isArray(res) ? (res[0] as { language?: string } | undefined) : undefined;
      return baseLocale(first?.language);
    } catch (err) {
      this.logger.warn(`detect failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async post(path: string, payload: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.apiUrl!.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.apiKey ? { ...payload, api_key: this.apiKey } : payload),
      // The provider is operator-configured, but never follow a redirect with
      // the payload+key attached (same reasoning as the webhook sender).
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}
