#!/usr/bin/env node
/*
  tactil: recorre la portada con gestos TACTILES reales (CDP Input.dispatchTouchEvent
  con velocidad de soltado = momentum/fling, y Input.synthesizeScrollGesture para arrastres
  lentos) en Chromium con los descriptores de dispositivo de Pixel y de iPhone, y verifica
  que la coreografia del telefono no se rompe:
    - sin saltos de escena (orden monotono bajando y subiendo, sin A->B->A),
    - sin saltos bruscos del giro del telefono entre cuadros,
    - sin scroll horizontal,
    - sin atascos (cada fling a mitad de pagina mueve el scroll),
    - al reposar en cada seccion (bajando y subiendo) la escena es la que corresponde,
    - al llevar el borde de cada seccion arriba el telefono queda de frente (0 grados),
    - al regresar arriba termina en splash, de frente.
  Graba video. Sale con 1 si algo falla (no arregla nada: reporta).

  WebKit real no corre en este sistema (ver README): se usa el descriptor de iPhone
  sobre Chromium; el momentum de iOS no se reproduce exactamente.

  Uso: node tactil.mjs [--salida DIR] [--dispositivos "Pixel 7,iPhone 15"] [--tema claro|oscuro]
         [--sin-video] [--url http://...]
*/
import fs from "node:fs";
import path from "node:path";
import { devices } from "playwright";
import { iniciarServidor } from "./lib/servidor.mjs";
import {
  leerArgs, lista, lanzarChromium, carpetaSalida, crearGuardia, scriptInicial, esperarCarga,
  leerEstado, SECCIONES_PORTADA, ORDEN_ESCENAS, dormir, salir,
} from "./lib/comun.mjs";
import { reposo } from "./lib/scroll.mjs";

const a = leerArgs();
const salida = carpetaSalida(a.salida, "~/Pictures/yaruki-landing-2026-11/tactil");
const nombres = lista(a.dispositivos, ["Pixel 7", "iPhone 15"]);
const tema = a.tema === "oscuro" ? "dark" : "light";
const srv = a.url ? { url: String(a.url).replace(/\/$/, ""), cerrar: async () => {} } : await iniciarServidor();
const navegador = await lanzarChromium();
const guardia = crearGuardia(srv.url);
const permitidas = Object.fromEntries(SECCIONES_PORTADA.map((s) => [s.id, s.escenas]));
permitidas.privacidad = ["dashboard"];

const v = (m) => a.verbose && console.log(`   [${new Date().toISOString().slice(11, 19)}] ${m}`);
const informe = { generado: new Date().toISOString(), dispositivos: [] };
const problemas = [];

/* ---------------- gestos ---------------- */

async function flick(cdp, { x, y0, distancia, duracionMs }) {
  // distancia > 0 = el contenido baja la pagina (el dedo sube).
  const pasos = Math.max(4, Math.round(duracionMs / 16));
  const toque = (type, yy) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: yy, id: 1 }] });
  await toque("touchStart", y0);
  for (let i = 1; i <= pasos; i++) {
    await toque("touchMove", y0 - (distancia * i) / pasos);
    await dormir(duracionMs / pasos);
  }
  await toque("touchEnd", 0); // se suelta con la velocidad del ultimo tramo -> fling con momentum
}

async function arrastreLento(cdp, { x, y, distancia }) {
  // Arrastre con el dedo que se detiene ANTES de soltar: sin velocidad de salida, no hay fling.
  // distancia > 0 = baja la pagina (el dedo sube); < 0 = sube la pagina.
  const toque = (type, yy) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y: yy, id: 1 }] });
  const y0 = Math.round(y + distancia / 2);
  const pasos = 24;
  await toque("touchStart", y0);
  for (let i = 1; i <= pasos; i++) {
    await toque("touchMove", Math.round(y0 - (distancia * i) / pasos));
    await dormir(24);
  }
  await dormir(180);
  await toque("touchEnd", 0);
}

const ySuelta = async (page) => page.evaluate(() => window.scrollY);

async function esperarQuietud(page, ms = 350, max = 5000) {
  const t0 = Date.now();
  let previo = await ySuelta(page);
  let desde = Date.now();
  while (Date.now() - t0 < max) {
    await dormir(60);
    const y = await ySuelta(page);
    if (Math.abs(y - previo) > 0.5) {
      previo = y;
      desde = Date.now();
    } else if (Date.now() - desde >= ms) return y;
  }
  return previo;
}

/* ---------------- analisis de muestras (rAF dentro de la pagina) ---------------- */

const SAMPLER = () => {
  window.__muestras = [];
  const t0 = performance.now();
  const bucle = () => {
    const e = window.__leer();
    window.__muestras.push([Math.round(performance.now() - t0), e.y, e.x, e.escena, e.angulo === null ? null : Math.round(e.angulo * 10) / 10, e.anchoDoc, e.anchoVista]);
    window.__rafId = requestAnimationFrame(bucle);
  };
  bucle();
};

async function tomarMuestras(page) {
  return page.evaluate(() => {
    const m = window.__muestras;
    window.__muestras = [];
    return m;
  });
}

const difAngulo = (p, q) => {
  let d = q - p;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
};

function analizar(muestras, sentido, etiqueta) {
  const res = [];
  if (muestras.length < 5) return [`${etiqueta}: muy pocas muestras (${muestras.length})`];
  // scroll horizontal
  const h = muestras.filter((m) => m[5] > m[6] || m[2] !== 0);
  if (h.length) res.push(`${etiqueta}: scroll horizontal en ${h.length} cuadros (scrollWidth ${h[0][5]} > ${h[0][6]}, scrollX ${h[0][2]})`);
  // orden de escenas
  const secuencia = [];
  for (const m of muestras) if (m[3] && secuencia[secuencia.length - 1] !== m[3]) secuencia.push(m[3]);
  const idx = secuencia.map((e) => ORDEN_ESCENAS.indexOf(e));
  for (let i = 1; i < idx.length; i++) {
    if ((sentido === "bajando" && idx[i] < idx[i - 1]) || (sentido === "subiendo" && idx[i] > idx[i - 1])) {
      res.push(`${etiqueta}: salto de escena fuera de orden (${secuencia.join(" > ")})`);
      break;
    }
  }
  // saltos bruscos del giro
  let peor = 0;
  let cuando = null;
  for (let i = 1; i < muestras.length; i++) {
    if (muestras[i][4] === null || muestras[i - 1][4] === null) continue;
    const d = Math.abs(difAngulo(muestras[i - 1][4], muestras[i][4]));
    if (d > peor) {
      peor = d;
      cuando = muestras[i];
    }
  }
  if (peor > 90) res.push(`${etiqueta}: salto brusco del giro del telefono de ${peor.toFixed(0)} grados en un cuadro (y=${cuando[1]})`);
  informe_actual.metricas[etiqueta] = { muestras: muestras.length, escenas: secuencia, giroMaxPorCuadro: Math.round(peor) };
  return res;
}

let informe_actual = null;

function leida(secciones, y, alto) {
  const linea = y + alto * 0.5;
  let actual = secciones[0];
  for (const s of secciones) if (s.top <= linea) actual = s;
  return actual;
}

/* ---------------- recorrido por dispositivo ---------------- */

async function probar(nombre) {
  const d = { ...devices[nombre] };
  if (!d.viewport) throw new Error(`Dispositivo desconocido: ${nombre}`);
  delete d.defaultBrowserType;
  const tag = nombre.replace(/\s+/g, "-").toLowerCase();
  const dirVideo = path.join(salida, `_video-${tag}`);
  const ctx = await navegador.newContext({
    ...d,
    colorScheme: tema,
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    ...(a["sin-video"] ? {} : { recordVideo: { dir: dirVideo, size: { width: Math.round(d.viewport.width / 2) * 2, height: Math.round(d.viewport.height / 2) * 2 } } }),
  });
  await ctx.addInitScript(scriptInicial({ tema }));
  await ctx.addInitScript(`window.__leer = ${leerEstado.toString()};`);
  const page = await ctx.newPage();
  guardia.instalar(page, `tactil ${nombre}`);
  const cdp = await ctx.newCDPSession(page);
  informe_actual = { dispositivo: nombre, viewport: d.viewport, metricas: {}, reposos: [], llegadas: [], flicks: 0 };
  const fallos = [];
  const x = Math.round(d.viewport.width / 2);
  const alto = d.viewport.height;

  v('goto');
  await page.goto(srv.url + "/", { waitUntil: "load" });
  await esperarCarga(page, { portada: true });
  v('cargado');
  const secciones = (
    await page.evaluate((ids) => ids.map((id) => {
      const el = document.getElementById(id);
      return el ? { id, top: Math.round(el.getBoundingClientRect().top + window.scrollY) } : null;
    }), [...SECCIONES_PORTADA.map((s) => s.id), "privacidad"])
  ).filter(Boolean);
  const maximo = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const inicio = await page.evaluate(leerEstado);
  if (inicio.escena !== "splash" || Math.min(inicio.angulo, 360 - inicio.angulo) > 3) fallos.push(`inicio: se esperaba splash de frente, hay ${inicio.escena} a ${inicio.angulo?.toFixed(1)} grados`);

  /*
    En reposo a mitad de pagina el telefono puede estar a medio vuelo hacia la escena vecina
    (el vuelo termina ANTES de que el texto llegue al centro, por diseno: README "TRAMOS").
    Se acepta la escena de la seccion que se lee o la inmediata anterior/siguiente; lo estricto
    (escena exacta y de frente) se exige en `llegar`, con el borde de la seccion arriba.
  */
  const verificarReposo = (e, contexto) => {
    const s = leida(secciones, e.y, alto);
    const propias = (permitidas[s.id] ?? []).map((id) => ORDEN_ESCENAS.indexOf(id));
    const i = ORDEN_ESCENAS.indexOf(e.escena);
    const ok = propias.length > 0 && i >= Math.min(...propias) - 1 && i <= Math.max(...propias) + 1;
    informe_actual.reposos.push({ contexto, y: e.y, seccion: s.id, escena: e.escena, angulo: Math.round(e.angulo), ok });
    if (!ok) fallos.push(`${contexto}: en reposo en y=${e.y} se lee "${s.id}" pero el telefono muestra "${e.escena}" (esperada ${permitidas[s.id]?.join("/")} o una vecina)`);
  };

  v('secciones ' + JSON.stringify(secciones));
  await page.evaluate(SAMPLER);
  v('sampler maximo=' + maximo);

  // ---- bajar con flings ----
  let y = 0;
  let intentos = 0;
  while (y < maximo - 4 && intentos++ < 80) {
    const antes = y;
    v('flick');
    await flick(cdp, { x, y0: Math.round(alto * 0.8), distancia: Math.round(alto * (0.28 + 0.12 * (intentos % 3))), duracionMs: 100 });
    informe_actual.flicks++;
    await esperarQuietud(page);
    const e = await reposo(page, leerEstado, { ms: 500 });
    y = e.y;
    v(`bajando ${intentos}: y=${e.y} escena=${e.escena} giro=${e.angulo?.toFixed(0)}`);
    verificarReposo(e, `bajando fling ${intentos}`);
    if (y - antes < 20 && y < maximo - 4) {
      fallos.push(`atasco: el fling ${intentos} no movio el scroll (y=${y}, maximo ${maximo})`);
      break;
    }
  }
  fallos.push(...analizar(await tomarMuestras(page), "bajando", "bajada con flings"));

  // ---- llegar al borde de cada seccion con arrastres lentos (de abajo hacia arriba y regreso) ----
  const llegar = async (destino, etiqueta, fin) => {
    for (let i = 0; i < 30; i++) {
      const actual = await ySuelta(page);
      const falta = destino - actual;
      if (Math.abs(falta) <= 40) break;
      await arrastreLento(cdp, { x, y: Math.round(alto * 0.5), distancia: Math.max(-alto * 0.4, Math.min(alto * 0.4, falta)) });
      await esperarQuietud(page, 250);
    }
    const e = await reposo(page, leerEstado, { ms: 600 });
    v(`llegada ${etiqueta} (${fin}): y=${e.y} escena=${e.escena} giro=${e.angulo?.toFixed(0)}`);
    const frente = Math.min(e.angulo, 360 - e.angulo);
    const s = leida(secciones, e.y + alto * 0.25, alto); // con el borde arriba, la seccion es la que empieza ahi
    const permit = permitidas[etiqueta] ?? [];
    const ok = permit.includes(e.escena) && frente <= 8;
    informe_actual.llegadas.push({ etiqueta, sentido: fin, destino, y: e.y, escena: e.escena, angulo: Math.round(e.angulo), ok });
    if (!permit.includes(e.escena)) fallos.push(`llegada (${fin}) a "${etiqueta}": telefono en "${e.escena}", se esperaba ${permit.join("/")}`);
    else if (frente > 8) fallos.push(`llegada (${fin}) a "${etiqueta}": el telefono quedo a ${e.angulo.toFixed(0)} grados, no de frente`);
    void s;
  };

  await page.evaluate(SAMPLER);
  for (const s of [...secciones].reverse().filter((s) => s.id !== "privacidad")) await llegar(Math.min(s.top, maximo), s.id, "subiendo");
  fallos.push(...analizar(await tomarMuestras(page), "subiendo", "subida por secciones"));

  await page.evaluate(SAMPLER);
  for (const s of secciones.filter((s) => s.id !== "hero" && s.id !== "privacidad")) await llegar(Math.min(s.top, maximo), s.id, "bajando");
  fallos.push(...analizar(await tomarMuestras(page), "bajando", "bajada por secciones"));

  // ---- regresar arriba con flings hacia arriba ----
  await page.evaluate(SAMPLER);
  y = await ySuelta(page);
  intentos = 0;
  while (y > 4 && intentos++ < 80) {
    const antes = y;
    await flick(cdp, { x, y0: Math.round(alto * 0.25), distancia: -Math.round(alto * (0.3 + 0.1 * (intentos % 3))), duracionMs: 100 });
    informe_actual.flicks++;
    await esperarQuietud(page);
    const e = await reposo(page, leerEstado, { ms: 500 });
    y = e.y;
    v(`subiendo ${intentos}: y=${e.y} escena=${e.escena} giro=${e.angulo?.toFixed(0)}`);
    verificarReposo(e, `subiendo fling ${intentos}`);
    if (antes - y < 20 && y > 4) {
      fallos.push(`atasco subiendo: el fling ${intentos} no movio el scroll (y=${y})`);
      break;
    }
  }
  fallos.push(...analizar(await tomarMuestras(page), "subiendo", "subida con flings"));
  const fin = await reposo(page, leerEstado, { ms: 800 });
  const frente = Math.min(fin.angulo, 360 - fin.angulo);
  if (fin.y > 4 || fin.escena !== "splash" || frente > 3) fallos.push(`regreso arriba: y=${fin.y}, escena=${fin.escena}, giro=${fin.angulo?.toFixed(1)} (se esperaba 0, splash, de frente)`);
  await page.screenshot({ path: path.join(salida, `tactil-${tag}-regreso-arriba.png`) });

  const video = a["sin-video"] ? null : page.video();
  await ctx.close();
  if (video) {
    const destino = path.join(salida, `tactil-${tag}.webm`);
    await video.saveAs(destino);
    await video.delete();
    fs.rmSync(dirVideo, { recursive: true, force: true });
    informe_actual.video = destino;
  }
  informe_actual.fallos = fallos;
  informe.dispositivos.push(informe_actual);
  for (const f of fallos) problemas.push(`[${nombre}] ${f}`);
}

try {
  for (const n of nombres) {
    process.stdout.write(`> ${n} ... `);
    const t0 = Date.now();
    await probar(n);
    console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s, ${informe_actual.flicks} flings, ${informe_actual.fallos.length} fallos`);
  }
} catch (e) {
  console.error("tactil: error de ejecucion:", e);
  problemas.push(`excepcion: ${e?.message ?? e}`);
} finally {
  await navegador.close();
  await srv.cerrar();
}
for (const f of guardia.fallas) problemas.push(`[${f.tipo}] ${f.detalle} (${f.contexto})`);
informe.problemas = problemas;
fs.writeFileSync(path.join(salida, "informe-tactil.json"), JSON.stringify(informe, null, 2));
if (problemas.length) {
  console.error(`\nFALLAS (${problemas.length}):`);
  for (const p of problemas) console.error("  " + p.slice(0, 400));
  process.exit(1);
}
console.log("Prueba tactil sin fallos. Informe y videos en " + salida);
