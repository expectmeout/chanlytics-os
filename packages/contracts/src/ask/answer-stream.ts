/**
 * Say while the answer's JSON is still arriving (the Line's spec, 7.4): the headline and the detail read from a prefix of
 * what the model has written so far, drawn as the final message will draw them (ask-answer.ts sayAsDrawn). Pure.
 */
import { sayAsDrawn } from "./ask-answer";

/**
 * The string value of `"key": "…"` in a JSON prefix, decoded as far as it has arrived: up to the first unescaped
 * quote, or the end of what is there.
 */
function partialField(s: string, key: string): string {
  const k = s.indexOf(`"${key}"`);
  if (k < 0) return "";
  const colon = s.indexOf(":", k + key.length + 2);
  if (colon < 0) return "";
  let i = colon + 1;
  while (i < s.length && /\s/.test(s.charAt(i))) i++;
  if (s[i] !== '"') return "";
  i++;
  let out = "";
  while (i < s.length) {
    const c = s[i];
    if (c === '"') break;
    if (c === "\\") {
      const n = s[i + 1];
      if (n === undefined) break;
      if (n === "u") {
        const hex = s.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16) || 0x20);
        i += 6;
        continue;
      }
      out += n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "\r" : n === "b" ? "\b" : n === "f" ? "\f" : n;
      i += 2;
      continue;
    }
    out += c;
    i++;
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
