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
│   ├── fonts/     .woff2 completos + un `OFL-<Familia>.txt` por familia (páginas legales)
│   ├── fuentes/   los mismos pesos recortados al rango latino + los mismos `OFL-*.txt` (portada)
│   └── img/       favicon.svg, favicon-32.png, apple-touch-icon.png y og-yaruki.png (ver "Íconos e imagen para compartir")
├── scripts/versionar.py    Cache busting (`?v=<hash>`), ver más abajo
├── scripts/pruebas/        Pruebas y revisión visual (Playwright, Lighthouse, validar); ver «Pruebas y revisión visual»
└── README.md
```

## Cache busting (`scripts/versionar.py`)

Los recursos propios (`assets/css/*.css`, `assets/js/**/*.js`) llevan `?v=<hash>`
en los `<link>`/`<script>` de todos los `.html` **y en los `import` entre módulos
JS** (los módulos ES también se cachean: versionar sólo `main.js` dejaba un
`chat.js` viejo con el `index.html` nuevo). El hash es del contenido de esos
archivos, no del commit, así que cambia sólo cuando cambia algo.

**Antes de cada publicación** (o después de resolver un merge que toque `assets/`):

```bash
python3 scripts/versionar.py          # reescribe las URLs; idempotente
python3 scripts/versionar.py --check  # no escribe; sale con 1 si hay URLs viejas
```

Y haz commit del resultado. Si dos ramas tocan `assets/`, el hash de cada una
choca al mergear: resuélvelo corriendo el script de nuevo. Los vendor
(`assets/js/vendor/`) también llevan versión en el HTML, pero sus propios
imports no se tocan; el confeti (`new URL(...)` en `logro.js`) se carga sin versión
porque ese archivo no cambia.

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
**Hero:** la mascota del Splash escala hasta tapar la pantalla entera
(`ESCALA_MASCOTA`, ≈9.5: con 6 quedaban dos franjas moradas y Login se fundía
sobre ellas) y cruza a Login. En escritorio, entre el scroll 0 y el 75% del
tramo previo al primer vuelo; en móvil/tablet la franja del teléfono entra
desde abajo del CTA, así que el tramo arranca recién cuando la franja terminó
de entrar en pantalla (#11: antes el círculo crecía con el teléfono todavía
cortado por el borde inferior del viewport) y termina antes del primer giro.
**Avisos (`#fase-avisos`, 2026-10-13):** la pestaña Notificaciones de la app (`scenes/avisos.js`, de `NotificacionesScreen.kt`), entre el logro y la llamada; en bucle baja un aviso del sistema y una fila se desliza a "Completar". Por esta fase, la llamada pasó a la columna derecha (`.seccion--derecha`). **Hábitos → logro (`TRAMOS_LOGRO`):**
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
  ajustes de `<head>`. Antes de abrir una PR que toque el texto de una
  página, compara con la fecha del último commit de cada una:

  ```bash
  for p in index.html privacidad/index.html terminos/index.html eliminar-cuenta/index.html; do
    printf '%s  %s\n' "$(git log -1 --format=%ad --date=short -- "$p")" "$p"
  done
  grep -n lastmod sitemap.xml
  ```

  Si una página tiene un commit de contenido posterior a su `lastmod`, se
  actualiza en la misma PR (el `/` se quedó en 2026-10-29 con dos cambios de
  texto encima; se corrigió en #11).
- **`robots.txt`:** permite todo y declara el sitemap.
- **Open Graph y Twitter/X** en las 4 páginas públicas (`index.html`, privacidad,
  términos y eliminar cuenta), con la misma imagen `og-yaruki.png` 1200×630. La
  página 404 lleva `noindex` a propósito.
- **JSON-LD** (`type="application/ld+json"`, un bloque de datos que la CSP `script-src 'self'` no ejecuta ni bloquea),
  revisado el 2026-11-10 contra la documentación de Google (software-app, breadcrumb, organization) y schema.org:
  - **Portada:** un `@graph` con `WebSite`, `WebPage`, `Person` (el autor/publicador, `#autor`) y `SoftwareApplication`,
    enlazados por `@id` (`publisher`, `author`, `isPartOf`, `about`).
  - **Nombre en `Person`:** `Harold de Jesús García Ramírez`, exactamente como ya lo publican la política de privacidad,
    los Términos y el pie del sitio (`validar` exige que cualquier nombre de `Person` aparezca en el texto visible).
  - **Páginas legales:** `WebPage` + `BreadcrumbList` (Yaruki > página; el último elemento omite `item`, como permite Google).
  - `offers` con `price: "0"` y `isAccessibleForFree: true`: es veraz (los Términos dicen «Hoy no cobramos nada» y la
    portada habla del plan gratuito). No se inventa precio de premium.
  - `applicationCategory` es `BusinessApplication`, el valor más cercano a productividad en la lista que acepta Google;
    `applicationSubCategory` dice "Productividad".
  - **Prohibido** `aggregateRating`, `review` y `downloadUrl` (no existen todavía). Google exige `aggregateRating` o `review`
    para la ficha enriquecida de app, así que esa ficha no saldrá hasta que haya reseñas reales; el bloque sigue
    describiendo la app. Cuando haya ficha en Google Play, se agregan `downloadUrl` y las calificaciones reales.
  - **`FAQPage`** lo agrega quien escriba las preguntas visibles (el JSON-LD debe reflejar texto visible).
  - **Validación:** `validar` (estructura mínima por tipo, referencias `@id` resueltas, prohibidas) y
    `scripts/pruebas/test_jsonld.py` (defectos sembrados). No existe un validador offline mantenido y de licencia limpia
    (`structured-data-testing-tool` no se actualiza desde 2022), así que además pega la URL publicada, o el bloque, en el
    [Rich Results Test](https://search.google.com/test/rich-results) y en el [validador de schema.org](https://validator.schema.org/).
- **`hreflang`: no se usa.** Google lo define para sitios con varias versiones de idioma o región; esta landing tiene una
  sola (es-MX), y `<html lang="es-MX">`, `og:locale` `es_MX` e `inLanguage` ya lo declaran. Se agrega solo si aparece otra versión.
- **`theme-color`** claro y oscuro y `og:image:alt`/`twitter:image:alt` en las 4 páginas públicas (`validar` los exige).
- **Páginas legales:** cada una tiene su `<title>`, meta description y `<link rel="canonical">`.

## BRAND_NAME y el enlace de la beta

`assets/js/config.js` tiene una sola constante:
- `BRAND_NAME = "Yaruki"` — el HTML de cada página sigue escribiendo "Yaruki"
  literal en el texto visible (título, wordmark, copy); la constante es para
  lo que genera JS, no reemplaza al texto estático.

El enlace de "Únete a la beta" **ya no es una constante de JS** (#21): es el
`href` de los dos botones `[data-cta-beta]` de `index.html` (`#hero` y `#cta`),
escrito a mano, activo y sin chip "Próximamente" desde el HTML. Apunta al
Google Group de testers (`https://groups.google.com/g/yaruki-beta/`); la
prueba cerrada de Google Play usa ese grupo como lista, así que unirse es el
paso 1. El paso 2, aceptar la invitación en
`https://play.google.com/apps/testing/dev.hjgr.yaruki`, está escrito en la
lista `.pasos-beta` de `#cta`. Así el enlace existe para rastreadores y para
quien navega sin JS, y no queda una segunda fuente de verdad que pueda
contradecir al HTML en silencio. Para cambiarlo, edita el `href` en los dos
botones (y el de la lista `.pasos-beta`, que apunta al mismo grupo);
`node scripts/pruebas/sin-js.mjs` comprueba que sean enlaces navegables.
`main.js` ya no toca esos botones; solo el efecto magnético los toma.

**Sin JavaScript** (`sin-js.mjs`): el contenido y los enlaces están en el HTML.
Lo decorativo que solo vive con JS (el teléfono, que `stage.js` llena y
coloca; el toggle de tema; la pista «Desliza para descubrir») se oculta con
`assets/css/sin-js.css`, que `index.html` carga dentro de `<noscript>` (con JS
no se descarga) y que también quita las alturas de pantalla completa de las
secciones. Los textos nunca los oculta el CSS: `revelar.js` pone la opacidad 0
solo cuando corre.

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
- **Mascota del header:** respira y se infla con el hover de un CTA de la beta o con el foco de teclado de un CTA activo. Con reduced-motion, sin escala.
- **CTAs magnéticos y tilt:** sólo puntero fino, sin reduced-motion. Los
  magnéticos toman únicamente CTAs activos: los botones de la beta ya son activos desde el HTML.
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
  (que es el caso de esta landing: pública y gratuita). Texto oficial
  íntegro (incluye cláusulas de Amendments, FAQ y fechas: vigente 2025-04-30,
  modificada 2025-05-30) en `assets/js/vendor/LICENSE-GSAP.txt`, fuente
  <https://gsap.com/standard-license/>, recotejado el 2026-11-10 (el
  2026-10-04 se había citado de forma abreviada). Los dos `.min.js` son
  idénticos byte a byte a `dist/` de `npm pack gsap@3.15.0`.
- **canvas-confetti 1.9.4** (`canvas-confetti.min.js`) — el confeti del
  logro. No va en el `<head>`: `scenes/logro.js` lo carga recién cuando monta
  la escena (al acercarse a Hábitos) y nunca con reduced-motion. Licencia **ISC** (permisiva, equivalente a
  MIT/BSD-2), texto completo en `assets/js/vendor/LICENSE-canvas-confetti.txt`
  (idéntico al `LICENSE` de `npm pack canvas-confetti@1.9.4`; el
  `canvas-confetti.min.js` es byte a byte `dist/confetti.browser.js` de ese
  paquete, verificado el 2026-11-10).

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

Licencia: **SIL Open Font License 1.1**, un archivo por familia, **copia
byte a byte** del `OFL.txt` canónico (en `assets/fonts/` y `assets/fuentes/`):

| Familia | Archivo | Copyright (línea 1, tal cual) | Reserved Font Name |
|---|---|---|---|
| Baloo 2 (Ek Type) | `OFL-Baloo2.txt` | `Copyright 2019 The Baloo 2 Project Authors (https://github.com/EkType/Baloo2)` | ninguno |
| Manrope (Mikhail Sharanda) | `OFL-Manrope.txt` | `Copyright 2018 The Manrope Project Authors (https://github.com/googlefonts/manrope)` | ninguno |

**Verificado el 2026-11-10** contra `google/fonts@5bb2873` (`main` ese día):
`ofl/baloo2/OFL.txt` (último cambio `8e0cd05`) y `ofl/manrope/OFL.txt`
(último cambio `16c2976`); URLs
<https://github.com/google/fonts/blob/5bb28733cec313b63fbd415b574b5ae35c8aa8b8/ofl/baloo2/OFL.txt>
y `.../ofl/manrope/OFL.txt`. Baloo 2 coincide también con los repos de origen
(`EkType/Baloo2-Variable` y `yanone/Baloo2-Variable` en `da523df`, la
referencia de `ofl/baloo2/upstream_info.md`). Manrope: `aaronbell/manrope` en
`6f81ebe` (byte a byte el `.ttf` de google/fonts) trae "Copyright 2018 ...
(sharanda/manrope)", repo hoy borrado.

- **Qué estaba mal:** un solo `OFL.txt` con los dos copyright juntos (no existe
  en ninguna fuente), con el texto de la licencia re-envuelto y el aviso de
  Manrope sin URL. Ahora cada familia lleva su archivo exacto.
- **Reserved Font Name:** ninguna de las dos familias lo declara (la línea
  "with Reserved Font Name ..." no existe en ninguno de los dos OFL). Los
  `.woff2` completos y los recortes a rango latino (`fonttools subset`)
  conservan los nombres originales sin problema; la cláusula 3 no aplica.
  Convertir a woff2 y recortar son "Modified Version" permitidas por la
  cláusula de permiso; se redistribuyen con la misma licencia y su aviso
  (cláusulas 2 y 5).
- **Discrepancia de upstream (informativa):** la cadena de copyright
  *incrustada* en los `.ttf` de Manrope (name ID 0) dice "Copyright 2019 ...
  (https://github.com/sharanda/manrope)", mientras los OFL de google/fonts y de
  aaronbell dicen 2018, y el `METADATA.pb` de google/fonts dice 2019 +
  googlefonts/manrope. Se conserva el OFL canónico de google/fonts y no se
  modifican los metadatos de las fuentes. Los 14 `.woff2` se comprobaron: son
  Baloo 2 v1.700 y Manrope v4.504 (nombres internos intactos).
- **Verificación automática:** `python3 -I scripts/pruebas/licencias.py`
  (hashes de los OFL canónicos, copyright, ausencia de RFN, licencias de
  `vendor/`).

## Pendientes / marcadores (no inventar al publicar)

1. ~~Retención de backups~~ → **resuelto 2026-10-04: 30 días** (decisión del dueño), con cron de rotación en el droplet. El plazo ARCO usa el artículo 31 de la LFPDPPP 2025 (20 días para responder, 15 para hacer efectivo, ampliables una vez).
2. ~~Atribución exacta de las fuentes~~ → **resuelto 2026-11-10** (ver "Fuentes autoalojadas": OFL canónicos de google/fonts@5bb2873, sin Reserved Font Name; licencia de GSAP completada).
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

## Después de publicar (IndexNow)

IndexNow avisa a Bing, Yandex, Seznam, Naver y otros de las URLs que cambiaron (Google no participa: para Google
siguen valiendo Search Console y el sitemap). La clave vive en `72d573f4443baf5a20fc8627fb495555.txt`, en la raíz:
el protocolo exige publicarla (no es un secreto) y su contenido es exactamente la clave. Caddy no la oculta
(`hide` solo cubre `.git`, `README.md`, `scripts`, `package*.json`). Tras el primer `git pull` en el droplet:

```bash
curl -s https://yaruki.hjgr.dev/72d573f4443baf5a20fc8627fb495555.txt   # debe imprimir exactamente la clave
```

Después de cada publicación, desde tu laptop y con el repo ya actualizado (avisa solo de las páginas del
sitemap cuyo HTML cambió en el rango de commits):

```bash
python3 scripts/indexnow.py --desde <commit-publicado-antes>          # SIMULACIÓN: imprime lo que mandaría
python3 scripts/indexnow.py --desde <commit-publicado-antes> --enviar # lo manda (api.indexnow.org)
```

También: `--urls URL ...` (URLs explícitas del mismo host) y `--todas`. Con `--enviar` comprueba antes que la clave
ya esté publicada y responde `200`/`202` (ok) o `403`/`422` (clave sin publicar / URLs de otro host). El dominio sale
de `scripts/sitio.json`, así que tras la mudanza a dominio propio el aviso sigue solo (la clave viaja con el repo).

## Mudanza a dominio propio

El dominio vive en **un solo lugar**: `scripts/sitio.json` (`{"origen": "https://yaruki.hjgr.dev"}`).
`scripts/dominio.py` (solo biblioteca estándar) reescribe a partir de ahí todas las URLs
absolutas, de forma idempotente, sin build:

```bash
python3 scripts/dominio.py --check                    # no escribe; sale ≠ 0 si algo no coincide
python3 scripts/dominio.py --origen https://yaruki.app  # fija sitio.json y reescribe
python3 scripts/dominio.py                            # reescribe al origen de sitio.json
```

Reescribe: `canonical` y `alternate`, `og:url`, `og:image`, `twitter:image`/`twitter:url`, cualquier
`href`/`src`/`content` absoluto al dominio propio (por ejemplo un `<a href>` absoluto), las cadenas URL
del JSON-LD cuyo host es el propio, `sitemap.xml` y `robots.txt`. Las páginas nuevas (carpetas con
`index.html`) se descubren solas. Lo que **no** reescribe, lo reporta y sale con 1: una URL de otro host
en `@id`/`url`/`image`/`logo`/`item`/`mainEntityOfPage` del JSON-LD (puede ser un sitio externo
legítimo; si lo es, agrega su host a `EXTERNOS` en `dominio.py` y `validar.mjs`) y cualquier «fuga» del
dominio viejo en JS, CSS, JSON/manifest, XML, TXT, SVG o texto del HTML (se corrige a mano).
`validar` lee `sitio.json` (no tiene el dominio escrito) y su regla `dominio` falla si queda una
URL absoluta propia con otro origen; `todo.mjs` corre `dominio.py --check` y sus pruebas
(`scripts/pruebas/test_dominio.py`, que prueban el viaje de ida y vuelta byte a byte).

**Excepciones deliberadas** (el dominio viejo puede seguir apareciendo ahí):
- Este README (documenta la mudanza y el despliegue).
- `scripts/pruebas/test_dominio.py` (lo usa como dato de prueba).
- `privacidad@hjgr.dev`: es el **correo** de contacto, no la URL del sitio. Sigue igual mientras
  el buzón siga en `hjgr.dev`; si algún día se muda, es un buscar-y-reemplazar aparte en las 4 páginas
  (los textos legales no nombran el dominio del sitio, solo ese correo).
- `dev.hjgr.yaruki` (identificador del paquete en Play) y `asistente.hjgr.dev` (la API): no son el sitio.

### Pasos para Harold

1. **Comprar el dominio** (`yaruki.app` o `.mx`) y ponerlo en Cloudflare. DNS: registro `A` de la raíz
   (y de `www`) a `159.223.135.90`, **DNS only** (nube gris), igual que en «Despliegue».
2. **Caddy: bloque nuevo.** Copia el bloque de `yaruki.hjgr.dev` de «Despliegue §3» (con el mismo `hide`,
   que debe incluir `scripts package.json package-lock.json`) cambiando solo el encabezado por
   `yaruki.app { ... }`, y agrega `www.yaruki.app { redir https://yaruki.app{uri} permanent }`.
   El mismo clon `/var/www/asistente-landing` sirve a los dos. Valida y recarga:
   `sudo -u caddy -H caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.
3. **En el repo** (PR normal): `python3 scripts/dominio.py --origen https://yaruki.app`, luego
   `cd scripts/pruebas && node validar.mjs` (debe dar 0), revisar `git diff` y, en `main`, `python3 scripts/versionar.py`.
   Actualiza en el README el `yaruki.hjgr.dev` de los comandos de verificación. Despliega con `git pull`.
4. **Redirecciones 301 del dominio viejo, ruta por ruta.** Cambia el bloque de `yaruki.hjgr.dev` por:

   ```caddyfile
   yaruki.hjgr.dev {
   	root * /var/www/asistente-landing

   	# El archivo de verificación de Search Console sigue respondiendo 200 en el dominio viejo
   	# (Search Console no sigue redirecciones a otro dominio al verificar y revisa el archivo
   	# periódicamente), para que la propiedad vieja siga verificada y «Cambio de dirección» funcione.
   	@verificacion path /google9633e8d6c904333e.html
   	handle @verificacion {
   		file_server
   	}

   	handle {
   		redir https://yaruki.app{uri} permanent
   	}
   }
   ```

   Valida y recarga igual que en el paso 2 (`sudo -u caddy -H caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`).
   `{uri}` conserva ruta y query (`/privacidad/` → `https://yaruki.app/privacidad/`); `permanent` es un 301.
   Comprueba: `curl -sI https://yaruki.hjgr.dev/privacidad/ | head -3` (301 y `location: https://yaruki.app/privacidad/`),
   y lo mismo con `/`, `/terminos/`, `/eliminar-cuenta/`, `/sitemap.xml` y una URL inexistente.
5. **Search Console.**
   - Da de alta el dominio nuevo y verifícalo. `google9633e8d6c904333e.html` **no se toca**: se queda en el repo
     (y en el sitio viejo, ver paso 4). Ese archivo verifica una propiedad por prefijo de URL del dominio donde
     responde; como el repo ahora también lo sirve en `yaruki.app`, puede verificar la propiedad nueva, pero lo más sólido es
     una propiedad de **dominio** con registro TXT en DNS, que cubre `www` y subdominios. La propiedad vieja debe seguir verificada.
   - Con ambas verificadas, en la propiedad **vieja**: Configuración → **Cambio de dirección** → elige la nueva.
     (Solo aplica al pasar de un dominio o subdominio a otro, que es este caso.)
   - Envía el sitemap nuevo (`https://yaruki.app/sitemap.xml`) y pide indexar la portada.
   - Bing Webmaster Tools: da de alta el dominio nuevo (puedes importarlo de Search Console).
   - Orden que recomienda Google: redirecciones, revisar canonical/robots, probarlas, Cambio de dirección, mantener
     las redirecciones y enviar el sitemap nuevo.
6. **Cuánto mantener el 301:** Google dice «Keep the redirects for as long as possible» y, en general, **al menos
   un año**, pudiendo ser indefinido. Plan: mantenerlo indefinidamente (cuesta nada). Fuente:
   <https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes> (consultada el 2026-11-10).
7. **App Links / `ANDROID_APP_SHA256`: no intervienen.** Verificado en `asistente-android` `origin/main`
   (`app/src/prod/AndroidManifest.xml`, `MainActivity.kt`) y en `.well-known`: los App Links usan el dominio de la **API**
   (`asistente.hjgr.dev`, que sirve `/.well-known/assetlinks.json`), no el de la landing. `/.well-known/` de la landing no se toca.
8. **App Android:** `app/src/main/res/values/enlaces_legales.xml` tiene escritas las URLs legales de
   `yaruki.hjgr.dev`. Siguen funcionando mientras el 301 exista, pero conviene cambiarlas en la siguiente versión
   (y su prueba `AbrirEnlaceExternoTest`). Backend: solo un comentario en `config/legal.php` y los runbooks.
9. **`BETA_URL`:** es el Google Group de testers; no depende del dominio. No cambia.
10. **Política de privacidad y Términos:** no nombran el dominio del sitio (solo el correo): no requieren texto nuevo.
11. **Ficha de Play Console:** actualiza la **URL de la política de privacidad** (Contenido de la app), el sitio web
    del desarrollador, el enlace de eliminación de cuenta del formulario de Seguridad de los datos y el correo/URL de
    contacto si los muestra. El enlace viejo seguirá redirigiendo.
12. **Backlinks:** actualiza el perfil de GitHub, la descripción del repo y lo que enlace al dominio viejo.

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

(El repo ya existe en GitHub, es **público a propósito** como estrategia de SEO
(`69Harold69/asistente-landing`, rama `main`) y el droplet lo tiene clonado en
`/var/www/asistente-landing`. Para actualizar: `git pull` ahí; no hace falta
recargar Caddy. La última publicación es `cc51b60` del 2026-11-02.)

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
- **PENDIENTE de Harold (no ejecutado): ocultar también lo de pruebas.** El droplet
  sirve el clon tal cual, así que `scripts/` (herramientas de prueba, no
  sensibles pero sin razón para estar públicas), `package.json` y
  `package-lock.json` serían descargables. Cambiar el `hide` del bloque a
  `hide .git README.md scripts package.json package-lock.json` y recargar
  Caddy (`sudo caddy validate ... && sudo systemctl reload caddy`); verificar
  con `curl -sI https://yaruki.hjgr.dev/scripts/pruebas/package.json` (debe dar
  404). `node_modules/` está en `.gitignore`, así que no llega al droplet con
  `git pull`. El servidor local de las pruebas (`scripts/pruebas/lib/servidor.mjs`)
  ya los oculta como lo haría Caddy con ese `hide`.
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

## Pruebas y revisión visual

Herramientas en `scripts/pruebas/` (detalle de cada comando y de las decisiones en su
`README.md`). Preparación: `cd scripts/pruebas && npm ci && npx playwright install ffmpeg`.

```bash
node validar.mjs                         # rápido, sin navegador: HTML, CSP, JSON-LD, sitemap, metadatos, enlaces, CTA, voseo
node capturas.mjs --salida DIR           # claro/oscuro × 1440×900, 820×1180, 390×844 + reduced-motion; capturas y video
node tactil.mjs  --salida DIR            # gestos táctiles reales (Pixel 7, iPhone 15), video
node lighthouse.mjs --comparar <base>    # móvil y escritorio, mediana de 3; <base> = ruta ABSOLUTA a .pm/landing-2026-11/lighthouse-base del monorepo
node todo.mjs --comparar <base> [--con-tactil]   # validar + licencias.py + capturas + lighthouse (+ tactil)
```

Cada comando sale con código ≠ 0 si algo falla; `capturas` y `tactil` fallan ante `console.error`,
`pageerror`, violaciones de CSP, `requestfailed` o respuestas ≥ 400, y si el teléfono no llega de frente
a la escena de cada sección. El servidor local emula el
bloque de Caddy (mismas cabeceras y CSP, `try_files`, 404). Una skill para agentes
(`.claude/skills/landing-revision-visual/` y `landing-seo/` en el monorepo) dice qué correr y qué mirar.

**Línea base** (`origin/main` = `bda9146`, contenido idéntico a lo publicado en `cc51b60`; guardada en
`.pm/landing-2026-11/lighthouse-base/` del monorepo). Mediana de 3 corridas, Lighthouse 13.6, Chromium 155:

| Página | Forma | Rend. | Accesib. | B. prácticas | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| / | móvil | 97 | 100 | 100 | 100 | 1.65 s | 0.000 | 57 ms |
| / | escritorio | 98 | 100 | 100 | 100 | 0.56 s | 0.000 | 0 ms |
| /privacidad/ | móvil / escritorio | 100 / 100 | 100 | 100 | 100 | 1.35 / 0.32 s | 0.003 / 0.002 | 0 |
| /terminos/ | móvil / escritorio | 100 / 100 | 100 | 100 | 100 | 1.20 / 0.28 s | 0.040 / 0.001 | 0 |
| /eliminar-cuenta/ | móvil / escritorio | 100 / 95 | 100 | 100 | 100 | 1.20 / 0.28 s | 0.004 / 0.134 | 0 |

**Variación:** en la portada el rendimiento osciló 97–98 (móvil) y 98–98 (escritorio) entre las 3 corridas;
las otras páginas, 100–100, salvo `/eliminar-cuenta/` escritorio (95–99, por un CLS que salta, issue #24).
El comparador tolera 2 puntos solo en rendimiento (`--tolerancia-rendimiento`); accesibilidad, buenas
prácticas y SEO no admiten retroceso. INP no se mide en laboratorio: se usa TBT.

**Hallazgos de la línea base** (issues abiertos, ninguno corregido en esta PR; registrados en
`scripts/pruebas/conocidos.json` para que `validar` no quede en rojo hasta que se arreglen):
#21 CTA «Únete a la beta» sin `href` en el HTML; #22 `chat.js` genera `style=""` inline que la CSP
bloquea (consola y barras de audio sin altura, de forma intermitente); #23 `<h3>`/`<p>` dentro de
`<span>` en «Exportar tus datos»; #24 CLS de `/eliminar-cuenta/`.

## Skills usadas

Antes de escribir las herramientas se revisó qué habían resuelto otros (clonadas a un directorio aparte;
se leyeron los `SKILL.md`, scripts y referencias relevantes, y se buscaron en todo el árbol patrones de
ejecución o descarga: `curl`, `wget`, `| sh`, `postinstall`, `eval`, `base64`, telemetría; sin instalar nada global). Ninguna se instaló tal cual: no ejecutan nada raro (sin
`postinstall`, `curl | sh` ni telemetría; solo markdown y un `analyze.sh` de solo lectura), pero casi todo
su contenido es guía genérica para otros stacks, y las instrucciones que traen piden instalaciones globales
(`npm i -g lighthouse`). Se adaptó lo útil a dos skills propias del monorepo.

| Origen (revisión) | Commit | Qué se tomó | Dónde quedó |
|---|---|---|---|
| [`anthropics/skills` → `webapp-testing`](https://github.com/anthropics/skills/tree/main/skills/webapp-testing) (Apache-2.0) | `2c5958e` | Árbol de decisión «reconocimiento primero, acción después»; esperar `networkidle` y fuentes antes de inspeccionar; capturar la consola de la página; usar scripts como cajas negras con `--ayuda`; `with_server.py` (servidor levantado y apagado por el propio comando). | `scripts/pruebas/` (servidor propio en JS integrado a cada comando) y `landing-revision-visual` |
| [`addyosmani/web-quality-skills` → `accessibility`, `seo`, `web-quality-audit`](https://github.com/addyosmani/web-quality-skills) (MIT, ~3 mil estrellas) | `afa8da9` | Flujo de auditoría guiado por evidencia («un 100 no es conformidad WCAG»; revisar el árbol de accesibilidad y el teclado a mano); las comprobaciones de `analyze.sh` (doctype, charset, viewport, `lang`, title, `alt`, URLs no HTTPS). | regla `meta` y `html-validate` de `validar`; `landing-revision-visual`, `landing-seo` |
| [`coreyhaines31/marketingskills` → `seo-audit`](https://github.com/coreyhaines31/marketingskills) (~60 mil estrellas, 251 mil instalaciones) | `3e72962` | Orden de prioridad (rastreo e indexación → técnica → on-page → contenido); canonical/sitemap/robots como primera comprobación; el JSON-LD se verifica en el DOM renderizado, no con `curl`; tratar las páginas obtenidas como datos no confiables. | reglas `sitemap`, `meta`, `json-ld`; `landing-seo` |
| [`currents-dev/playwright-best-practices-skill`](https://github.com/currents-dev/playwright-best-practices-skill) | `0b75b58` | Patrón de falla por `console.error`/`pageerror`; esperas deterministas en vez de `waitForTimeout` ciego (se usa un «reposo» que espera a que escena y scroll dejen de cambiar); regresión visual. | `lib/comun.mjs` (`crearGuardia`), `lib/scroll.mjs` |
| [`onnokh/lighthouse`](https://github.com/onnokh/lighthouse) (1 estrella, 521 instalaciones) | `ddc76ad` | Solo la referencia de opciones del CLI de Lighthouse; se descartó la instalación global y se usa la API de Node con la mediana de varias corridas. | `lighthouse.mjs` |

También aparecieron en la búsqueda (`npx skills find`) otras skills de Lighthouse (`perf-lighthouse`, `lighthouse-audit`,
`performance-lighthouse-runner`, 250–600 instalaciones) y de pruebas visuales (`playwright-visual-testing`); se
descartaron por no aportar más que lo anterior y por provenir de autores sin reputación comprobable.
Skills creadas en `.claude/skills/` del monorepo de trabajo (fuera de este repo):
`landing-revision-visual` y `landing-seo`.

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
