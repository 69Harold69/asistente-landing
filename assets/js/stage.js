import { ESCENAS } from "./scenes/registro.js";

/**
 * Escenario del teléfono 3D — orquestador real (plan, 4.1/4.2/5.3/5.4).
 *
 * Dos modos, elegidos una sola vez al cargar:
 * 1. **Inspección** (`?escena=&cara=`, sin UI visible — ver README): monta
 *    una escena fija y una cara fija, sin GSAP/ScrollTrigger. Pensado para
 *    QA/capturas, no para visitantes reales.
 * 2. **Coreografía real** (todo lo demás): `gsap.matchMedia()` con dos
 *    ramas —
 *    - Escritorio + sin pedir menos movimiento: el teléfono "vuela" de
 *      lado a lado girando 360° en Y entre cada fase, ligado al scroll
 *      (`scrub`), con el cambio de escena pasando cerca de los 180° (de
 *      espaldas, invisible).
 *    - Móvil o `prefers-reduced-motion: reduce`: crossfade liso, sin giros
 *      ni vuelo.
 *    En los dos casos el hero (Splash → Login) es un caso aparte: no es
 *    una fase con "antes/después" que vuela, es la primera escena de
 *    todas, con su propio cruce ligado al scroll y reversible (etapa 3).
 *
 * Sólo se anima `transform` y `opacity` en todo este archivo (regla
 * explícita del encargo) — la "sombra que se alarga" del vuelo es una
 * elipse aparte (`#sombra-vuelo`) escalada/atenuada con esas mismas dos
 * propiedades, nunca el `box-shadow` estático del teléfono.
 */

const ROTACION_POR_CARA = { frente: 0, canto: 80, espalda: 180 };
const ESCENA_POR_DEFECTO = "splash";
const CARA_POR_DEFECTO = "frente";

function leerParametrosDeInspeccion() {
  const params = new URLSearchParams(window.location.search);
  const escena = params.get("escena");
  const cara = params.get("cara");
  return {
    escena: escena && ESCENAS[escena] ? escena : null,
    cara: cara && cara in ROTACION_POR_CARA ? cara : null,
  };
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
  aplicarBarrasDeProgreso(capa);
}

export function inicializarEscenario() {
  const telefono = document.getElementById("telefono");
  const pantalla = document.getElementById("pantalla-telefono");
  const sombraVuelo = document.getElementById("sombra-vuelo");
  if (!telefono || !pantalla) return;

  const { escena, cara } = leerParametrosDeInspeccion();
  if (escena || cara) {
    inicializarModoInspeccion(telefono, pantalla, escena, cara);
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

function inicializarModoInspeccion(telefono, pantalla, escena, cara) {
  montarEnCapa(pantalla, escena ?? ESCENA_POR_DEFECTO);
  const idCara = cara ?? CARA_POR_DEFECTO;
  telefono.style.setProperty("--rotacion-y", `${ROTACION_POR_CARA[idCara]}deg`);
  telefono.dataset.cara = idCara;
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

  function irA(idNuevo, { animar = false, duracion = 0.5 } = {}) {
    if (idNuevo === estado.idActual) return;
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

function inicializarCoreografia(telefono, pantalla, sombraVuelo) {
  gsap.registerPlugin(ScrollTrigger);
  const capas = crearAdministradorDeCapas(pantalla, "splash");

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
  //
  // Cada vuelo usa el alto PROPIO de su sección (`start:"top top", end:
  // "bottom top"`) en vez de un tramo de 1 viewport (`"top bottom"→"top
  // top"`): con secciones más bajas que el viewport (todas lo son acá),
  // un tramo de 1 viewport por vuelo se solapaba con el vuelo de la
  // siguiente sección — los dos peleando por `--rotacion-y` a la vez. Atado
  // al alto real de la sección, nunca se solapa con el vecino (son
  // contiguos, no superpuestos). Hábitos es la única excepción: reparte su
  // propio alto en 2 mitades (vuelo a "habitos" + sub-cruce a "logro"), ver
  // más abajo.
  const FASES = [
    { trigger: secciones.chat, antes: "login", despues: "chat", invertido: false, end: "bottom top" },
    {
      trigger: secciones.elementos,
      antes: "chat",
      despues: "elementos",
      invertido: true,
      end: "bottom top",
    },
    {
      trigger: secciones.habitos,
      antes: "elementos",
      despues: "habitos",
      invertido: false,
      end: "center top",
    },
    { trigger: secciones.llamada, antes: "logro", despues: "llamada", invertido: true, end: "bottom top" },
    {
      trigger: secciones.cta,
      antes: "llamada",
      despues: "dashboard",
      invertido: false,
      end: "bottom top",
    },
  ];

  const mm = gsap.matchMedia();

  // ---- Rama A: escritorio + con movimiento ok -----------------------------
  mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
    const triggers = [];

    // Hero — Splash respira → al scrollear, la mascota escala hasta cubrir
    // la pantalla del teléfono → cruza a Login (etapa 3, 4.1). Reversible:
    // `scrub` sigue el progreso real del scroll en los 2 sentidos. Cruce
    // CONTINUO (prepararCruce/fijarCruce): `capas.estado` no cambia de
    // roles durante todo el hero, así que el primer vuelo (login→chat, más
    // abajo) encuentra el escenario exactamente como lo dejó.
    if (secciones.hero) {
      const puntoMascota = capas.estado.actual.querySelector(".ps-dot");
      if (puntoMascota) {
        // Esta instancia puntual deja de "respirar" por CSS: la escala la
        // controla el scroll acá, y las 2 animaciones peleando por
        // `transform` en el mismo elemento parpadean.
        puntoMascota.style.animation = "none";
      }
      capas.prepararCruce("login");
      const st = ScrollTrigger.create({
        trigger: secciones.hero,
        start: "top top",
        end: "bottom top",
        scrub: 0.3,
        onUpdate(self) {
          const p = self.progress;
          // La mascota cubre la pantalla bastante antes del final del
          // tramo (p≈0.6) para que el cruce a Login no quede apretado
          // contra el borde de la sección.
          const pEscala = Math.min(p / 0.6, 1);
          const pCruce = Math.max((p - 0.5) / 0.5, 0);
          if (puntoMascota) {
            puntoMascota.style.transform = `scale(${1 + pEscala * 5})`;
          }
          capas.fijarCruce(pCruce);
        },
      });
      triggers.push(st);
    }

    FASES.forEach(({ trigger, antes, despues, invertido, end }) => {
      if (!trigger) return;
      let lado = false; // false = mostrando "antes", true = mostrando "después"
      const st = ScrollTrigger.create({
        trigger,
        start: "top top",
        end,
        scrub: 0.4,
        onUpdate(self) {
          const p = self.progress;
          const a = arco(p);
          telefono.style.setProperty("--rotacion-y", `${p * 360}deg`);
          telefono.style.setProperty("--vuelo-x", `${(invertido ? -1 : 1) * a * 160}px`);
          telefono.style.setProperty("--vuelo-escala", `${1 - a * 0.1}`);
          if (sombraVuelo) {
            sombraVuelo.style.opacity = `${0.15 + a * 0.5}`;
            sombraVuelo.style.transform = `scaleX(${1 + a * 0.6})`;
          }
          const pasoAlDespues = p >= 0.5;
          if (pasoAlDespues !== lado) {
            lado = pasoAlDespues;
            capas.irA(lado ? despues : antes, { animar: false });
            // El sub-cruce hábitos→logro (más abajo) necesita su destino
            // montado en la capa inactiva justo cuando el vuelo termina de
            // mostrar "habitos" — nunca antes (pisaría otra escena todavía
            // en pantalla) ni más tarde (el cruce arrancaría en blanco).
            if (lado && despues === "habitos") {
              capas.prepararCruce("logro");
            }
          }
        },
      });
      triggers.push(st);
    });

    // Sub-cruce hábitos → logro (plan 4.4, punto 3): el logro sigue siendo
    // parte de la fase de hábitos, no una sección propia — pasa DE FRENTE
    // (sin girar) en el resto del recorrido de esa sección, después de que
    // el vuelo de arriba ya mostró "habitos".
    if (secciones.habitos) {
      const st = ScrollTrigger.create({
        trigger: secciones.habitos,
        start: "center top",
        end: "bottom top",
        scrub: 0.3,
        onUpdate(self) {
          capas.fijarCruce(self.progress);
        },
      });
      triggers.push(st);
    }

    return () => triggers.forEach((t) => t.kill());
  });

  // ---- Rama B: móvil, o quien pidió menos movimiento -----------------------
  mm.add("(max-width: 1023px), (prefers-reduced-motion: reduce)", () => {
    const triggers = [];

    if (secciones.hero) {
      // `"bottom center"` y no `"center center"`: con un viewport alto (o
      // un hero corto) el CENTRO del hero puede estar ya a la altura del
      // centro del viewport al cargar con scroll 0 — el trigger disparaba
      // `onEnter` de entrada y Login tapaba el Splash antes de que la
      // persona scrolleara ni un pixel. El BORDE DE ABAJO del hero sólo
      // llega ahí después de scrollear de verdad.
      const st = ScrollTrigger.create({
        trigger: secciones.hero,
        start: "bottom center",
        onEnter: () => capas.irA("login", { animar: true }),
        onLeaveBack: () => capas.irA("splash", { animar: true }),
      });
      triggers.push(st);
    }

    FASES.forEach(({ trigger, antes, despues }) => {
      if (!trigger) return;
      const st = ScrollTrigger.create({
        trigger,
        start: "top center",
        onEnter: () => capas.irA(despues, { animar: true }),
        onLeaveBack: () => capas.irA(antes, { animar: true }),
      });
      triggers.push(st);
    });

    if (secciones.habitos) {
      const st = ScrollTrigger.create({
        trigger: secciones.habitos,
        start: "bottom center",
        onEnter: () => capas.irA("logro", { animar: true }),
        onLeaveBack: () => capas.irA("habitos", { animar: true }),
      });
      triggers.push(st);
    }

    return () => triggers.forEach((t) => t.kill());
  });
}
