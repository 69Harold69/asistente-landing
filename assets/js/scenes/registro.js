/**
 * Registro de escenas (plan, 5.3) — cada módulo expone `id`, `mount()`,
 * `play()`, `pause()` y `reset()`. En esta etapa `play()`/`pause()`/`reset()`
 * son no-ops documentados en cada escena: la coreografía ligada al scroll
 * (ScrollTrigger, cruce con giro 360°) es la etapa 4, fuera de esta corrida.
 */
import * as splash from "./splash.js";
import * as login from "./login.js";
import * as chat from "./chat.js";
import * as elementos from "./elementos.js";
import * as habitos from "./habitos.js";
import * as logro from "./logro.js";
import * as llamada from "./llamada.js";
import * as dashboard from "./dashboard.js";

export const ESCENAS = {
  splash,
  login,
  chat,
  elementos,
  habitos,
  logro,
  llamada,
  dashboard,
};

export const ORDEN_ESCENAS = [
  "splash",
  "login",
  "chat",
  "elementos",
  "habitos",
  "logro",
  "llamada",
  "dashboard",
];
