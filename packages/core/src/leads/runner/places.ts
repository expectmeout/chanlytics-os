/**
 * A place as the collect takes it (collect.ts; rejudge.ts makes its members here too): what a page's items become before
 * the judge and after it.
 *
 *   - takeBatch: the next batch of a page's items from a cursor, at most the plan's batch of places the judge must see,
 *     each item cleaned (clean.ts) and marked when a rule settles it before judging (closed for good: left out; no
 *     location: Needs review), with the items around them.
 *   - centerOf / nearbyFor: where the round measures from (the plan's centre, or for a city ask the median of the probe's
 *     places, E7) and where to look next when a round ran dry (the three nearest ZIP centres past the area, D3).
 *   - memberOf: the member and the lead's columns the commit writes for one place, its class decided by code from the
 *     judge's answers (contracts classify, §0.1) or by the rule that kept it from the judge, a left-out place keeping none
 *     of its candidate emails or listing detail (PRD §0.4, §15).
 *   - askedOf: what each key asked under a plan, worked out once per plan (judgeAsked hashes every question).
 */

import {
  LEAD_NO_SITE_KEY,
  planNeedsASite,
  type LeadArea,
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
import { CLOSED_REASON, NO_LOCATION_REASON, NO_SITE_REASON } from "./rules";

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
  cleanPlace: CleanPlace,
  judgePlaceAnswer: JudgePlaceAnswer | null,
  opId: string | null,
  model: string | null,
  rule: Prepared["rule"],
  geo: { center: LatLng | null; radiusM: number },
  shares: LeadShare[],
  duplicateOf: string | null,
): CollectPlace {
  const loc = cleanPlace.raw.location;
  const distance = geo.center && loc ? haversineM(geo.center, loc) : null;
  const picked =
    judgePlaceAnswer && judgePlaceAnswer.email_index !== null
      ? (cleanPlace.emails[judgePlaceAnswer.email_index] ?? null)
      : null;
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
  } else if (!judgePlaceAnswer) {
    verdict = { class: "review", excluded_by: null, fit: null, reasons: ["judge:refused"] };
    reason = JUDGE_REFUSED_REASON;
  } else {
    verdict = classify(
      plan,
      judgePlaceAnswer,
      factsOf(0, cleanPlace),
      emailState,
      geo.center ? inArea(geo.center, geo.radiusM, loc) : true,
      leadPhoneState(cleanPlace.phone),
    );
    reason = judgePlaceAnswer.reason;
  }
  const excluded = verdict.class === "excluded";
  return {
    place: {
      place_id: cleanPlace.raw.placeId,
      business_name: cleanPlace.raw.title,
      category: cleanPlace.raw.category,
      street: cleanPlace.raw.street,
      city: cleanPlace.raw.city,
      region: cleanPlace.region ?? cleanPlace.raw.state,
      postal_code: cleanPlace.raw.postalCode,
      country: "US",
      lat: loc?.lat ?? null,
      lng: loc?.lng ?? null,
      website_host: cleanPlace.host,
      website_root: cleanPlace.root,
      instagram_url: cleanPlace.raw.instagram,
      phone_e164: cleanPlace.phone,
      phone_sources: cleanPlace.phoneSources,
      // A left-out place never stores its candidate emails (PRD §0.4, §15).
      email: excluded ? null : picked,
      email_alternates: excluded
        ? []
        : cleanPlace.emails
            .filter((e) => e !== picked)
            .slice(0, 4)
            .map((e) => ({
              email: e,
              why: cleanPlace.host && e.endsWith(`@${cleanPlace.host}`) ? "on their own domain" : "another domain",
            })),
      email_state: excluded ? "none" : emailState,
      rating: cleanPlace.raw.rating,
      reviews: cleanPlace.raw.reviews,
      // What the listing shows about the business (D2): kept for a lead, never for a left-out place (§0.4).
      neighborhood: excluded ? null : cleanPlace.raw.neighborhood,
      about: excluded ? null : cleanPlace.raw.about,
      hours: excluded ? [] : cleanPlace.raw.hours,
      image_url: excluded ? null : cleanPlace.raw.imageUrl,
      price: excluded ? null : cleanPlace.raw.price,
      reviews_dist: excluded ? null : cleanPlace.raw.reviewsDist,
      facebook_url: excluded ? null : cleanPlace.raw.facebook,
      linkedin_url: excluded ? null : cleanPlace.raw.linkedin,
      tiktok_url: excluded ? null : cleanPlace.raw.tiktok,
      claimed: excluded ? null : cleanPlace.raw.claimed,
      maps_url: excluded ? null : cleanPlace.raw.mapsUrl,
      rank: excluded ? null : cleanPlace.raw.rank,
      // The business's own mark (D6) and the copy we keep (00161): read from its home page by markPlaces, below.
      logo_url: null,
      mark_path: null,
    },
    member: {
      judgment: {
        op_id: opId,
        term,
        answer: judgePlaceAnswer,
        model,
        reasons: verdict.reasons,
        ...(judgePlaceAnswer ? { asked: askedOf(plan) } : {}),
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

/**
 * The next batch of items from `cursor`: at most `judgeable` places the judge must see (the plan's batch, contracts
 * judgeBatchPlaces), with the items around them.
 */
export function takeBatch(
  card: LeadCardRunner,
  plan: LeadSearchPlan,
  items: unknown[],
  cursor: number,
  judgeable: number,
): { end: number; prepared: Prepared[] } {
  const needsASite = planNeedsASite(plan);
  const prepared: Prepared[] = [];
  let toJudge = 0;
  let end = cursor;
  while (end < items.length) {
    const mapped = card.mapItem(items[end]);
    if (mapped) {
      const clean = cleanPlace(mapped);
      const rule: Prepared["rule"] = mapped.closed
        ? { class: "excluded", reason: CLOSED_REASON, token: "closed", excluded_by: "closed" }
        : mapped.location === null
          ? { class: "review", reason: NO_LOCATION_REASON, token: "out_of_area", excluded_by: null }
          : needsASite && !clean.host && !clean.bookingPage
            ? { class: "excluded", reason: NO_SITE_REASON, token: LEAD_NO_SITE_KEY, excluded_by: LEAD_NO_SITE_KEY }
            : null;
      if (!rule) {
        if (toJudge >= judgeable) break;
        toJudge += 1;
      }
      prepared.push({ index: end, clean, rule });
    }
    end += 1;
  }
  return { end, prepared };
}

export { askedOf, type Prepared };
