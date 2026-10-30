import rateLimit from 'express-rate-limit';
import { RATE_LIMIT_PER_MINUTE, RATE_LIMIT_PER_DAY } from './config.js';

const rateLimitMessage = { error: 'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.' };

// Peticiones a la IA por IP: por minuto y por día.
export const chatLimiters = [
  rateLimit({ windowMs: 60_000, limit: RATE_LIMIT_PER_MINUTE, standardHeaders: 'draft-8', legacyHeaders: false, message: rateLimitMessage }),
  rateLimit({ windowMs: 24 * 60 * 60_000, limit: RATE_LIMIT_PER_DAY, standardHeaders: false, legacyHeaders: false, message: rateLimitMessage })
];

export const commentsLimiter = rateLimit({
  windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false, message: rateLimitMessage
});
