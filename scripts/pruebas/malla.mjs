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
    - contraste AA (4.5, o 3 en texto grande) de cada bloque de texto del hero sobre la malla, medido en píxeles
      renderizados con el cursor real barriendo alrededor de cada bloque (peor píxel, claro y oscuro);
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
    // La malla arranca en requestIdleCallback tras el primer pintado (con la máquina cargada puede tardar).
    await page.waitForSelector("canvas.malla-hero", { state: "attached", timeout: 6000 }).catch(() => {});
    await dormir(400);
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

  /* ---- 9. contraste AA del texto del hero sobre la malla, medido en PÍXELES RENDERIZADOS ----
     Se oculta el texto del hero (CSSOM, la CSP lo permite) para ver el fondo real bajo cada bloque, se barre el
     cursor real alrededor de cada bloque (la malla queda encendida a distintas intensidades, también intermedias:
     ahí el color va a medio camino y la opacidad es alta, el peor caso) y se toma el PEOR píxel de fondo dentro de
     las cajas de línea del bloque. Mínimo WCAG AA: 4.5 en texto normal y 3 en texto grande (>= 24 px, o >= 18.66 px
     en negrita). Sin excepciones: ni el pico encendido ni el tema oscuro. */
  console.log("\n== contraste del hero sobre la malla (píxeles reales, peor caso con el cursor barriendo)");
  {
    const BLOQUES = [
      ["lema", ".hero-significado"], ["titular", "#titular"], ["subtítulo", ".subtitulo-hero"],
      ["botón beta", ".cta-item:nth-child(1) .button"], ["chip beta", ".cta-item:nth-child(1) .chip"],
      ["botón App Store", ".cta-item:nth-child(2) .button"], ["chip App Store", ".cta-item:nth-child(2) .chip"],
      ["nota del CTA", ".cta-nota"], ["«Desliza para descubrir»", ".pista-scroll"],
    ];
    const analizador = await navegador.newPage();
    for (const tema of ["light", "dark"]) {
      const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: tema, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      guardia.instalar(page, `malla contraste ${tema}`);
      await page.addInitScript(scriptInicial({ tema }));
      await page.goto(srv.url + "/", { waitUntil: "load" });
      await esperarCarga(page, { portada: true });
      await page.waitForSelector("canvas.malla-hero", { state: "attached", timeout: 6000 }).catch(() => {});
      await dormir(600);
      const bloques = await page.evaluate((B) => {
        const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
        return B.map(([n, s]) => {
          const el = document.querySelector(s);
          if (!el) return { n, falta: true };
          const cs = getComputedStyle(el);
          const rg = document.createRange();
          rg.selectNodeContents(el);
          const rects = [...rg.getClientRects()].filter((r) => r.width > 2 && r.height > 2).map((r) => [r.left, r.top, r.width, r.height]);
          const px = parseFloat(cs.fontSize), w = Number(cs.fontWeight);
          return { n, color: rgb(cs.color), rects, grande: px >= 24 || (px >= 18.66 && w >= 700) };
        });
      }, BLOQUES);
      await page.evaluate(() => {
        const h = document.styleSheets[document.styleSheets.length - 1];
        h.insertRule("#hero, #hero * { color: transparent !important; text-shadow: none !important; }", h.cssRules.length);
        h.insertRule("#hero svg { stroke: transparent !important; }", h.cssRules.length);
      });
      const peor = {};
      // Cursor alrededor de cada bloque: encima y a 90/180 px, para cubrir intensidades de 1 a ~0.4 (y las intermedias).
      const posiciones = [];
      for (const bl of bloques) {
        if (bl.falta) continue;
        for (const [l, t, w, h] of bl.rects) {
          const cx = l + w / 2, cy = t + h / 2;
          for (const d of [0, 90, 180]) for (const [sx, sy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (d === 0 && (sx || sy)) continue;
            for (const fx of [0.2, 0.8]) posiciones.push([Math.round(l + w * fx + sx * d), Math.round(cy + sy * d)]);
          }
        }
      }
      const vistas = new Set();
      for (const [x, y] of posiciones) {
        const clave = `${Math.round(x / 32)},${Math.round(y / 32)}`;
        if (vistas.has(clave) || x < 0 || y < 0 || x > 1440 || y > 900) continue;
        vistas.add(clave);
        await page.mouse.move(x, y, { steps: 2 });
        await dormir(140);
        const png = (await page.screenshot({ type: "png" })).toString("base64");
        const r = await analizador.evaluate(async ({ png, bloques }) => {
          const img = new Image();
          img.src = "data:image/png;base64," + png;
          await img.decode();
          const cv = document.createElement("canvas");
          cv.width = img.width;
          cv.height = img.height;
          const g = cv.getContext("2d");
          g.drawImage(img, 0, 0);
          const lum = ([r, gg, b]) => {
            const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
            return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b);
          };
          const out = {};
          for (const bl of bloques) {
            if (bl.falta) continue;
            const lt = lum(bl.color);
            let min = 99;
            for (const [l, t, w, h] of bl.rects) {
              const d = g.getImageData(Math.floor(l * 2), Math.floor(t * 2), Math.ceil(w * 2), Math.ceil(h * 2)).data;
              for (let i = 0; i < d.length; i += 4) {
                const lb = lum([d[i], d[i + 1], d[i + 2]]);
                min = Math.min(min, (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05));
              }
            }
            out[bl.n] = min;
          }
          return out;
        }, { png, bloques });
        for (const [k, v] of Object.entries(r)) if (!(k in peor) || v < peor[k].cr) peor[k] = { cr: v, en: [x, y] };
      }
      console.log(`   ${tema}: ${vistas.size} posiciones del cursor`);
      for (const bl of bloques) {
        if (bl.falta || !bl.rects.length) {
          console.log(`   ${tema} ${bl.n}: no está o no se ve en esta configuración (p. ej. el chip de la beta con BETA_URL)`);
          continue;
        }
        const minimo = bl.grande ? 3 : 4.5;
        const p = peor[bl.n];
        ok(p.cr >= minimo, `${tema} ${bl.n}: peor píxel ${p.cr.toFixed(2)}:1 >= ${minimo}${bl.grande ? " (texto grande)" : ""} (cursor en ${p.en})`);
      }
      await ctx.close();
    }
    await analizador.close();
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
