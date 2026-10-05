/**
 * Splash — la app todavía no tiene una pantalla de arranque propia (sólo el
 * ícono del launcher); sale del mockup (plan, sección 2): la mascota con
 * *breathe* sobre el acento sólido, sin texto.
 */
export const id = "splash";

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-splash ps-center">
      <span class="ps-dot" aria-hidden="true"></span>
    </div>
  `;
}

/** Sin coreografía de scroll todavía (etapa 2) — ver KDoc del plan, 5.3. */
export function play() {
  return null;
}

export function pause() {}

export function reset() {}
