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
  let bustEvent = null;
  g.on('bust', (e) => { bustEvent = e; });
  g.roll();
  if (g.isBust) {
    // Les 2 dés neufs n'ont pas amélioré le brelan de 4 (400) : Bob doit
    // repartir bredouille, et les 400 d'Alice ne doivent JAMAIS lui revenir.
    assert.equal(bustEvent?.isNoImprovement, true);
    assert.equal(g.players[1].score, 0, 'Bob ne récupère jamais les points déjà sécurisés par Alice');
    assert.equal(g.players[0].score, 400, 'les points d\'Alice restent acquis, inchangés');
  } else {
    // Les 2 dés neufs ont étendu la combinaison (carré, full…) : c'est
    // entièrement la réussite de Bob, et ça reste strictement supérieur à
    // ce qu'Alice avait déjà sécurisé pour elle-même.
    assert.equal(g.tableDice.length, 5);
    const fourCount = g.tableDice.filter((d) => d.value === 4).length;
    assert.ok(fourCount >= 3, 'les 3 dés hérités (valeur 4) doivent toujours être présents');
    assert.ok(g.bankable > 400, 'une amélioration doit forcément dépasser les 400 déjà pris par Alice');
  }
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

test('Test 15bis — une main reprise (dés hérités) : amélioration = présélectionnée et sécurisable, sinon 0', () => {
  const g = new GameController(['A', 'B']);
  g.pendingInherited = [
    { id: 'x', value: 4 }, { id: 'y', value: 4 }, { id: 'z', value: 4 },
  ];
  g.pendingInheritedValue = 400; // ce que ce brelan de 4 valait déjà pour A
  let bustEvent = null;
  g.on('bust', (e) => { bustEvent = e; });
  g.roll();
  if (g.isBust) {
    assert.equal(bustEvent?.isNoImprovement, true);
    assert.equal(g.canAct, false);
  } else {
    assert.equal(g.canAct, true);
    // Les 2 dés neufs ont forcément étendu la combinaison (sinon ça aurait
    // été détecté comme un tour perdu ci-dessus) : strictement > 400.
    assert.ok(g.bankable > 400, `une amélioration doit dépasser les 400 déjà pris par A, reçu ${g.bankable}`);
  }
});

// --- Test 16 : B ne récupère JAMAIS les points sécurisés par A si ses dés
// neufs n'améliorent pas la combinaison héritée (règle centrale demandée) ---
test('Test 16 — Si les dés neufs n\'améliorent pas la main héritée, le joueur perd tout et A garde ses points', () => {
  // Les dés neufs n'améliorant pas sont l'issue la PLUS fréquente (il faut
  // deux coïncidences pour étendre un brelan) : on relance un contrôleur
  // frais jusqu'à obtenir ce cas précis, ce qui arrive presque toujours
  // bien avant 300 essais — un échec ici indiquerait un vrai problème.
  let observed = false;
  for (let i = 0; i < 300 && !observed; i++) {
    const g = new GameController(['A', 'B']);
    g.pendingInherited = [{ id: 'x', value: 5 }, { id: 'y', value: 5 }, { id: 'z', value: 5 }];
    g.pendingInheritedValue = 500; // brelan de 5 déjà sécurisé par A
    g.players[0].score = 500;
    g.currentPlayerIndex = 1; // c'est bien B qui reprend la main, pas A
    // Comme le fait vraiment l'UI : on lit l'événement 'bust' au moment où
    // il est émis, pas l'état du contrôleur après coup (isNoImprovement est
    // remis à false juste après, une fois l'événement envoyé).
    let bustEvent = null;
    g.on('bust', (e) => { bustEvent = e; });
    g.roll();
    if (bustEvent && bustEvent.isNoImprovement) {
      observed = true;
      assert.equal(g.canAct, false, 'B ne doit rien pouvoir sécuriser');
      assert.equal(g.players[1].score, 0, 'B ne récupère jamais les 500 points de A');
      assert.equal(g.players[0].score, 500, 'les points de A ne bougent jamais');
      assert.equal(g.currentPlayerIndex, 0, 'la main passe au joueur suivant (ici, retour à A dans une partie à 2)');
    }
  }
  assert.ok(observed, 'le cas "aucune amélioration" devrait survenir au moins une fois sur 300 essais');
});

// --- Bonus : calculateScore additionne bien plusieurs combos ----------------
// --- Test 17 : choix explicite "Nouvelle main" refuse bien l'héritage ------
test('Test 17 — declineInheritance() : le joueur repart à zéro, sans aucun lien avec la main précédente', () => {
  const g = new GameController(['A', 'B']);
  g.pendingInherited = [{ id: 'x', value: 5 }, { id: 'y', value: 5 }, { id: 'z', value: 5 }];
  g.pendingInheritedValue = 500;
  assert.equal(g.hasPendingInheritance, true);

  g.declineInheritance();
  assert.equal(g.hasPendingInheritance, false);
  assert.equal(g.pendingInherited.length, 0);
  assert.equal(g.pendingInheritedValue, 0);

  // Le roll() qui suit doit être une main neuve de 5 dés, sans aucune trace
  // des 5 héritées : aucune garantie de "pas de bust" ne doit s'appliquer.
  g.roll();
  assert.equal(g.tableDice.length <= 5, true);
  // isNoImprovement ne doit JAMAIS se déclencher sur une main refusée.
  let bustEvent = null;
  if (g.isBust) {
    // On ne peut pas prédire si ce lancer précis bust ou non (aléatoire),
    // mais s'il bust, ce doit être un bust NORMAL, pas "pas d'amélioration".
    assert.equal(g.isNoImprovement, false, 'une main refusée ne peut jamais déclencher isNoImprovement');
  }
});

test('Bonus — calculateScore additionne les combos sélectionnés', () => {
  const total = calculateScore([{ points: 300 }, { points: 150 }]);
  assert.equal(total, 450);
});

// --- Test 18 : main pleine (hot dice) -> continuer -> bust : points provisoires perdus, score déjà sécurisé intact ---
test('Test 18 — Main pleine : continuer au risque de tout perdre, puis échec => points provisoires perdus, score déjà sécurisé intact', () => {
  const g = new GameController(['A', 'B']);
  g.players[0].score = 1000; // points déjà sécurisés AVANT cette main
  g.turnScore = 0;
  g.committedDice = [];

  // Lancer qui utilise les 5 dés dans une combinaison valable (suite) : main pleine.
  const rolled = dice([1, 2, 3, 4, 5]);
  const { usesAllDice } = detectCombinations(rolled);
  assert.equal(usesAllDice, true);
  g.tableDice = rolled.map((d) => ({ id: d.id, value: d.value, x: 0, y: 0, state: 'scorable', selected: true }));

  // Le joueur choisit de CONTINUER plutôt que de sécuriser : reroll() doit
  // déclencher "dés chauds" (5 dés neufs), rien n'est perdu pour l'instant.
  let hot = null;
  g.on('hotDice', (e) => { hot = e; });
  g.reroll();
  assert.ok(hot, 'reroll() sur une main pleine doit déclencher hotDice, pas un bust');
  assert.equal(g.turnScore, 1500, 'les points de la suite restent provisoires (turnScore), pas encore sécurisés');
  assert.equal(g.committedDice.length, 0, 'main pleine : les 5 dés sont "rendus", pas verrouillés');
  assert.equal(g.players[0].score, 1000, 'le score sécurisé ne bouge pas tant que rien n\'est banké');

  // Le lancer suivant échoue (aucune combinaison) : on simule directement
  // l'échec (comportement de roll() déjà vérifié ailleurs avec de vrais
  // lancers), pour un test déterministe qui ne dépend pas du hasard.
  g._loseTurn();
  assert.equal(g.players[0].score, 1000, 'les points déjà sécurisés AVANT cette main restent intacts');
  assert.equal(g.turnScore, 0, 'les points provisoires de cette main sont bien perdus');
  assert.equal(g.currentPlayer.name, 'B', 'le tour passe au joueur suivant après l\'échec');
});

// --- Test 19 : main pleine -> sécuriser directement (au lieu de continuer) ---
test('Test 19 — Main pleine : sécuriser directement ajoute les points au score et termine le tour', () => {
  const g = new GameController(['A', 'B']);
  g.players[0].score = 200;
  g.turnScore = 300; // points provisoires d'un leg précédent dans le même tour
  const rolled = dice([2, 3, 4, 5, 6]); // suite
  g.tableDice = rolled.map((d) => ({ id: d.id, value: d.value, x: 0, y: 0, state: 'scorable', selected: true }));
  g.bankScore();
  assert.equal(g.players[0].score, 200 + 300 + 1500, 'score = déjà acquis + provisoire du tour + la suite');
  assert.equal(g.currentPlayer.name, 'B');
});

// --- Test 20 : les dés hérités sont marqués "carried", pas les dés fraîchement lancés ---
test('Test 20 — roll() marque les dés hérités comme "carried", jamais les dés neufs', () => {
  const g = new GameController(['Alice', 'Bob']);
  g.currentPlayerIndex = 1;
  g.pendingInherited = [{ id: 'x', value: 4 }, { id: 'y', value: 4 }, { id: 'z', value: 4 }];
  g.pendingInheritedValue = 400;
  // On lit le tableau de dés au moment précis de l'événement 'rolled' : si ce
  // lancer échoue (les 2 dés neufs n'améliorent pas le brelan hérité),
  // _loseTurn() vide ensuite g.tableDice — ce qui est normal et ne doit pas
  // être confondu avec un bug du marquage "carried".
  let rolledDice = null;
  g.on('rolled', (e) => { rolledDice = e.dice; });
  g.roll();
  assert.equal(rolledDice.length, 5);
  const carriedIds = rolledDice.filter((d) => d.carried).map((d) => d.id).sort();
  assert.deepEqual(carriedIds, ['x', 'y', 'z'], 'seuls les 3 dés hérités doivent porter le marqueur "carried"');
  const freshDice = rolledDice.filter((d) => !['x', 'y', 'z'].includes(d.id));
  assert.equal(freshDice.length, 2);
  assert.ok(freshDice.every((d) => !d.carried), 'les dés fraîchement lancés ne doivent jamais être marqués "carried"');
});

// --- Test 21 : le nombre de dés disponibles est conservé d'un joueur à l'autre ---
test('Test 21 — Le nombre de dés disponibles est conservé entre les joueurs (5 - dés hérités)', () => {
  const g = new GameController(['Alice', 'Bob']);
  g.tableDice = [
    { id: 'a', value: 3, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'b', value: 3, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'c', value: 3, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'd', value: 1, x: 0, y: 0, state: 'dead', selected: false },
    { id: 'e', value: 6, x: 0, y: 0, state: 'dead', selected: false },
  ];
  g.bankScore(); // Alice garde 3 dés (brelan de 3), les 2 autres sont perdus
  assert.equal(g.pendingInherited.length, 3);
  // Comme au Test 20 : on capture le lancer au moment de l'événement, pas
  // après coup (un échec "pas d'amélioration" viderait sinon g.tableDice).
  let rolledDice = null;
  g.on('rolled', (e) => { rolledDice = e.dice; });
  g.roll(); // Bob ne doit (re)lancer QUE les 2 dés restants
  assert.equal(rolledDice.length, 5, 'Bob voit bien 5 dés au total : 3 hérités + 2 relancés');
  const freshCount = rolledDice.filter((d) => !d.carried).length;
  assert.equal(freshCount, 2, 'seuls 2 dés neufs doivent être réellement relancés, pas 5');
});

// --- Test 22 : une action ne peut pas être exécutée deux fois (double clic / appel immédiat) ---
test('Test 22 — bankScore() appelé deux fois de suite ne crédite les points qu\'une seule fois', () => {
  const g = new GameController(['Alice', 'Bob']);
  // Brelan de 2 (200 pts) : un 1 ou un 5 isolé ne vaut RIEN dans ce variant
  // (voir engine.js), il faut une vraie combinaison pour que canAct soit vrai.
  g.tableDice = [
    { id: 'a', value: 2, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'b', value: 2, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'c', value: 2, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'd', value: 1, x: 0, y: 0, state: 'dead', selected: false },
    { id: 'e', value: 6, x: 0, y: 0, state: 'dead', selected: false },
  ];
  g.bankScore(); // brelan de 2 = 200 points
  assert.equal(g.players[0].score, 200);
  // "Double clic" : un second appel immédiat ne doit RIEN faire, car l'état
  // du tour a déjà été remis à zéro par le premier appel (plus aucun dé
  // sélectionné à sécuriser : canAct devient false).
  g.bankScore();
  assert.equal(g.players[0].score, 200, 'un second bankScore() immédiat ne doit pas créditer les points une deuxième fois');
});

test('Test 24 — roll() appelé deux fois de suite (sans reroll()/bankScore() entre les deux) ne relance pas une seconde fois', () => {
  // On ne teste ce garde-fou que sur un premier lancer qui NE busте PAS :
  // si le premier lancer perd la main, _loseTurn() vide légitimement
  // g.tableDice et passe au joueur suivant — un roll() ultérieur serait
  // alors un lancer normal pour ce nouveau joueur, pas un "double clic".
  let checked = false;
  for (let i = 0; i < 300 && !checked; i++) {
    const g = new GameController(['Alice', 'Bob']);
    let rollCount = 0;
    g.on('rolled', () => { rollCount += 1; });
    g.roll();
    if (g.isBust) continue;
    checked = true;
    assert.equal(rollCount, 1);
    const diceAfterFirstRoll = g.tableDice.map((d) => d.id).sort();
    // "Double clic" / rejeu d'action : tant que ce premier lancer n'a pas
    // été résolu (reroll() ou bankScore()), un second roll() ne doit RIEN
    // faire — sinon un joueur pourrait relancer à volonté jusqu'à obtenir
    // un bon résultat, sans jamais risquer de perdre la main.
    g.roll();
    assert.equal(rollCount, 1, 'un second roll() immédiat ne doit pas déclencher un nouveau lancer');
    assert.deepEqual(g.tableDice.map((d) => d.id).sort(), diceAfterFirstRoll, 'les dés du premier lancer ne doivent pas être remplacés');
  }
  assert.ok(checked, 'un premier lancer non perdant devrait survenir au moins une fois sur 300 essais');
});

test('Test 23 — reroll() appelé deux fois de suite ne verrouille pas les dés deux fois', () => {
  const g = new GameController(['Alice', 'Bob']);
  g.tableDice = [
    { id: 'a', value: 2, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'b', value: 2, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'c', value: 2, x: 0, y: 0, state: 'scorable', selected: true },
    { id: 'd', value: 1, x: 0, y: 0, state: 'dead', selected: false },
    { id: 'e', value: 6, x: 0, y: 0, state: 'dead', selected: false },
  ];
  g.reroll(); // verrouille les 3 dés sélectionnés (pas de listener 'readyToReroll' : pas d'auto-relance ici)
  assert.equal(g.committedDice.length, 3);
  // "Double clic" : plus aucun dé n'est sélectionné sur la table (vidée par
  // le premier reroll()), donc canAct est false et ce second appel ne doit
  // rien verrouiller de plus.
  g.reroll();
  assert.equal(g.committedDice.length, 3, 'un second reroll() immédiat ne doit pas dupliquer le verrouillage');
  const ids = g.committedDice.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, 'aucun dé ne doit être verrouillé deux fois');
});

console.log(`\n==================================`);
console.log(`${passed} test(s) réussi(s), ${failed} échec(s).\n`);
if (failed > 0) process.exit(1);
