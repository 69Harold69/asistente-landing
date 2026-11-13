/*
  Yaruki — modo de diagnóstico de la malla (#98). Solo existe con `?malla-diagnostico=1` en la URL: main.js importa
  este módulo únicamente en ese caso, así que para quien no pone el parámetro no se descarga ni corre nada.

  Sirve para que Harold mida la malla en su teléfono real antes de publicar (instrucciones en el LEEME del punto de
  control 1 y en el README). Muestra, en una caja fija abajo a la izquierda:
    - la variante activa de la malla (`?malla-movil=normal|ligera|pausa-scroll|ligera-pausa`; en escritorio, «escritorio»), el DPR
      del canvas y su tamaño;
    - fps de la PÁGINA (cuadros que pinta el navegador, medidos con requestAnimationFrame): promedio y mínimo por
      segundo de los últimos 5 s;
    - cuadros largos (> 50 ms entre dos cuadros) y tareas largas (Long Tasks API, si existe) desde que cargó;
    - cuadros que dibujó la malla por segundo;
  y enlaces para cambiar de variante (recargan la página con el parámetro). Sin estilos inline (base.css,
  `.malla-diagnostico`) ni terceros.
*/
const VARIANTES = ["normal", "ligera", "pausa-scroll", "ligera-pausa"];
const VENTANA = 5; // segundos

export function iniciarDiagnostico() {
  const caja = document.createElement("aside");
  caja.className = "malla-diagnostico";
  caja.setAttribute("aria-label", "Diagnóstico de la malla");
  const datos = document.createElement("pre");
  const enlaces = document.createElement("p");
  const params = new URLSearchParams(location.search);
  const actual = params.get("malla-movil") || "por defecto";
  for (const v of VARIANTES) {
    const p = new URLSearchParams(params);
    p.set("malla-diagnostico", "1");
    p.set("malla-movil", v);
    const a = document.createElement("a");
    a.href = `${location.pathname}?${p}`;
    a.textContent = v;
    if (v === actual) a.setAttribute("aria-current", "true");
    enlaces.append(a, " ");
  }
  caja.append(datos, enlaces);
  document.body.append(caja);

  let largas = 0;
  try {
    new PerformanceObserver((l) => (largas += l.getEntries().length)).observe({ type: "longtask", buffered: true });
  } catch {
    largas = -1;
  }

  const porSegundo = []; // cuadros de página por segundo
  const mallaPorSegundo = [];
  let cuadros = 0;
  let cuadrosLargos = 0;
  let previo = 0;
  let inicioSeg = performance.now();
  let mallaAntes = 0;
  const lienzo = () => document.querySelector("canvas.malla-fondo");

  function pintar() {
    const info = lienzo()?.mallaInfo;
    const ult = porSegundo.slice(-VENTANA);
    const prom = ult.length ? ult.reduce((a, b) => a + b, 0) / ult.length : 0;
    const min = ult.length ? Math.min(...ult) : 0;
    const malla = mallaPorSegundo.slice(-VENTANA);
    const mallaProm = malla.length ? malla.reduce((a, b) => a + b, 0) / malla.length : 0;
    datos.textContent = [
      `malla: ${info ? info.variante : "sin canvas"}${info?.pausadaPorScroll ? " (pausada: scroll)" : ""}`,
      info ? `canvas: ${info.ancho}×${info.alto} @ DPR ${info.dpr.toFixed(2)} (pantalla ${(window.devicePixelRatio || 1).toFixed(2)})` : "",
      `fps página (${VENTANA} s): prom ${prom.toFixed(0)} · mín ${min}`,
      `malla dibuja: ${mallaProm.toFixed(0)} cuadros/s`,
      `cuadros > 50 ms: ${cuadrosLargos} · tareas largas: ${largas < 0 ? "n/d" : largas}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  function cuadro(t) {
    if (previo && t - previo > 50) cuadrosLargos++;
    previo = t;
    cuadros++;
    if (t - inicioSeg >= 1000) {
      porSegundo.push(cuadros);
      const m = lienzo()?.mallaInfo?.cuadros ?? 0;
      mallaPorSegundo.push(m - mallaAntes);
      mallaAntes = m;
      if (porSegundo.length > 60) porSegundo.shift();
      if (mallaPorSegundo.length > 60) mallaPorSegundo.shift();
      cuadros = 0;
      inicioSeg = t;
      pintar();
    }
    requestAnimationFrame(cuadro);
  }
  pintar();
  requestAnimationFrame(cuadro);
}
