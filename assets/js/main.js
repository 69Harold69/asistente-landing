import {
  inicializarTema,
  sincronizarToggle,
  temaEfectivo,
  opuestoDe,
  fijarTema,
  guardarTema,
  transicionarTema,
} from "./theme.js?v=7e55092f39";
import { mostrarDemoDeTemaSiCorresponde, cancelarDemo } from "./theme-demo.js?v=7e55092f39";
import { inicializarEscenario } from "./stage.js?v=7e55092f39";
import { inicializarTilt } from "./tilt.js?v=7e55092f39";
import { inicializarReveals } from "./revelar.js?v=7e55092f39";
import { inicializarProgreso } from "./progreso.js?v=7e55092f39";
import { inicializarMagneticos } from "./magnetico.js?v=7e55092f39";
import { inicializarNavRecorrido } from "./nav-recorrido.js?v=7e55092f39";

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
  Botón "Únete a la beta": ya es un enlace real en el HTML (`href` al Google
  Group de testers), así que aquí no hay nada que activar. El `href` vive
  SOLO en `index.html` (README, sección "BRAND_NAME y el enlace de la beta").
*/
inicializarReveals(escenario);
inicializarProgreso();
// Los magnéticos sólo toman los CTA activos (`.button--primary`).
inicializarMagneticos();
inicializarNavRecorrido(escenario);
