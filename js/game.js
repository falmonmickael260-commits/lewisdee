/**
 * game.js — Contrôleur de partie ("moteur" au sens large).
 *
 * GameController orchestre les règles (via engine.js) et le placement des
 * dés (via positions.js), et notifie l'UI par un simple système d'events
 * (`on(event, handler)` / `emit`). Il ne touche jamais au DOM : la couche
 * UI (ui.js) s'abonne à ses événements pour animer/afficher.
 *
 * Cette séparation permet, plus tard, de remplacer ce contrôleur local par
 * un client qui reçoit les mêmes événements depuis un serveur Supabase
 * Realtime (voir net/ pour les stubs prévus à cet effet).
 */

import {
  rollDice,
  detectCombinations,
  calculateScore,
  checkVictory,
  WINNING_SCORE,
} from './engine.js';
import { generateDicePositions } from './positions.js';

const AVATARS = ['🦊', '🐺', '🦁', '🐯', '🐻', '🦉', '🐼', '🐸'];

export class GameController {
  constructor(playerNames) {
    this.players = playerNames.map((name, i) => ({
      id: i,
      name,
      avatar: AVATARS[i % AVATARS.length],
      score: 0,
    }));
    this.currentPlayerIndex = 0;
    this.turnScore = 0; // points sécurisés pendant le tour en cours (legs précédents)
    this.pendingScore = 0; // points du leg en cours, pas encore verrouillés
    this.committedDice = []; // dés déjà verrouillés ce tour: {id, value, x, y, rotation}
    this.tableDice = []; // dés du leg courant: {id, value, x, y, rotation, state, comboId}
    this.currentCombos = [];
    this.listeners = {};
    this.gameOver = false;
    this.winner = null;
  }

  on(event, handler) {
    (this.listeners[event] = this.listeners[event] || []).push(handler);
    return () => {
      this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
    };
  }

  emit(event, payload) {
    (this.listeners[event] || []).forEach((h) => h(payload));
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  /** Lance les dés disponibles (5 au début du tour, ou moins si des dés sont conservés). */
  roll() {
    if (this.gameOver) return;
    const availableCount = 5 - this.committedDice.length;
    const obstacles = this.committedDice.map((d) => ({ x: d.x, y: d.y }));
    const positions = generateDicePositions(availableCount, obstacles);
    const rolled = rollDice(availableCount);

    this.tableDice = rolled.map((die, i) => ({
      id: die.id,
      value: die.value,
      x: positions[i].x,
      y: positions[i].y,
      state: 'rolling',
      comboId: null,
    }));

    const detection = detectCombinations(rolled);
    this.currentCombos = detection.combos.map((c, i) => ({ ...c, comboId: `c${i}`, selected: false }));
    this.deadIds = detection.deadIds;
    this.isBust = detection.isBust;
    this.usesAllDice = detection.usesAllDice;

    // Associe chaque dé de la table à sa combo (ou 'dead')
    this.tableDice.forEach((d) => {
      const combo = this.currentCombos.find((c) => c.dieIds.includes(d.id));
      d.comboId = combo ? combo.comboId : null;
      d.state = combo ? 'scorable' : 'dead';
    });

    this.emit('rolled', {
      dice: this.tableDice,
      committedDice: this.committedDice,
      combos: this.currentCombos,
      isBust: this.isBust,
      isFirstRollOfTurn: this.committedDice.length === 0 && this.turnScore === 0,
      usesAllDice: this.usesAllDice,
    });

    if (this.isBust) {
      this._loseTurn();
    }
  }

  /** Sélectionne/désélectionne une combinaison entière (tap sur un dé qui la compose). */
  toggleCombo(comboId) {
    const combo = this.currentCombos.find((c) => c.comboId === comboId);
    if (!combo) return;
    combo.selected = !combo.selected;
    this.tableDice.forEach((d) => {
      if (d.comboId === comboId) d.state = combo.selected ? 'selected' : 'scorable';
    });
    this.emit('selectionChanged', {
      combos: this.currentCombos,
      pendingPoints: this._selectedPoints(),
    });
  }

  _selectedPoints() {
    return calculateScore(this.currentCombos.filter((c) => c.selected));
  }

  get canAct() {
    return this._selectedPoints() > 0;
  }

  get bankable() {
    return this.turnScore + this._selectedPoints();
  }

  /** Sécurise les points : ajoute au score total du joueur et termine le tour. */
  bankScore() {
    if (!this.canAct) return;
    const gained = this.turnScore + this._selectedPoints();
    const player = this.currentPlayer;
    player.score += gained;
    this.emit('banked', { player, gained, newScore: player.score });

    if (checkVictory(player.score)) {
      this.gameOver = true;
      this.winner = player;
      this.emit('victory', { player, finalScores: this._ranking() });
      return;
    }
    this._endTurn();
  }

  /** Relance : verrouille les combos sélectionnés, relance le reste (ou les 5 si dés chauds). */
  reroll() {
    if (!this.canAct) return;
    const selectedCombos = this.currentCombos.filter((c) => c.selected);
    this.pendingScore = calculateScore(selectedCombos);
    this.turnScore += this.pendingScore;

    const hotDice = this.usesAllDice; // tous les dés du leg ont scoré → on récupère les 5 dés
    if (hotDice) {
      this.committedDice = [];
      this.emit('hotDice', { turnScore: this.turnScore });
    } else {
      // Les dés sélectionnés rejoignent les dés déjà verrouillés (figés à leur position)
      const lockedNow = this.tableDice.filter((d) => d.state === 'selected');
      this.committedDice = [...this.committedDice, ...lockedNow];
      this.emit('diceLocked', { committedDice: this.committedDice, turnScore: this.turnScore });
    }

    this.currentCombos = [];
    this.tableDice = [];
    // Le prochain roll() recalculera automatiquement le bon nombre de dés disponibles.
    this.emit('readyToReroll', { turnScore: this.turnScore, diceRemaining: hotDice ? 5 : 5 - this.committedDice.length });
  }

  _loseTurn() {
    const lost = this.turnScore + this._selectedPoints();
    this.emit('bust', {
      player: this.currentPlayer,
      lost,
      wasFirstRoll: this.committedDice.length === 0 && this.turnScore === 0,
    });
    this._endTurn();
  }

  _endTurn() {
    this.turnScore = 0;
    this.pendingScore = 0;
    this.committedDice = [];
    this.tableDice = [];
    this.currentCombos = [];
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    this.emit('turnChanged', { player: this.currentPlayer, players: this.players });
  }

  _ranking() {
    return [...this.players].sort((a, b) => b.score - a.score);
  }

  static get winningScore() {
    return WINNING_SCORE;
  }
}
