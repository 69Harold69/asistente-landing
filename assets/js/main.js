import {
  inicializarTema,
  sincronizarToggle,
  temaEfectivo,
  opuestoDe,
  fijarTema,
  guardarTema,
  transicionarTema,
} from "./theme.js";
import { mostrarDemoDeTemaSiCorresponde, cancelarDemo } from "./theme-demo.js";
import { inicializarEscenario } from "./stage.js";
import { inicializarTilt } from "./tilt.js";
import { inicializarReveals } from "./revelar.js";
import { inicializarProgreso } from "./progreso.js";
import { inicializarMagneticos } from "./magnetico.js";
import { inicializarNavRecorrido } from "./nav-recorrido.js";
import { BETA_URL } from "./config.js";

/*
  Yaruki — punto de entrada de `index.html`. Sin framework, sin bundler:
  este archivo se carga con `<script type="module" src="assets/js/main.js">`,
  permitido por la CSP (`script-src 'self'`) porque es un archivo propio, no
  un script inline. Los módulos (`theme.js`, `stage.js`, `scenes/*.js`) se
  resuelven como imports ES nativos, sin paso de build.
*/

inicializarTema();
const escenario = inicializarEscenario();
inicializarTilt();

/*
  Toggle sol/luna: el mismo revelado circular que la demo. El primer clic
  cancela la demo si sigue en curso, y decide sobre el tema que se veía
  ANTES de la demo — quien toca el botón mientras se lee "Prueba el modo
  oscuro" se queda en oscuro.
*/
const botonesTema = document.querySelectorAll("[data-theme-toggle]");
botonesTema.forEach((boton) => {
  boton.addEventListener("click", () => {
    const previa = cancelarDemo();
    const siguiente = opuestoDe(previa ? previa.temaAntes : temaEfectivo());
    guardarTema(siguiente);
    if (temaEfectivo() === siguiente) {
      fijarTema(siguiente);
      return;
    }
    transicionarTema(() => fijarTema(siguiente), { origen: boton, modo: "revelar" });
  });
});
sincronizarToggle(botonesTema);
mostrarDemoDeTemaSiCorresponde(botonesTema[0]);

/*
  Botón "Únete a la beta" (decisión 3.8 del plan): mientras `BETA_URL` esté
  vacía, el botón no navega — ya sale deshabilitado del HTML
  (`role="link"` + `aria-disabled="true"`, sin `href`: tampoco entra en el
  orden de tabulación) con el chip "Próximamente" al lado,
  así que no hace falta ningún listener para bloquearlo. Este bloque sólo
  ACTIVA el botón el día que `BETA_URL` deje de estar vacía, sin tocar
  ningún otro archivo (ver README).
*/
if (BETA_URL) {
  document.querySelectorAll("[data-cta-beta]").forEach((boton) => {
    boton.href = BETA_URL;
    boton.removeAttribute("aria-disabled");
    boton.removeAttribute("role");
    boton.classList.remove("button--disabled");
    boton.classList.add("button--primary");
  });
  document.querySelectorAll("[data-chip-proximamente-beta]").forEach((chip) => chip.remove());
}

inicializarReveals(escenario);
inicializarProgreso();
// Después del bloque de BETA_URL: los magnéticos sólo toman los CTA activos.
inicializarMagneticos();
inicializarNavRecorrido(escenario);
