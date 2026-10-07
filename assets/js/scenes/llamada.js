import { iconoTelefono } from "../icons.js";

/**
 * Llamada — sale del mockup (pantalla 18, plan sección 2): anillos
 * concéntricos pulsando alrededor de la mascota. No existe en la app. El
 * chip "Próximamente" va en el texto lateral de la sección (ver
 * `index.html`, `#fase-llamada`), no repetido dentro del teléfono — la
 * pantalla imita una llamada entrante real, meter un chip adentro rompería
 * la ficción visual.
 *
 * **Punto de control 2, bug 7:** el degradado de fondo ya no usa tokens de
 * tema (quedaba invertido/claro en modo oscuro, ver `scenes.css`) y los
 * botones de Colgar/Contestar llevan el ícono real de auricular en vez de
 * círculos de color vacíos.
 */
export const id = "llamada";

let refs = null;
let tweens = [];

function prefiereMovimientoReducido() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-llamada">
      <span class="ps-llamada-titular">Yaruki te está llamando</span>
      <div class="ps-pulso-wrap">
        <span class="ps-pulso-anillo" aria-hidden="true"></span>
        <span class="ps-pulso-anillo" aria-hidden="true"></span>
        <span class="ps-pulso-anillo" aria-hidden="true"></span>
        <span class="ps-dot" aria-hidden="true"></span>
      </div>
      <span class="ps-llamada-sub">Recordatorio: reunión en 15 minutos</span>
      <div class="ps-llamada-acciones">
        <span class="ps-call-btn ps-call-btn--rechazar" aria-hidden="true">${iconoTelefono()}</span>
        <span class="ps-call-btn ps-call-btn--aceptar" aria-hidden="true">${iconoTelefono()}</span>
      </div>
    </div>
  `;
  refs = { anillos: Array.from(contenedor.querySelectorAll(".ps-pulso-anillo")) };
}

/**
 * Anillos concéntricos pulsando (plan, parte B) — antes `@keyframes` CSS
 * `infinite` (corría siempre, lejos o cerca de la sección); ahora cada
 * anillo es su propio tween GSAP con `repeat:-1` y un `delay` escalonado
 * (0, 0.6s, 1.2s — `delay` de GSAP sólo pega antes de la 1ra vuelta, no en
 * cada repetición, así que el escalonado se mantiene vuelta tras vuelta
 * sin volver a calcularlo), arrancado/pausado por `stage.js` al
 * entrar/salir de la sección.
 */
export function play() {
  if (!refs) return null;
  tweens.forEach((t) => t.kill());
  if (prefiereMovimientoReducido()) {
    gsap.set(refs.anillos, { scale: 1, opacity: 0.5 });
    tweens = [];
    return null;
  }
  gsap.set(refs.anillos, { transformOrigin: "center" });
  tweens = refs.anillos.map((anillo, i) =>
    gsap.fromTo(
      anillo,
      { scale: 0.85, opacity: 0.6 },
      { scale: 1.5, opacity: 0, duration: 1.8, ease: "power1.out", repeat: -1, delay: i * 0.6 }
    )
  );
  return tweens;
}

export function pause() {
  tweens.forEach((t) => t.pause());
}

export function reset() {
  tweens.forEach((t) => t.kill());
  tweens = [];
  if (refs) gsap.set(refs.anillos, { scale: 1, opacity: 0.5 });
}
