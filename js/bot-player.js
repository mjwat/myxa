import { boardData } from "./board-data.js";
import {
  advanceToNextPlayer,
  applyTurnAction,
  burnActiveValue,
  getTurnValidActions,
  rollDice,
  startTurn,
} from "./turn-engine.js";

const SCORE = Object.freeze({
  WIN: 100_000,
  FINISH: 20_000,
  ENTER_HOME: 5_000,
  HOME_STEP: 800,
  CAPTURE: 3_000,
  LEAVE_SWAMP: 2_000,
  SWAMP_STEP: 900,
  GOOD_RAINBOW: 1_500,
  BAD_RAINBOW: -1_000,
  ENTER_BOARD: 700,
  RELEASE_FROM_SUN: 300,
  ROUTE_STEP: 10,
});

function getPlayer(state, playerId) {
  return state.players.find(({ id }) => id === playerId);
}

function routeProgress(state, piece) {
  if (!piece?.cellId || piece.location !== "board") return null;
  const player = getPlayer(state, piece.playerId);
  const routeIndex = boardData.mainRoute.indexOf(piece.cellId);
  const startIndex = boardData.mainRoute.indexOf(`${player.side}-0`);
  if (routeIndex < 0 || startIndex < 0) return null;
  return piece.laps * boardData.mainRoute.length
    + (routeIndex - startIndex + boardData.mainRoute.length) % boardData.mainRoute.length;
}

function homeDepth(piece) {
  if (piece?.location === "finished") return 4;
  if (piece?.location !== "home") return 0;
  return Number(piece.cellId.split("-").at(-1));
}

export function scoreAction(gameState, action) {
  const before = gameState.pieces[action.pieceId];
  const result = applyTurnAction(gameState, action);
  const after = result.gameState.pieces[action.pieceId];
  const eventTypes = new Set(result.events.map(({ type }) => type));
  let score = 0;

  if (result.gameState.winnerId === before.playerId) score += SCORE.WIN;
  if (after.location === "finished" && before.location !== "finished") score += SCORE.FINISH;

  const beforeHomeDepth = homeDepth(before);
  const afterHomeDepth = homeDepth(after);
  if (afterHomeDepth > beforeHomeDepth) {
    if (beforeHomeDepth === 0) score += SCORE.ENTER_HOME;
    score += (afterHomeDepth - beforeHomeDepth) * SCORE.HOME_STEP;
  }

  score += result.events.filter(({ type }) => type === "captured").length * SCORE.CAPTURE;

  if (before.location === "swamp" && after.location !== "swamp") score += SCORE.LEAVE_SWAMP;
  else if (before.location === "swamp" && after.location === "swamp") score += SCORE.SWAMP_STEP;

  const beforeProgress = routeProgress(gameState, before);
  const afterProgress = routeProgress(result.gameState, after);
  if (beforeProgress !== null && afterProgress !== null) {
    const progress = afterProgress - beforeProgress;
    score += progress * SCORE.ROUTE_STEP;
    if (eventTypes.has("teleported")) {
      score += progress > 0 ? SCORE.GOOD_RAINBOW : SCORE.BAD_RAINBOW;
    }
  }

  if (action.type === "enter-board") score += SCORE.ENTER_BOARD;
  if (action.type === "release-from-sun") score += SCORE.RELEASE_FROM_SUN;
  return score;
}

export function selectBotAction(gameState, actions, random = Math.random) {
  if (actions.length === 0) return null;
  const scored = actions.map((action) => ({ action, score: scoreAction(gameState, action) }));
  const bestScore = Math.max(...scored.map(({ score }) => score));
  const bestActions = scored.filter(({ score }) => score === bestScore).map(({ action }) => action);
  const index = Math.min(bestActions.length - 1, Math.floor(random() * bestActions.length));
  return bestActions[index];
}

export function chooseBotAction(gameState, random = Math.random) {
  return selectBotAction(gameState, getTurnValidActions(gameState), random);
}

export async function playBotTurn(gameState, {
  random = Math.random,
  dice = rollDice(random),
  onRoll = async () => {},
  onTurnStarted = async () => {},
  onActionSelected = async () => {},
  onActionApplied = async () => {},
  onTurnFinished = async () => {},
  onPlayerChanged = async () => {},
  onInvariantViolation = (message) => console.error(message),
} = {}) {
  const player = getPlayer(gameState, gameState.currentPlayerId);
  if (gameState.status !== "playing" || player?.type !== "bot" || gameState.turn?.finished) {
    throw new Error("A Bot turn can only run for an active Bot player.");
  }

  let state = gameState;
  if (!state.turn?.dice) {
    await onRoll(dice, state);
    state = startTurn(state, dice);
    await onTurnStarted(state);
  }
  const actionLimit = state.turn.valueStates
    .filter(({ status }) => status === "active" || status === "pending")
    .length;
  let actionCount = 0;

  while (state.status === "playing" && !state.turn.finished && actionCount < actionLimit) {
    const actions = getTurnValidActions(state);
    const action = selectBotAction(state, actions, random);
    if (!action) {
      onInvariantViolation(`Bot ${player.id} has active value ${state.turn.activeValue} but no valid action.`);
      state = burnActiveValue(state);
      continue;
    }

    await onActionSelected(action, state);
    const result = applyTurnAction(state, action);
    state = result.gameState;
    actionCount += 1;
    await onActionApplied(action, result);
  }

  if (state.status === "playing" && !state.turn.finished) {
    throw new Error(`Bot turn exceeded its ${actionLimit}-action safety limit.`);
  }
  if (state.status !== "playing") return state;

  await onTurnFinished(state);
  state = advanceToNextPlayer(state);
  await onPlayerChanged(state);
  return state;
}
