#!/usr/bin/env node
/*
  vidrio: herramienta del prototipo de tarjetas de vidrio (#59). Compara una URL "antes" (main) y una "después" (esta
  rama) en #fase-chat y mide contraste en píxeles y costo de composición.
    node vidrio.mjs capturas  --antes URL --despues URL --salida DIR
    node vidrio.mjs contraste --url URL [--salida DIR]
    node vidrio.mjs rendimiento --antes URL --despues URL [--corridas 5]
    node vidrio.mjs video --antes URL --despues URL --salida DIR
*/
import fs from "node:fs";
import path from "node:path";
import { leerArgs, lanzarChromium, carpetaSalida, scriptInicial, esperarCarga, dormir, leerEstado } from "./lib/comun.mjs";
import { ruedaHasta as ruedaExacta, reposo } from "./lib/scroll.mjs";

/* Como ruedaHasta (rueda real) pero con tolerancia y tope de pasos: con la coreografía suavizada, pedir el píxel exacto puede oscilar. */
async function ruedaHasta(page, objetivo, { paso = 60, pausaMs = 35, tolerancia = 6 } = {}) {
  let y = await page.evaluate(() => window.scrollY);
  for (let i = 0; i < 400 && Math.abs(objetivo - y) > tolerancia; i++) {
    await page.mouse.wheel(0, Math.sign(objetivo - y) * Math.min(Math.abs(objetivo - y), paso));
    await dormir(pausaMs);
    y = await page.evaluate(() => window.scrollY);
  }
  return y;
}

const a = leerArgs();
const modo = process.argv[2];
const salida = carpetaSalida(a.salida, "~/Pictures/yaruki-landing-2026-11/vidrio");
export const TAMANOS = {
  escritorio: { viewport: { width: 1440, height: 900 }, movil: false },
  tablet: { viewport: { width: 820, height: 1180 }, movil: true },
  movil: { viewport: { width: 390, height: 844 }, movil: true },
};
const TEMAS = { claro: "light", oscuro: "dark" };

export async function abrir(navegador, url, { tema, tam, reducido = false, video, extra = {} }) {
  const t = TAMANOS[tam];
  const ctx = await navegador.newContext({
    viewport: t.viewport, deviceScaleFactor: 1, isMobile: t.movil, hasTouch: t.movil,
    colorScheme: TEMAS[tema], reducedMotion: reducido ? "reduce" : "no-preference",
    locale: "es-MX", timezoneId: "America/Mexico_City",
    ...(video ? { recordVideo: { dir: video, size: { width: t.viewport.width > 900 ? 1000 : Math.round(t.viewport.width * 1000 / t.viewport.height * 0.0 + 460), height: t.viewport.width > 900 ? 625 : 1000 } } } : {}),
    ...extra,
  });
  await ctx.addInitScript(scriptInicial({ tema: TEMAS[tema] }));
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && console.error("  consola:", m.text()));
  page.on("pageerror", (e) => console.error("  pageerror:", e.message));
  await page.goto(url + "/", { waitUntil: "load" });
  await esperarCarga(page, { portada: true });
  return { ctx, page };
}

/** y de scroll con el que el texto de #fase-chat queda en lectura (borde de la sección arriba). */
export async function irAChat(page, { fraccion = 0 } = {}) {
  const top = await page.evaluate((f) => {
    const el = document.getElementById("fase-chat");
    return Math.round(el.getBoundingClientRect().top + window.scrollY + el.offsetHeight * f);
  }, fraccion);
  await ruedaHasta(page, top, { paso: 220, pausaMs: 25 });
  return reposo(page, leerEstado);
}

if (modo === "capturas") {
  const nav = await lanzarChromium();
  for (const [nombre, url] of [["antes", a.antes], ["despues", a.despues]]) {
    for (const tema of ["claro", "oscuro"]) for (const tam of ["escritorio", "tablet", "movil"]) {
      const { ctx, page } = await abrir(nav, url, { tema, tam });
      await irAChat(page, { fraccion: 0 });
      await dormir(600);
      await page.screenshot({ path: path.join(salida, `${nombre}-${tema}-${tam}.png`) });
      await ctx.close();
    }
  }
  await nav.close();
}

/* ---- contraste en píxeles renderizados ---- */
/** En una página limpia (sin CSP) decodifica el PNG y, por cada pieza, busca el peor contraste de su color contra los píxeles de su caja y de toda la tarjeta. */
async function peoresContrastes(limpia, png, piezas, tarjeta) {
  return limpia.evaluate(async ({ b64, piezas, tarjeta }) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bin], { type: "image/png" }));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(bmp, 0, 0);
    const d = x.getImageData(0, 0, bmp.width, bmp.height).data;
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (r, g, b) => 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    // Luminancia mínima y máxima de los píxeles de una caja: el peor contraste sale de uno de los dos extremos.
    const extremos = (caja) => {
      const [x0, y0, x1, y1] = [Math.max(0, Math.floor(caja[0])), Math.max(0, Math.floor(caja[1])), Math.min(bmp.width - 1, Math.ceil(caja[2])), Math.min(bmp.height - 1, Math.ceil(caja[3]))];
      let mn = 9, mx = -1;
      for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) {
        const i = (y * bmp.width + xx) * 4;
        const l = lum(d[i], d[i + 1], d[i + 2]);
        if (l < mn) mn = l;
        if (l > mx) mx = l;
      }
      return [mn, mx];
    };
    const cr = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const t = extremos(tarjeta);
    return piezas.map((p) => {
      const lt = lum(...p.rgb);
      const e = extremos(p.caja);
      return { clase: p.clase, color: p.color, enCaja: Math.min(cr(lt, e[0]), cr(lt, e[1])), enTarjeta: Math.min(cr(lt, t[0]), cr(lt, t[1])) };
    });
  }, { b64: png.toString("base64"), piezas, tarjeta });
}

export async function medirContraste(nav, url, { tema, tam }) {
  const { ctx, page } = await abrir(nav, url, { tema, tam });
  const ctxLimpio = await nav.newContext();
  const limpia = await ctxLimpio.newPage();
  await page.bringToFront();
  await irAChat(page);
  await dormir(500);
  // El teléfono (z-index superior, sin eventos) no está DETRÁS de la tarjeta: se oculta para medir solo lo que hay debajo
  // del texto, y se centra la tarjeta en la ventana para que quede entera dentro de la captura.
  await page.evaluate(() => { document.getElementById("stage")?.style.setProperty("visibility", "hidden", "important"); });
  const centro = await page.evaluate(() => { const r = document.getElementById("fase-chat").getBoundingClientRect(); return Math.round(scrollY + r.top + r.height / 2 - innerHeight / 2); });
  await ruedaHasta(page, centro, { paso: 120, pausaMs: 25 });
  // Espera a que la coreografía suavizada deje de mover el bloque (las cajas deben repetirse).
  const leerCajas = () => page.evaluate(() => [...document.getElementById("fase-chat").children].map((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map((v) => v.toFixed(1)).join(","); }).join("|"));
  for (let previa = "", iguales = 0, i = 0; i < 60 && iguales < 4; i++) { const ahora = await leerCajas(); iguales = ahora === previa ? iguales + 1 : 0; previa = ahora; await dormir(500); }
  const datos = await page.evaluate(() => {
    const sec = document.getElementById("fase-chat");
    const piezas = [...sec.children].map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { clase: el.className, color: cs.color, rgb: cs.color.match(/[\d.]+/g).slice(0, 3).map(Number), caja: [r.left, r.top, r.right, r.bottom] };
    });
    const card = getComputedStyle(sec, "::after");
    const hijos = piezas.map((p) => p.caja);
    return {
      piezas,
      panel: { fondo: card.backgroundColor, filtro: card.backdropFilter, opacidad: card.opacity },
      tarjeta: [Math.min(...hijos.map((c) => c[0])), Math.min(...hijos.map((c) => c[1])), Math.max(...hijos.map((c) => c[2])), Math.max(...hijos.map((c) => c[3]))],
    };
  });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("#fase-chat > *")) el.style.setProperty("color", "transparent", "important");
  });
  await dormir(200);
  if (a.verbose) console.log(JSON.stringify({ tarjeta: datos.tarjeta, cajas: datos.piezas.map((p) => p.caja.map(Math.round)) }));
  const png = await page.screenshot({ type: "png" });
  fs.writeFileSync(path.join(salida, `contraste-fondo-${tema}-${tam}.png`), png);
  const cajasDespues = await leerCajas();
  const cajasAntes = datos.piezas.map((p) => p.caja.map((v) => v.toFixed(1)).join(",")).join("|");
  if (cajasDespues !== cajasAntes) console.error("  AVISO: el bloque se movió durante la captura", cajasAntes.split("|")[0], "->", cajasDespues.split("|")[0]);
  const filas = await peoresContrastes(limpia, png, datos.piezas, datos.tarjeta);
  await ctx.close();
  await ctxLimpio.close();
  return { tema, tam, panel: datos.panel, filas };
}

if (modo === "contraste") {
  const nav = await lanzarChromium();
  let peorGlobal = 99;
  const todo = [];
  for (const tema of (a.temas ? a.temas.split(",") : ["claro", "oscuro"])) for (const tam of (a.tams ? a.tams.split(",") : ["escritorio", "movil"])) {
    const r = await medirContraste(nav, a.url, { tema, tam });
    todo.push(r);
    console.log(`\n${tema} ${tam}  panel: fondo=${r.panel.fondo} filtro=${r.panel.filtro} op=${r.panel.opacidad}`);
    for (const f of r.filas) {
      console.log(`  ${(f.clase.split(" ")[0] || "?").padEnd(14)} ${f.color.padEnd(20)} caja ${f.enCaja.toFixed(2)}:1   tarjeta entera ${f.enTarjeta.toFixed(2)}:1`);
      peorGlobal = Math.min(peorGlobal, f.enCaja);
    }
  }
  await nav.close();
  console.log(`\npeor contraste en cajas de texto: ${peorGlobal.toFixed(2)}:1`);
  fs.writeFileSync(path.join(salida, "contraste.json"), JSON.stringify(todo, null, 2));
  process.exit(peorGlobal >= 4.5 ? 0 : 1);
}

/* ---- sincronía tarjeta/texto: opacidad de la tarjeta vs. la del primer bloque de texto mientras se baja ---- */
if (modo === "sincronia") {
  const nav = await lanzarChromium();
  for (const tam of ["escritorio", "movil"]) {
    const { ctx, page } = await abrir(nav, a.url, { tema: "claro", tam });
    const top = await page.evaluate(() => Math.round(document.getElementById("fase-chat").getBoundingClientRect().top + scrollY));
    const vh = TAMANOS[tam].viewport.height;
    console.log(`\n${tam}: #fase-chat.top=${top}`);
    for (let y = Math.max(0, top - vh * 1.4); y <= top + vh * 0.6; y += vh * 0.1) {
      await ruedaHasta(page, Math.round(y), { paso: 220, pausaMs: 25 });
      await dormir(1100);
      const m = await page.evaluate(() => {
        const s = document.getElementById("fase-chat");
        const c = s.children[0], t = s.children[1];
        const r = c.getBoundingClientRect();
        return { y: Math.round(scrollY), tarjeta: +getComputedStyle(s, "::after").opacity, kicker: +getComputedStyle(c).opacity, parrafo: +getComputedStyle(s.children[5]).opacity, seccionOp: +getComputedStyle(s).opacity, kickerTop: Math.round(r.top) };
      });
      console.log(JSON.stringify(m));
    }
    await ctx.close();
  }
  await nav.close();
}

if (modo === "depurar") {
  const nav = await lanzarChromium();
  const { ctx, page } = await abrir(nav, a.url, { tema: a.tema ?? "claro", tam: a.tam ?? "escritorio" });
  await irAChat(page);
  await page.evaluate(() => { document.getElementById("stage")?.style.setProperty("display", "none", "important"); for (const el of document.querySelectorAll("#fase-chat > *")) el.style.setProperty("color", "transparent", "important"); });
  await dormir(600);
  await page.screenshot({ path: path.join(salida, "depurar.png") });
  await nav.close();
}
if (modo === "depurar2") {
  const nav = await lanzarChromium();
  const { ctx, page } = await abrir(nav, a.url, { tema: "claro", tam: "escritorio" });
  await irAChat(page);
  const r = await page.evaluate(() => [...document.getElementById("fase-chat").children].map((el) => { const b = el.getBoundingClientRect(); return [el.tagName, Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)].join(" "); }));
  console.log(r.join("\n"), "\nvh", await page.evaluate(() => innerHeight));
  await nav.close();
}
