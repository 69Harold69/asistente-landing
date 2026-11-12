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
  /*
    Riel entre los puntos (#60): el relleno llega a cada punto justo cuando su sección pasa a leerse
    (la misma línea que usa `seccionLeida`: la mitad de la ventana), con tramos iguales porque los
    puntos están a la misma distancia. Antes del primer punto vale 0 y en el último, 1.
  */
  const lista = nav.querySelector("ol");
  function avance(y) {
    const anclas = enlaces.map((a) => escenario.destinoDe(a.getAttribute("href").slice(1)) - window.innerHeight * 0.5);
    const n = anclas.length - 1;
    if (n < 1 || y <= anclas[0]) return 0;
    if (y >= anclas[n]) return 1;
    let i = 0;
    while (y >= anclas[i + 1]) i++;
    return (i + (y - anclas[i]) / Math.max(anclas[i + 1] - anclas[i], 1)) / n;
  }

  function marcar() {
    pendiente = 0;
    const sinRecorrido = fuera();
    nav.toggleAttribute("data-fuera", sinRecorrido);
    if (lista) lista.style.setProperty("--avance", avance(window.scrollY).toFixed(4));
    const id = sinRecorrido ? null : escenario.seccionLeida();
    if (id === actual) return;
    actual = id;
    const en = enlaces.findIndex((a) => a.getAttribute("href") === `#${id}`);
    enlaces.forEach((a, i) => {
      if (i === en) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
      // Los puntos ya recorridos (antes del actual); al salir del recorrido, todos.
      a.toggleAttribute("data-pasado", id === null ? sinRecorrido : i < en);
    });
  }
  const programar = () => {
    if (!pendiente) pendiente = requestAnimationFrame(marcar);
  };
  window.addEventListener("scroll", programar, { passive: true });
  // El alto del recorrido cambia con el tamaño de la ventana: las posiciones de los puntos también.
  window.addEventListener("resize", programar);
  marcar();
}
