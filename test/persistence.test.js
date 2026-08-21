import test from "node:test";
import assert from "node:assert/strict";

import { PLAYER_COLORS, createGame, getPlayerSides } from "../js/game-state.js";
import { createFirstPlayerRoll, recordFirstPlayerRoll } from "../js/first-player-roll.js";
import {
  SAVED_APP_STATE_KEY,
  loadAppState,
  saveAppState,
} from "../js/persistence.js";

function createStorage(initialValue) {
  const values = new Map(initialValue ? [[SAVED_APP_STATE_KEY, initialValue]] : []);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function setupPlayers(count = 4) {
  const sides = getPlayerSides(count);
  return PLAYER_COLORS.map((color, index) => ({
    id: `player-${index + 1}`,
    name: index === 0 ? "Маша" : `Player ${index + 1}`,
    type: "human",
    color: color.value,
    ...(index < count ? { side: sides[index] } : {}),
  }));
}

test("setup draft restores player count and entered names", () => {
  const storage = createStorage();
  const draftPlayers = setupPlayers();
  const saved = {
    phase: "setup",
    setup: { playerCount: 3, players: draftPlayers },
  };

  assert.equal(saveAppState(storage, saved), true);
  assert.deepEqual(loadAppState(storage), { version: 1, ...saved });
  assert.equal(loadAppState(storage).setup.players[0].name, "Маша");
});

test("an active game round-trips as serializable state", () => {
  const storage = createStorage();
  const draftPlayers = setupPlayers(2);
  const activePlayers = draftPlayers.slice(0, 2);
  const gameState = createGame({
    players: activePlayers,
    turnOrder: activePlayers.map(({ id }) => id),
  });
  const saved = {
    phase: "game",
    setup: { playerCount: 2, players: draftPlayers },
    gameState,
  };

  saveAppState(storage, saved);
  assert.deepEqual(loadAppState(storage), { version: 1, ...saved });
});

test("first-player roll can be restored before the game begins", () => {
  const storage = createStorage();
  const draftPlayers = setupPlayers(2);
  const pendingPlayers = draftPlayers.slice(0, 2);
  const saved = {
    phase: "first-player-roll",
    setup: { playerCount: 2, players: draftPlayers },
    pendingPlayers,
    firstPlayerRollState: createFirstPlayerRoll(pendingPlayers.map(({ id }) => id)),
  };

  saveAppState(storage, saved);
  assert.deepEqual(loadAppState(storage), { version: 1, ...saved });
});

test("a completed first-player roll remains available for game creation after reload", () => {
  const storage = createStorage();
  const draftPlayers = setupPlayers(2);
  const pendingPlayers = draftPlayers.slice(0, 2);
  let firstPlayerRollState = createFirstPlayerRoll(pendingPlayers.map(({ id }) => id));
  firstPlayerRollState = recordFirstPlayerRoll(firstPlayerRollState, "player-1", 2);
  firstPlayerRollState = recordFirstPlayerRoll(firstPlayerRollState, "player-2", 5);
  const saved = {
    phase: "first-player-roll",
    setup: { playerCount: 2, players: draftPlayers },
    pendingPlayers,
    firstPlayerRollState,
  };

  saveAppState(storage, saved);
  assert.equal(loadAppState(storage).firstPlayerRollState.status, "complete");
  assert.deepEqual(loadAppState(storage).firstPlayerRollState.turnOrder, ["player-2", "player-1"]);
});

test("invalid and incompatible saved data is ignored", () => {
  assert.equal(loadAppState(createStorage("not json")), null);
  assert.equal(loadAppState(createStorage(JSON.stringify({ version: 99 }))), null);
});

test("storage failures do not break the app", () => {
  const storage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };

  assert.equal(loadAppState(storage), null);
  assert.equal(saveAppState(storage, {}), false);
});
