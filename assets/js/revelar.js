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
  El hero tiene su propia entrada al cargar, en CSS (base.css).
*/

// Fracciones del giro (0 → 1) en las que entra la sección nueva y se va la anterior.
const ENTRADA_DESDE = 0.6;
const SALIDA_HASTA = 0.35;

const limitar01 = (v) => Math.min(Math.max(v, 0), 1);

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

    function sincronizar(y) {
      const geo = escenario.geometria;
      if (!geo?.escritorio) return;
      let previa = "hero";
      for (const s of geo.segmentos) {
        if (s.tipo !== "giro") continue;
        const p = limitar01((y - s.ini) / (s.fin - s.ini));
        entradas.get(s.seccion)?.progress(limitar01((p - ENTRADA_DESDE) / (1 - ENTRADA_DESDE)));
        salidas.get(previa)?.progress(limitar01(p / SALIDA_HASTA));
        previa = s.seccion;
      }
    }

    const alEstado = (ev) => sincronizar(ev.detail.y);
    telefono.addEventListener("yaruki:estado", alEstado);
    sincronizar(escenario.y);
    return () => telefono.removeEventListener("yaruki:estado", alEstado);
  });
}
