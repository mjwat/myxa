function isDieValue(value) {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

export function createFirstPlayerRoll(playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length < 2 || playerIds.length > 4
    || new Set(playerIds).size !== playerIds.length || playerIds.some((id) => !id)) {
    throw new Error("First-player roll requires 2 to 4 unique players.");
  }

  return {
    status: "rolling",
    playerIds: [...playerIds],
    round: 1,
    participants: [...playerIds],
    currentPlayerId: playerIds[0],
    results: {},
    history: [],
    winnerId: null,
  };
}

export function recordFirstPlayerRoll(state, playerId, value) {
  if (state?.status !== "rolling") throw new Error("The first-player roll is already complete.");
  if (playerId !== state.currentPlayerId) throw new Error("Only the current player may roll.");
  if (!isDieValue(value)) throw new Error("A roll must be a value from 1 to 6.");

  const results = { ...state.results, [playerId]: value };
  const currentIndex = state.participants.indexOf(playerId);
  if (currentIndex < state.participants.length - 1) {
    return { ...state, results, currentPlayerId: state.participants[currentIndex + 1] };
  }

  const maximum = Math.max(...Object.values(results));
  const tiedPlayerIds = state.participants.filter((id) => results[id] === maximum);
  const completedRound = { round: state.round, participants: [...state.participants], results };
  const history = [...state.history, completedRound];

  if (tiedPlayerIds.length === 1) {
    const winnerId = tiedPlayerIds[0];
    return {
      ...state,
      status: "complete",
      results,
      history,
      currentPlayerId: null,
      winnerId,
    };
  }

  return {
    ...state,
    round: state.round + 1,
    participants: tiedPlayerIds,
    currentPlayerId: tiedPlayerIds[0],
    results: {},
    history,
  };
}
