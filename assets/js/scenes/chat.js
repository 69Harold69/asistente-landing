import { iconoTrazo, iconoMic } from "../icons.js";

/**
 * Chat — copiado de `ChatScreen.kt`/`TarjetaElementoChat.kt` (plan, 4.3):
 * burbujas, tarjeta rica y Confirmar/Rechazar, input con micrófono. Estática
 * en esta etapa (sin tecleo ni rotación del pool de escenarios — eso es la
 * etapa 5). Los 2 mensajes son 2 de los escenarios aprobados en la sección 2
 * del plan: la Lista demuestra la tarjeta rica; la posposición demuestra que
 * el asistente nunca actúa sin que la persona lo confirme.
 */
export const id = "chat";

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-chat">
      <div class="ps-chat-header">
        <span class="ps-dot" aria-hidden="true"></span>
        <span>Chat</span>
      </div>
      <div class="ps-chat-body">
        <div class="ps-bubble ps-bubble--user">Agrega leche, pan y huevos a mi lista del súper</div>
        <div class="ps-rich-card">
          <div class="ps-rich-card-head">
            ${iconoTrazo("listas")}
            <span class="ps-rich-card-tipo">LISTA</span>
          </div>
          <div class="ps-rich-card-titulo">Súper</div>
          <div class="ps-rich-card-detalle">0 de 3 hechos</div>
          <div class="ps-rich-card-link">Ver lista →</div>
        </div>
        <div class="ps-bubble ps-bubble--user">Pospón lo de la renta para el viernes</div>
        <div class="ps-bubble ps-bubble--assistant">
          ¿Confirmas posponer "Pagar la renta" para el viernes?
          <div class="ps-confirm-row">
            <span class="ps-chip-btn ps-chip-btn--primary">Confirmar</span>
            <span class="ps-chip-btn ps-chip-btn--outline">Rechazar</span>
          </div>
        </div>
      </div>
      <div class="ps-chat-input">
        <div class="ps-input">Escribe un mensaje...</div>
        <span class="ps-mic-btn" aria-hidden="true">${iconoMic()}</span>
      </div>
    </div>
  `;
}

export function play() {
  return null;
}

export function pause() {}

export function reset() {}
