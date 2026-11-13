/*
  Yaruki — imán de lectura en móvil (#122).

  En el recorrido (las fases con el teléfono), un gesto suave que termina cerca de la fase siguiente se detiene solo y
  completo con la tarjeta de esa fase justo debajo de la franja del teléfono; un gesto fuerte sigue de largo. Es el
  `scroll-snap` del navegador en modo PROXIMIDAD (base.css, bloque «Imán de lectura»): el navegador decide al soltar y
  lo resuelve dentro de la misma inercia, en el compositor. Aquí solo se hace lo que el CSS no puede:

  1. Anclas. Cada fase lleva un ancla invisible (`.iman`) del alto de su tarjeta (del kicker al borde inferior del
     vidrio), con `scroll-margin-top` = franja + degradado + `AIRE_ARRIBA`: el navegador alinea esa caja al borde de
     arriba, o sea, la tarjeta queda pegada bajo la franja. Si la tarjeta es más alta que lo que queda de pantalla
     (chat, «Tu día»), el área del ancla cubre la pantalla y la especificación deja el scroll libre dentro de ella: se
     lee de arriba a abajo sin que el imán la jale.
  2. Atrapa al llegar, nunca al salir. El rango de proximidad de Chrome es 1/3 del alto de la pantalla: quien está
     en una fase y arrastra despacio 250 px para seguir volvería a su fase al soltar. Por eso, cuando un gesto empieza
     (toque, rueda o tecla) estando en reposo sobre un ancla, esa ancla se desarma (`data-desarmado`) y no se vuelve a
     armar hasta que el scroll termina lejos de ella (fuera de su rango). Las demás siguen armadas: la de la fase
     siguiente atrapa al llegar.

  Solo con puntero táctil (`pointer: coarse`) hasta 1023 px, sin «reducir movimiento» (ahí no hay deslizamiento
  animado: sin imán) y fuera del teléfono en horizontal (otra composición, sin franja arriba). Sin JS no hay imán.
*/

const FASES = ["fase-chat", "fase-elementos", "fase-habitos", "fase-avisos", "fase-llamada", "cta"];
/** px de aire entre el degradado de la franja y el borde de arriba de la tarjeta. */
const AIRE_ARRIBA = 4;
/** px de aire bajo la tarjeta cuando se lee hasta el final (ancla más alta que la pantalla). */
const AIRE_ABAJO = 16;
/** Rango de proximidad de Chromium (`kProximityRatio`, 1/3 del snapport) más holgura, para rearmar fuera de él. */
const RANGO = 1 / 3;
const HOLGURA = 24;

function topDoc(el) {
  let y = 0;
  for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
  return y;
}

export function inicializarIman() {
  const raiz = document.documentElement;
  const secciones = document.querySelector(".layout-con-stage > .secciones");
  const stage = document.getElementById("stage");
  if (!secciones || !stage) return;

  const mqTactil = window.matchMedia("(max-width: 1023px) and (pointer: coarse) and (prefers-reduced-motion: no-preference)");
  const mqHorizontal = window.matchMedia("(orientation: landscape) and (max-height: 520px)");

  const contenedor = document.createElement("div");
  contenedor.className = "imanes";
  contenedor.setAttribute("aria-hidden", "true");
  const anclas = FASES.map((id) => document.getElementById(id))
    .filter(Boolean)
    .map((seccion) => {
      const el = document.createElement("div");
      el.className = "iman";
      el.dataset.fase = seccion.id;
      contenedor.append(el);
      return { seccion, el, ini: 0, alto: 0, armada: true };
    });
  secciones.append(contenedor);

  const activo = () => raiz.hasAttribute("data-iman");
  /** Último scroll en el que el ancla deja la tarjeta entera o, si es más alta que la pantalla, su final a la vista. */
  const finDe = (a) => a.ini + Math.max(0, a.alto - window.innerHeight);

  function medir() {
    const encender = mqTactil.matches && !mqHorizontal.matches && stage.offsetHeight > 0;
    raiz.toggleAttribute("data-iman", encender);
    if (!encender) return;
    const degradado = parseFloat(getComputedStyle(stage, "::after").height) || 0;
    const zonaTop = stage.offsetHeight + degradado + AIRE_ARRIBA;
    const base = topDoc(secciones);
    for (const a of anclas) {
      const hijos = a.seccion.children;
      if (!hijos.length) continue;
      const primero = hijos[0];
      const ultimo = hijos[hijos.length - 1];
      // Con vidrio, la tarjeta termina en el margen inferior del último elemento (base.css).
      const margen = raiz.hasAttribute("data-vidrio") ? parseFloat(getComputedStyle(ultimo).marginBottom) || 0 : 0;
      const bt = topDoc(primero);
      const bb = topDoc(ultimo) + ultimo.offsetHeight + margen;
      a.el.style.setProperty("top", `${(bt - base).toFixed(1)}px`);
      a.el.style.setProperty("height", `${(bb - bt).toFixed(1)}px`);
      a.el.style.setProperty("scroll-margin-top", `${zonaTop.toFixed(1)}px`);
      a.el.style.setProperty("scroll-margin-bottom", `${AIRE_ABAJO}px`);
      a.ini = bt - zonaTop;
      a.alto = bb + AIRE_ABAJO - a.ini;
    }
  }

  function armar(a, valor) {
    if (a.armada === valor) return;
    a.armada = valor;
    if (valor) delete a.el.dataset.desarmado;
    else a.el.dataset.desarmado = "";
  }

  /** Empieza un gesto: el ancla sobre la que se está en reposo no puede jalar de regreso al soltar. */
  function alEmpezarGesto() {
    if (!activo()) return;
    const y = window.scrollY;
    for (const a of anclas) if (y >= a.ini - 3 && y <= finDe(a) + 3) armar(a, false);
  }

  /** Terminó el scroll: se rearman las anclas de las que ya se está lejos (fuera de su rango de proximidad). */
  function alTerminarScroll() {
    const y = window.scrollY;
    const rango = window.innerHeight * RANGO + HOLGURA;
    for (const a of anclas) if (!a.armada && (y < a.ini - rango || y > finDe(a) + rango)) armar(a, true);
  }

  for (const ev of ["touchstart", "wheel", "keydown"]) {
    window.addEventListener(ev, alEmpezarGesto, { passive: true, capture: true });
  }
  if ("onscrollend" in window) {
    window.addEventListener("scrollend", alTerminarScroll, { passive: true });
  } else {
    // Safari sin `scrollend`: el scroll terminó si pasan 180 ms sin eventos de scroll.
    let espera = 0;
    window.addEventListener(
      "scroll",
      () => {
        clearTimeout(espera);
        espera = setTimeout(alTerminarScroll, 180);
      },
      { passive: true }
    );
  }

  let pendiente = 0;
  const programar = () => {
    cancelAnimationFrame(pendiente);
    pendiente = requestAnimationFrame(medir);
  };
  window.addEventListener("resize", programar);
  mqTactil.addEventListener?.("change", programar);
  mqHorizontal.addEventListener?.("change", programar);
  // Las tarjetas cambian de alto con las fuentes y el vidrio al arrancar: se vuelve a medir.
  if ("ResizeObserver" in window) new ResizeObserver(programar).observe(secciones);
  medir();
}
