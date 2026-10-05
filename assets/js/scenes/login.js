/**
 * Login — mezcla (plan, sección 2): textos y orden de campos EXACTOS de
 * `ui/auth/LoginScreen.kt` (la app ya los tiene, sin marca); encabezado con
 * la mascota, estilo del mockup 02 (hueco visual que la app no cubre).
 */
export const id = "login";

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-login ps-pad">
      <div class="ps-center">
        <span class="ps-dot" aria-hidden="true"></span>
      </div>
      <h2 class="ps-title ps-center">Iniciar sesión</h2>
      <div class="ps-field">
        <span>Correo</span>
        <div class="ps-input">tú@correo.com</div>
      </div>
      <div class="ps-field">
        <span>Contraseña</span>
        <div class="ps-input">••••••••</div>
      </div>
      <div class="ps-btn ps-btn--primary">Ingresar</div>
      <div class="ps-link">¿Olvidaste tu contraseña?</div>
      <div class="ps-btn ps-btn--outline">Continuar con Google</div>
      <div class="ps-link">¿No tienes cuenta? <b>Regístrate</b></div>
    </div>
  `;
}

export function play() {
  return null;
}

export function pause() {}

export function reset() {}
