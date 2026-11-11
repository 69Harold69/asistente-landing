#!/usr/bin/env node
/*
  sin-js: mejora progresiva. Abre las páginas con JavaScript DESACTIVADO (Playwright
  `javaScriptEnabled: false`), en claro y oscuro, escritorio y móvil, y verifica:
    - el texto del contenido está presente y visible (titulares y párrafos de cada sección);
    - los dos CTA «Únete a la beta» son enlaces navegables (href https real al grupo, sin estado deshabilitado);
    - ningún elemento de contenido con texto queda con opacidad 0 ni oculto (salvo las etiquetas de hover
      de la navegación por puntos, que son decoración que aparece al pasar el mouse);
    - ninguna página tiene scroll horizontal (#46);
    - ninguna sección reserva alto de pantalla (min-height) pensado para el teléfono: sin él son huecos;
    - nada que solo funcione con JS se ve roto: el teléfono (decorativo, vacío sin JS) y el toggle de tema
      (inerte sin JS) no se muestran, y el teléfono no tapa el texto.
  Uso: node sin-js.mjs [--salida DIR]   (con --salida guarda capturas de cada combo)
  Sale con 1 si algo falla.
*/
import path from "node:path";
import { iniciarServidor } from "./lib/servidor.mjs";
import { lanzarChromium, leerArgs, carpetaSalida, salir, slug, medirScrollHorizontal } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, "Uso: node sin-js.mjs [--salida DIR]");
const dirSalida = a.salida ? carpetaSalida(a.salida) : null;

const CTA_BETA = "https://groups.google.com/g/yaruki-beta/";
const PAGINAS = ["/", "/privacidad/", "/terminos/", "/eliminar-cuenta/", "/organizar-tareas-con-ia/", "/recordatorios-por-voz/", "/no-existe"];
const TAMANOS = { escritorio: { width: 1440, height: 900 }, tablet: { width: 820, height: 1180 }, movil: { width: 390, height: 844 }, angosto: { width: 320, height: 568 } };
const IGNORAR_OPACIDAD = "nav-recorrido-etiqueta";

const fallas = [];
const falla = (combo, msg) => fallas.push(`${combo}: ${msg}`);

const servidor = await iniciarServidor();
const navegador = await lanzarChromium();
try {
  for (const tema of ["light", "dark"]) {
    for (const [tam, viewport] of Object.entries(TAMANOS)) {
      const ctx = await navegador.newContext({ javaScriptEnabled: false, viewport, colorScheme: tema });
      const page = await ctx.newPage();
      for (const ruta of PAGINAS) {
        const combo = `${tema}-${tam}-${slug(ruta) || "inicio"}`;
        await page.goto(servidor.url + ruta, { waitUntil: "load" });
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(2200); // la entrada del titular es CSS: que termine
        if (dirSalida) await page.screenshot({ path: path.join(dirSalida, `${combo}.png`), fullPage: true });

        const r = await page.evaluate(
          ({ ignorar }) => {
            const vacios = [];
            for (const el of document.querySelectorAll("body *")) {
              const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
              if (!propio || el.closest("noscript")) continue;
              let op = 1;
              for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
              if (el.classList.contains(ignorar)) continue;
              // Solo opacidad: lo que el CSS oculta con display:none en un ancho (p. ej. el chip del header en móvil) es diseño responsivo.
              if (op < 0.99) vacios.push(`<${el.localName} class="${el.className}"> «${el.textContent.trim().slice(0, 30)}» opacidad ${op.toFixed(2)}`);
            }
            const visible = (sel) => {
              const e = document.querySelector(sel);
              if (!e) return false;
              const r = e.getBoundingClientRect();
              return getComputedStyle(e).display !== "none" && r.width > 0 && r.height > 0;
            };
            const ctas = [...document.querySelectorAll("[data-cta-beta]")].map((e) => ({
              href: e.getAttribute("href"),
              deshabilitado: e.getAttribute("aria-disabled") === "true" || e.classList.contains("button--disabled"),
              chip: !!e.parentElement.querySelector("[data-chip-proximamente-beta]"),
              pointerEvents: getComputedStyle(e).pointerEvents,
            }));
            const sinHref = [...document.querySelectorAll("a")].filter((e) => !e.getAttribute("href")).map((e) => e.textContent.trim());
            return {
              vacios,
              ctas,
              sinHref,
              h1: document.querySelector("h1")?.textContent.trim().length ?? 0,
              palabras: document.body.innerText.split(/\s+/).filter(Boolean).length,
              // Sin teléfono, ninguna sección debe reservar alto de pantalla (min-height) para la coreografía.
              reservas: [...document.querySelectorAll(".seccion")]
                .filter((e) => parseFloat(getComputedStyle(e).minHeight) > 0)
                .map((e) => `#${e.id} min-height ${getComputedStyle(e).minHeight}`),
              escenario: visible("#stage"),
              toggle: visible("[data-theme-toggle]"),
            };
          },
          { ignorar: IGNORAR_OPACIDAD },
        );

        const ancho = await medirScrollHorizontal(page);
        if (ancho) falla(combo, `scroll horizontal: ${ancho}`);
        if (!r.h1) falla(combo, "no hay <h1> con texto");
        if (r.palabras < 30) falla(combo, `muy poco texto visible (${r.palabras} palabras)`);
        for (const v of r.vacios) falla(combo, `texto invisible sin JS: ${v}`);
        if (r.sinHref.length) falla(combo, `enlaces <a> sin href: ${r.sinHref.join(" | ")}`);
        if (ruta === "/") {
          if (r.ctas.length !== 2) falla(combo, `se esperaban 2 CTA «Únete a la beta» y hay ${r.ctas.length}`);
          for (const c of r.ctas) {
            if (c.href !== CTA_BETA) falla(combo, `CTA sin href navegable al grupo (href=${c.href})`);
            if (c.deshabilitado) falla(combo, "CTA con estado deshabilitado sin JS");
            if (c.chip) falla(combo, "CTA con chip «Próximamente» sin JS");
            if (c.pointerEvents === "none") falla(combo, "CTA sin eventos de puntero (no se puede tocar)");
          }
          for (const x of r.reservas) falla(combo, `sección con alto de pantalla reservado sin JS (hueco): ${x}`);
          if (r.escenario) falla(combo, "el teléfono (decorativo, vacío sin JS) se muestra y tapa el texto");
          if (r.toggle) falla(combo, "el toggle de tema se muestra pero no funciona sin JS");
        }
      }
      await ctx.close();
    }
  }
} finally {
  await navegador.close();
  await servidor.cerrar();
}

if (fallas.length) {
  console.error(`sin-js: ${fallas.length} FALLA(S)`);
  for (const f of fallas) console.error(`  FALLA ${f}`);
  process.exit(1);
}
console.log("sin-js: OK (texto visible, CTA navegables, nada invisible ni roto, en claro/oscuro × escritorio/tablet/móvil/320 px)");
