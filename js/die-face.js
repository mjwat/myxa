const DIE_PIP_POSITIONS = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

export function getDiePipPositions(value) {
  return DIE_PIP_POSITIONS[value] ?? [];
}

export function appendDiePips(die, value, className) {
  getDiePipPositions(value).forEach((position) => {
    const pip = document.createElement("span");
    pip.className = className;
    pip.style.gridArea = `${Math.ceil(position / 3)} / ${((position - 1) % 3) + 1}`;
    die.append(pip);
  });
}
