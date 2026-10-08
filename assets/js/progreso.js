/*
  Yaruki — barra de avance del recorrido (respaldo en JS cuando el navegador
  no tiene animaciones ligadas al scroll) y la pista "Desliza para
  descubrir", que se desvanece con el primer scroll.
*/
export function inicializarProgreso() {
  const barra = document.querySelector(".progreso-recorrido");
  const pista = document.querySelector(".pista-scroll");
  const nativa = window.CSS?.supports?.("animation-timeline: scroll()");
  let pendiente = 0;

  function actualizar() {
    pendiente = 0;
    if (barra && !nativa) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
      barra.style.transform = `scaleX(${p.toFixed(4)})`;
    }
  }

  function alScroll() {
    if (pista && window.scrollY > 8 && !pista.classList.contains("pista-scroll--oculta")) {
      pista.classList.add("pista-scroll--oculta");
    }
    if (!pendiente) pendiente = requestAnimationFrame(actualizar);
  }

  window.addEventListener("scroll", alScroll, { passive: true });
  window.addEventListener("resize", alScroll);
  alScroll();
}
