/*
  Yaruki — inclinación sutil del teléfono con el mouse (±4°), sólo en
  escritorio con puntero fino, sin "reducir movimiento" y con el teléfono
  quieto: durante un giro la inclinación vuelve a 0 y no compite con el
  vuelo. Vive en su propio envoltorio (`.phone-tilt`, phone.css), así el
  giro de `.phone` y el vuelo de `.escenario-3d` no se pisan con esto.

  Mirada de la mascota (V2, #27): el mismo puntero alimenta `--mira-x/--mira-y`
  (-1..1) en el mismo envoltorio; la mascota (un punto sin rasgos, igual que en
  la app) se corre un poco hacia el cursor con `translate` en el Splash
  (scenes.css) y en la espalda (phone.css). Va por la propiedad `translate`,
  que se compone con el `transform` de la coreografía (escala de la mascota,
  giro del teléfono) sin pisarlo. Se apaga durante los giros/vuelos y mientras
  la mascota del hero crece con el scroll, y vuelve suave al centro.
*/
const MAX_GRADOS = 4;
// La mascota deja de mirar si crece con el scroll del hero (`e.mascota` > 1).
const MASCOTA_REPOSO = 1.02;

export function inicializarTilt() {
  const envoltorio = document.getElementById("tilt-telefono");
  const telefono = document.getElementById("telefono");
  if (!envoltorio || !telefono || !window.gsap) return;

  const mq = window.matchMedia(
    "(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)"
  );
  const angulo = { x: 0, y: 0 };
  const mira = { x: 0, y: 0 };
  const aplicar = () => {
    envoltorio.style.setProperty("--tilt-x", `${angulo.x.toFixed(2)}deg`);
    envoltorio.style.setProperty("--tilt-y", `${angulo.y.toFixed(2)}deg`);
  };
  const aplicarMira = () => {
    envoltorio.style.setProperty("--mira-x", mira.x.toFixed(3));
    envoltorio.style.setProperty("--mira-y", mira.y.toFixed(3));
  };
  // Los ojos van un poco por delante de la cabeza: más rápido que la inclinación.
  const miraX = gsap.quickTo(mira, "x", { duration: 0.45, ease: "power3.out", onUpdate: aplicarMira });
  const miraY = gsap.quickTo(mira, "y", { duration: 0.45, ease: "power3.out", onUpdate: aplicarMira });
  const irX = gsap.quickTo(angulo, "x", { duration: 0.7, ease: "power3.out", onUpdate: aplicar });
  const irY = gsap.quickTo(angulo, "y", { duration: 0.7, ease: "power3.out", onUpdate: aplicar });

  let mouse = null;
  let enGiro = false;
  let mascotaCreciendo = false;
  let pendiente = 0;

  function actualizar() {
    pendiente = 0;
    const puedeMirar = mq.matches && !enGiro && !mascotaCreciendo && mouse;
    if (!puedeMirar) {
      miraX(0);
      miraY(0);
    }
    if (!mq.matches || enGiro || !mouse) {
      irX(0);
      irY(0);
      return;
    }
    const r = telefono.getBoundingClientRect();
    const dx = (mouse.x - (r.left + r.width / 2)) / (window.innerWidth / 2);
    const dy = (mouse.y - (r.top + r.height / 2)) / (window.innerHeight / 2);
    const lim = (v) => Math.max(-1, Math.min(1, v));
    // El teléfono "mira" hacia el cursor.
    irY(lim(dx) * MAX_GRADOS);
    irX(-lim(dy) * MAX_GRADOS);
    if (puedeMirar) {
      miraX(lim(dx));
      miraY(lim(dy));
    }
  }

  const agendar = () => {
    if (!pendiente) pendiente = requestAnimationFrame(actualizar);
  };

  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      mouse = { x: e.clientX, y: e.clientY };
      agendar();
    },
    { passive: true }
  );
  document.documentElement.addEventListener("pointerleave", () => {
    mouse = null;
    agendar();
  });
  telefono.addEventListener("yaruki:estado", (e) => {
    const creciendo = e.detail.mascota > MASCOTA_REPOSO;
    if (e.detail.enGiro !== enGiro || creciendo !== mascotaCreciendo) {
      enGiro = e.detail.enGiro;
      mascotaCreciendo = creciendo;
      agendar();
    }
  });
  mq.addEventListener?.("change", agendar);
}
