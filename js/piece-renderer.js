import { DISPLAY_MODES, getPieceDisplay } from "./display-mode.js";

function getPlayer(state, playerId) {
  return state.players.find(({ id }) => id === playerId);
}

function getCell(board, cellId) {
  return board.cells.find(({ id }) => id === cellId);
}

function placeElement(element, coordinates, layerSize) {
  element.style.left = `${((coordinates.column - 0.5) / layerSize) * 100}%`;
  element.style.top = `${((coordinates.row - 0.5) / layerSize) * 100}%`;
}

export function getPieceRenderCoordinates(piece, state, board) {
  if (piece.location === "outside") {
    const player = getPlayer(state, piece.playerId);
    const slotIndex = player.pieceIds.indexOf(piece.id);
    return board.pieceSlots.outside[player.side][slotIndex];
  }

  if (piece.location === "sun") {
    const sunPieces = Object.values(state.pieces).filter(({ location }) => location === "sun");
    return board.pieceSlots.sun[sunPieces.findIndex(({ id }) => id === piece.id)];
  }

  const cell = getCell(board, piece.cellId);
  return {
    row: cell.row + board.pieceLayer.boardOffset,
    column: cell.column + board.pieceLayer.boardOffset,
  };
}

function renderPiece(piece, state, board, validPieceIds, selectedPieceId, displayMode) {
  const player = getPlayer(state, piece.playerId);
  const coordinates = getPieceRenderCoordinates(piece, state, board);
  const pieceNumber = player.pieceIds.indexOf(piece.id) + 1;
  const display = getPieceDisplay(piece, pieceNumber, player.name, displayMode);
  const element = document.createElement("div");

  element.className = [
    "piece",
    `piece--${piece.location}`,
    validPieceIds.has(piece.id) ? "piece--valid-action" : "",
    selectedPieceId === piece.id ? "piece--selected" : "",
  ].filter(Boolean).join(" ");
  element.dataset.pieceId = piece.id;
  element.style.setProperty("--piece-color", player.color);
  placeElement(element, coordinates, board.pieceLayer.size);
  element.textContent = display.label;
  element.title = display.title;
  element.setAttribute("aria-label", display.title);
  if (validPieceIds.has(piece.id)) {
    element.setAttribute("role", "button");
    element.tabIndex = 0;
    element.setAttribute("aria-pressed", String(selectedPieceId === piece.id));
  }
  return element;
}

function renderOutsideSlots(layer, state, board) {
  state.players.forEach((player) => {
    board.pieceSlots.outside[player.side].forEach((coordinates) => {
      const slot = document.createElement("div");
      slot.className = "piece-slot";
      slot.style.setProperty("--slot-color", player.color);
      slot.setAttribute("aria-hidden", "true");
      placeElement(slot, coordinates, board.pieceLayer.size);
      layer.append(slot);
    });
  });
}

function renderPlayerNames(layer, state, board) {
  state.players.forEach((player) => {
    const slot = board.pieceSlots.playerNames[player.side];
    const isActive = player.id === state.currentPlayerId;
    const label = document.createElement("div");
    label.className = [
      "player-name",
      isActive ? "player-name--active" : "",
    ].filter(Boolean).join(" ");
    label.dataset.playerId = player.id;
    label.style.setProperty("--player-name-rotation", `${slot.rotation}deg`);

    const content = document.createElement("span");
    content.className = "player-name__content";
    const name = document.createElement("span");
    name.className = "player-name__name";
    name.textContent = player.name;
    content.append(name);

    if (isActive) {
      const turnIndicator = document.createElement("span");
      turnIndicator.className = "player-name__turn";
      turnIndicator.textContent = "Ходит";
      content.prepend(turnIndicator);
      label.setAttribute("aria-current", "true");
      label.setAttribute("aria-label", `Ходит ${player.name}`);
    }
    label.title = isActive ? `Ходит ${player.name}` : player.name;
    label.append(content);
    placeElement(label, slot, board.pieceLayer.size);
    layer.append(label);
  });
}

export function renderPieces(
  container,
  state,
  board,
  {
    validPieceIds = new Set(),
    selectedPieceId = null,
    displayMode = DISPLAY_MODES.DEVELOPMENT,
  } = {},
) {
  const layer = document.createElement("div");
  layer.className = "board__pieces";
  layer.style.setProperty("--piece-size", `${72 / board.pieceLayer.size}%`);
  layer.style.setProperty("--sun-piece-size", `${42 / board.pieceLayer.size}%`);
  layer.setAttribute("aria-label", "Фишки игроков");

  renderPlayerNames(layer, state, board);
  renderOutsideSlots(layer, state, board);
  Object.values(state.pieces).forEach((piece) => {
    layer.append(renderPiece(piece, state, board, validPieceIds, selectedPieceId, displayMode));
  });
  container.querySelector(".board__pieces")?.remove();
  container.append(layer);
}
