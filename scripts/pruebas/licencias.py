#!/usr/bin/env python3
"""Verifica las licencias de fuentes y librerías vendorizadas (issue #15).

Sólo biblioteca estándar. Uso:  python3 scripts/pruebas/licencias.py
Sale con código 1 si algo no coincide.

Los hashes son los de los OFL.txt canónicos de google/fonts
(commit 5bb28733cec313b63fbd415b574b5ae35c8aa8b8):
  ofl/baloo2/OFL.txt   blob de 8e0cd05 (último commit que lo toca)
  ofl/manrope/OFL.txt  blob de 16c2976 (último commit que lo toca)
"""
import hashlib
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parents[2]
FALLAS = []


def falla(msg):
    FALLAS.append(msg)
    print("FALLA:", msg)


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


FAMILIAS = {
    "baloo2": {
        "licencia": "OFL-Baloo2.txt",
        "sha256": "ad09b05dc8bc678c9daf7c4c5f7ef1f55e5726127f4330b2e98e40b9dffcb860",
        "copyright": "Copyright 2019 The Baloo 2 Project Authors (https://github.com/EkType/Baloo2)",
    },
    "manrope": {
        "licencia": "OFL-Manrope.txt",
        "sha256": "58172e0c0fac2cda8a37b348164bb55e44b0e69051e557e92b1d3f6910141f7b",
        "copyright": "Copyright 2018 The Manrope Project Authors (https://github.com/googlefonts/manrope)",
    },
}

for carpeta in ("assets/fonts", "assets/fuentes"):
    d = RAIZ / carpeta
    for fam, cfg in FAMILIAS.items():
        lic = d / cfg["licencia"]
        if not lic.exists():
            falla(f"{carpeta}: falta {cfg['licencia']}")
            continue
        if sha(lic) != cfg["sha256"]:
            falla(f"{carpeta}/{cfg['licencia']}: no es idéntico al OFL.txt canónico de {fam}")
        texto = lic.read_text(encoding="utf-8-sig")
        if texto.splitlines()[0] != cfg["copyright"]:
            falla(f"{carpeta}/{cfg['licencia']}: línea de copyright distinta")
        if re.search(r"with Reserved Font Name", texto, re.I):
            falla(f"{carpeta}/{cfg['licencia']}: declara Reserved Font Name; revisar subsetting")
    if (d / "OFL.txt").exists():
        falla(f"{carpeta}/OFL.txt genérico: debe haber un archivo por familia")
    for f in d.glob("*.woff2"):
        if not any(f.name.startswith(fam) for fam in FAMILIAS):
            falla(f"{f.name}: familia sin licencia registrada")

V = RAIZ / "assets/js/vendor"
gsap = (V / "LICENSE-GSAP.txt").read_text(encoding="utf-8")
for frase in (
    "Effective date: April 30, 2025",
    "Last modified date: May 30, 2025",
    "Copyright (©) 2025, Webflow",
    "constitutes your acceptance of this GSAP License as revised",
    "Terms of Service available here",
    "No Waiver:",
):
    if frase not in re.sub(r"\s+", " ", gsap).replace("\n", " "):
        falla(f"LICENSE-GSAP.txt: falta «{frase}» de la licencia oficial")
isc = (V / "LICENSE-canvas-confetti.txt").read_text(encoding="utf-8")
if "Copyright (c) 2020, Kiril Vatev" not in isc:
    falla("LICENSE-canvas-confetti.txt: falta el copyright de Kiril Vatev")
if sha(V / "gsap.min.js") != "92bb9a96476f983d212a2bc4f54c889039c1696dd4461d40a736860938570fbb":
    falla("gsap.min.js no es el de gsap@3.15.0 de npm")
if sha(V / "ScrollTrigger.min.js") != "b0b14d67b55b0c43c756ac0b106cfcb09d0879945f6ead64451065b0672916a2":
    falla("ScrollTrigger.min.js no es el de gsap@3.15.0 de npm")

# Íconos copiados (Lucide/Feather de IconosBento.kt y Material de material-icons-core): auditoría de la Fase 2.
iconos = RAIZ / "assets/js/LICENSE-iconos.txt"
if not iconos.exists():
    falla("assets/js/LICENSE-iconos.txt: falta la licencia de los íconos de las escenas")
else:
    t = iconos.read_text(encoding="utf-8")
    for frase in (
        "Copyright (c) 2026 Lucide Icons and Contributors",
        "Copyright (c) 2013-present Cole Bemis",
        "Copyright 2024 The Android Open Source Project",
        "Apache License",
        "TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION",
    ):
        if frase not in t:
            falla(f"LICENSE-iconos.txt: falta «{frase}»")
    js = (RAIZ / "assets/js/icons.js").read_text(encoding="utf-8")
    if "LICENSE-iconos.txt" not in js:
        falla("icons.js: el encabezado no remite a LICENSE-iconos.txt")

print("OK" if not FALLAS else f"{len(FALLAS)} falla(s)")
sys.exit(1 if FALLAS else 0)
