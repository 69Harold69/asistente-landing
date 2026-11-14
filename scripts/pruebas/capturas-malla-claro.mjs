#!/usr/bin/env node
/* Capturas de la malla en tema claro por intensidad (#98): hoy / 1 / 2 / 3 (y «hoy» en oscuro). Uso: node capturas-malla-claro.mjs --salida DIR */
import path from "node:path";
import { iniciarServidor } from "./lib/servidor.mjs";
import { ruedaHasta } from "./lib/scroll.mjs";
import { leerArgs, lanzarChromium, carpetaSalida, scriptInicial, esperarCarga, dormir } from "./lib/comun.mjs";
const a = leerArgs();
const salida = carpetaSalida(a.salida, "~/Pictures/yaruki-landing-2026-11/v2/malla-claro");
const srv = await iniciarServidor();
const nav = await lanzarChromium();
const TAM = { escritorio: { w: 1440, h: 900, movil: false }, movil: { w: 390, h: 844, movil: true } };
const SEC = ["hero", "fase-chat", "como-funciona", "preguntas"];
const combos = [["claro", "0"], ["claro", "1"], ["claro", "2"], ["claro", "3"], ["oscuro", "0"], ["oscuro", "3"]];
for (const [tamN, t] of Object.entries(TAM)) for (const [tema, v] of combos) {
  const ctx = await nav.newContext({ viewport: { width: t.w, height: t.h }, deviceScaleFactor: 1, isMobile: t.movil, hasTouch: t.movil, colorScheme: tema === "claro" ? "light" : "dark", locale: "es-MX", timezoneId: "America/Mexico_City" });
  await ctx.addInitScript(scriptInicial({ tema: tema === "claro" ? "light" : "dark" }));
  const page = await ctx.newPage();
  await page.goto(`${srv.url}/${v === "0" ? "" : "?malla-claro=" + v}`, { waitUntil: "load" });
  await esperarCarga(page, { portada: true });
  await page.waitForSelector("canvas.malla-fondo", { state: "attached", timeout: 8000 });
  await dormir(800);
  for (const id of SEC) {
    const y = await page.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect(); return Math.max(0, scrollY + r.top - 40); }, id);
    await ruedaHasta(page, Math.round(id === "hero" ? 0 : y), { paso: 220, pausaMs: 25 });
    await dormir(1800);
    if (!t.movil) await page.mouse.move(t.w * 0.7, t.h * 0.5, { steps: 6 });
    await dormir(700);
    await page.screenshot({ path: path.join(salida, `${tamN}-${tema}-${v}-${id}.png`) });
  }
  await ctx.close();
}
await nav.close(); await srv.cerrar();
