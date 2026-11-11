#!/usr/bin/env python3
"""Pruebas de scripts/indexnow.py (solo biblioteca estandar; nunca toca la red de internet).

Uso:  python3 -I scripts/pruebas/test_indexnow.py
Trabajan sobre un repo git temporal con una copia del sitio. El envio real se prueba contra un
servidor local en 127.0.0.1 (--endpoint), nunca contra api.indexnow.org.
"""
import http.server
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest

RAIZ = pathlib.Path(__file__).resolve().parent.parent.parent
SCRIPT = RAIZ / "scripts" / "indexnow.py"
ORIGEN = json.loads((RAIZ / "scripts/sitio.json").read_text())["origen"]
IGNORAR = shutil.ignore_patterns(".git", "node_modules")


def git(cwd, *a):
    subprocess.run(["git", "-C", str(cwd), "-c", "user.name=t", "-c", "user.email=t@t", *a], check=True, capture_output=True)


def correr(raiz, *args):
    return subprocess.run([sys.executable, "-I", str(SCRIPT), "--raiz", str(raiz), *args], capture_output=True, text=True)


class Base(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.addCleanup(self._t.cleanup)
        self.raiz = pathlib.Path(self._t.name) / "s"
        shutil.copytree(RAIZ, self.raiz, ignore=IGNORAR)
        git(self.raiz, "init", "-q")
        git(self.raiz, "add", "-A")
        git(self.raiz, "commit", "-qm", "base")

    def cambiar(self, ruta, viejo, nuevo):
        p = self.raiz / ruta
        p.write_text(p.read_text(encoding="utf-8").replace(viejo, nuevo, 1), encoding="utf-8")


class Simulacion(Base):
    def test_el_archivo_de_clave_cumple_el_protocolo(self):
        claves = [p for p in RAIZ.glob("*.txt") if p.name != "robots.txt"]
        self.assertEqual(len(claves), 1, claves)
        clave = claves[0].stem
        self.assertRegex(clave, r"^[A-Za-z0-9-]{8,128}$")
        self.assertEqual(claves[0].read_bytes().decode("utf-8"), clave, "el contenido debe ser exactamente la clave")

    def test_solo_avisa_de_las_paginas_cuyo_contenido_cambio(self):
        self.cambiar("privacidad/index.html", "<h1>Política de privacidad</h1>", "<h1>Política de privacidad (nueva)</h1>")
        git(self.raiz, "commit", "-qam", "cambio")
        r = correr(self.raiz, "--desde", "HEAD~1")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn(f"{ORIGEN}/privacidad/", r.stdout)
        self.assertNotIn(f"{ORIGEN}/terminos/", r.stdout)
        self.assertIn("SIMULACIÓN", r.stdout)

    def test_sin_cambios_no_hay_nada_que_avisar(self):
        git(self.raiz, "commit", "-q", "--allow-empty", "-m", "vacio")
        r = correr(self.raiz, "--desde", "HEAD~1")
        self.assertEqual(r.returncode, 0)
        self.assertIn("Nada que avisar", r.stdout)

    def test_urls_explicitas_deben_ser_del_host(self):
        r = correr(self.raiz, "--urls", f"{ORIGEN}/", "https://otro.example/x")
        self.assertEqual(r.returncode, 2)
        self.assertIn("otro.example", r.stderr)

    def test_urls_explicitas_ok_y_usa_el_dominio_central(self):
        r = correr(self.raiz, "--urls", f"{ORIGEN}/", f"{ORIGEN}/terminos/")
        self.assertEqual(r.returncode, 0, r.stderr)
        cuerpo = json.loads(re.search(r"(\{.*\})", r.stdout, re.S).group(1))
        self.assertEqual(cuerpo["host"], ORIGEN.split("//")[1])
        self.assertEqual(cuerpo["keyLocation"], f"{ORIGEN}/{cuerpo['key']}.txt")
        self.assertEqual(cuerpo["urlList"], [f"{ORIGEN}/", f"{ORIGEN}/terminos/"])

    def test_cambia_el_dominio_y_el_aviso_lo_sigue(self):
        subprocess.run([sys.executable, "-I", str(RAIZ / "scripts/dominio.py"), "--raiz", str(self.raiz), "--origen", "https://yaruki.app"], check=True, capture_output=True)
        r = correr(self.raiz, "--urls", "https://yaruki.app/")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('"host": "yaruki.app"', r.stdout)

    def test_por_defecto_nunca_envia(self):
        r = correr(self.raiz, "--urls", f"{ORIGEN}/", "--endpoint", "http://127.0.0.1:1/indexnow")
        self.assertEqual(r.returncode, 0, "sin --enviar no debe intentar conectarse")


class Envio(Base):
    def test_enviar_hace_un_post_json_al_endpoint(self):
        recibido = {}

        class H(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                recibido["ruta"] = self.path
                recibido["tipo"] = self.headers.get("Content-Type")
                recibido["cuerpo"] = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                self.send_response(200)
                self.end_headers()

            def log_message(self, *a):
                pass

        srv = http.server.HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        r = correr(self.raiz, "--urls", f"{ORIGEN}/", "--enviar", "--sin-verificar", "--endpoint", f"http://127.0.0.1:{srv.server_port}/indexnow")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(recibido["ruta"], "/indexnow")
        self.assertEqual(recibido["tipo"], "application/json; charset=utf-8")
        self.assertEqual(recibido["cuerpo"]["urlList"], [f"{ORIGEN}/"])
        self.assertIn("200", r.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
