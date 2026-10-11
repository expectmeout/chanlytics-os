/**
 * The rules an answer's text passes before the Line draws it: tag-shaped junk out (cleanAnswer), a figure with nothing
 * read behind it (isUngrounded), whether two questions are one thread, the Open button's words, a next question that
 * echoes a place already offered, and whether its own words claim a write (claimsWrite). The answer's shape and its
 * normaliser are ask-answer.ts's.
 */
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
 * that says a message went, a setting changed, a card was approved or a campaign was set up, started, paused or
 * renamed is a claim no turn can make true. "I", "I have" and "I've" alike; the Spanish "he …" and "aprobé".
 */
const WRITE_CLAIMS = [
  /\bI(?: have|['’]ve)? (?:sent|changed|updated|closed|snoozed|resolved|archived|invited|paused|deleted|approved|resumed|renamed|started|set up|turned on|scheduled)\b/i,
  /\bhe (?:enviado|cambiado|actualizado|cerrado|aprobado|pausado|iniciado|configurado|programado)\b/i,
  /(?<![\p{L}\p{N}])aprob[eé](?![\p{L}\p{N}])/iu,
  /\bdone[,.!]/i,
];

/**
 * Whether an answer's own words claim a write (WRITE_CLAIMS): a draft it quotes claims nothing. The eval's `no_write`
 * and `names_card` read it, and the turn's loop, which says a claiming headline beside cards as the cards' own sentence
 * (apps/dashboard/src/server/ask/loop.ts).
 */
export const claimsWrite = (text: string | null | undefined): boolean =>
  WRITE_CLAIMS.some((re) => re.test(unquoted(text)));
