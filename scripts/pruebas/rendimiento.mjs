#!/usr/bin/env node
/*
  rendimiento: presupuesto de rendimiento de la portada (Core Web Vitals) medido en Chromium real con
  el procesador ×4 más lento (como el móvil de Lighthouse) y red de 4G lenta. No sustituye a Lighthouse
  (`lighthouse.mjs`, que da la nota): mide lo que Lighthouse no ve o ve con ruido.
    - ARRANQUE (móvil 412×823, CPU ×4, 1.6 Mbps / 150 ms): el elemento LCP es TEXTO del hero (titular o
      subtítulo) y llega antes de --lcp-max ms; CLS = 0; tiempo de bloqueo (TBT, tareas largas después del
      primer pintado hasta `load` + 3 s) ≤ --tbt-max ms; ningún `<script src>` clásico en el <head> (los
      `defer` de GSAP se ejecutaban en la misma tarea que el análisis del HTML y Lighthouse los contaba
      como bloqueantes del primer pintado: LCP «bimodal» de 1.65 s o 2.3 s, issue de esta PR);
      GSAP/ScrollTrigger no se piden antes del primer pintado.
    - INTERACCIÓN (Event Timing por CDP, CPU ×4; el INP de laboratorio es la duración del evento hasta el
      siguiente pintado): clic en el toggle de tema (revelado circular con View Transitions), abrir y
      cerrar un <details> de las preguntas, clic en un punto de la navegación del recorrido (1440 px) y
      mover el mouse sobre el hero con la malla. Cada una ≤ --inp-max ms (200, el umbral «bueno» de INP).
  Uso: node rendimiento.mjs [--corridas 3] [--lcp-max 2000] [--tbt-max 250] [--inp-max 200] [--url http://...] [--verbose]
  La carga se mide con la mediana de las corridas; la interacción, con la PEOR de todas.
*/
import { iniciarServidor } from "./lib/servidor.mjs";
import { lanzarChromium, leerArgs, scriptInicial, dormir, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node rendimiento.mjs [--corridas 3] [--lcp-max 2000] [--tbt-max 250] [--inp-max 200] [--url http://...] [--verbose]");
const num = (k, d) => (a[k] && a[k] !== true ? Number(a[k]) : d);
const corridas = num("corridas", 3);
const lcpMax = num("lcp-max", 2000);
const tbtMax = num("tbt-max", 250);
const inpMax = num("inp-max", 200);
const srv = a.url ? { url: String(a.url).replace(/\/$/, ""), cerrar: async () => {} } : await iniciarServidor();
const navegador = await lanzarChromium();
const fallas = [];
const mediana = (xs) => [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)];
const ok = (cond, msg) => {
  if (a.verbose || !cond) console.log(`  ${cond ? "ok " : "FALLA"} ${msg}`);
  if (!cond) fallas.push(msg);
};

async function abrir(viewport, { movil, red }) {
  const ctx = await navegador.newContext({ viewport, isMobile: movil, hasTouch: movil, deviceScaleFactor: movil ? 2 : 1 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  if (red) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6e6 * 0.9) / 8, uploadThroughput: (750e3 * 0.9) / 8 });
  }
  await page.addInitScript(scriptInicial({ tema: "light" }));
  await page.addInitScript(() => {
    window.__m = { lcp: null, fcp: null, cls: 0, largas: [], eventos: [], vendorAntes: [] };
    const obs = (tipo, cb, extra = {}) => { try { new PerformanceObserver((l) => l.getEntries().forEach(cb)).observe({ type: tipo, buffered: true, ...extra }); } catch {} };
    obs("largest-contentful-paint", (e) => (window.__m.lcp = { t: e.startTime, el: e.element ? `${e.element.tagName}${e.element.id ? "#" + e.element.id : ""}.${String(e.element.className).split(" ")[0]}` : null, dentroDelHero: !!e.element?.closest?.("#hero"), texto: !!e.element && !/^(IMG|CANVAS|SVG|VIDEO)$/i.test(e.element.tagName) }));
    obs("paint", (e) => e.name === "first-contentful-paint" && (window.__m.fcp = e.startTime));
    obs("layout-shift", (e) => { if (!e.hadRecentInput) { window.__m.cls += e.value; (window.__m.saltos ||= []).push([Math.round(e.startTime), e.value, e.sources.map((x) => `${x.node?.nodeName}.${x.node?.className} ${Math.round(x.previousRect.y)}->${Math.round(x.currentRect.y)}`)]); } });
    obs("longtask", (e) => window.__m.largas.push([e.startTime, e.duration]));
    obs("event", (e) => window.__m.eventos.push({ nombre: e.name, dur: e.duration, ini: e.startTime }), { durationThreshold: 16 });
  });
  return { ctx, page, cdp };
}

/* ---------- arranque ---------- */
const lcps = [], tbts = [], clss = [];
let detalleLcp = null, vendorAntes = null;
for (let i = 0; i < corridas; i++) {
  const { ctx, page } = await abrir({ width: 412, height: 823 }, { movil: true, red: true });
  const pedidos = [];
  page.on("request", (r) => pedidos.push({ url: r.url(), t: Date.now() }));
  await page.goto(srv.url + "/", { waitUntil: "load" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await dormir(3000);
  const m = await page.evaluate(() => ({ ...window.__m, scriptsEnHead: [...document.head.querySelectorAll("script[src]")].filter((s) => s.type !== "module").map((s) => s.getAttribute("src")), hojas: document.querySelectorAll('link[rel="stylesheet"]').length }));
  lcps.push(m.lcp?.t ?? Infinity);
  clss.push(m.cls);
  tbts.push(m.largas.filter(([ini]) => ini >= (m.fcp ?? 0)).reduce((s, [, d]) => s + Math.max(0, d - 50), 0));
  detalleLcp = m.lcp;
  if (m.cls > 0) console.log("  saltos:", JSON.stringify(m.saltos));
  
  // ¿GSAP se pidió antes del primer pintado? (instante relativo: el FCP está en tiempo de la página)
  const gsapPedido = await page.evaluate(() => performance.getEntriesByType("resource").filter((r) => /gsap|ScrollTrigger/.test(r.name)).map((r) => r.startTime));
  vendorAntes = gsapPedido.some((t) => t < (m.fcp ?? 0));
  if (a.verbose) console.log(`  corrida ${i + 1}: LCP ${Math.round(m.lcp?.t)} ms (${m.lcp?.el}), FCP ${Math.round(m.fcp)}, CLS ${m.cls.toFixed(3)}, TBT ${Math.round(tbts.at(-1))}, tareas largas ${m.largas.length}, hojas ${m.hojas}`);
  await ctx.close();
}
ok(detalleLcp?.texto && detalleLcp?.dentroDelHero, `el elemento LCP es texto del hero (${detalleLcp?.el})`);
ok(mediana(lcps) <= lcpMax, `LCP de arranque (CPU ×4, 4G lenta): mediana ${Math.round(mediana(lcps))} ms ≤ ${lcpMax} (rango ${Math.round(Math.min(...lcps))}–${Math.round(Math.max(...lcps))})`);
ok(Math.max(...clss) < 0.001, `CLS del arranque = 0.000 (peor ${Math.max(...clss).toExponential(1)}; un chip se mueve una fracción de píxel al llegar un peso de la fuente)`);
ok(mediana(tbts) <= tbtMax, `TBT de arranque: mediana ${Math.round(mediana(tbts))} ms ≤ ${tbtMax} (rango ${Math.round(Math.min(...tbts))}–${Math.round(Math.max(...tbts))})`);
// El HTML tal como llega (GSAP lo inyecta main.js después; eso no cuenta).
const html = await (await fetch(srv.url + "/")).text();
const scriptsEnHead = [...(html.match(/<head>[\s\S]*<\/head>/)?.[0] ?? "").matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].filter((m) => !/type="module"/.test(m[0])).map((m) => m[1]);
ok(scriptsEnHead.length === 0, `ningún <script src> clásico en el <head> (${scriptsEnHead.join(", ") || "ninguno"})`);
ok(!vendorAntes, "GSAP y ScrollTrigger no se piden antes del primer pintado");

/* ---------- interacción ---------- */
const peor = {};
const anotar = (nombre, ms) => (peor[nombre] = Math.max(peor[nombre] ?? 0, ms));
async function medir(page, nombre, accion) {
  await page.evaluate(() => (window.__m.eventos.length = 0));
  await accion();
  await dormir(900);
  const evs = await page.evaluate(() => window.__m.eventos);
  const clic = evs.filter((e) => /^(click|pointerdown|pointerup|mousedown|mouseup|keydown|keyup)$/.test(e.nombre));
  const mouse = evs.filter((e) => /^(pointermove|mousemove|mouseover|mouseenter|pointerover|pointerenter)$/.test(e.nombre));
  const de = nombre.startsWith("mouse") ? mouse : clic;
  anotar(nombre, de.length ? Math.max(...de.map((e) => e.dur)) : 0); // sin entradas = por debajo de 16 ms
}
for (let i = 0; i < corridas; i++) {
  const { ctx, page } = await abrir({ width: 1440, height: 900 }, { movil: false, red: false });
  await page.goto(srv.url + "/", { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await dormir(2500); // la malla arranca con load + idle
  await medir(page, "toggle de tema", () => page.click("[data-theme-toggle]"));
  await medir(page, "toggle de tema (volver)", () => page.click("[data-theme-toggle]"));
  await medir(page, "mouse sobre el hero", async () => {
    for (let k = 0; k < 40; k++) { await page.mouse.move(200 + k * 20, 200 + (k % 8) * 30); await dormir(16); }
  });
  await page.evaluate(() => document.querySelector("details.pregunta")?.scrollIntoView({ block: "center" }));
  await dormir(1200);
  await medir(page, "abrir <details>", () => page.click("details.pregunta summary"));
  await medir(page, "cerrar <details>", () => page.click("details.pregunta summary"));
  await page.evaluate(() => window.scrollTo(0, 0));
  await dormir(1200);
  await medir(page, "punto de la navegación", () => page.click(".nav-recorrido li:nth-child(3) a"));
  await ctx.close();
}
for (const [nombre, ms] of Object.entries(peor)) ok(ms <= inpMax, `${nombre}: peor ${Math.round(ms)} ms ≤ ${inpMax} (CPU ×4)`);

await navegador.close();
await srv.cerrar();
if (fallas.length) {
  console.error(`rendimiento: ${fallas.length} FALLA(S)`);
  process.exit(1);
}
console.log(`rendimiento: OK (LCP ${Math.round(mediana(lcps))} ms, TBT ${Math.round(mediana(tbts))} ms, CLS 0; interacción peor ${Math.round(Math.max(...Object.values(peor)))} ms)`);
