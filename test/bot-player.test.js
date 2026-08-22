import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseBotAction,
  playBotTurn,
  scoreAction,
  selectBotAction,
} from "../js/bot-player.js";
import { createDevelopmentGameState } from "../js/game-state.js";
import {
  advanceToNextPlayer,
  getTurnValidActions,
  startTurn,
} from "../js/turn-engine.js";

function createState(piecePositions = {}, botIds = ["A"]) {
  const state = createDevelopmentGameState();
  state.players.forEach((player) => {
    player.type = botIds.includes(player.id) ? "bot" : "human";
  });
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

test("Bot gets actions for only the active value and chooses a valid action", () => {
  const state = startTurn(createState({
    "A-P1": { location: "board", cellId: "A-4" },
  }), [5, 3]);
  const validActions = getTurnValidActions(state);
  const chosen = chooseBotAction(state, () => 0);

  assert.equal(chosen.dieValue, 5);
  assert.ok(validActions.some((action) => (
    action.type === chosen.type
      && action.pieceId === chosen.pieceId
      && action.dieValue === chosen.dieValue
      && action.destination === chosen.destination
  )));
});

test("Bot automatically rolls, plays every available value, and switches player", async () => {
  const events = [];
  const state = await playBotTurn(createState(), {
    dice: [6, 2],
    random: () => 0,
    onRoll: async () => events.push("roll"),
    onActionApplied: async (action) => events.push(action.dieValue),
    onPlayerChanged: async () => events.push("changed"),
  });

  assert.deepEqual(events, ["roll", 6, 2, "changed"]);
  assert.equal(state.currentPlayerId, "B");
  assert.equal(state.turn.dice, null);
});

test("a restored active Bot turn continues without rolling again", async () => {
  const activeState = startTurn(createState({
    "A-P1": { location: "board", cellId: "A-4" },
  }), [2, 1]);
  let rolls = 0;
  let actions = 0;
  const state = await playBotTurn(activeState, {
    onRoll: async () => { rolls += 1; },
    onActionApplied: async () => { actions += 1; },
  });

  assert.equal(rolls, 0);
  assert.equal(actions, 2);
  assert.equal(state.currentPlayerId, "B");
});

test("an inconsistent active value is burned safely instead of looping", async () => {
  const state = startTurn(createState({
    "A-P1": { location: "board", cellId: "A-4" },
  }), [2, 1]);
  Object.assign(state.pieces["A-P1"], { location: "outside", cellId: null });
  const violations = [];

  const result = await playBotTurn(state, {
    onInvariantViolation: (message) => violations.push(message),
  });

  assert.equal(violations.length, 1);
  assert.match(violations[0], /active value 2/);
  assert.equal(result.currentPlayerId, "B");
});

test("Human to Bot and Bot to Human lifecycle needs no Bot click", async () => {
  let state = startTurn(createState({}, ["B"]), [5, 3]);
  assert.equal(state.turn.finished, true);
  state = advanceToNextPlayer(state);
  assert.equal(state.currentPlayerId, "B");

  state = await playBotTurn(state, { dice: [5, 3] });
  assert.equal(state.currentPlayerId, "C");
  assert.equal(state.players.find(({ id }) => id === "C").type, "human");
});

test("consecutive Bots can complete turns without user input", async () => {
  let state = createState({}, ["A", "B"]);
  state = await playBotTurn(state, { dice: [5, 3] });
  assert.equal(state.currentPlayerId, "B");
  state = await playBotTurn(state, { dice: [6, 2], random: () => 0 });
  assert.equal(state.currentPlayerId, "C");
});

test("a winning action stops the Bot immediately and does not switch player", async () => {
  const state = createState({
    "A-P1": { location: "finished", cellId: "A-H-4", laps: 1 },
    "A-P2": { location: "finished", cellId: "A-H-3", laps: 1 },
    "A-P3": { location: "finished", cellId: "A-H-2", laps: 1 },
    "A-P4": { location: "board", cellId: "D-10", laps: 0 },
  });
  let actions = 0;
  const result = await playBotTurn(state, {
    dice: [3, 1],
    onActionApplied: async () => { actions += 1; },
  });

  assert.equal(actions, 1);
  assert.equal(result.status, "finished");
  assert.equal(result.winnerId, "A");
  assert.equal(result.currentPlayerId, "A");
});

test("winning score is higher than an ordinary move score", () => {
  const winningState = startTurn(createState({
    "A-P1": { location: "finished", cellId: "A-H-4", laps: 1 },
    "A-P2": { location: "finished", cellId: "A-H-3", laps: 1 },
    "A-P3": { location: "finished", cellId: "A-H-2", laps: 1 },
    "A-P4": { location: "board", cellId: "D-10", laps: 0 },
  }), [3, 1]);
  const ordinaryState = startTurn(createState({
    "A-P1": { location: "board", cellId: "A-4" },
  }), [3, 1]);

  assert.ok(
    scoreAction(winningState, actionFor(winningState, "A-P4"))
      > scoreAction(ordinaryState, actionFor(ordinaryState, "A-P1")),
  );
});

test("finishing HOME is preferred to an ordinary move", () => {
  const state = startTurn(createState({
    "A-P1": { location: "home", cellId: "A-H-3", laps: 1 },
    "A-P2": { location: "board", cellId: "A-4" },
  }), [1, 1]);

  assert.equal(chooseBotAction(state, () => 0).pieceId, "A-P1");
});

test("capture is preferred to an equivalent ordinary move", () => {
  const state = startTurn(createState({
    "A-P1": { location: "board", cellId: "A-4" },
    "A-P2": { location: "board", cellId: "B-4" },
    "B-P1": { location: "board", cellId: "A-6" },
  }), [2, 2]);

  assert.equal(chooseBotAction(state, () => 0).pieceId, "A-P1");
});

test("beneficial Rainbow progress is preferred to ordinary progress", () => {
  const state = startTurn(createState({
    "A-P1": { location: "board", cellId: "A-0" },
    "A-P2": { location: "board", cellId: "A-4" },
  }), [2, 2]);
  const chosen = chooseBotAction(state, () => 0);

  assert.equal(chosen.pieceId, "A-P1");
  assert.equal(chosen.destination, "A-10");
  assert.ok(chosen.effects.some(({ type }) => type === "teleport"));
});

test("equal best actions use the injected RNG", () => {
  const state = startTurn(createState({
    "A-P1": { location: "board", cellId: "A-4" },
    "A-P2": { location: "board", cellId: "B-4" },
  }), [1, 1]);
  const actions = getTurnValidActions(state);

  assert.equal(selectBotAction(state, actions, () => 0).pieceId, "A-P1");
  assert.equal(selectBotAction(state, actions, () => 0.999999).pieceId, "A-P2");
});

test("Bot can choose enter-board and release-from-sun actions", () => {
  const enterState = startTurn(createState(), [6, 2]);
  assert.equal(chooseBotAction(enterState, () => 0).type, "enter-board");

  const releaseState = startTurn(createState({
    "A-P1": { location: "sun", cellId: null },
    "A-P2": { location: "finished", cellId: "A-H-4", laps: 1 },
    "A-P3": { location: "finished", cellId: "A-H-3", laps: 1 },
    "A-P4": { location: "finished", cellId: "A-H-2", laps: 1 },
  }), [6, 2]);
  assert.equal(chooseBotAction(releaseState, () => 0).type, "release-from-sun");
});

test("Bot prefers a resolved Swamp exit and its capture effects", () => {
  const state = startTurn(createState({
    "A-P1": { location: "swamp", cellId: "A-3-Z" },
    "A-P2": { location: "board", cellId: "B-4" },
    "B-P1": { location: "board", cellId: "A-6" },
  }), [6, 2]);
  const chosen = chooseBotAction(state, () => 0);

  assert.equal(chosen.type, "swamp-move");
  assert.equal(chosen.destination, "A-6");
  assert.ok(chosen.effects.some(({ type }) => type === "capture"));
});

test("Bot can enter HOME and move deeper in HOME using resolved actions", () => {
  const enterState = startTurn(createState({
    "A-P1": { location: "board", cellId: "D-10", laps: 0 },
  }), [3, 1]);
  assert.equal(chooseBotAction(enterState, () => 0).destination, "A-H-1");

  const homeState = startTurn(createState({
    "A-P1": { location: "home", cellId: "A-H-1", laps: 1 },
  }), [2, 1]);
  assert.equal(chooseBotAction(homeState, () => 0).destination, "A-H-3");
});
