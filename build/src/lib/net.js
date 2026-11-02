// Conversión de filtros de red a reglas declarativeNetRequest.
// Port 1:1 de build/net.py: ambos deben producir exactamente las mismas reglas.

const TYPE_MAP = {
  script: ['script'], image: ['image'], stylesheet: ['stylesheet'], css: ['stylesheet'],
  object: ['object'], xmlhttprequest: ['xmlhttprequest'], xhr: ['xmlhttprequest'],
  subdocument: ['sub_frame'], frame: ['sub_frame'], ping: ['ping'], beacon: ['ping'],
  media: ['media'], font: ['font'], websocket: ['websocket'], other: ['other'],
  document: ['main_frame'], doc: ['main_frame'],
  'object-subrequest': ['object'], webrtc: ['webtransport'],
};
const ALL_TYPES = ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
  'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'webtransport', 'webbundle', 'other'];
const IGNORED = new Set(['stealth', 'cookie', 'third-party-strict', 'reason', 'network', 'extension',
  'content', 'jsinject', 'urlblock', 'genericblock', 'empty-response']);

const ASCII = /^[\x20-\x7e]*$/;
const HOST_OK = /^[a-z0-9.\-_]+$/;

export function normHost(h) {
  h = h.trim().toLowerCase().replace(/\.+$/, '');
  if (!h) return null;
  if (!ASCII.test(h)) {
    try { h = new URL('http://' + h).hostname; } catch { return null; }
  }
  if (h.endsWith('.*')) return null;
  if (!HOST_OK.test(h) || h.includes('..') || h.startsWith('.')) return null;
  return h;
}

function splitDomains(value) {
  const inc = [], exc = [];
  for (let d of value.split('|')) {
    d = d.trim();
    if (!d) continue;
    const neg = d.startsWith('~');
    const h = normHost(neg ? d.slice(1) : d);
    if (h === null) continue;
    (neg ? exc : inc).push(h);
  }
  return [inc, exc];
}

function splitOpts(opts) {
  const out = [];
  let buf = '', esc = false;
  for (const ch of opts) {
    if (esc) { buf += ch; esc = false; }
    else if (ch === '\\') { buf += ch; esc = true; }
    else if (ch === ',') { out.push(buf); buf = ''; }
    else buf += ch;
  }
  out.push(buf);
  return out;
}

const REDIRECTS = {
  noopjs: 'noop.js', 'noop.js': 'noop.js', nooptext: 'noop.txt', 'noop.txt': 'noop.txt',
  noopcss: 'noop.css', 'noop.css': 'noop.css', noopframe: 'noop.html', 'noop.html': 'noop.html',
  '1x1.gif': '1x1.gif', '1x1-transparent.gif': '1x1.gif', '2x2.png': '1x1.gif', '2x2-transparent.png': '1x1.gif',
  '3x2.png': '1x1.gif', '3x2-transparent.png': '1x1.gif', '32x32.png': '1x1.gif', '32x32-transparent.png': '1x1.gif',
  'noopmp3-0.1s': 'noop.mp3', 'noop-0.1s.mp3': 'noop.mp3', 'noopmp4-1s': 'noop.mp4', 'noop-1s.mp4': 'noop.mp4',
  noopmp4: 'noop.mp4', 'noop-vmap1.0.xml': 'noop-vmap.xml', 'noopvmap-1.0': 'noop-vmap.xml',
  'noop-vast2.xml': 'noop-vast.xml', 'noopvast-2.0': 'noop-vast.xml', 'noop-vast3.xml': 'noop-vast.xml',
  'noopvast-3.0': 'noop-vast.xml', 'noop-vast4.xml': 'noop-vast.xml', 'noopvast-4.0': 'noop-vast.xml',
  noopjson: 'noop.json', 'noop.json': 'noop.json', empty: 'noop.txt', 'blank-text': 'noop.txt',
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
  'prebid-ads.js': 'prebid-ads.js', prebid: 'noop.js', 'nobab.js': 'noop.js', 'nobab2.js': 'noop.js',
  'nofab.js': 'noop.js', 'popads.js': 'noop.js', 'popads-dummy.js': 'noop.js', 'noeval.js': 'noop.js',
  'noeval-silent.js': 'noop.js', 'hd-main.js': 'noop.js', 'fuckadblock.js-3.2.0': 'noop.js',
  'ligatus_angular-tag.js': 'noop.js', 'nitropay_ads.js': 'noop.js', 'sensors-analytics': 'noop.js',
  matomo: 'noop.js', 'metrika-yandex-watch': 'noop.js', 'metrika-yandex-tag': 'noop.js',
  'scorecardresearch-beacon': 'noop.js', 'naver-wcslog': 'noop.js', gemius: 'noop.js',
  'ati-smarttag': 'noop.js', 'prevent-bab': 'noop.js', 'prevent-fab-3.2.0': 'noop.js',
  'prevent-popads-net': 'noop.js', 'amazon-apstag.js': 'apstag.js', 'noopcss.css': 'noop.css',
};

// Clave canónica de una regla (sin id) para comparar versiones
export function ruleKey(rule) {
  const norm = (v) => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v).sort()) if (k !== 'id') o[k] = norm(v[k]);
      return o;
    }
    return v;
  };
  return JSON.stringify(norm(rule));
}

export class Network {
  constructor() {
    this.rules = [];
    this.seen = new Set();
    this.badfilters = new Set();
    this.generichide = new Set();
    this.elemhide = new Set();
    this.specifichide = new Set();
    this.domainGroups = new Map(); // gkey(string) -> {meta, set}
    this.regexCount = 0;
    this.skipped = 0;
  }

  add(line, ruleset) {
    if (this.badfilters.has(line)) { this.skipped++; return; }
    const tail = line.split('$').pop();
    if (line.endsWith('$badfilter') || tail.includes(',badfilter')) {
      let b = line.replace(/(\$|,)badfilter/g, '').replaceAll('$,', '$');
      b = b.replace(/\$+$/, '');
      this.badfilters.add(b);
      return;
    }
    const allow = line.startsWith('@@');
    if (allow) line = line.slice(2);
    let pattern = line, opts = '';
    if (line.startsWith('/') && /\/(\$[^/]*)?$/.test(line) && line.length > 2) {
      const m = /^(\/.*\/)(\$([^/]+))?$/.exec(line);
      if (m) { pattern = m[1]; opts = m[3] || ''; }
    } else if (line.includes('$')) {
      const idx = line.lastIndexOf('$');
      if (/^[~a-zA-Z0-9_\-]+(=|,|$)/.test(line.slice(idx + 1))) { pattern = line.slice(0, idx); opts = line.slice(idx + 1); }
    }
    this.convert(pattern, opts, allow, ruleset);
  }

  convert(pattern, opts, allow, ruleset) {
    const cond = {};
    const types = new Set(), exTypes = new Set();
    let party = null, important = false, matchCase = false, special = null;
    let action = { type: allow ? 'allow' : 'block' };
    const skip = () => { this.skipped++; };

    for (let o of splitOpts(opts).map((x) => x.trim())) {
      if (!o) continue;
      const eq = o.indexOf('=');
      let name = eq === -1 ? o : o.slice(0, eq);
      const val = eq === -1 ? '' : o.slice(eq + 1);
      const neg = name.startsWith('~');
      if (neg) name = name.slice(1);
      name = name.toLowerCase();
      if (TYPE_MAP[name]) TYPE_MAP[name].forEach((t) => (neg ? exTypes : types).add(t));
      else if (name === 'all') ALL_TYPES.forEach((t) => types.add(t));
      else if (['third-party', '3p', 'strict3p', 'strict-third-party'].includes(name)) party = neg ? 'firstParty' : 'thirdParty';
      else if (['first-party', '1p', 'strict1p', 'strict-first-party'].includes(name)) party = neg ? 'thirdParty' : 'firstParty';
      else if (name === 'domain' || name === 'from') {
        const [inc, exc] = splitDomains(val);
        const rawInc = val.split('|').filter((d) => d.trim() && !d.trim().startsWith('~'));
        if (rawInc.length && !inc.length) return skip();
        if (!inc.length && !exc.length) return skip();
        if (inc.length) cond.initiatorDomains = inc;
        if (exc.length) cond.excludedInitiatorDomains = exc;
      } else if (name === 'denyallow') {
        const [inc] = splitDomains(val);
        if (inc.length) cond.excludedRequestDomains = inc;
      } else if (name === 'important') important = true;
      else if (name === 'match-case') matchCase = true;
      else if (name === 'method') {
        const ms = val.split('|').filter((m) => m && !m.startsWith('~')).map((m) => m.toLowerCase());
        if (ms.length) cond.requestMethods = ms;
      } else if (['redirect', 'empty', 'mp4'].includes(name)) {
        if (allow) return skip();
        special = ['redirect', val || (name === 'mp4' ? 'noopmp4' : 'nooptext')];
      } else if (name === 'removeparam') {
        if (allow || !val || val.startsWith('/') || val.startsWith('~') || val.includes('|')) return skip();
        special = ['removeparam', val];
      } else if (name === 'csp') {
        if (allow || !val) return skip();
        special = ['csp', val];
      } else if (['generichide', 'ghide', 'elemhide', 'ehide', 'specifichide', 'shide'].includes(name)) {
        if (!allow) return;
        const host = this.hostFromPattern(pattern);
        if (!host) return;
        if (name === 'generichide' || name === 'ghide') this.generichide.add(host);
        else if (name === 'specifichide' || name === 'shide') this.specifichide.add(host);
        else this.elemhide.add(host);
        return;
      } else if (IGNORED.has(name)) continue;
      else return skip();
    }

    if (pattern.startsWith('/') && pattern.endsWith('/') && pattern.length > 2) {
      const rx = pattern.slice(1, -1);
      if (!this.regexOk(rx)) return skip();
      cond.regexFilter = rx;
      this.regexCount++;
    } else {
      let uf = pattern;
      if (!ASCII.test(uf)) {
        const m = /^(\|\|)([^/^:*]+)(.*)$/.exec(uf);
        if (!m) return skip();
        const h = normHost(m[2]);
        if (!h || !ASCII.test(m[3])) return skip();
        uf = '||' + h + m[3];
      }
      if (uf.startsWith('||*')) uf = uf.slice(2);
      while (uf.startsWith('*')) uf = uf.slice(1);
      while (uf.endsWith('*') && !uf.endsWith('|*')) uf = uf.slice(0, -1);
      if (uf === '' || uf === '|' || uf === '||') uf = '';
      if (uf.startsWith('|') && !uf.startsWith('||') && uf.length > 1 && uf[1] === '*') uf = uf.slice(2);
      if (uf) {
        if (!matchCase) uf = uf.toLowerCase();
        cond.urlFilter = uf;
      } else if (!cond.initiatorDomains && !special && !types.size) return skip();
      if (matchCase) cond.isUrlFilterCaseSensitive = true;
    }

    if (party) cond.domainType = party;
    if (types.size) {
      for (const t of exTypes) types.delete(t);
      if (!types.size) return skip();
      cond.resourceTypes = [...types].sort();
    } else if (exTypes.size) cond.excludedResourceTypes = [...exTypes].sort();

    let priority = 1;
    if (allow) {
      priority = 2;
      if ((cond.resourceTypes || []).includes('main_frame') && cond.resourceTypes.length <= 2) {
        action = { type: 'allowAllRequests' };
        cond.resourceTypes = ['main_frame', 'sub_frame'];
        priority = 3;
      }
    }
    if (important && !allow) priority = 4;

    if (special) {
      const [kind, val] = special;
      if (kind === 'redirect') {
        const res = REDIRECTS[val.split(':')[0].trim()];
        if (!res) return skip();
        action = { type: 'redirect', redirect: { extensionPath: '/res/' + res } };
        priority = Math.max(priority, 2);
      } else if (kind === 'removeparam') {
        action = { type: 'redirect', redirect: { transform: { queryTransform: { removeParams: [val] } } } };
        if (!cond.resourceTypes) cond.resourceTypes = ['main_frame', 'sub_frame', 'xmlhttprequest'];
        delete cond.excludedResourceTypes;
        priority = 1;
      } else if (kind === 'csp') {
        action = { type: 'modifyHeaders', responseHeaders: [{ header: 'Content-Security-Policy', operation: 'append', value: val }] };
        cond.resourceTypes = ['main_frame', 'sub_frame'];
        delete cond.excludedResourceTypes;
      }
    }

    const uf = cond.urlFilter || '';
    const m = /^\|\|([a-z0-9.\-_]+)\^\|?$/.exec(uf);
    const simple = Object.keys(cond).filter((k) => !['urlFilter', 'domainType', 'resourceTypes', 'excludedResourceTypes'].includes(k));
    if (m && !simple.length && (action.type === 'block' || action.type === 'allow')) {
      const meta = { ruleset, type: action.type, priority, party: cond.domainType || null,
        rtypes: cond.resourceTypes || [], exTypes: cond.excludedResourceTypes || [] };
      const gkey = ruleset + '|' + groupKey(meta);
      if (!this.domainGroups.has(gkey)) this.domainGroups.set(gkey, { meta, set: new Set() });
      this.domainGroups.get(gkey).set.add(m[1]);
      return;
    }
    const rule = { priority, action, condition: cond };
    const key = ruleKey(rule);
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.rules.push([ruleset, rule]);
  }

  hostFromPattern(p) {
    const m = /^\|\|([^/^*]+)\^?$/.exec(p) || /^\|?https?:\/\/([^/^*]+)/.exec(p);
    return m ? normHost(m[1]) : null;
  }

  regexOk(rx) {
    // La validación final contra RE2 la hace Chrome (isRegexSupported) al aplicar
    if (this.regexCount >= 900 || !ASCII.test(rx)) return false;
    if (/\(\?[=!<]|\\[1-9]|\\d\{|\(\?i\)/.test(rx)) return false;
    return true;
  }

  // Devuelve { ruleset: { rules: [...], groups: Map(gkey -> {meta, domains[]}) } }
  finalize() {
    const out = {};
    const get = (rs) => (out[rs] ||= { rules: [], groups: new Map() });
    for (const [gkey, { meta, set }] of this.domainGroups) {
      const doms = [...set].sort().filter((d) => !this.badfilters.has(`||${d}^`));
      get(meta.ruleset).groups.set(groupKey(meta), { meta, domains: doms });
    }
    for (const [rs, rule] of this.rules) get(rs).rules.push(rule);
    return out;
  }
}

export function groupKey(meta) {
  return JSON.stringify([meta.type, meta.priority, meta.party || null, [...meta.rtypes], [...meta.exTypes]]);
}

// Reconstruye el meta de grupo a partir de una regla estática con requestDomains
export function groupMetaFromRule(rule, ruleset) {
  const c = rule.condition;
  return { ruleset, type: rule.action.type, priority: rule.priority, party: c.domainType || null,
    rtypes: c.resourceTypes || [], exTypes: c.excludedResourceTypes || [] };
}

export function groupRule(meta, domains) {
  const cond = { requestDomains: domains };
  if (meta.party) cond.domainType = meta.party;
  if (meta.rtypes.length) cond.resourceTypes = [...meta.rtypes];
  if (meta.exTypes.length) cond.excludedResourceTypes = [...meta.exTypes];
  return { priority: meta.priority, action: { type: meta.type }, condition: cond };
}
