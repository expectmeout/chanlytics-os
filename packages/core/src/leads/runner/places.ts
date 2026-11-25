/**
 * A place as the collect takes it (collect.ts; rejudge.ts makes its members here too): what a page's items become before
 * the judge and after it.
 *
 *   - takeBatch: the next batch of a page's items from a cursor, at most the plan's batch of places the judge must see,
 *     each item cleaned (clean.ts) and marked when a rule settles it before judging (closed for good: left out; no
 *     location: Needs review), with the items around them.
 *   - centerOf / nearbyFor: where the round measures from (the plan's centre, or for a city ask the median of the probe's
 *     places, E7) and where to look next when a round ran dry (the distance ladder's next rung past the area and every
 *     area a leg read, inside the search's reach: decision 0133).
 *   - memberOf: the member and the lead's columns the commit writes for one place, its class decided by code from the
 *     judge's answers (contracts classify, §0.1) or by the rule that kept it from the judge, a left-out place keeping none
 *     of its candidate emails or listing detail (PRD §0.4, §15).
 *   - askedOf: what each key asked under a plan, worked out once per plan (judgeAsked hashes every question).
 */

import {
  LEAD_NO_SITE_KEY,
  LEAD_UNREACHABLE_KEY,
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
import { inArea, haversineM, medianCenter, radiusFromSpread, type LatLng } from "../geo";
import { nextRung } from "../ladder";
import { JUDGE_REFUSED_REASON, factsOf } from "../judge";
import type { CollectPlace, LeadMemberRow, LeadShare } from "../ports";
import { CLOSED_REASON, NO_LOCATION_REASON, NO_SITE_REASON, type Phase } from "./rules";
import { NO_EMAIL_TOKEN } from "./weighed";

const NO_EMAIL_REASON = "no email found";
const UNREACHABLE_REASON = "no phone or email found";

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

/** A city's own ground, at least: no rung starts inside it, whatever its places' spread says (D3). */
const CITY_GROUND_M = 15_000;

/**
 * Where to look next when a round ran dry (D3, decision 0133): the distance ladder's next rung, from the area on the
 * card and the places found there, past every area a leg already read. Nothing when there is no centre yet (a city ask
 * whose probe placed nothing) or nothing left within the reach.
 */
export function nearbyFor(
  plan: LeadSearchPlan,
  members: LeadMemberRow[],
  read: readonly Pick<LeadArea, "center" | "zip">[],
  held: readonly LatLng[] = [],
): LeadArea[] {
  const geo = centerOf(plan, members);
  const ground = plan.area.kind === "city" ? CITY_GROUND_M : plan.area.radius_m;
  return nextRung({ plan, center: geo.center, areaRadiusM: Math.max(geo.radiusM, ground), read, held });
}

/** What each key asked under a plan, worked out once per plan (judgeAsked hashes every question). */
const ASKED = new WeakMap<LeadSearchPlan, Record<string, string>>();
const askedOf = (plan: LeadSearchPlan): Record<string, string> => {
  let a = ASKED.get(plan);
  if (!a) ASKED.set(plan, (a = judgeAsked(plan)));
  return a;
};

/** What the listing shows about the business (D2): kept for a lead, never for a left-out place (§0.4). */
function listingKept(cleanPlace: CleanPlace, excluded: boolean) {
  const raw = cleanPlace.raw;
  if (excluded)
    return {
      neighborhood: null,
      about: null,
      hours: [],
      image_url: null,
      price: null,
      reviews_dist: null,
      facebook_url: null,
      linkedin_url: null,
      tiktok_url: null,
      claimed: null,
      maps_url: null,
      rank: null,
    };
  return {
    neighborhood: raw.neighborhood,
    about: raw.about,
    hours: raw.hours,
    image_url: raw.imageUrl,
    price: raw.price,
    reviews_dist: raw.reviewsDist,
    facebook_url: raw.facebook,
    linkedin_url: raw.linkedin,
    tiktok_url: raw.tiktok,
    claimed: raw.claimed,
    maps_url: raw.mapsUrl,
    rank: raw.rank,
  };
}

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
  // A site never read has no "no email" to say: its pile says it could not be read (contracts review's site_unread).
  if (cleanPlace.raw.contactsRead === false)
    verdict = { ...verdict, reasons: verdict.reasons.map((r) => (r === "email:none" ? "email:unread" : r)) };
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
      ...listingKept(cleanPlace, excluded),
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
 * A place with no address to write to, settled by code where a search made for email reads on past its probe: it can
 * never count (decision 0132), and the judge's part in an address is picking one among those found. It is held as the
 * judge's own read would hold it (contracts classify): with no number either, left out as unreachable; else in review
 * for having no email. The probe's places are all judged, since the question after it is about fit. On 15 Nov 2026 a
 * search for med spas with a checked email paid the judge for 183 places with no address, more than half it read.
 * Null where the place has an address: the judge reads it.
 */
export function noEmailRule(clean: Pick<CleanPlace, "emails" | "phoneSources">): Prepared["rule"] {
  if (clean.emails.length > 0) return null;
  return clean.phoneSources === 0
    ? { class: "excluded", reason: UNREACHABLE_REASON, token: LEAD_UNREACHABLE_KEY, excluded_by: LEAD_UNREACHABLE_KEY }
    : { class: "review", reason: NO_EMAIL_REASON, token: NO_EMAIL_TOKEN, excluded_by: null };
}

/** Whether a phase of a plan shows the judge only a place with an address: a search made for email, past its probe. */
export const judgesAddressesOnly = (plan: Pick<LeadSearchPlan, "contact">, phase: Phase): boolean =>
  plan.contact === "email" && phase === "main";

/** The rule that settles a place before any judging (closed for good, no location, no site to read, no address), or null. */
function settledBefore(
  mapped: NonNullable<ReturnType<LeadCardRunner["mapItem"]>>,
  clean: CleanPlace,
  needsASite: boolean,
  emailOnly: boolean,
): Prepared["rule"] {
  if (mapped.closed) return { class: "excluded", reason: CLOSED_REASON, token: "closed", excluded_by: "closed" };
  if (mapped.location === null)
    return { class: "review", reason: NO_LOCATION_REASON, token: "out_of_area", excluded_by: null };
  if (needsASite && !clean.host && !clean.bookingPage)
    return { class: "excluded", reason: NO_SITE_REASON, token: LEAD_NO_SITE_KEY, excluded_by: LEAD_NO_SITE_KEY };
  return emailOnly ? noEmailRule(clean) : null;
}

/**
 * The next batch of items from `cursor`: at most `judgeable` places the judge must see (the plan's batch, contracts
 * judgeBatchPlaces), with the items around them. `emailOnly` is a search made for email past its probe: a place with no
 * address is settled here and takes none of the batch's room (noEmailRule).
 */
export function takeBatch(
  card: LeadCardRunner,
  plan: LeadSearchPlan,
  items: unknown[],
  cursor: number,
  judgeable: number,
  emailOnly = false,
): { end: number; prepared: Prepared[] } {
  const needsASite = planNeedsASite(plan);
  const prepared: Prepared[] = [];
  let toJudge = 0;
  let end = cursor;
  while (end < items.length) {
    const mapped = card.mapItem(items[end]);
    if (mapped) {
      const clean = cleanPlace(mapped);
      const rule = settledBefore(mapped, clean, needsASite, emailOnly);
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
