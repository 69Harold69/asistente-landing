/*
  PROTOTIPO #102 (se borra al elegir dirección): activa una de las direcciones de la «parte final» con `?final=a|b|c`.
  Pone `data-final` en <html> y carga la hoja de esa dirección. Sin parámetro (o con otro valor) no hace nada:
  la página queda como hoy. Script clásico y síncrono en <head> para que no haya parpadeo; sin inline (CSP).
*/
(function () {
  try {
    var v = new URLSearchParams(location.search).get("final");
    if (v !== "a" && v !== "b" && v !== "c") return;
    document.documentElement.setAttribute("data-final", v);
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "assets/css/final-" + v + ".css";
    document.head.appendChild(l);
  } catch (e) {
    /* sin parámetros legibles: la página queda como hoy */
  }
})();
