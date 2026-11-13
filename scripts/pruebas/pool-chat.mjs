#!/usr/bin/env node
/*
  pool-chat: recorre TODOS los escenarios del pool del chat (auditoría de la Fase 2). `capturas` solo ve el estado
  inicial de `?escena=chat` y la portada elige un escenario al azar, así que un escenario roto podía pasar inadvertido.
  Para cada id de `ESCENARIOS` (leídos de `assets/js/scenes/chat.js`), en claro y oscuro, escritorio y móvil:
    - con movimiento, `?escena=chat&escenario=<id>` llega a su estado final: la tarjeta en la última burbuja (o
      «Confirmado ✓» + «Listo, …» en `confirmar`; en `pregunta`, la opción elegida con su check y las demás
      deshabilitadas);
    - con prefers-reduced-motion, el estado estático muestra ese mismo final;
    - la última burbuja queda completa dentro del cuerpo del chat (ni cortada arriba ni bajo la entrada) y ningún
      texto del chat se desborda a lo ancho;
    - el README documenta los mismos ids que el pool;
    - consola limpia (sin console.error, pageerror, CSP ni red fallida).
  Uso: node pool-chat.mjs [--url http://...] [--salida DIR]   (sale con 1 si algo falla)
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { iniciarServidor } from "./lib/servidor.mjs";
import { leerArgs, lanzarChromium, crearGuardia, scriptInicial, esperarCarga, dormir, salir } from "./lib/comun.mjs";

const a = leerArgs();
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fuente = fs.readFileSync(path.join(raiz, "assets/js/scenes/chat.js"), "utf8");
const bloque = fuente.slice(fuente.indexOf("const ESCENARIOS = ["), fuente.indexOf("];", fuente.indexOf("const ESCENARIOS = [")));
const IDS = [...bloque.matchAll(/^\s{4}id: "([a-z]+)"/gm)].map((m) => m[1]);
const salida = a.salida && a.salida !== true ? path.resolve(String(a.salida)) : null;
if (salida) fs.mkdirSync(salida, { recursive: true });

const problemas = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok " : "  FALLA"} ${msg}`);
  if (!cond) problemas.push(msg);
};

ok(IDS.length >= 8, `el pool tiene ${IDS.length} escenarios (${IDS.join(", ")})`);
const readme = fs.readFileSync(path.join(raiz, "README.md"), "utf8");
const lineaReadme = readme.split("\n").findIndex((l) => l.includes("`escenario` (solo con `escena=chat`)"));
const textoReadme = readme.split("\n").slice(lineaReadme, lineaReadme + 3).join(" ");
ok(lineaReadme >= 0 && IDS.every((id) => textoReadme.includes(`\`${id}\``)), "el README («Modo de inspección») lista todos los ids del pool");

const srv = a.url ? { url: String(a.url).replace(/\/$/, ""), cerrar: async () => {} } : await iniciarServidor();
const navegador = await lanzarChromium();
const guardia = crearGuardia(srv.url);
const TAM = { escritorio: [1440, 900, false], movil: [390, 844, true] };

/** Estado final esperado del escenario, evaluado en la página. */
function estadoFinal(id) {
  const cuerpo = document.querySelector(".ps-chat-cuerpo");
  const burbujas = [...cuerpo.children];
  const ultima = burbujas.at(-1);
  if (!ultima) return { listo: false };
  let listo;
  if (id === "confirmar") {
    const previa = burbujas.at(-2);
    listo = !!previa?.querySelector(".ps-confirmado") && /^Listo, /.test(ultima.textContent.trim());
  } else if (id === "pregunta") {
    const pregunta = burbujas.findLast((b) => b.querySelector(".ps-opciones"));
    const elegida = pregunta?.querySelector(".ps-opcion--elegida");
    const resto = pregunta ? [...pregunta.querySelectorAll(".ps-opcion")].filter((b) => b !== elegida) : [];
    listo =
      !!ultima.querySelector(".ps-tarjeta") &&
      !!elegida?.querySelector(".ps-opcion-check") &&
      resto.length > 0 &&
      resto.every((b) => b.classList.contains("ps-opcion--deshabilitada"));
  } else {
    listo = !!ultima.querySelector(".ps-tarjeta") && (id !== "dictado" || !!ultima.querySelector(".ps-audio"));
  }
  const c = cuerpo.getBoundingClientRect();
  const u = ultima.getBoundingClientRect();
  const entrada = document.querySelector(".ps-chat-entrada").getBoundingClientRect();
  const desbordes = [...document.querySelectorAll(".ps-chat *")]
    .filter((n) => n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 1 && !n.matches("svg, svg *"))
    .map((n) => n.className);
  return {
    listo,
    // Tolerancia de 1px por redondeos del 3D.
    dentro: u.top >= c.top - 1 && u.bottom <= c.bottom + 1 && u.bottom <= entrada.top + 1,
    desbordes,
  };
}

for (const tema of ["light", "dark"]) {
  for (const [tam, [w, h, m]] of Object.entries(TAM)) {
    for (const reducido of [false, true]) {
      const ctx = await navegador.newContext({
        viewport: { width: w, height: h },
        colorScheme: tema,
        reducedMotion: reducido ? "reduce" : "no-preference",
        isMobile: m,
        hasTouch: m,
      });
      await ctx.addInitScript(scriptInicial({ tema }));
      for (const id of IDS) {
        const etiqueta = `${id} ${tema} ${tam}${reducido ? " reducido" : ""}`;
        const page = await ctx.newPage();
        guardia.instalar(page, `pool-chat ${etiqueta}`);
        await page.goto(`${srv.url}/?escena=chat&escenario=${id}`, { waitUntil: "load" });
        await esperarCarga(page);
        let e = { listo: false };
        const limite = Date.now() + (reducido ? 3000 : 20000);
        while (Date.now() < limite) {
          e = await page.evaluate(estadoFinal, id);
          if (e.listo) break;
          await dormir(150);
        }
        if (e.listo && !reducido) {
          await dormir(700); // que termine la entrada (opacidad/desplazamiento) antes de medir y capturar
          e = await page.evaluate(estadoFinal, id);
        }
        ok(e.listo, `${etiqueta}: llega a su estado final`);
        ok(e.dentro, `${etiqueta}: la última burbuja cabe entera en el cuerpo del chat`);
        ok(!e.desbordes?.length, `${etiqueta}: sin textos desbordados${e.desbordes?.length ? ` (${e.desbordes.join(", ")})` : ""}`);
        if (salida) {
          await page.locator("#pantalla-telefono").screenshot({ path: path.join(salida, `${id}-${tema}-${tam}${reducido ? "-reducido" : ""}.png`) });
        }
        await page.close();
      }
      await ctx.close();
    }
  }
}

await navegador.close();
await srv.cerrar();
for (const f of guardia.fallas) problemas.push(`${f.tipo} (${f.contexto}): ${f.detalle}`), console.log(`  FALLA ${f.tipo} (${f.contexto}): ${f.detalle}`);
salir(problemas.length ? 1 : 0, problemas.length ? `pool-chat: ${problemas.length} falla(s)` : "pool-chat: OK");
