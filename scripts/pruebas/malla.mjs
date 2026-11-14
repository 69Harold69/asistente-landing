#!/usr/bin/env node
/*
  malla: prueba de la malla de fondo continua (assets/js/malla.js, issue #98; nació en el hero con el #26).
    - UN solo <canvas class="malla-fondo">, fijo, hijo de <body>, decorativo (aria-hidden, pointer-events: none),
      que PINTA (píxeles no vacíos) en claro y en oscuro; al cambiar de tema se repinta con los colores del tema nuevo;
    - SE MUEVE SOLO: dos cuadros separados en el tiempo, sin tocar el mouse, difieren (onda en reposo);
    - reacciona al mouse real en escritorio (cerca del cursor los puntos crecen y se encienden, y vuelve al salir) y NO
      reacciona en táctil (hover: none), pero sí ondula;
    - ritmo: ~30 fps en reposo y 60 fps solo mientras el cursor se mueve; cero cuadros con la pestaña oculta y con
      <main> fuera de pantalla (el pie lo cubre); se reanuda al volver;
    - con prefers-reduced-motion: se dibuja una vez, estática, sin reaccionar, y el cambio en vivo se atiende;
    - la intensidad detrás del recorrido (data-malla-recorrido): plena (1), decisión de Harold;
    - sin JavaScript no hay canvas ni hueco;
    - costo por cuadro (escritorio y móvil con CPU ×4) y sin tareas largas;
    - contraste AA (4.5, o 3 en texto grande) del texto de TODA la portada (hero, fase del recorrido, «Tu día», «Cómo
      funciona», «Lo que viene», preguntas, «Quién está detrás» y el pie) sobre la malla, medido en píxeles renderizados
      con el cursor real barriendo cada bloque (peor píxel, claro y oscuro);
    - consola limpia (sin console.error, pageerror ni violaciones de CSP).
  Uso: node malla.mjs [--url http://...] [--salida DIR] [--solo contraste]   (sale con 1 si algo falla)
*/
import fs from "node:fs";
import path from "node:path";
import { iniciarServidor } from "./lib/servidor.mjs";
import { leerArgs, lanzarChromium, carpetaSalida, crearGuardia, scriptInicial, esperarCarga, dormir, salir } from "./lib/comun.mjs";
import { ruedaHasta } from "./lib/scroll.mjs";

const a = leerArgs();
const salida = carpetaSalida(a.salida, "~/Pictures/yaruki-landing-2026-11/malla");
const srv = a.url ? { url: String(a.url).replace(/\/$/, ""), cerrar: async () => {} } : await iniciarServidor();
const navegador = await lanzarChromium();
const guardia = crearGuardia(srv.url);
const problemas = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "  ok " : "  FALLA"} ${msg}`);
  if (!cond) problemas.push(msg);
};

/*
  Cuenta y mide solo los cuadros que DIBUJAN de la malla. malla.js expone `canvas.cuadrosAnimados` (cuadros de
  animación dibujados; a 30 fps la mitad de las llamadas de su rAF no dibujan). Se envuelven TODOS los rAF de la página
  y se atribuye a la malla el callback durante el cual ese contador subió: no depende del nombre de ninguna función ni
  se confunde con los rAF de tilt.js, stage.js o progreso.js. Los redibujados que no son animación (tema, tamaño,
  scroll con reduced-motion) no cuentan.
*/
const CONTADOR = `
  window.__malla = { cuadros: 0, tiempos: [], largas: [] };
  let lienzo = null;
  const animados = () => {
    lienzo ??= document.querySelector("canvas.malla-fondo");
    return lienzo ? lienzo.cuadrosAnimados ?? 0 : 0;
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      const antes = animados();
      const t0 = performance.now();
      cb(t);
      if (animados() > antes) {
        window.__malla.tiempos.push(performance.now() - t0);
        window.__malla.cuadros++;
      }
    });
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__malla.largas.push(e.duration)))
      .observe({ type: "longtask", buffered: true });
  } catch {}
`;

async function abrir({ tema = "light", reducido = false, js = true, ancho = 1440, alto = 900, movil = false, query = "", etiqueta }) {
  const ctx = await navegador.newContext({
    viewport: { width: ancho, height: alto },
    colorScheme: tema,
    reducedMotion: reducido ? "reduce" : "no-preference",
    javaScriptEnabled: js,
    isMobile: movil,
    hasTouch: movil,
    deviceScaleFactor: movil ? 2 : 1,
  });
  const page = await ctx.newPage();
  guardia.instalar(page, etiqueta ?? `malla ${tema}${reducido ? " reducido" : ""}${movil ? " móvil" : ""}`);
  if (js) {
    await page.addInitScript(scriptInicial({ tema }));
    await page.addInitScript(CONTADOR);
  }
  await page.goto(srv.url + "/" + query, { waitUntil: "load" });
  if (js) {
    await esperarCarga(page, { portada: true });
    // La malla arranca en requestIdleCallback tras el primer pintado (con la máquina cargada puede tardar).
    await page.waitForSelector("canvas.malla-fondo", { state: "attached", timeout: 6000 }).catch(() => {});
    await dormir(400);
  }
  return { ctx, page };
}

const cuadros = (page) => page.evaluate(() => window.__malla?.cuadros ?? -1);
const pixeles = (page) =>
  page.evaluate(() => {
    const c = document.querySelector("canvas.malla-fondo");
    if (!c || !c.width) return null;
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return { n, ancho: c.width, alto: c.height };
  });
/* Huella de TODO el canvas (submuestreada): cambia si algún píxel cambia. */
const huellaTotal = (page) =>
  page.evaluate(() => {
    const c = document.querySelector("canvas.malla-fondo");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 52) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3] * 11) | 0;
    return h;
  });
/*
  «Encendido» del bloque de píxeles alrededor de (x, y). Al acercarse el cursor, cada punto de la malla crece de 1.35 a
  hasta 4.35 px de radio y sube a la opacidad encendida (`--malla-punto-activo`); las líneas apenas cambian.
  Se mide el ÁREA (px² de CSS) pintada con opacidad efectiva ≥ el punto medio entre la línea encendida y el punto
  encendido (los dos tokens, leídos del tema): solo la alcanzan los puntos (las líneas son colores opacos ya mezclados
  con el fondo y no apilan), y encendidos son ~10 veces más grandes. Es la misma medida en claro y en oscuro.
  Antes se usaba el promedio de (azul − rojo), que medía el CAMBIO DE COLOR: con la malla de claro aprobada (reposo 0.24 /
  0.54, encendida 0.30 / 0.56, #98) el reposo casi alcanza al encendido y daba +7–8 aunque la reacción estuviera intacta.
  Se sigue imprimiendo como dato. Quitar la reacción al cursor (malla.js sin `activo`) deja el área igual (8 → 7).
*/
const encendido = (page, x, y, r = 110) =>
  page.evaluate(([x, y, r]) => {
    const c = document.querySelector("canvas.malla-fondo");
    const b = c.getBoundingClientRect();
    const k = c.width / b.width;
    const cs = getComputedStyle(document.documentElement);
    const color = (v) => {
      const el = document.createElement("i");
      el.style.setProperty("color", `var(${v})`);
      document.body.append(el);
      const m = getComputedStyle(el).color.match(/[\d.]+/g).map(Number);
      el.remove();
      return m.slice(0, 3);
    };
    const fondo = color("--color-bg");
    const acento = color("--color-accent");
    const dist = Math.hypot(acento[0] - fondo[0], acento[1] - fondo[1], acento[2] - fondo[2]);
    const umbral = (parseFloat(cs.getPropertyValue("--malla-linea-activa")) + parseFloat(cs.getPropertyValue("--malla-punto-activo"))) / 2;
    const x0 = Math.max(0, Math.round((x - r) * k)), y0 = Math.max(0, Math.round((y - r) * k));
    const d = c.getContext("2d").getImageData(x0, y0, Math.round(2 * r * k), Math.round(2 * r * k)).data;
    let s = 0, n = 0, area = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 20) { s += d[i + 2] - d[i]; n++; }
      const op = ((d[i + 3] / 255) * Math.hypot(d[i] - fondo[0], d[i + 1] - fondo[1], d[i + 2] - fondo[2])) / dist;
      if (op >= umbral) area++;
    }
    return { area: area / (k * k), azulRojo: n ? s / n : 0 };
  }, [x, y, r]);
const verEncendido = (v) => `área de puntos encendidos ${v.area.toFixed(0)} px², azul−rojo ${v.azulRojo.toFixed(0)}`;
/* Lo mínimo que debe crecer esa área con el cursor encima (medido: claro 8 → 79, oscuro 0 → 75; sin reacción, 8 → 7). */
const AREA_ENCENDIDA = 30;
const mover = async (page, x0, y0, x1, y1, pasos = 30) => {
  await page.mouse.move(x0, y0);
  for (let i = 1; i <= pasos; i++) {
    await page.mouse.move(x0 + ((x1 - x0) * i) / pasos, y0 + ((y1 - y0) * i) / pasos);
    await dormir(16);
  }
};
const opacidadCanvas = (page) => page.evaluate(() => Number(getComputedStyle(document.querySelector("canvas.malla-fondo")).opacity));
const alturaPagina = (page) => page.evaluate(() => document.documentElement.scrollHeight);

try {
  if (!a.solo) {
  /* ---- 1. existe, decorativo, fijo, pinta (claro y oscuro) ---- */
  const colorTema = {};
  for (const tema of ["light", "dark"]) {
    console.log(`\n== ${tema === "light" ? "claro" : "oscuro"}: existe y pinta`);
    const { ctx, page } = await abrir({ tema });
    const info = await page.evaluate(() => {
      const lista = document.querySelectorAll("canvas.malla-fondo");
      const c = lista[0];
      if (!c) return null;
      const cs = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      return { n: lista.length, contador: typeof c.cuadrosAnimados, aria: c.getAttribute("aria-hidden"), pe: cs.pointerEvents, pos: cs.position, z: cs.zIndex, padre: c.parentElement.tagName, ancho: r.width, alto: r.height, vw: innerWidth, vh: innerHeight, tabindex: c.getAttribute("tabindex"), otros: document.querySelectorAll("canvas.malla-hero").length };
    });
    ok(!!info, "el canvas .malla-fondo existe");
    if (info) {
      ok(info.n === 1, `hay UN solo canvas de malla (${info.n})`);
      ok(info.contador === "number", `expone su contador de cuadros (canvas.cuadrosAnimados: ${info.contador})`);
      ok(info.otros === 0, "ya no hay un canvas por sección (.malla-hero)");
      ok(info.aria === "true", "aria-hidden=\"true\"");
      ok(info.pe === "none", "pointer-events: none");
      ok(info.pos === "fixed" && info.z === "-1", `fijo y detrás de todo (position ${info.pos}, z-index ${info.z})`);
      ok(info.padre === "BODY", "es hijo directo de <body>");
      ok(Math.abs(info.ancho - info.vw) <= 1 && info.alto >= info.vh - 1, `cubre el viewport (${info.ancho}×${info.alto} en ${info.vw}×${info.vh})`);
    }
    const p = await pixeles(page);
    ok(!!p && p.n > 200, `pinta píxeles no vacíos (${p?.n ?? 0} con alfa > 0)`);
    colorTema[tema] = await page.evaluate(() => {
      const c = document.querySelector("canvas.malla-fondo");
      if (!c) return null;
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return [d[i - 3], d[i - 2], d[i - 1]].join(",");
      return null;
    });
    await page.screenshot({ path: path.join(salida, `malla-${tema === "light" ? "claro" : "oscuro"}-reposo.png`) });

    /* ---- 2. se mueve sola (sin tocar el mouse) ---- */
    const h1 = await huellaTotal(page);
    await dormir(1500);
    const h2 = await huellaTotal(page);
    await dormir(1500);
    const h3 = await huellaTotal(page);
    ok(h1 !== h2 && h2 !== h3 && h1 !== h3, "SE MUEVE SOLA: tres cuadros separados 1.5 s, sin mouse, son distintos (onda en reposo)");

    /* ---- 3. reacciona al mouse real ---- */
    const sin = await encendido(page, 720, 380);
    await mover(page, 300, 200, 720, 380);
    await dormir(700);
    const con = await encendido(page, 720, 380);
    ok(con.area - sin.area >= AREA_ENCENDIDA, `cerca del cursor la malla se enciende: los puntos crecen y suben al acento (${verEncendido(sin)} -> ${verEncendido(con)}; mínimo +${AREA_ENCENDIDA} px²)`);
    await page.screenshot({ path: path.join(salida, `malla-${tema === "light" ? "claro" : "oscuro"}-cursor.png`) });
    // El cursor se va: la malla vuelve sola a su estado de reposo.
    await page.evaluate(() => document.documentElement.dispatchEvent(new PointerEvent("pointerleave")));
    await dormir(1200);
    const luego = await encendido(page, 720, 380);
    ok(luego.area - sin.area < (con.area - sin.area) * 0.3, `al salir el cursor la malla se apaga sola (área ${con.area.toFixed(0)} -> ${luego.area.toFixed(0)} px²)`);

    /* ---- 4. cambio de tema repinta ---- */
    if (tema === "light") {
      await page.click("[data-theme-toggle]");
      await dormir(1500);
      const q = await page.evaluate(() => {
        const c = document.querySelector("canvas.malla-fondo");
        const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return [d[i - 3], d[i - 2], d[i - 1]].join(",");
        return null;
      });
      ok(q !== null && q !== colorTema.light, `el toggle de tema repinta la malla con los colores del tema nuevo (${colorTema.light} -> ${q})`);
    }
    await ctx.close();
  }
  ok(colorTema.light !== colorTema.dark, "claro y oscuro pintan con colores distintos (leídos de los tokens)");

  /* ---- 5. ritmo: 30 fps en reposo, 60 fps con el cursor moviéndose ---- */
  console.log("\n== ritmo de cuadros");
  {
    const { ctx, page } = await abrir({ tema: "dark" });
    await dormir(600);
    const c0 = await cuadros(page);
    await dormir(2000);
    const reposo = ((await cuadros(page)) - c0) / 2;
    const m0 = await cuadros(page);
    const t0 = Date.now();
    for (let v = 0; v < 3; v++) await mover(page, 200, 200 + v * 40, 1200, 600, 60);
    const movimiento = ((await cuadros(page)) - m0) / ((Date.now() - t0) / 1000);
    console.log(`   reposo ${reposo.toFixed(1)} cuadros/s, cursor en movimiento ${movimiento.toFixed(1)} cuadros/s`);
    ok(reposo > 15, `la onda no se detiene en reposo (${reposo.toFixed(1)} cuadros/s)`);
    ok(reposo < 40, `en reposo se dibuja como mucho a ~30 fps (${reposo.toFixed(1)} cuadros/s)`);
    ok(movimiento > reposo * 1.4, `con el cursor moviéndose sube hacia 60 fps (${movimiento.toFixed(1)} cuadros/s)`);
    await ctx.close();
  }

  /* ---- 6. pausa con <main> fuera de pantalla y con la pestaña oculta ---- */
  console.log("\n== pausa: <main> fuera de pantalla / pestaña oculta");
  {
    // Viewport bajo: el pie (opaco) cubre todo el viewport al llegar al final.
    const { ctx, page } = await abrir({ tema: "dark", alto: 520 });
    await dormir(500);
    ok((await cuadros(page)) > 0, `a la vista hay cuadros aunque el mouse no se mueva (${await cuadros(page)})`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await dormir(1500);
    const fuera = await page.evaluate(() => {
      const r = document.getElementById("contenido").getBoundingClientRect();
      return r.bottom <= 0;
    });
    ok(fuera, "con el pie al final, <main> queda fuera del viewport (precondición)");
    const c1 = await cuadros(page);
    for (let i = 0; i < 25; i++) {
      await page.mouse.move(300 + i * 20, 300 + (i % 5) * 30);
      await dormir(30);
    }
    await dormir(800);
    ok((await cuadros(page)) === c1, "<main> fuera de pantalla: cero cuadros aunque el mouse se mueva");
    await page.evaluate(() => window.scrollTo(0, 0));
    await dormir(1200);
    const c2 = await cuadros(page);
    await dormir(1000);
    ok((await cuadros(page)) > c2 + 10, "al volver a subir la malla se reanuda sola");
    // Pestaña oculta
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await dormir(500);
    const c3 = await cuadros(page);
    for (let i = 0; i < 25; i++) {
      await page.mouse.move(300 + i * 20, 300 + (i % 5) * 30);
      await dormir(30);
    }
    await dormir(600);
    ok((await cuadros(page)) === c3, "pestaña oculta: cero cuadros aunque el mouse se mueva");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await dormir(800);
    ok((await cuadros(page)) > c3, "al mostrarse la pestaña otra vez, se reanuda");
    await ctx.close();
  }

  /* ---- 7. reduced-motion ---- */
  console.log("\n== prefers-reduced-motion");
  {
    const { ctx, page } = await abrir({ tema: "light", reducido: true });
    const p = await pixeles(page);
    ok(!!p && p.n > 200, "reduced-motion: se dibuja una vez (estática)");
    const h1 = await huellaTotal(page);
    await mover(page, 300, 200, 720, 380);
    await dormir(1500);
    ok((await cuadros(page)) === 0, "reduced-motion: cero cuadros de animación");
    ok((await huellaTotal(page)) === h1, "reduced-motion: ni ondula ni reacciona al cursor (el lienzo no cambia)");
    await page.screenshot({ path: path.join(salida, "malla-claro-reduced-motion.png") });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await dormir(1500);
    ok((await cuadros(page)) > 5, "al cambiar la preferencia en vivo (a permitir movimiento) la malla ondula");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await dormir(500);
    const c = await cuadros(page);
    await mover(page, 300, 200, 720, 380);
    await dormir(1000);
    ok((await cuadros(page)) === c, "al volver a reduced-motion en vivo se detiene");
    await ctx.close();
  }

  /* ---- 8. móvil/táctil: ondula, no reacciona al dedo ---- */
  console.log("\n== móvil / táctil (390×844)");
  {
    const { ctx, page } = await abrir({ tema: "dark", ancho: 390, alto: 844, movil: true });
    const mq = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
    ok(!mq, "precondición: el contexto táctil NO tiene hover ni puntero fino");
    const h1 = await huellaTotal(page);
    await dormir(1500);
    ok((await huellaTotal(page)) !== h1, "móvil: la malla ondula sola");
    const c0 = await cuadros(page);
    await dormir(2000);
    const fps = ((await cuadros(page)) - c0) / 2;
    ok(fps > 12 && fps < 40, `móvil: ~30 fps (${fps.toFixed(1)} cuadros/s)`);
    const sin = await encendido(page, 200, 420, 150);
    await page.touchscreen.tap(200, 420);
    await mover(page, 100, 300, 280, 520);
    await dormir(600);
    const con = await encendido(page, 200, 420, 150);
    ok(Math.abs(con.area - sin.area) < AREA_ENCENDIDA / 2 && con.azulRojo - sin.azulRojo < 8, `móvil: ni el toque ni un mouse emulado la encienden (${verEncendido(sin)} -> ${verEncendido(con)})`);
    await ctx.close();
  }

  /* ---- 8b. variantes de móvil (?malla-movil=) y modo de diagnóstico (?malla-diagnostico=1) ---- */
  console.log("\n== móvil: variantes y diagnóstico");
  {
    const info = (page) => page.evaluate(() => document.querySelector("canvas.malla-fondo")?.mallaInfo ?? null);
    // Por defecto (sin parámetro): sin diagnóstico (ni elemento ni descarga del módulo) y la variante por defecto.
    const pedidos = [];
    const { ctx, page } = await abrir({ tema: "dark", ancho: 390, alto: 844, movil: true });
    page.on("request", (r) => pedidos.push(r.url()));
    const i0 = await info(page);
    ok(i0 && i0.variante === "normal" && i0.dpr === 2 && i0.nivel === 0, `móvil por defecto: variante normal a DPR 2, sin degradar (${JSON.stringify(i0)})`);
    const diag0 = await page.evaluate(() => !!document.querySelector(".malla-diagnostico"));
    const mods = await page.evaluate(() => performance.getEntriesByType("resource").some((e) => /malla-diagnostico/.test(e.name)));
    ok(!diag0 && !mods && !pedidos.some((u) => /malla-diagnostico/.test(u)), "sin ?malla-diagnostico no hay medidor ni se descarga su módulo");
    await ctx.close();
    // normal: canvas a DPR 2 (el de antes de la auditoría); ligera: DPR 1, sigue ondulando a ~30 fps.
    {
      const { ctx, page } = await abrir({ tema: "dark", ancho: 390, alto: 844, movil: true, query: "?malla-movil=normal" });
      const i = await info(page);
      ok(i && i.variante === "normal" && i.dpr === 2, `?malla-movil=normal: canvas a DPR 2 (${JSON.stringify(i)})`);
      await ctx.close();
    }
    {
      const { ctx, page } = await abrir({ tema: "dark", ancho: 390, alto: 844, movil: true, query: "?malla-movil=ligera" });
      const i = await info(page);
      ok(i && i.variante === "ligera" && i.dpr === 1, `?malla-movil=ligera: canvas a DPR 1 (${JSON.stringify(i)})`);
      const c0 = await cuadros(page);
      await dormir(2000);
      const fps = ((await cuadros(page)) - c0) / 2;
      ok(fps > 12 && fps < 40, `ligera: sigue ondulando a ~30 fps (${fps.toFixed(1)})`);
      await ctx.close();
    }
    // pausa-scroll: mientras el dedo arrastra no dibuja; al soltar vuelve a ondular.
    {
      const { ctx, page } = await abrir({ tema: "dark", ancho: 390, alto: 844, movil: true, query: "?malla-movil=pausa-scroll" });
      const cdp = await ctx.newCDPSession(page);
      const toque = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: 195, y, id: 1 }] });
      await toque("touchStart", 760);
      for (let i = 1; i <= 8; i++) { await toque("touchMove", 760 - i * 10); await dormir(40); }
      const c0 = await cuadros(page);
      for (let i = 9; i <= 50; i++) { await toque("touchMove", 760 - i * 10); await dormir(40); }
      const enScroll = ((await cuadros(page)) - c0) / 1.68;
      await toque("touchEnd", 0);
      await dormir(1500);
      const c1 = await cuadros(page);
      await dormir(1000);
      const despues = (await cuadros(page)) - c1;
      ok(enScroll < 6, `pausa-scroll: casi sin cuadros mientras el dedo hace scroll (${enScroll.toFixed(1)} cuadros/s)`);
      ok(despues > 12, `pausa-scroll: al soltar vuelve a ondular (${despues} cuadros en 1 s)`);
      await ctx.close();
    }
    // Diagnóstico: panel inequívoco (pantalla vs malla, reposo vs scroll, costo por dibujo), plegable, con "Copiar resultados".
    {
      const { ctx, page } = await abrir({ tema: "light", ancho: 390, alto: 844, movil: true, query: "?malla-diagnostico=1&malla-movil=ligera" });
      await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
      const cdp = await ctx.newCDPSession(page);
      await dormir(6500); // al menos unos segundos de reposo completos
      const leer = () => page.evaluate(() => {
        const el = document.querySelector(".malla-diagnostico");
        return el ? { texto: el.innerText, enlaces: [...el.querySelectorAll("a")].map((x) => x.textContent), visible: el.getBoundingClientRect().height > 20, alto: el.getBoundingClientRect().height, vh: innerHeight } : null;
      });
      let d = await leer();
      ok(!!d && d.visible && /Malla: ligera/.test(d.texto) && /Pantalla: máx\. visto \d+ Hz/.test(d.texto) && /En reposo \(últimos 5 s sin tocar\): \d+ fps/.test(d.texto), `?malla-diagnostico=1: panel con variante, tasa de la pantalla y bloque «En reposo» (${d ? d.texto.split("\n").slice(0, 5).join(" | ") : "no existe"})`);
      ok(!!d && /Malla: \d+ dibujos\/s \(tope: 30 en táctil/.test(d.texto) && /Costo de la malla por dibujo: p50 [\d.]+ \/ p95 [\d.]+ ms/.test(d.texto) && /Cuadros largos \(> 50 ms\): \d+ · Tareas largas: \d+/.test(d.texto), "el panel separa «Malla: N dibujos/s (tope)» de la pantalla y muestra el costo por dibujo p50/p95 y los cuadros/tareas largas");
      ok(!!d && /Durante el scroll \(último gesto\): haz scroll/.test(d.texto), "antes de tocar, «Durante el scroll» pide hacer un gesto");
      ok(!!d && ["apagada", "normal", "ligera", "pausa-scroll", "ligera-pausa"].every((v) => d.enlaces.includes(v)), `enlaces a las variantes y a «apagada» (${d?.enlaces.join(", ")})`);
      ok(!!d && d.alto < d.vh * 0.6, `el panel no tapa media pantalla (${d?.alto.toFixed(0)} de ${d?.vh} px)`);
      // Un gesto de scroll rellena «Durante el scroll» y lo conserva al soltar.
      // (Toques reales por CDP, arriba del panel: synthesizeScrollGesture no desplaza aquí y un arrastre sobre el panel desplaza el panel.)
      const toqueDiag = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: 195, y, id: 1 }] });
      await toqueDiag("touchStart", 330);
      for (let i = 1; i <= 40; i++) { await toqueDiag("touchMove", 330 - i * 7); await dormir(16); }
      await toqueDiag("touchEnd", 0);
      await dormir(900);
      d = await leer();
      ok(!!d && /Durante el scroll \(último gesto, [\d.]+ s\): \d+ fps · mín \d+ · peor cuadro \d+ ms/.test(d.texto), `tras un scroll, «Durante el scroll» muestra fps, mínimo y peor cuadro (${d ? (d.texto.match(/Durante el scroll[^\n]*/) || [""])[0] : ""})`);
      // Copiar: texto plano con variante, navegador, DPR, aceleración y avisos.
      await page.evaluate(() => [...document.querySelectorAll(".malla-diagnostico button")].find((b) => /Copiar/.test(b.textContent)).click());
      await dormir(400);
      const copiado = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
      ok(!!copiado && /Variante: ligera/.test(copiado) && /Navegador:/.test(copiado) && /DPR/.test(copiado) && /Gráficos:/.test(copiado) && /ahorro de batería/i.test(copiado) && /En reposo/.test(copiado), `«Copiar resultados» deja el texto plano en el portapapeles (${copiado ? copiado.split("\n").length : 0} líneas)`);
      await page.screenshot({ path: path.join(salida, "malla-diagnostico-movil.png") });
      // Plegar: el cuerpo se oculta y queda la línea de resumen.
      await page.evaluate(() => [...document.querySelectorAll(".malla-diagnostico button")].find((b) => /Plegar/.test(b.textContent)).click());
      const plegado = await page.evaluate(() => ({ h: document.querySelector(".malla-diagnostico").getBoundingClientRect().height, resumen: document.querySelector(".malla-diagnostico-barra span").textContent, abierto: document.querySelector(".malla-diagnostico-barra button").getAttribute("aria-expanded") }));
      ok(plegado.h < 100 && plegado.abierto === "false" && /Pantalla \d+ fps · malla \d+\/s/.test(plegado.resumen), `plegado: solo la línea de resumen (${plegado.h.toFixed(0)} px: «${plegado.resumen}»)`);
      await page.screenshot({ path: path.join(salida, "malla-diagnostico-movil-plegado.png") });
      await ctx.close();
    }
    // ?malla=apagada: la página sola, sin canvas ni bucle; el panel sigue midiendo.
    {
      const { ctx, page } = await abrir({ tema: "dark", ancho: 390, alto: 844, movil: true, query: "?malla-diagnostico=1&malla=apagada" });
      await dormir(2500);
      const r = await page.evaluate(() => ({
        canvas: !!document.querySelector("canvas.malla-fondo"),
        titular: document.getElementById("titular").getBoundingClientRect().height,
        desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        panel: document.querySelector(".malla-diagnostico")?.innerText ?? "",
        actual: document.querySelector(".malla-diagnostico a[aria-current]")?.textContent,
      }));
      ok(!r.canvas && r.titular > 40 && !r.desborde, "?malla=apagada: no hay canvas, la página queda bien y sin desborde");
      ok(/APAGADA/.test(r.panel) && /En reposo \(últimos 5 s sin tocar\): \d+ fps/.test(r.panel) && /Malla: sin bucle/.test(r.panel) && r.actual === "apagada", "?malla=apagada: el panel sigue midiendo la pantalla y dice que la malla está apagada");
      const dibujos = await page.evaluate(() => window.__malla?.cuadros ?? 0);
      ok(dibujos === 0, `?malla=apagada: la malla no dibuja nada (${dibujos})`);
      await ctx.close();
    }
    // Degradación por software: forzable con ?malla-forzar=software (nivel 2: 15 fps, cuadrícula de 192 px); sigue ondulando.
    {
      const { ctx, page } = await abrir({ tema: "dark", query: "?malla-diagnostico=1&malla-forzar=software" });
      const i = await page.evaluate(() => document.querySelector("canvas.malla-fondo").mallaInfo);
      ok(i.nivel === 2 && i.fpsTope === 15 && i.sep === 192 && /forzado/.test(i.motivo), `?malla-forzar=software: degradación nivel 2 (${JSON.stringify({ nivel: i.nivel, fps: i.fpsTope, sep: i.sep })})`);
      const c0 = await cuadros(page);
      const h0 = await huellaTotal(page);
      await dormir(3000);
      const fps = ((await cuadros(page)) - c0) / 3;
      const h1 = await huellaTotal(page);
      ok(fps > 8 && fps < 20, `degradada: dibuja ~15 cuadros/s, no se ve congelada (${fps.toFixed(1)}/s)`);
      ok(h0 !== h1, "degradada: la onda sigue moviéndose");
      const px = await pixeles(page);
      ok(px && px.n > 1000, `degradada: pinta (${px?.n} píxeles)`);
      const panel = await page.evaluate(() => document.querySelector(".malla-diagnostico").innerText);
      ok(/Degradación: nivel 2 \(forzado/.test(panel), "el diagnóstico muestra que está degradada y por qué");
      await ctx.close();
      // ?malla-forzar=normal: nivel 0 y no baja nunca.
      const { ctx: c2, page: p2 } = await abrir({ tema: "dark", query: "?malla-forzar=normal" });
      const i2 = await p2.evaluate(() => document.querySelector("canvas.malla-fondo").mallaInfo);
      ok(i2.nivel === 0 && i2.fpsTope === 30, "?malla-forzar=normal: sin degradación");
      await c2.close();
    }
    // Degradación automática: un teléfono lento (CPU ×8) con la variante por defecto baja solo de nivel y sigue ondulando.
    {
      const { ctx, page } = await abrir({ tema: "dark", ancho: 390, alto: 844, movil: true });
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 8 });
      await dormir(7000);
      const i = await page.evaluate(() => document.querySelector("canvas.malla-fondo").mallaInfo);
      ok(i.nivel >= 1 && /costo/.test(i.motivo), `teléfono muy lento (CPU ×8): la malla baja sola de nivel (${JSON.stringify({ nivel: i.nivel, motivo: i.motivo, p50: +i.costoP50.toFixed(1) })})`);
      const c0 = await cuadros(page);
      await dormir(2000);
      const fps = ((await cuadros(page)) - c0) / 2;
      ok(fps >= 8, `degradada sola: sigue dibujando (${fps.toFixed(1)} cuadros/s)`);
      // Recuperación: al volver a un equipo rápido, a los ~30 s prueba el nivel anterior y se queda si cuesta poco.
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await dormir(40000);
      const j = await page.evaluate(() => document.querySelector("canvas.malla-fondo").mallaInfo);
      ok(j.nivel < i.nivel, `al bajar el costo se recupera sola (nivel ${i.nivel} -> ${j.nivel}, p50 ${j.costoP50.toFixed(1)} ms)`);
      await ctx.close();
    }
  }

  /* ---- 9. intensidad detrás del recorrido ---- */
  console.log("\n== intensidad detrás del recorrido");
  {
    const { ctx, page } = await abrir({ tema: "light" });
    const sitio = (id) => page.evaluate((id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return window.scrollY + r.top + r.height / 2 - innerHeight / 2;
    }, id);
    const base = await opacidadCanvas(page);
    ok(base > 0.99, `en el hero la malla está a plena intensidad (${base})`);
    await ruedaHasta(page, Math.round(await sitio("fase-chat")));
    await dormir(1500);
    const enFase = await opacidadCanvas(page);
    const atrib = await page.evaluate(() => document.documentElement.hasAttribute("data-malla-recorrido"));
    const nivel = await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue("--malla-recorrido")));
    ok(nivel === 1 && atrib && Math.abs(enFase - nivel) < 0.02, `con una fase del teléfono al centro queda a --malla-recorrido, plena (${enFase.toFixed(2)} de ${nivel})`);
    await ruedaHasta(page, Math.round(await sitio("como-funciona")));
    await dormir(1500);
    const despues = await opacidadCanvas(page);
    ok(despues > 0.99, `pasado el recorrido (Cómo funciona) vuelve a plena intensidad (${despues})`);
    await ctx.close();
  }

  /* ---- 10. sin JavaScript ---- */
  console.log("\n== sin JavaScript");
  {
    const { ctx, page } = await abrir({ tema: "light", js: false, etiqueta: "malla sin-js" });
    const r = await page.evaluate(() => ({
      canvas: !!document.querySelector("canvas.malla-fondo"),
      titular: document.getElementById("titular").getBoundingClientRect().height,
      desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    ok(!r.canvas && r.titular > 40 && !r.desborde, "sin JS: no hay canvas, el titular se ve y no hay desborde");
    await ctx.close();
  }

  /* ---- 11. costo por cuadro y tareas largas ---- */
  const resumenRend = {};
  for (const [nombre, opts, cpu, tope] of [
    ["escritorio 1440×900", { tema: "dark" }, 1, 4],
    ["móvil 390×844, CPU ×4 (gama media)", { tema: "dark", ancho: 390, alto: 844, movil: true }, 4, 10],
  ]) {
    console.log(`\n== rendimiento (${nombre})`);
    const { ctx, page } = await abrir(opts);
    if (cpu > 1) await (await ctx.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: cpu });
    await page.evaluate(() => { window.__malla.tiempos.length = 0; window.__malla.largas.length = 0; window.__malla.cuadros = 0; });
    // 1) solo la onda en reposo, 4 s
    await dormir(4000);
    const reposo = await page.evaluate(() => window.__malla.tiempos.slice());
    // 2) cursor moviéndose (solo escritorio)
    let mov = [];
    if (!opts.movil) {
      await page.evaluate(() => { window.__malla.tiempos.length = 0; });
      for (let v = 0; v < 6; v++) {
        await mover(page, 100 + v * 40, 150, 1300 - v * 60, 700, 40);
        await mover(page, 1300 - v * 60, 700, 200, 250 + v * 30, 40);
      }
      await dormir(300);
      mov = await page.evaluate(() => window.__malla.tiempos.slice());
    }
    const largas = await page.evaluate(() => window.__malla.largas.slice());
    const est = (arr) => {
      const t = arr.slice().sort((x, y) => x - y);
      return { n: t.length, med: t[Math.floor(t.length / 2)] ?? NaN, p95: t[Math.floor(t.length * 0.95)] ?? NaN, max: t.at(-1) ?? NaN };
    };
    const r = est(reposo), m = est(mov);
    console.log(`   reposo: ${r.n} cuadros, mediana ${r.med.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms, máx ${r.max.toFixed(2)} ms`);
    if (mov.length) console.log(`   cursor: ${m.n} cuadros, mediana ${m.med.toFixed(2)} ms, p95 ${m.p95.toFixed(2)} ms, máx ${m.max.toFixed(2)} ms`);
    console.log(`   tareas largas: ${largas.length}`);
    resumenRend[nombre] = { reposo: r, cursor: m, tareasLargas: largas };
    ok(r.n > 15, `hubo cuadros de reposo que medir (${r.n})`);
    ok(r.p95 < tope, `p95 por cuadro en reposo < ${tope} ms (${r.p95.toFixed(2)} ms)`);
    if (mov.length) ok(m.p95 < tope, `p95 por cuadro con el cursor < ${tope} ms (${m.p95.toFixed(2)} ms)`);
    ok(largas.length === 0, "sin tareas largas (> 50 ms)");
    await ctx.close();
  }
  fs.writeFileSync(path.join(salida, "rendimiento.json"), JSON.stringify(resumenRend, null, 2));

  }

  /* ---- 12. contraste AA del texto de toda la portada sobre la malla, medido en PÍXELES RENDERIZADOS ----
     Se oculta el texto (CSSOM, la CSP lo permite) para ver el fondo real bajo cada bloque; se lleva el cursor real
     alrededor de cada bloque (la malla queda encendida a distintas intensidades, también intermedias: el color va a
     medio camino y la opacidad es alta, el peor caso) y se toma el PEOR píxel de fondo dentro de las cajas de línea del
     bloque. Mínimo WCAG AA: 4.5 en texto normal y 3 en texto grande (>= 24 px, o >= 18.66 px en negrita). Sin
     excepciones: ni el pico encendido ni el tema oscuro. Cada sección se mide con la malla a plena intensidad (el
     atenuado solo la baja). */
  console.log("\n== contraste del texto sobre la malla (píxeles reales, peor caso con el cursor barriendo)");
  {
    const SECCIONES = [
      ["hero", "hero", [
        ["lema", ".hero-significado"], ["titular", "#titular"], ["subtítulo", ".subtitulo-hero"],
        ["botón beta", ".cta-item:nth-child(1) .button"], ["chip beta", ".cta-item:nth-child(1) .chip"],
        ["botón App Store", ".cta-item:nth-child(2) .button"], ["chip App Store", ".cta-item:nth-child(2) .chip"],
        ["nota del CTA", ".cta-nota"], ["enlace de la nota", ".cta-nota a"], ["«Desliza para descubrir»", ".pista-scroll"],
      ]],
      ["fase Chat", "fase-chat", [["etiqueta", "#fase-chat .fase-kicker"], ["título", "#fase-chat .fase-titulo"], ["párrafo 1", "#fase-chat .fase-texto"], ["párrafo 4", "#fase-chat .fase-texto:nth-of-type(4)"]]],
      ["fase Hábitos", "fase-habitos", [["etiqueta", "#fase-habitos .fase-kicker"], ["título", "#fase-habitos .fase-titulo"], ["párrafo", "#fase-habitos .fase-texto"]]],
      ["Tu día", "cta", [["etiqueta", "#cta .fase-kicker"], ["título", "#cta .fase-titulo"], ["párrafo", "#cta .fase-texto"]]],
      // Con el vidrio la sección es más alta que la pantalla: los pasos se miden centrados en su propia lista.
      ["Tu día (pasos)", "cta", [["enlace del paso 1", "#cta .pasos-beta li:nth-child(1) a"], ["paso 1", "#cta .pasos-beta li:nth-child(1) span:last-child"], ["paso 2", "#cta .pasos-beta li:nth-child(2) span:last-child"]], "#cta .pasos-beta"],
      ["Cómo funciona", "como-funciona", [["título", "#como-funciona .fase-titulo"], ["intro", "#como-funciona .bloque-intro"], ["paso 1", "#como-funciona li:nth-child(1) h3"], ["texto 1", "#como-funciona li:nth-child(1) p"], ["enlace del texto 1", "#como-funciona li:nth-child(1) p a"], ["enlace del texto 2", "#como-funciona li:nth-child(2) p a"], ["texto 3", "#como-funciona li:nth-child(3) p"]]],
      ["Lo que viene", "lo-que-viene", [["título", "#lo-que-viene .fase-titulo"], ["intro", "#lo-que-viene .bloque-intro"], ["tarjeta", "#lo-que-viene .tarjeta-viene h3"]]],
      ["Preguntas", "preguntas", [["título", "#preguntas .fase-titulo"], ["intro", "#preguntas .bloque-intro"], ["enlace de la intro", "#preguntas .bloque-intro a"], ["pregunta", "#preguntas summary"]]],
      ["Quién está detrás", "quien-esta-detras", [["título", "#quien-esta-detras .fase-titulo"], ["texto", "#quien-esta-detras .bloque-intro"], ["enlace", "#quien-esta-detras .bloque-intro a"]]],
      ["Pie", "privacidad", [["etiqueta", "#privacidad .fase-kicker"], ["título", "#privacidad .fase-titulo"], ["texto", "#privacidad .fase-texto"]]],
    ];
    const analizador = await navegador.newPage();
    for (const tema of ["light", "dark"]) {
      const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: tema, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      guardia.instalar(page, `malla contraste ${tema}`);
      await page.addInitScript(scriptInicial({ tema }));
      await page.goto(srv.url + "/" + (a.query && a.query !== true ? String(a.query) : ""), { waitUntil: "load" });
      await esperarCarga(page, { portada: true });
      await page.waitForSelector("canvas.malla-fondo", { state: "attached", timeout: 6000 }).catch(() => {});
      await dormir(600);
      for (const [nombreSeccion, id, bloquesDef, ancla] of SECCIONES) {
        await ruedaHasta(page, Math.round(await page.evaluate(([id, ancla]) => {
          const r = (ancla ? document.querySelector(ancla) : document.getElementById(id)).getBoundingClientRect();
          const alto = Math.min(r.height, innerHeight);
          return id === "hero" ? 0 : Math.max(0, window.scrollY + r.top - (innerHeight - alto) / 2);
        }, [id, ancla])));
        await dormir(1600);
        for (let i = 0; i < 20; i++) {
          const ocultos = await page.evaluate((B) => B.some(([, s]) => {
            const el = document.querySelector(s);
            if (!el) return false;
            let op = 1;
            for (let p = el; p; p = p.parentElement) op *= Number(getComputedStyle(p).opacity);
            return op < 0.99;
          }), bloquesDef);
          if (!ocultos) break;
          await dormir(250);
        }
        const bloques = await page.evaluate((B) => {
          const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
          return B.map(([n, s]) => {
            const el = document.querySelector(s);
            if (!el) return { n, falta: true };
            let op = 1;
            for (let p = el; p; p = p.parentElement) op *= Number(getComputedStyle(p).opacity);
            const cs = getComputedStyle(el);
            const rg = document.createRange();
            rg.selectNodeContents(el);
            const rects = [...rg.getClientRects()].filter((r) => r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight).map((r) => [r.left, r.top, r.width, r.height]);
            const px = parseFloat(cs.fontSize), w = Number(cs.fontWeight);
            return { n, color: rgb(cs.color), rects, op, grande: px >= 24 || (px >= 18.66 && w >= 700) };
          });
        }, bloquesDef);
        await page.evaluate(() => {
          const h = document.styleSheets[document.styleSheets.length - 1];
          window.__oculta = [h, h.insertRule("main *, .pie *, .site-header * { color: transparent !important; text-shadow: none !important; }", h.cssRules.length)];
          h.insertRule("main svg, .pie svg { stroke: transparent !important; }", h.cssRules.length);
        });
        const peor = {};
        const posiciones = [];
        for (const bl of bloques) {
          if (bl.falta || !bl.rects.length) continue;
          const [l, t, w, h] = bl.rects[Math.floor(bl.rects.length / 2)];
          const cy = t + h / 2;
          for (const d of [0, 70, 150]) for (const [sx, sy] of [[0, 0], [1, 0], [-1, 0], [0, 1]]) {
            if (d === 0 && (sx || sy)) continue;
            for (const fx of [0.25, 0.75]) posiciones.push([Math.round(l + w * fx + sx * d), Math.round(cy + sy * d)]);
          }
        }
        const vistas = new Set();
        for (const [x, y] of posiciones) {
          const clave = `${Math.round(x / 40)},${Math.round(y / 40)}`;
          if (vistas.has(clave) || x < 0 || y < 0 || x > 1440 || y > 900) continue;
          vistas.add(clave);
          await page.mouse.move(x, y, { steps: 2 });
          await dormir(150);
          const png = (await page.screenshot({ type: "png" })).toString("base64");
          const r = await analizador.evaluate(async ({ png, bloques }) => {
            const img = new Image();
            img.src = "data:image/png;base64," + png;
            await img.decode();
            const cv = document.createElement("canvas");
            cv.width = img.width;
            cv.height = img.height;
            const g = cv.getContext("2d");
            g.drawImage(img, 0, 0);
            const lum = ([r, gg, b]) => {
              const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
              return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b);
            };
            const out = {};
            for (const bl of bloques) {
              if (bl.falta || !bl.rects.length) continue;
              const lt = lum(bl.color);
              let min = 99;
              for (const [l, t, w, h] of bl.rects) {
                const x0 = Math.max(0, Math.floor(l * 2)), y0 = Math.max(0, Math.floor(t * 2));
                const d = g.getImageData(x0, y0, Math.min(img.width - x0, Math.ceil(w * 2)), Math.min(img.height - y0, Math.ceil(h * 2))).data;
                for (let i = 0; i < d.length; i += 4) {
                  const lb = lum([d[i], d[i + 1], d[i + 2]]);
                  min = Math.min(min, (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05));
                }
              }
              out[bl.n] = min;
            }
            return out;
          }, { png, bloques });
          for (const [k, v] of Object.entries(r)) if (!(k in peor) || v < peor[k].cr) peor[k] = { cr: v, en: [x, y] };
        }
        console.log(`   ${tema} · ${nombreSeccion}: ${vistas.size} posiciones del cursor`);
        for (const bl of bloques) {
          if (bl.falta || !bl.rects.length) {
            ok(["chip beta", "chip App Store", "enlace de la nota"].includes(bl.n) || bl.n === "párrafo 4", `${tema} ${nombreSeccion} ${bl.n}: no está o no se ve (solo se admite en los chips y el enlace de la nota del hero, o el párrafo 4 de Chat)`);
            continue;
          }
          const minimo = bl.grande ? 3 : 4.5;
          const p = peor[bl.n];
          const legible = bl.op > 0.99;
          ok(legible, `${tema} ${nombreSeccion} ${bl.n}: el texto se midió a opacidad plena (${bl.op.toFixed(2)})`);
          ok(p.cr >= minimo, `${tema} ${nombreSeccion} ${bl.n}: peor píxel ${p.cr.toFixed(2)}:1 >= ${minimo}${bl.grande ? " (texto grande)" : ""} (cursor en ${p.en})`);
        }
        // El texto vuelve a verse para la siguiente sección.
        await page.evaluate(() => {
          const [h, i] = window.__oculta;
          h.deleteRule(i + 1);
          h.deleteRule(i);
        });
      }
      await ctx.close();
    }
    await analizador.close();
  }

  /* ---- 10. consola ---- */
  ok(guardia.fallas.length === 0, `consola limpia (${guardia.fallas.length} fallas)`);
  for (const f of guardia.fallas) console.error("   ", f.tipo, f.detalle, `[${f.contexto}]`);
} catch (e) {
  problemas.push("excepción: " + (e?.stack ?? e));
  console.error(e);
} finally {
  await navegador.close();
  await srv.cerrar();
}
salir(problemas.length ? 1 : 0, problemas.length ? `\n${problemas.length} verificación(es) fallaron` : "\nmalla: todo en verde");
