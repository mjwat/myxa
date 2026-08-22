import test from "node:test";
import assert from "node:assert/strict";

import { boardData, validateBoardData } from "../js/board-data.js";

test("board data matches the technical model", () => {
  assert.equal(validateBoardData(), true);
  assert.equal(boardData.size, 13);
  assert.equal(boardData.mainRoute.length, 48);
  assert.equal(Object.values(boardData.homeRoutes).flat().length, 16);
  assert.equal(boardData.rainbowLinks.length, 4);
  assert.equal(boardData.swamps.length, 4);
  assert.equal(boardData.cells.length, 76);
});

test("every playable cell has a unique id and render coordinate", () => {
  const ids = boardData.cells.map(({ id }) => id);
  const coordinates = boardData.cells.map(({ row, column }) => `${row}:${column}`);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(coordinates).size, coordinates.length);
});

test("player names have slots before their outside pieces", () => {
  const { playerNames } = boardData.pieceSlots;
  const edge = boardData.pieceLayer.size;

  assert.deepEqual(playerNames.A, { row: 1, column: 11.25, rotation: 180 });
  assert.deepEqual(playerNames.B, { row: 11.25, column: edge, rotation: -90 });
  assert.deepEqual(playerNames.C, { row: edge, column: 5.25, rotation: 0 });
  assert.deepEqual(playerNames.D, { row: 4.75, column: 1, rotation: 90 });
});
