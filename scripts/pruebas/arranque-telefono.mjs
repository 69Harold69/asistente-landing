#!/usr/bin/env node
/*
  arranque-telefono: en escritorio, mientras carga la portada, el teléfono NO se pinta encima del titular del hero ni salta
  de columna cuando llegan GSAP y la coreografía (stage.js fija `--vuelo-x` en su primer cuadro). Antes de esta prueba el
  teléfono nacía en el centro del escenario (`--vuelo-x` = 0) y se veía encima del final del titular ~0.17 s (o ~2.3 s con
  CPU ×4) hasta saltar a su columna (auditoría integral, pasada 1).

  Mide en Chromium real con CPU ×4 (como el móvil de Lighthouse) y sin limitar, en 1440×900, 1024×768 y 1920×1080, claro, con y sin
  `prefers-reduced-motion`: en cada cuadro (requestAnimationFrame desde antes del primer pintado) guarda el rectángulo del
  `#escenario-3d` y del `#titular`. Falla si en algún cuadro con el teléfono visible su rectángulo se cruza con el del
  titular, o si el centro del teléfono se mueve más de --salto px (por defecto 6) entre el primer cuadro visible y el reposo.
  Uso: node arranque-telefono.mjs [--salto 6] [--url http://...] [--verbose]
*/
import { iniciarServidor } from "./lib/servidor.mjs";
import { lanzarChromium, leerArgs, scriptInicial, dormir, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node arranque-telefono.mjs [--salto 6] [--url http://...] [--verbose]");
const saltoMax = a.salto && a.salto !== true ? Number(a.salto) : 6;
const srv = a.url ? { url: String(a.url).replace(/\/$/, ""), cerrar: async () => {} } : await iniciarServidor();
const navegador = await lanzarChromium();
const fallas = [];

const muestreo = () => {
  window.__cuadros = [];
  const t0 = performance.now();
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom };
  };
  const tick = () => {
    const tel = document.getElementById("escenario-3d");
    const tit = document.getElementById("titular");
    if (tel && tit) {
      const cs = getComputedStyle(tel);
      const visible = cs.visibility !== "hidden" && Number(cs.opacity) > 0.05 && getComputedStyle(tel.parentElement).display !== "none";
      window.__cuadros.push({ t: performance.now() - t0, tel: rect(tel), tit: rect(tit), visible, vendor: !!window.gsap });
    }
    if (performance.now() - t0 < 9000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const cruza = (p, q) => p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b;
const centro = (p) => (p.l + p.r) / 2;

for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }]) {
  for (const reducido of [false, true]) {
    for (const cpu of [1, 4]) {
      const nombre = `${viewport.width}×${viewport.height}${reducido ? " reducido" : ""} CPU ×${cpu}`;
      const ctx = await navegador.newContext({ viewport, reducedMotion: reducido ? "reduce" : "no-preference", colorScheme: "light" });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
      await page.addInitScript(scriptInicial({ tema: "light" }));
      await page.addInitScript(muestreo);
      await page.goto(`${srv.url}/`, { waitUntil: "load" });
      await page.waitForFunction(() => window.__cuadros?.length && window.__cuadros.at(-1).t > 2500 + (window.gsap ? 0 : 4000), null, { timeout: 30000 }).catch(() => {});
      await dormir(400);
      const cuadros = await page.evaluate(() => window.__cuadros);
      await ctx.close();
      const visibles = cuadros.filter((c) => c.visible);
      if (!visibles.length) {
        fallas.push(`${nombre}: el teléfono nunca se vio`);
        continue;
      }
      const encima = visibles.filter((c) => cruza(c.tel, c.tit));
      const primero = centro(visibles[0].tel);
      const final = centro(visibles.at(-1).tel);
      const salto = Math.abs(final - primero);
      const msgs = [];
      if (encima.length) msgs.push(`encima del titular en ${encima.length} cuadro(s), de ${Math.round(encima[0].t)} a ${Math.round(encima.at(-1).t)} ms`);
      if (salto > saltoMax) msgs.push(`el centro se movió ${salto.toFixed(1)} px entre el primer cuadro visible y el reposo`);
      if (msgs.length) fallas.push(`${nombre}: ${msgs.join("; ")}`);
      if (a.verbose || msgs.length) console.log(`  ${msgs.length ? "FALLA" : "ok   "} ${nombre}: ${cuadros.length} cuadros, primer visible ${Math.round(visibles[0].t)} ms, salto ${salto.toFixed(1)} px${msgs.length ? ` — ${msgs.join("; ")}` : ""}`);
    }
  }
}

await navegador.close();
await srv.cerrar();
if (fallas.length) salir(1, `arranque-telefono: ${fallas.length} falla(s)\n  - ${fallas.join("\n  - ")}`);
salir(0, "arranque-telefono: OK (el teléfono nace en su columna, sin encimarse al titular ni saltar)");
