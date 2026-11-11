import { dormir } from "./comun.mjs";

/**
 * Baja o sube con RUEDA REAL (mouse.wheel), en pasos, hasta `objetivo` (px de scrollY).
 * No usa window.scrollTo: así se ejercita el mismo camino que una persona con ratón.
 * Devuelve la posición final.
 */
export async function ruedaHasta(page, objetivo, { paso = 60, pausaMs = 35 } = {}) {
  let y = await page.evaluate(() => window.scrollY);
  let sinMover = 0;
  for (let i = 0; i < 4000; i++) {
    const falta = objetivo - y;
    if (Math.abs(falta) <= 1) break;
    await page.mouse.wheel(0, Math.sign(falta) * Math.min(Math.abs(falta), paso));
    await dormir(pausaMs);
    const nuevo = await page.evaluate(() => window.scrollY);
    sinMover = Math.abs(nuevo - y) < 0.5 ? sinMover + 1 : 0;
    y = nuevo;
    if (sinMover > 12) break; // tope del documento
  }
  return y;
}

/** Espera a que el scroll y la escena dejen de cambiar (la coreografía se suaviza). */
export async function reposo(page, leerEstado, { ms = 450, max = 6000 } = {}) {
  const t0 = Date.now();
  let previo = JSON.stringify(await page.evaluate(leerEstado).then((e) => [e.y, e.escena, e.angulo?.toFixed(1)]));
  let desde = Date.now();
  while (Date.now() - t0 < max) {
    await dormir(120);
    const e = await page.evaluate(leerEstado);
    const ahora = JSON.stringify([e.y, e.escena, e.angulo?.toFixed(1)]);
    if (ahora !== previo) {
      previo = ahora;
      desde = Date.now();
    } else if (Date.now() - desde >= ms) return e;
  }
  return page.evaluate(leerEstado);
}
