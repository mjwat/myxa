import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseRulesMarkdown } from "../js/rules-dialog.js";

test("player-facing rules are split into one slide per main section", async () => {
  const markdown = await readFile(new URL("../game_rules.md", import.meta.url), "utf8");
  const slides = parseRulesMarkdown(markdown);

  assert.deepEqual(slides.map(({ title }) => title), [
    "Цель игры",
    "Начало игры",
    "Ход игрока",
    "Выход на поле",
    "Движение по полю",
    "Съедание",
    "Радуга",
    "Болото",
    "Дом",
    "Победа",
  ]);
  assert.match(slides.find(({ title }) => title === "Ход игрока").body, /### Дубль/);
});

test("document title and content before the first section are ignored", () => {
  const slides = parseRulesMarkdown("Введение\n\n# Игра\n\nТекст\n\n## Раздел\n\nПравило");

  assert.deepEqual(slides, [
    { title: "Раздел", body: "Правило" },
  ]);
});
