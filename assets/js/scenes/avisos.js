import { iconoTrazo, barraDeNavegacion } from "../icons.js";

/**
 * Avisos — la pestaña Notificaciones de la app, 1:1 de
 * `ui/notificaciones/NotificacionesScreen.kt` (issues #46 y #51 de
 * asistente-android): chips de filtro, "Vencidas · N" en rojo, "Hábitos
 * diarios", "Próximos" con Hoy siempre abierto y los demás grupos en
 * acordeón, y la barra inferior con "Notif." activa. Los textos de cada
 * fila son los de `DecisionRecordatorio.kt` ("Tarea pendiente para ahora.",
 * "Empieza en 15 minutos.") y el detalle de vencidas, "Era para …".
 *
 * Coreografía (sólo `transform`/`opacity`): baja el aviso del sistema de la
 * junta (15 minutos antes, como la app), se va, y la fila de "Llamar al
 * doctor" se desliza a la derecha para mostrar "Completar" y regresa a su
 * lugar — en la app el deslizar nunca ejecuta solo, pide confirmación.
 *
 * Datos de ejemplo (no vienen de ninguna cuenta real), los mismos nombres
 * que ya usan Dashboard y Llamada para que el recorrido cuente una sola
 * historia.
 */
export const id = "avisos";

let refs = null;
let tl = null;

function prefiereMovimientoReducido() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const fila = (icono, titulo, detalle, extra = "") => `
  <div class="ps-aviso${extra}">
    <span class="ps-aviso-icono">${iconoTrazo(icono)}</span>
    <span class="ps-aviso-textos">
      <span class="ps-aviso-titulo">${titulo}</span>
      <span class="ps-aviso-detalle">${detalle}</span>
    </span>
  </div>`;

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-avisos">
      <div class="ps-topbar">
        <span class="ps-topbar-titulo">Notificaciones</span>
      </div>
      <div class="ps-avisos-cuerpo">
        <div class="ps-chips">
          <span class="ps-chip ps-chip--activo">Todos</span>
          <span class="ps-chip">Tareas</span>
          <span class="ps-chip">Eventos</span>
          <span class="ps-chip">Hábitos</span>
        </div>
        <div class="ps-avisos-seccion ps-avisos-seccion--peligro">Vencidas · 1</div>
        ${fila("tareas", "Pagar el recibo de luz", "Era para ayer · 20:00")}
        <div class="ps-avisos-seccion">Hábitos diarios</div>
        ${fila("habitos", "Meditar 10 minutos", "Todos los días · 07:30")}
        <div class="ps-avisos-seccion">Próximos</div>
        <div class="ps-avisos-grupo">HOY</div>
        ${fila("eventos", "Junta con ventas", "16:45 · Empieza en 15 minutos.")}
        <div class="ps-aviso-deslizable">
          <div class="ps-aviso-fondo"><span>Completar</span></div>
          ${fila("tareas", "Llamar al doctor", "18:00 · Tarea pendiente para ahora.", " ps-aviso--movil")}
        </div>
        <div class="ps-avisos-grupo ps-avisos-grupo--acordeon">
          <span>ESTA SEMANA · 3</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
        </div>
      </div>
      <div class="ps-heads-up">
        <span class="ps-heads-up-icono"><span class="ps-dot"></span></span>
        <span class="ps-aviso-textos">
          <span class="ps-heads-up-app">Yaruki · ahora</span>
          <span class="ps-aviso-titulo">Junta con ventas</span>
          <span class="ps-aviso-detalle">Empieza en 15 minutos.</span>
        </span>
      </div>
      ${barraDeNavegacion("notificaciones")}
    </div>
  `;
  refs = {
    banner: contenedor.querySelector(".ps-heads-up"),
    movil: contenedor.querySelector(".ps-aviso--movil"),
    fondo: contenedor.querySelector(".ps-aviso-fondo"),
  };
}

function estadoQuieto() {
  gsap.set(refs.banner, { yPercent: -140, opacity: 0 });
  gsap.set(refs.movil, { xPercent: 0 });
  gsap.set(refs.fondo, { opacity: 0 });
}

/**
 * En bucle mientras la sección se lee: el aviso baja (0.5 s), se queda
 * 1.6 s y sube; luego la fila se desliza al 52% con el fondo verde de
 * "Completar" y regresa con un rebote corto.
 */
export function play() {
  if (!refs) return null;
  if (tl) tl.kill();
  estadoQuieto();
  if (prefiereMovimientoReducido()) return null;
  tl = gsap.timeline({ repeat: -1, repeatDelay: 1.4, delay: 0.5 });
  tl.to(refs.banner, { yPercent: 0, opacity: 1, duration: 0.5, ease: "power3.out" });
  tl.to(refs.banner, { yPercent: -140, opacity: 0, duration: 0.4, ease: "power2.in" }, "+=1.6");
  tl.to(refs.fondo, { opacity: 1, duration: 0.2 }, "+=0.5");
  tl.to(refs.movil, { xPercent: 52, duration: 0.7, ease: "power2.inOut" }, "<");
  tl.to(refs.movil, { xPercent: 0, duration: 0.55, ease: "back.out(1.6)" }, "+=0.5");
  tl.to(refs.fondo, { opacity: 0, duration: 0.2 }, ">-0.1");
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
  if (refs) estadoQuieto();
}
