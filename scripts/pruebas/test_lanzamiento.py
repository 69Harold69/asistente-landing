#!/usr/bin/env python3
"""Prueba del lanzamiento en Google Play (#132). Solo biblioteca estandar.

Uso:  python3 -I scripts/pruebas/test_lanzamiento.py
Trabaja sobre el arbol real (solo lectura). Fija el contrato posterior a la beta cerrada:
  - ninguna pagina no legal habla de beta, testers, grupo ni invitacion;
  - todo CTA de Play apunta a la ficha publica y el del hero lleva la insignia oficial;
  - App Store sigue deshabilitado con «Proximamente»;
  - el JSON-LD de la app declara installUrl, Android, precio 0;
  - no se menciona Premium (no se puede comprar);
  - las paginas legales coinciden con la huella aprobada de `legales.sha256`, calculada sin el sello `?v=` de
    los assets (un cambio legal aprobado por el
    dueno actualiza ese archivo en la misma PR: queda explicito y revisable, y la prueba sigue teniendo sentido
    despues del merge).
"""
import hashlib
import json
import pathlib
import re
import unittest
from html.parser import HTMLParser

RAIZ = pathlib.Path(__file__).resolve().parent.parent.parent
PLAY = "https://play.google.com/store/apps/details?id=dev.hjgr.yaruki"
LEGALES = ("privacidad", "terminos", "eliminar-cuenta")
INSIGNIA = "assets/img/google-play-descargar-es-419.png"
# sha256 de la insignia oficial es-419 de Google (sin retocar; ver README, «Insignia de Google Play»).
INSIGNIA_SHA256 = "777c1400d580bcc8dc39539c6958874840f5896aca22a5da0abf824518824fab"

# Con limite de palabra para «beta» (evita falsos positivos como «alfabeta»/«metabetas»); el resto son frases.
PROHIBIDAS_HTML = [
    r"\bbeta\b", r"prueba cerrada", r"\btesters?\b", r"groups\.google", r"grupo de",
    r"invitaci[oó]n", r"[uú]nete", r"/apps/testing/", r"no hay tope",
    r"acceso anticipado", r"early access", r"lista de espera",
]
PROHIBIDAS_ASSETS = [r"\bbeta\b", r"\btesters?\b", r"groups\.google", r"/apps/testing/", r"prueba cerrada",
                     r"acceso anticipado", r"lista de espera", r"invitaci[oó]n"]
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
        """Toda pagina no legal: cada enlace de Play va a la ficha; cada insignia es la oficial, con alt, width y height."""
        total = 0
        for pagina in paginas_no_legales():
            p = Enlaces()
            p.feed(leer(pagina))
            rel = pagina.relative_to(RAIZ)
            for a, imgs in p.enlaces:
                href = a.get("href", "")
                if "play.google.com" in href:
                    self.assertEqual(href, PLAY, f"{rel}: enlace de Play distinto de la ficha: {href}")
                if "data-cta-play" in a or "play-badge" in a.get("class", ""):
                    total += 1
                    self.assertEqual(href, PLAY, f"{rel}: insignia que no va a la ficha: {href}")
                    self.assertEqual(len(imgs), 1, f"{rel}: la insignia debe ser exactamente una <img>")
                    img = imgs[0]
                    src = (pagina.parent / img.get("src", "")).resolve()
                    self.assertEqual(src, (RAIZ / INSIGNIA).resolve(), f"{rel}: src de la insignia: {img.get('src')}")
                    self.assertEqual((img.get("width"), img.get("height")), ("646", "250"), f"{rel}: width/height de la insignia")
                    # WCAG 2.5.3: el nombre accesible contiene el texto visible de la insignia («DESCARGAR EN Google Play»).
                    self.assertIn("descargar en google play", img.get("alt", "").lower(), f"{rel}: alt de la insignia")
                    self.assertNotIn("aria-label", a, f"{rel}: aria-label en la insignia tapa el alt")
        self.assertGreaterEqual(total, 4, "se esperaban las insignias del hero, #cta y las dos guias")
        t = self._portada()
        hero = t[t.index('id="hero"'):t.index('id="fase-chat"')]
        cta = t[t.index('id="cta"'):t.index('id="como-funciona"')]
        self.assertIn(f'href="{PLAY}" data-cta-play', hero, "falta la insignia de Play en el hero")
        self.assertIn(f'href="{PLAY}" data-cta-play', cta, "falta la insignia de Play en #cta")
        dig = hashlib.sha256((RAIZ / INSIGNIA).read_bytes()).hexdigest()
        self.assertEqual(dig, INSIGNIA_SHA256, "la insignia cambio: debe ser la oficial de Google, sin retocar")

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
        """Huella aprobada de cada legal. Si el dueno aprueba un cambio legal, se actualiza `legales.sha256` en la misma PR."""
        manifiesto = {}
        for linea in (RAIZ / "scripts/pruebas/legales.sha256").read_text(encoding="utf-8").splitlines():
            if linea.strip():
                dig, ruta = linea.split(None, 1)
                manifiesto[ruta.strip()] = dig
        self.assertEqual(sorted(manifiesto), sorted(f"{d}/index.html" for d in LEGALES))
        for ruta, dig in manifiesto.items():
            # Sin el sello `?v=<version>` de los assets: `versionar.py` lo cambia en cada cierre y no es contenido legal.
            contenido = re.sub(rb"\?v=[0-9a-f]{10}", b"?v=", (RAIZ / ruta).read_bytes())
            real = hashlib.sha256(contenido).hexdigest()
            self.assertEqual(real, dig, f"{ruta} cambio sin actualizar legales.sha256 (los legales solo cambian con aprobacion del dueno)")


if __name__ == "__main__":
    unittest.main()
