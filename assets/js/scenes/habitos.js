/**
 * Hábitos — mezcla (plan, 4.4 y sección 2): heatmap estilo GitHub del
 * mockup (pantalla 11 — la app todavía no tiene heatmap, aunque el dato de
 * cumplimiento diario sí existe) + la tarjeta "Racha y consolidación" y el
 * switch "Cumplido hoy" REALES de `ui/elementos/habitos/HabitoDetalleScreen.kt`
 * (`EstadisticasCard`/`CumplimientoHoyRow`), mismo texto literal.
 *
 * Datos de ejemplo coherentes con la lógica real del backend
 * (`ServicioHabitoRegistros::estadisticas()`):
 * - Antigüedad 15 días → la ventana es `min(30, antigüedad)` = 15, de ahí
 *   "últimos 15 día(s)", y el heatmap sólo pinta esos 15 días (las celdas
 *   anteriores a la creación del hábito quedan "fuera").
 * - Porcentaje con 2 decimales (`round(x * 100, 2)`): 10/15 = 66.67%,
 *   11/15 = 73.33%.
 * - Sin elegibilidad para consolidar (pide ≥ 21 días Y ≥ 80%): el texto
 *   "Todavía no alcanza el umbral…" es el que la app mostraría.
 * - El switch refleja `racha_actual > 0`: ayer no se cumplió, así que antes
 *   de marcar hoy la racha es 0 y el switch está apagado; al prenderse, la
 *   celda de hoy se llena y la racha pasa a 1.
 *
 * Sin rojo: un día sin cumplir es una celda vacía (el dato real es booleano
 * por día). `--suave` es sólo textura tipo GitHub, sigue siendo "cumplido".
 */
export const id = "habitos";

/** Días anteriores a la creación del hábito (fuera de la ventana): completan la grilla de 3 semanas. */
const DIAS_FUERA = 6;
/** Los 14 días de la ventana antes de hoy: 10 cumplidos, ayer vacío (racha 0). */
const PATRON_VENTANA = [
  "done", "done-suave", "none", "done", "done", "none", "done",
  "done-suave", "done", "none", "done", "done", "done", "none",
];
const ANTIGUEDAD = PATRON_VENTANA.length + 1;
const CUMPLIDOS_ANTES = PATRON_VENTANA.filter((d) => d !== "none").length;

const CLASE_CELDA = { done: " ps-celda--hecha", "done-suave": " ps-celda--suave", none: "" };

function celdas() {
  const fuera = Array.from({ length: DIAS_FUERA }, () => `<div class="ps-celda ps-celda--fuera"></div>`);
  const ventana = PATRON_VENTANA.map((estado) => `<div class="ps-celda${CLASE_CELDA[estado]}"></div>`);
  // La última celda es "hoy": empieza vacía y se llena cuando el switch se activa.
  return [...fuera, ...ventana, `<div class="ps-celda ps-celda--hoy"></div>`].join("");
}

/** Mismo redondeo que el backend: `round(x * 100, 2)`; PHP lo serializa sin ceros de sobra. */
function porcentaje(cumplidos, dias) {
  return String(Math.round((cumplidos / dias) * 10000) / 100);
}

function textoCumplimiento(cumplidos) {
  return `${cumplidos}/${ANTIGUEDAD} (${porcentaje(cumplidos, ANTIGUEDAD)}%)`;
}

let refs = null;
let demora = null;

function prefiereMovimientoReducido() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Cumplido hoy: prende el switch, llena la celda de hoy y la racha pasa de 0 a 1 (plan 4.4, punto 2). */
function marcarHoy(cumplido, { animar = false } = {}) {
  if (!refs) return;
  refs.switch.classList.toggle("ps-switch--on", cumplido);
  refs.hoy.classList.toggle("ps-celda--hecha", cumplido);
  refs.racha.textContent = cumplido ? "1" : "0";
  refs.cumplimiento.textContent = textoCumplimiento(CUMPLIDOS_ANTES + (cumplido ? 1 : 0));
  if (animar && cumplido) {
    // La racha sube con un rebote chico (sólo `transform`).
    gsap.fromTo(refs.racha, { scale: 1.6, y: -2 }, { scale: 1, y: 0, duration: 0.6, ease: "back.out(3)" });
  }
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
          <p>Racha actual: <span class="ps-racha" data-racha>0</span> día(s)</p>
          <p>Antigüedad: ${ANTIGUEDAD} día(s)</p>
          <p>Cumplimiento últimos ${ANTIGUEDAD} día(s): <span data-cumplimiento>${textoCumplimiento(CUMPLIDOS_ANTES)}</span></p>
          <div class="ps-divisor"></div>
          <p class="ps-nota">Todavía no alcanza el umbral para sugerirlo como Rutina.</p>
        </div>
        <div class="ps-card ps-fila-switch">
          <span>Cumplido hoy</span>
          <div class="ps-switch" aria-hidden="true"><span class="ps-switch-perilla"></span></div>
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
 * El switch "Cumplido hoy" se activa solo a los ~2 s de entrar a la sección
 * — una demo de cómo se ve un hábito cumplido hoy. `pause()` cancela el
 * temporizador si la sección queda atrás antes de que dispare.
 */
export function play() {
  if (!refs) return null;
  if (demora) demora.kill();
  if (prefiereMovimientoReducido()) {
    marcarHoy(true);
    return null;
  }
  marcarHoy(false);
  demora = gsap.delayedCall(2.2, () => marcarHoy(true, { animar: true }));
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
