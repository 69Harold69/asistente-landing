#!/usr/bin/env python3
"""Pruebas de scripts/dominio.py (solo biblioteca estandar).

Uso:  python3 -I scripts/pruebas/test_dominio.py
Trabajan SIEMPRE sobre una copia temporal del sitio (--raiz); nunca tocan el arbol real.
"""
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parent.parent.parent
DOMINIO = RAIZ / "scripts" / "dominio.py"
VIEJO = "yaruki.hjgr.dev"
NUEVO = "https://yaruki.app"
# Unicos sitios donde el dominio viejo PUEDE seguir apareciendo tras mudarse (ver README, «Mudanza a dominio propio»):
EXCEPCIONES = {"README.md", "scripts/pruebas/test_dominio.py", "scripts/pruebas/test_jsonld.py"}  # el README documenta la mudanza; esta prueba usa el dominio como dato
IGNORAR = shutil.ignore_patterns(".git", "node_modules")


def huella(raiz):
    """Hash de cada archivo del arbol, para comparar «byte a byte»."""
    return {
        str(p.relative_to(raiz)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(raiz.rglob("*"))
        if p.is_file() and ".git" not in p.parts and "node_modules" not in p.parts
    }


def correr(raiz, *args):
    return subprocess.run(
        [sys.executable, "-I", str(DOMINIO), "--raiz", str(raiz), *args],
        capture_output=True, text=True,
    )


class Base(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.raiz = pathlib.Path(self._tmp.name) / "sitio"
        shutil.copytree(RAIZ, self.raiz, ignore=IGNORAR)

    def reemplazar(self, ruta, viejo, nuevo, veces=1):
        p = self.raiz / ruta
        t = p.read_text(encoding="utf-8")
        self.assertGreaterEqual(t.count(viejo), veces, f"{ruta}: no hay «{viejo}» para mutar")
        p.write_text(t.replace(viejo, nuevo, veces), encoding="utf-8")


class Check(Base):
    def test_el_arbol_real_esta_en_regla(self):
        r = correr(self.raiz, "--check")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_check_detecta_cada_tipo_de_aparicion(self):
        otro = "https://otro.example"
        casos = {
            "canonical": ("index.html", f'<link rel="canonical" href="https://{VIEJO}/"'),
            "og:url": ("privacidad/index.html", f'content="https://{VIEJO}/privacidad/"'),
            "og:image": ("terminos/index.html", f'<meta property="og:image" content="https://{VIEJO}/'),
            "twitter:image": ("eliminar-cuenta/index.html", f'<meta name="twitter:image" content="https://{VIEJO}/'),
            "json-ld @id": ("index.html", f'"@id": "https://{VIEJO}/#app"'),
            "json-ld url": ("index.html", f'"url": "https://{VIEJO}/",\n        "description"'),
            "json-ld image": ("index.html", f'"image": "https://{VIEJO}/'),
            "sitemap loc": ("sitemap.xml", f"<loc>https://{VIEJO}/terminos/"),
            "robots Sitemap": ("robots.txt", f"Sitemap: https://{VIEJO}/"),
        }
        for nombre, (ruta, fragmento) in casos.items():
            with self.subTest(nombre):
                shutil.rmtree(self.raiz)
                shutil.copytree(RAIZ, self.raiz, ignore=IGNORAR)
                self.reemplazar(ruta, fragmento, fragmento.replace(f"https://{VIEJO}", otro))
                r = correr(self.raiz, "--check")
                self.assertEqual(r.returncode, 1, f"--check no detecto «{nombre}»:\n{r.stdout}{r.stderr}")
                self.assertIn(ruta, r.stdout)

    def test_check_no_escribe(self):
        self.reemplazar("robots.txt", f"https://{VIEJO}", "https://otro.example")
        antes = huella(self.raiz)
        correr(self.raiz, "--check")
        self.assertEqual(huella(self.raiz), antes)

    def test_dominios_externos_legitimos_se_respetan(self):
        # El JSON-LD puede apuntar a sitios externos (Play, GitHub, schema.org): ni se reescriben ni fallan.
        p = self.raiz / "index.html"
        t = p.read_text(encoding="utf-8")
        t = t.replace('"name": "Harold de Jesús García Ramírez"\n', '"name": "Harold de Jesús García Ramírez",\n        "sameAs": ["https://github.com/69Harold69"]\n', 1)
        self.assertIn("github.com/69Harold69", t)
        p.write_text(t, encoding="utf-8")
        self.assertEqual(correr(self.raiz, "--check").returncode, 0)
        correr(self.raiz, "--origen", NUEVO)
        self.assertIn("https://github.com/69Harold69", p.read_text(encoding="utf-8"))


class Reescritura(Base):
    def test_mudanza_no_deja_el_dominio_viejo_salvo_excepciones(self):
        r = correr(self.raiz, "--origen", NUEVO)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        sobran = [
            f"{k}" for k in huella(self.raiz)
            if k not in EXCEPCIONES and not k.endswith((".png", ".ico", ".woff2", ".webp", ".svg"))
            and VIEJO in (self.raiz / k).read_text(encoding="utf-8", errors="ignore")
        ]
        self.assertEqual(sobran, [], f"quedan apariciones del dominio viejo en: {sobran}")
        self.assertEqual(correr(self.raiz, "--check").returncode, 0)
        self.assertEqual(json.loads((self.raiz / "scripts/sitio.json").read_text())["origen"], NUEVO)

    def test_mudanza_pone_el_dominio_nuevo_en_todos_los_contextos(self):
        correr(self.raiz, "--origen", NUEVO)
        for ruta in ("index.html", "privacidad/index.html", "terminos/index.html", "eliminar-cuenta/index.html", "sitemap.xml", "robots.txt"):
            self.assertIn(NUEVO + "/", (self.raiz / ruta).read_text(encoding="utf-8"), ruta)
        idx = (self.raiz / "index.html").read_text(encoding="utf-8")
        self.assertIn(f'"@id": "{NUEVO}/#sitio"', idx)
        self.assertIn(f'<link rel="canonical" href="{NUEVO}/" />', idx)

    def test_idempotente(self):
        correr(self.raiz, "--origen", NUEVO)
        una = huella(self.raiz)
        r = correr(self.raiz)
        self.assertEqual(r.returncode, 0)
        self.assertEqual(huella(self.raiz), una)

    def test_viaje_de_ida_y_vuelta_deja_el_arbol_igual_byte_a_byte(self):
        original = huella(self.raiz)
        correr(self.raiz, "--origen", NUEVO)
        self.assertNotEqual(huella(self.raiz), original)
        correr(self.raiz, "--origen", f"https://{VIEJO}")
        self.assertEqual(huella(self.raiz), original)

    def test_origen_invalido_se_rechaza_sin_tocar_nada(self):
        original = huella(self.raiz)
        for malo in ("http://yaruki.app", "https://yaruki.app/", "https://yaruki.app/ruta", "yaruki.app", "https://", "https://YARUKI.app", "https://a b.com"):
            with self.subTest(malo):
                r = correr(self.raiz, "--origen", malo)
                self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
                self.assertEqual(huella(self.raiz), original)


@unittest.skipUnless(shutil.which("node") and (RAIZ / "scripts/pruebas/node_modules").exists(), "requiere node y npm ci en scripts/pruebas")
class ReglaValidar(Base):
    """La regla `dominio` de validar.mjs, apuntada a una copia (YARUKI_RAIZ)."""

    def validar(self):
        import os
        env = {**os.environ, "YARUKI_RAIZ": str(self.raiz)}
        return subprocess.run(["node", str(RAIZ / "scripts/pruebas/validar.mjs"), "--solo", "dominio", "--estricto"], capture_output=True, text=True, env=env)

    def test_arbol_en_regla(self):
        r = self.validar()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_detecta_dominio_ajeno_en_cada_contexto(self):
        casos = {
            "canonical": ("index.html", f'<link rel="canonical" href="https://{VIEJO}/"'),
            "og:image": ("privacidad/index.html", f'<meta property="og:image" content="https://{VIEJO}/'),
            "twitter:image": ("terminos/index.html", f'<meta name="twitter:image" content="https://{VIEJO}/'),
            "json-ld": ("index.html", f'"@id": "https://{VIEJO}/#sitio"'),
            "sitemap": ("sitemap.xml", f"<loc>https://{VIEJO}/terminos/"),
            "robots": ("robots.txt", f"Sitemap: https://{VIEJO}/"),
        }
        for nombre, (ruta, frag) in casos.items():
            with self.subTest(nombre):
                shutil.rmtree(self.raiz)
                shutil.copytree(RAIZ, self.raiz, ignore=IGNORAR)
                self.reemplazar(ruta, frag, frag.replace(f"https://{VIEJO}", "https://otro.example"))
                r = self.validar()
                self.assertEqual(r.returncode, 1, f"validar no detecto «{nombre}»:\n{r.stdout}")
                self.assertIn("[dominio]", r.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
