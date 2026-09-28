/**
 * main.js — Bootstrap de l'application : navigation entre écrans,
 * configuration de la partie locale, câblage de l'UI au GameController.
 */

import { GameController } from './game.js';
import { openLobby } from './net.js';
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
document.getElementById('btn-create-room').addEventListener('click', () => openOnlineScreen('create'));
document.getElementById('btn-join-room').addEventListener('click', () => openOnlineScreen('join'));
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

// ------------------------------------------------------------------ Salon en ligne
const onlineEl = {
  back: document.getElementById('online-back'),
  title: document.getElementById('online-title'),
  stepForm: document.getElementById('online-step-form'),
  stepLobby: document.getElementById('online-step-lobby'),
  name: document.getElementById('online-name'),
  codeRow: document.getElementById('online-code-row'),
  codeInput: document.getElementById('online-code-input'),
  error: document.getElementById('online-error'),
  submit: document.getElementById('online-submit'),
  roomCode: document.getElementById('online-room-code'),
  lobbyPlayers: document.getElementById('online-lobby-players'),
  startBtn: document.getElementById('online-start-btn'),
  waitNote: document.getElementById('online-wait-note'),
};

let lobby = null; // objet retourné par openLobby()
let onlineMode = null; // 'create' | 'join'
let isOnlineGame = false;
let myMemberId = null;

function openOnlineScreen(mode) {
  onlineMode = mode;
  onlineEl.title.textContent = mode === 'create' ? 'Créer une partie' : 'Rejoindre une partie';
  onlineEl.codeRow.hidden = mode !== 'join';
  onlineEl.error.hidden = true;
  onlineEl.name.value = '';
  onlineEl.codeInput.value = '';
  onlineEl.stepForm.hidden = false;
  onlineEl.stepLobby.hidden = true;
  onlineEl.submit.disabled = false;
  showScreen('screen-online');
}

onlineEl.back.addEventListener('click', () => { if (lobby) { lobby.close(); lobby = null; } });

onlineEl.submit.addEventListener('click', () => {
  const name = onlineEl.name.value.trim() || 'Joueur';
  onlineEl.error.hidden = true;
  onlineEl.submit.disabled = true;

  lobby = openLobby({
    onCreated: (code) => { myMemberId = 0; renderLobbyCode(code); },
    onJoined: () => { onlineEl.stepForm.hidden = true; onlineEl.stepLobby.hidden = false; },
    onLobby: (msg) => renderLobby(msg),
    onError: (message) => {
      onlineEl.error.textContent = message;
      onlineEl.error.hidden = false;
      onlineEl.submit.disabled = false;
    },
    onStarted: (remoteController) => {
      isOnlineGame = true;
      myMemberId = remoteController.memberId;
      enterGame(remoteController);
    },
  });

  if (onlineMode === 'create') lobby.create(name);
  else lobby.join(onlineEl.codeInput.value, name);
});

function renderLobbyCode(code) {
  onlineEl.stepForm.hidden = true;
  onlineEl.stepLobby.hidden = false;
  onlineEl.roomCode.textContent = code;
}

function renderLobby(msg) {
  onlineEl.roomCode.textContent = msg.code;
  onlineEl.lobbyPlayers.replaceChildren();
  msg.players.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = `lobby-player-row${p.connected ? '' : ' disconnected'}`;
    row.innerHTML = `<span class="avatar">${AVATAR_ICONS[i % AVATAR_ICONS.length]}</span><span>${UI.escapeHtml(p.name)}</span>${p.id === msg.hostId ? '<span class="lobby-host-tag">Hôte</span>' : ''}`;
    onlineEl.lobbyPlayers.appendChild(row);
  });
  const isHost = msg.hostId === myMemberId;
  onlineEl.startBtn.hidden = !isHost;
  onlineEl.startBtn.disabled = !msg.canStart;
  onlineEl.waitNote.hidden = isHost;
}

onlineEl.startBtn.addEventListener('click', () => lobby?.startGame());

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
  turnBanner: document.getElementById('online-turn-banner'),
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
  isOnlineGame = false;
  enterGame(new GameController(names));
}

function enterGame(ctrl) {
  controller = ctrl;
  wireController(controller);
  UI.removeAllDice(el.diceLayer);
  UI.hideComboBanner(el.comboBanner);
  el.bustBanner.hidden = true;
  updateHud();
  UI.renderPlayers(el.playersRing, controller.players, controller.currentPlayerIndex);
  resetActionButtons();
  updateTurnBanner();
  showScreen('screen-game');
}

/** En ligne, seul le joueur dont c'est le tour peut agir. */
function isMyTurn() {
  return !isOnlineGame || controller.currentPlayerIndex === myMemberId;
}

function updateTurnBanner() {
  if (!isOnlineGame || !controller) { el.turnBanner.hidden = true; return; }
  el.turnBanner.hidden = false;
  el.turnBanner.textContent = isMyTurn() ? 'À vous de jouer !' : `Tour de ${controller.currentPlayer.name}…`;
}

function resetActionButtons() {
  el.btnRoll.hidden = !isMyTurn();
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
      el.btnReroll.hidden = !isMyTurn();
      el.btnBank.hidden = !isMyTurn();
      updateActionAvailability();
    } else {
      UI.hideComboBanner(el.comboBanner);
    }
    updateHud();
    updateTurnBanner();
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
    // On capture les ids MAINTENANT : en ligne, l'événement 'turnChanged'
    // qui suit peut arriver et réécrire l'état du contrôleur avant que ce
    // minuteur ne se déclenche — il ne faut pas relire controller.* plus tard.
    const deadIds = ctrl.tableDice.map((d) => d.id);
    const committedIds = ctrl.committedDice.map((d) => d.id);
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
      UI.clearDeadDiceFade(el.diceLayer, deadIds);
      // Les dés verrouillés lors des relances précédentes de ce tour disparaissent aussi.
      UI.clearDeadDiceFade(el.diceLayer, committedIds);
    }, BUST_REVEAL_DELAY);
  });

  ctrl.on('turnChanged', ({ player, players }) => {
    setTimeout(() => {
      UI.renderPlayers(el.playersRing, players, ctrl.currentPlayerIndex);
      UI.removeAllDice(el.diceLayer);
      UI.hideComboBanner(el.comboBanner);
      resetActionButtons();
      updateHud();
      updateTurnBanner();
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
    // En ligne, c'est le SERVEUR qui enchaîne la relance (seule autorité) ;
    // en local, c'est ce client-ci qui le fait directement.
    if (ctrl.autoChainsReroll) ctrl.roll();
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
  if (!dieEl || !controller || !isMyTurn()) return;
  const die = controller.tableDice.find((d) => d.id === dieEl.dataset.dieId);
  if (!die || !die.comboId) return; // dé mort : non sélectionnable
  controller.toggleCombo(die.comboId);
});

el.btnRoll.addEventListener('click', () => {
  if (!controller || !isMyTurn()) return;
  controller.roll();
});

el.btnReroll.addEventListener('click', () => {
  if (!controller || !controller.canAct || !isMyTurn()) return;
  captureUnlockedOrigins();
  controller.reroll(); // émet diceLocked/hotDice puis readyToReroll (qui relance automatiquement)
});

el.btnBank.addEventListener('click', () => {
  if (!controller || !controller.canAct || !isMyTurn()) return;
  controller.bankScore();
});

document.getElementById('btn-quit-game').addEventListener('click', () => {
  if (confirm('Quitter la partie en cours ?')) {
    if (isOnlineGame && lobby) { lobby.close(); lobby = null; }
    controller = null;
    isOnlineGame = false;
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
  document.getElementById('btn-replay').textContent = isOnlineGame ? 'NOUVEAU SALON' : 'REJOUER';
  showScreen('screen-victory');
  if (confettiStop) confettiStop();
  confettiStop = UI.launchConfetti(document.getElementById('confetti-canvas'));
}

document.getElementById('btn-replay').addEventListener('click', () => {
  if (confettiStop) confettiStop();
  if (isOnlineGame) {
    // Une partie en ligne terminée ferme le salon : il faut en recréer un
    // pour rejouer (les codes de salon ne sont pas réutilisables).
    if (lobby) { lobby.close(); lobby = null; }
    isOnlineGame = false;
    controller = null;
    showScreen('screen-menu');
    return;
  }
  const names = controller ? controller.players.map((p) => p.name) : DEFAULT_NAMES.slice(0, playerCount);
  startGame(names);
});

document.getElementById('btn-victory-menu').addEventListener('click', () => {
  if (confettiStop) confettiStop();
  if (isOnlineGame && lobby) { lobby.close(); lobby = null; }
  isOnlineGame = false;
  controller = null;
  showScreen('screen-menu');
});

showScreen('screen-menu');
