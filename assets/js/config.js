/*
  Yaruki — configuración de la landing (plan, "Reglas").
  `BRAND_NAME`: única fuente del nombre para lo que genera JS (el HTML de
  cada página sigue escribiendo "Yaruki" literal en el texto visible — ver
  README, sección BRAND_NAME).
  `BETA_URL`: mientras esté vacía, el botón "Únete a la beta" no navega y
  muestra el chip "Próximamente" (decisión 3.8 del plan). Cuando exista el
  enlace de prueba cerrada de Google Play, se pega acá y el botón se activa
  solo — no hace falta tocar ningún otro archivo.
*/
export const BRAND_NAME = "Yaruki";
export const BETA_URL = "";
