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
    line('GRTS Pro está activo en este navegador.', true);
    line(`A nombre de ${info.n} (${info.e})${info.x ? ` · vence el ${info.x}` : ' · sin vencimiento'}`);
  } else if (info?.expired) {
    line(`Tu licencia venció el ${info.x}.`, true);
    line('Renovala para volver a usar las funciones Pro. El bloqueo de publicidad y rastreadores sigue funcionando.');
  } else {
    line('Estás usando la versión gratuita.', true);
    line('Bloquea publicidad y rastreadores, con filtros en español y actualización automática.');
  }
  $('#activateBox').hidden = st.pro;
  $('#deactBox').hidden = !st.pro && !info;
}

$('#activate').onclick = async () => {
  const msg = $('#msg');
  msg.className = '';
  msg.textContent = 'Verificando…';
  const r = await send({ t: 'activate', key: $('#key').value });
  if (r?.ok) {
    msg.className = 'ok';
    msg.textContent = '¡Listo! GRTS Pro quedó activado. Recargá las páginas abiertas.';
    $('#key').value = '';
  } else {
    msg.className = 'err';
    msg.textContent = r?.error || 'No se pudo activar.';
  }
  render();
};

$('#deactivate').onclick = async () => {
  await send({ t: 'deactivate' });
  $('#msg').className = '';
  $('#msg').textContent = 'Se quitó la licencia de este navegador.';
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
    const cells = [l.name, l.license].map((t) => { const td = document.createElement('td'); td.textContent = t; return td; });
    const td = document.createElement('td'); td.append(a);
    tr.append(...cells, td);
    tbody.append(tr);
  }
  const src = $('#source');
  if (SOURCE_URL) {
    src.textContent = 'Código fuente: ';
    const a = document.createElement('a'); a.href = SOURCE_URL; a.target = '_blank'; a.rel = 'noopener'; a.textContent = SOURCE_URL;
    src.append(a);
  } else {
    src.textContent = 'El código fuente completo está disponible a pedido de cualquier usuario, según la GPL-3.0.';
  }
})();
