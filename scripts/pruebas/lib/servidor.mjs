/*
  Servidor estático que emula lo relevante del bloque de Caddy de producción
  (README, "Bloque de Caddy"): try_files {path} {path}/index.html {path}.html,
  404 -> 404.html (con estado 404), `hide`, Cache-Control de /assets/* y las
  MISMAS cabeceras de seguridad, CSP incluida. Si algo viola la CSP aquí,
  también la violará en producción.

  Es una fuente de verdad doble: si cambias el bloque de Caddy del README,
  cambia también CABECERAS_CADDY (la prueba `validar` compara las dos).
*/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ_SITIO = process.env.YARUKI_RAIZ ? path.resolve(process.env.YARUKI_RAIZ) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const CABECERAS_CADDY = {
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=(), interest-cohort=()",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

/*
  `hide` de Caddy: MISMA lista que el bloque de Caddy del README (la regla `hide-readme` de
  `validar` las compara). Caddy interpreta un patron sin separador de ruta como un NOMBRE que se
  oculta en cualquier profundidad (archivo o carpeta, con todo su contenido), y admite comodines
  (https://caddyserver.com/docs/caddyfile/directives/file_server#hide); la comparacion es
  sensible a mayusculas. Aqui cada segmento de la ruta se compara con cada patron.
*/
export const HIDE_CADDY = [".git*", "README.md", "scripts", "package.json", "package-lock.json", "node_modules"];
export const OCULTOS = HIDE_CADDY; // nombre anterior, por compatibilidad

const aRegex = (patron) => new RegExp(`^${patron.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
const REGEX_HIDE = HIDE_CADDY.map(aRegex);
/** ¿Algun segmento de la ruta cae en el `hide` de Caddy? */
export const estaOculto = (ruta) => ruta.split("/").filter(Boolean).some((seg) => REGEX_HIDE.some((r) => r.test(seg)));

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/vnd.microsoft.icon",
  ".woff2": "font/woff2",
};

export function archivoDe(raiz, rutaUrl) {
  let decodificada;
  try {
    decodificada = decodeURIComponent(rutaUrl);
  } catch {
    return null;
  }
  if (decodificada.includes("\0")) return null;
  const partes = decodificada.split("/").filter(Boolean);
  if (partes.some((p) => p === ".." || estaOculto(p))) return null;
  const base = path.join(raiz, ...partes);
  if (!base.startsWith(raiz)) return null;
  // try_files {path} {path}/index.html {path}.html
  const candidatos = [base, path.join(base, "index.html"), `${base}.html`];
  for (const c of candidatos) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      /* siguiente */
    }
  }
  return null;
}

/**
 * Inicia el servidor. `puerto` 0 = uno libre. Devuelve { url, puerto, cerrar }.
 * `registro` (opcional) recibe { metodo, ruta, estado } de cada petición.
 */
export function iniciarServidor({ raiz = RAIZ_SITIO, puerto = 0, host = "127.0.0.1", registro = null } = {}) {
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const cabeceras = { ...CABECERAS_CADDY };
    let archivo = archivoDe(raiz, url.pathname);
    let estado = 200;
    if (!archivo) {
      archivo = path.join(raiz, "404.html"); // handle_errors: rewrite * /404.html
      estado = 404;
    }
    if (url.pathname.startsWith("/assets/") && estado === 200) {
      cabeceras["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=604800";
    }
    cabeceras["Content-Type"] = TIPOS[path.extname(archivo)] ?? "application/octet-stream";
    registro?.({ metodo: req.method, ruta: url.pathname, estado });
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { ...cabeceras, Allow: "GET, HEAD" }).end();
      return;
    }
    const cuerpo = fs.readFileSync(archivo);
    cabeceras["Content-Length"] = cuerpo.length;
    res.writeHead(estado, cabeceras);
    res.end(req.method === "HEAD" ? undefined : cuerpo);
  });
  return new Promise((resolver, rechazar) => {
    servidor.once("error", rechazar);
    servidor.listen(puerto, host, () => {
      const { port } = servidor.address();
      resolver({
        puerto: port,
        url: `http://${host}:${port}`,
        cerrar: () => new Promise((r) => servidor.close(() => r())),
      });
    });
  });
}

// CLI: `node lib/servidor.mjs [--puerto 8765]`
if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf("--puerto");
  const puerto = i > 0 ? Number(process.argv[i + 1]) : 8765;
  const s = await iniciarServidor({ puerto });
  console.log(`Sirviendo ${RAIZ_SITIO} en ${s.url} (Ctrl+C para salir)`);
}
