import {
  ASK_ANSWER_CAPS,
  clipLines,
  failedAnswer,
  normalizeAnswer,
  sayAsDrawn
} from "./ask-answer.js";
import { opensWithBlock } from "./answer-text.js";
function partialField(s, key) {
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
      if (n === void 0) break;
      if (n === "u") {
        const hex = s.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16) || 32);
        i += 6;
        continue;
      }
      out += n === "n" ? "\n" : n === "t" ? "	" : n === "r" ? "\r" : n === "b" ? "\b" : n === "f" ? "\f" : n;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
export function partialSay(prefix) {
  const at = prefix.indexOf('"say"');
  if (at < 0) return null;
  const rest = prefix.slice(at);
  return sayAsDrawn({ headline: partialField(rest, "headline"), detail: partialField(rest, "detail") });
}
function stringEnd(s, at) {
  for (let i = at + 1; i < s.length; i++) {
    if (s[i] === "\\") i++;
    else if (s[i] === '"') return i;
  }
  return -1;
}
function closedShowEntries(prefix) {
  const got = { figures: [], items: [] };
  const stack = [];
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
      const name = top ? top.open === "{" ? top.key : "[]" : null;
      stack.push({ open: c, name, start: i, key: null, expectsKey: c === "{" });
    } else if (c === "}" || c === "]") {
      const done = stack.pop();
      const [, show, list] = stack;
      const at = stack.length === 3 && show?.name === "show" && list?.open === "[" ? list.name : null;
      if (done?.open === "{" && (at === "figures" || at === "items")) {
        try {
          got[at].push(JSON.parse(prefix.slice(done.start, i + 1)));
        } catch {
        }
      }
    } else if (c === "," && top?.open === "{") top.expectsKey = true;
  }
  return got;
}
function partialShow(prefix, read, language) {
  const { figures, items } = closedShowEntries(prefix);
  if (!figures.length && !items.length) return { figures: [], items: [] };
  const shaped = normalizeAnswer({ say: { headline: "-" }, show: { figures, items }, language }, read, language);
  return shaped.ok ? { figures: shaped.answer.show.figures, items: shaped.answer.show.items } : { figures: [], items: [] };
}
export function answerSoFar(say, json, read, language) {
  const show = json ? partialShow(json, read, language) : null;
  return show && (show.figures.length || show.items.length) ? { ...say, show } : say;
}
const ASK_STOPPED_WORDS = {
  en: "Stopped before the answer was finished.",
  es: "Detenido antes de terminar la respuesta."
};
export function stoppedAnswer(said, language) {
  const a = failedAnswer(ASK_STOPPED_WORDS[language === "es" ? "es" : "en"], language);
  const own = opensWithBlock(said?.detail ?? "");
  const so = [said?.headline, said?.detail].filter(Boolean).join(own ? "\n" : " ");
  return { ...a, say: { ...a.say, detail: clipLines(so, ASK_ANSWER_CAPS.detail) } };
}
