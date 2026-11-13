/*
  Yaruki — el teléfono «te voltea a ver» (V2, #99, correcciones de la revisión de Harold).

  Inclinación hacia el cursor con peso (inercia), sólo en escritorio con puntero fino y sin "reducir
  movimiento". Tres variantes para que Harold compare (`?inclinacion=`):
    15 → 15° a los lados y 8° arriba/abajo · 20 → 20° / 10° (por defecto) · 25 → 25° / 12°.

  Por qué antes casi no se notaba a los lados (diagnóstico, README «Inclinación y mirada»):
    1. Perspectiva débil: 1600 px en `.escenario-3d`. El trapecio que produce rotateY es proporcional a
       ancho·sen(θ)/perspectiva, y el teléfono es angosto: a 8° el borde cercano medía sólo 16 px más que
       el lejano. El rotateX actúa sobre el lado largo, así que 6° arriba/abajo se leían MÁS que 8° a los lados.
    2. Recorrido: el lado izquierdo se normalizaba por toda la distancia del teléfono al borde de la
       ventana (~1000 px en el hero): con el cursor sobre el titular la inclinación era de 2–3°.
  Arreglo:
    - Perspectiva efectiva de PERSPECTIVA px para la inclinación, SIN cambiar la del giro de 360°: la
      inclinación suma `perspective()` a su propio transform (las perspectivas se suman en 1/d, así que
      1/1600 + 1/p = 1/PERSPECTIVA) y esa fuerza sigue un resorte que vale 0 durante los giros: el vuelo se ve
      igual que siempre y al aterrizar no hay salto.
    - El recorrido lateral se mide hasta ALCANCE_X de la ventana (no hasta el borde): sobre el texto ya mira.
    - Un desplazamiento lateral leve (DESPLAZAMIENTO px) hacia el cursor acompaña el giro.
  Si el cursor sale de la ventana o se queda quieto IDLE_MS, vuelve despacio al centro. Durante un giro la
  inclinación vuelve a 0 (rápido) y no compite con el vuelo; al aterrizar retoma desde ahí.
  Vive en su propio envoltorio (`.phone-tilt`, phone.css): el giro de `.phone` y el vuelo de `.escenario-3d`
  no se pisan con esto.

  (Su rAF no se llama `cuadro`: malla.mjs cuenta solo los rAF con ese nombre.)
  Un solo rAF, sólo mientras algo se mueve: resortes amortiguados por tiempo (sin GSAP ni layout por cuadro;
  sólo propiedades personalizadas que alimentan `transform`/`translate`/`box-shadow` del brillo).

  Mirada de la mascota (#27/#99): la mascota es un círculo liso, sin rasgos (igual que en la app). «Mirar»
  es que el círculo COMPLETO se corre hacia el cursor (hasta 1/6 de su diámetro, `--mira-x/--mira-y`,
  -1..1) y un brillo suave del lado del cursor (`--mira-r`, 0..1, fuera del círculo; scenes.css /
  phone.css). Nada de pupila. Va por la propiedad `translate`, que se compone con la respiración y con
  la coreografía sin pisarlas. Se apaga durante los giros/vuelos y mientras la mascota del hero crece con
  el scroll, y vuelve suave a su centro exacto.
*/
const VARIANTES = { 15: { x: 8, y: 15 }, 20: { x: 10, y: 20 }, 25: { x: 12, y: 25 } };
const VARIANTE_DEFECTO = "20";
// Perspectiva efectiva de la inclinación y la del contenedor (phone.css, `.escenario-3d`), en px.
const PERSPECTIVA = 900;
const PERSPECTIVA_GIRO = 1600;
const INV_PERSPECTIVA = 1 / PERSPECTIVA - 1 / PERSPECTIVA_GIRO;
// Fracción del ancho de la ventana que recorre el cursor para llegar al máximo lateral.
const ALCANCE_X = 0.34;
// Desplazamiento lateral leve hacia el cursor (px) en el máximo.
const DESPLAZAMIENTO = 10;
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

  const params = new URLSearchParams(location.search);
  const pedida = params.get("inclinacion");
  const variante = Object.hasOwn(VARIANTES, pedida) ? pedida : VARIANTE_DEFECTO;
  const max = VARIANTES[variante];
  envoltorio.dataset.inclinacion = variante;
  // Forma del brillo, solo para comparar en dev: `?brillo=orilla` (por defecto, halo).
  if (params.get("brillo") === "orilla") envoltorio.dataset.brillo = "orilla";

  const mq = window.matchMedia(
    "(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)"
  );
  // Estado actual y objetivo: grados de rotateX/rotateY, fuerza de la perspectiva (0..1) y mirada (-1..1).
  const act = { rx: 0, ry: 0, pf: 0, mx: 0, my: 0 };
  const obj = { rx: 0, ry: 0, pf: 0, mx: 0, my: 0 };

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
    // 1/d de la perspectiva extra; con fuerza 0 queda «sin perspectiva» (d enorme, sin efecto visible).
    const inv = act.pf * INV_PERSPECTIVA;
    s.setProperty("--tilt-p", `${inv > 1e-7 ? Math.round(1 / inv) : 1e7}px`);
    s.setProperty("--tilt-dx", `${((act.ry / max.y) * DESPLAZAMIENTO).toFixed(2)}px`);
    s.setProperty("--mira-x", act.mx.toFixed(3));
    s.setProperty("--mira-y", act.my.toFixed(3));
    s.setProperty("--mira-r", Math.min(1, Math.hypot(act.mx, act.my)).toFixed(3));
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
    for (const c of ["rx", "ry", "pf"]) {
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
    if (!mq.matches || enGiro || !mouse) {
      obj.rx = obj.ry = obj.pf = obj.mx = obj.my = 0;
      volviendo = true;
      arrancar();
      return;
    }
    const r = telefono.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // Lateral: llega al máximo a ALCANCE_X de la ventana (o antes, si el borde está más cerca). Vertical:
    // cada lado se normaliza por la distancia del teléfono a ese borde (las cuatro esquinas llegan al máximo).
    const dx = mouse.x - cx;
    const dy = mouse.y - cy;
    const alcanceX = Math.min(window.innerWidth * ALCANCE_X, dx < 0 ? cx : window.innerWidth - cx);
    const nx = lim(dx / Math.max(80, alcanceX));
    const ny = lim(dy / Math.max(80, dy < 0 ? cy : window.innerHeight - cy));
    // El teléfono "mira" hacia el cursor.
    obj.ry = nx * max.y;
    obj.rx = -ny * max.x;
    obj.pf = 1;
    if (!mascotaCreciendo) {
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
