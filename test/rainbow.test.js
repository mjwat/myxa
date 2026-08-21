import test from "node:test";
import assert from "node:assert/strict";

import { createDevelopmentGameState } from "../js/game-state.js";
import { applyAction, getValidActions } from "../js/rule-engine.js";

function createState(piecePositions = {}) {
  const state = createDevelopmentGameState();

  Object.values(state.pieces).forEach((piece) => {
    Object.assign(piece, { location: "outside", cellId: null, laps: 0 });
  });
  Object.entries(piecePositions).forEach(([pieceId, position]) => {
    Object.assign(state.pieces[pieceId], position);
  });

  return state;
}

function actionFor(state, playerId, dieValue, pieceId) {
  return getValidActions(state, playerId, dieValue).find((action) => action.pieceId === pieceId);
}

test("landing on SIDE-2 teleports to SIDE-10 without consuming another die value", () => {
  const state = createState({ "A-P1": { location: "board", cellId: "A-0" } });
  const action = actionFor(state, "A", 2, "A-P1");

  assert.equal(action.dieValue, 2);
  assert.deepEqual(action.path, ["A-1", "A-2"]);
  assert.equal(action.destination, "A-10");
  assert.deepEqual(action.effects, [{ type: "teleport", from: "A-2", to: "A-10" }]);
});

test("landing on SIDE-10 teleports to SIDE-2", () => {
  const state = createState({ "A-P1": { location: "board", cellId: "A-8" } });
  const action = actionFor(state, "A", 2, "A-P1");

  assert.deepEqual(action.path, ["A-9", "A-10"]);
  assert.equal(action.destination, "A-2");
  assert.deepEqual(action.effects, [{ type: "teleport", from: "A-10", to: "A-2" }]);
});

test("passing through SIDE-2 does not teleport", () => {
  const state = createState({ "A-P1": { location: "board", cellId: "A-0" } });
  const action = actionFor(state, "A", 4, "A-P1");

  assert.deepEqual(action.path, ["A-1", "A-2", "A-3", "A-4"]);
  assert.equal(action.destination, "A-4");
  assert.deepEqual(action.effects, []);
});

test("passing through SIDE-10 does not teleport", () => {
  const state = createState({ "A-P1": { location: "board", cellId: "A-8" } });
  const action = actionFor(state, "A", 3, "A-P1");

  assert.deepEqual(action.path, ["A-9", "A-10", "A-11"]);
  assert.equal(action.destination, "A-11");
  assert.deepEqual(action.effects, []);
});

test("an empty Rainbow destination is valid and becomes the resulting piece cell", () => {
  const state = createState({ "A-P1": { location: "board", cellId: "A-0" } });
  const action = actionFor(state, "A", 2, "A-P1");
  const result = applyAction(state, action);

  assert.equal(result.gameState.pieces["A-P1"].location, "board");
  assert.equal(result.gameState.pieces["A-P1"].cellId, "A-10");
  assert.deepEqual(result.events, [
    { type: "piece-moved", pieceId: "A-P1", from: "A-0", to: "A-2", path: ["A-1", "A-2"] },
    { type: "teleported", pieceId: "A-P1", from: "A-2", to: "A-10" },
  ]);
});

test("an enemy on the Rainbow destination is captured", () => {
  const state = createState({
    "A-P1": { location: "board", cellId: "A-0" },
    "B-P1": { location: "board", cellId: "A-10" },
  });
  const action = actionFor(state, "A", 2, "A-P1");

  assert.deepEqual(action.effects, [
    { type: "teleport", from: "A-2", to: "A-10" },
    { type: "capture", pieceId: "B-P1", destination: "sun" },
  ]);

  const result = applyAction(state, action);
  assert.equal(result.gameState.pieces["A-P1"].cellId, "A-10");
  assert.equal(result.gameState.pieces["B-P1"].location, "sun");
  assert.equal(result.gameState.pieces["B-P1"].cellId, null);
  assert.deepEqual(result.events.map(({ type }) => type), ["piece-moved", "teleported", "captured"]);
});

test("an enemy on the Rainbow landing endpoint is captured before teleport", () => {
  const state = createState({
    "A-P1": { location: "board", cellId: "A-0" },
    "B-P1": { location: "board", cellId: "A-2" },
  });
  const action = actionFor(state, "A", 2, "A-P1");

  assert.deepEqual(action.effects, [
    { type: "capture", pieceId: "B-P1", destination: "sun" },
    { type: "teleport", from: "A-2", to: "A-10" },
  ]);

  const result = applyAction(state, action);
  assert.equal(result.gameState.pieces["A-P1"].cellId, "A-10");
  assert.equal(result.gameState.pieces["B-P1"].location, "sun");
  assert.deepEqual(result.events.map(({ type }) => type), ["piece-moved", "captured", "teleported"]);
});

test("a friendly piece on the Rainbow destination makes the whole action invalid", () => {
  const state = createState({
    "A-P1": { location: "board", cellId: "A-0" },
    "A-P2": { location: "board", cellId: "A-10" },
  });

  assert.equal(actionFor(state, "A", 2, "A-P1"), undefined);
});

test("a friendly piece on the Rainbow landing endpoint makes the whole action invalid", () => {
  const state = createState({
    "A-P1": { location: "board", cellId: "A-5" },
    "A-P2": { location: "board", cellId: "A-10" },
  });

  assert.equal(actionFor(state, "A", 5, "A-P1"), undefined);
});

test("Rainbow resolution uses board links for another side", () => {
  const state = createState({ "B-P1": { location: "board", cellId: "B-0" } });
  const action = actionFor(state, "B", 2, "B-P1");

  assert.deepEqual(action.path, ["B-1", "B-2"]);
  assert.equal(action.destination, "B-10");
  assert.deepEqual(action.effects, [{ type: "teleport", from: "B-2", to: "B-10" }]);
});
