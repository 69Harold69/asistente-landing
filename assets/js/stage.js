import { ESCENAS } from "./scenes/registro.js";
import { barraDeEstado } from "./icons.js";

/**
 * Escenario del teléfono 3D — orquestador real (plan, 4.1/4.2/5.3/5.4).
 *
 * Dos modos, elegidos una sola vez al cargar:
 * 1. **Inspección** (`?escena=&cara=`, sin UI visible — ver README): monta
 *    una escena fija y una cara fija, sin GSAP/ScrollTrigger. Pensado para
 *    QA/capturas, no para visitantes reales.
 * 2. **Coreografía real** (todo lo demás): `gsap.matchMedia()` con 3
 *    ramas —
 *    - Escritorio + sin pedir menos movimiento: el teléfono "vuela" de
 *      lado a lado girando 360° en Y entre cada fase, ligado al scroll
 *      (`scrub`), con el cambio de escena pasando cerca de los 180° (de
 *      espaldas, invisible).
 *    - Móvil (<1024px) + sin pedir menos movimiento: el mismo giro 360°,
 *      pero EN EL LUGAR — sin volar de lado a lado (plan 5.4) — con el
 *      teléfono sticky arriba (ver base.css/phone.css) y el texto pasando
 *      por debajo.
 *    - `prefers-reduced-motion: reduce` (cualquier ancho): crossfade liso,
 *      sin giros ni vuelo.
 *    En las 3 el hero (Splash → Login) es un caso aparte: no es una fase
 *    con "antes/después" que vuela, es la primera escena de todas, con su
 *    propio cruce ligado al scroll y reversible (etapa 3).
 *
 * Sólo se anima `transform` y `opacity` en todo este archivo (regla
 * explícita del encargo) — la "sombra que se alarga" del vuelo es una
 * elipse aparte (`#sombra-vuelo`) escalada/atenuada con esas mismas dos
 * propiedades, nunca el `box-shadow` estático del teléfono.
 */

const ROTACION_POR_CARA = { frente: 0, canto: 80, espalda: 180 };
const ESCENA_POR_DEFECTO = "splash";
const CARA_POR_DEFECTO = "frente";

/** Capas del canto (ver `.phone-canto` en phone.css). ~15 px de grosor / 12 capas ≈ 1.2 px entre capas. */
const CAPAS_CANTO = 12;
/** Debajo de este |sen θ| (≈1.5°) el canto mide menos de medio pixel: se oculta. */
const UMBRAL_CANTO = 0.025;

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
 * la espalda (-D/2) y el frente (+D/2), sin tocar ninguno de los dos planos
 * (medio paso de margen en cada extremo, para que no peleen en profundidad
 * con las caras). El tono sigue un perfil de seno: más claro al centro,
 * más oscuro hacia las caras — se lee como un marco con bordes redondeados.
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
  canto.appendChild(fragmento);
}

/** Aplica el ángulo y muestra el canto sólo cuando aporta (lejos de 0° y 180°). */
function fijarRotacion(telefono, grados) {
  telefono.style.setProperty("--rotacion-y", `${grados}deg`);
  const visible = Math.abs(Math.sin((grados * Math.PI) / 180)) > UMBRAL_CANTO;
  if (visible !== (telefono.dataset.canto === "visible")) {
    telefono.dataset.canto = visible ? "visible" : "oculto";
  }
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
  if (!telefono || !pantalla) return;

  construirCanto(telefono);

  const { escena, cara, angulo } = leerParametrosDeInspeccion();
  if (escena || cara || angulo !== null) {
    inicializarModoInspeccion(telefono, pantalla, escena, cara, angulo);
    return;
  }

  if (!window.gsap || !window.ScrollTrigger) {
    // No debería pasar (vendorizados locales, cargados antes que este
    // módulo) — si por lo que sea faltan, mejor mostrar el cierre real que
    // dejar la pantalla vacía.
    montarEnCapa(pantalla, "dashboard");
    return;
  }

  inicializarCoreografia(telefono, pantalla, sombraVuelo);
}

function inicializarModoInspeccion(telefono, pantalla, escena, cara, angulo) {
  montarEnCapa(pantalla, escena ?? ESCENA_POR_DEFECTO);
  const idCara = cara ?? CARA_POR_DEFECTO;
  fijarRotacion(telefono, angulo ?? ROTACION_POR_CARA[idCara]);
  telefono.dataset.cara = angulo !== null ? `${angulo}` : idCara;
}

/**
 * Administrador de 2 capas físicas (`.capa-escena`) dentro de la pantalla.
 * Dos formas de usarlas:
 * - `irA(id)`: swap discreto — monta en la capa inactiva, cruza opacidad
 *   (animada o de golpe) y INTERCAMBIA cuál es "actual"/"siguiente". La usan
 *   los vuelos entre fases y la rama sin movimiento.
 * - `prepararCruce`/`fijarCruce`: cruce continuo ligado a un progreso 0..1
 *   para un tramo acotado (hero, sub-cruce hábitos→logro) — NO intercambia
 *   roles, así que quien lo usa no debe llamar `irA` hasta que su propio
 *   tramo haya terminado de verdad.
 */
function crearAdministradorDeCapas(pantalla, idInicial) {
  const capaA = document.createElement("div");
  const capaB = document.createElement("div");
  capaA.className = "capa-escena";
  capaB.className = "capa-escena";
  capaB.style.opacity = "0";
  pantalla.append(capaA, capaB);

  const estado = { actual: capaA, siguiente: capaB, idActual: idInicial };
  montarEnCapa(capaA, idInicial);
  ESCENAS[idInicial]?.play?.();

  function irA(idNuevo, { animar = false, duracion = 0.5 } = {}) {
    if (idNuevo === estado.idActual) return;
    const idViejo = estado.idActual;
    montarEnCapa(estado.siguiente, idNuevo);
    if (animar) {
      gsap.to(estado.actual, { opacity: 0, duration: duracion, overwrite: true });
      gsap.to(estado.siguiente, { opacity: 1, duration: duracion, overwrite: true });
    } else {
      gsap.set(estado.actual, { opacity: 0 });
      gsap.set(estado.siguiente, { opacity: 1 });
    }
    const tmp = estado.actual;
    estado.actual = estado.siguiente;
    estado.siguiente = tmp;
    estado.idActual = idNuevo;
    // Ciclo de vida de los loops propios de cada escena (plan, parte B: "los
    // loops arrancan y pausan con onEnter/onLeave") — `irA` es el único
    // punto por el que pasa TODO cambio de escena visible (las 5 fases de
    // `FASES` y la rama sin movimiento), así que alcanza con engancharlo acá
    // una sola vez en vez de repetir el cableo en cada `ScrollTrigger`.
    // `pause`/`play` son opcionales (la mayoría de las escenas no tienen
    // loop propio — Splash/Login/Elementos-estático/etc.) de ahí el `?.`.
    ESCENAS[idViejo]?.pause?.();
    ESCENAS[idNuevo]?.play?.();
  }

  function prepararCruce(idDestino) {
    montarEnCapa(estado.siguiente, idDestino);
  }

  function fijarCruce(p) {
    gsap.set(estado.actual, { opacity: 1 - p });
    gsap.set(estado.siguiente, { opacity: p });
  }

  return { estado, irA, prepararCruce, fijarCruce };
}

/** `sin(θ)` normalizado 0→1→0 a lo largo de un progreso 0..1 — el "arco" del vuelo. */
function arco(p) {
  return Math.sin(p * Math.PI);
}

/*
  Tramos de scroll de cada vuelo, como "borde de la sección / punto del
  viewport" de ScrollTrigger. Cada sección narrativa mide al menos una
  pantalla (base.css), así que un tramo de medio viewport nunca se solapa con
  el de la sección vecina.

  El vuelo termina ANTES de que el texto de su sección llegue al centro de la
  pantalla: el teléfono ya muestra la escena de la que habla el texto
  mientras se lee. (Antes el vuelo arrancaba con la sección arriba del todo,
  "top top", y el teléfono iba una sección atrasado respecto del texto.)
*/
const TRAMOS = {
  escritorio: { inicio: "top 55%", fin: "top 5%", finCierre: "top top" },
  // En móvil el texto arranca 46vh debajo del borde de su sección (base.css).
  movil: { inicio: "top 85%", fin: "top 25%", finCierre: "top 20%" },
};
/*
  En móvil el teléfono vive EN FLUJO entre el hero y el chat, y se pega
  arriba recién cuando la sección del chat llega a ~44% del viewport (justo
  debajo de la franja). El primer vuelo arranca ahí, nunca con el teléfono
  todavía a medio entrar en pantalla.
*/
const TRAMO_CHAT_MOVIL = { inicio: "top 44%", fin: "top top" };
/*
  Sub-cruce hábitos → logro (la sección de hábitos mide 160vh): primero un
  tramo con el heatmap quieto mientras se lee el primer párrafo, después el
  cruce a logro con el segundo párrafo ("Más adelante… Próximamente") en
  pantalla. En móvil el texto arranca 46vh más abajo, por eso es otro tramo.
*/
const TRAMOS_LOGRO = {
  escritorio: { inicio: "top -25%", fin: "top -55%" },
  movil: { inicio: "top 8%", fin: "top -22%" },
};

/** Posición de scroll (px) en la que `el.top` toca `pct` del viewport. */
function scrollDonde(el, pct) {
  return el.getBoundingClientRect().top + window.scrollY - (pct / 100) * window.innerHeight;
}

function inicializarCoreografia(telefono, pantalla, sombraVuelo) {
  gsap.registerPlugin(ScrollTrigger);
  const capas = crearAdministradorDeCapas(pantalla, "splash");
  const stageEl = telefono.closest(".stage");

  const secciones = {
    hero: document.getElementById("hero"),
    chat: document.getElementById("fase-chat"),
    elementos: document.getElementById("fase-elementos"),
    habitos: document.getElementById("fase-habitos"),
    llamada: document.getElementById("fase-llamada"),
    cta: document.getElementById("cta"),
  };

  // Cadena de fases: cada una sabe de qué escena viene y a cuál va. El
  // flag `invertido` alterna el lado hacia el que "vuela" el teléfono —
  // mismo criterio que `.seccion--par` (columnas alternadas, plan 4.2).
  const FASES = [
    { trigger: secciones.chat, antes: "login", despues: "chat", invertido: false },
    { trigger: secciones.elementos, antes: "chat", despues: "elementos", invertido: true },
    { trigger: secciones.habitos, antes: "elementos", despues: "habitos", invertido: false },
    { trigger: secciones.llamada, antes: "logro", despues: "llamada", invertido: true },
    { trigger: secciones.cta, antes: "llamada", despues: "dashboard", invertido: false, cierre: true },
  ];

  /*
    Cuánto hay que correr el teléfono para que el Dashboard aterrice en el
    CENTRO HORIZONTAL DE LA PÁGINA y no sólo de su columna (plan 4.6). Se
    recalcula en cada refresh de ScrollTrigger (resize).
  */
  let offsetCentradoCierre = 0;
  function medirCentradoCierre() {
    if (!stageEl || window.innerWidth < 1024) {
      offsetCentradoCierre = 0;
      return;
    }
    const r = stageEl.getBoundingClientRect();
    offsetCentradoCierre = window.innerWidth / 2 - (r.left + r.width / 2);
  }
  medirCentradoCierre();
  ScrollTrigger.addEventListener("refreshInit", medirCentradoCierre);

  /**
   * Un vuelo entre fases — compartido por escritorio (con desplazamiento
   * lateral) y móvil (en el lugar): gira 360°, cambia de escena cerca de
   * los 180° (de espaldas) y, si `invertido`, alterna el lado del arco.
   * `fijarRotacion` muestra/oculta las capas del canto según el ángulo; la
   * sombra de vuelo se escala acá mismo.
   */
  function registrarVuelo({ trigger, antes, despues, invertido, cierre }, { conDesplazamiento, tramo }) {
    if (!trigger) return null;
    let lado = false;
    const propio = tramoDe(trigger, tramo);
    return ScrollTrigger.create({
      trigger,
      start: propio.inicio,
      end: cierre ? tramo.finCierre : propio.fin,
      scrub: 0.4,
      onUpdate(self) {
        const p = self.progress;
        const a = arco(p);
        fijarRotacion(telefono, p * 360);
        // `will-change` sólo mientras el teléfono está en pleno vuelo: fuera
        // de eso el navegador puede soltar la capa promovida.
        telefono.style.willChange = p > 0 && p < 1 ? "transform" : "auto";
        if (conDesplazamiento) {
          // Arco lateral de ±160px y escala 0.9 a mitad del vuelo (aprobados);
          // el cierre suma un corrimiento que en p=1 deja el teléfono en el
          // centro de la página.
          const base = (invertido ? -1 : 1) * a * 160;
          const corrimiento = cierre ? offsetCentradoCierre * p : 0;
          telefono.style.setProperty("--vuelo-x", `${base + corrimiento}px`);
          telefono.style.setProperty("--vuelo-escala", `${1 - a * 0.1}`);
        } else {
          // Móvil: giro 360° EN EL LUGAR (plan 5.4).
          telefono.style.setProperty("--vuelo-x", "0px");
          telefono.style.setProperty("--vuelo-escala", `${1 - a * 0.06}`);
        }
        if (sombraVuelo) {
          sombraVuelo.style.opacity = `${0.15 + a * 0.5}`;
          sombraVuelo.style.transform = `scaleX(${1 + a * 0.6})`;
        }
        const pasoAlDespues = p >= 0.5;
        if (pasoAlDespues !== lado) {
          lado = pasoAlDespues;
          capas.irA(lado ? despues : antes, { animar: false });
          // El sub-cruce hábitos→logro necesita su destino montado en la
          // capa inactiva justo cuando el vuelo termina de mostrar "habitos".
          if (lado && despues === "habitos") {
            capas.prepararCruce("logro");
          }
        }
      },
    });
  }

  /*
    Cierre: el Dashboard aterriza al centro (fin del último vuelo, a 0°) y
    se queda quieto mientras se lee el CTA; cuando `position:sticky` se
    suelta, el teléfono sube junto con la página y entra el footer. Antes se
    desvanecía justo antes de soltarse (para no dejar ver un canto flotando
    a medio giro), y eso dejaba casi una pantalla en blanco; al aterrizar
    de frente ya no hay canto que esconder.
  */

  /**
   * Sub-cruce hábitos → logro (plan 4.4, punto 3): cruce continuo de
   * opacidad, y el loop de cada escena arranca/pausa al cruzar la mitad, para
   * que el confeti no dispare antes de verse ni el switch siga de fondo.
   */
  function registrarSubCruceHabitosLogro(tramoLogro) {
    if (!secciones.habitos) return null;
    let enLogro = false;
    return ScrollTrigger.create({
      trigger: secciones.habitos,
      start: tramoLogro.inicio,
      end: tramoLogro.fin,
      scrub: 0.3,
      onUpdate(self) {
        capas.fijarCruce(self.progress);
        const pasoALogro = self.progress >= 0.5;
        if (pasoALogro !== enLogro) {
          enLogro = pasoALogro;
          if (pasoALogro) {
            ESCENAS.habitos?.pause?.();
            ESCENAS.logro?.play?.();
          } else {
            ESCENAS.logro?.pause?.();
            ESCENAS.habitos?.play?.();
          }
        }
      },
    });
  }

  /*
    Hero: Splash respira → al scrollear, la mascota escala hasta cubrir la
    pantalla → cruza a Login (etapa 3), reversible. Arranca en el scroll 0 y
    termina un poco antes de que empiece el primer vuelo (login → chat), para
    que el Login alcance a verse quieto. Cruce continuo
    (prepararCruce/fijarCruce): `capas.estado` no cambia de roles durante el
    hero, así que el primer vuelo encuentra el escenario como lo dejó.
  */
  /** Tramo de una fase: el general de la rama, salvo el chat en móvil. */
  function tramoDe(trigger, tramo) {
    return trigger === secciones.chat && tramo === TRAMOS.movil ? TRAMO_CHAT_MOVIL : tramo;
  }

  function registrarHero(tramo) {
    if (!secciones.hero || !secciones.chat) return [];
    const puntoMascota = capas.estado.actual.querySelector(".ps-dot");
    if (puntoMascota) {
      // La escala la controla el scroll: sin la animación CSS de "respirar"
      // peleando por `transform` en el mismo elemento.
      puntoMascota.style.animation = "none";
    }
    capas.prepararCruce("login");
    const pctInicioChat = parseFloat(tramoDe(secciones.chat, tramo).inicio.split(" ")[1]);
    const st = ScrollTrigger.create({
      start: 0,
      end: () => Math.max(120, scrollDonde(secciones.chat, pctInicioChat) * 0.75),
      scrub: 0.3,
      onUpdate(self) {
        const p = self.progress;
        // La mascota cubre la pantalla en p≈0.6; el cruce a Login va de 0.5 a 1.
        const pEscala = Math.min(p / 0.6, 1);
        const pCruce = Math.max((p - 0.5) / 0.5, 0);
        if (puntoMascota) {
          puntoMascota.style.transform = `scale(${1 + pEscala * 5})`;
        }
        capas.fijarCruce(pCruce);
      },
    });
    return [st];
  }

  function registrarRecorrido({ conDesplazamiento, tramo, tramoLogro }) {
    const triggers = [...registrarHero(tramo)];
    FASES.forEach((fase) => triggers.push(registrarVuelo(fase, { conDesplazamiento, tramo })));
    triggers.push(registrarSubCruceHabitosLogro(tramoLogro));
    return () => triggers.filter(Boolean).forEach((t) => t.kill());
  }

  const mm = gsap.matchMedia();

  // ---- Escritorio + con movimiento: vuelo lateral con giro 360°.
  mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () =>
    registrarRecorrido({ conDesplazamiento: true, tramo: TRAMOS.escritorio, tramoLogro: TRAMOS_LOGRO.escritorio })
  );

  // ---- Móvil + con movimiento: el mismo giro 360°, en el lugar (plan 5.4).
  mm.add("(max-width: 1023px) and (prefers-reduced-motion: no-preference)", () =>
    registrarRecorrido({ conDesplazamiento: false, tramo: TRAMOS.movil, tramoLogro: TRAMOS_LOGRO.movil })
  );

  // ---- Quien pidió menos movimiento (cualquier ancho): crossfades discretos,
  // sin giros ni vuelo. Cada fase cambia cuando su sección llega a la mitad
  // del viewport; como cada sección mide al menos una pantalla, el orden de
  // disparo entre fases vecinas está garantizado.
  mm.add("(prefers-reduced-motion: reduce)", () => {
    const triggers = [];
    if (secciones.hero) {
      triggers.push(
        ScrollTrigger.create({
          trigger: secciones.hero,
          start: "bottom 80%",
          onEnter: () => capas.irA("login", { animar: true }),
          onLeaveBack: () => capas.irA("splash", { animar: true }),
        })
      );
    }
    FASES.forEach(({ trigger, antes, despues }) => {
      if (!trigger) return;
      triggers.push(
        ScrollTrigger.create({
          trigger,
          start: "top 50%",
          onEnter: () => capas.irA(despues, { animar: true }),
          onLeaveBack: () => capas.irA(antes, { animar: true }),
        })
      );
    });
    if (secciones.habitos) {
      triggers.push(
        ScrollTrigger.create({
          trigger: secciones.habitos,
          start: "top -15%",
          onEnter: () => capas.irA("logro", { animar: true }),
          onLeaveBack: () => capas.irA("habitos", { animar: true }),
        })
      );
    }
    return () => triggers.forEach((t) => t.kill());
  });
}
