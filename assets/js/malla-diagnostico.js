/*
  Yaruki — modo de diagnóstico de la malla (#98). Solo existe con `?malla-diagnostico=1` en la URL: main.js importa
  este módulo únicamente en ese caso, así que para quien no pone el parámetro no se descarga ni corre nada.

  Sirve para medir la malla (y la página) en un teléfono real. Cada número dice qué mide:
    - «Pantalla»: cuadros por segundo que PINTA el navegador, medidos con requestAnimationFrame de la página, junto al
      máximo que se vio (la tasa real del teléfono: 60 o 120 Hz; si dice 30, el sistema —p. ej. el ahorro de batería—
      la está limitando). Se separa en «En reposo» (últimos 5 s de 1 s sin scroll) y «Durante el scroll» (último gesto);
    - «Malla»: dibujos por segundo del bucle de la malla (a propósito limitado a 30, o menos si se degradó), que NO
      es lo mismo que los fps de la pantalla;
    - «Costo por dibujo»: lo que tarda el JS de la malla en dibujar un cuadro (p50 / p95), medido por malla.js;
    - cuadros largos (> 50 ms entre dos cuadros) y tareas largas (Long Tasks API).
  Un botón copia todo como texto plano; otro pliega el panel. Enlaces para cambiar de variante o apagar la malla
  (`?malla=apagada`: la página sola, para saber si el ~30 es de la malla o de la página). Sin estilos inline
  (base.css, `.malla-diagnostico`) ni terceros, y no guarda ni envía nada.
*/
const VARIANTES = ["normal", "ligera", "pausa-scroll", "ligera-pausa"];
const VENTANA = 5; // segundos de reposo que se promedian
const FIN_SCROLL = 200; // ms sin eventos de scroll para dar el gesto por terminado
const MIN_GESTO = 250; // ms: gestos más cortos no sirven para promediar

const f0 = (n) => (Number.isFinite(n) ? n.toFixed(0) : "–");
const f1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : "–");
const media = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const percentil = (a, q) => {
  if (!a.length) return NaN;
  const o = a.slice().sort((x, y) => x - y);
  return o[Math.min(o.length - 1, Math.floor(o.length * q))];
};

function aceleracion() {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return "sin WebGL (probablemente sin aceleración)";
    const e = gl.getExtension("WEBGL_debug_renderer_info");
    const r = e ? String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)) : "WebGL disponible (renderer oculto)";
    const soft = /swiftshader|llvmpipe|software|basic render/i.test(r);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return `${soft ? "SIN aceleración (software)" : "con aceleración"}: ${r}`;
  } catch {
    return "n/d";
  }
}

function navegadorResumido() {
  const ua = navigator.userAgent;
  const chrome = /(Chrome|CriOS|Firefox|Version)\/(\d+)/.exec(ua);
  const so = /Android [\d.]+|iPhone OS [\d_]+|Linux|Windows NT [\d.]+|Mac OS X [\d_]+/.exec(ua);
  const modelo = /;\s*([^;)]+)\s+Build/.exec(ua);
  return [chrome ? `${chrome[1]} ${chrome[2]}` : "navegador n/d", so ? so[0] : "", modelo ? modelo[1] : ""].filter(Boolean).join(" · ");
}

export function iniciarDiagnostico() {
  const params = new URLSearchParams(location.search);
  const apagada = params.get("malla") === "apagada";
  const actual = apagada ? "apagada" : params.get("malla-movil") || "por defecto";
  const mq = (q) => window.matchMedia(q).matches;

  const caja = document.createElement("aside");
  caja.className = "malla-diagnostico";
  caja.setAttribute("aria-label", "Diagnóstico de la malla");
  const barra = document.createElement("div");
  barra.className = "malla-diagnostico-barra";
  const resumen = document.createElement("span");
  resumen.setAttribute("role", "status");
  const plegar = document.createElement("button");
  plegar.type = "button";
  plegar.setAttribute("aria-expanded", "true");
  plegar.textContent = "Plegar";
  barra.append(resumen, plegar);
  const cuerpo = document.createElement("div");
  cuerpo.className = "malla-diagnostico-cuerpo";
  const datos = document.createElement("pre");
  const acciones = document.createElement("p");
  const copiar = document.createElement("button");
  copiar.type = "button";
  copiar.textContent = "Copiar resultados";
  const estadoCopia = document.createElement("span");
  estadoCopia.setAttribute("role", "status");
  acciones.append(copiar, " ", estadoCopia);
  const enlaces = document.createElement("p");
  enlaces.className = "malla-diagnostico-enlaces";
  const opciones = [
    ["apagada", { malla: "apagada" }],
    ...VARIANTES.map((v) => [v, { "malla-movil": v }]),
  ];
  for (const [nombre, extra] of opciones) {
    const p = new URLSearchParams();
    p.set("malla-diagnostico", "1");
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    const a = document.createElement("a");
    a.href = `${location.pathname}?${p}`;
    a.textContent = nombre;
    if (nombre === actual) a.setAttribute("aria-current", "true");
    enlaces.append(a, " ");
  }
  cuerpo.append(datos, acciones, enlaces);
  caja.append(barra, cuerpo);
  document.body.append(caja);
  plegar.addEventListener("click", () => {
    const abierto = cuerpo.hidden;
    cuerpo.hidden = !abierto;
    plegar.setAttribute("aria-expanded", String(abierto));
    plegar.textContent = abierto ? "Plegar" : "Desplegar";
  });

  let largas = 0;
  let largasScroll = 0;
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        largas++;
        if (enScroll) largasScroll++;
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {
    largas = -1;
  }

  // --- Cuadros de la pantalla (rAF), en reposo y durante el scroll ---
  const reposoSeg = []; // fps de cada segundo completo sin scroll
  const intervalos = []; // todos los intervalos de rAF (ms), para estimar la tasa máxima de la pantalla
  const mallaPorSegundo = [];
  let cuadrosSeg = 0;
  let scrollEnSeg = false;
  let cuadrosLargos = 0;
  let previo = 0;
  let inicioSeg = performance.now();
  let mallaAntes = 0;
  let enScroll = false;
  let ultimoScroll = 0;
  let gesto = null; // { t0, cuadros, minVentana..., peor }
  let ultimoGesto = null;
  const lienzo = () => document.querySelector("canvas.malla-fondo");

  function alScroll() {
    ultimoScroll = performance.now();
    scrollEnSeg = true;
    if (!enScroll) {
      enScroll = true;
      gesto = { t0: ultimoScroll, cuadros: 0, ventanaT0: ultimoScroll, ventanaN: 0, ventanas: [], peor: 0, largas0: largas };
    }
  }
  window.addEventListener("scroll", alScroll, { passive: true });
  window.addEventListener("touchmove", alScroll, { passive: true });

  function cerrarGesto(tFin) {
    const dur = tFin - gesto.t0;
    if (dur >= MIN_GESTO) {
      ultimoGesto = {
        dur,
        avg: (gesto.cuadros * 1000) / dur,
        min: gesto.ventanas.length ? Math.min(...gesto.ventanas) : (gesto.cuadros * 1000) / dur,
        peor: gesto.peor,
        largas: largasScroll,
      };
    }
    gesto = null;
    enScroll = false;
  }

  function lineas() {
    const info = lienzo()?.mallaInfo;
    const rep = reposoSeg.slice(-VENTANA);
    const hz = 1000 / percentil(intervalos, 0.1);
    const ahorro = hz < 40 ? "  <- la pantalla parece limitada a ~30 Hz (ahorro de batería o modo de rendimiento del sistema)" : "";
    const g = ultimoGesto;
    const L = [];
    L.push(`Malla: ${apagada ? "APAGADA (?malla=apagada: la página sola)" : info ? `${info.variante}${info.pausadaPorScroll ? " (pausada: scroll)" : ""}` : "sin canvas todavía"}`);
    if (info) L.push(`Canvas: ${info.ancho}×${info.alto} @ DPR ${info.dpr.toFixed(2)} (pantalla ${(window.devicePixelRatio || 1).toFixed(2)})`);
    L.push(`Pantalla: máx. visto ${f0(hz)} Hz (ritmo del teléfono)${ahorro}`);
    L.push(`En reposo (últimos ${VENTANA} s sin tocar): ${f0(media(rep))} fps · mín ${f0(rep.length ? Math.min(...rep) : NaN)}`);
    L.push(
      g
        ? `Durante el scroll (último gesto, ${f1(g.dur / 1000)} s): ${f0(g.avg)} fps · mín ${f0(g.min)} · peor cuadro ${f0(g.peor)} ms · tareas largas ${g.largas}`
        : "Durante el scroll (último gesto): haz scroll con el dedo para medirlo",
    );
    if (info) {
      const mp = mallaPorSegundo.slice(-VENTANA);
      L.push(`Malla: ${f0(media(mp))} dibujos/s (tope: ${info.fpsTope}${info.variante === "escritorio" ? "" : " en táctil"}; es el ritmo de la malla, no de la pantalla)`);
      L.push(`Costo de la malla por dibujo: p50 ${f1(info.costoP50)} / p95 ${f1(info.costoP95)} ms (CPU del JS; lo que haga la GPU después no entra)`);
      L.push(`Degradación: ${info.nivel ? `nivel ${info.nivel} (${info.motivo})` : "ninguna"}`);
    } else {
      L.push("Malla: sin bucle (no se dibuja nada)");
    }
    L.push(`Cuadros largos (> 50 ms): ${cuadrosLargos} · Tareas largas: ${largas < 0 ? "n/d" : largas}`);
    return L;
  }

  function contexto() {
    return [
      `Variante: ${actual}${params.get("malla-forzar") ? ` · forzar=${params.get("malla-forzar")}` : ""}`,
      `Navegador: ${navegadorResumido()}`,
      `Pantalla: ${screen.width}×${screen.height} · DPR ${(window.devicePixelRatio || 1).toFixed(2)} · ventana ${innerWidth}×${innerHeight}`,
      `Gráficos: ${aceleracion()}`,
      `Ahorro de movimiento: ${mq("(prefers-reduced-motion: reduce)") ? "SÍ (la malla está estática)" : "no"} · transparencia reducida: ${mq("(prefers-reduced-transparency: reduce)") ? "sí" : "no"} · pestaña: ${document.visibilityState}`,
      "Nota: el ahorro de batería de Android limita la pantalla a ~30–60 fps y la página no puede detectarlo; si «máx. visto» sale en ~30, desactívalo y repite.",
    ];
  }

  function pintar() {
    datos.textContent = lineas().join("\n");
    const rep = reposoSeg.slice(-VENTANA);
    resumen.textContent = `Pantalla ${f0(media(rep))} fps · malla ${f0(media(mallaPorSegundo.slice(-VENTANA)))}/s`;
  }

  async function alCopiar() {
    const texto = [`Diagnóstico de la malla — ${location.href}`, ...lineas(), "", ...contexto()].join("\n");
    let ok = false;
    try {
      await navigator.clipboard.writeText(texto);
      ok = true;
    } catch {
      const t = document.createElement("textarea");
      t.value = texto;
      t.setAttribute("readonly", "");
      t.className = "malla-diagnostico-copia";
      document.body.append(t);
      t.select();
      try {
        ok = document.execCommand("copy");
      } catch {}
      t.remove();
    }
    estadoCopia.textContent = ok ? "Copiado" : "No se pudo copiar; selecciona el texto a mano";
    if (!ok) datos.textContent = `${datos.textContent}\n\n${contexto().join("\n")}`;
    setTimeout(() => (estadoCopia.textContent = ""), 3000);
  }
  copiar.addEventListener("click", alCopiar);

  function cuadro(t) {
    if (previo) {
      const dt = t - previo;
      intervalos.push(dt);
      if (intervalos.length > 600) intervalos.shift();
      if (dt > 50) cuadrosLargos++;
      if (gesto) {
        gesto.cuadros++;
        gesto.ventanaN++;
        if (dt > gesto.peor) gesto.peor = dt;
        if (t - gesto.ventanaT0 >= 250) {
          gesto.ventanas.push((gesto.ventanaN * 1000) / (t - gesto.ventanaT0));
          gesto.ventanaT0 = t;
          gesto.ventanaN = 0;
        }
      }
    }
    previo = t;
    if (enScroll && t - ultimoScroll > FIN_SCROLL) cerrarGesto(ultimoScroll);
    cuadrosSeg++;
    if (t - inicioSeg >= 1000) {
      if (!scrollEnSeg && !enScroll) reposoSeg.push((cuadrosSeg * 1000) / (t - inicioSeg));
      if (reposoSeg.length > 60) reposoSeg.shift();
      const m = lienzo()?.mallaInfo?.cuadros ?? 0;
      mallaPorSegundo.push(m - mallaAntes);
      mallaAntes = m;
      if (mallaPorSegundo.length > 60) mallaPorSegundo.shift();
      cuadrosSeg = 0;
      scrollEnSeg = false;
      inicioSeg = t;
      pintar();
    }
    requestAnimationFrame(cuadro);
  }
  pintar();
  requestAnimationFrame(cuadro);
}
