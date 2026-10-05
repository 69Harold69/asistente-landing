/**
 * Llamada — sale del mockup (pantalla 18, plan sección 2): anillos
 * concéntricos pulsando alrededor de la mascota. No existe en la app. El
 * chip "Próximamente" va en el texto lateral de la sección (ver
 * `index.html`, `#fase-llamada`), no repetido dentro del teléfono — la
 * pantalla imita una llamada entrante real, meter un chip adentro rompería
 * la ficción visual.
 */
export const id = "llamada";

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-llamada">
      <span class="ps-llamada-titular">Yaruki te está llamando</span>
      <div class="ps-pulso-wrap">
        <span class="ps-pulso-anillo" aria-hidden="true"></span>
        <span class="ps-dot" aria-hidden="true"></span>
      </div>
      <span class="ps-llamada-sub">Recordatorio: reunión en 15 minutos</span>
      <div class="ps-llamada-acciones">
        <span class="ps-call-btn ps-call-btn--rechazar" aria-hidden="true"></span>
        <span class="ps-call-btn ps-call-btn--aceptar" aria-hidden="true"></span>
      </div>
    </div>
  `;
}

export function play() {
  return null;
}

export function pause() {}

export function reset() {}
