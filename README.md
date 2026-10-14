# asistente-landing — sitio de Yaruki

Sitio estático (HTML/CSS/JS, sin paso de build) para `yaruki.hjgr.dev`. Construido
según `asistente-ia-ops/docs/plan-landing-yaruki.md`. Incluye el teléfono 3D
con la coreografía de scroll (`assets/js/stage.js`), la demo de tema al
cargar con revelado circular (`theme-demo.js`) y los detalles de la ronda del
dueño: escritorio lado a lado, textos escalonados, titular palabra por
palabra, barra de progreso, navegación con puntos, CTAs magnéticos, tilt y
contadores (ver "Detalles de la portada").

## Estructura

```
asistente-landing/
├── index.html              Home: hero + teléfono 3D, fases del recorrido, cierre, Centro de Privacidad
├── privacidad/index.html   Política de privacidad
├── terminos/index.html     Términos y condiciones
├── eliminar-cuenta/index.html  Cómo eliminar tu cuenta
├── 404.html                Página de error, servida por el handle_errors de Caddy
├── sitemap.xml             URLs canónicas con su lastmod (sin 404 ni la verificación de Google)
├── robots.txt              Permite todo y apunta al sitemap
├── google9633e8d6c904333e.html  Verificación de Search Console: NO borrar (Google la revisa periódicamente)
├── assets/
│   ├── css/
│   │   ├── tokens.css   Colores/tipografía/espaciado/tema (claro, oscuro, y el `data-theme` del toggle)
│   │   ├── fonts.css    @font-face de las páginas legales y 404 (assets/fonts/)
│   │   ├── fuentes-portada.css  @font-face de la portada (recortes latinos de assets/fuentes/)
│   │   ├── base.css     Layout, grid con escenario sticky, componentes compartidos
│   │   ├── phone.css    El teléfono 3D (marco, bisel, isla, canto en capas, espalda)
│   │   └── scenes.css   Contenido de cada escena dentro de la pantalla del teléfono
│   ├── js/
│   │   ├── config.js    BRAND_NAME / BETA_URL
│   │   ├── theme.js     Toggle sol/luna (revelado circular con View Transitions, crossfade de respaldo)
│   │   ├── theme-demo.js  Demo de tema al cargar, una vez por visita, con la pista junto al toggle
│   │   ├── stage.js     Coreografía de scroll y modo de inspección `?escena=&cara=&angulo=`
│   │   ├── revelar.js   Aparición escalonada de los textos (atada al vuelo en escritorio)
│   │   ├── progreso.js  Barra de avance (respaldo JS) y "Desliza para descubrir"
│   │   ├── nav-recorrido.js  Navegación con puntos por sección (escritorio)
│   │   ├── magnetico.js CTAs magnéticos (escritorio, CTA activo)
│   │   ├── tilt.js      Inclinación del teléfono con el mouse (±4°, quieto)
│   │   ├── icons.js     SVG de los íconos de trazo (Elemento + navbar), compartidos entre escenas
│   │   ├── main.js      Punto de entrada (`<script type="module">`)
│   │   ├── scenes/      Un módulo por escena: splash, login, chat, elementos, habitos, logro, avisos, llamada, dashboard (+ contar.js)
│   │   └── vendor/      GSAP + ScrollTrigger + canvas-confetti vendorizados (ver licencias abajo)
│   ├── fonts/     .woff2 completos + OFL.txt (páginas legales)
│   ├── fuentes/   los mismos pesos recortados al rango latino + OFL.txt (portada)
│   └── img/       favicon.svg, favicon-32.png, apple-touch-icon.png y og-yaruki.png (ver "Íconos e imagen para compartir")
└── README.md
```

## Modo de inspección del teléfono (sólo desarrollo)

`index.html?escena=<id>&cara=<id>` — ninguno de los dos parámetros tiene UI
visible, son sólo para QA/capturas. **Con cualquiera de los dos presentes,
`stage.js` no arranca GSAP/ScrollTrigger en absoluto** — monta la escena
pedida una sola vez y fija la cara, estático, igual que en la etapa 2:
- `escena`: `splash` (por defecto) · `login` · `chat` · `elementos` ·
  `habitos` · `logro` · `avisos` · `llamada` · `dashboard` (ids de `assets/js/scenes/registro.js`).
- `cara`: `frente` (por defecto, 0°) · `canto` (80°, ver nota abajo) ·
  `espalda` (180°).
- `angulo`: cualquier ángulo en grados (p. ej. `?angulo=120`), gana sobre
  `cara`. Sirve para revisar el canto en ángulos intermedios.

Ejemplo: `index.html?escena=habitos&cara=espalda`. **`canto` usa 80°, no 90°
exactos** — a 90° el frente y la espalda quedan perfectamente de filo (sin él
no se ve el bisel con profundidad real); 80° deja una pizca de perspectiva
visible, que es lo que pide el plan ("≈ 90°").

## Coreografía de scroll (`assets/js/stage.js`)

Sin parámetros de inspección, `inicializarCoreografia()` arma todo con GSAP +
ScrollTrigger y `gsap.matchMedia()` con 3 ramas:

- **Escritorio (≥1024px) con movimiento:** el teléfono cruza de una columna
  a la otra (escala 0.9 a mitad de vuelo) girando 360° en Y entre cada fase,
  y el texto de cada sección va en la columna libre; la escena cambia al 50%
  del progreso (de espaldas). Sin movimiento, el teléfono salta de columna
  apagado y reaparece cuando la columna nueva quedó libre de texto.
- **Móvil (<1024px) con movimiento:** el mismo giro 360°, en el lugar, con el
  teléfono en la franja sticky de 44vh. En horizontal (alto ≤520px) el layout
  pasa a 2 columnas.
- **`prefers-reduced-motion: reduce`:** sin giros ni vuelo; cada fase cruza
  con un fundido discreto cuando su sección llega a la mitad del viewport.

**Sincronía texto ↔ teléfono (`TRAMOS`):** cada sección mide al menos una
pantalla y cada vuelo termina ANTES de que su texto llegue al centro
(escritorio: `top 55%`→`top 5%`; móvil: `top 85%`→`top 25%`, y el primer
vuelo arranca recién cuando el teléfono se pega arriba). Así el teléfono ya
muestra la escena de la que habla el texto mientras se lee.
**Hero:** la mascota del Splash escala y cruza a Login entre el scroll 0 y el
75% del tramo previo al primer vuelo. **Avisos (`#fase-avisos`, 2026-10-13):** la pestaña Notificaciones de la app (`scenes/avisos.js`, de `NotificacionesScreen.kt`), entre el logro y la llamada; en bucle baja un aviso del sistema y una fila se desliza a "Completar". Por esta fase, la llamada pasó a la columna derecha (`.seccion--derecha`). **Hábitos → logro (`TRAMOS_LOGRO`):**
la sección mide 160vh: primero el heatmap quieto, después un cruce de opacidad
de frente a "logro". **Cierre:** el Dashboard aterriza al centro de la página,
queda quieto mientras se lee el CTA y sube con la página cuando el sticky se
suelta (`#cta` mide 150vh en escritorio).

**Canto:** 12 capas con el contorno redondeado del marco, repartidas en Z
entre la espalda y el frente (`construirCanto`), visibles sólo cuando
|sen θ| > 0.025 (`fijarRotacion`). `will-change: transform` sólo durante un
vuelo.

**Escenas (`assets/js/scenes/*.js`):** cada una expone `id`, `mount`,
`play`, `pause` y `reset` (plan 5.3); `stage.js` llama `play`/`pause` en cada
cambio de escena. Los tamaños de `scenes.css` están en `--dp` (1dp =
100cqw/360), con los dp/sp reales del código Compose de la app.

## SEO técnico

- **`sitemap.xml`:** las 4 páginas públicas con URL absoluta y barra final, igual
  que los enlaces del sitio. `lastmod` es la fecha del último cambio de contenido
  visible de cada página: actualízala a mano cuando cambie el texto, no por
  ajustes de `<head>`.
- **`robots.txt`:** permite todo y declara el sitemap.
- **JSON-LD** en el `<head>` de `index.html` (`WebSite` + `SoftwareApplication`):
  - `applicationCategory` es `BusinessApplication`, el valor más cercano a
    productividad en la lista que acepta Google; `applicationSubCategory`
    dice "Productividad".
  - No lleva `aggregateRating` ni `review` porque todavía no existen. Sin eso
    Google no muestra la ficha enriquecida de app, pero el bloque sigue
    describiendo la app.
  - Cuando haya ficha en Google Play, agrega `downloadUrl` y las calificaciones reales.
  - Es un bloque de datos (`type="application/ld+json"`), no se ejecuta: la CSP
    `script-src 'self'` no lo bloquea.
- **Páginas legales:** cada una tiene su `<title>`, meta description y `<link rel="canonical">`.

## BRAND_NAME y BETA_URL

`assets/js/config.js` tiene las dos constantes del plan:
- `BRAND_NAME = "Yaruki"` — el HTML de cada página sigue escribiendo "Yaruki"
  literal en el texto visible (título, wordmark, copy); la constante es para
  lo que genera JS, no reemplaza al texto estático.
- `BETA_URL` — el Google Group de testers
  (`https://groups.google.com/g/yaruki-beta/`). La prueba cerrada de Google
  Play usa ese grupo como lista de testers, así que unirse es el paso 1;
  `main.js` activa los dos botones "Únete a la beta" (`#hero` y `#cta`) y
  quita su chip "Próximamente". El paso 2, aceptar la invitación en
  `https://play.google.com/apps/testing/dev.hjgr.yaruki`, está escrito en la
  lista `.pasos-beta` de `#cta`. Con `BETA_URL` vacía los botones vuelven a
  salir deshabilitados con el chip.

Si el nombre cambia, además de `config.js` es un buscar-y-reemplazar de
"Yaruki" en el HTML de las 4 páginas (y del lema "las ganas de hacerlo").

## Toggle de tema (`assets/js/theme.js`)

Sol/luna en el header. Sin tocar nada, el sitio sigue `prefers-color-scheme`
(ver `tokens.css`, bloque `@media`). Tocar el botón fija un `data-theme`
explícito en `<html>` (`:root[data-theme="dark"]`/`["light"]`, mayor
especificidad que el `@media`, por eso gana) y lo recuerda en `localStorage`
(`yaruki-theme`), envuelto en try/catch — sin storage disponible, el toggle
sigue funcionando para esa carga, sólo no sobrevive a un refresh. El cambio
usa el mismo revelado circular desde el botón que la demo de tema al cargar
(`theme-demo.js`: una vez por visita, nunca con reduced-motion, se cancela
al primer clic en el toggle).

## Detalles de la portada

- **Textos (`revelar.js`):** cada bloque entra escalonado, subiendo 24 px.
  En escritorio el texto sigue la misma posición suavizada que el teléfono:
  la sección nueva entra en el último 40% del giro (el teléfono ya dejó su
  columna) y la anterior se va en el primer 35% (antes de que llegue). Por
  eso nunca se enciman, tampoco con saltos. En móvil, entrada al 84% del
  viewport.
- **Titular del hero:** palabra por palabra en CSS (`base.css`), sin JS ni CLS.
- **Barra de progreso:** `animation-timeline: scroll()` cuando existe;
  si no, `progreso.js`.
- **Navegación con puntos (`nav-recorrido.js`):** `nav` con `aria-label`,
  `aria-current="location"` y salto a la posición en la que cada sección
  queda en lectura.
- **Mascota del header:** respira y se infla con el hover de un CTA de la beta (también mientras dice "Próximamente") o con el foco de teclado de un CTA activo. Con reduced-motion, sin escala.
- **CTAs magnéticos y tilt:** sólo puntero fino, sin reduced-motion. Los
  magnéticos toman únicamente CTAs activos: con `BETA_URL` vacía no se ven.
- **Contadores (`scenes/contar.js`):** los números de Elementos y del
  Dashboard cuentan desde 0; el valor final ya está en el HTML.

## Íconos e imagen para compartir (`assets/img/`)

- `favicon.svg`: la mascota (círculo `#6C5CE0`). Es el ícono que usan los
  navegadores con SVG.
- `favicon-32.png`: el mismo SVG rasterizado a 32 px con fondo transparente
  (`magick -background none -density 600 favicon.svg -resize 32x32`), para
  los navegadores sin favicon SVG.
- `/favicon.ico` (raíz del repo, 16/32/48 px, mismo origen): lo piden solos
  los navegadores en las páginas que no declaran ícono (las legales y la
  404, que no se tocan); sin él, cada visita dejaba un 404 en la consola.
- `apple-touch-icon.png` (180×180): la mascota con su halo sobre el fondo
  claro del sitio, sin transparencia (iOS redondea las esquinas solo).
- `og-yaruki.png` (1200×630): nombre, significado, lema y mascota, para
  Open Graph y Twitter/X. Se generó con Chromium headless desde una página
  HTML con las fuentes de `assets/fuentes/` (el `やる気` con Noto Sans CJK
  del sistema) y se pasó a PNG de 8 bits con ImageMagick (~20 KB).

Los metadatos `og:*` y `twitter:*` de `index.html` apuntan a
`https://yaruki.hjgr.dev/`, con URL absoluta (las redes no resuelven
rutas relativas). Si cambia el dominio, actualizarlos junto con
`<link rel="canonical">`.

## Librerías vendorizadas (`assets/js/vendor/`)

Nada de CDN (regla del plan y de la CSP del droplet, `script-src 'self'`).
Descargadas con `npm pack <paquete>` y copiados sólo los `.min.js` que hacen
falta — no quedó ningún `node_modules/`/`package.json` en el repo.

- **GSAP 3.15.0 + ScrollTrigger 3.15.0** (`gsap.min.js`, `ScrollTrigger.min.js`)
  — **en uso desde la etapa 4** (`assets/js/stage.js`, toda la coreografía de
  scroll), cargados como `<script src>` clásico ANTES del `<script
  type="module">` (así `window.gsap`/`window.ScrollTrigger` ya existen
  cuando corre `main.js`). Licencia: **Standard "No Charge" GSAP License**
  de Webflow (dueño de GSAP desde la adquisición a GreenSock) — gratuita
  para uso comercial o no comercial en sitios/apps siempre que la persona
  que usa el sitio no pague una cuota por acceder a él o a una parte de él
  (que es el caso de esta landing: pública y gratuita). Texto completo
  citado y verificado el 2026-10-04 en `assets/js/vendor/LICENSE-GSAP.txt`,
  fuente <https://gsap.com/standard-license/>.
- **canvas-confetti 1.9.4** (`canvas-confetti.min.js`) — el confeti del
  logro. No va en el `<head>`: `scenes/logro.js` lo carga recién cuando monta
  la escena (al acercarse a Hábitos) y nunca con reduced-motion. Licencia **ISC** (permisiva, equivalente a
  MIT/BSD-2), texto completo en `assets/js/vendor/LICENSE-canvas-confetti.txt`.

## Fuentes autoalojadas

**Portada:** usa `assets/fuentes/*-latin.woff2`, recortes de los mismos 7
pesos hechos con `fonttools subset` (rango: U+0000-00FF, U+0131, U+0152-0153,
U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122,
U+2190-2193, U+2212, U+2713, U+2022; `--layout-features='*'`). De 431 KB a
109 KB. Si se agrega texto con caracteres fuera de ese rango, regenerarlos
desde `assets/fonts/` con el mismo comando. Las páginas legales siguen con
los originales de `assets/fonts/` vía `fonts.css`.

**Originales (`assets/fonts/`):**

Convertidas de los `.ttf` de `asistente-android/app/src/main/res/font/` con
`woff2_compress` (paquete `woff2` del sistema; no se usó `fonttools` porque no
estaba instalado y no había `pip`/`pipx` disponibles en este entorno — si se
necesita subsetting más agresivo más adelante, instalar
`pip install --user fonttools brotli` y usar `fonttools subset`).

Licencia: **SIL Open Font License 1.1**, texto completo en
`assets/fonts/OFL.txt`. La cabecera de copyright que puse (`Copyright 2019 The
Baloo 2 Project Authors` / `Copyright 2018 The Manrope Project Authors`) es la
que recuerdo de los metadatos de Google Fonts para estas dos familias, **pero
no la verifiqué contra el archivo `OFL.txt` original de cada familia en este
pase** — pendiente de confirmar antes de publicar (no cambia los términos de
la licencia, sólo la atribución exacta).

## Pendientes / marcadores (no inventar al publicar)

1. ~~Retención de backups~~ → **resuelto 2026-10-04: 30 días** (decisión del dueño), con cron de rotación en el droplet. El plazo ARCO usa el artículo 31 de la LFPDPPP 2025 (20 días para responder, 15 para hacer efectivo, ampliables una vez).
2. **Atribución exacta de las fuentes** (ver arriba).
3. El badge de App Store en `index.html` queda deshabilitado (decisión 3.2 del
   plan). "Únete a la beta" ya está activo (prueba cerrada, 2026-10-13); cuando
   haya ficha pública en producción cambia a "Descárgala en Google Play"
   (decisión 3.8) y el JSON-LD gana `downloadUrl`.
4. ~~Texto del hero y el lema sin cerrar~~ → **resuelto, punto de control 2:**
   titular/subtítulo de la opción B + el significado chico arriba (ver
   "Coreografía de scroll" y el reporte de esa sesión).
5. ~~Elementos sin sección de texto propia~~ → **resuelto, punto de control
   2:** `#fase-elementos`, enganchada al recorrido (chat → Elementos →
   hábitos → llamada → Dashboard) y coreografiada igual que las demás.
6. ~~`gsap.matchMedia()` no reacomoda el teléfono al cruzar de rama~~ →
   **resuelto (M1):** al cruzar 1024 px o cambiar "reducir movimiento" se
   re-mide y se vuelve a la misma sección.
7. **Vuelo probado por scroll programático (Puppeteer) y revisión visual
   cuadro a cuadro, no por un dedo/mouse real** — el comportamiento con
   gestos táctiles reales (momentum scroll de iOS/Android) no se validó en
   este pase.

## Fuentes citadas (verificación, no en la página pública)

- **Vertex AI y entrenamiento de modelos:** según la documentación pública de
  Google Cloud, por defecto Google Cloud no usa los datos del cliente
  (prompts, respuestas) para entrenar sus modelos fundacionales, y no los usa
  para entrenar o afinar ningún modelo sin permiso explícito del cliente —
  permiso que este proyecto no otorga. Fuentes:
  - Google Cloud, *Generative AI, Privacy, and Google Cloud* (whitepaper, ago. 2023):
    <https://services.google.com/fh/files/misc/genai_privacy_google_cloud_202308.pdf>
  - Google Cloud, *Gemini Enterprise Agent Platform and zero data retention*:
    <https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention>
  - Nota: por defecto Vertex AI guarda el input/output por 24 horas para
    reducir latencia y puede registrar prompts para monitoreo de abuso; esto
    es compatible con la sección 7 de la política ("conservamos mientras la
    cuenta esté activa", ya que esa ventana de 24h es de Google, no nuestra) y
    no contradice el "uso limitado" declarado.
- **LFPDPPP 2025:** la ley nueva fue publicada el 20 de marzo de 2025,
  reemplaza a la INAI con la Secretaría Anticorrupción y Buen Gobierno como
  autoridad, y **elimina la obligación de informar sobre transferencias en el
  aviso de privacidad** (artículo 15 reformado). Pese a eso, la política de
  Yaruki **sí declara la transferencia internacional** (sección 5) porque
  Google Play lo exige igual y es una buena práctica de transparencia.
  Fuentes:
  - Basham, *Nueva Ley Federal de Protección de Datos Personales en Posesión
    de los Particulares publicada en el DOF*:
    <https://basham.com.mx/en/nueva-ley-federal-de-proteccion-de-datos-personales-en-posesion-de-los-particulares-publicada-en-el-diario-oficial-de-la-federacion/>
  - Pirani Risk, *LFPDPPP: Guía de la Ley de Protección de Datos en México*:
    <https://www.piranirisk.com/es/hub-regulatorio/lfpdppp-ley-proteccion-datos-mexico>
  - Plazo ARCO (sección 9 de la política y `/eliminar-cuenta`): **artículo 31 de la LFPDPPP 2025**, indicado por el dueño el 2026-10-04: máximo 20 días para comunicar la respuesta desde que se recibe la solicitud y 15 días para hacerla efectiva, ampliables una sola vez por un periodo igual. Se escribe como "días", sin "hábiles".

## Despliegue (NO ejecutado — sólo instrucciones para cuando el dueño lo apruebe)

### 1. DNS en Cloudflare

Agregar un registro:

| Tipo | Nombre | Destino | Proxy |
|---|---|---|---|
| A | `yaruki` | `159.223.135.90` | **DNS only** (nube gris, no naranja) |

Igual que `asistente.hjgr.dev`, para que Caddy pueda emitir el certificado TLS
directamente con el reto HTTP-01/TLS-ALPN sin que Cloudflare intercepte la
conexión.

### 2. Clonar el repo en el droplet

Caddy corre como el usuario de sistema `caddy`, que no puede leer dentro de
`/home/harold2003` (permisos `700` del home). Por eso el repo se clona fuera
del home, en `/var/www`:

```bash
ssh <usuario>@<droplet>
sudo mkdir -p /var/www
sudo chown harold2003:harold2003 /var/www
git clone <url-del-repo> /var/www/asistente-landing
chmod -R a+rX /var/www/asistente-landing
```

(Este repo todavía no existe en GitHub: el PM avisa al dueño antes de crearlo
y hacer push. Mientras tanto, el `git clone` de arriba usa una ruta de ejemplo.)

### 3. Bloque de Caddy

Agregar al `Caddyfile` del droplet (junto al bloque existente de
`asistente.hjgr.dev`), **sin tocarlo**:

```caddyfile
yaruki.hjgr.dev {
	root * /var/www/asistente-landing
	encode gzip zstd

	try_files {path} {path}/index.html {path}.html

	# El sitio se sirve desde el clon del repo: nunca exponer `.git` (todo el
	# historial) ni los archivos que no son del sitio.
	file_server {
		hide .git README.md
	}

	# Recursos estáticos: caché larga. Sin hash en los nombres, así que
	# `max-age` de un día + `stale-while-revalidate`: un despliegue se ve a
	# más tardar al día siguiente sin perder las visitas repetidas rápidas.
	# Si se agregan hashes a los nombres, subir a `max-age=31536000, immutable`.
	@recursos path /assets/*
	header @recursos Cache-Control "public, max-age=86400, stale-while-revalidate=604800"

	handle_errors {
		rewrite * /404.html
		file_server
	}

	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "geolocation=(), camera=(), microphone=(), interest-cohort=()"
		Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
		-Server
	}
}
```

Notas:
- **CSP:** todo el JS (GSAP, ScrollTrigger y canvas-confetti vendorizados en
  `assets/js/vendor/`, más los módulos propios) y las fuentes se sirven
  desde el mismo origen, así que `script-src 'self'` y `font-src 'self'`
  alcanzan. No hay nada inline: los estilos que calcula JS van por CSSOM
  (`el.style.setProperty`), que la CSP permite.
- **`hide .git README.md`:** el repo se clona tal cual en `/var/www`; sin esto,
  `https://yaruki.hjgr.dev/.git/config` (y con él todo el historial) quedaba
  público.
- **Caché de `/assets/*`:** ver el comentario en el bloque. El HTML no lleva
  `Cache-Control` propio: Caddy manda `ETag`/`Last-Modified` y el navegador
  revalida en cada visita, así que un despliegue se ve al instante.
- **HSTS:** sólo `max-age`, sin `includeSubDomains` ni `preload`. Es un
  subdominio propio con su propio certificado; `preload` compromete al dominio
  raíz completo con los navegadores de forma casi irreversible, y no
  corresponde decidirlo desde el bloque de un subdominio.
- **`-Server`:** quita la cabecera `Server` de la respuesta para no anunciar
  la versión de Caddy.
- **`handle_errors`:** sirve `404.html` (en la raíz del repo, con los mismos
  tokens del sitio) para cualquier error, en vez de la página en blanco por
  defecto de Caddy. Caddy conserva el código de estado original de la
  petición (404, 500, etc.) aunque el cuerpo sea el de `404.html`.
- Se quitó el matcher `@tieneBarra` de una versión anterior de este bloque:
  quedaba definido pero nada lo usaba.

### 4. Validar, recargar y verificar

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy

# Verificación: debe responder 200 con las cabeceras de seguridad de arriba.
curl -sI https://yaruki.hjgr.dev/privacidad/ | head -5
```

Validar primero es obligatorio: un error en el bloque nuevo no debe tumbar
`asistente.hjgr.dev`. Si `curl` no devuelve `200` o faltan las cabeceras,
revisar el bloque antes de dar el despliegue por terminado.

### 5. Actualizar

```bash
cd /var/www/asistente-landing && git pull
# sólo si cambió el Caddyfile:
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
# y volver a verificar, igual que en el paso 4:
curl -sI https://yaruki.hjgr.dev/privacidad/ | head -5
```

No toca Sail ni el worker de colas del backend. Impacto en RAM: despreciable.

## Capturas de verificación visual

Tomadas con Chromium headless (`--headless=new`; oscuro con `--force-dark-mode
--enable-features=WebContentsForceDark`), servido con `python3 -m http.server`.

- **Punto de control 1** (etapas 1-2): el teléfono de frente/canto/espalda
  (`?cara=`), las 8 escenas (`?escena=`) y la página completa en desktop
  (1440×900)/móvil (390×844), en claro y oscuro.
- **Punto de control 2** (correcciones + etapas 3-4): capturas de cada
  corrección (claro/oscuro donde aplica) + el hero en desktop/móvil, más un
  video del scroll completo en desktop (1440×900, bajando y subiendo, con
  Puppeteer-core apuntando a este mismo `/usr/bin/chromium` — scroll
  programático con `window.scrollTo`, NO un gesto real, ver "Pendientes") y
  2 tiras de ~12 cuadros (bajando/subiendo) alrededor de un cruce de fase,
  para revisar la rotación sin abrir el video.

Rutas exactas en el reporte de cada sesión (carpeta de scratchpad de esa
sesión, no forma parte de este repo).
