#!/usr/bin/env node
/*
  cls: Layout Instability API en Chromium con red limitada (las fuentes llegan tarde, como en un
  teléfono) sobre las páginas legales, la 404 y la portada, 3 corridas por combo.
  Falla si el CLS de alguna corrida pasa de --max (0.02 por defecto) y muestra los desplazamientos.
  Causa típica: el cambio de la fuente de respaldo a la real reacomoda renglones (los respaldos de
  `fonts.css` y `fuentes-portada.css` deben tener las métricas de la fuente real: size-adjust y
  ascent/descent-override).

  Portada (#49): las dos fuentes del hero van con `preload` y casi siempre llegan antes del primer
  pintado, así que su CLS con red limitada sale 0 aunque el respaldo esté mal. Por eso en la portada:
    - en 360, 390, 412, 820, 1024 y 1440 px, el CLS se mide además con las fuentes RETRASADAS
      1.5 s (llegan con el texto ya pintado);
    - «reacomodo», en un barrido de 320 a 480 px cada 4 px: el hero con las fuentes bloqueadas (solo
      respaldo) contra el hero con las fuentes cargadas (renglones del titular, el significado, el
      subtítulo, el LCP, y la nota; nada debajo puede moverse más de 1 px). Falla si se reacomoda en
      más de --max-reacomodo (15 %) de los anchos. No se exige cero: con `text-wrap: pretty/balance`
      un renglón al límite salta con diferencias de 0.1 % de ancho, y afinar el `size-adjust` para
      que no salte en un ancho dado es sobreajustar a un texto (auditoría de #49). Sin respaldo
      ajustado, con Roboto, salta en ~25 % de los anchos; con el respaldo medido, en ~5 %.
  Tablet y escritorio entran con fuentes tarde (#53): el titular ya no depende del `ch` de la fuente
  que esté pintando (su `max-width` va en `em`, que sale del `font-size` y no de la fuente).

  --android DIR simula Android: Chromium con un fontconfig propio que solo ve las fuentes de DIR más
  Noto, con `sans-serif`, `system-ui` y `ui-rounded` → Roboto, sin Arial ni Liberation Sans y sin
  hinting (como Android). Lo más fiel es la Roboto variable del propio Android (`Roboto-Regular.ttf`,
  Roboto 3, un solo archivo con eje `wght`): viene en el SDK/Android Studio
  (`plugins/design-tools/resources/layoutlib/data/fonts/Roboto-Regular.ttf`) y en AOSP
  (`external/roboto-fonts`). Sirven también las estáticas de Roboto 3 (`Roboto-Regular.ttf` y
  `Roboto-Bold.ttf`, https://github.com/googlefonts/roboto-3-classic/releases o Google Fonts); los
  anchos de Regular son idénticos. Licencia: SIL OFL 1.1 (Roboto 3; Roboto 2 era Apache-2.0). No las
  metas al repo. Sin la bandera se usan las fuentes del sistema.

  Uso: node cls.mjs [--paginas /,/eliminar-cuenta/] [--max 0.02] [--max-reacomodo 0.15] [--corridas 3] [--android DIR] [--verbose]
*/
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { iniciarServidor } from "./lib/servidor.mjs";
import { lanzarChromium, leerArgs, lista, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node cls.mjs [--paginas /,/eliminar-cuenta/] [--max 0.02] [--max-reacomodo 0.15] [--corridas 3] [--android DIR] [--verbose]");
const paginas = lista(a.paginas, ["/", "/privacidad/", "/terminos/", "/eliminar-cuenta/", "/404.html"]);
const max = a.max && a.max !== true ? Number(a.max) : 0.02;
const corridas = a.corridas && a.corridas !== true ? Number(a.corridas) : 3;
const TAMANOS = { escritorio: { width: 1350, height: 940 }, movil: { width: 412, height: 823 } };
const TAMANOS_PORTADA = { "movil-360": { width: 360, height: 740 }, "movil-390": { width: 390, height: 844 }, movil: { width: 412, height: 823 }, "tablet-820": { width: 820, height: 1180 }, "escritorio-1024": { width: 1024, height: 768 }, "escritorio-1440": { width: 1440, height: 900 } };
const RETRASO_FUENTES = 1500;
const maxReacomodo = a["max-reacomodo"] && a["max-reacomodo"] !== true ? Number(a["max-reacomodo"]) : 0.15;
const ANCHOS_BARRIDO = Array.from({ length: 41 }, (_, i) => 320 + 4 * i);
const HERO = ["#titular", ".hero-significado", ".subtitulo-hero", ".cta-nota"];

/** fontconfig temporal que solo ve las fuentes de `dir` (+ Noto): Android sin Arial ni Liberation. */
function fontconfigAndroid(dir) {
  const abs = path.resolve(String(dir).replace(/^~(?=$|\/)/, os.homedir()));
  if (!fs.existsSync(abs) || !fs.readdirSync(abs).some((f) => /^Roboto.*\.(ttf|otf)$/i.test(f))) salir(2, `cls: --android ${abs} no tiene fuentes Roboto (.ttf/.otf)`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "yaruki-fc-"));
  const dirs = [abs, "/usr/share/fonts/noto", "/usr/share/fonts/noto-cjk"].filter((d) => fs.existsSync(d));
  const alias = ["sans-serif", "system-ui", "ui-rounded"].map((f) => `<alias binding="strong"><family>${f}</family><prefer><family>Roboto</family></prefer></alias>`).join("");
  const archivo = path.join(tmp, "fonts.conf");
  // Android no aplica el hinting TrueType: con hinting, Chromium de Linux redondea los avances de Roboto a
  // píxeles enteros y a 14 px el respaldo mide ~3% menos que en un teléfono (a 18 px, no). Sin hinting, la
  // proporción respaldo/real es la misma en todos los tamaños, como en Android.
  const sinHinting = '<match target="font"><edit name="hinting" mode="assign"><bool>false</bool></edit><edit name="hintstyle" mode="assign"><const>hintnone</const></edit></match>';
  fs.writeFileSync(archivo, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>${dirs.map((d) => `<dir>${d}</dir>`).join("")}<cachedir>${tmp}/cache</cachedir>${alias}${sinHinting}</fontconfig>`);
  return { archivo, tmp };
}

const android = a.android && a.android !== true ? fontconfigAndroid(a.android) : null;
const servidor = await iniciarServidor();
const navegador = await lanzarChromium(android ? { env: { ...process.env, FONTCONFIG_FILE: android.archivo } } : {});
const fallas = [];

async function medirCls(ruta, viewport, { retraso = 0 } = {}) {
  const ctx = await navegador.newContext({ viewport, isMobile: viewport.width < 1024 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 1.6e6, uploadThroughput: 1e6 });
  if (retraso) await page.route(/\.woff2(\?|$)/, async (r) => { await new Promise((z) => setTimeout(z, retraso)); await r.continue(); });
  await page.addInitScript(() => {
    try { sessionStorage.setItem("yaruki-theme-demo-visto", "1"); } catch {}
    window.__ls = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        window.__ls.push({ v: e.value, t: Math.round(e.startTime), s: e.sources.map((x) => `${x.node?.nodeName} ${Math.round(x.previousRect.y)}->${Math.round(x.currentRect.y)}`) });
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(servidor.url + ruta);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(retraso ? 1500 : 800);
  const ls = await page.evaluate(() => window.__ls);
  await ctx.close();
  return { cls: ls.reduce((s, e) => s + e.v, 0), ls };
}

/** Renglones y posición de los bloques del hero, con movimiento reducido (sin transformaciones). */
async function heroCon(viewport, bloquear) {
  const ctx = await navegador.newContext({ viewport, isMobile: true, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  if (bloquear) await page.route(/\.woff2(\?|$)/, (r) => r.abort());
  await page.goto(servidor.url + "/", { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const r = await page.evaluate((sels) => Object.fromEntries(sels.map((s) => {
    const e = document.querySelector(s);
    if (!e) return [s, null];
    let top = 0;
    for (let x = e; x; x = x.offsetParent) top += x.offsetTop;
    return [s, { top, alto: e.offsetHeight, renglones: Math.round(e.offsetHeight / parseFloat(getComputedStyle(e).lineHeight)) }];
  })), HERO);
  await ctx.close();
  return r;
}

try {
  for (const ruta of paginas) {
    const portada = ruta === "/";
    for (const [tam, viewport] of Object.entries(portada ? TAMANOS_PORTADA : TAMANOS)) {
      for (const retraso of portada ? [0, RETRASO_FUENTES] : [0]) {
        const valores = [];
        for (let k = 0; k < corridas; k++) {
          const { cls, ls } = await medirCls(ruta, viewport, { retraso });
          valores.push(cls);
          if (cls > max) fallas.push(`${ruta} ${tam}${retraso ? " fuentes tarde" : ""} corrida ${k + 1}: CLS ${cls.toFixed(3)} > ${max} (${JSON.stringify(ls.filter((e) => e.v > 0.005))})`);
        }
        if (a.verbose || fallas.length) console.log(`${ruta} ${tam}${retraso ? " fuentes tarde" : ""}: ${valores.map((v) => v.toFixed(3)).join(" ")}`);
      }
    }
    if (portada) {
      const saltos = [];
      for (const width of ANCHOS_BARRIDO) {
        const viewport = { width, height: 800 };
        const respaldo = await heroCon(viewport, true);
        const real = await heroCon(viewport, false);
        const difs = [];
        for (const s of HERO) {
          const x = respaldo[s], y = real[s];
          if (!x || !y) continue;
          if (x.renglones !== y.renglones) difs.push(`${s} ${x.renglones}→${y.renglones} renglones`);
          if (Math.abs(y.top - x.top) > 1) difs.push(`${s} se mueve ${y.top - x.top} px`);
        }
        if (difs.length) saltos.push(`${width} px: ${difs.join("; ")}`);
      }
      const resumen = `/ reacomodo del hero al llegar las fuentes en ${saltos.length} de ${ANCHOS_BARRIDO.length} anchos (320–480 px; máximo ${Math.floor(maxReacomodo * ANCHOS_BARRIDO.length)})`;
      if (saltos.length > maxReacomodo * ANCHOS_BARRIDO.length) fallas.push(`${resumen}: ${saltos.join(" | ")}`);
      if (a.verbose || saltos.length) console.log(`${resumen}${saltos.length ? "\n  " + saltos.join("\n  ") : ""}`);
    }
  }
} finally {
  await navegador.close();
  await servidor.cerrar();
  if (android) fs.rmSync(android.tmp, { recursive: true, force: true });
}
const donde = android ? " (simulando Android: solo Roboto)" : "";
if (fallas.length) {
  console.error(`cls: ${fallas.length} FALLA(S)${donde}`);
  for (const f of fallas) console.error(`  FALLA ${f}`);
  process.exit(1);
}
console.log(`cls: OK${donde} (CLS <= ${max} en ${paginas.length} páginas × ${corridas} corridas; portada también con fuentes tarde y reacomodo del hero acotado)`);
