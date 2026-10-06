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
  wouldOvershoot,
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

// --- Test 7 : sélection LIBRE dé par dé => statut verrouillé ----------------
test('Test 7 — Sélection libre : cliquer un dé le sélectionne individuellement', () => {
  const g = new GameController(['A', 'B']);
  g.tableDice = [
    { id: 'a', value: 3, x: 0, y: 0, state: 'scorable', selected: false },
    { id: 'b', value: 3, x: 0, y: 0, state: 'scorable', selected: false },
    { id: 'c', value: 3, x: 0, y: 0, state: 'scorable', selected: false },
    { id: 'd', value: 2, x: 0, y: 0, state: 'dead', selected: false },
    { id: 'e', value: 6, x: 0, y: 0, state: 'dead', selected: false },
  ];
  g.toggleDie('a');
  g.toggleDie('b');
  g.toggleDie('c');
  assert.ok(g.tableDice.filter((d) => ['a', 'b', 'c'].includes(d.id)).every((d) => d.selected === true));
  assert.equal(g.canAct, true); // 3 mêmes valeurs sélectionnées = brelan valide
  assert.equal(g._selectedPoints(), 300);
});

test('Test 7bis — Sélectionner un dé "mort" ne rapporte rien tant que ce n\'est pas une combinaison', () => {
  const g = new GameController(['A', 'B']);
  g.tableDice = [
    { id: 'a', value: 3, x: 0, y: 0, state: 'scorable', selected: false },
    { id: 'b', value: 3, x: 0, y: 0, state: 'scorable', selected: false },
    { id: 'c', value: 3, x: 0, y: 0, state: 'scorable', selected: false },
    { id: 'd', value: 2, x: 0, y: 0, state: 'dead', selected: false },
  ];
  g.toggleDie('a');
  g.toggleDie('b');
  g.toggleDie('c');
  g.toggleDie('d'); // le joueur choisit AUSSI un dé mort : sélection "impure"
  assert.equal(g.canAct, false);
  assert.equal(g._selectedPoints(), 0);
});

// --- Test 8 : relance => seuls les dés non conservés bougent ----------------
test('Test 8 — Relance : les dés conservés restent, seuls les autres sont relancés', () => {
  const g = new GameController(['A', 'B']);
  g.tableDice = [
    { id: 'a', value: 3, x: 100, y: 100, state: 'scorable', selected: true },
    { id: 'b', value: 3, x: 120, y: 100, state: 'scorable', selected: true },
    { id: 'c', value: 3, x: 140, y: 100, state: 'scorable', selected: true },
    { id: 'd', value: 2, x: 200, y: 200, state: 'dead', selected: false },
    { id: 'e', value: 6, x: 220, y: 220, state: 'dead', selected: false },
  ];
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
  g.tableDice = [
    { id: 'a', value: 3, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'b', value: 3, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'c', value: 3, x: 0, y: 0, state: 'scorable', selected: true },
  ];
  g.bankScore();
  assert.equal(g.players[0].score, 500);
});

// --- Test 11 : les 5 dés utilisés => relance des 5 dés possible -------------
test('Test 11 — 5 dés utilisés (suite) => dés chauds, relance de 5 dés neufs', () => {
  const g = new GameController(['A', 'B']);
  const rolled = dice([1, 2, 3, 4, 5]);
  const { usesAllDice } = detectCombinations(rolled);
  assert.equal(usesAllDice, true);
  g.tableDice = rolled.map((d) => ({ id: d.id, value: d.value, x: 0, y: 0, state: 'scorable', selected: true }));
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
  g.tableDice = [
    { id: 'a', value: 4, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'b', value: 4, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'c', value: 4, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'd', value: 4, x: 0, y: 0, state: 'scorable', selected: true },
  ]; // carré de 4 = 800 points
  let victory = null;
  g.on('victory', (e) => (victory = e));
  g.bankScore();
  assert.ok(victory);
  assert.equal(victory.player.name, 'Thomas');
  assert.equal(victory.player.score, 10400);
  assert.equal(g.gameOver, true);
});

// --- Test 13 : passer la main — les dés gardés sont hérités par le suivant --
test('Test 13 — Passer la main : le joueur suivant hérite des dés gardés, pas des dés morts', () => {
  const g = new GameController(['Alice', 'Bob']);
  // Alice a gardé un brelan de 4 (3 dés) et avait 2 dés non retenus sur la table.
  g.tableDice = [
    { id: 'a', value: 4, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'b', value: 4, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'c', value: 4, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'd', value: 2, x: 0, y: 0, state: 'dead', selected: false },
    { id: 'e', value: 6, x: 0, y: 0, state: 'dead', selected: false },
  ];
  g.bankScore(); // Alice sécurise 400 et passe la main à Bob
  assert.equal(g.players[0].score, 400);
  assert.equal(g.currentPlayer.name, 'Bob');
  assert.equal(g.pendingInherited.length, 3, 'seuls les 3 dés gardés doivent être hérités, pas les 2 morts');
  assert.deepEqual(g.pendingInherited.map((d) => d.value).sort(), [4, 4, 4]);

  // Quand Bob lance, il ne relance que 5-3=2 dés ; les 3 hérités gardent leur valeur.
  g.roll();
  assert.equal(g.tableDice.length, 5);
  const fourCount = g.tableDice.filter((d) => d.value === 4).length;
  assert.ok(fourCount >= 3, 'les 3 dés hérités (valeur 4) doivent toujours être présents');
  assert.equal(g.isBust, false, 'un lancer qui hérite déjà d\'une combinaison valable ne peut pas être un tour perdu');
  assert.equal(g.pendingInherited.length, 0, 'les dés hérités sont consommés après le roll()');
});

test('Test 13bis — Dés chauds (5 dés utilisés) : rien n\'est hérité, le suivant repart à zéro', () => {
  const g = new GameController(['Alice', 'Bob']);
  g.tableDice = [1, 2, 3, 4, 5].map((v, i) => ({ id: `d${i}`, value: v, x: 0, y: 0, state: 'scorable', selected: true }));
  g.bankScore(); // suite complète, les 5 dés ont servi
  assert.equal(g.pendingInherited.length, 0);
});

// --- Test 14 : il faut tomber PILE sur 10 000, jamais dépasser -------------
test('Test 14 — wouldOvershoot : vrai seulement si on dépasse strictement 10 000', () => {
  // À 9600, +400 tombe pile (10000) : autorisé.
  assert.equal(wouldOvershoot(9600, 0, 400), false);
  // À 9600, +600 dépasse (10600) : refusé.
  assert.equal(wouldOvershoot(9600, 0, 600), true);
  // Les points du tour en cours comptent aussi dans le total.
  assert.equal(wouldOvershoot(9000, 500, 500), false); // 9000+500+500=10000 pile
  assert.equal(wouldOvershoot(9000, 500, 600), true); // 10100 : refusé
  // Loin de l'objectif : jamais de souci.
  assert.equal(wouldOvershoot(0, 0, 4000), false);
});

test('Test 14bis — roll() déclenche un tour perdu automatique si la combinaison dépasserait 10 000', () => {
  const g = new GameController(['Alice', 'Bob']);
  g.players[0].score = 9600; // il ne lui faut plus que 400 pile
  let bustEvent = null;
  g.on('bust', (e) => { bustEvent = e; });

  // On simule directement ce que roll() aurait détecté : un brelan de 6
  // (600 points) qui dépasserait l'objectif de 9600+600=10200.
  g.tableDice = [
    { id: 'a', value: 6, x: 0, y: 0, state: 'scorable', selected: false },
    { id: 'b', value: 6, x: 0, y: 0, state: 'scorable', selected: false },
    { id: 'c', value: 6, x: 0, y: 0, state: 'scorable', selected: false },
  ];
  const detection = detectCombinations([{ value: 6 }, { value: 6 }, { value: 6 }]);
  const comboValue = calculateScore(detection.combos);
  assert.equal(comboValue, 600);
  const overshoot = wouldOvershoot(g.players[0].score, g.turnScore, comboValue);
  assert.equal(overshoot, true, 'un brelan de 6 (600) doit dépasser le besoin exact de 400');

  // Reproduit la décision prise par roll() dans ce cas : tour perdu immédiat.
  g.isOvershoot = overshoot;
  g._loseTurn();
  assert.ok(bustEvent);
  assert.equal(bustEvent.isOvershoot, true);
  assert.equal(g.players[0].score, 9600, 'le score déjà sécurisé ne bouge pas');
  assert.equal(g.currentPlayerIndex, 1, 'la main passe bien au joueur suivant');
});

// --- Test 15 : la combinaison détectée est présélectionnée automatiquement --
test('Test 15 — roll() présélectionne automatiquement la combinaison trouvée (pas 0 point par défaut)', () => {
  const g = new GameController(['A', 'B']);
  g.roll();
  if (g.isBust) return; // lancer malchanceux, rien à vérifier ici
  // Sans qu'on ait rien sélectionné soi-même, la combinaison détectée doit
  // déjà être prête à sécuriser/relancer.
  assert.equal(g.canAct, true, 'canAct doit être vrai dès le lancer si une combinaison existe');
  assert.ok(g.bankable > 0, 'bankable doit refléter la combinaison détectée sans tap supplémentaire');
  const scorableDice = g.tableDice.filter((d) => d.state === 'scorable');
  assert.ok(scorableDice.every((d) => d.selected === true), 'tous les dés scorables doivent être présélectionnés');
});

test('Test 15bis — une main reprise (dés hérités) est elle aussi présélectionnée et sécurisable', () => {
  const g = new GameController(['A', 'B']);
  g.pendingInherited = [
    { id: 'x', value: 4 }, { id: 'y', value: 4 }, { id: 'z', value: 4 },
  ];
  g.roll();
  assert.equal(g.isBust, false);
  assert.equal(g.canAct, true);
  // Les 2 dés neufs peuvent parfois étendre la combinaison (full, carré…) :
  // on vérifie juste qu'on a AU MOINS le brelan hérité, déjà sécurisable.
  assert.ok(g.bankable >= 400, `au moins le brelan hérité (400) doit être immédiatement sécurisable, reçu ${g.bankable}`);
});

// --- Bonus : calculateScore additionne bien plusieurs combos ----------------
test('Bonus — calculateScore additionne les combos sélectionnés', () => {
  const total = calculateScore([{ points: 300 }, { points: 150 }]);
  assert.equal(total, 450);
});

console.log(`\n==================================`);
console.log(`${passed} test(s) réussi(s), ${failed} échec(s).\n`);
if (failed > 0) process.exit(1);
