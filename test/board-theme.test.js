import test from "node:test";
import assert from "node:assert/strict";

import {
  UNOCCUPIED_SIDE_COLOR,
  applyBoardPlayerColors,
  getBoardSideColors,
} from "../js/board-theme.js";

test("board sides use the colors chosen by their players", () => {
  const colors = getBoardSideColors([
    { id: "player-1", side: "A", color: "#477bc2" },
    { id: "player-2", side: "C", color: "#d9a514" },
  ]);

  assert.deepEqual(colors, {
    A: "#477bc2",
    B: UNOCCUPIED_SIDE_COLOR,
    C: "#d9a514",
    D: UNOCCUPIED_SIDE_COLOR,
  });
});

test("applying board colors exposes one CSS variable per side", () => {
  const properties = new Map();
  const boardElement = {
    style: {
      setProperty(name, value) {
        properties.set(name, value);
      },
    },
  };

  applyBoardPlayerColors(boardElement, [
    { side: "B", color: "#398c57" },
    { side: "D", color: "#d84f4b" },
  ]);

  assert.equal(properties.get("--side-a-color"), UNOCCUPIED_SIDE_COLOR);
  assert.equal(properties.get("--side-b-color"), "#398c57");
  assert.equal(properties.get("--side-c-color"), UNOCCUPIED_SIDE_COLOR);
  assert.equal(properties.get("--side-d-color"), "#d84f4b");
});
