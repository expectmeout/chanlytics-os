import { replyTextOf } from "../reach-out/reach-out-replies.js";
export const AUTOMATIC_NAMING = false;
const SIGNER_MAX = 80;
const ROLE_WORDS = /* @__PURE__ */ new Set([
  "admin",
  "administrator",
  "assistant",
  "billing",
  "bookings",
  "booking",
  "ceo",
  "contact",
  "coordinator",
  "customer",
  "desk",
  "director",
  "enquiries",
  "front",
  "hello",
  "help",
  "hi",
  "info",
  "inquiries",
  "manager",
  "marketing",
  "office",
  "owner",
  "partner",
  "reception",
  "receptionist",
  "reservations",
  "sales",
  "service",
  "staff",
  "support",
  "team",
  "thanks",
  "thank",
  "regards",
  "best",
  "cheers",
  "sincerely",
  "warmly",
  "you",
  "us",
  "we",
  "mr",
  "mrs",
  "ms",
  "dr"
]);
const BUSINESS_WORDS = /* @__PURE__ */ new Set([
  "agency",
  "bar",
  "boutique",
  "bridal",
  "cafe",
  "clinic",
  "co",
  "company",
  "corp",
  "corporation",
  "design",
  "events",
  "gallery",
  "group",
  "hair",
  "inc",
  "llc",
  "ltd",
  "services",
  "shop",
  "spa",
  "store",
  "studio",
  "studios",
  "salon"
  // trade-word: a word the gate refuses in a signer's name, never said to anyone
]);
const STAND_IN_TITLE = /\b(assistant|office|front desk|coordinator|receptionist|admin|on behalf|team)\b/i;
const NAME_WORD = /^(\p{L}[\p{L}\p{M}]*(?:['’-]\p{L}[\p{L}\p{M}]*)*|\p{Lu}\.)$/u;
function squeezed(v) {
  const s = (v ?? "").replace(/\s+/g, " ").trim().slice(0, SIGNER_MAX).trim();
  return s ? s : null;
}
function foldedName(s) {
  return s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
}
function domainLabel(address) {
  const a = address ?? "";
  const at = a.lastIndexOf("@");
  if (at < 0) return null;
  const host = a.slice(at + 1).toLowerCase();
  const first = host.split(".")[0] ?? "";
  return first ? first.replace(/[^a-z0-9]/g, "") : null;
}
function localPart(address) {
  const a = address ?? "";
  const at = a.lastIndexOf("@");
  if (at <= 0) return null;
  const local = a.slice(0, at).toLowerCase().replace(/\+.*$/, "");
  const letters = local.replace(/[^a-z]/g, "");
  return letters || null;
}
const QUOTE_HEAD = /^(on|el|le|am|il|em|op)\b.*\b(wrote|escribió|a écrit|schrieb|ha scritto|escreveu|schreef)\s*:\s*$/i;
const ORIGINAL = /^-{2,}\s*(original message|forwarded message|mensaje original)\s*-{2,}$/i;
function signedLinesOf(text) {
  const lines = (text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const kept = [];
  for (const [i, line] of lines.entries()) {
    const t = line.trim();
    if (ORIGINAL.test(t) || QUOTE_HEAD.test(t) || QUOTE_HEAD.test(`${t} ${(lines[i + 1] ?? "").trim()}`)) break;
    if (t.startsWith(">")) continue;
    kept.push(line);
  }
  return kept.join("\n");
}
function standsIn(text, words) {
  const t = ` ${foldedName(text)} `;
  const w = foldedName(words);
  return !!w && t.includes(` ${w} `);
}
export function isPersonsName(name, notNames, from) {
  const tokens = name.split(" ");
  if (tokens.length < 1 || tokens.length > 4) return false;
  if (!tokens.every((t) => NAME_WORD.test(t))) return false;
  if (!tokens.some((t) => !/^\p{Lu}\.$/u.test(t))) return false;
  const folded = foldedName(name).split(" ");
  if (folded.some((t) => ROLE_WORDS.has(t) || BUSINESS_WORDS.has(t) || t === "and")) return false;
  for (const other of notNames) {
    const o = other ? foldedName(other) : "";
    if (!o) continue;
    if (o === foldedName(name) || standsIn(name, o)) return false;
  }
  const label = domainLabel(from);
  if (label && foldedName(name).replace(/ /g, "") === label) return false;
  return true;
}
export function signerOf(f) {
  if (f.intent === "no" || f.claim !== "person") return null;
  const name = squeezed(f.name);
  if (!name) return null;
  const own = signedLinesOf(f.text);
  if (!replyTextOf(f.text) || !own || !standsIn(own, name)) return null;
  if (!isPersonsName(name, [f.business, ...f.notNames], f.from)) return null;
  const title = squeezed(f.title);
  const kept = title && foldedName(title) !== foldedName(name) && !(f.business && foldedName(title) === foldedName(f.business)) ? title : null;
  return { name, title: kept };
}
export function signerAgrees(s, from) {
  if (s.title && STAND_IN_TITLE.test(s.title)) return false;
  const local = localPart(from.address);
  if (!local || ROLE_WORDS.has(local)) return false;
  const words = foldedName(s.name).split(" ");
  const first = words[0] ?? "";
  const last = words[words.length - 1] ?? "";
  const fromName = squeezed(from.name);
  const byFromLine = !!fromName && foldedName(fromName) === foldedName(s.name);
  const byAddress = words.length > 0 && (local === first || local === words.join("") || words.length > 1 && local === `${first[0] ?? ""}${last}`);
  return byFromLine || byAddress;
}
