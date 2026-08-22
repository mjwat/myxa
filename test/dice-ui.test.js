import test from "node:test";
import assert from "node:assert/strict";

import {
  getDicePosition,
  getDiceViewModel,
  getHumanDicePositions,
  shouldInvertTopDiceCaption,
} from "../js/dice-ui.js";
import { createDevelopmentGameState } from "../js/game-state.js";
import { applyTurnAction, getTurnValidActions, startTurn } from "../js/turn-engine.js";

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

function actionFor(state, pieceId) {
  return getTurnValidActions(state).find((action) => action.pieceId === pieceId);
}

test("dice UI shows the current player's name, color, and waiting-roll state", () => {
  const model = getDiceViewModel(createState());

  assert.equal(model.player.name, "Анна");
  assert.equal(model.player.color, "#d84f4b");
  assert.equal(model.canRoll, true);
  assert.deepEqual(model.dice.map(({ status }) => status), ["not-rolled", "not-rolled"]);
});

test("a sole human uses the bottom dice while every bot uses the top dice", () => {
  const players = [
    { id: "human", type: "human", side: "C" },
    { id: "bot-a", type: "bot", side: "A" },
    { id: "bot-d", type: "bot", side: "D" },
  ];

  assert.equal(getDicePosition(players, "human"), "bottom");
  assert.equal(getDicePosition(players, "bot-a"), "top");
  assert.equal(getDicePosition(players, "bot-d"), "top");
});

test("multiplayer dice are shared by the upper and lower halves of the board", () => {
  const players = [
    { id: "a", type: "human", side: "A" },
    { id: "b", type: "bot", side: "B" },
    { id: "c", type: "human", side: "C" },
    { id: "d", type: "bot", side: "D" },
  ];

  assert.equal(getDicePosition(players, "a"), "top");
  assert.equal(getDicePosition(players, "b"), "top");
  assert.equal(getDicePosition(players, "c"), "bottom");
  assert.equal(getDicePosition(players, "d"), "bottom");
});

test("a sole human keeps the caption beside the bottom dice", () => {
  const players = [
    { id: "bot", type: "bot", side: "A" },
    { id: "human", type: "human", side: "C" },
  ];

  assert.deepEqual(getHumanDicePositions(players), ["bottom"]);
});

test("multiplayer captions remain only beside dice sets used by humans", () => {
  const players = [
    { id: "human-a", type: "human", side: "A" },
    { id: "bot-b", type: "bot", side: "B" },
    { id: "human-c", type: "human", side: "C" },
    { id: "bot-d", type: "bot", side: "D" },
  ];

  assert.deepEqual(getHumanDicePositions(players), ["top", "bottom"]);
  assert.equal(shouldInvertTopDiceCaption(players), true);
  assert.equal(shouldInvertTopDiceCaption(players.slice(1)), false);
});

test("dice UI reflects a burned value and the next active value from the turn engine", () => {
  const state = startTurn(createState({
    "A-P1": { location: "swamp", cellId: "A-3-Y", laps: 0 },
  }), [5, 3]);
  const model = getDiceViewModel(state);

  assert.equal(model.activeValue, 3);
  assert.deepEqual(model.dice.map(({ status }) => status), ["burned", "active"]);
});

test("dice UI follows used and automatically activated values after an action", () => {
  let state = startTurn(createState({
    "A-P1": { location: "board", cellId: "A-4", laps: 0 },
  }), [5, 3]);
  state = applyTurnAction(state, actionFor(state, "A-P1")).gameState;
  const model = getDiceViewModel(state);

  assert.deepEqual(model.dice.map(({ status }) => status), ["used", "active"]);
  assert.equal(model.activeValue, 3);
});

test("double UI shows four dice and advances their individual states", () => {
  let state = startTurn(createState({
    "A-P1": { location: "board", cellId: "A-4", laps: 0 },
  }), [3, 3]);

  for (let usedCount = 0; usedCount < 4; usedCount += 1) {
    const model = getDiceViewModel(state);
    assert.equal(model.dice.length, 4);
    assert.deepEqual(model.dice.map(({ value }) => value), [3, 3, 3, 3]);
    assert.equal(model.dice.filter(({ status }) => status === "used").length, usedCount);
    assert.equal(model.dice.filter(({ status }) => status === "active").length, 1);
    state = applyTurnAction(state, actionFor(state, "A-P1")).gameState;
  }

  const completedModel = getDiceViewModel(state);
  assert.deepEqual(completedModel.dice.map(({ status }) => status), ["used", "used", "used", "used"]);
  assert.equal(state.turn.finished, true);
});
