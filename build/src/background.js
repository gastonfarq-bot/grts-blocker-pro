/* GRTS Blocker Pro — service worker */
import { idbGet, idbSet, idbDel } from './lib/idb.js';
import { renderCos, renderSl, chunks, genericCssText } from './lib/render.js';
import { verifyLicense, PRO_CATEGORIES } from './lib/license.js';

const IS_FIREFOX = /Firefox\//.test(navigator.userAgent);

const RULESETS = ['ads', 'privacy', 'annoyances', 'regional']; // provienen de las listas
const EXTRAS = ['clean', 'gpc', 'cookies'];                     // reglas de privacidad propias
const ALL_RULESETS = [...RULESETS, ...EXTRAS];
const PAUSE_RULE_BASE = 100000;
const UPDATE_EVERY_MS = 3 * 24 * 3600 * 1000; // cada 3 días
const DNR = chrome.declarativeNetRequest;

const store = {
  get: (k) => chrome.storage.local.get(k),
  set: (o) => chrome.storage.local.set(o),
};
const patternFor = (h) => `*://*.${h}/*`;
const getJSON = async (p) => (await fetch(chrome.runtime.getURL(p))).json();
let metaCache = null;
const meta = async () => (metaCache ||= await getJSON('meta.json'));
// Una categoría puede estar repartida en varios archivos de reglas (ads, ads-2…)
const partsOf = async (cat) => (await meta()).rulesets?.[cat] || [cat];

// Serializa las operaciones que tocan reglas o scripts registrados
let lock = Promise.resolve();
const exclusive = (fn) => (lock = lock.then(fn, fn));

// categories: lo que realmente se aplica (sin Pro, las funciones Pro quedan apagadas)
// chosen: lo que eligió el usuario en los interruptores
async function settings() {
  const s = await store.get(['enabled', 'categories', 'paused', 'pro']);
  const chosen = s.categories || {};
  const categories = { ...chosen };
  if (!s.pro) for (const c of PRO_CATEGORIES) categories[c] = false;
  return { enabled: s.enabled !== false, categories, chosen, paused: s.paused || [], pro: !!s.pro };
}

// Revisa la licencia guardada (por si venció) y devuelve si hay Pro
async function checkLicense() {
  const { license } = await store.get('license');
  const info = license ? await verifyLicense(license) : null;
  const pro = !!info && !info.expired;
  await store.set({ pro, licenseInfo: info });
  return pro;
}

async function applyAll() {
  await applyRulesets();
  await applyNetwork();
  await refreshExclusions();
}

function userScriptsAvailable() {
  try { chrome.userScripts.getScripts(); return true; } catch { return false; }
}

// ======================= Scripts inyectados =======================
let staticPlan = null;
let userPlan = null;

async function getUserPlan() {
  if (userPlan) return userPlan;
  const upd = await idbGet('update');
  if (!upd?.cosmetic) return null;
  const { generic, excluded, cos, sl } = upd.cosmetic;
  const lib = await (await fetch(chrome.runtime.getURL('scriptlets/lib.js'))).text();
  const plan = [
    { id: 'u-engine', file: 'cosmetic/engine.js', world: 'USER_SCRIPT', matches: ['http://*/*', 'https://*/*'] },
    { id: 'u-generic', code: renderCos({ '*g': genericCssText(generic) }), world: 'USER_SCRIPT',
      matches: ['http://*/*', 'https://*/*'], excludeMatches: excluded.map(patternFor) },
  ];
  for (const c of chunks(cos)) plan.push({ id: 'u-c' + c.suffix, code: renderCos(c.data), world: 'USER_SCRIPT', matches: c.matches });
  for (const c of chunks(sl)) plan.push({ id: 'u-s' + c.suffix, code: renderSl(c.data, lib), world: 'MAIN', matches: c.matches });
  userPlan = plan;
  return plan;
}

async function exclusionsFor(p) {
  const { enabled, paused, categories } = await settings();
  if (!enabled || (p.cat && categories[p.cat] === false)) return ['*://*/*'];
  return [...(p.excludeMatches || []), ...paused.map(patternFor)];
}

async function currentMode() {
  return userScriptsAvailable() && (await idbGet('update'))?.cosmetic ? 'user' : 'static';
}

async function registerAll() {
  const mode = await currentMode();
  staticPlan ||= await getJSON('scripts.json');
  if ((await chrome.scripting.getRegisteredContentScripts()).length) await chrome.scripting.unregisterContentScripts();
  if (userScriptsAvailable()) { try { await chrome.userScripts.unregister(); } catch {} }

  const cs = [];
  for (const p of staticPlan) {
    if (mode === 'user' && !p.keep) continue; // en modo actualizado lo reemplazan los scripts de usuario
    const s = { id: p.id, matches: p.matches, runAt: 'document_start', allFrames: true,
      persistAcrossSessions: true, world: p.world || 'ISOLATED' };
    if (!IS_FIREFOX) s.matchOriginAsFallback = true;
    if (p.js) s.js = p.js;
    if (p.css) s.css = p.css;
    const ex = await exclusionsFor(p);
    if (ex.length) s.excludeMatches = ex;
    cs.push(s);
  }
  await chrome.scripting.registerContentScripts(cs);

  if (mode === 'user') {
    await chrome.userScripts.configureWorld({ messaging: true });
    const us = [];
    for (const p of await getUserPlan()) {
      const s = { id: p.id, matches: p.matches, runAt: 'document_start', allFrames: true, world: p.world,
        js: [p.file ? { file: p.file } : { code: p.code }] };
      const ex = await exclusionsFor(p);
      if (ex.length) s.excludeMatches = ex;
      us.push(s);
    }
    await chrome.userScripts.register(us);
  }
  await store.set({ mode });
}

async function refreshExclusions() {
  const mode = await currentMode();
  const { mode: registeredMode } = await store.get('mode');
  if (mode !== registeredMode) return registerAll();
  staticPlan ||= await getJSON('scripts.json');
  const registered = new Set((await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id));
  const csUpdates = [];
  for (const p of staticPlan) {
    if (mode === 'user' && !p.keep) continue;
    if (!registered.has(p.id)) return registerAll();
    csUpdates.push({ id: p.id, excludeMatches: await exclusionsFor(p) });
  }
  await chrome.scripting.updateContentScripts(csUpdates);
  if (mode === 'user') {
    const regU = new Set((await chrome.userScripts.getScripts()).map((s) => s.id));
    const usUpdates = [];
    for (const p of await getUserPlan()) {
      if (!regU.has(p.id)) return registerAll();
      usUpdates.push({ id: p.id, excludeMatches: await exclusionsFor(p) });
    }
    await chrome.userScripts.update(usUpdates);
  }
}

// ======================= Reglas de red =======================
async function applyRulesets() {
  const { enabled, categories } = await settings();
  const enable = [], disable = [];
  for (const cat of ALL_RULESETS) {
    const on = enabled && categories[cat] !== false;
    for (const part of await partsOf(cat)) (on ? enable : disable).push(part);
  }
  await DNR.updateEnabledRulesets({ enableRulesetIds: enable, disableRulesetIds: disable });
}

async function applyPausedRules() {
  const { paused } = await settings();
  const current = await DNR.getDynamicRules();
  const removeRuleIds = current.filter((r) => r.id >= PAUSE_RULE_BASE).map((r) => r.id);
  const addRules = paused.map((h, i) => ({
    id: PAUSE_RULE_BASE + i, priority: 100, action: { type: 'allowAllRequests' },
    condition: { requestDomains: [h], resourceTypes: ['main_frame', 'sub_frame'] },
  }));
  await DNR.updateDynamicRules({ removeRuleIds, addRules });
}

const SAFE = new Set(['block', 'allow', 'allowAllRequests', 'upgradeScheme']);

// Agrega reglas en tandas; si una tanda falla, la parte en dos hasta aislar la regla inválida
async function addDynamic(rules) {
  let added = 0;
  const go = async (batch) => {
    if (!batch.length) return;
    try { await DNR.updateDynamicRules({ addRules: batch }); added += batch.length; }
    catch {
      if (batch.length === 1) return;
      const mid = batch.length >> 1;
      await go(batch.slice(0, mid));
      await go(batch.slice(mid));
    }
  };
  for (let i = 0; i < rules.length; i += 2000) await go(rules.slice(i, i + 2000));
  return added;
}

// Aplica la actualización de red: reglas nuevas como dinámicas y reglas viejas desactivadas
async function applyNetwork() {
  const upd = await idbGet('update');
  const { enabled, categories } = await settings();
  let overflow = false;

  // 1) reglas incluidas que ya no existen en las listas
  const maxDisabled = DNR.MAX_NUMBER_OF_DISABLED_STATIC_RULES || 5000;
  let budget = maxDisabled;
  const parts = [];
  for (const c of RULESETS) parts.push(...(await partsOf(c)));
  for (const rs of parts) {
    let current;
    try { current = await DNR.getDisabledRuleIds({ rulesetId: rs }); } catch { continue; } // navegador sin soporte
    let target = upd?.network?.disable?.[rs] || [];
    if (target.length > budget) { target = target.slice(0, budget); overflow = true; }
    budget -= target.length;
    const tSet = new Set(target), cSet = new Set(current);
    const enableRuleIds = current.filter((id) => !tSet.has(id));
    const disableRuleIds = target.filter((id) => !cSet.has(id));
    if (enableRuleIds.length || disableRuleIds.length) {
      try { await DNR.updateStaticRules({ rulesetId: rs, enableRuleIds, disableRuleIds }); } catch {}
    }
  }

  // 2) reglas nuevas
  const old = (await DNR.getDynamicRules()).filter((r) => r.id < PAUSE_RULE_BASE).map((r) => r.id);
  if (old.length) await DNR.updateDynamicRules({ removeRuleIds: old });
  if (!upd?.network || !enabled) { await store.set({ needsRebuild: overflow }); return; }

  let rules = [];
  for (const rs of RULESETS) if (categories[rs] !== false) rules.push(...(upd.network.dynamic[rs] || []));
  // las excepciones primero: si hay que recortar, mejor perder bloqueos que romper sitios
  rules.sort((a, b) => (a.action.type === 'block') - (b.action.type === 'block'));

  const maxSafe = (DNR.MAX_NUMBER_OF_DYNAMIC_RULES || 30000) - 1000;
  const maxUnsafe = DNR.MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES || 5000;
  const maxRegex = (DNR.MAX_NUMBER_OF_REGEX_RULES || 1000) - 10;
  let nSafe = 0, nUnsafe = 0, nRegex = 0;
  const out = [];
  for (const r of rules) {
    if (r.condition.regexFilter) {
      if (nRegex >= maxRegex) { overflow = true; continue; }
      const ok = await DNR.isRegexSupported?.({ regex: r.condition.regexFilter, isCaseSensitive: !!r.condition.isUrlFilterCaseSensitive }).catch(() => null);
      if (ok && !ok.isSupported) continue;
      nRegex++;
    }
    if (SAFE.has(r.action.type)) { if (nSafe >= maxSafe) { overflow = true; continue; } nSafe++; }
    else { if (nUnsafe >= maxUnsafe) { overflow = true; continue; } nUnsafe++; }
    out.push({ ...r, id: out.length + 1 });
  }
  const added = await addDynamic(out);
  await store.set({ needsRebuild: overflow, dynamicCount: added });
}

// ======================= Actualización automática =======================
let updating = null;
let readyResolve = null, doneResolve = null;

async function ensureOffscreen() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (ctx.length) return;
  const ready = new Promise((r) => (readyResolve = r));
  await chrome.offscreen.createDocument({ url: 'updater.html', reasons: ['DOM_PARSER'],
    justification: 'Convertir las listas de filtros descargadas y validar selectores CSS.' });
  await Promise.race([ready, new Promise((r) => setTimeout(r, 10000))]);
}

function runUpdate() {
  if (updating) return updating;
  updating = (async () => {
    await store.set({ updateStatus: { running: true, started: Date.now() } });
    const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);
    try {
      let res;
      if (chrome.offscreen) {
        await ensureOffscreen();
        const done = new Promise((r) => (doneResolve = r));
        await chrome.runtime.sendMessage({ t: 'updater-run' });
        res = await Promise.race([done, new Promise((r) => setTimeout(() => r({ ok: false, error: 'Tiempo de espera agotado' }), 10 * 60 * 1000))]);
      } else {
        // Firefox: la página de fondo tiene DOM, el actualizador corre acá mismo
        const { run } = await import('./lib/updater-core.js');
        res = await run().then((stats) => ({ ok: true, stats }), (e) => ({ ok: false, error: String(e.message || e) }));
      }
      if (!res.ok) throw new Error(res.error);
      userPlan = null;
      await exclusive(async () => { await applyNetwork(); await registerAll(); });
      await store.set({ lastUpdate: Date.now(), updateStatus: { running: false, ok: true, stats: res.stats, at: Date.now() } });
    } catch (e) {
      await store.set({ updateStatus: { running: false, ok: false, error: String(e.message || e), at: Date.now() } });
    } finally {
      clearInterval(keepAlive);
      try { await chrome.offscreen?.closeDocument(); } catch {}
      updating = null;
    }
  })();
  return updating;
}

async function maybeUpdate() {
  const { lastUpdate = 0, updateStatus } = await store.get(['lastUpdate', 'updateStatus']);
  // si el último intento falló, reintentar a las 6 h; si no, cada 3 días
  const failedRecently = updateStatus && updateStatus.ok === false && Date.now() - updateStatus.at < 6 * 3600 * 1000;
  if (!failedRecently && Date.now() - lastUpdate > UPDATE_EVERY_MS) runUpdate();
}

// ======================= Ciclo de vida =======================
// ¿Están registrados todos los scripts que corresponden al modo actual?
async function scriptsLookRegistered() {
  const mode = await currentMode();
  const { mode: stored } = await store.get('mode');
  if (stored !== mode) return false;
  staticPlan ||= await getJSON('scripts.json');
  const cs = await chrome.scripting.getRegisteredContentScripts();
  if (cs.length !== (mode === 'user' ? staticPlan.filter((p) => p.keep).length : staticPlan.length)) return false;
  if (mode === 'user') {
    const us = await chrome.userScripts.getScripts();
    if (us.length !== (await getUserPlan()).length) return false;
  }
  return true;
}

chrome.runtime.onInstalled.addListener(async () => {
  // Sólo una compilación nueva (con listas nuevas) descarta la actualización anterior
  const meta = await getJSON('meta.json');
  const { built } = await store.get('built');
  if (built !== meta.built) {
    await idbDel('update');
    userPlan = null;
    await store.set({ built: meta.built, lastUpdate: meta.built, updateStatus: null, needsRebuild: false });
  }
  await checkLicense();
  await exclusive(async () => {
    try { await DNR.setExtensionActionOptions({ displayActionCountAsBadgeText: true }); } catch {}
    try { chrome.action.setBadgeBackgroundColor({ color: '#c0392b' }); } catch {}
    await applyRulesets();
    await applyNetwork();
    await applyPausedRules();
    if (!(await scriptsLookRegistered())) await registerAll();
  });
  if (!(await chrome.alarms.get('auto-update'))) chrome.alarms.create('auto-update', { delayInMinutes: 5, periodInMinutes: 360 });
});

chrome.runtime.onStartup.addListener(async () => {
  if (!(await chrome.alarms.get('auto-update'))) chrome.alarms.create('auto-update', { delayInMinutes: 5, periodInMinutes: 360 });
  const wasPro = (await store.get('pro')).pro;
  const isPro = await checkLicense();
  await exclusive(async () => {
    if (wasPro !== isPro) await applyAll();
    if (!(await scriptsLookRegistered())) await registerAll();
  });
  maybeUpdate();
});

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== 'auto-update') return;
  // si el usuario habilitó los scripts de usuario después, se pasa al modo completo
  await exclusive(async () => {
    const { mode } = await store.get('mode');
    if (mode !== (await currentMode())) await registerAll();
  });
  maybeUpdate();
});

// ======================= Mensajes =======================
let genericCache = null;
async function genericCss(ex) {
  const upd = await idbGet('update');
  const list = upd?.cosmetic?.generic || (genericCache ||= await getJSON('cosmetic/generic.json'));
  const skip = new Set(ex);
  return genericCssText(list.filter((s) => !skip.has(s)));
}

async function handle(msg, sender) {
  switch (msg.t) {
    case 'updater-ready': readyResolve?.(); return;
    case 'updater-done': doneResolve?.(msg); return;
    case 'generic': {
      if (msg.off || !sender.tab) return null;
      const css = await genericCss(msg.ex || []);
      await chrome.scripting.insertCSS({ target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, css, origin: 'USER' }).catch(() => {});
      return true;
    }
    case 'customFor': {
      const { custom = {}, pro } = await store.get(['custom', 'pro']);
      if (!pro) return [];
      const out = [];
      for (const k of msg.keys || []) if (custom[k]) out.push(...custom[k]);
      return out;
    }
    case 'state': {
      const s = await settings();
      const st = await store.get(['custom', 'lastUpdate', 'updateStatus', 'needsRebuild', 'mode', 'licenseInfo']);
      // si se habilitaron los scripts de usuario, pasar al modo completo ya mismo
      if (st.mode !== (await currentMode())) exclusive(registerAll);
      return { ...s, custom: (st.custom || {})[msg.host] || [], lastUpdate: st.lastUpdate, updateStatus: st.updateStatus,
        needsRebuild: !!st.needsRebuild, userScripts: userScriptsAvailable(), id: chrome.runtime.id,
        usPermission: (chrome.runtime.getManifest().permissions || []).includes('userScripts'),
        licenseInfo: st.licenseInfo || null, proCategories: PRO_CATEGORIES, firefox: IS_FIREFOX };
    }
    case 'activate': {
      const info = await verifyLicense(msg.key);
      if (!info) return { ok: false, error: 'La licencia no es válida. Revisá que esté completa.' };
      if (info.expired) return { ok: false, error: `La licencia venció el ${info.x}.` };
      await store.set({ license: String(msg.key).trim().replace(/\s+/g, ''), pro: true, licenseInfo: info });
      await exclusive(applyAll);
      return { ok: true, info };
    }
    case 'deactivate': {
      await store.set({ license: null, pro: false, licenseInfo: null });
      await exclusive(applyAll);
      return { ok: true };
    }
    case 'update': runUpdate(); return true;
    case 'toggle':
      await store.set({ enabled: msg.value });
      await exclusive(async () => { await applyRulesets(); await applyNetwork(); await refreshExclusions(); });
      return true;
    case 'category': {
      const { chosen, pro } = await settings();
      if (PRO_CATEGORIES.includes(msg.id) && !pro) return { ok: false, error: 'pro' };
      chosen[msg.id] = msg.value;
      await store.set({ categories: chosen });
      await exclusive(async () => { await applyRulesets(); await applyNetwork(); await refreshExclusions(); });
      return true;
    }
    case 'pause': {
      let { paused } = await settings();
      paused = paused.filter((h) => h !== msg.host);
      if (msg.value) paused.push(msg.host);
      await store.set({ paused });
      await exclusive(async () => { await applyPausedRules(); await refreshExclusions(); });
      return true;
    }
    case 'pick':
      if (!(await settings()).pro) return { ok: false, error: 'pro' };
      await chrome.scripting.executeScript({ target: { tabId: msg.tabId }, files: ['picker.js'] });
      return true;
    case 'addCustom': {
      const { custom = {}, pro } = await store.get(['custom', 'pro']);
      if (!pro) return { ok: false, error: 'pro' };
      const list = new Set(custom[msg.host] || []);
      list.add(msg.selector);
      custom[msg.host] = [...list];
      await store.set({ custom });
      return true;
    }
    case 'removeCustom': {
      const { custom = {} } = await store.get('custom');
      custom[msg.host] = (custom[msg.host] || []).filter((s) => s !== msg.selector);
      if (!custom[msg.host].length) delete custom[msg.host];
      await store.set({ custom });
      return true;
    }
  }
  return null;
}

const listener = (msg, sender, reply) => {
  if (msg?.t === 'updater-run') return false; // es para el documento offscreen
  handle(msg, sender).then(reply, () => reply(null));
  return true;
};
chrome.runtime.onMessage.addListener(listener);
if (chrome.runtime.onUserScriptMessage) chrome.runtime.onUserScriptMessage.addListener(listener);

// Utilidades para pruebas automáticas
globalThis.__mb = { idbSet, idbGet, runUpdate, registerAll, checkLicense };
