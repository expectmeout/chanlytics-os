import { starterByName, starterText } from "./starter-lookup.js";
export function footerOf(components) {
  if (!Array.isArray(components)) return null;
  for (const c of components) {
    if (!c || typeof c !== "object") continue;
    const part = c;
    if (String(part.type ?? "").toUpperCase() !== "FOOTER") continue;
    const text = typeof part.text === "string" ? part.text.trim() : "";
    if (text) return text;
  }
  return null;
}
export function templateFooter(t) {
  if (typeof t.footer === "string" && t.footer.trim()) return t.footer.trim();
  const stored = footerOf(t.components);
  if (stored) return stored;
  const s = starterByName(t.name);
  return s ? starterText(s, t.language ?? "en_US").footer ?? null : null;
}
const FILLED_PARTS = ["HEADER", "BODY", "FOOTER", "BUTTONS"];
const partOf = (components, type) => {
  if (!Array.isArray(components)) return null;
  for (const c of components) {
    if (c && typeof c === "object" && String(c.type ?? "").toUpperCase() === type)
      return c;
  }
  return null;
};
const textOf = (part) => {
  const t = part && typeof part.text === "string" ? part.text.trim() : "";
  return t || null;
};
const BUTTON_KIND = { URL: "url", QUICK_REPLY: "reply", PHONE_NUMBER: "call" };
export function templateParts(components) {
  const header = partOf(components, "HEADER");
  const buttons = [];
  const holder = partOf(components, "BUTTONS");
  const list = holder && Array.isArray(holder.buttons) ? holder.buttons : [];
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    const kind = BUTTON_KIND[String(b.type ?? "").toUpperCase()];
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (kind && text) buttons.push({ text, kind });
  }
  return {
    // A picture heading is not words and is not drawn as any.
    header: header && String(header.format ?? "TEXT").toUpperCase() === "TEXT" ? textOf(header) : null,
    footer: footerOf(components),
    buttons
  };
}
export function templateBlocked(t) {
  if (typeof t.blocked === "string") return t.blocked.trim() || null;
  if (t.blocked === null) return null;
  const components = t.components;
  if (!Array.isArray(components)) return null;
  const unfilled = components.some((c) => {
    const type = c && typeof c === "object" ? c.type : null;
    return !(typeof type === "string" && FILLED_PARTS.includes(type.toUpperCase()));
  });
  if (unfilled) return "a part Chanlytics cannot fill";
  const header = partOf(components, "HEADER");
  if (header) {
    const format = String(header.format ?? "TEXT").toUpperCase();
    if (format !== "TEXT")
      return format === "IMAGE" ? "a picture for a heading" : `a ${format.toLowerCase()} for a heading`;
    if (/\{\{\d+\}\}/.test(String(header.text ?? ""))) return "a heading that takes a value";
  }
  const holder = partOf(components, "BUTTONS");
  const list = holder && Array.isArray(holder.buttons) ? holder.buttons : [];
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    const button = b;
    const type = String(button.type ?? "").toUpperCase();
    if (!(type in BUTTON_KIND)) return "a button Chanlytics cannot fill";
    if (type === "URL" && /\{\{\d+\}\}/.test(String(button.url ?? ""))) return "a button that takes a value";
  }
  return null;
}
export function refusedWords(reason) {
  const said = String(reason ?? "").trim().replace(/[.!?\s]+$/, "");
  if (!said) return null;
  const words = /^[A-Z0-9_]+$/.test(said) ? said.toLowerCase().replace(/_/g, " ") : said;
  return `WhatsApp refused this one: ${words}. Change the words and send it back.`;
}
const COUNT_WORDS = ["", "one", "two", "three", "four", "five"];
function blockedWords(reasons) {
  const seen = /* @__PURE__ */ new Map();
  for (const r of reasons) seen.set(r, (seen.get(r) ?? 0) + 1);
  const parts = [...seen].map(([reason, n]) => `${COUNT_WORDS[n] ?? n} ${n === 1 ? "has" : "have"} ${reason}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
}
export function sendableTemplates(list) {
  const sendable = [];
  const blocked = [];
  for (const t of list) (templateBlocked(t) ? blocked : sendable).push(t);
  if (blocked.length === 0) return { sendable, blocked, why: null };
  const n = blocked.length;
  const reasons = blocked.map((t) => templateBlocked(t));
  const words = n === 1 ? `it has ${reasons[0]}` : blockedWords(reasons);
  const many = COUNT_WORDS[n] ?? String(n);
  const lead = n === 1 ? "One of your messages" : `${many[0].toUpperCase()}${many.slice(1)} of your messages`;
  return {
    sendable,
    blocked,
    why: `${lead} can't go out from here \u2014 ${words}. ${n === 1 ? "It still works" : "They still work"} in WhatsApp Manager.`
  };
}
export function templateLinkButton(components) {
  const holder = partOf(components, "BUTTONS");
  const list = holder && Array.isArray(holder.buttons) ? holder.buttons : [];
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    const x = b;
    if (String(x.type ?? "").toUpperCase() !== "URL") continue;
    const text = typeof x.text === "string" ? x.text.trim() : "";
    const url = typeof x.url === "string" ? x.url.trim() : "";
    if (text && url) return { text, url };
  }
  return null;
}
