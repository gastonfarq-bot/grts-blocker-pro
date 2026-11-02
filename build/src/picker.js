/* Selector de elementos: el usuario señala algo de la página y queda bloqueado para siempre en ese sitio. */
(() => {
  if (window.__mbPicker) return;
  window.__mbPicker = true;
  const host = location.hostname.replace(/^www\./, '');
  const Z = 2147483647;

  const root = document.createElement('div');
  const shadow = root.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
      .box { position: fixed; pointer-events: none; background: rgba(192,57,43,.25); outline: 2px solid #c0392b; z-index: ${Z}; transition: all .05s; }
      .bar { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: ${Z}; background: #1e1e1e; color: #fff;
             font: 13px system-ui, sans-serif; padding: 10px 12px; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.4);
             display: flex; gap: 8px; align-items: center; max-width: calc(100vw - 32px); }
      .bar input[type=text] { flex: 1; min-width: 220px; background: #2d2d2d; color: #fff; border: 1px solid #444; border-radius: 6px; padding: 6px 8px; font: 12px ui-monospace, monospace; }
      button { background: #3a3a3a; color: #fff; border: 0; border-radius: 6px; padding: 7px 10px; cursor: pointer; font: inherit; }
      button.ok { background: #c0392b; }
      .hint { opacity: .8; }
    `;
  const box = document.createElement('div');
  box.className = 'box';
  box.hidden = true;
  const bar = document.createElement('div');
  bar.className = 'bar';
  const HINT = 'Tocá el anuncio que querés eliminar · Esc para salir';
  const showHint = () => {
    const span = document.createElement('span');
    span.className = 'hint';
    span.textContent = HINT;
    bar.replaceChildren(span);
  };
  showHint();
  shadow.append(style, box, bar);
  document.documentElement.appendChild(root);

  let target = null, locked = false;

  const esc = (s) => CSS.escape(s);
  const looksRandom = (s) => /\d{3,}|[a-f0-9]{8,}|^[a-z]{1,2}\d|__|--[a-z0-9]{5,}/i.test(s);
  const part = (el) => {
    let s = el.localName;
    if (el.id && !looksRandom(el.id)) return '#' + esc(el.id);
    const cls = [...el.classList].filter((c) => !looksRandom(c)).slice(0, 3);
    if (cls.length) s += '.' + cls.map(esc).join('.');
    const p = el.parentElement;
    if (p && p.querySelectorAll(':scope > ' + s).length > 1) {
      const i = [...p.children].indexOf(el) + 1;
      s += `:nth-child(${i})`;
    }
    return s;
  };
  const selectorFor = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      parts.unshift(part(e));
      const sel = parts.join(' > ');
      try { if (document.querySelectorAll(sel).length === 1 && (parts[0].startsWith('#') || parts.length >= 3)) return sel; } catch {}
      if (parts[0].startsWith('#')) break;
    }
    return parts.join(' > ');
  };

  const show = (el) => {
    if (!el) { box.hidden = true; return; }
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    box.hidden = false;
  };

  const onMove = (e) => {
    if (locked) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === root) return;
    target = el;
    show(el);
  };

  const confirmUI = () => {
    locked = true;
    bar.replaceChildren();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = selectorFor(target);
    const wider = document.createElement('button'); wider.textContent = 'Más grande';
    const ok = document.createElement('button'); ok.textContent = 'Bloquear'; ok.className = 'ok';
    const cancel = document.createElement('button'); cancel.textContent = 'Cancelar';
    bar.append(input, wider, ok, cancel);
    const preview = () => { try { show(document.querySelector(input.value)); } catch { show(null); } };
    input.addEventListener('input', preview);
    wider.onclick = () => {
      if (target.parentElement && target.parentElement !== document.body) { target = target.parentElement; input.value = selectorFor(target); preview(); }
    };
    cancel.onclick = () => { locked = false; showHint(); };
    ok.onclick = () => {
      const sel = input.value.trim();
      try { document.querySelectorAll(sel).forEach((n) => n.style.setProperty('display', 'none', 'important')); } catch { return; }
      chrome.runtime.sendMessage({ t: 'addCustom', host, selector: sel });
      quit();
    };
    preview();
  };

  const onClick = (e) => {
    if (e.composedPath().includes(root)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!locked && target) confirmUI();
  };
  const onKey = (e) => { if (e.key === 'Escape') quit(); };
  const quit = () => {
    removeEventListener('mousemove', onMove, true);
    removeEventListener('click', onClick, true);
    removeEventListener('keydown', onKey, true);
    root.remove();
    window.__mbPicker = false;
  };
  addEventListener('mousemove', onMove, true);
  addEventListener('click', onClick, true);
  addEventListener('keydown', onKey, true);
})();
