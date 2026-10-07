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

const CLASE_CELDA = { done: " ps-celda--hecha", "done-suave": " ps-celda--suave", none: "" };

/** La última celda es "hoy": empieza vacía y se llena cuando el switch se activa. */
function celdas() {
  return PATRON_HEATMAP.map((estado, i) => {
    if (i === PATRON_HEATMAP.length - 1) return `<div class="ps-celda ps-celda--hoy"></div>`;
    return `<div class="ps-celda${CLASE_CELDA[estado]}"></div>`;
  }).join("");
}

let refs = null;
let demora = null;

function prefiereMovimientoReducido() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Cumplido hoy: prende el switch, llena la celda de hoy y sube la racha en 1
 * (plan 4.4, punto 2). Los números son de ejemplo pero consistentes entre sí.
 */
function marcarHoy(cumplido) {
  if (!refs) return;
  refs.switch.classList.toggle("ps-switch--on", cumplido);
  refs.hoy.classList.toggle("ps-celda--hecha", cumplido);
  refs.racha.textContent = cumplido ? "6" : "5";
  refs.cumplimiento.textContent = cumplido ? "24/28 (85.7%)" : "23/28 (82.1%)";
}

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-habitos">
      <div class="ps-topbar"><span class="ps-topbar-titulo">Detalle de hábito</span></div>
      <div class="ps-habitos-cuerpo">
        <h2 class="ps-titulo">Leer 20 minutos</h2>
        <div class="ps-heatmap">${celdas()}</div>
        <div class="ps-card">
          <div class="ps-card-titulo">Racha y consolidación</div>
          <p>Racha actual: <span data-racha>5</span> día(s)</p>
          <p>Antigüedad: 42 día(s)</p>
          <p>Cumplimiento últimos 28 día(s): <span data-cumplimiento>23/28 (82.1%)</span></p>
          <div class="ps-divisor"></div>
          <p class="ps-nota">Todavía no alcanza el umbral para sugerirlo como Rutina.</p>
        </div>
        <div class="ps-card ps-fila-switch">
          <span>Cumplido hoy</span>
          <div class="ps-switch" aria-hidden="true"></div>
        </div>
      </div>
    </div>
  `;
  refs = {
    switch: contenedor.querySelector(".ps-switch"),
    hoy: contenedor.querySelector(".ps-celda--hoy"),
    racha: contenedor.querySelector("[data-racha]"),
    cumplimiento: contenedor.querySelector("[data-cumplimiento]"),
  };
}

/**
 * El switch "Cumplido hoy" se activa solo a los ~2-3s de entrar a la
 * sección (plan, parte B) — no es que el visitante lo toque, es una
 * demo de que así se ve un hábito ya cumplido hoy. Arranca "apagado" en
 * `mount()` (ver `scenes.css`) para que haya algo que animar; `pause()`
 * cancela el temporizador si la sección queda atrás antes de que dispare
 * (scroll rápido) — si no, el switch se prendería solo, fuera de
 * pantalla, y el sub-cruce a "logro" (stage.js) lo encontraría ya
 * prendido la próxima vez sin haberse "visto" prender.
 */
export function play() {
  if (!refs) return null;
  if (demora) demora.kill();
  if (prefiereMovimientoReducido()) {
    marcarHoy(true);
    return null;
  }
  marcarHoy(false);
  demora = gsap.delayedCall(2.2, () => marcarHoy(true));
  return demora;
}

export function pause() {
  if (demora) {
    demora.kill();
    demora = null;
  }
}

export function reset() {
  pause();
  if (refs) marcarHoy(false);
}
