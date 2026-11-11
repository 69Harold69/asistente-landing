/*
  Yaruki — la pista "Desliza para descubrir", que se desvanece con el primer
  scroll. (La barra de avance de arriba ya no existe: el avance del recorrido
  vive en el riel de la navegación con puntos, nav-recorrido.js, #60.)
*/
export function inicializarProgreso() {
  const pista = document.querySelector(".pista-scroll");
  if (!pista) return;

  function alScroll() {
    if (window.scrollY > 8 && !pista.classList.contains("pista-scroll--oculta")) {
      pista.classList.add("pista-scroll--oculta");
    }
  }

  window.addEventListener("scroll", alScroll, { passive: true });
  alScroll();
}
