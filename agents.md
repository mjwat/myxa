# AGENTS.md

## Read first

Before making changes, read the relevant project documentation:

-   `readme.md` --- product scope, UX and high-level architecture.
-   `game_rules.md` --- player-facing game rules and source of truth for
    mechanics.
-   `game_model.md` --- technical board model, game entities and
    rule-engine conventions.

Do not duplicate these specifications in code or in this file.

## Principles

-   Keep the project small and understandable.
-   Prefer vanilla HTML, CSS and JavaScript and the existing project
    stack.
-   Do not add frameworks, game engines, build tools or external
    dependencies unless explicitly requested or clearly necessary.
-   Do not implement features outside the MVP without being asked.
-   Make focused changes; do not refactor unrelated code.

## Architecture

Keep these concerns separate:

-   **Board data** --- cells, routes and special connections.
-   **Game state** --- serializable current match state.
-   **Rules** --- valid actions and their results.
-   **UI** --- rendering, interaction and animation.
-   **Bot** --- chooses from actions produced by the same rule engine
    used for humans.

The UI and Bot must not implement their own game rules.

Board geometry must not determine game movement. Cell coordinates are
for rendering; routes and connections are game data.

## Rules

`game_rules.md` is the source of truth for game behavior.

`game_model.md` describes how those rules are represented technically.

If a rule is missing or ambiguous, do not invent it. Ask for
clarification.

When fixing a rule bug, add or update a regression test when practical.

Prioritize testing rule logic and edge cases over visual implementation.

## UI

The board must work on mobile and desktop.

Prefer a responsive 13 × 13 CSS Grid with separate layers for pieces,
highlights and decorative graphics where useful.

Do not use Canvas unless explicitly requested.

Game state is authoritative. Animations and sound are presentation and
must not affect rule outcomes.

## Persistence

Persist the current app flow (setup, first-player roll or game) in
`localStorage` so it can be restored after reload.

Persist only serializable game data, not DOM or transient animation
state.

Keep saved-state format versionable.

## Testing

Run the test suite with `npm test` after changing rules, game state,
persistence or shared UI behavior.

## Scope

Do not implement unless requested:

-   online multiplayer;
-   accounts or backend;
-   cloud saves;
-   Undo or move history;
-   multiple bot difficulties or personalities;
-   background music;
-   alternate themes.

Prefer completing a reliable MVP over preparing abstractions for
hypothetical future features.
