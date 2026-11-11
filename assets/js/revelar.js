/*
  Yaruki — aparición de textos estilo Apple. Cada bloque entra escalonado
  (etiqueta → título → párrafos → chips o CTA) subiendo 24 px de opacidad 0
  a 1, con `power3.out`, y al salir se desvanece un poco hacia arriba.
  Reversible en los dos sentidos.

  - Escritorio: el texto va atado al vuelo del teléfono, no a un umbral de
    scroll propio. Cada sección aparece en el último tramo del giro que
    lleva el teléfono a la columna de enfrente (cuando ya dejó la suya) y
    la anterior se va en el primer tramo, antes de que el teléfono llegue.
    Se lee la misma posición suavizada que mueve al teléfono (stage.js), así
    que ni con saltos bruscos el texto y el teléfono se enciman.
  - Móvil: el teléfono no sale de su franja; cada bloque entra cuando su
    primera pieza llega al 84% del viewport (80 ms entre piezas).
  - El cierre no tiene salida: ahí termina el recorrido.

  Sin JS o con "reducir movimiento", el texto está visible desde el
  principio: el estado oculto lo pone este módulo, nunca el CSS.
  Foco visible (WCAG 2.4.7): una sección que tiene el foco del teclado
  (`:focus-visible` dentro) se muestra completa al instante, aunque el
  teléfono no haya terminado su giro; si no, con Tab el foco caía en un botón
  todavía en opacidad 0 (prueba `foco-visible.mjs`). Solo el de teclado: el
  foco que deja un clic de mouse (Ctrl+clic, o al volver con Atrás) no cuenta,
  si no el bloque se quedaba visible y el teléfono le pasaba por encima.
  En escritorio el foco manda solo mientras la persona no se va: en cuanto
  hace scroll por su cuenta (rueda, flechas, Espacio) vuelve a mandar el giro
  del teléfono, si no el bloque con foco se quedaba visible y el teléfono le
  pasaba por encima (pasada 3).
  El hero tiene su propia entrada al cargar, en CSS (base.css).
*/

// Fracciones del giro (0 → 1) en las que entra la sección nueva y se va la anterior.
const ENTRADA_DESDE = 0.6;
const SALIDA_HASTA = 0.35;

const limitar01 = (v) => Math.min(Math.max(v, 0), 1);
// Scroll propio (px) a partir del cual el bloque con foco deja de forzarse visible.
const SOLTAR_FOCO_PX = 32;

function revelarAlEntrar(seccion) {
  const piezas = [...seccion.children];
  if (!piezas.length) return;
  gsap.set(piezas, { opacity: 0, y: 24 });
  const entrada = gsap.to(piezas, {
    opacity: 1,
    y: 0,
    duration: 0.8,
    ease: "power3.out",
    stagger: 0.08,
    paused: true,
  });
  // Foco visible: si el teclado llega antes que el umbral de scroll, la sección se muestra entera ya.
  seccion.addEventListener("focusin", (ev) => {
    if (ev.target.matches(":focus-visible")) entrada.progress(1);
  });
  ScrollTrigger.create({
    trigger: piezas[0],
    start: "top 84%",
    onEnter: () => entrada.play(),
    onLeaveBack: () => entrada.reverse(),
  });
}

export function inicializarReveals(escenario) {
  if (!window.gsap || !window.ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);

  const hero = document.getElementById("hero");
  const secciones = [...document.querySelectorAll(".secciones > .seccion")];
  const cierre = secciones.find((s) => s.id === "cta");
  const fases = secciones.filter((s) => s !== cierre);
  const mm = gsap.matchMedia();

  mm.add("(max-width: 1023.98px) and (prefers-reduced-motion: no-preference)", () => {
    secciones.forEach(revelarAlEntrar);
  });

  mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
    // Sin coreografía (modo de inspección), el texto queda visible tal cual.
    const telefono = document.getElementById("telefono");
    if (!escenario || !telefono) return;

    const entradas = new Map();
    for (const seccion of secciones) {
      const piezas = [...seccion.children];
      if (!piezas.length) continue;
      entradas.set(
        seccion.id,
        gsap.fromTo(
          piezas,
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 1, ease: "power3.out", stagger: 0.35, paused: true }
        )
      );
    }
    const salidas = new Map(
      [hero, ...fases].filter(Boolean).map((seccion) => [
        seccion.id,
        gsap.fromTo(seccion, { opacity: 1, y: 0 }, { opacity: 0, y: -32, duration: 1, ease: "power1.in", paused: true }),
      ])
    );

    // Bloque con el foco de teclado (`:focus-visible`, no el que deja un clic de mouse) y el scroll que tenía al
    // recibirlo. `y` se toma un cuadro después: con `focus()` el navegador desplaza hasta el enlace después del evento.
    let forzado = null;
    const bloqueDe = (el) => (el instanceof Element ? el.closest("#hero, .secciones > .seccion") : null);
    const conFoco = (id) => forzado?.id === id;

    function sincronizar(y) {
      const geo = escenario.geometria;
      if (!geo?.escritorio) return;
      let previa = "hero";
      for (const s of geo.segmentos) {
        if (s.tipo !== "giro") continue;
        const p = limitar01((y - s.ini) / (s.fin - s.ini));
        entradas.get(s.seccion)?.progress(conFoco(s.seccion) ? 1 : limitar01((p - ENTRADA_DESDE) / (1 - ENTRADA_DESDE)));
        salidas.get(previa)?.progress(conFoco(previa) ? 0 : limitar01(p / SALIDA_HASTA));
        previa = s.seccion;
      }
    }

    const alEstado = (ev) => {
      if (forzado) {
        if (forzado.y === null) forzado.y = window.scrollY;
        else if (Math.abs(window.scrollY - forzado.y) > SOLTAR_FOCO_PX) forzado = null;
      }
      sincronizar(ev.detail.y);
    };
    // Solo si el foco entra o sale de un bloque del recorrido: el clic en el toggle de tema (en el header) no
    // debe pagar un `sincronizar` completo dentro de su interacción (~25 ms más con CPU ×4, rendimiento.mjs).
    const alFoco = (ev) => {
      if (!bloqueDe(ev.target) && !bloqueDe(ev.relatedTarget)) return;
      const activo = document.activeElement;
      const bloque = bloqueDe(activo);
      if (!bloque || !activo.matches(":focus-visible")) forzado = null;
      else if (forzado?.id !== bloque.id || ev.type === "focusin") {
        const nuevo = { id: bloque.id, y: null };
        forzado = nuevo;
        requestAnimationFrame(() => {
          if (forzado === nuevo && nuevo.y === null) nuevo.y = window.scrollY;
        });
      }
      sincronizar(escenario.y);
    };
    telefono.addEventListener("yaruki:estado", alEstado);
    document.addEventListener("focusin", alFoco);
    document.addEventListener("focusout", alFoco);
    sincronizar(escenario.y);
    return () => {
      telefono.removeEventListener("yaruki:estado", alEstado);
      document.removeEventListener("focusin", alFoco);
      document.removeEventListener("focusout", alFoco);
    };
  });
}
