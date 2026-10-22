/**
 * tests/rooms.manual.mjs — Script de vérification manuelle des salons
 * multijoueur : démarre le serveur, connecte 2 clients WebSocket réels,
 * crée un salon, rejoint, démarre la partie, et joue jusqu'à avoir vu au
 * moins un lancer traité correctement par le joueur dont c'est le tour.
 *
 *   node tests/rooms.manual.mjs
 */
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const PORT = 8991;
const proc = spawn('node', ['server.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
proc.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
proc.stderr.on('data', (d) => process.stderr.write(`[server:err] ${d}`));

function log(who, msg) { console.log(`  [${who}] ${msg}`); }

function connect(name) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    ws.on('open', () => resolve(ws));
    ws.messages = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      ws.messages.push(msg);
      log(name, `${msg.type}${msg.event ? ':' + msg.event : ''}`);
    });
  });
}

function waitFor(ws, predicate, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const existing = ws.messages.find(predicate);
    if (existing) return resolve(existing);
    const start = Date.now();
    const iv = setInterval(() => {
      const found = ws.messages.find(predicate);
      if (found) { clearInterval(iv); resolve(found); }
      else if (Date.now() - start > timeoutMs) { clearInterval(iv); reject(new Error('timeout waiting for message')); }
    }, 20);
  });
}

async function main() {
  await new Promise((r) => setTimeout(r, 500)); // laisse le serveur démarrer

  const alice = await connect('Alice');
  const bob = await connect('Bob');

  alice.send(JSON.stringify({ type: 'create', name: 'Alice' }));
  const created = await waitFor(alice, (m) => m.type === 'created');
  const code = created.code;
  console.log(`Salon créé : ${code}`);

  bob.send(JSON.stringify({ type: 'join', code, name: 'Bob' }));
  await waitFor(bob, (m) => m.type === 'joined');
  await waitFor(alice, (m) => m.type === 'lobby' && m.players.length === 2);
  console.log('Bob a rejoint, lobby à 2 joueurs. OK.');

  alice.send(JSON.stringify({ type: 'startGame' }));
  const startedAlice = await waitFor(alice, (m) => m.type === 'started');
  await waitFor(bob, (m) => m.type === 'started');
  console.log('Partie démarrée pour les deux clients. OK.');
  console.log('currentPlayerIndex initial =', startedAlice.state.currentPlayerIndex);

  // Bob tente de lancer alors que ce n'est pas son tour -> ne doit RIEN se passer.
  bob.messages.length = 0;
  bob.send(JSON.stringify({ type: 'action', action: 'roll' }));
  await new Promise((r) => setTimeout(r, 300));
  const bobIllegalRoll = bob.messages.find((m) => m.type === 'gameEvent' && m.event === 'rolled');
  console.log('Bob a tenté de lancer hors tour -> événement reçu ?', !!bobIllegalRoll, '(attendu: false)');

  // C'est bien le tour d'Alice (index 0) : elle lance.
  alice.messages.length = 0;
  alice.send(JSON.stringify({ type: 'action', action: 'roll' }));
  const rolled = await waitFor(alice, (m) => m.type === 'gameEvent' && m.event === 'rolled');
  console.log('Alice a lancé, isBust =', rolled.payload.isBust, ', dés =', rolled.state.tableDice.map((d) => d.value));

  // Les DEUX clients doivent avoir reçu le même événement (état synchronisé).
  const bobSawRoll = await waitFor(bob, (m) => m.type === 'gameEvent' && m.event === 'rolled');
  const sameDice = JSON.stringify(rolled.state.tableDice) === JSON.stringify(bobSawRoll.state.tableDice);
  console.log('Bob a reçu le même état de dés qu\'Alice ?', sameDice, '(attendu: true)');

  alice.close(); bob.close();

  // "Double clic" / requêtes simultanées, sur de VRAIES connexions WebSocket :
  // un client envoie DEUX fois l'action 'roll' sans attendre entre les deux
  // (même tick réseau, avant toute réponse du serveur). Si le premier lancer
  // n'a pas perdu la main, le serveur ne doit traiter que le premier roll()
  // — le second doit être un no-op (voir le garde-fou dans
  // GameController.roll()). Comme il faut un premier lancer qui ne buste
  // pas pour que le test ait un sens, on recrée des parties fraîches jusqu'à
  // en observer un (le hasard des dés rend un bust assez fréquent).
  let concurrencyChecked = false;
  for (let attempt = 0; attempt < 15 && !concurrencyChecked; attempt++) {
    const a = await connect(`Alice${attempt}`);
    const b = await connect(`Bob${attempt}`);
    a.send(JSON.stringify({ type: 'create', name: 'Alice' }));
    const createdMsg = await waitFor(a, (m) => m.type === 'created');
    b.send(JSON.stringify({ type: 'join', code: createdMsg.code, name: 'Bob' }));
    await waitFor(b, (m) => m.type === 'joined');
    await waitFor(a, (m) => m.type === 'lobby' && m.players.length === 2);
    a.send(JSON.stringify({ type: 'startGame' }));
    await waitFor(a, (m) => m.type === 'started');

    a.messages.length = 0;
    a.send(JSON.stringify({ type: 'action', action: 'roll' }));
    const firstRoll = await waitFor(a, (m) => m.type === 'gameEvent' && m.event === 'rolled');

    if (!firstRoll.payload.isBust) {
      concurrencyChecked = true;
      a.messages.length = 0;
      a.send(JSON.stringify({ type: 'action', action: 'roll' }));
      a.send(JSON.stringify({ type: 'action', action: 'roll' }));
      await new Promise((r) => setTimeout(r, 300));
      const rolledEvents = a.messages.filter((m) => m.type === 'gameEvent' && m.event === 'rolled');
      console.log(
        `Double envoi immédiat de 'roll' sur un lancer non perdant (essai ${attempt + 1}) -> nombre d'événements 'rolled' reçus en plus :`,
        rolledEvents.length,
        '(attendu: 0, le premier lancer n\'était pas encore résolu)',
      );
      if (rolledEvents.length !== 0) {
        a.close(); b.close();
        throw new Error(`Faille de concurrence : un second 'roll' envoyé immédiatement a été traité (${rolledEvents.length} événements 'rolled' en trop).`);
      }
    }
    a.close(); b.close();
  }
  if (!concurrencyChecked) {
    throw new Error('Impossible d\'observer un premier lancer non perdant en 15 essais : test de concurrence non concluant.');
  }

  console.log('\n✓ Vérification manuelle terminée sans erreur.');
  proc.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error('ÉCHEC :', err);
  proc.kill();
  process.exit(1);
});
