import test from "node:test";
import assert from "node:assert/strict";

import { boardData } from "../js/board-data.js";
import {
  DEVELOPMENT_SCENARIOS,
  createDevelopmentGameState,
  createDevelopmentScenarioState,
} from "../js/game-state.js";
import { getPieceRenderCoordinates } from "../js/piece-renderer.js";

test("development game state is serializable and contains four complete players", () => {
  const state = createDevelopmentGameState();
  const serializedState = JSON.parse(JSON.stringify(state));

  assert.deepEqual(serializedState, state);
  assert.equal(state.players.length, 4);
  assert.equal(Object.keys(state.pieces).length, 16);
  assert.deepEqual(state.turnOrder, ["A", "B", "C", "D"]);
  assert.equal(state.currentPlayerId, "A");

  state.players.forEach((player) => {
    assert.equal(player.pieceIds.length, 4);
    player.pieceIds.forEach((pieceId) => assert.equal(state.pieces[pieceId].playerId, player.id));
  });
});

test("development fixture covers every supported piece location", () => {
  const state = createDevelopmentGameState();
  const locations = new Set(Object.values(state.pieces).map(({ location }) => location));

  assert.deepEqual(locations, new Set(["outside", "board", "swamp", "home", "sun", "finished"]));
});

test("every piece position resolves from game state and board data", () => {
  const state = createDevelopmentGameState();

  Object.values(state.pieces).forEach((piece) => {
    const coordinates = getPieceRenderCoordinates(piece, state, boardData);
    assert.ok(coordinates, `${piece.id} must have render coordinates`);
    assert.equal(typeof coordinates.row, "number");
    assert.equal(typeof coordinates.column, "number");
  });
});

test("outside slots surround the board and sun slots stay inside the central circle", () => {
  const { outside, sun } = boardData.pieceSlots;
  const edge = boardData.pieceLayer.size;

  assert.ok(outside.A.every(({ row }) => row === 1));
  assert.ok(outside.B.every(({ column }) => column === edge));
  assert.ok(outside.C.every(({ row }) => row === edge));
  assert.ok(outside.D.every(({ column }) => column === 1));

  const sunCenter = boardData.pieceLayer.boardOffset + 7;
  sun.forEach(({ row, column }) => {
    assert.ok(Math.hypot(row - sunCenter, column - sunCenter) < 1);
  });
});

test("development scenarios keep declared positions and put unused pieces outside", () => {
  DEVELOPMENT_SCENARIOS.forEach((scenario) => {
    const state = createDevelopmentScenarioState(scenario.id);
    const declaredPieceIds = new Set(Object.keys(scenario.piecePositions));

    assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
    Object.entries(scenario.piecePositions).forEach(([pieceId, position]) => {
      assert.equal(state.pieces[pieceId].location, position.location);
      assert.equal(state.pieces[pieceId].cellId, position.cellId);
    });
    Object.values(state.pieces)
      .filter(({ id }) => !declaredPieceIds.has(id))
      .forEach((piece) => {
        assert.equal(piece.location, "outside");
        assert.equal(piece.cellId, null);
        assert.equal(piece.laps, 0);
      });
  });
});
