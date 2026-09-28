/**
 * game.js — Contrôleur de partie ("moteur" au sens large).
 *
 * GameController orchestre les règles (via engine.js) et le placement des
 * dés (via positions.js), et notifie l'UI par un simple système d'events
 * (`on(event, handler)` / `emit`). Il ne touche jamais au DOM : la couche
 * UI (ui.js) s'abonne à ses événements pour animer/afficher.
 *
 * Sélection : le joueur choisit lui-même, dé par dé, lesquels il garde
 * (toggleDie). Le score de la sélection en cours est recalculé à chaque
 * changement en ré-analysant EXACTEMENT les dés actuellement sélectionnés
 * avec detectCombinations — le même moteur générique qui sert à détecter
 * les combinaisons du lancer complet. Un dé peut donc être sélectionné même
 * s'il ne rapporte rien seul ; tant que la sélection entière ne forme pas
 * une combinaison valable (aucun dé "mort" dedans), elle vaut 0 point et ne
 * peut pas être sécurisée ni relancée — ça force à composer une vraie
 * combinaison, tout en laissant le joueur entièrement libre de son choix.
 *
 * Cette séparation permet, plus tard, de remplacer ce contrôleur local par
 * un client qui reçoit les mêmes événements depuis un serveur (voir net/
 * pour l'implémentation multijoueur en ligne).
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
    this.committedDice = []; // dés déjà verrouillés ce tour: {id, value, x, y}
    this.tableDice = []; // dés du leg courant: {id, value, x, y, state, selected}
    this.hintCombos = []; // combinaisons détectées dans le lancer complet (indicatif, pour la bannière)
    this.isBust = false;
    this.gameOver = false;
    this.winner = null;
    // Contrôleur local : c'est LUI l'autorité, donc il enchaîne bien lui-même
    // la relance automatique après verrouillage des dés conservés (voir
    // l'événement 'readyToReroll'). Le RemoteController (js/net.js) met ce
    // drapeau à false car c'est alors le serveur qui enchaîne.
    this.autoChainsReroll = true;
    this.listeners = {};
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
      selected: false,
    }));

    // Détection sur le lancer COMPLET : sert uniquement à (a) déterminer le
    // bust et (b) donner une indication visuelle ("scorable" / "dead") pour
    // guider le joueur — elle ne restreint plus ce qu'il peut sélectionner.
    const detection = detectCombinations(rolled);
    this.hintCombos = detection.combos;
    this.isBust = detection.isBust;

    const scorableIds = new Set(detection.combos.flatMap((c) => c.dieIds));
    this.tableDice.forEach((d) => {
      d.state = scorableIds.has(d.id) ? 'scorable' : 'dead';
    });

    this.emit('rolled', {
      dice: this.tableDice,
      committedDice: this.committedDice,
      combos: this.hintCombos,
      isBust: this.isBust,
      isFirstRollOfTurn: this.committedDice.length === 0 && this.turnScore === 0,
    });

    if (this.isBust) {
      this._loseTurn();
    }
  }

  /** Sélectionne/désélectionne UN dé précis — le joueur compose lui-même sa combinaison. */
  toggleDie(dieId) {
    const die = this.tableDice.find((d) => d.id === dieId);
    if (!die) return;
    die.selected = !die.selected;
    this.emit('selectionChanged', {
      tableDice: this.tableDice,
      pendingPoints: this._selectedPoints(),
    });
  }

  /** Analyse la sélection ACTUELLE des dés (n'importe lesquels, choisis par le joueur). */
  _selectionDetection() {
    const selected = this.tableDice.filter((d) => d.selected).map((d) => ({ id: d.id, value: d.value }));
    return detectCombinations(selected);
  }

  /**
   * Points de la sélection en cours. 0 si rien n'est sélectionné, si la
   * sélection ne forme aucune combinaison, ou si elle contient un dé qui ne
   * participe à aucune combinaison valable (sélection "impure").
   */
  _selectedPoints() {
    const det = this._selectionDetection();
    if (det.combos.length === 0 || det.deadIds.length > 0) return 0;
    return calculateScore(det.combos);
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

  /** Relance : verrouille les dés sélectionnés, relance le reste (ou les 5 si dés chauds). */
  reroll() {
    if (!this.canAct) return;
    const gainedThisLeg = this._selectedPoints();
    this.turnScore += gainedThisLeg;

    const selectedCount = this.tableDice.filter((d) => d.selected).length;
    // "Dés chauds" : le joueur a choisi de garder LITTÉRALEMENT tous les dés
    // de ce lancer, et canAct garantissait déjà que c'est une sélection
    // propre (aucun dé mort dedans) — il récupère donc 5 dés neufs.
    const hotDice = selectedCount === this.tableDice.length;

    if (hotDice) {
      this.committedDice = [];
      this.emit('hotDice', { turnScore: this.turnScore });
    } else {
      const lockedNow = this.tableDice.filter((d) => d.selected);
      this.committedDice = [...this.committedDice, ...lockedNow];
      this.emit('diceLocked', { committedDice: this.committedDice, turnScore: this.turnScore });
    }

    this.tableDice = [];
    this.hintCombos = [];
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
    this.committedDice = [];
    this.tableDice = [];
    this.hintCombos = [];
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
