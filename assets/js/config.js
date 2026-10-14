/*
  Yaruki — configuración de la landing (plan, "Reglas").
  `BRAND_NAME`: única fuente del nombre para lo que genera JS (el HTML de
  cada página sigue escribiendo "Yaruki" literal en el texto visible — ver
  README, sección BRAND_NAME).
  `BETA_URL`: a dónde lleva el botón "Únete a la beta". Es el Google Group
  de testers: la prueba cerrada de Google Play usa ese grupo como lista, así
  que unirse es el paso 1. El paso 2 (aceptar la invitación en Play) está en
  `#cta` de `index.html`. Vacía, el botón sale deshabilitado con el chip
  "Próximamente" (decisión 3.8 del plan).
*/
export const BRAND_NAME = "Yaruki";
export const BETA_URL = "https://groups.google.com/g/yaruki-beta/";
