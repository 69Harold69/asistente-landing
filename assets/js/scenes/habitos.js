/**
 * Hábitos — el detalle de un hábito de la app 0.1.6a, copiado de
 * `ui/elementos/habitos/HabitoDetalleScreen.kt` y `TextosHabito.kt`
 * (android `origin/main`, `2914103`): `BarraElemento` con «Regresar» y ⋮,
 * nombre, «Estado: Activo · En curso», «Creado: …», la tarjeta «Racha»
 * (racha, constancia, antigüedad), la fila «Cumplido hoy» con su switch y
 * «Hoy te toca», y los botones «Pausar» y «Editar». El mapa de calor del
 * mockup viejo se quitó: la app no lo tiene.
 *
 * Datos de ejemplo coherentes con la lógica real: ayer no se cumplió, así que
 * antes de marcar hoy la racha es 0 («Aún sin racha») y el switch está
 * apagado; al marcarlo, la racha pasa a «1 día» y la constancia sube de 10 a
 * 11 de los últimos 15 días (`HabitoDetalleUiState.kt`, `RachaVigente.kt`).
 */
export const id = "habitos";

const ANTIGUEDAD = 15;
const CUMPLIDOS_ANTES = 10;

// Mismas funciones que `TextosHabito.kt` (sin racha, singular y plural).
const textoRacha = (dias) => (dias <= 0 ? "Aún sin racha" : dias === 1 ? "1 día" : `${dias} días`);
const textoConstancia = (cumplidos, dias) =>
  dias <= 1 ? `Cumpliste ${cumplidos} de 1 día` : `Cumpliste ${cumplidos} de los últimos ${dias} días`;
const textoAntiguedad = (dias) => `Antigüedad: ${dias === 1 ? "1 día" : `${dias} días`}`;

/** «Creado: 28 oct 2026 · 08:15» (`textoCreadoModificado`): hace `ANTIGUEDAD` días, con fecha corta de México. */
function textoCreado() {
  try {
    const d = new Date();
    d.setDate(d.getDate() - ANTIGUEDAD);
    const fecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" })
      .format(d)
      .replace(/\./g, "")
      .replace(/ de /g, " ");
    return `Creado: ${fecha} · 08:15`;
  } catch {
    return "Creado: hace 15 días · 08:15";
  }
}

// Íconos de Material (rellenos) de `Icons.AutoMirrored.Filled.ArrowBack` y `Icons.Filled.MoreVert`.
const ICONO_REGRESAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`;
const ICONO_MAS = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>`;

let refs = null;
let demora = null;

function prefiereMovimientoReducido() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Cumplido hoy: prende el switch; la racha pasa de «Aún sin racha» a «1 día» y la constancia sube a 11 de 15. */
function marcarHoy(cumplido, { animar = false } = {}) {
  if (!refs) return;
  refs.switch.classList.toggle("ps-switch--on", cumplido);
  refs.racha.textContent = textoRacha(cumplido ? 1 : 0);
  refs.constancia.textContent = textoConstancia(CUMPLIDOS_ANTES + (cumplido ? 1 : 0), ANTIGUEDAD);
  // `CumplimientoHoyRow`: «Hoy te toca» solo se ve con el switch apagado.
  refs.hoy.hidden = cumplido;
  if (animar && cumplido) {
    // La racha sube con un rebote chico (sólo `transform`).
    gsap.fromTo(refs.racha, { scale: 1.25, y: -2 }, { scale: 1, y: 0, duration: 0.6, ease: "back.out(3)" });
  }
}

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-habitos">
      <div class="ps-topbar ps-topbar--elemento">
        <span class="ps-topbar-icono">${ICONO_REGRESAR}</span>
        <span class="ps-topbar-titulo">Detalle de hábito</span>
        <span class="ps-topbar-icono">${ICONO_MAS}</span>
      </div>
      <div class="ps-habitos-cuerpo">
        <h2 class="ps-titulo">Leer 20 minutos</h2>
        <p class="ps-habito-estado">Estado: Activo · En curso</p>
        <p class="ps-habito-creado">${textoCreado()}</p>
        <div class="ps-card">
          <div class="ps-card-titulo">Racha</div>
          <p class="ps-racha" data-racha>${textoRacha(0)}</p>
          <p data-constancia>${textoConstancia(CUMPLIDOS_ANTES, ANTIGUEDAD)}</p>
          <p>${textoAntiguedad(ANTIGUEDAD)}</p>
        </div>
        <div class="ps-card ps-fila-switch">
          <div class="ps-fila-textos">
            <span>Cumplido hoy</span>
            <span class="ps-fila-sub" data-hoy>Hoy te toca</span>
          </div>
          <div class="ps-switch" aria-hidden="true"><span class="ps-switch-perilla"></span></div>
        </div>
        <div class="ps-btn ps-btn--contorno">Pausar</div>
        <div class="ps-btn ps-btn--primario">Editar</div>
      </div>
    </div>
  `;
  refs = {
    switch: contenedor.querySelector(".ps-switch"),
    racha: contenedor.querySelector("[data-racha]"),
    constancia: contenedor.querySelector("[data-constancia]"),
    hoy: contenedor.querySelector("[data-hoy]"),
  };
}

/**
 * El switch "Cumplido hoy" se activa solo a los ~2 s de entrar a la sección
 * — una demo de cómo se ve un hábito cumplido hoy. `pause()` cancela el
 * temporizador si la sección queda atrás antes de que dispare.
 */
export function play() {
  if (!refs) return null;
  if (demora) demora.kill();
  if (prefiereMovimientoReducido()) {
    marcarHoy(true);
    return null;
  }
  marcarHoy(false);
  demora = gsap.delayedCall(2.2, () => marcarHoy(true, { animar: true }));
  return demora;
}

export function pause() {
  if (demora) {
    demora.kill();
    demora = null;
  }
}

export function reset() {
  pause();
  if (refs) marcarHoy(false);
}
