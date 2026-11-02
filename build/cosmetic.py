"""Filtros cosméticos (ocultar elementos) y scriptlets (neutralizar scripts de publicidad)."""
import json
import re

import soupsieve

from net import norm_host

PROC_ALIASES = [
    (':-abp-contains(', ':has-text('), (':contains(', ':has-text('), (':-abp-has(', ':has('),
    (':if-not(', ':not('), (':if(', ':has('), (':nth-ancestor(', ':upward('),
]
PROC_OPS = ('has-text', 'upward', 'xpath', 'matches-css', 'matches-attr', 'min-text-length',
            'matches-path', 'remove', 'style', 'remove-attr', 'remove-class', 'watch-attr')
UNSUPPORTED_PROC = ('matches-prop', 'others', 'matches-media', 'matches-css-before', 'matches-css-after',
                    'shadow', 'spath', '-abp-properties', 'properties', 'matches-property')

SCRIPTLET_ALIASES = {
    'set': 'set-constant', 'trusted-set-constant': 'set-constant', 'trusted-set': 'set-constant',
    'aopr': 'abort-on-property-read', 'aopw': 'abort-on-property-write',
    'acs': 'abort-current-script', 'acis': 'abort-current-inline-script',
    'abort-current-inline-script': 'abort-current-inline-script',
    'aost': 'abort-on-stack-trace',
    'prevent-fetch': 'prevent-fetch', 'no-fetch-if': 'no-fetch-if',
    'prevent-xhr': 'prevent-xhr', 'no-xhr-if': 'no-xhr-if',
    'nowoif': 'no-window-open-if', 'window.open-defuser': 'no-window-open-if',
    'prevent-window-open': 'prevent-window-open',
    'nostif': 'no-setTimeout-if', 'setTimeout-defuser': 'no-setTimeout-if', 'prevent-setTimeout': 'no-setTimeout-if',
    'nosiif': 'no-setInterval-if', 'setInterval-defuser': 'no-setInterval-if', 'prevent-setInterval': 'no-setInterval-if',
    'nano-stb': 'adjust-setTimeout', 'nano-setTimeout-booster': 'adjust-setTimeout',
    'nano-sib': 'adjust-setInterval', 'nano-setInterval-booster': 'adjust-setInterval',
    'aeld': 'prevent-addEventListener', 'addEventListener-defuser': 'prevent-addEventListener',
    'rpfr': 'trusted-replace-fetch-response', 'rpxr': 'trusted-replace-xhr-response',
    'ra': 'remove-attr', 'rc': 'remove-class',
    'cookie-remover': 'remove-cookie',
    'rmnt': 'remove-node-text', 'rpnt': 'replace-node-text', 'trusted-rpnt': 'replace-node-text',
    'trusted-replace-node-text': 'replace-node-text',
    'noeval': 'prevent-eval-if', 'noeval-if': 'prevent-eval-if',
    'trusted-set-session-storage-item': 'set-session-storage-item',
    'trusted-set-local-storage-item': 'set-local-storage-item',
    'trusted-set-cookie': 'set-cookie', 'trusted-click-element': 'click-element',
    'popads-dummy': 'popads-dummy', 'nowebrtc': 'nowebrtc', 'prevent-refresh': 'prevent-refresh',
    'refresh-defuser': 'prevent-refresh',
}
SUPPORTED_SCRIPTLETS = {
    'set-constant', 'abort-on-property-read', 'abort-on-property-write', 'abort-current-script',
    'abort-current-inline-script', 'abort-on-stack-trace', 'prevent-fetch', 'no-fetch-if', 'prevent-xhr',
    'no-xhr-if', 'no-window-open-if', 'prevent-window-open', 'no-setTimeout-if', 'no-setInterval-if',
    'adjust-setTimeout', 'adjust-setInterval', 'prevent-addEventListener', 'json-prune',
    'json-prune-fetch-response', 'json-prune-xhr-response', 'trusted-replace-fetch-response',
    'trusted-replace-xhr-response', 'remove-attr', 'remove-class', 'set-cookie', 'remove-cookie',
    'set-local-storage-item', 'set-session-storage-item', 'click-element', 'remove-node-text',
    'replace-node-text', 'prevent-element-src-loading', 'nowebrtc', 'prevent-eval-if',
    'href-sanitizer', 'popads-dummy', 'prevent-refresh',
}


def canon_scriptlet(name):
    n = name.strip().strip('\'"')
    if n.startswith('ubo-'):
        n = n[4:]
    if n.endswith('.js'):
        n = n[:-3]
    n = SCRIPTLET_ALIASES.get(n, n)
    return n


def split_args(s):
    """Separa argumentos al estilo uBO/AdGuard: comas, comillas y escapes \\,"""
    args, i, n = [], 0, len(s)
    while i <= n:
        while i < n and s[i] == ' ':
            i += 1
        if i < n and s[i] in '\'"`':
            q = s[i]
            j = i + 1
            buf = ''
            while j < n:
                if s[j] == '\\' and j + 1 < n and s[j + 1] in (q, '\\'):
                    buf += s[j + 1]
                    j += 2
                    continue
                if s[j] == q:
                    break
                buf += s[j]
                j += 1
            k = j + 1
            while k < n and s[k] == ' ':
                k += 1
            if k >= n or s[k] == ',':
                args.append(buf)
                i = k + 1
                if k >= n:
                    break
                continue
            # comilla no cerrada como argumento completo: tratar como texto plano
        j = i
        buf = ''
        while j < n:
            if s[j] == '\\' and j + 1 < n and s[j + 1] == ',':
                buf += ','
                j += 2
                continue
            if s[j] == ',':
                break
            buf += s[j]
            j += 1
        args.append(buf.strip())
        i = j + 1
        if j >= n:
            break
    return args


def css_ok(sel):
    if not sel or len(sel) > 2000 or '{' in sel or '}' in sel:
        return False
    try:
        soupsieve.compile(sel)
        return True
    except Exception:
        return False


def balanced(s):
    depth, q, esc = 0, None, False
    for ch in s:
        if esc:
            esc = False
            continue
        if ch == '\\':
            esc = True
            continue
        if q:
            if ch == q:
                q = None
            continue
        if ch in '"\'':
            q = ch
        elif ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth < 0:
                return False
    return depth == 0


def classify_selector(sel):
    """Devuelve ('css', sel) | ('proc', sel) | ('style', sel, decl) | None"""
    sel = sel.strip()
    for a, b in PROC_ALIASES:
        sel = sel.replace(a, b)
    if any(':' + u + '(' in sel for u in UNSUPPORTED_PROC):
        return None
    if re.search(r':(%s)\(' % '|'.join(re.escape(o) for o in PROC_OPS), sel) or \
            re.search(r':(has|not)\([^)]*:(%s)\(' % '|'.join(re.escape(o) for o in PROC_OPS), sel):
        if not balanced(sel):
            return None
        m = re.match(r'^(.*):style\((.*)\)$', sel)
        if m and css_ok(m.group(1)) and 'url(' not in m.group(2):
            return ('style', m.group(1), m.group(2))
        return ('proc', sel)
    if css_ok(sel):
        return ('css', sel)
    return None


class Cosmetic:
    def __init__(self):
        self.generic = set()
        self.generic_unhide = set()     # #@#sel sin dominio: anula el genérico
        self.hosts = {}                 # host -> dict
        self.stats = {'skipped': 0}

    def _h(self, host):
        return self.hosts.setdefault(host, {'h': set(), 'x': set(), 'p': [], 'c': [], 's': [], 'sx': set(), 'gx': set()})

    def _domains(self, part):
        inc, exc = [], []
        for d in part.split(','):
            d = d.strip()
            if not d:
                continue
            neg = d.startswith('~')
            d = d[1:] if neg else d
            if d.endswith('.*'):
                base = norm_host(d[:-2] + '.x')
                h = base[:-2] + '.*' if base else None
            else:
                h = norm_host(d)
            if h:
                (exc if neg else inc).append(h)
        return inc, exc

    def add(self, line):
        m = re.match(r'^([^#]*?)(#@?(?:\$\?|\$|%|\?)?#)(.*)$', line)
        if not m:
            return
        doms, sep, body = m.groups()
        if '[' in doms or '/' in doms:  # dominios con regex / modificadores AdGuard
            return self._skip()
        inc, exc = self._domains(doms) if doms else ([], [])
        if doms and not inc and not exc:
            return self._skip()
        unhide = '@' in sep
        kind = sep.replace('@', '')

        # --- scriptlets ---
        if kind == '##' and body.startswith('+js('):
            if not body.endswith(')'):
                return self._skip()
            return self._scriptlet(inc, exc, split_args(body[4:-1]), unhide)
        if kind == '#%#':
            if not body.startswith('//scriptlet(') or not body.endswith(')'):
                return self._skip()  # JavaScript arbitrario de AdGuard: no se ejecuta
            return self._scriptlet(inc, exc, split_args(body[12:-1]), unhide)
        if kind == '##' and body.startswith('^'):
            return self._skip()  # filtrado HTML: no disponible en Chrome MV3

        # --- inyección CSS AdGuard ---
        if kind in ('#$#', '#$?#'):
            mm = re.match(r'^(.*?)\s*\{(.*)\}\s*$', body)
            if not mm:
                return self._skip()
            sel, decl = mm.group(1).strip(), mm.group(2).strip()
            if re.match(r'^remove\s*:\s*true;?$', decl):
                body = sel + ':remove()'
            elif re.match(r'^display\s*:\s*none\s*(!important)?;?$', decl):
                body = sel
            else:
                if 'url(' in decl or not inc:
                    return self._skip()
                c = classify_selector(sel)
                if not c:
                    return self._skip()
                if c[0] == 'css':
                    for h in inc:
                        if not unhide:
                            self._h(h)['c'].append(f'{sel}{{{decl}}}')
                    return
                body = sel + ':style(' + decl + ')'

        c = classify_selector(body)
        if not c:
            return self._skip()

        if not inc:  # genérico
            if unhide:
                if c[0] == 'css':
                    self.generic_unhide.add(c[1])
                return
            if c[0] != 'css':
                return self._skip()  # procedimentales genéricos: demasiado costosos
            self.generic.add(c[1])
            for h in exc:
                self._h(h)['gx'].add(c[1])
            return

        for h in inc:
            e = self._h(h)
            if c[0] == 'css':
                (e['x'] if unhide else e['h']).add(c[1])
            elif unhide:
                e['x'].add(body)
            elif c[0] == 'proc':
                e['p'].append(c[1])
            elif c[0] == 'style':
                e['c'].append(f'{c[1]}{{{c[2]}}}')
        for h in exc:
            if c[0] == 'css':
                self._h(h)['x'].add(c[1])
            else:
                self._h(h)['x'].add(body)

    def _scriptlet(self, inc, exc, args, unhide):
        if not args or not args[0]:
            if unhide:
                for h in inc:
                    self._h(h)['sx'].add('*')
            return
        name = canon_scriptlet(args[0])
        if name not in SUPPORTED_SCRIPTLETS:
            return self._skip()
        sig = [name] + args[1:]
        if unhide:
            for h in inc:
                self._h(h)['sx'].add(json.dumps(sig, separators=(',', ':'), ensure_ascii=False))
            return
        if not inc:
            return self._skip()  # scriptlets genéricos: se omiten por seguridad
        for h in inc:
            e = self._h(h)
            if sig not in e['s']:
                e['s'].append(sig)
        for h in exc:
            self._h(h)['sx'].add(json.dumps(sig, separators=(',', ':'), ensure_ascii=False))

    def _skip(self):
        self.stats['skipped'] += 1
