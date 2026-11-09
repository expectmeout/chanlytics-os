/**
 * What a business's own website says of itself, in one line of plain words: what a cold email's opening is written and
 * checked against (the edge's campaigns/reach-out/check-one.ts), and what the judge reads where a search asks what only a website
 * shows (leads/runner/site-reads.ts). This file is the reading, and nothing else: given what the page's reader answered,
 * it answers words. Its words, never ours; it makes no request.
 */
import { oneLine } from "@chanlytics/contracts";
import type { SitePage } from "@chanlytics/channels/website";

/*
 * Each mark's reading is bounded, so a page written to be slow to read is read no slower than any other: a run of `[`
 * with no `]` costs each its bound, never the page's length.
 */
const IMAGE_MARK = /!\[[^\]\n]{0,300}\]\([^)\n]{0,1000}\)/g;
const LINK_MARK = /\[([^\]\n]{0,300})\]\([^)\n]{0,1000}\)/g;
const TAG = /<[^>\n]{0,300}>/g;
const RULE = /^[ \t]*[-=*_|: ]{3,}[ \t]*$/gm;
const LINE_MARK = /^[ \t]{0,3}(?:#{1,6}|>|[-*+]|\d{1,3}\.)[ \t]+/gm;
const EMPHASIS = /[*_`~|]+/g;
const ESCAPE = /\\([!-/:-@[-`{-~])/g;

/** Markdown's words in one line: a picture gone, a link its words, no heading, bullet, rule, emphasis or table mark. */
function plainOfMarkdown(markdown: string): string {
  return markdown
    .replace(IMAGE_MARK, " ")
    .replace(LINK_MARK, "$1")
    .replace(TAG, " ")
    .replace(RULE, " ")
    .replace(LINE_MARK, "")
    .replace(EMPHASIS, " ")
    .replace(ESCAPE, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** A page's Markdown is read this many times over what is kept: a link's address and its marks are no words. */
const MARKDOWN_OVER_WORDS = 4;

/**
 * What a page's reader answered as words: what its head calls it and says of it, its own words and no Markdown ("Austin
 * Movers | Local"), then its main content.
 */
type SaidOfItself = Pick<SitePage, "title" | "description" | "markdown">;

/**
 * What a business's own page says of itself, in one line: its title, its description, then its main content's words,
 * each once, cut at a word within `max`; null where it says nothing.
 */
export function siteWordsOf(page: SaidOfItself, max: number): string | null {
  const parts: string[] = [];
  for (const part of [
    oneLine(page.title ?? ""),
    oneLine(page.description ?? ""),
    plainOfMarkdown(page.markdown.slice(0, max * MARKDOWN_OVER_WORDS)),
  ])
    if (part && !parts.some((p) => p.includes(part))) parts.push(part);
  const sentence = parts.join(" · ");
  if (!sentence) return null;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return cut.slice(0, space > 0 ? space : max).replace(/[\s·,;:–—-]+$/, "");
}
