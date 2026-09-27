/**
 * The review of a search's finds: the groups, the acts on each, and their words. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import type { LeadMonthDto, LeadSearchDto } from "./lead-dtos";
import { leadExclusionWord } from "./lead-facts";
import { milesLabel } from "./lead-helpers";
import type { LeadArea } from "./lead-search";
import type { LeadClass } from "./lead-words";

/* ------------------------------------------- Needs review, as a queue (D3) */

/** "Independent" -> "independent" for the middle of a sentence; a name that is capitals stays as it is. */
export const leadLowerFirst = (s: string): string =>
  s && s[1] && s[1] === s[1].toLowerCase() && s[1] !== s[1].toUpperCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s;

export const LEAD_REVIEW_GROUP_WORDS = {
  mailbox_waiting: "Waiting on the mailbox check",
  checks_out: "Their email checks out",
  mailbox_silent: "Their mail server wouldn't answer",
  bad_email: "Their email bounces",
  no_email: "No email on their site",
  no_phone: "No phone on their listing",
  catch_all: "Unconfirmed — the mailbox accepts any address",
  unsure: "Couldn't tell if",
  read_only: "Only the listing says so",
  out_of_area: "Just outside the area you asked for",
} as const;

export type LeadReviewGroupId = keyof typeof LEAD_REVIEW_GROUP_WORDS;

/**
 * What resolves a pile. "Find an email" was one, with no door behind it (Reach out Part 4, PR 9): a pile it headed
 * offered it in its group's words and priced it on the bench's column while no route could do it. A lead with no
 * address, or one that bounces, is kept or excluded, and called.
 */
export type LeadReviewAct = "check_again" | "keep" | "exclude";

/** The order an owner would work the pile: what resolves itself first, then what one press resolves, then what needs a look. */
const REVIEW_GROUP_ORDER: LeadReviewGroupId[] = [
  "mailbox_waiting",
  "checks_out",
  "mailbox_silent",
  "bad_email",
  "no_email",
  "no_phone",
  "catch_all",
  "unsure",
  "read_only",
  "out_of_area",
];

const REVIEW_GROUP_ACTS: Record<LeadReviewGroupId, LeadReviewAct[]> = {
  mailbox_waiting: [],
  checks_out: ["keep", "exclude"],
  mailbox_silent: ["check_again", "keep", "exclude"],
  bad_email: ["keep", "exclude"],
  no_email: ["keep", "exclude"],
  no_phone: ["keep", "exclude"],
  catch_all: ["keep", "exclude"],
  unsure: ["keep", "exclude"],
  read_only: ["keep", "exclude"],
  out_of_area: ["keep", "exclude"],
};

function reviewGroupOf(reason: string): LeadReviewGroupId | null {
  if (reason === "email:checking") return "mailbox_waiting";
  // The email token says the address's state now (the page reads it off the lead, not off the judgment's snapshot):
  // ok with the member still in review is a mailbox that checks out after the month was full, for Keep to count.
  if (reason === "email:ok") return "checks_out";
  if (reason === "email:unknown") return "mailbox_silent";
  if (reason === "email:invalid") return "bad_email";
  if (reason === "email:none") return "no_email";
  // A search that counts a phone as enough holds back a place whose number nothing could match (classify's
  // "phone:none"). It is a pile like any other: without it, those leads sat in the queue under no heading at all.
  if (reason === "phone:none") return "no_phone";
  if (reason === "email:catch_all") return "catch_all";
  if (reason.startsWith("unknown:")) return "unsure";
  if (reason.startsWith("inferred:")) return "read_only";
  if (reason === "out_of_area") return "out_of_area";
  return null;
}

export const LEAD_REVIEW_ACT_WORDS: Record<LeadReviewAct, string> = {
  check_again: "Check again",
  keep: "Keep",
  exclude: "Exclude",
};

/** Why a pile is waiting, in a sentence: what was looked at, and what is true of every lead in it. */
export const LEAD_REVIEW_GROUP_WHY: Record<LeadReviewGroupId, string> = {
  mailbox_waiting: "The mailbox check is still running on these. Nothing to press — they move on their own.",
  checks_out:
    "Their address answered after this month's leads were spoken for, so they are waiting for you to keep them.",
  mailbox_silent: "Their mail server did not answer the check. Asking again settles most of them.",
  bad_email: "The address on their site does not exist, so an email would bounce. Their number may still be good.",
  no_email: "Their home, contact and about pages were read, and no address was on any of them.",
  no_phone:
    "This search counts a phone as enough, and no number on the listing could be matched against their site. An email may still reach them.",
  catch_all: "Their server accepts every address, so the check cannot tell whether this one is real.",
  unsure: "Claude could not tell from the listing or from their site.",
  read_only: "Only the listing says so, and this search asked to see it for itself.",
  out_of_area: "They sit outside the area you asked for, so they were not counted.",
};

/** A mailbox re-check, in cents an address (the source card's own price): what "Check again" says it costs. */
export const LEAD_CHECK_CENTS_EACH = 0.089;

export const leadCheckAgainCents = (n: number): number => Math.max(1, Math.round(n * LEAD_CHECK_CENTS_EACH));

/**
 * What each press on the bench does, and what it costs (D5). One derivation, because the bar offers the acts and
 * the column beside it explains them: a Keep that spends a lead of the month says so with the number left.
 */
export function leadReviewCosts(
  acts: LeadReviewAct[],
  n: number,
  month: LeadMonthDto | null,
): { act: LeadReviewAct; label: string; line: string }[] {
  const line = (a: LeadReviewAct): string => {
    switch (a) {
      case "keep":
        return month
          ? `They join Ready and count against this month. ${n} of your ${month.left} left.`
          : "They join Ready and count against this month.";
      case "exclude":
        return "They don't count, and nothing is charged.";
      case "check_again":
        return `About ${leadCheckAgainCents(n)}¢. Their answer lands here in a few minutes.`;
    }
  };
  return acts.map((act) => ({ act, label: LEAD_REVIEW_ACT_WORDS[act], line: line(act) }));
}

/** What a search asked for, in the owner's own words: its criteria, then what it leaves out (D5's right column). */
export function leadAskedFor(search: LeadSearchDto | null): { text: string; kind: "criterion" | "exclusion" }[] {
  const plan = search?.plan;
  if (!plan) return [];
  return [
    ...plan.criteria.map((c) => ({ text: c.text, kind: "criterion" as const })),
    ...plan.exclusions.map((e) => ({ text: e.text, kind: "exclusion" as const })),
  ];
}

export interface LeadReviewGroup {
  id: LeadReviewGroupId;
  key: string;
  label: string;
  ids: string[];
  acts: LeadReviewAct[];
}

/**
 * Needs review as a queue: one group per thing that would resolve it, each with the leads in it and the acts that
 * resolve it. A lead with two reasons sits in the first group that fits it, in the order above; a group about one
 * criterion names it in the owner's own words from the plan, and two criteria make two groups.
 */
export function leadReviewGroups(
  rows: { id: string; cls: LeadClass; reasons: string[] }[],
  search: LeadSearchDto | null,
): LeadReviewGroup[] {
  const by = new Map<string, LeadReviewGroup>();
  for (const r of rows) {
    if (r.cls !== "review") continue;
    const reasons = r.reasons ?? [];
    // An address that checks out is not a problem: it groups a lead only when nothing else holds the lead back
    // (the month was full when its check answered), for Keep to count it. Anything else the lead waits on comes first.
    const held = reasons.map(reviewGroupOf).filter((g): g is LeadReviewGroupId => g !== null && g !== "checks_out");
    const picked = held.length
      ? REVIEW_GROUP_ORDER.find((g) => held.includes(g))
      : reasons.some((x) => reviewGroupOf(x) === "checks_out")
        ? "checks_out"
        : undefined;
    if (!picked) continue;
    const reason = reasons.find((x) => reviewGroupOf(x) === picked) ?? "";
    const crit =
      (picked === "unsure" || picked === "read_only") && reason.includes(":")
        ? reason.slice(reason.indexOf(":") + 1)
        : null;
    const key = crit ? `${picked}:${crit}` : picked;
    const label = crit
      ? `${LEAD_REVIEW_GROUP_WORDS[picked]} — ${leadLowerFirst(leadExclusionWord(search, crit))}`
      : LEAD_REVIEW_GROUP_WORDS[picked];
    const g = by.get(key) ?? { id: picked, key, label, ids: [], acts: REVIEW_GROUP_ACTS[picked] };
    g.ids.push(r.id);
    by.set(key, g);
  }
  return [...by.values()].sort((a, b) => REVIEW_GROUP_ORDER.indexOf(a.id) - REVIEW_GROUP_ORDER.indexOf(b.id));
}

/* ------------------------------------------------ the same leads, on the ground (D5) */

export interface LeadMapPin {
  id: string;
  x: number;
  y: number;
}

export interface LeadMapPlot {
  /** Every lead the door gave a place, in a square of 0..1 with 0,0 at the top left. */
  pins: LeadMapPin[];
  /** The area the search asked for, when it has a centre: where it sits in the same square, and how wide. */
  ring: { x: number; y: number; r: number } | null;
  /** How many metres the square is across, for the scale bar; 0 when there was nothing to place. */
  spanM: number;
  /**
   * True when these leads are not one place. Without an area to anchor on, the square is drawn from the leads
   * themselves, so six searches in six cities produced one square four thousand miles across with every city
   * collapsed into a dot. That is arithmetically honest and tells the owner nothing.
   */
  tooWide: boolean;
  /** What the square is centred on, so "widen the area" asks about the ground the owner is looking at. */
  center: { lat: number; lng: number } | null;
}

/** Metres per degree, near enough for a city: a plot of one town, not a projection of the world. */
const M_PER_DEG_LAT = 111_320;

/**
 * Where the leads sit on the ground, relative to each other and to the area the search asked for (D5). Everything
 * is measured in metres from one centre and then scaled into a square, so the picture is honest at a town's size
 * without a projection, a tile or a request to anyone. A lead the source placed nowhere is simply not on it.
 */
/** Past this, leads with no area to anchor them are not one place. Fifty miles: a city and the towns around it. */
export const LEAD_MAP_MAX_SPAN_M = 80_000;

export function leadMapPlot(
  rows: { id: string; point: { lat: number; lng: number } | null }[],
  area: LeadArea | null,
): LeadMapPlot {
  const placed = rows.filter((r): r is { id: string; point: { lat: number; lng: number } } => !!r.point);
  const anchor = area?.center ?? (placed.length ? { lat: placed[0].point.lat, lng: placed[0].point.lng } : null);
  if (!anchor || (!placed.length && !area?.center))
    return { pins: [], ring: null, spanM: 0, tooWide: false, center: anchor };
  const perLng = M_PER_DEG_LAT * Math.cos((anchor.lat * Math.PI) / 180);
  const at = (p: { lat: number; lng: number }) => ({
    e: (p.lng - anchor.lng) * perLng,
    s: (anchor.lat - p.lat) * M_PER_DEG_LAT,
  });
  const metres = placed.map((r) => at(r.point));
  // The square holds every lead and the whole of the area the search asked for, with a margin so nothing sits on
  // the edge. Half a kilometre is the smallest it goes: one lead alone is a place, not a pinpoint.
  const reach = Math.max(
    area?.center && area.radius_m ? area.radius_m : 0,
    ...metres.map((m) => Math.max(Math.abs(m.e), Math.abs(m.s))),
    500,
  );
  const half = reach * 1.12;
  const spanM = Math.round(half * 2);
  const into = (m: { e: number; s: number }) => ({ x: 0.5 + m.e / (half * 2), y: 0.5 + m.s / (half * 2) });
  return {
    pins: placed.map((r, i) => ({ id: r.id, ...into(metres[i]) })),
    ring: area?.center && area.radius_m ? { ...into(at(area.center)), r: area.radius_m / (half * 2) } : null,
    spanM,
    tooWide: !area?.center && spanM > LEAD_MAP_MAX_SPAN_M,
    center: anchor,
  };
}

/** How wide the square is, in the owner's own unit: "3.4 mi across", and nothing when there was nothing to place. */
export const leadMapAcross = (spanM: number): string => (spanM ? `${milesLabel(spanM)} across` : "");

/**
 * What the line under the plot says. A city ask has no centre until its probe measures one, so there is often no
 * area to draw and the picture is only where the leads are -- which is worth saying rather than implying a ring
 * that is not there.
 */
export function leadMapNote(plot: LeadMapPlot, oneSearch: boolean): string {
  if (plot.tooWide)
    return "These leads are spread too far apart to be one place. Pick a search to see it on the ground.";
  if (plot.ring) return "The area this search asked for, and every lead it placed inside it.";
  return oneSearch
    ? "Where this search's leads are. It never measured a centre, so there is no area to draw."
    : "Every lead these searches placed on the ground.";
}
