/*
  Yaruki — navegación con puntos (escritorio). Marca con `aria-current`
  la sección cuyo texto se lee y salta a otra con scroll suave (directo con
  "reducir movimiento"). El salto no puede dejar el teléfono en la escena
  equivocada: el escenario es una función de la posición (stage.js), así
  que al llegar muestra lo que corresponde a esa sección, recorra lo que
  recorra en el camino. Sin JS, los enlaces son anclas comunes.
*/
export function inicializarNavRecorrido(escenario) {
  const nav = document.querySelector(".nav-recorrido");
  if (!nav || !escenario) return;
  const enlaces = [...nav.querySelectorAll("a[href^='#']")];
  const reducido = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  enlaces.forEach((a) => {
    const id = a.getAttribute("href").slice(1);
    const seccion = document.getElementById(id);
    if (!seccion) return;
    if (!seccion.hasAttribute("tabindex")) seccion.setAttribute("tabindex", "-1");
    a.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: escenario.destinoDe(id), behavior: reducido() ? "instant" : "smooth" });
      // El foco acompaña al salto (lectores de pantalla, teclado), sin mover el scroll.
      seccion.focus({ preventScroll: true });
      if (history.replaceState) history.replaceState(null, "", `#${id}`);
    });
  });

  /* «Cómo funciona», las preguntas y lo que siga viven DESPUÉS del recorrido (fuera de `.layout-con-stage`):
     ahí los puntos no aplican (no hay escena que seguir), así que se ocultan en vez de dejar encendido el último
     («Tu día») y encimarse con el contenido. `data-fuera` los oculta con CSS (base.css). */
  const recorrido = document.querySelector(".layout-con-stage");
  const fuera = () => !!recorrido && recorrido.getBoundingClientRect().bottom <= window.innerHeight * 0.5;
  let pendiente = 0;
  let actual = null;
  function marcar() {
    pendiente = 0;
    const sinRecorrido = fuera();
    nav.toggleAttribute("data-fuera", sinRecorrido);
    const id = sinRecorrido ? null : escenario.seccionLeida();
    if (id === actual) return;
    actual = id;
    enlaces.forEach((a) => {
      if (a.getAttribute("href") === `#${id}`) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
  }
  window.addEventListener(
    "scroll",
    () => {
      if (!pendiente) pendiente = requestAnimationFrame(marcar);
    },
    { passive: true }
  );
  marcar();
}
