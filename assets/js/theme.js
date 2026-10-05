/*
  Yaruki — toggle de tema sol/luna (plan, 4.0).
  Por defecto no fija ningún `data-theme`: `tokens.css` ya resuelve claro/
  oscuro con `prefers-color-scheme`. Sólo cuando la persona toca el toggle
  se fija un `data-theme` explícito (mayor especificidad que el `@media`,
  ver tokens.css) y se recuerda en `localStorage`, envuelto en try/catch —
  la página debe funcionar igual si el storage está bloqueado.
*/
const CLAVE_TEMA = "yaruki-theme";

function leerTemaGuardado() {
  try {
    const valor = localStorage.getItem(CLAVE_TEMA);
    return valor === "light" || valor === "dark" ? valor : null;
  } catch {
    return null;
  }
}

function guardarTema(tema) {
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    /* Sin storage disponible (privado/bloqueado): el toggle igual aplica
       el tema para esta carga, sólo no sobrevive a un refresh. */
  }
}

function prefiereOscuroElSistema() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Tema explícito ya fijado en <html>, o null si todavía sigue el sistema. */
function temaExplicitoActual() {
  const valor = document.documentElement.getAttribute("data-theme");
  return valor === "light" || valor === "dark" ? valor : null;
}

/** Se llama una sola vez al cargar — aplica el tema recordado, si hay. */
export function inicializarTema() {
  const guardado = leerTemaGuardado();
  if (guardado) {
    document.documentElement.setAttribute("data-theme", guardado);
  }
}

/** Alterna el tema actual (explícito o heredado del sistema) y lo recuerda. */
export function alternarTema() {
  const actual = temaExplicitoActual() ?? (prefiereOscuroElSistema() ? "dark" : "light");
  const siguiente = actual === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", siguiente);
  guardarTema(siguiente);
  return siguiente;
}
