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
    this.isHotDiceOpportunity = false;
    // Nombre de roll() déjà effectués CE tour-ci (remis à 0 à chaque
    // changement de joueur, voir _endTurn()). Purement informatif — aucune
    // limite n'est imposée : le joueur peut relancer autant de fois qu'il
    // le souhaite tant qu'il obtient une combinaison valable (voir
    // reroll()/hotDice).
    this.rollsThisTurn = 0;
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
    // Valeur de la combinaison héritée (ce qu'elle valait déjà pour le
    // joueur précédent). Sert à détecter si le joueur qui reprend la main a
    // RÉELLEMENT amélioré la combinaison avec ses dés neufs : les points
    // déjà sécurisés par le joueur précédent ne sont JAMAIS récupérables —
    // si le résultat ne dépasse pas cette valeur, ce n'est pas une
    // amélioration et le joueur qui reprend la main ne gagne rien.
    this.pendingInheritedValue = 0;
    this.isNoImprovement = false;
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

  /** Vrai si une main du joueur précédent attend d'être reprise ou refusée. */
  get hasPendingInheritance() {
    return this.pendingInherited.length > 0;
  }

  /**
   * Le joueur refuse explicitement de reprendre la main précédente : il
   * repart sur une main entièrement neuve (5 dés), sans aucun risque ni
   * aucun bénéfice lié à la combinaison laissée par le joueur précédent.
   * Doit être appelé AVANT roll() — sinon roll() aurait automatiquement
   * fusionné les dés hérités avec le lancer.
   */
  declineInheritance() {
    this.pendingInherited = [];
    this.pendingInheritedValue = 0;
    this.emit('inheritanceDeclined', {});
  }

  /**
   * Lance les dés disponibles (5 au début du tour, ou moins si des dés sont
   * conservés ce tour-ci — ou hérités du joueur précédent, voir
   * pendingInherited). Les dés hérités gardent leur valeur déjà posée ;
   * seuls les dés manquants sont réellement randomisés.
   */
  roll() {
    if (this.gameOver) return;
    // Un lancer ne peut avoir lieu que si le précédent a déjà été résolu
    // (verrouillé via reroll(), ou sécurisé via bankScore()) : sans ce
    // garde-fou, un client pourrait appeler roll() en boucle tant que le
    // résultat ne lui convient pas, sans jamais risquer de perdre la main —
    // qu'il s'agisse d'un double-clic ou d'un client qui rejouerait
    // l'action "manuellement" en contournant l'interface.
    if (this.tableDice.length > 0) return;
    this.rollsThisTurn += 1;
    const inherited = this.pendingInherited;
    const inheritedValue = this.pendingInheritedValue;
    this.pendingInherited = [];
    this.pendingInheritedValue = 0;

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
      // Vrai pour les dés "hérités" du joueur précédent (déjà posés, pas
      // relancés ce tour-ci) : sert à l'UI pour les afficher autrement que
      // les dés fraîchement lancés (pas d'animation de lancer, marqueur
      // visuel distinct) — voir UI.placeCarriedDie() dans main.js.
      carried: i < inherited.length,
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

    // Main reprise : les points déjà sécurisés par le joueur précédent ne
    // sont JAMAIS récupérables. Si les dés neufs n'améliorent pas (au sens
    // strict : une valeur strictement supérieure) la combinaison héritée,
    // ce n'est pas une "vraie" réussite — le joueur qui reprend la main
    // reste bredouille et perd la main, même si la combinaison de base
    // reste techniquement valable.
    const noImprovement = inherited.length > 0 && !detection.isBust && comboValue <= inheritedValue;

    this.isBust = detection.isBust || overshoot || noImprovement;
    this.isOvershoot = overshoot;
    this.isNoImprovement = noImprovement;
    // "Main pleine" : tous les dés du lancer participent à une combinaison
    // valable. Le joueur a alors trois options (voir bankScore(), reroll(),
    // giveFullHand()) : sécuriser immédiatement, continuer au risque de
    // tout perdre (RELANCER, qui redonne alors 5 dés neufs — "dés chauds"),
    // ou transmettre la main pleine telle quelle au joueur suivant sans
    // rien sécuriser. Exclu si le tour est de toute façon déjà perdu : dans
    // ce cas il n'y a jamais eu de choix à faire.
    this.isHotDiceOpportunity = detection.usesAllDice && !this.isBust;

    // En cas de tour perdu (classique, dépassement de 10 000, ou main
    // reprise non améliorée), tous les dés restent "morts" visuellement —
    // pas de flash doré "sélectionné" juste avant que tout disparaisse.
    const scorableIds = this.isBust ? new Set() : new Set(detection.combos.flatMap((c) => c.dieIds));
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
      isNoImprovement: noImprovement,
      isHotDiceOpportunity: this.isHotDiceOpportunity,
      isFirstRollOfTurn: this.committedDice.length === 0 && this.turnScore === 0 && inherited.length === 0,
      inheritedCount: inherited.length,
      rollsThisTurn: this.rollsThisTurn,
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

  /** Alias de canAct : relancer n'a pas de limite de nombre de lancers. */
  get canReroll() {
    return this.canAct;
  }

  /**
   * Option C de la main pleine : vrai uniquement quand TOUS les dés du
   * lancer en cours participent à une combinaison valable
   * (isHotDiceOpportunity) ET sont effectivement tous sélectionnés — si le
   * joueur a désélectionné un dé de la main pleine, ce n'est plus une main
   * COMPLÈTE à transmettre, l'option disparaît (il garde RELANCER/SÉCURISER
   * sur sa sélection partielle).
   */
  get canGiveFullHand() {
    return this.isHotDiceOpportunity && this.canAct
      && this.tableDice.length > 0 && this.tableDice.every((d) => d.selected);
  }

  get bankable() {
    return this.turnScore + this._selectedPoints();
  }

  /**
   * Sécuriser exige TROIS conditions :
   *  1. une sélection valable (canAct) ;
   *  2. un total qui soit un multiple de 100 — un 5 isolé (50 points) ne
   *     suffit jamais à lui seul, il faut par exemple deux 5 (100), ou le
   *     combiner à des points déjà acquis ce tour-ci pour arrondir ;
   *  3. ne pas dépasser 10 000 : il faut atteindre l'objectif PILE, jamais
   *     le dépasser (si le gain ferait dépasser, il faut composer une
   *     combinaison qui tombe pile dessus, ou continuer d'engranger en
   *     dessous — dans la limite des lancers restants).
   */
  get canBank() {
    if (!this.canAct) return false;
    if (this.bankable % 100 !== 0) return false;
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
    if (!this.canBank) return;
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
    // Valeur de cette combinaison transmise "en l'état" (pas de nouveaux
    // dés) : sert au prochain roll() à juger si les dés neufs du joueur
    // suivant ont réellement AMÉLIORÉ la combinaison, ou pas.
    const carryValue = carry.length > 0 ? calculateScore(detectCombinations(carry).combos) : 0;
    this._endTurn(carry, carryValue);
  }

  /**
   * Option C de la main pleine : transmet la VALEUR de la main (pas des
   * dés précis — il n'y en a plus de disponibles, les 5 ont tous servi)
   * au joueur suivant, SANS rien ajouter au score personnel du joueur
   * actuel : ces points restent entièrement provisoires.
   *
   * Contrairement à une main partielle (bankScore() avec <5 dés retenus),
   * qui transmet des dés PRÉCIS à fusionner avec le prochain lancer, ici
   * il ne reste physiquement aucun dé à "garder" : le joueur suivant
   * relance ses 5 dés entièrement neufs, et toute combinaison qu'il
   * obtient s'AJOUTE à la valeur transmise (exactement comme les points
   * s'accumulent déjà d'un lancer à l'autre au sein d'un même tour via
   * turnScore) — ex. 1 500 transmis + un brelan de 3 (300) obtenu par le
   * suivant = 1 800. S'il ne décroche aucune combinaison à son premier
   * lancer, c'est un bust normal : il perd tout, y compris les 1 500
   * transmis (ils ne reviennent jamais au joueur qui a donné la main).
   * Uniquement possible sur une vraie main pleine (canGiveFullHand).
   */
  giveFullHand() {
    if (!this.canGiveFullHand) return;
    const passedValue = this.turnScore + this._selectedPoints();
    this.emit('handGiven', { player: this.currentPlayer, passedValue });
    this._endTurn([], 0, passedValue);
  }

  /**
   * Verrouille les dés sélectionnés et prépare le lancer suivant (sur le
   * reste des dés, ou les 5 si "dés chauds").
   */
  reroll() {
    if (!this.canReroll) return;
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
      isNoImprovement: this.isNoImprovement,
    });
    this.isOvershoot = false;
    this.isNoImprovement = false;
    this._endTurn();
  }

  /**
   * `startingTurnScore` : utilisé uniquement par giveFullHand() (Option C
   * de la main pleine) — le joueur suivant démarre son tour avec cette
   * valeur déjà dans son turnScore (voir giveFullHand() pour le détail du
   * modèle additif), au lieu des dés précis `carryDice`/`carryValue` d'une
   * main partielle transmise via bankScore().
   */
  _endTurn(carryDice = [], carryValue = 0, startingTurnScore = 0) {
    this.turnScore = startingTurnScore;
    this.committedDice = [];
    this.tableDice = [];
    this.hintCombos = [];
    this.pendingInherited = carryDice;
    this.pendingInheritedValue = carryValue;
    this.rollsThisTurn = 0; // compteur informatif, remis à 0 pour le joueur suivant
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    this.emit('turnChanged', {
      player: this.currentPlayer,
      players: this.players,
      inheritedCount: carryDice.length,
      inheritedValue: carryValue,
      startingTurnScore,
    });
  }

  _ranking() {
    return [...this.players].sort((a, b) => b.score - a.score);
  }

  static get winningScore() {
    return WINNING_SCORE;
  }
}
