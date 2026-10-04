# asistente-landing — sitio de Yaruki

Sitio estático (HTML/CSS, sin paso de build) para `yaruki.hjgr.dev`. Construido
según `asistente-ia-ops/docs/plan-landing-yaruki.md`. **Esta primera versión
cubre sólo la etapa 10 del plan** (páginas legales) más un `index.html`
provisional — el scrollytelling y el teléfono 3D de las etapas 1-9 vienen
después.

## Estructura

```
asistente-landing/
├── index.html              Portada provisional: nombre, significado, enlaces legales
├── privacidad/index.html   Política de privacidad
├── terminos/index.html     Términos y condiciones
├── eliminar-cuenta/index.html  Cómo eliminar tu cuenta
├── assets/
│   ├── css/  tokens.css (colores/tipografía/espaciado), fonts.css (@font-face),
│   │         base.css (layout y componentes compartidos)
│   └── fonts/  .woff2 autoalojados + OFL.txt
└── README.md
```

`phone.css`, `scenes.css` y `assets/js/` de la sección 5.2 del plan no existen
todavía: se agregan en las etapas 1-9 (esqueleto/tokens del home completo,
teléfono 3D, coreografía, fases A/B/C, demo de tema).

## BRAND_NAME

No hay una constante de código (el sitio no tiene build ni JS de plantillas).
El nombre **"Yaruki"** aparece como texto literal en:
- `<title>` y el primer `<h1>` de cada página,
- el `wordmark` del header (`.wordmark` en `base.css`) en las 4 páginas,
- el pie de página de las 4 páginas,
- `privacidad/index.html` y `terminos/index.html` (varias menciones en el cuerpo).

Si el nombre cambia, es un buscar-y-reemplazar de "Yaruki" en esos archivos
(y del lema, si se agrega uno).

## Fuentes autoalojadas

Convertidas de los `.ttf` de `asistente-android/app/src/main/res/font/` con
`woff2_compress` (paquete `woff2` del sistema; no se usó `fonttools` porque no
estaba instalado y no había `pip`/`pipx` disponibles en este entorno — si se
necesita subsetting más agresivo más adelante, instalar
`pip install --user fonttools brotli` y usar `fonttools subset`).

Licencia: **SIL Open Font License 1.1**, texto completo en
`assets/fonts/OFL.txt`. La cabecera de copyright que puse (`Copyright 2019 The
Baloo 2 Project Authors` / `Copyright 2018 The Manrope Project Authors`) es la
que recuerdo de los metadatos de Google Fonts para estas dos familias, **pero
no la verifiqué contra el archivo `OFL.txt` original de cada familia en este
pase** — pendiente de confirmar antes de publicar (no cambia los términos de
la licencia, sólo la atribución exacta).

## Pendientes / marcadores (no inventar al publicar)

1. **`[COMPLETAR_RETENCION_BACKUPS]`** en `privacidad/index.html` (sección 7)
   y en `eliminar-cuenta/index.html`: el dueño está decidiendo el plazo de
   retención de los backups del servidor. Es el único texto con marcador que
   queda en las páginas públicas, por instrucción explícita — hay que
   reemplazarlo en los dos archivos (son el mismo texto) antes de publicar.
2. **Atribución exacta de las fuentes** (ver arriba).
3. El badge de App Store en `index.html` queda deshabilitado (decisión 3.2 del
   plan); cuando haya ficha pública de Android, el CTA "Únete a la beta" de la
   portada provisional cambia a "Descárgala en Google Play" (decisión 3.8).

## Fuentes citadas (verificación, no en la página pública)

- **Vertex AI y entrenamiento de modelos:** según la documentación pública de
  Google Cloud, por defecto Google Cloud no usa los datos del cliente
  (prompts, respuestas) para entrenar sus modelos fundacionales, y no los usa
  para entrenar o afinar ningún modelo sin permiso explícito del cliente —
  permiso que este proyecto no otorga. Fuentes:
  - Google Cloud, *Generative AI, Privacy, and Google Cloud* (whitepaper, ago. 2023):
    <https://services.google.com/fh/files/misc/genai_privacy_google_cloud_202308.pdf>
  - Google Cloud, *Gemini Enterprise Agent Platform and zero data retention*:
    <https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention>
  - Nota: por defecto Vertex AI guarda el input/output por 24 horas para
    reducir latencia y puede registrar prompts para monitoreo de abuso; esto
    es compatible con la sección 7 de la política ("conservamos mientras la
    cuenta esté activa", ya que esa ventana de 24h es de Google, no nuestra) y
    no contradice el "uso limitado" declarado.
- **LFPDPPP 2025:** la ley nueva fue publicada el 20 de marzo de 2025,
  reemplaza a la INAI con la Secretaría Anticorrupción y Buen Gobierno como
  autoridad, y **elimina la obligación de informar sobre transferencias en el
  aviso de privacidad** (artículo 15 reformado). Pese a eso, la política de
  Yaruki **sí declara la transferencia internacional** (sección 5) porque
  Google Play lo exige igual y es una buena práctica de transparencia.
  Fuentes:
  - Basham, *Nueva Ley Federal de Protección de Datos Personales en Posesión
    de los Particulares publicada en el DOF*:
    <https://basham.com.mx/en/nueva-ley-federal-de-proteccion-de-datos-personales-en-posesion-de-los-particulares-publicada-en-el-diario-oficial-de-la-federacion/>
  - Pirani Risk, *LFPDPPP: Guía de la Ley de Protección de Datos en México*:
    <https://www.piranirisk.com/es/hub-regulatorio/lfpdppp-ley-proteccion-datos-mexico>
  - El plazo de **20 días hábiles** para responder derechos ARCO que usa la
    política (sección 9) viene de la instrucción del dueño del proyecto, no
    de un artículo específico que haya podido confirmar en la ley nueva de
    2025 (las fuentes consultadas no mencionan el plazo); si la ley nueva fijó
    un plazo distinto, hay que corregirlo antes de publicar.

## Despliegue (NO ejecutado — sólo instrucciones para cuando el dueño lo apruebe)

### 1. DNS en Cloudflare

Agregar un registro:

| Tipo | Nombre | Destino | Proxy |
|---|---|---|---|
| A | `yaruki` | `159.223.135.90` | **DNS only** (nube gris, no naranja) |

Igual que `asistente.hjgr.dev`, para que Caddy pueda emitir el certificado TLS
directamente con el reto HTTP-01/TLS-ALPN sin que Cloudflare intercepte la
conexión.

### 2. Clonar el repo en el droplet

```bash
ssh <usuario>@<droplet>
git clone <url-del-repo> /home/harold2003/asistente-landing
```

(Este repo todavía no existe en GitHub: el PM avisa al dueño antes de crearlo
y hacer push. Mientras tanto, el `git clone` de arriba usa una ruta de ejemplo.)

### 3. Bloque de Caddy

Agregar al `Caddyfile` del droplet (junto al bloque existente de
`asistente.hjgr.dev`), **sin tocarlo**:

```caddyfile
yaruki.hjgr.dev {
	root * /home/harold2003/asistente-landing
	encode gzip zstd

	file_server

	@tieneBarra path_regexp final ^(.*)/$
	try_files {path} {path}/index.html {path}.html

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "geolocation=(), camera=(), microphone=(), interest-cohort=()"
		Content-Security-Policy "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
	}
}
```

Notas sobre la CSP: hoy el sitio no tiene JS ni fuentes externas, así que
`script-src 'self'` y `font-src 'self'` alcanzan. Cuando se agregue GSAP
vendorizado (etapas 2+), sigue siendo `'self'` porque el plan dice que se
vendoriza en el repo, no por CDN — no hay que relajar la CSP para eso.

### 4. Validar y recargar

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Validar primero es obligatorio: un error en el bloque nuevo no debe tumbar
`asistente.hjgr.dev`.

### 5. Actualizar

```bash
cd /home/harold2003/asistente-landing && git pull
# sólo si cambió el Caddyfile:
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

No toca Sail ni el worker de colas del backend. Impacto en RAM: despreciable.

## Capturas de verificación visual

Tomadas con Chromium headless, en claro/oscuro × desktop (1440×900)/móvil
(390×844), para las 4 páginas. Ver el reporte de la sesión que construyó este
repo para las rutas exactas (carpeta de scratchpad de esa sesión, no forma
parte de este repo).
