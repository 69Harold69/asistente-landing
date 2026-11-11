#!/usr/bin/env python3
"""Mutaciones del JSON-LD: cada defecto sembrado en una copia debe hacer fallar la regla json-ld de validar.

Uso:  python3 -I scripts/pruebas/test_jsonld.py   (requiere node y `npm ci` en scripts/pruebas)
"""
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parent.parent.parent
IGNORAR = shutil.ignore_patterns(".git", "node_modules")


@unittest.skipUnless(shutil.which("node") and (RAIZ / "scripts/pruebas/node_modules").exists(), "requiere node y npm ci")
class Mutaciones(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.addCleanup(self._t.cleanup)
        self.raiz = pathlib.Path(self._t.name) / "s"
        shutil.copytree(RAIZ, self.raiz, ignore=IGNORAR)

    def validar(self):
        env = {**os.environ, "YARUKI_RAIZ": str(self.raiz)}
        return subprocess.run(["node", str(RAIZ / "scripts/pruebas/validar.mjs"), "--solo", "json-ld,meta", "--estricto"], capture_output=True, text=True, env=env)

    def mutar(self, ruta, viejo, nuevo):
        p = self.raiz / ruta
        t = p.read_text(encoding="utf-8")
        self.assertIn(viejo, t, f"{ruta}: no hay «{viejo}»")
        p.write_text(t.replace(viejo, nuevo, 1), encoding="utf-8")

    def test_arbol_real_en_regla(self):
        r = self.validar()
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_cada_defecto_se_detecta(self):
        casos = {
            "referencia @id sin definir": ("index.html", '"author": { "@id":', '"author": { "@id": "https://yaruki.hjgr.dev/#nadie", "x":0 }, "z": { "@id":'),
            "nombre de persona no publicado": ("index.html", '"name": "Harold de Jesús García Ramírez"', '"name": "Nombre Inventado Pérez"'),
            "aggregateRating prohibido": ("index.html", '"isAccessibleForFree": true', '"aggregateRating": {"ratingValue": 5}, "isAccessibleForFree": true'),
            "downloadUrl prohibido": ("index.html", '"isAccessibleForFree": true', '"downloadUrl": "https://play.google.com/x", "isAccessibleForFree": true'),
            "sin BreadcrumbList en página legal": ("terminos/index.html", '"@type": "BreadcrumbList"', '"@type": "ItemList"'),
            "falta og:image:alt": ("privacidad/index.html", 'property="og:image:alt"', 'property="og:image:altx"'),
            "falta theme-color oscuro": ("terminos/index.html", '(prefers-color-scheme: dark)', '(prefers-color-scheme: x)'),
            "item relativo en BreadcrumbList": ("terminos/index.html", '"item": "https://yaruki.hjgr.dev/"', '"item": "/"'),
            "moneda no ISO 4217": ("index.html", '"priceCurrency": "MXN"', '"priceCurrency": "pesos"'),
            "precio no numérico": ("index.html", '"price": "0"', '"price": "gratis"'),
            "dato personal nuevo en Person": ("index.html", '"name": "Harold de Jesús García Ramírez"', '"name": "Harold de Jesús García Ramírez", "email": "otro@example.com"'),
        }
        for nombre, (ruta, viejo, nuevo) in casos.items():
            with self.subTest(nombre):
                shutil.rmtree(self.raiz)
                shutil.copytree(RAIZ, self.raiz, ignore=IGNORAR)
                self.mutar(ruta, viejo, nuevo)
                r = self.validar()
                self.assertEqual(r.returncode, 1, f"no se detectó «{nombre}»:\n{r.stdout}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
