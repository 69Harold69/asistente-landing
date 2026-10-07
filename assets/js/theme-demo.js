import { prefiereOscuroElSistema, temaExplicitoActual } from "./theme.js";

/*
  Yaruki — demo del tema al cargar (plan, parte B, etapa 9): un parpadeo
  breve al tema CONTRARIO del que está activo (guardado o del sistema),
  para que la persona vea que el toggle existe sin tener que ir a
  buscarlo. Reglas, todas explícitas del encargo:
  - Una sola vez por visita — `sessionStorage`, envuelto en try/catch (si
    el storage está bloqueado, mejor no insistir en cada carga que romper
    la página).
  - Nunca si la persona pide menos movimiento (`prefers-reduced-motion`).
  - Revierte EXACTAMENTE al estado de antes: si no había `data-theme`
    explícito (seguía al sistema), lo saca del todo al terminar — nunca
    "fija" sin querer un tema que la persona no eligió tocando el toggle.
  - La transición en sí la hace CSS (`--theme-transition`, tokens.css,
    ~600ms) al cambiar `data-theme` — acá sólo se agendan los 2 cambios
    de atributo con `setTimeout`, nada de animar nada a mano.
*/
const CLAVE_DEMO = "yaruki-theme-demo-visto";
const ESPERA_INICIAL_MS = 700;
const DURACION_VISIBLE_MS = 1000;

function prefiereMovimientoReducido() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function yaSeMostro() {
  try {
    return sessionStorage.getItem(CLAVE_DEMO) === "1";
  } catch {
    // Sin `sessionStorage` (privado/bloqueado): no se puede recordar entre
    // cargas, pero tampoco se insiste — tratarlo como "ya visto" es más
    // seguro que repetir el parpadeo en cada recarga de la sesión.
    return true;
  }
}

function marcarMostrado() {
  try {
    sessionStorage.setItem(CLAVE_DEMO, "1");
  } catch {
    /* Ver comentario de `yaSeMostro` — no hay nada que recuperar acá. */
  }
}

export function mostrarDemoDeTemaSiCorresponde() {
  if (prefiereMovimientoReducido() || yaSeMostro()) return;
  marcarMostrado();

  const explicitoAntes = temaExplicitoActual();
  const actual = explicitoAntes ?? (prefiereOscuroElSistema() ? "dark" : "light");
  const opuesto = actual === "dark" ? "light" : "dark";

  window.setTimeout(() => {
    document.documentElement.setAttribute("data-theme", opuesto);
    window.setTimeout(() => {
      if (explicitoAntes) {
        document.documentElement.setAttribute("data-theme", explicitoAntes);
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    }, DURACION_VISIBLE_MS);
  }, ESPERA_INICIAL_MS);
}
