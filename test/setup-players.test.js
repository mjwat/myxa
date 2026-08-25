import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PLAYER_NAMES, swapPlayerColor } from "../js/setup-players.js";

test("new games use Russian preset player names", () => {
  assert.deepEqual(DEFAULT_PLAYER_NAMES, ["Игрок 1", "Игрок 2", "Игрок 3", "Игрок 4"]);
});

const players = [
  { id: "one", color: "red" },
  { id: "two", color: "yellow" },
  { id: "three", color: "green" },
  { id: "four", color: "blue" },
];

test("choosing an occupied color swaps it with the selecting player's old color", () => {
  const result = swapPlayerColor(players, 0, "yellow", 2);

  assert.deepEqual(result.map(({ color }) => color), ["yellow", "red", "green", "blue"]);
  assert.deepEqual(players.map(({ color }) => color), ["red", "yellow", "green", "blue"]);
});

test("choosing the current color leaves setup unchanged", () => {
  assert.equal(swapPlayerColor(players, 0, "red", 2), players);
});

test("inactive players do not participate in a color swap", () => {
  const result = swapPlayerColor(players, 0, "green", 2);

  assert.deepEqual(result.map(({ color }) => color), ["green", "yellow", "green", "blue"]);
});
