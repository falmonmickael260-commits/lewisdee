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
import { detectCombinations, calculateScore, WINNING_SCORE } from './engine.js';
import { getIncomingPlatformToken } from './platformToken.js';

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
    this.pendingInherited = [];
    this.pendingInheritedValue = 0;
    this.rollsThisTurn = 0;
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
  get hasPendingInheritance() { return this.pendingInherited.length > 0; }

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
  get canReroll() { return this.canAct; }
  get canBank() {
    if (!this.canAct) return false;
    if (this.bankable % 100 !== 0) return false;
    return this.currentPlayer.score + this.bankable <= WINNING_SCORE;
  }

  _send(payload) {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
  }

  roll() { this._send({ type: 'action', action: 'roll' }); }
  toggleDie(dieId) { this._send({ type: 'action', action: 'toggleDie', dieId }); }
  reroll() { this._send({ type: 'action', action: 'reroll' }); }
  bankScore() { this._send({ type: 'action', action: 'bank' }); }
  declineInheritance() { this._send({ type: 'action', action: 'declineInheritance' }); }

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
let rememberedSession = null;
export function getLobbySession() {
  if (rememberedSession) return rememberedSession;
  try { return JSON.parse(localStorage.getItem('10000:session') || 'null'); } catch { return null; }
}
function saveLobbySession(value) {
  rememberedSession = value;
  try { if (value) localStorage.setItem('10000:session', JSON.stringify(value)); else localStorage.removeItem('10000:session'); } catch { /* memory fallback */ }
  window.dispatchEvent(new Event('rg:session'));
}

export function openLobby({ onCreated, onJoined, onLobby, onError, onStarted }) {
  let socket, memberId = null, controller = null, seat = null, pending = null;
  let closedIntentionally = false, retry = null;
  const connect = () => {
    if (closedIntentionally) return;
    const current = new WebSocket(wsUrl()); socket = current;
    current.addEventListener('open', () => {
      if (current !== socket) return;
      if (controller) controller.socket = current;
      if (seat?.token) current.send(JSON.stringify({ type: 'resume', code: seat.code, token: seat.token }));
      else if (pending) { current.send(JSON.stringify(pending)); pending = null; }
    });
    current.addEventListener('message', event => {
      if (current !== socket) return;
      let msg; try { msg = JSON.parse(event.data); } catch { return; }
      switch (msg.type) {
        case 'created': case 'joined':
          memberId = msg.memberId;
          seat = { code: msg.code, token: msg.token, memberId };
          saveLobbySession(seat);
          if (msg.type === 'created') onCreated?.(msg.code, memberId);
          else onJoined?.(msg.code, memberId);
          break;
        case 'lobby': onLobby?.(msg); break;
        case 'error':
          if (msg.code === 'session_missing') { seat = null; saveLobbySession(null); }
          onError?.(msg.message); break;
        case 'started':
          if (!controller) {
            controller = new RemoteController(current, memberId);
            Object.assign(controller, msg.state);
            onStarted?.(controller);
          } else { controller.socket = current; Object.assign(controller, msg.state); controller.emit('turnChanged', {}); }
          break;
        case 'gameEvent': controller?.applyServerMessage(msg); break;
      }
    });
    current.addEventListener('close', () => {
      if (current !== socket || closedIntentionally) return;
      if (seat?.token) retry = setTimeout(connect, 1000);
      else onError?.('Connexion perdue. Vérifiez votre réseau et réessayez.');
    });
    current.addEventListener('error', () => { /* close drives reconnection */ });
  };
  const send = message => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    else pending = message;
  };
  connect();
  return {
    get socket() { return socket; }, get session() { return seat; },
    create(name) { send({ type: 'create', name, rgToken: getIncomingPlatformToken() }); },
    join(code, name) { send({ type: 'join', code, name, rgToken: getIncomingPlatformToken() }); },
    resume(session) { seat = session; saveLobbySession(session); if (socket?.readyState === WebSocket.OPEN) send({ type: 'resume', code: seat.code, token: seat.token }); },
    startGame() { send({ type: 'startGame' }); },
    close() {
      closedIntentionally = true; clearTimeout(retry);
      if (socket?.readyState === WebSocket.OPEN) send({ type: 'leave' });
      socket?.close(); seat = null; saveLobbySession(null);
    },
  };
}
