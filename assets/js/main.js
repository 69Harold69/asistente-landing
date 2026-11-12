import {
  inicializarTema,
  sincronizarToggle,
  temaEfectivo,
  opuestoDe,
  fijarTema,
  guardarTema,
  transicionarTema,
} from "./theme.js?v=aa71b9d321";
import { mostrarDemoDeTemaSiCorresponde, cancelarDemo } from "./theme-demo.js?v=aa71b9d321";
import { inicializarEscenario } from "./stage.js?v=aa71b9d321";
import { inicializarTilt } from "./tilt.js?v=aa71b9d321";
import { inicializarReveals } from "./revelar.js?v=aa71b9d321";
import { inicializarProgreso } from "./progreso.js?v=aa71b9d321";
import { inicializarMagneticos } from "./magnetico.js?v=aa71b9d321";
import { inicializarNavRecorrido } from "./nav-recorrido.js?v=aa71b9d321";
import { inicializarMalla } from "./malla.js?v=aa71b9d321";

/**
 * GSAP y ScrollTrigger se inyectan desde aquí, en orden (`async = false`), y no van como `<script defer>`
 * (ni `async`) en el <head>. Un script clásico cuyo código se ejecuta junto al primer pintado (el `defer`
 * corre en la misma tarea que el final del análisis del HTML; un `async`, si llega en ese momento) se
 * funde con ella en el modelo de Lighthouse (Lantern), que lo cuenta como bloqueante del primer pintado
 * y le suma sus ~115 KB de transferencia: el LCP móvil saltaba de 1.65 s a 2.3 s según una carrera de
 * milisegundos. Desde un módulo, que solo corre cuando termina su cascada de imports (después del primer
 * pintado), no hay carrera. Cuesta ~0.2 s más (CPU ×4, 4G lenta) hasta que el teléfono monta su primera
 * escena; el texto del hero no espera a nada de esto. Si uno falla, sigue: `inicializarEscenario` cae al
 * cierre estático sin GSAP. La versión `?v=` es la de este módulo (la reescribe `versionar.py` en el HTML).
 */
function cargarVendor(archivos) {
  const version = new URL(import.meta.url).search;
  return new Promise((resolver) => {
    archivos.forEach((archivo, i) => {
      const script = document.createElement("script");
      script.src = new URL(`./vendor/${archivo}`, import.meta.url).pathname + version;
      script.async = false;
      script.addEventListener("load", () => i === archivos.length - 1 && resolver(), { once: true });
      script.addEventListener("error", resolver, { once: true });
      document.head.append(script);
    });
  });
}

/*
  Yaruki — punto de entrada de `index.html`. Sin framework, sin bundler:
  este archivo se carga con `<script type="module" src="assets/js/main.js">`,
  permitido por la CSP (`script-src 'self'`) porque es un archivo propio, no
  un script inline. Los módulos (`theme.js`, `stage.js`, `scenes/*.js`) se
  resuelven como imports ES nativos, sin paso de build.
*/

inicializarTema();

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

await cargarVendor(["gsap.min.js", "ScrollTrigger.min.js"]);
const escenario = inicializarEscenario();
inicializarTilt();
// La malla del hero arranca sola tras `load` + idle: nunca retrasa el titular (LCP).
inicializarMalla(document.getElementById("hero"));

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
