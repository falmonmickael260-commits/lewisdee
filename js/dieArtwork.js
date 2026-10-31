/** A continuous ivory body with one unambiguous result face. No game logic. */
export const PIP_POSITIONS = {
  1: [[48, 48]],
  2: [[27, 27], [69, 69]],
  3: [[27, 27], [48, 48], [69, 69]],
  4: [[27, 27], [69, 27], [27, 69], [69, 69]],
  5: [[27, 27], [69, 27], [48, 48], [27, 69], [69, 69]],
  6: [[27, 27], [69, 27], [27, 48], [69, 48], [27, 69], [69, 69]],
};
export function buildDieArtwork(value) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'die-artwork');
  svg.setAttribute('viewBox', '0 0 100 108');
  svg.setAttribute('aria-hidden', 'true');
  // Plain fills avoid document-global gradient IDs shared between many dice.
  svg.innerHTML = `
    <rect x="5" y="14" width="88" height="89" rx="17" fill="#b7a683"/>
    <path d="M13 88Q48 99 85 88" fill="none" stroke="#8e7d5d" stroke-width="2" opacity=".5"/>
    <rect x="4" y="4" width="88" height="88" rx="17" fill="#f7efdc" stroke="#d7c9aa" stroke-width="1.5"/>
    <rect x="7" y="7" width="82" height="82" rx="14" fill="#fffbf0" stroke="#fff" stroke-width="1"/>
    <path d="M15 27Q15 14 29 14H67" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"/>
    ${PIP_POSITIONS[value].map(([x,y]) => `<circle cx="${x}" cy="${y + 1}" r="${value === 1 ? 7.5 : 5.8}" fill="#fff"/><circle class="artwork-pip" cx="${x}" cy="${y}" r="${value === 1 ? 7.5 : 5.8}" fill="#172d24"/><circle cx="${x + .6}" cy="${y + 1}" r="${value === 1 ? 4.8 : 3.6}" fill="#304037"/>`).join('')}
  `;
  return svg;
}
