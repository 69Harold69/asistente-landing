#!/usr/bin/env node
/*
  movil-lectura: en móvil, el texto de cada fase se alcanza a leer antes de que el teléfono empiece a girar
  hacia la fase siguiente.

  Qué mide, por fase del recorrido (`.secciones > .seccion`), tamaño y tema (táctil, DPR 3):
    - la «zona útil de lectura»: del borde inferior de la franja del teléfono (`#stage`) más su degradado
      (`.stage::after`, 2.5rem) al borde inferior del alto visible (`innerHeight`);
    - el BLOQUE de texto completo de la fase: del borde superior del primer elemento (kicker) al borde inferior del
      último (párrafos, chips o CTA; con vidrio, más el margen inferior = el borde de la tarjeta);
    - `giro`: el scroll en el que el teléfono empieza a girar hacia la fase siguiente. Se OBSERVA, no se calcula:
      se recorre el scroll en pasos y se lee `yaruki:estado` (`enGiro`), y se afina cada arranque a 1 px por
      bisección. Así mide igual la versión publicada que la corregida;
    - `entero`: px de scroll en los que el bloque ENTERO está en la zona útil antes de ese giro
      (y ∈ [bb − vh, bt − zonaTop], recortado en `giro`);
    - `ultima`: px de scroll entre el momento en que la última línea queda visible con 1.5rem de margen sobre el
      borde inferior y el arranque del giro (puede ser negativo: el giro empieza antes de verla).

  Qué afirma (salvo `--solo-medir`):
    (o)   Sin retención: ninguna sección lleva `data-retencion` ni una animación ligada al scroll (se quitó en #122 por
          sentirse como un tropezón; la reemplaza el imán, que prueba `movil-iman.mjs`).
    (i)   Si el bloque cabe en la zona útil: `entero` ≥ lo que cabe de hecho (zonaAlto − H − 1.5rem, menos 12 px de
          paso de muestreo) y `ultima` ≥ 25 % del alto visible. Un bloque de 400 px en una zona de 430 px se mueve 1:1
          con el scroll: «entero» dura lo que sobra de zona; el tramo cómodo de lectura lo da el imán, que lo deja quieto.
    (ii)  Si no cabe: el giro no empieza antes de que la última línea haya sido visible (`ultima` ≥ 25 % del alto).
    (iii) Nada del bloque se ve debajo del teléfono: con el bloque dentro de la zona útil, el elemento que está
          en el centro del primer y del último elemento es del propio bloque, no de la franja.
    (iv)  El recorrido total no crece de forma absurda (el límite es `--max-crece`, 1.35 veces la longitud del
          scroll de la versión base si se pasa `--base-json`; sin base solo se reporta).
  Las mediciones recorren el scroll con `scrollTo`, así que el imán (snap) se apaga en la página medida
  (`scroll-snap-type: none` en línea sobre <html>): si no, cada `scrollTo` cerca de una fase caería en el ancla.
  El cierre (`#cta`) no tiene fase siguiente: solo se afirma que el bloque queda entero en la zona útil si cabe.

  Tamaños: 360×740, 390×844 y 407×904, cada uno también «con barras» de Chrome (≈128 px menos de alto).
  Ojo: Playwright no emula las barras que se esconden al hacer scroll; el alto «con barras» es otro viewport.

  Uso: node movil-lectura.mjs [--tamanos 360x740,390x844,407x904] [--barras 128] [--temas light,dark]
       [--fases hero,...] [--q "vidrio=1&..."] [--json salida.json] [--base-json base.json] [--solo-medir]
  `YARUKI_RAIZ=/ruta/a/otra/copia` mide otra versión del sitio (producción, main…).
*/
import fs from "node:fs";
import { leerArgs, lanzarChromium, scriptInicial, esperarCarga, dormir, salir } from "./lib/comun.mjs";
import { iniciarServidor } from "./lib/servidor.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node movil-lectura.mjs [--tamanos 360x740,390x844,407x904] [--barras 128] [--temas light,dark] [--q ...] [--json f] [--base-json f] [--solo-medir]");

const BASE = [[360, 740], [390, 844], [407, 904]];
const tamanos = (a.tamanos && a.tamanos !== true ? String(a.tamanos).split(",").map((s) => s.split("x").map(Number)) : BASE);
const barras = a.barras && a.barras !== true ? Number(a.barras) : 128;
const temas = a.temas && a.temas !== true ? String(a.temas).split(",") : ["light", "dark"];
const consulta = a.q && a.q !== true ? String(a.q) : "vidrio=1&vidrio-desenfoque=2&vidrio-relleno=0.10";
const maxCrece = a["max-crece"] && a["max-crece"] !== true ? Number(a["max-crece"]) : 1.35;
const soloMedir = !!a["solo-medir"];
const DWELL = 0.25;
const MARGEN_PX = 24; // 1.5rem
const FASES = ["fase-chat", "fase-elementos", "fase-habitos", "fase-avisos", "fase-llamada", "cta"];

const srv = await iniciarServidor();
const nav = await lanzarChromium();
const filas = [];
const fallas = [];

/** Medidas estáticas del DOM (coordenadas de documento por la cadena de offsetTop: ignoran los `transform` de los reveals). */
const medirDom = (ids) => {
  const topDoc = (el) => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };
  const stage = document.getElementById("stage");
  const sr = stage.getBoundingClientRect();
  const grad = parseFloat(getComputedStyle(stage, "::after").height) || 0;
  const vidrio = document.documentElement.hasAttribute("data-vidrio");
  const bloques = {};
  for (const id of ids) {
    const sec = document.getElementById(id);
    if (!sec) continue;
    const hijos = [...sec.children];
    const primero = hijos[0];
    const ultimo = hijos[hijos.length - 1];
    const bt = topDoc(primero);
    let bb = topDoc(ultimo) + ultimo.offsetHeight;
    if (vidrio) bb += parseFloat(getComputedStyle(ultimo).marginBottom) || 0;
    bloques[id] = { bt, bb, top: topDoc(sec), alto: sec.offsetHeight, texto: primero.textContent.trim().slice(0, 24) };
  }
  return { franja: sr.height, grad, vh: innerHeight, vidrio, bloques, total: document.documentElement.scrollHeight, fuentes: document.fonts.status };
};

/** Recorre el scroll y devuelve el arranque (y) de cada giro, en orden. Afina cada uno a 1 px. */
const recorrerGiros = async (page) => {
  return page.evaluate(async () => {
    const siguiente = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    const tel = document.getElementById("telefono");
    let ult = null;
    tel.addEventListener("yaruki:estado", (ev) => { ult = ev.detail; });
    const enGiroEn = async (y) => { scrollTo(0, y); await siguiente(); return !!ult?.enGiro && ult.y !== undefined; };
    const max = document.documentElement.scrollHeight - innerHeight;
    const paso = 40;
    const runs = [];
    let dentro = false;
    let prevY = 0;
    for (let y = 0; y <= max + paso; y += paso) {
      const yy = Math.min(y, max);
      const g = await enGiroEn(yy);
      if (g && !dentro) runs.push({ gruesoIni: prevY, gruesoY: yy });
      if (!g && dentro) runs[runs.length - 1].gruesoFin = yy;
      dentro = g;
      prevY = yy;
      if (yy === max) break;
    }
    // Bisección del arranque de cada giro: el último y sin giro y el primero con giro.
    for (const r of runs) {
      let lo = r.gruesoIni, hi = r.gruesoY;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (await enGiroEn(mid)) hi = mid; else lo = mid;
      }
      r.ini = hi;
    }
    scrollTo(0, 0);
    return runs.map((r) => r.ini);
  });
};

for (const [w, h0] of tamanos) {
  for (const conBarras of [false, true]) {
    const h = conBarras ? h0 - barras : h0;
    for (const tema of temas) {
      const etiqueta = `${w}×${h}${conBarras ? " (barras)" : ""} ${tema}`;
      const ctx = await nav.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: tema, locale: "es-MX" });
      await ctx.addInitScript(scriptInicial({ tema }));
      const page = await ctx.newPage();
      await page.goto(srv.url + "/", { waitUntil: "load" });
      if (!(await page.evaluate(() => document.documentElement.hasAttribute("data-vidrio")))) {
        // Sin el vidrio como defecto (esta base), se mide con los valores aprobados; no importa si la versión ni lo conoce.
        await page.goto(srv.url + "/?" + consulta, { waitUntil: "load" });
      }
      await esperarCarga(page, { portada: true });
      await dormir(600);
      // (o) sin retención; y el imán apagado para medir posiciones arbitrarias con scrollTo.
      const retencion = await page.evaluate(() => {
        document.documentElement.style.setProperty("scroll-snap-type", "none");
        return [...document.querySelectorAll(".secciones > .seccion")]
          .filter((s) => s.hasAttribute("data-retencion") || s.style.getPropertyValue("--ret-ini") || getComputedStyle(s).animationName !== "none")
          .map((s) => s.id);
      });
      if (retencion.length) fallas.push(`${etiqueta}: (o) quedan secciones con retención o animación ligada al scroll: ${retencion.join(", ")}`);
      const dom = await page.evaluate(medirDom, FASES);
      const giros = await recorrerGiros(page);
      if (giros.length !== FASES.length) fallas.push(`${etiqueta}: se esperaban ${FASES.length} giros y se observaron ${giros.length} (${giros.join(", ")})`);
      const zonaTop = dom.franja + dom.grad;
      const zonaAlto = dom.vh - zonaTop;
      const vh = dom.vh;
      for (let i = 0; i < FASES.length; i++) {
        const id = FASES[i];
        const b = dom.bloques[id];
        if (!b) continue;
        const H = b.bb - b.bt;
        const giroSig = i + 1 < FASES.length ? giros[i + 1] : null; // el giro i+1 es la salida de la fase i
        const cabe = H <= zonaAlto - MARGEN_PX;
        const desde = b.bb - (vh - MARGEN_PX);   // y a partir del cual el bloque termina por abajo dentro del alto visible (con margen)
        const hasta = b.bt - zonaTop;            // y hasta el cual el bloque empieza por debajo de la zona útil
        const limite = giroSig ?? Infinity;
        // «Entero»: se mide de verdad, rectángulo en mano: cada 10 px de scroll, hasta el arranque del giro, cuenta si el
        // primer y el último elemento (con el margen de la tarjeta) caben entre la zona útil y el borde inferior.
        const entero = cabe
          ? await page.evaluate(async ({ id, desde, hasta, zonaTop, vh, margen }) => {
              const paso = 10;
              const sec = document.getElementById(id);
              const hijos = [...sec.children];
              const mb = document.documentElement.hasAttribute("data-vidrio") ? parseFloat(getComputedStyle(hijos[hijos.length - 1]).marginBottom) || 0 : 0;
              let n = 0;
              // La entrada de las piezas (revelar.js, 0.8 s) termina quieta: se espera antes de contar.
              scrollTo(0, Math.max(0, desde - 20));
              await new Promise((r) => setTimeout(r, 1300));
              for (let y = Math.max(0, desde - 20); y < hasta; y += paso) {
                scrollTo(0, y);
                await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
                const a = hijos[0].getBoundingClientRect();
                const z = hijos[hijos.length - 1].getBoundingClientRect();
                if (a.top >= zonaTop - 1 && z.bottom + mb <= vh - margen + 1) n++;
              }
              return n * paso;
            }, { id, desde, hasta: Math.min(limite, desde + 0.9 * vh), zonaTop, vh, margen: MARGEN_PX })
          : 0;
        const ultima = giroSig === null ? null : giroSig - (b.bb - (vh - MARGEN_PX));
        const posible = Math.max(0, zonaAlto - H - MARGEN_PX);
        filas.push({ etiqueta, w, h, tema, conBarras, id, H: Math.round(H), zonaAlto: Math.round(zonaAlto), cabe, giro: giroSig, ultima: ultima === null ? null : Math.round(ultima), entero: Math.round(entero), posible: Math.round(posible), vh, total: dom.total - vh, bt: Math.round(b.bt), bb: Math.round(b.bb), zonaTop: Math.round(zonaTop) });
      }
      // (iii) nada del bloque queda bajo la franja: con el bloque dentro de la zona útil, el punto del centro de su primer y
      // último elemento pertenece a la sección (no a la franja del teléfono).
      for (const id of FASES) {
        const b = dom.bloques[id];
        if (!b || b.bb - b.bt > zonaAlto - MARGEN_PX) continue;
        const y = Math.max(0, Math.round((b.bb - vh + (b.bt - zonaTop)) / 2));
        const r = await page.evaluate(async ({ id, y }) => {
          scrollTo(0, y);
          await new Promise((s) => requestAnimationFrame(() => requestAnimationFrame(s)));
          const sec = document.getElementById(id);
          const hijos = [...sec.children];
          return [hijos[0], hijos[hijos.length - 1]].map((el) => {
            const q = el.getBoundingClientRect();
            const pt = document.elementFromPoint(q.left + Math.min(q.width, 40) / 2 + 2, q.top + q.height / 2);
            return { dentro: !!pt && (sec.contains(pt) || pt === sec), lugar: pt ? (pt.id || pt.className || pt.tagName) : "nada", top: Math.round(q.top), bottom: Math.round(q.bottom) };
          });
        }, { id, y });
        r.forEach((x, k) => {
          if (!x.dentro) fallas.push(`${etiqueta} ${id}: (iii) el ${k ? "último" : "primer"} elemento queda tapado por «${x.lugar}»`);
        });
        filas.find((f) => f.etiqueta === etiqueta && f.id === id).tapado = r.some((x) => !x.dentro);
      }
      await ctx.close();
    }
  }
}
await nav.close();
await srv.cerrar();

/* ---- Informe ---- */
const sinTema = filas.filter((f) => f.tema === temas[0]);
console.log("tamaño                    fase            H   zona  cabe  giro  última  entero (posible)");
for (const f of sinTema) {
  console.log(`${f.etiqueta.padEnd(24)} ${f.id.padEnd(14)} ${String(f.H).padStart(4)} ${String(f.zonaAlto).padStart(5)}  ${f.cabe ? "sí " : "no "}  ${String(f.giro ?? "-").padStart(5)} ${String(f.ultima ?? "-").padStart(6)} ${String(f.entero).padStart(6)} (${f.posible})`);
}
const longitudes = {};
for (const f of filas) longitudes[`${f.w}×${f.h}`] = f.total;
console.log("\nlongitud total del scroll (px):", JSON.stringify(longitudes));
if (a.json && a.json !== true) fs.writeFileSync(String(a.json), JSON.stringify({ filas, longitudes }, null, 1));

if (!soloMedir) {
  for (const f of filas) {
    if (f.giro === null) {
      // cierre: solo se afirma que, si cabe, queda entero en la zona útil (hay posición de scroll con el bloque entero)
      if (f.cabe && f.entero <= 0) fallas.push(`${f.etiqueta} ${f.id}: el cierre cabe pero nunca queda entero en la zona útil`);
      continue;
    }
    const minimo = DWELL * f.vh;
    if (f.cabe) {
      const pide = f.posible; // lo que cabe de hecho: el bloque sube 1:1 con el scroll (el imán es el que lo deja quieto)
      if (f.entero < pide - 12) fallas.push(`${f.etiqueta} ${f.id}: (i) cabe (${f.H} ≤ ${f.zonaAlto}) y solo ${f.entero} px de scroll con el bloque entero antes del giro (cabrían ${Math.round(pide)})`);
    }
    if (f.ultima < minimo - 2) fallas.push(`${f.etiqueta} ${f.id}: (${f.cabe ? "i" : "ii"}) la última línea lleva ${f.ultima} px de scroll visible cuando empieza el giro (mínimo ${Math.round(minimo)})`);
  }
  if (a["base-json"] && a["base-json"] !== true) {
    const base = JSON.parse(fs.readFileSync(String(a["base-json"]), "utf8")).longitudes;
    for (const [k, v] of Object.entries(longitudes)) {
      if (base[k] && v > base[k] * maxCrece) fallas.push(`(iv) recorrido ${k}: ${v} px contra ${base[k]} de la base (más de ×${maxCrece})`);
    }
  }
}
const unicas = [...new Set(fallas)];
if (unicas.length && !soloMedir) {
  console.log(`\nFALLA: ${unicas.length} hallazgo(s)`);
  for (const x of unicas.slice(0, 60)) console.log(" -", x);
  if (unicas.length > 60) console.log(` … y ${unicas.length - 60} más`);
  process.exit(1);
}
console.log(soloMedir ? "\n(solo medición)" : "\nmovil-lectura: la lectura de cada fase cabe antes del giro siguiente");
