/**
 * A place as the collect takes it: the next batch of a page's items, where the round measures from, and the member
 * the commit writes, its class decided by code. The collect is collect.ts; the re-judging (rejudge.ts) makes its
 * members here too.
 */

import {
  type LeadArea,
  LEAD_JUDGE_BATCH,
  classify,
  leadPhoneState,
  judgeAsked,
  type JudgePlaceAnswer,
  type LeadEmailState,
  type LeadSearchPlan,
} from "@chanlytics/contracts";
import { areaCenter, type LeadCardRunner } from "../cards";
import { cleanPlace, type CleanPlace } from "../clean";
import { inArea, haversineM, medianCenter, nearestAreas, radiusFromSpread, type LatLng } from "../geo";
import { JUDGE_REFUSED_REASON, factsOf } from "../judge";
import type { CollectPlace, LeadMemberRow, LeadShare } from "../ports";
import { CLOSED_REASON, NO_LOCATION_REASON } from "./rules";

interface Prepared {
  index: number;
  clean: CleanPlace;
  /** Left out or held by rule before any judging; null means the judge decides. `token` is the reason as contracts spells it. */
  rule: null | { class: "excluded" | "review"; reason: string; token: string; excluded_by: string | null };
}

/** Where a round's places are measured from: the plan's center, or for a city ask the median of the probe's places (E7, decision 31). */
export function centerOf(plan: LeadSearchPlan, members: LeadMemberRow[]): { center: LatLng | null; radiusM: number } {
  const fixed = areaCenter(plan);
  if (fixed) return { center: fixed, radiusM: plan.area.radius_m };
  const points = members
    .filter((m): m is LeadMemberRow & { lat: number; lng: number } => m.lat !== null && m.lng !== null)
    .map((m) => ({ lat: m.lat, lng: m.lng }));
  const center = medianCenter(points);
  return { center, radiusM: center ? radiusFromSpread(center, points) : plan.area.radius_m };
}

/**
 * Where to look next when a round ran dry (D3): the nearest ZIP centres past the area it measured from, three of them.
 * Nothing when the round has no centre yet (a city ask whose probe placed nothing).
 */
export function nearbyFor(plan: LeadSearchPlan, members: LeadMemberRow[]): LeadArea[] {
  const geo = centerOf(plan, members);
  if (!geo.center) return [];
  return nearestAreas(geo.center, { excludeWithinM: Math.max(geo.radiusM, 15_000), take: 3, state: plan.area.state });
}

/** What each key asked under a plan, worked out once per plan (judgeAsked hashes every question). */
const ASKED = new WeakMap<LeadSearchPlan, Record<string, string>>();
const askedOf = (plan: LeadSearchPlan): Record<string, string> => {
  let a = ASKED.get(plan);
  if (!a) ASKED.set(plan, (a = judgeAsked(plan)));
  return a;
};

/** One place as the commit takes it: the lead's columns, the member's class decided by code (§0.1), its shares. */
export function memberOf(
  plan: LeadSearchPlan,
  term: string,
  c: CleanPlace,
  a: JudgePlaceAnswer | null,
  opId: string | null,
  model: string | null,
  rule: Prepared["rule"],
  geo: { center: LatLng | null; radiusM: number },
  shares: LeadShare[],
  duplicateOf: string | null,
): CollectPlace {
  const loc = c.raw.location;
  const distance = geo.center && loc ? haversineM(geo.center, loc) : null;
  const picked = a && a.email_index !== null ? (c.emails[a.email_index] ?? null) : null;
  const emailState: LeadEmailState = picked ? "checking" : "none";
  // The class is code's (§0.1): contracts' classify from the judge's answers, or a rule that never reached the judge.
  let verdict: {
    class: "qualified" | "review" | "excluded";
    excluded_by: string | null;
    fit: "strong" | "look" | "long" | null;
    reasons: string[];
  };
  let reason: string;
  if (rule) {
    verdict = { class: rule.class, excluded_by: rule.excluded_by, fit: null, reasons: [rule.token] };
    reason = rule.reason;
  } else if (!a) {
    verdict = { class: "review", excluded_by: null, fit: null, reasons: ["judge:refused"] };
    reason = JUDGE_REFUSED_REASON;
  } else {
    verdict = classify(
      plan,
      a,
      factsOf(0, c),
      emailState,
      geo.center ? inArea(geo.center, geo.radiusM, loc) : true,
      leadPhoneState(c.phone),
    );
    reason = a.reason;
  }
  const excluded = verdict.class === "excluded";
  return {
    place: {
      place_id: c.raw.placeId,
      business_name: c.raw.title,
      category: c.raw.category,
      street: c.raw.street,
      city: c.raw.city,
      region: c.region ?? c.raw.state,
      postal_code: c.raw.postalCode,
      country: "US",
      lat: loc?.lat ?? null,
      lng: loc?.lng ?? null,
      website_host: c.host,
      instagram_url: c.raw.instagram,
      phone_e164: c.phone,
      phone_sources: c.phoneSources,
      // A left-out place never stores its candidate emails (PRD §0.4, §15).
      email: excluded ? null : picked,
      email_alternates: excluded
        ? []
        : c.emails
            .filter((e) => e !== picked)
            .slice(0, 4)
            .map((e) => ({
              email: e,
              why: c.host && e.endsWith(`@${c.host}`) ? "on their own domain" : "another domain",
            })),
      email_state: excluded ? "none" : emailState,
      rating: c.raw.rating,
      reviews: c.raw.reviews,
      // What the listing shows about the business (D2): kept for a lead, never for a left-out place (§0.4).
      neighborhood: excluded ? null : c.raw.neighborhood,
      about: excluded ? null : c.raw.about,
      hours: excluded ? [] : c.raw.hours,
      image_url: excluded ? null : c.raw.imageUrl,
      price: excluded ? null : c.raw.price,
      reviews_dist: excluded ? null : c.raw.reviewsDist,
      facebook_url: excluded ? null : c.raw.facebook,
      linkedin_url: excluded ? null : c.raw.linkedin,
      tiktok_url: excluded ? null : c.raw.tiktok,
      claimed: excluded ? null : c.raw.claimed,
      maps_url: excluded ? null : c.raw.mapsUrl,
      rank: excluded ? null : c.raw.rank,
      // The business's own mark (D6): read from its home page after the judge has decided, by markPlaces below,
      // with the copy of it we keep (00161).
      logo_url: null,
      mark_path: null,
    },
    member: {
      judgment: {
        op_id: opId,
        term,
        answer: a,
        model,
        reasons: verdict.reasons,
        ...(a ? { asked: askedOf(plan) } : {}),
      },
      class: verdict.class,
      excluded_by: verdict.excluded_by,
      fit: verdict.fit,
      reason: reason.slice(0, 120),
      distance_m: distance,
    },
    duplicate_of_place_id: duplicateOf,
    shares,
  };
}

/** The next batch of items from `cursor`: at most LEAD_JUDGE_BATCH places the judge must see, with the items around them. */
export function takeBatch(
  card: LeadCardRunner,
  items: unknown[],
  cursor: number,
): { end: number; prepared: Prepared[] } {
  const prepared: Prepared[] = [];
  let judgeable = 0;
  let end = cursor;
  while (end < items.length) {
    const mapped = card.mapItem(items[end]);
    if (mapped) {
      const clean = cleanPlace(mapped);
      const rule: Prepared["rule"] = mapped.closed
        ? { class: "excluded", reason: CLOSED_REASON, token: "closed", excluded_by: "closed" }
        : mapped.location === null
          ? { class: "review", reason: NO_LOCATION_REASON, token: "out_of_area", excluded_by: null }
          : null;
      if (!rule) {
        if (judgeable >= LEAD_JUDGE_BATCH) break;
        judgeable += 1;
      }
      prepared.push({ index: end, clean, rule });
    }
    end += 1;
  }
  return { end, prepared };
}

export { askedOf, type Prepared };
