#!/usr/bin/env python3
"""Descarga las listas de filtros definidas en src/lists.json a build/lists/."""
import json
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
OUT = HERE / 'lists'
OUT.mkdir(exist_ok=True)

for item in json.loads((HERE / 'src' / 'lists.json').read_text(encoding='utf-8')):
    for intento in range(3):
        try:
            with urllib.request.urlopen(item['url'], timeout=60) as r:
                data = r.read()
            if len(data) < 1000:
                raise ValueError('respuesta demasiado corta')
            (OUT / item['file']).write_bytes(data)
            print(f"ok  {item['file']}  {len(data) // 1024} KB")
            break
        except Exception as e:  # noqa: BLE001
            if intento == 2:
                sys.exit(f"No se pudo descargar {item['file']}: {e}")
            time.sleep(5 * (intento + 1))
