import { ESCENAS } from "./scenes/registro.js";

/**
 * Escenario del teléfono 3D (plan, 4.2 y 5.2) — etapa 2: ESTÁTICO. Monta
 * una sola escena a la vez (por defecto "splash") y fija la cara del
 * teléfono. El cruce con giro 360° ligado al scroll (`SceneManager` real,
 * que cambia de escena sólo cuando el teléfono está de espaldas) es la
 * etapa 4, fuera de esta corrida.
 *
 * **Modo de inspección para desarrollo** (plan, "PUNTO DE CONTROL 1"):
 * `?escena=<id>` fuerza qué escena se monta (una de `ESCENAS`, ver
 * `scenes/registro.js`) y `?cara=frente|canto|espalda` fuerza el ángulo del
 * teléfono. Ninguno de los dos existe fuera de esta URL — no hay UI visible
 * para esto, es sólo para tomar capturas de cada escena/cara por separado.
 * Ver README, sección "Modo de inspección".
 */
const ROTACION_POR_CARA = {
  frente: 0,
  // "≈ 90°" (plan, 4.2): 80° deja una pizca de perspectiva en la captura en
  // vez de un borde perfectamente de filo, donde el navegador a veces
  // recorta el brillo/sombra del canto a un pixel de ancho.
  canto: 80,
  espalda: 180,
};

const ESCENA_POR_DEFECTO = "splash";
const CARA_POR_DEFECTO = "frente";

function leerParametrosDeInspeccion() {
  const params = new URLSearchParams(window.location.search);
  const escena = params.get("escena");
  const cara = params.get("cara");
  return {
    escena: escena && ESCENAS[escena] ? escena : null,
    cara: cara && cara in ROTACION_POR_CARA ? cara : null,
  };
}

/** Aplica el ancho real de cada `[data-progreso]` vía CSSOM (no `style=""` en el HTML). */
function aplicarBarrasDeProgreso(raiz) {
  raiz.querySelectorAll("[data-progreso]").forEach((el) => {
    const valor = Number(el.dataset.progreso);
    const porcentaje = Number.isFinite(valor) ? Math.min(Math.max(valor, 0), 1) * 100 : 0;
    el.style.width = `${porcentaje}%`;
  });
}

function montarEscena(pantalla, id) {
  const escena = ESCENAS[id];
  if (!escena) return;
  pantalla.innerHTML = "";
  escena.mount(pantalla);
  aplicarBarrasDeProgreso(pantalla);
}

export function inicializarEscenario() {
  const telefono = document.getElementById("telefono");
  const pantalla = document.getElementById("pantalla-telefono");
  if (!telefono || !pantalla) return;

  const { escena, cara } = leerParametrosDeInspeccion();

  const idEscena = escena ?? ESCENA_POR_DEFECTO;
  montarEscena(pantalla, idEscena);

  const idCara = cara ?? CARA_POR_DEFECTO;
  telefono.style.setProperty("--rotacion-y", `${ROTACION_POR_CARA[idCara]}deg`);
  telefono.dataset.cara = idCara;
}
