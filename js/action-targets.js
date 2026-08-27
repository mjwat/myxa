function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

export function getActionSelectionCells(action) {
  const landingCell = action.path.at(-1) ?? action.destination;
  const automaticTransition = action.effects.find(
    ({ type }) => type === "teleport" || type === "enter-swamp",
  );

  return unique([landingCell, automaticTransition?.to]);
}

export function getSequenceSelectionCells(sequence) {
  return getActionSelectionCells(sequence.at(-1));
}

export function getSequenceBadgeCell(sequence) {
  return getActionSelectionCells(sequence.at(-1))[0];
}

export function getSequenceRainbowTransition(sequence) {
  return sequence.at(-1).effects.find(({ type }) => type === "teleport") ?? null;
}

export function getSequenceBadge(
  sequence,
  dice,
  completedWithSelectedPiece = 0,
  { showSingleDoubleValue = false } = {},
) {
  const isDouble = dice?.length === 2 && dice[0] === dice[1];
  const selectedPieceActionCount = completedWithSelectedPiece + sequence.length;
  if (isDouble) {
    if (selectedPieceActionCount > 1) {
      return { type: "multiplier", label: `×${selectedPieceActionCount}` };
    }
    return showSingleDoubleValue
      ? { type: "dice", values: [sequence[0].dieValue] }
      : null;
  }

  return {
    type: "dice",
    values: sequence.map(({ dieValue }) => dieValue),
  };
}
