import { boardData, validateBoardData } from "./board-data.js";
import {
  DEVELOPMENT_SCENARIOS,
  PLAYER_COLORS,
  assignPlayerSides,
  createClockwiseTurnOrder,
  createGame,
  createDevelopmentScenarioState,
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
import {
  getDicePosition,
  getDiceViewModel,
  getHumanDicePositions,
  shouldInvertTopDiceCaption,
} from "./dice-ui.js";
import { appendDiePips, getDiePipPositions } from "./die-face.js";
import {
  DISPLAY_MODES,
  getCellDisplay,
  getDisplayMode,
} from "./display-mode.js";
import { loadAppState, saveAppState } from "./persistence.js";
import { applyBoardPlayerColors } from "./board-theme.js";
import { playBotTurn } from "./bot-player.js";
import { getAutoHumanStep } from "./auto-player.js";
import { parseRulesMarkdown, renderRulesSlide } from "./rules-dialog.js";
import { DEFAULT_PLAYER_NAMES, swapPlayerColor } from "./setup-players.js";
import {
  getActionSelectionCells,
  getSequenceBadge,
  getSequenceBadgeCell,
  getSequenceRainbowTransition,
  getSequenceSelectionCells,
} from "./action-targets.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SWAMP_PUSH_ANIMATION_DURATION = 300;
const CELL_STEP_ANIMATION_DURATION = 150;
const MIDDLE_CELL_STEP_ANIMATION_DURATION = 65;
const DIE_ACTION_PAUSE = 90;
const DICE_ROLL_FRAME_DURATION = 70;
const DICE_ROLL_FRAME_COUNT = 8;
const DICE_POST_RELEASE_SHAKE_COUNT = 2;
const BOT_FIRST_ROLL_DELAY = 650;
const BOT_TURN_START_DELAY = 550;
const BOT_ACTION_CHOICE_DELAY = 450;
const BOT_NEXT_ACTION_DELAY = 350;
const AUTO_TURN_START_DELAY = 350;
const AUTO_ACTION_CHOICE_DELAY = 260;
const AUTO_NEXT_ACTION_DELAY = 180;
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
  const pathData = `M ${from.x} ${from.y} Q ${bend.x} ${bend.y} ${to.x} ${to.y}`;
  const group = createSvgElement("g", {
    class: "rainbow-link",
    "data-rainbow-from": link.from,
    "data-rainbow-to": link.to,
  });

  group.append(createSvgElement("path", {
    class: "rainbow-link__hit-area",
    d: pathData,
    fill: "none",
    stroke: "transparent",
    "stroke-width": 1.25,
    "stroke-linecap": "round",
  }));
  group.append(createSvgElement("path", {
    class: "rainbow-link__highlight",
    d: pathData,
    fill: "none",
    stroke: "#ffd84d",
    "stroke-width": 0.82,
    "stroke-linecap": "round",
  }));

  colors.forEach((color, index) => {
    const path = createSvgElement("path", {
      class: "rainbow-link__stripe",
      d: pathData,
      fill: "none",
      stroke: color,
      "stroke-width": 0.5 - index * 0.09,
      "stroke-linecap": "round",
      opacity: 0.95,
    });
    group.append(path);
  });
  svg.append(group);
}

function renderSwampRoute(svg, board, swamp) {
  const ids = [swamp.entrance, ...swamp.positions.map(({ id }) => id), swamp.exit];
  const points = ids.map((id) => centerOf(getCell(board, id)));
  const polyline = createSvgElement("polyline", {
    points: points.map(({ x, y }) => `${x},${y}`).join(" "),
    fill: "none",
    stroke: "#8a6542",
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
  const isSwampEndpoint = board.swamps.some(
    ({ entrance, exit }) => cell.id === entrance || cell.id === exit,
  );

  element.className = [
    "cell",
    `cell--${cell.type}`,
    `cell--side-${cell.side.toLowerCase()}`,
    cell.isStart ? "cell--start" : "",
    isRainbowEndpoint ? "cell--rainbow" : "",
    isSwampEndpoint ? "cell--swamp-endpoint" : "",
    display.isPlayerHint ? "cell--player-hint" : "",
    display.isSideOriented ? "cell--side-oriented-label" : "",
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
const badgeLayerElement = document.createElement("div");
badgeLayerElement.className = "board__badges";
badgeLayerElement.setAttribute("aria-hidden", "true");
boardStageElement.append(badgeLayerElement);

const setupScreenElement = document.querySelector("#setup-screen");
const gameScreenElement = document.querySelector("#game-screen");
const headerShowRulesElement = document.querySelector("#header-show-rules");
const openGameMenuElement = document.querySelector("#open-game-menu");
const gameMenuElement = document.querySelector("#game-menu");
const closeGameMenuElement = document.querySelector("#close-game-menu");
const gameMenuActionsElement = document.querySelector("#game-menu-actions");
const newGameConfirmationElement = document.querySelector("#new-game-confirmation");
const setupFormElement = document.querySelector("#setup-form");
const playerSettingsElement = document.querySelector("#player-settings");
const setupErrorElement = document.querySelector("#setup-error");
const startGameElement = document.querySelector("#start-game");
const newGameElement = document.querySelector("#new-game");
const gameSettingsElement = document.querySelector("#game-settings");
const confirmNewGameElement = document.querySelector("#confirm-new-game");
const showRulesElement = document.querySelector("#show-rules");
const rulesDialogElement = document.querySelector("#rules-dialog");
const closeRulesElement = document.querySelector("#close-rules");
const rulesSlideTitleElement = document.querySelector("#rules-slide-title");
const rulesContentElement = document.querySelector("#rules-content");
const rulesPreviousElement = document.querySelector("#rules-previous");
const rulesNextElement = document.querySelector("#rules-next");
const rulesProgressElement = document.querySelector("#rules-progress");
const debugScenarioElement = document.querySelector("#debug-scenario");
const debugPlayerElement = document.querySelector("#debug-player");
const debugDieOneElement = document.querySelector("#debug-die-one");
const debugDieTwoElement = document.querySelector("#debug-die-two");
const debugStartTurnElement = document.querySelector("#debug-start-turn");
const rollDiceElement = document.querySelector("#roll-dice");
const dicePanelElement = document.querySelector("#dice-panel");
const dicePanelElements = [...document.querySelectorAll("[data-dice-position]")];
const compactGameLayoutQuery = window.matchMedia("(max-width: 980px)");
let physicalDiceElement = rollDiceElement;
let turnStatusElement = document.querySelector("#turn-status");
const victoryOverlayElement = document.querySelector("#victory-overlay");
const victoryMessageElement = document.querySelector("#victory-message");
const victoryNewGameElement = document.querySelector("#victory-new-game");
const victoryGameSettingsElement = document.querySelector("#victory-game-settings");
const debugOutputElement = document.querySelector("#debug-output");
const debugPanelElement = document.querySelector(".rule-debug");
debugPanelElement.hidden = displayMode !== DISPLAY_MODES.DEVELOPMENT;
let currentGameState;
let validActions = [];
let selectedPieceId = null;
let selectedPieceActionCount = 0;
let isAnimating = false;
let isRolling = false;
let rollingDiceValues = null;
let isHumanDiceHolding = false;
let diceHoldTimer = null;
let appPhase = "setup";
let setupPlayerCount = 2;
let setupPlayers = PLAYER_COLORS.map((color, index) => ({
  id: `player-${index + 1}`,
  name: DEFAULT_PLAYER_NAMES[index],
  type: "human",
  color: color.value,
}));
let pendingPlayers = [];
let firstPlayerRollState = null;
let isFirstRollRolling = false;
let isFirstRollHolding = false;
let firstRollHoldTimer = null;
let flowGeneration = 0;
let isBotRunning = false;
let isAutoHumanRunning = false;
let selectedBotAction = null;
let rulesSlides = [];
let rulesSlideIndex = 0;
let dismissedVictoryOverlayWinnerId = null;
let pendingResetAction = null;
let rulesLoadPromise = null;
let rulesReturnFocusElement = null;

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function animatePostReleaseShakes(renderRandomFrame, renderFinalFrame, isCurrent) {
  for (let frame = 0; frame < DICE_POST_RELEASE_SHAKE_COUNT; frame += 1) {
    await wait(DICE_ROLL_FRAME_DURATION);
    if (!isCurrent()) return false;
    renderRandomFrame();
  }

  await wait(DICE_ROLL_FRAME_DURATION);
  if (!isCurrent()) return false;
  renderFinalFrame();
  return true;
}

function renderDieFace(die, value) {
  die.replaceChildren();
  die.dataset.value = value ?? "";

  if (getDiePipPositions(value).length === 0) {
    const placeholder = document.createElement("span");
    placeholder.className = "physical-die__placeholder";
    placeholder.textContent = "–";
    die.append(placeholder);
    return;
  }

  appendDiePips(die, value, "physical-die__pip");
}

function renderDestinationBadge(cell, badgeModel) {
  if (!badgeModel) return;

  const boardCell = getCell(boardData, cell.dataset.cellId);
  const anchor = document.createElement("span");
  anchor.className = "cell-action-badge-anchor";
  anchor.style.gridRow = String(boardCell.row + boardData.pieceLayer.boardOffset);
  anchor.style.gridColumn = String(boardCell.column + boardData.pieceLayer.boardOffset);

  const badge = document.createElement("span");
  badge.className = `cell-action-badge cell-action-badge--${badgeModel.type}`;
  badge.setAttribute("aria-hidden", "true");

  if (badgeModel.type === "multiplier") {
    badge.textContent = badgeModel.label;
  } else {
    badgeModel.values.forEach((value) => {
      const die = document.createElement("span");
      die.className = "cell-action-badge__die";
      appendDiePips(die, value, "cell-action-badge__pip");
      badge.append(die);
    });
  }

  anchor.append(badge);
  badgeLayerElement.append(anchor);
}

function clearPieceSelection() {
  selectedPieceId = null;
  selectedPieceActionCount = 0;
}

function selectPiece(pieceId) {
  if (selectedPieceId !== pieceId) selectedPieceActionCount = 0;
  selectedPieceId = pieceId;
}

function isDoubleTurn(gameState) {
  const dice = gameState.turn?.dice;
  return dice?.length === 2 && dice[0] === dice[1];
}

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

function preserveAutoPlaySettings(nextState, latestState = currentGameState) {
  const settings = new Map(latestState.players.map(({ id, autoPlay }) => [id, autoPlay === true]));
  return {
    ...nextState,
    players: nextState.players.map((player) => ({
      ...player,
      autoPlay: settings.get(player.id) ?? false,
    })),
  };
}

function showPhase(phase) {
  appPhase = phase;
  document.documentElement.dataset.appPhase = phase;
  setupScreenElement.hidden = phase !== "setup";
  gameScreenElement.hidden = phase === "setup";
  headerShowRulesElement.hidden = phase !== "setup";
  openGameMenuElement.hidden = phase === "setup";
  if (phase === "setup") closeGameMenu();
}

function getActiveSetupPlayers() {
  return assignPlayerSides(setupPlayers.slice(0, setupPlayerCount));
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
  const rows = activePlayers.map((player, index) => {
    const row = document.createElement("div");
    row.className = "player-setting";
    row.dataset.playerIndex = String(index);

    const number = document.createElement("span");
    number.className = "player-setting__number";
    number.textContent = String(index + 1);

    const nameLabel = document.createElement("label");
    nameLabel.className = "field-label player-setting__name";
    const nameLabelText = document.createElement("span");
    nameLabelText.className = "visually-hidden";
    nameLabelText.textContent = `Имя игрока ${index + 1}`;
    const nameInput = document.createElement("input");
    nameInput.name = `player-${index + 1}-name`;
    nameInput.value = player.name;
    nameInput.maxLength = 32;
    nameInput.required = true;
    nameLabel.append(nameLabelText, nameInput);

    const typeOptions = document.createElement("div");
    typeOptions.className = "type-options";
    typeOptions.setAttribute("role", "radiogroup");
    typeOptions.setAttribute("aria-label", `Тип игрока ${index + 1}`);
    for (const [value, label] of [["human", "Игрок"], ["bot", "Бот"]]) {
      const optionLabel = document.createElement("label");
      optionLabel.className = "type-option";
      const option = document.createElement("input");
      option.type = "radio";
      option.name = `player-${index + 1}-type`;
      option.value = value;
      option.checked = player.type === value;
      const optionText = document.createElement("span");
      optionText.textContent = label;
      optionLabel.append(option, optionText);
      typeOptions.append(optionLabel);
    }

    const colorLabel = document.createElement("div");
    colorLabel.className = "field-label player-setting__colors";
    const colorLabelText = document.createElement("span");
    colorLabelText.className = "visually-hidden";
    colorLabelText.textContent = "Цвет";
    const colorOptions = document.createElement("div");
    colorOptions.className = "color-options";
    colorOptions.setAttribute("role", "radiogroup");
    colorOptions.setAttribute("aria-label", `Цвет игрока ${index + 1}`);
    PLAYER_COLORS.forEach((color) => {
      const optionLabel = document.createElement("label");
      optionLabel.className = "color-option";
      optionLabel.title = color.label;
      const option = document.createElement("input");
      option.type = "radio";
      option.name = `player-${index + 1}-color`;
      option.value = color.value;
      option.checked = player.color === color.value;
      option.setAttribute("aria-label", color.label);
      const piece = document.createElement("span");
      piece.className = "color-option__piece";
      piece.style.setProperty("--option-color", color.value);
      optionLabel.append(option, piece);
      colorOptions.append(optionLabel);
    });
    colorLabel.append(colorLabelText, colorOptions);

    row.append(number, nameLabel, typeOptions, colorLabel);
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

function getFirstRollValues() {
  return Object.fromEntries(
    pendingPlayers.map(({ id }) => [id, latestFirstRollValue(id)]),
  );
}

function getFirstRollStatusMessage(state, currentPlayer) {
  if (state.status === "complete") {
    return `${playerForFirstRoll(state.winnerId).name} ходит первым`;
  }
  const prefix = state.round > 1 && Object.keys(state.results).length === 0 ? "Ничья. " : "";
  if (currentPlayer.type === "bot") return `${prefix}${currentPlayer.name} бросает автоматически…`;
  if (isFirstRollHolding) return `${prefix}${currentPlayer.name}, отпустите кубик`;
  if (isFirstRollRolling) return `${prefix}${currentPlayer.name}: кубик бросается…`;
  return `${prefix}${currentPlayer.name}, зажмите кубик для броска`;
}

function renderFirstPlayerRoll() {
  const state = firstPlayerRollState;
  const displayPlayerId = state.currentPlayerId ?? state.winnerId;
  const currentPlayer = playerForFirstRoll(displayPlayerId);
  const currentValue = latestFirstRollValue(displayPlayerId);
  const renderState = {
    ...currentGameState,
    currentPlayerId: state.status === "rolling" ? state.currentPlayerId : null,
    winnerId: null,
  };

  gameScreenElement.dataset.playerCount = String(pendingPlayers.length);
  applyBoardPlayerColors(boardElement, pendingPlayers);
  renderPieces(boardStageElement, renderState, boardData, {
    displayMode,
    firstRoll: {
      status: state.status,
      participants: state.participants,
      values: getFirstRollValues(),
      winnerId: state.winnerId,
    },
    showAutoControls: false,
  });
  clearDestinationHighlights();
  victoryOverlayElement.hidden = true;

  const activePosition = compactGameLayoutQuery.matches
    ? getDicePosition(pendingPlayers, displayPlayerId)
    : "bottom";
  const activePanel = dicePanelElements.find(({ dataset }) => dataset.dicePosition === activePosition)
    ?? dicePanelElement;
  const statusMessage = getFirstRollStatusMessage(state, currentPlayer);

  dicePanelElements.forEach((panel) => {
    const isActive = panel === activePanel;
    const diceButton = panel.querySelector(".physical-dice");
    const panelStatus = panel.querySelector(".turn-status");
    panel.classList.remove("dice-panel--first-roll", "dice-panel--first-roll-inactive");
    panel.classList.add("dice-panel--first-roll");
    panel.classList.toggle("dice-panel--first-roll-inactive", !isActive);
    panel.classList.toggle("dice-panel--current", isActive);
    panel.classList.toggle(
      "dice-panel--caption-inverted",
      isActive && panel.dataset.dicePosition === "top" && shouldInvertTopDiceCaption(pendingPlayers),
    );
    panel.style.setProperty("--dice-owner-color", currentPlayer.color);
    diceButton.classList.remove("physical-dice--double");
    diceButton.disabled = !isActive
      || state.status === "complete"
      || currentPlayer.type === "bot"
      || (isFirstRollRolling && !isFirstRollHolding);
    diceButton.setAttribute("aria-label", `Бросить кубик: ${currentPlayer.name}`);
    diceButton.replaceChildren();
    if (isActive) {
      const die = document.createElement("span");
      die.className = `physical-die ${isFirstRollRolling ? "physical-die--rolling" : currentValue ? "" : "physical-die--not-rolled"}`.trim();
      renderDieFace(die, currentValue);
      diceButton.append(die);
    }
    panelStatus.textContent = isActive ? statusMessage : "";
    panelStatus.classList.toggle("turn-status--hidden", !isActive);
    panelStatus.setAttribute("aria-hidden", String(!isActive));
    panelStatus.setAttribute("aria-live", isActive ? "polite" : "off");
  });

  physicalDiceElement = activePanel.querySelector(".physical-dice");
  turnStatusElement = activePanel.querySelector(".turn-status");

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
  const die = physicalDiceElement.querySelector(".physical-die");
  for (let frame = 0; frame < 6; frame += 1) {
    renderDieFace(die, frame === 5 ? finalValue : rollDie());
    await wait(DICE_ROLL_FRAME_DURATION);
  }
  if (generation !== flowGeneration || appPhase !== "first-player-roll") return;

  await completeFirstPlayerRoll(playerId, finalValue, generation);
}

async function completeFirstPlayerRoll(playerId, finalValue, generation = flowGeneration) {
  if (generation !== flowGeneration || appPhase !== "first-player-roll") return;

  firstPlayerRollState = recordFirstPlayerRoll(firstPlayerRollState, playerId, finalValue);
  isFirstRollRolling = false;
  isFirstRollHolding = false;
  persistCurrentState();
  renderFirstPlayerRoll();

  if (firstPlayerRollState.status === "complete") {
    await wait(750);
    if (generation !== flowGeneration || appPhase !== "first-player-roll") return;
    currentGameState = createGame({
      players: pendingPlayers,
      turnOrder: createClockwiseTurnOrder(pendingPlayers, firstPlayerRollState.winnerId),
    });
    clearPieceSelection();
    validActions = [];
    showPhase("game");
    persistCurrentState();
    renderInteraction();
    scheduleAutomatedTurns();
  }
}

function startFirstPlayerRollHold() {
  if (appPhase !== "first-player-roll" || isFirstRollRolling || firstPlayerRollState.status !== "rolling") return;
  const player = playerForFirstRoll(firstPlayerRollState.currentPlayerId);
  if (player?.type !== "human") return;

  isFirstRollRolling = true;
  isFirstRollHolding = true;
  renderFirstPlayerRoll();
  const die = physicalDiceElement.querySelector(".physical-die");
  renderDieFace(die, rollDie());
  firstRollHoldTimer = window.setInterval(() => renderDieFace(die, rollDie()), DICE_ROLL_FRAME_DURATION);
}

async function finishFirstPlayerRollHold() {
  if (!isFirstRollHolding) return;
  const generation = flowGeneration;
  const playerId = firstPlayerRollState.currentPlayerId;
  window.clearInterval(firstRollHoldTimer);
  firstRollHoldTimer = null;
  isFirstRollHolding = false;
  renderFirstPlayerRoll();
  const finalValue = rollDie();
  const die = physicalDiceElement.querySelector(".physical-die");
  const completed = await animatePostReleaseShakes(
    () => renderDieFace(die, rollDie()),
    () => renderDieFace(die, finalValue),
    () => generation === flowGeneration && appPhase === "first-player-roll",
  );
  if (!completed) return;
  await completeFirstPlayerRoll(playerId, finalValue, generation);
}

function beginFirstPlayerFlow({ autoPlaySettings = new Map() } = {}) {
  pendingPlayers = getActiveSetupPlayers().map((player) => ({
    ...player,
    name: player.name.trim(),
    autoPlay: player.type === "human" && autoPlaySettings.get(player.id) === true,
  }));
  firstPlayerRollState = createFirstPlayerRoll(
    createClockwiseTurnOrder(pendingPlayers, pendingPlayers[0].id),
  );
  currentGameState = createGame({
    players: pendingPlayers,
    turnOrder: createClockwiseTurnOrder(pendingPlayers, pendingPlayers[0].id),
  });
  isFirstRollRolling = false;
  isFirstRollHolding = false;
  isRolling = false;
  isHumanDiceHolding = false;
  window.clearInterval(diceHoldTimer);
  diceHoldTimer = null;
  flowGeneration += 1;
  showPhase("first-player-roll");
  persistCurrentState();
  renderFirstPlayerRoll();
}

function returnToSetup() {
  flowGeneration += 1;
  isFirstRollRolling = false;
  isFirstRollHolding = false;
  window.clearInterval(firstRollHoldTimer);
  firstRollHoldTimer = null;
  selectedBotAction = null;
  showPhase("setup");
  persistCurrentState();
  renderSetupPlayers();
}

function restartWithCurrentSettings() {
  const autoPlaySettings = new Map(
    currentGameState.players.map(({ id, autoPlay }) => [id, autoPlay === true]),
  );
  dismissedVictoryOverlayWinnerId = null;
  beginFirstPlayerFlow({ autoPlaySettings });
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

function getMovementStepDuration(stepIndex, stepCount) {
  if (stepCount <= 1) return CELL_STEP_ANIMATION_DURATION;

  const progress = stepIndex / (stepCount - 1);
  const distanceFromMiddle = Math.abs(progress - 0.5) * 2;
  const progression = distanceFromMiddle ** 1.8;

  return Math.round(
    MIDDLE_CELL_STEP_ANIMATION_DURATION
      + (CELL_STEP_ANIMATION_DURATION - MIDDLE_CELL_STEP_ANIMATION_DURATION) * progression,
  );
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
  for (const [stepIndex, cellId] of path.entries()) {
    const stepAnimationOptions = animationOptions ?? {
      duration: getMovementStepDuration(stepIndex, path.length),
    };
    await animatePieceTo(pieceElement, cellId, stepAnimationOptions);
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
  badgeLayerElement.replaceChildren();
  boardElement.querySelectorAll(".rainbow-link--valid-destination").forEach((rainbow) => {
    rainbow.classList.remove("rainbow-link--valid-destination");
    rainbow.removeAttribute("role");
    rainbow.removeAttribute("aria-label");
    rainbow.removeAttribute("tabindex");
    delete rainbow.dataset.actionCount;
  });
  boardElement.querySelector(".board__connections")?.setAttribute("aria-hidden", "true");
}

function getActionSelectionCell(action) {
  return getActionSelectionCells(action)[0];
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
  const activePosition = compactGameLayoutQuery.matches
    ? getDicePosition(currentGameState.players, currentGameState.currentPlayerId)
    : "bottom";
  const activePanel = dicePanelElements.find(({ dataset }) => dataset.dicePosition === activePosition)
    ?? dicePanelElement;
  physicalDiceElement = activePanel.querySelector(".physical-dice");
  turnStatusElement = activePanel.querySelector(".turn-status");
  const currentPlayer = currentGameState.players.find(({ id }) => id === currentGameState.currentPlayerId);
  const humanDicePositions = new Set(getHumanDicePositions(currentGameState.players));
  const invertTopCaption = shouldInvertTopDiceCaption(currentGameState.players);
  debugStartTurnElement.disabled = currentGameState.status !== "playing"
    || Boolean(currentGameState.turn?.dice)
    || currentPlayer?.type === "bot";

  dicePanelElements.forEach((panel) => {
    const isActive = panel === activePanel;
    const diceButton = panel.querySelector(".physical-dice");
    const panelStatus = panel.querySelector(".turn-status");
    const diceToRender = isActive
      ? renderedDice
      : [0, 1].map((id) => ({ id, value: null, status: "not-rolled", statusLabel: "ожидает" }));
    panel.classList.remove("dice-panel--first-roll", "dice-panel--first-roll-inactive");
    const isHumanDicePanel = humanDicePositions.has(panel.dataset.dicePosition);
    const showCaption = !compactGameLayoutQuery.matches
      || (isHumanDicePanel && (!isActive || currentPlayer?.type === "human"));

    panel.classList.toggle("dice-panel--current", isActive);
    panel.classList.toggle("dice-panel--rolling", isActive && isRolling);
    panel.style.setProperty("--dice-owner-color", currentPlayer?.color ?? "#29362f");
    panel.classList.toggle(
      "dice-panel--caption-inverted",
      panel.dataset.dicePosition === "top" && invertTopCaption,
    );
    diceButton.classList.toggle("physical-dice--double", isActive && model.dice.length === 4);
    diceButton.disabled = !isActive || !model.canRoll || isAnimating || (isRolling && !isHumanDiceHolding);
    diceButton.replaceChildren(...diceToRender.map(({ value, status, statusLabel }, index) => {
      const die = document.createElement("span");
      die.className = `physical-die physical-die--${status}`;
      renderDieFace(die, value);
      die.setAttribute("aria-label", `Кубик ${index + 1}: ${value ?? "не брошен"}, ${statusLabel}`);
      die.title = statusLabel;
      return die;
    }));
    panelStatus.textContent = isActive ? "" : "Ожидает свой ход";
    panelStatus.classList.toggle("turn-status--hidden", !showCaption);
    panelStatus.setAttribute("aria-hidden", String(!showCaption));
    panelStatus.setAttribute("aria-live", isActive ? "polite" : "off");
  });

  const winner = currentGameState.players.find(({ id }) => id === currentGameState.winnerId);
  if (!winner) dismissedVictoryOverlayWinnerId = null;
  victoryOverlayElement.hidden = !winner || dismissedVictoryOverlayWinnerId === winner.id;
  if (winner) {
    victoryMessageElement.textContent = `Победитель: ${winner.name}`;
  }

  if (message) turnStatusElement.textContent = message;
  else if (isHumanDiceHolding) turnStatusElement.textContent = "Отпустите кубики для броска";
  else if (isRolling) turnStatusElement.textContent = "Кубики бросаются…";
  else if (winner) turnStatusElement.textContent = `Партия завершена. Победитель: ${winner.name}.`;
  else if (model.activeValue !== null) turnStatusElement.textContent = model.player?.type === "bot"
    ? `${model.player.name} выбирает ход…`
    : "";
  else if (model.player?.type === "bot") turnStatusElement.textContent = `${model.player.name} готовится к ходу…`;
  else turnStatusElement.textContent = "Зажмите кубики для броска";
}

function updateRollingDiceFaces() {
  physicalDiceElement.querySelectorAll(".physical-die").forEach((die, index) => {
    const value = rollingDiceValues[index];
    renderDieFace(die, value);
    die.setAttribute("aria-label", `Кубик ${index + 1}: ${value}, вращается`);
  });
}

function renderInteraction(message) {
  const currentPlayer = currentGameState.players.find(({ id }) => id === currentGameState.currentPlayerId);
  const isHumanTurn = currentPlayer?.type === "human";
  gameScreenElement.dataset.playerCount = String(currentGameState.players.length);
  const validPieceIds = new Set(isHumanTurn ? validActions.map(({ pieceId }) => pieceId) : []);
  const selectedSequences = selectedBotAction
    ? [[selectedBotAction]]
    : selectedPieceId && isHumanTurn
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
    const badgeCell = getSequenceBadgeCell(sequence);
    const badgeModel = getSequenceBadge(
      sequence,
      currentGameState.turn?.dice,
      selectedPieceActionCount,
    );
    getSequenceSelectionCells(sequence).forEach((selectionCell) => {
      const cell = boardElement.querySelector(`[data-cell-id="${selectionCell}"]`);
      if (!cell) return;
      cell.classList.add("cell--valid-destination");
      cell.dataset.actionCount = String(sequence.length);
      if (selectionCell === badgeCell) renderDestinationBadge(cell, badgeModel);
      cell.title = sequence.length > 1
        ? `${selectionCell} — разыграть ${sequence.map(({ dieValue }) => dieValue).join(" → ")}`
        : `${selectionCell} — разыграть ${sequence[0].dieValue}`;
      if (isHumanTurn) {
        cell.setAttribute("role", "button");
        cell.tabIndex = 0;
      }
    });

    const teleport = getSequenceRainbowTransition(sequence);
    if (!teleport) return;
    const rainbow = boardElement.querySelector(
      `[data-rainbow-from="${teleport.from}"], [data-rainbow-to="${teleport.from}"]`,
    );
    if (!rainbow) return;
    rainbow.classList.add("rainbow-link--valid-destination");
    rainbow.dataset.actionCount = String(sequence.length);
    if (isHumanTurn) {
      rainbow.closest(".board__connections").setAttribute("aria-hidden", "false");
      rainbow.setAttribute("role", "button");
      rainbow.setAttribute("aria-label", `Радуга ${teleport.from} — ${teleport.to}`);
      rainbow.tabIndex = 0;
    }
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
    debugOutputElement.textContent = "Зажмите кубики для броска";
  }
}

function updateValidActions() {
  validActions = getTurnValidActions(currentGameState);

  if (!validActions.some(({ pieceId }) => pieceId === selectedPieceId)) clearPieceSelection();
  renderInteraction();
}

function loadScenario() {
  const scenario = DEVELOPMENT_SCENARIOS.find(({ id }) => id === debugScenarioElement.value);
  currentGameState = createDevelopmentScenarioState(scenario.id);
  renderPlayerOptions(scenario);
  debugDieOneElement.value = String(scenario.dieValue);
  debugDieTwoElement.value = "1";
  clearPieceSelection();
  updateValidActions();
}

async function advanceFinishedTurn(message) {
  if (currentGameState.status !== "playing" || !currentGameState.turn.finished) return false;

  renderInteraction(message);
  await wait(500);
  currentGameState = advanceToNextPlayer(currentGameState);
  validActions = [];
  clearPieceSelection();
  selectedBotAction = null;
  persistCurrentState();
  renderInteraction();
  scheduleAutomatedTurns();
  return true;
}

async function beginTurn(dice) {
  currentGameState = startTurn(currentGameState, dice);
  persistCurrentState();
  clearPieceSelection();
  validActions = getTurnValidActions(currentGameState);
  if (!await advanceFinishedTurn("Нет доступных действий. Ход завершён.")) updateValidActions();
  scheduleAutoHumanTurn();
}

async function performActionSequence(actions) {
  const actingPieceId = actions[0]?.pieceId ?? null;
  const keepDoubleSelection = isDoubleTurn(currentGameState)
    && selectedPieceId === actingPieceId
    && actions.every(({ pieceId }) => pieceId === actingPieceId);
  const completedWithSelectedPiece = keepDoubleSelection
    ? selectedPieceActionCount + actions.length
    : 0;

  isAnimating = true;
  validActions = [];
  clearDestinationHighlights();

  let nextGameState = currentGameState;
  let lastAction = actions[0];

  try {
    for (const [index, action] of actions.entries()) {
      const result = applyTurnAction(nextGameState, action);
      await animateActionEvents(result.events, result.gameState);
      nextGameState = preserveAutoPlaySettings(result.gameState);
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
    if (keepDoubleSelection && validActions.some(({ pieceId }) => pieceId === actingPieceId)) {
      selectedPieceId = actingPieceId;
      selectedPieceActionCount = completedWithSelectedPiece;
    } else {
      clearPieceSelection();
    }
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
    scheduleAutoHumanTurn();
  }
}

async function performAction(action) {
  await performActionSequence([action]);
}

async function activateInteractiveElement(target) {
  const currentPlayer = currentGameState.players.find(({ id }) => id === currentGameState.currentPlayerId);
  if (isAnimating || isBotRunning || isAutoHumanRunning || currentPlayer?.type !== "human") return;

  const pieceElement = target.closest(".piece--valid-action");
  if (pieceElement && boardStageElement.contains(pieceElement)) {
    const pieceId = pieceElement.dataset.pieceId;
    const pieceActions = validActions.filter((action) => action.pieceId === pieceId);
    const directAction = pieceActions.find(({ type }) => type === "release-from-sun");
    if (directAction) {
      await performAction(directAction);
    } else if (pieceActions.length > 0) {
      if (selectedPieceId === pieceId) clearPieceSelection();
      else selectPiece(pieceId);
      renderInteraction();
    }
    return;
  }

  const destinationElement = target.closest(
    ".cell--valid-destination, .rainbow-link--valid-destination",
  );
  if (!destinationElement || !selectedPieceId) return;

  const sequence = getTurnActionSequencesForPiece(currentGameState, selectedPieceId).find((candidate) => {
    if (candidate.length !== Number(destinationElement.dataset.actionCount)) return false;
    if (!destinationElement.matches(".rainbow-link--valid-destination")) {
      return getSequenceSelectionCells(candidate).includes(destinationElement.dataset.cellId);
    }

    const teleport = getSequenceRainbowTransition(candidate);
    const rainbowEndpoints = [
      destinationElement.dataset.rainbowFrom,
      destinationElement.dataset.rainbowTo,
    ];
    return teleport
      && rainbowEndpoints.includes(teleport.from)
      && rainbowEndpoints.includes(teleport.to);
  });
  if (!sequence) return;
  await performActionSequence(sequence);
}

boardStageElement.addEventListener("click", ({ target }) => {
  activateInteractiveElement(target);
});
victoryOverlayElement.addEventListener("click", (event) => {
  if (event.target !== victoryOverlayElement) return;
  dismissedVictoryOverlayWinnerId = currentGameState.winnerId;
  victoryOverlayElement.hidden = true;
});
victoryNewGameElement.addEventListener("click", restartWithCurrentSettings);
victoryGameSettingsElement.addEventListener("click", returnToSetup);
boardStageElement.addEventListener("change", (event) => {
  const input = event.target.closest("[data-auto-player-id]");
  if (!input) return;

  currentGameState = {
    ...currentGameState,
    players: currentGameState.players.map((player) => (
      player.id === input.dataset.autoPlayerId
        ? { ...player, autoPlay: input.checked }
        : player
    )),
  };
  persistCurrentState();
  renderInteraction();
  scheduleAutomatedTurns();
});
boardStageElement.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (!event.target.matches(
    ".piece--valid-action, .cell--valid-destination, .rainbow-link--valid-destination",
  )) return;
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
    if (!color) return;
    setupPlayers = swapPlayerColor(setupPlayers, playerIndex, color.value, setupPlayerCount);
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

function setRulesNavigationEnabled(enabled) {
  rulesPreviousElement.disabled = !enabled || rulesSlideIndex === 0;
  rulesNextElement.disabled = !enabled || rulesSlideIndex === rulesSlides.length - 1;
}

function renderCurrentRulesSlide() {
  const slide = rulesSlides[rulesSlideIndex];
  if (!slide) return;

  rulesSlideTitleElement.textContent = slide.title;
  renderRulesSlide(rulesContentElement, slide);
  rulesContentElement.scrollTop = 0;
  rulesProgressElement.textContent = `${rulesSlideIndex + 1} из ${rulesSlides.length}`;
  setRulesNavigationEnabled(true);
}

function goToRulesSlide(index) {
  if (rulesSlides.length === 0) return;
  rulesSlideIndex = Math.min(Math.max(index, 0), rulesSlides.length - 1);
  renderCurrentRulesSlide();
}

function loadRules() {
  if (rulesSlides.length > 0) return Promise.resolve(rulesSlides);
  if (rulesLoadPromise) return rulesLoadPromise;

  rulesLoadPromise = fetch(new URL("../game_rules.md", import.meta.url))
    .then((response) => {
      if (!response.ok) throw new Error(`Rules request failed with status ${response.status}.`);
      return response.text();
    })
    .then((markdown) => {
      rulesSlides = parseRulesMarkdown(markdown);
      if (rulesSlides.length === 0) throw new Error("The rules document has no sections.");
      return rulesSlides;
    })
    .finally(() => {
      rulesLoadPromise = null;
    });

  return rulesLoadPromise;
}

function renderRulesLoadError() {
  const message = document.createElement("p");
  const link = document.createElement("a");
  message.textContent = "Не удалось загрузить правила.";
  link.href = "game_rules.md";
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Открыть файл правил";
  rulesSlideTitleElement.textContent = "Правила";
  rulesContentElement.replaceChildren(message, link);
  rulesProgressElement.textContent = "";
  setRulesNavigationEnabled(false);
}

async function openRulesDialog(returnFocusElement = document.activeElement) {
  rulesReturnFocusElement = returnFocusElement;
  rulesSlideIndex = 0;
  rulesSlideTitleElement.textContent = "Правила";
  rulesContentElement.textContent = "Загрузка правил…";
  rulesProgressElement.textContent = "";
  setRulesNavigationEnabled(false);
  rulesDialogElement.showModal();

  try {
    await loadRules();
    if (rulesDialogElement.open) renderCurrentRulesSlide();
  } catch (error) {
    console.error("Rules could not be loaded.", error);
    if (rulesDialogElement.open) renderRulesLoadError();
  }
}

headerShowRulesElement.addEventListener("click", () => openRulesDialog());
showRulesElement.addEventListener("click", () => {
  closeGameMenu({ restoreFocus: false });
  openRulesDialog(openGameMenuElement);
});
closeRulesElement.addEventListener("click", () => rulesDialogElement.close());
rulesPreviousElement.addEventListener("click", () => goToRulesSlide(rulesSlideIndex - 1));
rulesNextElement.addEventListener("click", () => goToRulesSlide(rulesSlideIndex + 1));
rulesDialogElement.addEventListener("click", (event) => {
  if (event.target === rulesDialogElement) rulesDialogElement.close();
});
rulesDialogElement.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    rulesDialogElement.close();
    return;
  }
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  goToRulesSlide(rulesSlideIndex + (event.key === "ArrowRight" ? 1 : -1));
});
rulesDialogElement.addEventListener("close", () => {
  if (rulesReturnFocusElement?.isConnected) rulesReturnFocusElement.focus();
  rulesReturnFocusElement = null;
});

function resetGameMenuView() {
  gameMenuActionsElement.hidden = false;
  newGameConfirmationElement.hidden = true;
  pendingResetAction = null;
}

function closeGameMenu({ restoreFocus = true } = {}) {
  if (gameMenuElement.open) gameMenuElement.close();
  openGameMenuElement.setAttribute("aria-expanded", "false");
  resetGameMenuView();
  if (restoreFocus && !openGameMenuElement.hidden) openGameMenuElement.focus();
}

function openGameMenu() {
  resetGameMenuView();
  gameMenuElement.showModal();
  openGameMenuElement.setAttribute("aria-expanded", "true");
  closeGameMenuElement.focus();
}

openGameMenuElement.addEventListener("click", openGameMenu);
closeGameMenuElement.addEventListener("click", () => closeGameMenu());
gameMenuElement.addEventListener("click", (event) => {
  if (event.target === gameMenuElement) closeGameMenu();
});
gameMenuElement.addEventListener("close", () => {
  openGameMenuElement.setAttribute("aria-expanded", "false");
  resetGameMenuView();
});
function requestGameReset(action) {
  pendingResetAction = action;
  gameMenuActionsElement.hidden = true;
  newGameConfirmationElement.hidden = false;
  confirmNewGameElement.focus();
}

newGameElement.addEventListener("click", () => requestGameReset("restart"));
gameSettingsElement.addEventListener("click", () => requestGameReset("settings"));
confirmNewGameElement.addEventListener("click", () => {
  const action = pendingResetAction;
  closeGameMenu({ restoreFocus: false });
  if (action === "restart") restartWithCurrentSettings();
  else if (action === "settings") returnToSetup();
});
debugScenarioElement.addEventListener("input", loadScenario);
debugPlayerElement.addEventListener("input", () => {
  currentGameState = {
    ...currentGameState,
    currentPlayerId: debugPlayerElement.value,
    turn: createPendingTurn(),
  };
  clearPieceSelection();
  updateValidActions();
});
debugStartTurnElement.addEventListener("click", () => beginTurn([
  Number(debugDieOneElement.value),
  Number(debugDieTwoElement.value),
]));
function startHumanDiceHold() {
  if (!getDiceViewModel(currentGameState).canRoll || isAnimating || isRolling) return;
  isRolling = true;
  isHumanDiceHolding = true;
  rollingDiceValues = rollDice();
  renderDiceState();
  diceHoldTimer = window.setInterval(() => {
    rollingDiceValues = rollDice();
    updateRollingDiceFaces();
  }, DICE_ROLL_FRAME_DURATION);
}

async function finishHumanDiceHold() {
  if (!isHumanDiceHolding) return;
  const generation = flowGeneration;
  window.clearInterval(diceHoldTimer);
  diceHoldTimer = null;
  isHumanDiceHolding = false;
  renderDiceState();
  const dice = rollDice();
  const completed = await animatePostReleaseShakes(
    () => {
      rollingDiceValues = rollDice();
      updateRollingDiceFaces();
    },
    () => {
      rollingDiceValues = dice;
      updateRollingDiceFaces();
    },
    () => generation === flowGeneration && appPhase === "game",
  );
  if (!completed) {
    isRolling = false;
    rollingDiceValues = null;
    return;
  }
  isRolling = false;
  rollingDiceValues = null;
  await beginTurn(dice);
}

dicePanelElements.forEach((panel) => {
  const diceButton = panel.querySelector(".physical-dice");
  diceButton.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.currentTarget !== physicalDiceElement) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (appPhase === "first-player-roll") startFirstPlayerRollHold();
    else startHumanDiceHold();
  });
  const finishDiceHold = () => (
    appPhase === "first-player-roll" ? finishFirstPlayerRollHold() : finishHumanDiceHold()
  );
  diceButton.addEventListener("pointerup", finishDiceHold);
  diceButton.addEventListener("pointercancel", finishDiceHold);
  diceButton.addEventListener("lostpointercapture", finishDiceHold);
  diceButton.addEventListener("contextmenu", (event) => event.preventDefault());
  diceButton.addEventListener("selectstart", (event) => event.preventDefault());
  diceButton.addEventListener("dragstart", (event) => event.preventDefault());
  diceButton.addEventListener("keydown", (event) => {
    if (event.currentTarget !== physicalDiceElement
      || (event.key !== "Enter" && event.key !== " ")
      || event.repeat) return;
    event.preventDefault();
    if (appPhase === "first-player-roll") startFirstPlayerRollHold();
    else startHumanDiceHold();
  });
  diceButton.addEventListener("keyup", (event) => {
    if (event.currentTarget !== physicalDiceElement || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    if (appPhase === "first-player-roll") finishFirstPlayerRollHold();
    else finishHumanDiceHold();
  });
});

compactGameLayoutQuery.addEventListener("change", () => {
  if (appPhase === "game") renderInteraction();
  else if (appPhase === "first-player-roll") renderFirstPlayerRoll();
});

async function animateDiceRoll(dice) {
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
}

async function runBotTurns() {
  if (isBotRunning || appPhase !== "game") return;
  const generation = flowGeneration;
  isBotRunning = true;

  const ensureCurrentFlow = () => {
    if (generation !== flowGeneration || appPhase !== "game") throw new Error("Bot flow cancelled.");
  };

  try {
    while (currentGameState.status === "playing") {
      const player = currentGameState.players.find(({ id }) => id === currentGameState.currentPlayerId);
      if (player?.type !== "bot") break;

      await wait(BOT_TURN_START_DELAY);
      ensureCurrentFlow();
      const nextState = await playBotTurn(currentGameState, {
        onRoll: async (dice) => {
          ensureCurrentFlow();
          await animateDiceRoll(dice);
          ensureCurrentFlow();
        },
        onTurnStarted: async (state) => {
          currentGameState = preserveAutoPlaySettings(state);
          validActions = getTurnValidActions(currentGameState);
          persistCurrentState();
          renderInteraction();
        },
        onActionSelected: async (action, state) => {
          ensureCurrentFlow();
          currentGameState = preserveAutoPlaySettings(state);
          selectPiece(action.pieceId);
          selectedBotAction = action;
          validActions = [];
          renderInteraction(`${player.name} выбирает ${action.pieceId}.`);
          await wait(BOT_ACTION_CHOICE_DELAY);
          ensureCurrentFlow();
        },
        onActionApplied: async (action, result) => {
          isAnimating = true;
          try {
            await animateActionEvents(result.events, result.gameState);
          } catch (error) {
            console.error("Bot action animation failed.", error);
          }
          ensureCurrentFlow();
          currentGameState = preserveAutoPlaySettings(result.gameState);
          clearPieceSelection();
          selectedBotAction = null;
          validActions = getTurnValidActions(currentGameState);
          persistCurrentState();
          renderInteraction(`${action.pieceId} перемещена на ${action.destination}.`);
          isAnimating = false;
          if (currentGameState.status === "playing" && !currentGameState.turn.finished) {
            await wait(BOT_NEXT_ACTION_DELAY);
            ensureCurrentFlow();
          }
        },
        onTurnFinished: async () => {
          renderInteraction(`${player.name} завершает ход.`);
          await wait(BOT_NEXT_ACTION_DELAY);
          ensureCurrentFlow();
        },
      });
      ensureCurrentFlow();
      currentGameState = preserveAutoPlaySettings(nextState);
      validActions = getTurnValidActions(currentGameState);
      clearPieceSelection();
      selectedBotAction = null;
      persistCurrentState();
      renderInteraction();
    }
  } catch (error) {
    if (error.message !== "Bot flow cancelled.") console.error("Bot turn failed.", error);
  } finally {
    isBotRunning = false;
    isAnimating = false;
    isRolling = false;
    isHumanDiceHolding = false;
    window.clearInterval(diceHoldTimer);
    diceHoldTimer = null;
    rollingDiceValues = null;
    if (generation === flowGeneration && appPhase === "game") {
      renderInteraction();
      scheduleAutoHumanTurn();
    }
  }
}

async function runAutoHumanTurns() {
  if (isAutoHumanRunning || isBotRunning || appPhase !== "game") return;
  const generation = flowGeneration;
  isAutoHumanRunning = true;

  const ensureCurrentFlow = () => {
    if (generation !== flowGeneration || appPhase !== "game") {
      throw new Error("Automatic Human flow cancelled.");
    }
  };

  try {
    while (currentGameState.status === "playing") {
      const player = currentGameState.players.find(({ id }) => id === currentGameState.currentPlayerId);
      if (player?.type === "bot") {
        scheduleBotTurns();
        break;
      }

      const step = getAutoHumanStep(currentGameState);
      if (step.type === "wait") break;

      if (step.type === "roll") {
        await wait(AUTO_TURN_START_DELAY);
        ensureCurrentFlow();
        if (getAutoHumanStep(currentGameState).type !== "roll") break;
        const dice = rollDice();
        await animateDiceRoll(dice);
        ensureCurrentFlow();
        await beginTurn(dice);
        ensureCurrentFlow();
        continue;
      }

      selectPiece(step.action.pieceId);
      renderInteraction();
      await wait(AUTO_ACTION_CHOICE_DELAY);
      ensureCurrentFlow();
      await performAction(step.action);
      ensureCurrentFlow();
      if (currentGameState.status === "playing") await wait(AUTO_NEXT_ACTION_DELAY);
    }
  } catch (error) {
    if (error.message !== "Automatic Human flow cancelled.") {
      console.error("Automatic Human turn failed.", error);
    }
  } finally {
    isAutoHumanRunning = false;
    if (generation === flowGeneration && appPhase === "game") renderInteraction();
  }
}

function scheduleBotTurns() {
  window.setTimeout(() => runBotTurns(), 0);
}

function scheduleAutoHumanTurn() {
  window.setTimeout(() => runAutoHumanTurns(), 0);
}

function scheduleAutomatedTurns() {
  scheduleBotTurns();
  scheduleAutoHumanTurn();
}

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
    clearPieceSelection();
    showPhase("game");
    renderInteraction();
    persistCurrentState();
    scheduleAutomatedTurns();
    return true;
  }

  if (savedState.phase === "first-player-roll") {
    pendingPlayers = savedState.pendingPlayers;
    firstPlayerRollState = savedState.firstPlayerRollState;
    if (firstPlayerRollState.status === "complete") {
      currentGameState = createGame({
        players: pendingPlayers,
        turnOrder: createClockwiseTurnOrder(pendingPlayers, firstPlayerRollState.winnerId),
      });
      validActions = [];
      clearPieceSelection();
      showPhase("game");
      persistCurrentState();
      renderInteraction();
      scheduleAutomatedTurns();
      return true;
    }
    currentGameState = createGame({
      players: pendingPlayers,
      turnOrder: createClockwiseTurnOrder(pendingPlayers, pendingPlayers[0].id),
    });
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
