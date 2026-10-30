/** Languages the AI can answer in (must match the server's LANGUAGES). */
export const LANGUAGES = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
  { code: 'it', name: 'Italiano' }
];

export const DEFAULT_LANGUAGE = 'es';

export function isSupportedLanguage(code: string): boolean {
  return LANGUAGES.some(lang => lang.code === code);
}
