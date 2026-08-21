const BOARD_SIDES = Object.freeze(["A", "B", "C", "D"]);
export const UNOCCUPIED_SIDE_COLOR = "#a6aea9";

export function getBoardSideColors(players) {
  return Object.fromEntries(BOARD_SIDES.map((side) => {
    const player = players.find((candidate) => candidate.side === side);
    return [side, player?.color ?? UNOCCUPIED_SIDE_COLOR];
  }));
}

export function applyBoardPlayerColors(boardElement, players) {
  for (const [side, color] of Object.entries(getBoardSideColors(players))) {
    boardElement.style.setProperty(`--side-${side.toLowerCase()}-color`, color);
  }
}
