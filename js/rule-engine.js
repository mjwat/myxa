import { boardData } from "./board-data.js";

function getPlayer(state, playerId) {
  return state.players.find(({ id }) => id === playerId);
}

function getOccupant(state, cellId, excludedPieceId, location) {
  return Object.values(state.pieces).find(
    (piece) => piece.id !== excludedPieceId
      && (!location || piece.location === location)
      && piece.cellId === cellId,
  );
}

function getHomeRouteForCell(cellId) {
  return Object.values(boardData.homeRoutes).find((route) => route.includes(cellId));
}

function createCaptureEffect(occupant, movingPiece, includeByPieceId = false) {
  if (!occupant || occupant.playerId === movingPiece.playerId) return [];
  return [{
    type: "capture",
    pieceId: occupant.id,
    ...(includeByPieceId ? { byPieceId: movingPiece.id } : {}),
    destination: "sun",
  }];
}

function getRainbowTeleport(cellId) {
  const link = boardData.rainbowLinks.find(({ from, to }) => from === cellId || to === cellId);
  if (!link) return null;
  return { type: "teleport", from: cellId, to: link.from === cellId ? link.to : link.from };
}

function getSwampByEntrance(cellId) {
  return boardData.swamps.find(({ entrance }) => entrance === cellId);
}

function getSwampPosition(cellId) {
  for (const swamp of boardData.swamps) {
    const index = swamp.positions.findIndex(({ id }) => id === cellId);
    if (index !== -1) return { swamp, position: swamp.positions[index] };
  }
  return null;
}

function resolveSwampDestination(state, movingPiece, swamp, destination) {
  const effects = [];
  let pushedPiece = movingPiece;
  let nextCellId = destination;

  while (nextCellId !== swamp.exit) {
    const position = swamp.positions.find(({ id }) => id === nextCellId);
    if (!position) return null;

    const occupant = getOccupant(state, nextCellId, pushedPiece.id, "swamp");
    if (!occupant) return effects;

    effects.push({
      type: "push",
      pieceId: occupant.id,
      byPieceId: pushedPiece.id,
      from: nextCellId,
      to: position.destination,
    });
    pushedPiece = occupant;
    nextCellId = position.destination;
  }

  const exitOccupant = getOccupant(state, swamp.exit, pushedPiece.id, "board");
  if (exitOccupant?.playerId === pushedPiece.playerId) return null;

  return [...effects, ...createCaptureEffect(exitOccupant, pushedPiece, true)];
}

function getEnterBoardAction(state, player, piece, dieValue) {
  if (piece.location !== "outside" || dieValue !== 6) return null;

  const destination = `${player.side}-0`;
  const occupant = getOccupant(state, destination, piece.id, "board");
  if (occupant?.playerId === player.id) return null;

  return {
    type: "enter-board",
    pieceId: piece.id,
    dieValue,
    destination,
    path: [destination],
    effects: createCaptureEffect(occupant, piece),
  };
}

function getReleaseFromSunAction(piece, dieValue) {
  if (piece.location !== "sun" || dieValue !== 6) return null;

  return {
    type: "release-from-sun",
    pieceId: piece.id,
    dieValue,
    destination: "outside",
    path: [],
    effects: [],
  };
}

function buildNormalPath(player, piece, dieValue) {
  const homeRoute = boardData.homeRoutes[player.side];
  const ownStart = `${player.side}-0`;
  const path = [];
  let currentCellId = piece.cellId;
  let hasCompletedLap = piece.laps > 0;
  let completedLap = false;

  for (let step = 0; step < dieValue; step += 1) {
    const homeIndex = homeRoute.indexOf(currentCellId);
    if (homeIndex !== -1) {
      const nextHomeCell = homeRoute[homeIndex + 1];
      if (!nextHomeCell) return null;
      currentCellId = nextHomeCell;
      path.push(currentCellId);
      continue;
    }

    const mainIndex = boardData.mainRoute.indexOf(currentCellId);
    if (mainIndex === -1) return null;

    if (currentCellId === ownStart && hasCompletedLap) {
      currentCellId = homeRoute[0];
      path.push(currentCellId);
      continue;
    }

    currentCellId = boardData.mainRoute[(mainIndex + 1) % boardData.mainRoute.length];
    if (currentCellId === ownStart && !hasCompletedLap) {
      hasCompletedLap = true;
      completedLap = true;
    }
    path.push(currentCellId);
  }

  return { path, completedLap };
}

function createsFinishedPosition(state, player, piece, destination) {
  const homeRoute = boardData.homeRoutes[player.side];
  const destinationIndex = homeRoute.indexOf(destination);
  if (destinationIndex === -1) return false;

  return homeRoute.slice(destinationIndex + 1).every((cellId) => {
    const occupant = getOccupant(state, cellId, piece.id);
    return occupant?.playerId === player.id && occupant.location === "finished";
  });
}

function getMoveAction(state, player, piece, dieValue) {
  if (!["board", "home"].includes(piece.location)
    || !Number.isInteger(dieValue)
    || dieValue < 1
    || dieValue > 6) return null;

  const route = buildNormalPath(player, piece, dieValue);
  if (!route) return null;
  const { path, completedLap } = route;

  if (path.slice(0, -1).some((cellId) => getOccupant(state, cellId, piece.id))) return null;

  const landingCell = path.at(-1);
  const landingOccupant = getOccupant(state, landingCell, piece.id);
  if (landingOccupant?.playerId === player.id) return null;

  const homeRoute = boardData.homeRoutes[player.side];
  if (getHomeRouteForCell(landingCell)) {
    if (!homeRoute.includes(landingCell) || landingOccupant) return null;

    return {
      type: "move",
      pieceId: piece.id,
      dieValue,
      destination: landingCell,
      path,
      effects: [
        ...(completedLap ? [{ type: "lap-completed", pieceId: piece.id }] : []),
        ...(createsFinishedPosition(state, player, piece, landingCell)
          ? [{ type: "finish", pieceId: piece.id, destination: landingCell }]
          : []),
      ],
    };
  }

  const swamp = getSwampByEntrance(landingCell);
  if (swamp) {
    const destination = swamp.positions[0].id;
    const swampEffects = resolveSwampDestination(state, piece, swamp, destination);
    if (!swampEffects) return null;

    return {
      type: "move",
      pieceId: piece.id,
      dieValue,
      destination,
      path,
      effects: [
        ...(completedLap ? [{ type: "lap-completed", pieceId: piece.id }] : []),
        ...createCaptureEffect(landingOccupant, piece),
        { type: "enter-swamp", pieceId: piece.id, from: landingCell, to: destination },
        ...swampEffects,
      ],
    };
  }

  const teleport = getRainbowTeleport(landingCell);
  const destination = teleport?.to ?? landingCell;
  const destinationOccupant = teleport
    ? getOccupant(state, destination, piece.id, "board")
    : landingOccupant;
  if (destinationOccupant?.playerId === player.id) return null;

  return {
    type: "move",
    pieceId: piece.id,
    dieValue,
    destination,
    path,
    effects: [
      ...(completedLap ? [{ type: "lap-completed", pieceId: piece.id }] : []),
      ...(teleport ? createCaptureEffect(landingOccupant, piece) : []),
      ...(teleport ? [teleport] : []),
      ...createCaptureEffect(destinationOccupant, piece),
    ],
  };
}

function getSwampMoveAction(state, piece, dieValue) {
  if (piece.location !== "swamp") return null;

  const swampPosition = getSwampPosition(piece.cellId);
  if (!swampPosition || dieValue !== swampPosition.position.requiredValue) return null;

  const { swamp, position } = swampPosition;
  const effects = resolveSwampDestination(state, piece, swamp, position.destination);
  if (!effects) return null;

  return {
    type: "swamp-move",
    pieceId: piece.id,
    dieValue,
    destination: position.destination,
    path: [position.destination],
    effects,
  };
}

export function getValidActions(gameState, playerId, dieValue) {
  const player = getPlayer(gameState, playerId);
  if (!player || gameState.status !== "playing" || !Number.isInteger(dieValue) || dieValue < 1 || dieValue > 6) {
    return [];
  }

  return player.pieceIds.flatMap((pieceId) => {
    const piece = gameState.pieces[pieceId];
    if (!piece) return [];

    const action = getEnterBoardAction(gameState, player, piece, dieValue)
      ?? getReleaseFromSunAction(piece, dieValue)
      ?? getMoveAction(gameState, player, piece, dieValue)
      ?? getSwampMoveAction(gameState, piece, dieValue);
    return action ? [action] : [];
  });
}

function actionsMatch(left, right) {
  return left.type === right.type
    && left.pieceId === right.pieceId
    && left.dieValue === right.dieValue
    && left.destination === right.destination;
}

function setPiecePosition(piece, cellId) {
  piece.location = getSwampPosition(cellId)
    ? "swamp"
    : getHomeRouteForCell(cellId)
      ? "home"
      : "board";
  piece.cellId = cellId;
}

function hasPlayerWon(state, playerId) {
  const player = getPlayer(state, playerId);
  return player?.pieceIds.every((pieceId) => state.pieces[pieceId]?.location === "finished") ?? false;
}

export function applyAction(gameState, action) {
  const piece = gameState.pieces[action?.pieceId];
  const validAction = piece
    ? getValidActions(gameState, piece.playerId, action.dieValue).find((candidate) => actionsMatch(candidate, action))
    : null;

  if (!validAction) throw new Error("Cannot apply an action that is not valid for the current game state.");

  const nextPieces = Object.fromEntries(
    Object.entries(gameState.pieces).map(([pieceId, currentPiece]) => [pieceId, { ...currentPiece }]),
  );
  const movingPiece = nextPieces[validAction.pieceId];
  const previousLocation = movingPiece.location;
  const previousCellId = movingPiece.cellId;

  if (validAction.type === "release-from-sun") {
    movingPiece.location = "outside";
    movingPiece.cellId = null;
    movingPiece.laps = 0;
  } else {
    setPiecePosition(movingPiece, validAction.destination);
    if (validAction.type === "enter-board") movingPiece.laps = 0;
  }

  const teleport = validAction.effects.find(({ type }) => type === "teleport");
  const swampEntry = validAction.effects.find(({ type }) => type === "enter-swamp");
  const movementDestination = teleport?.from ?? swampEntry?.from ?? validAction.destination;
  const movementEventType = validAction.type === "enter-board"
    ? "piece-entered-board"
    : validAction.type === "release-from-sun"
      ? "piece-released-from-sun"
      : "piece-moved";
  const events = [{
    type: movementEventType,
    pieceId: movingPiece.id,
    from: ["board", "swamp"].includes(previousLocation) ? previousCellId : previousLocation,
    to: movementDestination,
    path: validAction.path,
  }];

  for (const effect of validAction.effects) {
    if (effect.type === "lap-completed") {
      movingPiece.laps = Math.max(movingPiece.laps, 1);
      events.push({ type: "lap-completed", pieceId: movingPiece.id });
      continue;
    }
    if (effect.type === "finish") {
      movingPiece.location = "finished";
      events.push({ type: "piece-finished", pieceId: movingPiece.id, destination: effect.destination });
      continue;
    }
    if (effect.type === "teleport") {
      events.push({ type: "teleported", pieceId: movingPiece.id, from: effect.from, to: effect.to });
      continue;
    }
    if (effect.type === "enter-swamp") {
      events.push({ type: "entered-swamp", pieceId: movingPiece.id, from: effect.from, to: effect.to });
      continue;
    }
    if (effect.type === "push") {
      const pushedPiece = nextPieces[effect.pieceId];
      setPiecePosition(pushedPiece, effect.to);
      events.push({
        type: "piece-pushed",
        pieceId: pushedPiece.id,
        byPieceId: effect.byPieceId,
        from: effect.from,
        to: effect.to,
        path: [effect.to],
      });
      continue;
    }
    if (effect.type !== "capture") continue;
    const capturedPiece = nextPieces[effect.pieceId];
    capturedPiece.location = "sun";
    capturedPiece.cellId = null;
    capturedPiece.laps = 0;
    events.push({
      type: "captured",
      pieceId: capturedPiece.id,
      byPieceId: effect.byPieceId ?? movingPiece.id,
      destination: "sun",
    });
  }

  let nextGameState = { ...gameState, pieces: nextPieces };
  if (getHomeRouteForCell(validAction.destination) && hasPlayerWon(nextGameState, movingPiece.playerId)) {
    nextGameState = {
      ...nextGameState,
      status: "finished",
      winnerId: movingPiece.playerId,
      ...(nextGameState.turn
        ? {
          turn: {
            ...nextGameState.turn,
            activeIndex: null,
            activeValue: null,
            remainingValues: [],
            finished: true,
          },
        }
        : {}),
    };
    events.push({ type: "player-won", playerId: movingPiece.playerId });
  }

  return { gameState: nextGameState, events };
}
