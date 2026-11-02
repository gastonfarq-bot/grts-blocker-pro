// Documento offscreen (Chrome/Edge): ejecuta el actualizador y avisa al service worker.
import { run } from './lib/updater-core.js';

chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg.t !== 'updater-run') return;
  run()
    .then((stats) => chrome.runtime.sendMessage({ t: 'updater-done', ok: true, stats }))
    .catch((e) => chrome.runtime.sendMessage({ t: 'updater-done', ok: false, error: String(e.message || e) }));
  reply(true);
});
chrome.runtime.sendMessage({ t: 'updater-ready' });
