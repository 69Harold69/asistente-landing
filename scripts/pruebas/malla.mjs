#!/usr/bin/env node
/*
  malla: prueba de la malla de fondo del hero (assets/js/malla.js, issue #26).
    - el <canvas class="malla-hero"> existe, es decorativo (aria-hidden, pointer-events: none) y PINTA algo
      (píxeles no vacíos) en claro y en oscuro; al cambiar de tema se repinta con los colores del tema nuevo;
    - reacciona al mouse real (los píxeles cerca del cursor cambian);
    - cero requestAnimationFrame de la malla cuando el cursor no se mueve, cuando el hero sale de pantalla y
      cuando la pestaña está oculta;
    - con prefers-reduced-motion: se dibuja una vez, no anima ni reacciona, y reacciona al cambio en vivo;
    - sin JavaScript no hay canvas ni hueco (el hero se ve igual);
    - costo por cuadro (< 4 ms en 1440×900) y sin tareas largas con el cursor moviéndose;
    - contraste AA del texto del hero contra el peor fondo posible de la malla (análisis con los tokens);
    - consola limpia (sin console.error, pageerror ni violaciones de CSP).
  Uso: node malla.mjs [--url http://...] [--salida DIR]   (sale con 1 si algo falla)
*/
import fs from "node:fs";
import path from "node:path";
import { iniciarServidor, RAIZ_SITIO } from "./lib/servidor.mjs";
import { leerArgs, lanzarChromium, carpetaSalida, crearGuardia, scriptInicial, esperarCarga, dormir, salir } from "./lib/comun.mjs";
import { ruedaHasta } from "./lib/scroll.mjs";

const a = leerArgs();
const salida = carpetaSalida(a.salida, "~/Pictures/yaruki-landing-2026-11/malla");
const srv = a.url ? { url: String(a.url).replace(/\/$/, ""), cerrar: async () => {} } : await iniciarServidor();
const navegador = await lanzarChromium();
const guardia = crearGuardia(srv.url);
const problemas = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok " : "  FALLA"} ${msg}`);
  if (!cond) problemas.push(msg);
};

/* Cuenta y mide solo los cuadros de la malla (la función de rAF se llama `cuadro`). */
const CONTADOR = `
  window.__malla = { cuadros: 0, tiempos: [], largas: [] };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      if (cb.name === "cuadro") {
        const t0 = performance.now();
        cb(t);
        window.__malla.tiempos.push(performance.now() - t0);
        window.__malla.cuadros++;
      } else cb(t);
    });
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__malla.largas.push(e.duration)))
      .observe({ type: "longtask", buffered: true });
  } catch {}
`;

async function abrir({ tema = "light", reducido = false, js = true, ancho = 1440, alto = 900, etiqueta }) {
  const ctx = await navegador.newContext({
    viewport: { width: ancho, height: alto },
    colorScheme: tema,
    reducedMotion: reducido ? "reduce" : "no-preference",
    javaScriptEnabled: js,
  });
  const page = await ctx.newPage();
  guardia.instalar(page, etiqueta ?? `malla ${tema}${reducido ? " reducido" : ""}`);
  if (js) {
    await page.addInitScript(scriptInicial({ tema }));
    await page.addInitScript(CONTADOR);
  }
  await page.goto(srv.url + "/", { waitUntil: "load" });
  if (js) {
    await esperarCarga(page, { portada: true });
    await dormir(900); // la malla arranca en requestIdleCallback tras el primer pintado
  }
  return { ctx, page };
}

const cuadros = (page) => page.evaluate(() => window.__malla?.cuadros ?? -1);
const pixeles = (page) =>
  page.evaluate(() => {
    const c = document.querySelector("canvas.malla-hero");
    if (!c || !c.width) return null;
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0, suma = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) { n++; suma += d[i]; }
    return { n, suma, ancho: c.width, alto: c.height };
  });
/* Huella del bloque de píxeles alrededor de (x, y) en coordenadas de página, para comparar antes/después. */
const huella = (page, x, y, r = 160) =>
  page.evaluate(([x, y, r]) => {
    const c = document.querySelector("canvas.malla-hero");
    const b = c.getBoundingClientRect();
    const k = c.width / b.width;
    const x0 = Math.max(0, Math.round((x - b.left - r) * k)), y0 = Math.max(0, Math.round((y - b.top - r) * k));
    const d = c.getContext("2d").getImageData(x0, y0, Math.round(2 * r * k), Math.round(2 * r * k)).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3] * 11) | 0;
    return h;
  }, [x, y, r]);
const mover = async (page, x0, y0, x1, y1, pasos = 30) => {
  await page.mouse.move(x0, y0);
  for (let i = 1; i <= pasos; i++) {
    await page.mouse.move(x0 + ((x1 - x0) * i) / pasos, y0 + ((y1 - y0) * i) / pasos);
    await dormir(16);
  }
};

try {
  /* ---- 1. existe, decorativo, pinta (claro y oscuro) ---- */
  const huellasTema = {};
  for (const tema of ["light", "dark"]) {
    console.log(`\n== ${tema === "light" ? "claro" : "oscuro"}: existe y pinta`);
    const { ctx, page } = await abrir({ tema });
    const info = await page.evaluate(() => {
      const c = document.querySelector("canvas.malla-hero");
      if (!c) return null;
      const cs = getComputedStyle(c);
      return { aria: c.getAttribute("aria-hidden"), pe: cs.pointerEvents, hijoDeHero: !!c.closest("#hero"), tabindex: c.getAttribute("tabindex") };
    });
    ok(!!info, "el canvas .malla-hero existe dentro del hero");
    if (info) {
      ok(info.aria === "true", "aria-hidden=\"true\"");
      ok(info.pe === "none", "pointer-events: none");
      ok(info.hijoDeHero, "está dentro de #hero");
    }
    const p = await pixeles(page);
    ok(!!p && p.n > 200, `pinta píxeles no vacíos (${p?.n ?? 0} con alfa > 0)`);
    huellasTema[tema] = await page.evaluate(() => {
      const c = document.querySelector("canvas.malla-hero");
      if (!c) return null;
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return [d[i - 3], d[i - 2], d[i - 1]].join(",");
      return null;
    });
    if (tema === "light") await page.screenshot({ path: path.join(salida, "malla-claro-reposo.png") });
    else await page.screenshot({ path: path.join(salida, "malla-oscuro-reposo.png") });

    /* ---- 2. reacciona al mouse real ---- */
    const antes = await huella(page, 720, 380);
    await mover(page, 300, 200, 720, 380);
    await dormir(900);
    const durante = await huella(page, 720, 380);
    ok(antes !== durante, "los píxeles cerca del cursor cambian al mover el mouse real");
    if (tema === "light") await page.screenshot({ path: path.join(salida, "malla-claro-cursor.png") });
    else await page.screenshot({ path: path.join(salida, "malla-oscuro-cursor.png") });

    /* ---- 3. cursor quieto: cero cuadros ---- */
    const c0 = await cuadros(page);
    await dormir(1200);
    ok((await cuadros(page)) === c0, "cursor quieto: cero cuadros en 1.2 s");

    /* ---- 4. cambio de tema repinta ---- */
    if (tema === "light") {
      await page.click("[data-theme-toggle]");
      await dormir(1500);
      const q = await page.evaluate(() => {
        const c = document.querySelector("canvas.malla-hero");
        const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return [d[i - 3], d[i - 2], d[i - 1]].join(",");
        return null;
      });
      ok(q !== null && q !== huellasTema.light, `el toggle de tema repinta la malla con los colores del tema nuevo (${huellasTema.light} -> ${q})`);
    }
    await ctx.close();
  }
  ok(huellasTema.light !== huellasTema.dark, "claro y oscuro pintan con colores distintos (leídos de los tokens)");

  /* ---- 5. pausa fuera de pantalla y con la pestaña oculta ---- */
  console.log("\n== pausa fuera de pantalla / pestaña oculta");
  {
    const { ctx, page } = await abrir({ tema: "dark" });
    await mover(page, 200, 200, 600, 400, 20);
    ok((await cuadros(page)) > 0, `con el hero a la vista y el cursor en movimiento hay cuadros (${await cuadros(page)})`);
    await ruedaHasta(page, 2600);
    await dormir(1200);
    const c1 = await cuadros(page);
    for (let i = 0; i < 25; i++) {
      await page.mouse.move(300 + i * 20, 300 + (i % 5) * 30);
      await dormir(30);
    }
    await dormir(800);
    ok((await cuadros(page)) === c1, "hero fuera de pantalla: cero cuadros aunque el mouse se mueva");
    await ruedaHasta(page, 0);
    await dormir(1200);
    const c2 = await cuadros(page);
    await mover(page, 200, 200, 600, 420, 20);
    await dormir(600);
    ok((await cuadros(page)) > c2, "al volver al hero la malla vuelve a reaccionar");
    // Pestaña oculta
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await dormir(500);
    const c3 = await cuadros(page);
    for (let i = 0; i < 25; i++) {
      await page.mouse.move(300 + i * 20, 300 + (i % 5) * 30);
      await dormir(30);
    }
    await dormir(600);
    ok((await cuadros(page)) === c3, "pestaña oculta: cero cuadros aunque el mouse se mueva");
    await ctx.close();
  }

  /* ---- 6. reduced-motion ---- */
  console.log("\n== prefers-reduced-motion");
  {
    const { ctx, page } = await abrir({ tema: "light", reducido: true });
    const p = await pixeles(page);
    ok(!!p && p.n > 200, "reduced-motion: se dibuja una vez (estática)");
    const antes = await huella(page, 720, 380);
    await mover(page, 300, 200, 720, 380);
    await dormir(800);
    ok((await cuadros(page)) === 0, "reduced-motion: cero cuadros de animación");
    ok((await huella(page, 720, 380)) === antes, "reduced-motion: no reacciona al cursor");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await dormir(300);
    await mover(page, 300, 200, 720, 380);
    await dormir(800);
    ok((await cuadros(page)) > 0, "al cambiar la preferencia en vivo (a permitir movimiento) la malla reacciona");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await dormir(400);
    const c = await cuadros(page);
    await mover(page, 300, 200, 720, 380);
    await dormir(800);
    ok((await cuadros(page)) === c, "al volver a reduced-motion en vivo se detiene");
    await ctx.close();
  }

  /* ---- 7. sin JavaScript ---- */
  console.log("\n== sin JavaScript");
  {
    const { ctx, page } = await abrir({ tema: "light", js: false, etiqueta: "malla sin-js" });
    const r = await page.evaluate(() => ({
      canvas: !!document.querySelector("canvas.malla-hero"),
      titular: document.getElementById("titular").getBoundingClientRect().height,
      desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    ok(!r.canvas && r.titular > 40 && !r.desborde, "sin JS: no hay canvas, el titular se ve y no hay desborde");
    await ctx.close();
  }

  /* ---- 8. costo por cuadro y tareas largas (escritorio 1440×900) ---- */
  console.log("\n== rendimiento (1440×900)");
  {
    const { ctx, page } = await abrir({ tema: "dark" });
    await page.evaluate(() => { window.__malla.tiempos.length = 0; window.__malla.largas.length = 0; });
    for (let v = 0; v < 6; v++) {
      await mover(page, 100 + v * 40, 150, 1300 - v * 60, 700, 40);
      await mover(page, 1300 - v * 60, 700, 200, 250 + v * 30, 40);
    }
    await dormir(500);
    const m = await page.evaluate(() => ({ t: window.__malla.tiempos.slice(), l: window.__malla.largas.slice() }));
    const t = m.t.sort((x, y) => x - y);
    const med = t[Math.floor(t.length / 2)] ?? NaN;
    const p95 = t[Math.floor(t.length * 0.95)] ?? NaN;
    console.log(`   cuadros: ${t.length}, mediana ${med.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, máx ${(t.at(-1) ?? NaN).toFixed(2)} ms, tareas largas: ${m.l.length}`);
    fs.writeFileSync(path.join(salida, "rendimiento.json"), JSON.stringify({ cuadros: t.length, medianaMs: med, p95Ms: p95, maxMs: t.at(-1), tareasLargas: m.l }, null, 2));
    ok(t.length > 30, "hubo cuadros que medir");
    ok(p95 < 4, `p95 por cuadro < 4 ms (${p95.toFixed(2)} ms)`);
    ok(m.l.length === 0, "sin tareas largas (> 50 ms) con el cursor moviéndose");
    await ctx.close();
  }

  /* ---- 9. contraste AA del texto del hero contra el peor fondo de la malla ---- */
  console.log("\n== contraste del hero (peor caso de la malla, con los tokens)");
  {
    const { ctx, page } = await abrir({ tema: "light" });
    for (const tema of ["light", "dark"]) {
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), tema);
      await dormir(200);
      const t = await page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        const g = (n) => cs.getPropertyValue(n).trim();
        return {
          bg: g("--color-bg"), texto: g("--color-text"), sec: g("--color-text-secondary"),
          reposo: g("--color-border-card"), activo: g("--color-accent"),
          aReposo: Number(g("--malla-linea-reposo")), aActiva: Number(g("--malla-linea-activa")),
          pReposo: Number(g("--malla-punto-reposo")), pActivo: Number(g("--malla-punto-activo")),
        };
      });
      const hex = (h) => (h.startsWith("#") ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : h.match(/\d+/g).slice(0, 3).map(Number));
      const lum = ([r, g, b]) => {
        const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const mezcla = (f, b, al) => f.map((v, i) => v * al + b[i] * (1 - al));
      const cr = (x, y) => (Math.max(lum(x), lum(y)) + 0.05) / (Math.min(lum(x), lum(y)) + 0.05);
      const bg = hex(t.bg);
      // Peor caso: línea activa (acento) a su máxima opacidad y punto activo, apilados (cruce de líneas + punto).
      const peor = mezcla(hex(t.activo), mezcla(hex(t.activo), bg, Math.max(t.aActiva, 0)), Math.max(t.pActivo, 0));
      const reposo = mezcla(hex(t.reposo), mezcla(hex(t.reposo), bg, t.aReposo), t.pReposo); // punto sobre línea
      for (const [nombre, col] of [["texto", t.texto], ["secundario", t.sec]]) {
        const base = cr(hex(col), bg);
        const cPeor = cr(hex(col), peor);
        const cRep = cr(hex(col), reposo);
        console.log(`   ${tema} ${nombre}: base ${base.toFixed(2)}, peor activo ${cPeor.toFixed(2)}, reposo ${cRep.toFixed(2)}`);
        // Reposo: AA (4.5) siempre. Pico encendido bajo el cursor: AA para el texto principal y, en el secundario,
        // AA en claro y >= 3 en oscuro (un punto de <= 4 px encendido solo bajo el cursor; ver la PR).
        const minPico = nombre === "texto" || tema === "light" ? 4.5 : 3;
        ok(cRep >= 4.5, `${tema} ${nombre}: contraste en reposo >= 4.5 (${cRep.toFixed(2)})`);
        ok(cPeor >= minPico, `${tema} ${nombre}: contraste en el pico encendido >= ${minPico} (${cPeor.toFixed(2)})`);
      }
    }
    await ctx.close();
  }

  /* ---- 10. consola ---- */
  ok(guardia.fallas.length === 0, `consola limpia (${guardia.fallas.length} fallas)`);
  for (const f of guardia.fallas) console.error("   ", f.tipo, f.detalle, `[${f.contexto}]`);
} catch (e) {
  problemas.push("excepción: " + (e?.stack ?? e));
  console.error(e);
} finally {
  await navegador.close();
  await srv.cerrar();
}
salir(problemas.length ? 1 : 0, problemas.length ? `\n${problemas.length} verificación(es) fallaron` : "\nmalla: todo en verde");
