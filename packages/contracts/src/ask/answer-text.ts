/**
 * The rules an answer's text passes before the Line draws it: tag-shaped junk out (cleanAnswer), a figure with nothing
 * read behind it (isUngrounded), whether two questions are one thread, the Open button's words, a next question that
 * echoes a place already offered, whether its own words claim a write (claimsWrite), where its headline's first
 * sentence ends (firstSentence), and the formatting its words may carry, read as blocks the Line draws (answerBlocks)
 * and as the plain words Copy and a voice take (answerPlain). The answer's shape and its normaliser are ask-answer.ts's.
 */
import type { AskAnswer, AskList } from "./ask-answer";
import type { AskLanguage } from "./ask-language";

/* ------------------------------------------------------------- the answer */

/**
 * Tag-shaped junk out of an answer.
 *
 * Once in thirty turns the model wrote the finish call's next field inside
 * the answer string: "…mid-call.</answer>\n<parameter name=\"citations\">[…]".
 * The person saw a closing tag and a raw id. The answer ends where such a
 * tag begins; a leading <answer> is dropped; stray tags in the middle go.
 */
const TAG_CUT = /<\/answer>|<\/?parameter\b|<\/?invoke\b|<\/?function_calls\b|<\/?tool_call\b/i;
export function cleanAnswer(raw: string): string {
  let s = raw.replace(/^\s*<answer>\s*/i, "");
  const cut = s.search(TAG_CUT);
  if (cut >= 0) s = s.slice(0, cut);
  return s
    .replace(/<\/?[a-z_]+(\s[^>]*)?>/gi, "")
    .replace(/\s+$/g, "")
    .trim();
}

/**
 * Words a sentence's stop may follow without ending it: a title, a month or an abbreviation before a name or a number
 * ("Dr. Lin", "Oct. 13", "St. Louis"). A single letter (an initial) and a word with a dot inside it ("U.S.", "a.m.")
 * are not ends either.
 */
const NOT_AN_END = new Set(
  "mr mrs ms dr st sr sra srta jr vs no etc approx inc ltd co ave blvd mt ft jan feb mar apr jun jul aug sep sept oct nov dec ene abr ago dic".split(
    " ",
  ),
);
/** A stop, any closing quote or bracket after it, the space, and what starts a sentence: a capital, a digit, ¿ or ¡. */
const HEADLINE_STOP = /[.!?]["'”’)\]]*\s+(?=[\p{Lu}\d¿¡"“'‘(])/gu;

/**
 * The headline's first sentence and the words after it. The headline is one sentence (the rules say so, and the eval
 * holds it), but the model now and then writes two ("I can't give a refund from here. Money is locked by charter."):
 * the second is the detail's opening. Decided by the words before a stop and the letter after it alone, so a stop that
 * ends the first sentence while it streams still ends it once the answer lands.
 */
export function firstSentence(s: string): [string, string] {
  for (const m of s.matchAll(HEADLINE_STOP)) {
    const before = /[\p{L}.]+$/u.exec(s.slice(0, m.index))?.[0] ?? "";
    if (m[0][0] === "." && (before.length === 1 || before.includes(".") || NOT_AN_END.has(before.toLowerCase())))
      continue;
    const stop = m[0].trimEnd().length;
    return [s.slice(0, m.index + stop), s.slice(m.index + m[0].length)];
  }
  return [s, ""];
}

/* --------------------------------------------------------------- grounding */

/**
 * An answer that states a figure without having read anything is not from
 * the workspace. Times, counts and money all carry digits; a turn with no
 * read tool behind such an answer is marked so the palette can say so.
 */
export function isUngrounded(answer: string, reads: number): boolean {
  return reads === 0 && /\d/.test(answer);
}

/* ---------------------------------------------------- what an answer shows */

/** Two questions are the same thread when they differ only in case, spacing and punctuation. */
export function sameQuestion(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  const x = norm(a);
  return x.length > 0 && x === norm(b);
}

/** The Open button's words, by where it goes; the model's label only for a page. */
export function navigateLabel(nav: { to: string; label: string } | null, language: AskLanguage): string | null {
  if (!nav || !nav.to) return null;
  const es = language === "es";
  if (/^conversations\/cv-/.test(nav.to)) return es ? "Abrir la llamada" : "Open the call";
  if (/^inbox\/th-/.test(nav.to)) return es ? "Abrir el hilo" : "Open the thread";
  if (/^clients\/[0-9a-f-]{36}$/.test(nav.to)) return es ? "Abrir el perfil" : "Open the profile";
  return nav.label || (es ? "Abrir" : "Open");
}

/** A next question that points at a place already offered: its words, and the route it echoes. */
export const FOLLOWUP_ECHO: Array<[RegExp, RegExp]> = [
  [/profile|perfil/i, /^clients\//],
  [/transcript|recording|grabaci|transcripci|the call|la llamada/i, /^conversations\/cv-/],
  [/thread|hilo|conversation/i, /^inbox\/th-/],
];

/* ---------------------------------------------------------- a write claimed */

/**
 * An answer's own words, what it quotes set aside: a span in quotes (“…”, "…", «…», or '…' opened after a space, a
 * colon or a bracket and holding a space, which is never an apostrophe) is someone else's -- a draft to approve, a
 * message received -- never a sentence the answer says. The eval's headline check (one sentence) and the write claims
 * read only this. Moved from the eval (tooling/scripts/eval-ask-context.mjs), which reads it from here.
 */
export const unquoted = (s: string | null | undefined): string =>
  (s ?? "").replace(/“[^”]*”|"[^"]*"|«[^»]*»/g, "…").replace(/(^|[\s:(])'[^']*\s[^']*'/g, "$1…");

/**
 * What an answer may never say: that it did something. Ask proposes and a person approves (spec §7), so a sentence
 * that says a message went, a setting changed, a card was approved, a campaign was set up, started, paused or renamed,
 * or someone was added, merged, recorded, replied to or enrolled (the operator's verbs, 15 Oct 2026) is a claim no turn
 * can make true. "I", "I have" and "I've" alike, never a question that offers one ("Should I set up the cards?") or a denial ("I changed nothing"); the
 * Spanish "he …" and "aprobé"; and "Done" opening a sentence, never a step still to come ("once that's done, ask me
 * again": a plan's answer as the model wrote it, 16 Oct 2026).
 */
const WRITE_CLAIMS = [
  /(?<!\b(?:should|shall|can|could|may|might|will|would|do|did)\s)\bI(?: have|['’]ve)? (?:sent|changed|updated|closed|snoozed|resolved|archived|invited|paused|deleted|approved|resumed|renamed|started|set up|turned on|scheduled|added|merged|recorded|replied|enrolled)\b(?!\s+(?:nothing|none|no)\b)/i,
  /\bhe (?:enviado|cambiado|actualizado|cerrado|aprobado|pausado|iniciado|configurado|programado|añadido|agregado|fusionado|registrado|respondido|inscrito)\b/i,
  /(?<![\p{L}\p{N}])aprob[eé](?![\p{L}\p{N}])/iu,
  /(?:^|[.!?]\s+)(?:all\s+)?done[,.!]/i,
];

/**
 * Whether an answer's own words claim a write (WRITE_CLAIMS): a draft it quotes claims nothing. The eval's `no_write`
 * and `names_card` read it, and the turn's loop, which says a claiming headline beside cards as the cards' own sentence
 * (apps/dashboard/src/server/ask/loop.ts).
 */
export const claimsWrite = (text: string | null | undefined): boolean =>
  WRITE_CLAIMS.some((re) => re.test(unquoted(text)));

/* ------------------------------------------------------- the words' formatting */

/**
 * A run of words and how it is set: bold, italic, or neither. A link's words are a run of their own with no link: the
 * model never writes a route (D5), so a place is an item or Open, never a link inside the words.
 */
export interface AnswerRun {
  text: string;
  bold?: true;
  italic?: true;
}
/** A list as the words wrote it: numbered or bulleted, each point with the list under it, if any. */
export interface AnswerList {
  ordered: boolean;
  items: Array<{ runs: AnswerRun[]; sub: AnswerList | null }>;
}
/**
 * The answer's words as the Line draws them: paragraphs, a few headings, lists nested up to three deep, and tables. The
 * Line draws each from its parts as text, never as markup, so nothing the model writes is ever parsed as HTML.
 */
export type AnswerBlock =
  | { kind: "text"; lines: AnswerRun[][] }
  | { kind: "heading"; runs: AnswerRun[] }
  | { kind: "list"; list: AnswerList }
  | { kind: "table"; head: AnswerRun[][]; rows: AnswerRun[][][]; right: boolean[] };

/** Inline marks: `**bold**`, `__bold__`, `*italic*`, `_italic_`, a `[link](anywhere)`, and `code` as its words. */
const INLINE =
  /\*\*(.+?)\*\*|__(.+?)__|(?<![\p{L}\p{N}*])\*(?!\s)(.+?)(?<!\s)\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}_])_(?!\s)(.+?)(?<!\s)_(?![\p{L}\p{N}_])|\[([^\]\n]+)\]\([^)\s]*\)|`([^`\n]+)`/gu;

/** A line's words as runs: its marks read, each mark's words a run of their own; the marks themselves are never shown. */
export function answerRuns(line: string): AnswerRun[] {
  const out: AnswerRun[] = [];
  let at = 0;
  const plain = (s: string) => {
    if (s) out.push({ text: s });
  };
  for (const m of line.matchAll(INLINE)) {
    plain(line.slice(at, m.index));
    const [, b1, b2, i1, i2, link, code] = m;
    if (b1 ?? b2) out.push({ text: b1 ?? b2 ?? "", bold: true });
    else if (i1 ?? i2) out.push({ text: i1 ?? i2 ?? "", italic: true });
    else plain(link ?? code ?? "");
    at = (m.index ?? 0) + m[0].length;
  }
  plain(line.slice(at));
  return out;
}

const LIST_LINE = /^(\s*)(?:([-*•])|(\d{1,2})[.)])\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.+?)\s*#*$/;
const TABLE_LINE = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
/** A cell that is a number, a sum, a share or a length of time: its column is set right. */
const NUMBER_CELL = /^[-+]?[$€£]?\d[\d,.\s]*(%|[kKmM]|\s?(?:min|h|s))?$/;
/** How deep a list may go: past three levels a point stays at the third. */
const LIST_DEPTH = 3;

/** A table row's cells, `\|` kept as a bar inside a cell. */
const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, "|").trim());

/** A list line read: its indent, whether it is numbered, and its words; null for a line that is no point. */
function listPointOf(line: string): { indent: number; ordered: boolean; words: string } | null {
  const m = LIST_LINE.exec(line);
  if (!m) return null;
  const [, lead = "", , number, words = ""] = m;
  return { indent: lead.replace(/\t/g, "  ").length, ordered: !!number, words };
}

/** A run of list lines as one list, nested by indent; a line indented under a point and not a point itself continues it. */
function wordsListOf(lines: string[]): AnswerList {
  const root: AnswerList = { ordered: false, items: [] };
  const stack: Array<{ indent: number; list: AnswerList }> = [];
  for (const raw of lines) {
    const point = listPointOf(raw);
    if (!point) {
      const last = stack.at(-1)?.list.items.at(-1);
      if (last) last.runs.push({ text: " " }, ...answerRuns(raw.trim()));
      continue;
    }
    const { indent, ordered } = point;
    while ((stack.at(-1)?.indent ?? -1) > indent) stack.pop();
    const top = stack.at(-1);
    const parent = top?.list.items.at(-1);
    let list: AnswerList;
    if (!top) {
      list = root;
      if (!root.items.length) root.ordered = ordered;
      stack.push({ indent, list });
    } else if (indent > top.indent && parent && stack.length < LIST_DEPTH) {
      parent.sub = parent.sub ?? { ordered, items: [] };
      list = parent.sub;
      stack.push({ indent, list });
    } else list = top.list;
    list.items.push({ runs: answerRuns(point.words), sub: null });
  }
  return root;
}

/** A table from its header line and its body's lines: the cells as runs, and which columns hold numbers alone. */
function tableOf(headLine: string, bodyLines: string[]): AnswerBlock {
  const head = cells(headLine);
  const rows = bodyLines.map((line) => {
    const r = cells(line);
    return head.map((_, k) => answerRuns(r[k] ?? ""));
  });
  // A number is read from the cell's words, its bold aside: "**18**" is a number.
  const right = head.map((_, k) => rows.length > 0 && rows.every((r) => NUMBER_CELL.test(runsText(r[k] ?? []).trim())));
  return { kind: "table", head: head.map(answerRuns), rows, right };
}

/**
 * The answer's words as blocks: a heading line (`#`, at any level, drawn as one), a run of list lines (`-`, `*`, `•`,
 * `1.`, `1)`, nested by indent), a table (a header row, its rule `|---|`, then its rows; a column whose every body cell
 * is a number is set right), and paragraphs, a blank line between two, each line its own. Words with no marks are one
 * paragraph of their lines, as the detail always was.
 */
export function answerBlocks(text: string): AnswerBlock[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const at = (i: number) => lines[i] ?? "";
  const blocks: AnswerBlock[] = [];
  let para: AnswerRun[][] = [];
  const endPara = () => {
    if (para.length) blocks.push({ kind: "text", lines: para });
    para = [];
  };
  for (let i = 0; i < lines.length;) {
    const line = at(i);
    const heading = HEADING.exec(line.trim())?.[1];
    const first = listPointOf(line);
    if (!line.trim()) {
      endPara();
      i++;
    } else if (heading) {
      endPara();
      blocks.push({ kind: "heading", runs: answerRuns(heading) });
      i++;
    } else if (TABLE_LINE.test(line) && TABLE_RULE.test(at(i + 1))) {
      endPara();
      const body: string[] = [];
      for (i += 2; i < lines.length && TABLE_LINE.test(at(i)); i++) body.push(at(i));
      blocks.push(tableOf(line, body));
    } else if (first) {
      endPara();
      // One list is one kind at its own level: a bullet after numbered steps, at their indent, starts a list of its own.
      const otherKind = (p: ReturnType<typeof listPointOf>) =>
        !!p && p.indent <= first.indent && p.ordered !== first.ordered;
      const run: string[] = [];
      for (
        ;
        i < lines.length &&
        at(i).trim() &&
        (LIST_LINE.test(at(i)) || /^\s+\S/.test(at(i))) &&
        !(run.length && otherKind(listPointOf(at(i))));
        i++
      )
        run.push(at(i));
      blocks.push({ kind: "list", list: wordsListOf(run) });
    } else {
      para.push(answerRuns(line.trim()));
      i++;
    }
  }
  endPara();
  return blocks;
}

/**
 * Whether words open with a block of their own (a heading, a list or a table), which starts on its own line when words
 * are put before it: the headline's extra sentence, a stopped turn's headline, Copy's headline.
 */
export const opensWithBlock = (s: string): boolean => /^\s*(?:#|[-*•]\s|\d{1,2}[.)]\s|\|)/.test(s);

/** The runs' words, the marks gone. */
const runsText = (runs: AnswerRun[]) => runs.map((r) => r.text).join("");

function listPlain(l: AnswerList, depth: number, spoken: boolean): string[] {
  return l.items.flatMap((it, k) => {
    const mark = l.ordered ? `${k + 1}. ` : spoken ? "" : "• ";
    const pad = spoken ? "" : "  ".repeat(depth);
    return [`${pad}${mark}${runsText(it.runs)}`, ...(it.sub ? listPlain(it.sub, depth + 1, spoken) : [])];
  });
}

/**
 * The answer's words with their formatting read as plain text, a line each: what Copy puts on the clipboard (bullets
 * kept, a table's cells one row to a line, set apart by " · ") and, `spoken`, what a voice reads (no bullets or indents,
 * a table's header said once, then each row's cells set apart by commas, so each is a phrase of its own).
 */
export function answerPlain(text: string, spoken = false): string {
  const sep = spoken ? ", " : " · ";
  return answerBlocks(text)
    .flatMap((b): string[] => {
      if (b.kind === "text") return b.lines.map(runsText);
      if (b.kind === "heading") return [runsText(b.runs)];
      if (b.kind === "list") return listPlain(b.list, 0, spoken);
      return [b.head.map(runsText).join(sep), ...b.rows.map((r) => r.map(runsText).join(sep))];
    })
    .join("\n");
}

/* ------------------------------------------------- the answer's words, read */

/** No list: what an answer stored before the list part reads as. */
const NO_LIST: AskList = { style: "bullets", entries: [] };

/** A list's entries as lines of text, each with its mark: "• ", "1. ", or none. */
function listLines(l: AskList): string[] {
  return l.entries.map((e, i) => (l.style === "numbers" ? `${i + 1}. ${e}` : l.style === "bullets" ? `• ${e}` : e));
}

/**
 * The answer's words, for copy, a folded turn and the history: the headline, then the detail, then the list, a line
 * each, their formatting read as plain words (answerPlain). A detail that opens with a heading, a list or a table starts
 * on its own line.
 */
export function answerText(a: AskAnswer): string {
  const own = a.form === "prose" || opensWithBlock(a.say.detail);
  const say = [a.say.headline, a.say.detail].filter(Boolean).join(own ? "\n" : " ");
  return answerPlain([say, ...listLines(a.show.list ?? NO_LIST)].filter(Boolean).join("\n"));
}

/** The answer as Copy takes it: its words (answerText), then its parts, each figure and each row, a line each. */
export function answerCopy(a: AskAnswer): string {
  const b = a.show.breakdown;
  return [
    answerText(a),
    ...(b ? [`${b.total} ${b.label}: ${b.parts.map((p) => `${p.label} ${p.value}`).join(", ")}`] : []),
    ...a.show.figures.map((f) => `${[f.value, f.label].filter(Boolean).join(" ")}${f.note ? ` (${f.note})` : ""}`),
    ...a.show.items.map((it) => [it.title, it.meta, it.line].filter(Boolean).join(" · ")),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Lines said one after another: each ends as a sentence does, so a voice pauses between them. */
const sentences = (lines: string[]) =>
  lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/[.!?…:;,]$/.test(l) ? l : `${l}.`))
    .join(" ");

/** A list as a voice reads it: each entry its own sentence, a numbered one with its number; nothing for no entries. */
export function listSpoken(l: AskList): string {
  return sentences(l.entries.map((e, i) => (l.style === "numbers" ? `${i + 1}. ${e}` : e)));
}

/**
 * The answer's words as a voice reads them (Read aloud, a spoken question, the voice door): the headline, the detail's
 * lines, then the list (listSpoken). The figures and rows are drawn, never read.
 */
export function answerSpoken(a: AskAnswer): string {
  const l = a.show.list ?? NO_LIST;
  const said = sentences([a.say.headline, ...answerPlain(a.say.detail, true).split("\n")]);
  return [said, listSpoken({ ...l, entries: l.entries.map((e) => answerPlain(e, true)) })].filter(Boolean).join(" ");
}
