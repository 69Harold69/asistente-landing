#!/usr/bin/env node
/*
  movil-iman: el imán de lectura en móvil (#122, `assets/js/iman.js` + bloque «Imán de lectura» de base.css).

  Gestos táctiles reales por CDP (`Input.dispatchTouchEvent` con marca de tiempo por cuadro de 16 ms; Chromium con
  `--touch-events=enabled`, sin eso no hay inercia en headless). «Suave» = arrastre lento que se detiene antes de
  soltar (sin inercia); «fuerte» = latigazo de 400 px en 96 ms (inercia larga; la velocidad de soltado que calcula Chromium de un gesto sintético varía
  entre corridas, así que se intenta dos veces y falla solo si ninguna pasa de largo). Afirma, por tamaño:
    (a) sin retención: ninguna sección con `data-retencion`, `--ret-*` ni animación ligada al scroll;
    (b) con imán: `data-iman` en <html>, un ancla por fase (6) y cada ancla deja la tarjeta bajo la franja
        (borde de arriba a ≤ 8 px del final del degradado) y, si cabe, entera sobre el borde inferior;
    (c) gesto suave que termina cerca de la fase siguiente (a 190 px de su punto, dentro del rango de proximidad):
        el scroll termina EXACTO (± 2 px) en el punto de esa fase. En cada fase;
    (d) gesto suave que SALE de una fase (arrastre de 250 px): se queda donde lo dejó el dedo, no vuelve (el imán
        atrapa al llegar, nunca al salir). También dentro de la tarjeta alta del chat (arrastre de 40 px);
    (e) gesto fuerte desde Elementos: pasa de largo al menos dos fases (termina más allá del punto de Avisos − rango);
    (f) fuera del recorrido (hero, «Cómo funciona», preguntas, pie) un arrastre suave termina donde lo dejó el dedo;
    (g) hash a una fase deja la tarjeta en su punto; el punto «Inicio» de la navegación lleva a 0; teclado: Flecha
        abajo desde una fase avanza 40 px (no regresa), Fin y Inicio llegan a los extremos; 70 saltos de rueda de 60 px
        desde arriba pasan de Hábitos (la rueda no se queda pegada en ninguna fase);
    (h) con «reducir movimiento» no hay imán (sin `data-iman`): el arrastre suave cerca de una fase termina donde lo
        dejó el dedo, sin deslizamiento;
    (i) escritorio (1440×900, ratón): sin `data-iman`.
  Mutación (README de pruebas): sin `inicializarIman()` fallan (b) y (c); sin desarmar al empezar el gesto, falla (d);
  sin desarmar con rueda todas las anclas cuyo rango contiene la posición, falla la rueda de (g).

  Uso: node movil-iman.mjs [--tamanos 360x740,390x844,407x904] [--temas light,dark] [--video DIR] [--estricto]
*/
import { leerArgs, lanzarChromium, scriptInicial, esperarCarga, dormir, salir, crearGuardia, carpetaSalida } from "./lib/comun.mjs";
import { iniciarServidor } from "./lib/servidor.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node movil-iman.mjs [--tamanos 360x740,390x844,407x904] [--temas light,dark] [--video DIR]");
const tamanos = a.tamanos && a.tamanos !== true ? String(a.tamanos).split(",").map((s) => s.split("x").map(Number)) : [[360, 740], [390, 844], [407, 904]];
const temas = a.temas && a.temas !== true ? String(a.temas).split(",") : ["light"];
const dirVideo = a.video && a.video !== true ? carpetaSalida(a.video) : null;
const FASES = ["fase-chat", "fase-elementos", "fase-habitos", "fase-avisos", "fase-llamada", "cta"];
const TOL = 2;

const srv = await iniciarServidor();
const nav = await lanzarChromium({ args: ["--touch-events=enabled"] });
const guardia = crearGuardia(srv.url);
const fallas = [];
const filas = [];
const falla = (m) => fallas.push(m);

/** Gesto táctil: `dist` px (> 0 baja la página) en `ms`; `pausa` ms quieto antes de soltar (sin inercia). */
async function gesto(cdp, vp, { dist, ms, pausa = 0, x = null }) {
  const xx = x ?? Math.round(vp.width / 2);
  const y0 = Math.round(dist > 0 ? vp.height * 0.88 : vp.height * 0.5);
  const pasos = Math.max(3, Math.round(ms / 16));
  let ts = Date.now() / 1000;
  const t = (type, yy) => cdp.send("Input.dispatchTouchEvent", { type, timestamp: ts, touchPoints: type === "touchEnd" ? [] : [{ x: xx, y: Math.round(yy), id: 1 }] });
  await t("touchStart", y0);
  for (let i = 1; i <= pasos; i++) {
    ts += 0.016;
    await dormir(16);
    await t("touchMove", y0 - (dist * i) / pasos);
  }
  for (let k = 0; k < pausa / 16; k++) {
    ts += 0.016;
    await dormir(16);
    await t("touchMove", y0 - dist);
  }
  ts += 0.016;
  await dormir(16);
  await t("touchEnd", 0);
}
const suave = (dist) => ({ dist, ms: Math.max(320, Math.abs(dist) * 1.6), pausa: 200 });
const fuerte = { dist: 400, ms: 96 };

const leerY = (page) => page.evaluate(() => Math.round(scrollY));
async function quieto(page, { ms = 600, max = 8000 } = {}) {
  const t0 = Date.now();
  let p = await leerY(page);
  let desde = Date.now();
  while (Date.now() - t0 < max) {
    await dormir(80);
    const n = await leerY(page);
    if (n !== p) {
      p = n;
      desde = Date.now();
    } else if (Date.now() - desde >= ms) break;
  }
  return p;
}
async function ir(page, y) {
  await page.evaluate((y) => scrollTo({ top: y, behavior: "instant" }), y);
  return quieto(page, { ms: 400 });
}

/** Estado del imán: atributo, anclas (punto de scroll y fin del área) y geometría de la zona útil. */
const leerIman = () => {
  const st = document.getElementById("stage");
  const zonaTop = st.getBoundingClientRect().height + (parseFloat(getComputedStyle(st, "::after").height) || 0);
  const anclas = [...document.querySelectorAll(".iman")].map((e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    const p = r.top + scrollY - parseFloat(cs.scrollMarginTop);
    const alto = r.height + parseFloat(cs.scrollMarginTop) + parseFloat(cs.scrollMarginBottom);
    return { fase: e.dataset.fase, p: Math.round(p), fin: Math.round(p + Math.max(0, alto - innerHeight)), alinea: cs.scrollSnapAlign };
  });
  // Punto esperado de cada fase, calculado de la TARJETA (no del ancla): el scroll que deja su borde de arriba 4 px bajo
  // el degradado de la franja. `fin`: hasta dónde se lee una tarjeta más alta que la zona útil (su final a la vista).
  const topDoc = (el) => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };
  const puntos = {};
  for (const s of document.querySelectorAll(".secciones > .seccion")) {
    const h = [...s.children];
    const u = h[h.length - 1];
    const mb = document.documentElement.hasAttribute("data-vidrio") ? parseFloat(getComputedStyle(u).marginBottom) || 0 : 0;
    const bt = topDoc(h[0]);
    const bb = topDoc(u) + u.offsetHeight + mb;
    const p = Math.round(bt - zonaTop - 4);
    puntos[s.id] = { p, fin: Math.max(p, Math.round(bb + 16 - innerHeight)) };
  }
  const cf = document.getElementById("como-funciona");
  const pr = document.getElementById("preguntas");
  return {
    iman: document.documentElement.hasAttribute("data-iman"),
    snap: getComputedStyle(document.documentElement).scrollSnapType,
    anclas,
    puntos,
    zonaTop,
    vh: innerHeight,
    max: document.documentElement.scrollHeight - innerHeight,
    comoFunciona: cf ? Math.round(cf.getBoundingClientRect().top + scrollY) : null,
    preguntas: pr ? Math.round(pr.getBoundingClientRect().top + scrollY) : null,
    retencion: [...document.querySelectorAll(".secciones > .seccion")]
      .filter((s) => s.hasAttribute("data-retencion") || s.style.getPropertyValue("--ret-ini") || getComputedStyle(s).animationName !== "none")
      .map((s) => s.id),
  };
};

/** Tarjeta de una fase vista ahora: borde de arriba y de abajo (con el margen del vidrio) en px del viewport. */
const tarjeta = (id) => {
  const s = document.getElementById(id);
  const h = [...s.children];
  const u = h[h.length - 1];
  const mb = document.documentElement.hasAttribute("data-vidrio") ? parseFloat(getComputedStyle(u).marginBottom) || 0 : 0;
  return { top: h[0].getBoundingClientRect().top, bottom: u.getBoundingClientRect().bottom + mb };
};

async function nuevaPagina(opciones, etiqueta, { video = false } = {}) {
  const ctx = await nav.newContext({
    locale: "es-MX",
    ...opciones,
    ...(video && dirVideo ? { recordVideo: { dir: dirVideo, size: opciones.viewport } } : {}),
  });
  await ctx.addInitScript(scriptInicial({ tema: opciones.colorScheme ?? "light" }));
  const page = await ctx.newPage();
  guardia.instalar(page, etiqueta);
  await page.goto(srv.url + "/", { waitUntil: "load" });
  await esperarCarga(page, { portada: true });
  await dormir(500);
  return { ctx, page, cdp: await ctx.newCDPSession(page) };
}

for (const [w, h] of tamanos) {
  for (const tema of temas) {
    const etiqueta = `${w}×${h} ${tema}`;
    const vp = { width: w, height: h };
    const { ctx, page, cdp } = await nuevaPagina({ viewport: vp, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: tema }, etiqueta, { video: true });
    const e = await page.evaluate(leerIman);
    const rango = e.vh / 3;
    // (a)
    if (e.retencion.length) falla(`${etiqueta}: (a) retención en ${e.retencion.join(", ")}`);
    // (b)
    if (!e.iman || !/^y/.test(e.snap) || /mandatory/.test(e.snap)) falla(`${etiqueta}: (b) sin imán (data-iman=${e.iman}, scroll-snap-type=${e.snap})`);
    if (e.anclas.length !== FASES.length) falla(`${etiqueta}: (b) ${e.anclas.length} anclas, se esperaban ${FASES.length}`);
    const punto = e.puntos;
    for (const x of e.anclas) {
      if (Math.abs(x.p - punto[x.fase].p) > TOL) falla(`${etiqueta} ${x.fase}: (b) el ancla alinea en ${x.p} y la tarjeta pide ${punto[x.fase].p}`);
    }
    for (const id of FASES) {
      const x = punto[id];
      if (!x) continue;
      await ir(page, x.p);
      await dormir(1300); // la entrada de las piezas (revelar.js, 0.8 s + escalonado) termina quieta
      const t = await page.evaluate(tarjeta, id);
      const cabe = t.bottom - t.top <= e.vh - e.zonaTop - 4;
      const visible = Math.round(Math.min(t.bottom, e.vh) - Math.max(t.top, e.zonaTop));
      filas.push({ etiqueta, id, alto: Math.round(t.bottom - t.top), zona: Math.round(e.vh - e.zonaTop), visible, cabe, arriba: Math.round(t.top - e.zonaTop), abajo: Math.round(e.vh - t.bottom) });
      if (t.top < e.zonaTop - 1 || t.top > e.zonaTop + 8) falla(`${etiqueta} ${id}: (b) en el punto del imán la tarjeta empieza a ${Math.round(t.top - e.zonaTop)} px del final del degradado (0–8)`);
      if (cabe && t.bottom > e.vh) falla(`${etiqueta} ${id}: (b) cabe y aun así se corta abajo (${Math.round(t.bottom)} > ${e.vh})`);
    }
    // (c) suave hacia cada fase: desde 190 + 260 px antes de su punto, arrastre lento de 260 px.
    for (const id of FASES) {
      const x = punto[id];
      if (!x) continue;
      const desde = await ir(page, x.p - 190 - 260);
      await gesto(cdp, vp, suave(260));
      const fin = await quieto(page);
      if (Math.abs(fin - x.p) > TOL) falla(`${etiqueta} ${id}: (c) gesto suave desde ${desde} (llega a ~${x.p - 190}) terminó en ${fin}, el punto es ${x.p}`);
    }
    // (d) salir de una fase con un arrastre suave: no regresa.
    for (const id of ["fase-elementos", "fase-habitos", "fase-llamada"]) {
      const x = punto[id];
      if (!x) continue;
      const desde = await ir(page, x.p);
      await gesto(cdp, vp, suave(250));
      const fin = await quieto(page);
      if (fin - desde < 200) falla(`${etiqueta} ${id}: (d) al salir con un arrastre suave de 250 px el scroll volvió (${desde} → ${fin})`);
    }
    if (punto["fase-chat"] && punto["fase-chat"].fin > punto["fase-chat"].p + 20) {
      const desde = await ir(page, punto["fase-chat"].p);
      await gesto(cdp, vp, suave(40));
      const fin = await quieto(page);
      if (fin - desde < 20) falla(`${etiqueta}: (d) dentro de la tarjeta del chat (más alta que la pantalla) el arrastre de 40 px volvió (${desde} → ${fin})`);
    }
    // (e) fuerte: pasa de largo más de una fase.
    {
      let desde = 0;
      let fin = 0;
      for (let intento = 0; intento < 2; intento++) {
        desde = await ir(page, punto["fase-elementos"].p);
        await gesto(cdp, vp, fuerte);
        fin = await quieto(page);
        if (fin >= punto["fase-avisos"].p - rango) break;
      }
      if (fin < punto["fase-avisos"].p - rango) falla(`${etiqueta}: (e) el gesto fuerte desde Elementos (${desde}) terminó en ${fin}; no pasó de Hábitos (Avisos en ${punto["fase-avisos"].p})`);
      filas.push({ etiqueta, id: "fuerte", desde, fin });
    }
    // (f) fuera del recorrido: hero, cómo funciona, preguntas y pie.
    for (const [nombre, y] of [["hero", 0], ["como-funciona", e.comoFunciona + 40], ["preguntas", e.preguntas + 40], ["pie", e.max - 400]]) {
      if (y === null) continue;
      const desde = await ir(page, y);
      await gesto(cdp, vp, suave(180));
      const fin = await quieto(page);
      const esperado = Math.min(e.max, desde + 180);
      if (Math.abs(fin - esperado) > 30) falla(`${etiqueta}: (f) en ${nombre} el arrastre suave de 180 px desde ${desde} terminó en ${fin} (se esperaba ~${esperado}: sin imán)`);
    }
    // (g) hash, «Inicio» y teclado.
    for (const id of ["fase-avisos", "cta"]) {
      await ir(page, 0);
      await page.evaluate((id) => { location.hash = id; }, id);
      const fin = await quieto(page);
      if (Math.abs(fin - punto[id].p) > TOL) falla(`${etiqueta}: (g) el hash #${id} dejó el scroll en ${fin}; el punto es ${punto[id].p}`);
    }
    {
      await ir(page, punto["fase-llamada"].p);
      // Los puntos de la navegación se ocultan en móvil: se usa su manejador de clic (el mismo de escritorio).
      await page.evaluate(() => document.querySelector('.nav-recorrido a[href="#hero"]').click());
      const fin = await quieto(page);
      if (fin !== 0) falla(`${etiqueta}: (g) el punto «Inicio» dejó el scroll en ${fin}`);
      await page.evaluate(() => document.querySelector('.nav-recorrido a[href="#fase-habitos"]').click());
      const fin2 = await quieto(page);
      if (Math.abs(fin2 - punto["fase-habitos"].p) > TOL) falla(`${etiqueta}: (g) el punto de Hábitos dejó el scroll en ${fin2}; el punto es ${punto["fase-habitos"].p}`);
    }
    {
      const desde = await ir(page, punto["fase-elementos"].p);
      await page.keyboard.press("ArrowDown");
      const fin = await quieto(page);
      if (fin - desde < 30) falla(`${etiqueta}: (g) Flecha abajo desde Elementos: ${desde} → ${fin} (el imán no debe regresarlo)`);
      await page.keyboard.press("End");
      const finEnd = await quieto(page);
      if (Math.abs(finEnd - e.max) > 2) falla(`${etiqueta}: (g) Fin dejó el scroll en ${finEnd} (máximo ${e.max})`);
      await page.keyboard.press("Home");
      const finHome = await quieto(page);
      if (finHome !== 0) falla(`${etiqueta}: (g) Inicio (tecla) dejó el scroll en ${finHome}`);
    }
    // (g) rueda (ratón en un equipo táctil): avanza a saltos de 60 px sin quedarse pegada en ninguna fase.
    {
      await ir(page, 0);
      await page.mouse.move(Math.round(w / 2), Math.round(h * 0.7));
      for (let i = 0; i < 70; i++) {
        await page.mouse.wheel(0, 60);
        await dormir(35);
      }
      const fin = await quieto(page);
      if (fin < punto["fase-habitos"].p + 200) falla(`${etiqueta}: (g) 70 saltos de rueda de 60 px desde arriba solo llegaron a ${fin} (Hábitos está en ${punto["fase-habitos"].p}): la rueda se queda pegada en una fase`);
    }
    await ctx.close();
  }
}

// (h) reducir movimiento: sin imán.
for (const [w, h] of [tamanos[tamanos.length - 1]]) {
  const etiqueta = `${w}×${h} reducir movimiento`;
  const vp = { width: w, height: h };
  const { ctx, page, cdp } = await nuevaPagina({ viewport: vp, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: "reduce" }, etiqueta);
  const e = await page.evaluate(leerIman);
  if (e.iman || e.snap !== "none") falla(`${etiqueta}: (h) hay imán con «reducir movimiento» (data-iman=${e.iman}, ${e.snap})`);
  const p = e.puntos["fase-elementos"].p;
  const desde = await ir(page, p - 450);
  await gesto(cdp, vp, suave(260));
  const fin = await quieto(page);
  if (Math.abs(fin - (desde + 260)) > 30) falla(`${etiqueta}: (h) el arrastre suave cerca de Elementos terminó en ${fin} (se esperaba ~${desde + 260}, sin deslizamiento)`);
  await ctx.close();
}

// (i) escritorio: sin imán.
{
  const etiqueta = "1440×900 escritorio";
  const { ctx, page } = await nuevaPagina({ viewport: { width: 1440, height: 900 } }, etiqueta);
  const e = await page.evaluate(leerIman);
  if (e.iman || e.snap !== "none") falla(`${etiqueta}: (i) hay imán en escritorio (data-iman=${e.iman}, ${e.snap})`);
  await ctx.close();
}

await nav.close();
await srv.cerrar();

console.log("tamaño            fase            alto  zona  visible  cabe  arriba  abajo");
for (const f of filas.filter((x) => x.alto !== undefined)) {
  console.log(`${f.etiqueta.padEnd(17)} ${f.id.padEnd(14)} ${String(f.alto).padStart(5)} ${String(f.zona).padStart(5)} ${String(f.visible).padStart(8)}  ${f.cabe ? "sí " : "no "} ${String(f.arriba).padStart(6)} ${String(f.abajo).padStart(6)}`);
}
for (const f of filas.filter((x) => x.id === "fuerte")) console.log(`${f.etiqueta}: gesto fuerte desde Elementos ${f.desde} → ${f.fin}`);
for (const f of guardia.fallas) fallas.push(`${f.contexto}: ${f.tipo} ${f.detalle}`);
if (dirVideo) console.log(`\nvideos en ${dirVideo}`);
if (fallas.length) {
  console.log(`\nFALLA: ${fallas.length} hallazgo(s)`);
  for (const x of fallas) console.log(" -", x);
  process.exit(1);
}
console.log("\nmovil-iman: el imán atrapa al llegar a cada fase, no al salir, deja pasar el gesto fuerte y no actúa fuera del recorrido");
