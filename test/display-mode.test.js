import test from "node:test";
import assert from "node:assert/strict";

import {
  DISPLAY_MODES,
  getCellDisplay,
  getDisplayMode,
  getPieceDisplay,
} from "../js/display-mode.js";

test("production is the default display mode and dev is explicit", () => {
  assert.equal(getDisplayMode(), DISPLAY_MODES.PRODUCTION);
  assert.equal(getDisplayMode("?mode=prod"), DISPLAY_MODES.PRODUCTION);
  assert.equal(getDisplayMode("?mode=dev"), DISPLAY_MODES.DEVELOPMENT);
});

test("development mode displays technical cell ids", () => {
  assert.equal(getCellDisplay("A-0", DISPLAY_MODES.DEVELOPMENT).label, "A-0");
  assert.equal(getCellDisplay("C-3-Y", DISPLAY_MODES.DEVELOPMENT).label, "C-3-Y");
});

test("production mode displays player-facing die hints", () => {
  const expectedHints = new Map([
    ["A-0", "6"],
    ["B-6", "6"],
    ["C-3-Y", "1"],
    ["D-3-Z", "3"],
  ]);

  for (const [cellId, label] of expectedHints) {
    assert.equal(getCellDisplay(cellId, DISPLAY_MODES.PRODUCTION).label, label);
  }

  for (const cellId of ["A-1", "B-3-X", "D-11"]) {
    assert.equal(getCellDisplay(cellId, DISPLAY_MODES.PRODUCTION).label, "");
  }
});

test("production mode spells HOME from the center outward on every side", () => {
  for (const side of ["A", "B", "C", "D"]) {
    assert.deepEqual(
      [4, 3, 2, 1].map((position) => (
        getCellDisplay(`${side}-H-${position}`, DISPLAY_MODES.PRODUCTION).label
      )),
      ["H", "O", "M", "E"],
    );

    assert.equal(
      getCellDisplay(`${side}-H-4`, DISPLAY_MODES.PRODUCTION).isSideOriented,
      true,
    );
  }
});

test("piece numbers and technical details are visible only in development", () => {
  const piece = { id: "A-P2", location: "board", cellId: "B-4" };

  assert.deepEqual(
    getPieceDisplay(piece, 2, "Player 1", DISPLAY_MODES.DEVELOPMENT),
    { label: "2", title: "A-P2: board (B-4)" },
  );
  assert.deepEqual(
    getPieceDisplay(piece, 2, "Player 1", DISPLAY_MODES.PRODUCTION),
    { label: "", title: "Фишка игрока Player 1" },
  );
});
