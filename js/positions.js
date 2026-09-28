/**
 * positions.js — Placement des dés sur le plateau rond.
 *
 * Le plateau est modélisé dans un repère abstrait de 1000x1000 unités,
 * centré en (500, 500), avec une zone jouable circulaire de rayon
 * PLAYABLE_RADIUS. generateDicePositions() calcule, pour chaque dé,
 * une position (x, y) qui :
 *   - reste à l'intérieur du plateau
 *   - garde une distance minimale par rapport aux autres dés du lancer
 *   - garde une distance minimale par rapport aux dés déjà posés
 *     (dés conservés lors d'un tour précédent, passés en `obstacles`)
 *
 * Aucune grille, aucun emplacement fixe : chaque appel produit une
 * disposition différente (dispersion naturelle façon "vrais dés jetés").
 */

export const BOARD_CENTER = { x: 500, y: 500 };
export const PLAYABLE_RADIUS = 360;
// Distance MINIMALE entre les CENTRES de deux dés. Un dé fait ~100 unités de
// diamètre (10% d'un plateau de 1000 unités) : il faut donc un espacement
// nettement supérieur au diamètre pour éviter tout chevauchement visuel et
// garantir une zone de sécurité tactile confortable autour de chaque dé,
// tout en laissant les dés, plus petits et plus élégants, bien répartis.
export const DIE_COLLISION_RADIUS = 130;
export const DIE_EDGE_MARGIN = 60; // marge par rapport au bord du plateau (rayon d'un dé + confort)

/** Distance euclidienne entre deux points. */
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Génère un point aléatoire uniforme à l'intérieur d'un disque de rayon r centré en (cx, cy). */
function randomPointInDisc(cx, cy, r) {
  const angle = Math.random() * Math.PI * 2;
  // sqrt pour une répartition uniforme en surface (pas concentrée au centre)
  const radius = Math.sqrt(Math.random()) * r;
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

/**
 * Calcule `count` positions valides pour des dés.
 * `obstacles` : positions déjà occupées (dés conservés) à éviter en plus.
 * `minSpacing` : distance minimale entre deux dés (peut être réduite
 * automatiquement si l'espace disponible est trop contraint, pour
 * toujours garantir une position — mieux vaut des dés un peu rapprochés
 * que la partie qui plante).
 */
export function generateDicePositions(count, obstacles = [], seedOffset = 0) {
  const usableRadius = PLAYABLE_RADIUS - DIE_EDGE_MARGIN;
  const positions = [];
  const allObstacles = [...obstacles];
  let minSpacing = DIE_COLLISION_RADIUS;
  const maxAttemptsPerDie = 60;

  for (let i = 0; i < count; i++) {
    let placed = null;
    let attempts = 0;
    while (!placed && attempts < maxAttemptsPerDie) {
      attempts++;
      const candidate = randomPointInDisc(BOARD_CENTER.x, BOARD_CENTER.y, usableRadius);
      const tooClose = allObstacles.some((o) => dist(candidate, o) < minSpacing);
      if (!tooClose) placed = candidate;
    }
    if (!placed) {
      // Espace trop contraint : on relâche progressivement la distance minimale
      // et on relance une passe complète pour garantir un résultat.
      minSpacing = Math.max(36, minSpacing * 0.82);
      return generateDicePositions(count, obstacles, seedOffset + 1);
    }
    positions.push(placed);
    allObstacles.push(placed);
  }

  return positions;
}

/**
 * Trajectoire de lancer : point de départ (près du centre, légèrement
 * randomisé) pour donner l'impression que les dés jaillissent de la main
 * du joueur puis partent chacun dans une direction différente.
 */
export function generateThrowOrigin(spreadFactor = 1) {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * 55 * spreadFactor;
  return { x: BOARD_CENTER.x + Math.cos(angle) * r, y: BOARD_CENTER.y + Math.sin(angle) * r };
}

/** Rotation finale aléatoire (en degrés) pour la face du dé posée. */
export function randomFinalRotation() {
  const base = [0, 90, 180, 270][Math.floor(Math.random() * 4)];
  return base + (Math.random() * 26 - 13);
}

/** Nombre de tours complets aléatoire pendant le vol, pour varier l'animation. */
export function randomSpin() {
  return 360 * (3 + Math.floor(Math.random() * 4)) + Math.floor(Math.random() * 360);
}

/**
 * Durée aléatoire d'un lancer (ms). Volontairement plus ample que le strict
 * minimum pour que le mouvement des dés soit clairement perceptible (chaque
 * dé a sa propre vitesse), tout en restant vif pour ne pas ralentir le jeu.
 */
export function randomThrowDuration() {
  return 900 + Math.random() * 550;
}
