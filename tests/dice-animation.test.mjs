import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomizeDiePhysics, buildDiceThrowKeyframes } from '../js/dicePhysics.js';

test('throw finishes on the official front face without reversing its accumulated rotation', () => {
  for (let i = 0; i < 100; i++) {
    const physics = randomizeDiePhysics();
    assert.equal(Math.abs(physics.totalRotX % 360), 0);
    assert.equal(Math.abs(physics.totalRotY % 360), 0);
    const frames = buildDiceThrowKeyframes(physics, { dxPx: 120, dyPx: -70, startRotZ: 15, endRotZ: 740 });
    const previous = frames.at(-2).transform;
    const final = frames.at(-1).transform;
    for (const axis of ['X', 'Y']) {
      const pattern = new RegExp(`rotate${axis}\\(([-\\d.]+)deg\\)`);
      const lastAngle = Number(final.match(pattern)[1]);
      const previousAngle = Number(previous.match(pattern)[1]);
      assert.ok(Math.abs(lastAngle - previousAngle) < 1, 'last animation frame must not spin backwards');
      assert.equal(Math.abs(lastAngle % 360), 0, 'official front face must remain facing the player');
    }
    assert.equal(frames.at(-1).offset, 1);
    assert.ok(frames.every(frame => !/NaN|Infinity/.test(frame.transform)));
  }
});
