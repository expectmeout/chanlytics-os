import { purposeOfTemplate } from "../consent/consent.js";
import { languageWords } from "./message-languages.js";
import { templateBlocked } from "./template-parts.js";
import { languageBase, languageLabel } from "./template-languages.js";
import { TEMPLATE_STATUS_WORDS } from "./templates.js";
import { defaultParamSpecs, slotLabels } from "./template-slots.js";
import { templateTitle } from "./template-titles.js";
import { starterByName } from "./starter-lookup.js";
const INBOX_FILLS = /* @__PURE__ */ new Set(["first_name", "business_name", "booking_link"]);
function titleWithoutLanguage(title, code) {
  for (const words of [languageLabel(code), languageWords(code)]) {
    const tail = ` (${words})`;
    if (title.length > tail.length && title.toLowerCase().endsWith(tail.toLowerCase())) {
      return title.slice(0, title.length - tail.length).trimEnd();
    }
  }
  return title;
}
export function inboxTemplates(templates, to) {
  const rows = [];
  let promotions = 0;
  let unfillable = 0;
  let afterVisit = 0;
  const refused = [];
  for (const t of templates) {
    const blocked = templateBlocked(t);
    if (blocked) {
      refused.push(blocked);
      continue;
    }
    const blank = inboxBlankOf(t);
    if (!blank && slotToWrite(t)) {
      unfillable += 1;
      continue;
    }
    if (purposeOfTemplate(t.category) === "marketing" && !to.offersOk) {
      promotions += 1;
      continue;
    }
    const starter = starterByName(t.name);
    const trigger = starter?.trigger ?? null;
    if (trigger === "visited" && to.visit === "ahead") {
      afterVisit += 1;
      continue;
    }
    const fits = !!blank && !!starter && trigger === null || trigger === "visit_tomorrow" && to.visit === "ahead";
    rows.push({ template: t, title: titleWithoutLanguage(templateTitle(t.name, t.title), t.language), blank, fits });
  }
  const isDefault = (r) => languageBase(r.template.language) === "en";
  const named = [...new Set(rows.map((r) => r.template.name))];
  const inDefault = (name) => rows.some((r) => r.template.name === name && isDefault(r));
  const names = [...named.filter(inDefault), ...named.filter((name) => !inDefault(name))];
  const byName = names.flatMap((name) => {
    const own = rows.filter((r) => r.template.name === name);
    return [...own.filter(isDefault), ...own.filter((r) => !isDefault(r))];
  });
  const ordered = [...byName.filter((r) => r.fits), ...byName.filter((r) => !r.fits)];
  const reads = (title) => ordered.filter((r) => r.title === title).length;
  const sendable = ordered.map((r) => ({
    template: r.template,
    title: r.title,
    label: reads(r.title) > 1 ? `${r.title} \xB7 ${languageWords(r.template.language)}` : r.title,
    blank: r.blank,
    fits: r.fits
  }));
  const held = [
    refused.length ? `${refused.length} that WhatsApp would refuse (${[...new Set(refused)].join(", ")})` : "",
    promotions ? `${promotions} promotion${promotions === 1 ? "" : "s"} (${to.who} hasn't said yes to offers)` : "",
    unfillable ? `${unfillable} that ${unfillable === 1 ? "needs" : "need"} words the Inbox doesn't ask for` : "",
    afterVisit ? `${afterVisit} for afterwards (${to.who}'s booking is ahead)` : ""
  ].filter(Boolean);
  const said = held.length > 1 ? `${held.slice(0, -1).join(", ")} and ${held[held.length - 1]}` : held[0];
  return { sendable, hidden: held.length ? `Not offered: ${said}.` : null };
}
export function templateOffered(t) {
  return t.meta_status === "approved" && !t.hidden_at;
}
export function templateHolds(left) {
  const out = { pending: 0, rejected: 0, paused: 0, disabled: 0, hidden: 0 };
  for (const t of left) {
    if (t.channel !== "whatsapp") continue;
    const status = t.meta_status;
    if (status === "pending" || status === "rejected" || status === "paused" || status === "disabled") out[status] += 1;
    else if (status === "approved") out.hidden += 1;
  }
  return out;
}
const byWhatsApp = (status) => `${TEMPLATE_STATUS_WORDS[status].toLowerCase()} by WhatsApp`;
const templateHoldWords = () => [
  ["pending", "waiting for WhatsApp to review"],
  ["rejected", byWhatsApp("rejected")],
  ["paused", byWhatsApp("paused")],
  ["disabled", byWhatsApp("disabled")],
  ["hidden", "hidden by you"]
];
export function noTemplateWords(held) {
  const parts = templateHoldWords().flatMap(([key, words]) => {
    const n = held?.[key] ?? 0;
    return n > 0 ? [`${n} ${words}`] : [];
  });
  return `No approved template yet${parts.length ? ` (${parts.join(", ")})` : ""} \u2014 nothing can be sent until one is.`;
}
export function inboxSlots(t) {
  return Array.isArray(t.variables) ? defaultParamSpecs({ name: t.name, variables: t.variables }) : [{ kind: "business_name" }, { kind: "booking_link" }];
}
export function slotToWrite(t) {
  const at = inboxSlots(t).findIndex((s) => !INBOX_FILLS.has(s.kind));
  if (at < 0) return null;
  return slotLabels({ name: t.name, language: t.language ?? "en_US", variables: t.variables })[at] ?? `Value ${at + 1}`;
}
export const TEMPLATE_WORDS_MAX = 300;
export function templateWords(words) {
  return (words ?? "").replace(/\s+/g, " ").trim();
}
export function inboxBlankOf(t) {
  const slots = inboxSlots(t);
  const open = slots.flatMap((s, at) => INBOX_FILLS.has(s.kind) ? [] : [{ s, at }]);
  const only = open.length === 1 ? open[0] : void 0;
  if (!only || only.s.kind !== "text" || only.s.value) return null;
  const labels = slotLabels({ name: t.name, language: t.language ?? "en_US", variables: t.variables });
  const vars = Array.isArray(t.variables) ? t.variables : [];
  const example = vars[only.at]?.example;
  return {
    at: only.at,
    label: labels[only.at] ?? `Value ${only.at + 1}`,
    example: typeof example === "string" && example.trim() ? example.trim() : null
  };
}
export function inboxTemplateParts(t, facts) {
  const body = String(t.body_preview ?? "");
  const blank = inboxBlankOf(t);
  if (!body) return blank ? [{ blank: blank.label }] : [];
  const slots = inboxSlots(t);
  const labels = slotLabels({ name: t.name, language: t.language ?? "en_US", variables: t.variables });
  const vars = Array.isArray(t.variables) ? t.variables : [];
  const valueAt = /* @__PURE__ */ new Map();
  slots.forEach((s, i) => {
    const given = vars[i]?.position;
    const pos = typeof given === "number" ? given : i + 1;
    const label = labels[i] ?? `Value ${i + 1}`;
    const words = s.kind === "first_name" ? facts.firstName || "there" : s.kind === "business_name" ? facts.businessName || `[${label}]` : s.kind === "booking_link" ? facts.bookingLink?.replace(/^https?:[/][/]/, "") || `[${label}]` : s.kind === "text" && s.value ? s.value : null;
    valueAt.set(pos, blank && i === blank.at ? { blank: blank.label } : { words: words ?? `[${label}]` });
  });
  const parts = [];
  let last = 0;
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ words: body.slice(last, at) });
    parts.push(valueAt.get(Number(m[1])) ?? { words: m[0] });
    last = at + m[0].length;
  }
  if (last < body.length) parts.push({ words: body.slice(last) });
  if (blank && !parts.some((part) => part.blank !== void 0)) parts.push({ words: " " }, { blank: blank.label });
  return parts;
}
