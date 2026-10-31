/** Protocol regressions with in-memory transports. No listening port or production account. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../net/rooms.js';

function client() {
  return { readyState: 1, messages: [], send(raw) { this.messages.push(JSON.parse(raw)); } };
}
function setup() {
  const manager = new RoomManager();
  const alice = client(), bob = client();
  const room = manager.create(alice, 'Alice');
  manager.join(bob, room.code.toLowerCase(), 'Bob');
  return { manager, alice, bob, room };
}
function fixedRoll(values, run) {
  const random = Math.random;
  let index = 0;
  // Isolate dice RNG from the random IDs and table coordinates without changing production code.
  Math.random = () => new Error().stack.includes('at rollOneDie') && index < values.length
    ? (values[index++] - 0.5) / 6 : random();
  try { run(); } finally { Math.random = random; }
}

test('private room, host-only start and identical snapshots for two players', () => {
  const { manager, alice, bob, room } = setup();
  assert.match(room.code, /^[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(bob.messages.find(m => m.type === 'joined').code, room.code);
  manager.start(bob);
  assert.equal(room.started, false);
  manager.start(alice);
  assert.deepEqual(alice.messages.at(-1), bob.messages.at(-1));
  const before = alice.messages.length;
  manager.action(bob, { action: 'roll' });
  assert.equal(alice.messages.length, before, 'spectator cannot roll');
  fixedRoll([4, 4, 4, 2, 3], () => manager.action(alice, { action: 'roll' }));
  assert.deepEqual(room.controller.tableDice.map(d => d.value), [4, 4, 4, 2, 3]);
  assert.deepEqual(alice.messages.at(-1), bob.messages.at(-1));
  assert.equal(room.controller.bankable, 400);
  const die = room.controller.tableDice[0];
  manager.action(alice, { action: 'toggleDie', dieId: die.id });
  assert.equal(room.controller.canBank, false);
  manager.action(alice, { action: 'toggleDie', dieId: die.id });
  manager.action(alice, { action: 'bank' });
  assert.equal(room.controller.players[0].score, 400);
  assert.equal(room.controller.currentPlayerIndex, 1);
  assert.deepEqual(alice.messages.at(-1), bob.messages.at(-1));
});

test('server rerolls only rejected dice and preserves locked results', () => {
  const { manager, alice, room } = setup();
  manager.start(alice);
  fixedRoll([4, 4, 4, 2, 3], () => manager.action(alice, { action: 'roll' }));
  const ids = room.controller.tableDice.filter(d => d.selected).map(d => d.id);
  fixedRoll([5, 2], () => manager.action(alice, { action: 'reroll' }));
  assert.deepEqual(room.controller.committedDice.map(d => d.id), ids);
  assert.ok(room.controller.committedDice.every(d => d.value === 4));
  assert.ok(alice.messages.some(m => m.event === 'readyToReroll'));
  assert.equal(alice.messages.filter(m => m.event === 'rolled').length, 2);
});

test('exact victory and existing disconnection/rejoin behavior remain intact', () => {
  const { manager, alice, bob, room } = setup();
  manager.start(alice);
  room.controller.players[0].score = 9600;
  fixedRoll([4, 4, 4, 2, 3], () => manager.action(alice, { action: 'roll' }));
  // Avoid invoking external platform reporting in this isolated test.
  room.reportToPlatform = () => {};
  manager.action(alice, { action: 'bank' });
  const victory = bob.messages.find(m => m.event === 'victory');
  assert.equal(victory.payload.player.score, 10000);
  assert.equal(victory.state.gameOver, true);
  manager.handleClose(bob);
  assert.equal(room.members[1].connected, false);
  const reconnect = client();
  manager.join(reconnect, room.code, 'Bob');
  assert.equal(reconnect.messages.at(-1).type, 'error');
  assert.match(reconnect.messages.at(-1).message, /déjà commencé/);
  manager.handleClose(alice);
  assert.equal(manager.rooms.size, 0);
});

test('full-hand celebration uses the same official flag for both clients and excludes overshoots', () => {
  const { manager, alice, bob } = setup();
  manager.start(alice);
  fixedRoll([1, 2, 3, 4, 5], () => manager.action(alice, { action: 'roll' }));
  const roll = alice.messages.find(message => message.event === 'rolled');
  assert.equal(roll.payload.isHotDiceOpportunity, true);
  assert.equal(roll.payload.isBust, false);
  assert.deepEqual(roll, bob.messages.find(message => message.event === 'rolled'));

  const other = setup();
  other.manager.start(other.alice);
  other.room.controller.players[0].score = 9900;
  fixedRoll([1, 2, 3, 4, 5], () => other.manager.action(other.alice, { action: 'roll' }));
  const overshoot = other.alice.messages.find(message => message.event === 'rolled');
  assert.equal(overshoot.payload.isBust, true);
  assert.equal(overshoot.payload.isHotDiceOpportunity, false);
});
