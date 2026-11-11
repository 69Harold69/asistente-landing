#!/usr/bin/env node
/*
  cls: Layout Instability API en Chromium con red limitada (las fuentes llegan tarde, como en un
  teléfono) sobre las páginas legales y la 404, en escritorio y móvil, 3 corridas por combo.
  Falla si el CLS de alguna corrida pasa de --max (0.02 por defecto) y muestra los desplazamientos.
  Causa típica: el cambio de la fuente de respaldo a la real reacomoda renglones (la Arial de respaldo
  de `fonts.css` debe tener las métricas de la fuente real: size-adjust y ascent/descent-override).

  Uso: node cls.mjs [--paginas /eliminar-cuenta/,/terminos/] [--max 0.02] [--corridas 3] [--verbose]
*/
import { iniciarServidor } from "./lib/servidor.mjs";
import { lanzarChromium, leerArgs, lista, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node cls.mjs [--paginas /eliminar-cuenta/,/terminos/] [--max 0.02] [--corridas 3] [--verbose]");
const paginas = lista(a.paginas, ["/privacidad/", "/terminos/", "/eliminar-cuenta/", "/404.html"]);
const max = a.max && a.max !== true ? Number(a.max) : 0.02;
const corridas = a.corridas && a.corridas !== true ? Number(a.corridas) : 3;
const TAMANOS = { escritorio: { width: 1350, height: 940 }, movil: { width: 412, height: 823 } };

const servidor = await iniciarServidor();
const navegador = await lanzarChromium();
const fallas = [];
try {
  for (const ruta of paginas) {
    for (const [tam, viewport] of Object.entries(TAMANOS)) {
      const valores = [];
      for (let k = 0; k < corridas; k++) {
        const ctx = await navegador.newContext({ viewport });
        const page = await ctx.newPage();
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 1.6e6, uploadThroughput: 1e6 });
        await page.addInitScript(() => {
          window.__ls = [];
          new PerformanceObserver((l) => {
            for (const e of l.getEntries())
              window.__ls.push({ v: e.value, t: Math.round(e.startTime), s: e.sources.map((x) => `${x.node?.nodeName} ${Math.round(x.previousRect.y)}->${Math.round(x.currentRect.y)}`) });
          }).observe({ type: "layout-shift", buffered: true });
        });
        await page.goto(servidor.url + ruta);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(800);
        const { ls } = await page.evaluate(() => ({ ls: window.__ls }));
        const cls = ls.reduce((s, e) => s + e.v, 0);
        valores.push(cls);
        if (cls > max) fallas.push(`${ruta} ${tam} corrida ${k + 1}: CLS ${cls.toFixed(3)} > ${max} (${JSON.stringify(ls.filter((e) => e.v > 0.005))})`);
        await ctx.close();
      }
      if (a.verbose || fallas.length) console.log(`${ruta} ${tam}: ${valores.map((v) => v.toFixed(3)).join(" ")}`);
    }
  }
} finally {
  await navegador.close();
  await servidor.cerrar();
}
if (fallas.length) {
  console.error(`cls: ${fallas.length} FALLA(S)`);
  for (const f of fallas) console.error(`  FALLA ${f}`);
  process.exit(1);
}
console.log(`cls: OK (CLS <= ${max} en ${paginas.length} páginas × escritorio/móvil × ${corridas} corridas)`);
