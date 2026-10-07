/**
 * Login — mezcla (plan, sección 2): textos y orden de campos EXACTOS de
 * `ui/auth/LoginScreen.kt` (la app ya los tiene, sin marca); encabezado con
 * la mascota, estilo del mockup 02 (hueco visual que la app no cubre).
 */
export const id = "login";

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-login">
      <span class="ps-dot" aria-hidden="true"></span>
      <h2 class="ps-titulo">Iniciar sesión</h2>
      <div class="ps-campo"><span class="ps-campo-etiqueta">Correo</span>tú@correo.com</div>
      <div class="ps-campo"><span class="ps-campo-etiqueta">Contraseña</span>••••••••</div>
      <div class="ps-btn ps-btn--primario">Ingresar</div>
      <div class="ps-btn ps-btn--texto">¿Olvidaste tu contraseña?</div>
      <div class="ps-btn ps-btn--contorno">Continuar con Google</div>
      <div class="ps-btn ps-btn--texto">¿No tienes cuenta? Regístrate</div>
    </div>
  `;
}

export function play() {
  return null;
}

export function pause() {}

export function reset() {}
