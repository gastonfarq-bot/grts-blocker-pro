/* Motor cosmético de GRTS Blocker Pro (mundo aislado de la extensión). */
(() => {
  'use strict';
  if (globalThis.__mbEngine) return;
  globalThis.__mbEngine = true;

  const hostname = (() => {
    if (location.hostname) return location.hostname;
    try { return new URL(location.ancestorOrigins[0]).hostname; } catch { return ''; }
  })().toLowerCase().replace(/\.$/, '');
  if (!hostname) return;

  // Claves que aplican a este sitio: el host, sus dominios padre y formas "entidad" (google.*)
  const keys = (() => {
    const labels = hostname.split('.');
    const out = new Set();
    for (let i = 0; i < labels.length; i++) {
      out.add(labels.slice(i).join('.'));
      for (let j = i + 1; j < labels.length; j++) out.add(labels.slice(i, j).join('.') + '.*');
    }
    return [...out];
  })();

  const hide = new Set(), unhide = new Set(), procs = new Set(), cssInject = new Set(), genericEx = new Set();
  let genericCss = '';
  let genericHideOff = false, genericRequested = false;

  let styleEl = null;
  const writeStyle = () => {
    const sels = [...hide].filter(s => !unhide.has(s));
    let css = genericCss;
    for (const s of sels) css += s + '{display:none!important}\n';
    for (const c of cssInject) css += c + '\n';
    if (!css) return;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.setAttribute('media', 'all');
    }
    styleEl.textContent = css;
    const parent = document.head || document.documentElement;
    if (parent && styleEl.parentNode !== parent) parent.appendChild(styleEl);
  };

  // ---------------- Filtros procedimentales ----------------
  const OPS = new Set(['has-text', 'upward', 'xpath', 'matches-css', 'matches-attr', 'min-text-length',
    'matches-path', 'remove', 'style', 'remove-attr', 'remove-class', 'watch-attr', 'has', 'not']);
  const PROC_RE = /:(has-text|upward|xpath|matches-css|matches-attr|min-text-length|matches-path|remove|style|remove-attr|remove-class|watch-attr)\(/;

  const findClose = (s, i, open, close) => {
    let depth = 1, q = null;
    for (; i < s.length; i++) {
      const ch = s[i];
      if (ch === '\\') { i++; continue; }
      if (q) { if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; continue; }
      if (ch === open) depth++;
      else if (ch === close && --depth === 0) return i;
    }
    return -1;
  };

  const parse = (sel) => {
    const steps = [];
    let css = '', i = 0;
    while (i < sel.length) {
      const ch = sel[i];
      if (ch === '\\') { css += sel.substr(i, 2); i += 2; continue; }
      if (ch === '[') { const j = findClose(sel, i + 1, '[', ']'); if (j < 0) return null; css += sel.slice(i, j + 1); i = j + 1; continue; }
      if (ch === '"' || ch === "'") { const j = sel.indexOf(ch, i + 1); if (j < 0) return null; css += sel.slice(i, j + 1); i = j + 1; continue; }
      if (ch === ':') {
        const m = /^:([a-z-]+)\(/.exec(sel.slice(i));
        if (m && OPS.has(m[1])) {
          const start = i + m[0].length;
          const end = findClose(sel, start, '(', ')');
          if (end < 0) return null;
          const arg = sel.slice(start, end);
          if ((m[1] === 'has' || m[1] === 'not') && !PROC_RE.test(arg)) { css += sel.slice(i, end + 1); i = end + 1; continue; }
          if (css.trim() || (css && steps.length)) steps.push({ css });
          css = '';
          let a = arg;
          if (m[1] === 'has' || m[1] === 'not') { a = parse(arg); if (!a) return null; }
          steps.push({ op: m[1], arg: a });
          i = end + 1;
          continue;
        }
      }
      css += ch; i++;
    }
    if (css.trim()) steps.push({ css });
    return steps;
  };

  const toRe = (s) => {
    s = String(s).trim();
    if (/^(['"]).*\1$/.test(s)) s = s.slice(1, -1);
    const m = /^\/(.+)\/([imsu]*)$/.exec(s);
    if (m) { try { return new RegExp(m[1], m[2]); } catch { return /(?!)/; } }
    return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  };

  const queryRel = (nodes, css, first) => {
    const out = new Set();
    const t = css.trimStart();
    if (first && nodes.length === 1 && nodes[0] === document) {
      try { for (const e of document.querySelectorAll(css.trim())) out.add(e); } catch {}
      return [...out];
    }
    const lead = t[0];
    for (const n of nodes) {
      try {
        if (css !== t || lead === '>') {
          for (const e of n.querySelectorAll(':scope ' + t)) out.add(e);
        } else if (lead === '+' || lead === '~') {
          const rest = t.slice(1).trim();
          for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
            if (s.matches(rest)) out.add(s);
            if (lead === '+') break;
          }
        } else if (n.nodeType === 1 && n.matches(t)) out.add(n);
      } catch {}
    }
    return [...out];
  };

  const evaluate = (steps, roots, relative) => {
    let nodes = roots;
    let first = !relative;
    for (const st of steps) {
      if (st.css !== undefined) {
        nodes = relative && first ? queryRel(nodes, st.css.match(/^\s*[>+~]/) ? st.css : ' ' + st.css, false) : queryRel(nodes, st.css, first);
        first = false;
        relative = false;
        continue;
      }
      if (st.op === 'matches-path') {
        if (!toRe(st.arg).test(location.pathname + location.search)) return [];
        continue;
      }
      if (first && !relative && nodes[0] === document) nodes = [...document.querySelectorAll('body *')];
      first = false;
      const a = st.arg;
      switch (st.op) {
        case 'has-text': { const re = toRe(a); nodes = nodes.filter(n => re.test(n.textContent)); break; }
        case 'min-text-length': { const n0 = parseInt(a, 10) || 0; nodes = nodes.filter(n => n.textContent.length >= n0); break; }
        case 'upward': {
          const n0 = parseInt(a, 10);
          const out = new Set();
          for (let n of nodes) {
            if (!isNaN(n0) && String(n0) === a.trim()) { for (let k = 0; k < n0 && n; k++) n = n.parentElement; }
            else { try { n = n.parentElement && n.parentElement.closest(a); } catch { n = null; } }
            if (n && n !== document.documentElement && n !== document.body) out.add(n);
          }
          nodes = [...out];
          break;
        }
        case 'xpath': {
          const out = new Set();
          for (const n of nodes) {
            try {
              const r = document.evaluate(a, n, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
              for (let k = 0; k < r.snapshotLength; k++) { const x = r.snapshotItem(k); if (x.nodeType === 1) out.add(x); }
            } catch {}
          }
          nodes = [...out];
          break;
        }
        case 'matches-css': {
          const m = /^\s*([\w-]+)\s*:\s*(.+?)\s*$/.exec(a);
          if (!m) return [];
          const re = /^\/.*\/[a-z]*$/.test(m[2]) ? toRe(m[2]) : new RegExp('^' + m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$');
          nodes = nodes.filter(n => { try { return re.test(getComputedStyle(n).getPropertyValue(m[1])); } catch { return false; } });
          break;
        }
        case 'matches-attr': {
          const m = /^\s*("?)(.+?)\1(?:\s*=\s*("?)(.*?)\3)?\s*$/.exec(a);
          if (!m) return [];
          const nre = toRe(m[2]), vre = m[4] !== undefined ? toRe(m[4]) : null;
          nodes = nodes.filter(n => [...n.attributes].some(at => nre.test(at.name) && (!vre || vre.test(at.value))));
          break;
        }
        case 'has': nodes = nodes.filter(n => evaluate(a, [n], true).length > 0); break;
        case 'not': nodes = nodes.filter(n => evaluate(a, [n], true).length === 0); break;
        case 'watch-attr': break;
        default: return { action: st.op, arg: a, nodes };
      }
    }
    return nodes;
  };

  const compiled = [];
  const handled = new WeakSet();
  const addProcs = (list) => {
    for (const p of list) {
      if (procs.has(p) || unhide.has(p)) continue;
      procs.add(p);
      const steps = parse(p);
      if (steps && steps.length) compiled.push(steps);
    }
    if (compiled.length) startProcs();
  };
  const runProcs = () => {
    for (const steps of compiled) {
      let res;
      try { res = evaluate(steps, [document], false); } catch { continue; }
      let action = 'hide', arg = '', nodes = res;
      if (res && !Array.isArray(res)) { action = res.action; arg = res.arg; nodes = res.nodes; }
      for (const n of nodes) {
        if (!n || n.nodeType !== 1 || n === document.documentElement || n === document.body) continue;
        try {
          if (action === 'remove') n.remove();
          else if (action === 'style') n.style.cssText += ';' + arg.replace(/;?\s*$/, '').split(';').map(d => d.includes('!important') ? d : d + ' !important').join(';');
          else if (action === 'remove-attr') arg.split('|').forEach(x => n.removeAttribute(x.trim()));
          else if (action === 'remove-class') n.classList.remove(...arg.split('|').map(x => x.trim()));
          else if (!handled.has(n)) { n.style.setProperty('display', 'none', 'important'); handled.add(n); }
        } catch {}
      }
    }
  };
  let procStarted = false, timer = 0;
  const startProcs = () => {
    if (procStarted) return;
    procStarted = true;
    const kick = () => { if (!timer) timer = setTimeout(() => { timer = 0; runProcs(); }, 80); };
    const mo = new MutationObserver(kick);
    const go = () => { mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true }); kick(); };
    if (document.documentElement) go(); else document.addEventListener('readystatechange', go, { once: true });
    document.addEventListener('DOMContentLoaded', kick);
    addEventListener('load', kick);
  };

  // ---------------- Datos que llegan de los fragmentos por sitio ----------------
  const ingest = (data) => {
    const newProcs = [];
    if (data['*g'] !== undefined) genericCss = data['*g'];
    for (const k of keys) {
      const e = data[k];
      if (!e) continue;
      if (e.x) for (const s of e.x) unhide.add(s);
      if (e.h) for (const s of e.h) hide.add(s);
      if (e.c) for (const s of e.c) cssInject.add(s);
      if (e.p) newProcs.push(...e.p);
      if (e.gx) for (const s of e.gx) genericEx.add(s);
      if (e.gh) genericHideOff = true;
    }
    writeStyle();
    if (newProcs.length) addProcs(newProcs);
    if ((genericEx.size || genericHideOff) && !genericRequested) {
      genericRequested = true;
      // Estos sitios no reciben la hoja genérica estática: se pide una a medida
      setTimeout(() => {
        try { chrome.runtime.sendMessage({ t: 'generic', ex: [...genericEx, ...unhide], off: genericHideOff }); } catch {}
      }, 0);
    }
  };

  const q = globalThis.__mbq || [];
  globalThis.__mbq = { push: ingest };
  for (const d of q) ingest(d);

  // ---------------- Reglas creadas por el usuario (selector de elementos) ----------------
  const applyCustom = (mine) => {
    if (!mine || !mine.length) return;
    for (const s of mine.filter((x) => !PROC_RE.test(x))) hide.add(s);
    writeStyle();
    addProcs(mine.filter((x) => PROC_RE.test(x)));
  };
  try {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['custom', 'pro'], ({ custom, pro }) => {
        if (!custom || !pro) return;
        const mine = [];
        for (const k of keys) if (custom[k]) mine.push(...custom[k]);
        applyCustom(mine);
      });
    } else {
      // mundo de scripts de usuario: se piden al service worker
      chrome.runtime.sendMessage({ t: 'customFor', keys }).then(applyCustom, () => {});
    }
  } catch {}
})();
