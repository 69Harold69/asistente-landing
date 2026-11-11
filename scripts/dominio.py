#!/usr/bin/env python3
"""El dominio del sitio, en un solo lugar: scripts/sitio.json.

El sitio no tiene build (se publica el repo tal cual), así que las URLs absolutas
(canonical, og:url, og:image, twitter:image, JSON-LD, sitemap.xml, robots.txt) viven
escritas en los archivos. Este script las reescribe todas a partir de la constante única
`origen` de scripts/sitio.json, de forma idempotente.

Uso:
  python3 scripts/dominio.py                       reescribe todo al origen de sitio.json
  python3 scripts/dominio.py --check               no escribe; sale con 1 si algo no coincide
  python3 scripts/dominio.py --origen https://x.y  fija el origen en sitio.json y reescribe
  python3 scripts/dominio.py --raiz DIR            trabaja sobre otra copia del sitio (pruebas)

Qué reescribe (y nada más; el texto visible y los enlaces relativos no se tocan):
  - <link rel="canonical|alternate" href>, y <meta> og:url, og:image(:url|:secure_url), twitter:url, twitter:image.
  - Cualquier atributo href/src/content de cualquier etiqueta HTML cuyo valor sea una URL de un
    dominio propio (p. ej. un <a href="https://<propio>/privacidad/"> absoluto).
  - Cadenas URL dentro de <script type="application/ld+json"> cuyo host sea uno de los dominios
    propios detectados en canonical/og/sitemap/robots. Una URL de otro host en las claves @id, url,
    image, logo, item o mainEntityOfPage (salvo EXTERNOS) NO se reescribe (podría ser un sitio
    externo legítimo, p. ej. la web personal del autor): se reporta para revisarla a mano.
  - <loc> y xhtml:link de sitemap.xml; líneas Sitemap:/Host: de robots.txt.
Además, tras reescribir, busca «fugas»: cualquier https?://<dominio propio viejo> que quede en un
archivo de texto del sitio (HTML fuera de esos atributos, JS, CSS, JSON, manifest, XML, TXT, SVG).
No las reescribe (pueden ser texto visible): las reporta y sale con 1, igual que --check.
Páginas nuevas (carpetas con index.html) se descubren solas. No toca scripts/, README.md,
/.well-known/, google*.html, correos (mailto:) ni el identificador de Play.
Solo biblioteca estándar.
"""
import json
import pathlib
import re
import sys

RAIZ_DEFECTO = pathlib.Path(__file__).resolve().parent.parent
SITIO = pathlib.Path("scripts") / "sitio.json"
# Hosts que pueden aparecer a propósito en claves "propias" del JSON-LD (perfil del autor, ficha de Play...).
EXTERNOS = {"schema.org", "github.com", "play.google.com", "groups.google.com", "www.linkedin.com", "linkedin.com"}
CLAVES_PROPIAS = {"@id", "url", "image", "logo", "item", "mainEntityOfPage"}
EXCLUIDOS = {".git", "node_modules", "scripts", ".worktrees", ".well-known"}
EXT_TEXTO = {".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".xml", ".txt", ".svg"}
NO_REVISAR = {"README.md"}

RE_ORIGEN_VALIDO = re.compile(r"^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d+)?$")
RE_URL = re.compile(r"^(https?://[^/?#\"'\s<>]+)(.*)$", re.S)
RE_META = re.compile(r"<meta\b[^>]*>", re.S)
RE_LINK = re.compile(r"<link\b[^>]*>", re.S)
RE_ATTR = lambda n: re.compile(rf'(\b{n}\s*=\s*")([^"]*)(")', re.I)  # noqa: E731
RE_LD = re.compile(r'(<script\b[^>]*type="application/ld\+json"[^>]*>)(.*?)(</script>)', re.S | re.I)
RE_CADENA_URL = re.compile(r'("(?P<k>[^"\\]+)"\s*:\s*)?"(?P<u>https?://[^"\\]+)"')
META_PROPIOS = {"og:url", "og:image", "og:image:url", "og:image:secure_url", "twitter:url", "twitter:image"}
HOST_DE = lambda u: RE_URL.match(u).group(1).split("//", 1)[1].split(":")[0] if RE_URL.match(u) else None  # noqa: E731


def leer_origen(raiz):
    return json.loads((raiz / SITIO).read_text(encoding="utf-8"))["origen"]


def escribir_origen(raiz, origen):
    (raiz / SITIO).write_text(json.dumps({"origen": origen}, indent=2) + "\n", encoding="utf-8")


def con_origen(url, origen):
    m = RE_URL.match(url)
    return url if (not m or m.group(1) == origen) else origen + m.group(2)


def hosts_propios(textos, origen):
    """Hosts que el sitio ya usa como suyos: canonical/og:url/og:image/twitter:image, sitemap y robots."""
    hosts = {HOST_DE(origen)}
    for nombre, t in textos.items():
        if nombre.endswith(".html"):
            for etq in RE_META.findall(t) + RE_LINK.findall(t):
                if re.search(r'(rel="canonical"|(property|name)="(' + "|".join(map(re.escape, META_PROPIOS)) + '))"', etq):
                    m = re.search(r'(?:href|content)\s*=\s*"(https?://[^"]+)"', etq)
                    if m:
                        hosts.add(HOST_DE(m.group(1)))
        elif nombre == "sitemap.xml":
            hosts.update(HOST_DE(u) for u in re.findall(r"<loc>\s*(https?://[^<\s]+)", t))
        elif nombre == "robots.txt":
            hosts.update(HOST_DE(u) for u in re.findall(r"(?im)^(?:sitemap|host):\s*(https?://\S+)", t))
    hosts.discard(None)
    return hosts - EXTERNOS


def re_host(hosts):
    """https?://<host> exacto (sin aceptar <host>.mx ni sub.<host>)."""
    return re.compile(r"(?<![\w.-])https?://(?:" + "|".join(sorted(map(re.escape, hosts))) + r")(?::\d+)?(?![\w.-])", re.I) if hosts else None


def reescribir_html(t, origen, propios, sospechosas=None, nombre=""):
    def attr_url(etq, atributo):
        return RE_ATTR(atributo).sub(lambda m: m.group(1) + con_origen(m.group(2), origen) + m.group(3), etq, count=1)

    def meta(m):
        etq = m.group(0)
        clave = re.search(r'\b(?:property|name)\s*=\s*"([^"]*)"', etq)
        return attr_url(etq, "content") if clave and clave.group(1) in META_PROPIOS else etq

    def link(m):
        etq = m.group(0)
        rel = re.search(r'\brel\s*=\s*"([^"]*)"', etq)
        return attr_url(etq, "href") if rel and rel.group(1).split()[:1] and rel.group(1).split()[0] in ("canonical", "alternate") else etq

    def cadena(m):
        u, k = m.group("u"), m.group("k")
        host = HOST_DE(u)
        if host in propios:
            return m.group(0).replace(u, con_origen(u, origen), 1)
        if k in CLAVES_PROPIAS and host not in EXTERNOS and sospechosas is not None:
            sospechosas.append(f"{nombre} JSON-LD «{k}»: {u}")
        return m.group(0)

    def ld(m):
        return m.group(1) + RE_CADENA_URL.sub(cadena, m.group(2)) + m.group(3)

    rh = re_host(propios)

    def atributo(m):
        return m.group(1) + con_origen(m.group(2), origen) + m.group(3) if rh.match(m.group(2)) else m.group(0)

    def fuera_de_ld(texto):
        partes = RE_LD.split(texto)  # [fuera, abre, dentro, cierra, fuera, ...]
        for i in range(0, len(partes), 4):
            partes[i] = re.sub(r'(\b(?:href|src|content)\s*=\s*")(https?://[^"]*)(")', atributo, partes[i], flags=re.I)
        return "".join(partes)

    t = RE_META.sub(meta, t)
    t = RE_LINK.sub(link, t)
    if rh:
        t = fuera_de_ld(t)
    return RE_LD.sub(ld, t)


def reescribir_sitemap(t, origen):
    t = re.sub(r"(<loc>\s*)(https?://[^<\s]+)(\s*</loc>)", lambda m: m.group(1) + con_origen(m.group(2), origen) + m.group(3), t)
    return re.sub(r'(<xhtml:link\b[^>]*\bhref=")(https?://[^"]+)(")', lambda m: m.group(1) + con_origen(m.group(2), origen) + m.group(3), t)


def reescribir_robots(t, origen):
    return re.sub(r"(?im)^((?:sitemap|host):\s*)(https?://\S+)", lambda m: m.group(1) + con_origen(m.group(2), origen), t)


def archivos(raiz):
    for p in sorted(raiz.rglob("*.html")):
        if not (set(p.relative_to(raiz).parts) & EXCLUIDOS):
            yield p
    for n in ("sitemap.xml", "robots.txt"):
        if (raiz / n).exists():
            yield raiz / n


def textos_del_sitio(raiz):
    for p in sorted(raiz.rglob("*")):
        rel = p.relative_to(raiz)
        if p.is_file() and p.suffix in EXT_TEXTO and not (set(rel.parts) & EXCLUIDOS) and str(rel) not in NO_REVISAR \
                and not re.fullmatch(r"google[0-9a-f]+\.html", p.name):
            yield str(rel), p


def calcular(raiz, origen, sospechosas=None):
    """Devuelve ({ruta_relativa: (texto_actual, texto_nuevo)} de los archivos que cambiarían, [fugas])."""
    textos = {str(p.relative_to(raiz)): p.read_bytes().decode("utf-8") for p in archivos(raiz)}
    propios = hosts_propios(textos, origen)
    cambios = {}
    for nombre, t in textos.items():
        if nombre.endswith(".html"):
            n = reescribir_html(t, origen, propios, sospechosas if sospechosas is not None else [], nombre)
        elif nombre == "sitemap.xml":
            n = reescribir_sitemap(t, origen)
        else:
            n = reescribir_robots(t, origen)
        if n != t:
            cambios[nombre] = (t, n)
    # Fugas: el dominio propio viejo en cualquier otro lugar del sitio (JS, CSS, manifest, texto...).
    viejos = propios - {HOST_DE(origen)}
    rh, fugas = re_host(viejos), []
    if rh:
        for nombre, p in textos_del_sitio(raiz):
            t = cambios[nombre][1] if nombre in cambios else p.read_bytes().decode("utf-8", "replace")
            for m in rh.finditer(t):
                fugas.append(f"{nombre}:{t.count(chr(10), 0, m.start()) + 1} {m.group(0)}")
    return cambios, fugas


def diferencias(viejo, nuevo):
    a, b = viejo.splitlines(), nuevo.splitlines()
    return [(i + 1, x.strip(), y.strip()) for i, (x, y) in enumerate(zip(a, b)) if x != y]


def main(argv):
    raiz, origen, solo_revisar = RAIZ_DEFECTO, None, False
    args = list(argv)
    while args:
        a = args.pop(0)
        if a == "--check":
            solo_revisar = True
        elif a in ("--raiz", "--origen") and args:
            v = args.pop(0)
            if a == "--raiz":
                raiz = pathlib.Path(v).resolve()
            else:
                origen = v
        elif a in ("-h", "--help"):
            print(__doc__)
            return 0
        else:
            print(f"Argumento desconocido: {a}\n{__doc__}", file=sys.stderr)
            return 2
    if origen is not None and not RE_ORIGEN_VALIDO.match(origen):
        print(f"Origen inválido «{origen}»: debe ser https://dominio en minúsculas, sin barra final ni ruta.", file=sys.stderr)
        return 2
    destino = origen if origen is not None else leer_origen(raiz)
    if not RE_ORIGEN_VALIDO.match(destino):
        print(f"{SITIO}: origen inválido «{destino}»", file=sys.stderr)
        return 2
    sospechosas = []
    cambios, fugas = calcular(raiz, destino, sospechosas)

    def reportar_manuales():
        for s in sospechosas:
            print(f"FALLA [dominio] URL de otro host en una clave propia: {s}: si es externa legítima, agrega su host a "
                  "EXTERNOS (scripts/dominio.py y validar.mjs); si es del sitio, corrígela a mano")
        for f in fugas:
            print(f"FALLA [dominio] fuga del dominio viejo (no se reescribe sola; corrígela a mano): {f}")
        return bool(sospechosas or fugas)

    if solo_revisar:
        for nombre, (v, n) in cambios.items():
            for linea, x, y in diferencias(v, n):
                print(f"FALLA [dominio] {nombre}:{linea} debe usar {destino}\n    hay:  {x}\n    debe: {y}")
        manuales = reportar_manuales()
        if cambios:
            print(f"\n{len(cambios)} archivo(s) no coinciden con {destino}. Corre: python3 scripts/dominio.py")
        if cambios or manuales:
            return 1
        print(f"OK: todas las URLs absolutas usan {destino}.")
        return 0
    if origen is not None and leer_origen(raiz) != origen:
        escribir_origen(raiz, origen)
    for nombre, (_, n) in cambios.items():
        (raiz / nombre).write_bytes(n.encode("utf-8"))
        print(f"reescrito {nombre}")
    print(f"Origen: {destino}. " + (f"{len(cambios)} archivo(s) reescrito(s)." if cambios else "Nada que cambiar."))
    return 1 if reportar_manuales() else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
