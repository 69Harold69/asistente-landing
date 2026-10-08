import { barraDeNavegacion } from "../icons.js";
import { contar, detener } from "./contar.js";

/**
 * Dashboard (cierre) — real de `ui/dashboard/DashboardScreen.kt` (plan,
 * 4.6): "Tu día", mensaje "glass", tarjeta Racha, "Tareas hoy"/"Hábitos" y
 * "Pendientes" con sus pastillas (rótulos EXACTOS de `PastillaEstadoTarea`:
 * "Hecha"/"Pendiente"/"Vencida" — no "Hecho"/"Vencido" del mockup viejo).
 * Barra inferior de 5 íconos con el FAB central, igual a `BottomNavBar.kt`.
 */
export const id = "dashboard";

let conteos = [];
let raiz = null;

export function mount(contenedor) {
  raiz = contenedor;
  contenedor.innerHTML = `
    <div class="escena ps-dash">
      <h2 class="ps-titulo">Tu día</h2>
      <div class="ps-glass">Llevas 2 de 4 tareas de hoy. Tu racha activa: 6 días en Meditar 10 minutos.</div>
      <div class="ps-bento">
        <div class="ps-bento-card ps-bento-card--racha">
          <div class="ps-bento-etiqueta">Racha activa</div>
          <div class="ps-bento-valor"><span data-contar="6">6</span> días — Meditar 10 minutos</div>
        </div>
        <div class="ps-bento-card">
          <div class="ps-bento-etiqueta">Tareas hoy</div>
          <div class="ps-bento-valor"><span data-contar="2">2</span>/4</div>
          <div class="ps-barra"><div class="ps-barra-relleno" data-progreso="0.5"></div></div>
        </div>
        <div class="ps-bento-card">
          <div class="ps-bento-etiqueta">Hábitos</div>
          <div class="ps-bento-valor"><span data-contar="2">2</span>/3 hoy</div>
        </div>
      </div>
      <div class="ps-pendientes-titulo">Pendientes</div>
      <div class="ps-pendientes">
        <div class="ps-fila-tarea">
          <span>Enviar el reporte de ventas</span>
          <span class="ps-pastilla ps-pastilla--hecha">Hecha</span>
        </div>
        <div class="ps-fila-tarea">
          <span>Llamar al doctor</span>
          <span class="ps-pastilla ps-pastilla--pendiente">Pendiente</span>
        </div>
        <div class="ps-fila-tarea">
          <span>Pagar el recibo de luz</span>
          <span class="ps-pastilla ps-pastilla--vencida">Vencida</span>
        </div>
      </div>
      ${barraDeNavegacion("inicio")}
    </div>
  `;
}

/** Los números del bento cuentan hasta su valor al aterrizar en el cierre. */
export function play() {
  detener(conteos);
  conteos = contar(raiz, { retraso: 0.2 });
  return null;
}

export function pause() {
  detener(conteos, raiz);
  conteos = [];
}

export function reset() {
  pause();
}
