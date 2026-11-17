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

test('admin observer reads dice without a seat, credentials or state mutations',()=>{
  const {manager,alice,room}=setup();manager.start(alice);
  const members=room.members.length,before=JSON.stringify(room.controller.players);
  const view=manager.adminSnapshot(room.code,room.instance);
  assert.equal(view.players.length,members);assert.equal(room.members.length,members);
  assert.equal(JSON.stringify(room.controller.players),before);
  for(const member of room.members)assert.equal(JSON.stringify(view).includes(member.token),false);
  assert.equal(manager.adminSnapshot(room.code,'replaced'),null);
});

test('lobby departures cannot assign turns to a missing seat', () => {
  const { manager,alice,bob,room }=setup();
  manager.leave(bob);
  const charlie=client();manager.join(charlie,room.code,'Charlie');
  assert.equal(charlie.memberId,2,'pre-game seat IDs can contain gaps');
  manager.start(alice);
  assert.equal(charlie.memberId,1,'all clients receive the engine seat before starting');
  assert.equal(charlie.messages.filter(m=>m.type==='joined').at(-1).memberId,1);
  room.controller.currentPlayerIndex=1;
  const before=alice.messages.length;manager.action(charlie,{action:'roll'});
  assert.ok(alice.messages.length>before,'remaining player can act on their turn');
});
test('host departure before start preserves new host control and turns',()=>{
  const { manager,alice,bob,room }=setup();manager.leave(alice);
  const charlie=client();manager.join(charlie,room.code,'Charlie');manager.start(bob);
  assert.equal(room.started,true);assert.equal(bob.memberId,0);assert.equal(charlie.memberId,1);
  const before=bob.messages.length;manager.action(bob,{action:'roll'});assert.ok(bob.messages.length>before);
});
test('a replaced socket cannot act on the resumed seat',()=>{
  const {manager,alice,room}=setup();manager.start(alice);
  const replacement=client();manager.resume(replacement,room.code,room.members[0].token);
  const before=replacement.messages.length;manager.action(alice,{action:'roll'});assert.equal(replacement.messages.length,before);
});
test('admin snapshot contains verified profile identities and no seat tokens',()=>{
  const manager=new RoomManager(),ws=client();const room=manager.create(ws,'PseudoLongDeLaPlateforme','11111111-1111-4111-8111-111111111111');
  const snapshot=manager.adminSnapshot(room.code,room.instance);
  assert.equal(snapshot.players[0].username,'PseudoLongDeLaPlateforme');assert.equal(snapshot.players[0].user_id,'11111111-1111-4111-8111-111111111111');
  assert.equal(JSON.stringify(snapshot).includes(room.members[0].token),false);
});
