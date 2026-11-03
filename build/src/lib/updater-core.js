// Núcleo del actualizador: descarga las listas, las convierte y calcula qué cambió
// respecto de las reglas incluidas. Corre donde haya DOM: el documento offscreen
// en Chrome/Edge o la página de fondo en Firefox.
import { Network, ruleKey, groupKey, groupMetaFromRule, groupRule, normHost } from './net.js';
import { Cosmetic, readList, COSMETIC_RE } from './cosmetic.js';
import { idbSet, idbGet } from './idb.js';

const RULESETS = ['ads', 'privacy', 'annoyances', 'regional'];
let frag = null;
const cssOk = (sel) => {
  frag ||= document.createDocumentFragment();
  try { frag.querySelector(sel); return true; } catch { return false; }
};

async function fetchText(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) {
        const t = await r.text();
        if (t.length > 1000) return t;
      }
    } catch {}
    await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
  }
  throw new Error('download|' + url.split('/').slice(-2).join('/'));
}

export async function run(sources) {
  // sources: opcional, { archivo: texto } (para pruebas)
  sources ??= await idbGet('testSources');
  const LISTS = (await (await fetch(chrome.runtime.getURL('lists.json'))).json()).map((l) => [l.file, l.ruleset, l.url]);
  const texts = {};
  await Promise.all(LISTS.map(async ([f, , url]) => { texts[f] = sources?.[f] ?? await fetchText(url); }));

  const net = new Network();
  const cos = new Cosmetic(cssOk);
  for (const [f] of LISTS) for (const line of readList(texts[f])) if (line.includes('$badfilter') || line.includes(',badfilter')) net.add(line, 'x');
  for (const [f, rs] of LISTS) {
    for (const line of readList(texts[f])) {
      if (COSMETIC_RE.test(line)) cos.add(line); else net.add(line, rs);
    }
  }

  // ---------------- Red: diferencias contra las reglas incluidas ----------------
  const fresh = net.finalize();
  const dynamic = {}, disable = {};
  let unchanged = 0;
  const metaInfo = await (await fetch(chrome.runtime.getURL('meta.json'))).json();
  for (const rs of RULESETS) {
    // Las reglas incluidas de una categoría pueden estar en varios archivos (ads, ads-2…);
    // cada regla se identifica por [archivo, id].
    const staticKeys = new Map();
    const staticGroups = new Map();
    for (const part of metaInfo.rulesets?.[rs] || [rs]) {
      disable[part] = [];
      const staticRules = await (await fetch(chrome.runtime.getURL(`rules/${part}.json`))).json();
      for (const r of staticRules) {
        if (r.condition.requestDomains) {
          const meta = groupMetaFromRule(r, rs);
          const gk = groupKey(meta);
          if (!staticGroups.has(gk)) staticGroups.set(gk, { meta, chunks: [] });
          staticGroups.get(gk).chunks.push({ part, id: r.id, domains: r.condition.requestDomains });
        } else staticKeys.set(ruleKey(r), [part, r.id]);
      }
    }
    const dyn = (dynamic[rs] = []);
    const cur = fresh[rs] || { rules: [], groups: new Map() };
    const used = new Set();
    for (const rule of cur.rules) {
      const k = ruleKey(rule);
      if (staticKeys.has(k)) { used.add(k); unchanged++; } else dyn.push(rule);
    }
    for (const [k, [part, id]] of staticKeys) if (!used.has(k)) disable[part].push(id);

    const gks = new Set([...staticGroups.keys(), ...cur.groups.keys()]);
    for (const gk of gks) {
      const now = new Set(cur.groups.get(gk)?.domains || []);
      const st = staticGroups.get(gk);
      const meta = cur.groups.get(gk)?.meta || st.meta;
      const staticAll = new Set();
      for (const ch of st?.chunks || []) {
        const removed = ch.domains.filter((d) => !now.has(d));
        ch.domains.forEach((d) => staticAll.add(d));
        if (removed.length) {
          disable[ch.part].push(ch.id);
          const keep = ch.domains.filter((d) => now.has(d));
          for (let i = 0; i < keep.length; i += 5000) dyn.push(groupRule(meta, keep.slice(i, i + 5000)));
        }
      }
      const added = [...now].filter((d) => !staticAll.has(d)).sort();
      for (let i = 0; i < added.length; i += 5000) dyn.push(groupRule(meta, added.slice(i, i + 5000)));
    }
  }

  // ---------------- Cosmético y scriptlets: reemplazo completo ----------------
  for (const h of net.elemhide) { const e = cos.h(h); e.h.clear(); e.p.length = 0; e.c.length = 0; e.gh = 1; }
  for (const h of net.generichide) cos.h(h).gh = 1;
  for (const h of net.specifichide) { const e = cos.h(h); e.h.clear(); e.p.length = 0; }

  const generic = [...cos.generic].filter((s) => !cos.genericUnhide.has(s)).sort();
  const genericSet = new Set(generic);
  const cosData = {}, slData = {}, excluded = [];
  for (const [h, e] of cos.hosts) {
    const entry = {};
    const hide = [...e.h].filter((s) => !e.x.has(s)).sort();
    if (hide.length) entry.h = hide;
    if (e.x.size) entry.x = [...e.x].sort();
    if (e.p.length) entry.p = [...new Set(e.p)].sort();
    if (e.c.length) entry.c = [...new Set(e.c)].sort();
    const gx = [...new Set([...e.gx, ...[...e.x].filter((s) => genericSet.has(s))])].sort();
    if (gx.length) entry.gx = gx;
    if (e.gh) entry.gh = 1;
    if ((gx.length || e.gh) && !h.endsWith('.*')) excluded.push(h);
    if (Object.keys(entry).length) cosData[h] = entry;
    if (e.s.length || e.sx.size) {
      const s = {};
      if (e.s.length) s.s = e.s;
      if (e.sx.size) s.x = [...e.sx].sort();
      slData[h] = s;
    }
  }

  const count = (o) => Object.values(o).reduce((a, l) => a + l.length, 0);
  const result = {
    date: Date.now(),
    network: { dynamic, disable },
    cosmetic: { generic, excluded: excluded.sort(), cos: cosData, sl: slData },
    stats: {
      unchanged, dynamic: count(dynamic), disabled: count(disable),
      generic: generic.length, cosHosts: Object.keys(cosData).length, slHosts: Object.keys(slData).length,
    },
  };
  await idbSet('update', result);
  return result.stats;
}

