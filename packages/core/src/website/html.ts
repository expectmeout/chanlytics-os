/**
 * Reading HTML the way a browser reads what it fetches, for the pages the platform reads on a business's behalf: its
 * mark (leads/mark.ts) and the booking page its website links to (booking-page.ts). Each reads a tag's attributes and
 * decodes an address's entities through these, so the two readings cannot disagree about what a page says.
 */

/** One tag's attributes, lower-cased by name, however they were quoted. */
export function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/g;
  for (let m = re.exec(tag); m; m = re.exec(tag)) out[m[1].toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? "").trim();
  return out;
}

/**
 * An href is HTML before it is an address: a browser decodes its entities before it fetches, and so must we. A real
 * falconry school wrote its mark as `...jpeg?w=180&#038;h=180`, which stored raw asks a server for a parameter
 * literally named `#038;h`. A reader decodes before it judges an address, so nothing spells a scheme past its checks.
 */
export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  const chr = (n: number, had: string) => (n > 0 && n < 0x110000 ? String.fromCodePoint(n) : had);
  return s
    .replace(/&#x([0-9a-f]+);/gi, (had, h) => chr(parseInt(h, 16), had))
    .replace(/&#(\d+);/g, (had, d) => chr(Number(d), had))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}
