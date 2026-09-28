/**
 * net/rooms.js — Gestion des salons multijoueur, côté serveur.
 *
 * C'est ici que se voit le bénéfice d'avoir séparé le moteur de jeu
 * (js/game.js, js/engine.js) de l'interface : le serveur importe et fait
 * tourner EXACTEMENT le même GameController que le mode local, sans aucune
 * duplication de règles. Chaque salon = une instance de GameController,
 * autoritaire, dont les événements sont simplement relayés tels quels à
 * tous les clients connectés (le même contrat d'événements que la couche
 * UI locale consomme déjà dans js/main.js).
 */
import { GameController } from '../js/game.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I, pour éviter les confusions à l'oral
const MAX_PLAYERS = 4;

function makeCode(existingCodes) {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (existingCodes.has(code));
  return code;
}

function snapshot(controller) {
  return {
    players: controller.players,
    currentPlayerIndex: controller.currentPlayerIndex,
    turnScore: controller.turnScore,
    tableDice: controller.tableDice,
    committedDice: controller.committedDice,
    hintCombos: controller.hintCombos,
    isBust: controller.isBust,
    gameOver: controller.gameOver,
    winner: controller.winner,
  };
}

const RELAYED_EVENTS = [
  'rolled', 'selectionChanged', 'bust', 'turnChanged',
  'diceLocked', 'hotDice', 'readyToReroll', 'banked', 'victory',
];

class Room {
  constructor(code) {
    this.code = code;
    this.members = []; // { id, ws, name, connected }
    this.started = false;
    this.controller = null;
    this.nextId = 0;
  }

  addMember(ws, name) {
    const id = this.nextId++;
    const member = { id, ws, name: (name || `Joueur ${id + 1}`).slice(0, 14), connected: true };
    this.members.push(member);
    ws.roomCode = this.code;
    ws.memberId = id;
    return member;
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const m of this.members) {
      if (m.connected && m.ws.readyState === 1 /* OPEN */) m.ws.send(data);
    }
  }

  sendLobby() {
    this.broadcast({
      type: 'lobby',
      code: this.code,
      players: this.members.map((m) => ({ id: m.id, name: m.name, connected: m.connected })),
      hostId: this.members[0]?.id ?? 0,
      canStart: this.members.length >= 2,
    });
  }

  start() {
    if (this.started || this.members.length < 2) return;
    this.started = true;
    const names = this.members.map((m) => m.name);
    this.controller = new GameController(names);

    for (const ev of RELAYED_EVENTS) {
      this.controller.on(ev, (payload) => {
        this.broadcast({ type: 'gameEvent', event: ev, payload, state: snapshot(this.controller) });
        // Le serveur enchaîne lui-même la relance après verrouillage des dés
        // conservés (même logique que l'UI locale, mais ici comme unique
        // source d'autorité — sinon chaque client déclencherait sa propre
        // relance en double).
        if (ev === 'readyToReroll' && !this.controller.gameOver) this.controller.roll();
      });
    }

    this.broadcast({ type: 'started', state: snapshot(this.controller) });
  }

  handleAction(memberId, msg) {
    if (!this.started || !this.controller || this.controller.gameOver) return;
    if (this.controller.currentPlayerIndex !== memberId) return; // pas le tour de ce joueur
    switch (msg.action) {
      case 'roll': this.controller.roll(); break;
      case 'toggleDie': this.controller.toggleDie(msg.dieId); break;
      case 'reroll': this.controller.reroll(); break;
      case 'bank': this.controller.bankScore(); break;
      default: break;
    }
  }

  removeMember(ws) {
    const member = this.members.find((m) => m.ws === ws);
    if (!member) return;
    if (this.started) {
      member.connected = false;
    } else {
      this.members = this.members.filter((m) => m.ws !== ws);
    }
    this.sendLobby();
  }

  isEmpty() {
    return this.members.length === 0 || this.members.every((m) => !m.connected);
  }
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  create(ws, name) {
    const code = makeCode(this.rooms);
    const room = new Room(code);
    this.rooms.set(code, room);
    const member = room.addMember(ws, name);
    ws.send(JSON.stringify({ type: 'created', code, memberId: member.id }));
    room.sendLobby();
    return room;
  }

  join(ws, rawCode, name) {
    const code = String(rawCode || '').toUpperCase().trim();
    const room = this.rooms.get(code);
    if (!room) {
      ws.send(JSON.stringify({ type: 'error', message: 'Salon introuvable. Vérifiez le code.' }));
      return null;
    }
    if (room.started) {
      ws.send(JSON.stringify({ type: 'error', message: 'Cette partie a déjà commencé.' }));
      return null;
    }
    if (room.members.length >= MAX_PLAYERS) {
      ws.send(JSON.stringify({ type: 'error', message: 'Salon complet (4 joueurs maximum).' }));
      return null;
    }
    const member = room.addMember(ws, name);
    ws.send(JSON.stringify({ type: 'joined', code: room.code, memberId: member.id }));
    room.sendLobby();
    return room;
  }

  start(ws) {
    const room = this.rooms.get(ws.roomCode);
    if (!room) return;
    // Seul l'hôte (premier arrivé) peut démarrer la partie.
    if (room.members[0]?.ws !== ws) return;
    room.start();
  }

  action(ws, msg) {
    const room = this.rooms.get(ws.roomCode);
    if (!room || ws.memberId == null) return;
    room.handleAction(ws.memberId, msg);
  }

  handleClose(ws) {
    const room = this.rooms.get(ws.roomCode);
    if (!room) return;
    room.removeMember(ws);
    if (room.isEmpty()) this.rooms.delete(room.code);
  }
}
