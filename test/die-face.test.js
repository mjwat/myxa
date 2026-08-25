import test from "node:test";
import assert from "node:assert/strict";

import { getDiePipPositions } from "../js/die-face.js";

test("die faces use standard pip positions for every value", () => {
  assert.deepEqual(getDiePipPositions(1), [5]);
  assert.deepEqual(getDiePipPositions(2), [1, 9]);
  assert.deepEqual(getDiePipPositions(3), [1, 5, 9]);
  assert.deepEqual(getDiePipPositions(4), [1, 3, 7, 9]);
  assert.deepEqual(getDiePipPositions(5), [1, 3, 5, 7, 9]);
  assert.deepEqual(getDiePipPositions(6), [1, 3, 4, 6, 7, 9]);
  assert.deepEqual(getDiePipPositions(null), []);
});
