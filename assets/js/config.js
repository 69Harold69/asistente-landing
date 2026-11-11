/*
  Yaruki — configuración de la landing (plan, "Reglas").
  `BRAND_NAME`: única fuente del nombre para lo que genera JS (el HTML de
  cada página sigue escribiendo "Yaruki" literal en el texto visible — ver
  README, sección BRAND_NAME).
  El enlace de "Únete a la beta" NO está aquí: vive solo en el `href` de los
  botones `[data-cta-beta]` de `index.html` (mejora progresiva, #21).
*/
export const BRAND_NAME = "Yaruki";
/*
  `IPHONE_AVISO_URL`: Google Group de «avísame cuando salga» para iPhone (la CSP bloquea formularios, así que es un
  enlace). **Vacía = no se ve nada**: el HTML no trae el enlace ni ningún texto que prometa el aviso. Con URL, el
  enlace real va EN el HTML (mejora progresiva, igual que la beta): pega el fragmento del README («Aviso de iPhone»)
  dentro de la tarjeta «Yaruki para iPhone» de `#lo-que-viene` con esta misma URL. Nada de JS la lee:
  `scripts/pruebas/validar.mjs` (regla `portada`) falla si la constante y el HTML no coinciden.
*/
export const IPHONE_AVISO_URL = "";
