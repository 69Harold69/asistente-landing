/*
  Yaruki — tema claro/oscuro (plan, 4.0).
  Por defecto no fija ningún `data-theme`: `tokens.css` resuelve claro/oscuro
  con `prefers-color-scheme`. Sólo cuando la persona toca el toggle se fija un
  `data-theme` explícito (mayor especificidad que el `@media`) y se recuerda
  en `localStorage`, envuelto en try/catch: la página funciona igual si el
  storage está bloqueado.

  Cambio de tema animado (`transicionarTema`):
  - Con View Transitions: el tema nuevo se revela en un círculo que crece
    desde el botón sol/luna (o se contrae hacia él, al volver de la demo).
    La animación es `clip-path` sobre `::view-transition-new/old(root)`, en
    base.css; acá sólo se fijan el centro y el radio como variables CSS.
  - Sin View Transitions: fundido parejo de TODO el sitio (variables de color
    registradas con `@property`, base.css), sin bandas.
  - Con "reducir movimiento": cambio directo.
*/
const CLAVE_TEMA = "yaruki-theme";
const MQ_OSCURO = "(prefers-color-scheme: dark)";

function leerTemaGuardado() {
  try {
    const valor = localStorage.getItem(CLAVE_TEMA);
    return valor === "light" || valor === "dark" ? valor : null;
  } catch {
    return null;
  }
}

export function guardarTema(tema) {
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    /* Sin storage (privado/bloqueado): el tema aplica a esta carga, nada más. */
  }
}

export function prefiereOscuroElSistema() {
  return window.matchMedia(MQ_OSCURO).matches;
}

function prefiereMovimientoReducido() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Tema explícito ya fijado en <html>, o null si todavía sigue el sistema. */
export function temaExplicitoActual() {
  const valor = document.documentElement.getAttribute("data-theme");
  return valor === "light" || valor === "dark" ? valor : null;
}

/** Tema efectivo ahora mismo: el explícito o, si no hay, el del sistema. */
export function temaEfectivo() {
  return temaExplicitoActual() ?? (prefiereOscuroElSistema() ? "dark" : "light");
}

export const opuestoDe = (tema) => (tema === "dark" ? "light" : "dark");

/** `null` vuelve a seguir al sistema (quita el atributo). */
export function fijarTema(tema) {
  if (tema) document.documentElement.setAttribute("data-theme", tema);
  else document.documentElement.removeAttribute("data-theme");
}

/** Se llama una sola vez al cargar — aplica el tema recordado, si hay. */
export function inicializarTema() {
  const guardado = leerTemaGuardado();
  if (guardado) fijarTema(guardado);
}

let transicionActiva = null;
let finFundido = 0;

/** Corta en seco el cambio animado que esté en curso (la demo, al primer clic). */
export function cortarTransicion() {
  transicionActiva?.skipTransition?.();
  transicionActiva = null;
}

/**
 * Aplica `cambio()` (que modifica `data-theme`) con el revelado circular
 * desde `origen`. `modo`: "revelar" (el tema nuevo crece desde el botón) o
 * "contraer" (el tema viejo se encoge hacia el botón). Devuelve una promesa
 * que se resuelve al terminar la animación.
 */
export function transicionarTema(cambio, { origen = null, modo = "revelar" } = {}) {
  const raiz = document.documentElement;
  if (prefiereMovimientoReducido()) {
    cambio();
    return Promise.resolve();
  }

  if (typeof document.startViewTransition === "function") {
    const r = origen?.getBoundingClientRect();
    const x = r ? r.left + r.width / 2 : window.innerWidth - 40;
    const y = r ? r.top + r.height / 2 : 40;
    const radio = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    raiz.style.setProperty("--vt-x", `${x}px`);
    raiz.style.setProperty("--vt-y", `${y}px`);
    raiz.style.setProperty("--vt-r", `${Math.ceil(radio)}px`);
    raiz.dataset.vt = modo;
    const vt = document.startViewTransition(cambio);
    transicionActiva = vt;
    return vt.finished
      .catch(() => {})
      .finally(() => {
        if (transicionActiva === vt) {
          transicionActiva = null;
          delete raiz.dataset.vt;
        }
      });
  }

  // Sin View Transitions: fundido de las variables de color (base.css).
  raiz.classList.add("tema-fundido");
  cambio();
  window.clearTimeout(finFundido);
  return new Promise((resolver) => {
    finFundido = window.setTimeout(() => {
      raiz.classList.remove("tema-fundido");
      resolver();
    }, 650);
  });
}

/**
 * Mantiene `aria-pressed` del toggle ("Tema oscuro", botón de alternar)
 * igual al tema que se ve — también durante la demo y si cambia el tema del
 * sistema con la página abierta.
 */
export function sincronizarToggle(botones) {
  const aplicar = () => {
    const oscuro = temaEfectivo() === "dark";
    botones.forEach((b) => b.setAttribute("aria-pressed", String(oscuro)));
  };
  aplicar();
  new MutationObserver(aplicar).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.matchMedia(MQ_OSCURO).addEventListener?.("change", aplicar);
}
