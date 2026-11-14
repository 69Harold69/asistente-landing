import { barraDeNavegacion, logotipo } from "../icons.js?v=c142dac662";
import { contar, detener } from "./contar.js?v=c142dac662";

/**
 * Dashboard (cierre) — copia de `ui/dashboard/DashboardScreen.kt` (0.1.6a, `ContenidoDashboard` :186-279):
 * logotipo «Yaruki» (:204) y «Tu día» (:205-209), mensaje «glass» (`mensajeResumenDia`, :361-377), tarjeta
 * Racha de ancho completo (:218, :392-411), fila «Tareas hoy» + «Hábitos» (:219-228, :413-455), «Proyectos
 * activos» (:232-239, :466-518) y las tareas pendientes **por secciones** «Vencidas» (con «Pasar todo a hoy»),
 * «Hoy» y «Próximas» (:241-278, `EstadoTareaDashboard` solo VENCIDA/PENDIENTE/POSPUESTA: una tarea hecha no
 * aparece, y «Pendiente»/«Vencida» ya no llevan pastilla, :539-543). Barra de 4 y botón «Pídeselo a Yaruki».
 *
 * La pantalla real se desplaza; aquí el contenido va en el orden real y lo que no cabe queda bajo el botón y la
 * barra, igual que en la app al abrirla. Datos de ejemplo coherentes entre sí: «Llevas 2 de 4 tareas de hoy»
 * (2/4), racha de 6 días en «Meditar 10 minutos» (el hábito diario de Notificaciones; «Leer 20 minutos», el del detalle de Hábitos, aún no tiene racha), 1 proyecto activo, 1 tarea vencida y 2 de hoy sin hacer.
 */
export const id = "dashboard";

let conteos = [];
let raiz = null;

const fila = (titulo) => `<div class="ps-fila-tarea"><span>${titulo}</span></div>`;

export function mount(contenedor) {
  raiz = contenedor;
  contenedor.innerHTML = `
    <div class="escena ps-dash">
      ${logotipo()}
      <h2 class="ps-titulo">Tu día</h2>
      <div class="ps-glass">Llevas 2 de 4 tareas de hoy. Tu racha activa: 6 días en Meditar 10 minutos.</div>
      <div class="ps-bento-card ps-bento-card--racha">
        <div class="ps-bento-etiqueta">Racha activa</div>
        <div class="ps-bento-valor"><span data-contar="6">6</span> días — Meditar 10 minutos</div>
      </div>
      <div class="ps-dash-fila">
        <div class="ps-bento-card">
          <div class="ps-bento-etiqueta">Tareas hoy</div>
          <div class="ps-bento-valor"><span data-contar="2">2</span>/4</div>
          <div class="ps-barra"><div class="ps-barra-relleno" data-progreso="0.5"></div></div>
        </div>
        <div class="ps-bento-card">
          <div class="ps-bento-etiqueta">Hábitos</div>
          <div class="ps-bento-valor"><span data-contar="2">2</span>/3 hoy</div>
        </div>
      </div>
      <div class="ps-bento-card ps-proyectos">
        <div class="ps-bento-etiqueta ps-proyectos-titulo">Proyectos activos</div>
        <div class="ps-proyecto">
          <div class="ps-proyecto-linea"><span class="ps-proyecto-nombre">Mudanza</span><span class="ps-proyecto-conteo">3 de 8 hechos</span></div>
          <div class="ps-barra"><div class="ps-barra-relleno" data-progreso="0.375"></div></div>
        </div>
      </div>
      <div class="ps-seccion">
        <span class="ps-seccion-titulo">Vencidas</span>
        <span class="ps-seccion-accion">Pasar todo a hoy</span>
      </div>
      <div class="ps-pendientes">${fila("Pagar la luz")}</div>
      <div class="ps-seccion"><span class="ps-seccion-titulo">Hoy</span></div>
      <div class="ps-pendientes">${fila("Llamar al doctor")}${fila("Enviar el reporte de ventas")}</div>
      ${barraDeNavegacion("inicio")}
    </div>
  `;
}

/** Los números del bento cuentan hasta su valor al aterrizar en el cierre. */
export function play() {
  detener(conteos);
  conteos = contar(raiz, { retraso: 0.2 });
  return null;
}

export function pause() {
  detener(conteos, raiz);
  conteos = [];
}

export function reset() {
  pause();
}
