import { Injectable } from '@nestjs/common';
import { TranslationResult, TranslationService } from './translation.service';

// Default driver: translation is off. Returns text unchanged and reports itself
// disabled so listeners skip the work rather than storing useless "translations"
// identical to the source.
@Injectable()
export class NoopTranslationService extends TranslationService {
  isEnabled(): boolean {
    return false;
  }

  async translate(text: string): Promise<TranslationResult> {
    return { text, detectedSourceLocale: null };
  }

  async detect(): Promise<string | null> {
    return null;
  }
}
