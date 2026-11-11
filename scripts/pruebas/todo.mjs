#!/usr/bin/env node
/*
  todo: corre validar + capturas + lighthouse (y la prueba tactil con --con-tactil) en ese orden,
  sin detenerse en la primera falla, y sale con 1 si CUALQUIERA falla.

  Uso: node todo.mjs [--salida DIR] [--comparar CARPETA_BASE_LIGHTHOUSE] [--con-tactil] [--sin-video]
         [--corridas 3] [--paginas ...]
    --salida   carpeta madre; crea capturas/, tactil/ y lighthouse/ dentro
               (por defecto ~/Pictures/yaruki-landing-2026-11/todo)
*/
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { leerArgs, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node todo.mjs [--salida DIR] [--comparar BASE] [--con-tactil] [--sin-video] [--corridas 3]");
const aqui = path.dirname(fileURLToPath(import.meta.url));
const salida = path.resolve(String(a.salida && a.salida !== true ? a.salida : path.join(os.homedir(), "Pictures/yaruki-landing-2026-11/todo")).replace(/^~/, os.homedir()));
const video = a["sin-video"] ? ["--sin-video"] : [];

const pasos = [
  ["validar", ["validar.mjs"]],
  ["capturas", ["capturas.mjs", "--salida", path.join(salida, "capturas"), ...video]],
  ["lighthouse", ["lighthouse.mjs", "--salida", path.join(salida, "lighthouse"), ...(a.corridas ? ["--corridas", String(a.corridas)] : []), ...(a.comparar ? ["--comparar", String(a.comparar)] : [])]],
];
if (a["con-tactil"]) pasos.push(["tactil", ["tactil.mjs", "--salida", path.join(salida, "tactil"), ...video]]);

const resultados = [];
for (const [nombre, args] of pasos) {
  console.log(`\n========== ${nombre} ==========`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: aqui, stdio: "inherit" });
  resultados.push({ nombre, ok: r.status === 0, s: Math.round((Date.now() - t0) / 1000) });
}
console.log("\n========== resumen ==========");
for (const r of resultados) console.log(`${r.ok ? "OK   " : "FALLA"}  ${r.nombre}  (${r.s} s)`);
console.log(`Salida: ${salida}`);
process.exit(resultados.every((r) => r.ok) ? 0 : 1);
