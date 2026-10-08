/**
 * Logro — sale del mockup (pantalla 14, plan sección 2): modal con confeti.
 * El sistema de recompensas no existe en la app y sus reglas no están
 * definidas (plan, 4.4, punto 3: "sin prometer reglas — al llegar a 30 días
 * desbloqueas X está prohibido"), así que el texto es deliberadamente
 * genérico ("vas muy bien") en vez de repetir el ejemplo del mockup
 * ("Desbloqueaste el marco Constancia", que SÍ nombra una regla concreta
 * que no existe todavía). Lleva el chip "Próximamente" (regla de la
 * sección 2 del plan: toda función fuera del MVP se marca así).
 */
import { iconoTrofeo } from "../icons.js";

export const id = "logro";

let refs = null;
let confetiPropio = null;
let jugando = false;
let turno = 0;
let carga = null;

/**
 * canvas-confetti (25 KB) se carga recién cuando esta escena se monta (al
 * acercarse a Hábitos), no en el `<head>`: no tiene nada que hacer en la
 * primera carga. Script del mismo origen, permitido por `script-src 'self'`.
 */
function cargarConfeti() {
  if (window.confetti) return Promise.resolve();
  carga ??= new Promise((listo, error) => {
    const script = document.createElement("script");
    script.src = new URL("../vendor/canvas-confetti.min.js", import.meta.url).href;
    script.onload = listo;
    script.onerror = error;
    document.head.append(script);
  }).catch(() => {
    carga = null;
  });
  return carga;
}

function prefiereMovimientoReducido() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-logro">
      <canvas class="ps-confeti-canvas" aria-hidden="true"></canvas>
      <div class="ps-logro-modal">
        <div class="ps-logro-insignia" aria-hidden="true">${iconoTrofeo()}</div>
        <strong>Vas muy bien</strong>
        <p>Cuando tu constancia sea lo bastante fuerte, Yaruki te lo va a hacer saber.</p>
        <span class="ps-chip-proximamente">Próximamente</span>
      </div>
    </div>
  `;
  refs = { canvas: contenedor.querySelector(".ps-confeti-canvas") };
  confetiPropio = null;
  if (!prefiereMovimientoReducido()) cargarConfeti();
}

/**
 * Confeti real (`canvas-confetti`, vendorizado — `assets/js/vendor/`, ver
 * `index.html` y `LICENSE-canvas-confetti.txt`), no los puntos CSS
 * estáticos de antes. `confetti.create(canvas, {resize:true})` da una
 * instancia ACOTADA a este `<canvas>` (del tamaño de la pantallita del
 * teléfono, no de toda la ventana) — la llamada por defecto del paquete
 * crea un canvas propio a pantalla completa, que acá se saldría del
 * mockup. Se crea una sola vez por montaje y se reusa en cada `play()`
 * (reinicia el burst) en vez de crear un canvas nuevo cada vez.
 *
 * `prefers-reduced-motion`: sin burst — el modal (trofeo + texto) se ve
 * igual de completo, sólo sin el efecto, como pide la regla general.
 */
export function play() {
  jugando = true;
  const este = ++turno;
  if (!refs || prefiereMovimientoReducido()) return null;
  if (!window.confetti) {
    // Si todavía no llegó, el burst sale en cuanto llegue (si la escena sigue en pantalla).
    cargarConfeti().then(() => este === turno && jugando && window.confetti && play());
    return null;
  }
  if (!confetiPropio) {
    confetiPropio = window.confetti.create(refs.canvas, { resize: true, useWorker: false });
  }
  confetiPropio({
    particleCount: 60,
    spread: 70,
    startVelocity: 32,
    gravity: 1.1,
    ticks: 160,
    origin: { x: 0.5, y: 0.35 },
    colors: ["#6c5ce7", "#a29bfe", "#ffd166", "#ff8fa3"],
  });
  return null;
}

export function pause() {
  jugando = false;
  if (confetiPropio) confetiPropio.reset();
}

export function reset() {
  pause();
}
