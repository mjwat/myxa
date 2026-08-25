import test from "node:test";
import assert from "node:assert/strict";

import {
  getActionSelectionCells,
  getSequenceBadge,
  getSequenceBadgeCell,
  getSequenceRainbowTransition,
  getSequenceSelectionCells,
} from "../js/action-targets.js";

test("a Rainbow action exposes its landing and exit cells", () => {
  const action = {
    destination: "A-10",
    path: ["A-1", "A-2"],
    effects: [{ type: "teleport", from: "A-2", to: "A-10" }],
  };

  assert.deepEqual(getActionSelectionCells(action), ["A-2", "A-10"]);
  assert.equal(getSequenceBadgeCell([action]), "A-2");
  assert.deepEqual(getSequenceRainbowTransition([action]), {
    type: "teleport",
    from: "A-2",
    to: "A-10",
  });
});

test("a swamp-entry action exposes its entrance and first swamp cell", () => {
  const action = {
    destination: "B-3-X",
    path: ["B-2", "B-3"],
    effects: [{ type: "enter-swamp", pieceId: "A-P1", from: "B-3", to: "B-3-X" }],
  };

  assert.deepEqual(getSequenceSelectionCells([action]), ["B-3", "B-3-X"]);
  assert.equal(getSequenceBadgeCell([action]), "B-3");
  assert.equal(getSequenceRainbowTransition([action]), null);
});

test("an ordinary action keeps one selection cell", () => {
  const action = {
    destination: "C-7",
    path: ["C-6", "C-7"],
    effects: [],
  };

  assert.deepEqual(getActionSelectionCells(action), ["C-7"]);
  assert.equal(getSequenceBadgeCell([action]), "C-7");
});

test("ordinary rolls label destinations with the die values used by the sequence", () => {
  const actions = [{ dieValue: 5 }, { dieValue: 3 }];

  assert.deepEqual(getSequenceBadge(actions.slice(0, 1), [5, 3]), {
    type: "dice",
    values: [5],
  });
  assert.deepEqual(getSequenceBadge(actions, [5, 3]), {
    type: "dice",
    values: [5, 3],
  });
});

test("double rolls keep multiplier labels only for multi-action destinations", () => {
  const actions = Array.from({ length: 4 }, () => ({ dieValue: 3 }));

  assert.equal(getSequenceBadge(actions.slice(0, 1), [3, 3]), null);
  assert.deepEqual(getSequenceBadge(actions.slice(0, 2), [3, 3]), {
    type: "multiplier",
    label: "×2",
  });
  assert.deepEqual(getSequenceBadge(actions, [3, 3]), {
    type: "multiplier",
    label: "×4",
  });
});

test("double labels continue from actions already made with the selected piece", () => {
  const remainingActions = [{ dieValue: 3 }, { dieValue: 3 }];

  assert.deepEqual(getSequenceBadge(remainingActions.slice(0, 1), [3, 3], 1), {
    type: "multiplier",
    label: "×2",
  });
  assert.deepEqual(getSequenceBadge(remainingActions, [3, 3], 1), {
    type: "multiplier",
    label: "×3",
  });
});
