import { getTurnValidActions } from "./turn-engine.js";

const EQUIVALENT_PIECE_ACTION_TYPES = new Set(["enter-board", "release-from-sun"]);

function chooseAutomaticAction(actions) {
  if (actions.length === 1) return actions[0];
  const actionTypes = new Set(actions.map(({ type }) => type));
  if (actionTypes.size !== 1 || !EQUIVALENT_PIECE_ACTION_TYPES.has(actions[0]?.type)) return null;
  return actions[0];
}

export function getAutoHumanStep(gameState) {
  const player = gameState.players.find(({ id }) => id === gameState.currentPlayerId);
  if (gameState.status !== "playing" || player?.type !== "human" || player.autoPlay !== true) {
    return { type: "wait" };
  }

  if (!gameState.turn?.dice) return { type: "roll" };
  if (gameState.turn.finished) return { type: "wait" };

  const actions = getTurnValidActions(gameState);
  const action = chooseAutomaticAction(actions);
  return action
    ? { type: "action", action }
    : { type: "wait" };
}
