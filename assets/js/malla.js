/*
  Yaruki — malla de fondo continua (V2, issue #98; nació en el hero con el #26).

  UN solo <canvas> 2D fijo (`position: fixed`) detrás de toda la portada: una cuadrícula de
  puntos unidos por líneas finas. Dos movimientos, a la manera de la referencia (mastermind.ac):

  1. Onda en reposo. Cada punto flota hasta ±15 px según su posición y el tiempo (senos y
     cosenos lentos, ~9 s por ciclo), así que la malla está viva aunque no muevas el mouse.
  2. Reacción al cursor. Cuadrícula de 128 px, radio de 300 px, empuje de 38 px × (1 − d/r)²,
     líneas de 1.1 px, puntos de 1.35 px que crecen hasta +3 px; del color del borde de
     tarjeta al acento. Todo con inercia: al salir el cursor la malla vuelve sola.

  Reglas que cumple:
  - Los colores salen de los tokens (`--color-border-card` en reposo, `--color-accent`
    encendido) y sus opacidades de `--malla-*` (tokens.css): el claro es más tenue que el
    oscuro, y el toggle con revelado circular y la demo de tema la repintan en el mismo
    microtask del cambio de `data-theme`.
  - Intensidad: el canvas se atenúa con `opacity` CSS (`--malla-intensidad`, gratis: la
    compone la GPU). Mientras el recorrido del teléfono (las fases) ocupa la pantalla, la
    raíz lleva `data-malla-recorrido` y la intensidad pasa a `--malla-recorrido`
    (tokens.css). API: `fijarIntensidadRecorrido(0..1)` / `intensidadRecorrido()`;
    `?malla=pleno|medio|<0..1>` en la URL la fija (solo para comparar niveles).
  - Rendimiento: un solo requestAnimationFrame (`cuadro`), sin asignaciones por cuadro
    (arreglos tipados reutilizados), trazo por lotes (un `beginPath` por nivel de opacidad),
    30 fps en reposo y en táctil, 60 fps solo mientras el cursor se mueve. Pausa real con la
    pestaña oculta y cuando `<main>` sale de pantalla (el pie opaco lo cubre todo).
  - Con `prefers-reduced-motion` se dibuja una vez, estática y sin reaccionar (el cambio de la
    preferencia en vivo se atiende). En táctil (sin hover/puntero fino) ondula pero NO
    reacciona al dedo, que hace scroll.
  - Arranca después del primer pintado (`load` + `requestIdleCallback`): el LCP es el titular
    y la malla nunca lo retrasa. Sin JS no hay canvas y la página queda igual.
  - CSP: sin estilos inline; todo estilo calculado va por CSSOM y el resto por `.malla-fondo`
    (base.css).
*/

const SEPARACION = 128; // px entre puntos de la cuadrícula
const RADIO = 300; // radio de influencia del cursor
const EMPUJE = 38; // desplazamiento máximo de un punto
const GROSOR_LINEA = 1.1;
const RADIO_PUNTO = 1.35;
const CRECE_PUNTO = 3;
const DPR_MAX = 2;
// Tope de píxeles del canvas (≈ 32 MB de RGBA): a 2560×1440@2x pediría 5120×2880; con el tope baja a ~1.5x,
// que sigue nítido para líneas de 1.1 px.
const PIXELES_MAX = 8e6;
const TAU_CURSOR = 90; // ms: inercia con la que la malla sigue al cursor
const TAU_FUERZA = 170; // ms: cuánto tarda en encenderse / apagarse
const NIVELES = 8; // niveles de opacidad con los que se agrupan los trazos
// Onda en reposo: dos senos/cosenos por eje con amplitudes 9 + 6 = 15 px como máximo; la fase avanza ~9 s por ciclo.
const AMP_A = 9;
const AMP_B = 6;
const MS_REDUCIDO = 4200; // instante de la onda con el que se pinta la versión estática
const MOVIMIENTO_RECIENTE = 900; // ms desde el último movimiento del cursor que cuentan como «interactuando»

/*
  Táctil (sin hover/puntero fino), donde el teléfono de gama media es el que sufre. Tres variantes, elegibles con
  `?malla-movil=normal|ligera|pausa-scroll` (para comparar en un teléfono real con `?malla-diagnostico=1`):
  - normal: 30 fps, canvas a DPR ≤ 2;
  - ligera: 30 fps, canvas a DPR 1 (un cuarto de píxeles que rasterizar en un teléfono de DPR 2–3);
  - pausa-scroll: como normal, pero no dibuja mientras el dedo hace scroll (la malla es fija: se queda quieta
    y vuelve a ondular PAUSA_SCROLL ms después del último evento de scroll);
  - ligera-pausa: las dos cosas (DPR 1 y pausa durante el scroll).
  En escritorio no aplica. Por defecto va «normal» (decisión de Harold tras medir en su teléfono real: 59–61 fps de pantalla y más nítida);
  «ligera» es el respaldo AUTOMÁTICO: la degradación nivel 1 (más abajo) hace lo mismo (DPR 1) cuando el costo sostenido es alto.
*/
const VARIANTES_MOVIL = ["normal", "ligera", "pausa-scroll", "ligera-pausa"];
const MOVIL_POR_DEFECTO = "normal";
const DPR_MAX_LIGERA = 1;
const PAUSA_SCROLL = 180;

/*
  Degradación automática (#98, render por software y equipos lentos). Medir solo el JS de `dibujar` engaña: el canvas 2D
  rasteriza al final del cuadro (en software, en el hilo principal), así que el JS tarda ~0.4 ms y el cuadro ~13 ms. Por
  eso se mide el cuadro COMPLETO: del inicio del callback de rAF hasta la primera tarea posterior (un mensaje de
  MessageChannel, que corre justo después de estilo/layout/pintado/commit). El costo de la malla es la mediana de los
  cuadros en que dibujó MENOS la de los cuadros en que no (a 30 fps se alternan, así que la página misma queda restada).
  Si ese costo pasa de UMBRAL_COSTO_MS, la malla baja un nivel: 0 = normal; 1 = 20 fps, canvas a DPR 1 y 30 fps máx. con el cursor;
  2 = 15 fps, además cuadrícula de 192 px (la mitad de puntos) y 20 fps máx. con el cursor. La onda dura ~9 s por ciclo,
  así que 15 fps no se ve congelada. No se guarda nada ni se consulta la GPU: solo se mide el propio costo. Para volver
  a un nivel mejor se vuelve a probar cada ESPERA_PRUEBA_MS (que se duplica, hasta el tope, cada vez que la prueba
  falla). Pruebas: `?malla-forzar=software` fija el nivel 2; `?malla-forzar=normal` (o elegir a mano `?malla-movil=`) desactiva la degradación.
*/
const UMBRAL_COSTO_MS = 8;
const VENTANA_COSTO = 60; // dibujos que se miran para decidir
const ESPERA_PRUEBA_MS = 30000;
const ESPERA_PRUEBA_MAX = 240000;
const NIVELES_DEGRADACION = [
  { fps: 30, enCursor: 0, dprMax: DPR_MAX, sep: SEPARACION },
  { fps: 20, enCursor: 30, dprMax: 1, sep: SEPARACION },
  { fps: 15, enCursor: 20, dprMax: 1, sep: 192 },
];

/*
  PROTOTIPO `?malla=referencia` (y `?vidrio=1`, que la incluye): la malla más encendida, cerca de la referencia (del
  acento: líneas 0.10 → 0.30 y puntos 0.28 → 0.56, igual en claro y oscuro) y a plena intensidad también detrás de las
  fases. La malla se dibuja DETRÁS de todo, sin huecos bajo el texto (#100): el contraste del párrafo lo da el vidrio
  y el de los títulos grandes se mide con la malla debajo (3:1).
*/
const REFERENCIA = { lineaReposo: 0.1, puntoReposo: 0.28, lineaActiva: 0.3, puntoActivo: 0.56 };
let referencia = false;
let vidrio = false;

const MQ_FINO = "(hover: hover) and (pointer: fine)";
const MQ_REDUCIDO = "(prefers-reduced-motion: reduce)";

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

const raiz = document.documentElement;

/* ---- API de intensidad (el vidrio del #100 y la demostración la usan) ---- */

/** Intensidad (0..1) de la malla mientras el recorrido del teléfono ocupa la pantalla. */
export function intensidadRecorrido() {
  const v = parseFloat(getComputedStyle(raiz).getPropertyValue("--malla-recorrido"));
  return Number.isFinite(v) ? v : 1;
}

/** Fija la intensidad detrás del recorrido (0..1); `null` vuelve al valor de tokens.css. */
export function fijarIntensidadRecorrido(valor) {
  if (valor === null || valor === undefined) raiz.style.removeProperty("--malla-recorrido");
  else raiz.style.setProperty("--malla-recorrido", String(Math.min(1, Math.max(0, Number(valor)))));
}

/** `?malla=pleno|medio|0.35`: solo para comparar niveles en el punto de control. */
function parametro(nombre) {
  try {
    return new URLSearchParams(location.search).get(nombre);
  } catch {
    return null;
  }
}

function varianteMovilDeUrl() {
  try {
    const v = new URLSearchParams(location.search).get("malla-movil");
    return VARIANTES_MOVIL.includes(v) ? v : MOVIL_POR_DEFECTO;
  } catch {
    return MOVIL_POR_DEFECTO;
  }
}

function aplicarParametro() {
  let p = null;
  try {
    p = new URLSearchParams(location.search).get("malla");
  } catch {
    return;
  }
  try {
    vidrio = new URLSearchParams(location.search).get("vidrio") === "1";
  } catch {}
  raiz.toggleAttribute("data-vidrio", vidrio);
  if (vidrio && !p) p = "referencia";
  if (!p) return;
  if (p === "referencia") {
    referencia = true;
    fijarIntensidadRecorrido(1);
    return;
  }
  const v = p === "pleno" ? 1 : p === "medio" ? 0.5 : Number(p);
  if (Number.isFinite(v)) fijarIntensidadRecorrido(v);
}

export function inicializarMalla(fasesRecorrido = []) {
  if (typeof HTMLCanvasElement === "undefined") return;
  aplicarParametro();
  // `?malla=apagada`: la página sola, sin canvas ni bucle (para saber si el costo del scroll es de la malla o de la página).
  if (parametro("malla") === "apagada") return;
  const arrancar = () => (window.requestIdleCallback ? window.requestIdleCallback(() => montar(fasesRecorrido), { timeout: 1500 }) : setTimeout(() => montar(fasesRecorrido), 200));
  if (document.readyState === "complete") arrancar();
  else window.addEventListener("load", arrancar, { once: true });
}

function montar(fasesRecorrido) {
  const canvas = document.createElement("canvas");
  canvas.className = "malla-fondo";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const mqFino = window.matchMedia(MQ_FINO);
  const mqReducido = window.matchMedia(MQ_REDUCIDO);
  const principal = document.getElementById("contenido");
  /*
    Cuadros de animación dibujados, leíbles en `canvas.cuadrosAnimados` (solo lectura). Lo usan las pruebas
    (scripts/pruebas/malla.mjs) para contar y medir los cuadros de la malla sin depender del nombre de una función
    ni de los demás rAF de la página (tilt.js, stage.js, progreso.js). Cuesta un incremento por cuadro.
  */
  let dibujados = 0;
  Object.defineProperty(canvas, "cuadrosAnimados", { get: () => dibujados });
  const varianteMovil = varianteMovilDeUrl();
  const tactil = () => !mqFino.matches;
  let enScroll = false; // pausa-scroll: el dedo está haciendo scroll
  let finScroll = 0;
  // Costo de hilo principal de cada dibujo (anillo) y degradación automática.
  const costos = new Float32Array(VENTANA_COSTO * 2); // duración del cuadro completo en los cuadros que dibujaron
  const costosSin = new Float32Array(VENTANA_COSTO * 2); // ... y en los que no dibujaron (la página sola)
  const costosJs = new Float32Array(VENTANA_COSTO * 2); // solo el JS de dibujar() (lo que NO incluye la rasterización)
  const orden = new Float32Array(VENTANA_COSTO);
  let nCostos = 0;
  let nSin = 0;
  const canal = new MessageChannel();
  let marca = 0;
  let marcaDibujo = false;
  let marcaJs = 0;
  let nivelDeg = 0;
  let motivoDeg = "";
  let esperaPrueba = ESPERA_PRUEBA_MS;
  let proximaPrueba = 0;
  let probando = false;
  // Con `?malla-forzar=` o con una variante de móvil elegida a mano (`?malla-movil=`, para comparar) la degradación no se mueve sola.
  const forzar = parametro("malla-forzar") || (parametro("malla-movil") !== null ? "normal" : null);
  const cuantil = (arr, n, q) => {
    const k = Math.min(n, VENTANA_COSTO);
    for (let i = 0; i < k; i++) orden[i] = arr[(n - 1 - i) % arr.length];
    orden.subarray(0, k).sort();
    return k ? orden[Math.min(k - 1, Math.floor(k * q))] : 0;
  };
  // Costo de la malla en ms por dibujo = cuadro con dibujo − cuadro sin dibujo (mediana), nunca negativo.
  const costoMalla = (q) => (nCostos >= 8 && nSin >= 8 ? Math.max(0, cuantil(costos, nCostos, q) - cuantil(costosSin, nSin, 0.5)) : 0);
  canal.port1.onmessage = () => {
    const d = performance.now() - marca;
    if (marcaDibujo) {
      costosJs[nCostos % costosJs.length] = marcaJs;
      costos[nCostos++ % costos.length] = d;
      if (nCostos % 30 === 0) evaluarCosto(marca);
    } else costosSin[nSin++ % costosSin.length] = d;
  };
  // Estado para el modo de diagnóstico (`?malla-diagnostico=1`, malla-diagnostico.js) y las pruebas.
  Object.defineProperty(canvas, "mallaInfo", {
    get: () => ({
      variante: tactil() ? varianteMovil : "escritorio",
      dpr,
      ancho,
      alto,
      cuadros: dibujados,
      pausadaPorScroll: enScroll,
      nivel: nivelDeg,
      motivo: motivoDeg,
      fpsTope: NIVELES_DEGRADACION[nivelDeg].fps,
      costoP50: costoMalla(0.5),
      costoP95: costoMalla(0.95),
      costoJsP50: nCostos ? cuantil(costosJs, nCostos, 0.5) : 0,
      sep,
    }),
  });
  let ancho = 0;
  let alto = 0;
  let dpr = 1;
  let sep = SEPARACION; // px entre puntos (la degradación nivel 2 la agranda)
  let c = null; // colores y opacidades leídos de los tokens
  let estilos = null; // estilos de trazo y relleno por nivel (colores opacos precalculados al leer los tokens)
  let visible = true; // <main> a la vista
  let raton = null; // última posición del cursor (viewport)
  let pendiente = 0;
  let ultimoDibujo = 0;
  let ultimoT = 0;
  let tMovimiento = -1e9;
  let tOnda = MS_REDUCIDO; // tiempo de la onda del último dibujo
  // Estado suavizado: posición del cursor y fuerza (0..1).
  const e = { x: 0, y: 0, fuerza: 0 };

  // Arreglos reutilizados (sin asignaciones por cuadro); se recrean solo cuando cambia el tamaño de la cuadrícula.
  let cols = 0;
  let filas = 0;
  let px = new Float32Array(0);
  let py = new Float32Array(0);
  let nivelPunto = new Uint8Array(0);
  let nivelH = new Uint8Array(0);
  let nivelV = new Uint8Array(0);
  let radioPunto = new Float32Array(0);
  function leerTokens() {
    const cs = getComputedStyle(raiz);
    const num = (n, d) => {
      const v = parseFloat(cs.getPropertyValue(n));
      return Number.isFinite(v) ? v : d;
    };
    c = {
      fondo: rgbDe(cs.getPropertyValue("--color-bg"), [250, 247, 242]),
      reposo: rgbDe(cs.getPropertyValue("--color-border-card"), [221, 212, 199]),
      activo: rgbDe(cs.getPropertyValue("--color-accent"), [108, 92, 224]),
      lineaReposo: num("--malla-linea-reposo", 0.6),
      lineaActiva: num("--malla-linea-activa", 0.2),
      puntoReposo: num("--malla-punto-reposo", 0.8),
      puntoActivo: num("--malla-punto-activo", 0.4),
    };
    if (referencia) {
      // Como la referencia: la malla es del acento también en reposo (líneas 0.10, puntos 0.28) y se enciende a 0.30 / 0.56.
      c.reposo = c.activo;
      Object.assign(c, REFERENCIA);
    }
    /*
      Colores OPACOS ya mezclados con el fondo (`--color-bg`): lo único que hay detrás del canvas es ese color liso
      (las secciones no pintan fondo; lo que sí lo pinta, tarjetas y pie, tapa el canvas). Así dos trazos que se cruzan
      o un punto sobre una línea NO apilan opacidad (el gris encima de otro no se oscurece) y el peor píxel posible es
      el del color del nivel más encendido: el contraste del texto se puede garantizar por construcción (ver tokens.css).
      Cada nivel funde dos capas: la de reposo (borde de tarjeta) se apaga y la del acento se enciende; mezclar los dos
      colores y las dos opacidades por separado dejaba un valle de contraste a medio camino.
    */
    const mezcla = (base, col, alfa) => base.map((v, i) => Math.round(v + (col[i] - v) * alfa));
    const rgb = (v) => `rgb(${v[0]},${v[1]},${v[2]})`;
    estilos = [];
    for (let n = 0; n <= NIVELES; n++) {
      const t = n / NIVELES;
      const capa = (aReposo, aActiva) => rgb(mezcla(mezcla(c.fondo, c.reposo, aReposo * (1 - t)), c.activo, aActiva * t));
      estilos.push({ linea: capa(c.lineaReposo, c.lineaActiva), punto: capa(c.puntoReposo, c.puntoActivo) });
    }
  }

  function medir() {
    const nuevoAncho = canvas.clientWidth;
    const nuevoAlto = canvas.clientHeight;
    if (nuevoAncho < 1 || nuevoAlto < 1) return;
    const niv = NIVELES_DEGRADACION[nivelDeg];
    const dprMax = Math.min(niv.dprMax, tactil() && varianteMovil.startsWith("ligera") ? DPR_MAX_LIGERA : DPR_MAX);
    const nuevoDpr = Math.min(window.devicePixelRatio || 1, dprMax, Math.sqrt(PIXELES_MAX / (nuevoAncho * nuevoAlto)));
    if (nuevoAncho === ancho && nuevoAlto === alto && nuevoDpr === dpr && niv.sep === sep) return;
    ancho = nuevoAncho;
    alto = nuevoAlto;
    dpr = nuevoDpr;
    sep = niv.sep;
    canvas.width = Math.max(1, Math.round(ancho * dpr));
    canvas.height = Math.max(1, Math.round(alto * dpr));
    cols = Math.ceil(ancho / sep) + 3;
    filas = Math.ceil(alto / sep) + 3;
    const n = cols * filas;
    px = new Float32Array(n);
    py = new Float32Array(n);
    nivelPunto = new Uint8Array(n);
    nivelH = new Uint8Array(n);
    nivelV = new Uint8Array(n);
    radioPunto = new Float32Array(n);
    dibujar(tOnda);
  }

  /* Dibuja un cuadro con la onda en el instante `t` (ms) y el cursor en (e.x, e.y) con la fuerza actual. */
  function dibujar(t) {
    if (!c) leerTokens();
    if (!cols) return;
    tOnda = t;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    const activo = e.fuerza > 0.002;
    // Centrada: sin un borde más ancho de un lado. Los puntos de la fila/columna -1 quedan fuera para que la onda
    // y el empuje no dejen huecos en los bordes.
    const ox = (ancho - (cols - 4) * sep) / 2;
    const oy = 0;
    const f1 = t * 0.00070;
    const f2 = t * 0.00052;
    const f3 = t * 0.00063;
    const f4 = t * 0.00047;
    let usados = 1; // bit n = el nivel n tiene algo que trazar (el 0 siempre)
    for (let j = 0; j < filas; j++) {
      const y0 = oy + (j - 1) * sep;
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        const x0 = ox + (i - 1) * sep;
        let x = x0 + AMP_A * Math.sin(f1 + y0 * 0.0105 + x0 * 0.0042) + AMP_B * Math.cos(f2 + x0 * 0.0087 - y0 * 0.0031);
        let y = y0 + AMP_A * Math.cos(f3 + x0 * 0.0095 + y0 * 0.0036) + AMP_B * Math.sin(f4 + y0 * 0.0081 - x0 * 0.0027);
        let nivel = 0;
        let radio = RADIO_PUNTO;
        if (activo) {
          const dx = x - e.x;
          const dy = y - e.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < RADIO) {
            const w = (1 - d / RADIO) * e.fuerza;
            const push = (d > 0.001 ? EMPUJE / d : 0) * w * w;
            x += dx * push;
            y += dy * push;
            if (w > 0.003) {
              nivel = Math.min(NIVELES, Math.ceil(w * NIVELES));
              radio = RADIO_PUNTO + CRECE_PUNTO * w;
              usados |= 1 << nivel;
            }
          }
        }
        px[k] = x;
        py[k] = y;
        nivelPunto[k] = nivel;
        radioPunto[k] = radio;
      }
    }
    // Nivel de cada arista: el mayor de sus dos extremos (si no, una arista que sale de la zona encendida quedaría tenue de golpe).
    for (let j = 0; j < filas; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        nivelH[k] = i + 1 < cols ? Math.max(nivelPunto[k], nivelPunto[k + 1]) : 255;
        nivelV[k] = j + 1 < filas ? Math.max(nivelPunto[k], nivelPunto[k + cols]) : 255;
      }
    }

    ctx.lineWidth = GROSOR_LINEA;
    ctx.lineCap = "round";
    const n = cols * filas;
    for (let nivel = 0; nivel <= NIVELES; nivel++) {
      if (!(usados & (1 << nivel))) continue;
      // Líneas de este nivel en un solo trazo.
      ctx.strokeStyle = estilos[nivel].linea;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        if (nivelH[k] === nivel) {
          ctx.moveTo(px[k], py[k]);
          ctx.lineTo(px[k + 1], py[k + 1]);
        }
        if (nivelV[k] === nivel) {
          ctx.moveTo(px[k], py[k]);
          ctx.lineTo(px[k + cols], py[k + cols]);
        }
      }
      ctx.stroke();
    }
    for (let nivel = 0; nivel <= NIVELES; nivel++) {
      if (!(usados & (1 << nivel))) continue;
      ctx.fillStyle = estilos[nivel].punto;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        if (nivelPunto[k] !== nivel) continue;
        ctx.moveTo(px[k] + radioPunto[k], py[k]);
        ctx.arc(px[k], py[k], radioPunto[k], 0, 6.283185307179586);
      }
      ctx.fill();
    }
  }

  const reduce = () => mqReducido.matches;
  const puedeAnimar = () => !reduce() && visible && !document.hidden && !enScroll && ancho > 0;
  const reacciona = () => mqFino.matches && !reduce();

  function agendar() {
    if (pendiente || !puedeAnimar()) return;
    pendiente = requestAnimationFrame(cuadro);
  }

  function parar() {
    if (pendiente) cancelAnimationFrame(pendiente);
    pendiente = 0;
    ultimoT = 0;
    ultimoDibujo = 0;
  }

  /* Un cuadro de la animación: la onda nunca se detiene; solo se cede el 60 fps al cursor cuando hace falta. */
  function cuadro(t) {
    pendiente = 0;
    if (!puedeAnimar()) return;
    const objetivo = raton && reacciona() ? 1 : 0;
    const interactuando = t - tMovimiento < MOVIMIENTO_RECIENTE || Math.abs(objetivo - e.fuerza) > 0.002;
    const niv = NIVELES_DEGRADACION[nivelDeg];
    const intervalo = interactuando ? (niv.enCursor ? 1000 / niv.enCursor : 0) : 1000 / niv.fps;
    marca = performance.now();
    if (ultimoDibujo && t - ultimoDibujo < intervalo - 2) {
      marcaDibujo = false;
      canal.port2.postMessage(0);
      agendar(); // medio cuadro de espera a 30 fps: no se dibuja
      return;
    }
    marcaDibujo = true;
    const dt = Math.min(ultimoT ? t - ultimoT : 16, 50);
    ultimoT = t;
    ultimoDibujo = t;
    if (e.fuerza < 0.01 && objetivo && raton) {
      e.x = raton.x; // el cursor acaba de entrar: sin barrido desde una posición vieja
      e.y = raton.y;
    }
    if (raton) {
      const aCursor = 1 - Math.exp(-dt / TAU_CURSOR);
      e.x += (raton.x - e.x) * aCursor;
      e.y += (raton.y - e.y) * aCursor;
    }
    const aFuerza = 1 - Math.exp(-dt / TAU_FUERZA);
    e.fuerza += (objetivo - e.fuerza) * aFuerza;
    if (Math.abs(objetivo - e.fuerza) < 0.003) e.fuerza = objetivo;
    const t0 = performance.now();
    dibujar(t);
    dibujados++;
    marcaJs = performance.now() - t0;
    canal.port2.postMessage(0);
    agendar();
  }

  /* Cada 30 dibujos: baja un nivel si la mediana reciente es cara; cada tanto prueba volver al nivel anterior. */
  function evaluarCosto(ahora) {
    if (forzar) return; // `?malla-forzar=software|normal`: el nivel no se mueve solo
    const p50 = costoMalla(0.5);
    if (nCostos >= VENTANA_COSTO / 2 && p50 > UMBRAL_COSTO_MS && nivelDeg < NIVELES_DEGRADACION.length - 1) {
      if (probando) esperaPrueba = Math.min(esperaPrueba * 2, ESPERA_PRUEBA_MAX); // la prueba de recuperación falló
      probando = false;
      fijarNivel(nivelDeg + 1, `costo ${p50.toFixed(1)} ms por dibujo`);
      proximaPrueba = ahora + esperaPrueba;
    } else if (probando && p50 <= UMBRAL_COSTO_MS && nCostos >= VENTANA_COSTO) {
      probando = false; // la prueba salió bien: se queda en el nivel mejor y vuelve a la espera inicial
      esperaPrueba = ESPERA_PRUEBA_MS;
    } else if (nivelDeg > 0 && !probando && ahora > proximaPrueba && p50 <= UMBRAL_COSTO_MS) {
      probando = true;
      fijarNivel(nivelDeg - 1, "prueba de recuperación");
      proximaPrueba = ahora + esperaPrueba;
    }
  }

  function fijarNivel(n, motivo) {
    nivelDeg = n;
    if (!n) motivoDeg = "";
    else if (!motivo.startsWith("prueba")) motivoDeg = motivo;
    nCostos = 0; // la ventana empieza de cero con el nivel nuevo
    nSin = 0;
    medir();
  }
  if (forzar === "software") {
    nivelDeg = NIVELES_DEGRADACION.length - 1;
    motivoDeg = "forzado (?malla-forzar=software)";
  }

  function alCursor(ev) {
    if (ev.pointerType && ev.pointerType !== "mouse") return;
    raton = { x: ev.clientX, y: ev.clientY };
    tMovimiento = performance.now();
    agendar();
  }

  function aplicarModo() {
    if (reduce()) {
      // Estática: se detiene lo pendiente y se deja la malla en un instante fijo de la onda, sin cursor.
      parar();
      e.fuerza = 0;
      dibujar(MS_REDUCIDO);
    } else {
      agendar();
    }
  }

  // Tema: se redibuja en el mismo microtask del cambio de `data-theme` / del esquema del sistema.
  const repintar = () => {
    leerTokens();
    if (ancho) dibujar(tOnda);
    // Sin View Transitions los tokens de color transicionan 600 ms (base.css): se vuelven a leer cuando terminan.
    clearTimeout(repintar.t);
    repintar.t = setTimeout(() => {
      leerTokens();
      if (ancho) dibujar(tOnda);
    }, 700);
  };
  new MutationObserver(repintar).observe(raiz, { attributes: true, attributeFilter: ["data-theme"] });
  const oscuro = window.matchMedia("(prefers-color-scheme: dark)");
  oscuro.addEventListener?.("change", repintar);

  new ResizeObserver(medir).observe(canvas);
  window.addEventListener("pointermove", alCursor, { passive: true });
  raiz.addEventListener("pointerleave", () => {
    raton = null;
    agendar();
  });
  mqReducido.addEventListener?.("change", aplicarModo);
  mqFino.addEventListener?.("change", () => {
    medir(); // la variante ligera cambia la resolución del canvas
    agendar();
  });
  if (varianteMovil === "pausa-scroll" || varianteMovil === "ligera-pausa") {
    window.addEventListener(
      "scroll",
      () => {
        if (!tactil() || reduce()) return;
        if (!enScroll) {
          enScroll = true;
          parar();
        }
        clearTimeout(finScroll);
        finScroll = setTimeout(() => {
          enScroll = false;
          agendar();
        }, PAUSA_SCROLL);
      },
      { passive: true },
    );
  }
  document.addEventListener("visibilitychange", () => (document.hidden ? parar() : agendar()));
  // <main> fuera de pantalla (el pie, opaco, lo cubre todo): no hay nada que ver ni que animar.
  if (principal) {
    new IntersectionObserver((entradas) => {
      visible = entradas[entradas.length - 1].isIntersecting;
      if (visible) agendar();
      else parar();
    }).observe(principal);
  }
  // Atenuado detrás del recorrido: un solo atributo en la raíz; la opacidad la resuelve el CSS (base.css).
  if (fasesRecorrido.length) {
    const dentro = new Set();
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const en of entradas) en.isIntersecting ? dentro.add(en.target) : dentro.delete(en.target);
        raiz.toggleAttribute("data-malla-recorrido", dentro.size > 0);
      },
      { rootMargin: "-45% 0px -45% 0px" }, // cuenta la fase que cruza la franja central de la pantalla
    );
    fasesRecorrido.forEach((f) => observador.observe(f));
  }

  leerTokens();
  medir();
  if (reduce()) dibujar(MS_REDUCIDO);
  else agendar();
}
