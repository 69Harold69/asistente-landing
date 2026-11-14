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
    (d) remate en la dirección del gesto (segunda ronda): un arrastre suave de 250 px hacia abajo desde una fase termina
        en el punto de la SIGUIENTE; hacia arriba, en el de la ANTERIOR (o al final de su tarjeta si es alta); un roce
        de 10 px se queda en su fase. Dentro de la zona de lectura del chat (tarjeta más alta que la pantalla) un
        arrastre corto se queda donde lo dejó el dedo; pasada su última línea, jala a Elementos;
    (e) gesto fuerte desde Elementos: pasa de largo al menos dos fases y, después de la inercia, reposa en un punto;
    (j) reposo: tras arrastres suaves de ±200 px desde 10 posiciones repartidas por el recorrido, el reposo es siempre el
        punto de una fase o la zona de lectura de chat/«Tu día»; y la dirección se respeta (bajando, nunca termina
        arriba de donde soltó; subiendo, nunca abajo);
    (k) tocar durante el jalón lo cancela: con el dedo quieto en la pantalla el scroll no se mueve, y al soltar sin
        arrastrar se queda donde se detuvo;
    (l) sin encadenar: un gesto produce un solo jalón (se cuentan las veces que aparece `data-iman-jalando`) y, al
        terminar, el scroll queda quieto 1.5 s;
    (n) el jalón (de que aparece a que se quita `data-iman-jalando`) dura al menos 800 ms;
    (m) salida libre: subir 250 px desde el chat (al hero) y bajar 250 px desde el final de «Tu día» (a la parte
        final) termina donde lo dejó el dedo;
    (f) fuera del recorrido (hero, «Cómo funciona», preguntas, pie) un arrastre suave termina donde lo dejó el dedo;
    (g) hash a una fase deja la tarjeta en su punto; el punto «Inicio» de la navegación lleva a 0; teclado: Flecha
        abajo desde una fase avanza 40 px (no regresa), Fin y Inicio llegan a los extremos; 70 saltos de rueda de 60 px
        desde arriba pasan de Hábitos (la rueda no se queda pegada en ninguna fase);
    (h) con «reducir movimiento» no hay imán (sin `data-iman`): el arrastre suave cerca de una fase termina donde lo
        dejó el dedo, sin deslizamiento;
    (i) escritorio (1440×900, ratón): sin `data-iman`.
  Mutación (README de pruebas): sin `inicializarIman()` fallan (b) y (c); sin desarmar al empezar el gesto, falla (d);
  sin desarmar con rueda todas las anclas cuyo rango contiene la posición, falla la rueda de (g); sin el remate
  fallan (d) y (j); con el remate hacia la fase más cercana en vez de la de la dirección, falla (d); sin cancelar al
  tocar, falla (k); con el jalón de 400–600 ms de la segunda ronda, falla (n).

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
    const lista = FASES.map((id) => punto[id]).filter(Boolean);
    /** ¿Es `y` un reposo válido? Punto de una fase, zona de lectura de una tarjeta alta, o fuera del recorrido. */
    const valido = (y) =>
      y < lista[0].p - TOL || y > lista[lista.length - 1].fin + TOL || lista.some((q) => y >= q.p - TOL && y <= q.fin + TOL);
    // (d) remate en la dirección del gesto.
    for (const [i, id] of FASES.entries()) {
      const x = punto[id];
      const sig = punto[FASES[i + 1]];
      const ant = punto[FASES[i - 1]];
      if (!x) continue;
      if (sig && x.fin === x.p) {
        await ir(page, x.p);
        await gesto(cdp, vp, suave(250));
        const fin = await quieto(page);
        if (Math.abs(fin - sig.p) > TOL) falla(`${etiqueta} ${id}: (d) arrastre suave de 250 px hacia abajo terminó en ${fin}; la fase siguiente está en ${sig.p}`);
      }
      if (ant && x.fin === x.p) {
        await ir(page, x.p);
        await gesto(cdp, vp, suave(-250));
        const fin = await quieto(page);
        if (Math.abs(fin - ant.fin) > TOL) falla(`${etiqueta} ${id}: (d) arrastre suave de 250 px hacia arriba terminó en ${fin}; la fase anterior reposa en ${ant.fin}`);
      }
    }
    {
      const x = punto["fase-elementos"];
      const desde = await ir(page, x.p);
      await gesto(cdp, vp, suave(10));
      const fin = await quieto(page);
      if (Math.abs(fin - desde) > TOL) falla(`${etiqueta}: (d) un roce de 10 px en Elementos movió el scroll a ${fin} (estaba en ${desde})`);
    }
    {
      const c = punto["fase-chat"];
      const zona = c.fin - c.p;
      if (zona > 30) {
        const d = Math.min(40, zona - 15);
        const desde = await ir(page, c.p);
        await gesto(cdp, vp, suave(d));
        const fin = await quieto(page);
        if (fin < desde + d - 20 || fin > c.fin + TOL) falla(`${etiqueta}: (d) dentro de la zona de lectura del chat (${c.p}–${c.fin}) el arrastre de ${d} px terminó en ${fin}`);
      }
      await ir(page, c.p);
      await gesto(cdp, vp, suave(zona + 140));
      const fin = await quieto(page);
      if (Math.abs(fin - punto["fase-elementos"].p) > TOL) falla(`${etiqueta}: (d) pasada la última línea del chat, el arrastre terminó en ${fin}; Elementos está en ${punto["fase-elementos"].p}`);
    }
    // (e) fuerte: pasa de largo más de una fase y reposa en un punto.
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
      if (!valido(fin)) falla(`${etiqueta}: (e) después del gesto fuerte el scroll reposa en ${fin}, entre dos fases`);
      filas.push({ etiqueta, id: "fuerte", desde, fin });
    }
    // (j) reposo y dirección tras arrastres suaves desde posiciones repartidas.
    {
      const ini = lista[0].p;
      const fin0 = lista[lista.length - 1].fin;
      for (let k = 1; k <= 10; k++) {
        const y0 = Math.round(ini + ((fin0 - ini) * k) / 11);
        for (const dist of [200, -200]) {
          await ir(page, y0);
          const antes = await leerY(page);
          await gesto(cdp, vp, suave(dist));
          const suelta = antes + dist;
          const fin = await quieto(page);
          if (!valido(fin)) falla(`${etiqueta}: (j) arrastre de ${dist} px desde ${antes} reposa en ${fin}, entre dos fases`);
          if (fin >= lista[0].p - TOL && fin <= fin0 + TOL) {
            if (dist > 0 && fin < suelta - 40) falla(`${etiqueta}: (j) bajando desde ${antes} el remate subió (${suelta} → ${fin})`);
            if (dist < 0 && fin > suelta + 40) falla(`${etiqueta}: (j) subiendo desde ${antes} el remate bajó (${suelta} → ${fin})`);
          }
        }
      }
    }
    // (k) tocar durante el jalón lo cancela; (l) un gesto, un jalón, y quieto al terminar.
    {
      await page.evaluate(() => {
        window.__jalones = 0;
        window.__duraciones = [];
        let t0 = 0;
        new MutationObserver(() => {
          if (document.documentElement.hasAttribute("data-iman-jalando")) {
            window.__jalones++;
            t0 = performance.now();
          } else if (t0) {
            window.__duraciones.push(performance.now() - t0);
            t0 = 0;
          }
        }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-iman-jalando"] });
      });
      const x = punto["fase-habitos"];
      await ir(page, x.p);
      await page.evaluate(() => { window.__jalones = 0; });
      await gesto(cdp, vp, suave(250));
      // Espera a que el jalón esté en marcha y lo detiene con un toque sostenido.
      const t0 = Date.now();
      while (Date.now() - t0 < 2000 && !(await page.evaluate(() => document.documentElement.hasAttribute("data-iman-jalando")))) await dormir(10);
      await dormir(120);
      const xx = Math.round(w / 2);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: xx, y: Math.round(h * 0.6), id: 1 }] });
      const alTocar = await leerY(page);
      await dormir(700);
      const conDedo = await leerY(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await dormir(1200);
      const soltado = await leerY(page);
      if (Math.abs(conDedo - alTocar) > 2) falla(`${etiqueta}: (k) con el dedo en la pantalla el scroll siguió moviéndose (${alTocar} → ${conDedo})`);
      if (Math.abs(soltado - conDedo) > 2) falla(`${etiqueta}: (k) al soltar sin arrastrar, el jalón cancelado se reanudó (${conDedo} → ${soltado})`);
      if (Math.abs(alTocar - punto["fase-avisos"].p) < 10) falla(`${etiqueta}: (k) el jalón no se canceló: llegó a Avisos (${alTocar})`);
      // (l): un gesto desde Hábitos, un solo jalón; quieto después.
      await ir(page, x.p);
      await page.evaluate(() => { window.__jalones = 0; });
      await gesto(cdp, vp, suave(250));
      const llego = await quieto(page);
      await dormir(1500);
      const despues = await leerY(page);
      const n = await page.evaluate(() => window.__jalones);
      if (n !== 1) falla(`${etiqueta}: (l) un gesto produjo ${n} jalones (se esperaba 1)`);
      // (n) el jalón dura al menos ~800 ms (tercera ronda: a 400–600 ms el teléfono giraba demasiado rápido).
      const dur = await page.evaluate(() => window.__duraciones.at(-1) ?? 0);
      if (dur < 780) falla(`${etiqueta}: (n) el jalón de Hábitos a Avisos duró ${Math.round(dur)} ms (mínimo 800)`);
      filas.push({ etiqueta, id: "jalon", dur: Math.round(dur) });
      if (despues !== llego) falla(`${etiqueta}: (l) después del jalón el scroll se movió solo (${llego} → ${despues})`);
    }
    // (m) salida libre del recorrido por arriba y por abajo.
    {
      const c = punto["fase-chat"];
      const desde = await ir(page, c.p);
      await gesto(cdp, vp, suave(-250));
      const fin = await quieto(page);
      if (Math.abs(fin - (desde - 250)) > 30) falla(`${etiqueta}: (m) subir 250 px desde el chat (salir al hero) terminó en ${fin}, se esperaba ~${desde - 250}`);
      const t = punto.cta;
      const desde2 = await ir(page, t.fin);
      await gesto(cdp, vp, suave(250));
      const fin2 = await quieto(page);
      if (Math.abs(fin2 - (desde2 + 250)) > 30) falla(`${etiqueta}: (m) bajar 250 px desde el final de «Tu día» terminó en ${fin2}, se esperaba ~${desde2 + 250}`);
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
for (const f of filas.filter((x) => x.id === "jalon")) console.log(`${f.etiqueta}: jalón de Hábitos a Avisos ${f.dur} ms`);
for (const f of filas.filter((x) => x.id === "fuerte")) console.log(`${f.etiqueta}: gesto fuerte desde Elementos ${f.desde} → ${f.fin}`);
for (const f of guardia.fallas) fallas.push(`${f.contexto}: ${f.tipo} ${f.detalle}`);
if (dirVideo) console.log(`\nvideos en ${dirVideo}`);
if (fallas.length) {
  console.log(`\nFALLA: ${fallas.length} hallazgo(s)`);
  for (const x of fallas) console.log(" -", x);
  process.exit(1);
}
console.log("\nmovil-iman: el imán atrapa al llegar a cada fase, no al salir, deja pasar el gesto fuerte y no actúa fuera del recorrido");
