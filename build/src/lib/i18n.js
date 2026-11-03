// Textos en el idioma del navegador (español o inglés). Lo usan el panel y la página de opciones.
const t = (key, ...subs) => chrome.i18n.getMessage(key, subs.map(String)) || key;
const UI_LANG = (chrome.i18n.getUILanguage() || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';

// Fecha AAAA-MM-DD en el formato local (02/11/2026 o 11/2/2026)
const fmtDate = (iso) => {
  try { return new Date(iso + 'T12:00:00').toLocaleDateString(chrome.i18n.getUILanguage()); } catch { return iso; }
};

function applyI18n(root = document) {
  document.documentElement.lang = UI_LANG;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  if (document.body.dataset.i18nDoc) document.title = t(document.body.dataset.i18nDoc);
}
applyI18n();
