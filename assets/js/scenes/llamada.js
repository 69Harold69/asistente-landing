import { iconoTelefono } from "../icons.js?v=7e55092f39";

/**
 * Llamada del usuario a Yaruki (issue #6 de la landing; backend #111,
 * android #96-#99). Todavía no existe en la app: la pantalla sigue el plan
 * de android #97 (estados, nivel de micrófono, contador, colgar). El chip
 * "Próximamente" va en el texto lateral de la sección (`index.html`,
 * `#fase-llamada`), no repetido dentro del teléfono.
 *
 * Ciclo (bucle mientras la sección está activa): "Llamando a Yaruki..." →
 * "En llamada" con el contador corriendo, alternando "Escuchando..." (barras
 * de nivel del micrófono) y "Yaruki está hablando..." (anillos más vivos).
 * Todo con GSAP, atado a `play()`/`pause()`/`reset()` de `stage.js`.
 * Con `prefers-reduced-motion` queda un cuadro estático legible.
 */
export const id = "llamada";

let refs = null;
let tl = null;
let tweensAnillos = [];
const ESTADO_ESTATICO = { titular: "En llamada", estado: "Escuchando...", segundos: 14 };

function prefiereMovimientoReducido() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function formatear(segundos) {
  const s = Math.max(0, Math.floor(segundos));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-llamada">
      <div class="ps-llamada-arriba">
        <span class="ps-llamada-titular">Llamando a Yaruki...</span>
        <span class="ps-llamada-nombre">Yaruki</span>
        <div class="ps-pulso">
          <span class="ps-pulso-anillo" aria-hidden="true"></span>
          <span class="ps-pulso-anillo" aria-hidden="true"></span>
          <span class="ps-pulso-anillo" aria-hidden="true"></span>
          <span class="ps-dot" aria-hidden="true"></span>
        </div>
        <span class="ps-llamada-contador" aria-hidden="true">00:00</span>
        <span class="ps-llamada-estado"></span>
        <span class="ps-llamada-nivel" aria-hidden="true">
          <span class="ps-nivel-barra"></span><span class="ps-nivel-barra"></span>
          <span class="ps-nivel-barra"></span><span class="ps-nivel-barra"></span>
          <span class="ps-nivel-barra"></span>
        </span>
      </div>
      <div class="ps-llamada-acciones">
        <span class="ps-boton-llamada ps-boton-llamada--colgar" aria-hidden="true">${iconoTelefono()}</span>
      </div>
    </div>
  `;
  refs = {
    raiz: contenedor.querySelector(".ps-llamada"),
    titular: contenedor.querySelector(".ps-llamada-titular"),
    contador: contenedor.querySelector(".ps-llamada-contador"),
    estado: contenedor.querySelector(".ps-llamada-estado"),
    anillos: Array.from(contenedor.querySelectorAll(".ps-pulso-anillo")),
    barras: Array.from(contenedor.querySelectorAll(".ps-nivel-barra")),
    colgar: contenedor.querySelector(".ps-boton-llamada--colgar"),
  };
  mostrarFijo();
}

/** Cuadro legible sin animar: lo que ve quien pidió menos movimiento (y el estado inicial). */
function mostrarFijo() {
  const { titular, estado, segundos } = ESTADO_ESTATICO;
  refs.raiz.dataset.fase = "escuchando";
  refs.titular.textContent = titular;
  refs.estado.textContent = estado;
  refs.contador.textContent = formatear(segundos);
  gsap.set(refs.anillos, { scale: 1, opacity: 0.5 });
  gsap.set(refs.barras, { scaleY: 0.6 });
}

function ponerFase(fase, titular, estado) {
  refs.raiz.dataset.fase = fase;
  refs.titular.textContent = titular;
  refs.estado.textContent = estado;
}

function iniciarAnillos() {
  tweensAnillos.forEach((t) => t.kill());
  gsap.set(refs.anillos, { transformOrigin: "center" });
  tweensAnillos = refs.anillos.map((anillo, i) =>
    gsap.fromTo(
      anillo,
      { scale: 0.85, opacity: 0.6 },
      { scale: 1.5, opacity: 0, duration: 1.8, ease: "power1.out", repeat: -1, delay: i * 0.6 }
    )
  );
}

function construir() {
  const reloj = { s: 0 };
  const t = gsap.timeline({ repeat: -1 });
  const actualizarReloj = () => (refs.contador.textContent = formatear(reloj.s));

  t.call(() => {
    reloj.s = 0;
    actualizarReloj();
    ponerFase("llamando", "Llamando a Yaruki...", "");
    gsap.set(refs.barras, { scaleY: 0.25 });
    gsap.set(refs.colgar, { scale: 1 });
  });
  t.to({}, { duration: 2.2 }); // timbrando
  t.call(() => ponerFase("escuchando", "En llamada", "Escuchando..."));
  // El contador corre durante toda la conversación.
  t.to(reloj, { s: 14, duration: 12, ease: "none", onUpdate: actualizarReloj }, "<");
  // Escuchando: el nivel del micrófono sube y baja (el usuario habla).
  t.to(
    refs.barras,
    { scaleY: () => 0.5 + Math.random() * 1.3, duration: 0.22, repeat: 9, yoyo: true, stagger: { each: 0.05, repeat: 9 } },
    "<"
  );
  t.call(() => ponerFase("hablando", "En llamada", "Yaruki está hablando..."), null, ">+0.1");
  t.to({}, { duration: 4 });
  t.call(() => ponerFase("escuchando", "En llamada", "Escuchando..."));
  t.to(
    refs.barras,
    { scaleY: () => 0.4 + Math.random() * 1.1, duration: 0.25, repeat: 5, yoyo: true, stagger: { each: 0.06, repeat: 5 } },
    "<"
  );
  t.to({}, { duration: 1.6 });
  // Se toca Colgar: feedback táctil y reinicio del ciclo.
  t.to(refs.colgar, { scale: 0.9, duration: 0.12, yoyo: true, repeat: 1 });
  t.to({}, { duration: 0.6 });
  return t;
}

export function play() {
  if (!refs) return null;
  if (tl) tl.kill();
  tweensAnillos.forEach((t) => t.kill());
  tweensAnillos = [];
  if (prefiereMovimientoReducido()) {
    tl = null;
    mostrarFijo();
    return null;
  }
  iniciarAnillos();
  tl = construir();
  tl.play(0);
  return [tl, ...tweensAnillos];
}

export function pause() {
  if (tl) tl.pause();
  tweensAnillos.forEach((t) => t.pause());
}

export function reset() {
  if (tl) tl.kill();
  tl = null;
  tweensAnillos.forEach((t) => t.kill());
  tweensAnillos = [];
  if (refs) mostrarFijo();
}
