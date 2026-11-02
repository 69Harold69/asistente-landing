#!/usr/bin/env python3
"""Cache busting de los recursos propios de la landing.

Calcula un hash corto del CONTENIDO de assets/css y assets/js (sin contar los
`?v=` ya escritos) y lo pone como `?v=<hash>` en:
  - los <link rel="stylesheet"> y <script src> de todos los .html;
  - los imports estáticos y dinámicos entre módulos JS (los módulos ES también
    se cachean, y si sólo versionaras main.js el navegador seguiría usando un
    chat.js viejo).

Idempotente: si nada cambió, no toca ningún archivo. Si cambia un .css/.js, el
hash cambia y todas las URLs cambian juntas (así un módulo nunca se carga con
dos URLs distintas). Uso:  python3 scripts/versionar.py  [--check]
`--check` no escribe: sale con 1 si hay URLs desactualizadas (útil de hook).
"""
import hashlib
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
V = re.compile(r"\?v=[0-9a-f]+")

# href/src de assets propios en HTML
RE_HTML = re.compile(r'((?:href|src)="[^"?]*assets/(?:css|js)/[^"?]+\.(?:css|js))(?:\?v=[0-9a-f]+)?(")')
# import ... from "./x.js" / import("./x.js") en módulos
RE_JS = re.compile(r'((?:from\s+|import\s*\(\s*)"\.{1,2}/[^"?]+\.js)(?:\?v=[0-9a-f]+)?(")')


def fuentes():
    for ext in ("css", "js"):
        yield from sorted((RAIZ / "assets").rglob(f"*.{ext}"))


def calcular_hash():
    h = hashlib.sha1()
    for f in fuentes():
        h.update(str(f.relative_to(RAIZ)).encode())
        h.update(V.sub("", f.read_text(encoding="utf-8")).encode())
    return h.hexdigest()[:10]


def reescribir(ruta, regex, version):
    txt = ruta.read_text(encoding="utf-8")
    nuevo = regex.sub(lambda m: f"{m.group(1)}?v={version}{m.group(2)}", txt)
    return txt, nuevo


def main():
    solo_revisar = "--check" in sys.argv
    version = calcular_hash()
    cambiados = []
    objetivos = [(p, RE_HTML) for p in sorted(RAIZ.rglob("*.html")) if ".git" not in p.parts]
    objetivos += [(p, RE_JS) for p in fuentes() if p.suffix == ".js" and "vendor" not in p.parts]
    for ruta, regex in objetivos:
        viejo, nuevo = reescribir(ruta, regex, version)
        if viejo != nuevo:
            cambiados.append(ruta.relative_to(RAIZ))
            if not solo_revisar:
                ruta.write_text(nuevo, encoding="utf-8")
    print(f"versión {version}: {len(cambiados)} archivo(s) {'desactualizados' if solo_revisar else 'actualizados'}")
    for c in cambiados:
        print(" ", c)
    return 1 if (solo_revisar and cambiados) else 0


if __name__ == "__main__":
    sys.exit(main())
