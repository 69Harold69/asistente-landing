import { ESCENAS } from "./scenes/registro.js";
import { barraDeEstado } from "./icons.js";

/**
 * Escenario del teléfono 3D — orquestador (plan, 4.1/4.2/5.3/5.4).
 *
 * Dos modos, elegidos una sola vez al cargar:
 * 1. **Inspección** (`?escena=&cara=&angulo=`, sin UI visible — ver README):
 *    monta una escena fija y una cara fija, sin coreografía. Para QA.
 * 2. **Coreografía**: el estado COMPLETO del teléfono (qué escena o escenas
 *    están montadas, cuánto pesa cada una, ángulo, desplazamiento, escala)
 *    es una FUNCIÓN PURA de una posición de scroll "virtual" (`estadoEn`).
 *    No hay estado acumulado por eventos (`onEnter`/`onLeaveBack`), así que
 *    no puede quedar desincronizado: en cada posición, bajando o subiendo,
 *    el teléfono muestra la escena del texto que se lee.
 *
 * La posición virtual sigue al scroll real con un suavizado (el equivalente
 * a `scrub` de ScrollTrigger) y un LÍMITE DE VELOCIDAD dentro de cada giro:
 * nunca avanza más de `PASO_MAX_GIRO` del tramo por cuadro (≈36°). Con un
 * salto brusco (End, Home, arrastrar la barra, `scrollTo`) el teléfono
 * recorre los giros intermedios rápido pero cuadro a cuadro, y como la
 * escena se decide sobre el ángulo YA SUAVIZADO, el cambio cae siempre de
 * espaldas (entre 90° y 270° hay al menos 4 cuadros). El `scrub` de GSAP no
 * alcanza para eso: su primer cuadro tras un salto avanza ~8% de la
 * distancia total y puede saltarse un giro entero de un cuadro al otro.
 *
 * Sólo se anima `transform` y `opacity`.
 */

const ROTACION_POR_CARA = { frente: 0, canto: 80, espalda: 180 };
const ESCENA_POR_DEFECTO = "splash";
const CARA_POR_DEFECTO = "frente";

/** Capas del canto (ver `.phone-canto` en phone.css). ~15 px de grosor / 12 capas ≈ 1.2 px entre capas. */
const CAPAS_CANTO = 12;
/** Debajo de este |sen θ| (≈1.5°) el canto mide menos de medio pixel: se oculta. */
const UMBRAL_CANTO = 0.025;
/** Debajo de este |cos θ| (≈4.6° alrededor de 90°/270°) se ven las capas de filo: entran los planos sólidos. */
const UMBRAL_FILO = 0.08;

/** Constante de tiempo del suavizado (s): con 0.12 alcanza ~95% en 0.36 s, parecido a `scrub: 0.6`. */
const TAU_SUAVIZADO = 0.12;
/** Avance máximo por cuadro dentro de un giro, como fracción del tramo (0.1 → 36° por cuadro). */
const PASO_MAX_GIRO = 0.1;

function leerParametrosDeInspeccion() {
  const params = new URLSearchParams(window.location.search);
  const escena = params.get("escena");
  const cara = params.get("cara");
  const angulo = Number.parseFloat(params.get("angulo"));
  return {
    escena: escena && ESCENAS[escena] ? escena : null,
    cara: cara && cara in ROTACION_POR_CARA ? cara : null,
    angulo: Number.isFinite(angulo) ? angulo : null,
  };
}

/**
 * Genera las capas del canto: N contornos redondeados repartidos en Z entre
 * la espalda (-D/2) y el frente (+D/2), más dos planos sólidos
 * perpendiculares (uno por lado) que tapan las rayas que dejan las capas
 * vistas exactamente de filo, a 90°/270°.
 */
function construirCanto(telefono) {
  const canto = telefono.querySelector(".phone-canto");
  if (!canto || canto.childElementCount) return;
  const fragmento = document.createDocumentFragment();
  for (let i = 0; i < CAPAS_CANTO; i++) {
    const t = (i + 0.5) / CAPAS_CANTO;
    const centro = Math.sin(t * Math.PI);
    const capa = document.createElement("span");
    capa.className = "phone-capa";
    // Fracción del grosor (-0.5…0.5); phone.css la multiplica por --phone-depth.
    capa.style.setProperty("--z", (t - 0.5).toFixed(4));
    capa.style.setProperty("--luz", Math.round(centro * 22));
    capa.style.setProperty("--sombra", Math.round((1 - centro) * 26));
    fragmento.appendChild(capa);
  }
  for (const lado of ["izq", "der"]) {
    const plano = document.createElement("span");
    plano.className = `phone-plano phone-plano--${lado}`;
    fragmento.appendChild(plano);
  }
  canto.appendChild(fragmento);
}

/**
 * Aplica el ángulo. `data-canto`: "oculto" de frente/espaldas, "visible"
 * girado y "filo" cerca de 90°/270° (suma los planos sólidos).
 * `data-espalda`: el halo de la mascota sólo anima mientras la espalda se ve.
 */
function fijarRotacion(telefono, grados) {
  telefono.style.setProperty("--rotacion-y", `${grados}deg`);
  const rad = (grados * Math.PI) / 180;
  const sen = Math.abs(Math.sin(rad));
  const cos = Math.cos(rad);
  const canto = sen <= UMBRAL_CANTO ? "oculto" : Math.abs(cos) < UMBRAL_FILO ? "filo" : "visible";
  if (telefono.dataset.canto !== canto) telefono.dataset.canto = canto;
  const espalda = cos < 0.05 ? "visible" : "oculta";
  if (telefono.dataset.espalda !== espalda) telefono.dataset.espalda = espalda;
}

/** Aplica el ancho real de cada `[data-progreso]` vía CSSOM (no `style=""` en el HTML). */
function aplicarBarrasDeProgreso(raiz) {
  raiz.querySelectorAll("[data-progreso]").forEach((el) => {
    const valor = Number(el.dataset.progreso);
    const porcentaje = Number.isFinite(valor) ? Math.min(Math.max(valor, 0), 1) * 100 : 0;
    el.style.width = `${porcentaje}%`;
  });
}

function montarEnCapa(capa, id) {
  capa.innerHTML = "";
  const escena = ESCENAS[id];
  if (!escena) return;
  escena.mount(capa);
  capa.querySelector(".escena")?.insertAdjacentHTML("afterbegin", barraDeEstado());
  aplicarBarrasDeProgreso(capa);
}

export function inicializarEscenario() {
  const telefono = document.getElementById("telefono");
  const pantalla = document.getElementById("pantalla-telefono");
  const sombraVuelo = document.getElementById("sombra-vuelo");
  if (!telefono || !pantalla) return null;

  construirCanto(telefono);

  const { escena, cara, angulo } = leerParametrosDeInspeccion();
  if (escena || cara || angulo !== null) {
    montarEnCapa(pantalla, escena ?? ESCENA_POR_DEFECTO);
    fijarRotacion(telefono, angulo ?? ROTACION_POR_CARA[cara ?? CARA_POR_DEFECTO]);
    telefono.dataset.cara = angulo !== null ? `${angulo}` : cara ?? CARA_POR_DEFECTO;
    return null;
  }

  if (!window.gsap) {
    // No debería pasar (vendorizado local): mejor el cierre real que la pantalla vacía.
    montarEnCapa(pantalla, "dashboard");
    return null;
  }

  return inicializarCoreografia(telefono, pantalla, sombraVuelo);
}

/**
 * Dos capas físicas (`.capa-escena`) dentro de la pantalla. `mostrar(base,
 * encima, t)` deja `base` opaca abajo y `encima` arriba con opacidad `t`,
 * montando cada id en la capa que haga falta: siempre según lo que pide el
 * estado, nunca según qué capa "era la actual" (causa del bug B1).
 * La escena dominante (la de más peso) es la única que corre su loop.
 */
function crearCapas(pantalla) {
  const capas = [0, 1].map(() => {
    const c = document.createElement("div");
    c.className = "capa-escena";
    c.style.opacity = "0";
    pantalla.append(c);
    return c;
  });
  const montada = new Map();
  const opacidad = new Map();
  let activa = null;

  const capaCon = (id) => capas.find((c) => montada.get(c) === id) ?? null;

  function asegurar(id, evitar) {
    let capa = capaCon(id);
    if (!capa) {
      capa = capas.find((c) => c !== evitar);
      montarEnCapa(capa, id);
      montada.set(capa, id);
      // Re-montar la escena que está corriendo (sólo puede pasar si la capa
      // fue reciclada) la deja con referencias nuevas: arrancarla de nuevo.
      if (id === activa) ESCENAS[id]?.play?.();
    }
    return capa;
  }

  function fijarOpacidad(capa, valor, z) {
    const v = Math.round(valor * 1000) / 1000;
    if (opacidad.get(capa) === v) return;
    opacidad.set(capa, v);
    capa.style.opacity = String(v);
    capa.style.zIndex = String(z);
  }

  function mostrar(base, encima = null, t = 0) {
    if (!encima || t <= 0) {
      encima = null;
      t = 0;
    } else if (t >= 1) {
      base = encima;
      encima = null;
      t = 0;
    }
    const capaEncima = encima ? capaCon(encima) : null;
    const capaBase = asegurar(base, capaEncima);
    const otra = capas.find((c) => c !== capaBase);
    if (encima) asegurar(encima, capaBase);
    fijarOpacidad(capaBase, 1, 1);
    fijarOpacidad(otra, encima ? t : 0, 2);

    const dominante = encima && t >= 0.5 ? encima : base;
    if (dominante !== activa) {
      if (activa) ESCENAS[activa]?.pause?.();
      activa = dominante;
      ESCENAS[activa]?.play?.();
    }
  }

  return { mostrar, capaCon };
}

/*
  Tramos de cada transición, como "borde superior de la sección / punto del
  viewport" (en %, igual que `start: "top 55%"` de ScrollTrigger). Cada giro
  termina ANTES de que el texto de su sección llegue al centro: el teléfono
  ya muestra la escena de la que habla el texto mientras se lee.
*/
const TRAMOS = {
  escritorio: { ini: 62, fin: 12, finCierre: 0, iniCierre: 84, chat: null, logro: { ini: -25, fin: -55 } },
  // En móvil el texto arranca 46vh debajo del borde de su sección (base.css).
  movil: { ini: 92, fin: 38, finCierre: 20, iniCierre: 92, chat: { ini: 60, fin: 14 }, logro: { ini: 8, fin: -22 } },
};

const FASES = [
  { seccion: "fase-chat", antes: "login", despues: "chat", invertido: false },
  { seccion: "fase-elementos", antes: "chat", despues: "elementos", invertido: true },
  { seccion: "fase-habitos", antes: "elementos", despues: "habitos", invertido: false },
  { seccion: "fase-llamada", antes: "logro", despues: "llamada", invertido: true },
  { seccion: "cta", antes: "llamada", despues: "dashboard", invertido: false, cierre: true },
];

const SECCIONES_ANCLA = ["hero", "fase-chat", "fase-elementos", "fase-habitos", "fase-llamada", "cta"];

/** Top del elemento en coordenadas del documento, sin contar `transform` (los reveals de texto mueven las secciones). */
function topDoc(el) {
  let y = 0;
  for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
  return y;
}

/** Alto (px) de los bloques de texto de una sección visibles entre `desde` y `hasta` (coordenadas del documento). */
function textoVisible(bloques, desde, hasta) {
  let px = 0;
  for (const b of bloques) px += Math.max(0, Math.min(b.fin, hasta) - Math.max(b.ini, desde));
  return px;
}

function bloquesDeTexto(id) {
  const sec = document.getElementById(id);
  if (!sec) return [];
  return [...sec.querySelectorAll("p, h1, h2, .cta-row")].map((el) => {
    const ini = topDoc(el);
    return { ini, fin: ini + el.offsetHeight };
  });
}

/** Primera posición de scroll en [desde, hasta] donde el texto de `nueva` se ve más que el de `previa`. */
function cruceDeLectura(previa, nueva, desde, hasta, zonaTexto, vh) {
  const a = bloquesDeTexto(previa);
  const b = bloquesDeTexto(nueva);
  for (let y = Math.max(0, desde); y <= hasta; y += 8) {
    if (textoVisible(b, y + zonaTexto, y + vh) > textoVisible(a, y + zonaTexto, y + vh)) return y;
  }
  return (desde + hasta) / 2;
}

const arco = (p) => Math.sin(p * Math.PI);
const limitar01 = (v) => Math.min(Math.max(v, 0), 1);
const suave = (v) => {
  const x = limitar01(v);
  return x * x * (3 - 2 * x);
};

function inicializarCoreografia(telefono, pantalla, sombraVuelo) {
  const capas = crearCapas(pantalla);
  const stageEl = telefono.closest(".stage");
  const mqReducido = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mqEscritorio = window.matchMedia("(min-width: 1024px)");

  let modo = null; // "escritorio" | "movil" | "reducido"
  let geo = null;
  let anchoMedido = 0;
  let ancla = null;
  let redimensionando = false;
  let interactuo = false;
  let virtual = window.scrollY;
  let enMarcha = false;
  let ultimo = null;

  const calcularModo = () => (mqReducido.matches ? "reducido" : mqEscritorio.matches ? "escritorio" : "movil");

  function medir() {
    modo = calcularModo();
    const vh = window.innerHeight;
    const tr = mqEscritorio.matches ? TRAMOS.escritorio : TRAMOS.movil;
    const pos = (id, pct) => {
      const el = document.getElementById(id);
      return el ? topDoc(el) - (pct / 100) * vh : 0;
    };
    const segmentos = [];
    for (const f of FASES) {
      const trFase = f.seccion === "fase-chat" && tr.chat ? tr.chat : tr;
      segmentos.push({
        tipo: "giro",
        ini: pos(f.seccion, f.cierre ? tr.iniCierre : trFase.ini),
        fin: pos(f.seccion, f.cierre ? tr.finCierre : trFase.fin),
        antes: f.antes,
        despues: f.despues,
        invertido: f.invertido,
        cierre: !!f.cierre,
      });
      if (f.despues === "habitos") {
        segmentos.push({
          tipo: "cruce",
          ini: pos(f.seccion, tr.logro.ini),
          fin: pos(f.seccion, tr.logro.fin),
          antes: "habitos",
          despues: "logro",
        });
      }
    }
    segmentos.forEach((s) => {
      s.fin = Math.max(s.fin, s.ini + 1);
      s.paso = (s.fin - s.ini) * PASO_MAX_GIRO;
    });
    // Sin giro, el frente se ve siempre: el fundido tiene que caer justo
    // donde el texto que se lee pasa de una sección a la otra.
    const zonaTexto = mqEscritorio.matches ? 0 : 0.44 * vh;
    FASES.forEach((f, i) => {
      const s = segmentos.find((x) => x.tipo === "giro" && x.despues === f.despues);
      const previa = i === 0 ? "hero" : FASES[i - 1].seccion;
      s.cruceTexto = cruceDeLectura(previa, f.seccion, s.ini - vh * 0.5, s.fin + vh * 0.5, zonaTexto, vh);
    });
    const iniPrimerGiro = segmentos[0].ini;
    let offsetCierre = 0;
    if (mqEscritorio.matches && stageEl) {
      const r = stageEl.getBoundingClientRect();
      offsetCierre = window.innerWidth / 2 - (r.left + r.width / 2);
    }
    geo = {
      hero: { ini: 0, fin: Math.max(120, iniPrimerGiro * 0.75) },
      segmentos,
      offsetCierre,
      secciones: SECCIONES_ANCLA.map((id) => {
        const el = document.getElementById(id);
        return { id, top: el ? topDoc(el) : 0, alto: el ? el.offsetHeight : 1 };
      }),
      max: Math.max(0, document.documentElement.scrollHeight - vh),
    };
    anchoMedido = window.innerWidth;
    ultimo = null;
  }

  /** Estado del teléfono en la posición `y` — función pura de la geometría medida. */
  function estadoEn(y) {
    const conMovimiento = modo !== "reducido";
    const lateral = modo === "escritorio";
    const e = { base: "login", encima: null, t: 0, rot: 0, x: 0, escala: 1, mascota: 1, enGiro: false, sombra: 0 };

    if (y < geo.hero.fin) {
      const p = limitar01(y / geo.hero.fin);
      // La mascota cubre la pantalla en p≈0.6; el cruce a Login va de 0.5 a 1.
      e.base = "splash";
      e.encima = "login";
      e.t = limitar01((p - 0.5) / 0.5);
      e.mascota = conMovimiento ? 1 + Math.min(p / 0.6, 1) * 5 : 1;
      return e;
    }

    let escena = "login";
    let xFinal = 0;
    for (const s of geo.segmentos) {
      const ini = conMovimiento || s.tipo !== "giro" ? s.ini : Math.min(s.ini, s.cruceTexto - 70);
      const fin = conMovimiento || s.tipo !== "giro" ? s.fin : Math.max(s.fin, s.cruceTexto + 10);
      if (y < ini) break;
      if (y <= fin) {
        const p = limitar01((y - s.ini) / (s.fin - s.ini));
        if (s.tipo === "cruce") {
          e.base = s.antes;
          e.encima = s.despues;
          e.t = p;
          e.x = xFinal;
          return e;
        }
        if (!conMovimiento) {
          // Sin giro: fundido corto que termina justo donde cambia el texto que se lee.
          e.base = s.antes;
          e.encima = s.despues;
          e.t = suave((y - s.cruceTexto) / 60 + 1);
          return e;
        }
        const a = arco(p);
        e.base = p * 360 < 180 ? s.antes : s.despues;
        e.rot = p * 360;
        e.enGiro = true;
        e.sombra = a;
        if (lateral) {
          // Arco lateral de ±160 px y escala 0.9 a mitad del vuelo (aprobados);
          // el cierre suma un corrimiento que en p=1 deja el teléfono al centro.
          e.x = (s.invertido ? -1 : 1) * a * 160 + (s.cierre ? geo.offsetCierre * p : 0);
          e.escala = 1 - a * 0.1;
        } else {
          e.escala = 1 - a * 0.06;
        }
        return e;
      }
      escena = s.despues;
      xFinal = s.cierre && lateral ? geo.offsetCierre : 0;
    }
    e.base = escena;
    e.x = xFinal;
    return e;
  }

  function aplicar(e) {
    const clave = `${e.base}|${e.encima}|${e.t.toFixed(3)}|${e.rot.toFixed(2)}|${e.x.toFixed(1)}|${e.escala.toFixed(4)}|${e.mascota.toFixed(3)}`;
    if (clave === ultimo) return;
    ultimo = clave;

    capas.mostrar(e.base, e.encima, e.t);
    fijarRotacion(telefono, e.rot);
    telefono.style.setProperty("--vuelo-x", `${e.x}px`);
    telefono.style.setProperty("--vuelo-escala", `${e.escala}`);
    telefono.style.willChange = e.enGiro ? "transform" : "auto";
    if (sombraVuelo) {
      sombraVuelo.style.opacity = `${e.enGiro ? 0.15 + e.sombra * 0.5 : 0}`;
      sombraVuelo.style.transform = `scaleX(${1 + e.sombra * 0.6})`;
    }
    const mascota = capas.capaCon("splash")?.querySelector(".ps-dot-escala");
    if (mascota) mascota.style.transform = e.mascota === 1 ? "" : `scale(${e.mascota})`;
    telefono.dispatchEvent(new CustomEvent("yaruki:estado", { detail: e }));
  }

  /**
   * Avanza de `desde` hacia `hasta` sin cruzar más de `paso` dentro de un
   * giro en un solo cuadro (los tramos quietos y los fundidos se cruzan de
   * una). Los segmentos se recorren en el orden del movimiento.
   */
  function limitarAvance(desde, hasta) {
    if (modo === "reducido" || hasta === desde) return hasta;
    const sube = hasta < desde;
    const lista = sube ? [...geo.segmentos].reverse() : geo.segmentos;
    for (const s of lista) {
      if (s.tipo !== "giro") continue;
      if (!sube) {
        if (s.fin <= desde) continue;
        if (s.ini >= hasta) break;
        const entrada = Math.max(desde, s.ini);
        if (hasta > entrada + s.paso) return entrada + s.paso;
      } else {
        if (s.ini >= desde) continue;
        if (s.fin <= hasta) break;
        const entrada = Math.min(desde, s.fin);
        if (hasta < entrada - s.paso) return entrada - s.paso;
      }
    }
    return hasta;
  }

  const objetivo = () => Math.min(Math.max(window.scrollY, 0), geo.max || Infinity);

  function tick(_t, deltaMs) {
    const meta = objetivo();
    const dif = meta - virtual;
    if (!interactuo || Math.abs(dif) < 0.5) {
      // Antes de la primera interacción (carga, restauración del scroll del
      // navegador) se salta directo: no hay ningún "cambio" que ver todavía.
      virtual = meta;
      aplicar(estadoEn(virtual));
      dormir();
      return;
    }
    const k = 1 - Math.exp(-Math.min(deltaMs, 64) / 1000 / TAU_SUAVIZADO);
    // Un piso de velocidad para no arrastrar la cola del suavizado.
    let deseado = virtual + dif * k;
    if (Math.abs(deseado - virtual) < 0.6) deseado = virtual + Math.sign(dif) * Math.min(0.6, Math.abs(dif));
    virtual = limitarAvance(virtual, deseado);
    aplicar(estadoEn(virtual));
  }

  function despertar() {
    if (enMarcha) return;
    enMarcha = true;
    gsap.ticker.add(tick);
  }

  function dormir() {
    if (!enMarcha) return;
    enMarcha = false;
    gsap.ticker.remove(tick);
  }

  function seccionLeida(y) {
    const linea = y + window.innerHeight * 0.5;
    let actual = geo.secciones[0];
    for (const s of geo.secciones) if (s.top <= linea) actual = s;
    return actual;
  }

  function guardarAncla() {
    if (redimensionando || window.innerWidth !== anchoMedido) return;
    const s = seccionLeida(window.scrollY);
    ancla = { id: s.id, f: (window.scrollY + window.innerHeight * 0.5 - s.top) / Math.max(s.alto, 1) };
  }

  /** Re-mide; si cambió la rama (cruce de 1024 px o de "reducir movimiento"), vuelve a la misma sección. */
  function reacomodar() {
    const modoAntes = modo;
    const anchoAntes = anchoMedido;
    const anclaAntes = ancla;
    medir();
    if (anclaAntes && (modo !== modoAntes || window.innerWidth !== anchoAntes)) {
      const s = geo.secciones.find((x) => x.id === anclaAntes.id);
      if (s) {
        const y = s.top + anclaAntes.f * s.alto - window.innerHeight * 0.5;
        window.scrollTo({ top: Math.max(0, Math.min(y, geo.max)), behavior: "instant" });
      }
    }
    virtual = objetivo();
    aplicar(estadoEn(virtual));
    redimensionando = false;
    guardarAncla();
  }

  let rafResize = 0;
  function alRedimensionar() {
    redimensionando = true;
    cancelAnimationFrame(rafResize);
    rafResize = requestAnimationFrame(reacomodar);
  }

  medir();
  virtual = objetivo();
  aplicar(estadoEn(virtual));
  guardarAncla();

  const marcarInteraccion = () => {
    interactuo = true;
  };
  for (const ev of ["wheel", "touchstart", "keydown", "pointerdown"]) {
    window.addEventListener(ev, marcarInteraccion, { passive: true, capture: true });
  }
  window.addEventListener(
    "scroll",
    () => {
      guardarAncla();
      despertar();
    },
    { passive: true }
  );
  window.addEventListener("resize", alRedimensionar);
  mqReducido.addEventListener?.("change", alRedimensionar);
  // Cambios de alto del documento sin resize (fuentes, reveals): re-medir.
  if ("ResizeObserver" in window) {
    let primero = true;
    new ResizeObserver(() => {
      if (primero) {
        primero = false;
        return;
      }
      if (!redimensionando) {
        medir();
        aplicar(estadoEn(virtual));
      }
    }).observe(document.body);
  }

  return {
    /** Sección (id) cuyo texto se lee ahora, para la navegación con puntos. */
    seccionLeida: () => seccionLeida(window.scrollY).id,
    /** Posición de scroll que deja una sección "en lectura" (la usa la navegación). */
    destinoDe(id) {
      const s = geo.secciones.find((x) => x.id === id);
      return s ? Math.min(s.top, geo.max) : 0;
    },
    get geometria() {
      return geo;
    },
  };
}
