/**
 * Splash — la app todavía no tiene una pantalla de arranque propia (sólo el
 * ícono del launcher); sale del mockup (plan, sección 2): la mascota con
 * *breathe* sobre el acento sólido, sin texto.
 */
export const id = "splash";

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-splash">
      <span class="ps-dot-escala" aria-hidden="true"><span class="ps-dot"></span></span>
    </div>
  `;
}

/**
 * La mascota respira con CSS (`.ps-splash .ps-dot`, scenes.css) y el scroll
 * del hero la escala desde `stage.js` sobre `.ps-dot-escala`, el envoltorio:
 * cada uno es dueño de su propio `transform`, así no se pisan.
 */
export function play() {
  return null;
}

export function pause() {}

export function reset() {}
