#!/usr/bin/env python3
"""Genera una clave de licencia GRTS Pro.

Uso:
  python3 generar_licencia.py --clave-privada clave.txt --nombre "Ana Pérez" --email ana@ejemplo.com [--vence 2027-12-31]

La clave privada NUNCA va en el repositorio ni dentro de la extensión.
También se puede pasar en la variable de entorno GRTS_PRIVATE_KEY (útil para automatizar ventas).
"""
import argparse
import base64
import datetime
import json
import os
import sys

from cryptography.hazmat.primitives import serialization


def b64url(b):
    return base64.urlsafe_b64encode(b).decode().rstrip('=')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--clave-privada', help='archivo con la clave privada (PKCS8 en base64)')
    ap.add_argument('--nombre', required=True)
    ap.add_argument('--email', required=True)
    ap.add_argument('--vence', help='AAAA-MM-DD; sin esto, la licencia no vence')
    a = ap.parse_args()

    raw = os.environ.get('GRTS_PRIVATE_KEY') or (open(a.clave_privada).read() if a.clave_privada else None)
    if not raw:
        sys.exit('Falta la clave privada (--clave-privada o GRTS_PRIVATE_KEY).')
    key = serialization.load_der_private_key(base64.b64decode(raw.strip()), password=None)

    info = {'v': 1, 'n': a.nombre, 'e': a.email, 'p': 'pro', 'd': datetime.date.today().isoformat()}
    if a.vence:
        datetime.date.fromisoformat(a.vence)
        info['x'] = a.vence
    data = json.dumps(info, separators=(',', ':'), ensure_ascii=False).encode()
    print('GRTS-' + b64url(data) + '.' + b64url(key.sign(data)))


if __name__ == '__main__':
    main()
