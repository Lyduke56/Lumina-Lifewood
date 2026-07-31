/**
 * Tidy the markdown a model writes, so a list renders as a list.
 *
 * Models write in markdown by habit but not always correctly, and two mistakes show up
 * constantly. They bullet with "•" on a single line — "I recommend: • a line chart • a bar
 * chart" — which markdown treats as one paragraph of prose. And they follow the last item
 * of a list immediately with a question, which markdown swallows into that item: a
 * customer saw "Notes (any comments) Does that sound right?" as one bullet, with the
 * question invisible as a question.
 *
 * Instructing the model not to do this was the alternative and would have been the fourth
 * time that answer was tried; on this project the pattern is settled — instructions ask,
 * the code enforces. Nothing here changes what was said, only where the line breaks fall.
 */

const BULLET = /^\s*([-*+]|\d+[.)])\s+/;

/** Is this line already a list item? */
function isItem(line: string): boolean {
  return BULLET.test(line);
}

export function tidyMarkdown(text: string): string {
  const lines: string[] = [];
  let inCode = false;

  for (const raw of text.split("\n")) {
    if (/^\s*```/.test(raw)) {
      inCode = !inCode;
      lines.push(raw);
      continue;
    }
    if (inCode) {
      lines.push(raw);
      continue;
    }

    // "a • b • c" on one line is three items the model meant to stack. Only split when a
    // bullet appears mid-line, so a lone "• item" is just converted below.
    const inline = raw.split(/\s+•\s+/);
    if (inline.length > 1) {
      const [lead, ...rest] = inline;
      if (lead.trim() && !/^\s*•/.test(raw)) lines.push(lead.trimEnd());
      for (const part of rest) lines.push(`- ${part.trim()}`);
      continue;
    }
    lines.push(raw.replace(/^(\s*)•\s+/, "$1- "));
  }

  // A list needs a blank line on each side, or the text touching it is absorbed into it.
  const spaced: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const previous = spaced[spaced.length - 1];
    const opensList = isItem(line) && previous !== undefined && previous.trim() && !isItem(previous);
    const closesList =
      !isItem(line) && line.trim() && previous !== undefined && isItem(previous);
    if (opensList || closesList) spaced.push("");
    spaced.push(line);
  }
  return spaced.join("\n");
}
