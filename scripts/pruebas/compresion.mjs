#!/usr/bin/env node
/*
  compresion: el servidor de pruebas comprime como Caddy con `encode gzip zstd` (README, bloque de Caddy):
  negocia por `Accept-Encoding` (zstd antes que gzip), solo tipos de texto y desde 512 bytes, con
  `Vary: Accept-Encoding`, y el cuerpo descomprimido es idéntico al archivo. Sin esto Lighthouse pesaba
  ~4× más bytes de CSS/JS bloqueantes que un visitante real (el LCP móvil saltaba de 1.65 s a 2.3 s al
  pasar un umbral de bytes). Uso: node compresion.mjs
*/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { iniciarServidor, RAIZ_SITIO } from "./lib/servidor.mjs";

const srv = await iniciarServidor();
const fallas = [];
const ok = (c, m) => { if (!c) { fallas.push(m); console.log(`  FALLA ${m}`); } };
const pedir = (ruta, aceptar) => new Promise((res, rej) => {
  http.get(srv.url + ruta, { headers: aceptar === null ? {} : { "Accept-Encoding": aceptar } }, (r) => {
    const partes = [];
    r.on("data", (d) => partes.push(d));
    r.on("end", () => res({ r, cuerpo: Buffer.concat(partes) }));
  }).on("error", rej);
});
const archivo = (ruta) => fs.readFileSync(path.join(RAIZ_SITIO, ruta));

const css = "/assets/css/base.css";
const crudo = archivo(css);
for (const [aceptar, esperado] of [["gzip, deflate, br, zstd", "zstd"], ["gzip", "gzip"], ["gzip;q=1, br", "gzip"], ["identity", undefined], [null, undefined]]) {
  const { r, cuerpo } = await pedir(css, aceptar);
  ok(r.headers["content-encoding"] === esperado, `${css} con Accept-Encoding «${aceptar}»: content-encoding ${r.headers["content-encoding"]} ≠ ${esperado}`);
  ok(/Accept-Encoding/i.test(r.headers.vary ?? ""), `${css}: falta Vary: Accept-Encoding`);
  let plano = null;
  try { plano = esperado === "zstd" ? zlib.zstdDecompressSync(cuerpo) : esperado === "gzip" ? zlib.gunzipSync(cuerpo) : cuerpo; } catch {}
  ok(plano?.equals(crudo), `${css} («${aceptar}»): el cuerpo descomprimido no coincide con el archivo`);
  ok(Number(r.headers["content-length"]) === cuerpo.length, `${css} («${aceptar}»): content-length no coincide`);
  if (esperado) ok(cuerpo.length < crudo.length / 2, `${css}: comprimido (${cuerpo.length}) no es < la mitad de ${crudo.length}`);
}
for (const [ruta, motivo] of [["/assets/fuentes/baloo2-extrabold-latin.woff2", "la fuente ya va comprimida"], ["/assets/img/og-yaruki.png", "la imagen ya va comprimida"], ["/robots.txt", "menos de 512 bytes"]]) {
  const { r } = await pedir(ruta, "gzip, zstd");
  ok(!r.headers["content-encoding"], `${ruta} no se comprime (${motivo}), pero llegó con ${r.headers["content-encoding"]}`);
}
const { r: rh } = await pedir("/", "gzip");
ok(rh.headers["content-encoding"] === "gzip", "/ (HTML) se comprime");
ok(rh.headers["content-security-policy"]?.includes("script-src 'self'"), "la CSP sigue en las respuestas comprimidas");
await srv.cerrar();
if (fallas.length) { console.error(`compresion: ${fallas.length} FALLA(S)`); process.exit(1); }
console.log("compresion: OK (zstd > gzip, Vary, solo texto desde 512 bytes, cuerpo íntegro)");
