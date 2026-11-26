/**
 * Meta's ads wire, the reading part (decision 0049, step P1): the ads in an owner's account with the budget each sits
 * under, Meta's day for each ad, and the account's subscription to Meta's notices. The account itself and its Page are
 * meta-account.ts; every call leaves through callMetaAds (meta-call.ts), once.
 *
 * Every request is built by a pure function and read by a pure parser. Read on Meta's own reference pages on
 * 19 November 2026 (the ad, the ad set, the campaign, ad insights, the ad account's subscribed apps); each field is
 * named where it is read, and none is trusted: a part that is not as expected is left out, never guessed.
 *
 * A budget sits on the ad set or on the campaign above it (Meta holds it in one of the two), as an amount a day or a
 * total for the whole run. Money is converted here from Meta's own units, as an account's is (meta-account.ts).
 */
import { isDayKey, recordOrEmpty, valueAt, type AdEngaged } from "@chanlytics/contracts";
import { META_GRAPH, metaErrorOf, metaGraphUrl, metaObject, metaProofQuery, metaText } from "../meta/client";
import type { MetaRequest } from "../meta/client";
import { metaAccountId, metaDecimalToMinor, metaUnitsToMinor } from "./meta-account";

const ID = /^\d{5,32}$/;
const account = (id: string): string => `act_${encodeURIComponent(metaAccountId(id))}`;

/* ------------------------------------------------------------------ the ads */

/**
 * Meta's words for where an ad stands that mean it is not gone: every `effective_status` but ARCHIVED and DELETED.
 * The list asks for these by name, so what it answers does not depend on what Meta leaves out when asked for nothing.
 */
const META_LISTED_STATES = [
  "ACTIVE",
  "PAUSED",
  "PENDING_REVIEW",
  "DISAPPROVED",
  "PREAPPROVED",
  "PENDING_BILLING_INFO",
  "CAMPAIGN_PAUSED",
  "ADSET_PAUSED",
  "IN_PROCESS",
  "WITH_ISSUES",
] as const;

/** What a list asks of the ad set above each ad: its budget and run, what a tap opens, and where it shows. */
const SET_FIELDS = [
  "id",
  "daily_budget",
  "lifetime_budget",
  "budget_remaining",
  "start_time",
  "end_time",
  "destination_type",
  "targeting{publisher_platforms}",
].join(",");

const AD_FIELDS = [
  "id",
  "name",
  "status",
  "effective_status",
  "created_time",
  "issues_info",
  "ad_review_feedback",
  `adset{${SET_FIELDS}}`,
  "campaign{id,daily_budget,lifetime_budget,budget_remaining}",
  // What it shows: its words, its small picture and, where it is one, its whole image; and the Instagram post it runs,
  // by Meta's id for it (a comment Meta says was left on the ad names the ad, 00719) and the post's own address.
  "creative{title,body,thumbnail_url,image_url,effective_instagram_media_id,instagram_permalink_url}",
].join(",");

/** The most ads one page of the list holds. */
export const META_ADS_PAGE = 100;

/** One page of an account's ads that are not gone, each with the ad set and the campaign it sits under. */
export function metaAdsRequest(token: string, appSecret: string, accountId: string, after?: string): MetaRequest {
  return {
    url: metaGraphUrl(`${account(accountId)}/ads`, {
      fields: AD_FIELDS,
      effective_status: JSON.stringify(META_LISTED_STATES),
      limit: String(META_ADS_PAGE),
      ...(after ? { after } : {}),
      ...metaProofQuery(token, appSecret),
    }),
    method: "GET",
  };
}

/** The most ads asked for by id in one call (Meta's own bound for `ids`). */
export const META_IDS_MAX = 50;

/**
 * Ads by their ids, whatever state each is in: the ones a list no longer names, or never did. One of Meta's batches,
 * each ad its own GET inside it, posted to the Graph's root with the token and its proof on the batch itself. Meta
 * answers a root `GET /?ids=` with an error since v26.0 ("Use per-object requests or supported batching", its v26.0
 * changelog, in force for every version since 27 October 2026), and a removed ad is read only by its own id (its page on
 * an ad object's status). A batch holds up to fifty, and each request in it counts against the account's allowance.
 */
export function metaAdsByIdRequest(token: string, appSecret: string, adIds: readonly string[]): MetaRequest {
  const ids = adIds.filter((id) => ID.test(id)).slice(0, META_IDS_MAX);
  const batch = ids.map((id) => ({ method: "GET", relative_url: `${id}?fields=${encodeURIComponent(AD_FIELDS)}` }));
  return {
    url: META_GRAPH,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      batch: JSON.stringify(batch),
      include_headers: "false",
      ...metaProofQuery(token, appSecret),
    }).toString(),
  };
}

/** The budget an ad sits under, as Meta holds it. Money is in ISO minor units of the account's currency. */
export interface MetaAdBudget {
  /** Where Meta holds it: on the ad set, or on the campaign above. */
  at: "set" | "campaign";
  /** Meta's id for the ad set or campaign that holds it: two ads with the same one spend from one budget. */
  holderId: string;
  kind: "total" | "daily";
  minor: number;
  /** What is left of a total; null for an amount a day, or where Meta gave none. */
  leftMinor: number | null;
}

/** An ad as Meta describes it. */
export interface MetaAd {
  id: string;
  name: string;
  /** What its owner set it to: Meta's `status`. Null for a word Chanlytics does not know. */
  configured: "ACTIVE" | "PAUSED" | "ARCHIVED" | "DELETED" | null;
  /** Where it shows: the platforms its ad set names, as Meta names them; null where Meta named none. */
  shownOn: string[] | null;
  /** Meta's own word for where it stands, as given (`effective_status`). */
  state: string;
  /** Why Meta will not run it, in Meta's words; null where it gave none. */
  issue: string | null;
  createdAt: string | null;
  setId: string | null;
  campaignId: string | null;
  /** What a tap opens, as the ad set says (`destination_type`); null where it says nothing. */
  destination: string | null;
  budget: MetaAdBudget | null;
  startsAt: string | null;
  endsAt: string | null;
  /**
   * What it says where it shows: only the parts Meta gave. Its small picture (`thumbnail`, Meta's 64px), its whole image
   * where it is one (`image`), and the Instagram post it runs (`post`, Meta's id for it; `permalink`, the post's address).
   */
  said: { headline?: string; body?: string; thumbnail?: string; image?: string; post?: string; permalink?: string };
}

/** An address Meta gave for an ad's creative, its picture or its post, that a page may draw or open: https, and short. */
const creativeAddressOf = (value: unknown): string | null => {
  const text = metaText(value);
  return /^https:\/\//.test(text) && text.length <= 2000 ? text : null;
};

/** What an ad's creative shows, as the ad keeps it (said): only the parts Meta gave. */
function saidOf(creative: Record<string, unknown> | null): MetaAd["said"] {
  const headline = metaText(valueAt(creative, "title")).slice(0, 300);
  const body = metaText(valueAt(creative, "body")).slice(0, 2000);
  const thumbnail = creativeAddressOf(valueAt(creative, "thumbnail_url"));
  const image = creativeAddressOf(valueAt(creative, "image_url"));
  const post = metaText(valueAt(creative, "effective_instagram_media_id"));
  const permalink = creativeAddressOf(valueAt(creative, "instagram_permalink_url"));
  return {
    ...(headline ? { headline } : {}),
    ...(body ? { body } : {}),
    ...(thumbnail ? { thumbnail } : {}),
    ...(image ? { image } : {}),
    ...(ID.test(post) ? { post } : {}),
    ...(permalink ? { permalink } : {}),
  };
}

const CONFIGURED: readonly string[] = ["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"];
const isConfigured = (word: string): word is NonNullable<MetaAd["configured"]> => CONFIGURED.includes(word);

/** A moment as Meta writes one (ISO 8601 with an offset), as an ISO instant; null for anything else. */
export function instantOf(value: unknown): string | null {
  const text = metaText(value);
  const ms = text ? Date.parse(text) : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** The budget one holder (an ad set or a campaign) says it has; null where it holds none. */
function budgetOf(
  holder: Record<string, unknown> | null,
  at: MetaAdBudget["at"],
  currency: string,
): MetaAdBudget | null {
  const holderId = metaText(valueAt(holder, "id"));
  if (!holder || !ID.test(holderId)) return null;
  const total = metaUnitsToMinor(valueAt(holder, "lifetime_budget"), currency) ?? 0;
  const daily = metaUnitsToMinor(valueAt(holder, "daily_budget"), currency) ?? 0;
  if (total > 0)
    return {
      at,
      holderId,
      kind: "total",
      minor: total,
      leftMinor: metaUnitsToMinor(valueAt(holder, "budget_remaining"), currency),
    };
  return daily > 0 ? { at, holderId, kind: "daily", minor: daily, leftMinor: null } : null;
}

/** Why Meta will not run an ad: its review's words where it gave some, else the first issue it lists. */
function issueOf(ad: Record<string, unknown>): string | null {
  const review = recordOrEmpty(valueAt(metaObject(valueAt(ad, "ad_review_feedback")), "global"));
  const reasons = Object.entries(review)
    .map(([policy, why]) => metaText(why) || policy.replaceAll("_", " ").toLowerCase())
    .filter(Boolean);
  if (reasons.length > 0) return reasons.join(" ").slice(0, 2000);
  const issues = valueAt(ad, "issues_info");
  const first = Array.isArray(issues) ? metaObject(issues[0]) : null;
  const said = metaText(valueAt(first, "error_message")) || metaText(valueAt(first, "error_summary"));
  return said ? said.slice(0, 2000) : null;
}

/** One ad, read; null where the answer names no ad. */
function adOf(row: unknown, currency: string): MetaAd | null {
  const ad = metaObject(row);
  const id = metaText(valueAt(ad, "id"));
  if (!ad || !ID.test(id)) return null;
  const set = metaObject(valueAt(ad, "adset"));
  const campaign = metaObject(valueAt(ad, "campaign"));
  const creative = metaObject(valueAt(ad, "creative"));
  const configured = metaText(valueAt(ad, "status"));
  const platforms = valueAt(metaObject(valueAt(set, "targeting")), "publisher_platforms");
  const shownOn = Array.isArray(platforms)
    ? platforms
        .map(metaText)
        .filter((word) => /^[a-z_]{1,40}$/.test(word))
        .slice(0, 10)
    : [];
  return {
    id,
    name: metaText(valueAt(ad, "name")).slice(0, 500) || id,
    configured: isConfigured(configured) ? configured : null,
    shownOn: shownOn.length > 0 ? shownOn : null,
    state: metaText(valueAt(ad, "effective_status")).slice(0, 100) || "UNKNOWN",
    issue: issueOf(ad),
    createdAt: instantOf(valueAt(ad, "created_time")),
    setId: metaText(valueAt(set, "id")) || null,
    campaignId: metaText(valueAt(campaign, "id")) || null,
    destination: metaText(valueAt(set, "destination_type")) || null,
    // Meta holds a budget in one of the two places; the ad set's is asked first.
    budget: budgetOf(set, "set", currency) ?? budgetOf(campaign, "campaign", currency),
    startsAt: instantOf(valueAt(set, "start_time")),
    endsAt: instantOf(valueAt(set, "end_time")),
    said: saidOf(creative),
  };
}

/** Where a list's next page begins; null on its last. */
function afterOf(json: unknown): string | null {
  const paging = metaObject(valueAt(metaObject(json), "paging"));
  if (!metaText(valueAt(paging, "next"))) return null;
  return metaText(valueAt(metaObject(valueAt(paging, "cursors")), "after")) || null;
}

/** One page of an account's ads. Throws, with Meta's words where it gave some, when the answer is no list. */
export function parseMetaAds(json: unknown, currency: string): { ads: MetaAd[]; after: string | null } {
  const data = valueAt(metaObject(json), "data");
  if (!Array.isArray(data)) throw new Error(metaErrorOf(json)?.message ?? "Meta did not list the ads");
  return { ads: data.flatMap((row) => adOf(row, currency) ?? []), after: afterOf(json) };
}

/** Ads asked for by id: the ones Meta described. One it would not describe is simply absent. */
export function parseMetaAdsById(json: unknown, currency: string): MetaAd[] {
  if (!Array.isArray(json)) throw new Error(metaErrorOf(json)?.message ?? "Meta did not describe the ads");
  const bodies = json.map((item) => {
    const one = metaObject(item);
    const body = valueAt(one, "body");
    if (typeof body !== "string") return { ok: false, body: null };
    try {
      return { ok: valueAt(one, "code") === 200, body: JSON.parse(body) as unknown };
    } catch {
      // Not JSON: it describes no ad.
      return { ok: false, body: null };
    }
  });
  // An ad Meta would not describe is left as it stands until a later read; where it described none, the read says why.
  if (bodies.length > 0 && bodies.every((one) => !one.ok)) {
    const first = bodies.find((one) => one.body !== null)?.body;
    throw new Error(metaErrorOf(first)?.message ?? "Meta did not describe the ads");
  }
  return bodies.flatMap((one) => (one.ok ? (adOf(one.body, currency) ?? []) : []));
}

/* --------------------------------------------------------------- their days */

/** The most rows one page of days holds. */
export const META_DAYS_PAGE = 500;

/**
 * One page of Meta's days for an account's ads: a row for each ad and day it was shown, from `since` to `until`, both
 * days in the account's own zone (YYYY-MM-DD), which is how Meta counts a day.
 */
export function metaAdDaysRequest(
  token: string,
  appSecret: string,
  accountId: string,
  range: { since: string; until: string; after?: string | undefined },
): MetaRequest {
  return {
    url: metaGraphUrl(`${account(accountId)}/insights`, {
      level: "ad",
      time_increment: "1",
      time_range: JSON.stringify({ since: range.since, until: range.until }),
      fields: "ad_id,spend,impressions,inline_link_clicks,actions",
      limit: String(META_DAYS_PAGE),
      ...(range.after ? { after: range.after } : {}),
      ...metaProofQuery(token, appSecret),
    }),
    method: "GET",
  };
}

/** Meta's day for one ad. Money is in ISO minor units of the account's currency. */
export interface MetaAdDay {
  adId: string;
  /** The day, in the account's zone: YYYY-MM-DD. */
  day: string;
  spendMinor: number;
  impressions: number;
  /** Taps on the ad that open what it leads to (`inline_link_clicks`). */
  clicks: number;
  /** The chats Meta says the ad started that day; null where it counted none of that kind. */
  conversations: number | null;
  /** The forms Meta says were sent that day; null where it counted none of that kind. */
  leads: number | null;
  /**
   * What the day of the ad did as Meta counts it (00719): plays, engagement, comments, reactions, saves, shares. Left
   * out of a day Meta counted none of them on.
   */
  engaged?: AdEngaged;
}

/** Meta's own names for what a post's ad did (its Ads Action Stats' action types), by the word the ad keeps for each. */
const ENGAGED_ACTIONS: Readonly<Record<keyof AdEngaged, string>> = {
  plays: "video_view",
  engaged: "post_engagement",
  comments: "comment",
  reactions: "post_reaction",
  saves: "onsite_conversion.post_save",
  shares: "post",
};

/** What a day of an ad did, of what Meta counted: each kind it counted any of; null where it counted none. */
function engagedOf(counted: ReadonlyMap<string, number>): AdEngaged | null {
  const parts = Object.entries(ENGAGED_ACTIONS).flatMap(([kind, action]) => {
    const n = counted.get(action) ?? 0;
    return n > 0 ? [[kind, n] as const] : [];
  });
  return parts.length > 0 ? Object.fromEntries(parts) : null;
}

const countOf = (value: unknown): number => {
  const n = Number(metaText(value));
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
};

/** Meta's own names for what it counts as a chat started, and as a form sent. */
const CONVERSATION_ACTION = "onsite_conversion.messaging_conversation_started_7d";
const LEAD_ACTIONS: readonly string[] = ["lead", "onsite_conversion.lead_grouped"];

function dayOf(row: unknown, currency: string): MetaAdDay | null {
  const o = metaObject(row);
  const adId = metaText(valueAt(o, "ad_id"));
  const day = metaText(valueAt(o, "date_start"));
  if (!o || !ID.test(adId) || !isDayKey(day)) return null;
  const actions = valueAt(o, "actions");
  const counted = new Map<string, number>(
    (Array.isArray(actions) ? actions : []).map((action) => {
      const one = metaObject(action);
      return [metaText(valueAt(one, "action_type")), countOf(valueAt(one, "value"))];
    }),
  );
  const leads = LEAD_ACTIONS.flatMap((name) => counted.get(name) ?? []);
  const engaged = engagedOf(counted);
  return {
    adId,
    day,
    spendMinor: metaDecimalToMinor(valueAt(o, "spend"), currency) ?? 0,
    impressions: countOf(valueAt(o, "impressions")),
    clicks: countOf(valueAt(o, "inline_link_clicks")),
    conversations: counted.get(CONVERSATION_ACTION) ?? null,
    leads: leads.length > 0 ? Math.max(...leads) : null,
    ...(engaged ? { engaged } : {}),
  };
}

/** One page of days. Throws, with Meta's words where it gave some, when the answer is no list. */
export function parseMetaAdDays(json: unknown, currency: string): { days: MetaAdDay[]; after: string | null } {
  const data = valueAt(metaObject(json), "data");
  if (!Array.isArray(data)) throw new Error(metaErrorOf(json)?.message ?? "Meta did not give the ads' days");
  return { days: data.flatMap((row) => dayOf(row, currency) ?? []), after: afterOf(json) };
}

/* ------------------------------------------------------------ Meta's notices */

/**
 * An ad account subscribed to the app's notices (the `ad_account` object): Meta then tells Chanlytics when an ad's
 * standing changes there. A change at Meta, and the one call a read makes that is not a read.
 */
export function metaSubscribeNoticesRequest(
  token: string,
  appSecret: string,
  accountId: string,
  appId: string,
): MetaRequest {
  return {
    url: metaGraphUrl(`${account(accountId)}/subscribed_apps`, { app_id: appId, ...metaProofQuery(token, appSecret) }),
    method: "POST",
  };
}

/** What one delivery of Meta's notices names: the ad accounts something changed in, each once, and how many changes. */
export interface MetaAdsNotice {
  accountIds: string[];
  changes: number;
}

/** A delivery of Meta's notices for ad accounts, read. One for another object names nothing. */
export function parseMetaAdsNotice(json: unknown): MetaAdsNotice {
  const delivery = metaObject(json);
  const entries = valueAt(delivery, "entry");
  if (metaText(valueAt(delivery, "object")) !== "ad_account" || !Array.isArray(entries))
    return { accountIds: [], changes: 0 };
  const ids = new Set<string>();
  let changes = 0;
  for (const entry of entries) {
    const one = metaObject(entry);
    const id = metaAccountId(metaText(valueAt(one, "id")));
    const changed = valueAt(one, "changes");
    if (!ID.test(id)) continue;
    ids.add(id);
    changes += Array.isArray(changed) ? changed.length : 0;
  }
  return { accountIds: [...ids], changes };
}
