# YouTube Video Notetaker

Mira vídeos de YouTube, toma notas y chatea con Gemini sobre ellos. Las notas y
conversaciones se guardan en el navegador (localStorage) y se pueden exportar/importar.

## Arquitectura

```
Navegador (Angular)  ──POST /api/chat─────▶  server/index.js (Express)  ──▶  Gemini API
                     ──GET  /api/comments─▶     ├─ GEMINI_API_KEY      ──▶  YouTube Data API v3
                     ──GET  /api/search───▶     └─ YOUTUBE_API_KEY  (solo aquí)
```

Las API keys **nunca** llegan al navegador: el frontend llama a `/api/chat`,
`/api/comments` y `/api/search` en el propio servidor, que valida la petición, aplica límites y
llama a Gemini o a YouTube.

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

En desarrollo abre siempre http://localhost:3000. El servidor de :8080 solo atiende la API:
la app compilada (`dist/`) únicamente se sirve en producción (`NODE_ENV=production`).

Consigue la API key en <https://aistudio.google.com/apikey>.

### Comentarios y búsqueda de YouTube (opcional)

La pestaña *Comments* muestra los comentarios del vídeo y el buscador del input
principal busca vídeos, ambos usando la YouTube Data API v3. Para activarlos:

1. En [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
   habilita **YouTube Data API v3** en tu proyecto.
2. En *APIs y servicios → Credenciales* crea una API key (recomendado: restríngela a
   la YouTube Data API v3).
3. Añádela a `.env.local` como `YOUTUBE_API_KEY`.

Cada página de comentarios o de respuestas gasta 1 unidad de la cuota diaria
gratuita de 10.000, pero **cada búsqueda gasta 100** (unas 100 búsquedas al día).
Por eso las búsquedas tienen su propio rate limit por IP (10/min y 100/día) y el
navegador guarda los resultados en un caché local (`localStorage`, clave
`yt-search-cache`) indexado por los parámetros de búsqueda de la URL: volver atrás o
recargar no repite la petición. El nº máximo de búsquedas cacheadas se configura en
*Settings* (0 lo desactiva); el caché no se incluye en los backups.

En el input principal: pegar un enlace abre el vídeo; escribir texto y pulsar la lupa
(o Enter) hace una búsqueda simple; el icono de deslizadores abre la búsqueda avanzada
con todas las opciones de `search.list` que funcionan con API key (las que requieren
OAuth, como `forMine`, no están disponibles).

Sin `YOUTUBE_API_KEY` el resto de la app funciona igual.

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
| `YOUTUBE_API_KEY` | no | (sin comentarios ni búsqueda) | Clave de la YouTube Data API v3 para los comentarios y la búsqueda de vídeos |
| `GEMINI_MODEL` | no | `gemini-flash-latest` | Modelo a usar |
| `RATE_LIMIT_PER_MINUTE` | no | `10` | Peticiones a la IA por IP y minuto |
| `RATE_LIMIT_PER_DAY` | no | `200` | Peticiones a la IA por IP y día |
| `TRUST_PROXY` | no | `1` | Nº de proxies delante del servidor (para obtener la IP real) |
| `PORT` | no | `8080` | Puerto |
| `SERVICE_WORKER` | no | `true` | Con `false` no se instala el service worker de la PWA y se elimina si ya estaba instalado. Recomendado en desarrollo: su caché sirve el código anterior en la primera recarga |

### Despliegue con Docker (p. ej. Google Cloud Run)

El `Dockerfile` construye la app y genera una imagen que solo contiene el servidor
y los ficheros compilados.

#### Probar el contenedor en local

```bash
docker build -t youtube-notes .
docker run -d --name youtube-notes --env-file .env.local -p 8080:8080 youtube-notes
docker logs -f youtube-notes
```

La app queda en http://localhost:8080. Si `APP_PASSWORD` está definida, el navegador
pide usuario y contraseña: el usuario puede ser cualquiera y la contraseña es el
valor de `APP_PASSWORD`.

El contenedor ejecuta el código que había al hacer `docker build`, así que **cada vez
que cambies código hay que reconstruir la imagen** antes de volver a lanzarla:

```bash
docker rm -f youtube-notes
docker build -t youtube-notes .
docker run -d --name youtube-notes --env-file .env.local -p 8080:8080 youtube-notes
```

Si solo cambias `.env.local`, no hace falta reconstruir: basta con `docker rm -f` y
volver a hacer `docker run`.

Para pararlo y borrarlo: `docker rm -f youtube-notes`.

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
