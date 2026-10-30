// Servidor de producción: sirve la app Angular compilada y hace de proxy hacia
// Gemini. La API key solo vive aquí (variable de entorno), nunca en el navegador.
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = Number(process.env.PORT) || 8080;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
// Si se define, toda la app queda detrás de HTTP Basic Auth (usuario libre).
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE) || 10;
const RATE_LIMIT_PER_DAY = Number(process.env.RATE_LIMIT_PER_DAY) || 200;
// Opcional: sin ella la sección de comentarios queda desactivada.
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const COMMENTS_PAGE_SIZE = 20;

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 50;
const MAX_HISTORY_CHARS = 100_000;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const LANGUAGES = {
  es: 'Spanish (Español)',
  en: 'English',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  it: 'Italian (Italiano)',
  pt: 'Portuguese (Português)'
};

if (!API_KEY) {
  console.error('Falta la variable de entorno GEMINI_API_KEY.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
const app = express();
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

// Necesario detrás de proxies (Cloud Run, Render, Fly...) para que el rate limit
// use la IP real del cliente.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://noembed.com'],
      frameSrc: ['https://www.youtube.com', 'https://www.youtube-nocookie.com'],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  // El reproductor embebido de YouTube no funciona con COEP.
  crossOriginEmbedderPolicy: false
}));

app.get('/healthz', (_req, res) => res.send('ok'));

if (APP_PASSWORD) {
  const expected = Buffer.from(APP_PASSWORD);
  app.use((req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString();
      const given = Buffer.from(decoded.slice(decoded.indexOf(':') + 1));
      if (given.length === expected.length && timingSafeEqual(given, expected)) {
        return next();
      }
    }
    res.set('WWW-Authenticate', 'Basic realm="YouTube Notetaker", charset="UTF-8"');
    res.status(401).send('Autenticación requerida');
  });
}

const rateLimitMessage = { error: 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.' };
const apiLimiters = [
  rateLimit({ windowMs: 60_000, limit: RATE_LIMIT_PER_MINUTE, standardHeaders: 'draft-8', legacyHeaders: false, message: rateLimitMessage }),
  rateLimit({ windowMs: 24 * 60 * 60_000, limit: RATE_LIMIT_PER_DAY, standardHeaders: false, legacyHeaders: false, message: rateLimitMessage })
];

app.post('/api/chat', ...apiLimiters, express.json({ limit: '300kb' }), async (req, res) => {
  const input = validateChatRequest(req.body);
  if (typeof input === 'string') {
    return res.status(400).json({ error: input });
  }

  const { videoId, videoTitle, language, history, message } = input;

  const abort = new AbortController();
  res.on('close', () => abort.abort());

  try {
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: [
        ...history.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        { role: 'user', parts: [{ text: message }] }
      ],
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: buildSystemInstruction(videoId, videoTitle, LANGUAGES[language]),
        abortSignal: abort.signal
      }
    });

    // Respuesta NDJSON: una línea JSON por evento ("text", y al final "done" o "error").
    res.status(200).set({
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();

    const sources = [];
    const seen = new Set();
    try {
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) res.write(JSON.stringify({ type: 'text', text }) + '\n');

        for (const g of chunk.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
          const uri = g.web?.uri;
          if (uri && /^https?:\/\//i.test(uri) && !seen.has(uri)) {
            seen.add(uri);
            sources.push({ title: g.web.title || uri, uri });
          }
        }
      }
      res.write(JSON.stringify({ type: 'done', sources }) + '\n');
    } catch (error) {
      if (abort.signal.aborted) return;
      console.error('Error durante el streaming de Gemini:', error?.message || error);
      res.write(JSON.stringify({ type: 'error', error: 'La respuesta de la IA se interrumpió. Por favor intenta de nuevo.' }) + '\n');
    }
    res.end();
  } catch (error) {
    if (abort.signal.aborted) return;
    // No se reenvía el error original al cliente: podría incluir detalles internos.
    console.error('Error llamando a Gemini:', error?.message || error);
    const status = error?.status === 429 ? 429 : 502;
    res.status(status).json({
      error: status === 429
        ? 'La cuota de la IA se ha agotado temporalmente. Inténtalo más tarde.'
        : 'Error al conectar con la IA. Por favor intenta de nuevo.'
    });
  }
});

const commentsLimiter = rateLimit({
  windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false, message: rateLimitMessage
});

app.get('/api/comments', commentsLimiter, async (req, res) => {
  const { videoId, order = 'relevance', pageToken } = req.query;
  if (typeof videoId !== 'string' || !VIDEO_ID_RE.test(videoId)) return res.status(400).json({ error: 'videoId inválido.' });
  if (order !== 'relevance' && order !== 'time') return res.status(400).json({ error: 'Orden inválido.' });
  if (!isValidPageToken(pageToken)) return res.status(400).json({ error: 'pageToken inválido.' });

  await proxyYouTubeComments(res, 'commentThreads', { videoId, order, pageToken },
    item => toComment(item.id, item.snippet.topLevelComment.snippet, item.snippet.totalReplyCount));
});

app.get('/api/comments/replies', commentsLimiter, async (req, res) => {
  const { parentId, pageToken } = req.query;
  if (typeof parentId !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(parentId)) {
    return res.status(400).json({ error: 'parentId inválido.' });
  }
  if (!isValidPageToken(pageToken)) return res.status(400).json({ error: 'pageToken inválido.' });

  await proxyYouTubeComments(res, 'comments', { parentId, pageToken }, item => toComment(item.id, item.snippet, 0));
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'No encontrado' }));

if (existsSync(distDir)) {
  app.use(express.static(distDir, {
    index: false,
    setHeaders(res, filePath) {
      // Los bundles llevan hash en el nombre; el resto debe revalidarse.
      if (/-[A-Z0-9]{8}\.(js|css)$/.test(filePath)) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.set('Cache-Control', 'no-cache');
      }
    }
  }));
  app.get('/{*splat}', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT} (modelo: ${MODEL})`);
  if (!YOUTUBE_API_KEY) console.warn('YOUTUBE_API_KEY no definida: la sección de comentarios estará desactivada.');
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

function validateChatRequest(body) {
  if (!body || typeof body !== 'object') return 'Cuerpo de la petición inválido.';

  const { videoId, videoTitle = '', language = 'es', history = [], message } = body;

  if (typeof videoId !== 'string' || !VIDEO_ID_RE.test(videoId)) return 'videoId inválido.';
  if (typeof videoTitle !== 'string' || videoTitle.length > 300) return 'Título inválido.';
  if (typeof language !== 'string' || !Object.hasOwn(LANGUAGES, language)) return 'Idioma no soportado.';
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE_CHARS) {
    return `El mensaje debe tener entre 1 y ${MAX_MESSAGE_CHARS} caracteres.`;
  }
  if (!Array.isArray(history)) return 'Historial inválido.';

  // Se recorta el historial a los mensajes más recientes para acotar el coste.
  const recent = history.slice(-MAX_HISTORY_MESSAGES);
  let totalChars = 0;
  for (const m of recent) {
    if (!m || (m.role !== 'user' && m.role !== 'model') || typeof m.text !== 'string') {
      return 'Historial inválido.';
    }
    totalChars += m.text.length;
  }
  if (totalChars > MAX_HISTORY_CHARS) return 'El historial de la conversación es demasiado largo.';

  return {
    videoId,
    videoTitle: videoTitle.trim(),
    language,
    history: recent.map(m => ({ role: m.role, text: m.text })),
    message: message.trim()
  };
}

function buildSystemInstruction(videoId, videoTitle, targetLanguage) {
  const titleContext = videoTitle ? `Video Title: "${videoTitle}"` : 'Video title unknown, try to deduce it.';
  const searchHint = videoTitle ? `"${videoTitle} summary", "${videoTitle} transcript", or` : '';

  return `You are an expert assistant tasked with analyzing YouTube videos.

VIDEO CONTEXT:
URL: https://www.youtube.com/watch?v=${videoId}
ID: ${videoId}
${titleContext}

CRITICAL INSTRUCTIONS:
1. You cannot "watch" the video directly. You MUST use the 'googleSearch' tool to find information about it.
2. Do NOT search for the URL alone. Search for ${searchHint} the video ID "${videoId}".
3. Synthesize the information found to answer the user.
4. Be clear, structured, and helpful.
5. OUTPUT LANGUAGE RULE: You MUST answer strictly in ${targetLanguage}, regardless of the language of the source material.`;
}
