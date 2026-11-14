import { iconoTrazo, iconoMic, iconoEnviar } from "../icons.js?v=b33aca15d5";

/**
 * Chat vivo (etapa 5, plan 4.3 y sección 2) — pool de 8 escenarios, uno al
 * azar por entrada a la sección, sin repetir el anterior inmediato.
 * Visual idéntico a `ChatScreen.kt`/`TarjetaElementoChat.kt` (0.1.6a: barra
 * «Chat» + «Nuevo chat», :327-335; sin chip de voz, que la app no tiene): tecleo en el
 * input → burbuja del usuario → "Pensando..." → tarjeta rica animada (o
 * Confirmar/Rechazar → se "toca" Confirmar → "Confirmado ✓"). Uno de los 8
 * es un mensaje de voz, como en la app: barra de grabación (papelera,
 * punto rojo, contador, onda) → burbuja de audio con "Transcribiendo…" →
 * transcripción → "Pensando..." → respuesta con su propio reproductor (sólo
 * se anima el progreso, sin audio real) y la tarjeta.
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

/**
 * Próximo viernes en el formato de `describirFechaRelativa` del backend (#89):
 * "viernes 6 de noviembre" (día de la semana, día y mes en minúsculas, sin
 * año si es el actual). Si hoy es viernes, el próximo es en 7 días.
 */
function proximoViernes() {
  const d = new Date();
  d.setDate(d.getDate() + (((5 - d.getDay() + 7) % 7) || 7));
  const f = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const partes = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
  const anio = d.getFullYear() !== new Date().getFullYear() ? ` de ${d.getFullYear()}` : "";
  return `${partes.weekday} ${partes.day} de ${partes.month}${anio}`;
}

/** "9 oct 2026": fecha de mañana con el mismo estilo MEDIUM de la app (locale es-MX). */
function fechaDeManana() {
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  try {
    return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(manana);
  } catch {
    return manana.toLocaleDateString();
  }
}

/*
  Las respuestas son las de `construirRespuesta` del backend (`ServicioConversacional.php`, `origin/main`): una
  creación dice «Listo, ya anoté tu <tipo> «<título>».» (`describirCrearElementoCreado` + `objetoDeParametros`).
*/
const ESCENARIOS = [
  {
    id: "lista",
    // Lista nueva (crear_elemento): `describirCrearElementoCreado` → «Listo, ya anoté tu lista «X».». «Agrega … a
    // mi lista» sobre una lista que ya existe sería `agregar_item_lista`, que exige confirmación: no se muestra así.
    texto: "Haz mi lista del súper: leche, pan y huevos",
    respuesta: "Listo, ya anoté tu lista «Súper».",
    tarjeta: { icono: "listas", tipo: "LISTA", titulo: "Súper", detalle: "0 de 3 hechos", accion: "Ver lista" },
  },
  {
    id: "evento",
    texto: "Reunión de diseño mañana a las 10",
    respuesta: "Listo, ya anoté tu evento «Reunión de diseño».",
    tarjeta: {
      icono: "eventos",
      tipo: "EVENTO",
      titulo: "Reunión de diseño",
      // Fecha absoluta, como `formatearFechaHoraLegible` de la app
      // (FormatStyle.MEDIUM + "HH:mm"): la tarjeta nunca dice "Mañana".
      detalle: `${fechaDeManana()} · 10:00`,
      accion: "Ver evento",
    },
  },
  {
    id: "habito",
    texto: "Quiero leer 20 minutos diarios",
    respuesta: "Listo, ya anoté tu hábito «Leer 20 minutos».",
    tarjeta: { icono: "habitos", tipo: "HÁBITO", titulo: "Leer 20 minutos", detalle: "Diario", accion: "Ver hábito" },
  },
  {
    id: "nota",
    texto: "Anota la idea del regalo para mamá",
    respuesta: "Listo, ya anoté tu nota «Idea: regalo para mamá».",
    tarjeta: { icono: "notas", tipo: "NOTA", titulo: "Idea: regalo para mamá", detalle: null, accion: "Ver nota" },
  },
  {
    id: "proyecto",
    texto: "Crea un proyecto llamado Mudanza",
    // `describirCrearElementoCreado` (ServicioConversacional.php): «Listo, ya anoté tu proyecto «Mudanza».»
    // Tarjeta `is Proyecto` de `resumenTarjeta` (TarjetaElementoChat.kt:133-138): sin descripción ni
    // categoría no hay detalle (el avance no va en la tarjeta).
    respuesta: "Listo, ya anoté tu proyecto «Mudanza».",
    tarjeta: { icono: "proyectos", tipo: "PROYECTO", titulo: "Mudanza", detalle: null, accion: "Ver proyecto" },
  },
  {
    id: "pregunta",
    // Flujo real (captura de la app «05-pregunta-manana-o-noche»): hora sin aclarar → pregunta cerrada → tocas →
    // sin LLM. Pregunta: `ServicioConversacional.php:4943` («¿A las %d de la mañana o de la noche?»); botones:
    // `PreguntasCerradas::itemsHora()` (etiquetas «De la mañana» / «De la noche»). Al tocar, la burbuja del
    // usuario dice la etiqueta. Respuesta: `describirCrearElementoCreado` (título entre «»); tarjeta de tarea con
    // `formatearFechaObjetivoRelativa` («Mañana · 20:00»), `TarjetaElementoChat.kt:93-99`.
    texto: "Recuérdame llamar a mi mamá mañana a las 8",
    pregunta: { texto: "¿A las 8 de la mañana o de la noche?", opciones: ["De la mañana", "De la noche"], elegida: 1 },
    respuesta: "Listo, ya anoté tu tarea «Llamar a mi mamá».",
    tarjeta: { icono: "tareas", tipo: "TAREA", titulo: "Llamar a mi mamá", detalle: "Mañana · 20:00", accion: "Ver tarea" },
  },
  {
    id: "confirmar",
    texto: "Pospón lo de la renta para el viernes",
    // Texto de `partesPosponer` + cierre de `construirRespuesta` (backend #89);
    // la tarea no trae hora, así que no lleva "a las…".
    confirmar: {
      get pregunta() {
        return `¿Muevo «Pagar la renta» al ${proximoViernes()}? Responde para confirmar o cancelar.`;
      },
      listo: "Listo, pospuse «Pagar la renta».",
    },
  },
  {
    id: "dictado",
    texto: "Recuérdame llamar al dentista",
    dictado: true,
    // Tarea sin referencia de tiempo: queda sin fecha (backend #118), así que
    // la tarjeta no lleva detalle (`resumenTarjeta` de TarjetaElementoChat.kt).
    respuesta: "Listo, ya anoté tu tarea «Llamar al dentista».",
    tarjeta: { icono: "tareas", tipo: "TAREA", titulo: "Llamar al dentista", detalle: null, accion: "Ver tarea" },
  },
];

const N_BARRAS_GRABACION = 32; // NUM_BARRAS_EN_VIVO de BarraGrabacion.kt
const N_BARRAS_AUDIO = 34;
const DURACION_VOZ = 3;
const DURACION_RESPUESTA = 4;

const ICONO_PAPELERA =
  '<svg class="ps-grabacion-papelera" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
const ICONO_PLAY =
  '<svg class="ps-audio-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

/** Amplitud 0..1 determinista (mezcla de senos): la onda se ve a "voz" sin azar entre corridas. */
function amplitud(i, semilla = 0) {
  const v = Math.abs(Math.sin(i * 0.9 + semilla) * 0.6 + Math.sin(i * 0.37 + semilla * 2) * 0.4);
  return 0.18 + 0.82 * v;
}

function formatearDuracion(segundos) {
  return `${Math.floor(segundos / 60)}:${String(Math.floor(segundos % 60)).padStart(2, "0")}`;
}

/** Reproductor del chat (`ReproductorAudioChat`): play, onda de barras y duración m:ss. */
function crearReproductor(segundos, semilla) {
  const barras = "<i></i>".repeat(N_BARRAS_AUDIO);
  const el = document.createElement("div");
  el.className = "ps-audio";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `${ICONO_PLAY}<span class="ps-audio-onda">${barras}</span><span class="ps-audio-duracion">${formatearDuracion(segundos)}</span>`;
  // La altura va por CSSOM: un `style=""` inline lo bloquea la CSP (`style-src 'self'`).
  el.querySelectorAll(".ps-audio-onda i").forEach((barra, i) => barra.style.setProperty("--h", `${Math.round(amplitud(i, semilla) * 100)}%`));
  return el;
}

/** Pinta de sólido las barras hasta `fraccion` (0..1), como `FormaOndaCanvas`. */
function pintarProgreso(reproductor, fraccion) {
  const barras = reproductor.querySelectorAll(".ps-audio-onda i");
  const hasta = fraccion * (barras.length - 1);
  barras.forEach((b, i) => b.classList.toggle("on", fraccion > 0 && i <= hasta));
}

/** Burbuja del usuario con audio: reproductor y, debajo, el pie (transcripción). */
function crearBurbujaVozUsuario(pie, segundos) {
  const el = document.createElement("div");
  el.className = "ps-burbuja ps-burbuja--usuario ps-burbuja--voz";
  el.append(crearReproductor(segundos, 1.3));
  const texto = document.createElement("div");
  texto.className = "ps-burbuja-pie";
  texto.textContent = pie;
  el.append(texto);
  return el;
}

let refs = null;
let timelineActivo = null;
let idEscenarioAnterior = null;
/** Último escenario cuyo mensaje SÍ llegó al historial (uno interrumpido por pausa no cuenta). */
let idUltimoEnHistorial = null;
let activo = false;

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-chat">
      <div class="ps-topbar">
        <span class="ps-topbar-titulo">Chat</span>
        <span class="ps-topbar-accion">Nuevo chat</span>
      </div>
      <div class="ps-chat-cuerpo"></div>
      <div class="ps-chat-entrada">
        <div class="ps-campo">
          <span class="ps-placeholder">Escribe un mensaje...</span>
          <span class="ps-entrada-texto"></span><span class="ps-cursor" aria-hidden="true"></span>
        </div>
        <div class="ps-grabacion" aria-hidden="true">
          ${ICONO_PAPELERA}
          <span class="ps-grabacion-punto"></span>
          <span class="ps-grabacion-tiempo">0:00</span>
          <span class="ps-grabacion-onda">${"<i></i>".repeat(N_BARRAS_GRABACION)}</span>
        </div>
        <span class="ps-boton-icono" aria-hidden="true">${iconoMic().replace("<svg ", '<svg class="ps-icono-mic" ')}${iconoEnviar()}</span>
      </div>
    </div>
  `;
  refs = {
    cuerpo: contenedor.querySelector(".ps-chat-cuerpo"),
    entrada: contenedor.querySelector(".ps-chat-entrada"),
    inputTexto: contenedor.querySelector(".ps-entrada-texto"),
    inputCaja: contenedor.querySelector(".ps-campo"),
    placeholder: contenedor.querySelector(".ps-placeholder"),
    cursor: contenedor.querySelector(".ps-cursor"),
    tiempo: contenedor.querySelector(".ps-grabacion-tiempo"),
    barrasGrabacion: contenedor.querySelectorAll(".ps-grabacion-onda i"),
  };
  escribirEnEntrada("");
  if (escenarioForzado()) play();
}

/**
 * Solo desarrollo: `?escena=chat&escenario=<id>` fuerza un escenario del pool (y, con él, el bucle repite siempre
 * ese) y arranca solo, porque el modo de inspección no llama a `play()`. Sirve para revisar a mano cada
 * escenario, que las pruebas automáticas no recorren (ver README, «Modo de inspección»).
 */
function escenarioForzado() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("escena") !== "chat") return null;
  return ESCENARIOS.find((e) => e.id === params.get("escenario")) ?? null;
}

function elegirEscenario() {
  const forzado = escenarioForzado();
  if (forzado) {
    idEscenarioAnterior = forzado.id;
    return forzado;
  }
  // Excluye el último elegido y el último que de verdad quedó en pantalla:
  // si una pausa interrumpió el escenario anterior, no hay que repetir el
  // que ya está en el historial (p. ej. «Leer 20 minutos» dos veces seguidas).
  const candidatos = ESCENARIOS.filter((e) => e.id !== idEscenarioAnterior && e.id !== idUltimoEnHistorial);
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

/**
 * Botón «escuchar» de las respuestas de TEXTO (`ChatScreen.kt:921-938`, issue #79): `IconButton` de 48dp a la derecha
 * del texto, 4dp después, con `IconoEscuchar` de 18dp (`:1259-1297`, dibujado en un `Canvas`: cuerpo, cono y dos
 * arcos, color `LocalContentColor`). Aquí, la misma figura con las proporciones del `Canvas` en un viewBox de 24.
 * Las respuestas por voz no lo llevan: muestran su reproductor.
 */
const ICONO_ESCUCHAR =
  '<span class="ps-escuchar" aria-hidden="true"><svg viewBox="0 0 24 24"><path class="ps-escuchar-cuerpo" ' +
  'd="M1.44 7.92h6.24v8.16H1.44zM7.68 7.92l5.28-3.84v15.84l-5.28-3.84z"/><path class="ps-escuchar-ondas" ' +
  'd="M15.336 9.624a3.36 3.36 0 0 1 0 4.752M17.372 7.588a6.24 6.24 0 0 1 0 8.824"/></svg></span>';

/** Fila «texto + escuchar» de `BurbujaAsistente` (`Row(verticalAlignment = Top)`, texto con `weight(1f)`). */
function filaTexto(texto) {
  const fila = document.createElement("div");
  fila.className = "ps-burbuja-fila";
  const span = document.createElement("span");
  span.className = "ps-burbuja-texto";
  span.textContent = texto;
  fila.append(span);
  fila.insertAdjacentHTML("beforeend", ICONO_ESCUCHAR);
  return fila;
}

/** Respuesta del asistente con su tarjeta rica adentro, como `BurbujaAsistente`. */
function crearTarjeta(escenario) {
  const { tarjeta } = escenario;
  const el = document.createElement("div");
  el.className = "ps-burbuja ps-burbuja--asistente";
  el.innerHTML = `
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
  if (escenario.dictado) {
    // Responde por voz: reproductor arriba, el texto debajo y luego la tarjeta
    // (mismo orden que `BurbujaAsistente`).
    const audio = crearReproductor(DURACION_RESPUESTA, 4.1);
    const texto = document.createElement("div");
    texto.className = "ps-burbuja-pie ps-burbuja-pie--asistente";
    texto.textContent = escenario.respuesta;
    el.prepend(audio, texto);
  } else {
    el.prepend(filaTexto(escenario.respuesta));
  }
  return el;
}

/** `Icons.Filled.Check` de material-icons-core 1.6.8, literal (licencia en `assets/js/LICENSE-iconos.txt`). */
const ICONO_CHECK =
  '<svg class="ps-opcion-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

/**
 * Pregunta cerrada del asistente (`PreguntaDelAsistente`, `PreguntaChatUi.kt:94-102`): el texto y, debajo
 * (`ChatScreen.kt:965-976`), un `FlowRow` de `OutlinedButton` de 48dp con separación de 8dp. La burbuja ocupa
 * todo el ancho, como toda `BurbujaAsistente` (su `Row` interno lleva el texto con `weight(1f)`).
 */
function crearPregunta(pregunta) {
  const el = document.createElement("div");
  el.className = "ps-burbuja ps-burbuja--asistente";
  el.innerHTML = `
    <div class="ps-opciones">
      ${pregunta.opciones.map((o) => `<span class="ps-btn ps-btn--contorno ps-opcion">${o}</span>`).join("")}
    </div>
  `;
  el.prepend(filaTexto(pregunta.texto));
  return el;
}

/**
 * La opción tocada pasa a botón lleno con un check de 18dp y las demás quedan deshabilitadas
 * (`BotonOpcion`, `PreguntaChatUi.kt:116-133`, R305); no aparece «Confirmado ✓».
 */
function marcarOpcionElegida(el, indice) {
  el.querySelectorAll(".ps-opcion").forEach((boton, i) => {
    if (i === indice) {
      boton.classList.remove("ps-btn--contorno");
      boton.classList.add("ps-btn--primario", "ps-opcion--elegida");
      boton.insertAdjacentHTML("afterbegin", ICONO_CHECK);
    } else {
      boton.classList.add("ps-opcion--deshabilitada");
    }
  });
}

/** Respuesta de texto del asistente tras confirmar ("Listo, pospuse…"). */
function crearBurbujaTexto(texto) {
  const el = document.createElement("div");
  el.className = "ps-burbuja ps-burbuja--asistente";
  el.append(filaTexto(texto));
  return el;
}

function crearConfirmacion(pregunta) {
  const el = document.createElement("div");
  el.className = "ps-burbuja ps-burbuja--asistente";
  el.innerHTML = `
    <div class="ps-confirmar-fila">
      <span class="ps-btn ps-btn--primario">Confirmar</span>
      <span class="ps-btn ps-btn--contorno">Rechazar</span>
    </div>
  `;
  el.prepend(filaTexto(pregunta));
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

  refs.entrada.classList.remove("ps-chat-entrada--grabando");
  escribirEnEntrada("");
  tl.to({}, { duration: espera }); // respiro entre un intercambio y el siguiente

  if (escenario.dictado) {
    return construirTimelineVoz(tl, escenario);
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
    idUltimoEnHistorial = escenario.id;
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

  if (escenario.pregunta) {
    const { pregunta } = escenario;
    let burbujaPregunta;
    tl.call(() => {
      burbujaPregunta = crearPregunta(pregunta);
      reemplazarEnHistorial(pensando, burbujaPregunta);
      entrar(burbujaPregunta, { y: 4 });
    });
    tl.to({}, { duration: 1.3 });
    // Se "toca" la opción — mismo feedback táctil que Confirmar (achica/vuelve).
    tl.call(() => {
      const boton = burbujaPregunta.querySelectorAll(".ps-opcion")[pregunta.elegida];
      gsap.to(boton, { scale: 0.92, duration: 0.1, yoyo: true, repeat: 1 });
    });
    tl.to({}, { duration: 0.35 });
    tl.call(() => {
      marcarOpcionElegida(burbujaPregunta, pregunta.elegida);
      const burbujaUsuario = crearBurbujaUsuario();
      burbujaUsuario.textContent = pregunta.opciones[pregunta.elegida];
      entrar(agregarAlHistorial(burbujaUsuario));
    });
    tl.to({}, { duration: 0.5 });
    let pensando2;
    tl.call(() => {
      pensando2 = agregarAlHistorial(crearBurbujaPensando());
      entrar(pensando2, { y: 6 });
    });
    tl.to({}, { duration: 0.7 });
    tl.call(() => {
      const tarjeta = reemplazarEnHistorial(pensando2, crearTarjeta(escenario));
      gsap.set(tarjeta, { opacity: 0, y: 10, scale: 0.98, transformOrigin: "left bottom" });
      gsap.to(tarjeta, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "power3.out" });
    });
    tl.to({}, { duration: 2.8 });
  } else if (escenario.confirmar) {
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
    tl.to({}, { duration: 0.6 });
    tl.call(() => entrar(agregarAlHistorial(crearBurbujaTexto(escenario.confirmar.listo)), { y: 6 }));
    tl.to({}, { duration: 2.4 });
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

/**
 * Escenario de voz, como la app real (`BarraGrabacion`, `BurbujaUsuario`,
 * `BurbujaAsistente`): graba con contador y onda que corre → se envía como
 * audio con "Transcribiendo…" → pie con la transcripción → "Pensando..." →
 * la respuesta trae su reproductor, que avanza solo, y la tarjeta.
 */
function construirTimelineVoz(tl, escenario) {
  const buffer = Array.from({ length: N_BARRAS_GRABACION }, () => 0);
  let paso = -1;
  const pintarGrabacion = (t) => {
    const nuevo = Math.floor(t * 10);
    while (paso < nuevo) {
      paso += 1;
      // La voz "habla" a ráfagas: pausas cortas entre palabras.
      const habla = Math.sin(paso * 0.55) > -0.55;
      buffer.shift();
      buffer.push(habla ? amplitud(paso, 0.7) : 0);
    }
    refs.barrasGrabacion.forEach((b, i) => b.style.setProperty("--h", `${Math.round(buffer[i] * 100)}%`));
    refs.tiempo.textContent = formatearDuracion(t);
  };

  tl.call(() => {
    paso = -1;
    buffer.fill(0);
    pintarGrabacion(0);
    refs.entrada.classList.add("ps-chat-entrada--grabando");
  });
  const reloj = { t: 0 };
  tl.to(reloj, { t: DURACION_VOZ + 0.4, duration: DURACION_VOZ + 0.4, ease: "none", onUpdate: () => pintarGrabacion(reloj.t) });
  tl.to({}, { duration: 0.15 });

  let burbuja;
  tl.call(() => {
    refs.entrada.classList.remove("ps-chat-entrada--grabando");
    burbuja = crearBurbujaVozUsuario("Transcribiendo…", DURACION_VOZ);
    idUltimoEnHistorial = escenario.id;
    agregarAlHistorial(burbuja);
    entrar(burbuja);
  });
  tl.to({}, { duration: 1.1 });
  tl.call(() => {
    burbuja.querySelector(".ps-burbuja-pie").textContent = escenario.texto;
  });
  tl.to({}, { duration: 0.6 });

  let pensando;
  tl.call(() => {
    pensando = agregarAlHistorial(crearBurbujaPensando());
    entrar(pensando, { y: 6 });
  });
  tl.to({}, { duration: 0.9 });

  let respuesta;
  tl.call(() => {
    respuesta = reemplazarEnHistorial(pensando, crearTarjeta(escenario));
    gsap.set(respuesta, { opacity: 0, y: 10, scale: 0.98, transformOrigin: "left bottom" });
    gsap.to(respuesta, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "power3.out" });
  });
  // La respuesta se "lee" sola: sólo avanza el progreso de la onda.
  const avance = { f: 0 };
  tl.to(avance, {
    f: 1,
    duration: DURACION_RESPUESTA,
    ease: "none",
    onUpdate: () => pintarProgreso(respuesta.querySelector(".ps-audio"), avance.f),
  });
  tl.call(() => pintarProgreso(respuesta.querySelector(".ps-audio"), 0));
  tl.to({}, { duration: 1.6 });
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
  refs.entrada.classList.remove("ps-chat-entrada--grabando");
  sembrarIntercambio();
}

/** Un intercambio ya terminado (mensaje + respuesta), agregado de una, sin animar. */
function sembrarIntercambio() {
  const escenario = elegirEscenario();
  const burbuja = escenario.dictado ? crearBurbujaVozUsuario(escenario.texto, DURACION_VOZ) : crearBurbujaUsuario();
  if (!escenario.dictado) burbuja.textContent = escenario.texto;
  let respuesta;
  if (escenario.pregunta) {
    const pregunta = crearPregunta(escenario.pregunta);
    marcarOpcionElegida(pregunta, escenario.pregunta.elegida);
    const eleccion = crearBurbujaUsuario();
    eleccion.textContent = escenario.pregunta.opciones[escenario.pregunta.elegida];
    idUltimoEnHistorial = escenario.id;
    refs.cuerpo.append(burbuja, pregunta, eleccion, crearTarjeta(escenario));
    return;
  }
  if (escenario.confirmar) {
    respuesta = crearConfirmacion(escenario.confirmar.pregunta);
    respuesta.querySelector(".ps-confirmar-fila").outerHTML = '<div class="ps-confirmado">Confirmado ✓</div>';
    idUltimoEnHistorial = escenario.id;
    refs.cuerpo.append(burbuja, respuesta, crearBurbujaTexto(escenario.confirmar.listo));
    return;
  } else {
    respuesta = crearTarjeta(escenario);
  }
  idUltimoEnHistorial = escenario.id;
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
  idUltimoEnHistorial = null;
  if (refs) {
    refs.cuerpo.innerHTML = "";
    escribirEnEntrada("");
    refs.entrada.classList.remove("ps-chat-entrada--grabando");
  }
}
