import { Fragment, useEffect, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { en } from './en';
import { fr, frServer } from './fr';

export type Locale = 'en-US' | 'fr-FR';

/** Languages offered in Account → Language (labels are written in their own language). */
export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'fr-FR', label: 'Français (France)' },
];

export type Messages = typeof en;
export type MessageKey = keyof Messages;
/** Translations must provide every key, with the same parameters for parameterized messages. */
export type Translation = { [K in MessageKey]: Messages[K] extends string ? string : Messages[K] };

const DICTS: Record<Locale, Translation> = { 'en-US': en, 'fr-FR': fr };
/**
 * Texts sent by the server (monitor/channel field definitions, API errors) are written in English;
 * other languages translate them here, keyed by the English text.
 */
const SERVER: Record<Locale, { exact: Record<string, string>; patterns: [RegExp, (...groups: string[]) => string][] }> = {
  'en-US': { exact: {}, patterns: [] },
  'fr-FR': frServer,
};

const STORAGE_KEY = 'locale';

/** First supported language of the browser preferences, English otherwise. */
export function browserLocale(): Locale {
  for (const lang of navigator.languages ?? [navigator.language]) {
    if (lang.toLowerCase().startsWith('fr')) return 'fr-FR';
    if (lang.toLowerCase().startsWith('en')) return 'en-US';
  }
  return 'en-US';
}

function isLocale(v: unknown): v is Locale {
  return LOCALES.some((l) => l.value === v);
}

let current: Locale = (() => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isLocale(stored) ? stored : browserLocale();
})();

export const getLocale = (): Locale => current;

type Params<K extends MessageKey> = Messages[K] extends (p: infer P) => string ? [P] : [];

/** Translate a message of the current language. */
export function t<K extends MessageKey>(key: K, ...params: Params<K>): string {
  const msg = DICTS[current][key] as string | ((p: unknown) => string);
  return typeof msg === 'function' ? msg(params[0]) : msg;
}

/** Translate a text that comes from the server, keeping it as is when no translation exists. */
export function tServer(text: string): string {
  const dict = SERVER[current];
  if (Object.hasOwn(dict.exact, text)) return dict.exact[text]!;
  for (const [re, translate] of dict.patterns) {
    const match = re.exec(text);
    if (match) return translate(...match.slice(1));
  }
  return text;
}

/**
 * Applies the language of the signed-in user (or the last one used / the browser's when signed out).
 * Changing the language remounts the app, so every `t()` call renders again in the new language.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const locale: Locale = user ? (isLocale(user.locale) ? user.locale : browserLocale()) : current;
  current = locale;

  useEffect(() => {
    if (!loading) localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale.slice(0, 2);
  }, [locale, loading]);

  return <Fragment key={locale}>{children}</Fragment>;
}
