import { iconoTrazo, iconoMic, iconoEnviar } from "../icons.js";

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
    respuesta: "Listo, armé tu lista del súper.",
    tarjeta: { icono: "listas", tipo: "LISTA", titulo: "Súper", detalle: "0 de 3 hechos", accion: "Ver lista" },
  },
  {
    id: "evento",
    texto: "Reunión de diseño mañana a las 10",
    respuesta: "Agendé la reunión para mañana.",
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
    respuesta: "Va, empiezo a seguir tu hábito.",
    tarjeta: { icono: "habitos", tipo: "HÁBITO", titulo: "Leer 20 minutos", detalle: "Diario", accion: "Ver hábito" },
  },
  {
    id: "nota",
    texto: "Anota la idea del regalo para mamá",
    respuesta: "Guardé la idea en tus notas.",
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
    respuesta: "Te lo anoté para hoy.",
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
      <div class="ps-topbar">
        <span class="ps-topbar-titulo">Chat</span>
        <span class="ps-topbar-accion">Nueva conversación</span>
      </div>
      <div class="ps-chat-cuerpo"></div>
      <div class="ps-chat-entrada">
        <div class="ps-campo">
          <span class="ps-placeholder">Escribe un mensaje...</span>
          <span class="ps-entrada-texto"></span><span class="ps-cursor" aria-hidden="true"></span>
          <span class="ps-onda-voz" aria-hidden="true">
            <span class="ps-onda-barra"></span><span class="ps-onda-barra"></span>
            <span class="ps-onda-barra"></span><span class="ps-onda-barra"></span>
            <span class="ps-onda-barra"></span>
          </span>
        </div>
        <span class="ps-boton-icono" aria-hidden="true">${iconoMic().replace("<svg ", '<svg class="ps-icono-mic" ')}${iconoEnviar()}</span>
      </div>
      <span class="ps-chip-voz">Voz · Próximamente</span>
    </div>
  `;
  refs = {
    cuerpo: contenedor.querySelector(".ps-chat-cuerpo"),
    entrada: contenedor.querySelector(".ps-chat-entrada"),
    inputTexto: contenedor.querySelector(".ps-entrada-texto"),
    inputCaja: contenedor.querySelector(".ps-campo"),
    placeholder: contenedor.querySelector(".ps-placeholder"),
    cursor: contenedor.querySelector(".ps-cursor"),
    chipVoz: contenedor.querySelector(".ps-chip-voz"),
    barras: contenedor.querySelectorAll(".ps-onda-barra"),
  };
  escribirEnEntrada("");
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

/** Texto del campo de entrada: placeholder si está vacío, swap mic→enviar si no. */
function escribirEnEntrada(texto) {
  refs.inputTexto.textContent = texto;
  const conTexto = texto.length > 0;
  refs.placeholder.hidden = conTexto;
  refs.cursor.hidden = !conTexto;
  refs.entrada.classList.toggle("ps-chat-entrada--con-texto", conTexto);
}

function crearBurbujaUsuario() {
  const el = document.createElement("div");
  el.className = "ps-burbuja ps-burbuja--usuario";
  return el;
}

function crearBurbujaPensando() {
  const el = document.createElement("div");
  el.className = "ps-burbuja ps-burbuja--asistente ps-burbuja--pensando";
  el.innerHTML = '<span class="ps-spinner" aria-hidden="true"></span>Pensando...';
  return el;
}

/** Respuesta del asistente con su tarjeta rica adentro, como `BurbujaAsistente`. */
function crearTarjeta(escenario) {
  const { tarjeta } = escenario;
  const el = document.createElement("div");
  el.className = "ps-burbuja ps-burbuja--asistente";
  el.innerHTML = `
    ${escenario.respuesta}
    <div class="ps-tarjeta">
      ${iconoTrazo(tarjeta.icono)}
      <div class="ps-tarjeta-texto">
        <span class="ps-tarjeta-tipo">${tarjeta.tipo}</span>
        <span class="ps-tarjeta-titulo">${tarjeta.titulo}</span>
        ${tarjeta.detalle ? `<span class="ps-tarjeta-detalle">${tarjeta.detalle}</span>` : ""}
        <span class="ps-tarjeta-accion">${tarjeta.accion} →</span>
      </div>
    </div>
  `;
  return el;
}

function crearConfirmacion(pregunta) {
  const el = document.createElement("div");
  el.className = "ps-burbuja ps-burbuja--asistente";
  el.innerHTML = `
    ${pregunta}
    <div class="ps-confirmar-fila">
      <span class="ps-btn ps-btn--primario">Confirmar</span>
      <span class="ps-btn ps-btn--contorno">Rechazar</span>
    </div>
  `;
  return el;
}

/** Máximo de burbujas en el DOM: las viejas ya quedaron fuera de cuadro, arriba. */
const MAX_BURBUJAS = 8;

/**
 * Agrega una burbuja al final del historial como en un chat real: el cuerpo
 * está anclado abajo (`justify-content: flex-end`), así que las burbujas
 * anteriores suben. FLIP con `offsetTop` (medidas de layout, sin la
 * transformación 3D del teléfono): se mide antes y después y se anima sólo
 * `y` desde la diferencia, para que suban deslizándose en vez de saltar.
 */
function agregarAlHistorial(el) {
  const previos = Array.from(refs.cuerpo.children);
  const antes = previos.map((n) => n.offsetTop);
  refs.cuerpo.appendChild(el);
  if (!prefiereMovimientoReducido()) {
    previos.forEach((n, i) => {
      const delta = antes[i] - n.offsetTop;
      if (delta) gsap.fromTo(n, { y: delta }, { y: 0, duration: 0.4, ease: "power3.out", overwrite: "auto" });
    });
  }
  while (refs.cuerpo.children.length > MAX_BURBUJAS) refs.cuerpo.firstElementChild.remove();
  return el;
}

/** Reemplaza una burbuja (p. ej. "Pensando..." por la respuesta) sin mover el resto. */
function reemplazarEnHistorial(viejo, nuevo) {
  viejo.replaceWith(nuevo);
  return nuevo;
}

function construirTimeline(espera = 0.9) {
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

  refs.inputCaja.classList.remove("ps-campo--dictando");
  escribirEnEntrada("");
  tl.to({}, { duration: espera }); // respiro entre un intercambio y el siguiente

  if (escenario.dictado) {
    // Ondas de voz en vez de tecleo — mismo recorrido de ahí en más.
    tl.call(() => refs.inputCaja.classList.add("ps-campo--dictando"));
    tl.to(refs.chipVoz, { opacity: 1, duration: 0.2 }, "<");
    tl.to(
      refs.barras,
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
      refs.inputCaja.classList.remove("ps-campo--dictando");
      escribirEnEntrada(escenario.texto);
    });
    tl.to(refs.chipVoz, { opacity: 0, duration: 0.2 }, "<");
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
        escribirEnEntrada(escenario.texto.slice(0, Math.round(proxy.n)));
      },
    });
  }

  tl.to({}, { duration: 0.2 }); // pausa corta antes de "enviar"

  tl.call(() => {
    escribirEnEntrada("");
    const burbuja = crearBurbujaUsuario();
    burbuja.textContent = escenario.texto;
    agregarAlHistorial(burbuja);
    entrar(burbuja);
  });
  tl.to({}, { duration: 0.55 });

  let pensando;
  tl.call(() => {
    pensando = agregarAlHistorial(crearBurbujaPensando());
    entrar(pensando, { y: 6 });
  });
  tl.to({}, { duration: 0.9 });

  if (escenario.confirmar) {
    let burbujaConfirmar;
    tl.call(() => {
      burbujaConfirmar = crearConfirmacion(escenario.confirmar.pregunta);
      reemplazarEnHistorial(pensando, burbujaConfirmar);
      entrar(burbujaConfirmar, { y: 4 });
    });
    tl.to({}, { duration: 1.1 });
    // Se "toca" Confirmar — mismo feedback táctil que un :active real (achica/vuelve).
    tl.call(() => {
      const boton = burbujaConfirmar.querySelector(".ps-btn--primario");
      gsap.to(boton, { scale: 0.92, duration: 0.1, yoyo: true, repeat: 1 });
    });
    tl.to({}, { duration: 0.35 });
    tl.call(() => {
      const fila = burbujaConfirmar.querySelector(".ps-confirmar-fila");
      fila.outerHTML = '<div class="ps-confirmado">Confirmado ✓</div>';
    });
    tl.to({}, { duration: 2.2 });
  } else {
    let tarjeta;
    tl.call(() => {
      tarjeta = reemplazarEnHistorial(pensando, crearTarjeta(escenario));
      gsap.set(tarjeta, { opacity: 0, y: 10, scale: 0.98, transformOrigin: "left bottom" });
      gsap.to(tarjeta, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "power3.out" });
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
  refs.cuerpo.innerHTML = "";
  escribirEnEntrada("");
  refs.inputCaja.classList.remove("ps-campo--dictando");
  gsap.set(refs.chipVoz, { opacity: 0 });
  sembrarIntercambio();
}

/** Un intercambio ya terminado (mensaje + respuesta), agregado de una, sin animar. */
function sembrarIntercambio() {
  const escenario = elegirEscenario();
  const burbuja = crearBurbujaUsuario();
  burbuja.textContent = escenario.texto;
  let respuesta;
  if (escenario.confirmar) {
    respuesta = crearConfirmacion(escenario.confirmar.pregunta);
    respuesta.querySelector(".ps-confirmar-fila").outerHTML = '<div class="ps-confirmado">Confirmado ✓</div>';
  } else {
    respuesta = crearTarjeta(escenario);
  }
  refs.cuerpo.append(burbuja, respuesta);
}

export function play() {
  activo = true;
  if (timelineActivo) timelineActivo.kill();
  if (prefiereMovimientoReducido()) {
    timelineActivo = null;
    mostrarEstadoEstatico();
    return null;
  }
  // Al entrar la conversación ya tiene un intercambio previo: el chat se ve
  // vivo desde el primer cuadro, y el siguiente mensaje se suma debajo.
  if (refs && refs.cuerpo.childElementCount === 0) sembrarIntercambio();
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
    escribirEnEntrada("");
    refs.inputCaja.classList.remove("ps-campo--dictando");
  }
}
