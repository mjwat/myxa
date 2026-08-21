import test from "node:test";
import assert from "node:assert/strict";

import { createDevelopmentGameState } from "../js/game-state.js";
import { applyAction, getValidActions } from "../js/rule-engine.js";

function createState(piecePositions = {}, stateOverrides = {}) {
  const state = createDevelopmentGameState();

  Object.values(state.pieces).forEach((piece) => {
    Object.assign(piece, { location: "outside", cellId: null, laps: 0 });
  });
  Object.entries(piecePositions).forEach(([pieceId, position]) => {
    Object.assign(state.pieces[pieceId], position);
  });

  return Object.assign(state, stateOverrides);
}

function actionFor(state, playerId, dieValue, pieceId) {
  return getValidActions(state, playerId, dieValue).find((action) => action.pieceId === pieceId);
}

test("a piece enters its own HOME after completing a full lap", () => {
  const state = createState({
    "A-P1": { location: "board", cellId: "D-11", laps: 0 },
  });
  const completedLap = applyAction(state, actionFor(state, "A", 1, "A-P1")).gameState;

  assert.equal(completedLap.pieces["A-P1"].cellId, "A-0");
  assert.equal(completedLap.pieces["A-P1"].laps, 1);

  const action = actionFor(completedLap, "A", 1, "A-P1");

  assert.equal(action.destination, "A-H-1");
  assert.deepEqual(action.path, ["A-H-1"]);
  assert.deepEqual(action.effects, []);
  assert.deepEqual(applyAction(completedLap, action).gameState.pieces["A-P1"], {
    id: "A-P1",
    playerId: "A",
    location: "home",
    cellId: "A-H-1",
    laps: 1,
  });
});

test("a piece does not enter HOME before completing its lap", () => {
  const state = createState({
    "A-P1": { location: "board", cellId: "A-0", laps: 0 },
  });
  const action = actionFor(state, "A", 1, "A-P1");

  assert.equal(action.destination, "A-1");
  assert.deepEqual(action.path, ["A-1"]);
});

test("a piece captured before HOME starts a new lap after release and re-entry", () => {
  const state = createState({
    "A-P1": { location: "board", cellId: "A-0", laps: 1 },
    "B-P1": { location: "board", cellId: "D-10", laps: 0 },
  });

  const captured = applyAction(state, actionFor(state, "B", 2, "B-P1")).gameState;
  assert.equal(captured.pieces["A-P1"].location, "sun");
  assert.equal(captured.pieces["A-P1"].laps, 0);

  const released = applyAction(captured, actionFor(captured, "A", 6, "A-P1")).gameState;
  const clearedStart = applyAction(released, actionFor(released, "B", 1, "B-P1")).gameState;
  const reentered = applyAction(clearedStart, actionFor(clearedStart, "A", 6, "A-P1")).gameState;
  const nextAction = actionFor(reentered, "A", 1, "A-P1");

  assert.equal(reentered.pieces["A-P1"].laps, 0);
  assert.equal(nextAction.destination, "A-1");
  assert.notEqual(nextAction.destination, "A-H-1");
});

test("one die action can continue from the main route into HOME", () => {
  const state = createState({
    "A-P1": { location: "board", cellId: "D-11", laps: 0 },
  });
  const action = actionFor(state, "A", 3, "A-P1");

  assert.equal(action.type, "move");
  assert.equal(action.destination, "A-H-2");
  assert.deepEqual(action.path, ["A-0", "A-H-1", "A-H-2"]);
  assert.deepEqual(action.effects, [{ type: "lap-completed", pieceId: "A-P1" }]);

  const result = applyAction(state, action);
  assert.equal(result.gameState.pieces["A-P1"].location, "home");
  assert.equal(result.gameState.pieces["A-P1"].laps, 1);
});

test("a piece cannot enter or move inside another player's HOME", () => {
  const state = createState({
    "A-P1": { location: "home", cellId: "B-H-1", laps: 1 },
  });

  assert.equal(actionFor(state, "A", 1, "A-P1"), undefined);
  assert.equal(getValidActions(state, "A", 1).length, 0);
});

test("exact movement inside HOME uses the ordinary die value", () => {
  const state = createState({
    "A-P1": { location: "home", cellId: "A-H-2", laps: 1 },
  });
  const action = actionFor(state, "A", 2, "A-P1");

  assert.equal(action.destination, "A-H-4");
  assert.deepEqual(action.path, ["A-H-3", "A-H-4"]);
});

test("movement beyond H-4 is invalid", () => {
  const state = createState({
    "A-P1": { location: "home", cellId: "A-H-2", laps: 1 },
  });

  assert.equal(actionFor(state, "A", 3, "A-P1"), undefined);
});

test("a shorter exact move stays in HOME and does not finish prematurely", () => {
  const state = createState({
    "A-P1": { location: "home", cellId: "A-H-2", laps: 1 },
  });
  const result = applyAction(state, actionFor(state, "A", 1, "A-P1"));

  assert.equal(result.gameState.pieces["A-P1"].location, "home");
  assert.equal(result.gameState.pieces["A-P1"].cellId, "A-H-3");
});

test("a piece cannot jump over a friendly piece in HOME", () => {
  const state = createState({
    "A-P1": { location: "home", cellId: "A-H-1", laps: 1 },
    "A-P2": { location: "home", cellId: "A-H-2", laps: 1 },
  });

  assert.equal(actionFor(state, "A", 2, "A-P1"), undefined);
});

test("a piece cannot land on a friendly piece in HOME", () => {
  const state = createState({
    "A-P1": { location: "home", cellId: "A-H-1", laps: 1 },
    "A-P2": { location: "home", cellId: "A-H-3", laps: 1 },
  });

  assert.equal(actionFor(state, "A", 2, "A-P1"), undefined);
});

test("a deeper occupied HOME position blocks a piece behind it", () => {
  const state = createState({
    "A-P1": { location: "home", cellId: "A-H-1", laps: 1 },
    "A-P2": { location: "finished", cellId: "A-H-4", laps: 1 },
  });

  assert.equal(actionFor(state, "A", 3, "A-P1"), undefined);
  assert.equal(actionFor(state, "A", 2, "A-P1").destination, "A-H-3");
});

test("a piece becomes finished when it reaches its final legal position", () => {
  const state = createState({
    "A-P1": { location: "home", cellId: "A-H-2", laps: 1 },
  });
  const action = actionFor(state, "A", 2, "A-P1");

  assert.deepEqual(action.effects, [{ type: "finish", pieceId: "A-P1", destination: "A-H-4" }]);
  const result = applyAction(state, action);
  assert.equal(result.gameState.pieces["A-P1"].location, "finished");
  assert.equal(result.gameState.pieces["A-P1"].cellId, "A-H-4");
  assert.equal(result.events.some(({ type }) => type === "piece-finished"), true);
});

test("a finished piece has no valid actions", () => {
  const state = createState({
    "A-P1": { location: "finished", cellId: "A-H-4", laps: 1 },
  });

  for (let dieValue = 1; dieValue <= 6; dieValue += 1) {
    assert.equal(actionFor(state, "A", dieValue, "A-P1"), undefined);
  }
});

test("fewer than four finished pieces do not win", () => {
  const state = createState({
    "A-P1": { location: "finished", cellId: "A-H-4", laps: 1 },
    "A-P2": { location: "finished", cellId: "A-H-3", laps: 1 },
    "A-P3": { location: "home", cellId: "A-H-1", laps: 1 },
  });
  const result = applyAction(state, actionFor(state, "A", 1, "A-P3"));

  assert.equal(result.gameState.pieces["A-P3"].location, "finished");
  assert.equal(result.gameState.status, "playing");
  assert.equal(result.gameState.winnerId, null);
});

test("the fourth finished piece wins immediately and cancels remaining values", () => {
  const state = createState({
    "A-P1": { location: "finished", cellId: "A-H-4", laps: 1 },
    "A-P2": { location: "finished", cellId: "A-H-3", laps: 1 },
    "A-P3": { location: "finished", cellId: "A-H-2", laps: 1 },
    "A-P4": { location: "board", cellId: "A-0", laps: 1 },
  }, {
    turn: { dice: [6, 1], remainingValues: [1, 6], activeValue: 1 },
  });
  const result = applyAction(state, actionFor(state, "A", 1, "A-P4"));

  assert.equal(result.gameState.pieces["A-P4"].location, "finished");
  assert.equal(result.gameState.status, "finished");
  assert.equal(result.gameState.winnerId, "A");
  assert.deepEqual(result.gameState.turn.remainingValues, []);
  assert.equal(result.gameState.turn.activeValue, null);
  assert.deepEqual(result.events.at(-1), { type: "player-won", playerId: "A" });
  assert.deepEqual(getValidActions(result.gameState, "A", 6), []);
});

test("HOME movement and finishing are symmetric for side B", () => {
  const state = createState({
    "B-P1": { location: "board", cellId: "A-11", laps: 0 },
    "B-P2": { location: "finished", cellId: "B-H-4", laps: 1 },
  });
  const action = actionFor(state, "B", 3, "B-P1");

  assert.deepEqual(action.path, ["B-0", "B-H-1", "B-H-2"]);
  assert.equal(action.destination, "B-H-2");
  assert.deepEqual(action.effects, [{ type: "lap-completed", pieceId: "B-P1" }]);
});
