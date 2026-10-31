import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameController } from '../js/game.js';
import { chooseBotMove, attachBots } from '../js/bots.js';

function dice(values) {
  return values.map((value, index) => ({ id: `d${index}`, value, x: 300 + index * 80, y: 500, selected: false }));
}
function clock() {
  let next = 0;
  const pending = new Map();
  return {
    schedule(callback) { const id = ++next; pending.set(id, callback); return id; },
    cancel(id) { pending.delete(id); },
    pending,
    tick() { const first = pending.entries().next().value; if (!first) return false; pending.delete(first[0]); first[1](); return true; },
  };
}

test('bot selects legal points and secures a brelan', () => {
  const game = new GameController(['Vous', 'Bot']);
  game.tableDice = dice([4, 4, 4, 2, 3]);
  const move = chooseBotMove(game);
  assert.equal(move.action, 'bank');
  assert.equal(move.total, 400);
  for (const die of game.tableDice) if (move.ids.includes(die.id)) game.toggleDie(die.id);
  assert.equal(game.canBank, true);
  game.bankScore();
  assert.equal(game.players[0].score, 400);
});

test('bot cannot bank 50 points and finds an exact winning subset', () => {
  const game = new GameController(['Vous', 'Bot']);
  game.tableDice = dice([5, 2, 2, 4, 6]);
  assert.equal(chooseBotMove(game).action, 'reroll');
  game.players[0].score = 9900;
  game.tableDice = dice([5, 5, 5, 2, 3]);
  const move = chooseBotMove(game);
  assert.equal(move.action, 'bank');
  assert.equal(move.total, 100);
  for (const die of game.tableDice) if (move.ids.includes(die.id)) game.toggleDie(die.id);
  game.bankScore();
  assert.equal(game.gameOver, true);
  assert.equal(game.winner.score, 10000);
});

test('human turns are untouched; leaving cancels queued bot actions', () => {
  const game = new GameController(['Vous', 'Bot']);
  const timer = clock();
  const stop = attachBots(game, [1], timer);
  assert.equal(timer.pending.size, 0);
  game.tableDice = dice([4, 4, 4, 2, 3]);
  for (const die of game.tableDice.slice(0, 3)) game.toggleDie(die.id);
  game.bankScore();
  assert.equal(game.currentPlayerIndex, 1);
  assert.equal(timer.pending.size, 1);
  const staleCallback = [...timer.pending.values()][0];
  stop();
  assert.equal(timer.pending.size, 0);
  staleCallback();
  assert.equal(game.rollsThisTurn, 0);
});

test('a complete bot game reaches exactly 10,000 through the real controller', () => {
  const random = Math.random;
  let seed = 1987;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const game = new GameController(['Atlas · Bot', 'Nova · Bot']);
  const timer = clock();
  // This is the local UI's existing auto-reroll wiring, not a second rules engine.
  game.on('readyToReroll', () => game.roll());
  let bankCount = 0;
  game.on('banked', ({ gained, newScore }) => {
    assert.equal(gained % 100, 0);
    assert.ok(newScore <= 10000);
    bankCount++;
  });
  const stop = attachBots(game, [0, 1], timer);
  try {
    let steps = 0;
    while (!game.gameOver && steps++ < 10000) assert.ok(timer.tick(), 'bots must continue taking turns');
    assert.equal(game.gameOver, true, 'complete game must terminate');
    assert.equal(game.winner.score, 10000);
    assert.ok(bankCount > 1);
  } finally { stop(); Math.random = random; }
});
