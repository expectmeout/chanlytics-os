/**
 * The answer while it is written (spec 7.4; the end-to-end review, C1): its Say so far, cleaned as the final's is, and
 * Show's figures and rows as each one closes. With the answer tool (ASK_ANSWER_TOOL) the answer's JSON streams on every
 * round, so a figure or a row can be drawn the moment its object is whole rather than when the final lands. Each is
 * grounded exactly as the final will ground it (normalizeAnswer), so a row the turn did not read is never drawn, not
 * even for a moment. A preview: the final message is the truth. Pure.
 */
import { cleanAnswer } from "./answer-text";
import { normalizeAnswer, type AskFigure, type AskItem } from "./ask-answer";
import type { AskLanguage } from "./ask-language";
import type { AskReadSet } from "./citations";

/** Show as written so far: the figures and the rows whose objects have closed, grounded. */
export interface AskShowPreview {
  figures: AskFigure[];
  items: AskItem[];
}

/** A Say preview as the turn sends it: the headline and the detail so far, and Show once a figure or a row is whole. */
export interface AskSayPreview {
  headline: string;
  detail: string;
  show?: AskShowPreview;
}

/** Where the string that opens at `at` closes, or -1 when it has not closed yet. */
function stringEnd(s: string, at: number): number {
  for (let i = at + 1; i < s.length; i++) {
    if (s[i] === "\\") i++;
    else if (s[i] === '"') return i;
  }
  return -1;
}

interface Frame {
  open: "{" | "[";
  /** The key it stands under in its parent object, "[]" in an array, null at the root. */
  name: string | null;
  start: number;
  key: string | null;
  expectsKey: boolean;
}

/**
 * The objects of `show.figures` and `show.items` that have closed in a JSON prefix, in order: read by structure, the
 * strings and their escapes respected, so a brace or a key's name inside a string is never taken for one.
 */
export function closedShowEntries(prefix: string): { figures: unknown[]; items: unknown[] } {
  const got: { figures: unknown[]; items: unknown[] } = { figures: [], items: [] };
  const stack: Frame[] = [];
  for (let i = 0; i < prefix.length; i++) {
    const c = prefix[i];
    const top = stack.at(-1);
    if (c === '"') {
      const end = stringEnd(prefix, i);
      if (end < 0) break;
      if (top?.open === "{" && top.expectsKey) {
        top.key = String(JSON.parse(prefix.slice(i, end + 1)));
        top.expectsKey = false;
      }
      i = end;
    } else if (c === "{" || c === "[") {
      const name = top ? (top.open === "{" ? top.key : "[]") : null;
      stack.push({ open: c, name, start: i, key: null, expectsKey: c === "{" });
    } else if (c === "}" || c === "]") {
      const done = stack.pop();
      // An entry closed: the root, then `show`, then the list it stands in.
      const [, show, list] = stack;
      const at = stack.length === 3 && show?.name === "show" && list?.open === "[" ? list.name : null;
      if (done?.open === "{" && (at === "figures" || at === "items")) {
        try {
          got[at].push(JSON.parse(prefix.slice(done.start, i + 1)));
        } catch {
          // A closed object that does not parse is no entry: the final says what it was.
        }
      }
    } else if (c === "," && top?.open === "{") top.expectsKey = true;
  }
  return got;
}

/** Show as written so far, grounded in this turn's reads as the final will be: empty until a figure or a row closes. */
export function partialShow(prefix: string, read: AskReadSet, language: AskLanguage): AskShowPreview {
  const { figures, items } = closedShowEntries(prefix);
  if (!figures.length && !items.length) return { figures: [], items: [] };
  const shaped = normalizeAnswer({ say: { headline: "-" }, show: { figures, items }, language }, read, language);
  return shaped.ok
    ? { figures: shaped.answer.show.figures, items: shaped.answer.show.items }
    : { figures: [], items: [] };
}

/**
 * The preview a turn sends as its answer is written: Say so far with nothing past a tag (cleanAnswer, the leak seen on
 * production), and Show once a figure or a row has closed in `json` (the answer's JSON so far; "" for words with no
 * shape).
 */
export function previewOf(
  say: { headline: string; detail: string },
  json: string,
  read: AskReadSet,
  language: AskLanguage,
): AskSayPreview {
  const words = { headline: cleanAnswer(say.headline), detail: cleanAnswer(say.detail) };
  const show = json ? partialShow(json, read, language) : null;
  return show && (show.figures.length || show.items.length) ? { ...words, show } : words;
}
