import { slotToWrite } from "./inbox-templates.js";
import { languageLabels } from "./message-languages.js";
import { starterByKey, startersForTrigger } from "./starter-lookup.js";
import { STARTER_TEMPLATES } from "./starter-templates.js";
import { templateBlocked } from "./template-parts.js";
import { defaultSlotKinds } from "./template-slots.js";
import { templateTitle } from "./template-titles.js";
export function starterIndex(name) {
  const i = STARTER_TEMPLATES.findIndex((s) => s.name === name);
  return i === -1 ? STARTER_TEMPLATES.length : i;
}
export function compareTemplates(a, b) {
  const ai = starterIndex(a.name);
  const bi = starterIndex(b.name);
  if (ai !== bi) return ai - bi;
  const rank = (t) => (t.source === "chanlytics" ? 0 : 2) + (t.category === "utility" ? 1 : 0);
  return rank(a) - rank(b) || a.name.localeCompare(b.name) || String(a.language ?? "").localeCompare(String(b.language ?? ""));
}
export function defaultTemplate(list, trigger) {
  const sorted = list.slice().sort(compareTemplates);
  const quick = starterByKey("quick_note");
  const names = (trigger ? startersForTrigger(trigger) : quick ? [quick] : []).map((x) => x.name);
  for (const name of names) {
    const held = sorted.find((t) => t.name === name);
    if (held) return held;
  }
  return sorted[0] ?? null;
}
export function groupTemplates(list) {
  const out = [];
  const at = /* @__PURE__ */ new Map();
  for (const t of list.slice().sort(compareTemplates)) {
    let g = at.get(t.name);
    if (!g) {
      g = { name: t.name, title: templateTitle(t.name, t.title), rows: [], labels: {} };
      at.set(t.name, g);
      out.push(g);
    }
    g.rows.push(t);
  }
  for (const g of out) g.labels = languageLabels(g.rows.map((r) => r.language));
  return out;
}
export function bookingTemplate(templates) {
  const usable = templates.filter(
    (t) => t.meta_status === "approved" && !templateBlocked(t) && !slotToWrite(t) && defaultSlotKinds(t).includes("booking_link")
  );
  return usable.find((t) => t.name === "call_text") ?? usable.find((t) => t.name === "booking_link") ?? usable.slice().sort(compareTemplates)[0] ?? null;
}
