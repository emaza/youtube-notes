import { Router } from 'express';
import { SERVICE_WORKER } from '../config.js';

export const configRouter = Router();

// Configuración pública que el frontend necesita al arrancar.
configRouter.get('/config', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json({ serviceWorker: SERVICE_WORKER });
});
