#!/usr/bin/env python3
"""Reglas de las páginas-guía (Article): cada defecto sembrado en una guía sintética debe hacer fallar `validar`.

Uso:  python3 -I scripts/pruebas/test_guias.py   (requiere node y `npm ci` en scripts/pruebas)

La guía sintética se arma en una copia temporal del sitio (con su entrada en sitemap.xml y un enlace desde
la portada), así las reglas se prueban sin depender del contenido de las guías reales. El último caso
corre las reglas sobre el árbol real.
"""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parent.parent.parent
IGNORAR = shutil.ignore_patterns(".git", "node_modules")
ORIGEN = json.loads((RAIZ / "scripts/sitio.json").read_text(encoding="utf-8"))["origen"]
REGLAS = "json-ld,meta,guias,faq-visible,sitemap,enlaces"
GUIAS_ESPERADAS = {"organizar-tareas-con-ia"}  # la segunda guía la agrega su propia PR

GUIA = """<!doctype html>
<html lang="es-MX">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Guía de prueba para validar | Yaruki</title>
  <meta name="description" content="Descripción de la guía de prueba, con una longitud razonable para que las reglas de metadatos queden satisfechas sin avisos." />
  <link rel="canonical" href="__ORIGEN__/guia-prueba/" />
  <meta property="og:title" content="Guía de prueba" />
  <meta property="og:description" content="Descripción de la guía de prueba." />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="__ORIGEN__/guia-prueba/" />
  <meta property="og:site_name" content="Yaruki" />
  <meta property="og:locale" content="es_MX" />
  <meta property="og:image" content="__ORIGEN__/assets/img/og-yaruki.png" />
  <meta property="og:image:alt" content="Alt de la imagen." />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Guía de prueba" />
  <meta name="twitter:description" content="Descripción de la guía de prueba." />
  <meta name="twitter:image" content="__ORIGEN__/assets/img/og-yaruki.png" />
  <meta name="twitter:image:alt" content="Alt de la imagen." />
  <meta name="theme-color" content="#faf7f2" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#151322" media="(prefers-color-scheme: dark)" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": "__ORIGEN__/guia-prueba/#articulo",
        "headline": "Titular de la guía de prueba",
        "inLanguage": "es-MX",
        "datePublished": "2026-11-10",
        "dateModified": "2026-11-10",
        "author": { "@id": "__ORIGEN__/#autor" },
        "publisher": { "@id": "__ORIGEN__/#autor" },
        "isPartOf": { "@id": "__ORIGEN__/#sitio" },
        "about": { "@id": "__ORIGEN__/#app" },
        "mainEntityOfPage": { "@id": "__ORIGEN__/guia-prueba/#pagina" }
      },
      {
        "@type": "WebPage",
        "@id": "__ORIGEN__/guia-prueba/#pagina",
        "url": "__ORIGEN__/guia-prueba/",
        "name": "Guía de prueba",
        "inLanguage": "es-MX",
        "isPartOf": { "@id": "__ORIGEN__/#sitio" },
        "breadcrumb": { "@id": "__ORIGEN__/guia-prueba/#migas" }
      },
      {
        "@type": "BreadcrumbList",
        "@id": "__ORIGEN__/guia-prueba/#migas",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Yaruki", "item": "__ORIGEN__/" },
          { "@type": "ListItem", "position": 2, "name": "Guía de prueba" }
        ]
      },
      {
        "@type": "FAQPage",
        "@id": "__ORIGEN__/guia-prueba/#preguntas",
        "mainEntity": [
          { "@type": "Question", "name": "¿Esto es una pregunta?", "acceptedAnswer": { "@type": "Answer", "text": "Sí, y esta es su respuesta." } }
        ]
      }
    ]
  }
  </script>
</head>
<body>
  <main>
    <article>
      <h1>Guía de prueba</h1>
      <p>Por <span>Harold de Jesús García Ramírez</span>. Publicado el <time datetime="2026-11-10">10 de noviembre de 2026</time>.</p>
      <h2>Preguntas frecuentes</h2>
      <h3>¿Esto es una pregunta?</h3>
      <p>Sí, y esta es su respuesta.</p>
    </article>
  </main>
</body>
</html>
"""


@unittest.skipUnless(shutil.which("node") and (RAIZ / "scripts/pruebas/node_modules").exists(), "requiere node y npm ci")
class ReglasDeGuias(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.addCleanup(self._t.cleanup)
        self.base = pathlib.Path(self._t.name)
        self.nueva_copia()

    def nueva_copia(self):
        self.raiz = self.base / "s"
        if self.raiz.exists():
            shutil.rmtree(self.raiz)
        shutil.copytree(RAIZ, self.raiz, ignore=IGNORAR)
        (self.raiz / "guia-prueba").mkdir()
        (self.raiz / "guia-prueba/index.html").write_text(GUIA.replace("__ORIGEN__", ORIGEN), encoding="utf-8")
        sm = self.raiz / "sitemap.xml"
        sm.write_text(
            sm.read_text(encoding="utf-8").replace("</urlset>", f"  <url>\n    <loc>{ORIGEN}/guia-prueba/</loc>\n    <lastmod>2026-11-10</lastmod>\n  </url>\n</urlset>"),
            encoding="utf-8",
        )
        self.mutar("index.html", '<ul class="footer-links">', '<ul class="footer-links">\n          <li><a href="/guia-prueba/">Guía de prueba</a></li>')

    def validar(self, raiz=None, solo=REGLAS):
        env = {**os.environ, "YARUKI_RAIZ": str(raiz or self.raiz)}
        return subprocess.run(["node", str(RAIZ / "scripts/pruebas/validar.mjs"), "--solo", solo, "--estricto"], capture_output=True, text=True, env=env)

    def mutar(self, ruta, viejo, nuevo):
        p = self.raiz / ruta
        t = p.read_text(encoding="utf-8")
        self.assertIn(viejo, t, f"{ruta}: no hay «{viejo}»")
        p.write_text(t.replace(viejo, nuevo, 1), encoding="utf-8")

    def test_guia_sintetica_valida_pasa(self):
        r = self.validar()
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_cada_defecto_se_detecta(self):
        g = "guia-prueba/index.html"
        casos = {
            "title de 61 caracteres": (g, "<title>Guía de prueba para validar | Yaruki</title>", "<title>" + "T" * 61 + "</title>", "[guias]"),
            "description de 156 caracteres": (g, 'name="description" content="Descripción de la guía de prueba, con una longitud razonable para que las reglas de metadatos queden satisfechas sin avisos."', 'name="description" content="' + "d" * 156 + '"', "[guias]"),
            "FAQ: respuesta distinta de la visible": (g, '"text": "Sí, y esta es su respuesta."', '"text": "Sí, y esta es otra respuesta."', "[faq-visible]"),
            "FAQ: pregunta que no está visible": (g, '"name": "¿Esto es una pregunta?"', '"name": "¿Y esta otra?"', "[faq-visible]"),
            "Article sin author": (g, '"author": { "@id": "__O__/#autor" },'.replace("__O__", ORIGEN), "", "[json-ld]"),
            "Article sin headline": (g, '"headline": "Titular de la guía de prueba",', "", "[json-ld]"),
            "headline de más de 110 caracteres": (g, '"headline": "Titular de la guía de prueba"', '"headline": "' + "h" * 111 + '"', "[guias]"),
            "datePublished distinta de la <time> visible": (g, '"datePublished": "2026-11-10"', '"datePublished": "2026-11-09"', "[guias]"),
            "dateModified anterior a datePublished": (g, '"dateModified": "2026-11-10"', '"dateModified": "2026-11-01"', "[guias]"),
            "autor no visible en la página": (g, "<span>Harold de Jesús García Ramírez</span>", "<span>alguien</span>", "[guias]"),
            "sin <time> visible": (g, '<time datetime="2026-11-10">10 de noviembre de 2026</time>', "10 de noviembre de 2026", "[guias]"),
            "autor referenciado que no existe": (g, '"author": { "@id": "__O__/#autor" }'.replace("__O__", ORIGEN), '"author": { "@id": "__O__/#nadie" }'.replace("__O__", ORIGEN), "[json-ld]"),
            "guía huérfana (la portada no la enlaza)": ("index.html", '<li><a href="/guia-prueba/">Guía de prueba</a></li>', "", "[guias]"),
        }
        for nombre, (ruta, viejo, nuevo, regla) in casos.items():
            with self.subTest(nombre):
                self.nueva_copia()
                self.mutar(ruta, viejo, nuevo)
                r = self.validar()
                self.assertEqual(r.returncode, 1, f"no se detectó «{nombre}»:\n{r.stdout}")
                self.assertIn(regla, r.stdout, f"«{nombre}» debe fallar por {regla}:\n{r.stdout}")

    def test_arbol_real_en_regla(self):
        for ruta in ("organizar-tareas-con-ia", "recordatorios-por-voz"):
            if (RAIZ / ruta).exists() is False and ruta in GUIAS_ESPERADAS:
                self.fail(f"falta la guía /{ruta}/")
        r = self.validar(RAIZ, solo=REGLAS)
        self.assertEqual(r.returncode, 0, r.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
