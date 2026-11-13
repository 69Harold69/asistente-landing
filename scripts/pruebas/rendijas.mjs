#!/usr/bin/env node
/*
  rendijas: que la pantalla del teléfono inclinado no tenga rendijas (#99, revisión de Harold: una línea horizontal fina
  que cruza la pantalla y un corte en su orilla izquierda, con el giro de 20°/10°).

  Cómo:
    1. Rendijas hacia atrás: una costura entre los trozos que dibuja el compositor deja ver lo que hay DETRÁS del
       frente (la página). La prueba pinta la página con un color centinela, captura la pantalla, cambia el centinela
       por otro color muy distinto y vuelve a capturar con todo congelado (animaciones CSS y GSAP en pausa,
       inclinación asentada). Dentro del contorno proyectado de la pantalla, cualquier píxel que cambie entre las dos
       capturas es una rendija (sin importar su color ni su opacidad). Lo que la escena pinta es idéntico en las dos.
    2. Orilla de la escena: si la escena no llega justo al borde de la pantalla (orillas fraccionarias), lo que asoma
       es el fondo propio de la pantalla. Ese fondo debe ser el MISMO de la escena (`data-fondo`, phone.css): se
       compara el `background` calculado de la pantalla y el de la escena, y el respaldo detrás del frente.
    - escenas: splash, login, chat, elementos, hábitos, notificaciones (avisos), llamada y «Tu día» (dashboard);
    - claro y oscuro;
    - teléfono en reposo, en los 4 extremos (20° a los lados y 10° arriba/abajo) y en 2 ángulos intermedios (los
      que atraviesa en movimiento);
    - DPR 2 y 1.25 en todas; DPR 1 y 1.5 en splash y llamada (las costuras dependen del DPR).
  Uso: node rendijas.mjs [--salida DIR] [--url ...] [--rapido] [--escenas splash,llamada]   (sale con 1 si hay una rendija)
*/
import path from "node:path";
import fs from "node:fs";
import { iniciarServidor } from "./lib/servidor.mjs";
import { leerArgs, lanzarChromium, carpetaSalida, crearGuardia, scriptInicial, esperarCarga, salir } from "./lib/comun.mjs";

const a = leerArgs();
const salida = carpetaSalida(a.salida, "~/Pictures/yaruki-landing-2026-11/rendijas");
const srv = a.url ? { url: String(a.url).replace(/\/$/, ""), cerrar: async () => {} } : await iniciarServidor();
const navegador = await lanzarChromium();
const guardia = crearGuardia(srv.url);
const problemas = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok " : "  FALLA"} ${msg}`);
  if (!cond) problemas.push(msg);
};

const TODAS = ["splash", "login", "chat", "elementos", "habitos", "avisos", "llamada", "dashboard"];
const CENTINELAS = ["#ff00ff", "#00ffff"];
// Diferencia mínima por canal (0–255) para contar un píxel: una rendija con 3 % de opacidad ya pasa de 7.
const UMBRAL = 6;

/* Congela todo lo que se mueve dentro de la pantalla (animaciones CSS, Web Animations y GSAP). */
const congelar = (page) =>
  page.evaluate(() => {
    for (const an of document.getAnimations()) an.pause();
    window.gsap?.globalTimeline?.pause();
  });

/* Centinela: el fondo de la página y el propio de la pantalla (debajo de las escenas). CSSOM: la CSP no deja `<style>`. */
const pintarCentinela = (page, color) =>
  page.evaluate((color) => {
    const hoja = [...document.styleSheets].find((h) => h.href);
    if (window.__centinela !== undefined) hoja.deleteRule(window.__centinela);
    window.__centinela = hoja.insertRule(
      `html, body, main, .stage, .secciones { background: ${color} !important; background-image: none !important; }`,
      hoja.cssRules.length
    );
    // Sin malla ni vidrio detrás: solo el centinela.
    for (const el of document.querySelectorAll("canvas.malla-hero, canvas.malla-fondo, .malla-franja")) el.style.setProperty("display", "none");
  }, color);

/* Contorno de la pantalla proyectado (marcadores en sus 4 esquinas, que heredan la transformación 3D). */
const contorno = (page) =>
  page.evaluate(() => {
    const p = document.getElementById("pantalla-telefono");
    if (!p.querySelector("[data-rendija]")) {
      for (const [n, l, t] of [["tl", 0, 0], ["tr", 100, 0], ["br", 100, 100], ["bl", 0, 100]]) {
        const m = document.createElement("i");
        m.dataset.rendija = n;
        for (const [k, v] of [["position", "absolute"], ["left", `${l}%`], ["top", `${t}%`], ["width", "0"], ["height", "0"]]) m.style.setProperty(k, v);
        p.appendChild(m);
      }
    }
    const pts = ["tl", "tr", "br", "bl"].map((n) => {
      const r = p.querySelector(`[data-rendija="${n}"]`).getBoundingClientRect();
      return [r.left, r.top];
    });
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    // Tamaño y radio de la pantalla sin transformar: la máscara es su rectángulo redondeado (las esquinas del
    // rectángulo quedan fuera del cuerpo del teléfono y ahí se ve la página, legítimamente).
    const W = p.offsetWidth;
    const H = p.offsetHeight;
    const R = parseFloat(getComputedStyle(p).borderTopLeftRadius) || 0;
    return { pts, W, H, R, x: Math.floor(Math.min(...xs)) - 2, y: Math.floor(Math.min(...ys)) - 2, w: Math.ceil(Math.max(...xs) - Math.min(...xs)) + 4, h: Math.ceil(Math.max(...ys) - Math.min(...ys)) + 4 };
  });

const asentar = (page) =>
  page.evaluate(
    () =>
      new Promise((r) => {
        const e = document.getElementById("tilt-telefono");
        const leer = () => ["--tilt-x", "--tilt-y", "--tilt-p", "--mira-x", "--mira-y"].map((n) => e.style.getPropertyValue(n)).join();
        let p = leer();
        let q = 0;
        const t0 = performance.now();
        const f = () => {
          const v = leer();
          q = v === p ? q + 1 : 0;
          p = v;
          if (q > 20 || performance.now() - t0 > 15000) return r();
          requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      })
  );

/* Compara dos PNG dentro del contorno (encogido 1 px de dispositivo hacia adentro). */
async function comparar(analizador, png1, png2, caja, dpr) {
  return analizador.evaluate(
    async ({ png1, png2, caja, dpr, UMBRAL }) => {
      const leer = async (b64) => {
        const img = new Image();
        img.src = "data:image/png;base64," + b64;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        return { d: g.getImageData(0, 0, c.width, c.height).data, W: c.width, H: c.height };
      };
      const A = await leer(png1);
      const B = await leer(png2);
      // Contorno en px de dispositivo, relativo a la captura, encogido 1 px hacia el centro.
      const q = caja.pts.map(([x, y]) => [(x - caja.x) * dpr, (y - caja.y) * dpr]);
      // Homografía del cuadrado unidad al contorno proyectado, para llevar cada píxel a coordenadas locales (u, v).
      const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
      const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
      const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
      const den = dx1 * dy2 - dx2 * dy1;
      const g = (sx * dy2 - dx2 * sy) / den;
      const h = (dx1 * sy - sx * dy1) / den;
      const M = [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
      // Inversa de la 3×3.
      const [a, b, c, d, e, f, gg, hh, ii] = M;
      const A_ = e * ii - f * hh, B_ = -(d * ii - f * gg), C_ = d * hh - e * gg;
      const det = a * A_ + b * B_ + c * C_;
      const inv = [A_ / det, -(b * ii - c * hh) / det, (b * f - c * e) / det, B_ / det, (a * ii - c * gg) / det, -(a * f - c * d) / det, C_ / det, -(a * hh - b * gg) / det, (a * e - b * d) / det];
      // Margen: 1.5 px de dispositivo hacia adentro del contorno redondeado (el borde mismo se suaviza contra el bisel).
      const margen = 1.5 / dpr;
      const dentro = (px, py) => {
        const w = inv[6] * px + inv[7] * py + inv[8];
        const u = (inv[0] * px + inv[1] * py + inv[2]) / w;
        const v = (inv[3] * px + inv[4] * py + inv[5]) / w;
        const lx = u * caja.W;
        const ly = v * caja.H;
        if (lx < margen || ly < margen || lx > caja.W - margen || ly > caja.H - margen) return false;
        const r = Math.max(0, caja.R - margen);
        const ex = lx < caja.R ? caja.R - lx : lx > caja.W - caja.R ? lx - (caja.W - caja.R) : 0;
        const ey = ly < caja.R ? caja.R - ly : ly > caja.H - caja.R ? ly - (caja.H - caja.R) : 0;
        return ex === 0 || ey === 0 || Math.hypot(ex, ey) <= r;
      };
      let n = 0;
      let peor = 0;
      const muestras = [];
      const W = Math.min(A.W, B.W);
      const H = Math.min(A.H, B.H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!dentro(x + 0.5, y + 0.5)) continue;
          const i = (y * A.W + x) * 4;
          const j = (y * B.W + x) * 4;
          const dd = Math.max(Math.abs(A.d[i] - B.d[j]), Math.abs(A.d[i + 1] - B.d[j + 1]), Math.abs(A.d[i + 2] - B.d[j + 2]));
          if (dd > UMBRAL) {
            n++;
            if (muestras.length < 6) muestras.push(`${(x / dpr).toFixed(1)},${(y / dpr).toFixed(1)}`);
          }
          peor = Math.max(peor, dd);
        }
      }
      return { n, peor, muestras };
    },
    { png1, png2, caja, dpr, UMBRAL }
  );
}

const combinaciones = [];
for (const tema of ["light", "dark"]) {
  for (const dpr of [2, 1.25]) for (const escena of TODAS) combinaciones.push({ tema, dpr, escena });
  for (const dpr of [1, 1.5]) for (const escena of ["splash", "llamada"]) combinaciones.push({ tema, dpr, escena });
}

try {
  const analizador = await (await navegador.newContext()).newPage();
  const soloEscenas = a.escenas ? String(a.escenas).split(",") : null;
  const lista = (a.rapido ? combinaciones.filter((c) => c.dpr === 1.25) : combinaciones).filter((c) => !soloEscenas || soloEscenas.includes(c.escena));
  for (const { tema, dpr, escena } of lista) {
    const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: tema, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    guardia.instalar(page, `rendijas ${escena} ${tema} x${dpr}`);
    await page.addInitScript(scriptInicial({ tema }));
    await page.goto(`${srv.url}/?escena=${escena}`, { waitUntil: "load" });
    await esperarCarga(page, { portada: true });
    const r = await page.evaluate(() => {
      const b = document.getElementById("telefono").getBoundingClientRect();
      return { cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
    });
    const poses = [
      ["reposo", r.cx, r.cy],
      ["arriba-izquierda", 4, 4],
      ["arriba-derecha", 1436, 4],
      ["abajo-izquierda", 4, 896],
      ["abajo-derecha", 1436, 896],
      ["intermedia-1", r.cx - 260, r.cy - 170],
      ["intermedia-2", r.cx + 140, r.cy + 260],
    ];
    // El fondo propio de la pantalla y el respaldo detrás del frente son los de la escena (una rendija no cambia de color).
    const fondos = await page.evaluate(() => {
      const bg = (el, pseudo) => {
        const c = getComputedStyle(el, pseudo);
        return `${c.backgroundColor} ${c.backgroundImage}`;
      };
      const escena = document.querySelector("#pantalla-telefono .escena");
      // El fondo visible de la escena: el de su raíz (o el de `.escena` si la raíz no pinta).
      return { escena: escena ? bg(escena) : "", pantalla: bg(document.getElementById("pantalla-telefono")), respaldo: bg(document.getElementById("telefono"), "::before") };
    });
    ok(fondos.pantalla === fondos.escena && fondos.respaldo === fondos.escena, `${escena} ${tema === "light" ? "claro" : "oscuro"} ×${dpr}: el fondo de la pantalla y su respaldo son los de la escena (escena «${fondos.escena}», pantalla «${fondos.pantalla}», respaldo «${fondos.respaldo}»)`);
    let total = 0;
    let peor = 0;
    let detalle = "";
    for (const [pose, x, y] of poses) {
      await page.mouse.move(x, y, { steps: 6 });
      await asentar(page);
      await congelar(page);
      const caja = await contorno(page);
      const clip = { x: caja.x, y: caja.y, width: caja.w, height: caja.h };
      await pintarCentinela(page, CENTINELAS[0]);
      const png1 = (await page.screenshot({ clip })).toString("base64");
      await pintarCentinela(page, CENTINELAS[1]);
      const png2 = (await page.screenshot({ clip })).toString("base64");
      const c = await comparar(analizador, png1, png2, caja, dpr);
      if (c.n > 0) {
        total += c.n;
        detalle += ` ${pose}: ${c.n} px (máx ${c.peor}/255, p. ej. ${c.muestras.join(" ")})`;
        fs.writeFileSync(path.join(salida, `rendija-${escena}-${tema}-x${dpr}-${pose}.png`), Buffer.from(png1, "base64"));
      }
      peor = Math.max(peor, c.peor);
      // Retoma las animaciones para la siguiente pose (y quita el centinela).
      await page.evaluate(() => {
        const hoja = [...document.styleSheets].find((h) => h.href);
        if (window.__centinela !== undefined) hoja.deleteRule(window.__centinela);
        window.__centinela = undefined;
        for (const an of document.getAnimations()) an.play();
        window.gsap?.globalTimeline?.resume();
      });
    }
    ok(total === 0, `${escena} ${tema === "light" ? "claro" : "oscuro"} ×${dpr}: sin rendijas en la pantalla en reposo, en los 4 extremos y en 2 ángulos intermedios (${total} px; peor diferencia ${peor}/255)${detalle}`);
    await ctx.close();
  }
  await analizador.context().close();
  ok(guardia.fallas.length === 0, `consola limpia (${guardia.fallas.length} fallas)`);
  for (const f of guardia.fallas) console.error("   ", f.tipo, f.detalle, `[${f.contexto}]`);
} catch (e) {
  problemas.push("excepción: " + (e?.stack ?? e));
  console.error(e);
} finally {
  await navegador.close();
  await srv.cerrar();
}
salir(problemas.length ? 1 : 0, problemas.length ? `\n${problemas.length} verificación(es) fallaron` : "\nrendijas: todo en verde");
