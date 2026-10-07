/*
  Yaruki — íconos de trazo para las escenas del teléfono.
  Los 5 tipos de Elemento son los paths LITERALES de
  `asistente-android/app/.../ui/common/IconosBento.kt` (viewBox 24, trazo
  1.5/2, extremos y uniones redondeadas) — misma fuente que usa la app para
  la pantalla Elementos y las tarjetas ricas del chat. Los de la barra de
  navegación son outline genérico estilo Material (equivalentes visuales de
  los `Icons.Outlined.*` que usa `BottomNavBar.kt`; no hay forma de
  "importar" un ImageVector de Compose a SVG, así que se redibujan).
*/
const PATHS = {
  tareas: ["M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", "M9 11l3 3L22 4"],
  habitos: ["M17 2l4 4-4 4", "M3 11v-1a4 4 0 0 1 4-4h14", "M7 22l-4-4 4-4", "M21 13v1a4 4 0 0 1-4 4H3"],
  listas: ["M4 7h16", "M4 12h11", "M4 17h14"],
  notas: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6"],
  eventos: ["M7 4h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z", "M16 2v4", "M8 2v4", "M3 10h18"],
  home: ["M3 11l9-7 9 7", "M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"],
  campana: ["M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9", "M13.7 21a2 2 0 0 1-3.4 0"],
  mas: ["M12 5v14M5 12h14"],
};

function trazos(nombre) {
  return (PATHS[nombre] ?? []).map((d) => `<path d="${d}"/>`).join("");
}

/** SVG de trazo genérico (sin relleno) para uno de los `PATHS` de arriba. */
export function iconoTrazo(nombre) {
  return (
    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">${trazos(nombre)}</svg>`
  );
}

/** "Perfil" del navbar — círculo + arco, no entra en el esquema `d` único de arriba. */
export function iconoPersona() {
  return (
    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/>` +
    `<path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>`
  );
}

/** Micrófono — mismo glifo estándar que `IconoMicrofono` de `ChatScreen.kt` aproxima a mano. */
export function iconoMic() {
  return (
    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z"/>` +
    `<path d="M19 11a7 7 0 0 1-14 0"/><line x1="12" y1="18" x2="12" y2="22"/>` +
    `<line x1="8" y1="22" x2="16" y2="22"/></svg>`
  );
}

/**
 * Auricular de llamada — glifo "call" estándar de Material (relleno, 24×24),
 * para los botones de Contestar/Colgar de la escena `llamada` (punto de
 * control 2, bug 7). El de Colgar es el MISMO glifo rotado 135° por CSS
 * (`.ps-call-btn--rechazar svg`) — así arma el ícono "call_end" real de
 * Material sin dibujar un segundo path.
 */
export function iconoTelefono() {
  return (
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 ` +
    `1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 ` +
    `0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`
  );
}

/**
 * Trofeo de trazo (estilo IconosBento — viewBox 24, trazo redondeado), para
 * el modal de logro (punto de control 2, mejora 10). Path del ícono
 * "trophy" de Lucide (ISC) — mismo origen que ya usa `IconosBento.habitos`
 * en la app (el `repeat` de Lucide, ver su propio KDoc), así que no es una
 * fuente nueva para este repo.
 */
export function iconoTrofeo() {
  return (
    `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">` +
    `<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>` +
    `<path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>` +
    `<path d="M4 22h16"/>` +
    `<path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>` +
    `<path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>` +
    `<path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>` +
    `</svg>`
  );
}

/** "Send" relleno de Material (`Icons.AutoMirrored.Filled.Send` en ChatScreen.kt). */
export function iconoEnviar() {
  return `<svg class="ps-icono-enviar" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21.85 12 3.4 3.6 3.39 10.1 16 12 3.39 13.9z"/></svg>`;
}

/** Barra de estado genérica de Android: hora a la izquierda, wifi y batería a la derecha. */
export function barraDeEstado() {
  return (
    `<div class="ps-status" aria-hidden="true"><span>9:41</span><span class="ps-status-iconos">` +
    `<svg viewBox="0 0 16 12"><path d="M8 12 0 3.6A11.6 11.6 0 0 1 8 .5a11.6 11.6 0 0 1 8 3.1z"/></svg>` +
    `<svg viewBox="0 0 24 12"><path d="M3 0h16a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3zm0 1.5A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h16A1.5 1.5 0 0 0 20.5 9V3A1.5 1.5 0 0 0 19 1.5z"/>` +
    `<rect x="3" y="3" width="12.5" height="6" rx="1"/><path d="M23 4v4a1.6 1.6 0 0 0 0-4z"/></svg>` +
    `</span></div>`
  );
}

/**
 * Barra inferior de `BottomNavBar.kt`: Inicio, Elementos, FAB central "+"
 * (nuevo chat), Notif. y Perfil. `activo` resalta el destino de la escena.
 */
export function barraDeNavegacion(activo) {
  const item = (id, icono, etiqueta) =>
    `<div class="ps-nav-item${id === activo ? " ps-nav-item--activo" : ""}">${icono}<span>${etiqueta}</span></div>`;
  return (
    `<div class="ps-navbar" aria-hidden="true">` +
    item("inicio", iconoTrazo("home"), "Inicio") +
    item("elementos", iconoTrazo("listas"), "Elementos") +
    `<div class="ps-nav-fab">${iconoTrazo("mas")}</div>` +
    item("notificaciones", iconoTrazo("campana"), "Notif.") +
    item("perfil", iconoPersona(), "Perfil") +
    `</div>`
  );
}
