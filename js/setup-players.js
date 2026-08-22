export function swapPlayerColor(players, playerIndex, nextColor, activePlayerCount) {
  const previousColor = players[playerIndex]?.color;
  if (!previousColor || previousColor === nextColor) return players;

  const ownerIndex = players
    .slice(0, activePlayerCount)
    .findIndex(({ color }) => color === nextColor);

  return players.map((player, index) => {
    if (index === playerIndex) return { ...player, color: nextColor };
    if (index === ownerIndex) return { ...player, color: previousColor };
    return player;
  });
}
