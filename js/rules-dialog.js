export function parseRulesMarkdown(markdown) {
  const slides = [];
  let currentSlide = null;

  for (const line of markdown.replaceAll("\r\n", "\n").split("\n")) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (currentSlide) {
        currentSlide.body = currentSlide.body.join("\n").trim();
        slides.push(currentSlide);
      }
      currentSlide = { title: heading[1].trim(), body: [] };
      continue;
    }

    if (currentSlide) currentSlide.body.push(line);
  }

  if (currentSlide) {
    currentSlide.body = currentSlide.body.join("\n").trim();
    slides.push(currentSlide);
  }

  return slides;
}

function appendInlineMarkdown(element, text) {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);

  tokens.forEach((token) => {
    if (token.startsWith("**") && token.endsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = token.slice(2, -2);
      element.append(strong);
      return;
    }

    if (token.startsWith("`") && token.endsWith("`")) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      element.append(code);
      return;
    }

    element.append(document.createTextNode(token));
  });
}

export function renderRulesSlide(container, slide) {
  const fragment = document.createDocumentFragment();
  let paragraphLines = [];
  let activeList = null;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const paragraph = document.createElement("p");
    appendInlineMarkdown(paragraph, paragraphLines.join(" "));
    fragment.append(paragraph);
    paragraphLines = [];
  };

  const closeList = () => {
    activeList = null;
  };

  slide.body.split("\n").forEach((line) => {
    const trimmedLine = line.trim();
    const subheading = trimmedLine.match(/^###\s+(.+)$/);
    const unorderedItem = trimmedLine.match(/^[-*]\s+(.+)$/);
    const orderedItem = trimmedLine.match(/^\d+\.\s+(.+)$/);

    if (!trimmedLine) {
      flushParagraph();
      closeList();
      return;
    }

    if (subheading) {
      flushParagraph();
      closeList();
      const heading = document.createElement("h3");
      appendInlineMarkdown(heading, subheading[1]);
      fragment.append(heading);
      return;
    }

    const listItem = unorderedItem ?? orderedItem;
    if (listItem) {
      flushParagraph();
      const listType = unorderedItem ? "ul" : "ol";
      if (!activeList || activeList.tagName.toLowerCase() !== listType) {
        activeList = document.createElement(listType);
        fragment.append(activeList);
      }
      const item = document.createElement("li");
      appendInlineMarkdown(item, listItem[1]);
      activeList.append(item);
      return;
    }

    closeList();
    paragraphLines.push(trimmedLine);
  });

  flushParagraph();
  container.replaceChildren(fragment);
}
