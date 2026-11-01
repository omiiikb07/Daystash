import { esc } from './format.js';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span>${esc(message)}</span><button type="button" aria-label="Dismiss">×</button>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  const box = document.getElementById('toasts');
  while (box.children.length >= 3) box.firstChild.remove(); // never let notifications pile up
  box.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 9000 : 4000);
}

/** Close a dialog with a short exit transition (instant when the user prefers reduced motion). */
export function closeDialog(dlg) {
  if (!dlg.open) return;
  if (reduced()) { dlg.close(); return; }
  dlg.classList.add('closing');
  setTimeout(() => { dlg.classList.remove('closing'); if (dlg.open) dlg.close(); }, 160);
}

export function initDialogs() {
  document.querySelectorAll('dialog').forEach((dlg) => {
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(dlg); }); // Escape
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(dlg); }); // click on the backdrop
  });
}

/** Resolves true only when the user presses the confirm button. rows: [{label, value}] */
export function confirmDialog({ title, intro = '', rows = [], note = '', okLabel = 'Confirm', tone = 'primary' }) {
  return new Promise((resolve) => {
    const dlg = document.getElementById('confirmDialog');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmIntro').textContent = intro;
    document.getElementById('confirmNote').textContent = note;
    const kv = document.getElementById('confirmRows');
    kv.hidden = rows.length === 0;
    kv.innerHTML = rows.map((r) => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join('');
    const ok = document.getElementById('confirmOk');
    ok.textContent = okLabel; ok.className = 'btn btn-' + tone;
    dlg.returnValue = 'cancel';
    const onClick = (e) => { const b = e.target.closest('[data-result]'); if (b) { dlg.returnValue = b.dataset.result; closeDialog(dlg); } };
    dlg.addEventListener('click', onClick);
    dlg.addEventListener('close', () => { dlg.removeEventListener('click', onClick); resolve(dlg.returnValue === 'ok'); }, { once: true });
    dlg.showModal();
    ok.focus();
  });
}

/** Tooltips for chart marks: anything with data-tip shows its text on hover or keyboard focus. */
export function initTooltips() {
  const tipEl = document.getElementById('tooltip');
  let shownAt = 0;
  const show = (el) => {
    shownAt = performance.now();
    tipEl.textContent = el.dataset.tip; tipEl.classList.add('show');
    const r = el.getBoundingClientRect(); const w = tipEl.offsetWidth; const h = tipEl.offsetHeight;
    const x = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    const y = r.top - h - 10 < 8 ? r.bottom + 10 : r.top - h - 10;
    tipEl.style.left = `${x}px`; tipEl.style.top = `${y}px`;
  };
  const hide = () => tipEl.classList.remove('show');
  document.addEventListener('mouseover', (e) => { const el = e.target.closest('[data-tip]'); if (el) show(el); else hide(); });
  document.addEventListener('focusin', (e) => { const el = e.target.closest('[data-tip]'); if (el) show(el); });
  document.addEventListener('focusout', hide);
  window.addEventListener('scroll', () => { if (performance.now() - shownAt > 250) hide(); }, { passive: true }); // ignore the scroll that brought the mark into view
}
