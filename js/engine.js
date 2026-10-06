/**
 * engine.js — Moteur de règles du jeu "10 000".
 *
 * Ce module ne touche JAMAIS au DOM. Il expose des fonctions pures
 * (ou quasi-pures pour le RNG) qui peuvent être testées indépendamment
 * de l'interface (voir tests/engine.test.mjs) et réutilisées telles
 * quelles par une future couche multijoueur (le serveur pourra exécuter
 * exactement ce même moteur pour valider les coups).
 */

// ---------------------------------------------------------------------------
// Barèmes de points
// ---------------------------------------------------------------------------

export const BRELAN_POINTS = { 1: 1000, 2: 200, 3: 300, 4: 400, 5: 500, 6: 600 };
export const CARRE_POINTS = { 1: 2000, 2: 400, 3: 600, 4: 800, 5: 1000, 6: 1200 };
export const FIVE_KIND_POINTS = { 1: 4000, 2: 800, 3: 1200, 4: 1600, 5: 2000, 6: 2400 };
export const STRAIGHT_POINTS = 1500;
export const PAIR_MULTIPLIER = 50;
export const WINNING_SCORE = 10000;

// ---------------------------------------------------------------------------
// RNG des dés
// ---------------------------------------------------------------------------

/** Lance un dé unique (1 à 6). Isolé pour pouvoir être mocké dans les tests. */
export function rollOneDie() {
  return 1 + Math.floor(Math.random() * 6);
}

/**
 * Lance `count` dés et retourne un tableau d'objets { id, value }.
 * `ids` optionnel permet de conserver les identifiants stables des dés
 * déjà présents sur la table (utile pour ne relancer que certains dés).
 */
export function rollDice(count, ids = null) {
  const result = [];
  for (let i = 0; i < count; i++) {
    const id = ids && ids[i] != null ? ids[i] : `d${Math.random().toString(36).slice(2, 9)}`;
    result.push({ id, value: rollOneDie() });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Détection des combinaisons
// ---------------------------------------------------------------------------

/**
 * Regroupe les dés par valeur : { 1: [id,...], 2: [...], ... }
 */
function groupByValue(dice) {
  const groups = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const die of dice) groups[die.value].push(die.id);
  return groups;
}

/**
 * Analyse un ensemble de dés (un "lancer") et retourne :
 *  - combos: liste de { type, dieIds, points, label, values }
 *  - deadIds: dés qui ne participent à aucune combinaison (0 point)
 *  - isBust: true si AUCUNE combinaison n'a été trouvée (tour perdu)
 *  - usesAllDice: true si l'intégralité des dés lancés fait partie d'UNE
 *    combinaison (déclenche la règle "dés chauds" / relance des 5 dés)
 *
 * Règles de ce variant : un 1 isolé ou un 5 isolé ne valent RIEN. Seules
 * les combinaisons suivantes rapportent des points : brelan (3), carré (4),
 * cinq identiques (5), full (3+2), suite (1-5 ou 2-6).
 */
export function detectCombinations(dice) {
  const n = dice.length;
  const combos = [];
  const groups = groupByValue(dice);
  const counts = {};
  for (let v = 1; v <= 6; v++) counts[v] = groups[v].length;

  if (n === 5) {
    // Cinq dés identiques
    for (let v = 1; v <= 6; v++) {
      if (counts[v] === 5) {
        combos.push({
          type: 'five-of-a-kind',
          dieIds: [...groups[v]],
          points: FIVE_KIND_POINTS[v],
          label: 'CINQ IDENTIQUES',
          values: [v],
        });
        return finalize(dice, combos);
      }
    }

    // Suite
    const sortedValues = dice.map((d) => d.value).slice().sort((a, b) => a - b);
    const isLowStraight = sortedValues.join('') === '12345';
    const isHighStraight = sortedValues.join('') === '23456';
    if (isLowStraight || isHighStraight) {
      combos.push({
        type: 'straight',
        dieIds: dice.map((d) => d.id),
        points: STRAIGHT_POINTS,
        label: 'SUITE',
        values: sortedValues,
      });
      return finalize(dice, combos);
    }

    // Full (brelan + paire)
    let brelanValue = null;
    let pairValue = null;
    for (let v = 1; v <= 6; v++) {
      if (counts[v] === 3) brelanValue = v;
      if (counts[v] === 2) pairValue = v;
    }
    if (brelanValue != null && pairValue != null) {
      const points = BRELAN_POINTS[brelanValue] + PAIR_MULTIPLIER * pairValue;
      combos.push({
        type: 'full-house',
        dieIds: [...groups[brelanValue], ...groups[pairValue]],
        points,
        label: 'FULL',
        values: [brelanValue, pairValue],
      });
      return finalize(dice, combos);
    }
  }

  // Cas générique : carré (4) puis brelan (3), valable pour n'importe quel n.
  // Un carré ne peut être détecté que si n >= 4, un brelan que si n >= 3.
  for (let v = 1; v <= 6; v++) {
    if (counts[v] >= 4) {
      combos.push({
        type: 'carre',
        dieIds: groups[v].slice(0, 4),
        points: CARRE_POINTS[v],
        label: 'CARRÉ',
        values: [v],
      });
    } else if (counts[v] >= 3) {
      combos.push({
        type: 'brelan',
        dieIds: groups[v].slice(0, 3),
        points: BRELAN_POINTS[v],
        label: 'BRELAN',
        values: [v],
      });
    }
  }

  return finalize(dice, combos);
}

function finalize(dice, combos) {
  const usedIds = new Set();
  combos.forEach((c) => c.dieIds.forEach((id) => usedIds.add(id)));
  const deadIds = dice.filter((d) => !usedIds.has(d.id)).map((d) => d.id);
  return {
    combos,
    deadIds,
    isBust: combos.length === 0,
    usesAllDice: usedIds.size === dice.length && dice.length > 0,
  };
}

/** Somme des points d'une liste de combos (ex: les combos sélectionnés par le joueur). */
export function calculateScore(combos) {
  return combos.reduce((sum, c) => sum + c.points, 0);
}

// ---------------------------------------------------------------------------
// Aides de tour de jeu (utilisées par le contrôleur de partie)
// ---------------------------------------------------------------------------

export function checkVictory(score) {
  return score >= WINNING_SCORE;
}

/**
 * Il faut atteindre 10 000 JUSTE, jamais dépasser : vrai si ajouter
 * `comboPoints` au score déjà sécurisé (`currentScore`) et aux points du
 * tour en cours (`turnScore`) ferait dépasser l'objectif. Dans ce cas la
 * combinaison obtenue ne peut pas être gardée — c'est un tour perdu
 * automatique (voir GameController.roll()), même sans dépasser lui-même
 * la limite si le joueur n'avait rien d'autre à perdre.
 */
export function wouldOvershoot(currentScore, turnScore, comboPoints, target = WINNING_SCORE) {
  return currentScore + turnScore + comboPoints > target;
}

/**
 * Formatte un nombre avec des espaces comme séparateurs de milliers
 * (style français : 10 000).
 */
export function formatScore(n) {
  return n.toLocaleString('fr-FR').replace(/ /g, ' ');
}
