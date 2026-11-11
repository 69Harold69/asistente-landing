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

for (const [nombre, viewport, movil] of [["escritorio", { width: 1440, height: 900 }, false], ["movil", { width: 390, height: 844 }, true]]) {
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
      const r = await page.evaluate(() => {
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
      });
      if (!r || vistos.has(r.id)) break;
      vistos.add(r.id);
      if (a.verbose) console.log(`  ${nombre} ${tecla} ${r.op.toFixed(2)} tapado ${r.tapado.toFixed(2)} ${r.id}`);
      if (r.op < 0.9) fallas.push(`${nombre} ${tecla}: ${r.id} recibe el foco con opacidad ${r.op.toFixed(2)}`);
      if (r.tapado > 0) fallas.push(`${nombre} ${tecla}: ${r.id} recibe el foco tapado por el teléfono (${Math.round(r.tapado * 100)} % de su área)`);
    }
  }
  await ctx.close();
}

// Foco de mouse: no fuerza el bloque visible.
for (const [bloque, destino] of [["hero", "fase-chat"], ["cta", "fase-llamada"]]) {
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
  await page.locator(`#${bloque} a.button--primary`).click({ modifiers: ["Control"] });
  await dormir(300);
  const foco = await page.evaluate((b) => !!document.getElementById(b).querySelector(":focus"), bloque);
  await ruedaHasta(page, await yDe(destino), { paso: 60, pausaMs: 35 });
  await dormir(2500);
  const op = await page.evaluate((b) => {
    const sec = document.getElementById(b);
    let max = 0;
    for (const p of sec.children) {
      let o = 1;
      for (let n = p; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      max = Math.max(max, o);
    }
    return max;
  }, bloque);
  if (a.verbose) console.log(`  mouse ${bloque} → ${destino}: foco ${foco}, opacidad ${op.toFixed(2)}`);
  if (!foco) fallas.push(`mouse ${bloque}: el Ctrl+clic no dejó el foco en el enlace (la prueba no prueba nada)`);
  else if (op >= 0.1) fallas.push(`mouse ${bloque}: tras un clic, al llegar a #${destino} el bloque sigue visible (opacidad ${op.toFixed(2)}) y el teléfono le pasa por encima`);
  await ctx.close();
}

await navegador.close();
await srv.cerrar();
if (fallas.length) salir(1, `foco-visible: ${fallas.length} falla(s)\n  - ${fallas.join("\n  - ")}`);
salir(0, "foco-visible: OK (todo lo que recibe el foco con Tab se ve de inmediato, escritorio y móvil; el foco de un clic no fuerza bloques visibles)");
