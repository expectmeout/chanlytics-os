/**
 * The header values the rest of email/ reads and writes: one line (oneLine), a Message-ID as a header carries it,
 * and an address apart from its phrase, one or a list. The request is request.ts; what arrives is intake.ts.
 */

/** A header value is one line: a newline in one is how a second header is smuggled in. */
export const oneLine = (s: string): string =>
  s
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A Message-ID as a header carries it, angle brackets and all; null for anything that is not one. */
export function messageIdHeader(id: string | null | undefined): string | null {
  const s = oneLine(id ?? "");
  const bare = s.replace(/^<|>$/g, "");
  return /^[^\s<>@]+@[^\s<>@]+$/.test(bare) ? `<${bare}>` : null;
}

/** `Ana Reyes <ana@x.com>` or `ana@x.com`: the address and the phrase, apart. The phrase is the sender's own and proves nothing. */
export function addressOf(header: string | null | undefined): { address: string; name: string | null } | null {
  const s = oneLine(header ?? "");
  if (!s) return null;
  const angle = /^(.*)<([^<>\s]+)>\s*$/.exec(s);
  const address = (angle ? angle[2] : s).trim().toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) return null;
  const name = angle
    ? angle[1]
        .trim()
        .replace(/^"(.*)"$/, "$1")
        .trim()
    : "";
  return { address, name: name || null };
}

const stringsOf = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );

export const addressesOf = (v: unknown): string[] =>
  stringsOf(v)
    .map((r) => addressOf(r)?.address)
    .filter((a): a is string => !!a);
