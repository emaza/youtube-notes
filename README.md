# YouTube Video Notetaker

Mira vídeos de YouTube, toma notas y chatea con Gemini sobre ellos. Las notas y
conversaciones se guardan en el navegador (localStorage) y se pueden exportar/importar.

## Arquitectura

```
Navegador (Angular)  ──POST /api/chat──▶  server/index.js (Express)  ──▶  Gemini API
                                             └─ GEMINI_API_KEY (solo aquí)
```

La API key **nunca** llega al navegador: el frontend llama a `/api/chat` en el
propio servidor, que valida la petición, aplica límites y llama a Gemini.

Protecciones del servidor:

- **Rate limit por IP** (por minuto y por día) para que nadie te agote la cuota.
- **Validación de entrada**: ID de vídeo, idioma, tamaño del mensaje e historial.
- **Contraseña opcional** (`APP_PASSWORD`) que protege toda la app con HTTP Basic Auth.
  Muy recomendable si es para uso personal.
- **Cabeceras de seguridad** (Helmet) con una CSP estricta.
- Los errores de Gemini no se reenvían al cliente.

## Desarrollo local

Requisitos: Node.js 22+.

```bash
npm install
cp .env.example .env.local   # y pon tu GEMINI_API_KEY
npm run dev                  # API en :8080 + Angular en http://localhost:3000
```

Consigue la API key en <https://aistudio.google.com/apikey>.

## Producción

```bash
npm run build
GEMINI_API_KEY=... APP_PASSWORD=... npm start   # http://localhost:8080
```

### Variables de entorno

| Variable | Obligatoria | Por defecto | Descripción |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | sí | — | Clave de la API de Gemini |
| `APP_PASSWORD` | no | (sin contraseña) | Activa usuario/contraseña para toda la app (el usuario puede ser cualquiera) |
| `GEMINI_MODEL` | no | `gemini-flash-latest` | Modelo a usar |
| `RATE_LIMIT_PER_MINUTE` | no | `10` | Peticiones a la IA por IP y minuto |
| `RATE_LIMIT_PER_DAY` | no | `200` | Peticiones a la IA por IP y día |
| `TRUST_PROXY` | no | `1` | Nº de proxies delante del servidor (para obtener la IP real) |
| `PORT` | no | `8080` | Puerto |

### Despliegue con Docker (p. ej. Google Cloud Run)

El `Dockerfile` construye la app y genera una imagen que solo contiene el servidor
y los ficheros compilados.

Ejemplo con Cloud Run, guardando la clave en Secret Manager (no en texto plano):

```bash
printf '%s' "TU_API_KEY" | gcloud secrets create gemini-api-key --data-file=-
gcloud run deploy youtube-notes --source . --region europe-west1 \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest,APP_PASSWORD=app-password:latest
```

Cualquier otra plataforma que ejecute contenedores o Node (Render, Fly.io, Railway…)
sirve igual: define las variables de entorno en su panel de secretos.

### Recomendaciones extra

- En Google AI Studio / Cloud Console, **restringe la API key** a la
  "Generative Language API" y pon un **límite de presupuesto** o cuota.
- Nunca subas `.env.local` al repositorio (ya está en `.gitignore`).
