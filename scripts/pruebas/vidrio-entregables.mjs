#!/usr/bin/env node
/*
  vidrio-entregables (#100): genera las láminas y los videos que revisa el dueño. Herramienta manual (no es una prueba).
    node vidrio-entregables.mjs laminas  --base RAIZ_ANTES [--salida DIR] [--solo-movil]      antes (sin vidrio) / después (?vidrio=1), 4 combos
    node vidrio-entregables.mjs barrido  [--rellenos 0.25,0.30,...] [--id fase-chat]  la misma sección a varios rellenos
    node vidrio-entregables.mjs formas                                         separada | única, lado a lado
    node vidrio-entregables.mjs respaldos                                      reduced-transparency y sin backdrop-filter
    node vidrio-entregables.mjs videos                                         recorrido completo, claro/oscuro, escritorio (quieto y con mouse) y móvil táctil
  `RAIZ_ANTES` es otra copia del sitio (git worktree de origin/integracion-v2) servida con el mismo servidor de pruebas.
*/
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { iniciarServidor } from "./lib/servidor.mjs";
import { ruedaHasta } from "./lib/scroll.mjs";
import { leerArgs, lanzarChromium, carpetaSalida, scriptInicial, esperarCarga, dormir } from "./lib/comun.mjs";

const a = leerArgs();
const modo = process.argv[2];
const salida = carpetaSalida(a.salida, "~/Pictures/yaruki-landing-2026-11/v2/vidrio");
const SECCIONES = ["hero", "fase-chat", "fase-elementos", "fase-habitos", "fase-avisos", "fase-llamada", "cta", "como-funciona", "lo-que-viene", "preguntas", "quien-esta-detras"];
const TAM = { escritorio: { w: 1440, h: 900, movil: false }, movil: { w: 390, h: 844, movil: true } };
const TEMA = { claro: "light", oscuro: "dark" };
const COMBOS = [["claro", "escritorio"], ["oscuro", "escritorio"], ["claro", "movil"], ["oscuro", "movil"]].filter(([, tam]) => !a["solo-movil"] || tam === "movil");

const nav = await lanzarChromium();
const srv = await iniciarServidor();
const srvBase = a.base ? await iniciarServidor({ raiz: path.resolve(String(a.base)) }) : null;

async function abrir(url, { tema, tam, extra = {}, rutaCss = null, video = null, cdpMedia = null }) {
  const t = TAM[tam];
  const ctx = await nav.newContext({ viewport: { width: t.w, height: t.h }, deviceScaleFactor: 1, isMobile: t.movil, hasTouch: t.movil, colorScheme: TEMA[tema], locale: "es-MX", timezoneId: "America/Mexico_City", ...(video ? { recordVideo: { dir: video, size: t.movil ? { width: 390, height: 844 } : { width: 1280, height: 800 } } } : {}), ...extra });
  await ctx.addInitScript(scriptInicial({ tema: TEMA[tema] }));
  if (rutaCss) await ctx.route("**/assets/css/base.css*", async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: rutaCss(await res.text()) }); });
  const page = await ctx.newPage();
  if (cdpMedia) { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setEmulatedMedia", { features: cdpMedia }); }
  await page.goto(url, { waitUntil: "load" });
  await esperarCarga(page, { portada: true });
  await page.waitForSelector("canvas.malla-fondo", { state: "attached", timeout: 8000 }).catch(() => {});
  await dormir(600);
  return { ctx, page };
}

async function irA(page, id, tam) {
  const y = await page.evaluate(([id, vh]) => { const r = document.getElementById(id).getBoundingClientRect(); return id === "hero" ? 0 : Math.max(0, Math.round(scrollY + r.top + Math.min(r.height, vh) / 2 - vh / 2 + (r.height > vh * 1.2 ? 0 : 0))); }, [id, TAM[tam].h]);
  await ruedaHasta(page, y, { paso: 240, pausaMs: 22 });
  // espera a que el texto termine de entrar
  for (let i = 0; i < 16; i++) {
    await dormir(350);
    const ok = await page.evaluate((id) => { const s = document.getElementById(id); let op = 1; for (let p = s.firstElementChild; p && p !== s; p = p.parentElement) op *= Number(getComputedStyle(p).opacity); return [...s.children].every((c) => Number(getComputedStyle(c).opacity) >= 0.99) && Number(getComputedStyle(s).opacity) >= 0.99; }, id).catch(() => true);
    if (ok && i > 2) break;
  }
  await dormir(500);
}

const montar = (archivos, destino, tile, geom, titulo) => spawnSync("montage", [...archivos, "-tile", tile, "-geometry", geom, "-background", "#888", ...(titulo ? ["-title", titulo] : []), destino], { stdio: "inherit" });

if (modo === "laminas") {
  if (!srvBase) { console.error("falta --base"); process.exit(2); }
  const dirTmp = path.join(salida, "_tmp"); fs.mkdirSync(dirTmp, { recursive: true });
  for (const [tema, tam] of COMBOS) {
    const archivos = [];
    for (const [k, url] of [["antes", srvBase.url + "/"], ["despues", srv.url + "/?vidrio=1"]]) {
      const { ctx, page } = await abrir(url, { tema, tam });
      for (const id of SECCIONES) {
        await irA(page, id, tam);
        const f = path.join(dirTmp, `${k}-${tema}-${tam}-${id}.png`);
        await page.screenshot({ path: f });
      }
      await ctx.close();
    }
    for (const id of SECCIONES) archivos.push(path.join(dirTmp, `antes-${tema}-${tam}-${id}.png`), path.join(dirTmp, `despues-${tema}-${tam}-${id}.png`));
    // una lámina por sección: antes | después
    for (const id of SECCIONES) montar(archivos.filter((f) => f.includes(`-${tema}-${tam}-${id}.png`)), path.join(salida, `lamina-${tema}-${tam}-${id}.png`), "2x1", tam === "escritorio" ? "960x600+6+6" : "390x844+6+6", `${id} — ${tema} ${tam}: izquierda integracion-v2 sin vidrio, derecha ?vidrio=1`);
    console.log("combo", tema, tam, "ok");
  }
}

if (modo === "barrido") {
  const rellenos = String(a.rellenos ?? "0.20,0.25,0.30,0.35,0.40,0.60").split(",");
  const id = a.id ?? "fase-chat";
  for (const tema of ["claro", "oscuro"]) {
    const fs_ = [];
    for (const r of rellenos) {
      const { ctx, page } = await abrir(`${srv.url}/?vidrio=1&vidrio-relleno=${r}`, { tema, tam: "escritorio" });
      await irA(page, id, "escritorio");
      await page.mouse.move(1100, 450, { steps: 6 });
      await dormir(800);
      const f = path.join(salida, `_tmp-barrido-${tema}-${r}.png`);
      await page.screenshot({ path: f, clip: { x: 740, y: 120, width: 700, height: 660 } });
      fs_.push(f);
      await ctx.close();
    }
    montar(fs_, path.join(salida, `barrido-relleno-${tema}.png`), "3x", "700x660+6+6", `relleno (de izq. a der., arriba a abajo): ${rellenos.join(" / ")} — ${tema}`);
    fs_.forEach((f) => fs.unlinkSync(f));
  }
}

if (modo === "formas") {
  for (const [tema, tam] of COMBOS) for (const id of ["fase-chat", "como-funciona", "preguntas", "hero"]) {
    const fs_ = [];
    for (const forma of ["separada", "unica"]) {
      const { ctx, page } = await abrir(`${srv.url}/?vidrio=1${forma === "unica" ? "&vidrio-forma=unica" : ""}`, { tema, tam });
      await irA(page, id, tam);
      const f = path.join(salida, `_tmp-forma-${forma}.png`);
      await page.screenshot({ path: f });
      fs_.push(f);
      await ctx.close();
    }
    montar(fs_, path.join(salida, `formas-${tema}-${tam}-${id}.png`), "2x1", tam === "escritorio" ? "960x600+6+6" : "390x844+6+6", `${id} ${tema} ${tam}: izquierda separada (recomendada), derecha única`);
    fs_.forEach((f) => fs.unlinkSync(f));
  }
}

if (modo === "respaldos") {
  const variantes = {
    "reduced-transparency": { cdpMedia: [{ name: "prefers-reduced-transparency", value: "reduce" }] },
    "sin-backdrop-filter": { rutaCss: (css) => css.replaceAll("@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))", "@supports (nunca-existe: 1)") },
    "contraste-mas": { cdpMedia: [{ name: "prefers-contrast", value: "more" }] },
  };
  for (const [nombre, v] of Object.entries(variantes)) for (const [tema, tam] of COMBOS) for (const id of ["fase-chat", "preguntas"]) {
    const { ctx, page } = await abrir(`${srv.url}/?vidrio=1`, { tema, tam, ...v });
    await irA(page, id, tam);
    const filtro = await page.evaluate((id) => getComputedStyle(document.getElementById(id), "::after").backdropFilter, id);
    await page.screenshot({ path: path.join(salida, `respaldo-${nombre}-${tema}-${tam}-${id}.png`) });
    console.log(nombre, tema, tam, id, "backdrop-filter:", filtro);
    await ctx.close();
  }
}

if (modo === "videos") {
  const dirV = path.join(salida, "_v"); fs.mkdirSync(dirV, { recursive: true });
  const alto = (page) => page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  for (const [tema, tam, mouse] of [["claro", "escritorio", false], ["oscuro", "escritorio", false], ["claro", "escritorio", true], ["oscuro", "escritorio", true], ["claro", "movil", false], ["oscuro", "movil", false]].filter(([, tam]) => !a["solo-movil"] || tam === "movil")) {
    const nombre = `recorrido-${tema}-${tam}${tam === "escritorio" ? (mouse ? "-con-mouse" : "-quieto") : "-tactil"}`;
    const dir = path.join(dirV, nombre); fs.mkdirSync(dir, { recursive: true });
    const { ctx, page } = await abrir(`${srv.url}/?vidrio=1`, { tema, tam, video: dir });
    const cdp = tam === "movil" ? await ctx.newCDPSession(page) : null;
    const max = await alto(page);
    const t = TAM[tam];
    let y = 0, k = 0;
    while (y < max - 2) {
      const paso = Math.min(tam === "movil" ? 360 : 300, max - y);
      if (cdp) await cdp.send("Input.synthesizeScrollGesture", { x: t.w / 2, y: t.h * 0.75, yDistance: -paso, speed: 700, gestureSourceType: "touch" });
      else { for (let i = 0; i < paso; i += 60) { await page.mouse.wheel(0, Math.min(60, paso - i)); await dormir(18); } }
      if (mouse && !cdp) await page.mouse.move(300 + 700 * ((k % 4) / 3), 200 + 450 * (((k * 7) % 5) / 4), { steps: 18 });
      await dormir(tam === "movil" ? 1100 : 1000);
      y = await page.evaluate(() => scrollY); k++;
      if (k > 80) break;
    }
    await dormir(1500);
    const v = page.video();
    await ctx.close();
    fs.renameSync(await v.path(), path.join(salida, `${nombre}.webm`));
    console.log(nombre);
  }
  fs.rmSync(dirV, { recursive: true, force: true });
}

await nav.close();
await srv.cerrar();
await srvBase?.cerrar();
fs.rmSync(path.join(salida, "_tmp"), { recursive: true, force: true });
process.exit(0);
