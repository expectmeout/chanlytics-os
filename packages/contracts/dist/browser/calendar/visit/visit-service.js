import { isIdentifierName } from "../../conversations/thread-contact.js";
import { escapeRe } from "../calendar-people.js";
export function fullNameKey(name) {
  const n = (name ?? "").trim();
  if (!n || isIdentifierName(n)) return null;
  const words = n.split(/\s+/);
  const first = words.at(0);
  const last = words.at(-1);
  const letters = (w) => (w.match(/\p{L}/gu) ?? []).length;
  if (words.length < 2 || !first || !last || letters(first) < 2 || letters(last) < 2) return null;
  return words.join(" ").toLowerCase();
}
const SERVICE_TAIL = /(?:^|[^\p{L}])(?:with|for|and|w\/)\s*$|[\s·•|:,/&+\-–—([{]+$/iu;
const SERVICE_HEAD = /^[\s·•|:,./&+\-–—)\]}]+/u;
function seamed(before, after) {
  let left = before;
  for (let prev = ""; prev !== left; ) {
    prev = left;
    left = left.replace(SERVICE_TAIL, "");
  }
  const right = after.replace(SERVICE_HEAD, "");
  return left && right ? `${left} \xB7 ${right}` : left || right;
}
export function visitServiceOf(title, names) {
  let service = title.trim();
  for (const raw of names) {
    const name = (raw ?? "").trim();
    if (name.length < 3 || isIdentifierName(name)) continue;
    const edge = "[^\\p{L}\\p{N}'\u2019]";
    const re = new RegExp(`(?<=^|${edge})${escapeRe(name)}(?=$|${edge})`, "iu");
    for (let m = re.exec(service); m; m = re.exec(service)) {
      service = seamed(service.slice(0, m.index), service.slice(m.index + m[0].length));
    }
  }
  return service;
}
export function visitTitleWithout(title, names) {
  const whole = title.trim();
  const service = visitServiceOf(whole, names);
  return /[\p{L}\p{N}]/u.test(service) ? service : whole;
}
