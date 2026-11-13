#!/usr/bin/env node
/*
  medir-malla: mide el costo de la malla (#98) con Chromium emulado: ms de hilo principal por segundo (TaskDuration
  de CDP) en reposo y durante el scroll, fps de la página (rAF) en el scroll, tareas largas y costo por dibujo.
  No es una prueba (no falla): produce la tabla que va en la PR. Medianas de N corridas.
    node medir-malla.mjs [--movil|--escritorio] [--cpu 4] [--variantes apagada,normal,ligera,pausa-scroll,ligera-pausa]
                         [--corridas 3] [--extra "&malla-forzar=normal"] [--args "--disable-gpu"] [--url http://...]
  `--extra` se agrega a la query de cada variante (p. ej. `malla-forzar=normal` desactiva la degradación).
*/
import { iniciarServidor } from "./lib/servidor.mjs";
import { leerArgs, lanzarChromium, lista, dormir, scriptInicial } from "./lib/comun.mjs";

const a = leerArgs();
const movil = !a.escritorio;
const cpu = Number(a.cpu ?? (movil ? 4 : 1));
const corridas = Number(a.corridas ?? 3);
const variantes = lista(a.variantes, movil ? ["apagada", "normal", "ligera", "pausa-scroll", "ligera-pausa"] : ["apagada", "normal"]);
const extra = a.extra && a.extra !== true ? String(a.extra) : "";
const srv = a.url ? { url: String(a.url).replace(/\/$/, ""), cerrar: async () => {} } : await iniciarServidor();
const navegador = await lanzarChromium({ args: a.args && a.args !== true ? String(a.args).split(" ") : [] });
const med = (v) => {
  const o = v.filter(Number.isFinite).sort((x, y) => x - y);
  return o.length ? o[Math.floor(o.length / 2)] : NaN;
};

async function una(variante) {
  const ctx = await navegador.newContext({
    viewport: movil ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    colorScheme: "dark",
    isMobile: movil,
    hasTouch: movil,
    deviceScaleFactor: movil ? 2 : 1,
  });
  const page = await ctx.newPage();
  await page.addInitScript(scriptInicial({ tema: "dark" }));
  await page.addInitScript(() => {
    window.__r = { t: [], largas: 0 };
    const bucle = (t) => { window.__r.t.push(t); requestAnimationFrame(bucle); };
    requestAnimationFrame(bucle);
    try { new PerformanceObserver((l) => (window.__r.largas += l.getEntries().length)).observe({ type: "longtask" }); } catch {}
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const q = new URLSearchParams();
  if (variante === "apagada") q.set("malla", "apagada");
  else if (movil) q.set("malla-movil", variante);
  const url = `${srv.url}/?${q}${extra}`;
  await page.goto(url, { waitUntil: "load" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await dormir(a.espera ? Number(a.espera) : 3500);
  const tarea = async () => (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "TaskDuration").value;
  const info = () => page.evaluate(() => document.querySelector("canvas.malla-fondo")?.mallaInfo ?? null);
  // reposo 5 s
  const r0 = await page.evaluate(() => ({ n: window.__r.t.length, l: window.__r.largas }));
  const t0 = await tarea();
  const c0 = (await info())?.cuadros ?? 0;
  await dormir(5000);
  const t1 = await tarea();
  const r1 = await page.evaluate(() => ({ t: window.__r.t.slice(), largas: window.__r.largas }));
  const i1 = await info();
  const reposoMs = ((t1 - t0) * 1000) / 5;
  const reposoLargas = r1.largas - r0.l;
  const mallaFps = i1 ? (i1.cuadros - c0) / 5 : 0;
  // scroll: gestos táctiles (móvil) o rueda (escritorio) de ~4 s
  await page.evaluate(() => { window.__r.t.length = 0; window.__r.largas = 0; });
  const s0 = await tarea();
  const ini = Date.now();
  if (movil) {
    for (let k = 0; k < 4; k++) await cdp.send("Input.synthesizeScrollGesture", { x: 195, y: 700, yDistance: -600, speed: 700, gestureSourceType: "touch" });
  } else {
    await page.mouse.move(700, 450);
    for (let k = 0; k < 60; k++) { await page.mouse.wheel(0, 60); await dormir(35); }
  }
  const dur = (Date.now() - ini) / 1000;
  const s1 = await tarea();
  const sr = await page.evaluate(() => ({ t: window.__r.t.slice(), largas: window.__r.largas }));
  const dts = sr.t.slice(1).map((x, i) => x - sr.t[i]);
  const fpsScroll = (sr.t.length * 1000) / (sr.t.at(-1) - sr.t[0] || 1);
  const dts95 = dts.slice().sort((x, y) => x - y)[Math.floor(dts.length * 0.95)] ?? NaN;
  const i2 = await info();
  await ctx.close();
  return { reposoMs, reposoLargas, mallaFps, fpsScroll, p95Intervalo: dts95, scrollMs: ((s1 - s0) * 1000) / dur, scrollLargas: sr.largas, costoP50: i2?.costoP50 ?? NaN, costoJs: i2?.costoJsP50 ?? NaN, costoP95: i2?.costoP95 ?? NaN, nivel: i2?.nivel ?? NaN };
}

console.log(`# ${movil ? "móvil 390×844 DPR 2 táctil" : "escritorio 1440×900"} · CPU ×${cpu} · ${corridas} corridas (mediana)${extra ? ` · ${extra}` : ""}${a.args ? ` · ${a.args}` : ""}`);
console.log("| variante | reposo ms/s | reposo T.largas | scroll ms/s | scroll fps (rAF) | scroll p95 intervalo ms | scroll T.largas | malla dib/s | costo cuadro p50 / p95 ms (JS p50) | nivel deg. |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const v of variantes) {
  const rs = [];
  for (let i = 0; i < corridas; i++) rs.push(await una(v));
  const m = (k) => med(rs.map((r) => r[k]));
  const f = (n, d = 0) => (Number.isFinite(n) ? n.toFixed(d) : "–");
  console.log(`| ${v} | ${f(m("reposoMs"))} | ${f(m("reposoLargas"))} | ${f(m("scrollMs"))} | ${f(m("fpsScroll"))} | ${f(m("p95Intervalo"))} | ${f(m("scrollLargas"))} | ${f(m("mallaFps"))} | ${f(m("costoP50"), 1)} / ${f(m("costoP95"), 1)} | ${f(m("nivel"))} |`);
}
await navegador.close();
await srv.cerrar();
