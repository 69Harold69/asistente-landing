#!/usr/bin/env node
/*
  foco-visible: con el teclado, el elemento que recibe el foco en la portada se ve desde el primer momento. Los textos
  del recorrido entran con opacidad (revelar.js, atados al giro del teléfono en escritorio): con Tab, el navegador
  desplaza la página hasta el enlace y el foco caía en un botón todavía en opacidad 0 durante ~1 s mientras el
  teléfono terminaba de girar (WCAG 2.4.7, foco visible; auditoría de tablet y auditoría integral).
  Recorre con Tab TODOS los elementos enfocables de la portada (1440×900 y 390×844, claro) y, a los 120 ms de cada
  foco, mide la opacidad efectiva (producto de la opacidad de él y de sus ancestros). Falla si alguno queda < 0.9.
  También de regreso con Shift+Tab, y falla si el elemento con foco queda debajo de lo que pinta encima del texto (WCAG
  2.4.11, foco no tapado): en móvil, la franja opaca del teléfono, pegada arriba (al subir con Shift+Tab el navegador
  deja el enlace en el borde superior, justo detrás de ella); en escritorio, el teléfono.
  Y al revés (auditoría integral, pasada 2): el foco que deja un CLIC de mouse no cuenta. Si un enlace se queda con el
  foco tras un Ctrl+clic (o al volver con Atrás), su bloque no puede quedarse visible a la fuerza: el teléfono le pasaría
  por encima en el siguiente giro. Solo el foco de teclado (`:focus-visible`) muestra el bloque al instante. En
  escritorio: Ctrl+clic en el botón del hero y bajar a `#fase-chat`, y Ctrl+clic en el del cierre y subir a
  `#fase-llamada`; en reposo, el bloque del enlace debe haberse ido como sin clic (opacidad efectiva < 0.1).
  Uso: node foco-visible.mjs [--url http://...] [--verbose]
*/
import { iniciarServidor } from "./lib/servidor.mjs";
import { lanzarChromium, leerArgs, scriptInicial, dormir, salir } from "./lib/comun.mjs";
import { ruedaHasta } from "./lib/scroll.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node foco-visible.mjs [--url http://...] [--verbose]");
const srv = a.url ? { url: String(a.url).replace(/\/$/, ""), cerrar: async () => {} } : await iniciarServidor();
const navegador = await lanzarChromium();
const fallas = [];

for (const [nombre, viewport, movil] of [["escritorio", { width: 1440, height: 900 }, false], ["tablet820", { width: 820, height: 1180 }, true], ["movil", { width: 390, height: 844 }, true]]) {
  const ctx = await navegador.newContext({ viewport, isMobile: movil, hasTouch: movil, deviceScaleFactor: movil ? 2 : 1 });
  const page = await ctx.newPage();
  await page.addInitScript(scriptInicial({ tema: "light" }));
  await page.goto(`${srv.url}/`, { waitUntil: "load" });
  await page.waitForSelector(".capa-escena", { state: "attached", timeout: 10000 }).catch(() => {});
  await dormir(2200);
  // Hacia adelante (Tab) y de regreso (Shift+Tab): al subir, el navegador deja el enlace en el borde de arriba.
  for (const tecla of ["Tab", "Shift+Tab"]) {
    const vistos = new Set();
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press(tecla);
      await dormir(120);
      const medir = () => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        let op = 1;
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
        // Lo que pinta encima del texto: en móvil la franja opaca del teléfono (sticky arriba); en escritorio, el teléfono.
        const stage = document.getElementById("stage");
        const encima = !stage || getComputedStyle(stage).display === "none" ? null : (innerWidth < 1024 ? stage : document.getElementById("escenario-3d")).getBoundingClientRect();
        const b = el.getBoundingClientRect();
        const w = encima ? Math.max(0, Math.min(b.right, encima.right) - Math.max(b.left, encima.left)) : 0;
        const h = encima ? Math.max(0, Math.min(b.bottom, encima.bottom) - Math.max(b.top, encima.top)) : 0;
        const tapado = b.width * b.height ? (w * h) / (b.width * b.height) : 0;
        const sec = el.closest("section, header, footer, nav");
        return { id: `${sec?.id || sec?.tagName || "?"} › ${el.tagName} «${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}»`, op, tapado };
      };
      const r = await page.evaluate(medir);
      if (!r || vistos.has(r.id)) break;
      // En escritorio el teléfono cruza encima hasta ~1.1 s mientras termina el giro hacia el centro (rectángulo plano: el
      // teléfono va de canto y tapa menos): cuenta solo si sigue tapado ya quieto.
      if (r.tapado > 0) {
        await dormir(2500);
        r.tapado = (await page.evaluate(medir))?.tapado ?? 0;
      }
      vistos.add(r.id);
      if (a.verbose) console.log(`  ${nombre} ${tecla} ${r.op.toFixed(2)} tapado ${r.tapado.toFixed(2)} ${r.id}`);
      if (r.op < 0.9) fallas.push(`${nombre} ${tecla}: ${r.id} recibe el foco con opacidad ${r.op.toFixed(2)}`);
      if (r.tapado > 0) fallas.push(`${nombre} ${tecla}: ${r.id} queda tapado por el teléfono con el foco (${Math.round(r.tapado * 100)} % de su área, 2.6 s después)`);
    }
  }
  await ctx.close();
}

// Foco que no debe dejar el bloque encima del teléfono al hacer scroll (escritorio):
// - `ctrl-clic`: el foco de un clic de mouse no cuenta (pasada 2).
// - `ctrl-clic+flecha`: Chromium pasa ese foco a `:focus-visible` con la primera tecla; bajar con las flechas no debe
//   volver a forzar el bloque (pasada 3).
// - `tab+rueda`: el foco de teclado muestra el bloque al llegar, pero en cuanto la persona se va con la rueda manda la
//   coreografía (pasada 3).
// Mide, durante todo el scroll, el área de los renglones visibles del bloque (opacidad efectiva ≥ 0.3) que el teléfono
// tapa (su caja: aproximación; el reposo sin foco da 0), y en reposo la opacidad del bloque.
const MUESTREO_CRUCE = (bloque) => {
  window.__cruce = { area: 0, y: 0 };
  const tick = () => {
    const t = document.getElementById("telefono").getBoundingClientRect(); // con el giro 3D ya proyectado
    let area = 0;
    for (const p of document.getElementById(bloque).children) {
      let o = 1;
      for (let n = p; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      if (o < 0.3) continue;
      // Lo que se ve de la pieza (renglones de texto y cajas en línea), no su caja de bloque, que es más ancha.
      const rango = document.createRange();
      rango.selectNodeContents(p);
      for (const b of rango.getClientRects()) {
        area += Math.max(0, Math.min(b.right, t.right) - Math.max(b.left, t.left)) * Math.max(0, Math.min(b.bottom, t.bottom) - Math.max(b.top, t.top));
      }
    }
    if (area > window.__cruce.area) window.__cruce = { area: Math.round(area), y: Math.round(scrollY) };
    if (!window.__cruceFin) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
for (const [bloque, destino, modo] of [
  ["hero", "fase-chat", "ctrl-clic"],
  ["cta", "fase-llamada", "ctrl-clic"],
  ["hero", "fase-chat", "ctrl-clic+flecha"],
  ["hero", "fase-chat", "tab+rueda"],
  ["cta", "fase-llamada", "tab+rueda"],
]) {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  ctx.on("page", (p) => p.close().catch(() => {})); // la pestaña que abre el Ctrl+clic
  await page.route(/^https:\/\//, (r) => r.abort());
  await page.addInitScript(scriptInicial({ tema: "light" }));
  await page.goto(`${srv.url}/`, { waitUntil: "load" });
  await page.waitForSelector(".capa-escena", { state: "attached", timeout: 10000 }).catch(() => {});
  await dormir(2200);
  const yDe = (id) => page.evaluate((i) => Math.round(document.getElementById(i).getBoundingClientRect().top + scrollY), id);
  if (bloque === "cta") {
    await ruedaHasta(page, await yDe("cta"), { paso: 120, pausaMs: 20 });
    await dormir(2500);
  }
  if (modo.startsWith("ctrl-clic")) {
    await page.locator(`#${bloque} a.button--primary`).click({ modifiers: ["Control"] });
  } else {
    // Un clic en el título (no enfocable) fija el punto de partida; el Tab siguiente cae en el botón del bloque.
    await page.locator(`#${bloque} :is(h1, h2)`).click();
    await page.keyboard.press("Tab");
  }
  await dormir(300);
  const foco = await page.evaluate(([b, sel]) => !!document.getElementById(b).querySelector(sel), [bloque, modo === "tab+rueda" ? ":focus-visible" : ":focus"]);
  await page.evaluate(MUESTREO_CRUCE, bloque);
  const objetivo = await yDe(destino);
  if (modo === "ctrl-clic+flecha") {
    for (let i = 0; i < 200 && (await page.evaluate(() => scrollY)) < objetivo; i++) {
      await page.keyboard.press("ArrowDown");
      await dormir(40);
    }
  } else {
    await ruedaHasta(page, objetivo, { paso: 60, pausaMs: 35 });
  }
  await dormir(2500);
  const r = await page.evaluate((b) => {
    window.__cruceFin = true;
    let max = 0;
    for (const p of document.getElementById(b).children) {
      let o = 1;
      for (let n = p; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      max = Math.max(max, o);
    }
    return { op: max, cruce: window.__cruce };
  }, bloque);
  if (a.verbose) console.log(`  ${modo} ${bloque} → ${destino}: foco ${foco}, opacidad ${r.op.toFixed(2)}, cruce ${r.cruce.area} px² (y ${r.cruce.y})`);
  if (!foco) fallas.push(`${modo} ${bloque}: el foco no quedó en el botón del bloque (la prueba no prueba nada)`);
  else {
    if (r.op >= 0.1) fallas.push(`${modo} ${bloque}: al llegar a #${destino} el bloque sigue visible (opacidad ${r.op.toFixed(2)})`);
    if (r.cruce.area > 0) fallas.push(`${modo} ${bloque}: camino a #${destino} el teléfono pasa encima del bloque visible (${r.cruce.area} px² en y ${r.cruce.y})`);
  }
  await ctx.close();
}

await navegador.close();
await srv.cerrar();
if (fallas.length) salir(1, `foco-visible: ${fallas.length} falla(s)\n  - ${fallas.join("\n  - ")}`);
salir(0, "foco-visible: OK (todo lo que recibe el foco con Tab se ve de inmediato, escritorio y móvil; el foco de un clic no fuerza bloques visibles)");
