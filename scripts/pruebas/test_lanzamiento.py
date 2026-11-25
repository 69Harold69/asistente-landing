#!/usr/bin/env python3
"""Prueba del lanzamiento en Google Play (#132). Solo biblioteca estandar.

Uso:  python3 -I scripts/pruebas/test_lanzamiento.py
Trabaja sobre el arbol real (solo lectura). Fija el contrato posterior a la beta cerrada:
  - ninguna pagina no legal habla de beta, testers, grupo ni invitacion;
  - todo CTA de Play apunta a la ficha publica y el del hero lleva la insignia oficial;
  - App Store sigue deshabilitado con «Proximamente»;
  - el JSON-LD de la app declara installUrl, Android, precio 0;
  - no se menciona Premium (no se puede comprar);
  - las paginas legales no cambian respecto de origin/main.
"""
import json
import pathlib
import re
import shutil
import subprocess
import unittest
from html.parser import HTMLParser

RAIZ = pathlib.Path(__file__).resolve().parent.parent.parent
PLAY = "https://play.google.com/store/apps/details?id=dev.hjgr.yaruki"
LEGALES = ("privacidad", "terminos", "eliminar-cuenta")

# Con limite de palabra para «beta» (evita falsos positivos como «alfabeta»/«metabetas»); el resto son frases.
PROHIBIDAS_HTML = [
    r"\bbeta\b", r"prueba cerrada", r"\btesters?\b", r"groups\.google", r"grupo de",
    r"invitaci[oó]n", r"[uú]nete", r"/apps/testing/", r"no hay tope",
]
PROHIBIDAS_ASSETS = [r"\bbeta\b", r"\btesters?\b", r"groups\.google", r"/apps/testing/"]
# En assets los nombres de clase como `chip-beta-header` o `pasos-beta` deben desaparecer: ahi «beta» es parte
# de un identificador unido por guiones, asi que se busca sin limite de palabra pero solo la cadena «beta».
PROHIBIDAS_ASSETS_ID = [r"beta"]


def paginas_no_legales():
    out = []
    for p in sorted(RAIZ.rglob("*.html")):
        rel = p.relative_to(RAIZ)
        if rel.parts[0] in LEGALES or "node_modules" in rel.parts or rel.parts[0] == ".git":
            continue
        out.append(p)
    return out


def leer(p):
    return p.read_text(encoding="utf-8")


class Enlaces(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.enlaces = []   # (attrs, [hijos img attrs])
        self._pila = []
        self.disabled = []
        self._span = None
        self.texto_span = {}

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a":
            self._pila.append((a, []))
        elif tag == "img" and self._pila:
            self._pila[-1][1].append(a)
        if a.get("aria-disabled") == "true":
            self.disabled.append((tag, a))
            self._span = len(self.disabled) - 1
            self.texto_span[self._span] = ""

    def handle_endtag(self, tag):
        if tag == "a" and self._pila:
            self.enlaces.append(self._pila.pop())
        if self._span is not None and tag == self.disabled[self._span][0]:
            self._span = None

    def handle_data(self, d):
        if self._span is not None:
            self.texto_span[self._span] += d


class Lanzamiento(unittest.TestCase):
    def test_1_paginas_no_legales_sin_beta(self):
        malas = []
        for p in paginas_no_legales():
            t = leer(p)
            for pat in PROHIBIDAS_HTML:
                for m in re.finditer(pat, t, re.I):
                    linea = t.count("\n", 0, m.start()) + 1
                    malas.append(f"{p.relative_to(RAIZ)}:{linea} «{m.group(0)}»")
        self.assertEqual(malas, [], "quedan menciones de beta/grupo/invitacion:\n" + "\n".join(malas[:60]))

    def test_2_assets_sin_beta(self):
        malas = []
        for sub in ("js", "css"):
            for p in sorted((RAIZ / "assets" / sub).rglob("*")):
                if not p.is_file() or "vendor" in p.parts:
                    continue
                t = leer(p)
                for pat in PROHIBIDAS_ASSETS + PROHIBIDAS_ASSETS_ID:
                    for m in re.finditer(pat, t, re.I):
                        linea = t.count("\n", 0, m.start()) + 1
                        malas.append(f"{p.relative_to(RAIZ)}:{linea} «{m.group(0)}»")
        self.assertEqual(malas, [], "quedan menciones en assets:\n" + "\n".join(malas[:60]))

    def _portada(self):
        return leer(RAIZ / "index.html")

    def test_3_enlaces_de_play(self):
        p = Enlaces()
        p.feed(self._portada())
        play = [(a, imgs) for a, imgs in p.enlaces if "play.google.com" in a.get("href", "")]
        self.assertTrue(play, "no hay enlaces a Google Play")
        for a, _ in play:
            self.assertEqual(a["href"], PLAY, f"enlace de Play distinto de la ficha: {a['href']}")
        t = self._portada()
        hero = t[t.index('id="hero"'):t.index('id="fase-chat"')]
        cta = t[t.index('id="cta"'):t.index('id="como-funciona"')]
        self.assertIn(f'href="{PLAY}"', hero, "falta el enlace de Play en el hero")
        self.assertIn(f'href="{PLAY}"', cta, "falta el enlace de Play en #cta")
        # el del hero lleva una <img> con archivo real, width/height numericos y alt
        ph = Enlaces()
        ph.feed(hero)
        con_img = [(a, imgs) for a, imgs in ph.enlaces if a.get("href") == PLAY and imgs]
        self.assertTrue(con_img, "el enlace de Play del hero no contiene <img>")
        img = con_img[0][1][0]
        src = img.get("src", "").lstrip("/").split("?")[0]
        self.assertTrue(src.startswith("assets/"), f"src fuera de assets/: {src}")
        self.assertTrue((RAIZ / src).is_file(), f"la insignia no existe: {src}")
        self.assertRegex(img.get("width", ""), r"^\d+$")
        self.assertRegex(img.get("height", ""), r"^\d+$")
        self.assertTrue(img.get("alt", "").strip(), "alt vacio")

    def test_4_app_store_sigue_deshabilitado(self):
        p = Enlaces()
        p.feed(self._portada())
        tiendas = [i for i, (tag, a) in enumerate(p.disabled) if "App Store" in p.texto_span[i]]
        self.assertEqual(len(tiendas), 1, "debe haber exactamente un boton de App Store deshabilitado")
        tag, a = p.disabled[tiendas[0]]
        self.assertEqual(a.get("role"), "link")
        self.assertIn("button--disabled", a.get("class", ""))
        self.assertRegex(self._portada(),
                         r'aria-disabled="true">Descárgala en App Store</span>\s*<span class="chip">Próximamente</span>')

    def test_5_jsonld_software_application(self):
        t = self._portada()
        bloques = re.findall(r'<script type="application/ld\+json">(.*?)</script>', t, re.S)
        apps = []
        for b in bloques:
            d = json.loads(b)
            for n in (d.get("@graph", [d]) if isinstance(d, dict) else d):
                if n.get("@type") == "SoftwareApplication":
                    apps.append(n)
        self.assertEqual(len(apps), 1)
        a = apps[0]
        self.assertEqual(a.get("installUrl"), PLAY)
        self.assertIn("Android", a.get("operatingSystem", ""))
        self.assertNotRegex(a.get("operatingSystem", ""), r"(?i)ios")
        self.assertIn(str(a["offers"]["price"]), ("0", "0.0"))
        self.assertTrue(a["offers"].get("priceCurrency"))
        self.assertNotRegex(json.dumps(a, ensure_ascii=False), r"(?i)\bbeta\b")

    def test_6_sin_premium(self):
        malas = []
        for p in paginas_no_legales():
            t = leer(p)
            for m in re.finditer(r"premium", t, re.I):
                malas.append(f"{p.relative_to(RAIZ)}:{t.count(chr(10), 0, m.start()) + 1}")
        self.assertEqual(malas, [], "se menciona Premium: " + ", ".join(malas))

    def test_7_legales_intactas(self):
        if not shutil.which("git"):
            self.skipTest("git no esta disponible")
        r = subprocess.run(["git", "-C", str(RAIZ), "rev-parse", "--verify", "-q", "origin/main"], capture_output=True)
        if r.returncode != 0:
            self.skipTest("no hay origin/main")
        for d in LEGALES:
            ruta = f"{d}/index.html"
            base = subprocess.run(["git", "-C", str(RAIZ), "show", f"origin/main:{ruta}"], capture_output=True)
            self.assertEqual(base.returncode, 0, ruta)
            self.assertEqual((RAIZ / ruta).read_bytes(), base.stdout, f"{ruta} cambio respecto de origin/main")


if __name__ == "__main__":
    unittest.main()
