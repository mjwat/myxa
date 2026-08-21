const BOARD_SIZE = 13;
const PIECE_LAYER_SIZE = BOARD_SIZE + 2;
const BOARD_OFFSET = 1;
const SIDES = Object.freeze(["A", "B", "C", "D"]);

const freezeItems = (items) => Object.freeze(items.map((item) => Object.freeze(item)));

function createPerimeterCoordinates() {
  const coordinates = [];

  for (let column = 7; column <= BOARD_SIZE; column += 1) coordinates.push([1, column]);
  for (let row = 2; row <= BOARD_SIZE; row += 1) coordinates.push([row, BOARD_SIZE]);
  for (let column = BOARD_SIZE - 1; column >= 1; column -= 1) coordinates.push([BOARD_SIZE, column]);
  for (let row = BOARD_SIZE - 1; row >= 1; row -= 1) coordinates.push([row, 1]);
  for (let column = 2; column <= 6; column += 1) coordinates.push([1, column]);

  return coordinates;
}

function rotateClockwise([row, column], turns) {
  let result = [row, column];

  for (let turn = 0; turn < turns; turn += 1) {
    result = [result[1], BOARD_SIZE + 1 - result[0]];
  }

  return result;
}

const mainRoute = Object.freeze(
  SIDES.flatMap((side) => Array.from({ length: 12 }, (_, index) => `${side}-${index}`)),
);

const mainCells = freezeItems(
  createPerimeterCoordinates().map(([row, column], index) => ({
    id: mainRoute[index],
    type: "main",
    side: SIDES[Math.floor(index / 12)],
    row,
    column,
    isStart: index % 12 === 0,
  })),
);

const homeRoutes = Object.freeze(
  Object.fromEntries(
    SIDES.map((side) => [
      side,
      Object.freeze(Array.from({ length: 4 }, (_, index) => `${side}-H-${index + 1}`)),
    ]),
  ),
);

const homeCells = freezeItems(
  SIDES.flatMap((side, sideIndex) =>
    homeRoutes[side].map((id, index) => {
      const [row, column] = rotateClockwise([index + 2, 7], sideIndex);

      return { id, type: "home", side, row, column };
    }),
  ),
);

const rainbowLinks = freezeItems(
  SIDES.map((side) => ({
    side,
    from: `${side}-2`,
    to: `${side}-10`,
    bidirectional: true,
  })),
);

const swamps = freezeItems(
  SIDES.map((side, sideIndex) => ({
    side,
    entrance: `${side}-3`,
    positions: Object.freeze([
      Object.freeze({ id: `${side}-3-X`, requiredValue: 1, destination: `${side}-3-Y` }),
      Object.freeze({ id: `${side}-3-Y`, requiredValue: 3, destination: `${side}-3-Z` }),
      Object.freeze({ id: `${side}-3-Z`, requiredValue: 6, destination: `${side}-6` }),
    ]),
    exit: `${side}-6`,
    renderCoordinates: Object.freeze(
      [[2, 10], [2, 11], [2, 12]].map((coordinate) => Object.freeze(rotateClockwise(coordinate, sideIndex))),
    ),
  })),
);

const swampCells = freezeItems(
  swamps.flatMap((swamp) =>
    swamp.positions.map((position, index) => {
      const [row, column] = swamp.renderCoordinates[index];

      return {
        id: position.id,
        type: "swamp",
        side: swamp.side,
        row,
        column,
      };
    }),
  ),
);

const outsidePieceSlots = Object.freeze({
  A: freezeItems([6.5, 7.5, 8.5, 9.5].map((column) => ({ row: 1, column }))),
  B: freezeItems([6.5, 7.5, 8.5, 9.5].map((row) => ({ row, column: PIECE_LAYER_SIZE }))),
  C: freezeItems([9.5, 8.5, 7.5, 6.5].map((column) => ({ row: PIECE_LAYER_SIZE, column }))),
  D: freezeItems([9.5, 8.5, 7.5, 6.5].map((row) => ({ row, column: 1 }))),
});

const sunPieceSlots = freezeItems(
  Array.from({ length: 4 }, (_, rowIndex) =>
    Array.from({ length: 4 }, (_, columnIndex) => ({
      row: BOARD_OFFSET + 6.35 + rowIndex * 0.43,
      column: BOARD_OFFSET + 6.35 + columnIndex * 0.43,
    })),
  ).flat(),
);

const cells = freezeItems([...mainCells, ...homeCells, ...swampCells]);

export const boardData = Object.freeze({
  size: BOARD_SIZE,
  sides: SIDES,
  cells,
  mainRoute,
  homeRoutes,
  rainbowLinks,
  swamps,
  pieceLayer: Object.freeze({
    size: PIECE_LAYER_SIZE,
    boardOffset: BOARD_OFFSET,
  }),
  pieceSlots: Object.freeze({
    outside: outsidePieceSlots,
    sun: sunPieceSlots,
  }),
});

export function validateBoardData(board = boardData) {
  const errors = [];
  const cellIds = new Set(board.cells.map(({ id }) => id));
  const coordinates = new Set();

  if (board.size !== 13) errors.push("Board size must be 13.");
  if (board.pieceLayer.size !== board.size + 2 || board.pieceLayer.boardOffset !== 1) {
    errors.push("Piece layer must add one render row around the board.");
  }
  if (cellIds.size !== board.cells.length) errors.push("Cell IDs must be unique.");

  for (const cell of board.cells) {
    if (cell.row < 1 || cell.row > board.size || cell.column < 1 || cell.column > board.size) {
      errors.push(`${cell.id} is outside the ${board.size}x${board.size} grid.`);
    }

    const coordinateKey = `${cell.row}:${cell.column}`;
    if (coordinates.has(coordinateKey)) errors.push(`Multiple cells use coordinate ${coordinateKey}.`);
    coordinates.add(coordinateKey);
  }

  const expectedMainRoute = SIDES.flatMap((side) =>
    Array.from({ length: 12 }, (_, index) => `${side}-${index}`),
  );

  if (board.mainRoute.join("|") !== expectedMainRoute.join("|")) {
    errors.push("Main route does not follow A-0…D-11.");
  }

  for (const side of SIDES) {
    const expectedHome = Array.from({ length: 4 }, (_, index) => `${side}-H-${index + 1}`);
    if (board.homeRoutes[side]?.join("|") !== expectedHome.join("|")) {
      errors.push(`${side} HOME route is invalid.`);
    }

    const rainbow = board.rainbowLinks.find((link) => link.side === side);
    if (!rainbow || rainbow.from !== `${side}-2` || rainbow.to !== `${side}-10` || !rainbow.bidirectional) {
      errors.push(`${side} rainbow link is invalid.`);
    }

    const swamp = board.swamps.find((item) => item.side === side);
    const expectedSwamp = [
      [`${side}-3-X`, 1, `${side}-3-Y`],
      [`${side}-3-Y`, 3, `${side}-3-Z`],
      [`${side}-3-Z`, 6, `${side}-6`],
    ];

    if (!swamp || swamp.entrance !== `${side}-3` || swamp.exit !== `${side}-6`) {
      errors.push(`${side} swamp endpoints are invalid.`);
    } else {
      expectedSwamp.forEach(([id, requiredValue, destination], index) => {
        const position = swamp.positions[index];
        if (!position || position.id !== id || position.requiredValue !== requiredValue || position.destination !== destination) {
          errors.push(`${side} swamp position ${index + 1} is invalid.`);
        }
      });
    }

    if (board.pieceSlots.outside[side]?.length !== 4) {
      errors.push(`${side} must have four outside piece slots.`);
    }
  }

  if (board.pieceSlots.sun.length !== 16) errors.push("Sun must have sixteen piece slots.");

  const referencedIds = [
    ...board.mainRoute,
    ...Object.values(board.homeRoutes).flat(),
    ...board.rainbowLinks.flatMap(({ from, to }) => [from, to]),
    ...board.swamps.flatMap(({ entrance, exit, positions }) => [
      entrance,
      exit,
      ...positions.flatMap(({ id, destination }) => [id, destination]),
    ]),
  ];

  for (const id of referencedIds) {
    if (!cellIds.has(id)) errors.push(`Referenced cell ${id} does not exist.`);
  }

  if (errors.length > 0) throw new Error(`Invalid board data:\n${errors.join("\n")}`);
  return true;
}
