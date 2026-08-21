# Game Model

Technical representation of the board and game mechanics.

Player-facing rules are defined in `GAME_RULES.md`.\
Product scope and UX are defined in `README.md`.

## Board

The board is a fixed 13 × 13 grid with four symmetric sides:

-   `A`
-   `B`
-   `C`
-   `D`

Technical cell IDs are internal and are never shown to players.

## Cell IDs

### Main route

Each side contains 12 positions:

``` text
A-0 ... A-11
B-0 ... B-11
C-0 ... C-11
D-0 ... D-11
```

The main route follows:

``` text
A-0 → A-1 → ... → A-11
    → B-0 → B-1 → ... → B-11
    → C-0 → ...
    → D-11
    → A-0
```

Movement is clockwise.

`SIDE-0` is the starting cell for that side.

### HOME

Each player has four HOME positions:

``` text
A-H-1 → A-H-2 → A-H-3 → A-H-4
```

and equivalently for `B`, `C`, `D`.

After completing a full lap, a piece passes through its own `SIDE-0` and
then enters:

``` text
SIDE-H-1
```

instead of continuing to `SIDE-1`.

### Rainbow

Each side contains one bidirectional rainbow:

``` text
SIDE-2 ↔ SIDE-10
```

The transition happens only when movement **ends** on one of these
cells.

Passing through the cell does not trigger the rainbow.

### Swamp

Each side contains a swamp.

Entrance:

``` text
SIDE-3
```

Landing on the entrance automatically moves the piece to:

``` text
SIDE-3-X
```

Internal route:

``` text
SIDE-3-X → SIDE-3-Y → SIDE-3-Z → SIDE-6
```

Required die values:

  Position       Required value Destination
  ------------ ---------------- -------------
  `SIDE-3-X`                  1 `SIDE-3-Y`
  `SIDE-3-Y`                  3 `SIDE-3-Z`
  `SIDE-3-Z`                  6 `SIDE-6`

A successful swamp action always moves the selected piece exactly one
position.

`SIDE-6` is the normal board cell immediately after the swamp.

## Piece state

Each piece has a stable ID, for example:

``` text
A-P1
A-P2
A-P3
A-P4
```

A piece should explicitly track its current state rather than infer it
from the DOM.

Possible locations:

``` js
"outside"
"board"
"swamp"
"home"
"sun"
"finished"
```

Example:

``` js
{
  id: "A-P2",
  playerId: "A",
  location: "board",
  cellId: "C-7",
  laps: 0
}
```

The model must contain enough information to distinguish a piece
approaching its HOME after completing a lap from a piece that has only
recently entered the board.

## Player

Example:

``` js
{
  id: "A",
  name: "Player 1",
  type: "human",
  color: "red",
  side: "A",
  pieceIds: ["A-P1", "A-P2", "A-P3", "A-P4"]
}
```

`type` is:

``` text
human | bot
```

Color is visual only. Side determines the player's start and HOME.

## Game state

Game state must be serializable.

Example shape:

``` js
{
  version: 1,
  status: "playing",
  players: [],
  pieces: {},
  turnOrder: ["A", "C", "B", "D"],
  currentPlayerId: "A",
  turn: {
    dice: [6, 3],
    remainingValues: [6, 3],
    activeValue: 6
  },
  winnerId: null
}
```

Do not store DOM references, animation state or other presentation data
in game state.

## Actions

The rule engine exposes valid **actions**.

UI and Bot choose between these actions; they do not construct arbitrary
moves.

Example:

``` js
{
  type: "move",
  pieceId: "A-P2",
  dieValue: 5,
  destination: "B-4"
}
```

Possible action types may include:

``` text
move
enter-board
release-from-sun
swamp-move
```

Special effects may be attached to an action or produced while resolving
it.

The exact object shape may evolve during implementation. Keep one
canonical representation rather than introducing separate move formats
for UI and Bot.

## Dice sequence

A normal roll such as `5 + 3` produces `[5, 3]`.

The larger value must be resolved first. It cannot be skipped or
reordered in order to make the smaller value playable.

If the active value has no valid actions, it is discarded and resolution
continues with the next value.

A double such as `3 + 3` produces `[3, 3, 3, 3]`.

Use the maximum number of actions that can legally be performed.

## Movement

Normal movement follows the main route one position at a time.

A move is valid only if:

-   the complete required distance can be travelled;
-   no intermediate normal cell is occupied;
-   the final position is valid.

Pieces cannot jump over either friendly or enemy pieces.

Landing on an enemy piece captures it. Landing on a friendly piece is
invalid.

## Entering the board

A piece with location `outside` can use a `6`.

Result:

``` text
outside → player's SIDE-0
```

The `6` is consumed.

The newly entered piece may use another remaining die value during the
same turn.

The action is invalid if the start cell cannot legally receive the
piece.

## Capture and Sun

Landing on an enemy piece on a capturable normal cell sends it to `sun`.

A piece on the sun can use a `6` to become `outside`.

This does **not** place it on the board. A second `6` is required later
to enter the board normally.

## Rainbow resolution

If normal movement ends on `SIDE-2`, resolve `SIDE-2 → SIDE-10`.

If it ends on `SIDE-10`, resolve `SIDE-10 → SIDE-2`.

If the Rainbow endpoint where normal movement lands contains a friendly
piece, the action is invalid and teleport does not begin.

The die action ends after the teleport.

At the destination:

-   enemy piece → capture;
-   friendly piece → action is invalid.

Rainbow does not trigger when merely passing through its endpoint.

## Swamp resolution

Landing on `SIDE-3` automatically places the moving piece at `SIDE-3-X`.

Once inside, normal distance movement is suspended for that piece.

Only the die value required by its current swamp position can move it.

### Push

If the next swamp position is occupied, move the selected piece forward
and push the occupying piece one position forward.

Continue recursively for a chain of pieces.

Pieces inside the swamp may push friendly or enemy pieces.

There is no capture inside the swamp.

When a pushed piece reaches `SIDE-6`, normal occupancy rules apply:

-   enemy occupant → capture;
-   friendly occupant → push/action is blocked.

## HOME

After a piece has completed its lap and passed its own start, its route
continues into its HOME.

Only the owning player's pieces may enter that HOME.

Movement inside HOME uses normal die values.

A piece must be able to move the **exact** number of positions.

Pieces cannot jump over each other.

The final arrangement contains all four pieces without gaps.

A piece on its final required position is considered finished and no
longer moves.

## Win condition

The player wins immediately when all four of their pieces are finished
in HOME.

Do not resolve remaining die actions after the winning action.

The match status becomes `finished` and `winnerId` is set.

## Rule engine API

Exact function names are implementation details, but the rule layer
should conceptually support:

``` js
getValidActions(gameState)
getValidActionsForPiece(gameState, pieceId)
applyAction(gameState, action)
```

The rule engine must not manipulate DOM, play sounds or perform
animations.

## Events

It may be useful for action resolution to return presentation-neutral
events:

``` js
[
  { type: "piece-moved", pieceId: "A-P1", path: [...] },
  { type: "teleported", pieceId: "A-P1", from: "...", to: "..." },
  { type: "captured", pieceId: "B-P2" }
]
```

UI may use these events for animation and sound.

Events describe what happened. They must not determine game rules.

## Invariants

Keep these true throughout the game:

-   each piece has exactly one location;
-   a normal cell contains at most one piece;
-   pieces cannot occupy another player's HOME;
-   finished pieces cannot move;
-   only valid actions returned by the rule engine can modify the game;
-   UI and Bot use the same action model;
-   board coordinates never determine legal movement.
