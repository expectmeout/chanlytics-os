/**
 * The words of a received email.
 *
 * The plain-text part, when the sender's client wrote one, which every
 * person's client does. An email with only HTML (a form, a notification) is
 * reduced to text by a maintained converter, not by regular expressions:
 * only what a reader reads is kept (no head, style, script, template, drawing
 * or embedded media's fallback), images are skipped so nothing remote is ever
 * fetched, and a link keeps its address beside its words. What comes out is
 * what a person reads in the thread, and one day what a model is shown; it is
 * never rendered as markup anywhere.
 *
 * Some senders make their plain-text part by stripping their HTML of its tags,
 * and a style sheet in the HTML's body comes along as words (a hosting
 * platform's notice, 28 Oct 2026, showed its CSS in Inbox as the email). Such a
 * part is not the words: its HTML twin is read instead, and an email with no
 * twin has the style sheet at its head or foot cut.
 */
import { convert, type SelectorDefinition } from "html-to-text";
import type { ReceivedEmail } from "./intake";

/** What an HTML email holds that is not words a reader reads. */
const NOT_WORDS: SelectorDefinition[] = [
  "head",
  "title",
  "style",
  "script",
  "noscript",
  "template",
  "svg",
  "iframe",
  "object",
  "embed",
  "video",
  "audio",
  "canvas",
  "img",
].map((selector) => ({ selector, format: "skip" }));

function htmlWords(html: string): string | null {
  const converted = convert(html, {
    wordwrap: false,
    selectors: [...NOT_WORDS, { selector: "a", options: { hideLinkHrefIfSameAsText: true } }],
  })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return converted || null;
}

/*
 * A style sheet, as a sender's tag-stripping leaves it in a text part: rules (a selector, then declarations in braces),
 * at-rules around rules (@media), at-rules of declarations (@font-face) and one-line at-rules (@import), with the
 * comment marks old mail wraps a sheet in. A selector is classes, ids, attributes, pseudo-classes and HTML's own
 * elements, and every declaration names a property of CSS's: that is what tells a sheet from a person's words with
 * braces in them ("{Tuesday: 3pm}", a JSON object), and a line of theirs from the selector under it.
 */
const GAP = /(?:\s|<!--|-->)*/y;
const AT_LINE = /@[a-z-]+[^{};]*;/iy;
const AT_OPEN = /@[a-z-]+[^{};]*\{/iy;
/** A selector and its brace; bounded, so a long text without one is not read to its end from every line. */
const SELECTOR_OPEN = /([^{};@\s][^{};@]{0,300})\{/y;
const BODY_CLOSE = /([^{}]*)\}/y;
const CLOSE = /\s*\}/y;
/** One compound selector: an element (or *), then classes, ids, attributes and pseudo-classes. */
const COMPOUND = /^(?:([a-z][a-z0-9]*)|\*)?(?:[.#][\w-]+|\[[^\]\s]*\]|::?[\w-]+(?:\([^)\s]*\))?)*$/i;
/** The elements an email's style sheet names. */
const ELEMENTS: ReadonlySet<string> = new Set(
  (
    "a abbr address article aside b blockquote body br button caption center code col colgroup dd div dl dt em " +
    "figure font footer form h1 h2 h3 h4 h5 h6 header hr html i img input label li main nav ol p pre s section " +
    "small span strike strong sub sup table tbody td tfoot th thead tr u ul"
  ).split(" "),
);
/** A property of CSS's: one of its families, a vendor's, Outlook's (mso-) or a custom one. */
const PROPERTY_FAMILY =
  /^(?:--[\w-]+|-(?:webkit|moz|ms|o)-[a-z-]+|mso-[a-z-]+|(?:align|animation|appearance|aspect|backdrop|backface|background|block|border|bottom|box|break|caption|caret|clear|clip|color|column|columns|content|cursor|direction|display|filter|flex|float|font|gap|grid|height|hyphens|inline|inset|isolation|justify|left|letter|line|list|margin|mask|max|min|mix|object|opacity|outline|overflow|padding|perspective|place|pointer|position|resize|right|row|scroll|src|tab|table|text|top|touch|transform|transition|unicode|user|vertical|visibility|white|width|will|word|writing|z|zoom)(?:-[a-z-]+)?)$/i;

/** Where a sticky pattern matched at `at` ends, or -1. */
function matchEnd(re: RegExp, s: string, at: number): number {
  re.lastIndex = at;
  return re.test(s) ? re.lastIndex : -1;
}

/** Whether a block's body is declarations, at least one, each of a property CSS has. */
function declarations(body: string): boolean {
  const parts = body
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);
  return (
    parts.length > 0 &&
    parts.every((d) => {
      const colon = d.indexOf(":");
      return colon > 0 && PROPERTY_FAMILY.test(d.slice(0, colon).trim()) && d.slice(colon + 1).trim() !== "";
    })
  );
}

/** Whether the words before a brace are a selector list: each part a combinator, or a compound of CSS's. */
function selector(s: string): boolean {
  const parts = s.replace(/,/g, " ").trim().split(/\s+/);
  return parts.every((p) => {
    if (/^[>+~]$/.test(p)) return true;
    const type = COMPOUND.exec(p)?.[1];
    return COMPOUND.test(p) && (type === undefined || ELEMENTS.has(type.toLowerCase()));
  });
}

/** A block of declarations from `at`, its closing brace included: where it ends, or -1. */
function declarationsEnd(s: string, at: number): number {
  BODY_CLOSE.lastIndex = at;
  const m = BODY_CLOSE.exec(s);
  return m && declarations(m[1] ?? "") ? BODY_CLOSE.lastIndex : -1;
}

/** One rule from `at` (after any gap): where it ends, or -1. */
function ruleEnd(s: string, from: number): number {
  const at = matchEnd(GAP, s, from);
  const line = matchEnd(AT_LINE, s, at);
  if (line > 0) return line;
  const open = matchEnd(AT_OPEN, s, at);
  if (open > 0) {
    const ownBody = declarationsEnd(s, open);
    if (ownBody > 0) return ownBody;
    const inner = runEnd(s, open);
    return inner > open ? matchEnd(CLOSE, s, inner) : -1;
  }
  SELECTOR_OPEN.lastIndex = at;
  const sel = SELECTOR_OPEN.exec(s);
  return sel && selector(sel[1] ?? "") ? declarationsEnd(s, SELECTOR_OPEN.lastIndex) : -1;
}

/** The rules one after another from `at`: where the last ends, or `at` when none starts there. */
function runEnd(s: string, at: number): number {
  let end = at;
  for (let next = ruleEnd(s, end); next > end; next = ruleEnd(s, end)) end = next;
  return end;
}

/** Where each line of a text starts. */
function lineStarts(s: string): number[] {
  const starts = [0];
  for (let i = s.indexOf("\n"); i >= 0; i = s.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}

/** Whether a style sheet's rule starts any line of the text. */
function carriesStyleSheet(text: string): boolean {
  return text.includes("{") && lineStarts(text).some((at) => runEnd(text, at) > at);
}

/** The text without a style sheet at its head or at its foot; a sheet between a person's words is theirs. */
function withoutEdgeStyleSheets(text: string): string {
  const head = runEnd(text, 0);
  const rest = head > 0 ? text.slice(matchEnd(GAP, text, head)) : text;
  const foot = lineStarts(rest).find((at) => {
    const end = runEnd(rest, at);
    return (
      end > at &&
      rest
        .slice(end)
        .replace(/<!--|-->/g, "")
        .trim() === ""
    );
  });
  return (foot === undefined ? rest : rest.slice(0, foot)).trim();
}

export function emailPlainText(e: Pick<ReceivedEmail, "text" | "html">): string | null {
  const text = (e.text ?? "").replace(/\r\n/g, "\n").trim();
  if (text && !carriesStyleSheet(text)) return text;
  const fromHtml = e.html ? htmlWords(e.html) : null;
  if (fromHtml || !text) return fromHtml;
  return withoutEdgeStyleSheets(text) || null;
}
