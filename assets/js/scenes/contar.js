/*
  Contadores de las escenas: cada `[data-contar]` sube de 0 a su número
  cuando la escena entra. El número final ya está escrito en el HTML (lo
  que se ve sin animar y con "reducir movimiento"); acá sólo se cuenta.
*/
const reducido = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function contar(raiz, { duracion = 0.9, retraso = 0.15 } = {}) {
  if (!raiz || !window.gsap) return [];
  const els = [...raiz.querySelectorAll("[data-contar]")];
  if (reducido()) {
    els.forEach((el) => (el.textContent = el.dataset.contar));
    return [];
  }
  return els.map((el) => {
    const meta = Number(el.dataset.contar) || 0;
    const proxy = { v: 0 };
    el.textContent = "0";
    return gsap.to(proxy, {
      v: meta,
      duration: duracion,
      delay: retraso,
      ease: "power2.out",
      onUpdate: () => {
        el.textContent = String(Math.round(proxy.v));
      },
    });
  });
}

export function detener(tweens, raiz) {
  tweens.forEach((t) => t.kill());
  raiz?.querySelectorAll("[data-contar]").forEach((el) => (el.textContent = el.dataset.contar));
}
