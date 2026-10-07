import { ESCENAS } from "./scenes/registro.js";

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

function inicializarCoreografia(telefono, pantalla, sombraVuelo) {
  gsap.registerPlugin(ScrollTrigger);
  const capas = crearAdministradorDeCapas(pantalla, "splash");
  const escenario3d = telefono.closest(".escenario-3d");

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
  // contiguos, no superpuestos). Hábitos y el cierre (`cta`) son la
  // excepción: reparten su propio alto en 2 mitades — hábitos para el
  // sub-cruce a "logro" (plan 4.4), `cta` para que el Dashboard ATERRICE y
  // se quede quieto el resto de la sección en vez de seguir girando hasta
  // que el sticky se suelta (bug real, punto de control 2.5, error 2).
  const stageEl = telefono.closest(".stage");

  /*
    El cierre (`#cta`) no reparte su alto a la mitad como hábitos — usa sólo
    el primer 30% para el vuelo (el resto de la sección es a propósito más
    alta de lo que ocupa su propio texto, `min-height` en base.css, para
    darle a `position:sticky` el margen que necesita antes de soltarse
    solo — ver `registrarDesvanecidoDeCierre`). 30% de una sección bien alta
    todavía es un tramo de vuelo cómodo.
  */
  const FIN_VUELO_CIERRE = secciones.cta ? `+=${Math.round(secciones.cta.getBoundingClientRect().height * 0.22)}` : "bottom top";

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
      end: FIN_VUELO_CIERRE,
      centrarAlFinal: true,
    },
  ];

  /*
    Cuánto hay que correr el teléfono a la izquierda para que termine en el
    CENTRO HORIZONTAL DE LA PÁGINA, no sólo centrado dentro de SU columna
    (la columna 2, que vive del lado derecho — plan 4.2: el Dashboard tiene
    que "aterrizar al centro", no al centro de su propia columna). Medido
    una sola vez (la posición horizontal de `.stage` no cambia con el
    scroll, sólo la vertical vía `sticky`) — en 0 si no hay columna 2 que
    corregir (escritorio con una sola columna, o si `.stage` no existe).
  */
  const offsetCentradoCierre = (() => {
    if (!stageEl || window.innerWidth < 1024) return 0;
    const r = stageEl.getBoundingClientRect();
    return window.innerWidth / 2 - (r.left + r.width / 2);
  })();

  /**
   * Un vuelo entre fases — compartido por escritorio (con desplazamiento
   * lateral) y móvil (en el lugar, `conDesplazamiento:false`): gira 360°,
   * cambia de escena cerca de los 180° (de espaldas) y, si `invertido`,
   * alterna el lado del arco. `sincronizarCanto`/la sombra siguen la MISMA
   * opacidad que ya resuelve `phone.css` vía `abs(sin(--rotacion-y))` — acá
   * sólo hace falta la sombra, que no es CSS puro.
   */
  function registrarVuelo({ trigger, antes, despues, invertido, end, centrarAlFinal }, { conDesplazamiento }) {
    if (!trigger) return null;
    let lado = false;
    return ScrollTrigger.create({
      trigger,
      start: "top top",
      end,
      scrub: 0.4,
      onUpdate(self) {
        const p = self.progress;
        const a = arco(p);
        telefono.style.setProperty("--rotacion-y", `${p * 360}deg`);
        if (conDesplazamiento) {
          // El arco (sube y vuelve a 0) sigue dando el vaivén lateral de
          // siempre; el cierre SUMA un corrimiento que crece con `p` y en
          // p=1 (vuelo terminado) deja el teléfono exactamente en
          // `offsetCentradoCierre` — "aterriza al centro", no al centro de
          // su columna (error 2, 2da vuelta del punto de control 2.5).
          const base = (invertido ? -1 : 1) * a * 160;
          const corrimiento = centrarAlFinal ? offsetCentradoCierre * p : 0;
          telefono.style.setProperty("--vuelo-x", `${base + corrimiento}px`);
          telefono.style.setProperty("--vuelo-escala", `${1 - a * 0.1}`);
        } else {
          // Móvil: giro 360° EN EL LUGAR (plan 5.4) — sin desplazamiento
          // lateral, el teléfono ya ocupa casi todo el ancho disponible.
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
          // capa inactiva justo cuando el vuelo termina de mostrar
          // "habitos" — nunca antes (pisaría otra escena todavía en
          // pantalla) ni más tarde (el cruce arrancaría en blanco).
          if (lado && despues === "habitos") {
            capas.prepararCruce("logro");
          }
        }
      },
    });
  }

  /**
   * Cierre del recorrido (`#cta`, error 2 del punto de control 2.5).
   *
   * `position:sticky` no se queda pegado hasta el final exacto de su
   * contenedor por diseño de la propia especificación: se suelta solo en
   * cuanto, dentro de lo que le queda de contenedor (acá, el resto de
   * `grid-row: 2/4` — hero + main), no entra ya el alto completo de
   * `.stage`. Con el teléfono (~650px renderizados) más alto que el `#cta`
   * real (~400px de texto), eso pasaba ANTES de que la sección arrancara
   * — el teléfono venía "arrastrándose" (ya no pegado, sólo seguía el
   * scroll normal) desde la llamada, y el vuelo nunca llegaba a mostrarse
   * quieto. `min-height` en `#cta` (base.css) le da a esta sección alto de
   * sobra para que el punto donde `sticky` se suelta caiga DESPUÉS de que
   * el Dashboard ya aterrizó.
   *
   * Esta función mide esa geometría real (alto de `.stage`, borde de
   * `#cta`) para calcular el punto exacto donde se suelta y hace que el
   * desvanecido TERMINE justo ahí — así lo que pase después (el
   * "arrastre" en sí) ya es invisible, nunca un canto solo con su sombra
   * flotando (el bug reportado). Números absolutos de scroll (no
   * strings): más simple y exacto que encadenar "+=" relativos.
   *
   * Misma cuenta en escritorio y en móvil — los dos usan `.stage`
   * `position:sticky` ahora (ver phone.css), sólo cambia el `top` (0 en
   * móvil, `var(--space-3)` en escritorio), leído del CSS real en vez de
   * asumido, para no duplicar ese número acá.
   */
  function registrarDesvanecidoDeCierre(trigger) {
    if (!trigger || !escenario3d || !stageEl) return null;
    const rectCta = trigger.getBoundingClientRect();
    const topPagina = rectCta.top + window.scrollY;
    const bottomPagina = rectCta.bottom + window.scrollY;
    const alturaStage = stageEl.getBoundingClientRect().height;
    const margenTopSticky = parseFloat(getComputedStyle(stageEl).top) || 0;
    const puntoSuelta = bottomPagina - alturaStage - margenTopSticky;
    const finVuelo = topPagina + Number(FIN_VUELO_CIERRE.replace("+=", "") || 0);
    // El fundido tiene que TERMINAR en `puntoSuelta` (o un poco antes de
    // caer ahí ya es tarde) — nunca más tarde. Si no hay 260px de sobra
    // entre el vuelo y `puntoSuelta`, se acorta el fundido en vez de
    // arrancarlo antes de que el vuelo termine.
    const finDesvanecido = Math.max(puntoSuelta, finVuelo + 80);
    const inicioDesvanecido = Math.max(finVuelo + 20, finDesvanecido - 260);

    return ScrollTrigger.create({
      trigger,
      start: inicioDesvanecido,
      end: finDesvanecido,
      scrub: 0.3,
      onUpdate(self) {
        escenario3d.style.opacity = `${1 - self.progress}`;
      },
    });
  }

  /**
   * Sub-cruce hábitos → logro (plan 4.4, punto 3) factorizado — lo usan
   * las 2 ramas con movimiento (escritorio y móvil), antes repetido
   * literal. Además del cruce continuo de opacidad (`fijarCruce`, ya
   * existía), ahora también arranca/pausa el loop propio de cada escena
   * al cruzar la mitad del tramo — mismo criterio de "lado" que
   * `registrarVuelo` — para que el confetti de `logro` no dispare antes
   * de que el sub-cruce lo haya revelado, y el switch de `habitos` no
   * siga corriendo de fondo una vez tapado.
   */
  function registrarSubCruceHabitosLogro() {
    if (!secciones.habitos) return null;
    let enLogro = false;
    return ScrollTrigger.create({
      trigger: secciones.habitos,
      start: "center top",
      end: "bottom top",
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

  const mm = gsap.matchMedia();

  // ---- Hero (compartido): Splash respira → al scrollear, la mascota
  // escala hasta cubrir la pantalla → cruza a Login (etapa 3), reversible.
  // Cruce CONTINUO (prepararCruce/fijarCruce): `capas.estado` no cambia de
  // roles durante todo el hero, así que el primer vuelo (login→chat)
  // encuentra el escenario exactamente como lo dejó. Se usa en las 2 ramas
  // con movimiento ok (escritorio y móvil) — sólo la rama sin movimiento
  // (más abajo) lo reemplaza por un cruce discreto sin escala.
  function registrarHero() {
    if (!secciones.hero) return [];
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
        // La mascota cubre la pantalla bastante antes del final del tramo
        // (p≈0.6) para que el cruce a Login no quede apretado contra el
        // borde de la sección.
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

  // ---- Rama A: escritorio + con movimiento ok -------------------------------
  mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
    const triggers = [...registrarHero()];

    FASES.forEach((fase) => {
      triggers.push(registrarVuelo(fase, { conDesplazamiento: true }));
    });
    triggers.push(registrarDesvanecidoDeCierre(secciones.cta));

    triggers.push(registrarSubCruceHabitosLogro());

    return () => triggers.filter(Boolean).forEach((t) => t.kill());
  });

  // ---- Rama C: móvil + con movimiento ok -------------------------------------
  // Mismo mecanismo que escritorio (vuelo real, 360°, cambio de escena de
  // espaldas) pero EN EL LUGAR — sin desplazamiento lateral ni achique tan
  // marcado (plan 5.4: "el cambio de fase es un giro en el lugar"). El
  // teléfono ya queda sticky arriba por CSS (`.stage`, ver base.css/phone.css).
  mm.add("(max-width: 1023px) and (prefers-reduced-motion: no-preference)", () => {
    const triggers = [...registrarHero()];

    FASES.forEach((fase) => {
      triggers.push(registrarVuelo(fase, { conDesplazamiento: false }));
    });
    triggers.push(registrarDesvanecidoDeCierre(secciones.cta));

    triggers.push(registrarSubCruceHabitosLogro());

    return () => triggers.filter(Boolean).forEach((t) => t.kill());
  });

  // ---- Rama B: quien pidió menos movimiento (cualquier ancho) ---------------
  mm.add("(prefers-reduced-motion: reduce)", () => {
    const triggers = [];

    if (secciones.hero) {
      // `"bottom center"` y no `"center center"`: con un viewport alto (o
      // un hero corto) el CENTRO del hero puede estar ya a la altura del
      // centro del viewport al cargar con scroll 0 — el trigger disparaba
      // `onEnter` de entrada y Login tapaba el Splash antes de que la
      // persona scrolleara ni un pixel. El BORDE DE ABAJO del hero sólo
      // llega ahí después de scrollear de verdad.
      triggers.push(
        ScrollTrigger.create({
          trigger: secciones.hero,
          start: "bottom center",
          onEnter: () => capas.irA("login", { animar: true }),
          onLeaveBack: () => capas.irA("splash", { animar: true }),
        })
      );
    }

    /*
      Bug real encontrado verificando `prefers-reduced-motion` (checkpoint
      2.5, parte B): con `start:"top center"` el punto de disparo real es
      `trigger.top - mitad del viewport` (~450px con un viewport de
      900px) — un offset FIJO, no relativo al alto de la propia sección.
      `llamada` mide ~410px (menos que ese offset): su punto de disparo y
      el de `cta` (la fase siguiente) quedaban invertidos en el eje de
      scroll, así que un solo salto de scroll cruzaba los 2 a la vez y
      "llamada" nunca llegaba a pintarse — pasaba derecho de "logro" a
      "dashboard" (confirmado con un dump del estado de las capas en cada
      punto). `"top top"` dispara justo en `trigger.top` (offset 0) — src
      el mismo truco que ya usan los vuelos reales de las ramas A/C — así
      el orden de disparo entre fases consecutivas queda garantizado sin
      importar cuán corta sea cualquiera de ellas.
    */
    FASES.forEach(({ trigger, antes, despues }) => {
      if (!trigger) return;
      triggers.push(
        ScrollTrigger.create({
          trigger,
          start: "top top",
          onEnter: () => capas.irA(despues, { animar: true }),
          onLeaveBack: () => capas.irA(antes, { animar: true }),
        })
      );
    });

    if (secciones.habitos) {
      // Mismo bug, mismo arreglo: `"bottom center"` podía caer más allá
      // del propio final de `habitos` si era más baja que medio
      // viewport. `"center top"` es relativo al alto PROPIO de la
      // sección (mitad de `habitos`, nunca más allá de su propio final) —
      // mismo criterio que ya usa `registrarSubCruceHabitosLogro` para
      // las ramas con movimiento.
      triggers.push(
        ScrollTrigger.create({
          trigger: secciones.habitos,
          start: "center top",
          onEnter: () => capas.irA("logro", { animar: true }),
          onLeaveBack: () => capas.irA("habitos", { animar: true }),
        })
      );
    }

    return () => triggers.forEach((t) => t.kill());
  });
}
