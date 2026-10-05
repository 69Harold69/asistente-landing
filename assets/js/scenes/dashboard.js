import { iconoTrazo, iconoPersona } from "../icons.js";

/**
 * Dashboard (cierre) — real de `ui/dashboard/DashboardScreen.kt` (plan,
 * 4.6): "Tu día", mensaje "glass", tarjeta Racha, "Tareas hoy"/"Hábitos" y
 * "Pendientes" con sus pastillas (rótulos EXACTOS de `PastillaEstadoTarea`:
 * "Hecha"/"Pendiente"/"Vencida" — no "Hecho"/"Vencido" del mockup viejo).
 * Barra inferior de 5 íconos con el FAB central, igual a `BottomNavBar.kt`.
 */
export const id = "dashboard";

function iconoMas() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;
}

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-dash">
      <div class="ps-dash-header">
        <span class="ps-dot" aria-hidden="true"></span>
        <span>Tu día</span>
      </div>
      <div class="ps-glass">Llevas 2 de 4 tareas de hoy. Tu racha activa: 6 días en Leer 20 minutos.</div>
      <div class="ps-bento">
        <div class="ps-bento-card ps-bento-card--racha">
          <div class="ps-bento-label">Racha activa</div>
          <div class="ps-bento-value">6 días — Leer 20 minutos</div>
        </div>
        <div class="ps-bento-card">
          <div class="ps-bento-label">Tareas hoy</div>
          <div class="ps-bento-value">2/4</div>
          <div class="ps-bar"><div class="ps-bar-fill" data-progreso="0.5"></div></div>
        </div>
        <div class="ps-bento-card">
          <div class="ps-bento-label">Hábitos</div>
          <div class="ps-bento-value">2/3 hoy</div>
        </div>
      </div>
      <div class="ps-dash-pendientes">
        <div class="ps-dash-pendientes-titulo">Pendientes</div>
        <div class="ps-row-item">
          <span>Enviar el reporte de ventas</span>
          <span class="ps-pill ps-pill--hecha">Hecha</span>
        </div>
        <div class="ps-row-item">
          <span>Llamar al doctor</span>
          <span class="ps-pill ps-pill--pendiente">Pendiente</span>
        </div>
        <div class="ps-row-item">
          <span>Pagar el recibo de luz</span>
          <span class="ps-pill ps-pill--vencida">Vencida</span>
        </div>
      </div>
      <div class="ps-navbar" aria-hidden="true">
        <div class="ps-nav-item ps-nav-item--activo">${iconoTrazo("home")}<span>Inicio</span></div>
        <div class="ps-nav-item">${iconoTrazo("listas")}<span>Elementos</span></div>
        <div class="ps-nav-fab">${iconoMas()}</div>
        <div class="ps-nav-item">${iconoTrazo("campana")}<span>Notif.</span></div>
        <div class="ps-nav-item">${iconoPersona()}<span>Perfil</span></div>
      </div>
    </div>
  `;
}

export function play() {
  return null;
}

export function pause() {}

export function reset() {}
