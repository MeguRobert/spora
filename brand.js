// Spóra brand: logo mark, UI icons and the look of each category. Static markup only.

// A sprout growing out from behind a coin: saved lei grow. Same drawing as icon.svg, without the tile.
export const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
  <path d="M32 28 V13" stroke="var(--brand)" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M32 20 C 24.5 20, 20 15.5, 19 9 C 26.5 9, 31.2 12.8, 32 20 Z" fill="var(--brand-2)"/>
  <path d="M32 16.5 C 39 16.5, 43.5 12.5, 45.2 6 C 37.8 6, 32.8 9.5, 32 16.5 Z" fill="var(--brand)"/>
  <circle cx="32" cy="41" r="16.5" fill="#E0A43A" stroke="#C99232" stroke-width="1.5"/>
  <text x="32" y="47.5" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700"
        font-size="18" fill="#9C6B1E">S</text>
</svg>`;

const icon = d => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONS = {
  log: icon('<path d="M8 6h12M8 12h12M8 18h8"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
  month: icon('<path d="M5 20V11M12 20V4M19 20v-6"/>'),
  import: icon('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  logout: icon('<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>'),
  prev: icon('<path d="M15 6l-6 6 6 6"/>'),
  next: icon('<path d="M9 6l6 6-6 6"/>'),
};

// One color + emoji per category, keyed by name (names live in the database).
const CATEGORY_LOOK = {
  'Élelmiszer':           ['🛒', '#3F9B6B'],
  'Üzemanyag':            ['⛽', '#D9822B'],
  'Autó':                 ['🚗', '#4C7FD1'],
  'Ház & rezsi':          ['🏠', '#8B6BD1'],
  'Egészség':             ['💊', '#D9536F'],
  'Ruházat':              ['👕', '#2BA3B5'],
  'Étterem & szórakozás': ['🍽️', '#E0A43A'],
  'Ajándék':              ['🎁', '#C65FA8'],
  'Sport':                ['⚽', '#5BAA3A'],
  'Adomány & templom':    ['⛪', '#A6814C'],
  'Online vásárlás':      ['📦', '#6D7FA3'],
  'Egyéb':                ['✳️', '#8A8F8C'],
};
export const categoryLook = name => {
  const [emoji, color] = CATEGORY_LOOK[name] ?? ['•', '#8A8F8C'];
  return { emoji, color };
};

// Parse static markup above into a node.
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}
