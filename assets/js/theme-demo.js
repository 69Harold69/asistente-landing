import { temaEfectivo, temaExplicitoActual, opuestoDe, fijarTema, transicionarTema, cortarTransicion } from "./theme.js";

/*
  Yaruki — demo del tema al cargar (decisión 3.5 del plan). Invita a mirar
  el toggle en vez de "parpadear": el tema contrario se revela en un círculo
  que crece DESDE el botón sol/luna (~700 ms), se queda ~1.2 s con una pista
  al lado ("Prueba el modo oscuro"/"…claro") y se contrae de vuelta hacia el
  botón. El ícono anima de sol a luna con el cambio (base.css).

  - Una vez por visita (`sessionStorage`, en try/catch: sin storage se trata
    como ya vista, mejor no insistir en cada recarga).
  - Nunca con `prefers-reduced-motion`.
  - Revierte exactamente al estado de antes: si seguía al sistema, quita el
    atributo — nunca fija un tema que la persona no eligió.
  - Se cancela al primer clic en el toggle (`cancelarDemo`): la elección de
    la persona gana siempre (N3).
*/
const CLAVE_DEMO = "yaruki-theme-demo-visto";
const ESPERA_INICIAL_MS = 1300;
const DURACION_VISIBLE_MS = 1200;

let demo = null;

function yaSeMostro() {
  try {
    return sessionStorage.getItem(CLAVE_DEMO) === "1";
  } catch {
    return true;
  }
}

function marcarMostrado() {
  try {
    sessionStorage.setItem(CLAVE_DEMO, "1");
  } catch {
    /* Ver `yaSeMostro`. */
  }
}

function mostrarPista(pista, tema) {
  if (!pista) return;
  pista.textContent = tema === "dark" ? "Prueba el modo oscuro" : "Prueba el modo claro";
  pista.hidden = false;
  // Un cuadro después, para que la transición de entrada arranque desde oculto.
  requestAnimationFrame(() => requestAnimationFrame(() => pista.classList.add("pista-tema--visible")));
}

function ocultarPista(pista) {
  if (!pista || pista.hidden) return;
  pista.classList.remove("pista-tema--visible");
  window.setTimeout(() => {
    if (!pista.classList.contains("pista-tema--visible")) pista.hidden = true;
  }, 300);
}

export function mostrarDemoDeTemaSiCorresponde(boton) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || yaSeMostro() || !boton) return;
  marcarMostrado();

  const pista = document.getElementById("pista-tema");
  const explicitoAntes = temaExplicitoActual();
  const opuesto = opuestoDe(temaEfectivo());
  const timers = [];
  demo = { explicitoAntes, temaAntes: temaEfectivo(), pista, timers };

  timers.push(
    window.setTimeout(() => {
      if (!demo) return;
      mostrarPista(pista, opuesto);
      transicionarTema(() => fijarTema(opuesto), { origen: boton, modo: "revelar" }).then(() => {
        if (!demo) return;
        timers.push(
          window.setTimeout(() => {
            if (!demo) return;
            ocultarPista(pista);
            transicionarTema(() => fijarTema(explicitoAntes), { origen: boton, modo: "contraer" }).then(() => {
              demo = null;
            });
          }, DURACION_VISIBLE_MS)
        );
      });
    }, ESPERA_INICIAL_MS)
  );
}

/**
 * Corta la demo si está en curso. Devuelve el tema que se veía ANTES de la
 * demo (la base sobre la que el clic decide), o null si no había demo.
 */
export function cancelarDemo() {
  if (!demo) return null;
  const { temaAntes, explicitoAntes, pista, timers } = demo;
  demo = null;
  timers.forEach((t) => window.clearTimeout(t));
  cortarTransicion();
  ocultarPista(pista);
  return { temaAntes, explicitoAntes };
}
