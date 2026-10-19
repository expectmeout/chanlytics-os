import { asListRule } from "./list-rules.js";
import { LIST_NEEDS } from "./list-fields.js";
import { listRuleMatches, ruleLists, ruleNeeds } from "./list-match.js";
import { BUILTIN_LISTS, PEOPLE_LISTS } from "./builtin-lists.js";
import { listToken, parseListToken } from "./list-token.js";
export function unmetNeed(needs, ctx) {
  const met = {
    calendar: ctx.calendar === "ok",
    consult: ctx.consultFirst,
    deals: ctx.hasDeals,
    viewer: ctx.viewer
  };
  return LIST_NEEDS.find((n) => needs.includes(n) && !met[n]) ?? null;
}
const builtinByToken = (token) => {
  const ref = parseListToken(token);
  return ref && ref.kind === "builtin" ? BUILTIN_LISTS.find((l) => l.id === ref.id) ?? null : null;
};
export function listMembers(list, rows, ctx, lookup = () => null) {
  if (list.rule == null) {
    const on = new Set(list.ids);
    return { state: "ok", ids: new Set(rows.filter((v) => on.has(v.id)).map((v) => v.id)) };
  }
  const rule = asListRule(list.rule);
  if (!rule) return { state: "unknown", reason: "rule" };
  const need = unmetNeed(ruleNeeds(rule), ctx);
  if (need) return { state: "unknown", reason: need };
  const read = /* @__PURE__ */ new Map();
  for (const token of ruleLists(rule)) {
    const b = builtinByToken(token);
    const other = b ? { rule: b.rule, ids: [], readable: true } : lookup(token);
    if (!other || !other.readable) return { state: "unknown", reason: "list" };
    if (other.rule && ruleLists(other.rule).length) return { state: "unknown", reason: "list" };
    const m = listMembers(other, rows, ctx);
    if (m.state === "unknown") return m;
    read.set(token, m.ids);
  }
  const inList = (token, id) => read.get(token)?.has(id) ?? false;
  return { state: "ok", ids: new Set(rows.filter((v) => listRuleMatches(rule, v, inList)).map((v) => v.id)) };
}
export function savedListIds(list, rows, ctx, lookup = () => null) {
  const m = listMembers(list, rows, ctx, lookup);
  return m.state === "ok" ? m.ids : /* @__PURE__ */ new Set();
}
export function savedListLookup(saved) {
  return (token) => {
    const ref = parseListToken(token);
    if (!ref || ref.kind !== "saved") return null;
    const l = saved.find((s) => s.id.toLowerCase() === ref.id);
    if (!l) return null;
    const rule = l.rule == null ? null : asListRule(l.rule);
    return { rule, ids: l.ids, readable: l.rule == null || rule !== null };
  };
}
export function listNamer(saved) {
  return (token) => {
    const ref = parseListToken(token);
    if (!ref) return null;
    return ref.kind === "builtin" ? PEOPLE_LISTS.find((l) => l.id === ref.id)?.label ?? null : saved.find((l) => l.id === ref.id)?.name ?? null;
  };
}
export function listNeeds(rule, lookup = () => null) {
  if (!rule) return [];
  const needs = new Set(ruleNeeds(rule));
  for (const token of ruleLists(rule)) {
    const b = builtinByToken(token);
    const other = b ? b.rule : lookup(token)?.rule;
    if (other) for (const n of ruleNeeds(other)) needs.add(n);
  }
  return LIST_NEEDS.filter((n) => needs.has(n));
}
function builtinDef(l) {
  const ref = { kind: "builtin", id: l.id };
  return {
    ref,
    token: listToken(ref),
    label: l.label,
    group: l.group,
    rule: l.rule,
    byHand: false,
    readable: true,
    ids: [],
    needs: ruleNeeds(l.rule),
    onProfile: l.onProfile !== false,
    archived: false
  };
}
function savedDef(l, lookup) {
  const ref = { kind: "saved", id: l.id };
  const rule = l.rule == null ? null : asListRule(l.rule);
  return {
    ref,
    token: listToken(ref),
    label: l.name,
    group: "saved",
    rule,
    byHand: l.rule == null,
    readable: l.rule == null || rule !== null,
    ids: l.rule == null ? l.ids : [],
    needs: listNeeds(rule, lookup),
    onProfile: true,
    archived: !!l.archived_at
  };
}
export function listsFor(ctx, saved) {
  const lookup = savedListLookup(saved);
  return [
    ...BUILTIN_LISTS.map(builtinDef).filter((d) => !unmetNeed(d.needs, ctx)),
    ...saved.filter((l) => !l.archived_at).map((l) => savedDef(l, lookup))
  ];
}
export function resolveList(ref, saved) {
  if (!ref) return null;
  if (ref.kind === "builtin") {
    const b = BUILTIN_LISTS.find((l2) => l2.id === ref.id);
    return b ? builtinDef(b) : null;
  }
  const l = saved.find((x) => x.id.toLowerCase() === ref.id.toLowerCase());
  return l ? savedDef(l, savedListLookup(saved)) : null;
}
export function membersOf(def, rows, ctx, saved = []) {
  if (!def.readable) return { state: "unknown", reason: "rule" };
  return listMembers(def.byHand ? { ids: def.ids } : { ids: [], rule: def.rule }, rows, ctx, savedListLookup(saved));
}
export function listUnknownWords(reason, calendar) {
  switch (reason) {
    case "calendar":
      return calendar === "none" ? "This list reads a calendar link. Add one under Settings \u203A Hours & booking to count it." : "This list reads your calendar, which can't be read right now.";
    case "consult":
      return "This list exists only where the profile lists a consult-first service under Settings \u203A Hours & booking.";
    case "deals":
      return "This list fills once a deal is recorded here: start a proposal from anyone's page in People.";
    case "viewer":
      return "This list is about whoever is looking, so only a person can count it.";
    case "rule":
      return "This list's rule was written by a newer version of Chanlytics and can't be read here.";
    case "list":
      return "A list this one reads is gone, or can't be counted itself.";
  }
}
export function savedListTip(list) {
  if (list.unknown) return list.unknown;
  if (list.byHand) return "A list kept by hand \u2014 add people from their profile";
  return `Keeps itself current: ${(list.rule ?? []).join(" \xB7 ")}`;
}
export function ruleNeedsViewer(rule) {
  if (rule == null) return false;
  const r = asListRule(rule);
  return !!r && ruleNeeds(r).includes("viewer");
}
export const viewerListWords = (name) => `${name} is about whoever is looking ("me"), and a campaign's run has no one looking. Pick a list that says who by what they did.`;
