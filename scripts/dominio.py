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
  - Cadenas URL dentro de <script type="application/ld+json">: las claves @id, url, image, logo,
    item y mainEntityOfPage (salvo hosts externos conocidos: ver EXTERNOS) y cualquier otra
    cadena cuyo host sea uno de los dominios propios detectados en canonical/sitemap/robots.
  - <loc> y xhtml:link de sitemap.xml; líneas Sitemap:/Host: de robots.txt.
No toca scripts/, README.md, /.well-known/, correos (mailto:) ni el identificador de Play.
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
EXCLUIDOS = {".git", "node_modules", "scripts", ".worktrees"}

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


def reescribir_html(t, origen, propios):
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
        propia = host in propios or (k in CLAVES_PROPIAS and host not in EXTERNOS)
        return m.group(0).replace(u, con_origen(u, origen), 1) if propia else m.group(0)

    def ld(m):
        return m.group(1) + RE_CADENA_URL.sub(cadena, m.group(2)) + m.group(3)

    t = RE_META.sub(meta, t)
    t = RE_LINK.sub(link, t)
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


def calcular(raiz, origen):
    """Devuelve {ruta_relativa: (texto_actual, texto_nuevo)} solo de los archivos que cambiarían."""
    textos = {str(p.relative_to(raiz)): p.read_bytes().decode("utf-8") for p in archivos(raiz)}
    propios = hosts_propios(textos, origen)
    cambios = {}
    for nombre, t in textos.items():
        if nombre.endswith(".html"):
            n = reescribir_html(t, origen, propios)
        elif nombre == "sitemap.xml":
            n = reescribir_sitemap(t, origen)
        else:
            n = reescribir_robots(t, origen)
        if n != t:
            cambios[nombre] = (t, n)
    return cambios


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
    cambios = calcular(raiz, destino)
    if solo_revisar:
        for nombre, (v, n) in cambios.items():
            for linea, x, y in diferencias(v, n):
                print(f"FALLA [dominio] {nombre}:{linea} debe usar {destino}\n    hay:  {x}\n    debe: {y}")
        if cambios:
            print(f"\n{len(cambios)} archivo(s) no coinciden con {destino}. Corre: python3 scripts/dominio.py")
            return 1
        print(f"OK: todas las URLs absolutas usan {destino}.")
        return 0
    if origen is not None and leer_origen(raiz) != origen:
        escribir_origen(raiz, origen)
    for nombre, (_, n) in cambios.items():
        (raiz / nombre).write_bytes(n.encode("utf-8"))
        print(f"reescrito {nombre}")
    print(f"Origen: {destino}. " + (f"{len(cambios)} archivo(s) reescrito(s)." if cambios else "Nada que cambiar."))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
