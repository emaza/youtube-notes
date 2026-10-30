# Búsqueda simple y avanzada de vídeos (YouTube Data API v3 `search.list`)

## Contexto
Hoy el input del header ([header.component.html](../../src/components/header/header.component.html)) solo acepta un enlace de YouTube: cada pulsación emite `urlChange` → `workspace.loadVideo()`, y si el texto no es un enlace **cierra el vídeo abierto**. Queremos reutilizar ese mismo input para:
- **Búsqueda simple**: escribir texto y pulsar el icono lupa (o Enter).
- **Búsqueda avanzada**: icono "tune" (deslizadores, como Gmail) que despliega un panel con todas las opciones de `search.list` utilizables con API key.

Pegar un enlace sigue funcionando igual. La API key de YouTube ya vive solo en el servidor (`YOUTUBE_API_KEY`, usada por `/api/comments`), así que la búsqueda va por el backend con el mismo patrón.

⚠️ Cuota: `search.list` cuesta **100 unidades** (cuota diaria gratuita: 10.000 → ~100 búsquedas/día por proyecto). Por eso: rate limit propio, `type=video` fijo, y **caché persistente en `localStorage`** indexado por los parámetros de búsqueda de la URL, con un nº máximo de búsquedas cacheadas configurable en Settings.

Decisiones del usuario:
- Los resultados de búsqueda **no se mezclan** con las sesiones guardadas. Cada tarjeta de resultado tiene un botón **Save** (misma posición que el botón eliminar de las sesiones, icono de guardar) que la guarda como sesión sin abrirla.
- Abrir un resultado lo guarda como hoy (auto-guardado de `loadVideo`).
- El caché de búsquedas **no** entra en el export/import de Settings.

## Backend

1. **Extraer helper compartido** `server/youtube-api.js` desde [comments.js](../../server/routes/comments.js): `youtubeGet(resource, params)` (añade `key`, timeout 10 s, parsea JSON, lanza error con `status`/`reason`) e `isValidPageToken`. `comments.js` pasa a usarlo, manteniendo su caso especial `commentsDisabled`. Mapeo común de errores (`quotaExceeded` → 429, 404, resto → 502).
2. **Nuevo `server/routes/search.js`**:
   - `GET /api/search` → `search.list` con `part=snippet`, `type=video` fijos. Valida cada parámetro con lista blanca/regex (400 si no es válido):
     - `q` (≤ 500 chars), `order` (date|rating|relevance|title|viewCount — `videoCount` no aplica a vídeos), `maxResults` (1–50), `pageToken`
     - `channel`: ID `UC…` (22 chars) **o** `@handle`; si es handle, el servidor lo resuelve con `channels.list?forHandle=` (1 unidad, caché en memoria) y lo envía como `channelId`
     - `channelType` (any|show), `eventType` (completed|live|upcoming)
     - `publishedAfter` / `publishedBefore` (RFC 3339)
     - `location` (`lat,lng`) + `locationRadius` (`\d+(m|km|ft|mi)`, ≤ 1000 km) — deben ir juntos
     - `regionCode` (ISO 3166-1 alpha-2), `relevanceLanguage` (ISO 639-1), `safeSearch` (moderate|none|strict)
     - `topicId` (`/m/…`), `videoCategoryId` (numérico)
     - `videoCaption`, `videoDefinition`, `videoDimension`, `videoDuration`, `videoEmbeddable`, `videoLicense`, `videoSyndicated`, `videoType` (enums de la doc)
     - Excluidos (requieren OAuth o están retirados): `forMine`, `forContentOwner`, `forDeveloper`, `onBehalfOfContentOwner*`, `relatedToVideoId`; `type` fijo a `video`.
   - Respuesta: `{ results: [{ videoId, title, description, channelId, channelTitle, publishedAt, thumbnail, liveBroadcastContent }], nextPageToken, prevPageToken, totalResults }`. Decodificar entidades HTML de `title`/`description` (la API las devuelve escapadas, p. ej. `&#39;`).
   - `GET /api/search/categories?regionCode=ES` → `videoCategories.list` (1 unidad), solo `assignable`, con `hl` por idioma; caché en memoria por región.
   - Sin `YOUTUBE_API_KEY` → 503 con mensaje claro.
3. [rate-limits.js](../../server/rate-limits.js): `searchLimiter` (≈10/min y 100/día por IP). [index.js](../../server/index.js): montar `searchRouter` y ajustar el aviso de arranque.

## Frontend

4. **`src/services/youtube-search.service.ts`** (patrón de [youtube-comments.service.ts](../../src/services/youtube-comments.service.ts)):
   - Tipos `SearchFilters` (todas las opciones + campos de composición de `q`), `SearchResult`, `SearchPage`.
   - Estado con signals: `filters`, `results`, `loading`, `error`, `nextPageToken`, `prevPageToken`, `totalResults`, `active = computed(() => !!filters())`.
   - `search(filters)`, `goToPage(token)`, `clear()`, `getCategories(region)`. Antes de llamar al backend consulta el caché (punto 4b).
4b. **Caché de búsquedas en `localStorage`** — `src/services/search-cache.service.ts`:
   - Clave única `yt-search-cache` (⚠️ **no** puede empezar por `yt-notetaker-`: [storage.service.ts](../../src/services/storage.service.ts) trata todo ese prefijo como sesiones de vídeo en el listado y en el backup → así queda fuera del export/import automáticamente).
   - Estructura: `{ [searchKey]: { lastUsed, pages: { [pageToken | '']: SearchPage } } }`, donde `searchKey` = query string canónica de los filtros (la misma que se escribe en la URL, con parámetros ordenados). Una "búsqueda" = un conjunto de filtros con todas sus páginas visitadas.
   - LRU: al guardar, actualiza `lastUsed` y elimina las más antiguas por encima del máximo; si `setItem` lanza `QuotaExceededError`, expulsa más y reintenta.
   - Máximo configurable: `AppSettings.searchCacheSize` (por defecto 20; 0 = sin caché). `saveAppSettings` pasa a **fusionar** con los ajustes existentes (hoy `setLanguage` escribe `{ language }` y machacaría el nuevo campo).
   - `clear()` para vaciarlo.
   - `buildQuery(filters)`: compone `q` estilo Gmail a partir de "todas estas palabras", "frase exacta" (`"…"`), "cualquiera de estas" (`a|b`) y "ninguna de estas" (`-x`), operadores que soporta `search.list`.
5. **Historial / URL** — extender [browser-url.service.ts](../../src/services/browser-url.service.ts): `readSearch()` / `showSearch(filters)` serializan los filtros no vacíos en la query (`?q=…&order=…`, misma serialización que la clave del caché). `showVideo` quita los parámetros de búsqueda, `showSearch` quita `v/type`, `clear` quita todo. Así atrás desde un vídeo, o recargar la página con `?q=…`, vuelve a los resultados servidos desde el caché sin gastar cuota. El servicio de búsqueda se suscribe a `onNavigate` igual que `WorkspaceService`.
6. [workspace.service.ts](../../src/services/workspace.service.ts): en `loadFromUrl`, si no hay vídeo pero sí búsqueda en la URL, cerrar el vídeo **sin tocar la URL**; añadir `closeVideo()` (vacía `youtubeUrl` + `resetWorkspace(false)`) para lanzar una búsqueda con un vídeo abierto sin crear dos entradas de historial.
7. **Header** ([header.component.ts](../../src/components/header/header.component.ts) / `.html`):
   - Texto local con `linkedSignal` a partir del input `value` (que la app rellena con `youtubeUrl() || filtros.q`).
   - Al escribir: si `extractVideoId()` ([utils/youtube.ts](../../src/utils/youtube.ts)) reconoce un enlace → `urlChange` (comportamiento actual). Si no, no hace nada (ya no cierra el vídeo abierto).
   - Icono izquierdo → botón **lupa** (búsqueda simple; Enter hace lo mismo; si el texto es un enlace, lo carga). Derecha: botón limpiar (si hay texto) + botón **tune** (abre/cierra el panel avanzado). Placeholder: "Paste a YouTube link or search videos…".
   - Nuevos outputs: `search(SearchFilters)`.
8. **Nuevo `src/components/advanced-search/`** (`.ts` + `.html`, como el resto tras el último refactor): panel desplegable bajo el input, estilo del screenshot de Gmail (filas etiqueta + campo, botones "Reset" y "Search"), cierra con Esc / clic fuera. Precargado con los filtros actuales y el texto del input. Campos:
   - Palabras: todas / frase exacta / cualquiera / ninguna
   - Canal (ID o @handle), tipo de canal
   - Orden; publicado desde / hasta (`<input type="date">` → RFC 3339)
   - Duración, definición, dimensión, subtítulos, licencia, insertable, sindicable, tipo de vídeo (episodio/película), evento en directo
   - Región (lista estática en `src/utils/regions.ts`), idioma de relevancia (reutiliza/extiende [languages.ts](../../src/utils/languages.ts)), búsqueda segura
   - Categoría (select cargado de `/api/search/categories` según región), tema (`topicId`, lista curada de la doc en `src/utils/youtube-topics.ts`)
   - Ubicación (lat,lng) + radio con unidad; resultados por página (10/25/50)
9. **Nuevo `src/components/search-results/`**: rejilla de tarjetas con el estilo de [session-list.component.html](../../src/components/session-list/session-list.component.html) (miniatura, título, canal, fecha de publicación, badge LIVE/upcoming), vista separada de las sesiones guardadas. Cabecera "Results for …" con nº aprox. de resultados, chips de filtros activos e indicador "from cache"; estados loading/error/vacío; botones Previous/Next con page tokens.
   - **Botón Save** arriba a la derecha (misma posición/estilo hover que el de eliminar, icono de guardar/bookmark). Output `saveVideo(result)`. Si el vídeo ya está guardado, el botón se muestra en estado "Saved" (icono relleno, deshabilitado). Input `savedIds: Set<string>` derivado de `sessions.savedVideos()`.
10. [app.component.ts](../../src/app.component.ts)/[.html](../../src/app.component.html): vista con prioridad vídeo > resultados de búsqueda > sesiones guardadas (las sesiones no se muestran mientras hay búsqueda activa). Handlers:
   - `onSearch(filters)` → `workspace.closeVideo()` + `search.search()`.
   - `openSearchResult(r)` → `workspace.loadVideo(watchUrl(id), r.title)` (se auto-guarda como hoy).
   - `saveSearchResult(r)` → nuevo `StorageService`/`WorkspaceService.saveSession(videoId, title, channelTitle, channelUrl)` que crea la sesión vacía (sin notas ni chat, tipo `video`, `channelUrl` = `https://www.youtube.com/channel/{channelId}`) y `sessions.refresh()`.
   - `goHome()` (logo/limpiar) limpia búsqueda y workspace.
   - `clearSearch()` → `search.clear()`: vacía resultados y filtros activos, resetea el texto del input y los campos del panel avanzado, y quita los parámetros de búsqueda de la URL (`browserUrl.clear()`, una entrada de historial) → vuelve a aparecer el listado de sesiones guardadas. El caché en `localStorage` **no** se borra (eso es el botón de Settings).
   - **Botón "×" para limpiar la búsqueda** en dos sitios, ambos llaman a `clearSearch()`:
     - En la cabecera de resultados, junto a "Results for …" (botón "× Clear search", estilo del chip de filtro de [session-list.component.html](../../src/components/session-list/session-list.component.html)).
     - El "×" ya existente dentro del input: si hay búsqueda activa (o texto escrito sin buscar), limpia búsqueda + input; si hay un vídeo abierto, mantiene su comportamiento actual (cerrar vídeo). Se muestra siempre que haya texto o búsqueda activa.
11. **Settings** ([settings-modal.component.html](../../src/components/settings-modal/settings-modal.component.html)/`.ts`): campo numérico "Cached searches" (0–200) que guarda `searchCacheSize` y recorta el caché al momento, y botón "Clear search cache" con el nº de búsquedas cacheadas actual.

Nota: la API no indica si un resultado es un Short; se abre como vídeo normal (si ya estaba guardado como Short, se respeta el tipo guardado).

## Docs
12. [README.md](../../README.md) y [.env.example](../../.env.example): `YOUTUBE_API_KEY` activa ahora comentarios **y** búsqueda; nota de coste de cuota (100 unidades/búsqueda) y nuevo rate limit.

## Verificación
- `npm run build` sin errores.
- `npm run dev` con `YOUTUBE_API_KEY` en `.env.local`:
  - `curl 'localhost:8080/api/search?q=tomate&order=rating'` → resultados; parámetros inválidos (`order=foo`, `location` sin radio, `channel=xx`) → 400; `channel=@handle` resuelve; `/api/search/categories?regionCode=ES` → lista.
  - `/api/comments` sigue funcionando tras extraer el helper.
- En Chrome (perfil "Claude"), `http://localhost:3000`: pegar enlace carga vídeo; texto + lupa/Enter → resultados; panel avanzado con varios filtros → URL refleja filtros y resultados cambian; paginación; abrir resultado → vídeo y aparece en sesiones guardadas; atrás → vuelve a resultados sin nueva petición a `/api/search` (pestaña Network); recargar con `?q=…` → resultados desde caché; "× Clear search" (cabecera de resultados y dentro del input) → desaparecen resultados, input y panel avanzado vacíos, URL sin `?q=…` y vuelve el listado de sesiones guardadas; botón Save en tarjeta → aparece en sesiones sin abrir el vídeo y la tarjeta pasa a "Saved"; logo → home con solo sesiones guardadas.
  - Settings: bajar "Cached searches" a 2 y hacer 3 búsquedas → `localStorage['yt-search-cache']` conserva solo las 2 últimas; "Clear search cache" lo vacía; export de backup no contiene el caché; cambiar idioma no borra `searchCacheSize`.

## Cambios respecto al plan durante la implementación
- **Caché por nº de página, no por `pageToken`**: YouTube da tokens distintos a la misma página según se llegue hacia delante (`nextPageToken`) o hacia atrás (`prevPageToken`), así que indexar por token repetía la búsqueda al pulsar *Previous*. Como una búsqueda siempre empieza en la página 1 y avanza de una en una, el nº de página es una clave estable.
- **Botón *Search* del panel avanzado**: solo se habilita si el formulario tiene algún filtro y difiere de la búsqueda que ya se muestra. "Has the words" es opcional (se puede buscar solo por frase exacta, canal, etc.).
- **Enlace de vídeo en el input**: si el input contiene un enlace válido, el panel avanzado se abre con "Has the words" vacío.
- **Búsqueda vacía**: `onSearch` no hace nada (antes cerraba el vídeo abierto sin lanzar ninguna búsqueda).
- **Guardar desde resultados**: `SessionListService.save()` (en lugar de `StorageService`/`WorkspaceService`), con `savedIds` calculado en el mismo servicio.
- **"×" del input y logo**: siempre limpian vídeo y búsqueda a la vez (`goHome()`).
- **Selects del panel**: el formulario inicializa todos los campos a `''` para que los selects muestren su opción "Any".
