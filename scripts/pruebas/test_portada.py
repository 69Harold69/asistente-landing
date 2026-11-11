#!/usr/bin/env python3
"""Reglas del contenido indexable de la portada (`portada`, `faq-visible`): cada defecto sembrado debe hacer fallar `validar`.

Uso:  python3 -I scripts/pruebas/test_portada.py   (requiere node y `npm ci` en scripts/pruebas)

Se trabaja en una copia temporal del sitio: se rompe un detalle de `index.html` y se espera el hallazgo de la regla correcta.
El primer caso corre las reglas sobre el árbol real.
"""
import os
import pathlib
import re
import shutil
import subprocess
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parent.parent.parent
IGNORAR = shutil.ignore_patterns(".git", "node_modules")
REGLAS = "portada,faq-visible,json-ld,enlaces,html-validate"


@unittest.skipUnless(shutil.which("node") and (RAIZ / "scripts/pruebas/node_modules").exists(), "requiere node y npm ci")
class ReglasDePortada(unittest.TestCase):
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

    def validar(self, raiz=None, solo=REGLAS):
        env = {**os.environ, "YARUKI_RAIZ": str(raiz or self.raiz)}
        return subprocess.run(["node", str(RAIZ / "scripts/pruebas/validar.mjs"), "--solo", solo, "--estricto"], capture_output=True, text=True, env=env)

    def leer(self):
        return (self.raiz / "index.html").read_text(encoding="utf-8")

    def escribir(self, texto):
        (self.raiz / "index.html").write_text(texto, encoding="utf-8")

    def mutar(self, viejo, nuevo, cuantas=1):
        t = self.leer()
        self.assertIn(viejo, t, f"index.html: no hay «{viejo[:60]}»")
        self.escribir(t.replace(viejo, nuevo, cuantas))

    def test_arbol_real_en_regla(self):
        r = self.validar(RAIZ)
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_cada_defecto_se_detecta(self):
        def sin_seccion(t):
            return re.sub(r'<section id="como-funciona".*?</section>', "", t, count=1, flags=re.S)

        def dos_pasos(t):
            return re.sub(r"<li>\s*<h3>Te avisa y lo ves ordenado</h3>.*?</li>", "", t, count=1, flags=re.S)

        def seis_preguntas(t):
            return re.sub(r'\s*<details class="pregunta">\s*<summary>¿Hay versión para iPhone\?</summary>.*?</details>', "", t, count=1, flags=re.S)

        def dentro_del_recorrido(t):
            # Mete #como-funciona dentro de .layout-con-stage (antes del cierre de .secciones).
            m = re.search(r'    <section id="como-funciona".*?</section>\n', t, flags=re.S)
            sec = m.group(0)
            t = t.replace(sec, "", 1)
            return t.replace('    </div>\n    </div>\n', '    </div>\n' + sec + '    </div>\n', 1)

        casos = {
            "falta #como-funciona": (sin_seccion, "[portada]"),
            "solo 2 pasos": (dos_pasos, "[portada]"),
            "los pasos no son una <ol>": (lambda t: t.replace('<ol class="pasos-lista" role="list">', '<ul class="pasos-lista">', 1).replace("</ol>\n      </div>\n    </section>\n\n    <section id=\"preguntas\"", "</ul>\n      </div>\n    </section>\n\n    <section id=\"preguntas\"", 1), "[portada]"),
            "solo 6 preguntas": (seis_preguntas, "[portada]"),
            "#como-funciona dentro de .layout-con-stage": (dentro_del_recorrido, "[portada]"),
            "promesa absoluta en las preguntas": (lambda t: t.replace("<p>Hoy sí: durante la beta no se cobra nada", "<p>Nunca actúa a tus espaldas. Hoy sí: durante la beta no se cobra nada", 1), "[portada]"),
            "FAQPage con otra pregunta que las visibles": (lambda t: t.replace('"name": "¿Es gratis?"', '"name": "¿Cuesta algo?"', 1), "[portada]"),
            "FAQPage: respuesta distinta de la visible": (lambda t: t.replace('"text": "Todavía no: Yaruki', '"text": "No: Yaruki', 1), "[faq-visible]"),
            "tarjeta de «Lo que viene» sin chip": (lambda t: t.replace('<h3>Finanzas</h3>\n              <span class="chip">Próximamente</span>', '<h3>Finanzas</h3>', 1), "[portada]"),
            "«pronto» en Lo que viene": (lambda t: t.replace("Estamos trabajando en estilos", "Pronto habrá estilos", 1).replace("pronto habrá", "pronto habrá"), "[portada]"),
            "precio o Premium en Lo que viene": (lambda t: t.replace("Una versión para iPhone está planeada en serio", "Una versión Premium para iPhone está planeada en serio", 1), "[portada]"),
            "fecha en Lo que viene": (lambda t: t.replace("pero todavía no\n              tiene fecha.", "para diciembre.", 1), "[portada]"),
            "Finanzas sin la aclaración de bancos": (lambda t: t.replace("Sin conexión a tus bancos y\n              sin asesoría financiera: solo lo que tú le cuentas.", "Solo lo que tú le cuentas.", 1), "[portada]"),
            "Quién está detrás con correo personal": (lambda t: t.replace('<a href="/privacidad/">política de privacidad</a>.\n        </p>\n      </div>\n    </section>\n  </main>', '<a href="/privacidad/">política de privacidad</a>. <a href="mailto:yo@example.com">Escríbeme</a>.\n        </p>\n      </div>\n    </section>\n  </main>', 1), "[portada]"),
            "testimonio publicado": (lambda t: t.replace('  </main>', '    <blockquote>Me encantó.</blockquote>\n  </main>', 1), "[portada]"),
            "aviso de iPhone con la constante vacía": (lambda t: t.replace('Más en <a href="#lo-que-viene">Lo que viene</a>.', 'Más en <a href="#lo-que-viene">Lo que viene</a>. <a data-aviso-iphone href="https://groups.google.com/g/yaruki-iphone/">Avísame cuando salga</a>.', 1), "[portada]"),
            "sin FAQPage en la portada": (lambda t: re.sub(r',\n      \{\n        "@type": "FAQPage".*?\n        \]\n      \}', "", t, count=1, flags=re.S), "[portada]"),
        }
        for nombre, (f, regla) in casos.items():
            with self.subTest(nombre):
                self.nueva_copia()
                original = self.leer()
                nuevo = f(original)
                self.assertNotEqual(nuevo, original, f"el caso «{nombre}» no cambió nada")
                self.escribir(nuevo)
                r = self.validar()
                self.assertEqual(r.returncode, 1, f"no se detectó «{nombre}»:\n{r.stdout}")
                self.assertIn(regla, r.stdout, f"«{nombre}» debe fallar por {regla}:\n{r.stdout}")

    URL = "https://groups.google.com/g/yaruki-iphone/"
    ENLACE = f'<p class="aviso-iphone"><a data-aviso-iphone href="{URL}">Avísame cuando salga la versión para iPhone</a></p>'

    def con_url(self, url, enlace):
        cfg = self.raiz / "assets/js/config.js"
        cfg.write_text(cfg.read_text(encoding="utf-8").replace('IPHONE_AVISO_URL = "";', f'IPHONE_AVISO_URL = "{url}";'), encoding="utf-8")
        if enlace:
            self.mutar("Una versión para iPhone está planeada en serio, pero todavía no\n              tiene fecha.\n            </p>", "Una versión para iPhone está planeada en serio, pero todavía no\n              tiene fecha.\n            </p>\n            " + enlace)

    def test_aviso_iphone_ramas(self):
        # URL vacía y sin enlace: es el estado de hoy (lo cubre test_arbol_real_en_regla).
        casos = {
            "URL con valor y enlace igual en el HTML": (self.URL, self.ENLACE, 0, ""),
            "URL con valor pero el HTML no trae el enlace": (self.URL, None, 1, "[portada]"),
            "URL con valor y href distinto": (self.URL, self.ENLACE.replace("yaruki-iphone", "otro"), 1, "[portada]"),
            "URL que no es un Google Group": ("https://example.com/aviso", self.ENLACE.replace(self.URL, "https://example.com/aviso"), 1, "[portada]"),
        }
        for nombre, (url, enlace, codigo, regla) in casos.items():
            with self.subTest(nombre):
                self.nueva_copia()
                self.con_url(url, enlace)
                r = self.validar()
                self.assertEqual(r.returncode, codigo, f"«{nombre}»:\n{r.stdout}")
                if regla:
                    self.assertIn(regla, r.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
