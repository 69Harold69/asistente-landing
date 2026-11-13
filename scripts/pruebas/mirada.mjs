#!/usr/bin/env node
/*
  mirada: prueba de la mirada de la mascota (assets/js/tilt.js, issue #27).
  La mascota de Yaruki es un punto sin rasgos (ic_launcher_foreground.xml), así que la «mirada» es un
  desplazamiento pequeño de ese punto hacia el cursor, en el Splash (`.ps-splash .ps-dot`) y en la espalda
  del teléfono (`.phone-mascota-halo`).
    - con el mouse real de Playwright en 4 esquinas, el punto se desplaza en la dirección correcta y dentro del tope;
    - la espalda (que está en espejo por rotateY(180deg)) también mira hacia el cursor EN PANTALLA;
    - al sacar el cursor vuelve al centro;
    - durante un giro/vuelo de la coreografía no hay saltos ni se pisa el `transform` de la coreografía
      (la mirada va por la propiedad `translate`) y al terminar el teléfono queda de frente (0°);
    - con prefers-reduced-motion y en táctil no se mueve;
    - la inclinación del teléfono llega a 8° a los lados y 6° arriba/abajo en las esquinas (#99), con la variante
      `?inclinacion=mayor` a 11°/8°, vuelve despacio al centro al salir el cursor y también si se queda quieto;
    - un brillo pequeño del lado del cursor acompaña la mirada;
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

/* Desplazamiento (en px de pantalla) del centro del brillo respecto del centro del punto. */
const brillo = (page, selector) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el, "::after");
    const w = parseFloat(cs.width);
    return {
      dx: parseFloat(cs.left) + w / 2 - r.width / 2,
      dy: parseFloat(cs.top) + w / 2 - r.height / 2,
      opacidad: parseFloat(cs.opacity),
      ancho: w,
      d: r.width,
    };
  }, selector);

async function probarCara(nombre, ruta, selector, tope, { query = "", maxX = 6, maxY = 8, etiqueta = "" } = {}) {
  console.log(`\n== ${nombre}${etiqueta}`);
  const { ctx, page } = await abrir({ ruta: ruta + query, etiqueta: `mirada ${nombre}${etiqueta}` });
  await esperarQuieto(page, "#telefono");
  // Cursor en el centro del teléfono: posición de referencia (sin mirada).
  const tel = await centro(page, "#telefono");
  await page.mouse.move(tel.x, tel.y, { steps: 6 });
  await esperarTilt(page);
  await esperarQuieto(page, selector);
  const base = await centro(page, selector);
  ok(!!base, `${nombre}: existe el punto (${selector})`);
  if (!base) return ctx.close();
  for (const [esq, x, y, sx, sy] of ESQUINAS) {
    await page.mouse.move(x, y, { steps: 12 });
    ok(await esperarTilt(page), `${nombre} ${esq}: la inclinación y la mirada se asientan`);
    const c = await centro(page, selector);
    const dx = c.x - base.x;
    const dy = c.y - base.y;
    ok(Math.sign(Math.round(dx)) === sx && Math.sign(Math.round(dy)) === sy, `${nombre} ${esq}: se desplaza hacia el cursor (dx ${dx.toFixed(1)}, dy ${dy.toFixed(1)})`);
    ok(Math.abs(dx) <= tope(base.d) * 1.07 + 0.6 && Math.abs(dy) <= tope(base.d) * 1.07 + 0.6, `${nombre} ${esq}: dentro del tope (${tope(base.d).toFixed(1)} px)`);
    ok(Math.abs(dx) >= tope(base.d) * 0.5 && Math.abs(dy) >= tope(base.d) * 0.5, `${nombre} ${esq}: la mirada se nota (≥ la mitad del tope)`);
    const t = await leerTilt(page);
    ok(Math.abs(t.ry) >= maxY * 0.97 && Math.abs(t.ry) <= maxY + 0.01 && Math.sign(t.ry) === sx, `${nombre} ${esq}: ${maxY}° a los lados (${t.ry.toFixed(2)}°)`);
    ok(Math.abs(t.rx) >= maxX * 0.97 && Math.abs(t.rx) <= maxX + 0.01 && Math.sign(t.rx) === -sy, `${nombre} ${esq}: ${maxX}° arriba/abajo (${t.rx.toFixed(2)}°)`);
    const b = await brillo(page, selector);
    ok(b.opacidad > 0.9 && Math.sign(Math.round(b.dx)) === sx && Math.sign(Math.round(b.dy)) === sy && b.ancho < b.d * 0.3, `${nombre} ${esq}: el brillo está del lado del cursor (${b.dx.toFixed(1)}, ${b.dy.toFixed(1)} px, opacidad ${b.opacidad})`);    if (esq === "arriba-izquierda") await page.screenshot({ path: path.join(salida, `mirada-${nombre}-arriba-izquierda.png`) });
    if (esq === "abajo-derecha") await page.screenshot({ path: path.join(salida, `mirada-${nombre}-abajo-derecha.png`) });
  }
  // El cursor sale: vuelve despacio al centro (y el brillo se apaga).
  await page.evaluate(() => document.documentElement.dispatchEvent(new PointerEvent("pointerleave")));
  await esperarTilt(page);
  const fin = await centro(page, selector);
  ok(Math.hypot(fin.x - base.x, fin.y - base.y) < 0.8, `${nombre}: al salir el cursor vuelve al centro (${Math.hypot(fin.x - base.x, fin.y - base.y).toFixed(2)} px)`);
  const t0 = await leerTilt(page);
  ok(Math.abs(t0.rx) < 0.05 && Math.abs(t0.ry) < 0.05, `${nombre}: la inclinación vuelve a 0° (${t0.rx.toFixed(2)}, ${t0.ry.toFixed(2)})`);
  const b0 = await brillo(page, selector);
  ok(b0.opacidad < 0.05, `${nombre}: sin mirada el brillo no se ve (opacidad ${b0.opacidad})`);
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
    ok(medio > 3, `splash: la vuelta al centro es despacio (a los 300 ms aún quedan ${medio.toFixed(1)}° de 8°)`);
    // Quieto un rato: el cursor se queda en la esquina sin moverse y la inclinación vuelve sola al centro.
    await page.mouse.move(4, 4, { steps: 4 });
    await esperarTilt(page);
    const antes = await leerTilt(page);
    ok(Math.abs(antes.ry) > 7, `splash: con el cursor quieto en la esquina la inclinación se mantiene al inicio (${antes.ry.toFixed(1)}°)`);
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
  // Variante para comparar en video (#99): 11° a los lados y 8° arriba/abajo.
  await probarCara("splash", "/?escena=splash", ".ps-splash .ps-dot", (d) => d / 6, { query: "&inclinacion=mayor", maxX: 8, maxY: 11, etiqueta: " (?inclinacion=mayor)" });

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
    ok(saltoTilt < 1.2, `la inclinación no da saltos al entrar ni al salir del giro (máx ${saltoTilt.toFixed(2)}° por cuadro)`);
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
    ok(giroTilt.length > 3 && Math.max(...giroTilt) < 1, `la inclinación se apaga durante el giro (giro más largo ${durMax.toFixed(0)} ms, ${giroTilt.length} muestras, máx ${Math.max(0, ...giroTilt).toFixed(2)}°)`);
    const giro = muestras.filter((m) => m.enGiro);
    const enMovimiento = giro.filter((m) => Math.hypot(m.x, m.y) > 2.5).length;
    ok(giro.length > 5 && enMovimiento / giro.length < 0.15, `durante los giros la mirada se apaga (${enMovimiento}/${giro.length} muestras con desplazamiento > 2.5 px)`);
    ok(e.angulo !== null && (e.angulo < 0.6 || e.angulo > 359.4) && e.escena === "splash", `al regresar arriba el teléfono queda de frente en splash (${e.angulo?.toFixed(2)}°, ${e.escena})`);
    const despues = await page.evaluate(() => document.querySelector(".ps-dot-escala")?.style.transform ?? "");
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
