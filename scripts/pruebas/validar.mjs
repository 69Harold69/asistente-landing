#!/usr/bin/env node
/*
  validar: comprobaciones rapidas y SIN navegador. Sale con 1 si alguna regla falla.

  Reglas (id): html-validate, csp-estatica, csp-js, csp-readme, json-ld, sitemap, lastmod,
  meta, enlaces, cta-sin-href, voseo. Cada falla se imprime como `FALLA [regla] archivo:linea mensaje`.

  Fallos conocidos: `conocidos.json` lista reglas (opcionalmente acotadas con "contiene") que HOY
  fallan y tienen issue. Se imprimen como XFAIL y no rompen la salida. Si una regla conocida
  deja de fallar, se reporta XPASS y SI rompe: borra la entrada de conocidos.json en la misma PR
  que la arregla (eso fuerza que la lista no se pudra). `--estricto` ignora conocidos.json.

  Uso: node validar.mjs [--externos] [--estricto] [--solo regla1,regla2] [--json]
    --externos  ademas comprueba con HEAD los enlaces externos (red; no corre por defecto)

  Heuristica de `lastmod` (README del sitio): el lastmod de cada pagina debe ser >= la fecha
  del ultimo commit (sin merges) que cambio su TEXTO VISIBLE (se compara el texto del <body>,
  sin scripts, entre el commit y su padre; los cambios de <head> o de ?v= no cuentan), o hoy si
  el texto del arbol de trabajo difiere de HEAD.
*/
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parse } from "parse5";
import { HtmlValidate } from "html-validate/node";
import { RAIZ_SITIO, CABECERAS_CADDY, archivoDe, OCULTOS } from "./lib/servidor.mjs";
import { leerArgs, lista, salir } from "./lib/comun.mjs";

const a = leerArgs();
if (a.ayuda || a.help) salir(0, fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace("#!/usr/bin/env node\n/*", "").trim());

const ORIGEN = "https://yaruki.hjgr.dev";
const IDIOMA = "es-MX";
const solo = a.solo ? new Set(lista(a.solo)) : null;
const activa = (id) => !solo || solo.has(id);
const hallazgos = []; // { regla, nivel: 'error'|'aviso', donde, mensaje }
const falla = (regla, donde, mensaje, nivel = "error") => hallazgos.push({ regla, nivel, donde, mensaje });
const rel = (f) => path.relative(RAIZ_SITIO, f);

/* ---------- utilidades de DOM (parse5) ---------- */
const hijos = (n) => n.childNodes ?? [];
function* recorrer(n) {
  yield n;
  for (const h of hijos(n)) yield* recorrer(h);
  if (n.content) yield* recorrer(n.content);
}
const attr = (n, k) => n.attrs?.find((x) => x.name === k)?.value;
const tiene = (n, k) => n.attrs?.some((x) => x.name === k);
const linea = (n) => n.sourceCodeLocation?.startLine ?? 0;
const etiquetas = (arbol, nombre) => [...recorrer(arbol)].filter((n) => n.nodeName === nombre);

function textoDe(n, partes = []) {
  if (n.nodeName === "#text") partes.push(n.value);
  else if (!["script", "style", "noscript", "template"].includes(n.nodeName)) for (const h of hijos(n)) textoDe(h, partes);
  return partes;
}
const textoVisible = (arbol) => {
  const body = etiquetas(arbol, "body")[0];
  return textoDe(body ?? arbol).join(" ").replace(/\s+/g, " ").trim();
};
/** Textos de atributos que se leen (alt, aria-label, title) para la guardia de voseo. */
const textosAtributos = (arbol) =>
  [...recorrer(arbol)].flatMap((n) => ["alt", "aria-label", "title", "placeholder"].map((k) => attr(n, k)).filter(Boolean));

/* ---------- carga de paginas ---------- */
function* htmls(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (OCULTOS.includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* htmls(p);
    else if (e.name.endsWith(".html")) yield p;
  }
}
const paginas = [...htmls(RAIZ_SITIO)].sort().map((archivo) => {
  const fuente = fs.readFileSync(archivo, "utf8");
  const arbol = parse(fuente, { sourceCodeLocationInfo: true });
  const r = rel(archivo);
  const verificacionGoogle = /^google[0-9a-f]+\.html$/.test(path.basename(archivo));
  const robots = etiquetas(arbol, "meta").find((m) => attr(m, "name") === "robots");
  const noindex = /noindex/i.test(attr(robots ?? { attrs: [] }, "content") ?? "") || verificacionGoogle;
  const url = r === "index.html" ? "/" : r.endsWith("/index.html") ? `/${r.slice(0, -"index.html".length)}` : `/${r}`;
  return { archivo, r, fuente, arbol, url, indexable: !noindex, verificacionGoogle };
});
const indexables = paginas.filter((p) => p.indexable);

/* ---------- 1. HTML valido (html-validate) ---------- */
/*
  Se eligio html-validate (Node puro, sin Java ni descargas de ~30 MB como vnu.jar) porque corre en
  < 2 s, entiende HTML5 + ARIA y da lineas. Reglas de estilo de maquetacion (comillas, cierre de
  elementos vacios, orden de atributos) se desactivan: el sitio las usa de forma consistente y no
  aportan correccion; lo que importa son errores reales (ids duplicados, anidado invalido, ARIA,
  atributos desconocidos, <img> sin alt, etc.).
*/
if (activa("html-validate")) {
  const hv = new HtmlValidate({
    extends: ["html-validate:recommended"],
    rules: {
      "void-style": "off",
      "no-trailing-whitespace": "off",
      "attribute-boolean-style": "off",
      "attribute-empty-style": "off",
      "doctype-style": "off",
      "no-inline-style": "off", // lo cubre csp-estatica con su propio mensaje
      "no-redundant-role": "off",
      "prefer-native-element": "off",
      "long-title": "off",
      "require-sri": "off",
      "script-type": "off",
      "wcag/h30": "off",
      "wcag/h32": "off",
      "wcag/h37": "off",
      "wcag/h63": "off",
      "wcag/h67": "off",
      "element-permitted-content": "error",
      "no-dup-id": "error",
    },
  });
  for (const p of paginas.filter((x) => !x.verificacionGoogle)) {
    const rep = await hv.validateFile(p.archivo);
    for (const res of rep.results)
      for (const m of res.messages) falla("html-validate", `${p.r}:${m.line}`, `${m.message} (${m.ruleId})`, m.severity === 2 ? "error" : "aviso");
  }
}

/* ---------- 2. CSP estatica (HTML) ---------- */
const mismoOrigen = (u) => !/^(https?:)?\/\//i.test(u) || u.startsWith(ORIGEN + "/") || u === ORIGEN;
if (activa("csp-estatica")) {
  for (const p of paginas) {
    for (const n of recorrer(p.arbol)) {
      if (!n.nodeName || n.nodeName.startsWith("#")) continue;
      const d = `${p.r}:${linea(n)}`;
      if (n.nodeName === "script") {
        const tipo = (attr(n, "type") ?? "").toLowerCase();
        if (!tiene(n, "src") && tipo !== "application/ld+json") falla("csp-estatica", d, "<script> inline (script-src 'self' lo bloquea)");
        if (tiene(n, "src") && !mismoOrigen(attr(n, "src"))) falla("csp-estatica", d, `script de otro origen: ${attr(n, "src")}`);
      }
      if (n.nodeName === "style") falla("csp-estatica", d, "<style> inline (style-src 'self' lo bloquea)");
      if (n.nodeName === "form") falla("csp-estatica", d, "<form> (form-action 'none'; el sitio no lleva formularios)");
      for (const x of n.attrs ?? []) {
        if (x.name === "style") falla("csp-estatica", d, `atributo style="" en <${n.nodeName}> (usa CSSOM desde JS o una clase)`);
        if (/^on/i.test(x.name)) falla("csp-estatica", d, `manejador ${x.name}="" en <${n.nodeName}>`);
        if (/^\s*javascript:/i.test(x.value)) falla("csp-estatica", d, `URL javascript: en ${x.name}`);
      }
      // recursos (no enlaces de navegacion) de otro origen
      const recurso =
        (n.nodeName === "link" && /stylesheet|preload|modulepreload|prefetch|icon|manifest|preconnect|dns-prefetch/.test(attr(n, "rel") ?? "") && attr(n, "href")) ||
        (["img", "source", "video", "audio", "iframe", "embed", "track", "input"].includes(n.nodeName) && attr(n, "src")) ||
        (n.nodeName === "object" && attr(n, "data")) || false;
      if (recurso && !mismoOrigen(recurso)) falla("csp-estatica", d, `recurso de otro origen: ${recurso}`);
      const srcset = attr(n, "srcset");
      if (srcset) for (const s of srcset.split(",")) if (!mismoOrigen(s.trim().split(/\s+/)[0])) falla("csp-estatica", d, `srcset de otro origen: ${s.trim()}`);
    }
  }
}

/* ---------- 2b. CSP en JS/CSS propios (estilos inline por innerHTML, setAttribute("style"), @import externo) ---------- */
if (activa("csp-js")) {
  function* archivosPropios(dir, exts) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "vendor") yield* archivosPropios(p, exts);
      } else if (exts.some((x) => e.name.endsWith(x))) yield p;
    }
  }
  const raizAssets = path.join(RAIZ_SITIO, "assets");
  for (const f of archivosPropios(path.join(raizAssets, "js"), [".js"])) {
    fuenteLineas(f).forEach((txt, i) => {
      const d = `${rel(f)}:${i + 1}`;
      if (/<[a-zA-Z][^<>]*\sstyle\s*=\s*["']/.test(txt)) falla("csp-js", d, 'HTML generado con style="" inline: la CSP (style-src-attr) lo bloquea; usa CSSOM (el.style.setProperty) o clases');
      if (/<[a-zA-Z][^<>]*\son[a-z]+\s*=\s*["']/.test(txt)) falla("csp-js", d, "HTML generado con manejador on*= inline");
      if (/setAttribute\(\s*["']style["']/.test(txt)) falla("csp-js", d, 'setAttribute("style", ...) está bloqueado por la CSP; usa el.style.setProperty');
      if (/\b(?:fetch|import)\(\s*[`"']https?:\/\//.test(txt) || /new\s+(?:Worker|EventSource|WebSocket)\(\s*[`"'](?:https?|wss?):\/\//.test(txt)) falla("csp-js", d, "carga de red a otro origen");
      if (/\beval\(|new\s+Function\(/.test(txt)) falla("csp-js", d, "eval / new Function (script-src 'self' los bloquea)");
    });
  }
  for (const f of archivosPropios(path.join(raizAssets, "css"), [".css"])) {
    fuenteLineas(f).forEach((txt, i) => {
      if (/@import|url\(\s*["']?(?:https?:)?\/\//.test(txt)) falla("csp-js", `${rel(f)}:${i + 1}`, "CSS con recurso de otro origen o @import externo");
    });
  }
}
function fuenteLineas(f) {
  return fs.readFileSync(f, "utf8").split("\n");
}

/* ---------- 2c. la CSP del servidor de pruebas = la del README ---------- */
if (activa("csp-readme")) {
  const readme = fs.readFileSync(path.join(RAIZ_SITIO, "README.md"), "utf8");
  for (const [k, v] of Object.entries(CABECERAS_CADDY))
    if (!readme.includes(`${k} "${v}"`)) falla("csp-readme", "README.md", `la cabecera ${k} del servidor de pruebas (lib/servidor.mjs) ya no coincide con el bloque de Caddy del README`);
}

/* ---------- 3. JSON-LD ---------- */
const PROHIBIDAS = ["aggregateRating", "review", "downloadUrl"];
const REQUERIDOS = {
  WebSite: ["url", "name"],
  SoftwareApplication: ["name", "operatingSystem", "applicationCategory", "offers"],
  FAQPage: ["mainEntity"],
  Person: ["name"],
  BreadcrumbList: ["itemListElement"],
  Organization: ["name"],
};
function validarNodo(nodo, donde) {
  if (Array.isArray(nodo)) return nodo.forEach((x) => validarNodo(x, donde));
  if (!nodo || typeof nodo !== "object") return;
  for (const k of Object.keys(nodo)) if (PROHIBIDAS.includes(k)) falla("json-ld", donde, `propiedad prohibida "${k}" (no existe todavía; no inventar)`);
  const tipos = [].concat(nodo["@type"] ?? []);
  for (const t of tipos) {
    for (const campo of REQUERIDOS[t] ?? []) if (nodo[campo] === undefined || nodo[campo] === "") falla("json-ld", donde, `${t} sin "${campo}"`);
    if (t === "SoftwareApplication" && nodo.offers) {
      const o = [].concat(nodo.offers)[0];
      if (o["@type"] !== "Offer" || o.price === undefined || !o.priceCurrency) falla("json-ld", donde, "SoftwareApplication.offers debe ser Offer con price y priceCurrency");
    }
    if (t === "FAQPage") {
      const q = [].concat(nodo.mainEntity ?? []);
      if (!q.length) falla("json-ld", donde, "FAQPage.mainEntity vacío");
      for (const x of q) if (x["@type"] !== "Question" || !x.name || x.acceptedAnswer?.["@type"] !== "Answer" || !x.acceptedAnswer?.text) falla("json-ld", donde, "FAQPage: cada Question necesita name y acceptedAnswer{Answer,text}");
    }
    if (t === "BreadcrumbList") {
      const it = [].concat(nodo.itemListElement ?? []);
      it.forEach((x, i) => {
        if (x["@type"] !== "ListItem" || x.position !== i + 1 || !x.name) falla("json-ld", donde, `BreadcrumbList: ListItem ${i + 1} sin @type/position consecutivo/name`);
      });
    }
    for (const campo of ["url", "@id", "image"]) if (typeof nodo[campo] === "string" && /^https?:\/\//.test(nodo[campo]) && !nodo[campo].startsWith(ORIGEN)) falla("json-ld", donde, `${t}.${campo} apunta a otro origen: ${nodo[campo]}`, "aviso");
  }
  for (const v of Object.values(nodo)) if (v && typeof v === "object") validarNodo(v, donde);
}
if (activa("json-ld")) {
  for (const p of paginas) {
    for (const n of etiquetas(p.arbol, "script").filter((s) => attr(s, "type") === "application/ld+json")) {
      const d = `${p.r}:${linea(n)}`;
      const cuerpo = hijos(n).map((h) => h.value ?? "").join("");
      let datos;
      try {
        datos = JSON.parse(cuerpo);
      } catch (e) {
        falla("json-ld", d, `JSON-LD no parsea: ${e.message}`);
        continue;
      }
      if (datos["@context"] !== "https://schema.org") falla("json-ld", d, '@context debe ser "https://schema.org"');
      validarNodo(datos["@graph"] ?? datos, d);
    }
  }
}

/* ---------- 4. sitemap y lastmod ---------- */
function git(...args) {
  try {
    return execFileSync("git", ["-C", RAIZ_SITIO, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}
/*
  Fechas en la hora de México (la del sitio y la de los commits, `%cs`), no en UTC: con
  toISOString(), de 18:00 a 23:59 de México «hoy» ya era mañana y daba falsos rojos.
*/
const fechaMx = (ms = Date.now()) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
function fechaUltimoCambioDeTexto(p) {
  const hoy = fechaMx();
  const cabeza = git("show", `HEAD:${p.r}`);
  if (cabeza !== null && textoVisible(parse(cabeza)) !== textoVisible(p.arbol)) return { fecha: hoy, por: "texto sin commitear" };
  const commits = (git("log", "--no-merges", "--format=%H %cs", "-30", "--", p.r) ?? "").split("\n").filter(Boolean);
  for (const c of commits) {
    const [h, fecha] = c.split(" ");
    const ahora = git("show", `${h}:${p.r}`);
    const antes = git("show", `${h}^:${p.r}`); // null si el archivo nace en ese commit
    if (ahora === null) continue;
    if (antes === null || textoVisible(parse(antes)) !== textoVisible(parse(ahora))) return { fecha, por: h.slice(0, 7) };
  }
  return null;
}
if (activa("sitemap") || activa("lastmod")) {
  const xml = fs.readFileSync(path.join(RAIZ_SITIO, "sitemap.xml"), "utf8");
  const entradas = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)].map((m) => ({ loc: m[1].trim(), lastmod: m[2]?.trim() }));
  const enSitemap = new Set();
  for (const e of entradas) {
    enSitemap.add(e.loc);
    if (!e.loc.startsWith(ORIGEN + "/")) {
      falla("sitemap", "sitemap.xml", `URL fuera del origen: ${e.loc}`);
      continue;
    }
    const ruta = e.loc.slice(ORIGEN.length);
    const archivo = archivoDe(RAIZ_SITIO, ruta);
    if (!archivo) {
      falla("sitemap", "sitemap.xml", `${e.loc} no existe como archivo`);
      continue;
    }
    const p = paginas.find((x) => x.archivo === archivo);
    const canon = etiquetas(p.arbol, "link").find((l) => attr(l, "rel") === "canonical");
    if (attr(canon ?? { attrs: [] }, "href") !== e.loc) falla("sitemap", p.r, `canonical (${attr(canon ?? { attrs: [] }, "href") ?? "ausente"}) no coincide con el sitemap (${e.loc})`);
    if (!p.indexable) falla("sitemap", "sitemap.xml", `${e.loc} es noindex y no debe estar en el sitemap`);
    if (!e.lastmod || !/^\d{4}-\d{2}-\d{2}$/.test(e.lastmod)) falla("lastmod", "sitemap.xml", `${e.loc}: lastmod ausente o no es YYYY-MM-DD`);
    else if (activa("lastmod")) {
      const ult = fechaUltimoCambioDeTexto(p);
      if (a.verbose) console.log(`lastmod ${p.r}: sitemap ${e.lastmod}, último cambio de texto ${ult ? `${ult.fecha} (${ult.por})` : "?"}`);
      if (ult && e.lastmod < ult.fecha) falla("lastmod", "sitemap.xml", `${e.loc}: lastmod ${e.lastmod} es anterior al último cambio de texto visible (${ult.fecha}, ${ult.por}); actualízalo`);
      if (e.lastmod > fechaMx(Date.now() + 864e5)) falla("lastmod", "sitemap.xml", `${e.loc}: lastmod ${e.lastmod} está en el futuro`);
    }
  }
  for (const p of indexables) {
    const loc = ORIGEN + p.url;
    if (!enSitemap.has(loc)) falla("sitemap", p.r, `página indexable ${loc} no está en sitemap.xml`);
  }
  const robots = fs.readFileSync(path.join(RAIZ_SITIO, "robots.txt"), "utf8");
  if (!robots.includes(`Sitemap: ${ORIGEN}/sitemap.xml`)) falla("sitemap", "robots.txt", "no declara el sitemap");
}

/* ---------- 5. metadatos de cada pagina indexable ---------- */
if (activa("meta")) {
  for (const p of indexables) {
    const metas = etiquetas(p.arbol, "meta");
    const por = (clave, valor) => metas.find((m) => attr(m, clave) === valor);
    const contenido = (clave, valor) => attr(por(clave, valor) ?? { attrs: [] }, "content")?.trim();
    const html = etiquetas(p.arbol, "html")[0];
    if (attr(html, "lang") !== IDIOMA) falla("meta", p.r, `<html lang> es "${attr(html, "lang") ?? "ausente"}", se esperaba "${IDIOMA}"`);
    const titulo = etiquetas(p.arbol, "title")[0];
    const t = titulo ? hijos(titulo).map((h) => h.value).join("").trim() : "";
    if (!t) falla("meta", p.r, "sin <title>");
    else if (t.length > 70) falla("meta", p.r, `<title> de ${t.length} caracteres (> 70: Google lo corta)`, "aviso");
    const desc = contenido("name", "description");
    if (!desc) falla("meta", p.r, "sin meta description");
    else if (desc.length < 70 || desc.length > 320) falla("meta", p.r, `meta description de ${desc.length} caracteres (recomendado 70–320)`, "aviso");
    const canon = etiquetas(p.arbol, "link").find((l) => attr(l, "rel") === "canonical");
    if (!canon || attr(canon, "href") !== ORIGEN + p.url) falla("meta", p.r, `canonical debe ser ${ORIGEN + p.url} (hay ${canon ? attr(canon, "href") : "ninguno"})`);
    for (const k of ["og:title", "og:description", "og:type", "og:url", "og:image", "og:site_name", "og:locale"]) if (!contenido("property", k)) falla("meta", p.r, `falta ${k}`);
    for (const k of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) if (!contenido("name", k)) falla("meta", p.r, `falta ${k}`);
    for (const k of ["og:image:alt"]) if (!contenido("property", k)) falla("meta", p.r, `falta ${k}`, "aviso");
    if (!contenido("name", "twitter:image:alt")) falla("meta", p.r, "falta twitter:image:alt", "aviso");
    if (contenido("property", "og:url") && contenido("property", "og:url") !== ORIGEN + p.url) falla("meta", p.r, `og:url (${contenido("property", "og:url")}) no coincide con la URL canónica`);
    if (contenido("property", "og:locale") && contenido("property", "og:locale") !== IDIOMA.replace("-", "_")) falla("meta", p.r, `og:locale ${contenido("property", "og:locale")} no corresponde a ${IDIOMA}`);
    const h1 = etiquetas(p.arbol, "h1");
    if (h1.length !== 1) falla("meta", p.r, `debe haber exactamente un <h1> (hay ${h1.length})`);
    // imagenes OG existen
    for (const k of ["og:image", "twitter:image"]) {
      const v = contenido(k.startsWith("og") ? "property" : "name", k);
      if (v?.startsWith(ORIGEN + "/") && !archivoDe(RAIZ_SITIO, v.slice(ORIGEN.length))) falla("meta", p.r, `${k} apunta a un archivo que no existe: ${v}`);
    }
  }
  // La 404 es noindex a proposito.
  const e404 = paginas.find((p) => p.r === "404.html");
  if (e404 && e404.indexable) falla("meta", "404.html", "la 404 debe llevar noindex");
}

/* ---------- 6. enlaces internos y anclas ---------- */
const idsDe = (p) => new Set([...recorrer(p.arbol)].flatMap((n) => [attr(n, "id"), n.nodeName === "a" ? attr(n, "name") : undefined]).filter(Boolean));
const idsCache = new Map();
const externos = new Set();
if (activa("enlaces")) {
  for (const p of paginas.filter((x) => !x.verificacionGoogle)) {
    for (const n of recorrer(p.arbol)) {
      for (const k of ["href", "src"]) {
        const v = attr(n, k);
        if (v === undefined || !n.nodeName || n.nodeName.startsWith("#")) continue;
        const d = `${p.r}:${linea(n)}`;
        if (/^(mailto:|tel:|sms:|data:|javascript:)/i.test(v)) continue;
        if (/^(https?:)?\/\//i.test(v) && !v.startsWith(ORIGEN)) {
          if (n.nodeName === "a") externos.add(v);
          continue;
        }
        if (v === "") {
          falla("enlaces", d, `<${n.nodeName} ${k}=""> vacío`);
          continue;
        }
        let u;
        try {
          u = new URL(v, ORIGEN + p.url);
        } catch {
          falla("enlaces", d, `URL inválida: ${v}`);
          continue;
        }
        const destino = archivoDe(RAIZ_SITIO, u.pathname);
        if (!destino) {
          falla("enlaces", d, `enlace roto: ${v} → ${u.pathname}`);
          continue;
        }
        if (u.hash && u.hash.length > 1 && destino.endsWith(".html")) {
          const dp = paginas.find((x) => x.archivo === destino);
          if (dp) {
            if (!idsCache.has(dp.archivo)) idsCache.set(dp.archivo, idsDe(dp));
            if (!idsCache.get(dp.archivo).has(decodeURIComponent(u.hash.slice(1)))) falla("enlaces", d, `ancla rota: ${v} (no hay id="${u.hash.slice(1)}" en ${dp.r})`);
          }
        }
      }
    }
  }
  if (a.externos) {
    for (const url of externos) {
      try {
        let r = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15000) });
        if (r.status === 405 || r.status === 403) r = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(15000) });
        if (r.status >= 400) falla("enlaces", "(externo)", `${url} responde ${r.status}`);
      } catch (e) {
        falla("enlaces", "(externo)", `${url} no responde: ${e.message}`);
      }
    }
  }
}

/* ---------- 7. mejora progresiva: los CTA son enlaces con href real en el HTML ---------- */
if (activa("cta-sin-href")) {
  for (const p of indexables) {
    for (const n of etiquetas(p.arbol, "a")) {
      const clases = (attr(n, "class") ?? "").split(/\s+/);
      const esBoton = ["button", "btn", "cta"].some((c) => clases.some((k) => k === c || k.startsWith(c + "-") || k.startsWith(c + "_")) ) || (n.attrs ?? []).some((x) => x.name.startsWith("data-cta")) || ["button", "link"].includes(attr(n, "role"));
      if (!esBoton) continue;
      const href = attr(n, "href");
      if (!href || href === "#") falla("cta-sin-href", `${p.r}:${linea(n)}`, `<a> con rol de botón/CTA sin href real en el HTML (${(attr(n, "class") ?? "").trim() || "sin clase"}): sin JS no hay enlace; JS solo debe agregar lo extra`);
    }
  }
}

/* ---------- 8. voseo ---------- */
const VOSEO = [
  "vos", "tenés", "podés", "querés", "sabés", "hacés", "decís", "venís", "pensás", "usás", "creés", "ponés", "sentís", "vivís", "elegís", "salís", "mirás", "andás", "esperás", "necesitás", "buscás", "preferís", "recordás",
  "escribí", "mirá", "fijate", "andá", "hacé", "decí", "decime", "sumate", "unite", "probá", "intentá", "revisá", "agregá", "elegí", "tocá", "guardá", "pedí", "contá", "dejá", "entrá", "registrate", "descargá", "avisame", "mandame", "contame", "fijá", "poné", "tomá", "pasá", "seguí", "abrí", "cerrá", "borrá", "eliminá", "tené", "sabé", "mantené", "cambiá", "activá", "desactivá", "confirmá", "cancelá", "esperá", "volvé", "ingresá",
];
if (activa("voseo")) {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${VOSEO.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  for (const p of paginas.filter((x) => !x.verificacionGoogle)) {
    const textos = [textoVisible(p.arbol), ...textosAtributos(p.arbol)];
    const vistos = new Set();
    for (const t of textos) for (const m of t.matchAll(re)) {
      const palabra = m[1].toLowerCase();
      if (vistos.has(palabra)) continue;
      vistos.add(palabra);
      const ctx = t.slice(Math.max(0, m.index - 25), m.index + palabra.length + 25);
      falla("voseo", p.r, `posible voseo "${palabra}" en: …${ctx}… (el sitio usa español de México con tuteo)`);
    }
  }
  // Textos que arma JS (escenas del telefono, config): mismo vocabulario, entre comillas.
  const dirJs = path.join(RAIZ_SITIO, "assets/js");
  const re2 = new RegExp(`(?<![\\p{L}\\p{N}])(${VOSEO.filter((w) => w !== "vos").join("|")})(?![\\p{L}\\p{N}])`, "giu");
  (function revisar(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "vendor") revisar(f);
      } else if (e.name.endsWith(".js")) {
        fuenteLineas(f).forEach((txt, i) => {
          if (txt.trim().startsWith("//") || txt.trim().startsWith("*") || txt.trim().startsWith("/*")) return; // comentarios
          for (const m of txt.matchAll(re2)) falla("voseo", `${rel(f)}:${i + 1}`, `posible voseo "${m[1]}" en un texto de JS`);
        });
      }
    }
  })(dirJs);
}

/* ---------- informe ---------- */
let conocidos = [];
if (!a.estricto) {
  const f = new URL("./conocidos.json", import.meta.url);
  if (fs.existsSync(f)) conocidos = JSON.parse(fs.readFileSync(f, "utf8")).conocidos ?? [];
}
/*
  Cada entrada se acota con `archivo` (ruta exacta, sin la línea), `contiene` (texto en donde+mensaje)
  y `cuantos` (número EXACTO de hallazgos que cubre). Sin `cuantos`, una entrada taparía cualquier
  hallazgo nuevo de la misma regla (falso verde): por eso los que pasen de `cuantos` salen como FALLA,
  y si hay menos, la entrada está vieja y sale XPASS (actualiza `cuantos` o bórrala).
*/
const archivoDeDonde = (donde) => donde.replace(/:\d+$/, "");
const coincide = (c, h) =>
  c.regla === h.regla && (!c.archivo || archivoDeDonde(h.donde) === c.archivo) && (!c.contiene || `${h.donde} ${h.mensaje}`.includes(c.contiene));
const cubiertos = new Map(conocidos.map((c) => [c, 0]));
const errores = [];
const xfails = [];
const avisos = [];
for (const h of hallazgos) {
  if (h.nivel === "aviso") {
    avisos.push(h);
    continue;
  }
  const c = conocidos.find((x) => coincide(x, h));
  if (!c) {
    errores.push(h);
    continue;
  }
  cubiertos.set(c, cubiertos.get(c) + 1);
  if (c.cuantos !== undefined && cubiertos.get(c) > c.cuantos)
    errores.push({ ...h, mensaje: `${h.mensaje}  (hay más hallazgos que los ${c.cuantos} conocidos del issue #${c.issue}: este o uno de los otros es NUEVO)` });
  else xfails.push({ ...h, issue: c.issue });
}
const xpass = conocidos
  .filter((c) => !solo || solo.has(c.regla))
  .filter((c) => cubiertos.get(c) === 0 || (c.cuantos !== undefined && cubiertos.get(c) < c.cuantos))
  .map((c) => ({ ...c, encontrados: cubiertos.get(c) }));

if (a.json) console.log(JSON.stringify({ errores, xfails, avisos, xpass }, null, 2));
else {
  const imprimir = (etq, hs) => hs.forEach((h) => console.log(`${etq} [${h.regla}] ${h.donde}  ${h.mensaje}${h.issue ? `  (issue #${h.issue})` : ""}`));
  imprimir("AVISO ", avisos);
  imprimir("XFAIL ", xfails);
  imprimir("FALLA ", errores);
  for (const c of xpass)
    console.log(
      c.encontrados
        ? `XPASS  [${c.regla}] ${c.archivo ?? ""} ${c.contiene ?? ""} ahora hay ${c.encontrados} de ${c.cuantos}: baja "cuantos" en scripts/pruebas/conocidos.json (issue #${c.issue})`
        : `XPASS  [${c.regla}] ${c.archivo ?? ""} ${c.contiene ?? ""} ya no falla: borra su entrada de scripts/pruebas/conocidos.json (issue #${c.issue})`,
    );
  const reglas = [...new Set(["html-validate", "csp-estatica", "csp-js", "csp-readme", "json-ld", "sitemap", "lastmod", "meta", "enlaces", "cta-sin-href", "voseo"].filter(activa))];
  console.log("\nResumen por regla:");
  for (const r of reglas) {
    const e = errores.filter((h) => h.regla === r).length;
    const x = xfails.filter((h) => h.regla === r).length;
    console.log(`  ${e ? "FALLA" : x ? "XFAIL" : "OK   "}  ${r}${e ? `  (${e})` : ""}${x ? `  (${x} conocidos)` : ""}`);
  }
  console.log(`\n${paginas.length} páginas revisadas, ${errores.length} fallas, ${xfails.length} fallos conocidos, ${avisos.length} avisos, ${xpass.length} XPASS.`);
}
process.exit(errores.length || xpass.length ? 1 : 0);
