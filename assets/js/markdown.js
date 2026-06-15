const ADVANCED_MARKDOWN_URL = "GridPool%20201_%20Advanced%20Architectural%20Deep%20Dive.md";

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(/\\([\\`*_{}\[\]()#+\-.!<>])/g, "$1")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\s{2,}$/g, "");
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listType = null;
  let inCode = false;
  let codeLines = [];

  const closeParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!listType) {
      return;
    }
    html.push(`</${listType}>`);
    listType = null;
  };

  const closeCode = () => {
    if (!inCode) {
      return;
    }
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
    inCode = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith("```")) {
      if (inCode) {
        closeCode();
      } else {
        closeParagraph();
        closeList();
        inCode = true;
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (line.trim() === "") {
      closeParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      closeParagraph();
      closeList();
      const level = Math.min(4, Math.max(3, heading[1].length));
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = /^\*\s+(.+)$/.exec(line);
    if (bullet) {
      closeParagraph();
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${renderInline(bullet[1])}</li>`);
      continue;
    }

    const numbered = /^\d+\.\s+(.+)$/.exec(line);
    if (numbered) {
      closeParagraph();
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${renderInline(numbered[1])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(line.trim());
  }

  closeParagraph();
  closeList();
  closeCode();

  return html.join("\n");
}

async function loadAdvancedMarkdown() {
  const target = document.getElementById("advanced-markdown");
  if (!target) {
    return;
  }

  try {
    const response = await fetch(ADVANCED_MARKDOWN_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const markdown = await response.text();
    target.innerHTML = renderMarkdown(markdown);
  } catch (error) {
    target.innerHTML = `
      <p>Could not load the advanced notes automatically.</p>
      <p><a class="button" href="${ADVANCED_MARKDOWN_URL}">Open the markdown file</a></p>
    `;
  }
}

loadAdvancedMarkdown();
