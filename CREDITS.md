# Créditos y licencias

GRTS Blocker Pro es software libre bajo la **GNU General Public License v3.0** (ver `LICENSE`).

## Listas de filtros

Las reglas de bloqueo se generan a partir de estas listas públicas. Cada una conserva su licencia original.

| Lista | Autores | Licencia |
|---|---|---|
| EasyList | The EasyList authors — https://easylist.to | GPL-3.0 / CC BY-SA 3.0 |
| EasyPrivacy | The EasyList authors — https://easylist.to | GPL-3.0 / CC BY-SA 3.0 |
| uBlock filters (Ads, Quick fixes, Unbreak, Privacy, Cookie notices) | Raymond Hill y colaboradores — https://github.com/uBlockOrigin/uAssets | GPL-3.0 |
| AdGuard Base filter | AdGuard — https://github.com/AdguardTeam/AdguardFilters | GPL-3.0 |
| AdGuard DNS filter | AdGuard — https://github.com/AdguardTeam/AdguardSDNSFilter | GPL-3.0 |
| AdGuard Spanish/Portuguese filter | AdGuard — https://github.com/AdguardTeam/AdguardFilters | GPL-3.0 |

Las listas se descargan sin modificar su contenido; GRTS las convierte al formato de reglas del navegador.

## Código de terceros

- Los scriptlets (`src/scriptlets.js`) y los recursos de reemplazo (`src/res/`: sustitutos de Google Analytics,
  Google Tag Manager, Google Publisher Tag, AdSense y Amazon apstag) están basados en los de
  **uBlock Origin** — Raymond Hill y colaboradores — https://github.com/gorhill/uBlock — GPL-3.0.
- La sintaxis de filtros sigue las convenciones de Adblock Plus, uBlock Origin y AdGuard.
