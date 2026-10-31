import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDieArtwork, PIP_POSITIONS } from '../js/dieArtwork.js';

for (let value = 1; value <= 6; value++) {
  test(`resting die ${value} displays exactly ${value} official pips`, () => {
    const originalDocument = globalThis.document;
    globalThis.document = {
      createElementNS(namespace, tag) {
        return { namespace, tag, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, innerHTML: '' };
      },
    };
    try {
      const svg = buildDieArtwork(value);
      assert.equal(svg.tag, 'svg');
      assert.equal(svg.attributes['aria-hidden'], 'true');
      assert.equal((svg.innerHTML.match(/class="artwork-pip"/g) || []).length, value);
      assert.equal(new Set(PIP_POSITIONS[value].map(String)).size, value);
      assert.ok(PIP_POSITIONS[value].every(([x,y]) => x >= 27 && x <= 69 && y >= 27 && y <= 69));
    } finally {
      if (originalDocument === undefined) delete globalThis.document;
      else globalThis.document = originalDocument;
    }
  });
}
