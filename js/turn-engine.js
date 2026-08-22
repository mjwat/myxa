import { applyAction, getValidActions } from "./rule-engine.js";

const DIE_MIN = 1;
const DIE_MAX = 6;

function isDieValue(value) {
  return Number.isInteger(value) && value >= DIE_MIN && value <= DIE_MAX;
}

function actionsMatch(left, right) {
  return left.type === right.type
    && left.pieceId === right.pieceId
    && left.dieValue === right.dieValue
    && left.destination === right.destination;
}

function createSequence(dice) {
  return dice[0] === dice[1]
    ? Array(4).fill(dice[0])
    : [...dice].sort((left, right) => right - left);
}

function finishTurn(turn) {
  return {
    ...turn,
    activeIndex: null,
    activeValue: null,
    remainingValues: [],
    finished: true,
  };
}

function advanceToPlayableValue(gameState, turn) {
  const valueStates = turn.valueStates.map((entry) => ({ ...entry }));

  for (let index = 0; index < valueStates.length; index += 1) {
    if (valueStates[index].status !== "pending") continue;

    const value = valueStates[index].value;
    const actions = getValidActions(gameState, gameState.currentPlayerId, value);
    if (actions.length > 0) {
      valueStates[index].status = "active";
      return {
        ...gameState,
        turn: {
          ...turn,
          valueStates,
          activeIndex: index,
          activeValue: value,
          remainingValues: valueStates
            .filter(({ status }) => status === "active" || status === "pending")
            .map(({ value: remainingValue }) => remainingValue),
        },
      };
    }

    valueStates[index].status = "burned";
  }

  return { ...gameState, turn: finishTurn({ ...turn, valueStates }) };
}

export function createPendingTurn() {
  return {
    dice: null,
    sequence: [],
    valueStates: [],
    activeIndex: null,
    activeValue: null,
    remainingValues: [],
    finished: false,
  };
}

export function advanceToNextPlayer(gameState) {
  if (gameState.status !== "playing") return gameState;
  if (!gameState.turn?.finished) {
    throw new Error("Cannot switch players before the current turn has finished.");
  }

  const currentIndex = gameState.turnOrder.indexOf(gameState.currentPlayerId);
  if (currentIndex === -1 || gameState.turnOrder.length === 0) {
    throw new Error("The current player must be present in turnOrder.");
  }

  return {
    ...gameState,
    currentPlayerId: gameState.turnOrder[(currentIndex + 1) % gameState.turnOrder.length],
    turn: createPendingTurn(),
  };
}

export function rollDice(random = Math.random) {
  return [rollDie(random), rollDie(random)];
}

export function rollDie(random = Math.random) {
  return Math.floor(random() * DIE_MAX) + DIE_MIN;
}

export function startTurn(gameState, dice = rollDice()) {
  if (gameState.status !== "playing") throw new Error("Cannot start a turn after the game has finished.");
  if (gameState.turn?.dice && !gameState.turn.finished) {
    throw new Error("Cannot roll again before the current turn has finished.");
  }
  if (!Array.isArray(dice) || dice.length !== 2 || !dice.every(isDieValue)) {
    throw new Error("A turn must start with exactly two die values from 1 to 6.");
  }

  const rolledDice = [...dice];
  const sequence = createSequence(rolledDice);
  const stateWithTurn = {
    ...gameState,
    turn: {
      dice: rolledDice,
      sequence,
      valueStates: sequence.map((value) => ({ value, status: "pending" })),
      activeIndex: null,
      activeValue: null,
      remainingValues: [...sequence],
      finished: false,
    },
  };

  return advanceToPlayableValue(stateWithTurn, stateWithTurn.turn);
}

export function getTurnValidActions(gameState) {
  const { turn } = gameState;
  if (gameState.status !== "playing" || !turn || turn.finished || turn.activeValue === null) return [];

  const actions = getValidActions(gameState, gameState.currentPlayerId, turn.activeValue);
  const remainingValues = turn.valueStates
    .slice(turn.activeIndex + 1)
    .filter(({ status }) => status === "pending")
    .map(({ value }) => value);
  if (actions.length < 2 || remainingValues.length === 0) return actions;

  const scoredActions = actions.map((action) => ({
    action,
    futureActionCount: getMaximumPlayableActionCount(
      applyAction(gameState, action).gameState,
      gameState.currentPlayerId,
      remainingValues,
    ),
  }));
  const maximumFutureActionCount = Math.max(...scoredActions.map(({ futureActionCount }) => futureActionCount));

  return scoredActions
    .filter(({ futureActionCount }) => futureActionCount === maximumFutureActionCount)
    .map(({ action }) => action);
}

function getMaximumPlayableActionCount(gameState, playerId, remainingValues) {
  if (gameState.status !== "playing" || remainingValues.length === 0) return 0;

  const [value, ...laterValues] = remainingValues;
  const actions = getValidActions(gameState, playerId, value);
  if (actions.length === 0) return getMaximumPlayableActionCount(gameState, playerId, laterValues);

  return 1 + Math.max(...actions.map((action) => getMaximumPlayableActionCount(
    applyAction(gameState, action).gameState,
    playerId,
    laterValues,
  )));
}

export function burnActiveValue(gameState) {
  const { turn } = gameState;
  if (!turn || turn.finished || turn.activeIndex === null || turn.activeValue === null) {
    throw new Error("Cannot burn a value when no die value is active.");
  }
  if (getTurnValidActions(gameState).length > 0) {
    throw new Error("Cannot burn an active value while valid actions exist.");
  }

  const valueStates = turn.valueStates.map((entry, index) => (
    index === turn.activeIndex ? { ...entry, status: "burned" } : { ...entry }
  ));
  const stateWithBurnedValue = {
    ...gameState,
    turn: {
      ...turn,
      valueStates,
      activeIndex: null,
      activeValue: null,
      remainingValues: valueStates
        .filter(({ status }) => status === "pending")
        .map(({ value }) => value),
    },
  };

  return advanceToPlayableValue(stateWithBurnedValue, stateWithBurnedValue.turn);
}

export function getTurnActionSequencesForPiece(gameState, pieceId) {
  const remainingActionCount = gameState.turn.valueStates
    .filter(({ status }) => status === "active" || status === "pending")
    .length;
  const sequences = [];
  let previewState = gameState;
  const sequence = [];

  for (let index = 0; index < remainingActionCount; index += 1) {
    const action = getTurnValidActions(previewState).find((candidate) => candidate.pieceId === pieceId);
    if (!action) return sequences;

    sequence.push(action);
    sequences.push([...sequence]);
    previewState = applyTurnAction(previewState, action).gameState;
  }

  return sequences;
}

export function applyTurnAction(gameState, action) {
  const { turn } = gameState;
  if (!turn || turn.finished || turn.activeIndex === null || turn.activeValue === null) {
    throw new Error("Cannot apply an action when no die value is active.");
  }

  const validAction = getTurnValidActions(gameState).find((candidate) => actionsMatch(candidate, action));
  if (!validAction) throw new Error("The action is not valid for the active die value.");

  const valueStates = turn.valueStates.map((entry, index) => (
    index === turn.activeIndex ? { ...entry, status: "used" } : { ...entry }
  ));
  const stateWithConsumedValue = {
    ...gameState,
    turn: {
      ...turn,
      valueStates,
      activeIndex: null,
      activeValue: null,
      remainingValues: valueStates
        .filter(({ status }) => status === "pending")
        .map(({ value }) => value),
    },
  };

  const result = applyAction(stateWithConsumedValue, validAction);
  if (result.gameState.status === "finished") {
    return {
      ...result,
      gameState: {
        ...result.gameState,
        turn: finishTurn({ ...result.gameState.turn, valueStates }),
      },
      validActions: [],
    };
  }

  const nextGameState = advanceToPlayableValue(result.gameState, result.gameState.turn);
  return {
    ...result,
    gameState: nextGameState,
    validActions: getTurnValidActions(nextGameState),
  };
}
