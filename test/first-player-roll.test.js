import test from "node:test";
import assert from "node:assert/strict";

import {
  createFirstPlayerRoll,
  recordFirstPlayerRoll,
} from "../js/first-player-roll.js";

function completeRound(state, values) {
  let nextState = state;
  for (const playerId of state.participants) {
    nextState = recordFirstPlayerRoll(nextState, playerId, values[playerId]);
  }
  return nextState;
}

test("the highest roll determines the first player", () => {
  const state = completeRound(createFirstPlayerRoll(["A", "B", "C"]), { A: 2, B: 6, C: 4 });

  assert.equal(state.status, "complete");
  assert.equal(state.winnerId, "B");
  assert.equal("turnOrder" in state, false);
});

test("other roll values do not produce a turn order", () => {
  const state = completeRound(createFirstPlayerRoll(["A", "B", "C", "D"]), {
    A: 5, B: 1, C: 6, D: 4,
  });

  assert.equal(state.winnerId, "C");
  assert.equal("turnOrder" in state, false);
});

test("[critical] only players tied for the maximum reroll", () => {
  const state = completeRound(createFirstPlayerRoll(["A", "B", "C", "D"]), {
    A: 6, B: 3, C: 6, D: 4,
  });

  assert.equal(state.status, "rolling");
  assert.equal(state.round, 2);
  assert.deepEqual(state.participants, ["A", "C"]);
  assert.equal(state.currentPlayerId, "A");
  assert.deepEqual(state.results, {});
});

test("a repeated tie starts another round for the still-tied players", () => {
  let state = completeRound(createFirstPlayerRoll(["A", "B", "C", "D"]), {
    A: 6, B: 3, C: 6, D: 4,
  });
  state = completeRound(state, { A: 5, C: 5 });

  assert.equal(state.status, "rolling");
  assert.equal(state.round, 3);
  assert.deepEqual(state.participants, ["A", "C"]);
  assert.equal(state.history.length, 2);
});

test("a winner is selected after repeated ties", () => {
  let state = completeRound(createFirstPlayerRoll(["A", "B", "C", "D"]), {
    A: 6, B: 3, C: 6, D: 4,
  });
  state = completeRound(state, { A: 2, C: 2 });
  state = completeRound(state, { A: 4, C: 5 });

  assert.equal(state.winnerId, "C");
  assert.equal("turnOrder" in state, false);
});
