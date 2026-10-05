import { iconoTrazo } from "../icons.js";

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

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-elementos">
      <div class="ps-elementos-head">
        <h2 class="ps-title">Elementos</h2>
      </div>
      <div class="ps-elementos-grid">
        <div class="ps-tile">
          <div class="ps-tile-titulo">TAREAS</div>
          <div class="ps-tile-icono">${iconoTrazo("tareas")}</div>
          <div class="ps-tile-kpi">2/5 hoy</div>
          <div class="ps-tile-bar-slot">
            <div class="ps-bar"><div class="ps-bar-fill" data-progreso="0.4"></div></div>
          </div>
        </div>
        <div class="ps-tile">
          <div class="ps-tile-titulo">HÁBITOS</div>
          <div class="ps-tile-icono">${iconoTrazo("habitos")}</div>
          <div class="ps-tile-kpi">2/3 hoy</div>
          <div class="ps-tile-bar-slot">
            <div class="ps-bar"><div class="ps-bar-fill" data-progreso="0.67"></div></div>
          </div>
        </div>
        <div class="ps-tile">
          <div class="ps-tile-titulo">LISTAS</div>
          <div class="ps-tile-icono">${iconoTrazo("listas")}</div>
          <div class="ps-tile-kpi">3 activas</div>
          <div class="ps-tile-bar-slot"></div>
        </div>
        <div class="ps-tile">
          <div class="ps-tile-titulo">NOTAS</div>
          <div class="ps-tile-icono">${iconoTrazo("notas")}</div>
          <div class="ps-tile-kpi">4 notas</div>
          <div class="ps-tile-bar-slot"></div>
        </div>
        <div class="ps-tile ps-tile--wide">
          <div class="ps-tile-icono">${iconoTrazo("eventos")}</div>
          <div>
            <div class="ps-tile-titulo">PRÓXIMOS EVENTOS</div>
            <div class="ps-tile-kpi">2 en puerta</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function play() {
  return null;
}

export function pause() {}

export function reset() {}
