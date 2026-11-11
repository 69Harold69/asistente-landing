# scripts/pruebas — pruebas y revisión visual de la landing

Solo desarrollo. Node ≥ 22 (mise), Chromium del sistema (`/usr/bin/chromium` o `CHROME_PATH`), Python no hace falta.
Todo es local: `devDependencies` en este `package.json` (Playwright, Lighthouse, html-validate, parse5), sin `postinstall`.

```bash
cd scripts/pruebas
npm ci                          # una vez por worktree
npx playwright install ffmpeg   # una vez por máquina (Playwright lo necesita para grabar video)
```

| Comando | Qué hace | Falla (exit 1) si |
|---|---|---|
| `node lib/servidor.mjs [--puerto 8765]` (`npm run servir`) | Sirve el repo como Caddy: `try_files`, 404 → `404.html`, `hide`, caché de `/assets/*` y **las mismas cabeceras, CSP incluida**. | — |
| `node validar.mjs [--externos] [--estricto] [--solo a,b] [--verbose]` | Rápido, sin navegador: html-validate, CSP estática (HTML, JS y CSS propios), JSON-LD, sitemap y `lastmod`, metadatos, enlaces y anclas, CTA con `href`, voseo. | alguna regla falla o una entrada de `conocidos.json` ya no falla (XPASS) |
| `node capturas.mjs [--salida DIR] [--paginas /,/privacidad/] [--temas claro,oscuro] [--tamanos escritorio,tablet,movil] [--sin-reducido] [--sin-video] [--sin-inspeccion] [--caras] [--demo-tema]` | Capturas y video en claro/oscuro × 1440×900, 820×1180 y 390×844 (táctil) + pasada `prefers-reduced-motion` (escritorio y móvil). Portada: hero, mouse real sobre teléfono y CTA, cada sección (con rueda real), página completa, escenas del teléfono (`?escena=`), video bajando y subiendo. | `console.error`, `pageerror`, violación de CSP, `requestfailed`, respuesta ≥ 400, scroll horizontal |
| `node tactil.mjs [--salida DIR] [--dispositivos "Pixel 7,iPhone 15"] [--tema claro\|oscuro] [--sin-video]` | Gestos táctiles reales por CDP (flings con momentum y arrastres lentos), video; verifica orden de escenas, saltos del giro, scroll horizontal, atascos, escena correcta en cada sección y regreso arriba. | cualquier verificación o error de consola/CSP |
| `node lighthouse.mjs [--salida DIR] [--corridas 3] [--paginas /] [--todas] [--comparar BASE] [--tolerancia-rendimiento 2]` | Móvil y escritorio, 4 categorías, **mediana** de N corridas, JSON de la corrida mediana, `resumen.json` y `resumen.md` (con LCP, CLS, TBT, FCP, SI y rango). | con `--comparar`: alguna categoría < 90 o peor que la base |
| `node todo.mjs [--salida DIR] [--comparar BASE] [--con-tactil] [--sin-video]` | `validar` + `capturas` + `lighthouse` (+ `tactil`), sin parar en la primera falla. | cualquier paso falla |

Todos aceptan `--ayuda`. `--url http://...` (capturas, tactil, lighthouse) apunta a un servidor ya levantado en vez del propio.
Salida por defecto: `~/Pictures/yaruki-landing-2026-11/<herramienta>/`.

## Fallos conocidos (`conocidos.json`)

Lista de reglas de `validar` que **hoy fallan en `main`** y tienen issue. Salen como `XFAIL` y no rompen el comando. Cuando la PR que
las arregla las deja en verde, **borra la entrada**: si queda, `validar` reporta `XPASS` y falla (así la lista no se pudre). Una
regla nueva que falle con un caso nuevo NO queda cubierta: la entrada se acota con `contiene`. `--estricto` ignora la lista.

## Decisiones

- **Servidor y Caddy:** `lib/servidor.mjs` copia las cabeceras del bloque de Caddy del README; la regla `csp-readme` de `validar`
  falla si dejan de coincidir. También oculta (404) lo que el README pide ocultar y lo que **conviene ocultar** (`scripts`,
  `package.json`, `package-lock.json`).
- **Tema determinista:** `theme.js` lee `localStorage["yaruki-theme"]` y, si no hay, `prefers-color-scheme`. Las herramientas fijan
  las dos cosas (`colorScheme` del contexto + `localStorage`) y marcan `sessionStorage["yaruki-theme-demo-visto"]` para que la demo de
  tema al cargar (`theme-demo.js`, que cambia el tema a los ~1.3 s) no ensucie las capturas. `--demo-tema` la deja correr.
- **html-validate y no vnu.jar:** Node puro (sin Java ni descarga de ~30 MB), 2 s para todo el sitio, da líneas y entiende ARIA. Las
  reglas puramente de estilo del marcado están apagadas; quedan errores reales (anidado inválido, ids duplicados, ARIA, `alt`…).
- **WebKit:** `npx playwright install webkit` descarga el build de Ubuntu 24.04 y NO corre en Arch/Omarchy (faltan `libicu74`,
  `libxml2.so.2`, `libjxl.so.0.8`, `libbacktrace`; Playwright pide `sudo playwright install-deps`, que no existe para Arch). iOS se
  emula con los descriptores `iPhone 15` (UA, viewport, táctil, DPR) sobre Chromium; el *momentum* de Safari no se reproduce.
- **Rueda y toque reales:** `capturas` recorre con `mouse.wheel` en pasos (nunca `scrollTo`) y `tactil` con
  `Input.dispatchTouchEvent`; la coreografía ya reacciona a `wheel`/`touchstart`.
- **INP:** no hay forma de laboratorio útil (Lighthouse solo lo calcula en modo timespan con interacciones); se usa TBT.
- **Video:** `recordVideo` escalado a ≤ 1000 px del lado mayor (a tamaño real el codificador software tarda 4×).
- **Ruido de Lighthouse:** la mediana de 3 corridas amortigua, pero el rendimiento oscila ±1-2 puntos en este equipo (ver README del
  sitio, «Línea base»). Por eso `--comparar` tolera 2 puntos solo en rendimiento.
