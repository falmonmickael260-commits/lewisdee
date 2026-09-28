/**
 * net.js — Client des salons multijoueur en ligne.
 *
 * RemoteController expose EXACTEMENT la même interface publique que
 * GameController (js/game.js) : on()/emit(), les mêmes getters
 * (tableDice, hintCombos, currentPlayer, canAct, bankable…) et les mêmes
 * méthodes d'action (roll, toggleDie, reroll, bankScore). La différence
 * est que ces méthodes n'exécutent aucune règle localement : elles
 * envoient l'intention au serveur, qui fait tourner le vrai GameController
 * de façon autoritaire et renvoie l'état à jour. Grâce à cette interface
 * commune, js/main.js peut piloter une partie locale ou une partie en
 * ligne avec exactement le même code d'affichage.
 */
import { detectCombinations, calculateScore } from './engine.js';

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export class RemoteController {
  constructor(socket, memberId) {
    this.socket = socket;
    this.memberId = memberId;
    this.players = [];
    this.currentPlayerIndex = 0;
    this.turnScore = 0;
    this.tableDice = [];
    this.committedDice = [];
    this.hintCombos = [];
    this.isBust = false;
    this.gameOver = false;
    this.winner = null;
    this.listeners = {};
    // Contrairement au GameController local, l'enchaînement automatique
    // après une relance est géré par le SERVEUR (seule source d'autorité) :
    // le client ne doit pas déclencher son propre roll() en plus.
    this.autoChainsReroll = false;
  }

  on(event, handler) {
    (this.listeners[event] = this.listeners[event] || []).push(handler);
    return () => { this.listeners[event] = this.listeners[event].filter((h) => h !== handler); };
  }

  emit(event, payload) {
    (this.listeners[event] || []).forEach((h) => h(payload));
  }

  get currentPlayer() { return this.players[this.currentPlayerIndex]; }
  get isMyTurn() { return this.currentPlayerIndex === this.memberId; }

  /** Même logique que GameController._selectedPoints(), recalculée côté client
   * pour un retour instantané (boutons activés/désactivés) sans attendre le
   * serveur ; le serveur reste seul autoritaire sur ce qui est réellement banké. */
  _selectedPoints() {
    const selected = this.tableDice.filter((d) => d.selected).map((d) => ({ id: d.id, value: d.value }));
    const det = detectCombinations(selected);
    if (det.combos.length === 0 || det.deadIds.length > 0) return 0;
    return calculateScore(det.combos);
  }

  get canAct() { return this._selectedPoints() > 0; }
  get bankable() { return this.turnScore + this._selectedPoints(); }

  _send(payload) {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
  }

  roll() { this._send({ type: 'action', action: 'roll' }); }
  toggleDie(dieId) { this._send({ type: 'action', action: 'toggleDie', dieId }); }
  reroll() { this._send({ type: 'action', action: 'reroll' }); }
  bankScore() { this._send({ type: 'action', action: 'bank' }); }

  /** Applique un instantané d'état reçu du serveur et émet l'événement associé. */
  applyServerMessage(msg) {
    if (msg.state) Object.assign(this, msg.state);
    if (msg.event) this.emit(msg.event, msg.payload);
  }
}

/**
 * Ouvre la connexion et gère le flux de salon (création/adhésion/lobby)
 * via des callbacks. Retourne un objet avec des méthodes pour piloter le
 * salon ; onGameStarted(controller) est appelé une fois la partie lancée.
 */
export function openLobby({ onCreated, onJoined, onLobby, onError, onStarted }) {
  const socket = new WebSocket(wsUrl());
  let memberId = null;
  let controller = null;

  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    switch (msg.type) {
      case 'created':
        memberId = msg.memberId;
        onCreated?.(msg.code, memberId);
        break;
      case 'joined':
        memberId = msg.memberId;
        onJoined?.(msg.code, memberId);
        break;
      case 'lobby':
        onLobby?.(msg);
        break;
      case 'error':
        onError?.(msg.message);
        break;
      case 'started':
        controller = new RemoteController(socket, memberId);
        Object.assign(controller, msg.state);
        onStarted?.(controller);
        break;
      case 'gameEvent':
        controller?.applyServerMessage(msg);
        break;
      default:
        break;
    }
  });

  socket.addEventListener('error', () => onError?.('Connexion au serveur impossible.'));

  return {
    socket,
    create(name) {
      const send = () => socket.send(JSON.stringify({ type: 'create', name }));
      if (socket.readyState === WebSocket.OPEN) send();
      else socket.addEventListener('open', send, { once: true });
    },
    join(code, name) {
      const send = () => socket.send(JSON.stringify({ type: 'join', code, name }));
      if (socket.readyState === WebSocket.OPEN) send();
      else socket.addEventListener('open', send, { once: true });
    },
    startGame() {
      socket.send(JSON.stringify({ type: 'startGame' }));
    },
    close() {
      socket.close();
    },
  };
}
