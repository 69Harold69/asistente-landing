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
  3. Remate al soltar (segunda ronda, decisión de Harold: en el recorrido la página NUNCA se queda entre dos fases).
     El snap de proximidad solo atrapa cerca de un ancla; si un gesto con el dedo termina lejos de todas (entre la
     primera fase y el final de «Tu día»), al terminar el scroll (`scrollend`, o 180 ms sin scroll donde no existe) se
     jala, con una animación de 800–1200 ms, a la fase más próxima EN LA DIRECCIÓN del gesto: la siguiente si bajaba,
     la anterior si subía (al final de su tarjeta, si es más alta que la pantalla). Reglas:
     - solo después de soltar y de que termine la inercia: nunca con el dedo en la pantalla ni mientras se desliza;
     - tocar (o rueda, o tecla) durante el jalón lo cancela, y no se reanuda al soltar si ese toque no arrastró;
     - dentro de la zona de lectura de una tarjeta alta (chat, «Tu día») no jala: se lee libre hasta su última línea;
     - arriba de la primera fase (hero) y abajo del final de «Tu día» (parte final) no hay remate: se sale libre;
     - solo después de un gesto con el dedo que arrastró: la rueda, el teclado, los enlaces y el punto «Inicio» no;
     - el jalón apaga el snap mientras anima (`data-iman-jalando`; si no, Chrome ajustaría cada paso a un ancla) y el
       `scrollend` que provoca no dispara otro (no hay gesto pendiente): no se encadena;
     - un roce de menos de `ROCE` px cuenta como «sin dirección» y vuelve a la fase más cercana.

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
/**
 * Duración del jalón: 800 ms para distancias cortas, hasta 1200 ms para una pantalla o más (tercera ronda: a 400–600 ms
 * el teléfono daba la vuelta demasiado rápido en el teléfono de Harold).
 */
const JALON_MIN = 800;
const JALON_MAX = 1200;
/** px de arrastre por debajo de los cuales el gesto no tiene dirección (un roce). */
const ROCE = 24;
/** Tolerancia (px) para «está en el punto de una fase». */
const EN_PUNTO = 2;
/** Respaldo de `scrollend`: px quieto durante este tiempo = el scroll terminó. */
const QUIETO_MS = 180;

/*
  Seno de entrada y salida: su velocidad máxima (a la mitad) es π/2 ≈ 1.57 veces la media, contra 3 veces de la cúbica
  que había. El giro del teléfono cae a media animación, así que con la cúbica alargar la duración al doble solo lo
  hacía ~1.4 veces más lento; con el seno y el doble de duración el giro de 360° tarda ~2–2.5 veces más (medido).
*/
const suavizar = (p) => (1 - Math.cos(Math.PI * p)) / 2;

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

  /**
   * Empieza un gesto: el ancla sobre la que se está en reposo no puede jalar de regreso al soltar. Con el dedo, es la
   * que está justo en su punto (o dentro de su tarjeta alta). La rueda y las teclas avanzan a saltos cortos y cada salto
   * termina por separado: un salto que termina a 60 px del ancla volvería a ella y la rueda no saldría nunca. Por eso,
   * con rueda o tecla se desarman todas las anclas cuyo rango contiene la posición: atrapa la que se alcanza desde fuera.
   */
  function alEmpezarGesto(ev) {
    if (!activo()) return;
    const y = window.scrollY;
    const margen = ev.type === "touchstart" ? 3 : window.innerHeight * RANGO + HOLGURA;
    for (const a of anclas) if (y >= a.ini - margen && y <= finDe(a) + margen) armar(a, false);
  }

  /** Terminó el scroll: se rearman las anclas de las que ya se está lejos (fuera de su rango de proximidad). */
  function alTerminarScroll() {
    const y = window.scrollY;
    const rango = window.innerHeight * RANGO + HOLGURA;
    for (const a of anclas) if (!a.armada && (y < a.ini - rango || y > finDe(a) + rango)) armar(a, true);
  }

  /* ---- Remate al soltar ---- */
  let dedos = 0;
  let inicioGesto = null; // scroll al empezar el gesto con el dedo que se va a rematar (null: nada pendiente)
  let arrastro = false;
  let jalon = 0;
  let ultimoScroll = 0;

  /** Destino del remate desde `y` con dirección `dir` (1 baja, -1 sube, 0 sin dirección), o null si no toca. */
  function destinoDesde(y, dir) {
    const tramos = anclas.map((a) => ({ ini: a.ini, fin: finDe(a) })).sort((p, q) => p.ini - q.ini);
    if (!tramos.length) return null;
    // Fuera del recorrido (hero arriba, parte final abajo): se sale libre.
    if (y < tramos[0].ini - EN_PUNTO || y > tramos[tramos.length - 1].fin + EN_PUNTO) return null;
    // En el punto de una fase o dentro de la zona de lectura de una tarjeta alta: se queda.
    if (tramos.some((t) => y >= t.ini - EN_PUNTO && y <= t.fin + EN_PUNTO)) return null;
    const siguiente = tramos.find((t) => t.ini > y);
    const anterior = [...tramos].reverse().find((t) => t.fin < y);
    if (dir > 0) return siguiente ? siguiente.ini : null;
    if (dir < 0) return anterior ? anterior.fin : null;
    if (!siguiente) return anterior?.fin ?? null;
    if (!anterior) return siguiente.ini;
    return siguiente.ini - y <= y - anterior.fin ? siguiente.ini : anterior.fin;
  }

  function cancelarJalon() {
    if (!jalon) return;
    cancelAnimationFrame(jalon);
    jalon = 0;
    raiz.removeAttribute("data-iman-jalando");
  }

  function jalar(destino) {
    const desde = window.scrollY;
    const distancia = destino - desde;
    if (Math.abs(distancia) < 1) return;
    const duracion = Math.min(JALON_MAX, JALON_MIN + (Math.abs(distancia) / window.innerHeight) * (JALON_MAX - JALON_MIN));
    raiz.setAttribute("data-iman-jalando", "");
    const t0 = performance.now();
    const paso = (t) => {
      const p = Math.min(1, (t - t0) / duracion);
      window.scrollTo({ top: desde + distancia * suavizar(p), behavior: "instant" });
      if (p < 1) {
        jalon = requestAnimationFrame(paso);
      } else {
        jalon = 0;
        // Ya en el punto: volver a encender el snap no mueve nada.
        raiz.removeAttribute("data-iman-jalando");
      }
    };
    jalon = requestAnimationFrame(paso);
  }

  /** Terminó un gesto con el dedo y su inercia: si quedó entre dos fases, jala a la de su dirección. */
  function rematar() {
    if (!activo() || jalon || dedos > 0 || inicioGesto === null) return;
    const y = window.scrollY;
    const delta = y - inicioGesto;
    inicioGesto = null;
    const destino = destinoDesde(y, Math.abs(delta) < ROCE ? 0 : Math.sign(delta));
    if (destino !== null) jalar(destino);
  }

  function alTocar(ev) {
    dedos = ev.touches.length;
    const cancelo = !!jalon;
    cancelarJalon();
    alEmpezarGesto(ev);
    if (dedos === 1) {
      // El toque que detiene un jalón es una decisión: no se remata al soltar salvo que arrastre (ver alMoverDedo).
      inicioGesto = cancelo ? null : window.scrollY;
      arrastro = false;
    }
  }
  function alMoverDedo() {
    if (!arrastro && inicioGesto === null && dedos === 1) inicioGesto = window.scrollY;
    arrastro = true;
  }
  function alSoltar(ev) {
    dedos = ev.touches.length;
    if (dedos > 0) return;
    if (!arrastro) inicioGesto = null;
    // Si al soltar no hay inercia (el dedo se detuvo antes), puede no llegar un `scrollend`: se revisa en un momento.
    setTimeout(() => {
      if (performance.now() - ultimoScroll >= QUIETO_MS) rematar();
    }, QUIETO_MS + 40);
  }
  function alTeclaORueda(ev) {
    cancelarJalon();
    inicioGesto = null;
    alEmpezarGesto(ev);
  }

  window.addEventListener("touchstart", alTocar, { passive: true, capture: true });
  window.addEventListener("touchmove", alMoverDedo, { passive: true, capture: true });
  window.addEventListener("touchend", alSoltar, { passive: true, capture: true });
  window.addEventListener("touchcancel", alSoltar, { passive: true, capture: true });
  for (const ev of ["wheel", "keydown"]) window.addEventListener(ev, alTeclaORueda, { passive: true, capture: true });

  const alFinDelScroll = () => {
    alTerminarScroll();
    rematar();
  };
  let espera = 0;
  window.addEventListener(
    "scroll",
    () => {
      ultimoScroll = performance.now();
      if ("onscrollend" in window) return;
      // Safari sin `scrollend`: el scroll terminó si pasan 180 ms sin eventos de scroll.
      clearTimeout(espera);
      espera = setTimeout(alFinDelScroll, QUIETO_MS);
    },
    { passive: true }
  );
  if ("onscrollend" in window) window.addEventListener("scrollend", alFinDelScroll, { passive: true });

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
