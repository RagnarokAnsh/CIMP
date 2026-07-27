import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import {
  DEFAULT_LOCALE, LOCALES, LOCALE_CODES, en, type Locale, type TranslationKey,
} from './locales';

// Minimal typed i18n for the reporter portal. Deliberately dependency-free: the
// portal is three small pages with a flat key set, and react-i18next's loaders,
// plural engine and namespaces would all go unused. If the key count grows past
// what one file can hold comfortably, swap this for react-i18next — the useT()
// call sites are already the same shape.

const STORAGE_KEY = 'cimp_locale';

function isLocale(v: string | null | undefined): v is Locale {
  return Boolean(v) && (LOCALE_CODES as string[]).includes(v!);
}

/**
 * Resolve the starting locale, most explicit signal first:
 *   1. `?lang=` — lets a portal deep-link the user's language.
 *   2. localStorage — the reporter's own previous choice.
 *   3. navigator.language — the browser's preference.
 *   4. English.
 */
export function detectLocale(): Locale {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get('lang');
    if (isLocale(fromQuery)) return fromQuery;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
    const nav = navigator.language?.split('-')[0];
    if (isLocale(nav)) return nav;
  } catch {
    // Private-mode storage or a locked-down embed — fall through to English
    // rather than breaking the page over a preference.
  }
  return DEFAULT_LOCALE;
}

/** Replace `{name}` placeholders. Values are stringified; missing ones stay literal. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    (key in vars ? String(vars[key]) : whole));
}

export type TFunction = (key: TranslationKey, vars?: Record<string, string | number>) => string;

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: TFunction;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useEffect(() => {
    // Keep <html lang> honest for screen readers and browser translation.
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch { /* preference is best-effort */ }
  }, []);

  const t = useCallback<TFunction>(
    (key, vars) => {
      // Fall back to English per-key, not per-locale: a partially translated
      // dictionary shows real English text instead of a blank or a raw key.
      const dict = LOCALES[locale]?.dict ?? {};
      return interpolate(dict[key] ?? en[key] ?? key, vars);
    },
    [locale],
  );

  const value = useMemo<I18nValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Portal translations. Safe outside a provider (returns English), so a component
 * rendered in isolation — or a test — never crashes on a missing context.
 */
export function useT(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  return {
    locale: DEFAULT_LOCALE,
    setLocale: () => {},
    t: (key, vars) => interpolate(en[key] ?? key, vars),
  };
}

export { LOCALES, LOCALE_CODES, type Locale, type TranslationKey };
