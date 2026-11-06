#!/usr/bin/env python3
"""Construye la extensión GRTS Blocker Pro a partir de las listas de filtros públicas.

Uso:  python3 build.py [carpeta_listas] [carpeta_salida]

Genera tres variantes en la carpeta de salida:
  GRTSBlockerPro-chrome   instalación directa en Chrome/Edge/Brave/Opera (actualización completa)
  GRTSBlockerPro-store    para las tiendas de Chrome, Edge y Opera (sin scripts de usuario)
  GRTSBlockerPro-firefox  para Firefox (escritorio y Android)
"""
import json
import os
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from net import Network, norm_host  # noqa: E402
from cosmetic import Cosmetic  # noqa: E402
from privacy_extras import EXTRAS  # noqa: E402
from i18n_messages import messages_json  # noqa: E402

LISTS_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'lists'
DIST = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE.parent / 'dist'
OUT = DIST / '_core'
VERSION = '2.2.0'
# En GitHub Actions se agrega el número de compilación como cuarto número (2.2.0.57):
# las tiendas exigen que cada paquete nuevo tenga una versión mayor que la anterior.
if os.environ.get('GRTS_BUILD', '').isdigit():
    VERSION = VERSION + '.' + str(int(os.environ['GRTS_BUILD']))
NAME = 'GRTS Blocker Pro'
GECKO_ID = 'grts-blocker-pro@grts-blocker.app'

# archivo, ruleset de red (la única fuente de verdad es src/lists.json)
LIST_INFO = json.loads((HERE / 'src' / 'lists.json').read_text(encoding='utf-8'))
LISTS = [(l['file'], l['ruleset']) for l in LIST_INFO]
RULESET_PARTS = {}  # categoría -> nombres de los archivos de reglas

# Variables para las directivas !#if de uBO / AdGuard
ENV = {
    'env_chromium': True, 'env_mv3': True, 'env_edge': False, 'env_firefox': False, 'env_safari': False,
    'env_mobile': False, 'env_legacy': False, 'cap_html_filtering': False, 'cap_user_stylesheet': True,
    'cap_ipaddress': False, 'ext_ublock': True, 'ext_ubol': True, 'ext_devbuild': False, 'ext_abp': False,
    'adguard': True, 'adguard_ext_chromium': True, 'adguard_ext_chromium_mv3': True, 'adguard_ext_firefox': False,
    'adguard_ext_edge': False, 'adguard_ext_safari': False, 'adguard_ext_opera': False, 'adguard_ext_android_cb': False,
    'adguard_app_windows': False, 'adguard_app_mac': False, 'adguard_app_android': False, 'adguard_app_ios': False,
    'adguard_app_cli': False, 'false': False, 'true': True,
}


def eval_cond(expr):
    expr = expr.strip()
    py = re.sub(r'[A-Za-z_][A-Za-z0-9_]*', lambda m: str(ENV.get(m.group(0), False)), expr)
    py = py.replace('&&', ' and ').replace('||', ' or ').replace('!', ' not ')
    try:
        return bool(eval(py, {'__builtins__': {}}, {}))
    except Exception:
        return False


def read_list(path):
    stack = []
    for raw in path.read_text(encoding='utf-8', errors='ignore').splitlines():
        line = raw.strip()
        if line.startswith('!#if'):
            stack.append(eval_cond(line[4:]))
            continue
        if line.startswith('!#else'):
            if stack:
                stack[-1] = not stack[-1]
            continue
        if line.startswith('!#endif'):
            if stack:
                stack.pop()
            continue
        if stack and not all(stack):
            continue
        if not line or line[0] == '!' or line.startswith('[Adblock') or line.startswith('# '):
            continue
        yield line


COSMETIC_RE = re.compile(r'^([^/|@$^\s]*?)(#@?(?:\$\?|\$|%|\?)?#)')


def make_manifest(target):
    perms = ['declarativeNetRequest', 'declarativeNetRequestFeedback', 'scripting', 'storage', 'tabs',
             'alarms', 'unlimitedStorage']
    if target != 'firefox':
        perms.append('offscreen')       # el actualizador corre en un documento offscreen
    if target == 'chrome':
        perms.append('userScripts')     # actualización completa de filtros de página (instalación directa)
    m = {
        'manifest_version': 3,
        'name': NAME,
        'description': '__MSG_extDesc__',
        'default_locale': 'en',
        'version': VERSION,
        'permissions': perms,
        'host_permissions': ['<all_urls>'],
        'action': {'default_popup': 'popup.html', 'default_title': NAME,
                   'default_icon': {'16': 'icons/16.png', '32': 'icons/32.png', '48': 'icons/48.png'}},
        'icons': {'16': 'icons/16.png', '48': 'icons/48.png', '128': 'icons/128.png'},
        'options_ui': {'page': 'options.html', 'open_in_tab': True},
        'declarative_net_request': {'rule_resources': [
            {'id': rs, 'enabled': True, 'path': f'rules/{rs}.json'}
            for rs in [p for c in ('ads', 'privacy', 'annoyances', 'regional') for p in RULESET_PARTS[c]] + list(EXTRAS)]},
        'web_accessible_resources': [{'resources': ['res/*'], 'matches': ['<all_urls>']}],
    }
    if target == 'firefox':
        m['background'] = {'scripts': ['background.js'], 'type': 'module'}
        m['browser_specific_settings'] = {
            'gecko': {'id': GECKO_ID, 'strict_min_version': '140.0',
                      'data_collection_permissions': {'required': ['none']}},
            'gecko_android': {'strict_min_version': '142.0'},
        }
    else:
        m['background'] = {'service_worker': 'background.js', 'type': 'module'}
        m['minimum_chrome_version'] = '137'  # firmas Ed25519 para las licencias
    return m


def main():
    net, cos = Network(), Cosmetic()

    # 1) primero los $badfilter, que anulan reglas de cualquier lista
    for fname, _ in LISTS:
        p = LISTS_DIR / fname
        for line in read_list(p):
            if '$badfilter' in line or ',badfilter' in line:
                net.add(line, 'x')

    counts = {}
    for fname, ruleset in LISTS:
        p = LISTS_DIR / fname
        n = 0
        for line in read_list(p):
            n += 1
            if COSMETIC_RE.match(line):
                cos.add(line)
            else:
                net.add(line, ruleset)
        counts[fname] = n

    rulesets = net.finalize()

    # ---- aplicar $generichide / $elemhide / $specifichide ----
    for h in net.elemhide:
        e = cos._h(h)
        e['h'].clear(); e['p'].clear(); e['c'].clear()
        e['gh'] = 1
    for h in net.generichide:
        cos._h(h)['gh'] = 1
    for h in net.specifichide:
        e = cos._h(h)
        e['h'].clear(); e['p'].clear()

    generic = sorted(s for s in cos.generic if s not in cos.generic_unhide)

    # ---- preparar salida ----
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / 'rules').mkdir(parents=True)
    (OUT / 'cosmetic').mkdir()
    (OUT / 'scriptlets').mkdir()
    shutil.copytree(HERE / 'src' / 'res', OUT / 'res')
    for f in ('background.js', 'popup.html', 'popup.js', 'picker.js', 'youtube.js', 'updater.html', 'updater.js', 'gpc.js',
              'options.html', 'options.js', 'lists.json'):
        shutil.copy(HERE / 'src' / f, OUT / f)
    shutil.copytree(HERE / 'src' / 'lib', OUT / 'lib')
    shutil.copy(HERE / 'src' / 'engine.js', OUT / 'cosmetic' / 'engine.js')

    # Cada lista se parte en archivos de hasta ~4 MB (Firefox no acepta archivos de más de 5 MB).
    # Las partes se llaman ads, ads-2, ads-3…; los IDs de regla son propios de cada parte.
    total_rules = 0
    parts_of = {}
    for rs in ('ads', 'privacy', 'annoyances', 'regional'):
        rules = rulesets.get(rs, [])
        total_rules += len(rules)
        parts, cur, size = [], [], 0
        for r in rules:
            r = {k: v for k, v in r.items() if k != 'id'}
            n = len(json.dumps(r, separators=(',', ':')))
            if cur and size + n > 4_000_000:
                parts.append(cur); cur, size = [], 0
            cur.append(r); size += n
        parts.append(cur)
        names = []
        for i, part in enumerate(parts):
            name = rs if i == 0 else f'{rs}-{i + 1}'
            for j, r in enumerate(part, 1):
                r['id'] = j
            (OUT / 'rules' / f'{name}.json').write_text(json.dumps(part, separators=(',', ':')))
            names.append(name)
        parts_of[rs] = names
    RULESET_PARTS.clear()
    RULESET_PARTS.update(parts_of)
    for rs, fn in EXTRAS.items():
        (OUT / 'rules' / f'{rs}.json').write_text(json.dumps(fn(), separators=(',', ':')))

    # Hoja genérica (en grupos de 10: un selector inválido sólo anula su grupo)
    css = ''.join(','.join(generic[i:i + 10]) + '{display:none!important}\n' for i in range(0, len(generic), 10))
    (OUT / 'cosmetic' / 'generic.css').write_text(css)
    (OUT / 'cosmetic' / 'generic.json').write_text(json.dumps(generic, separators=(',', ':')))

    # ---- datos por sitio ----
    cos_data, sl_data = {}, {}
    excluded_generic = set()
    for h, e in cos.hosts.items():
        entry = {}
        hide = sorted(e['h'] - e['x'])
        if hide:
            entry['h'] = hide
        if e['x']:
            entry['x'] = sorted(e['x'])
        if e['p']:
            entry['p'] = sorted(set(e['p']))
        if e['c']:
            entry['c'] = sorted(set(e['c']))
        gx = sorted(e['gx'] | (e['x'] & set(generic)))
        if gx:
            entry['gx'] = gx
        if e.get('gh'):
            entry['gh'] = 1
        if (gx or e.get('gh')) and not h.endswith('.*'):
            excluded_generic.add(h)
        if entry:
            cos_data[h] = entry
        if e['s'] or e['sx']:
            s_entry = {}
            if e['s']:
                s_entry['s'] = e['s']
            if e['sx']:
                s_entry['x'] = sorted(e['sx'])
            sl_data[h] = s_entry

    plan = [
        {'id': 'engine', 'js': ['cosmetic/engine.js'], 'matches': ['http://*/*', 'https://*/*']},
        {'id': 'generic', 'css': ['cosmetic/generic.css'], 'matches': ['http://*/*', 'https://*/*'],
         'excludeMatches': sorted(f'*://*.{h}/*' for h in excluded_generic)},
        {'id': 'youtube', 'js': ['youtube.js'], 'matches': ['*://*.youtube.com/*'], 'keep': True},
        {'id': 'gpc', 'js': ['gpc.js'], 'world': 'MAIN', 'matches': ['http://*/*', 'https://*/*'], 'keep': True, 'cat': 'gpc'},
    ]

    lib = (HERE / 'src' / 'scriptlets.js').read_text()
    (OUT / 'scriptlets' / 'lib.js').write_text(lib)

    def write_chunks(data, prefix, folder, world, render):
        entity = {k: v for k, v in data.items() if k.endswith('.*')}
        normal = sorted(k for k in data if not k.endswith('.*'))
        chunks = [normal[i:i + 250] for i in range(0, len(normal), 250)]
        for idx, keys in enumerate(chunks):
            fname = f'{folder}/{prefix}{idx}.js'
            (OUT / fname).write_text(render({k: data[k] for k in keys}))
            plan.append({'id': f'{prefix}{idx}', 'js': [fname], 'world': world,
                         'matches': [f'*://*.{k}/*' for k in keys]})
        if entity:
            fname = f'{folder}/{prefix}ent.js'
            (OUT / fname).write_text(render(entity))
            plan.append({'id': f'{prefix}ent', 'js': [fname], 'world': world, 'matches': ['http://*/*', 'https://*/*']})
        return len(chunks) + (1 if entity else 0)

    def render_cos(d):
        return '(globalThis.__mbq||(globalThis.__mbq=[])).push(' + json.dumps(d, separators=(',', ':'), ensure_ascii=False) + ');\n'

    def render_sl(d):
        return ("(()=>{'use strict';\n"
                "const DATA=" + json.dumps(d, separators=(',', ':'), ensure_ascii=False) + ";\n"
                "const h=(location.hostname||(()=>{try{return new URL(location.ancestorOrigins[0]).hostname}catch{return''}})()).toLowerCase();\n"
                "if(!h)return;const L=h.split('.');const K=[];\n"
                "for(let i=0;i<L.length;i++){K.push(L.slice(i).join('.'));for(let j=i+1;j<L.length;j++)K.push(L.slice(i,j).join('.')+'.*');}\n"
                "const run=[],ex=new Set();\n"
                "for(const k of K){const e=DATA[k];if(!e)continue;if(e.s)run.push(...e.s);if(e.x)for(const x of e.x)ex.add(x);}\n"
                "if(!run.length||ex.has('*'))return;\n"
                + lib +
                "\nconst done=new Set();\n"
                "for(const s of run){const sig=JSON.stringify(s);if(ex.has(sig)||done.has(sig))continue;done.add(sig);\n"
                "const f=S[s[0]];if(typeof f==='function'){try{f(...s.slice(1));}catch(e){}}}\n"
                "})();\n")

    n_cos = write_chunks(cos_data, 'c', 'cosmetic', 'ISOLATED', render_cos)
    n_sl = write_chunks(sl_data, 's', 'scriptlets', 'MAIN', render_sl)
    (OUT / 'scripts.json').write_text(json.dumps(plan, separators=(',', ':')))

    shutil.copytree(HERE / 'src' / 'icons', OUT / 'icons')
    shutil.copy(HERE.parent / 'LICENSE', OUT / 'LICENSE')
    shutil.copy(HERE.parent / 'CREDITS.md', OUT / 'CREDITS.md')
    for idx, lang in enumerate(('es', 'en')):
        (OUT / '_locales' / lang).mkdir(parents=True)
        (OUT / '_locales' / lang / 'messages.json').write_text(
            json.dumps(messages_json(idx), indent=1, ensure_ascii=False), encoding='utf-8')

    # ---- variantes por navegador ----
    built_at = int(__import__('time').time() * 1000)
    for target in ('chrome', 'store', 'firefox'):
        dest = DIST / f'GRTSBlockerPro-{target}'
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(OUT, dest)
        (dest / 'meta.json').write_text(json.dumps({'version': VERSION, 'built': built_at, 'target': target,
                                                    'rulesets': RULESET_PARTS}))
        (dest / 'manifest.json').write_text(json.dumps(make_manifest(target), indent=2, ensure_ascii=False))
        if target == 'firefox':
            for f in ('updater.html', 'updater.js'):
                (dest / f).unlink()
    shutil.rmtree(OUT)

    stats = {
        'reglas_de_red': total_rules,
        'dominios_bloqueados': sum(len(r['condition'].get('requestDomains', [])) for rs in rulesets.values() for r in rs),
        'por_ruleset': {k: len(v) for k, v in rulesets.items()},
        'regex': net.regex_count,
        'selectores_genericos': len(generic),
        'sitios_con_filtros_cosmeticos': len(cos_data),
        'sitios_con_scriptlets': len(sl_data),
        'fragmentos': {'cosmeticos': n_cos, 'scriptlets': n_sl},
        'filtros_red_omitidos': net.skipped,
        'filtros_cosmeticos_omitidos': cos.stats['skipped'],
        'lineas_por_lista': counts,
    }
    print(json.dumps(stats, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
