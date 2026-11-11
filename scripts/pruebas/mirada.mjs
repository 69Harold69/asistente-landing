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
    - la inclinación del teléfono (tilt) sigue en ±4°;
    - consola limpia.
  Uso: node mirada.mjs [--url http://...] [--salida DIR]   (sale con 1 si algo falla)
*/
import path from "node:path";
import { iniciarServidor } from "./lib/servidor.mjs";
import { leerArgs, lanzarChromium, carpetaSalida, crearGuardia, scriptInicial, esperarCarga, leerEstado, dormir, salir } from "./lib/comun.mjs";
import { ruedaHasta, reposo } from "./lib/scroll.mjs";

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

const ESQUINAS = [
  ["arriba-izquierda", 20, 100, -1, -1],
  ["arriba-derecha", 1420, 100, 1, -1],
  ["abajo-izquierda", 20, 880, -1, 1],
  ["abajo-derecha", 1420, 880, 1, 1],
];

async function probarCara(nombre, ruta, selector, tope) {
  console.log(`\n== ${nombre}`);
  const { ctx, page } = await abrir({ ruta, etiqueta: `mirada ${nombre}` });
  await dormir(500);
  // Cursor en el centro del teléfono: posición de referencia (sin mirada).
  const tel = await centro(page, "#telefono");
  await page.mouse.move(tel.x, tel.y, { steps: 6 });
  await dormir(1500);
  const base = await centro(page, selector);
  ok(!!base, `${nombre}: existe el punto (${selector})`);
  if (!base) return ctx.close();
  for (const [esq, x, y, sx, sy] of ESQUINAS) {
    await page.mouse.move(x, y, { steps: 12 });
    await dormir(1600);
    const c = await centro(page, selector);
    const dx = c.x - base.x;
    const dy = c.y - base.y;
    ok(Math.sign(Math.round(dx)) === sx && Math.sign(Math.round(dy)) === sy, `${nombre} ${esq}: se desplaza hacia el cursor (dx ${dx.toFixed(1)}, dy ${dy.toFixed(1)})`);
    ok(Math.abs(dx) <= tope(base.d) + 0.6 && Math.abs(dy) <= tope(base.d) + 0.6, `${nombre} ${esq}: dentro del tope (${tope(base.d).toFixed(1)} px)`);
    if (esq === "arriba-izquierda") await page.screenshot({ path: path.join(salida, `mirada-${nombre}-arriba-izquierda.png`) });
    if (esq === "abajo-derecha") await page.screenshot({ path: path.join(salida, `mirada-${nombre}-abajo-derecha.png`) });
  }
  // La inclinación del teléfono sigue en ±4° (con el cursor aún en la esquina).
  const tilt = await page.evaluate(() => {
    const e = document.getElementById("tilt-telefono");
    return [parseFloat(e.style.getPropertyValue("--tilt-x")), parseFloat(e.style.getPropertyValue("--tilt-y"))];
  });
  ok(tilt.every((v) => Math.abs(v) <= 4.01) && tilt.some((v) => Math.abs(v) > 3), `${nombre}: la inclinación sigue en ±4° y activa (${tilt.join(", ")})`);
  // El cursor sale: vuelve al centro.
  await page.evaluate(() => document.documentElement.dispatchEvent(new PointerEvent("pointerleave")));
  await dormir(2000);
  const fin = await centro(page, selector);
  ok(Math.hypot(fin.x - base.x, fin.y - base.y) < 0.8, `${nombre}: al salir el cursor vuelve al centro (${Math.hypot(fin.x - base.x, fin.y - base.y).toFixed(2)} px)`);
  await ctx.close();
}

try {
  // Tope: 7 dp del splash (1 dp = ancho del teléfono / 360) ≈ 7 % del diámetro del punto de 96 dp...
  await probarCara("splash", "/?escena=splash", ".ps-splash .ps-dot", (d) => d * 0.1);
  await probarCara("espalda", "/?escena=splash&cara=espalda", ".phone-mascota-halo", (d) => d * 0.1);

  /* ---- coreografía: sin saltos, sin pisar el transform, termina de frente ---- */
  console.log("\n== coreografía (giro de 360°)");
  {
    const { ctx, page } = await abrir({ etiqueta: "mirada coreografia" });
    await page.mouse.move(1100, 300, { steps: 8 });
    await dormir(1200);
    const registro = await page.evaluate(() => {
      const r = { muestras: [], enGiroMira: 0 };
      const dot = () => document.querySelector(".ps-splash .ps-dot");
      const tel = document.getElementById("telefono");
      tel.addEventListener("yaruki:estado", (e) => {
        const d = dot();
        const t = d ? getComputedStyle(d).translate : "none";
        const v = t === "none" ? [0, 0] : t.split(" ").map(parseFloat);
        r.muestras.push({ enGiro: e.detail.enGiro, mascota: e.detail.mascota, x: v[0] || 0, y: v[1] || 0 });
      });
      // Muestreo independiente en cada cuadro: nadie más que stage.js escribe el `transform` del envoltorio
      // de la mascota (sólo "" o scale(n)) y la mascota no tiene `transform` en línea (la mirada va por `translate`).
      r.pisadas = [];
      const muestrear = () => {
        const esc = document.querySelector(".ps-splash .ps-dot-escala");
        const d = dot();
        if (esc && !/^(|scale\([\d.]+\))$/.test(esc.style.transform)) r.pisadas.push("envoltorio: " + esc.style.transform);
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
    for (let i = 0; i < 6; i++) {
      await page.mouse.move(300 + i * 150, 200 + i * 80);
      await dormir(120);
    }
    await ruedaHasta(page, 0);
    const e = await reposo(page, leerEstado);
    const muestras = await page.evaluate(() => window.__mira.muestras);
    ok(registro && muestras.length > 20, `hubo muestras de la coreografía (${muestras.length})`);
    let salto = 0;
    for (let i = 1; i < muestras.length; i++) salto = Math.max(salto, Math.hypot(muestras[i].x - muestras[i - 1].x, muestras[i].y - muestras[i - 1].y));
    ok(salto < 1.6, `la mirada no da saltos entre cuadros de la coreografía (máx ${salto.toFixed(2)} px)`);
    const giro = muestras.filter((m) => m.enGiro);
    const enMovimiento = giro.filter((m) => Math.hypot(m.x, m.y) > 2.5).length;
    ok(giro.length > 5 && enMovimiento / giro.length < 0.15, `durante los giros la mirada se apaga (${enMovimiento}/${giro.length} muestras con desplazamiento > 2.5 px)`);
    ok(e.angulo !== null && (e.angulo < 0.6 || e.angulo > 359.4) && e.escena === "splash", `al regresar arriba el teléfono queda de frente en splash (${e.angulo?.toFixed(2)}°, ${e.escena})`);
    const despues = await page.evaluate(() => document.querySelector(".ps-dot-escala")?.style.transform ?? "");
    const pisadas = await page.evaluate(() => window.__mira.pisadas);
    ok(antes === despues && pisadas.length === 0, `el \`transform\` de la coreografía sobre la mascota no fue pisado por la mirada (${pisadas.length} cuadros pisados${pisadas.length ? ": " + pisadas[0] : ""})`);
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
    await dormir(1500);
    const c = await centro(page, ".ps-splash .ps-dot");
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
