import { logotipo } from "../icons.js?v=c142dac662";

/**
 * Login — copia de `ui/auth/LoginScreen.kt:104-193` (0.1.6a): logotipo de letras «Yaruki» (`displaySmall`,
 * `:110`; ya no el círculo de la mascota, android #165), «Iniciar sesión» (`headlineSmall`, `:112`), los dos
 * campos, «Ingresar», «¿Olvidaste tu contraseña?», «Continuar con Google» y «¿No tienes cuenta? Regístrate»,
 * en ese orden y con esos textos. La columna va alineada al inicio, no centrada (`Column` sin
 * `horizontalAlignment`), con los botones a todo el ancho.
 */
export const id = "login";

export function mount(contenedor) {
  contenedor.innerHTML = `
    <div class="escena ps-login">
      ${logotipo(true)}
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
