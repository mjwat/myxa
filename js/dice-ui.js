const STATUS_LABELS = Object.freeze({
  "not-rolled": "не брошен",
  pending: "ожидает",
  active: "активен",
  used: "использован",
  burned: "сгорел",
});

function getPhysicalDice(turn) {
  if (!turn?.dice) {
    return [0, 1].map((index) => ({ id: index, value: null, status: "not-rolled" }));
  }

  const isDouble = turn.dice[0] === turn.dice[1];
  if (isDouble) {
    return turn.valueStates.map(({ value, status }, index) => ({ id: index, value, status }));
  }

  return turn.dice.map((value, index) => {
    const valueState = turn.valueStates.find((entry) => entry.value === value);
    return { id: index, value, status: valueState?.status ?? "pending" };
  });
}

export function getDiceViewModel(gameState) {
  const player = gameState.players.find(({ id }) => id === gameState.currentPlayerId);
  const turn = gameState.turn;
  return {
    player,
    dice: getPhysicalDice(turn).map((die) => ({
      ...die,
      statusLabel: STATUS_LABELS[die.status],
    })),
    activeValue: turn?.activeValue ?? null,
    canRoll: gameState.status === "playing"
      && player?.type === "human"
      && !turn?.dice,
  };
}
