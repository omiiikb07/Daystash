// Two selective 3D-style illustrations, drawn as SVG (no external images). Violet accents on matte dark materials.
const defs = (id) => `<defs>
  <linearGradient id="${id}-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E3148"/><stop offset="1" stop-color="#1B1D2C"/></linearGradient>
  <linearGradient id="${id}-violet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#A68FFF"/><stop offset="1" stop-color="#6D50DE"/></linearGradient>
  <linearGradient id="${id}-coin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D5C7FF"/><stop offset="1" stop-color="#8B6CFF"/></linearGradient>
  <linearGradient id="${id}-edge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5A41B8"/><stop offset="1" stop-color="#3E2C8A"/></linearGradient>
  <radialGradient id="${id}-shadow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
</defs>`;

const coin = (id, cx, cy, label) => `<path d="M${cx - 34} ${cy}v9a34 12 0 0 0 68 0v-9z" fill="url(#${id}-edge)"/><ellipse cx="${cx}" cy="${cy}" rx="34" ry="12" fill="url(#${id}-coin)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="26" ry="8.5" fill="none" stroke="#fff" stroke-opacity=".35"/>${label ? `<text x="${cx}" y="${cy + 4.500}" text-anchor="middle" font-family="Inter,Segoe UI,sans-serif" font-size="13" font-weight="700" fill="#3A2792">₹</text>` : ''}`;

export function calendarIllustration() {
  const id = 'cal';
  const cells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    const hi = r === 1 && c === 2;
    cells.push(`<rect x="${54 + c * 27}" y="${104 + r * 24}" width="19" height="16" rx="5" fill="${hi ? `url(#${id}-violet)` : '#33364D'}"/>`);
  }
  return `<svg class="illus" viewBox="0 0 280 220" aria-hidden="true" focusable="false">${defs(id)}
    <ellipse cx="140" cy="203" rx="118" ry="13" fill="url(#${id}-shadow)"/>
    <rect x="46" y="56" width="168" height="138" rx="18" fill="#0C0D14"/>
    <rect x="38" y="46" width="168" height="138" rx="18" fill="url(#${id}-body)" stroke="#3A3E58"/>
    <path d="M38 64a18 18 0 0 1 18-18h132a18 18 0 0 1 18 18v28H38z" fill="url(#${id}-violet)"/>
    <path d="M38 92h168" stroke="#fff" stroke-opacity=".18"/>
    <rect x="72" y="32" width="11" height="28" rx="5.500" fill="#E6E2F8"/><rect x="72" y="32" width="11" height="10" rx="5" fill="#fff" fill-opacity=".6"/>
    <rect x="160" y="32" width="11" height="28" rx="5.500" fill="#E6E2F8"/><rect x="160" y="32" width="11" height="10" rx="5" fill="#fff" fill-opacity=".6"/>
    ${cells.join('')}
    ${coin(id, 214, 168)}${coin(id, 214, 157)}${coin(id, 214, 146)}${coin(id, 214, 135, true)}
  </svg>`;
}

export function walletIllustration() {
  const id = 'wal';
  return `<svg class="illus" viewBox="0 0 280 220" aria-hidden="true" focusable="false">${defs(id)}
    <ellipse cx="140" cy="203" rx="118" ry="13" fill="url(#${id}-shadow)"/>
    <g transform="rotate(-9 130 84)"><rect x="62" y="34" width="132" height="88" rx="12" fill="url(#${id}-violet)"/>
      <rect x="76" y="52" width="46" height="8" rx="4" fill="#fff" fill-opacity=".4"/><rect x="76" y="68" width="28" height="6" rx="3" fill="#fff" fill-opacity=".25"/>
      <circle cx="170" cy="98" r="9" fill="#fff" fill-opacity=".3"/><circle cx="182" cy="98" r="9" fill="#fff" fill-opacity=".2"/></g>
    <circle cx="214" cy="84" r="28" fill="url(#${id}-edge)"/><circle cx="214" cy="80" r="28" fill="url(#${id}-coin)"/><circle cx="214" cy="80" r="21" fill="none" stroke="#fff" stroke-opacity=".35"/>
    <text x="214" y="87" text-anchor="middle" font-family="Inter,Segoe UI,sans-serif" font-size="22" font-weight="700" fill="#3A2792">₹</text>
    <rect x="40" y="98" width="188" height="100" rx="20" fill="#0C0D14"/>
    <rect x="34" y="88" width="188" height="100" rx="20" fill="url(#${id}-body)" stroke="#3A3E58"/>
    <path d="M34 116a20 20 0 0 1 20-20h148a20 20 0 0 1 20 20v52a20 20 0 0 1-20 20H54a20 20 0 0 1-20-20z" fill="url(#${id}-violet)" fill-opacity=".92"/>
    <path d="M54 96h148" stroke="#fff" stroke-opacity=".28"/>
    <rect x="46" y="108" width="164" height="68" rx="13" fill="none" stroke="#fff" stroke-opacity=".28" stroke-dasharray="4 4"/>
    <rect x="166" y="120" width="70" height="44" rx="14" fill="url(#${id}-body)" stroke="#3A3E58"/>
    <circle cx="190" cy="142" r="8" fill="url(#${id}-coin)"/><circle cx="190" cy="142" r="3" fill="#6D50DE"/>
  </svg>`;
}
