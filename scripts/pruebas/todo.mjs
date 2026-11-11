#!/usr/bin/env node
/*
  todo: corre validar + licencias + malla + mirada + capturas + lighthouse (y la prueba tactil con --con-tactil) en ese orden,
  sin detenerse en la primera falla, y sale con 1 si CUALQUIERA falla.

  Uso: node todo.mjs [--salida DIR] [--comparar CARPETA_BASE_LIGHTHOUSE] [--con-tactil] [--sin-video]
         [--corridas 3] [--paginas /,/privacidad/] [--estricto]
    --salida   carpeta madre; crea capturas/, tactil/ y lighthouse/ dentro
               (por defecto ~/Pictures/yaruki-landing-2026-11/todo)
*/
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { leerArgs, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node todo.mjs [--salida DIR] [--comparar BASE] [--con-tactil] [--sin-video] [--corridas 3] [--paginas /,/privacidad/] [--estricto]");
const aqui = path.dirname(fileURLToPath(import.meta.url));
const salida = path.resolve(String(a.salida && a.salida !== true ? a.salida : path.join(os.homedir(), "Pictures/yaruki-landing-2026-11/todo")).replace(/^~/, os.homedir()));
const video = a["sin-video"] ? ["--sin-video"] : [];

const estricto = a.estricto ? ["--estricto"] : [];
const paginas = a.paginas && a.paginas !== true ? ["--paginas", String(a.paginas)] : [];
const pasos = [
  ["validar", process.execPath, ["validar.mjs", ...estricto]],
  // Licencias de fuentes y librerías vendorizadas (issue #15): solo biblioteca estándar de Python.
  ["licencias", "python3", ["-I", "licencias.py"]],
  // Malla del hero (#26): pausas, reduced-motion, costo por cuadro y contraste AA en píxeles reales.
  ["malla", process.execPath, ["malla.mjs", "--salida", path.join(salida, "malla")]],
  // Mirada de la mascota (#27): dirección y tope, giros, transform intacto, reduced-motion y táctil.
  ["mirada", process.execPath, ["mirada.mjs", "--salida", path.join(salida, "mirada")]],
  ["capturas", process.execPath, ["capturas.mjs", "--salida", path.join(salida, "capturas"), ...video, ...paginas, ...estricto]],
  ["lighthouse", process.execPath, ["lighthouse.mjs", "--salida", path.join(salida, "lighthouse"), ...paginas, ...(a.corridas ? ["--corridas", String(a.corridas)] : []), ...(a.comparar ? ["--comparar", path.resolve(String(a.comparar).replace(/^~(?=$|\/)/, os.homedir()))] : [])]],
];
if (a["con-tactil"]) pasos.push(["tactil", process.execPath, ["tactil.mjs", "--salida", path.join(salida, "tactil"), ...video, ...estricto]]);

const resultados = [];
for (const [nombre, programa, args] of pasos) {
  console.log(`\n========== ${nombre} ==========`);
  const t0 = Date.now();
  const r = spawnSync(programa, args, { cwd: aqui, stdio: "inherit" });
  if (r.error) console.error(`${nombre}: no se pudo ejecutar ${programa}: ${r.error.message}`);
  resultados.push({ nombre, ok: r.status === 0, s: Math.round((Date.now() - t0) / 1000) });
}
console.log("\n========== resumen ==========");
for (const r of resultados) console.log(`${r.ok ? "OK   " : "FALLA"}  ${r.nombre}  (${r.s} s)`);
console.log(`Salida: ${salida}`);
process.exit(resultados.every((r) => r.ok) ? 0 : 1);
