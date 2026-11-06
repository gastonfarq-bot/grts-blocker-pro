/* Biblioteca de scriptlets de GRTS Blocker Pro.
   Se ejecuta en el mundo de la página (MAIN) antes que los scripts del sitio. */
const S = (() => {
  'use strict';
  const W = window;
  const magic = String.fromCharCode(Date.now() % 26 + 97) + Math.floor(Math.random() * 982451653 + 982451653).toString(36);
  const nativeToString = Function.prototype.toString;
  const fnStr = f => { try { return nativeToString.call(f); } catch { return String(f); } };
  const JSONparse = JSON.parse, JSONstringify = JSON.stringify;
  const Reflect_apply = Reflect.apply;

  // Silencia los errores que provocamos a propósito
  W.addEventListener('error', e => {
    if (typeof e.message === 'string' && e.message.includes(magic)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // Oculta que las funciones fueron reemplazadas
  const cloak = (proxyFn, orig) => {
    try { Object.defineProperty(proxyFn, 'name', { value: orig.name }); } catch {}
    try { Object.defineProperty(proxyFn, 'toString', { value: () => fnStr(orig), configurable: true }); } catch {}
    return proxyFn;
  };
  const wrap = (owner, prop, handler) => {
    const orig = owner[prop];
    if (typeof orig !== 'function') return;
    owner[prop] = new Proxy(orig, handler);
  };

  const toRe = (s, flagsDefault = '') => {
    if (s === undefined || s === null || s === '' || s === '*') return /^/;
    const m = /^\/(.+)\/([dgimsuy]*)$/.exec(s);
    if (m) { try { return new RegExp(m[1], m[2] || flagsDefault); } catch { return /(?!)/; } }
    return new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flagsDefault);
  };
  const needle = s => {
    let neg = false;
    if (typeof s === 'string' && s.startsWith('!')) { neg = true; s = s.slice(1); }
    const re = toRe(s);
    return t => re.test(String(t)) !== neg;
  };

  const parseValue = (v, trusted) => {
    switch (v) {
      case 'undefined': return { v: undefined };
      case 'false': return { v: false };
      case 'true': return { v: true };
      case 'null': return { v: null };
      case "''": case '""': case '': case 'emptyStr': return { v: '' };
      case 'emptyArr': case '[]': return { v: [], fresh: () => [] };
      case 'emptyObj': case '{}': return { v: {}, fresh: () => ({}) };
      case 'noopFunc': case 'noopCallbackFunc': return { v: function () {} };
      case 'trueFunc': return { v: function () { return true; } };
      case 'falseFunc': return { v: function () { return false; } };
      case 'throwFunc': return { v: function () { throw new Error(magic); } };
      case 'noopPromiseResolve': return { v: function () { return Promise.resolve(); } };
      case 'noopPromiseReject': return { v: function () { return Promise.reject(); } };
      case 'yes': case 'no': case 'on': case 'off': case 'accept': case 'reject': case 'ok': return { v };
      case 'NaN': return { v: NaN };
      case 'Infinity': return { v: Infinity };
      case '-Infinity': return { v: -Infinity };
    }
    if (/^-?\d+(\.\d+)?$/.test(v)) return { v: Number(v) };
    if (trusted || v.length < 64) {
      if (/^'.*'$|^".*"$/.test(v)) return { v: v.slice(1, -1) };
      if (trusted) { try { return { v: JSONparse(v) }; } catch { return { v }; } }
    }
    return null;
  };

  // Recorre una cadena "a.b.c", esperando a que existan los objetos intermedios
  const trapChain = (chain, onFinal) => {
    chain = String(chain).replace(/^(window|globalThis|self)\./, '');
    const go = (owner, path) => {
      const i = path.indexOf('.');
      if (i === -1) { onFinal(owner, path); return; }
      const prop = path.slice(0, i), rest = path.slice(i + 1);
      let cur = owner[prop];
      if (cur instanceof Object || (typeof cur === 'object' && cur !== null)) { go(cur, rest); return; }
      const d = Object.getOwnPropertyDescriptor(owner, prop);
      if (d && d.configurable === false) return;
      // Si otra trampa ya vigila esta propiedad, se encadena con ella en vez de pisarla
      const prevGet = d && d.get, prevSet = d && d.set;
      try {
        Object.defineProperty(owner, prop, {
          configurable: true, enumerable: true,
          get() { return prevGet ? prevGet.call(this) : cur; },
          set(a) {
            if (prevSet) prevSet.call(this, a);
            cur = a;
            if (a instanceof Object) go(a, rest);
          },
        });
      } catch {}
    };
    go(W, chain);
  };

  const domReady = fn => {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  };
  const observe = (fn, stay = true) => {
    let t = 0;
    const run = () => { t = 0; try { fn(); } catch {} };
    run();
    const mo = new MutationObserver(() => { if (!t) t = setTimeout(run, 50); });
    const start = () => mo.observe(document.documentElement || document, { childList: true, subtree: true, attributes: true });
    if (document.documentElement) start(); else domReady(start);
    domReady(run);
    if (!stay) W.addEventListener('load', () => setTimeout(() => mo.disconnect(), 5000), { once: true });
  };

  // ---- Coincidencia de peticiones (fetch / XHR) -------------------------
  const propsMatcher = (spec, matchAllIfEmpty) => {
    spec = (spec || '').trim();
    if (spec === '' || spec === '*') return matchAllIfEmpty ? () => true : null;
    const conds = [];
    for (const tok of spec.split(/\s+/)) {
      const m = /^(url|method|headers|body|credentials|mode|referrer|referrerPolicy|integrity|cache|redirect|keepalive|signal|priority):(.*)$/.exec(tok);
      if (m) conds.push([m[1], toRe(m[2])]);
      else conds.push(['url', toRe(tok)]);
    }
    return det => conds.every(([k, re]) => re.test(String(det[k] ?? '')));
  };
  const fetchDetails = (input, init) => {
    const d = {};
    try {
      if (input instanceof Request) { for (const k of ['url', 'method', 'mode', 'credentials', 'referrer', 'cache', 'redirect']) d[k] = input[k]; }
      else d.url = String(input);
      if (init && typeof init === 'object') for (const k of Object.keys(init)) { const v = init[k]; d[k] = typeof v === 'string' ? v : (v === undefined ? '' : String(v)); }
      if (!d.method) d.method = 'GET';
      d.url = new URL(d.url, location.href).href;
    } catch {}
    return d;
  };
  const fakeResponse = (body, url) => {
    const r = new Response(body, { status: 200, statusText: 'OK', headers: { 'Content-Length': String(body.length) } });
    try { Object.defineProperty(r, 'url', { value: url }); Object.defineProperty(r, 'type', { value: 'basic' }); } catch {}
    return r;
  };
  const bodyFor = (kind) => ({ emptyObj: '{}', emptyArr: '[]', emptyStr: '', true: 'true', false: 'false', '': '' })[kind ?? ''] ?? '';

  // ---- json-prune ------------------------------------------------------
  const hasPath = (o, path) => {
    const parts = path.split('.');
    const walk = (cur, i) => {
      if (cur === null || typeof cur !== 'object') return false;
      const k = parts[i];
      const last = i === parts.length - 1;
      if (k === '[]' || k === '*') {
        for (const key of Object.keys(cur)) if (last ? true : walk(cur[key], i + 1)) return true;
        return false;
      }
      if (!(k in cur)) return false;
      return last ? true : walk(cur[k], i + 1);
    };
    return walk(o, 0);
  };
  const prunePath = (o, path) => {
    const parts = path.split('.');
    let changed = false;
    const walk = (cur, i) => {
      if (cur === null || typeof cur !== 'object') return;
      const k = parts[i];
      const last = i === parts.length - 1;
      if (k === '[-]' || k === '{-}') {
        const rest = parts.slice(i + 1).join('.');
        if (Array.isArray(cur)) {
          for (let j = cur.length - 1; j >= 0; j--) if (rest === '' || hasPath(cur[j], rest)) { cur.splice(j, 1); changed = true; }
        } else for (const key of Object.keys(cur)) if (rest === '' || hasPath(cur[key], rest)) { delete cur[key]; changed = true; }
        return;
      }
      if (k === '[]' || k === '*') {
        for (const key of Object.keys(cur)) {
          if (last) { delete cur[key]; changed = true; } else walk(cur[key], i + 1);
        }
        return;
      }
      if (!(k in cur)) return;
      if (last) { delete cur[k]; changed = true; } else walk(cur[k], i + 1);
    };
    walk(o, 0);
    return changed;
  };
  const makePruner = (remove, required) => {
    const rm = String(remove || '').split(/\s+/).filter(Boolean);
    const req = String(required || '').split(/\s+/).filter(Boolean);
    if (!rm.length) return null;
    return obj => {
      if (obj === null || typeof obj !== 'object') return obj;
      if (req.length && !req.every(p => hasPath(obj, p))) return obj;
      for (const p of rm) prunePath(obj, p);
      return obj;
    };
  };
  const varArgs = (args) => {
    const o = {};
    for (let i = 0; i + 1 < args.length; i += 2) o[args[i]] = args[i + 1];
    return o;
  };

  // ---- XHR: interceptar la respuesta -----------------------------------
  const xhrInfo = new WeakMap();
  let xhrHooked = false;
  const xhrTransforms = [];
  const hookXhr = () => {
    if (xhrHooked) return;
    xhrHooked = true;
    const P = XMLHttpRequest.prototype;
    wrap(P, 'open', { apply(t, x, a) { xhrInfo.set(x, { method: String(a[0] || 'GET'), url: (() => { try { return new URL(a[1], location.href).href; } catch { return String(a[1]); } })() }); return Reflect_apply(t, x, a); } });
    const patch = (prop) => {
      const d = Object.getOwnPropertyDescriptor(P, prop);
      if (!d || !d.get) return;
      Object.defineProperty(P, prop, {
        configurable: true, enumerable: d.enumerable,
        get: cloak(function () {
          const v = d.get.call(this);
          const info = xhrInfo.get(this);
          if (!info || this.readyState !== 4) return v;
          if (info.cache && info.cache.prop === prop) return info.cache.v;
          let out = v;
          for (const tr of xhrTransforms) { try { out = tr(out, info, this.responseType, prop); } catch {} }
          info.cache = { prop, v: out };
          return out;
        }, d.get),
      });
    };
    patch('response'); patch('responseText');
  };

  // ---- fetch: interceptar la respuesta ---------------------------------
  const fetchTransforms = [];
  let fetchHooked = false;
  const hookFetch = () => {
    if (fetchHooked) return;
    fetchHooked = true;
    wrap(W, 'fetch', {
      apply(t, self, a) {
        const det = fetchDetails(a[0], a[1]);
        const trs = fetchTransforms.filter(tr => tr.match(det));
        const p = Reflect_apply(t, self, a);
        if (!trs.length) return p;
        return p.then(resp => resp.clone().text().then(text => {
          let out = text;
          for (const tr of trs) { try { out = tr.fn(out); } catch {} }
          if (out === text) return resp;
          const r = new Response(out, { status: resp.status, statusText: resp.statusText, headers: resp.headers });
          try { Object.defineProperty(r, 'url', { value: resp.url }); Object.defineProperty(r, 'type', { value: resp.type }); Object.defineProperty(r, 'redirected', { value: resp.redirected }); } catch {}
          return r;
        }).catch(() => resp));
      },
    });
  };

  const textReplacer = (pattern, replacement) => {
    if (!pattern) return null;
    const re = /^\/(.+)\/([dgimsuy]*)$/.test(pattern) ? toRe(pattern) : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    return s => typeof s === 'string' ? s.replace(re, replacement ?? '') : s;
  };

  // ---- Consultas JSONPath ----------------------------------------------
  // Clase JSONPath portada de uBlock Origin (GPL-3.0, (C) Raymond Hill).
  // https://github.com/gorhill/uBlock/blob/master/src/js/jsonpath.js
class JSONPath {
    static create(query) {
        const jsonp = new JSONPath();
        jsonp.compile(query);
        return jsonp;
    }
    static toJSON(obj, stringifier, ...args) {
        return (stringifier || JSON.stringify)(obj, ...args)
            .replace(/\//g, '\\/');
    }
    static keys = Object.keys;
    static entries = Object.entries;
    static hasOwn = Object.hasOwn;
    static Regex = RegExp;
    get value() {
        return this.#compiled && this.#compiled.rval;
    }
    set value(v) {
        if ( this.#compiled === undefined ) { return; }
        this.#compiled.rval = v;
    }
    get valid() {
        return this.#compiled !== undefined;
    }
    compile(query) {
        this.#compiled = undefined;
        this.v2 = query.startsWith('v2:');
        if ( this.v2 ) { query = query.slice(3); }
        const r = this.#compile(query, 0);
        if ( r === undefined ) { return; }
        if ( r.i !== query.length ) {
            let val;
            if ( query.startsWith('=', r.i) ) {
                const match = this.#reRval.exec(query.slice(r.i));
                if ( match ) {
                    r.modify = match[1];
                    val = match[2];
                } else {
                    val = query.slice(r.i+1);
                }
            } else if ( query.startsWith('+=', r.i) ) {
                r.modify = '+';
                val = query.slice(r.i+2);
            }
            try { r.rval = JSON.parse(val); }
            catch { return; }
        }
        r.v2 = this.v2;
        this.#compiled = r;
    }
    evaluate(root) {
        if ( this.valid === false ) { return []; }
        this.#root = { '$': root };
        const paths = this.#evaluate(this.#compiled.steps, []);
        this.#root = null;
        return paths;
    }
    apply(root) {
        if ( this.valid === false ) { return; }
        const { rval } = this.#compiled;
        this.#root = { '$': root };
        const paths = this.#evaluate(this.#compiled.steps, []);
        let i = paths.length
        if ( i === 0 ) { this.#root = null; return; }
        while ( i-- ) {
            const { obj, key } = this.#resolvePath(paths[i]);
            if ( obj === undefined ) { continue; }
            if ( rval !== undefined ) {
                this.#modifyVal(obj, key);
            } else if ( Array.isArray(obj) && typeof key === 'number' ) {
                obj.splice(key, 1);
            } else {
                delete obj[key];
            }
        }
        const result = this.#root['$'] ?? null;
        this.#root = null;
        return result;
    }
    dump() {
        return JSON.stringify(this.#compiled);
    }
    toJSON(obj, ...args) {
        return JSONPath.toJSON(obj, null, ...args)
    }
    get [Symbol.toStringTag]() {
        return 'JSONPath';
    }
    #UNDEFINED = 0;
    #ROOT = 1;
    #CURRENT = 2;
    #CHILDREN = 3;
    #DESCENDANTS = 4;
    #QUANTIFIER = 5;
    #reUnquotedIdentifier = /^[A-Za-z_][\w]*|^\*/;
    #reExpr = /^\s*([!=^$*]=|[<>]=?)\s*(.+?)\]/;
    #reIndice = /^-?\d+/;
    #reRval = /^=([a-z]+)\((.+)\)$/;
    #reQuantifier = /^\{(\d+|\d+,\d+|\d+,|,\d+)\};\$/;
    #root;
    #compiled;
    #compile(query, i) {
        if ( query.length === 0 ) { return; }
        const steps = [];
        let c = query.charCodeAt(i);
        if ( c === 0x24 /* $ */ ) {
            steps.push({ mv: this.#ROOT });
            i += 1;
        } else if ( c === 0x40 /* @ */ ) {
            steps.push({ mv: this.#CURRENT });
            i += 1;
        } else {
            steps.push({ mv: i === 0 ? this.#ROOT : this.#CURRENT });
        }
        let mv = this.#UNDEFINED;
        for (;;) {
            if ( i === query.length ) { break; }
            c = query.charCodeAt(i);
            if ( c === 0x20 /* whitespace */ ) {
                i += 1;
                continue;
            }
            // Dot accessor syntax
            if ( c === 0x2E /* . */ ) {
                if ( mv !== this.#UNDEFINED ) { return; }
                if ( query.startsWith('..', i) ) {
                    mv = this.#DESCENDANTS;
                    i += 2;
                } else {
                    mv = this.#CHILDREN;
                    i += 1;
                }
                continue;
            }
            if ( c === 0x3B /* ; */ ) {
                if ( query.startsWith(';$', i) === false ) { return; }
                steps.push(
                    { mv: this.#QUANTIFIER, min: 1, max: 1e6 },
                    { mv: this.#ROOT }
                );
                i += 2;
                mv = this.#UNDEFINED;
                continue;
            }
            if ( c === 0x7B /* { */ ) {
                const match = this.#reQuantifier.exec(query.slice(i));
                if ( match === null ) { return; }
                const comma = match[1].indexOf(',');
                let min, max;
                if ( comma === -1 ) {
                    min = max = parseInt(match[1]);
                } else {
                    min = parseInt(match[1].slice(0, comma)) || 0;
                    max = parseInt(match[1].slice(comma+1)) || 1e6;
                }
                steps.push(
                    { mv: this.#QUANTIFIER, min, max },
                    { mv: this.#ROOT }
                );
                i += match[0].length;
                mv = this.#UNDEFINED;
                continue;
            }
            if ( c !== 0x5B /* [ */ ) {
                if ( mv === this.#UNDEFINED ) {
                    const step = steps.at(-1);
                    if ( step === undefined ) { return; }
                    const j = this.#compileExpr(query, step, i);
                    if ( j ) { i = j; }
                    break;
                }
                const r = this.#consumeUnquotedIdentifier(query, i);
                if  ( r === undefined ) { return; }
                steps.push({ mv, k: r.s });
                i = r.i;
                mv = this.#UNDEFINED;
                continue;
            }
            // Bracket accessor syntax
            if ( mv === this.#CHILDREN ) { return; }
            if ( query.startsWith('[?', i) ) {
                const not = query.charCodeAt(i+2) === 0x21 /* ! */ ? 1 : 0;
                const j = i + 2 + not;
                const r = this.#compile(query, j);
                if ( r === undefined ) { return; }
                if ( query.startsWith(']', r.i) === false ) { return; }
                if ( not ) { r.steps.at(-1).not = true; }
                steps.push({ mv: mv || this.#CHILDREN, steps: r.steps });
                i = r.i + 1;
                mv = this.#UNDEFINED;
                continue;
            }
            if ( query.startsWith('[*]', i) ) {
                mv ||= this.#CHILDREN;
                steps.push({ mv, k: '*' });
                i += 3;
                mv = this.#UNDEFINED;
                continue;
            }
            const r = this.#consumeIdentifier(query, i+1);
            if ( r === undefined ) { return; }
            mv ||= this.#CHILDREN;
            steps.push({ mv, k: r.s });
            i = r.i + 1;
            mv = this.#UNDEFINED;
        }
        if ( steps.length === 0 ) { return; }
        if ( mv !== this.#UNDEFINED ) { return; }
        return { steps, i };
    }
    #evaluate(steps, pathin) {
        let resultset = [];
        if ( Array.isArray(steps) === false ) { return resultset; }
        for ( const step of steps ) {
            switch ( step.mv ) {
            case this.#ROOT:
                resultset = [ [ '$' ] ];
                break;
            case this.#CURRENT:
                if ( step.op ) {
                    const { obj, key } = this.#resolvePath(pathin);
                    if ( obj === undefined ) { return []; }
                    const outcome = this.#evaluateExpr(step, obj, key);
                    if ( outcome !== true ) { break; }
                }
                resultset = [ pathin ];
                break;
            case this.#CHILDREN:
            case this.#DESCENDANTS: {
                if ( resultset.length === 0 ) { break; }
                resultset = this.#getMatches(resultset, step);
                break;
            }
            case this.#QUANTIFIER: {
                const { length } = resultset;
                if ( length < step.min || length > step.max ) { return []; }
                resultset = [];
                break;
            }
            default:
                break;
            }
        }
        return resultset;
    }
    #getMatches(listin, step) {
        const listout = [];
        for ( const pathin of listin ) {
            const { value: owner } = this.#resolvePath(pathin);
            if ( owner === undefined ) { continue; }
            if ( step.steps ) {
                this.#getMatchesFromExpr(pathin, step, owner, listout);
                continue;
            }
            const iter = this.#expandKey(owner, step.k);
            if ( iter ) {
                for ( const k of iter ) {
                    const outcome = this.#evaluateExpr(step, owner, k);
                    if ( outcome !== true ) { continue; }
                    listout.push([ ...pathin, k ]);
                }
            }
            if ( step.mv !== this.#DESCENDANTS ) { continue; }
            for ( const { obj, key, path } of this.#getDescendants(owner, true) ) {
                const iter = this.#expandKey(obj[key], step.k);
                if ( iter === undefined ) { continue; }
                for ( const k of iter ) {
                    const outcome = this.#evaluateExpr(step, obj[key], k);
                    if ( outcome !== true ) { continue; }
                    listout.push([ ...pathin, ...path, k ]);
                }
            }
        }
        return listout;
    }
    #expandKey(owner, k) {
        if ( typeof owner !== 'object' || owner === null ) { return; }
        if ( Array.isArray(k) ) {
            const out = [];
            for ( const a of k ) {
                const iter = this.#expandKey(owner, a);
                if ( iter === undefined ) { continue; }
                out.push(...iter);
            }
            return out;
        }
        if ( typeof k === 'number' ) {
            if ( Array.isArray(owner) === false ) { return; }
            return [ k >= 0 ? k : owner.length + k ];
        }
        if ( k === '*' ) {
            if ( Array.isArray(owner) ) { return owner.keys(); }
            return JSONPath.keys(owner);
        }
        if ( k instanceof JSONPath.Regex ) {
            const out = [];
            for ( const key of JSONPath.keys(owner) ) {
                if ( k.test(key) === false ) { continue; }
                out.push(key);
            }
            return out;
        }
        return [ k ];
    }
    #getMatchesFromExpr(pathin, step, owner, out) {
        const recursive = step.mv === this.#DESCENDANTS;
        const v2 = this.#compiled.v2 || recursive || Array.isArray(owner);
        for ( const { path } of this.#getDescendants(owner, recursive) ) {
            const q = v2 ? [ ...pathin, ...path ] : pathin;
            const r = this.#evaluate(step.steps, q);
            if ( Boolean(r?.length) === false ) { continue; }
            out.push(q);
            if ( v2 === false ) { break; }
        }
    }
    #getDescendants(v, recursive) {
        const iterator = {
            next() {
                const n = this.stack.length;
                if ( n === 0 ) {
                    this.value = undefined;
                    this.done = true;
                    return this;
                }
                const details = this.stack[n-1];
                const entry = details.keys.next();
                if ( entry.done ) {
                    this.stack.pop();
                    this.path.pop();
                    return this.next();
                }
                this.path[n-1] = entry.value;
                this.value = {
                    obj: details.obj,
                    key: entry.value,
                    path: this.path.slice(),
                };
                const v = this.value.obj[this.value.key];
                if ( recursive && typeof v === 'object' && v !== null && this.seen.has(v) === false ) {
                    if ( Array.isArray(v) ) {
                        this.stack.push({ obj: v, keys: v.keys() });
                    } else {
                        this.stack.push({ obj: v, keys: JSONPath.keys(v).values() });
                    }
                    this.seen.add(v);
                }
                return this;
            },
            path: [],
            value: undefined,
            done: false,
            stack: [],
            seen: new WeakSet(),
            [Symbol.iterator]() { return this; },
        };
        if ( Array.isArray(v) ) {
            iterator.stack.push({ obj: v, keys: v.keys() });
        } else if ( typeof v === 'object' && v !== null ) {
            iterator.stack.push({ obj: v, keys: JSONPath.keys(v).values() });
        }
        return iterator;
    }
    #consumeIdentifier(query, i) {
        const keys = [];
        let needIdentifier = true;
        while ( i < query.length ) {
            const c0 = query.charCodeAt(i);
            if ( c0 === 0x5D /* ] */ ) { break; }
            if ( c0 === 0x20 /* SPACE */ ) {
                i += 1;
                continue;
            }
            if ( c0 === 0x2C /* , */ ) {
                if ( needIdentifier ) { return; }
                i += 1;
                needIdentifier = true;
                continue;
            }
            if ( c0 === 0x22 /* " */ || c0 === 0x27 /* ' */ ) {
                const r = this.#untilChar(query, c0, i+1);
                if ( r === undefined ) { return; }
                keys.push(r.s);
                i = r.i;
                needIdentifier = false;
                continue;
            }
            if ( c0 === 0x2D /* - */ || c0 >= 0x30 && c0 <= 0x39 ) {
                const match = this.#reIndice.exec(query.slice(i));
                if ( match === null ) { return; }
                const indice = parseInt(query.slice(i), 10);
                keys.push(indice);
                i += match[0].length;
                needIdentifier = false;
                continue;
            }
            if ( this.v2 ) { return; }
            const r = this.#consumeUnquotedIdentifier(query, i);
            if ( r === undefined ) { return; }
            keys.push(r.s);
            i = r.i;
        }
        if ( needIdentifier ) { return; }
        return { s: keys.length === 1 ? keys[0] : keys, i };
    }
    #consumeUnquotedIdentifier(query, i) {
        if ( query.charCodeAt(i) === 0x2F /* / */ ) {
            const r = this.#untilChar(query, 0x2F, i+1);
            if ( r === undefined ) { return; }
            let re;
            try { re = new JSONPath.Regex(r.s); } catch { return; }
            return { s: re, i: r.i };
        }
        const match = this.#reUnquotedIdentifier.exec(query.slice(i));
        if ( match === null ) { return; }
        return { s: match[0], i: i + match[0].length };
    }
    #untilChar(query, targetCharCode, i) {
        const len = query.length;
        const parts = [];
        let beg = i, end = i;
        for (;;) {
            if ( end === len ) { return; }
            const c = query.charCodeAt(end);
            if ( c === targetCharCode ) {
                parts.push(query.slice(beg, end));
                end += 1;
                break;
            }
            if ( c === 0x5C /* \ */ && (end+1) < len ) {
                const d = query.charCodeAt(end+1);
                if ( d === targetCharCode ) {
                    parts.push(query.slice(beg, end));
                    end += 1;
                    beg = end;
                }
            }
            end += 1;
        }
        return { s: parts.join(''), i: end };
    }
    #compileExpr(query, step, i) {
        if ( query.startsWith('=/', i) ) {
            const r = this.#untilChar(query, 0x2F /* / */, i+2);
            if ( r === undefined ) { return i; }
            const match = /^[i]/.exec(query.slice(r.i));
            try {
                step.rval = new JSONPath.Regex(r.s, match && match[0] || undefined);
            } catch { return; }
            step.op = 're';
            if ( match ) { r.i += match[0].length; }
            return r.i;
        }
        const match = this.#reExpr.exec(query.slice(i));
        if ( match === null ) { return; }
        const op = match[1], rval = match[2];
        if ( rval.charCodeAt(0) === 0x27 /* ' */ ) {
            const r = this.#untilChar(rval, 0x27, 1);
            if ( r === undefined ) { return; }
            step.rval = r.s;
            step.op = op;
        } else {
            try {
                step.rval = JSON.parse(rval);
                step.op = op;
            } catch { return; }
        }
        return i + match[0].length - 1;
    }
    #resolvePath(path) {
        if ( path.length === 0 ) { return { value: this.#root }; }
        const key = path.at(-1);
        let obj = this.#root
        for ( let i = 0, n = path.length-1; i < n; i++ ) {
            obj = obj[path[i]];
            if ( obj instanceof Object === false ) { return {}; }
        }
        return { obj, key, value: obj[key] };
    }
    #evaluateExpr(step, owner, k) {
        if ( owner === undefined || owner === null ) { return; }
        const hasOwn = owner[k] !== undefined || JSONPath.hasOwn(owner, k);
        if ( step.op !== undefined && hasOwn === false ) { return; }
        const target = step.not !== true;
        const v = owner[k];
        switch ( step.op ) {
        case '==': return (v === step.rval) === target;
        case '!=': return (v !== step.rval) === target;
        case  '<': return (v < step.rval) === target;
        case '<=': return (v <= step.rval) === target;
        case  '>': return (v > step.rval) === target;
        case '>=': return (v >= step.rval) === target;
        case '^=': return `${v}`.startsWith(step.rval) === target;
        case '$=': return `${v}`.endsWith(step.rval) === target;
        case '*=': return `${v}`.includes(step.rval) === target;
        case 're': return step.rval.test(`${v}`);
        default: break;
        }
        return hasOwn === target;
    }
    #modifyVal(obj, key) {
        let { modify, rval } = this.#compiled;
        if ( typeof rval === 'string' ) {
            rval = rval.replace('${now}', `${Date.now()}`);
        }
        switch ( modify ) {
        case undefined:
            obj[key] = rval;
            break;
        case '+': {
            if ( rval instanceof Object === false ) { return; }
            const lval = obj[key];
            if ( lval instanceof Object === false ) { return; }
            if ( Array.isArray(lval) ) {
                if ( Array.isArray(rval) ) {
                    lval.push(...rval); break;
                }
                lval.push(rval); break;
            }
            for ( const [ k, v ] of JSONPath.entries(rval) ) {
                lval[k] = v;
            }
            break;
        }
        case 'call': {
            const entries = rval.slice();
            if ( entries.length < 2 ) { break; }
            entries.forEach((a, i, aa) => {
                if ( a === '${obj}' ) { aa[i] = obj; }
                else if ( a === '${key}' ) { aa[i] = key; }
                else if ( a === '${val}' ) { aa[i] = obj[key]; }
            });
            const instance = entries[0] ?? self;
            instance[entries[1]](...entries.slice(2));
            break;
        }
        case 'repl': {
            const lval = obj[key];
            if ( typeof lval !== 'string' ) { return; }
            if ( this.#compiled.re === undefined ) {
                this.#compiled.re = null;
                try {
                    this.#compiled.re = rval.regex !== undefined
                        ? new JSONPath.Regex(rval.regex, rval.flags)
                        : new JSONPath.Regex(rval.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                } catch { }
            }
            if ( this.#compiled.re === null ) { return; }
            obj[key] = lval.replace(this.#compiled.re, rval.replacement);
            break;
        }
        default:
            break;
        }
    }
}

  // Busca el dueño de una cadena "a.b.c" para envolver el método c
  const resolveChain = (chain) => {
    chain = String(chain || '').replace(/^(window|globalThis|self)\./, '');
    const parts = chain.split('.');
    const prop = parts.pop();
    let owner = W;
    for (const p of parts) { owner = owner?.[p]; if (owner === undefined || owner === null) return null; }
    return { owner, prop };
  };

  // ---- setTimeout / setInterval ----------------------------------------
  const delayMatch = (spec) => {
    if (spec === undefined || spec === '' || spec === '*') return () => true;
    let neg = false;
    if (spec.startsWith('!')) { neg = true; spec = spec.slice(1); }
    const n = parseInt(spec, 10);
    return d => ((d | 0) === n) !== neg;
  };
  const timerDefuser = (name) => (needleArg, delayArg) => {
    const nm = needle(needleArg || '');
    const dm = delayMatch(delayArg);
    const matchAll = !needleArg || needleArg === '*' || needleArg === '/^/';
    wrap(W, name, {
      apply(t, self, a) {
        const s = typeof a[0] === 'function' ? fnStr(a[0]) : String(a[0]);
        if ((matchAll || nm(s)) && dm(a[1])) { a[0] = function () {}; }
        return Reflect_apply(t, self, a);
      },
    });
  };
  const timerBooster = (name) => (needleArg, delayArg, boostArg) => {
    const nm = needle(needleArg || '');
    const target = delayArg === '*' ? null : parseInt(delayArg || '1000', 10);
    let boost = parseFloat(boostArg || '0.05');
    if (!(boost >= 0.001 && boost <= 50)) boost = 0.05;
    wrap(W, name, {
      apply(t, self, a) {
        const s = typeof a[0] === 'function' ? fnStr(a[0]) : String(a[0]);
        if (nm(s) && (target === null || (a[1] | 0) === target)) a[1] = (a[1] | 0) * boost;
        return Reflect_apply(t, self, a);
      },
    });
  };

  const abortProp = (chain, mode) => {
    trapChain(chain, (owner, prop) => {
      const d = Object.getOwnPropertyDescriptor(owner, prop);
      if (d && d.configurable === false) return;
      let value = owner[prop];
      try {
        Object.defineProperty(owner, prop, {
          configurable: false,
          get() { if (mode === 'read') throw new ReferenceError(magic); return value; },
          set(v) { if (mode === 'write') throw new ReferenceError(magic); value = v; },
        });
      } catch {}
    });
  };

  const currentScriptAbort = (chain, needleArg, ctxArg, inlineOnly) => {
    const nm = needleArg ? toRe(needleArg) : null;
    const thisScript = document.currentScript;
    chain = String(chain).replace(/^(window|globalThis|self)\./, '');
    const parts = chain.split('.');
    const prop = parts.pop();
    let owner = W;
    for (const p of parts) { owner = owner?.[p]; if (owner === undefined || owner === null) return; }
    const d = Object.getOwnPropertyDescriptor(owner, prop);
    if (d && d.configurable === false) return;
    let value = owner[prop];
    const check = () => {
      const e = document.currentScript;
      if (!(e instanceof HTMLScriptElement) || e === thisScript) return;
      if (inlineOnly && e.src) return;
      const text = e.src && !inlineOnly ? e.src + '\n' + e.textContent : e.textContent;
      if (nm && !nm.test(text)) return;
      throw new ReferenceError(magic);
    };
    try {
      Object.defineProperty(owner, prop, {
        configurable: true,
        get() { check(); return d && d.get ? d.get.call(owner) : value; },
        set(v) { check(); if (d && d.set) d.set.call(owner, v); else value = v; },
      });
    } catch {}
  };

  const fakeWindow = () => {
    const noop = function () {};
    const handler = {
      get(t, p) {
        if (p === 'closed') return false;
        if (p === 'window' || p === 'self' || p === 'top' || p === 'parent' || p === 'opener') return proxy;
        if (p === 'document') return document.implementation.createHTMLDocument('');
        if (p === Symbol.toPrimitive) return () => '';
        return proxy;
      },
      set() { return true; },
      apply() { return proxy; },
    };
    const proxy = new Proxy(noop, handler);
    return proxy;
  };

  const queryAll = (sel, root = document) => {
    const parts = sel.split('>>>').map(s => s.trim());
    let roots = [root];
    for (let i = 0; i < parts.length; i++) {
      const found = [];
      for (const r of roots) { try { found.push(...r.querySelectorAll(parts[i])); } catch {} }
      if (i === parts.length - 1) return found;
      roots = found.map(e => e.shadowRoot).filter(Boolean);
    }
    return [];
  };

  const setStorage = (store, key, value, trusted) => {
    if (!key) return;
    let s;
    try { s = W[store]; } catch { return; }
    if (value === '$remove$' || value === 'undefined') { try { s.removeItem(key); } catch {} return; }
    let v = value;
    if (trusted) v = v.replace('$now$', String(Date.now())).replace('$currentDate$', new Date().toString()).replace('$currentISODate$', new Date().toISOString());
    else {
      const pv = parseValue(value, false);
      if (!pv) return;
      v = pv.fresh ? JSONstringify(pv.fresh()) : String(pv.v);
    }
    try { if (s.getItem(key) !== v) s.setItem(key, v); } catch {}
  };

  const domEdit = (selDefault, fn, behavior) => {
    const run = () => { for (const el of queryAll(selDefault)) { try { fn(el); } catch {} } };
    if (behavior && /complete/.test(behavior)) { W.addEventListener('load', run, { once: true }); return; }
    observe(run, true);
  };

  // Trusted Types: sitios como YouTube exigen que el texto de un <script> pase por una política
  // registrada; sin esto el navegador bloquea la asignación (misma solución que uBlock Origin).
  let ttPolicy;
  const scriptText = (s) => {
    if (ttPolicy === undefined) {
      ttPolicy = null;
      try {
        const tt = W.trustedTypes;
        if (tt && typeof tt.getPropertyType === 'function' && tt.getPropertyType('script', 'textContent') === 'TrustedScript') {
          ttPolicy = tt.createPolicy('grts-' + magic, { createScript: (x) => x });
        }
      } catch {}
    }
    return ttPolicy ? ttPolicy.createScript(s) : s;
  };

  const nodeText = (nodeName, matchFn, editFn) => {
    const nn = String(nodeName || '').toUpperCase();
    const nameMatch = /^\/.*\/$/.test(nodeName) ? (n => toRe(nodeName).test(n.nodeName)) : (n => n.nodeName === nn);
    const handle = n => {
      if (!nameMatch(n)) return;
      const t = n.textContent;
      if (!matchFn(t)) return;
      const out = editFn(t);
      if (out !== t) { try { n.textContent = n.nodeName === 'SCRIPT' ? scriptText(out) : out; } catch {} }
    };
    const scan = root => {
      if (!root) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      for (let n = walker.currentNode; n; n = walker.nextNode()) handle(n);
    };
    const mo = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) { handle(n); if (n.nodeType === 1 && n.firstChild) scan(n); }
    });
    mo.observe(document, { childList: true, subtree: true });
    scan(document.documentElement);
    W.addEventListener('load', () => setTimeout(() => mo.disconnect(), 10000), { once: true });
  };

  // =====================================================================
  return {
    'set-constant'(chain, raw, ...extra) {
      const pv = parseValue(raw ?? '', true);
      if (!pv || !chain) return;
      const value = pv.v;
      trapChain(chain, (owner, prop) => {
        const d = Object.getOwnPropertyDescriptor(owner, prop);
        if (d && d.configurable === false) return;
        if (extra.includes('asFunction')) {
          try { Object.defineProperty(owner, prop, { configurable: false, get: () => () => value, set() {} }); } catch {}
          return;
        }
        try { Object.defineProperty(owner, prop, { configurable: false, enumerable: true, get: () => value, set() {} }); } catch {}
      });
    },
    'abort-on-property-read'(chain) { if (chain) abortProp(chain, 'read'); },
    'abort-on-property-write'(chain) { if (chain) abortProp(chain, 'write'); },
    'abort-current-script'(chain, nd, ctx) { if (chain) currentScriptAbort(chain, nd, ctx, false); },
    'abort-current-inline-script'(chain, nd) { if (chain) currentScriptAbort(chain, nd, null, true); },
    'abort-on-stack-trace'(chain, nd) {
      if (!chain) return;
      const nm = toRe(nd || '');
      trapChain(chain, (owner, prop) => {
        const d = Object.getOwnPropertyDescriptor(owner, prop);
        if (d && d.configurable === false) return;
        let value = owner[prop];
        const check = () => {
          const st = new Error().stack || '';
          if (nm.test(st.split('\n').slice(2).join('\n'))) throw new ReferenceError(magic);
        };
        try {
          Object.defineProperty(owner, prop, { configurable: true, get() { check(); return value; }, set(v) { check(); value = v; } });
        } catch {}
      });
    },
    'no-fetch-if'(props, responseBody) { S._fetchBlock(props, responseBody, false); },
    'prevent-fetch'(props, responseBody) { S._fetchBlock(props, responseBody || 'emptyObj', true); },
    _fetchBlock(props, responseBody, matchAll) {
      const m = propsMatcher(props, matchAll);
      if (!m) return;
      wrap(W, 'fetch', {
        apply(t, self, a) {
          const det = fetchDetails(a[0], a[1]);
          if (m(det)) return Promise.resolve(fakeResponse(bodyFor(responseBody), det.url));
          return Reflect_apply(t, self, a);
        },
      });
    },
    'no-xhr-if'(props, body) { S._xhrBlock(props, body, false); },
    'prevent-xhr'(props, body) { S._xhrBlock(props, body, true); },
    _xhrBlock(props, body, matchAll) {
      const m = propsMatcher(props, matchAll);
      if (!m) return;
      const blocked = new WeakMap();
      const P = XMLHttpRequest.prototype;
      wrap(P, 'open', {
        apply(t, x, a) {
          let url = String(a[1]);
          try { url = new URL(url, location.href).href; } catch {}
          if (m({ method: String(a[0] || 'GET'), url })) blocked.set(x, url); else blocked.delete(x);
          return Reflect_apply(t, x, a);
        },
      });
      wrap(P, 'send', {
        apply(t, x, a) {
          if (!blocked.has(x)) return Reflect_apply(t, x, a);
          const txt = body && body !== 'true' ? bodyFor(body) : '';
          const resp = x.responseType === 'json' ? JSONparse(txt || 'null') : (x.responseType === '' || x.responseType === 'text' ? txt : null);
          try {
            Object.defineProperties(x, {
              readyState: { value: 4, configurable: true }, status: { value: 200, configurable: true },
              statusText: { value: 'OK', configurable: true }, response: { value: resp, configurable: true },
              responseText: { value: txt, configurable: true }, responseURL: { value: blocked.get(x), configurable: true },
            });
          } catch {}
          setTimeout(() => { for (const ev of ['readystatechange', 'load', 'loadend']) x.dispatchEvent(new Event(ev)); }, 1);
        },
      });
    },
    'no-window-open-if'(nd, delay, decoy) { S._woif(nd || '', true); },
    'prevent-window-open'(nd) {
      if (nd === '0' || nd === '1' || nd === undefined) { S._woif('', true); return; }
      S._woif(nd, true);
    },
    _woif(nd, all) {
      const nm = needle(nd);
      wrap(W, 'open', {
        apply(t, self, a) {
          const url = String(a[0] ?? '');
          if ((nd === '' && all) || nm(url)) return fakeWindow();
          return Reflect_apply(t, self, a);
        },
      });
    },
    'no-setTimeout-if': timerDefuser('setTimeout'),
    'no-setInterval-if': timerDefuser('setInterval'),
    'adjust-setTimeout': timerBooster('setTimeout'),
    'adjust-setInterval': timerBooster('setInterval'),
    'prevent-addEventListener'(typeArg, nd) {
      const tre = typeArg ? toRe(/^\/.*\/$/.test(typeArg) ? typeArg : '/^' + typeArg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$/') : null;
      const nm = nd ? needle(nd) : null;
      wrap(EventTarget.prototype, 'addEventListener', {
        apply(t, self, a) {
          let h = a[1];
          const hs = typeof h === 'function' ? fnStr(h) : (h && typeof h.handleEvent === 'function' ? fnStr(h.handleEvent) : String(h));
          if ((!tre || tre.test(String(a[0]))) && (!nm || nm(hs))) return;
          return Reflect_apply(t, self, a);
        },
      });
    },
    'json-prune'(rm, req, ...rest) {
      const pr = makePruner(rm, req);
      if (!pr) return;
      wrap(JSON, 'parse', { apply(t, self, a) { return pr(Reflect_apply(t, self, a)); } });
      wrap(Response.prototype, 'json', { apply(t, self, a) { return Reflect_apply(t, self, a).then(o => pr(o)); } });
    },
    'json-prune-fetch-response'(rm, req, ...rest) {
      const pr = makePruner(rm, req);
      if (!pr) return;
      const v = varArgs(rest);
      const m = propsMatcher(v.propsToMatch, true);
      hookFetch();
      fetchTransforms.push({ match: m, fn: txt => { let o; try { o = JSONparse(txt); } catch { return txt; } return JSONstringify(pr(o)); } });
    },
    'json-prune-xhr-response'(rm, req, ...rest) {
      const pr = makePruner(rm, req);
      if (!pr) return;
      const v = varArgs(rest);
      const m = propsMatcher(v.propsToMatch, true);
      hookXhr();
      xhrTransforms.push((val, info, type) => {
        if (!m(info)) return val;
        if (type === 'json' && val && typeof val === 'object') return pr(val);
        if (typeof val !== 'string') return val;
        try { return JSONstringify(pr(JSONparse(val))); } catch { return val; }
      });
    },
    'trusted-replace-fetch-response'(pattern, repl, props) {
      const r = textReplacer(pattern, repl);
      if (!r) return;
      hookFetch();
      fetchTransforms.push({ match: propsMatcher(props, true), fn: r });
    },
    'trusted-replace-xhr-response'(pattern, repl, props) {
      const r = textReplacer(pattern, repl);
      if (!r) return;
      const m = propsMatcher(props, true);
      hookXhr();
      xhrTransforms.push((val, info, type) => (m(info) && typeof val === 'string') ? r(val) : val);
    },
    // ---- Scriptlets con JSONPath (portados de uBlock Origin) ----------
    'trusted-edit-inbound-object'(chain, argPos, jsonq) {
      const jsonp = JSONPath.create(String(jsonq ?? ''));
      if (!jsonp.valid) return;
      const pos = parseInt(argPos, 10);
      if (isNaN(pos)) return;
      const r = resolveChain(chain);
      if (!r) return;
      wrap(r.owner, r.prop, {
        apply(t, self, a) {
          const i = pos >= 0 ? pos : a.length + pos;
          const obj = i >= 0 && i < a.length ? a[i] : undefined;
          if (obj !== null && typeof obj === 'object') {
            let clone;
            try { clone = structuredClone(obj); } catch {}
            if (clone !== null && typeof clone === 'object') {
              try { const after = jsonp.apply(clone); if (after) a[i] = after; } catch {}
            }
          }
          return Reflect_apply(t, self, a);
        },
      });
    },
    'json-edit-fetch-response'(jsonq, ...rest) { S._jefr(false, jsonq, rest); },
    'trusted-json-edit-fetch-response'(jsonq, ...rest) { S._jefr(true, jsonq, rest); },
    _jefr(trusted, jsonq, rest) {
      const jsonp = JSONPath.create(String(jsonq ?? ''));
      if (!jsonp.valid || (jsonp.value !== undefined && !trusted)) return;
      const v = varArgs(rest);
      const m = propsMatcher(v.propsToMatch, true);
      hookFetch();
      fetchTransforms.push({ match: m, fn: (txt) => {
        let o;
        try { o = JSONparse(txt); } catch { return txt; }
        if (o === null || typeof o !== 'object') return txt;
        let after;
        try { after = jsonp.apply(o); } catch { return txt; }
        if (after === undefined) return txt;
        return JSONstringify(after);
      } });
    },
    // Evita que la página consiga fetch/Request "limpios" desde un iframe vacío
    'trusted-prevent-dom-bypass'(chain, targetProp) {
      const r = resolveChain(chain);
      if (!r) return;
      wrap(r.owner, r.prop, {
        apply(t, self, a) {
          const elems = a.filter((e) => e instanceof HTMLElement);
          const ret = Reflect_apply(t, self, a);
          for (const elem of elems) {
            try {
              if (`${elem.contentWindow}` !== '[object Window]') continue;
              const href = elem.contentWindow.location.href;
              if (href !== 'about:blank' && href !== W.location.href) continue;
              if (targetProp) {
                for (let path of String(targetProp).split(/\s+/)) {
                  let me = W, it = elem.contentWindow;
                  for (;;) {
                    const dot = path.indexOf('.');
                    if (dot === -1) break;
                    const prop = path.slice(0, dot);
                    me = me[prop]; it = it[prop];
                    path = path.slice(dot + 1);
                  }
                  it[path] = me[path];
                }
              } else {
                Object.defineProperty(elem, 'contentWindow', { value: W });
              }
            } catch {}
          }
          return ret;
        },
      });
    },
    'remove-attr'(attrs, sel, behavior) {
      const list = String(attrs || '').split('|').map(s => s.trim()).filter(Boolean);
      if (!list.length) return;
      domEdit(sel || list.map(a => `[${CSS.escape(a)}]`).join(','), el => list.forEach(a => el.removeAttribute(a)), behavior);
    },
    'remove-class'(classes, sel, behavior) {
      const list = String(classes || '').split('|').map(s => s.trim()).filter(Boolean);
      if (!list.length) return;
      domEdit(sel || list.map(c => '.' + CSS.escape(c)).join(','), el => el.classList.remove(...list), behavior);
    },
    'set-cookie'(name, value, offsetOrPath, path) {
      if (!name) return;
      let v = String(value ?? '');
      v = v.replace('$now$', String(Date.now())).replace('$currentDate$', new Date().toUTCString());
      let expires = '';
      const off = /^\d+$/.test(offsetOrPath || '') ? parseInt(offsetOrPath, 10) : ({ '1day': 86400, '1year': 31536000 })[offsetOrPath];
      if (off) expires = '; expires=' + new Date(Date.now() + off * 1000).toUTCString();
      const p = (path || (!off && offsetOrPath && offsetOrPath.startsWith('/') ? offsetOrPath : '/'));
      const cur = document.cookie.split(/;\s*/).find(c => c.startsWith(encodeURIComponent(name) + '='));
      if (cur && cur.split('=').slice(1).join('=') === v) return;
      try { document.cookie = `${encodeURIComponent(name)}=${v}${expires}; path=${p === 'none' ? '/' : p}`; } catch {}
    },
    'remove-cookie'(nd) {
      const nm = toRe(nd || '');
      const run = () => {
        for (const c of document.cookie.split(/;\s*/)) {
          const name = c.split('=')[0];
          if (!name || !nm.test(name)) continue;
          const parts = location.hostname.split('.');
          for (let i = 0; i < parts.length; i++) {
            const dom = parts.slice(i).join('.');
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${dom}`;
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${dom}`;
          }
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        }
      };
      run();
      W.addEventListener('beforeunload', run);
      document.addEventListener('visibilitychange', run);
    },
    'set-local-storage-item'(key, value) { setStorage('localStorage', key, value ?? '', true); },
    'set-session-storage-item'(key, value) { setStorage('sessionStorage', key, value ?? '', true); },
    'click-element'(selectors, extra, delayArg) {
      if (!selectors) return;
      if (extra) {
        for (const cond of String(extra).split(',').map(s => s.trim()).filter(Boolean)) {
          const neg = cond.startsWith('!');
          const m = /^!?cookie:(.+)$/.exec(cond);
          if (!m) continue;
          const re = toRe(m[1]);
          const has = document.cookie.split(/;\s*/).some(c => re.test(c.split('=')[0]) || re.test(c));
          if (has === neg) return;
        }
      }
      const list = String(selectors).split(/,\s*(?![^[]*\])/).map(s => s.trim()).filter(Boolean);
      const delay = Math.max(0, parseInt(delayArg || '0', 10) || 0);
      const deadline = Date.now() + 10000;
      let idx = 0;
      const tick = () => {
        if (idx >= list.length || Date.now() > deadline) return;
        const el = queryAll(list[idx])[0];
        if (el) {
          setTimeout(() => { try { el.click(); } catch {} }, delay);
          idx++;
          setTimeout(tick, Math.max(delay, 50) + 50);
          return;
        }
        setTimeout(tick, 200);
      };
      domReady(() => setTimeout(tick, delay));
    },
    'remove-node-text'(nodeName, nd) {
      if (!nodeName) return;
      const re = toRe(nd || '');
      nodeText(nodeName, t => re.test(t), () => '');
    },
    'replace-node-text'(nodeName, pattern, repl, ...rest) {
      if (!nodeName || !pattern) return;
      const v = varArgs(rest);
      const re = toRe(pattern);
      const cond = v.condition ? toRe(v.condition) : null;
      nodeText(nodeName, t => (!cond || cond.test(t)) && re.test(t), t => t.replace(re, repl ?? ''));
    },
    'prevent-element-src-loading'(tag, nd) {
      if (!tag || !nd) return;
      const re = toRe(nd);
      const map = {
        script: ['HTMLScriptElement', 'data:text/javascript;base64,KCk9Pnt9'],
        img: ['HTMLImageElement', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='],
        iframe: ['HTMLIFrameElement', 'data:text/html;base64,PGRpdj48L2Rpdj4='],
        link: ['HTMLLinkElement', 'data:text/plain;base64,'],
      };
      const entry = map[String(tag).toLowerCase()];
      if (!entry) return;
      const [ctor, safe] = entry;
      const proto = W[ctor]?.prototype;
      if (!proto) return;
      const prop = ctor === 'HTMLLinkElement' ? 'href' : 'src';
      const d = Object.getOwnPropertyDescriptor(proto, prop);
      if (d && d.set) {
        Object.defineProperty(proto, prop, { configurable: true, enumerable: true, get: d.get, set: cloak(function (v) { return d.set.call(this, re.test(String(v)) ? safe : v); }, d.set) });
      }
      wrap(Element.prototype, 'setAttribute', {
        apply(t, el, a) {
          if (el instanceof W[ctor] && String(a[0]).toLowerCase() === prop && re.test(String(a[1]))) a = [a[0], safe];
          return Reflect_apply(t, el, a);
        },
      });
    },
    'nowebrtc'() {
      const fake = function () { return fakeWindow(); };
      for (const k of ['RTCPeerConnection', 'webkitRTCPeerConnection']) if (W[k]) { try { W[k] = cloak(fake, W[k]); } catch {} }
    },
    'prevent-eval-if'(nd) {
      const nm = needle(nd || '');
      wrap(W, 'eval', { apply(t, self, a) { if (nm(String(a[0]))) return; return Reflect_apply(t, self, a); } });
    },
    'href-sanitizer'(sel, source) {
      if (!sel) return;
      const fix = el => {
        let url = '';
        if (!source || source === 'text') url = el.textContent.trim();
        else if (source.startsWith('[')) url = el.getAttribute(source.slice(1, -1)) || '';
        else if (source.startsWith('?')) { try { url = new URL(el.href).searchParams.get(source.slice(1)) || ''; } catch {} }
        if (/^https?:\/\//.test(url)) el.setAttribute('href', url);
      };
      domEdit(sel, fix);
    },
    'popads-dummy'() { S['set-constant']('PopAds', 'emptyObj'); S['set-constant']('popns', 'emptyObj'); },
    'prevent-refresh'() {
      domReady(() => { for (const m of document.querySelectorAll('meta[http-equiv="refresh" i]')) m.remove(); });
    },
  };
})();
