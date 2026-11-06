#!/usr/bin/env python3
"""Sube el paquete de tienda a la Chrome Web Store y a Microsoft Edge Add-ons y lo manda a revisión.

Uso:  python3 build/tools/publicar_tiendas.py dist/GRTSBlockerPro-store.zip

Lo usa GitHub Actions todas las semanas. Las credenciales llegan como variables de entorno
(secrets del repositorio); si faltan las de una tienda, esa tienda se saltea con un aviso.

  Chrome:  CWS_PUBLISHER_ID      ID de editor (Chrome Web Store → Configuración)
           CWS_SERVICE_ACCOUNT   archivo JSON de la cuenta de servicio de Google Cloud, completo
  Edge:    EDGE_CLIENT_ID        Partner Center → Microsoft Edge → Publish API
           EDGE_API_KEY          ídem

Si la tienda todavía está revisando la versión anterior, no se envía nada (se reintenta la semana siguiente).
Sale con código 1 si alguna tienda falló, para que GitHub avise por mail.
"""
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

CHROME_ITEM_ID = 'jhkapbhoojfbajpmlbkmcjhoeljjjjkj'
EDGE_PRODUCT_ID = 'cc85e1c4-b2b3-4bf5-9f85-3580aab2c5af'

TEST_LICENSE = ('GRTS-eyJ2IjoxLCJuIjoiTWljcm9zb2Z0IEVkZ2UgQ2VydGlmaWNhdGlvbiIsImUiOiJlZGdlLXJldmlld0BncnRzLWJsb2NrZXIuYXBwIiwi'
                'cCI6InBybyIsImQiOiIyMDI2LTExLTAyIiwieCI6IjIwMjctMDMtMzEifQ.kr4Km37bf8bMompJjMreSGkUFjMFHy1QXW3Ltd-1FMOxunr1E1Cbi'
                'GjPNIytXXduh-tT0C4bGEti68yjFnlqDA')

EDGE_NOTES = f'''Automatic weekly update: the bundled filter lists (EasyList, EasyPrivacy, uBlock filters, AdGuard filters) were refreshed to their latest versions. No new permissions.

No account needed: ads and trackers are blocked on any website right after installing.
Pro features (cookie notices, link cleaning, third-party cookies, Global Privacy Control, element picker) unlock in the options page with this test license:
{TEST_LICENSE}

Source code: https://github.com/gastonfarq-bot/grts-blocker-pro'''


class Skip(Exception):
    """La tienda no puede recibir una versión ahora (por ejemplo, sigue revisando la anterior)."""


def http(method, url, headers=None, data=None, timeout=300):
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode('utf-8', 'replace')
            return r.status, dict(r.headers), body
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', 'replace')
        raise RuntimeError(f'{method} {url} → HTTP {e.code}: {body[:2000]}') from None


def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


# ---------------------------------------------------------------- Chrome Web Store (API v2)

def google_token(sa_json):
    """Token de acceso de la cuenta de servicio (JWT firmado con su clave, sin bibliotecas de Google)."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    sa = json.loads(sa_json)
    token_uri = sa.get('token_uri') or 'https://oauth2.googleapis.com/token'
    now = int(time.time())
    head = b64url(json.dumps({'alg': 'RS256', 'typ': 'JWT'}).encode())
    claims = b64url(json.dumps({'iss': sa['client_email'], 'scope': 'https://www.googleapis.com/auth/chromewebstore',
                                'aud': token_uri, 'iat': now, 'exp': now + 3600}).encode())
    key = serialization.load_pem_private_key(sa['private_key'].encode(), password=None)
    sig = key.sign(f'{head}.{claims}'.encode(), padding.PKCS1v15(), hashes.SHA256())
    jwt = f'{head}.{claims}.{b64url(sig)}'
    body = urllib.parse.urlencode({'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': jwt}).encode()
    _, _, resp = http('POST', token_uri, {'Content-Type': 'application/x-www-form-urlencoded'}, body)
    return json.loads(resp)['access_token']


def chrome(zip_bytes):
    publisher, sa = os.environ.get('CWS_PUBLISHER_ID'), os.environ.get('CWS_SERVICE_ACCOUNT')
    if not publisher or not sa:
        raise Skip('faltan los secrets CWS_PUBLISHER_ID / CWS_SERVICE_ACCOUNT')
    auth = {'Authorization': f'Bearer {google_token(sa)}'}
    name = f'publishers/{publisher}/items/{CHROME_ITEM_ID}'
    api = f'https://chromewebstore.googleapis.com/v2/{name}'

    status = lambda: json.loads(http('GET', f'{api}:fetchStatus', auth)[2])
    st = status()
    if st.get('takenDown'):
        raise RuntimeError('la tienda dio de baja la extensión; revisá la consola de Chrome')
    sub = (st.get('submittedItemRevisionStatus') or {}).get('state')
    if sub == 'PENDING_REVIEW':
        raise Skip(f'la versión anterior todavía está en revisión ({sub})')

    _, _, resp = http('POST', f'https://chromewebstore.googleapis.com/upload/v2/{name}:upload',
                      {**auth, 'Content-Type': 'application/zip'}, zip_bytes, timeout=600)
    up = json.loads(resp)
    state = up.get('uploadState')
    for _ in range(60):  # la subida puede procesarse en segundo plano
        if state not in ('IN_PROGRESS', 'UPLOAD_IN_PROGRESS'):
            break
        time.sleep(10)
        state = status().get('lastAsyncUploadState')
    if state != 'SUCCEEDED':
        raise RuntimeError(f'la subida terminó en {state}: {resp[:1000]}')
    print(f'  paquete subido (versión {up.get("crxVersion") or "?"})')

    _, _, resp = http('POST', f'{api}:publish', {**auth, 'Content-Type': 'application/json'}, b'{}')
    pub = json.loads(resp)
    for w in (pub.get('warningInfo') or {}).get('warnings', []):
        print(f'  aviso de la tienda: {w.get("reason")}: {w.get("description")}')
    if pub.get('state') not in ('PENDING_REVIEW', 'STAGED', 'PUBLISHED'):
        raise RuntimeError(f'no se pudo enviar a revisión: {resp[:1000]}')
    return f'enviada a revisión ({pub.get("state")})'


# ---------------------------------------------------------------- Microsoft Edge Add-ons (API v1.1)

def edge(zip_bytes):
    client, key = os.environ.get('EDGE_CLIENT_ID'), os.environ.get('EDGE_API_KEY')
    if not client or not key:
        raise Skip('faltan los secrets EDGE_CLIENT_ID / EDGE_API_KEY')
    auth = {'Authorization': f'ApiKey {key}', 'X-ClientID': client}
    base = f'https://api.addons.microsoftedge.microsoft.com/v1/products/{EDGE_PRODUCT_ID}/submissions'

    def wait(url):
        for _ in range(90):
            res = json.loads(http('GET', url, auth)[2])
            if res.get('status') != 'InProgress':
                return res
            time.sleep(10)
        raise RuntimeError(f'la operación no terminó a tiempo: {url}')

    op_id = lambda headers: (headers.get('Location') or headers.get('location') or '').rstrip('/').split('/')[-1]

    _, h, _ = http('POST', f'{base}/draft/package', {**auth, 'Content-Type': 'application/zip'}, zip_bytes, timeout=600)
    res = wait(f'{base}/draft/package/operations/{op_id(h)}')
    if res.get('status') != 'Succeeded':
        if res.get('errorCode') == 'InProgressSubmission':
            raise Skip('la versión anterior todavía está en revisión')
        raise RuntimeError(f'la subida falló: {json.dumps(res)[:1500]}')
    print('  paquete subido al borrador')

    _, h, _ = http('POST', base, {**auth, 'Content-Type': 'text/plain; charset=utf-8'}, EDGE_NOTES.encode())
    res = wait(f'{base}/operations/{op_id(h)}')
    if res.get('status') != 'Succeeded':
        code = res.get('errorCode')
        if code == 'InProgressSubmission':
            raise Skip('la versión anterior todavía está en revisión')
        if code == 'NoModulesUpdated':
            raise Skip('no hay cambios para publicar')
        raise RuntimeError(f'no se pudo enviar a revisión: {json.dumps(res)[:1500]}')
    return 'enviada a revisión'


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    zip_bytes = open(sys.argv[1], 'rb').read()
    failed = False
    for store, fn in (('Chrome Web Store', chrome), ('Microsoft Edge Add-ons', edge)):
        print(f'== {store}')
        try:
            print(f'  ✔ {fn(zip_bytes)}')
        except Skip as e:
            print(f'  ⏭ salteada: {e}')
            print(f'::warning title={store}::{e}')
        except Exception as e:  # noqa: BLE001
            failed = True
            print(f'  ✘ {e}')
            print(f'::error title={store}::{str(e)[:500]}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
