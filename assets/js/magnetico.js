/*
  Yaruki — CTAs "magnéticos" en escritorio: con el cursor encima, el botón
  se acerca un poco a él (máximo 6 px) y vuelve al salir. Sólo los CTA
  activos (`.button--primary`: un botón deshabilitado no invita a tocarlo),
  sólo con puntero fino y sin "reducir movimiento".
*/
const MAX_PX = 6;

export function inicializarMagneticos() {
  if (!window.gsap) return;
  const mq = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
  document.querySelectorAll(".layout-con-stage .button--primary").forEach((boton) => {
    const irX = gsap.quickTo(boton, "x", { duration: 0.4, ease: "power3.out" });
    const irY = gsap.quickTo(boton, "y", { duration: 0.4, ease: "power3.out" });
    boton.addEventListener("pointermove", (e) => {
      if (!mq.matches || e.pointerType !== "mouse") return;
      const r = boton.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      irX(Math.max(-1, Math.min(1, dx)) * MAX_PX);
      irY(Math.max(-1, Math.min(1, dy)) * MAX_PX);
    });
    boton.addEventListener("pointerleave", () => {
      irX(0);
      irY(0);
    });
  });
}
