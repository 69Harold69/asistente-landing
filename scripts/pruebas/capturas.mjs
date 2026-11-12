#!/usr/bin/env node
/*
  capturas: capturas y video de la landing en todos los combos tema x tamaño,
  con una pasada de prefers-reduced-motion. Sale con 1 si hay console.error,
  pageerror, violación de CSP, requestfailed, respuesta >= 400, scroll horizontal o si,
  en reposo con el borde de una sección arriba, el teléfono no muestra la escena de esa
  sección de frente (y al regresar arriba, splash). Los fallos del navegador listados en
  conocidos.json (`navegador`) salen como XFAIL; `--estricto` los ignora.

  Uso: node capturas.mjs [--salida DIR] [--paginas /,/privacidad/] [--temas claro,oscuro]
         [--tamanos escritorio,tablet,tablet768,tabletapaisada,movil] [--sin-reducido] [--sin-video]
         [--sin-inspeccion] [--caras] [--demo-tema] [--sin-320] [--estricto] [--url http://...]

  Además, una pasada LIGERA a 320×568 (el Android más angosto común; #48): solo mide el scroll
  horizontal de cada página en cada tema (la portada, también con cada sección arriba), sin
  capturas ni video, para no alargar la corrida. `--sin-320` la omite.
*/
import fs from "node:fs";
import path from "node:path";
import { iniciarServidor } from "./lib/servidor.mjs";
import {
  leerArgs, lista, lanzarChromium, carpetaSalida, crearGuardia, scriptInicial, esperarCarga,
  leerEstado, SECCIONES_PORTADA, SECCIONES_FUERA_DEL_RECORRIDO, ORDEN_ESCENAS, dormir, slug, salir,
  medirScrollHorizontal,
} from "./lib/comun.mjs";
import { ruedaHasta, reposo } from "./lib/scroll.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace("#!/usr/bin/env node\n/*", "").trim());

export const TAMANOS = {
  escritorio: { viewport: { width: 1440, height: 900 }, movil: false },
  tablet: { viewport: { width: 820, height: 1180 }, movil: true },
  // Otras tablets (decisión del layout de tablet): iPad mini vertical y iPad apaisado (este último ya cae en la rama de escritorio).
  tablet768: { viewport: { width: 768, height: 1024 }, movil: true },
  tabletapaisada: { viewport: { width: 1024, height: 768 }, movil: true },
  movil: { viewport: { width: 390, height: 844 }, movil: true },
};
// Solo para la pasada ligera de medición (no genera capturas): ver `medicionAngosta()`.
const ANGOSTO = { viewport: { width: 320, height: 568 }, movil: true };
const TEMAS = { claro: "light", oscuro: "dark" };

const salida = carpetaSalida(a.salida, "~/Pictures/yaruki-landing-2026-11/capturas");
const paginasHome = "/";
const paginas = lista(a.paginas, ["/", "/privacidad/", "/terminos/", "/eliminar-cuenta/", "/organizar-tareas-con-ia/", "/recordatorios-por-voz/", "/404.html"]);
const temas = lista(a.temas, ["claro", "oscuro"]);
const tamanos = lista(a.tamanos, ["escritorio", "tablet", "movil"]);
const conVideo = !a["sin-video"];
const conInspeccion = !a["sin-inspeccion"];
const caras = a.caras ? ["frente", "canto", "espalda"] : ["frente"];

const srv = a.url ? { url: String(a.url).replace(/\/$/, ""), cerrar: async () => {} } : await iniciarServidor();
const navegador = await lanzarChromium();
const TODAS_LAS_SECCIONES = [...SECCIONES_PORTADA, ...SECCIONES_FUERA_DEL_RECORRIDO];
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
  }), TODAS_LAS_SECCIONES.map((s) => s.id));
  const estados = [];
  const permitidas = Object.fromEntries(TODAS_LAS_SECCIONES.map((s) => [s.id, s.escenas]));
  // Con el borde de la sección arriba y en reposo, el teléfono muestra SU escena y está de frente
  // (lo mismo que exige `tactil` en móvil; aquí se cubre la rueda en escritorio y tablet).
  const exigir = (e, seccion) => {
    const frente = e.angulo === null ? 0 : Math.min(e.angulo, 360 - e.angulo);
    if (!permitidas[seccion]?.includes(e.escena) || frente > 8)
      guardia.fallas.push({ tipo: "coreografia", detalle: `en "${seccion}" (y=${e.y}) el teléfono muestra "${e.escena}" a ${frente.toFixed(0)}°; se esperaba ${permitidas[seccion]?.join("/")} de frente`, contexto: nombreCombo });
  };
  for (const s of info.filter(Boolean)) {
    const y = s.id === "hero" ? 0 : s.top;
    await ruedaHasta(page, y);
    const e = await reposo(page, leerEstado);
    estados.push({ seccion: s.id, y: e.y, escena: e.escena, angulo: e.angulo });
    exigir(e, s.id);
    if (SECCIONES_FUERA_DEL_RECORRIDO.some((x) => x.id === s.id)) {
      // Después del recorrido el escenario del teléfono ya salió de pantalla (si no, taparía el contenido nuevo).
      const visible = await page.evaluate(() => {
        const r = document.getElementById("escenario-3d")?.getBoundingClientRect();
        return !!r && r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
      });
      if (visible) guardia.fallas.push({ tipo: "coreografia", detalle: `en "${s.id}" (y=${e.y}) el teléfono sigue a la vista; debería haber salido de escena`, contexto: nombreCombo });
    }
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
  if (alRegresar.y > 4) guardia.fallas.push({ tipo: "coreografia", detalle: `la rueda no regresó arriba (y=${alRegresar.y})`, contexto: nombreCombo });
  exigir(alRegresar, "hero");
  await foto(page, dir, "portada-regreso-arriba");
  const ancho = await medirScrollHorizontal(page);
  if (ancho) guardia.fallas.push({ tipo: "scroll-horizontal", detalle: `/ ${ancho}`, contexto: nombreCombo });
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
    // Antes solo se medía al final del recorrido de la portada: las legales y la 404 nunca (#46).
    const ancho = await medirScrollHorizontal(page);
    if (ancho) guardia.fallas.push({ tipo: "scroll-horizontal", detalle: `${ruta} ${ancho}`, contexto: nombreCombo });
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

/*
  Pasada ligera a 320×568 (#48): el scroll horizontal aparecía solo por debajo de 360 px y los combos
  completos (390 px) no lo veían. Sin video ni capturas: un contexto por tema, cada página, y en la
  portada cada sección arriba (scroll instantáneo; el teléfono cambia de transformación por sección).
*/
async function medicionAngosta() {
  for (const tema of temas) {
    const nombreCombo = `${tema}-320`;
    process.stdout.write(`> ${nombreCombo} (solo medición) ... `);
    const t0 = Date.now();
    const ctx = await navegador.newContext({
      ...opcionesContexto({ tema, tam: "movil", reducido: false }, false),
      viewport: ANGOSTO.viewport,
    });
    await ctx.addInitScript(scriptInicial({ tema: TEMAS[tema] }));
    const page = await ctx.newPage();
    for (const ruta of paginas) {
      const es404 = ruta === "/404.html";
      page.removeAllListeners("console");
      page.removeAllListeners("pageerror");
      page.removeAllListeners("requestfailed");
      page.removeAllListeners("response");
      guardia.instalar(page, `${nombreCombo} ${ruta}${es404 ? " [esperado-404]" : ""}`);
      await page.goto(srv.url + ruta, { waitUntil: "load" });
      await esperarCarga(page, { portada: ruta === "/" });
      const medir = async (donde) => {
        const ancho = await medirScrollHorizontal(page);
        if (ancho) guardia.fallas.push({ tipo: "scroll-horizontal", detalle: `${donde} ${ancho}`, contexto: nombreCombo });
      };
      await medir(ruta);
      if (ruta === "/") {
        // El botón «Únete a la beta» del hero entra completo en el primer pantallazo a 320×568 (con ≥ 8 px de margen).
        const pie = await page.evaluate(() => document.querySelector(".seccion-hero [data-cta-beta]")?.getBoundingClientRect().bottom ?? Infinity);
        if (pie > ANGOSTO.viewport.height - 8) guardia.fallas.push({ tipo: "hero-320", detalle: `el pie del botón de la beta queda en ${pie.toFixed(0)} px (alto ${ANGOSTO.viewport.height}; máximo ${ANGOSTO.viewport.height - 8})`, contexto: nombreCombo });
      }
      if (ruta === "/") {
        for (const { id } of SECCIONES_PORTADA.slice(1)) {
          await page.evaluate((s) => document.getElementById(s)?.scrollIntoView({ block: "start", behavior: "instant" }), id);
          await dormir(350);
          await medir(`/#${id}`);
        }
      }
    }
    await ctx.close();
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
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
  if (!a["sin-320"]) await medicionAngosta();
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
for (const x of guardia.xfails) console.log(`XFAIL  [${x.tipo}] ${x.detalle}  (${x.contexto}; issue #${x.issue})`);
if (guardia.fallas.length) {
  console.error(`\nFALLAS (${guardia.fallas.length}):`);
  for (const f of guardia.fallas) console.error(`  [${f.tipo}] ${f.detalle}  (${f.contexto})`);
  codigo = 1;
} else console.log("Consola, CSP y red limpias.");
process.exit(codigo);
