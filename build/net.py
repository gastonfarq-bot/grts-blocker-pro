"""Conversión de filtros de red (sintaxis ABP / uBO / AdGuard) a reglas declarativeNetRequest."""
import re

try:
    import re2
except ImportError:  # pragma: no cover
    re2 = None

TYPE_MAP = {
    'script': ['script'], 'image': ['image'], 'stylesheet': ['stylesheet'], 'css': ['stylesheet'],
    'object': ['object'], 'xmlhttprequest': ['xmlhttprequest'], 'xhr': ['xmlhttprequest'],
    'subdocument': ['sub_frame'], 'frame': ['sub_frame'], 'ping': ['ping'], 'beacon': ['ping'],
    'media': ['media'], 'font': ['font'], 'websocket': ['websocket'], 'other': ['other'],
    'document': ['main_frame'], 'doc': ['main_frame'],
    'object-subrequest': ['object'], 'webrtc': ['webtransport'],
}
ALL_TYPES = ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
             'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'webtransport',
             'webbundle', 'other']
DEFAULT_TYPES = [t for t in ALL_TYPES if t != 'main_frame']

# Opciones que no cambian el sentido de la regla y se ignoran
IGNORED = {'stealth', 'cookie', 'third-party-strict', 'reason', 'network', 'extension',
           'content', 'jsinject', 'urlblock', 'genericblock', 'empty-response'}
# Opciones que DNR no puede representar: la regla se descarta
UNSUPPORTED = {'popup', 'popunder', 'urlskip', 'replace', 'cname', 'header', 'permissions',
               'rewrite', 'uritransform', 'removeheader', 'redirect-rule', 'inline-script',
               'inline-font', 'app', 'jsonprune', 'hls', 'referrerpolicy', 'ipaddress', 'xmlprune',
               'to'}

ASCII = re.compile(r'^[\x20-\x7e]*$')
HOST_OK = re.compile(r'^[a-z0-9.\-_]+$')


def norm_host(h):
    h = h.strip().lower().rstrip('.')
    if not h:
        return None
    if not ASCII.match(h):
        try:
            h = h.encode('idna').decode()
        except Exception:
            return None
    if h.endswith('.*'):
        return None  # entidades (google.*) no existen en DNR
    if not HOST_OK.match(h) or '..' in h or h.startswith('.'):
        return None
    return h


def split_domains(value, sep='|'):
    inc, exc = [], []
    for d in value.split(sep):
        d = d.strip()
        if not d:
            continue
        neg = d.startswith('~')
        h = norm_host(d[1:] if neg else d)
        if h is None:
            continue
        (exc if neg else inc).append(h)
    return inc, exc


class Network:
    def __init__(self):
        self.rules = []          # (key, rule_without_id)
        self.seen = set()
        self.badfilters = set()
        self.generichide = set()   # hosts con $generichide
        self.elemhide = set()      # hosts con $elemhide
        self.specifichide = set()
        self.domain_groups = {}    # key -> set(dominios) para fusionar ||dominio^
        self.regex_count = 0
        self.skipped = 0
        self.redirects = set()

    # ------------------------------------------------------------------
    def add(self, line, ruleset):
        raw = line
        if line in self.badfilters:
            return self._skip()
        if line.endswith('$badfilter') or ',badfilter' in line.split('$')[-1]:
            self.badfilters.add(re.sub(r'(\$|,)badfilter', '', line).replace('$,', '$').rstrip('$'))
            return
        allow = line.startswith('@@')
        if allow:
            line = line[2:]
        pattern, opts = line, ''
        if line.startswith('/') and re.search(r'/(\$[^/]*)?$', line) and len(line) > 2:
            m = re.match(r'^(/.*/)(\$([^/]+))?$', line)
            if m:
                pattern, opts = m.group(1), m.group(3) or ''
        elif '$' in line:
            idx = line.rfind('$')
            # evita confundir $ dentro de la URL con el separador de opciones
            if re.match(r'^[~a-zA-Z0-9_\-]+(=|,|$)', line[idx + 1:]):
                pattern, opts = line[:idx], line[idx + 1:]
        self._convert(raw, pattern, opts, allow, ruleset)

    def _convert(self, raw, pattern, opts, allow, ruleset):
        cond = {}
        types, ex_types = set(), set()
        party = None
        important = False
        match_case = False
        action = {'type': 'allow' if allow else 'block'}
        special = None
        for o in [x.strip() for x in self._split_opts(opts)]:
            if not o:
                continue
            name, _, val = o.partition('=')
            neg = name.startswith('~')
            if neg:
                name = name[1:]
            name = name.lower()
            if name in TYPE_MAP:
                (ex_types if neg else types).update(TYPE_MAP[name])
            elif name == 'all':
                types.update(ALL_TYPES)
            elif name in ('third-party', '3p', 'strict3p', 'strict-third-party'):
                party = 'firstParty' if neg else 'thirdParty'
            elif name in ('first-party', '1p', 'strict1p', 'strict-first-party'):
                party = 'thirdParty' if neg else 'firstParty'
            elif name in ('domain', 'from'):
                inc, exc = split_domains(val)
                raw_inc = [d for d in val.split('|') if d.strip() and not d.strip().startswith('~')]
                if raw_inc and not inc:
                    return self._skip()  # sólo entidades no soportadas: no ampliar el alcance
                if not inc and not exc:
                    return self._skip()
                if inc:
                    cond['initiatorDomains'] = inc
                if exc:
                    cond['excludedInitiatorDomains'] = exc
            elif name == 'denyallow':
                inc, _ = split_domains(val)
                if inc:
                    cond['excludedRequestDomains'] = inc
            elif name == 'important':
                important = True
            elif name == 'match-case':
                match_case = True
            elif name == 'method':
                ms = [m.lower() for m in val.split('|') if m and not m.startswith('~')]
                if ms:
                    cond['requestMethods'] = ms
            elif name in ('redirect', 'empty', 'mp4'):
                if allow:
                    return self._skip()
                special = ('redirect', val or ('noopmp4' if name == 'mp4' else 'nooptext'))
            elif name == 'removeparam':
                if allow or not val or val.startswith('/') or val.startswith('~') or '|' in val:
                    return self._skip()
                special = ('removeparam', val)
            elif name == 'csp':
                if allow or not val:
                    return self._skip()
                special = ('csp', val)
            elif name in ('generichide', 'ghide', 'elemhide', 'ehide', 'specifichide', 'shide'):
                if not allow:
                    return
                host = self._host_from_pattern(pattern)
                if not host:
                    return
                if name in ('generichide', 'ghide'):
                    self.generichide.add(host)
                elif name in ('specifichide', 'shide'):
                    self.specifichide.add(host)
                else:
                    self.elemhide.add(host)
                return
            elif name in IGNORED:
                continue
            elif name in UNSUPPORTED:
                return self._skip()
            else:
                return self._skip()

        # --- patrón ---
        if pattern.startswith('/') and pattern.endswith('/') and len(pattern) > 2:
            rx = pattern[1:-1]
            if not self._regex_ok(rx):
                return self._skip()
            cond['regexFilter'] = rx
            self.regex_count += 1
        else:
            uf = pattern
            if not ASCII.match(uf):
                m = re.match(r'^(\|\|)([^/^:*]+)(.*)$', uf)
                if not m:
                    return self._skip()
                h = norm_host(m.group(2))
                if not h or not ASCII.match(m.group(3)):
                    return self._skip()
                uf = '||' + h + m.group(3)
            if uf.startswith('||*'):
                uf = uf[2:]
            while uf.startswith('*'):
                uf = uf[1:]
            while uf.endswith('*') and not uf.endswith('|*'):
                uf = uf[:-1]
            if uf in ('', '|', '||'):
                uf = ''
            if uf.startswith('|') and not uf.startswith('||') and len(uf) > 1 and uf[1] == '*':
                uf = uf[2:]
            if uf:
                if not match_case:
                    uf = uf.lower()
                cond['urlFilter'] = uf
            elif not cond.get('initiatorDomains') and not special and not types:
                return self._skip()  # bloquearía todo
            if match_case:
                cond['isUrlFilterCaseSensitive'] = True

        if party:
            cond['domainType'] = party
        if types:
            types -= ex_types
            if not types:
                return self._skip()
            cond['resourceTypes'] = sorted(types)
        elif ex_types:
            cond['excludedResourceTypes'] = sorted(ex_types)
        priority = 1
        if allow:
            priority = 2
            if 'main_frame' in cond.get('resourceTypes', []) and len(cond['resourceTypes']) <= 2:
                # @@||sitio^$document -> pausa total en ese sitio
                action = {'type': 'allowAllRequests'}
                cond['resourceTypes'] = ['main_frame', 'sub_frame']
                priority = 3
        if important and not allow:
            priority = 4

        if special:
            kind, val = special
            if kind == 'redirect':
                res = self._redirect_resource(val, cond)
                if not res:
                    return self._skip()
                action = {'type': 'redirect', 'redirect': {'extensionPath': '/res/' + res}}
                priority = max(priority, 2)
            elif kind == 'removeparam':
                action = {'type': 'redirect', 'redirect': {'transform': {'queryTransform': {'removeParams': [val]}}}}
                if 'resourceTypes' not in cond:
                    cond['resourceTypes'] = ['main_frame', 'sub_frame', 'xmlhttprequest']
                cond.pop('excludedResourceTypes', None)
                priority = 1
            elif kind == 'csp':
                action = {'type': 'modifyHeaders', 'responseHeaders': [
                    {'header': 'Content-Security-Policy', 'operation': 'append', 'value': val}]}
                cond['resourceTypes'] = ['main_frame', 'sub_frame']
                cond.pop('excludedResourceTypes', None)

        # Fusión: ||dominio^ simple sin otras condiciones -> requestDomains compartido
        uf = cond.get('urlFilter', '')
        m = re.match(r'^\|\|([a-z0-9.\-_]+)\^\|?$', uf)
        simple_keys = set(cond) - {'urlFilter', 'domainType', 'resourceTypes', 'excludedResourceTypes'}
        if m and not simple_keys and action['type'] in ('block', 'allow'):
            gkey = (ruleset, action['type'], priority, cond.get('domainType'),
                    tuple(cond.get('resourceTypes', [])), tuple(cond.get('excludedResourceTypes', [])))
            self.domain_groups.setdefault(gkey, set()).add(m.group(1))
            return
        rule = {'priority': priority, 'action': action, 'condition': cond}
        key = repr(rule)
        if key in self.seen:
            return
        self.seen.add(key)
        self.rules.append((ruleset, rule))

    # ------------------------------------------------------------------
    @staticmethod
    def _split_opts(opts):
        out, buf, esc = [], '', False
        for ch in opts:
            if esc:
                buf += ch
                esc = False
            elif ch == '\\':
                buf += ch
                esc = True
            elif ch == ',':
                out.append(buf)
                buf = ''
            else:
                buf += ch
        out.append(buf)
        return out

    def _skip(self):
        self.skipped += 1

    @staticmethod
    def _host_from_pattern(p):
        m = re.match(r'^\|\|([^/^*]+)\^?$', p) or re.match(r'^\|?https?://([^/^*]+)', p)
        return norm_host(m.group(1)) if m else None

    def _regex_ok(self, rx):
        if self.regex_count >= 900 or re2 is None or not ASCII.match(rx):
            return False
        if re.search(r'\(\?[=!<]|\\[1-9]|\\d\{|\(\?i\)', rx):
            return False
        try:
            opts = re2.Options()
            opts.max_mem = 2 * 1024  # el límite de Chrome es ~2KB por regex
            r = re2.compile(rx, opts)
            return True
        except Exception:
            return False

    REDIRECTS = {
        'noopjs': 'noop.js', 'noop.js': 'noop.js', 'nooptext': 'noop.txt', 'noop.txt': 'noop.txt',
        'noopcss': 'noop.css', 'noop.css': 'noop.css', 'noopframe': 'noop.html', 'noop.html': 'noop.html',
        '1x1.gif': '1x1.gif', '1x1-transparent.gif': '1x1.gif', '2x2.png': '1x1.gif', '2x2-transparent.png': '1x1.gif',
        '3x2.png': '1x1.gif', '3x2-transparent.png': '1x1.gif', '32x32.png': '1x1.gif', '32x32-transparent.png': '1x1.gif',
        'noopmp3-0.1s': 'noop.mp3', 'noop-0.1s.mp3': 'noop.mp3', 'noopmp4-1s': 'noop.mp4', 'noop-1s.mp4': 'noop.mp4',
        'noopmp4': 'noop.mp4', 'noop-vmap1.0.xml': 'noop-vmap.xml', 'noopvmap-1.0': 'noop-vmap.xml',
        'noop-vast2.xml': 'noop-vast.xml', 'noopvast-2.0': 'noop-vast.xml', 'noop-vast3.xml': 'noop-vast.xml',
        'noopvast-3.0': 'noop-vast.xml', 'noop-vast4.xml': 'noop-vast.xml', 'noopvast-4.0': 'noop-vast.xml',
        'noopjson': 'noop.json', 'noop.json': 'noop.json', 'empty': 'noop.txt', 'blank-text': 'noop.txt',
        'blank-css': 'noop.css', 'blank-js': 'noop.js', 'blank-html': 'noop.html', 'blank-mp3': 'noop.mp3',
        'blank-mp4': 'noop.mp4', 'noopframe.html': 'noop.html', 'click2load.html': 'noop.html',
        'google-analytics.com/analytics.js': 'ga.js', 'google-analytics_analytics.js': 'ga.js',
        'googletagmanager.com/gtm.js': 'gtm.js', 'googletagmanager_gtm.js': 'gtm.js',
        'google-analytics.com/ga.js': 'ga.js', 'google-analytics_ga.js': 'ga.js',
        'googletagservices.com/gpt.js': 'gpt.js', 'googletagservices_gpt.js': 'gpt.js',
        'googlesyndication.com/adsbygoogle.js': 'adsbygoogle.js', 'googlesyndication_adsbygoogle.js': 'adsbygoogle.js',
        'google-analytics-ga': 'ga.js', 'google-analytics-ua': 'ga.js', 'googletagmanager-gtm': 'gtm.js',
        'googletagservices-gpt': 'gpt.js', 'googlesyndication-adsbygoogle': 'adsbygoogle.js',
        'scorecardresearch.com/beacon.js': 'noop.js', 'scorecardresearch_beacon.js': 'noop.js',
        'outbrain-widget.js': 'noop.js', 'amazon_apstag.js': 'apstag.js', 'amazon-apstag': 'apstag.js',
        'doubleclick.net/instream/ad_status.js': 'noop.js', 'doubleclick_instream_ad_status.js': 'noop.js',
        'ampproject.org/v0.js': 'noop.js', 'ampproject_v0.js': 'noop.js', 'google-ima.js': 'noop.js',
        'google-ima3': 'noop.js', 'fingerprint2.js': 'noop.js', 'fingerprint3.js': 'noop.js',
        'prebid-ads.js': 'prebid-ads.js', 'prebid': 'noop.js', 'nobab.js': 'noop.js', 'nobab2.js': 'noop.js',
        'nofab.js': 'noop.js', 'popads.js': 'noop.js', 'popads-dummy.js': 'noop.js', 'noeval.js': 'noop.js',
        'noeval-silent.js': 'noop.js', 'hd-main.js': 'noop.js', 'fuckadblock.js-3.2.0': 'noop.js',
        'ligatus_angular-tag.js': 'noop.js', 'nitropay_ads.js': 'noop.js', 'sensors-analytics': 'noop.js',
        'matomo': 'noop.js', 'metrika-yandex-watch': 'noop.js', 'metrika-yandex-tag': 'noop.js',
        'scorecardresearch-beacon': 'noop.js', 'naver-wcslog': 'noop.js', 'gemius': 'noop.js',
        'ati-smarttag': 'noop.js', 'prevent-bab': 'noop.js', 'prevent-fab-3.2.0': 'noop.js',
        'prevent-popads-net': 'noop.js', 'amazon-apstag.js': 'apstag.js', 'noopcss.css': 'noop.css',
    }

    def _redirect_resource(self, val, cond):
        name = val.split(':')[0].strip()
        res = self.REDIRECTS.get(name)
        if res:
            self.redirects.add(res)
        return res

    # ------------------------------------------------------------------
    def finalize(self):
        """Aplica $badfilter, arma reglas fusionadas y asigna IDs por ruleset."""
        out = {}
        for gkey, domains in self.domain_groups.items():
            ruleset, atype, priority, party, rtypes, ex_types = gkey
            doms = sorted(domains)
            # no fusionar dominios marcados con badfilter
            doms = [d for d in doms if f'||{d}^' not in self.badfilters]
            for i in range(0, len(doms), 5000):
                cond = {'requestDomains': doms[i:i + 5000]}
                if party:
                    cond['domainType'] = party
                if rtypes:
                    cond['resourceTypes'] = list(rtypes)
                if ex_types:
                    cond['excludedResourceTypes'] = list(ex_types)
                out.setdefault(ruleset, []).append({'priority': priority, 'action': {'type': atype}, 'condition': cond})
        for ruleset, rule in self.rules:
            out.setdefault(ruleset, []).append(rule)
        for ruleset, rules in out.items():
            for i, r in enumerate(rules, 1):
                r['id'] = i
        return out
