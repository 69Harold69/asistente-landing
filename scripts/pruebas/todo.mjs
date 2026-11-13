#!/usr/bin/env node
/*
  todo: corre validar + sin-js + cls + licencias + dominio (--check y sus pruebas) + las pruebas de JSON-LD,
  IndexNow, guías y portada + malla + mirada + progreso + capturas + lighthouse (y la prueba tactil con --con-tactil) en ese
  orden, sin detenerse en la primera falla, y sale con 1 si CUALQUIERA falla.
  Antes de todo, la guardia «registro» (#50): falla si en esta carpeta (o en lib/) hay un `test_*.py` o un
  `.mjs` que ningún paso corre y que no está en EXCEPCIONES.

  Uso: node todo.mjs [--salida DIR] [--comparar CARPETA_BASE_LIGHTHOUSE] [--con-tactil] [--sin-video]
         [--corridas 3] [--paginas /,/privacidad/] [--estricto] [--solo-registro]
    --solo-registro  corre solo la guardia (rápido, sin navegador)
    --salida   carpeta madre; crea capturas/, tactil/ y lighthouse/ dentro
               (por defecto ~/Pictures/yaruki-landing-2026-11/todo)
*/
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { leerArgs, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node todo.mjs [--salida DIR] [--comparar BASE] [--con-tactil] [--sin-video] [--corridas 3] [--paginas /,/privacidad/] [--estricto] [--solo-registro]");
const aqui = path.dirname(fileURLToPath(import.meta.url));
const salida = path.resolve(String(a.salida && a.salida !== true ? a.salida : path.join(os.homedir(), "Pictures/yaruki-landing-2026-11/todo")).replace(/^~/, os.homedir()));
const video = a["sin-video"] ? ["--sin-video"] : [];

const estricto = a.estricto ? ["--estricto"] : [];
const paginas = a.paginas && a.paginas !== true ? ["--paginas", String(a.paginas)] : [];
const pasos = [
  ["validar", process.execPath, ["validar.mjs", ...estricto]],
  // Mejora progresiva: la portada y las legales con JavaScript desactivado.
  ["sin-js", process.execPath, ["sin-js.mjs"]],
  // CLS de las páginas legales y la 404 con red limitada (fuente de respaldo con las métricas de la real).
  ["cls", process.execPath, ["cls.mjs"]],
  // El servidor de pruebas comprime como Caddy (`encode gzip zstd`): sin ello el laboratorio no representa a producción.
  ["compresion", process.execPath, ["compresion.mjs"]],
  // Presupuesto de rendimiento de la portada: LCP texto del hero, CLS, TBT, sin scripts en el <head> e interacciones ≤ 200 ms (CPU ×4).
  ["rendimiento", process.execPath, ["rendimiento.mjs"]],
  // Escritorio: el teléfono nace en su columna, sin encimarse al titular ni saltar al llegar la coreografía.
  ["arranque-telefono", process.execPath, ["arranque-telefono.mjs"]],
  // Accesibilidad: con Tab, nada de la portada recibe el foco invisible (textos del recorrido aún en opacidad 0).
  ["foco-visible", process.execPath, ["foco-visible.mjs"]],
  // Licencias de fuentes y librerías vendorizadas (issue #15): solo biblioteca estándar de Python.
  ["licencias", "python3", ["-I", "licencias.py"]],
  // El dominio vive en scripts/sitio.json; --check sale ≠ 0 si alguna URL absoluta no coincide (issue #28).
  ["dominio", "python3", ["-I", "../dominio.py", "--check"]],
  ["dominio-pruebas", "python3", ["-I", "test_dominio.py"]],
  ["jsonld-pruebas", "python3", ["-I", "test_jsonld.py"]],
  ["indexnow-pruebas", "python3", ["-I", "test_indexnow.py"]],
  // Reglas de las páginas-guía (Article, FAQ visible, sitemap): defectos sembrados que validar debe atrapar (#50).
  ["guias-pruebas", "python3", ["-I", "test_guias.py"]],
  ["portada-pruebas", "python3", ["-I", "test_portada.py"]],
  // Malla de fondo continua (#98): onda en reposo, cursor, táctil, pausas, reduced-motion, intensidad, costo por cuadro y contraste AA por sección.
  ["malla", process.execPath, ["malla.mjs", "--salida", path.join(salida, "malla")]],
  // Mirada de la mascota (#27): dirección y tope, giros, transform intacto, reduced-motion y táctil.
  ["mirada", process.execPath, ["mirada.mjs", "--salida", path.join(salida, "mirada")]],
  // Avance de la portada (#60, opción B): sin barra superior; riel entre los puntos, 0-100 %, desvanecido, reduced-motion y sin JS.
  ["progreso", process.execPath, ["progreso.mjs"]],
  // Vidrio (#100, hoy el defecto de la portada): contraste AA en píxeles con la malla encendida sin huecos (títulos grandes 3:1, texto pequeño sobre el vidrio 4.5:1), claro/oscuro × escritorio/móvil, en TODAS las secciones (hero, 5 fases, «Tu día», cómo funciona, lo que viene, FAQ abierta, quién está detrás) y el header.
  ["vidrio-contraste", process.execPath, ["vidrio-contraste.mjs", "--salida", path.join(salida, "vidrio-contraste")]],
  ["vidrio-franja", process.execPath, ["vidrio-franja.mjs", "--salida", path.join(salida, "vidrio-franja")]],
  // Pool del chat (auditoría de la Fase 2): cada escenario llega a su final, con y sin movimiento, sin cortes ni desbordes.
  ["pool-chat", process.execPath, ["pool-chat.mjs", "--salida", path.join(salida, "pool-chat")]],
  ["capturas", process.execPath, ["capturas.mjs", "--tamanos", "escritorio,tablet,tablet768,tabletapaisada,movil", "--salida", path.join(salida, "capturas"), ...video, ...paginas, ...estricto]],
  ["lighthouse", process.execPath, ["lighthouse.mjs", "--salida", path.join(salida, "lighthouse"), ...paginas, ...(a.corridas ? ["--corridas", String(a.corridas)] : []), ...(a.comparar ? ["--comparar", path.resolve(String(a.comparar).replace(/^~(?=$|\/)/, os.homedir()))] : [])]],
];
// Se registra siempre, aunque solo corra con --con-tactil.
const tactil = ["tactil", process.execPath, ["tactil.mjs", "--salida", path.join(salida, "tactil"), ...video, ...estricto]];
if (a["con-tactil"]) pasos.push(tactil);

/*
  Registro (#50): toda prueba de esta carpeta corre aquí. `test_guias.py` existía y no estaba en la lista,
  así que `todo` salía verde con las reglas de las guías rotas. Si agregas una prueba, súmala a `pasos`;
  si agregas una librería o algo que no es prueba, a EXCEPCIONES con el porqué.
*/
const EXCEPCIONES = {
  "todo.mjs": "este orquestador",
  "lib/comun.mjs": "librería compartida",
  "lib/scroll.mjs": "librería (rueda real)",
  "lib/servidor.mjs": "librería (servidor de pruebas; también `npm run servir`)",
  "medir-malla.mjs": "herramienta de medición de la malla (#98): produce una tabla, no es prueba; se corre a mano",
};
function sinRegistrar() {
  const corridos = new Set([...pasos, tactil].flatMap(([, , args]) => args).filter((x) => /\.(mjs|py)$/.test(x)).map((x) => path.normalize(x)));
  const candidatos = [];
  for (const dir of ["", "lib"]) {
    for (const f of fs.readdirSync(path.join(aqui, dir))) {
      if (/^test_.*\.py$/.test(f) || f.endsWith(".mjs")) candidatos.push(path.join(dir, f));
    }
  }
  return candidatos.filter((f) => !corridos.has(f) && !(f in EXCEPCIONES)).sort();
}

const resultados = [];
console.log("\n========== registro ==========");
const faltan = sinRegistrar();
if (faltan.length) {
  console.error(`registro: ${faltan.length} prueba(s) de scripts/pruebas que todo.mjs no corre: ${faltan.join(", ")}`);
  console.error("  Agrégalas a `pasos` (o, si no son pruebas, a EXCEPCIONES con el porqué).");
} else console.log("registro: OK (todas las pruebas de scripts/pruebas están en todo.mjs)");
resultados.push({ nombre: "registro", ok: !faltan.length, s: 0 });
if (a["solo-registro"]) process.exit(faltan.length ? 1 : 0);

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
