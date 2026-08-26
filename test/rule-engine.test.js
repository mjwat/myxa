import test from "node:test";
import assert from "node:assert/strict";

import { createDevelopmentGameState } from "../js/game-state.js";
import { applyAction, getValidActions } from "../js/rule-engine.js";

function createState(piecePositions = {}) {
  const state = createDevelopmentGameState();

  Object.values(state.pieces).forEach((piece) => {
    Object.assign(piece, { location: "outside", cellId: null, laps: 0 });
  });
  Object.entries(piecePositions).forEach(([pieceId, position]) => Object.assign(state.pieces[pieceId], position));

  return state;
}

function actionFor(state, playerId, dieValue, pieceId) {
  return getValidActions(state, playerId, dieValue).find((action) => action.pieceId === pieceId);
}

test("[critical] an outside piece can enter its start only with a six", () => {
  const state = createState();

  assert.equal(getValidActions(state, "A", 5).length, 0);
  assert.deepEqual(actionFor(state, "A", 6, "A-P1"), {
    type: "enter-board",
    pieceId: "A-P1",
    dieValue: 6,
    destination: "A-0",
    path: ["A-0"],
    effects: [],
  });
});

test("[critical] a captured piece needs one six to leave the sun and another to enter the board", () => {
  const state = createState({
    "A-P1": { location: "sun", cellId: null, laps: 0 },
  });

  assert.equal(actionFor(state, "A", 5, "A-P1"), undefined);
  const release = actionFor(state, "A", 6, "A-P1");
  assert.equal(release.type, "release-from-sun");
  assert.equal(release.destination, "outside");

  const released = applyAction(state, release);
  assert.equal(released.gameState.pieces["A-P1"].location, "outside");
  assert.equal(released.gameState.pieces["A-P1"].laps, 0);
  assert.equal(released.events[0].type, "piece-released-from-sun");

  const reenter = actionFor(released.gameState, "A", 6, "A-P1");
  assert.equal(reenter.type, "enter-board");
  assert.equal(reenter.destination, "A-0");
});

test("main-route movement crosses side boundaries using board data", () => {
  const state = createState({
    "A-P1": { location: "board", cellId: "A-11" },
  });

  const action = actionFor(state, "A", 2, "A-P1");
  assert.equal(action.destination, "B-1");
  assert.deepEqual(action.path, ["B-0", "B-1"]);
});

test("[critical] a piece cannot jump over friendly or enemy pieces", () => {
  const friendlyBlock = createState({
    "A-P1": { location: "board", cellId: "A-5" },
    "A-P2": { location: "board", cellId: "A-7" },
  });
  const enemyBlock = createState({
    "A-P1": { location: "board", cellId: "A-5" },
    "B-P1": { location: "board", cellId: "A-7" },
  });

  assert.equal(actionFor(friendlyBlock, "A", 3, "A-P1"), undefined);
  assert.equal(actionFor(enemyBlock, "A", 3, "A-P1"), undefined);
});

test("a piece cannot land on a friendly piece", () => {
  const state = createState({
    "A-P1": { location: "board", cellId: "A-5" },
    "A-P2": { location: "board", cellId: "A-8" },
  });

  assert.equal(actionFor(state, "A", 3, "A-P1"), undefined);
});

test("[critical] landing exactly on an enemy captures it to the sun", () => {
  const state = createState({
    "A-P1": { location: "board", cellId: "A-5" },
    "B-P1": { location: "board", cellId: "A-8" },
  });
  const action = actionFor(state, "A", 3, "A-P1");

  assert.deepEqual(action.effects, [{ type: "capture", pieceId: "B-P1", destination: "sun" }]);

  const result = applyAction(state, action);
  assert.equal(result.gameState.pieces["A-P1"].cellId, "A-8");
  assert.equal(result.gameState.pieces["B-P1"].location, "sun");
  assert.equal(result.gameState.pieces["B-P1"].cellId, null);
  assert.deepEqual(result.events.map(({ type }) => type), ["piece-moved", "captured"]);
  assert.equal(state.pieces["A-P1"].cellId, "A-5", "the input state is not mutated");
  assert.equal(state.pieces["B-P1"].location, "board", "the input state is not mutated");
});

test("entering can capture an enemy on the start and is blocked by a friendly piece", () => {
  const enemyOnStart = createState({ "B-P1": { location: "board", cellId: "A-0" } });
  const friendlyOnStart = createState({ "A-P2": { location: "board", cellId: "A-0" } });

  const capture = actionFor(enemyOnStart, "A", 6, "A-P1");
  assert.deepEqual(capture.effects, [{ type: "capture", pieceId: "B-P1", destination: "sun" }]);
  assert.equal(actionFor(friendlyOnStart, "A", 6, "A-P1"), undefined);
});

test("unsupported special-location pieces are ignored and landing on the swamp entrance resolves", () => {
  const state = createState({
    "A-P1": { location: "swamp", cellId: "A-3-X" },
    "A-P2": { location: "board", cellId: "A-1" },
    "A-P3": { location: "sun", cellId: null },
  });

  const actions = getValidActions(state, "A", 2);
  assert.equal(actions.some(({ pieceId }) => pieceId === "A-P1"), false);
  assert.equal(actions.some(({ pieceId }) => pieceId === "A-P3"), false);
  assert.equal(actionFor(state, "A", 2, "A-P2").destination, "A-3-X");
});

test("[critical] applyAction rejects stale or fabricated actions", () => {
  const state = createState({ "A-P1": { location: "board", cellId: "A-5" } });

  assert.throws(
    () => applyAction(state, { type: "move", pieceId: "A-P1", dieValue: 3, destination: "B-4" }),
    /not valid/,
  );
});
