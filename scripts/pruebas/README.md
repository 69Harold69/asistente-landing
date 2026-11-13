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
| `node sin-js.mjs [--salida DIR]` | Mejora progresiva: abre las páginas con JavaScript **desactivado** (claro/oscuro × escritorio/tablet/móvil/320 px) y verifica texto visible, CTA «Únete a la beta» con `href` navegable, nada con opacidad 0, que ninguna sección reserve alto de pantalla (huecos) y que lo decorativo que depende de JS (teléfono, toggle) no se vea roto. | alguna verificación falla |
| `node cls.mjs [--paginas ...] [--max 0.02] [--max-reacomodo 0.15] [--corridas 3] [--android DIR] [--verbose]` | CLS real (Layout Instability API) con red limitada, para detectar saltos por el cambio de fuente: las legales y la 404 en escritorio y móvil; la portada a 360, 390 y 412 px, también con las fuentes retrasadas 1.5 s (con `preload` casi siempre llegan antes del primer pintado), y un barrido de 320 a 480 px (cada 4 px) que compara el hero solo con el respaldo contra el hero con las fuentes cargadas (#49). `--android DIR` simula Android: un fontconfig propio que solo ve las Roboto de `DIR` más Noto, sin Arial ni Liberation y sin hinting. Lo más fiel es la Roboto variable de Android (`Roboto-Regular.ttf`, en Android Studio: `plugins/design-tools/resources/layoutlib/data/fonts/`, o AOSP `external/roboto-fonts`); sirven también las estáticas de Roboto 3 (https://github.com/googlefonts/roboto-3-classic/releases). Licencia SIL OFL 1.1; no las metas al repo. `todo.mjs` corre `cls` sin `--android`: la prueba de Android es manual. | algún CLS > `--max`, o en la portada el hero se reacomoda (renglón distinto o algo se mueve más de 1 px) en más de `--max-reacomodo` de los anchos del barrido |
| `node progreso.mjs [--url ...]` | Avance de la portada (#60, opción B): no hay barra fija arriba; bajo 1024 px no hay navegación ni riel; en escritorio el riel entre los puntos (pista con contraste en claro y oscuro, decorativo) se rellena hasta el punto de la sección que se lee (0 en el hero («Inicio», primer punto), 100 % en «Tu día», monótono, recalculado al redimensionar), marca los puntos recorridos, se va con los puntos fuera del recorrido, sin transición con reduced-motion y sin relleno sin JS. | cualquier verificación falla |
| `node capturas.mjs [--salida DIR] [--paginas /,/privacidad/] [--temas claro,oscuro] [--tamanos escritorio,tablet,movil] [--sin-reducido] [--sin-video] [--sin-inspeccion] [--caras] [--demo-tema] [--sin-320]` | Capturas y video en claro/oscuro × 1440×900, 820×1180 y 390×844 (táctil) + pasada `prefers-reduced-motion` (escritorio y móvil) + pasada ligera a 320×568 que solo mide el scroll horizontal de cada página (sin capturas ni video; `--sin-320` la omite, #48). Portada: hero, mouse real sobre teléfono y CTA, cada sección (con rueda real), página completa, escenas del teléfono (`?escena=`), video bajando y subiendo. | `console.error`, `pageerror`, violación de CSP, `requestfailed`, respuesta ≥ 400, scroll horizontal (en cada página y tamaño, #46), o que en reposo con el borde de una sección arriba el teléfono no muestre su escena de frente (y splash al regresar arriba) |
| `node tactil.mjs [--salida DIR] [--dispositivos "Pixel 7,iPhone 15"] [--tema claro\|oscuro] [--sin-video]` | Gestos táctiles reales por CDP (flings con momentum y arrastres lentos), video; verifica orden de escenas, saltos del giro, scroll horizontal, atascos, escena correcta en cada sección y regreso arriba. | cualquier verificación o error de consola/CSP |
| `node malla.mjs [--salida DIR] [--url ...] [--solo contraste]` | Malla de fondo continua (#98): UN canvas fijo `.malla-fondo` hijo de `<body>`, que pinta en claro y oscuro y se repinta al cambiar de tema; **ondula sola** sin mouse; reacciona al mouse real y se apaga al salir; ~30 fps en reposo y más con el cursor moviéndose (cuenta los cuadros con `canvas.cuadrosAnimados`, que expone malla.js, sin depender del nombre de ninguna función); cero cuadros con `<main>` fuera de pantalla o la pestaña oculta; estática con reduced-motion (también en vivo); en táctil ondula sin reaccionar; atenuado a `--malla-recorrido` detrás de las fases y `?malla=pleno\|medio\|<0..1>`; sin JS no hay canvas; costo por cuadro (escritorio y móvil con CPU ×4) y sin tareas largas; contraste AA de cada bloque de texto de toda la portada sobre la malla en píxeles renderizados (peor píxel con el cursor real barriendo; 4.5, o 3 en texto grande, en claro y oscuro). | cualquier verificación falla |
| `node vidrio-contraste.mjs [--solo ids] [--temas claro,oscuro] [--tams escritorio,movil] ` | Vidrio (#100, el defecto de la portada): contraste en píxeles con la malla en movimiento y el cursor real encima: títulos grandes (≥ 24 px, o ≥ 18.66 px en negrita) contra 3:1 y texto pequeño sobre el vidrio contra 4.5:1. | algún elemento baja de su mínimo |
| `node vidrio-franja.mjs` | Vidrio (#100): en 390×844 y 360×800, claro y oscuro, DPR 3 y gesto táctil, la malla es continua dentro de la franja fija del teléfono (sin franjas sólidas). | más de 0.5 % de píxeles distintos |
| `node movil-lectura.mjs [--tamanos 360x740,390x844,407x904] [--temas light,dark] [--solo-medir]` | Lectura en móvil (#122): por fase, el bloque de texto se ve entero lo que cabe geométricamente antes del giro siguiente y la última línea lleva a la vista el 25 % del alto antes de ese giro; sin retención (`data-retencion` ni animación ligada al scroll). Apaga el imán (`scroll-snap-type: none` en línea) porque mide con `scrollTo`. | cualquier verificación falla |
| `node movil-iman.mjs [--tamanos ...] [--temas light,dark] [--video DIR]` | Imán de lectura (#122) con gestos táctiles reales por CDP (Chromium con `--touch-events=enabled`, sin eso no hay inercia en headless): el gesto suave que termina cerca de una fase para exacto en su punto (tarjeta 4 px bajo el degradado de la franja); al salir de una fase con un arrastre suave no regresa; el gesto fuerte pasa de largo; nada de imán en el hero, la parte final, el pie, con «reducir movimiento» ni en escritorio; hash, punto «Inicio» y teclado. Mutación comprobada: sin `inicializarIman()` o sin desarmar el ancla al empezar el gesto, falla. | cualquier verificación falla |
| `node medir-malla.mjs [--escritorio] [--cpu N] [--variantes ...] [--corridas 3] [--extra "&malla-forzar=normal"] [--args="--use-gl=angle ..."]` | No es una prueba: tabla (Markdown) con el hilo principal por segundo en reposo y en scroll, fps de scroll, tareas largas y costo por dibujo de `apagada` y las variantes de la malla (#98), en mediana de N corridas. | nunca |
| `node mirada.mjs [--salida DIR] [--url ...]` | Mirada de la mascota (#27) e inclinación del teléfono (#99): con el mouse real en 4 esquinas el círculo del Splash y el de la espalda se desplazan hacia el cursor dentro del tope, vuelven al centro al salir el cursor, no hay saltos ni se pisa el `transform` en un giro de 360° (y el teléfono termina de frente), no se mueve con reduced-motion ni en táctil, la inclinación llega a 20°/10° en las esquinas, el giro lateral se ve más que el vertical en píxeles proyectados, vuelve al centro exacto al salir el cursor y si se queda quieto, se apaga durante el giro, no hay pupila, el brillo queda del lado del cursor y junto a los bordes de la caja de la mascota en movimiento sólo hay fondo. Espera por estado (rAF en la página), no por tiempo (#88). | cualquier verificación falla |
| `node rendijas.mjs [--salida DIR] [--url ...] [--rapido]` | Rendijas en la pantalla del teléfono inclinado (#99): en las 8 escenas, claro y oscuro, DPR 2 y 1.25 (y 1 y 1.5 en splash y llamada), en reposo, en los 4 extremos de 20°/10° y en 2 ángulos intermedios, pinta la página con un color centinela, la cambia por otro y compara dos capturas congeladas: ningún píxel dentro del contorno de la pantalla puede cambiar. Además, el fondo propio de la pantalla y el respaldo detrás del frente son los de la escena. `--rapido`: solo DPR 1.25. | cualquier verificación falla |
| `node lighthouse.mjs [--salida DIR] [--corridas 3] [--paginas /] [--todas] [--comparar BASE] [--tolerancia-rendimiento 2]` | Móvil y escritorio, 4 categorías, **mediana** de N corridas, JSON de la corrida mediana, `resumen.json` y `resumen.md` (con LCP, CLS, TBT, FCP, SI y rango). | con `--comparar`: alguna categoría < 90 o peor que la base |
| `node todo.mjs [--salida DIR] [--comparar BASE] [--con-tactil] [--sin-video] [--paginas ...] [--estricto] [--solo-registro]` | Primero la guardia **registro** (#50); después `validar` + `sin-js` + `cls` + `licencias.py` + `dominio.py --check` + `test_dominio.py` + `test_jsonld.py` + `test_indexnow.py` + `test_guias.py` + `capturas` + `lighthouse` (+ `tactil`), sin parar en la primera falla. `--solo-registro` corre solo la guardia. | cualquier paso falla, o hay en `scripts/pruebas/` (o `lib/`) un `test_*.py` o un `.mjs` que ningún paso corre y que no está en `EXCEPCIONES` |
| `python3 -I test_guias.py` | Reglas de las páginas-guía: cada defecto sembrado en una guía sintética debe hacer fallar `validar`. | alguna regla no atrapa su defecto |
| `python3 -I licencias.py` | Licencias de fuentes y librerías vendorizadas (issue #15). | alguna licencia no coincide |

**Prueba nueva:** súmala a `pasos` en `todo.mjs`; si es una librería o algo que no es prueba, a `EXCEPCIONES` con el porqué (si no, la guardia `registro` falla).
Al integrar una rama que trae pruebas nuevas, la guardia lo exige en el mismo merge: regístralas en `pasos` (como `malla.mjs` y `mirada.mjs` en #39 y #43, o `test_portada.py`, ya en `main`) y comprueba con `node todo.mjs --solo-registro` (rápido, sin navegador) antes de subir.

Todos aceptan `--ayuda`. `--url http://...` (capturas, tactil, lighthouse) apunta a un servidor ya levantado en vez del propio.
Salida por defecto: `~/Pictures/yaruki-landing-2026-11/<herramienta>/`.

## Fallos conocidos (`conocidos.json`)

Lista de reglas de `validar` que **hoy fallan en `main`** y tienen issue. Salen como `XFAIL` y no rompen el comando. Cada entrada
se acota con `archivo` (ruta exacta), `contiene` (texto opcional) y `cuantos` (número **exacto** de hallazgos que cubre): un caso
nuevo de la misma regla en otro archivo, o uno más en el mismo, sale como `FALLA` (sin `cuantos` la entrada tapaba todo y daba
falsos verdes). Cuando la PR que lo arregla deja la regla en verde, **borra la entrada** (o baja `cuantos` si arregla solo una
parte): si no, `validar` reporta `XPASS` y falla (así la lista no se pudre). `--estricto` ignora la lista.

La sección `navegador` cubre lo mismo para la consola que ven `capturas` y `tactil` (`tipo` + todos los textos de `contiene`).
Ahí no hay XPASS, porque esos fallos pueden ser intermitentes (dependen del momento de la animación): bórrala a mano en la PR que
arregle el issue.

## Decisiones

- **Servidor y Caddy:** `lib/servidor.mjs` copia las cabeceras del bloque de Caddy del README; la regla `csp-readme` de `validar`
  falla si dejan de coincidir. También oculta (404) exactamente lo mismo que el `hide` del bloque de Caddy del README
  (`HIDE_CADDY`; la regla `hide-readme` de `validar` compara las dos listas y comprueba que no se oculte nada que deba servirse).
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
- **INP:** Lighthouse solo lo calcula en modo timespan; `rendimiento.mjs` lo sustituye con Event Timing por CDP (duración del evento hasta el
  siguiente pintado, CPU ×4) en el toggle de tema, un `<details>`, la navegación del recorrido y el mouse sobre el hero (≤ 200 ms), más TBT.
- **Compresión:** `lib/servidor.mjs` negocia `Accept-Encoding` como Caddy con `encode gzip zstd` (por q y, a igual q,
  gzip antes que zstd, así que Chrome recibe gzip; solo texto, JSON, XML, SVG e ícono, de más de 512 bytes; `Vary: Accept-Encoding`),
  cotejado contra Caddy 2.11.9 real; `compresion.mjs` lo prueba. `YARUKI_SIN_COMPRESION=1` la apaga (para reproducir `lighthouse-base/`).
  Sin compresión el laboratorio pesaba ~4× más bytes bloqueantes que un visitante real.
- **Escenas en modo de inspección:** `?escena=` monta la escena sin coreografía ni `play()`, así que se ve su estado inicial (el chat
  sale vacío, la llamada sin avance). Para revisar los estados animados usa `portada-seccion-*` y el video.
- **Video:** `recordVideo` escalado a ≤ 1000 px del lado mayor (a tamaño real el codificador software tarda 4×).
- **Ruido de Lighthouse:** la mediana de 3 corridas amortigua, pero el rendimiento oscila ±1-2 puntos en este equipo (ver README del
  sitio, «Línea base»). Por eso `--comparar` tolera 2 puntos solo en rendimiento.
