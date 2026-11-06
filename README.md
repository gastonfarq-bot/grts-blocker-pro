# GRTS Blocker Pro

Bloqueador de publicidad, rastreadores y avisos molestos para Chrome, Edge, Brave, Opera y Firefox.
Software libre bajo **GPL-3.0** (ver `LICENSE` y `CREDITS.md`).

## Qué incluye

| Función | Gratis | Pro |
|---|:-:|:-:|
| Bloqueo de publicidad (EasyList, uBlock, AdGuard, AdGuard DNS: ~240.000 dominios) | ✓ | ✓ |
| Bloqueo de rastreadores (EasyPrivacy, uBlock Privacy) | ✓ | ✓ |
| Filtros por sitio y anti-anuncios de YouTube | ✓ | ✓ |
| Filtros en español y portugués | ✓ | ✓ |
| Actualización automática de filtros | ✓ | ✓ |
| Contador, pausa por sitio, interruptor general | ✓ | ✓ |
| Cierre automático de avisos de cookies | | ✓ |
| Limpieza de links de rastreo (utm_, fbclid, gclid…) | | ✓ |
| Señal «No vender mis datos» (Global Privacy Control) | | ✓ |
| Bloqueo de cookies de terceros | | ✓ |
| Eliminar cualquier elemento de una página | | ✓ |

## Variantes

`python build/build.py` genera tres carpetas en `dist/`:

| Carpeta | Para qué | Actualización de filtros |
|---|---|---|
| `GRTSBlockerPro-chrome` | Instalación directa («Cargar descomprimida») en Chrome, Edge, Brave, Opera | Completa cada 3 días (red + filtros de página, con «Permitir scripts de usuario») |
| `GRTSBlockerPro-store` | Chrome Web Store, Edge Add-ons, Opera Add-ons | Red cada 3 días; filtros de página con cada versión nueva |
| `GRTSBlockerPro-firefox` | addons.mozilla.org (Firefox 140+ escritorio, 142+ Android) | Red cada 3 días; filtros de página con cada versión nueva |

La compilación automática (`.github/workflows/build.yml`) arma las tres variantes todos los lunes con
las listas del día y las publica como *release* del repositorio.

## Compilar a mano

```
pip install google-re2 soupsieve beautifulsoup4 cryptography
python build/tools/descargar_listas.py
python build/build.py
```

## Licencias Pro

Las licencias son claves firmadas (Ed25519) que la extensión verifica sin conectarse a ningún servidor.

- **Clave privada:** se guarda fuera del repositorio. Quien la tenga puede emitir licencias.
- **Emitir una licencia:** abrir `build/tools/generador-de-licencias.html` en el navegador, pegar la clave
  privada, completar nombre y email (y vencimiento si es una suscripción).
  También desde la línea de comandos: `python build/tools/generar_licencia.py --clave-privada clave.txt --nombre "…" --email …`
- **Activar:** el cliente pega la licencia en la página de opciones de la extensión.
- Para cambiar de par de claves, reemplazar `PUBLIC_KEY` en `build/src/lib/license.js`
  (las licencias emitidas con la clave anterior dejan de valer).

Como el código es GPL, cualquiera puede compilar una versión sin la verificación: lo que se vende es la
comodidad, las actualizaciones y el soporte, como hacen AdGuard y otros productos de código abierto.

## Publicar en las tiendas

1. **Código fuente público** (obligatorio por la GPL al distribuir): subir este repositorio a GitHub como
   público (https://github.com/gastonfarq-bot/grts-blocker-pro) — ya configurado en `build/src/options.js`.
2. **Política de privacidad**: GRTS no recopila ni envía datos personales. Las tiendas piden un enlace
   público con ese texto.
3. **Chrome Web Store** (registro único de 5 USD): subir `GRTSBlockerPro-store.zip`.
   Justificar permisos: `declarativeNetRequest` (bloqueo), `scripting` (filtros de página),
   `offscreen` (convertir listas descargadas), `<all_urls>` (bloquear en todos los sitios).
4. **Edge Add-ons** (gratis): el mismo zip de la variante `store`.
5. **Opera Add-ons**: el mismo zip.
6. **Firefox (AMO)** (gratis): subir `GRTSBlockerPro-firefox.zip`. El validador puede avisar «coin miner» en
   `rules/*.json`: son dominios de minería que la lista **bloquea**; explicarlo en las notas para el revisor.
   Cambiar `GECKO_ID` en `build/build.py` por uno propio antes del primer envío.
7. **Cobrar**: las tiendas de extensiones no procesan pagos. Vender la licencia por Mercado Pago, Stripe,
   Lemon Squeezy o Gumroad y enviarla al cliente (se puede automatizar con `generar_licencia.py`).

### Publicación automática (Chrome y Edge)

Todos los lunes, GitHub Actions compila con las listas del día y sube `GRTSBlockerPro-store.zip` a las dos
tiendas con `build/tools/publicar_tiendas.py` (también a mano: Actions → *Run workflow* → «Subir a las tiendas»).
La versión lleva como cuarto número el de la compilación (por ejemplo `2.2.0.57`), porque las tiendas exigen
que cada paquete sea mayor que el anterior. Si una tienda todavía está revisando la versión anterior, esa
semana se saltea. Si algo falla, GitHub avisa por mail.

Secrets necesarios (Settings → Secrets and variables → Actions):

| Secret | De dónde sale |
|---|---|
| `CWS_PUBLISHER_ID` | Chrome Web Store → Configuración → ID de editor |
| `CWS_SERVICE_ACCOUNT` | Google Cloud: cuenta de servicio con la «Chrome Web Store API» habilitada; pegar su clave JSON completa. Su email se agrega en Chrome Web Store → Cuenta |
| `EDGE_CLIENT_ID` | Partner Center → Microsoft Edge → Publish API → Create API credentials |
| `EDGE_API_KEY` | ídem (la clave vence: renovarla antes de la fecha que muestra Partner Center) |

Si faltan los secrets de una tienda, esa tienda se saltea sin error.

## iPhone y Mac

Próxima etapa: app con extensión de Safari (reutiliza esta extensión) y protección para todo el teléfono
por DNS. Se compila en la nube con GitHub Actions (máquinas macOS), sin necesidad de tener una Mac.
Requiere cuenta de Apple Developer (99 USD/año).
