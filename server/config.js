// Configuración del servidor a partir de variables de entorno, y constantes
// compartidas entre módulos.

export const PORT = Number(process.env.PORT) || 8080;
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
// Si se define, toda la app queda detrás de HTTP Basic Auth (usuario libre).
export const APP_PASSWORD = process.env.APP_PASSWORD || '';
export const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE) || 10;
export const RATE_LIMIT_PER_DAY = Number(process.env.RATE_LIMIT_PER_DAY) || 200;
// Opcional: sin ella los comentarios y la búsqueda de vídeos quedan desactivados.
export const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
// Service worker de la PWA: activo salvo SERVICE_WORKER=false (útil en desarrollo,
// donde su caché sirve el código anterior en la primera recarga).
export const SERVICE_WORKER = process.env.SERVICE_WORKER !== 'false';
// Solo en producción se sirve la app compilada; en desarrollo la sirve `ng serve`
// (puerto 3000) y este servidor es solo la API.
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
// Necesario detrás de proxies (Cloud Run, Render, Fly...) para que el rate limit
// use la IP real del cliente.
export const TRUST_PROXY = Number(process.env.TRUST_PROXY ?? 1);

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export const LANGUAGES = {
  es: 'Spanish (Español)',
  en: 'English',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  it: 'Italian (Italiano)',
  pt: 'Portuguese (Português)'
};

if (!GEMINI_API_KEY) {
  console.error('Falta la variable de entorno GEMINI_API_KEY.');
  process.exit(1);
}
