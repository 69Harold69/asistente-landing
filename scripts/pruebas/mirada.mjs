#!/usr/bin/env node
/*
  mirada: prueba de la mirada de la mascota y de la inclinación del teléfono (assets/js/tilt.js, #27, #99).
  La mascota de Yaruki es un círculo liso, sin rasgos (ic_launcher_foreground.xml), así que la «mirada» es que
  el círculo COMPLETO se desplaza un poco hacia el cursor, en el Splash (`.ps-splash .ps-dot`) y en la espalda
  del teléfono (`.phone-mascota-halo`), con un brillo suave del lado del cursor. Sin pupila ni ojo.
    - con el mouse real de Playwright en 4 esquinas, el punto se desplaza en la dirección correcta y dentro del tope;
    - la espalda (que está en espejo por rotateY(180deg)) también mira hacia el cursor EN PANTALLA;
    - al sacar el cursor vuelve al centro;
    - durante un giro/vuelo de la coreografía no hay saltos ni se pisa el `transform` de la coreografía
      (la mirada va por la propiedad `translate`) y al terminar el teléfono queda de frente (0°);
    - con prefers-reduced-motion y en táctil no se mueve;
    - la inclinación llega al máximo de cada variante en las esquinas (#99, revisión de Harold): por defecto
      20° a los lados y 10° arriba/abajo, `?inclinacion=15` → 15°/8°, `?inclinacion=25` → 25°/12°; vuelve
      despacio al centro al salir el cursor y también si se queda quieto;
    - en píxeles proyectados, el giro lateral se nota más que el vertical (diferencia de alto entre los bordes
      izquierdo y derecho > diferencia de ancho entre arriba y abajo), en las tres variantes;
    - no hay elemento de pupila (ni `::after` en el Splash ni en la espalda) y el brillo es suave, afuera del
      círculo y del lado del cursor; sin mirada es transparente;
    - al salir el cursor el círculo vuelve EXACTO a su centro;
    - mientras la mascota se mueve, junto a los bordes de su caja (fuera del círculo y lejos del brillo) los
      píxeles reales son los del fondo del Splash: sin líneas finas (#99);
    - en cada esquina la mascota recorre al menos la mitad de su tope (la mirada se nota);
    - consola limpia.
  Uso: node mirada.mjs [--url http://...] [--salida DIR]   (sale con 1 si algo falla)
*/
import path from "node:path";
import { iniciarServidor } from "./lib/servidor.mjs";
import { leerArgs, lanzarChromium, carpetaSalida, crearGuardia, scriptInicial, esperarCarga, leerEstado, salir } from "./lib/comun.mjs";
import { ruedaHasta, reposo } from "./lib/scroll.mjs";

/*
  Estabilidad (#88): nada de `dormir` a ciegas. Cada espera es por ESTADO, muestreado con requestAnimationFrame
  dentro de la página: «estable» = el valor leído no cambió más de `tol` durante `cuadros` cuadros seguidos.
  Con la máquina cargada los cuadros se alargan, pero el criterio es el mismo (no se relaja ningún umbral).
*/
const MAX_ESPERA = 15000;

const a = leerArgs();
const salida = carpetaSalida(a.salida, "~/Pictures/yaruki-landing-2026-11/mirada");
const srv = a.url ? { url: String(a.url).replace(/\/$/, ""), cerrar: async () => {} } : await iniciarServidor();
const navegador = await lanzarChromium();
const guardia = crearGuardia(srv.url);
const problemas = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok " : "  FALLA"} ${msg}`);
  if (!cond) problemas.push(msg);
};

async function abrir({ tema = "light", reducido = false, tactil = false, ruta = "/", etiqueta, ancho = 1440, alto = 900 } = {}) {
  const ctx = await navegador.newContext({
    viewport: { width: ancho, height: alto },
    colorScheme: tema,
    reducedMotion: reducido ? "reduce" : "no-preference",
    hasTouch: tactil,
    isMobile: tactil,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  guardia.instalar(page, etiqueta ?? `mirada ${ruta}`);
  await page.addInitScript(scriptInicial({ tema }));
  await page.goto(srv.url + ruta, { waitUntil: "load" });
  await esperarCarga(page, { portada: ruta === "/" });
  return { ctx, page };
}

/* Centro en pantalla y diámetro del punto (el selector depende de la cara). */
const centro = (page, selector) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, d: r.width };
  }, selector);

/* Mirada en px locales: el `translate` calculado del círculo y su diámetro sin transformar. */
const local = (page, selector) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    const t = getComputedStyle(el).translate;
    // Los porcentajes de `translate` son del tamaño propio del elemento (la espalda usa %).
    const v = t === "none" ? [0, 0] : t.split(" ").map((x, i) => (x.endsWith("%") ? (parseFloat(x) * (i ? el.offsetHeight : el.offsetWidth)) / 100 : parseFloat(x)));
    return { x: v[0] || 0, y: v[1] || 0, d: el.offsetWidth };
  }, selector);

/* El diámetro medido en pantalla incluye la respiración (scale 1 → 1.06 cada 3 s): el tope se mide con 7 % de holgura. */
/* Esquinas reales de la ventana de 1440×900 (a 4 px del borde): cada una debe llegar al ángulo máximo. */
const ESQUINAS = [
  ["arriba-izquierda", 4, 4, -1, -1],
  ["arriba-derecha", 1436, 4, 1, -1],
  ["abajo-izquierda", 4, 896, -1, 1],
  ["abajo-derecha", 1436, 896, 1, 1],
];

/* Espera a que el centro del selector deje de moverse (rAF en la página). Devuelve true si se estabilizó. */
const esperarQuieto = (page, selector, { tol = 0.03, cuadros = 24 } = {}) =>
  page.evaluate(
    ({ selector, tol, cuadros, max }) =>
      new Promise((resolver) => {
        let previo = null;
        let quietos = 0;
        const t0 = performance.now();
        const paso = () => {
          const el = document.querySelector(selector);
          if (el) {
            const r = el.getBoundingClientRect();
            const p = [r.left, r.top];
            if (previo && Math.hypot(p[0] - previo[0], p[1] - previo[1]) <= tol) quietos++;
            else quietos = 0;
            previo = p;
            if (quietos >= cuadros) return resolver(true);
          }
          if (performance.now() - t0 > max) return resolver(false);
          requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
      }),
    { selector, tol, cuadros, max: MAX_ESPERA }
  );

/* Lee los grados de inclinación y la mirada que tilt.js deja en el envoltorio. */
const leerTilt = (page) =>
  page.evaluate(() => {
    const e = document.getElementById("tilt-telefono");
    const v = (n) => parseFloat(e.style.getPropertyValue(n)) || 0;
    return { rx: v("--tilt-x"), ry: v("--tilt-y"), mx: v("--mira-x"), my: v("--mira-y") };
  });

/* Espera a que la inclinación y la mirada lleguen a su objetivo (no cambian en `cuadros` cuadros). */
const esperarTilt = (page, { cuadros = 24, max = MAX_ESPERA } = {}) =>
  page.evaluate(
    ({ cuadros, max }) =>
      new Promise((resolver) => {
        const e = document.getElementById("tilt-telefono");
        const leer = () => ["--tilt-x", "--tilt-y", "--mira-x", "--mira-y"].map((n) => parseFloat(e.style.getPropertyValue(n)) || 0);
        let previo = leer();
        let quietos = 0;
        const t0 = performance.now();
        const paso = () => {
          const a = leer();
          if (a.every((v, i) => Math.abs(v - previo[i]) < 0.002)) quietos++;
          else quietos = 0;
          previo = a;
          if (quietos >= cuadros) return resolver(true);
          if (performance.now() - t0 > max) return resolver(false);
          requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
      }),
    { cuadros, max }
  );

/* Brillo: la sombra suave del círculo (`box-shadow`, afuera, no inset), su desplazamiento y su opacidad. Además,
   que no exista ningún elemento de pupila: ni `::after` ni hijos dentro del círculo. */
const brillo = (page, selector) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    const bs = getComputedStyle(el).boxShadow;
    const px = [...bs.matchAll(/(-?[\d.]+)px/g)].map((m) => parseFloat(m[1]));
    const alfa = bs === "none" ? 0 : /\/\s*([\d.]+)\)/.test(bs) ? parseFloat(bs.match(/\/\s*([\d.]+)\)/)[1]) : /rgba\([^)]*,\s*([\d.]+)\)/.test(bs) ? parseFloat(bs.match(/rgba\([^)]*,\s*([\d.]+)\)/)[1]) : 1;
    return {
      dx: px[0] ?? 0,
      dy: px[1] ?? 0,
      opacidad: alfa,
      inset: /inset/.test(bs),
      pupila: getComputedStyle(el, "::after").content !== "none" || el.children.length > 0,
    };
  }, selector);

/* Esquinas del teléfono proyectadas en pantalla (marcadores de 0×0 en las 4 esquinas de #telefono, que heredan
   la transformación 3D): diferencia de alto entre el borde izquierdo y el derecho (giro lateral) y de ancho
   entre el borde de arriba y el de abajo (giro vertical), en px reales. */
const proyeccion = (page) =>
  page.evaluate(() => {
    const t = document.getElementById("telefono");
    if (!t.querySelector("[data-esquina]")) {
      for (const [n, l, a] of [["tl", 0, 0], ["tr", 100, 0], ["bl", 0, 100], ["br", 100, 100]]) {
        const m = document.createElement("i");
        m.dataset.esquina = n;
        m.style.setProperty("position", "absolute");
        m.style.setProperty("left", `${l}%`);
        m.style.setProperty("top", `${a}%`);
        t.appendChild(m);
      }
    }
    const g = (n) => {
      const r = t.querySelector(`[data-esquina="${n}"]`).getBoundingClientRect();
      return [r.left, r.top];
    };
    const [tl, tr, bl, br] = ["tl", "tr", "bl", "br"].map(g);
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    return { lateral: Math.abs(d(tl, bl) - d(tr, br)), vertical: Math.abs(d(tl, tr) - d(bl, br)) };
  });

/*
  Líneas finas en los bordes de la caja de la mascota (#99): con el círculo en movimiento (sin esperar a que se
  asiente), en varias posiciones subpíxel, se captura la zona y se miran, en píxeles reales, las dos esquinas
  de su caja que quedan LEJOS del cursor (fuera del círculo y del brillo, que va del lado del cursor): ahí todo
  debe ser el fondo del Splash. Una línea de 1 px en el borde de la caja (o de su `::after`) cambia esos píxeles.
  Devuelve la mayor diferencia por canal encontrada (0–255) y la posición.
*/
async function lineasEnCaja(page, analizador, selector, dpr) {
  let peor = { dif: 0, donde: "" };
  let validas = 0;
  const trayectos = [[[60, 60], [1380, 860]], [[1380, 60], [60, 860]], [[60, 860], [1380, 60]], [[1380, 860], [60, 60]]];
  for (const [desde, hasta] of trayectos) {
    await page.mouse.move(...desde, { steps: 4 });
    for (let i = 1; i <= 6; i++) {
      const f = i / 6;
      await page.mouse.move(desde[0] + (hasta[0] - desde[0]) * f, desde[1] + (hasta[1] - desde[1]) * f, { steps: 2 });
      const caja = await page.evaluate((s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        const e = document.getElementById("tilt-telefono");
        const m = (n) => parseFloat(e.style.getPropertyValue(n)) || 0;
        return { x: r.left, y: r.top, w: r.width, h: r.height, mx: m("--mira-x"), my: m("--mira-y") };
      }, selector);
      const m = Math.ceil(caja.w * 0.4) + 2;
      const clip = { x: Math.floor(caja.x - m), y: Math.floor(caja.y - m), width: Math.ceil(caja.w + 2 * m), height: Math.ceil(caja.h + 2 * m) };
      const png = (await page.screenshot({ clip })).toString("base64");
      // Lado hacia donde mira la mascota en ese cuadro (ahí va el brillo); se revisa la esquina opuesta.
      const sx = caja.mx >= 0 ? 1 : -1;
      const sy = caja.my >= 0 ? 1 : -1;
      const r = await analizador.evaluate(
        async ({ png, caja, clip, sx, sy, dpr }) => {
          const img = new Image();
          img.src = "data:image/png;base64," + png;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          const g = c.getContext("2d");
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          // Tamaño real de la captura en px CSS (puede ser 1 px menor que el recorte pedido).
          const W = img.width / dpr;
          const H = img.height / dpr;
          const px = (x, y) => {
            const xi = Math.min(img.width - 1, Math.max(0, Math.round(x * dpr)));
            const yi = Math.min(img.height - 1, Math.max(0, Math.round(y * dpr)));
            const i = (yi * c.width + xi) * 4;
            return [d[i], d[i + 1], d[i + 2]];
          };
          const dif = (p, q) => Math.max(...p.map((v, k) => Math.abs(v - q[k])));
          // Fondo de referencia para ubicar el círculo: el píxel de la esquina lejana de la captura.
          const fondo = px(sx > 0 ? 1 : W - 2, sy > 0 ? 1 : H - 2);
          // El círculo se ubica en los píxeles (no en el DOM: entre la lectura y la captura siguió moviéndose):
          // sus bordes del lado LEJANO (el brillo va del otro lado), con un umbral alto (contorno macizo).
          let xf = sx > 0 ? Infinity : -Infinity;
          let yf = sy > 0 ? Infinity : -Infinity;
          for (let y = 0; y < H; y += 0.5) {
            for (let x = 0; x < W; x += 0.5) {
              if (dif(px(x, y), fondo) < 100) continue;
              xf = sx > 0 ? Math.min(xf, x) : Math.max(xf, x);
              yf = sy > 0 ? Math.min(yf, y) : Math.max(yf, y);
            }
          }
          // Contorno pegado al borde de la captura: el círculo se salió, la muestra no vale.
          if (!Number.isFinite(xf) || !Number.isFinite(yf) || Math.min(xf, yf, W - xf, H - yf) < 12) return { peor: -1, donde: "" };
          const rad = caja.w / 2;
          const cx = xf + sx * rad;
          const cy = yf + sy * rad;
          let peor = 0;
          let donde = "";
          // Franjas de ±3 px sobre los dos bordes de la caja del lado lejano, en el cuadrante lejano y fuera del
          // círculo (a más de 4 px de su contorno: cubre la respiración). Cada píxel se compara con el que está
          // 8 px más afuera en perpendicular al borde (así un degradado suave del fondo no cuenta; una línea sí).
          for (let y = 0; y < H; y += 0.5) {
            for (let x = 0; x < W; x += 0.5) {
              const enV = Math.abs(x - xf) <= 3;
              const enH = Math.abs(y - yf) <= 3;
              const lejano = (x - cx) * sx < 0 && (y - cy) * sy < 0;
              if ((!enV && !enH) || !lejano || Math.hypot(x - cx, y - cy) < rad + 4) continue;
              const ref = enV ? px(xf - sx * 8, y) : px(x, yf - sy * 8);
              const dd = dif(px(x, y), ref);
              if (dd > peor) {
                peor = dd;
                donde = `${x.toFixed(1)},${y.toFixed(1)}`;
              }
            }
          }
          return { peor, donde };
        },
        { png, caja, clip, sx, sy, dpr }
      );
      if (r.peor < 0) continue;
      validas++;
      if (r.peor > peor.dif) peor = { dif: r.peor, donde: r.donde };
    }
  }
  return { ...peor, validas };
}

async function probarCara(nombre, ruta, selector, tope, { query = "", maxX = 10, maxY = 20, etiqueta = "" } = {}) {
  console.log(`\n== ${nombre}${etiqueta}`);
  const { ctx, page } = await abrir({ ruta: ruta + query, etiqueta: `mirada ${nombre}${etiqueta}` });
  await esperarQuieto(page, "#telefono");
  // Cursor en el centro del teléfono: posición de referencia (sin mirada).
  const tel = await centro(page, "#telefono");
  await page.mouse.move(tel.x, tel.y, { steps: 6 });
  await esperarTilt(page);
  await esperarQuieto(page, selector);
  const base = await centro(page, selector);
  const caraSel = nombre === "espalda" ? ".phone-espalda" : "#pantalla-telefono";
  const caraBase = await centro(page, caraSel);
  ok(!!base, `${nombre}: existe el punto (${selector})`);
  if (!base) return ctx.close();
  for (const [esq, x, y, sx, sy] of ESQUINAS) {
    await page.mouse.move(x, y, { steps: 12 });
    ok(await esperarTilt(page), `${nombre} ${esq}: la inclinación y la mirada se asientan`);
    // En pantalla, respecto del centro de su cara (la inclinación de 20° también mueve la cara entera).
    const c = await centro(page, selector);
    const cara = await centro(page, caraSel);
    const dx = c.x - cara.x - (base.x - caraBase.x);
    const dy = c.y - cara.y - (base.y - caraBase.y);
    ok(Math.sign(Math.round(dx)) === sx && Math.sign(Math.round(dy)) === sy, `${nombre} ${esq}: el círculo completo se desplaza hacia el cursor (dx ${dx.toFixed(1)}, dy ${dy.toFixed(1)})`);
    // Tope en px locales (antes de la perspectiva), con el `translate` calculado y el diámetro sin transformar.
    const l = await local(page, selector);
    ok(Math.abs(l.x) <= tope(l.d) + 0.05 && Math.abs(l.y) <= tope(l.d) + 0.05, `${nombre} ${esq}: dentro del tope (${l.x.toFixed(1)}, ${l.y.toFixed(1)} de ${tope(l.d).toFixed(1)} px locales)`);
    ok(Math.abs(l.x) >= tope(l.d) * 0.5 && Math.abs(l.y) >= tope(l.d) * 0.5, `${nombre} ${esq}: la mirada se nota (≥ la mitad del tope)`);
    const t = await leerTilt(page);
    ok(Math.abs(t.ry) >= maxY * 0.97 && Math.abs(t.ry) <= maxY + 0.01 && Math.sign(t.ry) === sx, `${nombre} ${esq}: ${maxY}° a los lados (${t.ry.toFixed(2)}°)`);
    ok(Math.abs(t.rx) >= maxX * 0.97 && Math.abs(t.rx) <= maxX + 0.01 && Math.sign(t.rx) === -sy, `${nombre} ${esq}: ${maxX}° arriba/abajo (${t.rx.toFixed(2)}°)`);
    const b = await brillo(page, selector);
    ok(!b.pupila, `${nombre} ${esq}: sin pupila (ni \`::after\` ni hijos dentro del círculo)`);
    ok(!b.inset && b.opacidad > 0.5 && Math.sign(Math.round(b.dx)) === sx && Math.sign(Math.round(b.dy)) === sy, `${nombre} ${esq}: el brillo es suave, afuera del círculo y del lado del cursor (${b.dx.toFixed(1)}, ${b.dy.toFixed(1)} px, opacidad ${b.opacidad})`);
    if (esq === "arriba-izquierda") await page.screenshot({ path: path.join(salida, `mirada-${nombre}-arriba-izquierda.png`) });
    if (esq === "abajo-derecha") await page.screenshot({ path: path.join(salida, `mirada-${nombre}-abajo-derecha.png`) });
  }
  // El cursor sale: vuelve despacio al centro (y el brillo se apaga).
  await page.evaluate(() => document.documentElement.dispatchEvent(new PointerEvent("pointerleave")));
  await esperarTilt(page);
  const fin = await centro(page, selector);
  ok(Math.hypot(fin.x - base.x, fin.y - base.y) < 0.8, `${nombre}: al salir el cursor vuelve al centro (${Math.hypot(fin.x - base.x, fin.y - base.y).toFixed(2)} px)`);
  const tr = await page.evaluate((s) => getComputedStyle(document.querySelector(s)).translate, selector);
  ok(tr === "none" || tr.split(" ").every((v) => parseFloat(v) === 0), `${nombre}: en reposo el círculo queda en su centro exacto (translate ${tr})`);
  const t0 = await leerTilt(page);
  ok(Math.abs(t0.rx) < 0.05 && Math.abs(t0.ry) < 0.05, `${nombre}: la inclinación vuelve a 0° (${t0.rx.toFixed(2)}, ${t0.ry.toFixed(2)})`);
  const b0 = await brillo(page, selector);
  ok(b0.opacidad < 0.02, `${nombre}: sin mirada el brillo no se ve (opacidad ${b0.opacidad})`);
  // Vuelta despacio: tras salir desde la esquina no llega al centro de golpe (se mide en la cara del Splash).
  if (nombre === "splash" && !query) {
    await page.mouse.move(4, 4, { steps: 8 });
    await esperarTilt(page);
    await page.evaluate(() => document.documentElement.dispatchEvent(new PointerEvent("pointerleave")));
    const medio = await page.evaluate(
      () =>
        new Promise((resolver) => {
          const e = document.getElementById("tilt-telefono");
          const t0 = performance.now();
          const paso = () => {
            const dt = performance.now() - t0;
            if (dt >= 300) return resolver(Math.abs(parseFloat(e.style.getPropertyValue("--tilt-y"))));
            requestAnimationFrame(paso);
          };
          requestAnimationFrame(paso);
        })
    );
    ok(medio > 3, `splash: la vuelta al centro es despacio (a los 300 ms aún quedan ${medio.toFixed(1)}° de ${maxY}°)`);
    // Quieto un rato: el cursor se queda en la esquina sin moverse y la inclinación vuelve sola al centro.
    await page.mouse.move(4, 4, { steps: 4 });
    await esperarTilt(page);
    const antes = await leerTilt(page);
    ok(Math.abs(antes.ry) > maxY * 0.9, `splash: con el cursor quieto en la esquina la inclinación se mantiene al inicio (${antes.ry.toFixed(1)}°)`);
    const volvio = await page.evaluate(
      () =>
        new Promise((resolver) => {
          const e = document.getElementById("tilt-telefono");
          const t0 = performance.now();
          const paso = () => {
            const v = Math.abs(parseFloat(e.style.getPropertyValue("--tilt-y")));
            if (v < 0.1) return resolver(performance.now() - t0);
            if (performance.now() - t0 > 14000) return resolver(-1);
            requestAnimationFrame(paso);
          };
          requestAnimationFrame(paso);
        })
    );
    ok(volvio > 0, `splash: si el cursor se queda quieto la inclinación vuelve sola al centro (${(volvio / 1000).toFixed(1)} s)`);
  }
  await ctx.close();
}

try {
  // Tope: 16 dp del splash (1 dp = ancho del teléfono / 360) = 1/6 del diámetro del punto de 96 dp; en la
  // espalda, 16 % de su tamaño (≈ 1/6).
  await probarCara("splash", "/?escena=splash", ".ps-splash .ps-dot", (d) => d / 6);
  await probarCara("espalda", "/?escena=splash&cara=espalda", ".phone-mascota-halo", (d) => d * 0.16);
  // Variantes para que Harold compare (#99): 15°/8° y 25°/12° (la de 20°/10° es la de por defecto, arriba).
  await probarCara("splash", "/?escena=splash", ".ps-splash .ps-dot", (d) => d / 6, { query: "&inclinacion=15", maxX: 8, maxY: 15, etiqueta: " (?inclinacion=15)" });
  await probarCara("splash", "/?escena=splash", ".ps-splash .ps-dot", (d) => d / 6, { query: "&inclinacion=25", maxX: 12, maxY: 25, etiqueta: " (?inclinacion=25)" });

  /* ---- el giro lateral se nota más que el vertical, en píxeles proyectados (tres variantes) ---- */
  console.log("\n== lateral contra vertical (px proyectados)");
  for (const [v, minimoLateral] of [["15", 40], ["20", 55], ["25", 70]]) {
    const { ctx, page } = await abrir({ ruta: `/?inclinacion=${v}`, etiqueta: `mirada proyeccion ${v}` });
    await esperarQuieto(page, "#telefono");
    const tel = await centro(page, "#telefono");
    const medir = async (x, y) => {
      await page.mouse.move(x, y, { steps: 10 });
      await esperarTilt(page);
      return proyeccion(page);
    };
    const izq = await medir(4, tel.y);
    const der = await medir(1436, tel.y);
    const arr = await medir(tel.x, 4);
    const aba = await medir(tel.x, 896);
    const lat = Math.min(izq.lateral, der.lateral);
    const ver = Math.max(arr.vertical, aba.vertical);
    ok(lat >= minimoLateral, `?inclinacion=${v}: el giro lateral se ve (diferencia de alto entre bordes ${izq.lateral.toFixed(1)} / ${der.lateral.toFixed(1)} px ≥ ${minimoLateral})`);
    ok(lat > ver * 1.5, `?inclinacion=${v}: lateral claramente mayor que vertical (${lat.toFixed(1)} px contra ${ver.toFixed(1)} px)`);
    await ctx.close();
  }

  /* ---- sin líneas finas en los bordes de la caja de la mascota mientras se mueve (#99) ---- */
  console.log("\n== bordes de la caja de la mascota (píxeles reales, en movimiento)");
  {
    const analizador = await (await navegador.newContext()).newPage();
    for (const tema of ["light", "dark"]) {
      for (const [cara, ruta, sel] of [["splash", "/?escena=splash", ".ps-splash .ps-dot"], ["espalda", "/?escena=splash&cara=espalda", ".phone-mascota-halo"]]) {
        for (const dpr of [1, 2]) {
          const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: tema, deviceScaleFactor: dpr });
          const page = await ctx.newPage();
          guardia.instalar(page, `mirada lineas ${cara} ${tema} x${dpr}`);
          await page.addInitScript(scriptInicial({ tema }));
          await page.goto(srv.url + ruta, { waitUntil: "load" });
          await esperarCarga(page, { portada: true });
          await esperarQuieto(page, "#telefono");
          // El brillo (`box-shadow` difuminado alrededor del círculo) y la onda del halo de la espalda (`::before`,
          // crece a 1.55× con opacidad 0.18) son contenido legítimo alrededor del círculo: se apagan para mirar
          // sólo los bordes de la caja de la mascota (el movimiento, la respiración y el contorno siguen igual).
          // (CSSOM, no `<style>`: la CSP no permite estilos en línea.)
          await page.evaluate((s) => {
            const hoja = [...document.styleSheets].find((h) => h.href);
            hoja.insertRule(`${s}{box-shadow:none!important}`);
            hoja.insertRule(".phone-mascota-halo::before{animation:none!important;opacity:0!important}");
          }, sel);
          const p = await lineasEnCaja(page, analizador, sel, dpr);
          ok(p.validas >= 12, `${cara} ${tema} ×${dpr}: muestras válidas en movimiento (${p.validas} de 24)`);
          ok(p.dif <= 10, `${cara} ${tema} ×${dpr}: junto a los bordes de la caja sólo hay fondo (máx. diferencia ${p.dif}/255${p.donde ? " en " + p.donde : ""})`);
          await ctx.close();
        }
      }
    }
    await analizador.context().close();
  }

  /* ---- coreografía: sin saltos, sin pisar el transform, termina de frente ---- */
  console.log("\n== coreografía (giro de 360°)");
  {
    const { ctx, page } = await abrir({ etiqueta: "mirada coreografia" });
    await page.mouse.move(1100, 300, { steps: 8 });
    await esperarTilt(page);
    const registro = await page.evaluate(() => {
      const r = { muestras: [], enGiroMira: 0 };
      const env = document.getElementById("tilt-telefono");
      const dot = () => document.querySelector(".ps-splash .ps-dot");
      const tel = document.getElementById("telefono");
      tel.addEventListener("yaruki:estado", (e) => {
        const d = dot();
        const t = d ? getComputedStyle(d).translate : "none";
        const v = t === "none" ? [0, 0] : t.split(" ").map(parseFloat);
        const g = (n) => parseFloat(env.style.getPropertyValue(n)) || 0;
        r.muestras.push({ t: performance.now(), enGiro: e.detail.enGiro, mascota: e.detail.mascota, x: v[0] || 0, y: v[1] || 0, rx: g("--tilt-x"), ry: g("--tilt-y") });
      });
      // Muestreo independiente en cada cuadro: nadie más que stage.js escribe el `transform` del envoltorio
      // de la mascota (sólo "" o scale(n)) y la mascota no tiene `transform` en línea (la mirada va por `translate`).
      r.pisadas = [];
      const muestrear = () => {
        const esc = document.querySelector(".ps-splash .ps-dot-escala");
        const d = dot();
        if (esc && !/^(|scale\([\d.e+-]+\))$/.test(esc.style.transform)) r.pisadas.push("envoltorio: " + esc.style.transform);
        if (d && d.style.transform) r.pisadas.push("mascota: " + d.style.transform);
        if (window.__mira) requestAnimationFrame(muestrear);
      };
      requestAnimationFrame(muestrear);
      window.__mira = r;
      return true;
    });
    const mirando = await page.evaluate(() => {
      const t = getComputedStyle(document.querySelector(".ps-splash .ps-dot")).translate;
      return t === "none" ? 0 : Math.hypot(...t.split(" ").map(parseFloat));
    });
    ok(mirando > 2, `en reposo, con el cursor lejos, la mascota ya está mirando (${mirando.toFixed(1)} px)`);
    const antes = await page.evaluate(() => document.querySelector(".ps-dot-escala")?.style.transform ?? "");
    await ruedaHasta(page, 2200);
    // El cursor se mueve MIENTRAS giran (en paralelo con la rueda), no después.
    let girando = true;
    const moverCursor = (async () => {
      for (let i = 0; girando; i++) {
        await page.mouse.move(300 + (i % 6) * 150, 200 + (i % 6) * 80, { steps: 3 });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      }
    })();
    await ruedaHasta(page, 0);
    girando = false;
    await moverCursor;
    const e = await reposo(page, leerEstado);
    const muestras = await page.evaluate(() => window.__mira.muestras);
    ok(registro && muestras.length > 20, `hubo muestras de la coreografía (${muestras.length})`);
    // Velocidad (px por cuadro de 16.7 ms), no px entre muestras: con la máquina cargada los cuadros se alargan
    // y la distancia entre muestras crece sin que haya salto alguno. El tope escala con el recorrido (16 dp, antes 7).
    let salto = 0;
    let saltoTilt = 0;
    for (let i = 1; i < muestras.length; i++) {
      const dt = Math.max(1, muestras[i].t - muestras[i - 1].t);
      salto = Math.max(salto, (Math.hypot(muestras[i].x - muestras[i - 1].x, muestras[i].y - muestras[i - 1].y) / dt) * 16.7);
      saltoTilt = Math.max(saltoTilt, (Math.hypot(muestras[i].rx - muestras[i - 1].rx, muestras[i].ry - muestras[i - 1].ry) / dt) * 16.7);
    }
    ok(salto < 3.7, `la mirada no da saltos entre cuadros de la coreografía (máx ${salto.toFixed(2)} px por cuadro)`);
    // Mismo criterio relativo que con 8° (1.2° por cuadro = 15 % del máximo): 15 % de los 20° por defecto.
    ok(saltoTilt < 20 * 0.15, `la inclinación no da saltos al entrar ni al salir del giro (máx ${saltoTilt.toFixed(2)}° por cuadro, tope ${(20 * 0.15).toFixed(1)}°)`);
    // La inclinación se apaga durante el vuelo: pasados 700 ms de giro ya está en ~0.
    const giroTilt = [];
    let inicioGiro = null;
    let durMax = 0;
    for (const m of muestras) {
      if (!m.enGiro) inicioGiro = null;
      else {
        inicioGiro ??= m.t;
        durMax = Math.max(durMax, m.t - inicioGiro);
        if (m.t - inicioGiro > 600) giroTilt.push(Math.max(Math.abs(m.rx), Math.abs(m.ry)));
      }
    }
    ok(giroTilt.length >= 1 && Math.max(...giroTilt) < 1, `la inclinación se apaga durante el giro (giro más largo ${durMax.toFixed(0)} ms, ${giroTilt.length} muestras, máx ${Math.max(0, ...giroTilt).toFixed(2)}°)`);
    const giro = muestras.filter((m) => m.enGiro);
    const enMovimiento = giro.filter((m) => Math.hypot(m.x, m.y) > 2.5).length;
    ok(giro.length > 5 && enMovimiento / giro.length < 0.15, `durante los giros la mirada se apaga (${enMovimiento}/${giro.length} muestras con desplazamiento > 2.5 px)`);
    ok(e.angulo !== null && (e.angulo < 0.6 || e.angulo > 359.4) && e.escena === "splash", `al regresar arriba el teléfono queda de frente en splash (${e.angulo?.toFixed(2)}°, ${e.escena})`);
    /* La escala de la mascota la suaviza stage.js con el scroll: con la máquina cargada sigue bajando un rato después
       de que el estado «reposa» (corrida 10/10 de la auditoría del control 1: «scale(1.06503)»). Se espera por ESTADO
       (#88) a que vuelva a la de antes o deje de cambiar; la aserción no cambia: debe quedar igual que antes. */
    const despues = await page.evaluate(
      ({ antes, max }) =>
        new Promise((resolver) => {
          const leer = () => document.querySelector(".ps-dot-escala")?.style.transform ?? "";
          let previo = leer();
          let quietos = 0;
          const t0 = performance.now();
          const paso = () => {
            const v = leer();
            quietos = v === previo ? quietos + 1 : 0;
            previo = v;
            if (v === antes || quietos >= 60 || performance.now() - t0 > max) return resolver(v);
            requestAnimationFrame(paso);
          };
          requestAnimationFrame(paso);
        }),
      { antes, max: MAX_ESPERA }
    );
    const pisadas = await page.evaluate(() => window.__mira.pisadas);
    ok(antes === despues && pisadas.length === 0, `[antes="${antes}" despues="${despues}"] el \`transform\` de la coreografía sobre la mascota no fue pisado por la mirada (${pisadas.length} cuadros pisados${pisadas.length ? ": " + pisadas[0] : ""})`);
    await ctx.close();
  }

  /* ---- reduced-motion y táctil ---- */
  for (const [nombre, opts] of [["reduced-motion", { reducido: true }], ["táctil", { tactil: true, ancho: 390, alto: 844 }]]) {
    console.log(`\n== ${nombre}`);
    const { ctx, page } = await abrir({ ...opts, ruta: "/?escena=splash", etiqueta: `mirada ${nombre}` });
    const tel = await centro(page, "#telefono");
    const base = await centro(page, ".ps-splash .ps-dot");
    if (opts.tactil) await page.touchscreen.tap(20, 100);
    else {
      await page.mouse.move(tel.x, tel.y, { steps: 4 });
      await page.mouse.move(20, 100, { steps: 12 });
    }
    await page.evaluate(() => new Promise((r) => { let n = 0; const p = () => (++n > 90 ? r() : requestAnimationFrame(p)); requestAnimationFrame(p); }));
    const c = await centro(page, ".ps-splash .ps-dot");
    const t = await leerTilt(page);
    ok(t.rx === 0 && t.ry === 0, `${nombre}: el teléfono no se inclina (${t.rx}, ${t.ry})`);
    ok(Math.hypot(c.x - base.x, c.y - base.y) < 0.6, `${nombre}: la mascota no se mueve (${Math.hypot(c.x - base.x, c.y - base.y).toFixed(2)} px)`);
    await ctx.close();
  }

  ok(guardia.fallas.length === 0, `consola limpia (${guardia.fallas.length} fallas)`);
  for (const f of guardia.fallas) console.error("   ", f.tipo, f.detalle, `[${f.contexto}]`);
} catch (e) {
  problemas.push("excepción: " + (e?.stack ?? e));
  console.error(e);
} finally {
  await navegador.close();
  await srv.cerrar();
}
salir(problemas.length ? 1 : 0, problemas.length ? `\n${problemas.length} verificación(es) fallaron` : "\nmirada: todo en verde");
