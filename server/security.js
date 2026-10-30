import helmet from 'helmet';
import { timingSafeEqual } from 'node:crypto';

export const securityHeaders = helmet({
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
});

// HTTP Basic Auth con cualquier usuario y la contraseña dada.
export function basicAuth(password) {
  const expected = Buffer.from(password);
  return (req, res, next) => {
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
  };
}
