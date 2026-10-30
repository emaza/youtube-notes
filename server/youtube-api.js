// Cliente mínimo de la YouTube Data API v3, compartido por comentarios y búsqueda.
// La API key solo vive en el servidor.
import { YOUTUBE_API_KEY } from './config.js';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export class YouTubeApiError extends Error {
  constructor(status, reason, message) {
    super(message || reason || `HTTP ${status}`);
    this.status = status;
    this.reason = reason;
  }
}

/** GET a un recurso de la API; lanza YouTubeApiError si YouTube responde con error. */
export async function youtubeGet(resource, params) {
  const url = new URL(`${YOUTUBE_API_BASE}/${resource}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  url.searchParams.set('key', YOUTUBE_API_KEY);

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new YouTubeApiError(response.status, data?.error?.errors?.[0]?.reason, data?.error?.message);
  }
  return data;
}

/**
 * Responde al cliente con el error adecuado. `fallback` es el mensaje genérico
 * (502) y `notFound` el del 404.
 */
export function sendYouTubeError(res, error, fallback, notFound = 'Not found.') {
  if (error instanceof YouTubeApiError) {
    if (error.status === 404) return res.status(404).json({ error: notFound });
    if (error.reason === 'quotaExceeded') {
      return res.status(429).json({ error: 'The daily YouTube API quota has been used up. Try again tomorrow.' });
    }
    console.error('Error de la API de YouTube:', error.status, error.reason || error.message);
  } else {
    console.error('Error llamando a la API de YouTube:', error?.message || error);
  }
  res.status(502).json({ error: fallback });
}

export function isValidPageToken(token) {
  return token === undefined || (typeof token === 'string' && /^[A-Za-z0-9_=-]{1,500}$/.test(token));
}
