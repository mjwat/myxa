import test from "node:test";
import assert from "node:assert/strict";

import {
  PLAYER_COLORS,
  assignPlayerSides,
  createClockwiseTurnOrder,
  createGame,
  getPlayerSides,
  validateGameConfig,
} from "../js/game-state.js";

function players(count) {
  const sides = getPlayerSides(count);
  return PLAYER_COLORS.slice(0, count).map((color, index) => ({
    id: `player-${index + 1}`,
    name: `Player ${index + 1}`,
    type: index === 0 ? "human" : "bot",
    color: color.value,
    side: sides[index],
  }));
}

test("two players are assigned to opposite sides", () => {
  assert.deepEqual(getPlayerSides(2), ["A", "C"]);
  assert.deepEqual(createGame(config(2)).players.map(({ side }) => side), ["A", "C"]);
});

test("the only human player is assigned to the bottom side", () => {
  for (const count of [2, 3, 4]) {
    for (let humanIndex = 0; humanIndex < count; humanIndex += 1) {
      const configuredPlayers = players(count).map((player, index) => ({
        ...player,
        type: index === humanIndex ? "human" : "bot",
      }));
      const assignedPlayers = assignPlayerSides(configuredPlayers);

      assert.equal(assignedPlayers[humanIndex].side, "C");
      assert.equal(new Set(assignedPlayers.map(({ side }) => side)).size, count);
    }
  }
});

test("games with several human players keep the standard side layout", () => {
  const configuredPlayers = players(4).map((player, index) => ({
    ...player,
    type: index < 2 ? "human" : "bot",
  }));

  assert.deepEqual(assignPlayerSides(configuredPlayers).map(({ side }) => side), ["A", "B", "C", "D"]);
});

test("turns continue clockwise from the first player regardless of setup order", () => {
  const configuredPlayers = players(4).map((player, index) => ({
    ...player,
    type: index === 0 ? "human" : "bot",
  }));
  const assignedPlayers = assignPlayerSides(configuredPlayers);

  assert.deepEqual(assignedPlayers.map(({ side }) => side), ["C", "B", "A", "D"]);
  assert.deepEqual(
    createClockwiseTurnOrder(assignedPlayers, "player-1"),
    ["player-1", "player-4", "player-3", "player-2"],
  );
});

function config(count, firstIndex = 0) {
  const configuredPlayers = players(count);
  const ids = configuredPlayers.map(({ id }) => id);
  return {
    players: configuredPlayers,
    turnOrder: [...ids.slice(firstIndex), ...ids.slice(0, firstIndex)],
  };
}

for (const count of [2, 3, 4]) {
  test(`creates a canonical game for ${count} players with four pieces each`, () => {
    const game = createGame(config(count));

    assert.equal(game.players.length, count);
    assert.equal(Object.keys(game.pieces).length, count * 4);
    game.players.forEach((player) => {
      assert.equal(player.pieceIds.length, 4);
      player.pieceIds.forEach((pieceId) => assert.equal(game.pieces[pieceId].playerId, player.id));
    });
  });
}

test("duplicate colors are invalid", () => {
  const duplicate = config(2);
  duplicate.players[1].color = duplicate.players[0].color;

  assert.equal(validateGameConfig(duplicate).valid, false);
  assert.throws(() => createGame(duplicate), /colors/);
});

test("player sides must be unique", () => {
  const duplicate = config(3);
  duplicate.players[2].side = duplicate.players[0].side;

  assert.equal(validateGameConfig(duplicate).valid, false);
  assert.throws(() => createGame(duplicate), /sides/);
});

test("new game state starts with the requested first player and clean turn state", () => {
  const gameConfig = config(4, 2);
  const game = createGame(gameConfig);

  assert.deepEqual(game.turnOrder, ["player-3", "player-4", "player-1", "player-2"]);
  assert.equal(game.currentPlayerId, game.turnOrder[0]);
  assert.equal(game.status, "playing");
  assert.equal(game.winnerId, null);
  assert.equal(game.turn.dice, null);
  assert.equal(game.turn.activeValue, null);
  assert.equal(game.turn.finished, false);
  Object.values(game.pieces).forEach((piece) => {
    assert.equal(piece.location, "outside");
    assert.equal(piece.cellId, null);
    assert.equal(piece.laps, 0);
  });
});

test("canonical game state is independent from mutable setup input", () => {
  const gameConfig = config(2);
  const game = createGame(gameConfig);
  gameConfig.players[0].name = "Changed";
  gameConfig.turnOrder.reverse();

  assert.equal(game.players[0].name, "Player 1");
  assert.deepEqual(game.turnOrder, ["player-1", "player-2"]);
  assert.deepEqual(JSON.parse(JSON.stringify(game)), game);
});
