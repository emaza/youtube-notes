// Búsqueda de vídeos vía la Data API v3 (search.list). Cada búsqueda cuesta 100
// unidades de cuota, así que se valida todo antes de llamar a YouTube.
import { Router } from 'express';
import { YOUTUBE_API_KEY } from '../config.js';
import { searchLimiters, categoriesLimiter } from '../rate-limits.js';
import { youtubeGet, sendYouTubeError, isValidPageToken } from '../youtube-api.js';

export const searchRouter = Router();

// Parámetros de search.list con valores cerrados. Los que requieren OAuth
// (forMine, forContentOwner, forDeveloper, onBehalfOfContentOwner*) o están
// retirados (relatedToVideoId) no se exponen; `type` va fijo a `video`.
const ENUM_PARAMS = {
  order: ['date', 'rating', 'relevance', 'title', 'viewCount'],
  channelType: ['any', 'show'],
  eventType: ['completed', 'live', 'upcoming'],
  safeSearch: ['moderate', 'none', 'strict'],
  videoCaption: ['any', 'closedCaption', 'none'],
  videoDefinition: ['any', 'high', 'standard'],
  videoDimension: ['2d', '3d', 'any'],
  videoDuration: ['any', 'long', 'medium', 'short'],
  videoEmbeddable: ['any', 'true'],
  videoLicense: ['any', 'creativeCommon', 'youtube'],
  videoSyndicated: ['any', 'true'],
  videoType: ['any', 'episode', 'movie']
};

const PATTERN_PARAMS = {
  regionCode: /^[A-Z]{2}$/,
  relevanceLanguage: /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/,
  topicId: /^\/m\/[0-9a-z_]{2,20}$/,
  videoCategoryId: /^\d{1,4}$/,
  publishedAfter: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
  publishedBefore: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
  location: /^-?\d{1,2}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/,
  locationRadius: /^\d+(\.\d+)?(m|km|ft|mi)$/
};

const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE_RE = /^@[A-Za-z0-9._-]{3,100}$/;
const MAX_QUERY_LENGTH = 500;
const KM_PER_UNIT = { m: 0.001, km: 1, ft: 0.0003048, mi: 1.609344 };

// Cachés en memoria: los handles y las categorías casi nunca cambian.
const handleCache = new Map();
const categoriesCache = new Map();
const MAX_CACHE_ENTRIES = 500;

searchRouter.get('/search', searchLimiters, async (req, res) => {
  if (!YOUTUBE_API_KEY) return notConfigured(res);

  const { params, error } = validateSearchParams(req.query);
  if (error) return res.status(400).json({ error });

  try {
    if (params.channel) {
      const channelId = await resolveChannel(params.channel);
      if (!channelId) return res.status(404).json({ error: `Canal no encontrado: ${params.channel}` });
      params.channelId = channelId;
      delete params.channel;
    }

    const data = await youtubeGet('search', { part: 'snippet', type: 'video', ...params });
    res.json({
      results: (data.items ?? []).filter(item => item.id?.videoId).map(toResult),
      nextPageToken: data.nextPageToken || null,
      prevPageToken: data.prevPageToken || null,
      totalResults: data.pageInfo?.totalResults ?? 0
    });
  } catch (err) {
    sendYouTubeError(res, err, 'Error al buscar en YouTube.');
  }
});

searchRouter.get('/search/categories', categoriesLimiter, async (req, res) => {
  if (!YOUTUBE_API_KEY) return notConfigured(res);

  const { regionCode = 'US', hl = 'en' } = req.query;
  if (typeof regionCode !== 'string' || !PATTERN_PARAMS.regionCode.test(regionCode)) {
    return res.status(400).json({ error: 'regionCode inválido.' });
  }
  if (typeof hl !== 'string' || !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(hl)) return res.status(400).json({ error: 'hl inválido.' });

  const cacheKey = `${regionCode}|${hl}`;
  if (categoriesCache.has(cacheKey)) return res.json({ categories: categoriesCache.get(cacheKey) });

  try {
    const data = await youtubeGet('videoCategories', { part: 'snippet', regionCode, hl });
    const categories = (data.items ?? [])
      .filter(item => item.snippet?.assignable)
      .map(item => ({ id: item.id, title: item.snippet.title }));
    remember(categoriesCache, cacheKey, categories);
    res.json({ categories });
  } catch (err) {
    sendYouTubeError(res, err, 'Error al obtener las categorías de YouTube.');
  }
});

function notConfigured(res) {
  return res.status(503).json({ error: 'La búsqueda no está configurada en el servidor (falta YOUTUBE_API_KEY).' });
}

/** Valida la query del cliente y devuelve solo los parámetros admitidos. */
function validateSearchParams(query) {
  const params = {};

  const { q, maxResults, pageToken, channel } = query;
  if (q !== undefined) {
    if (typeof q !== 'string' || q.length > MAX_QUERY_LENGTH) return { error: 'q inválido.' };
    if (q.trim()) params.q = q.trim();
  }

  if (maxResults !== undefined) {
    const n = Number(maxResults);
    if (!Number.isInteger(n) || n < 1 || n > 50) return { error: 'maxResults debe estar entre 1 y 50.' };
    params.maxResults = n;
  }

  if (!isValidPageToken(pageToken)) return { error: 'pageToken inválido.' };
  if (pageToken) params.pageToken = pageToken;

  if (channel !== undefined && channel !== '') {
    if (typeof channel !== 'string' || !(CHANNEL_ID_RE.test(channel) || HANDLE_RE.test(channel))) {
      return { error: 'Canal inválido: usa un ID de canal (UC…) o un @handle.' };
    }
    params.channel = channel;
  }

  for (const [name, allowed] of Object.entries(ENUM_PARAMS)) {
    const value = query[name];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string' || !allowed.includes(value)) return { error: `${name} inválido.` };
    params[name] = value;
  }

  for (const [name, pattern] of Object.entries(PATTERN_PARAMS)) {
    const value = query[name];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string' || !pattern.test(value)) return { error: `${name} inválido.` };
    params[name] = value;
  }

  for (const name of ['publishedAfter', 'publishedBefore']) {
    if (params[name] && Number.isNaN(Date.parse(params[name]))) return { error: `${name} inválido.` };
  }
  if (params.publishedAfter && params.publishedBefore
      && Date.parse(params.publishedAfter) > Date.parse(params.publishedBefore)) {
    return { error: 'La fecha "desde" es posterior a la fecha "hasta".' };
  }

  if (!!params.location !== !!params.locationRadius) {
    return { error: 'location y locationRadius deben indicarse juntos.' };
  }
  if (params.location) {
    const [lat, lng] = params.location.split(',').map(Number);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { error: 'location fuera de rango.' };
    params.location = `${lat},${lng}`;
    const [, amount, unit] = params.locationRadius.match(/^([\d.]+)(\w+)$/);
    if (Number(amount) * KM_PER_UNIT[unit] > 1000) return { error: 'locationRadius no puede superar 1000 km.' };
  }

  return { params };
}

/** ID del canal: tal cual si ya es un ID, o resolviendo el @handle (1 unidad de cuota). */
async function resolveChannel(channel) {
  if (CHANNEL_ID_RE.test(channel)) return channel;

  const key = channel.toLowerCase();
  if (handleCache.has(key)) return handleCache.get(key);

  const data = await youtubeGet('channels', { part: 'id', forHandle: channel });
  const channelId = data.items?.[0]?.id || null;
  if (channelId) remember(handleCache, key, channelId);
  return channelId;
}

function remember(cache, key, value) {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

function toResult(item) {
  const snippet = item.snippet ?? {};
  const thumbnails = snippet.thumbnails ?? {};
  return {
    videoId: item.id.videoId,
    title: decodeEntities(snippet.title || ''),
    description: decodeEntities(snippet.description || ''),
    channelId: snippet.channelId || '',
    channelTitle: decodeEntities(snippet.channelTitle || ''),
    publishedAt: snippet.publishedAt || '',
    thumbnail: (thumbnails.medium ?? thumbnails.high ?? thumbnails.default)?.url || '',
    liveBroadcastContent: snippet.liveBroadcastContent || 'none'
  };
}

// search.list devuelve título y descripción con entidades HTML (p. ej. &#39;).
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}
