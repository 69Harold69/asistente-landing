/**
 * Logro — sale del mockup (pantalla 14, plan sección 2): modal con confeti.
 * El sistema de recompensas no existe en la app y sus reglas no están
 * definidas (plan, 4.4, punto 3: "sin prometer reglas — al llegar a 30 días
 * desbloqueas X está prohibido"), así que el texto es deliberadamente
 * genérico ("vas muy bien") en vez de repetir el ejemplo del mockup
 * ("Desbloqueaste el marco Constancia", que SÍ nombra una regla concreta
 * que no existe todavía). Lleva el chip "Próximamente" (regla de la
 * sección 2 del plan: toda función fuera del MVP se marca así).
 */
export const id = "logro";

const CONFETIS = [
  { top: "16%", left: "18%", size: 9, opacity: 0.85 },
  { top: "26%", left: "78%", size: 7, opacity: 0.6 },
  { top: "70%", left: "14%", size: 8, opacity: 0.55 },
  { top: "64%", left: "82%", size: 6, opacity: 0.7 },
  { top: "10%", left: "52%", size: 6, opacity: 0.5 },
];

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-logro">
      <div class="ps-logro-modal">
        <div class="ps-logro-badge" aria-hidden="true"></div>
        <strong>Vas muy bien</strong>
        <p>Cuando tu constancia sea lo bastante fuerte, Yaruki te lo va a hacer saber.</p>
        <span class="ps-chip-proximamente">Próximamente</span>
      </div>
    </div>
  `;

  // Puntos de confeti: posición/tamaño inline vía CSSOM (asignación directa
  // a `element.style`), no un atributo `style=""` en el HTML — la CSP del
  // sitio prohíbe el segundo, no el primero (ver README).
  const escena = contenedor.querySelector(".ps-logro");
  CONFETIS.forEach((c) => {
    const punto = document.createElement("span");
    punto.className = "ps-confeti";
    punto.setAttribute("aria-hidden", "true");
    punto.style.top = c.top;
    punto.style.left = c.left;
    punto.style.width = `${c.size}px`;
    punto.style.height = `${c.size}px`;
    punto.style.opacity = String(c.opacity);
    escena.appendChild(punto);
  });
}

export function play() {
  return null;
}

export function pause() {}

export function reset() {}
