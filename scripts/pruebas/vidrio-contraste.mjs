#!/usr/bin/env node
/*
  vidrio-contraste (#100): contraste AA del texto de la portada con el vidrio, que es el defecto (malla encendida SIN huecos + vidrio),
  medido en PÍXELES RENDERIZADOS con la malla en movimiento y el cursor real en el peor caso.
    - títulos grandes (titular y títulos de sección; >= 24 px, o >= 18.66 px en negrita) contra 3:1, con la malla debajo;
    - todo el texto pequeño (kicker, párrafos, enlaces, FAQ, notas, píldoras) contra 4.5:1, sobre el vidrio;
    - cualquier texto pequeño que NO esté en una tarjeta se reporta aparte (grupo «suelto»): debe ser vacío.
  Se oculta el texto (hoja adoptada, la CSP lo permite) y se toman varios cuadros por posición (la malla ondula ±15 px) y,
  en escritorio, con el cursor sobre 3 elementos del bloque (la malla se enciende al acento a su máxima intensidad).
  El mínimo de todos los cuadros es el contraste de cada elemento.

  Uso: node vidrio-contraste.mjs [--url URL] [--query "malla-forzar=normal"] [--temas claro,oscuro] [--tams escritorio,tablet,movil]
         (también escritorio1024 y movil360)
         [--solo fase-chat,preguntas] [--salida DIR]
  Sale con 1 si algún elemento baja de su mínimo.
*/
import fs from "node:fs";
import path from "node:path";
import { iniciarServidor } from "./lib/servidor.mjs";
import { ruedaHasta } from "./lib/scroll.mjs";
import { leerArgs, lanzarChromium, carpetaSalida, scriptInicial, esperarCarga, dormir, lista } from "./lib/comun.mjs";

const TAM = { escritorio: { w: 1440, h: 900, movil: false }, escritorio1024: { w: 1024, h: 768, movil: false }, tablet: { w: 820, h: 1180, movil: true }, movil: { w: 390, h: 844, movil: true }, movil360: { w: 360, h: 800, movil: true } };
const TEMA = { claro: "light", oscuro: "dark" };
const SECCIONES = ["hero", "fase-chat", "fase-elementos", "fase-habitos", "fase-avisos", "fase-llamada", "cta", "como-funciona", "lo-que-viene", "preguntas", "quien-esta-detras"];

/** Elementos con texto propio que hay que medir; devuelve datos serializables (índice estable por orden del DOM). */
function recolectar() {
  const SALTAR = ".pie, #stage, .nav-recorrido, .malla-diagnostico, .chip, .chip-beta-header, .button--primary, .pasos-beta-numero, [data-theme-toggle], .punto-vivo-envoltura";
  const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
  const out = [];
  // Sin lo de `#stage`: la escena del teléfono agrega y quita nodos y movía el índice de todo lo que va después; un
  // elemento podía «ya estar medido» con el índice de otro y saltarse en silencio (auditoría #100).
  const els = [...document.querySelectorAll("main *, .site-header *")].filter((el) => !el.closest("#stage"));
  const stage = document.getElementById("stage");
  const movilStage = stage && matchMedia("(max-width: 1023px)").matches ? stage.getBoundingClientRect() : null;
  els.forEach((el, idx) => {
    if (el.closest(SALTAR)) return;
    const nodos = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length);
    if (!nodos.length) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return;
    let op = 1;
    for (let p = el; p; p = p.parentElement) op *= Number(getComputedStyle(p).opacity);
    const rects = [];
    for (const n of nodos) {
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const q of r.getClientRects()) if (q.width > 2 && q.height > 2) rects.push([q.left, q.top, q.right, q.bottom]);
    }
    if (!rects.length) return;
    // En una píldora (kicker, significado, pista) la caja de línea del texto llega a rozar su aro luminoso del borde; el aro es
    // decoración, no está bajo las letras: se mide la zona de las letras (3 px menos arriba y abajo).
    if (el.matches(".fase-kicker, .hero-significado, .pista-scroll")) for (const q of rects) { q[1] += 3; q[3] -= 3; }
    // En móvil/tablet la franja del teléfono (`#stage`, opaca salvo la malla) tapa lo que sube por detrás: lo que queda
    // bajo ella no se ve, así que no se mide ahí (se medirá en otra posición del scroll, ya por debajo de la franja).
    if (movilStage && el.closest("main") && !el.closest("#stage") && rects.some((q) => q[3] > movilStage.top + 1 && q[1] < movilStage.bottom - 1)) return;
    const px = parseFloat(cs.fontSize);
    const w = Number(cs.fontWeight);
    const grande = px >= 24 || (px >= 18.66 && w >= 700);
    const seccion = el.closest("#hero, section[id], .site-header, footer")?.id || (el.closest(".site-header") ? "header" : "?");
    const grupo = el.matches(".fase-kicker, .hero-significado") ? "kicker" : grande ? "titulo" : el.matches("a") ? "enlace" : el.matches(".pregunta summary") ? "pregunta" : el.matches(".fase-texto, .subtitulo-hero, .pregunta-respuesta p, .tarjeta-viene p, .pasos-lista p, .bloque-intro, .pasos-beta span, .cta-nota") ? "parrafo" : "otro";
    out.push({ idx, texto: nodos[0].textContent.trim().slice(0, 36), rgb: rgb(cs.color), px, grande, op, rects, seccion, grupo, inactivo: !!el.closest(".button--disabled") });
  });
  // El número de cada paso de «Cómo funciona» es TEXTO generado (`li::before`, #102): no tiene nodo de texto, así que se
  // mide aparte, con su color calculado y la zona de su dígito sobre el recuadro de la ilustración. (La hoja que oculta
  // el texto también lo oculta: ver `h.replaceSync` más abajo.)
  document.querySelectorAll(".pasos-lista > li").forEach((li, k) => {
    const pcs = getComputedStyle(li, "::before");
    if (!pcs.content || pcs.content === "none" || pcs.display === "none" || pcs.position !== "absolute") return;
    const lr = li.getBoundingClientRect();
    const fs = parseFloat(pcs.fontSize);
    const x0 = lr.left + parseFloat(pcs.left) + parseFloat(pcs.paddingLeft);
    const y0 = lr.top + parseFloat(pcs.top) + parseFloat(pcs.paddingTop);
    let op = 1;
    for (let q = li; q; q = q.parentElement) op *= Number(getComputedStyle(q).opacity);
    if (movilStage && lr.bottom > movilStage.top + 1 && lr.top < movilStage.bottom - 1) return;
    out.push({ idx: 100000 + k, texto: "número del paso " + (k + 1), rgb: rgb(pcs.color), px: fs, grande: true, op, rects: [[x0, y0 + 0.2 * fs, x0 + 0.8 * fs, y0 + 1.05 * fs]], seccion: li.closest("section[id]")?.id || "?", grupo: "numero", inactivo: false });
  });
  return out;
}

/** Índices (mismo orden que `recolectar`) de todo elemento con texto propio de las secciones pedidas, sin filtros de posición. */
function recolectarTodos(solo) {
  const SALTAR = ".pie, #stage, .nav-recorrido, .malla-diagnostico, .chip, .chip-beta-header, .button--primary, .pasos-beta-numero, [data-theme-toggle], .punto-vivo-envoltura";
  const out = [];
  [...document.querySelectorAll("main *, .site-header *")].filter((el) => !el.closest("#stage")).forEach((el, idx) => {
    if (el.closest(SALTAR) || !el.closest(solo.map((id) => "#" + id).join(","))) return;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length)) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return;
    const nodos = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length);
    out.push({ idx, texto: nodos[0].textContent.trim().slice(0, 36), seccion: el.closest("#hero, section[id], .site-header, footer")?.id || "?" });
  });
  return out;
}

async function analizar(limpia, png, items) {
  return limpia.evaluate(async ({ b64, items }) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bin], { type: "image/png" }));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(bmp, 0, 0);
    const d = x.getImageData(0, 0, bmp.width, bmp.height).data;
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (r, g, b) => 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    const cr = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return items.map((it) => {
      let mn = 9, mx = -1;
      for (const r of it.rects) {
        const x0 = Math.max(0, Math.floor(r[0])), y0 = Math.max(0, Math.floor(r[1])), x1 = Math.min(bmp.width - 1, Math.ceil(r[2])), y1 = Math.min(bmp.height - 1, Math.ceil(r[3]));
        for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) {
          const i = (y * bmp.width + xx) * 4;
          const l = lum(d[i], d[i + 1], d[i + 2]);
          if (l < mn) mn = l;
          if (l > mx) mx = l;
        }
      }
      const lt = lum(...it.rgb);
      return Math.min(cr(lt, mn), cr(lt, mx));
    });
  }, { b64: png.toString("base64"), items: items.map((i) => ({ rgb: i.rgb, rects: i.rects })) });
}

export async function medir(nav, limpia, url, { tema, tam, query = "", solo = SECCIONES }) {
  const t = TAM[tam];
  const ctx = await nav.newContext({ viewport: { width: t.w, height: t.h }, deviceScaleFactor: 1, isMobile: t.movil, hasTouch: t.movil, colorScheme: TEMA[tema], locale: "es-MX", timezoneId: "America/Mexico_City" });
  await ctx.addInitScript(scriptInicial({ tema: TEMA[tema] }));
  const page = await ctx.newPage();
  await page.goto(`${url}/${query ? "?" + query : ""}`, { waitUntil: "load" });
  await esperarCarga(page, { portada: true });
  await page.waitForSelector("canvas.malla-fondo", { state: "attached", timeout: 8000 }).catch(() => {});
  await dormir(600);
  // FAQ: abiertas todas, para medir también las respuestas.
  await page.evaluate(() => document.querySelectorAll("details.pregunta").forEach((d) => d.setAttribute("open", "")));
  const medidos = new Map();
  const vh = t.h;
  for (const id of solo) {
    const g = await page.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { top: scrollY + r.top, alto: r.height }; }, id);
    const posiciones = g.alto <= vh * 1.05 ? [Math.max(0, g.top + g.alto / 2 - vh / 2)] : Array.from({ length: Math.ceil((g.alto - vh * 0.3) / (vh * 0.6)) }, (_, k) => Math.max(0, g.top - 80 + k * vh * 0.6));
    // El centro de la sección va SIEMPRE primero: una fase del recorrido mide un poco más que la pantalla (min-height 100vh +
    // relleno) y, sin esta posición, solo se medía en sus orillas, donde el texto aún entra o ya sale (opacidad < 1) y se
    // descartaba en silencio (auditoría #100: 16 elementos de las fases nunca se medían en escritorio).
    posiciones.unshift(Math.max(0, g.top + g.alto / 2 - vh / 2));
    if (id === "hero") posiciones.splice(0, posiciones.length, 0);
    let rescate = false;
    for (let q = 0; q < posiciones.length || !rescate; q++) {
      if (q >= posiciones.length) {
        // Segunda pasada: cada elemento de la sección que no quedó entero a la vista en ninguna posición (una respuesta
        // larga de las preguntas en móvil, por ejemplo) se centra en la pantalla y se mide ahí.
        rescate = true;
        const faltan = (await page.evaluate(recolectarTodos, [id])).filter((e) => !medidos.has(e.idx));
        const tops = await page.evaluate((idxs) => {
          const els = [...document.querySelectorAll("main *, .site-header *")].filter((el) => !el.closest("#stage"));
          return idxs.map((i) => { const r = els[i].getBoundingClientRect(); return scrollY + r.top + r.height / 2; });
        }, faltan.map((e) => e.idx));
        const st = t.movil ? await page.evaluate(() => document.getElementById("stage")?.offsetHeight ?? 0) : 0;
        // Centrada en la pantalla y, en móvil/tablet, también centrada en lo que queda bajo la franja del teléfono.
        for (const c of tops) posiciones.push(...new Set([Math.max(0, c - vh / 2), Math.max(0, c - (vh + st) / 2)]));
        if (q >= posiciones.length) break;
      }
      const y = posiciones[q];
      await ruedaHasta(page, Math.round(y), { paso: 220, pausaMs: 25 });
      let items = [];
      for (let i = 0; i < 22; i++) {
        await dormir(i ? 300 : 1500);
        items = await page.evaluate(recolectar);
        const pendientes = items.filter((e) => !medidos.has(e.idx) && e.seccion === id);
        if (pendientes.every((e) => e.op >= 0.99)) break;
      }
      const vis = items.filter((e) => !medidos.has(e.idx) && e.op >= 0.99 && (e.seccion === id || id === "hero") && e.rects.every((r) => r[1] >= 0 && r[3] <= vh && r[0] >= 0 && r[2] <= t.w));
      if (!vis.length) continue;
      await page.evaluate(() => {
        const h = new CSSStyleSheet();
        h.replaceSync("main *, .site-header * { color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; } main svg { stroke: transparent !important; } .pasos-lista > li::before { color: transparent !important; } #stage { visibility: hidden !important; }");
        document.adoptedStyleSheets = [h];
      });
      const pos = [null, null];
      if (!t.movil) for (const k of [0, Math.floor(vis.length / 2), vis.length - 1]) { const r = vis[k].rects[0]; pos.push([(r[0] + r[2]) / 2, (r[1] + r[3]) / 2]); }
      else pos.push(null);
      let peor = vis.map(() => 99);
      for (const p of pos) {
        if (p) { await page.mouse.move(p[0], p[1], { steps: 5 }); await dormir(750); } else await dormir(850);
        const png = await page.screenshot({ type: "png" });
        const r = await analizar(limpia, png, vis);
        peor = peor.map((v, i) => Math.min(v, r[i]));
      }
      if (!t.movil) await page.mouse.move(2, 2);
      await page.evaluate(() => { document.adoptedStyleSheets = []; });
      vis.forEach((e, i) => medidos.set(e.idx, { ...e, min: peor[i], req: e.grande ? 3 : 4.5 }));
    }
  }
  // Cobertura: todo texto pequeño o grande de las secciones pedidas tiene que haberse medido en alguna posición (si la
  // franja del teléfono o el borde de la pantalla lo tapan en todas, el elemento no se mide y antes no se reportaba).
  const todos = await page.evaluate(recolectarTodos, solo);
  // Por sección + texto, no por índice: la escena del teléfono (dentro de <main>) agrega y quita nodos, y los índices de lo
  // que va después de `#stage` cambian entre una lectura y otra.
  const claves = new Set([...medidos.values()].map((e) => `${e.seccion}|${e.texto}`));
  const sinMedir = todos.filter((e) => !claves.has(`${e.seccion}|${e.texto}`));
  await ctx.close();
  return Object.assign([...medidos.values()], { sinMedir });
}

export function resumen(filas) {
  const g = {};
  for (const f of filas) { g[f.grupo] = Math.min(g[f.grupo] ?? 99, f.min); }
  return g;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = leerArgs();
  const salida = carpetaSalida(a.salida, "~/Pictures/yaruki-landing-2026-11/v2/vidrio/contraste");
  const srv = a.url ? { url: String(a.url).replace(/\/$/, ""), cerrar: async () => {} } : await iniciarServidor();
  const nav = await lanzarChromium();
  const limpia = await (await nav.newContext()).newPage();
  const temas = lista(a.temas, ["claro", "oscuro"]);
  const tams = lista(a.tams, ["escritorio", "tablet", "movil"]);
  const solo = lista(a.solo, SECCIONES);
  const todo = [];
  let fallas = 0;
  for (const tema of temas) for (const tam of tams) {
    const query = a.query && a.query !== true ? String(a.query) : "";
    const filas = await medir(nav, limpia, srv.url, { tema, tam, query, solo });
    todo.push({ tema, tam, filas });
    console.log(`\n== ${tema} ${tam}: ${filas.length} elementos`);
    for (const f of filas.sort((x, y) => x.min - y.min)) {
      const mal = f.min < f.req && !f.inactivo;
      if (mal) fallas++;
      if (mal || a.verbose) console.log(`  ${mal ? "FALLA" : "ok   "} ${f.seccion.padEnd(16)} ${f.grupo.padEnd(8)} ${f.min.toFixed(2)}:1 >= ${f.req}  ${f.grande ? "(grande " + f.px.toFixed(0) + "px) " : ""}«${f.texto}»${f.inactivo ? " (inactivo)" : ""}`);
    }
    const r = resumen(filas);
    console.log("  mínimo por grupo:", JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +v.toFixed(2)]))));
    for (const e of filas.sinMedir) { fallas++; console.log(`  FALLA ${e.seccion.padEnd(16)} sin medir (nunca visible entero fuera de la franja) «${e.texto}»`); }
    const sueltos = filas.filter((f) => f.grupo === "otro" && !f.grande);
    if (sueltos.length) console.log(`  texto pequeño fuera de los grupos conocidos (revisar si va en tarjeta): ${sueltos.map((s) => `${s.seccion}:«${s.texto}»`).join(" | ")}`);
  }
  fs.writeFileSync(path.join(salida, "contraste.json"), JSON.stringify(todo, null, 2));
  await nav.close();
  await srv.cerrar();
  console.log(fallas ? `\n${fallas} elementos bajo su mínimo` : "\ncontraste AA en todos los elementos medidos");
  process.exit(fallas ? 1 : 0);
}
