#!/usr/bin/env node
/*
  vidrio-franja (#100): en móvil la franja fija del teléfono (`.stage`) debe dejar ver la malla de borde a borde. Con
  reduced-motion (malla estática) se compara la captura normal contra otra con el texto y las tarjetas ocultos (solo la malla,
  sin la franja): fuera de la caja del teléfono, dentro de la franja, los píxeles deben ser iguales (sin franjas sólidas).
  390×844 y 360×800, claro y oscuro, DPR 3, con gesto táctil real hasta la sección. Sale con 1 si más de 0.5 % difiere.
*/
import fs from "node:fs";
import { leerArgs, lanzarChromium, scriptInicial, esperarCarga, dormir } from "./lib/comun.mjs";
import { iniciarServidor } from "./lib/servidor.mjs";
const a = leerArgs();
const srv = await iniciarServidor();
const nav = await lanzarChromium();
const out = a.salida && a.salida !== true ? a.salida : "/tmp/yaruki-franja"; fs.mkdirSync(out, { recursive: true });
let fallo = false;
const limpia = await nav.newPage();
for (const [w, h] of [[390, 844], [360, 800]]) for (const tema of ["light", "dark"]) {
  const ctx = await nav.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: tema, reducedMotion: "reduce", locale: "es-MX" });
  await ctx.addInitScript(scriptInicial({ tema }));
  const page = await ctx.newPage();
  await page.goto(srv.url + "/?" + (a.q ?? "vidrio=1"), { waitUntil: "load" });
  await esperarCarga(page, { portada: true });
  await dormir(1200);
  // gesto táctil real: arrastres con CDP
  const cdp = await ctx.newCDPSession(page);
  const y0 = await page.evaluate(() => document.getElementById("fase-chat").getBoundingClientRect().top + scrollY + 200);
  for (let it = 0; it < 25 && (await page.evaluate(() => scrollY)) < y0 - 5; it++) {
    await cdp.send("Input.synthesizeScrollGesture", { x: w / 2, y: h * 0.7, yDistance: -Math.min(400, y0 - (await page.evaluate(() => scrollY))), speed: 1500, gestureSourceType: "touch" });
    await dormir(300);
  }
  await page.evaluate((y) => scrollTo(0, y), y0);
  await dormir(1500);
  const info = await page.evaluate(() => { const r = document.getElementById("stage").getBoundingClientRect(); const p = document.getElementById("telefono").getBoundingClientRect(); return { stage: [r.top, r.bottom], phone: [p.left, p.top, p.right, p.bottom], ph: innerHeight }; });
  const A = await page.screenshot({ path: `${out}/${w}-${tema}-normal.png` });
  await page.evaluate(() => { const s = document.createElement("style"); }).catch(() => {});
  await page.evaluate(() => { const h = new CSSStyleSheet(); h.replaceSync("#stage{visibility:hidden!important} main *{color:transparent!important;background:transparent!important;box-shadow:none!important;border-color:transparent!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important} main *::before,main *::after{opacity:0!important}"); document.adoptedStyleSheets = [h]; });
  await dormir(500);
  const B = await page.screenshot({ path: `${out}/${w}-${tema}-solo-malla.png` });
  // diff en la franja, fuera de la caja del teléfono (margen 12 px), sobre el alto de la franja
  const res = await limpia.evaluate(async ({ A, B, info, w, h }) => {
    const dec = async (b64) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const bmp = await createImageBitmap(new Blob([bin], { type: "image/png" })); const c = new OffscreenCanvas(bmp.width, bmp.height); const x = c.getContext("2d"); x.drawImage(bmp, 0, 0); return [x.getImageData(0, 0, bmp.width, bmp.height).data, bmp.width]; };
    const [da, W] = await dec(A); const [db] = await dec(B);
    const s = 3; let n = 0, malo = 0, maxd = 0; const filas = {};
    const top = Math.max(0, Math.round(info.stage[0] * s)), bot = Math.min(h * s, Math.round(info.stage[1] * s) - 6); // la franja (el degradado de abajo lleva texto que se desvanece)
    for (let y = top; y < bot; y++) for (let x = 0; x < W; x++) {
      const px = x / s, py = y / s;
      if (px > info.phone[0] - 30 && px < info.phone[2] + 30 && py > info.phone[1] - 30 && py < info.phone[3] + 45) continue; // caja del teléfono y su sombra
      const i = (y * W + x) * 4; const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      n++; if (d > 6) { malo++; filas[Math.floor(py / 10) * 10] = (filas[Math.floor(py / 10) * 10] ?? 0) + 1; } maxd = Math.max(maxd, d);
    }
    return { n, malo, pct: (100 * malo / n).toFixed(2), maxd, filas };
  }, { A: A.toString("base64"), B: B.toString("base64"), info, w, h });
  console.log(w, tema, `franja ${info.stage.map(Math.round)} ${res.pct} % de píxeles distintos (máx ${res.maxd})`);
  if (Number(res.pct) > 0.5) fallo = true;
  await ctx.close();
}
await nav.close(); await srv.cerrar(); console.log(fallo ? "FALLA: la franja tapa la malla" : "la malla es continua en la franja"); process.exit(fallo ? 1 : 0);
