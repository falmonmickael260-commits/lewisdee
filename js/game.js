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
  wouldOvershoot,
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
    this.isOvershoot = false;
    this.gameOver = false;
    this.winner = null;
    // Contrôleur local : c'est LUI l'autorité, donc il enchaîne bien lui-même
    // la relance automatique après verrouillage des dés conservés (voir
    // l'événement 'readyToReroll'). Le RemoteController (js/net.js) met ce
    // drapeau à false car c'est alors le serveur qui enchaîne.
    this.autoChainsReroll = true;
    // Dés "hérités" du joueur précédent (voir bankScore()/_endTurn()) : si
    // quelqu'un sécurise sans avoir utilisé ses 5 dés, les dés qu'il avait
    // effectivement gardés restent sur la table, à leur valeur, pour le
    // joueur suivant — qui relance seulement les dés restants et peut
    // combiner les deux pour une plus grosse combinaison. Consommé au tout
    // prochain roll().
    this.pendingInherited = [];
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

  /**
   * Lance les dés disponibles (5 au début du tour, ou moins si des dés sont
   * conservés ce tour-ci — ou hérités du joueur précédent, voir
   * pendingInherited). Les dés hérités gardent leur valeur déjà posée ;
   * seuls les dés manquants sont réellement randomisés.
   */
  roll() {
    if (this.gameOver) return;
    const inherited = this.pendingInherited;
    this.pendingInherited = [];

    const availableCount = 5 - this.committedDice.length - inherited.length;
    const obstacles = this.committedDice.map((d) => ({ x: d.x, y: d.y }));
    const positions = generateDicePositions(inherited.length + availableCount, obstacles);
    const freshlyRolled = rollDice(availableCount);
    const combined = [...inherited, ...freshlyRolled];

    this.tableDice = combined.map((die, i) => ({
      id: die.id,
      value: die.value,
      x: positions[i].x,
      y: positions[i].y,
      state: 'rolling',
      selected: false,
    }));

    // Détection sur le lancer COMPLET (dés hérités + dés neufs ensemble) :
    // sert à (a) déterminer le bust et (b) donner une indication visuelle
    // ("scorable" / "dead") pour guider le joueur — elle ne restreint plus
    // ce qu'il peut sélectionner. Si des dés sont hérités, ils forment déjà
    // une combinaison valable à eux seuls : ce lancer ne peut donc pas être
    // un tour perdu, et le joueur peut librement l'étendre avec ses dés neufs.
    const detection = detectCombinations(combined);
    this.hintCombos = detection.combos;

    // Objectif 10 000 JUSTE, jamais dépassé : si la combinaison obtenue
    // ferait dépasser l'objectif (score déjà sécurisé + points du tour en
    // cours + cette combinaison), c'est traité comme un tour perdu immédiat
    // — automatiquement, sans même que le joueur ait pu choisir de la
    // sécuriser. Il doit retomber PILE sur 10 000 pour gagner.
    const comboValue = calculateScore(detection.combos);
    const overshoot = !detection.isBust
      && wouldOvershoot(this.currentPlayer.score, this.turnScore, comboValue);
    this.isBust = detection.isBust || overshoot;
    this.isOvershoot = overshoot;

    const scorableIds = new Set(detection.combos.flatMap((c) => c.dieIds));
    this.tableDice.forEach((d) => {
      d.state = scorableIds.has(d.id) ? 'scorable' : 'dead';
      // La combinaison détectée est présélectionnée automatiquement : sans
      // ça, "SÉCURISER"/"RELANCER" affichent 0 point tant que le joueur n'a
      // pas pensé à taper lui-même sur les dés, ce qui donnait l'impression
      // trompeuse qu'une main reprise (ou n'importe quel lancer) ne rapporte
      // rien. Le joueur reste libre de désélectionner s'il préfère tout
      // relancer plutôt que garder cette combinaison.
      if (d.state === 'scorable') d.selected = true;
    });

    this.emit('rolled', {
      dice: this.tableDice,
      committedDice: this.committedDice,
      combos: this.hintCombos,
      isBust: this.isBust,
      isOvershoot: overshoot,
      isFirstRollOfTurn: this.committedDice.length === 0 && this.turnScore === 0 && inherited.length === 0,
      inheritedCount: inherited.length,
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

  /**
   * Il faut atteindre 10 000 JUSTE, jamais dépasser : sécuriser reste
   * possible tant que le total ne dépasse pas l'objectif, mais devient
   * bloqué si le gain ferait passer le joueur au-dessus — il doit alors
   * composer une combinaison qui tombe pile dessus (ou continuer d'engranger
   * en dessous), quitte à tout risquer en relançant.
   */
  get canBank() {
    if (!this.canAct) return false;
    return this.currentPlayer.score + this.bankable <= WINNING_SCORE;
  }

  /**
   * Sécurise les points : ajoute au score total du joueur et termine le
   * tour. Si le joueur n'a pas utilisé ses 5 dés, les dés qu'il a
   * effectivement gardés ce tour (verrouillés lors de legs précédents +
   * ceux sélectionnés dans ce lancer final) restent sur la table, à leur
   * valeur, pour le joueur suivant — "passer la main". Les dés non retenus
   * (morts ou simplement pas choisis) ne comptent pas : ils seront
   * réellement relancés par le joueur suivant.
   */
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

    const scoredDice = [...this.committedDice, ...this.tableDice.filter((d) => d.selected)];
    const carry = scoredDice.length < 5 ? scoredDice.map((d) => ({ id: d.id, value: d.value })) : [];
    this._endTurn(carry);
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
      isOvershoot: this.isOvershoot,
    });
    this.isOvershoot = false;
    this._endTurn();
  }

  _endTurn(carryDice = []) {
    this.turnScore = 0;
    this.committedDice = [];
    this.tableDice = [];
    this.hintCombos = [];
    this.pendingInherited = carryDice;
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    this.emit('turnChanged', { player: this.currentPlayer, players: this.players, inheritedCount: carryDice.length });
  }

  _ranking() {
    return [...this.players].sort((a, b) => b.score - a.score);
  }

  static get winningScore() {
    return WINNING_SCORE;
  }
}
