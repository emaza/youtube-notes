import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { IS_PRODUCTION } from './config.js';

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

// Sirve la app Angular compilada (solo en producción) con fallback a index.html.
export function serveApp(app) {
  if (!IS_PRODUCTION || !existsSync(distDir)) return;

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
