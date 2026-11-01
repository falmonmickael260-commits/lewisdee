import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RoomManager } from '../net/rooms.js';
const socket = () => ({ readyState: 1, messages: [], send(s) { this.messages.push(JSON.parse(s)); } });
test('invitation et reprise de la même place, y compris après démarrage', () => {
  const manager = new RoomManager(), host = randomUUID(), bob = randomUUID(), a = socket();
  const room = manager.create(a, 'Alice', host), adapter = manager.platformConnector();
  const c = { v: 1, game: '10000', operation: 'admit', room: room.code, uid: bob, name: 'Bob', inviter: host,
    invitation: randomUUID(), instance: room.instance, proof: { code: room.code, token: room.members[0].token } };
  const b = adapter.admit(c);
  assert.deepEqual(adapter.admit(c), b);
  assert.equal(room.members.length, 2);
  const online = socket(); assert.equal(manager.resume(online, b.code, b.token), true);
  manager.start(a);
  manager.handleClose(online);
  const returned = socket(); assert.equal(manager.resume(returned, b.code, b.token), true);
  assert.equal(returned.memberId, b.memberId);
  assert.equal(room.members.length, 2);
  assert.ok(returned.messages.some(m => m.type === 'started'));
  const stolen = socket(); assert.equal(manager.resume(stolen, b.code, 'forged'), false);
  assert.throws(() => adapter.admit({ ...c, uid: randomUUID() }), /commencé/);
});
