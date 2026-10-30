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

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 50;
const MAX_HISTORY_CHARS = 100_000;

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
});

function validateChatRequest(body) {
  if (!body || typeof body !== 'object') return 'Cuerpo de la petición inválido.';

  const { videoId, videoTitle = '', language = 'es', history = [], message } = body;

  if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return 'videoId inválido.';
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
