#!/usr/bin/env python3
"""Avisa a los buscadores IndexNow (Bing, Yandex, Seznam, Naver...) de las URLs que cambiaron.

Por defecto es una SIMULACION: imprime el aviso que mandaría y no abre ninguna conexión.
Solo `--enviar` hace la petición.

Uso:
  python3 scripts/indexnow.py --desde <rev> [--hasta HEAD]   páginas del sitemap cuyo HTML cambió en ese rango de commits
  python3 scripts/indexnow.py --urls URL [URL ...]           URLs explícitas (deben ser del host del sitio)
  python3 scripts/indexnow.py --todas                        todas las URLs del sitemap
  ...  --enviar                                              manda el aviso (POST JSON a api.indexnow.org)

Opciones: --raiz DIR, --clave CLAVE (por defecto se detecta <clave>.txt en la raíz), --endpoint URL,
--sin-verificar (no comprueba antes que https://<sitio>/<clave>.txt ya esté publicado).

El dominio sale de scripts/sitio.json (scripts/dominio.py), y las URLs, de sitemap.xml.
La clave de IndexNow NO es un secreto: el protocolo exige publicar <clave>.txt en la raíz del sitio.
Solo biblioteca estándar.
"""
import json
import pathlib
import re
import subprocess
import sys
import urllib.error
import urllib.request

RAIZ_DEFECTO = pathlib.Path(__file__).resolve().parent.parent
ENDPOINT = "https://api.indexnow.org/indexnow"
RE_CLAVE = re.compile(r"^[A-Za-z0-9-]{8,128}$")
LIMITE = 10000  # URLs por petición, según indexnow.org/documentation


def error(msg, codigo=2):
    print(msg, file=sys.stderr)
    return codigo


def origen_de(raiz):
    return json.loads((raiz / "scripts/sitio.json").read_text(encoding="utf-8"))["origen"]


def urls_del_sitemap(raiz):
    xml = (raiz / "sitemap.xml").read_text(encoding="utf-8")
    return re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml)


def archivo_de(url, origen):
    ruta = url[len(origen):].split("#")[0].split("?")[0]
    return ruta.lstrip("/") + "index.html" if ruta.endswith("/") or ruta == "" else ruta.lstrip("/")


def detectar_clave(raiz):
    for p in sorted(raiz.glob("*.txt")):
        if p.name != "robots.txt" and RE_CLAVE.match(p.stem) and p.read_bytes().decode("utf-8") == p.stem:
            return p.stem
    return None


def cambiadas(raiz, desde, hasta):
    r = subprocess.run(["git", "-C", str(raiz), "diff", "--name-only", f"{desde}..{hasta}"], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(error(f"git diff {desde}..{hasta} falló: {r.stderr.strip()}"))
    return set(r.stdout.split())


def main(argv):
    raiz, desde, hasta, urls, todas, enviar = RAIZ_DEFECTO, None, "HEAD", None, False, False
    clave, endpoint, verificar = None, ENDPOINT, True
    args = list(argv)
    while args:
        a = args.pop(0)
        if a in ("-h", "--help"):
            print(__doc__)
            return 0
        elif a == "--enviar":
            enviar = True
        elif a == "--todas":
            todas = True
        elif a == "--sin-verificar":
            verificar = False
        elif a == "--urls":
            urls = []
            while args and not args[0].startswith("--"):
                urls.append(args.pop(0))
        elif a in ("--raiz", "--desde", "--hasta", "--clave", "--endpoint") and args:
            v = args.pop(0)
            if a == "--raiz":
                raiz = pathlib.Path(v).resolve()
            elif a == "--desde":
                desde = v
            elif a == "--hasta":
                hasta = v
            elif a == "--clave":
                clave = v
            else:
                endpoint = v
        else:
            return error(f"Argumento desconocido: {a}\n{__doc__}")
    if not (desde or urls or todas):
        return error("Indica --desde <rev>, --urls ... o --todas.\n" + __doc__)
    origen = origen_de(raiz)
    host = origen.split("//", 1)[1]
    if urls is not None:
        malas = [u for u in urls if not (u == origen or u.startswith(origen + "/"))]
        if malas:
            return error(f"URLs que no pertenecen a {host} (IndexNow responde 422): {', '.join(malas)}")
        lista = urls
    else:
        sitemap = urls_del_sitemap(raiz)
        if todas:
            lista = sitemap
        else:
            tocados = cambiadas(raiz, desde, hasta)
            lista = [u for u in sitemap if archivo_de(u, origen) in tocados]
    if not lista:
        print("Nada que avisar: ninguna página del sitemap cambió en ese rango.")
        return 0
    if len(lista) > LIMITE:
        return error(f"{len(lista)} URLs: IndexNow admite {LIMITE} por petición.")
    clave = clave or detectar_clave(raiz)
    if not clave or not RE_CLAVE.match(clave):
        return error("No hay clave válida (8–128 caracteres: letras, números y guiones). Falta <clave>.txt en la raíz.")
    cuerpo = {"host": host, "key": clave, "keyLocation": f"{origen}/{clave}.txt", "urlList": lista}
    texto = json.dumps(cuerpo, indent=2, ensure_ascii=False)
    if not enviar:
        print(f"SIMULACIÓN (no se envió nada; agrega --enviar). POST {endpoint}\n{texto}")
        return 0
    if verificar:
        try:
            publicado = urllib.request.urlopen(cuerpo["keyLocation"], timeout=15).read().decode("utf-8")
        except (urllib.error.URLError, OSError) as e:
            return error(f"No se pudo leer {cuerpo['keyLocation']} ({e}). Publica el sitio primero (git pull en el droplet).", 1)
        if publicado != clave:
            return error(f"{cuerpo['keyLocation']} no contiene exactamente la clave. No se envía.", 1)
    peticion = urllib.request.Request(endpoint, data=texto.encode("utf-8"), headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
    try:
        with urllib.request.urlopen(peticion, timeout=30) as r:
            codigo = r.status
    except urllib.error.HTTPError as e:
        codigo = e.code
    except (urllib.error.URLError, OSError) as e:
        return error(f"Falló la conexión con {endpoint}: {e}", 1)
    significado = {200: "enviado", 202: "recibido, validación de la clave pendiente", 400: "formato inválido", 403: "clave no válida (¿ya está publicado <clave>.txt?)", 422: "URLs de otro host o clave fuera del esquema", 429: "demasiadas peticiones"}
    print(f"{endpoint} -> {codigo} ({significado.get(codigo, 'respuesta inesperada')}); {len(lista)} URL(s).")
    return 0 if codigo in (200, 202) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
