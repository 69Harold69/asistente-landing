#!/usr/bin/env node
/*
  lighthouse: Lighthouse movil y escritorio, las 4 categorias (rendimiento, accesibilidad,
  buenas practicas, SEO), N corridas por combinacion y MEDIANA de cada numero (una sola
  corrida es ruidosa). Guarda el JSON completo de la corrida mediana, un resumen.json y un
  resumen.md (tabla) con LCP, CLS, TBT (y FCP / Speed Index).

  INP no se mide: Lighthouse solo lo calcula en modo "timespan" con interacciones y el
  sitio no tiene nada que medir ahi; en laboratorio TBT es el sustituto estandar.

  Uso: node lighthouse.mjs [--salida DIR] [--corridas 3] [--paginas /,/privacidad/] [--todas]
         [--comparar CARPETA_BASE] [--tolerancia-rendimiento 2] [--url http://...]

  --comparar: falla (exit 1) si alguna categoria de la corrida nueva queda < 90 o
  peor que la base. La base se lee de CARPETA_BASE/resumen.json. Rendimiento admite
  --tolerancia-rendimiento puntos de ruido (por defecto 2, ver README); las demas, 0.
*/
import fs from "node:fs";
import path from "node:path";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import { launch } from "chrome-launcher";
import { iniciarServidor } from "./lib/servidor.mjs";
import { leerArgs, lista, rutaChromium, carpetaSalida, slug, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace("#!/usr/bin/env node\n/*", "").trim());

const CATEGORIAS = ["performance", "accessibility", "best-practices", "seo"];
const ETIQ = { performance: "Rend.", accessibility: "Accesib.", "best-practices": "B. prácticas", seo: "SEO" };
const METRICAS = { lcp: "largest-contentful-paint", cls: "cumulative-layout-shift", tbt: "total-blocking-time", fcp: "first-contentful-paint", si: "speed-index" };
const salida = carpetaSalida(a.salida, "~/Pictures/yaruki-landing-2026-11/lighthouse");
const corridas = Number(a.corridas ?? 3);
const paginas = a.todas ? ["/", "/privacidad/", "/terminos/", "/eliminar-cuenta/", "/organizar-tareas-con-ia/", "/recordatorios-por-voz/"] : lista(a.paginas, ["/"]);
const tolPerf = Number(a["tolerancia-rendimiento"] ?? 2);
const mediana = (xs) => {
  const s = [...xs].sort((p, q) => p - q);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const srv = a.url ? { url: String(a.url).replace(/\/$/, ""), cerrar: async () => {} } : await iniciarServidor();
const resumen = { generado: new Date().toISOString(), corridas, lighthouse: (await import("lighthouse/package.json", { with: { type: "json" } })).default.version, resultados: {} };

for (const ruta of paginas) {
  for (const forma of ["mobile", "desktop"]) {
    const filas = [];
    const jsons = [];
    for (let i = 0; i < corridas; i++) {
      const chrome = await launch({ chromePath: rutaChromium(), chromeFlags: ["--headless=new", "--disable-gpu"] });
      try {
        const r = await lighthouse(srv.url + ruta, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: CATEGORIAS, locale: "es-419" }, forma === "desktop" ? desktopConfig : undefined);
        const l = r.lhr;
        if (l.runtimeError) throw new Error(`${l.runtimeError.code}: ${l.runtimeError.message}`);
        const fila = Object.fromEntries(CATEGORIAS.map((c) => [c, Math.round((l.categories[c].score ?? 0) * 100)]));
        for (const [k, id] of Object.entries(METRICAS)) fila[k] = l.audits[id].numericValue;
        filas.push(fila);
        jsons.push(r.report);
      } finally {
        await chrome.kill();
      }
      process.stdout.write(`  ${ruta} ${forma} corrida ${i + 1}/${corridas}: rend ${filas.at(-1).performance}\r`);
    }
    const claves = [...CATEGORIAS, ...Object.keys(METRICAS)];
    const med = Object.fromEntries(claves.map((k) => [k, mediana(filas.map((f) => f[k]))]));
    const rango = Object.fromEntries(claves.map((k) => [k, [Math.min(...filas.map((f) => f[k])), Math.max(...filas.map((f) => f[k]))]]));
    // JSON completo de la corrida cuyo rendimiento esta mas cerca de la mediana.
    const mejor = filas.map((f, i) => [Math.abs(f.performance - med.performance), i]).sort((p, q) => p[0] - q[0])[0][1];
    fs.writeFileSync(path.join(salida, `${slug(ruta)}-${forma}.json`), jsons[mejor]);
    resumen.resultados[`${ruta}|${forma}`] = { ruta, forma, mediana: med, rango, corridas: filas };
    console.log(`  ${ruta} ${forma}: rend ${med.performance} (rango ${rango.performance.join("-")})                `);
  }
}
await srv.cerrar();

/* ---------- tabla ---------- */
const filasMd = ["| Página | Forma | Rend. | Accesib. | B. prácticas | SEO | LCP (s) | CLS | TBT (ms) | FCP (s) | SI (s) | Rango rend. |", "|---|---|---|---|---|---|---|---|---|---|---|---|"];
for (const r of Object.values(resumen.resultados)) {
  const m = r.mediana;
  filasMd.push(`| ${r.ruta} | ${r.forma === "mobile" ? "móvil" : "escritorio"} | ${m.performance} | ${m.accessibility} | ${m["best-practices"]} | ${m.seo} | ${(m.lcp / 1000).toFixed(2)} | ${m.cls.toFixed(3)} | ${Math.round(m.tbt)} | ${(m.fcp / 1000).toFixed(2)} | ${(m.si / 1000).toFixed(2)} | ${r.rango.performance.join("–")} |`);
}
const tabla = filasMd.join("\n");
fs.writeFileSync(path.join(salida, "resumen.md"), `# Lighthouse (mediana de ${corridas} corridas)\n\nLighthouse ${resumen.lighthouse}, ${resumen.generado}\n\n${tabla}\n`);
fs.writeFileSync(path.join(salida, "resumen.json"), JSON.stringify(resumen, null, 2));
console.log("\n" + tabla + `\n\nGuardado en ${salida}`);

/* ---------- comparacion ---------- */
if (a.comparar) {
  const baseArchivo = path.join(path.resolve(String(a.comparar)), "resumen.json");
  if (!fs.existsSync(baseArchivo)) salir(1, `--comparar: no existe ${baseArchivo}`);
  const base = JSON.parse(fs.readFileSync(baseArchivo, "utf8"));
  const malos = [];
  for (const [clave, r] of Object.entries(resumen.resultados)) {
    const b = base.resultados[clave];
    for (const c of CATEGORIAS) {
      const nuevo = r.mediana[c];
      if (nuevo < 90) malos.push(`${r.ruta} ${r.forma}: ${ETIQ[c]} ${nuevo} < 90`);
      if (b) {
        const tol = c === "performance" ? tolPerf : 0;
        if (nuevo < b.mediana[c] - tol) malos.push(`${r.ruta} ${r.forma}: ${ETIQ[c]} ${nuevo} peor que la base ${b.mediana[c]}${tol ? ` (tolerancia ${tol})` : ""}`);
      }
    }
    if (!b) malos.push(`${r.ruta} ${r.forma}: sin base para comparar (¿página nueva? agrégala a la base)`);
  }
  if (malos.length) {
    console.error("\nLighthouse FALLA contra la base:");
    for (const m of malos) console.error("  " + m);
    process.exit(1);
  }
  console.log("Lighthouse: todas las categorías >= 90 y sin retroceso contra la base.");
}
