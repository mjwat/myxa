export const DISPLAY_MODES = Object.freeze({
  DEVELOPMENT: "development",
  PRODUCTION: "production",
});

export function getDisplayMode(search = "") {
  const params = new URLSearchParams(search);
  return params.get("mode") === "dev"
    ? DISPLAY_MODES.DEVELOPMENT
    : DISPLAY_MODES.PRODUCTION;
}

export function getCellDisplay(cellId, mode) {
  if (mode === DISPLAY_MODES.DEVELOPMENT) {
    return {
      label: cellId,
      title: cellId,
      ariaLabel: `Клетка ${cellId}`,
      isPlayerHint: false,
      isSideOriented: false,
    };
  }

  const homeMatch = cellId.match(/^[A-D]-H-([1-4])$/);
  if (homeMatch) {
    const letter = "HOME"[4 - Number(homeMatch[1])];

    return {
      label: letter,
      title: `Дом: буква ${letter}`,
      ariaLabel: `Клетка дома: буква ${letter}`,
      isPlayerHint: false,
      isSideOriented: true,
    };
  }

  let requiredValue = null;
  if (/-(?:0|6)$/.test(cellId)) requiredValue = 6;
  else if (/-3-Y$/.test(cellId)) requiredValue = 1;
  else if (/-3-Z$/.test(cellId)) requiredValue = 3;

  return {
    label: requiredValue === null ? "" : String(requiredValue),
    title: requiredValue === null ? "" : `Нужно выбросить ${requiredValue}`,
    ariaLabel: requiredValue === null
      ? "Игровая клетка"
      : `Игровая клетка: нужно выбросить ${requiredValue}`,
    isPlayerHint: requiredValue !== null,
    isSideOriented: requiredValue !== null,
  };
}

export function getPieceDisplay(piece, pieceNumber, playerName, mode) {
  if (mode === DISPLAY_MODES.DEVELOPMENT) {
    return {
      label: String(pieceNumber),
      title: `${piece.id}: ${piece.location}${piece.cellId ? ` (${piece.cellId})` : ""}`,
    };
  }

  return {
    label: "",
    title: `Фишка игрока ${playerName}`,
  };
}
