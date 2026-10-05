/**
 * Hábitos — mezcla (plan, 4.4 y sección 2): heatmap estilo GitHub del
 * mockup (pantalla 11 — la app todavía no tiene heatmap, aunque el dato de
 * cumplimiento diario sí existe) + la tarjeta "Racha y consolidación" y el
 * switch "Cumplido hoy" REALES de `ui/elementos/habitos/HabitoDetalleScreen.kt`
 * (`EstadisticasCard`/`CumplimientoHoyRow`), mismo texto literal.
 *
 * El patrón del heatmap y los números son de ejemplo. La nota final usa a
 * propósito la rama "todavía no alcanza el umbral" (no la de "ya es
 * elegible para consolidar") — mostrar esa segunda rama sin que la regla de
 * consolidación sea pública todavía sería prometer algo que el producto no
 * define (plan, 4.4: "sin prometer reglas").
 *
 * **Punto de control 2, bug 8:** sin rojo — un día sin cumplir es una celda
 * vacía (ver `ps-heat-cell` sin modificador en `scenes.css`), nunca una
 * falta marcada en rojo (el dato real es booleano por día, "incumplimiento"
 * no es un estado que el backend distinga). `done-suave` es sólo textura
 * tipo GitHub, sigue siendo "cumplido".
 */
export const id = "habitos";

const PATRON_HEATMAP = [
  "done", "done", "none", "done", "none", "done", "done-suave",
  "done", "none", "done", "done-suave", "none", "done", "done",
  "done", "none", "done-suave", "done", "done", "none", "done",
  "none", "done", "done", "done-suave", "done", "none", "done",
];

function celdas() {
  return PATRON_HEATMAP.map((estado) => {
    const clase = estado === "none" ? "" : ` ps-heat-cell--${estado}`;
    return `<div class="ps-heat-cell${clase}"></div>`;
  }).join("");
}

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-habitos ps-pad">
      <h2 class="ps-title">Leer 20 minutos</h2>
      <div class="ps-heatmap">${celdas()}</div>
      <div class="ps-stat-card">
        <div class="ps-stat-titulo">Racha y consolidación</div>
        <p>Racha actual: 6 día(s)</p>
        <p>Antigüedad: 42 día(s)</p>
        <p>Cumplimiento últimos 28 día(s): 24/28 (85.7%)</p>
        <div class="ps-stat-divider"></div>
        <p class="ps-stat-nota">Todavía no alcanza el umbral para sugerirlo como Rutina.</p>
      </div>
      <div class="ps-switch-row">
        <span>Cumplido hoy</span>
        <div class="ps-switch" aria-hidden="true"></div>
      </div>
    </div>
  `;
}

export function play() {
  return null;
}

export function pause() {}

export function reset() {}
