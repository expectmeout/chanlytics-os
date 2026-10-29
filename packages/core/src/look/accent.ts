/**
 * A website's colour, read in code (decision 0075): the one its owner would call the brand's. No model: a page says it
 * in three places, in this order of trust --
 *   1. its `theme-color` meta, which a site sets on purpose;
 *   2. the background its buttons and calls to action wear, by their element or their class, and custom properties
 *      named for a brand or a primary colour (resolved one level);
 *   3. failing those, the most used colour on the page that is neither paper nor ink.
 * White, black and greys are never an accent; a colour too light for white words is darkened until they read
 * (contracts readableOnWhite), so what is kept is what a button can wear. Null when the page gives nothing.
 */
import { hexOfRgb, isAccentLike, parseCssColour, readableOnWhite, type Rgb } from "@chanlytics/contracts";

const HTML_MAX = 400_000;
const COLOUR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi;
const BUTTONISH = /button|\.btn|\bcta\b|primary|accent|brand|submit|book|reserve|call-to-action/i;
const VAR_NAME = /--[\w-]*(brand|primary|accent|theme|cta|button)[\w-]*/i;

const first = (s: string, re: RegExp): string | null => re.exec(s)?.[1] ?? null;

/** The colours in a run of CSS text, as triplets, a custom property it reads resolved to the value the page gave it. */
function coloursIn(css: string, vars: Map<string, Rgb>): Rgb[] {
  const out: Rgb[] = [];
  const resolved = css.replace(/var\((--[\w-]+)\)/g, (_, v: string) => {
    const rgb = vars.get(v);
    return rgb ? hexOfRgb(rgb) : "";
  });
  for (const m of resolved.match(COLOUR) ?? []) {
    const rgb = parseCssColour(m);
    if (rgb) out.push(rgb);
  }
  return out;
}

function tallyAccents(into: Map<string, number>, rgbs: Rgb[], weight = 1): void {
  for (const rgb of rgbs) {
    if (!isAccentLike(rgb)) continue;
    const key = hexOfRgb(rgb);
    into.set(key, (into.get(key) ?? 0) + weight);
  }
}

const mostUsed = (counts: Map<string, number>): string | null =>
  [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

const backgroundsOf = (declarations: string): string =>
  [...declarations.matchAll(/background(?:-color)?\s*:\s*([^;}]+)/gi)].map((x) => x[1] ?? "").join(";");

export function siteAccentOf(html: string): string | null {
  const page = html.slice(0, HTML_MAX);
  // 1. Said on purpose.
  const theme =
    first(page, /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i) ??
    first(page, /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i);
  const themed = theme ? parseCssColour(theme) : null;
  if (themed && isAccentLike(themed)) return readableOnWhite(hexOfRgb(themed));

  const css = (page.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) ?? []).join("\n");
  const inline = (page.match(/\bstyle=["'][^"']*["']/gi) ?? []).join("\n");
  // Custom properties, for the rules that read them; the ones named for a brand count for themselves.
  const vars = new Map<string, Rgb>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
    const rgb = parseCssColour((m[2] ?? "").trim());
    if (rgb) vars.set(m[1] ?? "", rgb);
  }
  // 2. The buttons' own.
  const buttons = new Map<string, number>();
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!BUTTONISH.test(selector ?? "")) continue;
    tallyAccents(buttons, coloursIn(backgroundsOf(body ?? ""), vars), 2);
  }
  for (const [name, rgb] of vars) if (VAR_NAME.test(name)) tallyAccents(buttons, [rgb], 1);
  for (const m of page.matchAll(/<(?:button|a)\b[^>]*style=["']([^"']*)["']/gi))
    tallyAccents(buttons, coloursIn(backgroundsOf(m[1] ?? ""), vars), 2);
  const fromButtons = mostUsed(buttons);
  if (fromButtons) return readableOnWhite(fromButtons);
  // 3. The most used colour that is neither paper nor ink.
  const any = new Map<string, number>();
  tallyAccents(any, coloursIn(`${css}\n${inline}`, vars));
  const used = mostUsed(any);
  return used ? readableOnWhite(used) : null;
}
