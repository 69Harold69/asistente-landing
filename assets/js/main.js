import { inicializarTema, alternarTema } from "./theme.js";
import { inicializarEscenario } from "./stage.js";
import { BETA_URL } from "./config.js";

/*
  Yaruki — punto de entrada de `index.html`. Sin framework, sin bundler:
  este archivo se carga con `<script type="module" src="assets/js/main.js">`,
  permitido por la CSP (`script-src 'self'`) porque es un archivo propio, no
  un script inline. Los módulos (`theme.js`, `stage.js`, `scenes/*.js`) se
  resuelven como imports ES nativos, sin paso de build.
*/

inicializarTema();
inicializarEscenario();

document.querySelectorAll("[data-theme-toggle]").forEach((boton) => {
  boton.addEventListener("click", () => alternarTema());
});

/*
  Botón "Únete a la beta" (decisión 3.8 del plan): mientras `BETA_URL` esté
  vacía, el botón no navega — ya sale deshabilitado del HTML
  (`aria-disabled="true"`, sin `href`) con el chip "Próximamente" al lado,
  así que no hace falta ningún listener para bloquearlo. Este bloque sólo
  ACTIVA el botón el día que `BETA_URL` deje de estar vacía, sin tocar
  ningún otro archivo (ver README).
*/
if (BETA_URL) {
  document.querySelectorAll("[data-cta-beta]").forEach((boton) => {
    boton.href = BETA_URL;
    boton.removeAttribute("aria-disabled");
    boton.classList.remove("button--disabled");
    boton.classList.add("button--primary");
  });
  document.querySelectorAll("[data-chip-proximamente-beta]").forEach((chip) => chip.remove());
}
