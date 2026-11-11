#!/usr/bin/env node
/*
  capturas: capturas y video de la landing en todos los combos tema x tamaño,
  con una pasada de prefers-reduced-motion. Sale con 1 si hay console.error,
  pageerror, violación de CSP, requestfailed o respuesta >= 400.

  Uso: node capturas.mjs [--salida DIR] [--paginas /,/privacidad/] [--temas claro,oscuro]
         [--tamanos escritorio,tablet,movil] [--sin-reducido] [--sin-video]
         [--sin-inspeccion] [--caras] [--demo-tema] [--url http://...]
*/
import fs from "node:fs";
import path from "node:path";
import { iniciarServidor } from "./lib/servidor.mjs";
import {
  leerArgs, lista, lanzarChromium, carpetaSalida, crearGuardia, scriptInicial, esperarCarga,
  leerEstado, SECCIONES_PORTADA, ORDEN_ESCENAS, dormir, slug, salir,
} from "./lib/comun.mjs";
import { ruedaHasta, reposo } from "./lib/scroll.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace("#!/usr/bin/env node\n/*", "").trim());

export const TAMANOS = {
  escritorio: { viewport: { width: 1440, height: 900 }, movil: false },
  tablet: { viewport: { width: 820, height: 1180 }, movil: true },
  movil: { viewport: { width: 390, height: 844 }, movil: true },
};
const TEMAS = { claro: "light", oscuro: "dark" };

const salida = carpetaSalida(a.salida, "~/Pictures/yaruki-landing-2026-11/capturas");
const paginasHome = "/";
const paginas = lista(a.paginas, ["/", "/privacidad/", "/terminos/", "/eliminar-cuenta/", "/404.html"]);
const temas = lista(a.temas, ["claro", "oscuro"]);
const tamanos = lista(a.tamanos, ["escritorio", "tablet", "movil"]);
const conVideo = !a["sin-video"];
const conInspeccion = !a["sin-inspeccion"];
const caras = a.caras ? ["frente", "canto", "espalda"] : ["frente"];

const srv = a.url ? { url: String(a.url).replace(/\/$/, ""), cerrar: async () => {} } : await iniciarServidor();
const navegador = await lanzarChromium();
const guardia = crearGuardia(srv.url);
const informe = { generado: new Date().toISOString(), url: srv.url, combos: [], archivos: [] };

const combos = [];
for (const t of temas) for (const tam of tamanos) combos.push({ tema: t, tam, reducido: false });
if (!a["sin-reducido"]) for (const t of temas) for (const tam of ["escritorio", "movil"].filter((x) => tamanos.includes(x))) combos.push({ tema: t, tam, reducido: true });

function escalar({ width, height }, maximo) {
  const f = Math.min(1, maximo / Math.max(width, height));
  return { width: Math.round((width * f) / 2) * 2, height: Math.round((height * f) / 2) * 2 };
}

function opcionesContexto({ tema, tam, reducido }, video, dir) {
  const t = TAMANOS[tam];
  return {
    viewport: t.viewport,
    deviceScaleFactor: 1,
    isMobile: t.movil,
    hasTouch: t.movil,
    colorScheme: TEMAS[tema],
    reducedMotion: reducido ? "reduce" : "no-preference",
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    // Video a escala (lado mayor <= 1000 px): a tamaño real el codificador software tarda 4x.
    ...(video ? { recordVideo: { dir, size: escalar(t.viewport, 1000) } } : {}),
  };
}

async function nuevaPagina(combo, etiqueta, { video = false, dirVideo } = {}) {
  const ctx = await navegador.newContext(opcionesContexto(combo, video, dirVideo));
  await ctx.addInitScript(scriptInicial({ tema: TEMAS[combo.tema], demo: !!a["demo-tema"] }));
  const page = await ctx.newPage();
  guardia.instalar(page, etiqueta);
  return { ctx, page };
}

const tick0 = Date.now();
const v = (m) => a.verbose && console.log(`   [${((Date.now() - tick0) / 1000).toFixed(1)}s] ${m}`);

async function foto(page, dir, nombre, opciones = {}) {
  v(nombre);
  const archivo = path.join(dir, `${nombre}.png`);
  await page.screenshot({ path: archivo, ...opciones });
  informe.archivos.push(archivo);
  return archivo;
}

async function verificarTema(page, combo, donde) {
  const efectivo = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  const esperado = TEMAS[combo.tema];
  const vistoOscuro = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (efectivo && efectivo !== esperado) guardia.fallas.push({ tipo: "tema", detalle: `data-theme=${efectivo}, se esperaba ${esperado}`, contexto: donde });
  return vistoOscuro;
}

async function recorridoPortada(combo, dir, nombreCombo) {
  const dirVideo = path.join(dir, "_video");
  const { ctx, page } = await nuevaPagina(combo, `${nombreCombo} /`, { video: conVideo, dirVideo });
  const escritorio = combo.tam === "escritorio";
  await page.goto(srv.url + "/", { waitUntil: "load" });
  await esperarCarga(page, { portada: true });
  await verificarTema(page, combo, `${nombreCombo} /`);
  await foto(page, dir, "portada-hero");

  // Mouse real sobre el teléfono: tilt.js (+-4 grados) y magnetico.js. Solo escritorio con movimiento.
  if (escritorio && !combo.reducido) {
    const caja = await page.locator("#telefono").boundingBox();
    if (caja) {
      const mover = async (x, y) => page.mouse.move(x, y, { steps: 25 });
      await mover(caja.x + caja.width * 0.1, caja.y + caja.height * 0.15);
      await dormir(1000);
      await foto(page, dir, "portada-mouse-arriba-izquierda");
      await mover(caja.x + caja.width * 0.9, caja.y + caja.height * 0.85);
      await dormir(1000);
      await foto(page, dir, "portada-mouse-abajo-derecha");
      const cta = page.locator("#hero [data-cta-beta]").first();
      const cb = await cta.boundingBox();
      if (cb) {
        await mover(cb.x + cb.width / 2, cb.y + cb.height / 2);
        await dormir(700);
        await foto(page, dir, "portada-mouse-sobre-cta");
      }
      await mover(5, 5);
      await dormir(600);
    }
  }

  // Bajada con rueda real, una captura por sección, y subida.
  const alturaVista = await page.evaluate(() => window.innerHeight);
  await page.mouse.move(alturaVista > 0 ? 100 : 0, 200);
  const info = await page.evaluate((ids) => ids.map((id) => {
    const el = document.getElementById(id);
    return el ? { id, top: Math.round(el.getBoundingClientRect().top + window.scrollY), alto: Math.round(el.offsetHeight) } : null;
  }), SECCIONES_PORTADA.map((s) => s.id));
  const estados = [];
  for (const s of info.filter(Boolean)) {
    const y = s.id === "hero" ? 0 : s.top;
    await ruedaHasta(page, y);
    const e = await reposo(page, leerEstado);
    estados.push({ seccion: s.id, y: e.y, escena: e.escena, angulo: e.angulo });
    await foto(page, dir, `portada-seccion-${s.id}`);
    if (s.alto > alturaVista * 1.3) {
      await ruedaHasta(page, s.top + s.alto - alturaVista * 0.8);
      const f = await reposo(page, leerEstado);
      estados.push({ seccion: `${s.id}-fin`, y: f.y, escena: f.escena, angulo: f.angulo });
      await foto(page, dir, `portada-seccion-${s.id}-fin`);
    }
  }
  const maximo = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  await ruedaHasta(page, maximo);
  await reposo(page, leerEstado);
  await foto(page, dir, "portada-final");
  await ruedaHasta(page, 0);
  const alRegresar = await reposo(page, leerEstado);
  estados.push({ seccion: "regreso-arriba", y: alRegresar.y, escena: alRegresar.escena, angulo: alRegresar.angulo });
  await foto(page, dir, "portada-regreso-arriba");
  const ancho = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  if (ancho[0] > ancho[1]) guardia.fallas.push({ tipo: "scroll-horizontal", detalle: `scrollWidth ${ancho[0]} > ${ancho[1]}`, contexto: nombreCombo });
  informe.combos.push({ combo: nombreCombo, estados });

  const video = conVideo ? page.video() : null;
  await ctx.close();
  if (video) {
    const destino = path.join(dir, "portada-scroll.webm");
    await video.saveAs(destino);
    await video.delete();
    informe.archivos.push(destino);
    fs.rmSync(dirVideo, { recursive: true, force: true });
  }
}

async function otrasPaginas(combo, dir, nombreCombo) {
  const { ctx, page } = await nuevaPagina(combo, `${nombreCombo}`);
  for (const ruta of paginas) {
    page.removeAllListeners("response"); // se reinstala con el contexto correcto
    const es404 = ruta === "/404.html";
    guardia.instalar(page, `${nombreCombo} ${ruta}${es404 ? " [esperado-404]" : ""}`);
    const resp = await page.goto(srv.url + ruta, { waitUntil: "load" });
    if (!es404 && resp && resp.status() >= 400) guardia.fallas.push({ tipo: "http", detalle: `${resp.status()} ${ruta}`, contexto: nombreCombo });
    await esperarCarga(page, { portada: ruta === "/" });
    await verificarTema(page, combo, `${nombreCombo} ${ruta}`);
    if (ruta === "/") {
      await foto(page, dir, "portada-pagina-completa", { fullPage: true });
    } else {
      await foto(page, dir, `${slug(ruta)}-pagina-completa`, { fullPage: true });
    }
  }
  // Modo de inspeccion del telefono: cada escena y cara, estatico.
  if (conInspeccion && paginas.includes("/")) {
    for (const escena of ORDEN_ESCENAS) {
      for (const cara of caras) {
        guardia.instalar(page, `${nombreCombo} inspeccion ${escena}/${cara}`);
        await page.goto(`${srv.url}/?escena=${escena}&cara=${cara}`, { waitUntil: "load" });
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForSelector(".phone-pantalla .escena", { timeout: 10000 }).catch(() => {});
        await page.evaluate(() => document.fonts.ready);
        // En modo de inspeccion la escena se monta SIN coreografia ni play(): se ve su estado inicial
        // (p. ej. el chat vacio). Los estados animados se capturan en `portada-seccion-*`.
        await dormir(500);
        const tel = page.locator("#escenario-3d");
        const caja = await tel.boundingBox();
        const opciones = caja ? { clip: { x: Math.max(0, caja.x - 12), y: Math.max(0, caja.y - 12), width: caja.width + 24, height: Math.min(caja.height + 24, TAMANOS[combo.tam].viewport.height) } } : {};
        await foto(page, dir, `escena-${escena}-${cara}`, opciones);
      }
    }
  }
  await ctx.close();
}

let codigo = 0;
try {
  for (const combo of combos) {
    const nombreCombo = `${combo.tema}-${combo.tam}${combo.reducido ? "-reducido" : ""}`;
    const dir = path.join(salida, nombreCombo);
    fs.mkdirSync(dir, { recursive: true });
    process.stdout.write(`> ${nombreCombo} ... `);
    const t0 = Date.now();
    if (paginas.includes("/")) await recorridoPortada(combo, dir, nombreCombo);
    await otrasPaginas(combo, dir, nombreCombo);
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
} catch (e) {
  console.error("\ncapturas: error de ejecucion:", e);
  guardia.fallas.push({ tipo: "excepcion", detalle: String(e?.message ?? e), contexto: "capturas" });
} finally {
  await navegador.close();
  await srv.cerrar();
}

informe.fallas = guardia.fallas;
fs.writeFileSync(path.join(salida, "informe.json"), JSON.stringify(informe, null, 2));
console.log(`\n${informe.archivos.length} archivos en ${salida}`);
if (guardia.fallas.length) {
  console.error(`\nFALLAS (${guardia.fallas.length}):`);
  for (const f of guardia.fallas) console.error(`  [${f.tipo}] ${f.detalle}  (${f.contexto})`);
  codigo = 1;
} else console.log("Consola, CSP y red limpias.");
process.exit(codigo);
