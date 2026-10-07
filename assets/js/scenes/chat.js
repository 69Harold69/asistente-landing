import { iconoTrazo, iconoMic } from "../icons.js";

/**
 * Chat vivo (etapa 5, plan 4.3 y sección 2) — pool de 6 escenarios, uno al
 * azar por entrada a la sección, sin repetir el anterior inmediato.
 * Visual idéntico a `ChatScreen.kt`/`TarjetaElementoChat.kt`: tecleo en el
 * input → burbuja del usuario → "Pensando..." → tarjeta rica animada (o
 * Confirmar/Rechazar → se "toca" Confirmar → "Confirmado ✓"). Uno de los 6
 * es dictado: ondas en el input + chip "Voz · Próximamente" en vez de
 * tecleo, mismo recorrido de ahí en más.
 *
 * `play()`/`pause()`/`reset()` los maneja `stage.js` con
 * `onEnter`/`onLeave` (plan, regla de la parte B) — entrar a la sección
 * arranca un escenario nuevo; salir pausa el GSAP timeline en seco, sin
 * perder dónde iba (`reset()` si hace falta arrancar realmente de cero).
 * Al terminar un escenario, encadena el siguiente solo (bucle) mientras
 * siga "activo" — así la sección se siente viva si la persona se queda
 * leyendo, no se congela en el primer mensaje.
 */
export const id = "chat";

const ESCENARIOS = [
  {
    id: "lista",
    texto: "Agrega leche, pan y huevos a mi lista del súper",
    tarjeta: { icono: "listas", tipo: "LISTA", titulo: "Súper", detalle: "0 de 3 hechos", accion: "Ver lista" },
  },
  {
    id: "evento",
    texto: "Reunión de diseño mañana a las 10",
    tarjeta: {
      icono: "eventos",
      tipo: "EVENTO",
      titulo: "Reunión de diseño",
      detalle: "Mañana · 10:00",
      accion: "Ver evento",
    },
  },
  {
    id: "habito",
    texto: "Quiero leer 20 minutos diarios",
    tarjeta: { icono: "habitos", tipo: "HÁBITO", titulo: "Leer 20 minutos", detalle: "Diario", accion: "Ver hábito" },
  },
  {
    id: "nota",
    texto: "Anota la idea del regalo para mamá",
    tarjeta: { icono: "notas", tipo: "NOTA", titulo: "Idea: regalo para mamá", detalle: null, accion: "Ver nota" },
  },
  {
    id: "confirmar",
    texto: "Pospón lo de la renta para el viernes",
    confirmar: { pregunta: '¿Confirmas posponer "Pagar la renta" para el viernes?' },
  },
  {
    id: "dictado",
    texto: "Recuérdame llamar al dentista",
    dictado: true,
    tarjeta: { icono: "tareas", tipo: "TAREA", titulo: "Llamar al dentista", detalle: "Hoy", accion: "Ver tarea" },
  },
];

let refs = null;
let timelineActivo = null;
let idEscenarioAnterior = null;
let activo = false;

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-chat">
      <div class="ps-chat-header">
        <span class="ps-dot" aria-hidden="true"></span>
        <span>Chat</span>
      </div>
      <div class="ps-chat-body"></div>
      <div class="ps-chat-input">
        <div class="ps-input">
          <span class="ps-input-texto"></span><span class="ps-cursor" aria-hidden="true"></span>
          <span class="ps-onda-voz" aria-hidden="true">
            <span class="ps-onda-barra"></span><span class="ps-onda-barra"></span>
            <span class="ps-onda-barra"></span><span class="ps-onda-barra"></span>
            <span class="ps-onda-barra"></span>
          </span>
        </div>
        <span class="ps-chip-voz">Voz · Próximamente</span>
        <span class="ps-mic-btn" aria-hidden="true">${iconoMic()}</span>
      </div>
    </div>
  `;
  refs = {
    cuerpo: contenedor.querySelector(".ps-chat-body"),
    inputTexto: contenedor.querySelector(".ps-input-texto"),
    inputCaja: contenedor.querySelector(".ps-input"),
    chipVoz: contenedor.querySelector(".ps-chip-voz"),
  };
}

function elegirEscenario() {
  const candidatos = ESCENARIOS.filter((e) => e.id !== idEscenarioAnterior);
  const elegido = candidatos[Math.floor(Math.random() * candidatos.length)];
  idEscenarioAnterior = elegido.id;
  return elegido;
}

/** Entra con fade + un pelín de desplazamiento — sólo transform/opacity. */
function entrar(el, { y = 10 } = {}) {
  gsap.set(el, { opacity: 0, y });
  return gsap.to(el, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" });
}

function crearBurbujaUsuario() {
  const el = document.createElement("div");
  el.className = "ps-bubble ps-bubble--user";
  refs.cuerpo.appendChild(el);
  return el;
}

function crearBurbujaPensando() {
  const el = document.createElement("div");
  el.className = "ps-bubble ps-bubble--assistant ps-bubble--pensando";
  el.textContent = "Pensando...";
  refs.cuerpo.appendChild(el);
  return el;
}

function crearTarjeta(tarjeta) {
  const el = document.createElement("div");
  el.className = "ps-rich-card";
  el.innerHTML = `
    <div class="ps-rich-card-head">
      ${iconoTrazo(tarjeta.icono)}
      <span class="ps-rich-card-tipo">${tarjeta.tipo}</span>
    </div>
    <div class="ps-rich-card-titulo">${tarjeta.titulo}</div>
    ${tarjeta.detalle ? `<div class="ps-rich-card-detalle">${tarjeta.detalle}</div>` : ""}
    <div class="ps-rich-card-link">${tarjeta.accion} →</div>
  `;
  refs.cuerpo.appendChild(el);
  return el;
}

function crearConfirmacion(pregunta) {
  const el = document.createElement("div");
  el.className = "ps-bubble ps-bubble--assistant";
  el.innerHTML = `
    ${pregunta}
    <div class="ps-confirm-row">
      <span class="ps-chip-btn ps-chip-btn--primary">Confirmar</span>
      <span class="ps-chip-btn ps-chip-btn--outline">Rechazar</span>
    </div>
  `;
  refs.cuerpo.appendChild(el);
  return el;
}

/** Vacía el cuerpo del chat con un fade corto (no de golpe) antes de un escenario nuevo. */
function vaciarCuerpo(tl) {
  const previos = Array.from(refs.cuerpo.children);
  if (previos.length === 0) return;
  tl.to(previos, { opacity: 0, y: -8, duration: 0.25, stagger: 0.04 });
  tl.call(() => {
    refs.cuerpo.innerHTML = "";
  });
}

function construirTimeline() {
  const escenario = elegirEscenario();
  const tl = gsap.timeline({
    repeat: 0,
    onComplete() {
      if (activo) {
        timelineActivo = construirTimeline();
        timelineActivo.play(0);
      }
    },
  });

  vaciarCuerpo(tl);
  gsap.set(refs.inputCaja, { className: "ps-input" });
  refs.inputTexto.textContent = "";

  if (escenario.dictado) {
    // Ondas de voz en vez de tecleo — mismo recorrido de ahí en más.
    tl.call(() => refs.inputCaja.classList.add("ps-input--dictando"));
    tl.to(".ps-chip-voz", { opacity: 1, duration: 0.2 }, "<");
    const barras = refs.cuerpo.ownerDocument.querySelectorAll(".ps-onda-barra");
    tl.to(
      barras,
      {
        scaleY: () => 0.4 + Math.random() * 1.4,
        duration: 0.22,
        repeat: 6,
        yoyo: true,
        stagger: { each: 0.05, repeat: 6 },
      },
      "<"
    );
    tl.call(() => {
      refs.inputCaja.classList.remove("ps-input--dictando");
      gsap.set(".ps-chip-voz", { opacity: 0 });
    });
  } else {
    // Tecleo real, carácter a carácter — proxy numérico + onUpdate (no hay
    // forma de "animar" texttContent con transform/opacity, es la única
    // excepción deliberada a esa regla, imprescindible para el efecto).
    const proxy = { n: 0 };
    tl.to(proxy, {
      n: escenario.texto.length,
      duration: Math.min(1.6, 0.045 * escenario.texto.length),
      ease: "none",
      onUpdate() {
        refs.inputTexto.textContent = escenario.texto.slice(0, Math.round(proxy.n));
      },
    });
  }

  tl.to({}, { duration: 0.2 }); // pausa corta antes de "enviar"

  tl.call(() => {
    refs.inputTexto.textContent = "";
    const burbuja = crearBurbujaUsuario();
    burbuja.textContent = escenario.texto;
    entrar(burbuja);
  });
  tl.to({}, { duration: 0.55 });

  let pensando;
  tl.call(() => {
    pensando = crearBurbujaPensando();
    entrar(pensando, { y: 6 });
  });
  tl.to({}, { duration: 0.9 });

  if (escenario.confirmar) {
    let burbujaConfirmar;
    tl.call(() => {
      pensando.remove();
      burbujaConfirmar = crearConfirmacion(escenario.confirmar.pregunta);
      entrar(burbujaConfirmar);
    });
    tl.to({}, { duration: 1.1 });
    // Se "toca" Confirmar — mismo feedback táctil que un :active real (achica/vuelve).
    tl.call(() => {
      const boton = burbujaConfirmar.querySelector(".ps-chip-btn--primary");
      gsap.to(boton, { scale: 0.92, duration: 0.1, yoyo: true, repeat: 1 });
    });
    tl.to({}, { duration: 0.35 });
    tl.call(() => {
      const fila = burbujaConfirmar.querySelector(".ps-confirm-row");
      fila.outerHTML = '<div class="ps-confirmado">Confirmado ✓</div>';
    });
    tl.to({}, { duration: 2.6 });
  } else {
    let tarjeta;
    tl.call(() => {
      pensando.remove();
      tarjeta = crearTarjeta(escenario.tarjeta);
      gsap.set(tarjeta, { opacity: 0, y: 10, scale: 0.97 });
      gsap.to(tarjeta, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.6)" });
    });
    tl.to({}, { duration: 2.6 });
  }

  return tl;
}

function prefiereMovimientoReducido() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Estado final estático de UN escenario, sin tecleo/espera/loop — lo que
 * se ve bajo `prefers-reduced-motion` (regla general de la parte B: "sin
 * loops agresivos, estados legibles estáticos"). El tecleo carácter a
 * carácter y el encadenado infinito de escenarios son justo el tipo de
 * loop que esa regla pide evitar acá.
 */
function mostrarEstadoEstatico() {
  if (!refs) return;
  const escenario = elegirEscenario();
  refs.cuerpo.innerHTML = "";
  refs.inputTexto.textContent = "";
  refs.inputCaja.classList.remove("ps-input--dictando");
  gsap.set(".ps-chip-voz", { opacity: 0 });

  const burbuja = crearBurbujaUsuario();
  burbuja.textContent = escenario.texto;

  if (escenario.confirmar) {
    const el = crearConfirmacion(escenario.confirmar.pregunta);
    el.querySelector(".ps-confirm-row").outerHTML = '<div class="ps-confirmado">Confirmado ✓</div>';
  } else {
    crearTarjeta(escenario.tarjeta);
  }
}

export function play() {
  activo = true;
  if (timelineActivo) timelineActivo.kill();
  if (prefiereMovimientoReducido()) {
    timelineActivo = null;
    mostrarEstadoEstatico();
    return null;
  }
  timelineActivo = construirTimeline();
  timelineActivo.play(0);
  return timelineActivo;
}

export function pause() {
  activo = false;
  if (timelineActivo) timelineActivo.pause();
}

export function reset() {
  activo = false;
  if (timelineActivo) {
    timelineActivo.kill();
    timelineActivo = null;
  }
  idEscenarioAnterior = null;
  if (refs) {
    refs.cuerpo.innerHTML = "";
    refs.inputTexto.textContent = "";
    refs.inputCaja.classList.remove("ps-input--dictando");
  }
}
