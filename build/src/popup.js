const $ = (s) => document.querySelector(s);
const send = (m) => chrome.runtime.sendMessage(m);

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = '';
  try { host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch {}
  const web = /^https?:/.test(tab?.url || '');
  $('#host').textContent = web ? host : 'Página interna del navegador';

  const st = await send({ t: 'state', host });
  $('#enabled').checked = st.enabled;
  $('#body').classList.toggle('off', !st.enabled);
  $('#pause').checked = st.paused.includes(host);
  $('#pause').disabled = !web;
  $('#pick').disabled = !web;
  for (const el of document.querySelectorAll('[data-cat]')) el.checked = st.categories[el.dataset.cat] !== false;

  // ---- Pro ----
  const openOptions = () => { chrome.runtime.openOptionsPage(); window.close(); };
  $('#proBadge').hidden = !st.pro;
  $('#pickPro').hidden = st.pro;
  for (const c of st.proCategories) {
    const row = document.querySelector(`[data-row="${c}"]`);
    if (!row) continue;
    row.querySelector('.pro').hidden = st.pro;
    row.classList.toggle('locked', !st.pro);
    const input = row.querySelector('input');
    if (!st.pro) { input.checked = false; input.disabled = true; row.onclick = openOptions; row.title = 'Disponible en GRTS Pro'; }
  }
  $('#licText').textContent = st.pro ? `GRTS Pro · ${st.licenseInfo?.n || ''}` : 'Versión gratuita';
  $('#licBtn').textContent = st.pro ? 'Licencia' : 'Pasate a Pro';
  $('#licBtn').onclick = openOptions;
  $('#about').onclick = () => { chrome.tabs.create({ url: chrome.runtime.getURL('options.html#acerca') }); window.close(); };

  try {
    const { rulesMatchedInfo } = await chrome.declarativeNetRequest.getMatchedRules({ tabId: tab.id });
    $('#blocked').textContent = rulesMatchedInfo.filter((r) => r.rule.rulesetId !== '_dynamic').length.toLocaleString('es-AR');
  } catch {
    // Firefox no informa las reglas aplicadas: se usa el contador del ícono si existe
    let t = '';
    try { t = await chrome.action.getBadgeText({ tabId: tab.id }); } catch {}
    $('#blocked').textContent = t || (st.firefox ? '—' : '0');
  }

  const renderCustom = (list) => {
    $('#customBox').hidden = !list.length;
    const ul = $('#custom');
    ul.innerHTML = '';
    for (const sel of list) {
      const li = document.createElement('li');
      const code = document.createElement('code');
      code.textContent = sel;
      code.title = sel;
      const b = document.createElement('button');
      b.textContent = '✕';
      b.title = 'Quitar regla';
      b.onclick = async () => { await send({ t: 'removeCustom', host, selector: sel }); renderCustom(list.filter((s) => s !== sel)); };
      li.append(code, b);
      ul.append(li);
    }
  };
  renderCustom(st.custom);

  $('#enabled').onchange = async (e) => {
    $('#body').classList.toggle('off', !e.target.checked);
    $('#note').textContent = 'Aplicando…';
    await send({ t: 'toggle', value: e.target.checked });
    chrome.tabs.reload(tab.id);
  };
  $('#pause').onchange = async (e) => {
    $('#note').textContent = 'Aplicando…';
    await send({ t: 'pause', host, value: e.target.checked });
    chrome.tabs.reload(tab.id);
  };
  for (const el of document.querySelectorAll('[data-cat]')) {
    el.onchange = async () => { $('#note').textContent = 'Aplicando…'; await send({ t: 'category', id: el.dataset.cat, value: el.checked }); $('#note').textContent = 'Los cambios se aplican al recargar la página.'; };
  }
  $('#pick').onclick = async () => {
    if (!st.pro) return openOptions();
    await send({ t: 'pick', tabId: tab.id }); window.close();
  };

  // ---- Estado de actualización de filtros ----
  const ago = (t) => {
    const d = Math.floor((Date.now() - t) / 86400000);
    if (d <= 0) return 'hoy';
    if (d === 1) return 'ayer';
    return `hace ${d} días`;
  };
  const renderUpd = (s) => {
    const us = s.updateStatus;
    const btn = $('#updNow');
    if (us && us.running) { $('#upd').textContent = 'Actualizando filtros…'; btn.disabled = true; return true; }
    btn.disabled = false;
    let txt = s.lastUpdate ? `Actualizados ${ago(s.lastUpdate)}` : 'Sin actualizar';
    if (us && us.ok === false) txt = 'No se pudo actualizar: ' + us.error;
    $('#upd').textContent = txt;
    return false;
  };
  $('#usWarn').hidden = st.userScripts || !st.usPermission;
  $('#rebuildWarn').hidden = !st.needsRebuild;
  let polling = renderUpd(st);
  const poll = async () => {
    const s = await send({ t: 'state', host });
    polling = renderUpd(s);
    $('#rebuildWarn').hidden = !s.needsRebuild;
    if (polling) setTimeout(poll, 1500);
  };
  if (polling) setTimeout(poll, 1500);
  $('#updNow').onclick = async () => { await send({ t: 'update' }); renderUpd({ updateStatus: { running: true } }); setTimeout(poll, 1500); };
  // Edge usa edge://extensions; Chrome, chrome://extensions
  const isEdge = (navigator.userAgentData?.brands || []).some((b) => /Edge/i.test(b.brand)) || /Edg\//.test(navigator.userAgent);
  $('#openSettings').onclick = () => chrome.tabs.create({ url: `${isEdge ? 'edge' : 'chrome'}://extensions/?id=${st.id}` });
})();
