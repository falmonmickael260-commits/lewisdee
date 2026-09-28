/**
 * main.js — Bootstrap de l'application : navigation entre écrans,
 * configuration de la partie locale, câblage de l'UI au GameController.
 */

import { GameController } from './game.js';
import * as UI from './ui.js';

// ------------------------------------------------------------------ DOM refs
const screens = {};
document.querySelectorAll('.screen').forEach((el) => (screens[el.id] = el));

function showScreen(id) {
  Object.values(screens).forEach((el) => el.classList.remove('active'));
  screens[id].classList.add('active');
}

document.querySelectorAll('[data-back]').forEach((btn) => {
  btn.addEventListener('click', () => showScreen(btn.dataset.back));
});

// ------------------------------------------------------------------ Menu
document.getElementById('btn-play-local').addEventListener('click', () => showScreen('screen-setup'));
document.getElementById('btn-create-room').addEventListener('click', () => {
  document.getElementById('online-title').textContent = 'Créer une partie';
  showScreen('screen-online');
});
document.getElementById('btn-join-room').addEventListener('click', () => {
  document.getElementById('online-title').textContent = 'Rejoindre une partie';
  showScreen('screen-online');
});
document.getElementById('btn-rules').addEventListener('click', () => showScreen('screen-rules'));
document.getElementById('btn-settings').addEventListener('click', () => showScreen('screen-settings'));

// ------------------------------------------------------------------ Réglages
const DEFAULT_NAMES = ['Thomas', 'Mickaël', 'Julie', 'Sarah'];
const AVATAR_ICONS = ['🦊', '🐺', '🦁', '🐯'];

document.getElementById('toggle-reduced-motion').addEventListener('change', (e) => {
  UI.setReducedMotion(e.target.checked);
});

// ------------------------------------------------------------------ Setup local
let playerCount = 2;
const toggle = document.getElementById('player-count-toggle');
const namesWrap = document.getElementById('setup-names');

function renderNameInputs() {
  namesWrap.replaceChildren();
  for (let i = 0; i < playerCount; i++) {
    const row = document.createElement('div');
    row.className = 'name-input-row';
    row.innerHTML = `
      <span class="avatar">${AVATAR_ICONS[i]}</span>
      <input type="text" maxlength="14" placeholder="${DEFAULT_NAMES[i]}" data-player-index="${i}" />`;
    namesWrap.appendChild(row);
  }
}
renderNameInputs();

toggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.count-btn');
  if (!btn) return;
  toggle.querySelectorAll('.count-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  playerCount = Number(btn.dataset.count);
  renderNameInputs();
});

document.getElementById('btn-start-game').addEventListener('click', () => {
  const inputs = [...namesWrap.querySelectorAll('input')];
  const names = inputs.map((inp, i) => (inp.value.trim() || DEFAULT_NAMES[i]));
  startGame(names);
});

// ------------------------------------------------------------------ Écran de jeu : refs
const el = {
  playersRing: document.getElementById('players-ring'),
  diceLayer: document.getElementById('dice-layer'),
  comboBanner: document.getElementById('combo-banner'),
  comboLabel: document.getElementById('combo-label'),
  comboPoints: document.getElementById('combo-points'),
  bustBanner: document.getElementById('bust-banner'),
  bustSub: document.getElementById('bust-sub'),
  playerName: document.getElementById('hud-player-name'),
  score: document.getElementById('hud-score'),
  turnPoints: document.getElementById('hud-turn-points'),
  btnRoll: document.getElementById('btn-roll'),
  btnReroll: document.getElementById('btn-reroll'),
  btnBank: document.getElementById('btn-bank'),
  bankAmount: document.getElementById('bank-amount'),
};

let controller = null;

// Timings des transitions de tour : le délai par défaut laisse voir le score
// s'animer après une sécurisation ; le délai "bust" laisse d'abord les dés
// terminer leur vol et se poser avant de révéler le tour perdu.
const BANK_TRANSITION_DELAY = 780;
// Le lancer le plus lent = 4 dés de décalage en cascade (4×90ms) + la durée
// de vol la plus longue (~1450ms) + une marge de jitter : on attend que
// TOUS les dés soient posés avant de révéler un tour perdu.
const BUST_REVEAL_DELAY = 1900;
const BUST_FADE_DURATION = 420;
let turnTransitionDelay = BANK_TRANSITION_DELAY;

function startGame(names) {
  controller = new GameController(names);
  wireController(controller);
  UI.removeAllDice(el.diceLayer);
  UI.hideComboBanner(el.comboBanner);
  el.bustBanner.hidden = true;
  updateHud();
  UI.renderPlayers(el.playersRing, controller.players, controller.currentPlayerIndex);
  resetActionButtons();
  showScreen('screen-game');
}

function resetActionButtons() {
  el.btnRoll.hidden = false;
  el.btnReroll.hidden = true;
  el.btnBank.hidden = true;
}

function updateHud() {
  const p = controller.currentPlayer;
  el.playerName.textContent = p.name;
  UI.animateNumber(el.score, p.score);
  const pending = controller.currentCombos.filter((c) => c.selected).reduce((s, c) => s + c.points, 0);
  const total = controller.turnScore + pending;
  UI.animateNumber(el.turnPoints, total, { prefix: '+', duration: 260 });
}

function updateActionAvailability() {
  const canAct = controller.canAct;
  el.btnReroll.disabled = !canAct;
  el.btnBank.disabled = !canAct;
  el.btnReroll.style.opacity = canAct ? 1 : 0.45;
  el.btnBank.style.opacity = canAct ? 1 : 0.45;
  el.bankAmount.textContent = controller.bankable.toLocaleString('fr-FR');
}

// Positions des dés "morts"/non verrouillés avant une relance, pour que la
// nouvelle animation de lancer parte de leur position actuelle plutôt que
// du centre (sensation de "ramasser puis rejeter ces dés-là").
let lastUnlockedOrigins = [];

function captureUnlockedOrigins() {
  lastUnlockedOrigins = controller.tableDice
    .filter((d) => d.state !== 'selected')
    .map((d) => ({ x: d.x, y: d.y }));
}

function wireController(ctrl) {
  ctrl.on('rolled', ({ dice, isBust }) => {
    dice.forEach((die, i) => {
      const origin = lastUnlockedOrigins[i];
      // Chaque dé part un peu après le précédent (cadence en cascade) pour
      // qu'on voie clairement 5 dés distincts être lancés, pas un bloc figé.
      UI.throwDie(el.diceLayer, die, { ...(origin ? { fromPosition: origin } : {}), delay: i * 90 });
    });
    lastUnlockedOrigins = [];

    // Le prochain changement de joueur doit attendre la fin de la séquence
    // visuelle en cours (voir turnChanged plus bas) : on réinitialise le
    // délai par défaut ici, au tout début de chaque nouveau lancer.
    turnTransitionDelay = BANK_TRANSITION_DELAY;

    if (!isBust) {
      UI.showComboBanner(el.comboBanner, el.comboLabel, el.comboPoints, ctrl.currentCombos);
      el.btnRoll.hidden = true;
      el.btnReroll.hidden = false;
      el.btnBank.hidden = false;
      updateActionAvailability();
    } else {
      UI.hideComboBanner(el.comboBanner);
    }
    updateHud();
  });

  ctrl.on('selectionChanged', () => {
    updateHud();
    updateActionAvailability();
    controller.tableDice.forEach((d) => UI.markDieState(el.diceLayer, d.id, d.state));
  });

  ctrl.on('bust', ({ lost, wasFirstRoll }) => {
    el.btnRoll.hidden = true;
    el.btnReroll.hidden = true;
    el.btnBank.hidden = true;
    // On laisse le temps aux dés de terminer leur vol et de se poser
    // (même timing que l'animation de lancer) avant de révéler le "tour
    // perdu" : le joueur doit d'abord VOIR où les dés sont tombés.
    turnTransitionDelay = BUST_REVEAL_DELAY + BUST_FADE_DURATION + 260;
    setTimeout(() => {
      const msg = wasFirstRoll
        ? 'Aucune combinaison au premier lancer.'
        : `${lost.toLocaleString('fr-FR')} points perdus.`;
      UI.hideComboBanner(el.comboBanner);
      UI.showBustBanner(el.bustBanner, el.bustSub, msg);
      const deadIds = controller.tableDice.map((d) => d.id);
      UI.clearDeadDiceFade(el.diceLayer, deadIds);
      // Les dés verrouillés lors des relances précédentes de ce tour disparaissent aussi.
      UI.clearDeadDiceFade(el.diceLayer, controller.committedDice.map((d) => d.id));
    }, BUST_REVEAL_DELAY);
  });

  ctrl.on('turnChanged', ({ player, players }) => {
    setTimeout(() => {
      UI.renderPlayers(el.playersRing, players, ctrl.currentPlayerIndex);
      UI.removeAllDice(el.diceLayer);
      UI.hideComboBanner(el.comboBanner);
      resetActionButtons();
      updateHud();
    }, turnTransitionDelay);
  });

  ctrl.on('diceLocked', ({ committedDice }) => {
    const lockedIds = committedDice.map((d) => d.id);
    const toRemove = [...el.diceLayer.children]
      .map((c) => c.dataset.dieId)
      .filter((id) => !lockedIds.includes(id));
    UI.clearDeadDiceFade(el.diceLayer, toRemove);
    lockedIds.forEach((id) => UI.markDieState(el.diceLayer, id, 'locked'));
    UI.hideComboBanner(el.comboBanner);
  });

  ctrl.on('hotDice', () => {
    UI.removeAllDice(el.diceLayer);
    UI.hideComboBanner(el.comboBanner);
  });

  ctrl.on('readyToReroll', () => {
    el.btnReroll.hidden = true;
    el.btnBank.hidden = true;
    el.btnRoll.hidden = true; // on relance automatiquement
    updateHud();
    ctrl.roll();
  });

  ctrl.on('banked', ({ player, gained, newScore }) => {
    el.btnRoll.hidden = true;
    el.btnReroll.hidden = true;
    el.btnBank.hidden = true;
    UI.hideComboBanner(el.comboBanner);
    UI.bumpElement(el.turnPoints);
    // On anime la montée du score du joueur qui vient de sécuriser AVANT que
    // le tour ne bascule sur le suivant, pour que le gain soit bien visible.
    UI.animateNumber(el.score, newScore, { duration: 550 });
    setTimeout(() => UI.bumpElement(el.score), 60);
  });

  ctrl.on('victory', ({ player, finalScores }) => {
    setTimeout(() => showVictory(player, finalScores), 500);
  });
}

// ------------------------------------------------------------------ Interactions dés / boutons

el.diceLayer.addEventListener('click', (e) => {
  const dieEl = e.target.closest('.die');
  if (!dieEl || !controller) return;
  const die = controller.tableDice.find((d) => d.id === dieEl.dataset.dieId);
  if (!die || !die.comboId) return; // dé mort : non sélectionnable
  controller.toggleCombo(die.comboId);
});

el.btnRoll.addEventListener('click', () => {
  if (!controller) return;
  controller.roll();
});

el.btnReroll.addEventListener('click', () => {
  if (!controller || !controller.canAct) return;
  captureUnlockedOrigins();
  controller.reroll(); // émet diceLocked/hotDice puis readyToReroll (qui relance automatiquement)
});

el.btnBank.addEventListener('click', () => {
  if (!controller || !controller.canAct) return;
  controller.bankScore();
});

document.getElementById('btn-quit-game').addEventListener('click', () => {
  if (confirm('Quitter la partie en cours ?')) {
    controller = null;
    showScreen('screen-menu');
  }
});

// ------------------------------------------------------------------ Victoire

let confettiStop = null;

function showVictory(winner, ranking) {
  document.getElementById('victory-winner').textContent = winner.name;
  document.getElementById('victory-score').textContent = `${winner.score.toLocaleString('fr-FR')} POINTS`;
  const rankEl = document.getElementById('victory-ranking');
  rankEl.replaceChildren();
  ranking.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = `rank-row${i === 0 ? ' first' : ''}`;
    row.innerHTML = `<span>${i + 1}. ${UI.escapeHtml(p.name)}</span><span>${p.score.toLocaleString('fr-FR')} pts</span>`;
    rankEl.appendChild(row);
  });
  showScreen('screen-victory');
  if (confettiStop) confettiStop();
  confettiStop = UI.launchConfetti(document.getElementById('confetti-canvas'));
}

document.getElementById('btn-replay').addEventListener('click', () => {
  if (confettiStop) confettiStop();
  const names = controller ? controller.players.map((p) => p.name) : DEFAULT_NAMES.slice(0, playerCount);
  startGame(names);
});

document.getElementById('btn-victory-menu').addEventListener('click', () => {
  if (confettiStop) confettiStop();
  controller = null;
  showScreen('screen-menu');
});

showScreen('screen-menu');
