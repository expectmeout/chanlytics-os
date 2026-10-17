const MAX_ADDRESS = 254;
const MAX_LOCAL = 64;
const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const LOCAL = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*";
const SHAPE = new RegExp(`^(${LOCAL})@(${LABEL}(?:\\.${LABEL})+)$`);
export function normalizeEmail(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s || s.length > MAX_ADDRESS) return null;
  const m = SHAPE.exec(s);
  if (!m || m[1].length > MAX_LOCAL) return null;
  return s;
}
export function whyNotAnEmail(raw) {
  if (normalizeEmail(raw)) return null;
  const s = String(raw ?? "").trim();
  if (!s) return "An email address is needed.";
  if (/[<>]/.test(s) || /\s/.test(s))
    return "Only the address itself, like name@example.com, with no name or spaces around it.";
  const at = s.split("@").length - 1;
  if (at === 0) return "That is missing the @.";
  if (at > 1) return "An address has one @.";
  if (!/@[^@]*\./.test(s)) return "That needs a full domain after the @, like name@example.com.";
  return "That is not an email address anyone can be reached at.";
}
const OWN_ADDRESS_WORDS = /\b(my|mine|it'?s|is|email|e-mail|mail|correo|mi|es|sure|here|aqu[ií])\b/i;
export function addressInMessage(body) {
  const s = String(body ?? "").trim();
  if (!s || s.length > 160) return null;
  const tokens = s.split(/\s+/);
  const found = /* @__PURE__ */ new Set();
  for (const raw of tokens) {
    const t = raw.replace(/^[("'<[]+|[)"'>\].,;:!?]+$/g, "");
    if (!t.includes("@")) continue;
    const e = normalizeEmail(t);
    if (!e) return null;
    found.add(e);
  }
  if (found.size !== 1) return null;
  const alone = tokens.length === 1;
  const theirs = tokens.length <= 8 && OWN_ADDRESS_WORDS.test(s);
  return alone || theirs ? [...found][0] : null;
}
