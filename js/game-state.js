import { createPendingTurn } from "./turn-engine.js";

export const PLAYER_COLORS = Object.freeze([
  Object.freeze({ id: "red", label: "Красный", value: "#d84f4b", side: "A" }),
  Object.freeze({ id: "yellow", label: "Жёлтый", value: "#d9a514", side: "B" }),
  Object.freeze({ id: "green", label: "Зелёный", value: "#398c57", side: "C" }),
  Object.freeze({ id: "blue", label: "Синий", value: "#477bc2", side: "D" }),
]);

const PLAYER_SIDE_LAYOUTS = Object.freeze({
  2: Object.freeze(["A", "C"]),
  3: Object.freeze(["A", "B", "C"]),
  4: Object.freeze(["A", "B", "C", "D"]),
});

export function getPlayerSides(playerCount) {
  const sides = PLAYER_SIDE_LAYOUTS[playerCount];
  if (!sides) throw new Error("A game requires 2 to 4 players.");
  return [...sides];
}

export function assignPlayerSides(players) {
  const sides = getPlayerSides(players.length);
  const humanIndexes = players
    .map(({ type }, index) => (type === "human" ? index : -1))
    .filter((index) => index !== -1);

  if (humanIndexes.length === 1) {
    const humanIndex = humanIndexes[0];
    const bottomSideIndex = sides.indexOf("C");
    [sides[humanIndex], sides[bottomSideIndex]] = [sides[bottomSideIndex], sides[humanIndex]];
  }

  return players.map((player, index) => ({ ...player, side: sides[index] }));
}

export function createClockwiseTurnOrder(players, firstPlayerId) {
  const clockwiseSides = PLAYER_COLORS.map(({ side }) => side);
  const clockwisePlayers = [...players].sort(
    (left, right) => clockwiseSides.indexOf(left.side) - clockwiseSides.indexOf(right.side),
  );
  const firstIndex = clockwisePlayers.findIndex(({ id }) => id === firstPlayerId);

  if (firstIndex === -1) throw new Error("First player must be present in the game.");

  return [
    ...clockwisePlayers.slice(firstIndex),
    ...clockwisePlayers.slice(0, firstIndex),
  ].map(({ id }) => id);
}

const PLAYER_CONFIGURATIONS = Object.freeze([
  Object.freeze({ id: "A", name: "Анна", type: "human", color: "#d84f4b", side: "A" }),
  Object.freeze({ id: "B", name: "Борис", type: "human", color: "#d9a514", side: "B" }),
  Object.freeze({ id: "C", name: "Саша", type: "human", color: "#398c57", side: "C" }),
  Object.freeze({ id: "D", name: "Дина", type: "human", color: "#477bc2", side: "D" }),
]);

// Temporary development fixture: edit these values to inspect piece rendering.
export const DEVELOPMENT_PIECE_POSITIONS = Object.freeze({
  "A-P1": Object.freeze({ location: "board", cellId: "A-5", laps: 0 }),
  "A-P2": Object.freeze({ location: "swamp", cellId: "A-3-Y", laps: 0 }),
  "A-P3": Object.freeze({ location: "home", cellId: "A-H-2", laps: 1 }),
  "A-P4": Object.freeze({ location: "outside", cellId: null, laps: 0 }),
  "B-P1": Object.freeze({ location: "sun", cellId: null, laps: 0 }),
  "B-P2": Object.freeze({ location: "finished", cellId: "B-H-4", laps: 1 }),
});

function createPiecesForPlayer(playerId, positions = {}) {
  return Array.from({ length: 4 }, (_, index) => {
    const id = `${playerId}-P${index + 1}`;
    return [
      id,
      {
        id,
        playerId,
        location: "outside",
        cellId: null,
        laps: 0,
        ...positions[id],
      },
    ];
  });
}

export function validateGameConfig(config) {
  const players = config?.players;
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) {
    return { valid: false, errors: ["A game requires 2 to 4 players."] };
  }

  const errors = [];
  const ids = new Set();
  const colors = new Set();
  const sides = new Set();
  const validColors = new Set(PLAYER_COLORS.map(({ value }) => value));
  const validSides = new Set(PLAYER_COLORS.map(({ side }) => side));

  players.forEach((player, index) => {
    if (!player?.id || ids.has(player.id)) errors.push(`Player ${index + 1} must have a unique id.`);
    if (!player?.name?.trim()) errors.push(`Player ${index + 1} must have a name.`);
    if (!['human', 'bot'].includes(player?.type)) errors.push(`Player ${index + 1} has an invalid type.`);
    if (!validColors.has(player?.color) || colors.has(player.color)) errors.push("Player colors must be valid and unique.");
    if (!validSides.has(player?.side) || sides.has(player.side)) errors.push("Player sides must be valid and unique.");
    ids.add(player?.id);
    colors.add(player?.color);
    sides.add(player?.side);
  });

  const turnOrder = config?.turnOrder;
  if (!Array.isArray(turnOrder)
    || turnOrder.length !== players.length
    || new Set(turnOrder).size !== players.length
    || turnOrder.some((id) => !ids.has(id))) {
    errors.push("turnOrder must contain every player exactly once.");
  }

  return { valid: errors.length === 0, errors };
}

export function createGame(config) {
  const validation = validateGameConfig(config);
  if (!validation.valid) throw new Error(validation.errors.join(" "));

  const players = config.players.map((configuration) => {
    const id = configuration.id;
    return {
      id,
      name: configuration.name.trim(),
      type: configuration.type,
      autoPlay: configuration.type === "human" && configuration.autoPlay === true,
      color: configuration.color,
      side: configuration.side,
      pieceIds: Array.from({ length: 4 }, (_, index) => `${id}-P${index + 1}`),
    };
  });

  return {
    version: 1,
    status: "playing",
    players,
    pieces: Object.fromEntries(players.flatMap(({ id }) => createPiecesForPlayer(id))),
    turnOrder: [...config.turnOrder],
    currentPlayerId: config.turnOrder[0],
    turn: createPendingTurn(),
    winnerId: null,
  };
}

export function createDevelopmentGameState() {
  const players = PLAYER_CONFIGURATIONS.map((configuration) => ({
    ...configuration,
    autoPlay: false,
    pieceIds: Array.from({ length: 4 }, (_, index) => `${configuration.id}-P${index + 1}`),
  }));

  return {
    version: 1,
    status: "playing",
    players,
    pieces: Object.fromEntries(players.flatMap(({ id }) => createPiecesForPlayer(id, DEVELOPMENT_PIECE_POSITIONS))),
    turnOrder: players.map(({ id }) => id),
    currentPlayerId: players[0].id,
    turn: createPendingTurn(),
    winnerId: null,
  };
}

export const gameState = createDevelopmentGameState();

export const DEVELOPMENT_SCENARIOS = Object.freeze([
  Object.freeze({
    id: "normal-move",
    label: "Обычный ход",
    dieValue: 2,
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "board", cellId: "A-5", laps: 0 }),
    }),
  }),
  Object.freeze({
    id: "multiple-pieces",
    label: "Несколько доступных фишек",
    dieValue: 2,
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "board", cellId: "A-5", laps: 0 }),
      "A-P2": Object.freeze({ location: "board", cellId: "B-4", laps: 0 }),
      "A-P3": Object.freeze({ location: "board", cellId: "C-11", laps: 0 }),
    }),
  }),
  Object.freeze({
    id: "friendly-block",
    label: "Блокировка своей фишкой",
    dieValue: 3,
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "board", cellId: "A-5", laps: 0 }),
      "A-P2": Object.freeze({ location: "board", cellId: "A-7", laps: 0 }),
    }),
  }),
  Object.freeze({
    id: "enemy-block",
    label: "Блокировка чужой фишкой",
    dieValue: 3,
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "board", cellId: "A-5", laps: 0 }),
      "B-P1": Object.freeze({ location: "board", cellId: "A-7", laps: 0 }),
    }),
  }),
  Object.freeze({
    id: "capture",
    label: "Съедание",
    dieValue: 3,
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "board", cellId: "A-5", laps: 0 }),
      "B-P1": Object.freeze({ location: "board", cellId: "A-8", laps: 0 }),
    }),
  }),
  Object.freeze({
    id: "side-crossing",
    label: "Переход между сторонами",
    dieValue: 2,
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "board", cellId: "A-11", laps: 0 }),
    }),
  }),
  Object.freeze({
    id: "six-alternatives",
    label: "6 — move / enter / release",
    dieValue: 6,
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "board", cellId: "B-0", laps: 0 }),
      "A-P2": Object.freeze({ location: "outside", cellId: null, laps: 0 }),
      "A-P3": Object.freeze({ location: "sun", cellId: null, laps: 0 }),
    }),
  }),
  Object.freeze({
    id: "rainbow-forward",
    label: "Радуга A-2 → A-10",
    dieValue: 2,
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "board", cellId: "A-0", laps: 0 }),
    }),
  }),
  Object.freeze({
    id: "rainbow-backward-capture",
    label: "Радуга A-10 → A-2 и съедание",
    dieValue: 2,
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "board", cellId: "A-8", laps: 0 }),
      "B-P1": Object.freeze({ location: "board", cellId: "A-2", laps: 0 }),
    }),
  }),
  Object.freeze({
    id: "rainbow-friendly-landing-block",
    label: "Радуга заблокирована своей фишкой",
    dieValue: 5,
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "board", cellId: "A-5", laps: 0 }),
      "A-P2": Object.freeze({ location: "board", cellId: "A-10", laps: 0 }),
    }),
  }),
  Object.freeze({
    id: "swamp-entry",
    label: "Вход в болото A",
    dieValue: 2,
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "board", cellId: "A-1", laps: 0 }),
    }),
  }),
  Object.freeze({
    id: "swamp-required-roll",
    label: "Болото Y + 3",
    dieValue: 3,
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "swamp", cellId: "A-3-Y", laps: 0 }),
    }),
  }),
  Object.freeze({
    id: "swamp-chain-capture",
    label: "Цепочка болота со съеданием",
    dieValue: 1,
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "swamp", cellId: "A-3-X", laps: 0 }),
      "B-P1": Object.freeze({ location: "swamp", cellId: "A-3-Y", laps: 0 }),
      "C-P1": Object.freeze({ location: "swamp", cellId: "A-3-Z", laps: 0 }),
      "D-P1": Object.freeze({ location: "board", cellId: "A-6", laps: 0 }),
    }),
  }),
  Object.freeze({
    id: "swamp-chain-blocked",
    label: "Цепочка болота заблокирована",
    dieValue: 1,
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "swamp", cellId: "A-3-X", laps: 0 }),
      "B-P1": Object.freeze({ location: "swamp", cellId: "A-3-Y", laps: 0 }),
      "C-P1": Object.freeze({ location: "swamp", cellId: "A-3-Z", laps: 0 }),
      "C-P2": Object.freeze({ location: "board", cellId: "A-6", laps: 0 }),
    }),
  }),
  Object.freeze({
    id: "home-entry",
    label: "Вход в HOME одним ходом",
    dieValue: 3,
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "board", cellId: "D-11", laps: 0 }),
    }),
  }),
  Object.freeze({
    id: "capture-before-home",
    label: "Съедание перед HOME — два игрока",
    dieValue: 2,
    currentPlayerId: "B",
    playerIds: Object.freeze(["A", "B"]),
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "board", cellId: "A-0", laps: 1 }),
      "B-P1": Object.freeze({ location: "board", cellId: "D-10", laps: 0 }),
    }),
  }),
  Object.freeze({
    id: "home-victory",
    label: "Заполнение HOME и победа",
    dieValue: 1,
    piecePositions: Object.freeze({
      "A-P1": Object.freeze({ location: "finished", cellId: "A-H-4", laps: 1 }),
      "A-P2": Object.freeze({ location: "finished", cellId: "A-H-3", laps: 1 }),
      "A-P3": Object.freeze({ location: "finished", cellId: "A-H-2", laps: 1 }),
      "A-P4": Object.freeze({ location: "board", cellId: "D-10", laps: 0 }),
    }),
  }),
]);

export function createDevelopmentScenarioState(scenarioId = DEVELOPMENT_SCENARIOS[0].id) {
  const scenario = DEVELOPMENT_SCENARIOS.find(({ id }) => id === scenarioId);
  if (!scenario) throw new Error(`Unknown development scenario: ${scenarioId}`);

  const state = createDevelopmentGameState();
  Object.values(state.pieces).forEach((piece) => {
    Object.assign(piece, { location: "outside", cellId: null, laps: 0 });
  });
  Object.entries(scenario.piecePositions).forEach(([pieceId, position]) => {
    Object.assign(state.pieces[pieceId], position);
  });
  state.currentPlayerId = scenario.currentPlayerId ?? state.currentPlayerId;

  return state;
}
