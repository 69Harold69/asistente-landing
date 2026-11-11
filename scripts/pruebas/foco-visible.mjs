#!/usr/bin/env node
/*
  foco-visible: con el teclado, el elemento que recibe el foco en la portada se ve desde el primer momento. Los textos
  del recorrido entran con opacidad (revelar.js, atados al giro del teléfono en escritorio): con Tab, el navegador
  desplaza la página hasta el enlace y el foco caía en un botón todavía en opacidad 0 durante ~1 s mientras el
  teléfono terminaba de girar (WCAG 2.4.7, foco visible; auditoría de tablet y auditoría integral).
  Recorre con Tab TODOS los elementos enfocables de la portada (1440×900 y 390×844, claro) y, a los 120 ms de cada
  foco, mide la opacidad efectiva (producto de la opacidad de él y de sus ancestros). Falla si alguno queda < 0.9.
  Uso: node foco-visible.mjs [--url http://...] [--verbose]
*/
import { iniciarServidor } from "./lib/servidor.mjs";
import { lanzarChromium, leerArgs, scriptInicial, dormir, salir } from "./lib/comun.mjs";

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
  const vistos = new Set();
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    await dormir(120);
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      let op = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
      const sec = el.closest("section, header, footer, nav");
      return { id: `${sec?.id || sec?.tagName || "?"} › ${el.tagName} «${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 30)}»`, op };
    });
    if (!r || vistos.has(r.id)) break;
    vistos.add(r.id);
    if (a.verbose) console.log(`  ${nombre} ${r.op.toFixed(2)} ${r.id}`);
    if (r.op < 0.9) fallas.push(`${nombre}: ${r.id} recibe el foco con opacidad ${r.op.toFixed(2)}`);
  }
  await ctx.close();
}

await navegador.close();
await srv.cerrar();
if (fallas.length) salir(1, `foco-visible: ${fallas.length} falla(s)\n  - ${fallas.join("\n  - ")}`);
salir(0, "foco-visible: OK (todo lo que recibe el foco con Tab se ve de inmediato, escritorio y móvil)");
