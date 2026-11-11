/*
  Yaruki — malla de fondo del hero (V2, issue #26).

  Un <canvas> 2D decorativo detrás del texto del hero: una cuadrícula de puntos
  unidos por líneas finas. Cerca del cursor los puntos se apartan y la malla pasa
  del color del borde de tarjeta al acento. Referencia y valores: Notion, «Ideas
  para V2 de la landing» (cuadrícula de 128 px, radio de 300 px, empuje de
  38 px × (1 − d/r)², líneas de 1.1 px, puntos de 1.35 px que crecen 3 px).

  Reglas que cumple:
  - Los colores salen de los tokens (`--color-border-card` en reposo,
    `--color-accent` activo) y sus opacidades de `--malla-*` (tokens.css), así que
    claro, oscuro, el toggle con revelado circular y la demo de tema la repintan
    bien: un MutationObserver sobre `data-theme` redibuja en el mismo microtask
    del cambio, antes de que View Transitions tome la foto del tema nuevo.
  - Cero trabajo en reposo: no hay bucle continuo. Un `requestAnimationFrame`
    (la función `cuadro`) corre sólo mientras la malla converge hacia el cursor y
    se detiene al asentarse. Tampoco corre con el hero fuera de pantalla
    (IntersectionObserver) ni con la pestaña oculta (`visibilitychange`).
  - Con `prefers-reduced-motion` o sin `hover` fino (táctil) se dibuja una vez,
    estática, sin reaccionar. En táctil el dedo hace scroll y una animación sólo
    gastaría batería; el cambio de la preferencia en vivo se atiende.
  - Arranca después del primer pintado (`load` + `requestIdleCallback`): el LCP
    es el titular y la malla nunca lo retrasa. Sin JS el hero queda igual que
    antes (el canvas lo crea este módulo).
  - CSP: sin estilos inline; el tamaño y la posición van por CSSOM
    (`style.setProperty`) y el resto por la clase `.malla-hero` (base.css).
*/

const SEPARACION = 128; // px entre puntos de la cuadrícula
const RADIO = 300; // radio de influencia del cursor
const EMPUJE = 38; // desplazamiento máximo de un punto
const GROSOR_LINEA = 1.1;
const RADIO_PUNTO = 1.35;
const CRECE_PUNTO = 3;
const DPR_MAX = 2;
const TAU_CURSOR = 90; // ms: inercia con la que la malla sigue al cursor
const TAU_FUERZA = 170; // ms: cuánto tarda en encenderse / apagarse

const FINO = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

function rgbDe(valor, respaldo) {
  const v = (valor || "").trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  m = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : respaldo;
}

export function inicializarMalla(hero) {
  if (!hero || typeof HTMLCanvasElement === "undefined") return;
  const arrancar = () => (window.requestIdleCallback ? window.requestIdleCallback(() => montar(hero), { timeout: 1500 }) : setTimeout(() => montar(hero), 200));
  if (document.readyState === "complete") arrancar();
  else window.addEventListener("load", arrancar, { once: true });
}

function montar(hero) {
  const canvas = document.createElement("canvas");
  canvas.className = "malla-hero";
  canvas.setAttribute("aria-hidden", "true");
  hero.insertBefore(canvas, hero.firstChild);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const mq = window.matchMedia(FINO);
  const raiz = document.documentElement;
  let ancho = 0;
  let alto = 0;
  let dpr = 1;
  let c = null; // colores y opacidades leídos de los tokens
  let visible = false;
  let raton = null; // última posición del cursor (viewport)
  let pendiente = 0;
  let ultimoT = 0;
  // Estado suavizado: posición del cursor en coordenadas del canvas y fuerza (0..1).
  const e = { x: 0, y: 0, fuerza: 0 };

  function leerTokens() {
    const cs = getComputedStyle(raiz);
    const num = (n, d) => {
      const v = parseFloat(cs.getPropertyValue(n));
      return Number.isFinite(v) ? v : d;
    };
    c = {
      reposo: rgbDe(cs.getPropertyValue("--color-border-card"), [221, 212, 199]),
      activo: rgbDe(cs.getPropertyValue("--color-accent"), [108, 92, 224]),
      lineaReposo: num("--malla-linea-reposo", 0.6),
      lineaActiva: num("--malla-linea-activa", 0.2),
      puntoReposo: num("--malla-punto-reposo", 0.8),
      puntoActivo: num("--malla-punto-activo", 0.4),
    };
  }

  const mezcla = (t) => c.reposo.map((v, i) => Math.round(v + (c.activo[i] - v) * t));
  const lerp = (a, b, t) => a + (b - a) * t;

  function medir() {
    const r = hero.getBoundingClientRect();
    const nuevoAncho = raiz.clientWidth;
    const nuevoAlto = Math.round(r.height);
    const nuevoDpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
    // El canvas ocupa todo el ancho de la ventana (el hero sólo mide una columna).
    canvas.style.setProperty("--malla-izq", `${(-r.left).toFixed(1)}px`);
    if (nuevoAncho === ancho && nuevoAlto === alto && nuevoDpr === dpr) return;
    ancho = nuevoAncho;
    alto = nuevoAlto;
    dpr = nuevoDpr;
    canvas.style.setProperty("--malla-ancho", `${ancho}px`);
    canvas.style.setProperty("--malla-alto", `${alto}px`);
    canvas.width = Math.max(1, Math.round(ancho * dpr));
    canvas.height = Math.max(1, Math.round(alto * dpr));
    dibujar();
  }

  /* Dibuja la malla con el cursor en (e.x, e.y) y la fuerza actual. Con fuerza 0 es la malla en reposo. */
  function dibujar() {
    if (!c) leerTokens();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    const cols = Math.ceil(ancho / SEPARACION) + 2;
    const filas = Math.ceil(alto / SEPARACION) + 2;
    const n = cols * filas;
    const px = new Float32Array(n);
    const py = new Float32Array(n);
    const w = new Float32Array(n);
    const activo = e.fuerza > 0.002;
    // Centra la cuadrícula para que no quede un borde más ancho de un lado.
    const ox = (ancho - (cols - 3) * SEPARACION) / 2;
    const oy = 0;
    for (let j = 0; j < filas; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        let x = ox + (i - 1) * SEPARACION;
        let y = oy + (j - 1) * SEPARACION;
        if (activo) {
          const dx = x - e.x;
          const dy = y - e.y;
          const d = Math.hypot(dx, dy);
          if (d < RADIO) {
            const t = (1 - d / RADIO) * e.fuerza;
            const push = (d > 0.001 ? EMPUJE / d : 0) * t * t;
            x += dx * push;
            y += dy * push;
            w[k] = t;
          }
        }
        px[k] = x;
        py[k] = y;
      }
    }

    // Líneas: todas las de reposo en un solo trazo; las encendidas una por una.
    ctx.lineWidth = GROSOR_LINEA;
    ctx.lineCap = "round";
    const [rr, rg, rb] = c.reposo;
    ctx.strokeStyle = `rgba(${rr},${rg},${rb},${c.lineaReposo})`;
    ctx.beginPath();
    const encendidas = [];
    const unir = (a, b) => {
      const t = (w[a] + w[b]) / 2;
      if (t > 0.003) encendidas.push(a, b, t);
      else {
        ctx.moveTo(px[a], py[a]);
        ctx.lineTo(px[b], py[b]);
      }
    };
    for (let j = 0; j < filas; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        if (i + 1 < cols) unir(k, k + 1);
        if (j + 1 < filas) unir(k, k + cols);
      }
    }
    ctx.stroke();
    for (let q = 0; q < encendidas.length; q += 3) {
      const a = encendidas[q];
      const b = encendidas[q + 1];
      const t = encendidas[q + 2];
      const [r, g, bl] = mezcla(t);
      ctx.strokeStyle = `rgba(${r},${g},${bl},${lerp(c.lineaReposo, c.lineaActiva, t).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(px[a], py[a]);
      ctx.lineTo(px[b], py[b]);
      ctx.stroke();
    }

    // Puntos.
    ctx.fillStyle = `rgba(${rr},${rg},${rb},${c.puntoReposo})`;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      if (w[k] > 0.003) continue;
      ctx.moveTo(px[k] + RADIO_PUNTO, py[k]);
      ctx.arc(px[k], py[k], RADIO_PUNTO, 0, Math.PI * 2);
    }
    ctx.fill();
    for (let k = 0; k < n; k++) {
      const t = w[k];
      if (t <= 0.003) continue;
      const [r, g, b] = mezcla(t);
      ctx.fillStyle = `rgba(${r},${g},${b},${lerp(c.puntoReposo, c.puntoActivo, t).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(px[k], py[k], RADIO_PUNTO + CRECE_PUNTO * t, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const puedeAnimar = () => mq.matches && visible && !document.hidden && ancho > 0;

  function agendar() {
    if (pendiente || !puedeAnimar()) return;
    pendiente = requestAnimationFrame(cuadro);
  }

  /* Un cuadro de la animación. Se vuelve a agendar sólo mientras algo sigue cambiando. */
  function cuadro(t) {
    pendiente = 0;
    if (!puedeAnimar()) return;
    const dt = Math.min(ultimoT ? t - ultimoT : 16, 50);
    ultimoT = t;
    let objetivo = 0;
    let tx = e.x;
    let ty = e.y;
    if (raton) {
      const r = canvas.getBoundingClientRect();
      tx = raton.x - r.left;
      ty = raton.y - r.top;
      if (tx > -RADIO && tx < ancho + RADIO && ty > -RADIO && ty < alto + RADIO) objetivo = 1;
    }
    if (e.fuerza < 0.01 && objetivo) {
      e.x = tx; // el cursor acaba de entrar: sin barrido desde una posición vieja
      e.y = ty;
    }
    const aCursor = 1 - Math.exp(-dt / TAU_CURSOR);
    const aFuerza = 1 - Math.exp(-dt / TAU_FUERZA);
    e.x += (tx - e.x) * aCursor;
    e.y += (ty - e.y) * aCursor;
    e.fuerza += (objetivo - e.fuerza) * aFuerza;
    if (Math.abs(objetivo - e.fuerza) < 0.003) e.fuerza = objetivo;
    if (objetivo || e.fuerza) dibujar();
    const sigue = Math.abs(objetivo - e.fuerza) > 0.0005 || (objetivo && (Math.abs(tx - e.x) > 0.3 || Math.abs(ty - e.y) > 0.3));
    if (sigue) agendar();
    else ultimoT = 0;
  }

  function alCursor(ev) {
    if (ev.pointerType && ev.pointerType !== "mouse") return;
    raton = { x: ev.clientX, y: ev.clientY };
    agendar();
  }

  function aplicarModo() {
    if (mq.matches) {
      agendar();
    } else {
      // Estática (reduced-motion o táctil): se detiene lo pendiente y se deja la malla en reposo.
      if (pendiente) cancelAnimationFrame(pendiente);
      pendiente = 0;
      ultimoT = 0;
      e.fuerza = 0;
      dibujar();
    }
  }

  // Tema: se redibuja en el mismo microtask del cambio de `data-theme` / del esquema del sistema.
  const repintar = () => {
    leerTokens();
    if (ancho) dibujar();
  };
  new MutationObserver(repintar).observe(raiz, { attributes: true, attributeFilter: ["data-theme"] });
  const oscuro = window.matchMedia("(prefers-color-scheme: dark)");
  oscuro.addEventListener?.("change", repintar);

  new ResizeObserver(medir).observe(hero);
  window.addEventListener("resize", medir, { passive: true });
  window.addEventListener("pointermove", alCursor, { passive: true });
  window.addEventListener("scroll", () => raton && agendar(), { passive: true });
  document.documentElement.addEventListener("pointerleave", () => {
    raton = null;
    agendar();
  });
  mq.addEventListener?.("change", aplicarModo);
  document.addEventListener("visibilitychange", () => (document.hidden ? (pendiente && cancelAnimationFrame(pendiente), (pendiente = 0), (ultimoT = 0)) : agendar()));
  new IntersectionObserver((entradas) => {
    visible = entradas[entradas.length - 1].isIntersecting;
    if (visible) {
      medir();
      agendar();
    } else {
      if (pendiente) cancelAnimationFrame(pendiente);
      pendiente = 0;
      ultimoT = 0;
    }
  }).observe(hero);

  leerTokens();
  medir();
}
