#!/usr/bin/env node
/*
  progreso: prueba de la barra de progreso de la portada (`.progreso-recorrido`, issue #60, opción A).
    - la barra es decorativa (aria-hidden, sin rol ni tabindex, sin eventos de puntero), fija arriba, de 3 px;
    - tiene una PISTA tenue a todo el ancho (en 0 % se lee como barra, no como un trazo suelto) con contraste
      suficiente contra el fondo y el avance se distingue de la pista, en claro y oscuro;
    - el avance mide SOLO el recorrido del teléfono: 0 % al inicio, 100 % al terminar #cta, monótono y lineal con
      el scroll, en 390×844, 820×1180 y 1440×900 (y se recalcula si cambia el tamaño de la ventana);
    - pasado el recorrido (Cómo funciona, preguntas...) se desvanece y no se ve (igual que los puntos); al volver, reaparece;
    - con prefers-reduced-motion no hay transición (el desvanecido es instantáneo);
    - sin JavaScript no se muestra (una pista vacía sería una línea suelta);
    - consola limpia (sin console.error, pageerror ni violaciones de CSP).
  Uso: node progreso.mjs [--url http://...] [--salida DIR]   (sale con 1 si algo falla)
*/
import { iniciarServidor } from "./lib/servidor.mjs";
import { leerArgs, lanzarChromium, crearGuardia, scriptInicial, esperarCarga, dormir, salir } from "./lib/comun.mjs";

const a = leerArgs();
const srv = a.url ? { url: String(a.url).replace(/\/$/, ""), cerrar: async () => {} } : await iniciarServidor();
const navegador = await lanzarChromium();
const guardia = crearGuardia(srv.url);
const problemas = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok " : "  FALLA"} ${msg}`);
  if (!cond) problemas.push(msg);
};
const TAM = { movil: [390, 844, true], tablet: [820, 1180, true], escritorio: [1440, 900, false] };

async function abrir({ tema = "light", tam = "escritorio", reducido = false, js = true }) {
  const [w, h, m] = TAM[tam];
  const ctx = await navegador.newContext({
    viewport: { width: w, height: h },
    colorScheme: tema,
    reducedMotion: reducido ? "reduce" : "no-preference",
    javaScriptEnabled: js,
    isMobile: m,
    hasTouch: m,
  });
  const page = await ctx.newPage();
  guardia.instalar(page, `progreso ${tema} ${tam}${reducido ? " reducido" : ""}${js ? "" : " sin-js"}`);
  if (js) await page.addInitScript(scriptInicial({ tema }));
  await page.goto(srv.url + "/", { waitUntil: "load" });
  if (js) await esperarCarga(page, { portada: true });
  else await dormir(500);
  return { ctx, page };
}

/* Escala X del relleno (el ::before): 0 a 1, o NaN si no hay relleno. */
const avance = (page) =>
  page.evaluate(() => {
    const b = document.querySelector(".progreso-recorrido");
    const t = b && getComputedStyle(b, "::before").transform;
    if (!t || t === "none") return NaN;
    return new DOMMatrix(t).a;
  });
const irA = async (page, y) => {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
  await dormir(220);
};
const geo = (page) =>
  page.evaluate(() => {
    const r = document.querySelector(".layout-con-stage").getBoundingClientRect();
    const p = document.getElementById("preguntas").getBoundingClientRect();
    return { fin: Math.round(r.bottom + scrollY - innerHeight), preguntas: Math.round(p.top + scrollY), vh: innerHeight, total: document.documentElement.scrollHeight - innerHeight };
  });
const visible = (page) =>
  page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector(".progreso-recorrido"));
    return { o: Number(cs.opacity), v: cs.visibility, d: cs.display };
  });

/* Color resuelto de una propiedad, como [r,g,b,a] (rgb() o color(srgb ...)). */
const colorDe = (page, sel, prop) =>
  page.evaluate(([sel, prop]) => {
    const el = document.querySelector(sel);
    const c = getComputedStyle(el, prop.pseudo ?? null)[prop.nombre];
    const n = c.match(/-?[\d.]+/g).map(Number);
    if (c.startsWith("color(")) return [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1];
    return [n[0], n[1], n[2], n[3] ?? 1];
  }, [sel, prop]);
const sobre = (c, f) => c.slice(0, 3).map((v, i) => v * c[3] + f[i] * (1 - c[3]));
const lum = ([r, g, b]) => {
  const l = [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const razon = (x, y) => {
  const [p, q] = [lum(x), lum(y)].sort((m, n) => n - m);
  return (p + 0.05) / (q + 0.05);
};

try {
  for (const tema of ["light", "dark"]) {
    for (const tam of Object.keys(TAM)) {
      const nombre = `${tema === "light" ? "claro" : "oscuro"} ${tam}`;
      console.log(`\n== ${nombre}`);
      const { ctx, page } = await abrir({ tema, tam });
      const info = await page.evaluate(() => {
        const b = document.querySelector(".progreso-recorrido");
        if (!b) return null;
        const cs = getComputedStyle(b);
        const r = b.getBoundingClientRect();
        return { aria: b.getAttribute("aria-hidden"), role: b.getAttribute("role"), tab: b.getAttribute("tabindex"), pe: cs.pointerEvents, pos: cs.position, top: r.top, h: r.height, w: r.width, vw: innerWidth, hijos: b.children.length };
      });
      ok(!!info, "existe .progreso-recorrido");
      if (info) {
        ok(info.aria === "true" && info.role === null && info.tab === null, "decorativa: aria-hidden=\"true\", sin role ni tabindex");
        ok(info.pe === "none" && info.pos === "fixed" && info.top === 0 && info.h === 3, `fija arriba, 3 px, sin eventos (pos ${info.pos}, top ${info.top}, alto ${info.h})`);
        ok(Math.abs(info.w - info.vw) < 1, `la pista cubre todo el ancho (${info.w} de ${info.vw} px)`);
      }
      /* pista y avance legibles */
      const fondo = await colorDe(page, "body", { nombre: "backgroundColor" });
      const pista = await colorDe(page, ".progreso-recorrido", { nombre: "backgroundColor" });
      const relleno = await colorDe(page, ".progreso-recorrido", { pseudo: "::before", nombre: "backgroundColor" });
      ok(pista[3] > 0, `la pista tiene color (alfa ${pista[3].toFixed(2)})`);
      const pistaSobreFondo = sobre(pista, fondo.slice(0, 3));
      const rellenoSobreFondo = sobre(relleno, fondo.slice(0, 3));
      const rPista = razon(pistaSobreFondo, fondo);
      const rAvance = razon(rellenoSobreFondo, fondo);
      ok(rPista >= 1.2, `la pista se distingue del fondo (contraste ${rPista.toFixed(2)} ≥ 1.2)`);
      ok(rAvance >= 3, `el avance contrasta con el fondo (${rAvance.toFixed(2)} ≥ 3)`);
      ok(razon(rellenoSobreFondo, pistaSobreFondo) >= 2, `el avance se distingue de la pista (${razon(rellenoSobreFondo, pistaSobreFondo).toFixed(2)} ≥ 2)`);

      /* avance 0..1 sobre el recorrido */
      const g = await geo(page);
      ok(g.fin < g.total * 0.85 && g.fin > 0, `el recorrido termina antes del final de la página (fin ${g.fin} de ${g.total} px)`);
      await irA(page, 0);
      const p0 = await avance(page);
      ok(p0 >= 0 && p0 <= 0.005, `0 % al inicio (${(p0 * 100).toFixed(1)} %)`);
      await irA(page, g.fin);
      const p1 = await avance(page);
      ok(p1 >= 0.995, `100 % al terminar #cta (${(p1 * 100).toFixed(1)} %)`);
      const mitad = (await irA(page, Math.round(g.fin / 2)), await avance(page));
      ok(Math.abs(mitad - 0.5) <= 0.03, `~50 % a la mitad del recorrido (${(mitad * 100).toFixed(1)} %)`);
      let prev = -1, mono = true, tope = 0;
      for (let i = 0; i <= 24; i++) {
        await irA(page, Math.round((g.fin * i) / 24));
        const p = await avance(page);
        if (!(p >= prev - 0.001)) mono = false;
        prev = p;
        tope = Math.max(tope, p);
      }
      ok(mono && tope <= 1.0001, "monótono creciente y sin pasar de 100 % en 25 muestras");

      /* se desvanece al salir del recorrido y reaparece al volver */
      await irA(page, g.fin);
      let v = await visible(page);
      ok(v.o === 1 && v.v === "visible", "visible en el último tramo del recorrido (opacidad 1)");
      await irA(page, g.preguntas - 40);
      await dormir(450);
      v = await visible(page);
      ok(v.o === 0 && v.v === "hidden", `fuera del recorrido (preguntas) no se ve (opacidad ${v.o}, ${v.v})`);
      await irA(page, g.fin - 10);
      await dormir(450);
      v = await visible(page);
      ok(v.o === 1 && v.v === "visible", "al volver al recorrido reaparece");
      await irA(page, 0);

      /* se recalcula al cambiar el tamaño */
      if (tam === "escritorio") {
        await page.setViewportSize({ width: 1100, height: 700 });
        await dormir(900);
        const g2 = await geo(page);
        await irA(page, g2.fin);
        const pr = await avance(page);
        ok(pr >= 0.995 && g2.fin !== g.fin, `tras redimensionar sigue en 100 % al final del recorrido (${(pr * 100).toFixed(1)} %)`);
      }
      await ctx.close();
    }
  }

  console.log("\n== prefers-reduced-motion");
  {
    const { ctx, page } = await abrir({ reducido: true });
    const d = await page.evaluate(() => getComputedStyle(document.querySelector(".progreso-recorrido")).transitionDuration);
    const t = d.split(",").every((x) => parseFloat(x) === 0);
    ok(t, `sin transición del desvanecido (${d})`);
    const g = await geo(page);
    await irA(page, g.fin);
    ok((await avance(page)) >= 0.995, "el avance sigue funcionando con reduced-motion (es posición, no animación)");
    await ctx.close();
  }

  console.log("\n== sin JavaScript");
  {
    const { ctx, page } = await abrir({ js: false });
    const v = await page.evaluate(() => {
      const b = document.querySelector(".progreso-recorrido");
      return b ? getComputedStyle(b).display : "ausente";
    });
    ok(v === "none", `no se muestra (display: ${v}); una pista vacía sería una línea suelta`);
    await ctx.close();
  }

  console.log("\n== consola");
  const f = guardia.fallas ?? [];
  ok(f.length === 0, `sin console.error, pageerror ni violaciones de CSP (${f.length})`);
  for (const x of f) console.log("   ", JSON.stringify(x));
} finally {
  await navegador.close();
  await srv.cerrar();
}
salir(problemas.length ? 1 : 0, problemas.length ? `\n${problemas.length} verificaciones fallaron` : "\nprogreso: todo en orden");
