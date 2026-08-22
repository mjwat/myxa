import test from "node:test";
import assert from "node:assert/strict";

import { createDevelopmentGameState } from "../js/game-state.js";
import {
  advanceToNextPlayer,
  applyTurnAction,
  createPendingTurn,
  getTurnActionSequencesForPiece,
  getTurnValidActions,
  rollDice,
  startTurn,
} from "../js/turn-engine.js";

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

function actionFor(state, pieceId, type) {
  return getTurnValidActions(state).find((action) => (
    action.pieceId === pieceId && (!type || action.type === type)
  ));
}

function statuses(state) {
  return state.turn.valueStates.map(({ status }) => status);
}

test("a new turn starts waiting for a roll", () => {
  const turn = createPendingTurn();

  assert.equal(turn.dice, null);
  assert.equal(turn.activeValue, null);
  assert.equal(turn.finished, false);
  assert.deepEqual(turn.valueStates, []);
});

test("normal rolls preserve the dice and resolve the larger value first", () => {
  for (const dice of [[5, 3], [3, 5]]) {
    const state = startTurn(createState({ "A-P1": { location: "board", cellId: "A-4" } }), dice);
    assert.deepEqual(state.turn.dice, dice);
    assert.deepEqual(state.turn.sequence, [5, 3]);
    assert.equal(state.turn.activeValue, 5);
  }
});

test("using 5 advances a normal roll to 3", () => {
  let state = startTurn(createState({ "A-P1": { location: "board", cellId: "A-4" } }), [5, 3]);
  state = applyTurnAction(state, actionFor(state, "A-P1")).gameState;

  assert.equal(state.turn.activeValue, 3);
  assert.deepEqual(statuses(state), ["used", "active"]);
});

test("a selected piece exposes the larger-value and combined destinations", () => {
  const state = startTurn(createState({ "A-P1": { location: "board", cellId: "A-4" } }), [5, 3]);
  const sequences = getTurnActionSequencesForPiece(state, "A-P1");

  assert.deepEqual(sequences.map((sequence) => sequence.map(({ dieValue }) => dieValue)), [[5], [5, 3]]);
  assert.deepEqual(sequences.map((sequence) => sequence.at(-1).destination), ["A-9", "B-0"]);
});

test("a combined destination is omitted when the same piece cannot use the next value", () => {
  const state = startTurn(createState({
    "A-P1": { location: "board", cellId: "D-10" },
    "A-P2": { location: "board", cellId: "B-0" },
  }), [5, 3]);

  assert.equal(getTurnActionSequencesForPiece(state, "A-P1").length, 1);
});

test("a double exposes every reachable action prefix", () => {
  const state = startTurn(createState({ "A-P1": { location: "board", cellId: "A-4" } }), [3, 3]);
  const sequences = getTurnActionSequencesForPiece(state, "A-P1");

  assert.deepEqual(sequences.map((sequence) => sequence.length), [1, 2, 3, 4]);
  assert.deepEqual(sequences.map((sequence) => sequence.at(-1).destination), ["A-7", "A-2", "A-5", "A-8"]);
  assert.deepEqual(sequences[3].map(({ dieValue }) => dieValue), [3, 3, 3, 3]);
});

test("a four-action double sequence preserves a capture on an intermediate Rainbow landing", () => {
  let state = startTurn(createState({
    "A-P1": { location: "board", cellId: "A-11" },
    "B-P1": { location: "board", cellId: "B-2" },
  }), [3, 3]);
  const sequence = getTurnActionSequencesForPiece(state, "A-P1").at(-1);

  assert.equal(sequence.length, 4);
  for (const action of sequence) state = applyTurnAction(state, action).gameState;

  assert.equal(state.pieces["B-P1"].location, "sun");
  assert.equal(state.pieces["B-P1"].cellId, null);
  assert.equal(state.turn.finished, true);
});

test("a double stops exposing prefixes when the selected piece can no longer move", () => {
  const state = startTurn(createState({
    "A-P1": { location: "home", cellId: "A-H-2", laps: 1 },
  }), [1, 1]);

  assert.deepEqual(
    getTurnActionSequencesForPiece(state, "A-P1").map((sequence) => sequence.length),
    [1, 2],
  );
});

test("an impossible larger value burns before a playable smaller value", () => {
  const state = startTurn(createState({ "A-P1": { location: "swamp", cellId: "A-3-Y" } }), [5, 3]);

  assert.equal(state.turn.activeValue, 3);
  assert.deepEqual(statuses(state), ["burned", "active"]);
});

test("a turn finishes immediately when neither value is playable", () => {
  const state = startTurn(createState(), [5, 3]);

  assert.equal(state.turn.finished, true);
  assert.equal(state.turn.activeValue, null);
  assert.deepEqual(statuses(state), ["burned", "burned"]);
  assert.deepEqual(getTurnValidActions(state), []);
});

test("a second value that becomes impossible after the first action burns", () => {
  let state = startTurn(createState({
    "A-P1": { location: "board", cellId: "D-10" },
  }), [5, 3]);
  state = applyTurnAction(state, actionFor(state, "A-P1")).gameState;

  assert.equal(state.turn.finished, true);
  assert.deepEqual(statuses(state), ["used", "burned"]);
});

test("a playable larger value prevents applying an action for the smaller value", () => {
  const state = startTurn(createState({ "A-P1": { location: "board", cellId: "A-4" } }), [5, 3]);
  const fabricatedSmallerAction = {
    type: "move",
    pieceId: "A-P1",
    dieValue: 3,
    destination: "A-7",
  };

  assert.throws(() => applyTurnAction(state, fabricatedSmallerAction), /active die value/);
});

test("the engine does not reorder values to make both playable", () => {
  let state = startTurn(createState({
    "A-P1": { location: "board", cellId: "D-10" },
  }), [5, 3]);
  assert.equal(state.turn.activeValue, 5);

  state = applyTurnAction(state, actionFor(state, "A-P1")).gameState;
  assert.deepEqual(statuses(state), ["used", "burned"]);
});

test("a double creates and finishes four actions with the same value", () => {
  let state = startTurn(createState({ "A-P1": { location: "board", cellId: "A-4" } }), [3, 3]);
  assert.deepEqual(state.turn.sequence, [3, 3, 3, 3]);

  for (let count = 0; count < 4; count += 1) {
    state = applyTurnAction(state, actionFor(state, "A-P1")).gameState;
  }

  assert.deepEqual(statuses(state), ["used", "used", "used", "used"]);
  assert.equal(state.turn.finished, true);
});

test("double actions can be distributed between pieces", () => {
  let state = startTurn(createState({
    "A-P1": { location: "board", cellId: "A-4" },
    "A-P2": { location: "board", cellId: "B-4" },
  }), [3, 3]);

  for (const pieceId of ["A-P1", "A-P2", "A-P1", "A-P2"]) {
    state = applyTurnAction(state, actionFor(state, pieceId)).gameState;
  }

  assert.equal(state.pieces["A-P1"].cellId, "A-2");
  assert.equal(state.pieces["A-P2"].cellId, "B-2");
  assert.equal(state.turn.finished, true);
});

test("impossible remaining double actions burn", () => {
  let state = startTurn(createState({ "A-P1": { location: "home", cellId: "A-H-1", laps: 1 } }), [3, 3]);
  state = applyTurnAction(state, actionFor(state, "A-P1")).gameState;

  assert.deepEqual(statuses(state), ["used", "burned", "burned", "burned"]);
  assert.equal(state.turn.finished, true);
});

test("six exposes move, enter-board, and release-from-sun as alternatives", () => {
  const state = startTurn(createState({
    "A-P1": { location: "board", cellId: "B-0" },
    "A-P2": { location: "outside", cellId: null },
    "A-P3": { location: "sun", cellId: null },
  }), [6, 2]);

  assert.deepEqual(new Set(getTurnValidActions(state).map(({ type }) => type)), new Set([
    "move", "enter-board", "release-from-sun",
  ]));
});

test("a sun piece is not offered when another six action lets the player use both dice", () => {
  const state = startTurn(createState({
    "A-P1": { location: "sun", cellId: null },
    "A-P3": { location: "finished", cellId: "A-H-3", laps: 1 },
    "A-P4": { location: "finished", cellId: "A-H-4", laps: 1 },
  }), [6, 2]);

  const actions = getTurnValidActions(state);

  assert.equal(actions.some(({ pieceId }) => pieceId === "A-P1"), false);
  assert.deepEqual(actions.map(({ pieceId, type }) => ({ pieceId, type })), [{
    pieceId: "A-P2",
    type: "enter-board",
  }]);
});

test("a sun piece remains available when the second die is playable after releasing it", () => {
  const state = startTurn(createState({
    "A-P1": { location: "sun", cellId: null },
    "A-P2": { location: "board", cellId: "B-4" },
    "A-P3": { location: "finished", cellId: "A-H-3", laps: 1 },
    "A-P4": { location: "finished", cellId: "A-H-4", laps: 1 },
  }), [6, 2]);

  assert.equal(getTurnValidActions(state).some(({ pieceId }) => pieceId === "A-P1"), true);
});

test("enter-board consumes one six and the new piece can use the next value", () => {
  let state = startTurn(createState(), [6, 2]);
  state = applyTurnAction(state, actionFor(state, "A-P1", "enter-board")).gameState;

  assert.equal(state.turn.activeValue, 2);
  assert.equal(actionFor(state, "A-P1", "move").destination, "A-10");
  assert.deepEqual(statuses(state), ["used", "active"]);
});

test("release-from-sun consumes exactly one six", () => {
  let state = startTurn(createState({ "A-P1": { location: "sun", cellId: null } }), [6, 6]);
  state = applyTurnAction(state, actionFor(state, "A-P1", "release-from-sun")).gameState;

  assert.equal(state.pieces["A-P1"].location, "outside");
  assert.equal(state.turn.activeValue, 6);
  assert.deepEqual(statuses(state), ["used", "active", "pending", "pending"]);
});

test("a winning action immediately finishes the turn without resolving pending values", () => {
  let state = startTurn(createState({
    "A-P1": { location: "finished", cellId: "A-H-4", laps: 1 },
    "A-P2": { location: "finished", cellId: "A-H-3", laps: 1 },
    "A-P3": { location: "finished", cellId: "A-H-2", laps: 1 },
    "A-P4": { location: "board", cellId: "D-10", laps: 0 },
  }), [3, 1]);
  state = applyTurnAction(state, actionFor(state, "A-P4")).gameState;

  assert.equal(state.status, "finished");
  assert.equal(state.winnerId, "A");
  assert.equal(state.turn.finished, true);
  assert.equal(state.turn.activeValue, null);
  assert.deepEqual(statuses(state), ["used", "pending"]);
  assert.deepEqual(getTurnValidActions(state), []);
});

test("production dice rolling returns two values from 1 to 6", () => {
  assert.deepEqual(rollDice(() => 0), [1, 1]);
  assert.deepEqual(rollDice(() => 0.999999), [6, 6]);
});

test("an unfinished turn cannot be replaced by another roll", () => {
  const state = startTurn(createState({ "A-P1": { location: "board", cellId: "A-4" } }), [5, 3]);
  assert.throws(() => startTurn(state, [6, 6]), /current turn/);
});

test("a finished turn advances through the declared turnOrder and resets turn state", () => {
  const state = createState();
  state.turnOrder = ["A", "C", "B", "D"];
  const finishedState = startTurn(state, [5, 3]);
  const nextState = advanceToNextPlayer(finishedState);

  assert.equal(nextState.currentPlayerId, "C");
  assert.deepEqual(nextState.turn, createPendingTurn());
});

test("turn order wraps from its last player to its first", () => {
  const state = createState();
  state.turnOrder = ["A", "C", "B", "D"];
  state.currentPlayerId = "D";

  const nextState = advanceToNextPlayer(startTurn(state, [5, 3]));
  assert.equal(nextState.currentPlayerId, "A");
});

test("actions from the previous player cannot be applied after switching", () => {
  let state = startTurn(createState({
    "A-P1": { location: "home", cellId: "A-H-1", laps: 1 },
  }), [3, 3]);
  const previousPlayerAction = actionFor(state, "A-P1");

  state = applyTurnAction(state, previousPlayerAction).gameState;
  state = advanceToNextPlayer(state);

  assert.equal(state.currentPlayerId, "B");
  assert.throws(() => applyTurnAction(state, previousPlayerAction), /no die value is active/);
});

test("victory neither advances the player nor permits another roll", () => {
  let state = startTurn(createState({
    "A-P1": { location: "finished", cellId: "A-H-4", laps: 1 },
    "A-P2": { location: "finished", cellId: "A-H-3", laps: 1 },
    "A-P3": { location: "finished", cellId: "A-H-2", laps: 1 },
    "A-P4": { location: "board", cellId: "D-10", laps: 0 },
  }), [3, 1]);
  state = applyTurnAction(state, actionFor(state, "A-P4")).gameState;

  const afterAdvanceAttempt = advanceToNextPlayer(state);
  assert.equal(afterAdvanceAttempt.currentPlayerId, "A");
  assert.throws(() => startTurn(state, [6, 6]), /game has finished/);
});
