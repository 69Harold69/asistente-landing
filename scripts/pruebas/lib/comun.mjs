/* Utilidades compartidas por capturas, tactil, lighthouse y validar. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

/** Parser mínimo: `--clave valor`, `--bandera`, `--clave=valor`. Lo demás va a `_`. */
export function leerArgs(argv = process.argv.slice(2)) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (!x.startsWith("--")) {
      a._.push(x);
      continue;
    }
    const [k, v] = x.slice(2).split(/=(.*)/s);
    if (v !== undefined) a[k] = v;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) a[k] = argv[++i];
    else a[k] = true;
  }
  return a;
}

export const lista = (v, porDefecto) => (v === undefined || v === true ? porDefecto : String(v).split(",").map((s) => s.trim()).filter(Boolean));

export function rutaChromium() {
  const candidatas = [process.env.CHROME_PATH, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"].filter(Boolean);
  for (const c of candidatas) if (fs.existsSync(c)) return c;
  return undefined; // el que descargó `npx playwright install chromium`
}

export function lanzarChromium(extra = {}) {
  return chromium.launch({
    executablePath: rutaChromium(),
    headless: true,
    args: ["--disable-dev-shm-usage", ...(extra.args ?? [])],
    ...extra,
  });
}

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export function carpetaSalida(valor, porDefecto) {
  const dir = path.resolve(String(valor === undefined || valor === true ? porDefecto : valor).replace(/^~(?=$|\/)/, os.homedir()));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const slug = (ruta) => (ruta === "/" ? "inicio" : ruta.replace(/^\/|\/$/g, "").replace(/[^a-z0-9]+/gi, "-").replace(/\.html$/, ""));

/*
  Guardia de fallos de una página: console.error, pageerror, violaciones de CSP,
  requestfailed y respuestas >= 400. Devuelve { fallas, instalar(page) }.
*/
export function crearGuardia(origen) {
  const fallas = [];
  const vistos = new Set();
  const anotar = (tipo, detalle, contexto) => {
    const clave = `${tipo}|${detalle}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    fallas.push({ tipo, detalle, contexto });
  };
  return {
    fallas,
    /** `contexto` es una etiqueta (combo/página) para saber dónde ocurrió. */
    instalar(page, contexto) {
      page.on("console", (m) => {
        const t = m.text();
        if (m.type() !== "error") return;
        // El aviso genérico de Chromium ("Refused to ... Content Security Policy") siempre viene
        // acompañado del evento `securitypolicyviolation` (script inicial), que es más corto.
        if (/Content Security Policy/i.test(t) && !t.startsWith("CSP:")) return;
        anotar(t.startsWith("CSP:") ? "csp" : "console.error", t, contexto);
      });
      page.on("pageerror", (e) => anotar("pageerror", String(e?.stack ?? e).split("\n").slice(0, 3).join(" | "), contexto));
      page.on("requestfailed", (r) => anotar("requestfailed", `${r.url()} ${r.failure()?.errorText ?? ""}`, contexto));
      page.on("response", (r) => {
        if (r.status() >= 400) {
          // Un 404 buscado a propósito (la página /404.html o rutas de prueba) no es falla.
          if (r.request().isNavigationRequest() && contexto.includes("[esperado-404]")) return;
          anotar("http", `${r.status()} ${r.url()}`, contexto);
        }
      });
    },
  };
}

/** Script de inicialización: fija tema y evita la demo de tema (a menos que se pida), y reporta CSP. */
export function scriptInicial({ tema, demo = false }) {
  return `
    try { localStorage.setItem("yaruki-theme", ${JSON.stringify(tema)}); } catch {}
    try { ${demo ? 'sessionStorage.removeItem("yaruki-theme-demo-visto");' : 'sessionStorage.setItem("yaruki-theme-demo-visto", "1");'} } catch {}
    document.addEventListener("securitypolicyviolation", (e) =>
      console.error("CSP: " + e.violatedDirective + " bloqueó " + (e.blockedURI || "inline") + " en " + (e.sourceFile || location.href) + ":" + e.lineNumber));
  `;
}

/** Espera a fuentes y red tranquila; la portada además espera a que la coreografía arme. */
export async function esperarCarga(page, { portada = false } = {}) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  if (portada) await page.waitForSelector(".capa-escena", { state: "attached", timeout: 10000 }).catch(() => {});
  await dormir(portada ? 2200 : 400); // titular palabra por palabra y primer render de la escena
}

export const SECCIONES_PORTADA = [
  { id: "hero", escenas: ["splash", "login"] },
  { id: "fase-chat", escenas: ["chat"] },
  { id: "fase-elementos", escenas: ["elementos"] },
  { id: "fase-habitos", escenas: ["habitos", "logro"] },
  { id: "fase-avisos", escenas: ["avisos"] },
  { id: "fase-llamada", escenas: ["llamada"] },
  { id: "cta", escenas: ["dashboard"] },
];
export const ORDEN_ESCENAS = ["splash", "login", "chat", "elementos", "habitos", "logro", "avisos", "llamada", "dashboard"];

/** Lee en la página la escena dominante, el ángulo (0-360) del teléfono y el scroll. */
export const leerEstado = () => {
  const capas = [...document.querySelectorAll(".capa-escena")].map((c) => ({
    op: Number(c.style.opacity || 0),
    id: ([...(c.querySelector(".escena")?.classList ?? [])].find((k) => k.startsWith("ps-")) ?? "").replace("ps-", "").replace(/^dash$/, "dashboard"),
  }));
  const dom = capas.filter((c) => c.id).sort((a, b) => b.op - a.op)[0];
  const tel = document.getElementById("telefono");
  let angulo = null;
  if (tel) {
    const m = getComputedStyle(tel).transform;
    if (m && m !== "none") {
      const v = new DOMMatrix(m);
      angulo = ((Math.atan2(-v.m13, v.m11) * 180) / Math.PI + 360) % 360;
    } else angulo = 0;
  }
  const de = document.documentElement;
  return {
    y: Math.round(window.scrollY),
    x: Math.round(window.scrollX),
    escena: dom?.op >= 0.5 ? dom.id : (capas.find((c) => c.id && c.op >= 0.5)?.id ?? dom?.id ?? null),
    capas,
    angulo,
    anchoDoc: de.scrollWidth,
    anchoVista: de.clientWidth,
  };
};

export const ID_ESCENA = (id) => ORDEN_ESCENAS.indexOf(id);

export function salir(codigo, msg) {
  if (msg) (codigo ? console.error : console.log)(msg);
  process.exit(codigo);
}
