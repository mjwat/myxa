import { boardData, validateBoardData } from "./board-data.js";
import {
  DEVELOPMENT_SCENARIOS,
  PLAYER_COLORS,
  createGame,
  createDevelopmentScenarioState,
  getPlayerSides,
  validateGameConfig,
} from "./game-state.js";
import {
  createFirstPlayerRoll,
  recordFirstPlayerRoll,
} from "./first-player-roll.js";
import { getPieceRenderCoordinates, renderPieces } from "./piece-renderer.js";
import {
  advanceToNextPlayer,
  applyTurnAction,
  createPendingTurn,
  getTurnActionSequencesForPiece,
  getTurnValidActions,
  rollDie,
  rollDice,
  startTurn,
} from "./turn-engine.js";
import { getDiceViewModel } from "./dice-ui.js";
import {
  DISPLAY_MODES,
  getCellDisplay,
  getDisplayMode,
} from "./display-mode.js";
import { loadAppState, saveAppState } from "./persistence.js";
import { applyBoardPlayerColors } from "./board-theme.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SWAMP_PUSH_ANIMATION_DURATION = 300;
const CELL_STEP_ANIMATION_DURATION = 190;
const DIE_ACTION_PAUSE = 90;
const DICE_ROLL_FRAME_DURATION = 70;
const DICE_ROLL_FRAME_COUNT = 8;
const BOT_FIRST_ROLL_DELAY = 650;
const displayMode = getDisplayMode(window.location.search);

function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }

  return element;
}

function getCell(board, id) {
  return board.cells.find((cell) => cell.id === id);
}

function centerOf(cell) {
  return { x: cell.column - 0.5, y: cell.row - 0.5 };
}

function getRainbowCurve(board, fromCellId, toCellId) {
  const from = centerOf(getCell(board, fromCellId));
  const to = centerOf(getCell(board, toCellId));
  const boardCenter = board.size / 2;
  const midpoint = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  };
  const bend = {
    x: midpoint.x + (boardCenter - midpoint.x) * 0.66,
    y: midpoint.y + (boardCenter - midpoint.y) * 0.66,
  };

  return { from, bend, to };
}

function pointOnQuadraticCurve({ from, bend, to }, progress) {
  const remaining = 1 - progress;
  return {
    x: remaining ** 2 * from.x + 2 * remaining * progress * bend.x + progress ** 2 * to.x,
    y: remaining ** 2 * from.y + 2 * remaining * progress * bend.y + progress ** 2 * to.y,
  };
}

function renderRainbow(svg, board, link) {
  const { from, bend, to } = getRainbowCurve(board, link.from, link.to);
  const colors = ["#e95f68", "#f2b83f", "#63ad78", "#6288c8"];

  colors.forEach((color, index) => {
    const path = createSvgElement("path", {
      d: `M ${from.x} ${from.y} Q ${bend.x} ${bend.y} ${to.x} ${to.y}`,
      fill: "none",
      stroke: color,
      "stroke-width": 0.5 - index * 0.09,
      "stroke-linecap": "round",
      opacity: 0.95,
    });
    svg.append(path);
  });
}

function renderSwampRoute(svg, board, swamp) {
  const ids = [swamp.entrance, ...swamp.positions.map(({ id }) => id), swamp.exit];
  const points = ids.map((id) => centerOf(getCell(board, id)));
  const polyline = createSvgElement("polyline", {
    points: points.map(({ x, y }) => `${x},${y}`).join(" "),
    fill: "none",
    stroke: "#557b50",
    "stroke-width": 0.16,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-dasharray": "0.18 0.14",
    opacity: 0.8,
  });
  svg.append(polyline);
}

function renderConnections(board) {
  const svg = createSvgElement("svg", {
    class: "board__connections",
    viewBox: `0 0 ${board.size} ${board.size}`,
    "aria-hidden": "true",
  });

  board.rainbowLinks.forEach((link) => renderRainbow(svg, board, link));
  board.swamps.forEach((swamp) => renderSwampRoute(svg, board, swamp));
  return svg;
}

function renderCell(cell, board) {
  const element = document.createElement("div");
  const label = document.createElement("span");
  const display = getCellDisplay(cell.id, displayMode);
  const isRainbowEndpoint = board.rainbowLinks.some(
    ({ from, to }) => cell.id === from || cell.id === to,
  );

  element.className = [
    "cell",
    `cell--${cell.type}`,
    `cell--side-${cell.side.toLowerCase()}`,
    cell.isStart ? "cell--start" : "",
    isRainbowEndpoint ? "cell--rainbow" : "",
    display.isPlayerHint ? "cell--player-hint" : "",
  ].filter(Boolean).join(" ");
  element.style.gridRow = cell.row;
  element.style.gridColumn = cell.column;
  label.className = "cell__label";
  label.textContent = display.label;
  element.append(label);
  element.title = display.title;
  element.dataset.cellId = cell.id;
  element.dataset.baseTitle = display.title;
  element.setAttribute("aria-label", display.ariaLabel);
  return element;
}

function renderBoard(container, board) {
  const fragment = document.createDocumentFragment();
  const sun = document.createElement("div");

  sun.className = "board__sun";
  sun.setAttribute("aria-label", "Солнышко — центральная область");

  fragment.append(renderConnections(board), sun);
  board.cells.forEach((cell) => fragment.append(renderCell(cell, board)));
  container.replaceChildren(fragment);
}

validateBoardData();
document.documentElement.dataset.displayMode = displayMode;
const boardElement = document.querySelector("#board");
const boardStageElement = document.querySelector("#board-stage");
renderBoard(boardElement, boardData);

const setupScreenElement = document.querySelector("#setup-screen");
const firstRollScreenElement = document.querySelector("#first-roll-screen");
const gameScreenElement = document.querySelector("#game-screen");
const setupFormElement = document.querySelector("#setup-form");
const playerSettingsElement = document.querySelector("#player-settings");
const setupErrorElement = document.querySelector("#setup-error");
const startGameElement = document.querySelector("#start-game");
const firstRollStatusElement = document.querySelector("#first-roll-status");
const firstRollDieElement = document.querySelector("#first-roll-die");
const firstRollResultsElement = document.querySelector("#first-roll-results");
const newGameElement = document.querySelector("#new-game");
const debugScenarioElement = document.querySelector("#debug-scenario");
const debugPlayerElement = document.querySelector("#debug-player");
const debugDieOneElement = document.querySelector("#debug-die-one");
const debugDieTwoElement = document.querySelector("#debug-die-two");
const debugStartTurnElement = document.querySelector("#debug-start-turn");
const rollDiceElement = document.querySelector("#roll-dice");
const dicePanelElement = document.querySelector("#dice-panel");
const physicalDiceElement = rollDiceElement;
const currentPlayerNameElement = document.querySelector("#current-player-name");
const currentPlayerColorElement = document.querySelector("#current-player-color");
const turnStatusElement = document.querySelector("#turn-status");
const victoryOverlayElement = document.querySelector("#victory-overlay");
const debugOutputElement = document.querySelector("#debug-output");
const debugPanelElement = document.querySelector(".rule-debug");
debugPanelElement.hidden = displayMode !== DISPLAY_MODES.DEVELOPMENT;
let currentGameState;
let validActions = [];
let selectedPieceId = null;
let isAnimating = false;
let isRolling = false;
let rollingDiceValues = null;
let appPhase = "setup";
let setupPlayerCount = 2;
let setupPlayers = PLAYER_COLORS.map((color, index) => ({
  id: `player-${index + 1}`,
  name: `Player ${index + 1}`,
  type: "human",
  color: color.value,
}));
let pendingPlayers = [];
let firstPlayerRollState = null;
let isFirstRollRolling = false;
let flowGeneration = 0;

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function createSavedState() {
  const state = {
    phase: appPhase,
    setup: {
      playerCount: setupPlayerCount,
      players: setupPlayers,
    },
  };

  if (appPhase === "first-player-roll") {
    state.pendingPlayers = pendingPlayers;
    state.firstPlayerRollState = firstPlayerRollState;
  } else if (appPhase === "game") {
    state.gameState = currentGameState;
  }

  return state;
}

function persistCurrentState() {
  saveAppState(window.localStorage, createSavedState());
}

function showPhase(phase) {
  appPhase = phase;
  setupScreenElement.hidden = phase !== "setup";
  firstRollScreenElement.hidden = phase !== "first-player-roll";
  gameScreenElement.hidden = phase !== "game";
}

function getActiveSetupPlayers() {
  const sides = getPlayerSides(setupPlayerCount);
  return setupPlayers.slice(0, setupPlayerCount).map((player, index) => ({
    ...player,
    side: sides[index],
  }));
}

function getSetupConfig() {
  const players = getActiveSetupPlayers();
  return { players, turnOrder: players.map(({ id }) => id) };
}

function updateSetupValidity() {
  const validation = validateGameConfig(getSetupConfig());
  startGameElement.disabled = !validation.valid;
  setupErrorElement.textContent = validation.valid ? "" : validation.errors[0];
}

function renderSetupPlayers() {
  const playerCountInput = setupFormElement.querySelector(
    `input[name="player-count"][value="${setupPlayerCount}"]`,
  );
  if (playerCountInput) playerCountInput.checked = true;
  const activePlayers = getActiveSetupPlayers();
  const selectedColors = new Set(activePlayers.map(({ color }) => color));
  const rows = activePlayers.map((player, index) => {
    const row = document.createElement("div");
    row.className = "player-setting";
    row.dataset.playerIndex = String(index);

    const number = document.createElement("span");
    number.className = "player-setting__number";
    number.textContent = String(index + 1);

    const nameLabel = document.createElement("label");
    nameLabel.className = "field-label";
    nameLabel.textContent = "Имя";
    const nameInput = document.createElement("input");
    nameInput.name = `player-${index + 1}-name`;
    nameInput.value = player.name;
    nameInput.maxLength = 32;
    nameInput.required = true;
    nameLabel.append(nameInput);

    const typeLabel = document.createElement("label");
    typeLabel.className = "field-label";
    typeLabel.textContent = "Тип";
    const typeSelect = document.createElement("select");
    typeSelect.name = `player-${index + 1}-type`;
    for (const [value, label] of [["human", "Human"], ["bot", "Bot"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = player.type === value;
      typeSelect.append(option);
    }
    typeLabel.append(typeSelect);

    const colorLabel = document.createElement("label");
    colorLabel.className = "field-label";
    colorLabel.textContent = "Цвет";
    const colorSelect = document.createElement("select");
    colorSelect.name = `player-${index + 1}-color`;
    PLAYER_COLORS.forEach((color) => {
      const option = document.createElement("option");
      option.value = color.value;
      option.textContent = color.label;
      option.selected = player.color === color.value;
      option.disabled = color.value !== player.color && selectedColors.has(color.value);
      colorSelect.append(option);
    });
    colorLabel.append(colorSelect);

    row.append(number, nameLabel, typeLabel, colorLabel);
    return row;
  });

  playerSettingsElement.replaceChildren(...rows);
  updateSetupValidity();
}

function setSetupPlayerCount(count) {
  const previousCount = setupPlayerCount;
  setupPlayerCount = count;
  if (count > previousCount) {
    const usedColors = new Set(setupPlayers.slice(0, previousCount).map(({ color }) => color));
    for (let index = previousCount; index < count; index += 1) {
      const availableColor = PLAYER_COLORS.find(({ value }) => !usedColors.has(value));
      if (!availableColor) break;
      setupPlayers[index] = {
        ...setupPlayers[index],
        color: availableColor.value,
      };
      usedColors.add(availableColor.value);
    }
  }
  renderSetupPlayers();
  persistCurrentState();
}

function playerForFirstRoll(playerId) {
  return pendingPlayers.find(({ id }) => id === playerId);
}

function latestFirstRollValue(playerId) {
  if (Object.hasOwn(firstPlayerRollState.results, playerId)) {
    return firstPlayerRollState.results[playerId];
  }
  for (let index = firstPlayerRollState.history.length - 1; index >= 0; index -= 1) {
    const value = firstPlayerRollState.history[index].results[playerId];
    if (value !== undefined) return value;
  }
  return null;
}

function renderFirstPlayerRoll() {
  const state = firstPlayerRollState;
  const currentPlayer = playerForFirstRoll(state.currentPlayerId);
  const die = firstRollDieElement.querySelector(".physical-die");
  const currentValue = currentPlayer ? latestFirstRollValue(currentPlayer.id) : null;

  firstRollDieElement.disabled = isFirstRollRolling || !currentPlayer || currentPlayer.type === "bot";
  die.className = `physical-die ${isFirstRollRolling ? "physical-die--rolling" : "physical-die--not-rolled"}`;
  die.textContent = currentValue ?? "–";

  if (state.status === "complete") {
    const winner = playerForFirstRoll(state.winnerId);
    firstRollStatusElement.textContent = `${winner.name} начинает. Запускаем партию…`;
  } else if (state.round > 1) {
    firstRollStatusElement.textContent = `${currentPlayer.name}: переброс после ничьей (раунд ${state.round})`;
  } else {
    firstRollStatusElement.textContent = currentPlayer.type === "bot"
      ? `${currentPlayer.name} бросает автоматически…`
      : `${currentPlayer.name}, бросьте кубик`;
  }

  const items = pendingPlayers.map((player) => {
    const item = document.createElement("li");
    item.className = [
      "roll-result",
      state.currentPlayerId === player.id ? "roll-result--current" : "",
    ].filter(Boolean).join(" ");
    item.style.setProperty("--player-color", player.color);
    const name = document.createElement("span");
    name.textContent = `${player.name} · ${player.type === "bot" ? "Bot" : "Human"}`;
    const result = document.createElement("strong");
    result.textContent = latestFirstRollValue(player.id) ?? "—";
    item.append(name, result);
    return item;
  });
  firstRollResultsElement.replaceChildren(...items);

  if (currentPlayer?.type === "bot" && !isFirstRollRolling) runFirstPlayerRoll(true);
}

async function runFirstPlayerRoll(isBot = false) {
  if (appPhase !== "first-player-roll" || isFirstRollRolling || firstPlayerRollState.status !== "rolling") return;
  const generation = flowGeneration;
  const playerId = firstPlayerRollState.currentPlayerId;
  const player = playerForFirstRoll(playerId);
  if (!player || (isBot && player.type !== "bot") || (!isBot && player.type !== "human")) return;

  isFirstRollRolling = true;
  renderFirstPlayerRoll();
  if (isBot) await wait(BOT_FIRST_ROLL_DELAY);
  if (generation !== flowGeneration || appPhase !== "first-player-roll") return;

  const finalValue = rollDie();
  const die = firstRollDieElement.querySelector(".physical-die");
  for (let frame = 0; frame < 6; frame += 1) {
    die.textContent = frame === 5 ? finalValue : rollDie();
    await wait(DICE_ROLL_FRAME_DURATION);
  }
  if (generation !== flowGeneration || appPhase !== "first-player-roll") return;

  firstPlayerRollState = recordFirstPlayerRoll(firstPlayerRollState, playerId, finalValue);
  isFirstRollRolling = false;
  persistCurrentState();
  renderFirstPlayerRoll();

  if (firstPlayerRollState.status === "complete") {
    await wait(750);
    if (generation !== flowGeneration || appPhase !== "first-player-roll") return;
    currentGameState = createGame({
      players: pendingPlayers,
      turnOrder: firstPlayerRollState.turnOrder,
    });
    selectedPieceId = null;
    validActions = [];
    showPhase("game");
    persistCurrentState();
    renderInteraction();
  }
}

function beginFirstPlayerFlow() {
  pendingPlayers = getActiveSetupPlayers().map((player) => ({
    ...player,
    name: player.name.trim(),
  }));
  firstPlayerRollState = createFirstPlayerRoll(pendingPlayers.map(({ id }) => id));
  isFirstRollRolling = false;
  flowGeneration += 1;
  showPhase("first-player-roll");
  persistCurrentState();
  renderFirstPlayerRoll();
}

function returnToSetup() {
  flowGeneration += 1;
  isFirstRollRolling = false;
  showPhase("setup");
  persistCurrentState();
  renderSetupPlayers();
}

function piecePositionForCell(cellId) {
  const cell = getCell(boardData, cellId);
  return piecePositionForBoardPoint(centerOf(cell));
}

function piecePositionForBoardPoint(point) {
  const { boardOffset, size } = boardData.pieceLayer;
  return {
    left: `${((point.x + boardOffset) / size) * 100}%`,
    top: `${((point.y + boardOffset) / size) * 100}%`,
  };
}

function piecePositionForRenderCoordinates(coordinates) {
  const { size } = boardData.pieceLayer;
  return {
    left: `${((coordinates.column - 0.5) / size) * 100}%`,
    top: `${((coordinates.row - 0.5) / size) * 100}%`,
  };
}

async function animatePieceTo(pieceElement, cellId, { duration = CELL_STEP_ANIMATION_DURATION } = {}) {
  const destination = piecePositionForCell(cellId);

  if (typeof pieceElement.animate !== "function") {
    Object.assign(pieceElement.style, destination);
    return;
  }

  const start = {
    left: pieceElement.style.left,
    top: pieceElement.style.top,
  };
  const midpoint = {
    left: `${(Number.parseFloat(start.left) + Number.parseFloat(destination.left)) / 2}%`,
    top: `${(Number.parseFloat(start.top) + Number.parseFloat(destination.top)) / 2}%`,
  };
  const acceleration = "cubic-bezier(0.38, 0, 0.78, 1)";
  const animation = pieceElement.animate([
    { ...start, opacity: 1, offset: 0, easing: acceleration },
    { ...midpoint, opacity: 1, offset: 0.5, easing: acceleration },
    { ...destination, opacity: 1, offset: 1 },
  ], { duration, fill: "forwards" });
  await animation.finished;
  Object.assign(pieceElement.style, destination);
  animation.cancel();
}

async function animateRainbowTeleport(pieceElement, teleport) {
  const curve = getRainbowCurve(boardData, teleport.from, teleport.to);
  const destination = piecePositionForCell(teleport.to);

  if (typeof pieceElement.animate !== "function") {
    Object.assign(pieceElement.style, destination);
    return;
  }

  const steps = 24;
  const keyframes = Array.from({ length: steps + 1 }, (_, index) => {
    const progress = index / steps;
    return {
      ...piecePositionForBoardPoint(pointOnQuadraticCurve(curve, progress)),
      offset: progress,
    };
  });
  const animation = pieceElement.animate(keyframes, {
    duration: 560,
    easing: "ease-in-out",
    fill: "forwards",
  });

  await animation.finished;
  Object.assign(pieceElement.style, destination);
  animation.cancel();
}

async function animateCapturedPiece(event, nextGameState) {
  const piece = nextGameState.pieces[event.pieceId];
  const pieceElement = boardStageElement.querySelector(`[data-piece-id="${event.pieceId}"]`);
  if (!piece || !pieceElement) return;

  const destination = piecePositionForRenderCoordinates(
    getPieceRenderCoordinates(piece, nextGameState, boardData),
  );

  pieceElement.classList.add("piece--being-captured");
  try {
    if (typeof pieceElement.animate !== "function") {
      Object.assign(pieceElement.style, destination);
      return;
    }

    const animation = pieceElement.animate(
      [
        { left: pieceElement.style.left, top: pieceElement.style.top, transform: "scale(1)" },
        { ...destination, transform: "scale(0.58)" },
      ],
      { duration: 420, easing: "ease-in-out", fill: "forwards" },
    );
    await animation.finished;
    Object.assign(pieceElement.style, destination);
    animation.cancel();
  } finally {
    pieceElement.classList.remove("piece--being-captured");
  }
}

async function animateReleasedPiece(event, nextGameState) {
  const piece = nextGameState.pieces[event.pieceId];
  const pieceElement = boardStageElement.querySelector(`[data-piece-id="${event.pieceId}"]`);
  if (!piece || !pieceElement) return;

  const destination = piecePositionForRenderCoordinates(
    getPieceRenderCoordinates(piece, nextGameState, boardData),
  );

  pieceElement.classList.add("piece--being-released");
  try {
    if (typeof pieceElement.animate !== "function") {
      Object.assign(pieceElement.style, destination);
      return;
    }

    const animation = pieceElement.animate(
      [
        { left: pieceElement.style.left, top: pieceElement.style.top, transform: "scale(1)" },
        { ...destination, transform: "scale(1.7)" },
      ],
      { duration: 420, easing: "ease-in-out", fill: "forwards" },
    );
    await animation.finished;
    Object.assign(pieceElement.style, destination);
    animation.cancel();
  } finally {
    pieceElement.classList.remove("piece--being-released");
  }
}

async function animateLinearEvent(event, animationOptions) {
  if (!event) return;
  const pieceElement = boardStageElement.querySelector(`[data-piece-id="${event.pieceId}"]`);
  if (!pieceElement) return;

  const path = event.type === "entered-swamp" ? [event.to] : event.path;
  for (const cellId of path) {
    await animatePieceTo(pieceElement, cellId, animationOptions);
  }
}

async function animateSwampShift(events) {
  const pieceElements = events
    .map(({ pieceId }) => boardStageElement.querySelector(`[data-piece-id="${pieceId}"]`))
    .filter(Boolean);

  pieceElements.forEach((element) => element.classList.add("piece--swamp-shifting"));
  try {
    await Promise.all(events.map((event) => (
      animateLinearEvent(event, { duration: SWAMP_PUSH_ANIMATION_DURATION })
    )));
  } finally {
    pieceElements.forEach((element) => element.classList.remove("piece--swamp-shifting"));
  }
}

async function animateActionEvents(events, nextGameState) {
  const pushEvents = events.filter(({ type }) => type === "piece-pushed");
  const captureEvents = events.filter(({ type }) => type === "captured");

  if (pushEvents.length > 0) {
    const swampEntry = events.find(({ type }) => type === "entered-swamp");
    const selectedMovement = events.find(
      ({ type }) => type === "piece-moved" || type === "piece-entered-board",
    );

    if (swampEntry) {
      await animateLinearEvent(selectedMovement);
      await animateSwampShift([swampEntry, ...pushEvents]);
    } else {
      await animateSwampShift([selectedMovement, ...pushEvents]);
    }
    await Promise.all(captureEvents.map((event) => animateCapturedPiece(event, nextGameState)));
    return;
  }

  for (const event of events) {
    const pieceElement = boardStageElement.querySelector(`[data-piece-id="${event.pieceId}"]`);
    if (!pieceElement) continue;

    if (["piece-moved", "piece-entered-board"].includes(event.type)) {
      await animateLinearEvent(event);
      continue;
    }

    if (event.type === "entered-swamp") {
      await animateLinearEvent(event);
      continue;
    }

    if (event.type === "teleported") {
      pieceElement.classList.add("piece--teleporting");
      await wait(90);
      await animateRainbowTeleport(pieceElement, event);
      pieceElement.classList.remove("piece--teleporting");
      continue;
    }

    if (event.type === "captured") {
      await animateCapturedPiece(event, nextGameState);
      continue;
    }

    if (event.type === "piece-released-from-sun") {
      await animateReleasedPiece(event, nextGameState);
    }
  }
}

function renderScenarioOptions() {
  const options = DEVELOPMENT_SCENARIOS.map((scenario) => {
    const option = document.createElement("option");
    option.value = scenario.id;
    option.textContent = scenario.label;
    return option;
  });
  debugScenarioElement.replaceChildren(...options);
}

function renderPlayerOptions(scenario) {
  const playerIds = scenario.playerIds ?? [scenario.currentPlayerId ?? "A"];
  const options = playerIds.map((playerId) => {
    const player = currentGameState.players.find(({ id }) => id === playerId);
    const option = document.createElement("option");
    option.value = playerId;
    option.textContent = `${playerId} — ${player.name}`;
    return option;
  });

  debugPlayerElement.replaceChildren(...options);
  debugPlayerElement.value = currentGameState.currentPlayerId;
}

function clearDestinationHighlights() {
  boardElement.querySelectorAll(".cell--valid-destination").forEach((cell) => {
    cell.classList.remove("cell--valid-destination");
    cell.removeAttribute("role");
    cell.removeAttribute("aria-pressed");
    cell.removeAttribute("tabindex");
    delete cell.dataset.actionCount;
    cell.title = cell.dataset.baseTitle;
  });
}

function getActionSelectionCell(action) {
  return action.path.at(-1) ?? action.destination;
}

function getSequenceSelectionCell(sequence) {
  return getActionSelectionCell(sequence.at(-1));
}

function renderDiceState(message) {
  const model = getDiceViewModel(currentGameState);
  const renderedDice = isRolling && rollingDiceValues
    ? rollingDiceValues.map((value, index) => ({
      value,
      status: "rolling",
      statusLabel: "вращается",
      id: index,
    }))
    : model.dice;
  currentPlayerNameElement.textContent = model.player?.name ?? "—";
  currentPlayerColorElement.style.setProperty("--player-color", model.player?.color ?? "#999");
  dicePanelElement.classList.toggle("dice-panel--rolling", isRolling);
  physicalDiceElement.classList.toggle("physical-dice--double", model.dice.length === 4);
  rollDiceElement.disabled = !model.canRoll || isAnimating || isRolling;
  debugStartTurnElement.disabled = currentGameState.status !== "playing"
    || Boolean(currentGameState.turn?.dice);

  physicalDiceElement.replaceChildren(...renderedDice.map(({ value, status, statusLabel }, index) => {
    const die = document.createElement("span");
    die.className = `physical-die physical-die--${status}`;
    die.textContent = value ?? "–";
    die.setAttribute("aria-label", `Кубик ${index + 1}: ${value ?? "не брошен"}, ${statusLabel}`);
    die.title = statusLabel;
    return die;
  }));

  const winner = currentGameState.players.find(({ id }) => id === currentGameState.winnerId);
  victoryOverlayElement.hidden = !winner;
  victoryOverlayElement.textContent = winner ? `Победитель: ${winner.name}` : "";

  if (message) turnStatusElement.textContent = message;
  else if (isRolling) turnStatusElement.textContent = "Кубики бросаются…";
  else if (winner) turnStatusElement.textContent = `Партия завершена. Победитель: ${winner.name}.`;
  else if (model.activeValue !== null) turnStatusElement.textContent = "";
  else turnStatusElement.textContent = "Нажмите на кубики для броска";
}

function updateRollingDiceFaces() {
  physicalDiceElement.querySelectorAll(".physical-die").forEach((die, index) => {
    const value = rollingDiceValues[index];
    die.textContent = value;
    die.setAttribute("aria-label", `Кубик ${index + 1}: ${value}, вращается`);
  });
}

function renderInteraction(message) {
  const validPieceIds = new Set(validActions.map(({ pieceId }) => pieceId));
  const selectedSequences = selectedPieceId
    ? getTurnActionSequencesForPiece(currentGameState, selectedPieceId)
    : [];

  applyBoardPlayerColors(boardElement, currentGameState.players);
  renderPieces(boardStageElement, currentGameState, boardData, {
    validPieceIds,
    selectedPieceId,
    displayMode,
  });
  renderDiceState(message);

  clearDestinationHighlights();
  selectedSequences.forEach((sequence) => {
    const selectionCell = getSequenceSelectionCell(sequence);
    const cell = boardElement.querySelector(`[data-cell-id="${selectionCell}"]`);
    if (!cell) return;
    cell.classList.add("cell--valid-destination");
    cell.dataset.actionCount = String(sequence.length);
    cell.title = sequence.length > 1
      ? `${selectionCell} — разыграть ${sequence.length} значения подряд`
      : `${selectionCell} — разыграть ${sequence[0].dieValue}`;
    cell.setAttribute("role", "button");
    cell.tabIndex = 0;
  });

  if (message) {
    debugOutputElement.textContent = message;
  } else if (validActions.length > 0) {
    debugOutputElement.textContent = validActions
      .map((action) => `${action.pieceId} → ${getActionSelectionCell(action)}`)
      .join(", ");
  } else if (currentGameState.turn?.finished) {
    debugOutputElement.textContent = "Ход завершён";
  } else if (currentGameState.turn?.dice) {
    debugOutputElement.textContent = "";
  } else {
    debugOutputElement.textContent = "Нажмите на кубики для броска";
  }
}

function updateValidActions() {
  validActions = getTurnValidActions(currentGameState);

  if (!validActions.some(({ pieceId }) => pieceId === selectedPieceId)) selectedPieceId = null;
  renderInteraction();
}

function loadScenario() {
  const scenario = DEVELOPMENT_SCENARIOS.find(({ id }) => id === debugScenarioElement.value);
  currentGameState = createDevelopmentScenarioState(scenario.id);
  renderPlayerOptions(scenario);
  debugDieOneElement.value = String(scenario.dieValue);
  debugDieTwoElement.value = "1";
  selectedPieceId = null;
  updateValidActions();
}

async function advanceFinishedTurn(message) {
  if (currentGameState.status !== "playing" || !currentGameState.turn.finished) return false;

  renderInteraction(message);
  await wait(500);
  currentGameState = advanceToNextPlayer(currentGameState);
  validActions = [];
  selectedPieceId = null;
  persistCurrentState();
  renderInteraction();
  return true;
}

async function beginTurn(dice) {
  currentGameState = startTurn(currentGameState, dice);
  persistCurrentState();
  selectedPieceId = null;
  validActions = getTurnValidActions(currentGameState);
  if (!await advanceFinishedTurn("Нет доступных действий. Ход завершён.")) updateValidActions();
}

async function performActionSequence(actions) {
  isAnimating = true;
  validActions = [];
  selectedPieceId = null;
  clearDestinationHighlights();

  let nextGameState = currentGameState;
  let lastAction = actions[0];

  try {
    for (const [index, action] of actions.entries()) {
      const result = applyTurnAction(nextGameState, action);
      await animateActionEvents(result.events, result.gameState);
      nextGameState = result.gameState;
      currentGameState = nextGameState;
      persistCurrentState();
      renderDiceState();
      lastAction = action;
      if (nextGameState.status === "finished") break;
      if (index < actions.length - 1) await wait(DIE_ACTION_PAUSE);
    }
  } finally {
    currentGameState = nextGameState;
    validActions = getTurnValidActions(currentGameState);
    const winner = currentGameState.players.find(({ id }) => id === currentGameState.winnerId);
    if (winner) {
      renderInteraction(`${lastAction.pieceId} перемещена на ${lastAction.destination}. Победитель: ${winner.name}.`);
    } else if (!await advanceFinishedTurn(
      `${lastAction.pieceId} перемещена на ${lastAction.destination}. Ход завершён.`,
    )) {
      renderInteraction(
        `${lastAction.pieceId} перемещена на ${lastAction.destination}.`,
      );
    }
    isAnimating = false;
    renderDiceState();
  }
}

async function performAction(action) {
  await performActionSequence([action]);
}

async function activateInteractiveElement(target) {
  if (isAnimating) return;

  const pieceElement = target.closest(".piece--valid-action");
  if (pieceElement && boardStageElement.contains(pieceElement)) {
    const pieceId = pieceElement.dataset.pieceId;
    const pieceActions = validActions.filter((action) => action.pieceId === pieceId);
    const directAction = pieceActions.find(({ type }) => type === "release-from-sun");
    if (directAction) {
      await performAction(directAction);
    } else if (pieceActions.length > 0) {
      selectedPieceId = selectedPieceId === pieceId ? null : pieceId;
      renderInteraction();
    }
    return;
  }

  const cellElement = target.closest(".cell--valid-destination");
  if (!cellElement || !selectedPieceId) return;

  const sequence = getTurnActionSequencesForPiece(currentGameState, selectedPieceId).find((candidate) => (
    candidate.length === Number(cellElement.dataset.actionCount)
      && getSequenceSelectionCell(candidate) === cellElement.dataset.cellId
  ));
  if (!sequence) return;
  await performActionSequence(sequence);
}

boardStageElement.addEventListener("click", ({ target }) => activateInteractiveElement(target));
boardStageElement.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (!event.target.matches(".piece--valid-action, .cell--valid-destination")) return;
  event.preventDefault();
  activateInteractiveElement(event.target);
});
setupFormElement.addEventListener("change", (event) => {
  if (event.target.name === "player-count") {
    setSetupPlayerCount(Number(event.target.value));
    return;
  }

  const row = event.target.closest(".player-setting");
  if (!row) return;
  const playerIndex = Number(row.dataset.playerIndex);
  if (event.target.name.endsWith("-type")) setupPlayers[playerIndex].type = event.target.value;
  if (event.target.name.endsWith("-color")) {
    const color = PLAYER_COLORS.find(({ value }) => value === event.target.value);
    setupPlayers[playerIndex].color = color.value;
    renderSetupPlayers();
    persistCurrentState();
    return;
  }
  updateSetupValidity();
  persistCurrentState();
});
setupFormElement.addEventListener("input", (event) => {
  const row = event.target.closest(".player-setting");
  if (!row || !event.target.name.endsWith("-name")) return;
  setupPlayers[Number(row.dataset.playerIndex)].name = event.target.value;
  updateSetupValidity();
  persistCurrentState();
});
setupFormElement.addEventListener("submit", (event) => {
  event.preventDefault();
  const validation = validateGameConfig(getSetupConfig());
  if (!validation.valid) {
    setupErrorElement.textContent = validation.errors[0];
    return;
  }
  beginFirstPlayerFlow();
});
firstRollDieElement.addEventListener("click", () => runFirstPlayerRoll(false));
newGameElement.addEventListener("click", () => {
  if (currentGameState?.status === "playing"
    && !window.confirm("Текущая партия будет сброшена. Начать новую игру?")) return;
  returnToSetup();
});
debugScenarioElement.addEventListener("input", loadScenario);
debugPlayerElement.addEventListener("input", () => {
  currentGameState = {
    ...currentGameState,
    currentPlayerId: debugPlayerElement.value,
    turn: createPendingTurn(),
  };
  selectedPieceId = null;
  updateValidActions();
});
debugStartTurnElement.addEventListener("click", () => beginTurn([
  Number(debugDieOneElement.value),
  Number(debugDieTwoElement.value),
]));
rollDiceElement.addEventListener("click", async () => {
  if (!getDiceViewModel(currentGameState).canRoll || isAnimating || isRolling) return;
  const dice = rollDice();
  isRolling = true;
  rollingDiceValues = rollDice();
  renderDiceState();

  for (let frame = 1; frame < DICE_ROLL_FRAME_COUNT; frame += 1) {
    await wait(DICE_ROLL_FRAME_DURATION);
    rollingDiceValues = frame === DICE_ROLL_FRAME_COUNT - 1 ? dice : rollDice();
    updateRollingDiceFaces();
  }
  await wait(DICE_ROLL_FRAME_DURATION);

  isRolling = false;
  rollingDiceValues = null;
  await beginTurn(dice);
});

function restoreSavedState() {
  const savedState = loadAppState(window.localStorage);
  if (!savedState) return false;

  setupPlayerCount = savedState.setup.playerCount;
  setupPlayers = savedState.setup.players;

  if (savedState.phase === "game") {
    currentGameState = savedState.gameState;
    if (currentGameState.status === "playing" && currentGameState.turn.finished) {
      currentGameState = advanceToNextPlayer(currentGameState);
    }
    validActions = getTurnValidActions(currentGameState);
    selectedPieceId = null;
    showPhase("game");
    renderInteraction();
    persistCurrentState();
    return true;
  }

  if (savedState.phase === "first-player-roll") {
    pendingPlayers = savedState.pendingPlayers;
    firstPlayerRollState = savedState.firstPlayerRollState;
    if (firstPlayerRollState.status === "complete") {
      currentGameState = createGame({
        players: pendingPlayers,
        turnOrder: firstPlayerRollState.turnOrder,
      });
      validActions = [];
      selectedPieceId = null;
      showPhase("game");
      persistCurrentState();
      renderInteraction();
      return true;
    }
    showPhase("first-player-roll");
    renderFirstPlayerRoll();
    return true;
  }

  showPhase("setup");
  renderSetupPlayers();
  return true;
}

renderScenarioOptions();
if (!restoreSavedState()) {
  renderSetupPlayers();
  showPhase("setup");
}
