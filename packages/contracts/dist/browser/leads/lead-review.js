import { leadExclusionWord } from "./lead-facts.js";
import { milesLabel } from "./lead-helpers.js";
export const leadLowerFirst = (s) => s && s[1] && s[1] === s[1].toLowerCase() && s[1] !== s[1].toUpperCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s;
export const LEAD_REVIEW_GROUP_WORDS = {
  mailbox_waiting: "Waiting on the mailbox check",
  checks_out: "Their email checks out",
  mailbox_silent: "Their mail server wouldn't answer",
  bad_email: "Their email bounces",
  no_email: "No email on their site",
  no_phone: "No phone on their listing",
  catch_all: "Unconfirmed \u2014 the mailbox accepts any address",
  unsure: "Couldn't tell if",
  read_only: "Only the listing says so",
  out_of_area: "Just outside the area you asked for"
};
const REVIEW_GROUP_ORDER = [
  "mailbox_waiting",
  "checks_out",
  "mailbox_silent",
  "bad_email",
  "no_email",
  "no_phone",
  "catch_all",
  "unsure",
  "read_only",
  "out_of_area"
];
const REVIEW_GROUP_ACTS = {
  mailbox_waiting: [],
  checks_out: ["keep", "exclude"],
  mailbox_silent: ["check_again", "keep", "exclude"],
  bad_email: ["keep", "exclude"],
  no_email: ["keep", "exclude"],
  no_phone: ["keep", "exclude"],
  catch_all: ["keep", "exclude"],
  unsure: ["keep", "exclude"],
  read_only: ["keep", "exclude"],
  out_of_area: ["keep", "exclude"]
};
function reviewGroupOf(reason) {
  if (reason === "email:checking") return "mailbox_waiting";
  if (reason === "email:ok") return "checks_out";
  if (reason === "email:unknown") return "mailbox_silent";
  if (reason === "email:invalid") return "bad_email";
  if (reason === "email:none") return "no_email";
  if (reason === "phone:none") return "no_phone";
  if (reason === "email:catch_all") return "catch_all";
  if (reason.startsWith("unknown:")) return "unsure";
  if (reason.startsWith("inferred:")) return "read_only";
  if (reason === "out_of_area") return "out_of_area";
  return null;
}
export const LEAD_REVIEW_ACT_WORDS = {
  check_again: "Check again",
  keep: "Keep",
  exclude: "Exclude"
};
export const LEAD_REVIEW_GROUP_WHY = {
  mailbox_waiting: "The mailbox check is still running on these. Nothing to press \u2014 they move on their own.",
  checks_out: "Their address answered after this month's leads were spoken for, so they are waiting for you to keep them.",
  mailbox_silent: "Their mail server did not answer the check. Asking again settles most of them.",
  bad_email: "The address on their site does not exist, so an email would bounce. Their number may still be good.",
  no_email: "Their home, contact and about pages were read, and no address was on any of them.",
  no_phone: "This search counts a phone as enough, and no number on the listing could be matched against their site. An email may still reach them.",
  catch_all: "Their server accepts every address, so the check cannot tell whether this one is real.",
  unsure: "Claude could not tell from the listing or from their site.",
  read_only: "Only the listing says so, and this search asked to see it for itself.",
  out_of_area: "They sit outside the area you asked for, so they were not counted."
};
export const LEAD_CHECK_CENTS_EACH = 0.089;
export const leadCheckAgainCents = (n) => Math.max(1, Math.round(n * LEAD_CHECK_CENTS_EACH));
export function leadReviewCosts(acts, n, month) {
  const line = (a) => {
    switch (a) {
      case "keep":
        return month ? `They join Ready and count against this month. ${n} of your ${month.left} left.` : "They join Ready and count against this month.";
      case "exclude":
        return "They don't count, and nothing is charged.";
      case "check_again":
        return `About ${leadCheckAgainCents(n)}\xA2. Their answer lands here in a few minutes.`;
    }
  };
  return acts.map((act) => ({ act, label: LEAD_REVIEW_ACT_WORDS[act], line: line(act) }));
}
export function leadAskedFor(search) {
  const plan = search?.plan;
  if (!plan) return [];
  return [
    ...plan.criteria.map((c) => ({ text: c.text, kind: "criterion" })),
    ...plan.exclusions.map((e) => ({ text: e.text, kind: "exclusion" }))
  ];
}
export function leadReviewGroups(rows, search) {
  const by = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (r.cls !== "review") continue;
    const reasons = r.reasons ?? [];
    const held = reasons.map(reviewGroupOf).filter((g2) => g2 !== null && g2 !== "checks_out");
    const picked = held.length ? REVIEW_GROUP_ORDER.find((g2) => held.includes(g2)) : reasons.some((x) => reviewGroupOf(x) === "checks_out") ? "checks_out" : void 0;
    if (!picked) continue;
    const reason = reasons.find((x) => reviewGroupOf(x) === picked) ?? "";
    const crit = (picked === "unsure" || picked === "read_only") && reason.includes(":") ? reason.slice(reason.indexOf(":") + 1) : null;
    const key = crit ? `${picked}:${crit}` : picked;
    const label = crit ? `${LEAD_REVIEW_GROUP_WORDS[picked]} \u2014 ${leadLowerFirst(leadExclusionWord(search, crit))}` : LEAD_REVIEW_GROUP_WORDS[picked];
    const g = by.get(key) ?? { id: picked, key, label, ids: [], acts: REVIEW_GROUP_ACTS[picked] };
    g.ids.push(r.id);
    by.set(key, g);
  }
  return [...by.values()].sort((a, b) => REVIEW_GROUP_ORDER.indexOf(a.id) - REVIEW_GROUP_ORDER.indexOf(b.id));
}
const M_PER_DEG_LAT = 111320;
const middleOf = (pts) => {
  if (!pts.length) return null;
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  return { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
};
const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
export function leadAreaFrom(from, to) {
  if (!from || !to) return "";
  const perLng = M_PER_DEG_LAT * Math.cos(from.lat * Math.PI / 180);
  const e = (to.lng - from.lng) * perLng;
  const n = (to.lat - from.lat) * M_PER_DEG_LAT;
  const deg = (Math.atan2(e, n) * 180 / Math.PI + 360) % 360;
  return `${milesLabel(Math.hypot(e, n))} ${COMPASS[Math.round(deg / 45) % 8]}`;
}
export const LEAD_MAP_MAX_SPAN_M = 8e4;
export function leadMapPlot(rows, area) {
  const placed = rows.filter((r) => !!r.point);
  const anchor = area?.center ?? middleOf(placed.map((r) => r.point));
  if (!anchor || !placed.length && !area?.center)
    return { pins: [], ring: null, spanM: 0, tooWide: false, center: anchor };
  const perLng = M_PER_DEG_LAT * Math.cos(anchor.lat * Math.PI / 180);
  const at = (p) => ({
    e: (p.lng - anchor.lng) * perLng,
    s: (anchor.lat - p.lat) * M_PER_DEG_LAT
  });
  const metres = placed.map((r) => at(r.point));
  const reach = Math.max(
    area?.center && area.radius_m ? area.radius_m : 0,
    ...metres.map((m) => Math.max(Math.abs(m.e), Math.abs(m.s))),
    500
  );
  const half = reach * 1.12;
  const spanM = Math.round(half * 2);
  const into = (m) => ({ x: 0.5 + m.e / (half * 2), y: 0.5 + m.s / (half * 2) });
  return {
    pins: placed.map((r, i) => ({ id: r.id, ...into(metres[i]) })),
    ring: area?.center && area.radius_m ? { ...into(at(area.center)), r: area.radius_m / (half * 2) } : null,
    spanM,
    tooWide: !area?.center && spanM > LEAD_MAP_MAX_SPAN_M,
    center: anchor
  };
}
export const leadMapAcross = (spanM) => spanM ? `${milesLabel(spanM)} across` : "";
export function leadMapNote(plot, oneSearch) {
  if (plot.tooWide)
    return "These leads are spread too far apart to be one place. Pick a search to see it on the ground.";
  if (plot.ring) return "The area this search asked for, and every lead it placed inside it.";
  return oneSearch ? "" : "Every lead these searches placed on the ground.";
}
