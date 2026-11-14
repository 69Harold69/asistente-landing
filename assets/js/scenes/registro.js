/**
 * Registro de escenas (plan, 5.3) — cada módulo expone `id`, `mount()`,
 * `play()`, `pause()` y `reset()`. En esta etapa `play()`/`pause()`/`reset()`
 * son no-ops documentados en cada escena: la coreografía ligada al scroll
 * (ScrollTrigger, cruce con giro 360°) es la etapa 4, fuera de esta corrida.
 */
import * as splash from "./splash.js?v=aa89f90c40";
import * as login from "./login.js?v=aa89f90c40";
import * as chat from "./chat.js?v=aa89f90c40";
import * as elementos from "./elementos.js?v=aa89f90c40";
import * as habitos from "./habitos.js?v=aa89f90c40";
import * as logro from "./logro.js?v=aa89f90c40";
import * as avisos from "./avisos.js?v=aa89f90c40";
import * as llamada from "./llamada.js?v=aa89f90c40";
import * as dashboard from "./dashboard.js?v=aa89f90c40";

export const ESCENAS = {
  splash,
  login,
  chat,
  elementos,
  habitos,
  logro,
  avisos,
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
  "avisos",
  "llamada",
  "dashboard",
];
