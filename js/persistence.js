export const SAVED_APP_STATE_KEY = "mukha.saved-app-state";
export const SAVED_APP_STATE_VERSION = 1;

const APP_PHASES = new Set(["setup", "first-player-roll", "game"]);

function isPlayerDraft(player) {
  return player
    && typeof player.id === "string"
    && typeof player.name === "string"
    && ["human", "bot"].includes(player.type)
    && typeof player.color === "string";
}

function isSetupState(setup) {
  return setup
    && Number.isInteger(setup.playerCount)
    && setup.playerCount >= 2
    && setup.playerCount <= 4
    && Array.isArray(setup.players)
    && setup.players.length === 4
    && setup.players.every(isPlayerDraft);
}

function isFirstPlayerRollState(state, playerIds) {
  return state
    && ["rolling", "complete"].includes(state.status)
    && Array.isArray(state.playerIds)
    && state.playerIds.length === playerIds.length
    && state.playerIds.every((id) => playerIds.includes(id))
    && Array.isArray(state.participants)
    && state.participants.every((id) => playerIds.includes(id))
    && typeof state.results === "object"
    && Array.isArray(state.history);
}

function isGameState(state) {
  if (!state
    || state.version !== 1
    || !["playing", "finished"].includes(state.status)
    || !Array.isArray(state.players)
    || state.players.length < 2
    || state.players.length > 4
    || !state.players.every(isPlayerDraft)
    || typeof state.pieces !== "object"
    || !Array.isArray(state.turnOrder)
    || !state.turn
    || typeof state.turn !== "object"
    || !Array.isArray(state.turn.sequence)
    || !Array.isArray(state.turn.valueStates)
    || !Array.isArray(state.turn.remainingValues)
    || typeof state.turn.finished !== "boolean") return false;

  const playerIds = state.players.map(({ id }) => id);
  if (new Set(playerIds).size !== playerIds.length
    || state.turnOrder.length !== playerIds.length
    || state.turnOrder.some((id) => !playerIds.includes(id))
    || !playerIds.includes(state.currentPlayerId)) return false;

  return state.players.every((player) => (
    Array.isArray(player.pieceIds)
    && player.pieceIds.length === 4
    && player.pieceIds.every((pieceId) => state.pieces[pieceId]?.playerId === player.id)
  ));
}

export function isSavedAppState(value) {
  if (!value
    || value.version !== SAVED_APP_STATE_VERSION
    || !APP_PHASES.has(value.phase)
    || !isSetupState(value.setup)) return false;

  if (value.phase === "setup") return true;
  if (value.phase === "game") return isGameState(value.gameState);

  const playerIds = value.pendingPlayers?.map(({ id }) => id) ?? [];
  return Array.isArray(value.pendingPlayers)
    && value.pendingPlayers.length >= 2
    && value.pendingPlayers.length <= 4
    && value.pendingPlayers.every(isPlayerDraft)
    && isFirstPlayerRollState(value.firstPlayerRollState, playerIds);
}

export function saveAppState(storage, state) {
  try {
    storage.setItem(SAVED_APP_STATE_KEY, JSON.stringify({
      ...state,
      version: SAVED_APP_STATE_VERSION,
    }));
    return true;
  } catch {
    return false;
  }
}

export function loadAppState(storage) {
  try {
    const serialized = storage.getItem(SAVED_APP_STATE_KEY);
    if (!serialized) return null;
    const state = JSON.parse(serialized);
    return isSavedAppState(state) ? state : null;
  } catch {
    return null;
  }
}
