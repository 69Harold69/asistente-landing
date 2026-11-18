#!/usr/bin/env node
/*
  reducir-movimiento (#128): con `prefers-reduced-motion: reduce` el recorrido de fases no tiene vuelos ni giros, pero el
  teléfono no puede desaparecer ni la escena mostrar dos pantallas encimadas a media transparencia (la revisión de la
  diseñadora, Chrome en Windows con los efectos de animación desactivados, vio justo eso).

  Recorre el scroll con rueda real, en pasos, hacia abajo y de vuelta hacia arriba, en claro y oscuro, a 1440×900 y
  1905×905. En cada parada espera a que el cambio de escena se asiente (el corte o fundido corto es de ≤ 200 ms) y falla si:
    (a) hay una fase del recorrido en pantalla y el teléfono no está visible con opacidad efectiva (la suya por la de sus
        ancestros) ≥ 0.99, o
    (b) en Hábitos hay dos pantallas de la escena (capas con escena) a la vez con opacidad intermedia.
  Uso: node reducir-movimiento.mjs [--paso 100] [--espera 320] [--temas light,dark] [--verbose]
*/
import { iniciarServidor } from "./lib/servidor.mjs";
import { lanzarChromium, leerArgs, lista, scriptInicial, esperarCarga, dormir, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node reducir-movimiento.mjs [--paso 100] [--espera 320] [--temas light,dark] [--verbose]");
const paso = a.paso && a.paso !== true ? Number(a.paso) : 100;
const espera = a.espera && a.espera !== true ? Number(a.espera) : 320;
const temas = lista(a.temas, ["light", "dark"]);
const FASES = ["fase-chat", "fase-elementos", "fase-habitos", "fase-avisos", "fase-llamada"];

const srv = await iniciarServidor();
const navegador = await lanzarChromium();
const fallas = [];

const leer = (fases) => {
  const vh = window.innerHeight;
  const enPantalla = fases.filter((id) => {
    const r = document.getElementById(id)?.getBoundingClientRect();
    if (!r) return false;
    return Math.min(r.bottom, vh) - Math.max(r.top, 0) > 0.25 * vh;
  });
  const tel = document.getElementById("escenario-3d");
  let op = 1;
  let oculto = !tel;
  for (let el = tel; el; el = el.parentElement) {
    const cs = getComputedStyle(el);
    op *= Number(cs.opacity);
    if (cs.visibility === "hidden" || cs.display === "none") oculto = true;
  }
  const capas = [...document.querySelectorAll(".capa-escena")]
    .map((c) => ({ op: Number(getComputedStyle(c).opacity), id: ([...(c.querySelector(".escena")?.classList ?? [])].find((k) => k.startsWith("ps-")) ?? "") }))
    .filter((c) => c.id && c.op > 0.01);
  return { y: Math.round(scrollY), enPantalla, op: oculto ? 0 : op, capas };
};

for (const viewport of [{ width: 1440, height: 900 }, { width: 1905, height: 905 }]) {
  for (const tema of temas) {
    const nombre = `${viewport.width}×${viewport.height} ${tema}`;
    const ctx = await navegador.newContext({ viewport, reducedMotion: "reduce", colorScheme: tema });
    const page = await ctx.newPage();
    await page.addInitScript(scriptInicial({ tema }));
    await page.goto(`${srv.url}/`, { waitUntil: "load" });
    await esperarCarga(page, { portada: true });
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const fin = await page.evaluate(() => document.getElementById("fase-llamada").getBoundingClientRect().bottom + scrollY);
    const tope = Math.min(max, fin);
    const huecos = [];
    const mezclas = [];
    let paradas = 0;
    const recorrer = async (dir) => {
      let y = await page.evaluate(() => scrollY);
      let quieto = 0;
      while (dir > 0 ? y < tope - 1 : y > 0) {
        await page.mouse.wheel(0, dir * paso);
        await dormir(espera);
        const e = await page.evaluate(leer, FASES);
        paradas++;
        quieto = Math.abs(e.y - y) < 1 ? quieto + 1 : 0;
        if (quieto > 5) break; // tope del documento
        y = e.y;
        if (e.enPantalla.length && !(e.op >= 0.99)) huecos.push({ dir, y: e.y, fase: e.enPantalla.join("+"), op: Number(e.op.toFixed(3)) });
        if (e.enPantalla.includes("fase-habitos") && e.capas.length > 1 && e.capas.some((c) => c.op < 0.99))
          mezclas.push({ dir, y: e.y, capas: e.capas.map((c) => `${c.id}:${c.op.toFixed(2)}`).join(" + ") });
        if (a.verbose) console.log(nombre, dir > 0 ? "↓" : "↑", e.y, e.enPantalla.join("+") || "-", e.op.toFixed(2), e.capas.map((c) => `${c.id}:${c.op.toFixed(2)}`).join(" "));
      }
    };
    await recorrer(1);
    await recorrer(-1);
    await ctx.close();
    console.log(`${nombre}: ${paradas} paradas, ${huecos.length} sin teléfono a plena opacidad, ${mezclas.length} mezclas en Hábitos`);
    if (huecos.length) fallas.push(`${nombre}: con una fase en pantalla el teléfono no estaba a opacidad ≥ 0.99 (${huecos.length} paradas): ${huecos.slice(0, 6).map((h) => `${h.dir > 0 ? "↓" : "↑"}y=${h.y} ${h.fase} op=${h.op}`).join("; ")}`);
    if (mezclas.length) fallas.push(`${nombre}: en Hábitos hay dos pantallas encimadas con opacidad intermedia (${mezclas.length} paradas): ${mezclas.slice(0, 4).map((m) => `${m.dir > 0 ? "↓" : "↑"}y=${m.y} ${m.capas}`).join("; ")}`);
  }
}
await navegador.close();
await srv.cerrar();
if (fallas.length) {
  console.error("\nreducir-movimiento: FALLA\n- " + fallas.join("\n- "));
  process.exit(1);
}
console.log("\nreducir-movimiento: OK");
