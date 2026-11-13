#!/usr/bin/env node
/*
  progreso: prueba del avance de la portada (issue #60, opción B: sin barra superior; el avance vive en los puntos).
    - NO hay barra fija de 3 px arriba (ni `.progreso-recorrido` ni nada fijo y delgado pegado al borde superior);
    - en móvil y tablet (< 1024 px) no hay navegación con puntos ni riel: el teléfono y el scroll orientan solos;
    - en escritorio (≥ 1024 px) un riel conecta los puntos: pista tenue (contraste contra el fondo) y relleno de acento
      que llega a cada punto justo cuando su sección pasa a leerse, vale 0 antes de «Chat» y 100 % en «Tu día»;
      es monótono, se recalcula al redimensionar, y los puntos ya recorridos se marcan (`data-pasado`);
    - el riel es decorativo: sin role, sin tabindex, sin texto (no cambia lo que lee un lector de pantalla), en claro y oscuro;
    - se desvanece con los puntos (`data-fuera`) pasado el recorrido y reaparece al volver;
    - con prefers-reduced-motion el relleno no tiene transición (es posición, no animación);
    - sin JavaScript no hay relleno (queda el conector tenue entre los puntos, que siguen siendo anclas);
    - el hover de los puntos sigue respondiendo en los puntos ya recorridos (el punto se aviva);
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
const TAM = { movil: [390, 844, true], tablet: [820, 1180, true], escritorio: [1440, 900, false], "escritorio-1024": [1024, 768, false] };
const SECCIONES = ["hero", "fase-chat", "fase-elementos", "fase-habitos", "fase-avisos", "fase-llamada", "cta"];

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

/* Escala Y del relleno del riel (ol::after): 0 a 1, o NaN si no hay relleno. */
const avance = (page) =>
  page.evaluate(() => {
    const ol = document.querySelector(".nav-recorrido ol");
    const t = ol && getComputedStyle(ol, "::after").transform;
    if (!t || t === "none") return NaN;
    return new DOMMatrix(t).d;
  });
const irA = async (page, y) => {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
  await dormir(220);
};
const geo = (page) =>
  page.evaluate(() => {
    const r = document.querySelector(".layout-con-stage").getBoundingClientRect();
    const p = document.getElementById("preguntas").getBoundingClientRect();
    return { fin: Math.round(r.bottom + scrollY - innerHeight), preguntas: Math.round(p.top + scrollY), vh: innerHeight };
  });
const topDe = (page, id) => page.evaluate((id) => Math.round(document.getElementById(id).getBoundingClientRect().top + scrollY), id);
const estadoNav = (page) =>
  page.evaluate(() => {
    const n = document.querySelector(".nav-recorrido");
    const cs = getComputedStyle(n);
    return { o: Number(cs.opacity), v: cs.visibility, d: cs.display, fuera: n.hasAttribute("data-fuera") };
  });

const colorDe = (page, sel, pseudo, nombre) =>
  page.evaluate(([sel, pseudo, nombre]) => {
    const c = getComputedStyle(document.querySelector(sel), pseudo)[nombre];
    const n = c.match(/-?[\d.]+/g).map(Number);
    if (c.startsWith("color(")) return [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1];
    return [n[0], n[1], n[2], n[3] ?? 1];
  }, [sel, pseudo, nombre]);
const sobre = (c, f) => c.slice(0, 3).map((v, i) => v * c[3] + f[i] * (1 - c[3]));
const lum = ([r, g, b]) => {
  const l = [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const razon = (x, y) => {
  const [p, q] = [lum(x), lum(y)].sort((m, n) => n - m);
  return (p + 0.05) / (q + 0.05);
};

/* Geometría del riel en pantalla: centros de los puntos y alto del relleno completo. */
const riel = (page) =>
  page.evaluate(() => {
    const ol = document.querySelector(".nav-recorrido ol");
    const puntos = [...ol.querySelectorAll("a")].map((a) => {
      const r = a.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
    const p = getComputedStyle(ol, "::after");
    return { puntos, ancho: parseFloat(p.width), alto: parseFloat(p.height), arriba: parseFloat(p.top), olTop: ol.getBoundingClientRect().top };
  });

try {
  for (const tema of ["light", "dark"]) {
    for (const tam of Object.keys(TAM)) {
      const nombre = `${tema === "light" ? "claro" : "oscuro"} ${tam}`;
      const escritorio = tam.startsWith("escritorio");
      if (tema === "dark" && tam === "escritorio-1024") continue;
      console.log(`\n== ${nombre}`);
      const { ctx, page } = await abrir({ tema, tam });

      const fijos = await page.evaluate(() => {
        const sale = [];
        for (const e of document.querySelectorAll("body *")) {
          const cs = getComputedStyle(e);
          if (cs.position !== "fixed") continue;
          const r = e.getBoundingClientRect();
          if (cs.display !== "none" && r.top <= 1 && r.height > 0 && r.height <= 6) sale.push(e.className || e.tagName);
        }
        return { barra: !!document.querySelector(".progreso-recorrido"), sale };
      });
      ok(!fijos.barra && fijos.sale.length === 0, `no hay barra fija y delgada arriba (${fijos.barra ? ".progreso-recorrido presente" : fijos.sale.join(",") || "ninguna"})`);

      const nav = await estadoNav(page);
      if (!escritorio) {
        ok(nav.d === "none", `sin navegación con puntos ni riel bajo 1024 px (display: ${nav.d})`);
        await ctx.close();
        continue;
      }
      ok(nav.d !== "none", "la navegación con puntos se ve en escritorio");
      const aria = await page.evaluate(() => {
        const n = document.querySelector(".nav-recorrido");
        const ol = n.querySelector("ol");
        return { label: n.getAttribute("aria-label"), role: ol.getAttribute("role"), tab: ol.getAttribute("tabindex"), contenido: [getComputedStyle(ol, "::before").content, getComputedStyle(ol, "::after").content] };
      });
      ok(aria.label === "Recorrido por secciones" && aria.role === null && aria.tab === null, "el riel no cambia la accesibilidad de la navegación (mismo aria-label, sin role ni tabindex en la lista)");
      ok(aria.contenido.every((c) => c === '""' || c === "none"), `el riel no aporta texto (content: ${aria.contenido.join(" ")})`);

      /* pista y relleno legibles */
      const fondo = await colorDe(page, "body", null, "backgroundColor");
      const pista = await colorDe(page, ".nav-recorrido ol", "::before", "backgroundColor");
      const relleno = await colorDe(page, ".nav-recorrido ol", "::after", "backgroundColor");
      const pSobre = sobre(pista, fondo.slice(0, 3));
      const rSobre = sobre(relleno, fondo.slice(0, 3));
      ok(pista[3] > 0 && razon(pSobre, fondo) >= 1.2, `la pista del riel se distingue del fondo (contraste ${razon(pSobre, fondo).toFixed(2)} ≥ 1.2)`);
      ok(razon(rSobre, fondo) >= 3, `el relleno contrasta con el fondo (${razon(rSobre, fondo).toFixed(2)} ≥ 3)`);
      ok(razon(rSobre, pSobre) >= 2, `el relleno se distingue de la pista (${razon(rSobre, pSobre).toFixed(2)} ≥ 2)`);

      /* el riel va de centro a centro de los puntos */
      const r0 = await riel(page);
      const alturaPuntos = r0.puntos[r0.puntos.length - 1].cy - r0.puntos[0].cy;
      ok(r0.puntos.length === 7 && Math.abs(r0.alto - alturaPuntos) < 1.5, `el riel mide de primer a último punto (${r0.alto.toFixed(1)} px de ${alturaPuntos.toFixed(1)})`);
      ok(Math.abs(r0.ancho - 2) < 0.5, `riel de 2 px (${r0.ancho})`);

      const g = await geo(page);
      await irA(page, 0);
      ok((await avance(page)) === 0, "relleno 0 en el hero (primer punto «Inicio»)");

      /* el relleno llega a cada punto justo cuando su sección pasa a leerse */
      for (let i = 0; i < SECCIONES.length; i++) {
        const top = await topDe(page, SECCIONES[i]);
        await irA(page, i === 0 ? 0 : Math.min(Math.round(top - g.vh * 0.5 + 6), g.fin + g.vh));
        const estado = await page.evaluate(() => [...document.querySelectorAll(".nav-recorrido a")].map((a) => [a.getAttribute("aria-current"), a.hasAttribute("data-pasado")]));
        const idx = estado.findIndex((x) => x[0] === "location");
        const esp = (r0.puntos[i].cy - r0.puntos[0].cy) / alturaPuntos;
        const p = await avance(page);
        ok(idx === i && Math.abs(p - esp) <= 0.04, `en «${SECCIONES[i]}» el relleno llega a su punto (${(p * 100).toFixed(0)} % ≈ ${(esp * 100).toFixed(0)} %, punto actual ${idx})`);
        const pasados = estado.map((x, k) => x[1] === (k < i)).every(Boolean);
        ok(pasados, `en «${SECCIONES[i]}» solo los puntos anteriores están marcados como recorridos`);
      }
      await irA(page, g.fin);
      ok((await avance(page)) >= 0.999, "100 % al terminar #cta («Tu día»)");

      /* el primer punto es «Inicio»: lleva al tope, deja el riel en 0 y el hash limpio */
      const primero = await page.evaluate(() => {
        const a = document.querySelector(".nav-recorrido a");
        return { href: a.getAttribute("href"), texto: a.textContent.trim() };
      });
      ok(primero.href === "#hero" && primero.texto === "Inicio", `el primer punto es «Inicio» → #hero (${primero.href} «${primero.texto}»)`);
      await page.locator(".nav-recorrido a").first().click();
      await dormir(1800);
      const vuelta = await page.evaluate(() => ({ y: Math.round(scrollY), cur: document.querySelector(".nav-recorrido a[aria-current]")?.getAttribute("href"), hash: location.hash, foco: document.activeElement?.id }));
      ok(vuelta.y === 0 && vuelta.cur === "#hero" && vuelta.hash === "" && vuelta.foco === "hero", `«Inicio» vuelve al tope (scrollY ${vuelta.y}, actual ${vuelta.cur}, hash «${vuelta.hash}», foco ${vuelta.foco})`);
      ok((await avance(page)) === 0, "tras «Inicio» el riel vuelve a 0");
      await irA(page, g.fin);

      let prev = -1, mono = true;
      const tope = await topDe(page, "cta");
      for (let i = 0; i <= 30; i++) {
        await irA(page, Math.round(((tope - g.vh * 0.5) * i) / 30));
        const p = await avance(page);
        if (!(p >= prev - 0.001)) mono = false;
        prev = p;
      }
      ok(mono && prev <= 1.0001, "monótono creciente y sin pasar de 100 % en 31 muestras");

      /* se va con los puntos */
      await irA(page, g.fin);
      let e = await estadoNav(page);
      ok(e.o === 1 && !e.fuera, "visible al terminar el recorrido");
      await irA(page, g.preguntas - 40);
      await dormir(450);
      e = await estadoNav(page);
      ok(e.o === 0 && e.v === "hidden" && e.fuera, `en las preguntas se va con los puntos (opacidad ${e.o}, ${e.v})`);
      await irA(page, g.fin - 10);
      await dormir(450);
      e = await estadoNav(page);
      ok(e.o === 1 && e.v === "visible", "al volver al recorrido reaparece");
      await irA(page, 0);

      if (tam === "escritorio") {
        await page.setViewportSize({ width: 1100, height: 700 });
        await dormir(900);
        const g2 = await geo(page);
        await irA(page, g2.fin);
        const pr = await avance(page);
        ok(pr >= 0.999 && g2.fin !== g.fin, `tras redimensionar sigue en 100 % al final del recorrido (${(pr * 100).toFixed(1)} %)`);
      }
      await ctx.close();
    }
  }

  console.log("\n== hover en un punto recorrido");
  {
    const { ctx, page } = await abrir({});
    const y = await page.evaluate(() => document.getElementById("fase-avisos").getBoundingClientRect().top + scrollY - innerHeight * 0.5 + 60);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
    await dormir(600);
    const op = () => page.evaluate(() => Number(getComputedStyle(document.querySelectorAll(".nav-recorrido a")[1], "::before").opacity));
    const pasado = await page.evaluate(() => document.querySelectorAll(".nav-recorrido a")[1].hasAttribute("data-pasado"));
    const reposo = await op();
    await page.locator(".nav-recorrido a").nth(1).hover();
    await dormir(400);
    const encima = await op();
    ok(pasado && encima >= reposo + 0.2, `el punto recorrido responde al hover (opacidad ${reposo} → ${encima})`);
    await ctx.close();
  }

  console.log("\n== prefers-reduced-motion");
  {
    const { ctx, page } = await abrir({ reducido: true });
    const d = await page.evaluate(() => getComputedStyle(document.querySelector(".nav-recorrido ol"), "::after").transitionDuration);
    ok(d.split(",").every((x) => parseFloat(x) === 0), `el relleno no tiene transición (${d})`);
    const g = await geo(page);
    await irA(page, g.fin);
    ok((await avance(page)) >= 0.999, "el relleno sigue funcionando con reduced-motion (es posición, no animación)");
    await ctx.close();
  }

  console.log("\n== sin JavaScript");
  {
    const { ctx, page } = await abrir({ js: false });
    const v = await page.evaluate(() => {
      const ol = document.querySelector(".nav-recorrido ol");
      return { nav: getComputedStyle(document.querySelector(".nav-recorrido")).display, anclas: document.querySelectorAll(".nav-recorrido a[href^='#']").length, ol: !!ol };
    });
    ok(v.anclas === 7, `los puntos siguen siendo 7 anclas (nav: ${v.nav})`);
    ok((await avance(page)) === 0, "sin JS el relleno queda en 0 (solo el conector tenue entre los puntos)");
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
