// Servidor: API (chat con Gemini, comentarios de YouTube, config pública) y, en
// producción, la app Angular compilada. Las API keys solo viven aquí (variables
// de entorno), nunca en el navegador.
import express from 'express';
import { PORT, GEMINI_MODEL, APP_PASSWORD, YOUTUBE_API_KEY, TRUST_PROXY } from './config.js';
import { securityHeaders, basicAuth } from './security.js';
import { serveApp } from './static.js';
import { chatRouter } from './routes/chat.js';
import { commentsRouter } from './routes/comments.js';
import { configRouter } from './routes/config.js';

const app = express();

app.set('trust proxy', TRUST_PROXY);
app.disable('x-powered-by');
app.use(securityHeaders);

app.get('/healthz', (_req, res) => res.send('ok'));

if (APP_PASSWORD) app.use(basicAuth(APP_PASSWORD));

app.use('/api', chatRouter, commentsRouter, configRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'No encontrado' }));

serveApp(app);

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT} (modelo: ${GEMINI_MODEL})`);
  if (!YOUTUBE_API_KEY) console.warn('YOUTUBE_API_KEY no definida: la sección de comentarios estará desactivada.');
});
