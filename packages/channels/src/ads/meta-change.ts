/**
 * Meta's ads wire, the changes an owner makes from Chanlytics (decision 0050, calls 1, 9 and 10; the Ads plan's step 2
 * and step 4, item 6): a part's own switch set to paused, active or archived (an ad ended for good: Meta never turns an
 * archived part on again, and keeps its numbers), an ad set's total, its last moment or who sees it, and an ad read
 * back to hear what Meta then says of it. A change costs three of an account's allowance where a read costs one, and
 * Meta takes one change to the same thing every thirty seconds and an ad set's amount four times an hour, so a caller
 * asks its pace first (the edge's lib/ads). Each call leaves through callMetaAds, once: a change that got no answer is
 * never sent again, and is settled by reading what stands at Meta.
 *
 * An ad set's change goes as Meta's dry run first (`validate_only`, as a make's does: the plan's 5.2). Meta's pages
 * name the dry run on a make and say nothing of it on a change (read 21 November 2026), so what an account answers to
 * one is seen at the first live change.
 */
import { valueAt } from "@chanlytics/contracts";
import { META_GRAPH, metaGraphUrl, metaObject, metaProofQuery, metaText } from "../meta/client";
import type { MetaRequest } from "../meta/client";
import { minorToMetaUnits } from "./meta-account";
import { NOT_EXACT_TOTAL, metaAdSetTargeting, type MetaAdSetAsk } from "./meta-make";

const ID = /^\d{5,32}$/;

/**
 * One part's own switch, set: Meta's `status` for an ad, PAUSED or ACTIVE, and the same for an ad set or a campaign,
 * which take it the same way (a launch switches an ad made here on from the bottom: its ads, its ad set, its campaign).
 * ARCHIVED ends it for good, with everything under it: Meta then lets only its name and its status change, and only
 * to DELETED (its page on an ad object's status, read 21 November 2026). Nothing else of the part is touched.
 */
export function metaAdSwitchRequest(
  token: string,
  appSecret: string,
  adId: string,
  to: "PAUSED" | "ACTIVE" | "ARCHIVED",
): MetaRequest {
  if (!ID.test(adId)) throw new Error("Meta's id for the part is not one");
  return { url: metaGraphUrl(adId, { status: to, ...metaProofQuery(token, appSecret) }), method: "POST" };
}

/** One ad's standing, asked after a change: Meta's own word for where it now stands. */
export function metaAdStandingRequest(token: string, appSecret: string, adId: string): MetaRequest {
  if (!ID.test(adId)) throw new Error("Meta's id for the ad is not one");
  return {
    url: metaGraphUrl(adId, { fields: "effective_status", ...metaProofQuery(token, appSecret) }),
    method: "GET",
  };
}

/** Meta's word for where an ad stands (`effective_status`), or null where the answer gives none. */
export function parseMetaAdStanding(json: unknown): string | null {
  return metaText(valueAt(metaObject(json), "effective_status")).slice(0, 100) || null;
}

/** One change to an ad set made here: its total, its last moment, or who sees it, sent whole with its new miles. */
export type MetaAdSetChange =
  | { what: "total"; totalMinor: number; currency: string }
  | { what: "end"; endsAt: string }
  | { what: "area"; area: Pick<MetaAdSetAsk, "centre" | "miles" | "wide" | "instagram"> };

/** The one field a change sends, in Meta's own units and words: exact, or the request is never built. */
function changedField(change: MetaAdSetChange): Record<string, string> {
  if (change.what === "total") {
    const total = minorToMetaUnits(change.totalMinor, change.currency);
    if (total === null || total <= 0) throw new Error(NOT_EXACT_TOTAL);
    return { lifetime_budget: String(total) };
  }
  if (change.what === "end") {
    const ms = Date.parse(change.endsAt);
    if (!Number.isFinite(ms)) throw new Error("the end is not a moment");
    return { end_time: new Date(ms).toISOString() };
  }
  return { targeting: JSON.stringify(metaAdSetTargeting(change.area)) };
}

/**
 * An ad set's change, as its dry run (Meta runs its rules and changes nothing) or for real. A change carries no key:
 * Meta's page names none for one, so a change whose answer never came is settled by a read back, never sent again.
 */
export function metaAdSetChangeRequest(
  sign: { token: string; appSecret: string },
  setId: string,
  change: MetaAdSetChange,
  how: { dryRun: boolean },
): MetaRequest {
  if (!ID.test(setId)) throw new Error("Meta's id for the ad set is not one");
  const body = new URLSearchParams({
    ...changedField(change),
    ...(how.dryRun ? { execution_options: JSON.stringify(["validate_only"]) } : {}),
    ...metaProofQuery(sign.token, sign.appSecret),
  }).toString();
  return {
    url: `${META_GRAPH}/${setId}`,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  };
}
