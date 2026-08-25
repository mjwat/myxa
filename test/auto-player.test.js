import test from "node:test";
import assert from "node:assert/strict";

import { getAutoHumanStep } from "../js/auto-player.js";
import { createDevelopmentGameState, createDevelopmentScenarioState } from "../js/game-state.js";
import { startTurn } from "../js/turn-engine.js";

function enableAutoPlay(state) {
  state.players.find(({ id }) => id === state.currentPlayerId).autoPlay = true;
  return state;
}

function placeActivePieces(state, locations) {
  const player = state.players.find(({ id }) => id === state.currentPlayerId);
  player.pieceIds.forEach((pieceId, index) => {
    Object.assign(state.pieces[pieceId], {
      location: locations[index],
      cellId: null,
      laps: 0,
    });
  });
  return state;
}

test("automatic Human mode rolls when a turn is waiting to begin", () => {
  const state = enableAutoPlay(createDevelopmentScenarioState("normal-move"));

  assert.deepEqual(getAutoHumanStep(state), { type: "roll" });
});

test("automatic Human mode returns the only legal action", () => {
  const state = startTurn(enableAutoPlay(createDevelopmentScenarioState("normal-move")), [2, 1]);
  const step = getAutoHumanStep(state);

  assert.equal(step.type, "action");
  assert.equal(step.action.pieceId, "A-P1");
  assert.equal(step.action.dieValue, 2);
});

test("automatic Human mode waits when the player must choose", () => {
  const state = startTurn(enableAutoPlay(createDevelopmentScenarioState("multiple-pieces")), [2, 1]);

  assert.deepEqual(getAutoHumanStep(state), { type: "wait" });
});

test("automatic Human mode may choose any equivalent piece entering the board", () => {
  const state = startTurn(enableAutoPlay(placeActivePieces(
    createDevelopmentGameState(),
    ["outside", "outside", "outside", "outside"],
  )), [6, 1]);
  const step = getAutoHumanStep(state);

  assert.equal(step.type, "action");
  assert.equal(step.action.type, "enter-board");
  assert.equal(step.action.pieceId, "A-P1");
});

test("automatic Human mode may choose any equivalent piece released from the sun", () => {
  const state = startTurn(enableAutoPlay(placeActivePieces(
    createDevelopmentGameState(),
    ["sun", "sun", "sun", "sun"],
  )), [6, 1]);
  const step = getAutoHumanStep(state);

  assert.equal(step.type, "action");
  assert.equal(step.action.type, "release-from-sun");
  assert.equal(step.action.pieceId, "A-P1");
});

test("automatic Human mode waits when enter and release actions are both available", () => {
  const state = startTurn(enableAutoPlay(createDevelopmentScenarioState("six-alternatives")), [6, 2]);

  assert.deepEqual(getAutoHumanStep(state), { type: "wait" });
});

test("automatic Human mode is inactive when its switch is off", () => {
  const state = createDevelopmentScenarioState("normal-move");

  assert.deepEqual(getAutoHumanStep(state), { type: "wait" });
});
