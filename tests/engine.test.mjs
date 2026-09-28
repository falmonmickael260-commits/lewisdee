/**
 * tests/engine.test.mjs
 * Suite de tests "obligatoires" (voir cahier des charges §32), exécutable
 * en pur Node (aucune dépendance) :
 *
 *   node tests/engine.test.mjs
 *   (ou: npm test)
 */
import assert from 'node:assert/strict';
import {
  detectCombinations,
  calculateScore,
  checkVictory,
  BRELAN_POINTS,
  CARRE_POINTS,
  FIVE_KIND_POINTS,
  STRAIGHT_POINTS,
} from '../js/engine.js';
import { GameController } from '../js/game.js';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  \x1b[31m✗ ${name}\x1b[0m`);
    console.log(`    ${err.message}`);
  }
}

function dice(values) {
  return values.map((v, i) => ({ id: `t${i}`, value: v }));
}

console.log('\n10 000 — Suite de tests du moteur\n==================================\n');

// --- Test 1 : premier lancer sans combinaison -> tour perdu -------------
test('Test 1 — Premier lancer sans combinaison => bust (0 point, aucun dé isolé ne compte)', () => {
  const { isBust, combos } = detectCombinations(dice([1, 2, 3, 4, 6]));
  assert.equal(isBust, true);
  assert.equal(combos.length, 0);
});

// --- Test 2 : brelan -----------------------------------------------------
test('Test 2 — Brelan (chaque valeur donne le bon nombre de points)', () => {
  for (const v of [1, 2, 3, 4, 5, 6]) {
    // Deux valeurs de "bruit" distinctes entre elles et différentes de v,
    // pour être certain de ne jamais former un full (brelan + paire) par accident.
    const others = [1, 2, 3, 4, 5, 6].filter((x) => x !== v).slice(0, 2);
    const values = [v, v, v, others[0], others[1]];
    const { combos } = detectCombinations(dice(values));
    const brelan = combos.find((c) => c.type === 'brelan');
    assert.ok(brelan, `pas de brelan détecté pour ${values}`);
    assert.equal(brelan.points, BRELAN_POINTS[v]);
  }
});

// --- Test 3 : carré -------------------------------------------------------
test('Test 3 — Carré 4-4-4-4-2 => 800 points, le 2 ne rapporte rien', () => {
  const { combos, deadIds } = detectCombinations(dice([4, 4, 4, 4, 2]));
  assert.equal(combos.length, 1);
  assert.equal(combos[0].type, 'carre');
  assert.equal(combos[0].points, CARRE_POINTS[4]);
  assert.equal(combos[0].points, 800);
  assert.equal(deadIds.length, 1);
});

// --- Test 4 : full ---------------------------------------------------------
test('Test 4 — Full : calcul brelan + 50×paire', () => {
  const cases = [
    { values: [3, 3, 3, 2, 2], expected: 400 },
    { values: [3, 3, 3, 5, 5], expected: 550 },
    { values: [6, 6, 6, 4, 4], expected: 800 },
    { values: [1, 1, 1, 5, 5], expected: 1250 },
  ];
  for (const { values, expected } of cases) {
    const { combos } = detectCombinations(dice(values));
    assert.equal(combos.length, 1, `full non détecté pour ${values}`);
    assert.equal(combos[0].type, 'full-house');
    assert.equal(combos[0].points, expected, `mauvais score pour ${values}`);
  }
});

// --- Test 5 : suite ---------------------------------------------------------
test('Test 5 — Suite (ordre indifférent) => 1500 points', () => {
  const { combos: c1 } = detectCombinations(dice([5, 2, 4, 1, 3]));
  assert.equal(c1.length, 1);
  assert.equal(c1[0].type, 'straight');
  assert.equal(c1[0].points, STRAIGHT_POINTS);

  const { combos: c2 } = detectCombinations(dice([2, 3, 4, 5, 6]));
  assert.equal(c2[0].points, 1500);
});

// --- Test 6 : cinq dés identiques -------------------------------------------
test('Test 6 — Cinq dés identiques (toutes les valeurs)', () => {
  for (const v of [1, 2, 3, 4, 5, 6]) {
    const { combos } = detectCombinations(dice([v, v, v, v, v]));
    assert.equal(combos.length, 1);
    assert.equal(combos[0].type, 'five-of-a-kind');
    assert.equal(combos[0].points, FIVE_KIND_POINTS[v]);
  }
});

// --- Test 7 : sélection des dés (verrouillage via GameController) -----------
test('Test 7 — Sélection des dés => statut verrouillé', () => {
  const g = new GameController(['A', 'B']);
  g.tableDice = [
    { id: 'a', value: 3, x: 0, y: 0, state: 'scorable', comboId: 'c0' },
    { id: 'b', value: 3, x: 0, y: 0, state: 'scorable', comboId: 'c0' },
    { id: 'c', value: 3, x: 0, y: 0, state: 'scorable', comboId: 'c0' },
    { id: 'd', value: 2, x: 0, y: 0, state: 'dead', comboId: null },
    { id: 'e', value: 6, x: 0, y: 0, state: 'dead', comboId: null },
  ];
  g.currentCombos = [{ comboId: 'c0', type: 'brelan', dieIds: ['a', 'b', 'c'], points: 300, selected: false }];
  g.toggleCombo('c0');
  assert.equal(g.currentCombos[0].selected, true);
  assert.ok(g.tableDice.filter((d) => d.comboId === 'c0').every((d) => d.state === 'selected'));
});

// --- Test 8 : relance => seuls les dés non conservés bougent ----------------
test('Test 8 — Relance : les dés conservés restent, seuls les autres sont relancés', () => {
  const g = new GameController(['A', 'B']);
  g.tableDice = [
    { id: 'a', value: 3, x: 100, y: 100, state: 'selected', comboId: 'c0' },
    { id: 'b', value: 3, x: 120, y: 100, state: 'selected', comboId: 'c0' },
    { id: 'c', value: 3, x: 140, y: 100, state: 'selected', comboId: 'c0' },
    { id: 'd', value: 2, x: 200, y: 200, state: 'dead', comboId: null },
    { id: 'e', value: 6, x: 220, y: 220, state: 'dead', comboId: null },
  ];
  g.currentCombos = [{ comboId: 'c0', type: 'brelan', dieIds: ['a', 'b', 'c'], points: 300, selected: true }];
  g.usesAllDice = false;
  g.reroll();
  assert.equal(g.turnScore, 300);
  assert.equal(g.committedDice.length, 3);
  assert.deepEqual(g.committedDice.map((d) => d.id).sort(), ['a', 'b', 'c']);
  // Les 2 dés restants (d, e) ne sont pas dans committedDice -> ils seront
  // relancés au prochain roll() avec 5 - 3 = 2 dés disponibles.
  assert.equal(5 - g.committedDice.length, 2);
});

// --- Test 9 : relance sans combinaison => points du tour perdus -------------
test('Test 9 — Relance sans combinaison => perte des points du tour', () => {
  const g = new GameController(['A', 'B']);
  g.currentPlayer.score = 7200;
  g.turnScore = 650;
  let bustEvent = null;
  g.on('bust', (e) => (bustEvent = e));
  let turnChanged = null;
  g.on('turnChanged', (e) => (turnChanged = e));
  g.currentCombos = [];
  g.tableDice = [];
  g.isBust = true;
  g._loseTurn();
  assert.equal(bustEvent.lost, 650);
  assert.equal(g.players[0].score, 7200); // le score déjà sécurisé ne bouge pas
  assert.equal(g.turnScore, 0);
  assert.ok(turnChanged);
});

// --- Test 10 : sécurisation => points ajoutés au score ----------------------
test('Test 10 — Sécurisation : les points sont ajoutés au score du joueur', () => {
  const g = new GameController(['A', 'B']);
  g.turnScore = 200;
  g.currentCombos = [{ comboId: 'c0', type: 'brelan', dieIds: ['a', 'b', 'c'], points: 300, selected: true }];
  g.bankScore();
  assert.equal(g.players[0].score, 500);
});

// --- Test 11 : les 5 dés utilisés => relance des 5 dés possible -------------
test('Test 11 — 5 dés utilisés (suite) => dés chauds, relance de 5 dés neufs', () => {
  const g = new GameController(['A', 'B']);
  const { combos, usesAllDice } = detectCombinations(dice([1, 2, 3, 4, 5]));
  assert.equal(usesAllDice, true);
  g.tableDice = combos[0].dieIds.map((id, i) => ({ id, value: i + 1, x: 0, y: 0, state: 'selected', comboId: 'c0' }));
  g.currentCombos = [{ comboId: 'c0', ...combos[0], selected: true }];
  g.usesAllDice = true;
  let hot = null;
  g.on('hotDice', (e) => (hot = e));
  g.reroll();
  assert.ok(hot);
  assert.equal(g.turnScore, 1500);
  assert.equal(g.committedDice.length, 0); // tous les dés sont "rendus" : relance de 5 dés frais
});

// --- Test 12 : 10 000 points => victoire ------------------------------------
test('Test 12 — Atteindre 10 000 points => victoire', () => {
  assert.equal(checkVictory(9999), false);
  assert.equal(checkVictory(10000), true);
  assert.equal(checkVictory(10250), true);

  const g = new GameController(['Thomas', 'Julie']);
  g.players[0].score = 9600;
  g.turnScore = 0;
  g.currentCombos = [{ comboId: 'c0', type: 'brelan', dieIds: ['a', 'b', 'c'], points: 650, selected: true }];
  let victory = null;
  g.on('victory', (e) => (victory = e));
  g.bankScore();
  assert.ok(victory);
  assert.equal(victory.player.name, 'Thomas');
  assert.equal(victory.player.score, 10250);
  assert.equal(g.gameOver, true);
});

// --- Bonus : calculateScore additionne bien plusieurs combos ----------------
test('Bonus — calculateScore additionne les combos sélectionnés', () => {
  const total = calculateScore([{ points: 300 }, { points: 150 }]);
  assert.equal(total, 450);
});

console.log(`\n==================================`);
console.log(`${passed} test(s) réussi(s), ${failed} échec(s).\n`);
if (failed > 0) process.exit(1);
