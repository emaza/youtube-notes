// Chat con Gemini sobre un vídeo. La API key solo vive en el servidor.
import express, { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY, GEMINI_MODEL, LANGUAGES, VIDEO_ID_RE } from '../config.js';
import { chatLimiters } from '../rate-limits.js';

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 50;
const MAX_HISTORY_CHARS = 100_000;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export const chatRouter = Router();

chatRouter.post('/chat', ...chatLimiters, express.json({ limit: '300kb' }), async (req, res) => {
  const input = validateChatRequest(req.body);
  if (typeof input === 'string') {
    return res.status(400).json({ error: input });
  }

  const { videoId, videoTitle, language, history, message } = input;

  const abort = new AbortController();
  res.on('close', () => abort.abort());

  try {
    const stream = await ai.models.generateContentStream({
      model: GEMINI_MODEL,
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
