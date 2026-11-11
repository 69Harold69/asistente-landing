import {
  inicializarTema,
  sincronizarToggle,
  temaEfectivo,
  opuestoDe,
  fijarTema,
  guardarTema,
  transicionarTema,
} from "./theme.js?v=7e55092f39";

/*
  Yaruki — páginas-guía. Lo único que hace JS aquí es el toggle de tema (mejora progresiva: sin JS la
  página sigue el tema del sistema y todo el contenido está en el HTML). Mismo comportamiento que la
  portada: recuerda la elección en localStorage y la comparte con el resto del sitio.
*/
inicializarTema();

const botonesTema = document.querySelectorAll("[data-theme-toggle]");
botonesTema.forEach((boton) => {
  boton.addEventListener("click", () => {
    const siguiente = opuestoDe(temaEfectivo());
    guardarTema(siguiente);
    transicionarTema(() => fijarTema(siguiente), { origen: boton, modo: "revelar" });
  });
});
sincronizarToggle(botonesTema);
