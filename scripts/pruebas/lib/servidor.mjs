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
import zlib from "node:zlib";
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
  `hide` de Caddy: el README documenta `.git README.md`. Aquí también se ocultan
  lo que este repo agrega para pruebas y que el README marca como PENDIENTE de
  Harold (scripts, package.json, package-lock.json): así las pruebas ven lo
  mismo que verá el público cuando se aplique. Ocultar de más aquí no rompe
  nada: ninguna página del sitio los usa.
*/
export const OCULTOS = [".git", "README.md", "scripts", "package.json", "package-lock.json", "node_modules"];

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

/*
  Compresión como la de producción (`encode gzip zstd` del bloque de Caddy): sin ella el laboratorio
  (Lighthouse con red simulada) pesa 4× más bytes de CSS/JS bloqueantes de los que recibe un visitante
  real y la medición representa mal al sitio. Caddy elige según `Accept-Encoding` (zstd antes que gzip),
  solo para tipos de texto y desde 512 bytes, y marca `Vary: Accept-Encoding`. Se cachea por archivo.
  `YARUKI_SIN_COMPRESION=1` la apaga (para comparar con la línea base vieja).
*/
const COMPRIMIBLES = new Set([".html", ".css", ".js", ".mjs", ".json", ".xml", ".txt", ".svg"]);
const cacheCompresion = new Map();
function elegirCodificacion(aceptadas) {
  if (process.env.YARUKI_SIN_COMPRESION) return null;
  const lista = String(aceptadas || "").split(",").map((x) => x.trim().split(";")[0]);
  if (lista.includes("zstd") && typeof zlib.zstdCompressSync === "function") return "zstd";
  if (lista.includes("gzip")) return "gzip";
  return null;
}
function comprimir(cuerpo, codificacion, clave) {
  const k = `${codificacion}:${clave}`;
  let c = cacheCompresion.get(k);
  if (!c) {
    c = codificacion === "zstd" ? zlib.zstdCompressSync(cuerpo) : zlib.gzipSync(cuerpo, { level: 5 });
    cacheCompresion.set(k, c);
  }
  return c;
}

export function archivoDe(raiz, rutaUrl) {
  let decodificada;
  try {
    decodificada = decodeURIComponent(rutaUrl);
  } catch {
    return null;
  }
  if (decodificada.includes("\0")) return null;
  const partes = decodificada.split("/").filter(Boolean);
  if (partes.some((p) => p === ".." || OCULTOS.includes(p))) return null;
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
    let cuerpo = fs.readFileSync(archivo);
    if (COMPRIMIBLES.has(path.extname(archivo))) {
      cabeceras.Vary = "Accept-Encoding";
      const codificacion = cuerpo.length >= 512 ? elegirCodificacion(req.headers["accept-encoding"]) : null;
      if (codificacion) {
        cuerpo = comprimir(cuerpo, codificacion, `${archivo}:${fs.statSync(archivo).mtimeMs}`);
        cabeceras["Content-Encoding"] = codificacion;
      }
    }
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
