import {
  WHATSAPP_LANGUAGES,
  languageLabel,
  languageName,
  templateLanguage
} from "./template-languages.js";
export function languageWords(code) {
  return languageName(code);
}
export function languageLabels(codes) {
  const seen = /* @__PURE__ */ new Map();
  for (const c of codes) {
    const w = languageWords(c);
    seen.set(w, (seen.get(w) ?? 0) + 1);
  }
  const out = {};
  for (const c of codes) {
    const w = languageWords(c);
    out[c] = (seen.get(w) ?? 0) > 1 ? templateLanguage(c) ? languageLabel(c) : `${w} (${c})` : w;
  }
  return out;
}
export const LANGUAGE_GROUP_WORDS = {
  on: "On file",
  ready: "Ready to add",
  add: "Translate into"
};
export function messageLanguageChoices(input) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const known = (code) => templateLanguage(code) ?? {
    id: code,
    label: languageLabel(code),
    name: languageName(code),
    region: null,
    native: languageLabel(code)
  };
  for (const r of input.onFile) {
    if (seen.has(r.language)) continue;
    seen.add(r.language);
    out.push({ ...known(r.language), id: r.language, group: "on", status: r.meta_status ?? "approved" });
  }
  for (const code of input.ready ?? []) {
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ ...known(code), id: code, group: "ready", status: null });
  }
  if (input.canAdd) {
    for (const l of WHATSAPP_LANGUAGES) {
      if (seen.has(l.id)) continue;
      out.push({ ...l, group: "add" });
    }
  }
  return out;
}
export function templateUntranslatable(t) {
  if (t.blocked) return `it has ${t.blocked}`;
  if (t.category && !/^(marketing|utility)$/i.test(t.category))
    return `WhatsApp files it as ${String(t.category).toLowerCase()}`;
  if (t.header) return "it has a heading";
  const buttons = t.buttons ?? [];
  if (buttons.length > 1) return "it has more than one button";
  const b = buttons[0];
  if (b && b.kind !== "url") return b.kind === "reply" ? "it has a reply button" : "it has a button that calls";
  return null;
}
