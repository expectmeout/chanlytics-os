/**
 * The answer while its JSON is still arriving (the Line's spec, 7.4): the headline and the detail read from a prefix of
 * what the model has written so far, drawn as the final message will draw them (ask/answer/normalize.ts sayAsDrawn), and Show's
 * figures and rows as each one closes (the end-to-end review, C1). With the answer tool (ASK_ANSWER_TOOL) the answer's
 * JSON streams on every round, so a figure or a row can be drawn the moment its object is whole rather than when the
 * final lands. Each is grounded exactly as the final will ground it (normalizeAnswer), so a row the turn did not read is
 * never drawn, not even for a moment. A preview: the final message is the truth. And the answer of a turn the person
 * stopped while it was written (stoppedAnswer). Pure.
 */
import { ASK_ANSWER_CAPS, clipLines, type AskAnswer, type AskFigure, type AskItem } from "./answer/shape";
import { failedAnswer } from "./answer/prose";
import { normalizeAnswer, sayAsDrawn } from "./answer/normalize";
import { opensWithBlock } from "./answer-text";
import type { AskLanguage } from "./language";
import type { AskReadSet } from "./citations";

/**
 * The string value of `"key": "…"` in a JSON prefix, decoded as far as it has arrived: up to the first unescaped
 * quote, or the end of what is there.
 */
function partialField(text: string, key: string): string {
  const index = text.indexOf(`"${key}"`);
  if (index < 0) return "";
  const colon = text.indexOf(":", index + key.length + 2);
  if (colon < 0) return "";
  let next = colon + 1;
  while (next < text.length && /\s/.test(text.charAt(next))) next++;
  if (text[next] !== '"') return "";
  next++;
  let out = "";
  while (next < text.length) {
    const item = text[next];
    if (item === '"') break;
    if (item === "\\") {
      const nextChar = text[next + 1];
      if (nextChar === undefined) break;
      if (nextChar === "u") {
        const hex = text.slice(next + 2, next + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16) || 0x20);
        next += 6;
        continue;
      }
      out +=
        nextChar === "n"
          ? "\n"
          : nextChar === "t"
            ? "\t"
            : nextChar === "r"
              ? "\r"
              : nextChar === "b"
                ? "\b"
                : nextChar === "f"
                  ? "\f"
                  : nextChar;
      next += 2;
      continue;
    }
    out += item;
    next++;
  }
  return out;
}

/**
 * Say while the answer's JSON is still arriving (spec 7.4): the headline and the detail so far, from wherever `say`
 * appears, drawn as the final message will draw them (sayAsDrawn), so a line the preview shows is never folded away
 * when the answer lands; null before it appears. A preview only: the final message is the truth.
 */
export function partialSay(prefix: string): { headline: string; detail: string } | null {
  const at = prefix.indexOf('"say"');
  if (at < 0) return null;
  const rest = prefix.slice(at);
  return sayAsDrawn({ headline: partialField(rest, "headline"), detail: partialField(rest, "detail") });
}

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
function closedShowEntries(prefix: string): { figures: unknown[]; items: unknown[] } {
  const result: { figures: unknown[]; items: unknown[] } = { figures: [], items: [] };
  const stack: Frame[] = [];
  for (let index = 0; index < prefix.length; index++) {
    const item = prefix[index];
    const top = stack.at(-1);
    if (item === '"') {
      const end = stringEnd(prefix, index);
      if (end < 0) break;
      if (top?.open === "{" && top.expectsKey) {
        top.key = String(JSON.parse(prefix.slice(index, end + 1)));
        top.expectsKey = false;
      }
      index = end;
    } else if (item === "{" || item === "[") {
      const name = top ? (top.open === "{" ? top.key : "[]") : null;
      stack.push({ open: item, name, start: index, key: null, expectsKey: item === "{" });
    } else if (item === "}" || item === "]") {
      const done = stack.pop();
      // An entry closed: the root, then `show`, then the list it stands in.
      const [, show, list] = stack;
      const at = stack.length === 3 && show?.name === "show" && list?.open === "[" ? list.name : null;
      if (done?.open === "{" && (at === "figures" || at === "items")) {
        try {
          result[at].push(JSON.parse(prefix.slice(done.start, index + 1)));
        } catch {
          // A closed object that does not parse is no entry: the final says what it was.
        }
      }
    } else if (item === "," && top?.open === "{") top.expectsKey = true;
  }
  return result;
}

/** Show as written so far, grounded in this turn's reads as the final will be: empty until a figure or a row closes. */
function partialShow(prefix: string, read: AskReadSet, language: AskLanguage): AskShowPreview {
  const { figures, items } = closedShowEntries(prefix);
  if (!figures.length && !items.length) return { figures: [], items: [] };
  const shaped = normalizeAnswer({ say: { headline: "-" }, show: { figures, items }, language }, read, language);
  return shaped.ok
    ? { figures: shaped.answer.show.figures, items: shaped.answer.show.items }
    : { figures: [], items: [] };
}

/**
 * The preview a turn sends as its answer is written: Say as drawn so far (partialSay, or a prose answer's), and Show once
 * a figure or a row has closed in `json` (the answer's JSON so far; "" for words with no shape).
 */
export function answerSoFar(
  say: { headline: string; detail: string },
  json: string,
  read: AskReadSet,
  language: AskLanguage,
): AskSayPreview {
  const show = json ? partialShow(json, read, language) : null;
  return show && (show.figures.length || show.items.length) ? { ...say, show } : say;
}

/* ------------------------------------------------------------- a stopped turn */

/*
 * A turn the person stopped (the Line's Stop): the Line draws it the moment Stop is pressed, and the turn's door keeps
 * the same answer on the thread (the dashboard's server/ask/turn.ts), so the conversation opened again shows what the
 * person saw, and the next question's history says the turn was stopped before its answer.
 */

/** What a stopped turn says, as its headline: to the person, and to the model reading the thread's history. */
const ASK_STOPPED_WORDS = {
  en: "Stopped before the answer was finished.",
  es: "Detenido antes de terminar la respuesta.",
} as const;

/**
 * A stopped turn's answer: marked failed by its message, the headline saying it was stopped, and what its Say had
 * written so far under it, as the person read it, its lines kept (a table or a list stays one), the detail on a line of
 * its own when it opens with one. Nothing written yet leaves the headline alone.
 */
export function stoppedAnswer(spoken: { headline: string; detail: string } | null, language: AskLanguage): AskAnswer {
  const a = failedAnswer(ASK_STOPPED_WORDS[language === "es" ? "es" : "en"], language);
  const own = opensWithBlock(spoken?.detail ?? "");
  const so = [spoken?.headline, spoken?.detail].filter(Boolean).join(own ? "\n" : " ");
  return { ...a, say: { ...a.say, detail: clipLines(so, ASK_ANSWER_CAPS.detail) } };
}
