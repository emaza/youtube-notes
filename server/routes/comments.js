// Comentarios de YouTube vía la Data API v3. La API key solo vive en el servidor.
import { Router } from 'express';
import { YOUTUBE_API_KEY, VIDEO_ID_RE } from '../config.js';
import { commentsLimiter } from '../rate-limits.js';
import { youtubeGet, sendYouTubeError, isValidPageToken, YouTubeApiError } from '../youtube-api.js';

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

  try {
    const data = await youtubeGet(resource, {
      part: 'snippet',
      maxResults: COMMENTS_PAGE_SIZE,
      // Texto plano: evita recibir HTML de YouTube que habría que sanear.
      textFormat: 'plainText',
      ...params
    });
    res.json({
      comments: (data.items ?? []).map(mapItem),
      nextPageToken: data.nextPageToken || null
    });
  } catch (error) {
    if (error instanceof YouTubeApiError && error.reason === 'commentsDisabled') {
      return res.json({ comments: [], nextPageToken: null, disabled: true });
    }
    sendYouTubeError(res, error, 'Error al obtener los comentarios de YouTube.', 'Vídeo o comentario no encontrado.');
  }
}
