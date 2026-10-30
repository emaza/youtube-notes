// Comentarios de YouTube vía la Data API v3. La API key solo vive en el servidor.
import { Router } from 'express';
import { YOUTUBE_API_KEY, VIDEO_ID_RE } from '../config.js';
import { commentsLimiter } from '../rate-limits.js';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const COMMENTS_PAGE_SIZE = 20;

export const commentsRouter = Router();

commentsRouter.get('/comments', commentsLimiter, async (req, res) => {
  const { videoId, order = 'relevance', pageToken } = req.query;
  if (typeof videoId !== 'string' || !VIDEO_ID_RE.test(videoId)) return res.status(400).json({ error: 'videoId inválido.' });
  if (order !== 'relevance' && order !== 'time') return res.status(400).json({ error: 'Orden inválido.' });
  if (!isValidPageToken(pageToken)) return res.status(400).json({ error: 'pageToken inválido.' });

  await proxyYouTubeComments(res, 'commentThreads', { videoId, order, pageToken },
    item => toComment(item.id, item.snippet.topLevelComment.snippet, item.snippet.totalReplyCount));
});

commentsRouter.get('/comments/replies', commentsLimiter, async (req, res) => {
  const { parentId, pageToken } = req.query;
  if (typeof parentId !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(parentId)) {
    return res.status(400).json({ error: 'parentId inválido.' });
  }
  if (!isValidPageToken(pageToken)) return res.status(400).json({ error: 'pageToken inválido.' });

  await proxyYouTubeComments(res, 'comments', { parentId, pageToken }, item => toComment(item.id, item.snippet, 0));
});

function isValidPageToken(token) {
  return token === undefined || (typeof token === 'string' && /^[A-Za-z0-9_=-]{1,500}$/.test(token));
}

function toComment(id, snippet, replyCount) {
  return {
    id,
    author: snippet.authorDisplayName || '',
    authorAvatar: snippet.authorProfileImageUrl || '',
    authorChannelUrl: snippet.authorChannelUrl || '',
    text: snippet.textDisplay || '',
    likeCount: snippet.likeCount || 0,
    publishedAt: snippet.publishedAt || '',
    replyCount: replyCount || 0
  };
}

async function proxyYouTubeComments(res, resource, params, mapItem) {
  if (!YOUTUBE_API_KEY) {
    return res.status(503).json({ error: 'Los comentarios no están configurados en el servidor (falta YOUTUBE_API_KEY).' });
  }

  const url = new URL(`${YOUTUBE_API_BASE}/${resource}`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('maxResults', String(COMMENTS_PAGE_SIZE));
  // Texto plano: evita recibir HTML de YouTube que habría que sanear.
  url.searchParams.set('textFormat', 'plainText');
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  url.searchParams.set('key', YOUTUBE_API_KEY);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const reason = data?.error?.errors?.[0]?.reason;
      if (reason === 'commentsDisabled') return res.json({ comments: [], nextPageToken: null, disabled: true });
      if (response.status === 404) return res.status(404).json({ error: 'Vídeo o comentario no encontrado.' });
      if (reason === 'quotaExceeded') {
        return res.status(429).json({ error: 'Se ha agotado la cuota diaria de la API de YouTube. Inténtalo mañana.' });
      }
      console.error('Error de la API de YouTube:', response.status, reason || data?.error?.message);
      return res.status(502).json({ error: 'Error al obtener los comentarios de YouTube.' });
    }

    res.json({
      comments: (data.items ?? []).map(mapItem),
      nextPageToken: data.nextPageToken || null
    });
  } catch (error) {
    console.error('Error llamando a la API de YouTube:', error?.message || error);
    res.status(502).json({ error: 'Error al obtener los comentarios de YouTube.' });
  }
}
