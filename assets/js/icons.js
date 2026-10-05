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
