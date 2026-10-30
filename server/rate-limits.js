import rateLimit from 'express-rate-limit';
import { RATE_LIMIT_PER_MINUTE, RATE_LIMIT_PER_DAY } from './config.js';

const rateLimitMessage = { error: 'Too many requests. Wait a moment and try again.' };

// Peticiones a la IA por IP: por minuto y por día.
export const chatLimiters = [
  rateLimit({ windowMs: 60_000, limit: RATE_LIMIT_PER_MINUTE, standardHeaders: 'draft-8', legacyHeaders: false, message: rateLimitMessage }),
  rateLimit({ windowMs: 24 * 60 * 60_000, limit: RATE_LIMIT_PER_DAY, standardHeaders: false, legacyHeaders: false, message: rateLimitMessage })
];

export const commentsLimiter = rateLimit({
  windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false, message: rateLimitMessage
});

// Cada búsqueda cuesta 100 unidades de la cuota diaria de YouTube (10.000 por defecto).
export const searchLimiters = [
  rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: rateLimitMessage }),
  rateLimit({ windowMs: 24 * 60 * 60_000, limit: 100, standardHeaders: false, legacyHeaders: false, message: rateLimitMessage })
];

export const categoriesLimiter = rateLimit({
  windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: rateLimitMessage
});
