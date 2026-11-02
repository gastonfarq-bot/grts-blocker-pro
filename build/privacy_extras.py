"""Reglas de privacidad propias: limpieza de links, señal GPC y cookies de terceros."""

# Parámetros que sólo sirven para rastrear de dónde venís
TRACKING_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'utm_name',
    'utm_cid', 'utm_reader', 'utm_referrer', 'utm_social', 'utm_social-type', 'utm_brand', 'utm_place',
    'utm_pubreferrer', 'utm_swu', 'utm_viz_id', 'utm_source_platform', 'utm_creative_format',
    'utm_marketing_tactic',
    'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'twclid', 'ttclid',
    'li_fat_id', 'igshid', 'igsh', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi', 'mkt_tok', 'oly_anon_id',
    'oly_enc_id', 'vero_id', 'vero_conv', 'rb_clickid', 's_cid', '_openstat', 'srsltid', 'epik',
    'ScCid', 'wickedid', 'irclickid', 'ef_id', '__hssc', '__hstc', '__hsfp', 'hsCtaTracking',
    '_branch_match_id', 'mtm_campaign', 'mtm_source', 'mtm_medium', 'pk_campaign', 'pk_source', 'pk_medium',
]

# Servicios de inicio de sesión, pagos y captchas que necesitan cookies dentro de otros sitios
COOKIE_EXCEPTIONS = [
    'accounts.google.com', 'accounts.youtube.com', 'recaptcha.net', 'hcaptcha.com',
    'challenges.cloudflare.com', 'login.microsoftonline.com', 'login.live.com', 'appleid.apple.com',
    'paypal.com', 'stripe.com', 'stripe.network', 'mercadopago.com', 'mercadopago.com.ar',
    'mercadolibre.com', 'mercadolibre.com.ar', 'mercadolivre.com.br', 'cardinalcommerce.com',
    'disqus.com', 'okta.com', 'auth0.com',
]

SUB_TYPES = ['sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest',
             'ping', 'csp_report', 'media', 'websocket', 'webtransport', 'webbundle', 'other']

# Prioridad 3: le gana a las excepciones genéricas de las listas (2), pero no a la pausa por sitio (100)
P = 3


def clean_rules():
    # Una regla por parámetro (sin expresiones regulares, que Chrome limita en tamaño).
    # Cada regla quita todos los parámetros de una vez, así hay una sola redirección.
    action = {'type': 'redirect', 'redirect': {'transform': {'queryTransform': {'removeParams': TRACKING_PARAMS}}}}
    rules = []
    for prm in TRACKING_PARAMS:
        for sep in ('?', '&'):
            rules.append({'id': len(rules) + 1, 'priority': P, 'action': action,
                          'condition': {'urlFilter': f'{sep}{prm}=', 'isUrlFilterCaseSensitive': True,
                                        'resourceTypes': ['main_frame', 'sub_frame']}})
    return rules


def gpc_rules():
    return [{
        'id': 1, 'priority': P,
        'action': {'type': 'modifyHeaders', 'requestHeaders': [{'header': 'Sec-GPC', 'operation': 'set', 'value': '1'}]},
        'condition': {'resourceTypes': ['main_frame'] + SUB_TYPES},
    }]


def cookie_rules():
    return [
        {
            'id': 1, 'priority': P,
            'action': {'type': 'modifyHeaders',
                       'requestHeaders': [{'header': 'cookie', 'operation': 'remove'}],
                       'responseHeaders': [{'header': 'set-cookie', 'operation': 'remove'}]},
            'condition': {'domainType': 'thirdParty', 'resourceTypes': SUB_TYPES,
                          'excludedRequestDomains': COOKIE_EXCEPTIONS},
        },
        # reCAPTCHA de Google vive en google.com: se le permiten sus cookies para que los captchas sigan andando
        {'id': 2, 'priority': P + 1, 'action': {'type': 'allow'},
         'condition': {'urlFilter': '||google.com/recaptcha/', 'domainType': 'thirdParty'}},
        {'id': 3, 'priority': P + 1, 'action': {'type': 'allow'},
         'condition': {'urlFilter': '||gstatic.com/recaptcha/', 'domainType': 'thirdParty'}},
    ]


EXTRAS = {'clean': clean_rules, 'gpc': gpc_rules, 'cookies': cookie_rules}
