"""Textos de la interfaz en español e inglés. build.py genera _locales/<idioma>/messages.json.

Usar $1, $2… para los valores que se insertan.
"""

MESSAGES = {
    # ---- manifiesto ----
    'extDesc': ('Bloquea publicidad, rastreadores y avisos molestos. Filtros actualizados automáticamente.',
                'Blocks ads, trackers and annoying notices. Filters update automatically.'),
    # ---- panel ----
    'toggleTitle': ('Activar o desactivar', 'Turn on or off'),
    'blockedOnPage': ('bloqueos en esta página', 'blocked on this page'),
    'internalPage': ('Página interna del navegador', 'Browser internal page'),
    'pauseSite': ('Pausar en este sitio', 'Pause on this site'),
    'pickElement': ('Eliminar un elemento de la página', 'Remove an element from the page'),
    'myRules': ('Mis reglas en este sitio', 'My rules on this site'),
    'removeRule': ('Quitar regla', 'Remove rule'),
    'filters': ('Filtros', 'Filters'),
    'updateNow': ('Actualizar ahora', 'Update now'),
    'usWarn': ('Para que también se actualicen los filtros de páginas y de YouTube, activá «Permitir scripts de usuario» en la configuración de la extensión.',
               'To also update page and YouTube filters, turn on “Allow User Scripts” in the extension’s settings.'),
    'openSettings': ('Abrir configuración', 'Open settings'),
    'rebuildWarn': ('Las listas cambiaron mucho desde que se instaló esta versión. Conviene instalar una versión nueva de la extensión.',
                    'The filter lists have changed a lot since this version was installed. Consider installing a newer version of the extension.'),
    'protection': ('Protección', 'Protection'),
    'ads': ('Publicidad', 'Ads'),
    'trackers': ('Rastreadores', 'Trackers'),
    'cookieNotices': ('Avisos de cookies', 'Cookie notices'),
    'regionalFilters': ('Filtros en español y portugués', 'Spanish & Portuguese filters'),
    'privacy': ('Privacidad', 'Privacy'),
    'cleanLinks': ('Limpiar links de rastreo', 'Clean tracking links'),
    'gpc': ('Pedir que no vendan mis datos', 'Ask sites not to sell my data'),
    'thirdPartyCookies': ('Bloquear cookies de terceros', 'Block third-party cookies'),
    'freeVersion': ('Versión gratuita', 'Free version'),
    'goPro': ('Pasate a Pro', 'Go Pro'),
    'license': ('Licencia', 'License'),
    'applyOnReload': ('Los cambios se aplican al recargar la página.', 'Changes apply when you reload the page.'),
    'applying': ('Aplicando…', 'Applying…'),
    'licensesSource': ('Licencias y código fuente', 'Licenses and source code'),
    'availablePro': ('Disponible en GRTS Pro', 'Available in GRTS Pro'),
    'today': ('hoy', 'today'),
    'yesterday': ('ayer', 'yesterday'),
    'daysAgo': ('hace $1 días', '$1 days ago'),
    'updatedWhen': ('Actualizados $1', 'Updated $1'),
    'notUpdated': ('Sin actualizar', 'Not updated yet'),
    'updating': ('Actualizando filtros…', 'Updating filters…'),
    'updateFailed': ('No se pudo actualizar: $1', 'Couldn’t update: $1'),
    'timeout': ('tiempo de espera agotado', 'timed out'),
    'downloadFailed': ('no se pudo descargar $1', 'couldn’t download $1'),
    # ---- opciones ----
    'optTitle': ('GRTS Blocker Pro · Licencia', 'GRTS Blocker Pro · License'),
    'proLicense': ('Licencia Pro', 'Pro license'),
    'withPro': ('Con GRTS Pro sumás:', 'GRTS Pro adds:'),
    'featCookies': ('Cierre automático de avisos de cookies', 'Automatic closing of cookie notices'),
    'featClean': ('Limpieza de links de rastreo', 'Cleaning of tracking links'),
    'featGpc': ('Señal «No vender mis datos» (Global Privacy Control)', '“Do not sell my data” signal (Global Privacy Control)'),
    'featCookies3p': ('Bloqueo de cookies de terceros', 'Third-party cookie blocking'),
    'featPicker': ('Eliminar cualquier elemento de una página con un clic', 'Remove any element from a page with one click'),
    'pasteLicense': ('Pegá tu licencia', 'Paste your license'),
    'activatePro': ('Activar Pro', 'Activate Pro'),
    'removeLicense': ('Quitar la licencia de este navegador', 'Remove the license from this browser'),
    'gplText': ('GRTS Blocker Pro es software libre, publicado bajo la Licencia Pública General de GNU, versión 3 (GPL-3.0). Podés usarlo, estudiarlo, modificarlo y compartirlo según esa licencia; el texto completo está en el archivo LICENSE incluido en la extensión.',
                'GRTS Blocker Pro is free software released under the GNU General Public License, version 3 (GPL-3.0). You may use, study, modify and share it under that license; the full text is in the LICENSE file included with the extension.'),
    'listsIntro': ('Los filtros se construyen a partir de estas listas públicas, a cuyos autores agradecemos su trabajo:',
                   'Filters are built from these public lists. Thanks to their authors:'),
    'colList': ('Lista', 'List'),
    'colLicense': ('Licencia', 'License'),
    'colSite': ('Sitio', 'Website'),
    'creditsUboBefore': ('Los scriptlets y los recursos de reemplazo (por ejemplo, los sustitutos de Google Analytics y Google Publisher Tag) están basados en los de',
                         'Scriptlets and replacement resources (for example, the Google Analytics and Google Publisher Tag substitutes) are based on those of'),
    'creditsUboAfter': ('(GPL-3.0), de Raymond Hill y colaboradores.', '(GPL-3.0), by Raymond Hill and contributors.'),
    'proActive': ('GRTS Pro está activo en este navegador.', 'GRTS Pro is active in this browser.'),
    'licensedTo': ('A nombre de $1 ($2)', 'Licensed to $1 ($2)'),
    'expiresOn': ('vence el $1', 'expires on $1'),
    'noExpiry': ('sin vencimiento', 'no expiration'),
    'expiredOn': ('Tu licencia venció el $1.', 'Your license expired on $1.'),
    'expiredHint': ('Renovala para volver a usar las funciones Pro. El bloqueo de publicidad y rastreadores sigue funcionando.',
                    'Renew it to use Pro features again. Ad and tracker blocking keeps working.'),
    'usingFree': ('Estás usando la versión gratuita.', 'You’re using the free version.'),
    'freeDesc': ('Bloquea publicidad y rastreadores, con filtros que se actualizan solos.',
                 'It blocks ads and trackers, with filters that update automatically.'),
    'verifying': ('Verificando…', 'Verifying…'),
    'activated': ('¡Listo! GRTS Pro quedó activado. Recargá las páginas abiertas.',
                  'Done! GRTS Pro is now active. Reload your open pages.'),
    'activateFailed': ('No se pudo activar.', 'Couldn’t activate.'),
    'licenseRemoved': ('Se quitó la licencia de este navegador.', 'The license was removed from this browser.'),
    'sourceCode': ('Código fuente:', 'Source code:'),
    'sourceOnRequest': ('El código fuente completo está disponible a pedido de cualquier usuario, según la GPL-3.0.',
                        'The complete source code is available to any user on request, under the GPL-3.0.'),
    'licenseInvalid': ('La licencia no es válida. Revisá que esté completa.', 'This license isn’t valid. Check that it’s complete.'),
    'licenseExpired': ('La licencia venció el $1.', 'This license expired on $1.'),
    # ---- selector de elementos ----
    'pickHint': ('Tocá el anuncio que querés eliminar · Esc para salir', 'Click the ad you want to remove · Esc to exit'),
    'pickBigger': ('Más grande', 'Larger'),
    'pickBlock': ('Bloquear', 'Block'),
    'pickCancel': ('Cancelar', 'Cancel'),
}


def messages_json(lang_index):
    out = {}
    for key, texts in MESSAGES.items():
        text = texts[lang_index]
        entry = {'message': text}
        n = 0
        while f'${n + 1}' in text:
            n += 1
        if n:
            for i in range(1, n + 1):
                entry['message'] = entry['message'].replace(f'${i}', f'$P{i}$')
            entry['placeholders'] = {f'p{i}': {'content': f'${i}'} for i in range(1, n + 1)}
        out[key] = entry
    return out
