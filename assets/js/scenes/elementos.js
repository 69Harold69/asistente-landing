import { iconoTrazo, barraDeNavegacion } from "../icons.js";

/**
 * Elementos — pedido explícito del dueño (corrección 2026-10-04 a la
 * sección 2 del plan): esta pantalla está MÁS actualizada en la app que en
 * el mockup (grid Bento con 5 tarjetas, íconos de trazo, barra y KPI), así
 * que sale 1:1 de `ui/InicioScreen.kt` (`EncabezadoElementos`/`GridElementos`/
 * `ElementoTile`), no del mockup. Sin coreografía todavía — ver KDoc del
 * plan, 5.3.
 *
 * Datos de ejemplo representativos (no vienen de ninguna cuenta real):
 * Tareas 2/5 hoy (40%), Hábitos 2/3 hoy (67%), 3 listas activas, 4 notas,
 * 2 próximos eventos — mismos rótulos y redondeo de progreso que
 * `ElementosViewModel`/`InicioScreen.kt`.
 */
export const id = "elementos";

let refs = null;
let tl = null;

function prefiereMovimientoReducido() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function mount(contenedor) {
  const tile = (titulo, icono, kpi, progreso) => `
    <div class="ps-tile">
      <div class="ps-tile-titulo">${titulo}</div>
      <div class="ps-tile-icono">${iconoTrazo(icono)}</div>
      <div class="ps-tile-kpi">${kpi}</div>
      <div class="ps-tile-ranura">${
        progreso === null ? "" : `<div class="ps-barra"><div class="ps-barra-relleno" data-progreso="${progreso}"></div></div>`
      }</div>
    </div>`;
  contenedor.innerHTML = `
    <div class="escena ps-elementos">
      <div class="ps-elementos-head">
        <h2 class="ps-titulo">Elementos</h2>
      </div>
      <div class="ps-elementos-grid">
        ${tile("TAREAS", "tareas", "2/5 hoy", 0.4)}
        ${tile("HÁBITOS", "habitos", "2/3 hoy", 0.67)}
        ${tile("LISTAS", "listas", "3 activas", null)}
        ${tile("NOTAS", "notas", "4 notas", null)}
        <div class="ps-tile ps-tile--ancha">
          <div class="ps-tile-icono">${iconoTrazo("eventos")}</div>
          <div>
            <div class="ps-tile-titulo">PRÓXIMOS EVENTOS</div>
            <div class="ps-tile-kpi">2 en puerta</div>
          </div>
        </div>
      </div>
      ${barraDeNavegacion("elementos")}
    </div>
  `;
  refs = {
    tiles: Array.from(contenedor.querySelectorAll(".ps-tile")),
    barras: Array.from(contenedor.querySelectorAll(".ps-barra-relleno")),
  };
}

/**
 * Cascada de entrada sutil (plan, parte B) — las 5 tarjetas aparecen una
 * detrás de otra (stagger) y las 2 barras de progreso se "llenan" desde 0,
 * cada vez que la sección vuelve a quedar a la vista (`stage.js` llama acá
 * desde `irA` en cada cambio de escena, no sólo la primera vez — así se ve
 * viva si la persona sube y vuelve a bajar).
 *
 * Barras animadas con `scaleX`/`transform-origin:left`, no `width`: mismo
 * resultado visual que "llenarse", pero sigue la regla de sólo animar
 * `transform`/`opacity`. El ancho final en sí (el `%` real de cada barra)
 * ya lo fija `aplicarBarrasDeProgreso` en `stage.js` vía `data-progreso`
 * ANTES de que esto corra — acá sólo se la revela con un scaleX.
 */
export function play() {
  if (!refs) return null;
  if (tl) tl.kill();
  if (prefiereMovimientoReducido()) {
    gsap.set(refs.tiles, { opacity: 1, y: 0 });
    gsap.set(refs.barras, { scaleX: 1 });
    return null;
  }
  gsap.set(refs.barras, { transformOrigin: "left center" });
  tl = gsap.timeline();
  tl.set(refs.tiles, { opacity: 0, y: 14 });
  tl.set(refs.barras, { scaleX: 0 });
  tl.to(refs.tiles, { opacity: 1, y: 0, duration: 0.45, stagger: 0.08, ease: "power2.out" });
  tl.to(refs.barras, { scaleX: 1, duration: 0.6, stagger: 0.12, ease: "power2.out" }, "-=0.25");
  return tl;
}

export function pause() {
  if (tl) tl.pause();
}

export function reset() {
  if (tl) {
    tl.kill();
    tl = null;
  }
  if (refs) {
    gsap.set(refs.tiles, { opacity: 1, y: 0 });
    gsap.set(refs.barras, { scaleX: 1 });
  }
}
