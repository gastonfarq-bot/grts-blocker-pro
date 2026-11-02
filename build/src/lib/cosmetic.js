// Filtros cosméticos y scriptlets. Port de build/cosmetic.py.
import { normHost } from './net.js';

const PROC_ALIASES = [
  [':-abp-contains(', ':has-text('], [':contains(', ':has-text('], [':-abp-has(', ':has('],
  [':if-not(', ':not('], [':if(', ':has('], [':nth-ancestor(', ':upward('],
];
const PROC_OPS = ['has-text', 'upward', 'xpath', 'matches-css', 'matches-attr', 'min-text-length',
  'matches-path', 'remove', 'style', 'remove-attr', 'remove-class', 'watch-attr'];
const UNSUPPORTED_PROC = ['matches-prop', 'others', 'matches-media', 'matches-css-before', 'matches-css-after',
  'shadow', 'spath', '-abp-properties', 'properties', 'matches-property'];
const PROC_RE = new RegExp(':(' + PROC_OPS.map((o) => o.replace(/[-]/g, '\\-')).join('|') + ')\\(');

const SCRIPTLET_ALIASES = {
  set: 'set-constant', 'trusted-set-constant': 'set-constant', 'trusted-set': 'set-constant',
  aopr: 'abort-on-property-read', aopw: 'abort-on-property-write',
  acs: 'abort-current-script', acis: 'abort-current-inline-script',
  'abort-current-inline-script': 'abort-current-inline-script',
  aost: 'abort-on-stack-trace',
  'prevent-fetch': 'prevent-fetch', 'no-fetch-if': 'no-fetch-if',
  'prevent-xhr': 'prevent-xhr', 'no-xhr-if': 'no-xhr-if',
  nowoif: 'no-window-open-if', 'window.open-defuser': 'no-window-open-if',
  'prevent-window-open': 'prevent-window-open',
  nostif: 'no-setTimeout-if', 'setTimeout-defuser': 'no-setTimeout-if', 'prevent-setTimeout': 'no-setTimeout-if',
  nosiif: 'no-setInterval-if', 'setInterval-defuser': 'no-setInterval-if', 'prevent-setInterval': 'no-setInterval-if',
  'nano-stb': 'adjust-setTimeout', 'nano-setTimeout-booster': 'adjust-setTimeout',
  'nano-sib': 'adjust-setInterval', 'nano-setInterval-booster': 'adjust-setInterval',
  aeld: 'prevent-addEventListener', 'addEventListener-defuser': 'prevent-addEventListener',
  rpfr: 'trusted-replace-fetch-response', rpxr: 'trusted-replace-xhr-response',
  ra: 'remove-attr', rc: 'remove-class',
  'cookie-remover': 'remove-cookie',
  rmnt: 'remove-node-text', rpnt: 'replace-node-text', 'trusted-rpnt': 'replace-node-text',
  'trusted-replace-node-text': 'replace-node-text',
  noeval: 'prevent-eval-if', 'noeval-if': 'prevent-eval-if',
  'trusted-set-session-storage-item': 'set-session-storage-item',
  'trusted-set-local-storage-item': 'set-local-storage-item',
  'trusted-set-cookie': 'set-cookie', 'trusted-click-element': 'click-element',
  'popads-dummy': 'popads-dummy', nowebrtc: 'nowebrtc', 'prevent-refresh': 'prevent-refresh',
  'refresh-defuser': 'prevent-refresh',
};
const SUPPORTED_SCRIPTLETS = new Set([
  'set-constant', 'abort-on-property-read', 'abort-on-property-write', 'abort-current-script',
  'abort-current-inline-script', 'abort-on-stack-trace', 'prevent-fetch', 'no-fetch-if', 'prevent-xhr',
  'no-xhr-if', 'no-window-open-if', 'prevent-window-open', 'no-setTimeout-if', 'no-setInterval-if',
  'adjust-setTimeout', 'adjust-setInterval', 'prevent-addEventListener', 'json-prune',
  'json-prune-fetch-response', 'json-prune-xhr-response', 'trusted-replace-fetch-response',
  'trusted-replace-xhr-response', 'remove-attr', 'remove-class', 'set-cookie', 'remove-cookie',
  'set-local-storage-item', 'set-session-storage-item', 'click-element', 'remove-node-text',
  'replace-node-text', 'prevent-element-src-loading', 'nowebrtc', 'prevent-eval-if',
  'href-sanitizer', 'popads-dummy', 'prevent-refresh',
]);

function canonScriptlet(name) {
  let n = name.trim().replace(/^['"]+|['"]+$/g, '');
  if (n.startsWith('ubo-')) n = n.slice(4);
  if (n.endsWith('.js')) n = n.slice(0, -3);
  return SCRIPTLET_ALIASES[n] || n;
}

export function splitArgs(s) {
  const args = [];
  let i = 0;
  const n = s.length;
  while (i <= n) {
    while (i < n && s[i] === ' ') i++;
    if (i < n && '\'"`'.includes(s[i])) {
      const q = s[i];
      let j = i + 1, buf = '';
      while (j < n) {
        if (s[j] === '\\' && j + 1 < n && (s[j + 1] === q || s[j + 1] === '\\')) { buf += s[j + 1]; j += 2; continue; }
        if (s[j] === q) break;
        buf += s[j]; j++;
      }
      let k = j + 1;
      while (k < n && s[k] === ' ') k++;
      if (k >= n || s[k] === ',') {
        args.push(buf);
        i = k + 1;
        if (k >= n) break;
        continue;
      }
    }
    let j = i, buf = '';
    while (j < n) {
      if (s[j] === '\\' && j + 1 < n && s[j + 1] === ',') { buf += ','; j += 2; continue; }
      if (s[j] === ',') break;
      buf += s[j]; j++;
    }
    args.push(buf.trim());
    i = j + 1;
    if (j >= n) break;
  }
  return args;
}

function balanced(s) {
  let depth = 0, q = null, esc = false;
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth < 0) return false; }
  }
  return depth === 0;
}

export class Cosmetic {
  // cssOk: función que valida un selector CSS (en el navegador, con querySelector)
  constructor(cssOk) {
    this.cssOk = (sel) => !!sel && sel.length <= 2000 && !sel.includes('{') && !sel.includes('}') && cssOk(sel);
    this.generic = new Set();
    this.genericUnhide = new Set();
    this.hosts = new Map();
    this.skipped = 0;
  }

  h(host) {
    let e = this.hosts.get(host);
    if (!e) { e = { h: new Set(), x: new Set(), p: [], c: [], s: [], sx: new Set(), gx: new Set() }; this.hosts.set(host, e); }
    return e;
  }

  classify(sel) {
    sel = sel.trim();
    for (const [a, b] of PROC_ALIASES) sel = sel.split(a).join(b);
    if (UNSUPPORTED_PROC.some((u) => sel.includes(':' + u + '('))) return null;
    if (PROC_RE.test(sel)) {
      if (!balanced(sel)) return null;
      const m = /^(.*):style\((.*)\)$/s.exec(sel);
      if (m && this.cssOk(m[1]) && !m[2].includes('url(')) return ['style', m[1], m[2]];
      return ['proc', sel];
    }
    if (this.cssOk(sel)) return ['css', sel];
    return null;
  }

  domains(part) {
    const inc = [], exc = [];
    for (let d of part.split(',')) {
      d = d.trim();
      if (!d) continue;
      const neg = d.startsWith('~');
      if (neg) d = d.slice(1);
      let h;
      if (d.endsWith('.*')) {
        const base = normHost(d.slice(0, -2) + '.x');
        h = base ? base.slice(0, -2) + '.*' : null;
      } else h = normHost(d);
      if (h) (neg ? exc : inc).push(h);
    }
    return [inc, exc];
  }

  add(line) {
    const m = /^([^#]*?)(#@?(?:\$\?|\$|%|\?)?#)(.*)$/s.exec(line);
    if (!m) return;
    const [, doms, sep] = m;
    let body = m[3];
    const skip = () => { this.skipped++; };
    if (doms.includes('[') || doms.includes('/')) return skip();
    const [inc, exc] = doms ? this.domains(doms) : [[], []];
    if (doms && !inc.length && !exc.length) return skip();
    const unhide = sep.includes('@');
    const kind = sep.replace('@', '');

    if (kind === '##' && body.startsWith('+js(')) {
      if (!body.endsWith(')')) return skip();
      return this.scriptlet(inc, exc, splitArgs(body.slice(4, -1)), unhide);
    }
    if (kind === '#%#') {
      if (!body.startsWith('//scriptlet(') || !body.endsWith(')')) return skip();
      return this.scriptlet(inc, exc, splitArgs(body.slice(12, -1)), unhide);
    }
    if (kind === '##' && body.startsWith('^')) return skip();

    if (kind === '#$#' || kind === '#$?#') {
      const mm = /^(.*?)\s*\{(.*)\}\s*$/s.exec(body);
      if (!mm) return skip();
      const sel = mm[1].trim(), decl = mm[2].trim();
      if (/^remove\s*:\s*true;?$/.test(decl)) body = sel + ':remove()';
      else if (/^display\s*:\s*none\s*(!important)?;?$/.test(decl)) body = sel;
      else {
        if (decl.includes('url(') || !inc.length) return skip();
        const c = this.classify(sel);
        if (!c) return skip();
        if (c[0] === 'css') {
          if (!unhide) for (const h of inc) this.h(h).c.push(`${sel}{${decl}}`);
          return;
        }
        body = sel + ':style(' + decl + ')';
      }
    }

    const c = this.classify(body);
    if (!c) return skip();

    if (!inc.length) {
      if (unhide) { if (c[0] === 'css') this.genericUnhide.add(c[1]); return; }
      if (c[0] !== 'css') return skip();
      this.generic.add(c[1]);
      for (const h of exc) this.h(h).gx.add(c[1]);
      return;
    }
    for (const h of inc) {
      const e = this.h(h);
      if (c[0] === 'css') (unhide ? e.x : e.h).add(c[1]);
      else if (unhide) e.x.add(body);
      else if (c[0] === 'proc') e.p.push(c[1]);
      else if (c[0] === 'style') e.c.push(`${c[1]}{${c[2]}}`);
    }
    for (const h of exc) this.h(h).x.add(c[0] === 'css' ? c[1] : body);
  }

  scriptlet(inc, exc, args, unhide) {
    if (!args.length || !args[0]) {
      if (unhide) for (const h of inc) this.h(h).sx.add('*');
      return;
    }
    const name = canonScriptlet(args[0]);
    if (!SUPPORTED_SCRIPTLETS.has(name)) { this.skipped++; return; }
    const sig = [name, ...args.slice(1)];
    const sigStr = JSON.stringify(sig);
    if (unhide) { for (const h of inc) this.h(h).sx.add(sigStr); return; }
    if (!inc.length) { this.skipped++; return; }
    for (const h of inc) {
      const e = this.h(h);
      if (!e.s.some((x) => JSON.stringify(x) === sigStr)) e.s.push(sig);
    }
    for (const h of exc) this.h(h).sx.add(sigStr);
  }
}

// Directivas !#if de uBO / AdGuard
const ENV = {
  env_chromium: true, env_mv3: true, env_edge: false, env_firefox: false, env_safari: false,
  env_mobile: false, env_legacy: false, cap_html_filtering: false, cap_user_stylesheet: true,
  cap_ipaddress: false, ext_ublock: true, ext_ubol: true, ext_devbuild: false, ext_abp: false,
  adguard: true, adguard_ext_chromium: true, adguard_ext_chromium_mv3: true, adguard_ext_firefox: false,
  adguard_ext_edge: false, adguard_ext_safari: false, adguard_ext_opera: false, adguard_ext_android_cb: false,
  adguard_app_windows: false, adguard_app_mac: false, adguard_app_android: false, adguard_app_ios: false,
  adguard_app_cli: false, false: false, true: true,
};

function evalCond(expr) {
  // Evaluador seguro de expresiones booleanas: identificadores, !, &&, ||, paréntesis
  const toks = expr.match(/[A-Za-z_][A-Za-z0-9_]*|&&|\|\||!|\(|\)/g) || [];
  let i = 0;
  const parseOr = () => { let v = parseAnd(); while (toks[i] === '||') { i++; const r = parseAnd(); v = v || r; } return v; };
  const parseAnd = () => { let v = parseNot(); while (toks[i] === '&&') { i++; const r = parseNot(); v = v && r; } return v; };
  const parseNot = () => {
    if (toks[i] === '!') { i++; return !parseNot(); }
    if (toks[i] === '(') { i++; const v = parseOr(); if (toks[i] === ')') i++; return v; }
    const t = toks[i++];
    return !!ENV[t];
  };
  try { return !!parseOr(); } catch { return false; }
}

export function* readList(text) {
  const stack = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('!#if')) { stack.push(evalCond(line.slice(4))); continue; }
    if (line.startsWith('!#else')) { if (stack.length) stack[stack.length - 1] = !stack[stack.length - 1]; continue; }
    if (line.startsWith('!#endif')) { stack.pop(); continue; }
    if (stack.length && !stack.every(Boolean)) continue;
    if (!line || line[0] === '!' || line.startsWith('[Adblock') || line.startsWith('# ')) continue;
    yield line;
  }
}

export const COSMETIC_RE = /^([^/|@$^\s]*?)(#@?(?:\$\?|\$|%|\?)?#)/;
