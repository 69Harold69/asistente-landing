/*
  Yaruki — barra de avance del recorrido (#60) y la pista "Desliza para
  descubrir", que se desvanece con el primer scroll.

  La barra mide SOLO el recorrido del teléfono (`.layout-con-stage`: del hero
  al cierre #cta), no la página entera: 0 % al empezar a bajar y 100 % cuando
  termina #cta (su borde inferior llega al pie de la ventana). Pasado el
  recorrido (Cómo funciona, preguntas...) se desvanece con `data-fuera`, con el
  mismo criterio que los puntos de navegación (nav-recorrido.js). Los valores
  van por CSSOM (`--avance`), sin estilos en línea ni CSS scroll-driven: la
  animación nativa no puede medir un tramo de la página.
*/
export function inicializarProgreso() {
  const barra = document.querySelector(".progreso-recorrido");
  const pista = document.querySelector(".pista-scroll");
  const recorrido = document.querySelector(".layout-con-stage");
  let pendiente = 0;
  let largo = 0; // scroll (px) al que el recorrido termina
  let salida = 0; // scroll (px) desde el que ya se considera fuera del recorrido

  function medir() {
    if (!recorrido) return;
    const fin = recorrido.getBoundingClientRect().bottom + window.scrollY;
    largo = Math.max(fin - window.innerHeight, 1);
    salida = fin - window.innerHeight * 0.5;
  }

  function actualizar() {
    pendiente = 0;
    if (!barra || !recorrido) return;
    const y = window.scrollY;
    const p = Math.min(Math.max(y / largo, 0), 1);
    barra.style.setProperty("--avance", p.toFixed(4));
    barra.toggleAttribute("data-fuera", y >= salida);
  }

  function alScroll() {
    if (pista && window.scrollY > 8 && !pista.classList.contains("pista-scroll--oculta")) {
      pista.classList.add("pista-scroll--oculta");
    }
    if (!pendiente) pendiente = requestAnimationFrame(actualizar);
  }

  function alCambiarTamano() {
    medir();
    alScroll();
  }

  medir();
  window.addEventListener("scroll", alScroll, { passive: true });
  window.addEventListener("resize", alCambiarTamano);
  // El alto del recorrido cambia sin resize (fuentes, reveals): re-medir.
  if ("ResizeObserver" in window) new ResizeObserver(alCambiarTamano).observe(document.body);
  alScroll();
}
