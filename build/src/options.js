// Dirección del repositorio público con el código fuente (obligatorio por GPL al distribuir).
// Completala cuando publiques el repositorio en GitHub.
const SOURCE_URL = 'https://github.com/gastonfarq-bot/grts-blocker-pro';

const $ = (s) => document.querySelector(s);
const send = (m) => chrome.runtime.sendMessage(m);

async function render() {
  const st = await send({ t: 'state', host: '' });
  const info = st.licenseInfo;
  const status = $('#status');
  status.textContent = '';
  const line = (txt, bold) => { const p = document.createElement('p'); p.textContent = txt; if (bold) p.style.fontWeight = '600'; status.append(p); };
  if (st.pro) {
    line(t('proActive'), true);
    line(`${t('licensedTo', info.n, info.e)} · ${info.x ? t('expiresOn', fmtDate(info.x)) : t('noExpiry')}`);
  } else if (info?.expired) {
    line(t('expiredOn', fmtDate(info.x)), true);
    line(t('expiredHint'));
  } else {
    line(t('usingFree'), true);
    line(t('freeDesc'));
  }
  $('#activateBox').hidden = st.pro;
  $('#deactBox').hidden = !st.pro && !info;
}

$('#activate').onclick = async () => {
  const msg = $('#msg');
  msg.className = '';
  msg.textContent = t('verifying');
  const r = await send({ t: 'activate', key: $('#key').value });
  if (r?.ok) {
    msg.className = 'ok';
    msg.textContent = t('activated');
    $('#key').value = '';
  } else {
    msg.className = 'err';
    msg.textContent = r?.error || t('activateFailed');
  }
  render();
};

$('#deactivate').onclick = async () => {
  await send({ t: 'deactivate' });
  $('#msg').className = '';
  $('#msg').textContent = t('licenseRemoved');
  render();
};

(async () => {
  render();
  const lists = await (await fetch(chrome.runtime.getURL('lists.json'))).json();
  const tbody = $('#lists');
  for (const l of lists) {
    const tr = document.createElement('tr');
    const a = document.createElement('a');
    a.href = l.home; a.target = '_blank'; a.rel = 'noopener'; a.textContent = new URL(l.home).hostname;
    const cells = [l.name, l.license].map((txt) => { const td = document.createElement("td"); td.textContent = txt; return td; });
    const td = document.createElement('td'); td.append(a);
    tr.append(...cells, td);
    tbody.append(tr);
  }
  const src = $('#source');
  if (SOURCE_URL) {
    src.textContent = t('sourceCode') + ' ';
    const a = document.createElement('a'); a.href = SOURCE_URL; a.target = '_blank'; a.rel = 'noopener'; a.textContent = SOURCE_URL;
    src.append(a);
  } else {
    src.textContent = t('sourceOnRequest');
  }
})();
