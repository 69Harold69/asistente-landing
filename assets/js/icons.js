/*
  Yaruki — íconos para las escenas del teléfono.
  Los 5 tipos de Elemento (de trazo) son los paths LITERALES de
  `asistente-android/app/.../ui/common/IconosBento.kt` (viewBox 24, trazo
  1.5/2, extremos y uniones redondeadas) — misma fuente que usa la app para
  la pantalla Elementos y las tarjetas ricas del chat. Los de la barra de
  navegación y del botón del asistente son los de Material (rellenos), ver
  `MATERIAL` más abajo.
*/
const PATHS = {
  tareas: ["M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", "M9 11l3 3L22 4"],
  habitos: ["M17 2l4 4-4 4", "M3 11v-1a4 4 0 0 1 4-4h14", "M7 22l-4-4 4-4", "M21 13v1a4 4 0 0 1-4 4H3"],
  listas: ["M4 7h16", "M4 12h11", "M4 17h14"],
  notas: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6"],
  eventos: ["M7 4h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z", "M16 2v4", "M8 2v4", "M3 10h18"],
};

/**
 * Íconos de Material (rellenos, viewBox 24) de la barra inferior y del botón del asistente. Son los
 * paths LITERALES de `material-icons-core` 1.6.8 (`Icons.Outlined.Home`, `Icons.AutoMirrored.Outlined.List`,
 * `Icons.Outlined.Notifications`, `Icons.Outlined.Person`), traducidos de los comandos de `materialPath`
 * de sus fuentes (`moveTo` → M, `lineToRelative` → l, etc.), y el de `ui/common/IconoChat.kt:21-24`.
 * No son aproximaciones dibujadas a mano.
 */
const MATERIAL = {
  home: "M12 5.69l5 4.5V18h-2v-6H9v6H7v-7.81l5-4.5M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3Z",
  lista: "M3 13h2v-2H3v2ZM3 17h2v-2H3v2ZM3 9h2V7H3v2ZM7 13h14v-2H7v2ZM7 17h14v-2H7v2ZM7 7v2h14V7H7Z",
  notificaciones:
    "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2ZM18 16v-5c0-3.07-1.63-5.64-4.5-6.32L13.5 4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2ZM16 17H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6Z",
  persona:
    "M12 6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2m0 10c2.7 0 5.8 1.29 6 2H6c.23-.72 3.31-2 6-2m0-12C9.79 4 8 5.79 8 8s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4ZM12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z",
  chat: "M20,2H4c-1.1,0 -2,0.9 -2,2v18l4,-4h14c1.1,0 2,-0.9 2,-2V4c0,-1.1 -0.9,-2 -2,-2zM20,16H5.17L4,17.17V4h16v12z",
};

/** SVG relleno de uno de los íconos de Material de arriba (`currentColor`). */
export function iconoMaterial(nombre) {
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${MATERIAL[nombre]}"/></svg>`;
}

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
 * Logotipo de letras «Yaruki» (`ui/common/LogotipoYaruki.kt:16-26`): texto Bold con `letterSpacing 0.5sp` en el
 * color `primary`. `grande` = `displaySmall` (Login y Registro, `LoginScreen.kt:110`); por defecto
 * `headlineMedium` (Inicio, `DashboardScreen.kt:204`). Las medidas viven en `.ps-logotipo` (scenes.css).
 */
export function logotipo(grande = false) {
  return `<span class="ps-logotipo${grande ? " ps-logotipo--grande" : ""}">Yaruki</span>`;
}

/**
 * Botón extendido del asistente (`BottomNavBar.kt:243-281`, `BotonAsistente`): ícono de burbuja de chat y el
 * texto «Pídeselo a Yaruki». Lo coloca `.ps-boton-asistente` sobre la barra, centrado (`FabPosition.Center`).
 */
export function botonAsistente() {
  return `<div class="ps-boton-asistente" aria-hidden="true">${iconoMaterial("chat")}<span>Pídeselo a Yaruki</span></div>`;
}

/**
 * Barra inferior de `BottomNavBar.kt:129-161`: cuatro destinos (Inicio, Elementos, Notif., Perfil), sin botón
 * central. `activo` resalta el destino de la escena. Las cuatro pantallas con barra (Inicio, Elementos,
 * Notificaciones y Perfil) llevan además el botón del asistente (`BotonAsistente(`, slot `floatingActionButton`
 * de su `Scaffold`), que se dibuja aquí junto con la barra.
 */
export function barraDeNavegacion(activo) {
  const item = (id, icono, etiqueta) =>
    `<div class="ps-nav-item${id === activo ? " ps-nav-item--activo" : ""}">${iconoMaterial(icono)}<span>${etiqueta}</span></div>`;
  return (
    botonAsistente() +
    `<div class="ps-navbar" aria-hidden="true">` +
    item("inicio", "home", "Inicio") +
    item("elementos", "lista", "Elementos") +
    item("notificaciones", "notificaciones", "Notif.") +
    item("perfil", "persona", "Perfil") +
    `</div>`
  );
}
