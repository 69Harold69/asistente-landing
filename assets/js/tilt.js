/*
  Yaruki — inclinación del teléfono hacia el cursor (V2, #99): hasta 8° a los lados y 6° arriba/abajo,
  con peso (inercia), sólo en escritorio con puntero fino y sin "reducir movimiento". Cada esquina de la
  ventana llega al ángulo máximo (la distancia se normaliza por el lado del teléfono que tiene el cursor,
  no por la ventana entera: el teléfono vive en una columna y el cursor a su derecha casi no tendría
  recorrido). Si el cursor sale de la ventana o se queda quieto IDLE_MS, vuelve despacio al centro.
  Durante un giro la inclinación vuelve a 0 y no compite con el vuelo; al aterrizar retoma desde ahí.
  Vive en su propio envoltorio (`.phone-tilt`, phone.css), así el giro de `.phone` y el vuelo de
  `.escenario-3d` no se pisan con esto.

  Variante para comparar en la demostración: `?inclinacion=mayor` (11°/8°). Por defecto 8°/6°.

  Un solo rAF, sólo mientras algo se mueve: resortes amortiguados por tiempo (sin GSAP ni layout por
  cuadro; sólo propiedades personalizadas que alimentan `transform`/`translate`).

  Mirada de la mascota (V2, #27/#99): el mismo puntero alimenta `--mira-x/--mira-y` (-1..1) en el mismo
  envoltorio; la mascota (un punto sin rasgos, igual que en la app) se corre hacia el cursor con
  `translate` (hasta ~1/6 de su diámetro) y un brillo pequeño del lado del cursor (`::after`,
  scenes.css / phone.css) hace que se lea como mirada. Va por la propiedad `translate`, que se compone
  con el `transform` de la coreografía y con la respiración sin pisarlos. Se apaga durante los
  giros/vuelos y mientras la mascota del hero crece con el scroll, y vuelve suave al centro.
*/
const GRADOS = { normal: { x: 6, y: 8 }, mayor: { x: 8, y: 11 } };
// La mascota deja de mirar si crece con el scroll del hero (`e.mascota` > 1).
const MASCOTA_REPOSO = 1.02;
// Constantes de tiempo (s) de cada resorte: seguir con peso, volver despacio, apagar rápido en un giro.
const TAU_SEGUIR = 0.28;
const TAU_VOLVER = 1.1;
const TAU_GIRO = 0.18;
const TAU_MIRA = 0.16;
const IDLE_MS = 4000;
const EPS = 0.004;

export function inicializarTilt() {
  const envoltorio = document.getElementById("tilt-telefono");
  const telefono = document.getElementById("telefono");
  if (!envoltorio || !telefono) return;

  const variante = new URLSearchParams(location.search).get("inclinacion") === "mayor" ? "mayor" : "normal";
  const max = GRADOS[variante];
  envoltorio.dataset.inclinacion = variante;

  const mq = window.matchMedia(
    "(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)"
  );
  // Estado actual y objetivo: grados de rotateX/rotateY y mirada (-1..1).
  const act = { rx: 0, ry: 0, mx: 0, my: 0 };
  const obj = { rx: 0, ry: 0, mx: 0, my: 0 };

  let mouse = null;
  let enGiro = false;
  let mascotaCreciendo = false;
  let pendienteObjetivo = false;
  let raf = 0;
  let tPrev = 0;
  let idle = 0;
  let volviendo = true;

  const aplicar = () => {
    const s = envoltorio.style;
    s.setProperty("--tilt-x", `${act.rx.toFixed(2)}deg`);
    s.setProperty("--tilt-y", `${act.ry.toFixed(2)}deg`);
    s.setProperty("--mira-x", act.mx.toFixed(3));
    s.setProperty("--mira-y", act.my.toFixed(3));
  };

  function pasoResorte(t) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0.001, (t - tPrev) / 1000 || 0.016));
    tPrev = t;
    // Resorte exponencial independiente de la tasa de cuadros.
    const tau = enGiro ? TAU_GIRO : volviendo ? TAU_VOLVER : TAU_SEGUIR;
    const k = 1 - Math.exp(-dt / tau);
    const km = 1 - Math.exp(-dt / (volviendo && !enGiro ? TAU_VOLVER * 0.6 : TAU_MIRA));
    let sigue = false;
    for (const c of ["rx", "ry"]) {
      act[c] += (obj[c] - act[c]) * k;
      if (Math.abs(obj[c] - act[c]) < EPS) act[c] = obj[c];
      else sigue = true;
    }
    for (const c of ["mx", "my"]) {
      act[c] += (obj[c] - act[c]) * km;
      if (Math.abs(obj[c] - act[c]) < EPS / 4) act[c] = obj[c];
      else sigue = true;
    }
    aplicar();
    if (sigue) raf = requestAnimationFrame(pasoResorte);
  }

  const arrancar = () => {
    if (raf) return;
    tPrev = performance.now();
    raf = requestAnimationFrame(pasoResorte);
  };

  const lim = (v) => Math.max(-1, Math.min(1, v));

  function calcularObjetivo() {
    pendienteObjetivo = false;
    const puedeMirar = mq.matches && !enGiro && !mascotaCreciendo && mouse;
    if (!mq.matches || enGiro || !mouse) {
      obj.rx = obj.ry = 0;
      if (!puedeMirar) obj.mx = obj.my = 0;
      volviendo = true;
      arrancar();
      return;
    }
    const r = telefono.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // Cada lado se normaliza por la distancia del teléfono a ese borde de la ventana: las cuatro esquinas
    // llegan al máximo aunque el teléfono no esté centrado.
    const dx = mouse.x - cx;
    const dy = mouse.y - cy;
    const nx = lim(dx / Math.max(80, dx < 0 ? cx : window.innerWidth - cx));
    const ny = lim(dy / Math.max(80, dy < 0 ? cy : window.innerHeight - cy));
    // El teléfono "mira" hacia el cursor.
    obj.ry = nx * max.y;
    obj.rx = -ny * max.x;
    if (puedeMirar) {
      obj.mx = nx;
      obj.my = ny;
    } else {
      obj.mx = obj.my = 0;
    }
    volviendo = false;
    arrancar();
  }

  const agendar = () => {
    if (pendienteObjetivo) return;
    pendienteObjetivo = true;
    requestAnimationFrame(calcularObjetivo);
  };

  const soltar = () => {
    mouse = null;
    agendar();
  };

  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      mouse = { x: e.clientX, y: e.clientY };
      clearTimeout(idle);
      idle = setTimeout(soltar, IDLE_MS);
      agendar();
    },
    { passive: true }
  );
  document.documentElement.addEventListener("pointerleave", () => {
    clearTimeout(idle);
    soltar();
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
