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

function position(result, pieceId) {
  const piece = result.gameState.pieces[pieceId];
  return { location: piece.location, cellId: piece.cellId };
}

test("landing exactly on SIDE-3 enters SIDE-3-X without another die value", () => {
  const state = createState({ "A-P1": { location: "board", cellId: "A-1" } });
  const action = actionFor(state, "A", 2, "A-P1");

  assert.equal(action.dieValue, 2);
  assert.deepEqual(action.path, ["A-2", "A-3"]);
  assert.equal(action.destination, "A-3-X");
  assert.deepEqual(action.effects, [
    { type: "enter-swamp", pieceId: "A-P1", from: "A-3", to: "A-3-X" },
  ]);

  const result = applyAction(state, action);
  assert.deepEqual(position(result, "A-P1"), { location: "swamp", cellId: "A-3-X" });
  assert.deepEqual(result.events.map(({ type }) => type), ["piece-moved", "entered-swamp"]);
});

test("passing through SIDE-3 does not enter the swamp", () => {
  const state = createState({ "A-P1": { location: "board", cellId: "A-0" } });
  const action = actionFor(state, "A", 4, "A-P1");

  assert.deepEqual(action.path, ["A-1", "A-2", "A-3", "A-4"]);
  assert.equal(action.destination, "A-4");
  assert.equal(action.effects.some(({ type }) => type === "enter-swamp"), false);
  assert.deepEqual(position(applyAction(state, action), "A-P1"), { location: "board", cellId: "A-4" });
});

test("[critical] X, Y, and Z move only with their board-data required rolls", () => {
  const cases = [
    ["A-3-X", 1, "A-3-Y"],
    ["A-3-Y", 3, "A-3-Z"],
    ["A-3-Z", 6, "A-6"],
  ];

  for (const [cellId, requiredValue, destination] of cases) {
    const state = createState({ "A-P1": { location: "swamp", cellId } });
    for (let dieValue = 1; dieValue <= 6; dieValue += 1) {
      const action = actionFor(state, "A", dieValue, "A-P1");
      if (dieValue === requiredValue) {
        assert.equal(action.type, "swamp-move");
        assert.equal(action.destination, destination);
        assert.deepEqual(action.path, [destination], "a swamp action moves exactly one position");
      } else {
        assert.equal(action, undefined, `${cellId} must not move with ${dieValue}`);
      }
    }
  }
});

test("a swamp move pushes one friendly piece without capture", () => {
  const state = createState({
    "A-P1": { location: "swamp", cellId: "A-3-X" },
    "A-P2": { location: "swamp", cellId: "A-3-Y" },
  });
  const action = actionFor(state, "A", 1, "A-P1");

  assert.deepEqual(action.effects, [
    { type: "push", pieceId: "A-P2", byPieceId: "A-P1", from: "A-3-Y", to: "A-3-Z" },
  ]);
  const result = applyAction(state, action);
  assert.deepEqual(position(result, "A-P1"), { location: "swamp", cellId: "A-3-Y" });
  assert.deepEqual(position(result, "A-P2"), { location: "swamp", cellId: "A-3-Z" });
  assert.equal(result.events.some(({ type }) => type === "captured"), false);
});

test("a swamp move pushes one enemy piece without capture inside X/Y/Z", () => {
  const state = createState({
    "A-P1": { location: "swamp", cellId: "A-3-X" },
    "B-P1": { location: "swamp", cellId: "A-3-Y" },
  });
  const result = applyAction(state, actionFor(state, "A", 1, "A-P1"));

  assert.deepEqual(position(result, "B-P1"), { location: "swamp", cellId: "A-3-Z" });
  assert.equal(result.events.some(({ type }) => type === "captured"), false);
});

test("[critical] a swamp move precomputes and applies a chain push of two pieces", () => {
  const state = createState({
    "A-P1": { location: "swamp", cellId: "A-3-X" },
    "B-P1": { location: "swamp", cellId: "A-3-Y" },
    "C-P1": { location: "swamp", cellId: "A-3-Z" },
  });
  const action = actionFor(state, "A", 1, "A-P1");

  assert.deepEqual(action.effects, [
    { type: "push", pieceId: "B-P1", byPieceId: "A-P1", from: "A-3-Y", to: "A-3-Z" },
    { type: "push", pieceId: "C-P1", byPieceId: "B-P1", from: "A-3-Z", to: "A-6" },
  ]);
  const result = applyAction(state, action);
  assert.deepEqual(position(result, "A-P1"), { location: "swamp", cellId: "A-3-Y" });
  assert.deepEqual(position(result, "B-P1"), { location: "swamp", cellId: "A-3-Z" });
  assert.deepEqual(position(result, "C-P1"), { location: "board", cellId: "A-6" });
  assert.deepEqual(result.events.map(({ type }) => type), ["piece-moved", "piece-pushed", "piece-pushed"]);
});

test("Z + 6 exits to empty SIDE-6", () => {
  const state = createState({ "A-P1": { location: "swamp", cellId: "A-3-Z" } });
  const result = applyAction(state, actionFor(state, "A", 6, "A-P1"));

  assert.deepEqual(position(result, "A-P1"), { location: "board", cellId: "A-6" });
});

test("exiting onto an enemy at SIDE-6 captures it", () => {
  const state = createState({
    "A-P1": { location: "swamp", cellId: "A-3-Z" },
    "B-P1": { location: "board", cellId: "A-6" },
  });
  const action = actionFor(state, "A", 6, "A-P1");

  assert.deepEqual(action.effects, [
    { type: "capture", pieceId: "B-P1", byPieceId: "A-P1", destination: "sun" },
  ]);
  const result = applyAction(state, action);
  assert.deepEqual(position(result, "A-P1"), { location: "board", cellId: "A-6" });
  assert.deepEqual(position(result, "B-P1"), { location: "sun", cellId: null });
});

test("exiting onto a friendly piece at SIDE-6 is invalid", () => {
  const state = createState({
    "A-P1": { location: "swamp", cellId: "A-3-Z" },
    "A-P2": { location: "board", cellId: "A-6" },
  });

  assert.equal(actionFor(state, "A", 6, "A-P1"), undefined);
});

test("chain push onto an enemy at SIDE-6 captures it", () => {
  const state = createState({
    "A-P1": { location: "swamp", cellId: "A-3-X" },
    "B-P1": { location: "swamp", cellId: "A-3-Y" },
    "C-P1": { location: "swamp", cellId: "A-3-Z" },
    "D-P1": { location: "board", cellId: "A-6" },
  });
  const action = actionFor(state, "A", 1, "A-P1");

  assert.deepEqual(action.effects.at(-1), {
    type: "capture",
    pieceId: "D-P1",
    byPieceId: "C-P1",
    destination: "sun",
  });
  const result = applyAction(state, action);
  assert.deepEqual(position(result, "C-P1"), { location: "board", cellId: "A-6" });
  assert.deepEqual(position(result, "D-P1"), { location: "sun", cellId: null });
});

test("[critical] chain push blocked by the last pushed piece's friendly exit occupant is wholly invalid", () => {
  const state = createState({
    "A-P1": { location: "swamp", cellId: "A-3-X" },
    "B-P1": { location: "swamp", cellId: "A-3-Y" },
    "C-P1": { location: "swamp", cellId: "A-3-Z" },
    "C-P2": { location: "board", cellId: "A-6" },
  });

  assert.equal(actionFor(state, "A", 1, "A-P1"), undefined);
  assert.deepEqual(position({ gameState: state }, "A-P1"), { location: "swamp", cellId: "A-3-X" });
  assert.deepEqual(position({ gameState: state }, "B-P1"), { location: "swamp", cellId: "A-3-Y" });
  assert.deepEqual(position({ gameState: state }, "C-P1"), { location: "swamp", cellId: "A-3-Z" });
});

test("swamp entry can resolve an occupied X position as a complete push chain", () => {
  const state = createState({
    "A-P1": { location: "board", cellId: "A-1" },
    "B-P1": { location: "swamp", cellId: "A-3-X" },
    "C-P1": { location: "swamp", cellId: "A-3-Y" },
  });
  const action = actionFor(state, "A", 2, "A-P1");

  assert.deepEqual(action.effects.map(({ type }) => type), ["enter-swamp", "push", "push"]);
  const result = applyAction(state, action);
  assert.deepEqual(position(result, "A-P1"), { location: "swamp", cellId: "A-3-X" });
  assert.deepEqual(position(result, "B-P1"), { location: "swamp", cellId: "A-3-Y" });
  assert.deepEqual(position(result, "C-P1"), { location: "swamp", cellId: "A-3-Z" });
});

test("swamp resolution is symmetric and driven by side B board data", () => {
  const state = createState({
    "B-P1": { location: "swamp", cellId: "B-3-Y" },
    "A-P1": { location: "swamp", cellId: "B-3-Z" },
  });
  const action = actionFor(state, "B", 3, "B-P1");

  assert.equal(action.destination, "B-3-Z");
  assert.deepEqual(action.effects, [
    { type: "push", pieceId: "A-P1", byPieceId: "B-P1", from: "B-3-Z", to: "B-6" },
  ]);
  const result = applyAction(state, action);
  assert.deepEqual(position(result, "B-P1"), { location: "swamp", cellId: "B-3-Z" });
  assert.deepEqual(position(result, "A-P1"), { location: "board", cellId: "B-6" });
});
