import "server-only";
import {
  AD_BOOKED_TO_FORECAST,
  AppError,
  DAY_MS,
  DbFailure,
  ROLE_PERMS,
  adCardChecksOf,
  adStandingOf,
  adStateOfRow,
  guardrailsInForce,
  listingFactsOf,
  metaAdConfigOf,
  parseTenantConfigResult,
  recordOrEmpty,
  zoneDayKey,
  type AdAccountCard,
  type AdDraftInputs,
  type AdPlace,
  type AdServiceFacts,
  type AppointmentWord,
  type TenantConfig,
} from "@chanlytics/contracts";
import {
  findAdAccountForPage,
  findAdDraft,
  listAdsOfAccount,
  readAdsPageCounts,
  type AdAccountRow,
  type AdDraftRow,
  type AdRow,
  type AdsPageCounts,
} from "@chanlytics/db/ads";
import { findProfileName } from "@chanlytics/db/auth";
import { listServicesBookedSince } from "@chanlytics/db/calendar";
import { findChannelNumber } from "@chanlytics/db/channels";
import { findGoogleListingFacts } from "@chanlytics/db/google";
import { logAndGoOn } from "@chanlytics/log";
import type { AdBusinessFacts } from "../ask/skills/ad/brief";
import { getRoom } from "../ask/tools/read/calendar";
import { listAdPictures, type AdPictures } from "../content/ad-pictures";
import { getAppointmentWord } from "../people/deals";
import { ADS_PAGE_DAYS, aiStoppedAt } from "../readers/ads-page";
import type { ReaderContext } from "../shared/reader";
import { getTenantFacts } from "../shared/tenant";
import { findConfigRow } from "../workspace/config-row";
import { AdDraftStateSchema, type AdDraftState, type AdWideArea } from "./draft-shape";

/**
 * Everything a new ad's draft is picked and judged from, read once a request under the member's own session (the Ads
 * plan's 4.6, "Where each part comes from"): the business as Settings says it, its Services and how often each was
 * booked, the pictures Files holds that are fine in ads, the ad account Meta charges, whether AI is stopped, and the
 * workspace's kept draft.
 *
 * The amount's numbers (4.6 and G6), which contracts ads/draft.ts works the amount out from: who booked from this
 * account's ads over the Ads page's window and what those ads spent in it, so what a booking from an ad has cost; the
 * largest total any of its ads was turned on with; the most the owner said an ad may cost; and the Calendar's open
 * times over a run, read only where the rule can use them (five booked and a cost known), so a business with no ad
 * history never waits on its calendar.
 */

/** How far back "booked most" looks, and the most visits it counts. */
const BOOKED_LOOKBACK_DAYS = 90;
const BOOKED_READ = 2_000;

/** A service as a draft reads it: Services' own line, with how often it was booked and whether an ad already runs for it. */
export type AdDraftService = AdServiceFacts & { price: string | null; minutes: number | null };

/** The ad account a draft is for, as much of it as a draft reads. */
export interface AdDraftAccount {
  id: string;
  name: string;
  currency: string;
  minDailyMinor: number;
  page: string | null;
  /** Where an ad shows: Facebook, and Instagram where the Page's Instagram account is known. */
  places: AdPlace[];
  checks: AdAccountCard["checks"];
}

export interface AdDraftFacts {
  /** Today in the ad account's zone, else the workspace's. */
  today: string;
  business: AdBusinessFacts;
  services: AdDraftService[];
  address: string | null;
  /**
   * Where Google says the business goes to its customers and shows no address (its listing's `service_area_only`), the
   * place the listing names in the address's stead ("Austin, TX, USA"): what a fresh draft's wider place is found
   * from (area.ts). Null for a business people visit, or with no listing.
   */
  servesAt: string | null;
  /** The wider place found for a fresh draft where the business goes to its customers; null until one is found. */
  proposedArea: AdWideArea | null;
  /** Whether AI answers a WhatsApp number an ad can open. */
  whatsapp: boolean;
  /** That number, as dialled: the one an ad must name, since a Page can hold several (meta-make.ts). Null with none. */
  whatsappNumber: string | null;
  /** Null where no account is connected, or where Meta has not yet said the least it takes a day. */
  account: AdDraftAccount | null;
  /** An account is connected, and its first read is not in. */
  accountReading: boolean;
  pictures: AdPictures;
  history: AdDraftInputs["history"];
  /** The Calendar's open times over a draft's run; null with no calendar link, or where the rule cannot use them. */
  openTimes: number | null;
  /** The most the owner said any ad may cost, in the account's minor units; null until they say one (G6). */
  ownerMostMinor: number | null;
  /** The workspace's kept draft for this account, and who kept it where that was someone else; null where none is. */
  kept: { draft: AdDraftState; leftBy: string | null } | null;
  /** AI is stopped (Stop everything): no draft is written while it is (decision 0050, call 11). */
  stopped: boolean;
  /** Whether this member is the owner. */
  owner: boolean;
}

const sameName = (first: string, second: string): boolean => first.trim().toLowerCase() === second.trim().toLowerCase();

/**
 * The place a business that goes to its customers serves, as its Google listing names it; null for one people visit.
 * A listing that cannot be read is no fact: the draft keeps its circle.
 */
const servesAtOf = (listing: { address: string | null; facts: unknown } | null): string | null =>
  listing && listingFactsOf(listing.facts)?.service_area_only === true ? listing.address?.trim() || null : null;

/** The language an ad is written in: the first the business says it speaks, where that is Spanish; else English. */
const adLanguageOf = (languages: readonly string[] | undefined): AdBusinessFacts["language"] =>
  /^\s*(?:es\b|espa|span)/i.test(languages?.[0] ?? "") ? "es" : "en";

/** The names of the ads made here that still run: a service one of them offers is not offered again (G5). */
function runningHereOf(rows: readonly AdRow[], at: { today: string; timezone: string; nowMs: number }): string[] {
  return rows
    .filter((row) => row.origin === "chanlytics" && row.status === "made")
    .filter((row) => {
      const state = adStateOfRow(row, at);
      return state !== "ended" && state !== "finished";
    })
    .map((row) => row.name);
}

/**
 * What this account's ads have brought over the Ads page's window (4.6): who booked from them, what a booking cost
 * (what they spent over who booked; none until both are more than nothing), and the largest total any of its ads was
 * turned on with, made here or in Meta (G6: never above the largest total the owner has turned on). Only ads Chanlytics
 * holds count: one it cannot name brought people, but what it spent is not known.
 */
function adHistoryOf(ads: readonly AdRow[], counts: AdsPageCounts | null): AdDraftInputs["history"] {
  let booked = 0;
  let spentMinor = 0;
  for (const ad of ads) {
    booked += counts?.people.get(ad.id)?.booked ?? 0;
    spentMinor += counts?.spend.get(ad.id)?.spend_minor ?? 0;
  }
  const totals = ads.flatMap((row) =>
    row.status === "made" && row.budget_kind === "total" && row.budget_minor !== null && row.budget_minor > 0
      ? [row.budget_minor]
      : [],
  );
  return {
    booked,
    costPerBookedMinor: booked > 0 && spentMinor > 0 ? Math.round(spentMinor / booked) : null,
    largestTotalMinor: totals.length ? Math.max(...totals) : null,
  };
}

/** The Calendar's open times over the next fourteen days (Ask's own count of the room); null with none to read. */
async function readOpenTimes(rc: ReaderContext): Promise<number | null> {
  const room = await getRoom({ rc }).catch(logAndGoOn("an ad draft's open times", null));
  return room === null || "none" in room ? null : room.open;
}

/**
 * The kept draft, where it is this account's and still reads as one, with the name of whoever kept it where that was
 * not this member: New ad says who left it.
 */
async function keptDraftOf(
  rc: ReaderContext,
  row: AdDraftRow | null,
  accountId: string | null,
): Promise<AdDraftFacts["kept"]> {
  if (row === null || row.account_id !== accountId) return null;
  const parsed = AdDraftStateSchema.safeParse(row.draft);
  if (!parsed.success) return null;
  if (row.kept_by === null || row.kept_by === rc.userId) return { draft: parsed.data, leftBy: null };
  const named = await findProfileName(rc.ctx.supabase, row.kept_by);
  return { draft: parsed.data, leftBy: named.data?.display_name.trim() || "Someone on your team" };
}

/** The business an ad is written for, as its settings say it. */
function businessOf(settings: TenantConfig, named: { name: string }, word: AppointmentWord): AdBusinessFacts {
  const profile = settings.brain?.profile;
  return {
    name: settings.brain?.business_name || named.name,
    tone: profile?.tone?.trim() || null,
    word,
    neverPrices: guardrailsInForce(profile?.guardrails).never_quote_prices,
    language: adLanguageOf(profile?.languages),
  };
}

/** Services, each with how often it was booked and whether an ad made here already runs for it. */
function servicesOf(
  settings: TenantConfig,
  running: readonly string[],
  bookedNames: readonly string[],
): AdDraftService[] {
  return (settings.brain?.profile?.services ?? []).map((service) => ({
    id: service.name,
    name: service.name,
    price: service.price_note?.trim() || null,
    minutes: service.duration_min ?? null,
    advertised: running.some((name) => sameName(name, service.name)),
    booked: bookedNames.filter((name) => sameName(name, service.name)).length,
  }));
}

/** The ad account a draft is for: a connected one whose currency and least a day Meta has said. Null until then. */
function draftAccountOf(live: AdAccountRow | null): AdDraftAccount | null {
  if (live === null) return null;
  const meta = metaAdConfigOf(live.config);
  if (live.currency === null || meta.min_daily_minor === null) return null;
  return {
    id: live.id,
    name: live.name ?? "",
    currency: live.currency,
    minDailyMinor: meta.min_daily_minor,
    page: meta.page_name,
    places: meta.instagram_handle === null ? ["facebook"] : ["facebook", "instagram"],
    checks: adCardChecksOf({ standing: adStandingOf(live.standing), config: meta }),
  };
}

/** The picture a kept draft shows, as its row holds it: read with the shelves, wherever it stands on them. */
const keptPictureOf = (row: AdDraftRow | null): string | null => {
  const picture = recordOrEmpty(row?.draft).picture;
  return typeof picture === "string" ? picture : null;
};

/**
 * What a draft is picked and judged from. Thrown where the workspace's settings cannot be read: nothing is guessed.
 * `shown` are the pictures the request names (a piece "Run as an ad" chose, a draft's own), read with the kept draft's
 * wherever they stand, so a draft's own picture is never "gone" for being older than the few each shelf is read for.
 */
export async function readAdDraftFacts(
  rc: ReaderContext,
  shown: readonly (string | undefined)[] = [],
): Promise<AdDraftFacts> {
  const { supabase } = rc.ctx;
  const nowMs = rc.now.getTime();
  const keptRead = findAdDraft(supabase, rc.tenantId);
  const [named, settings, word, row, number, pictures, counts, bookedNames, keptRow, listing] = await Promise.all([
    getTenantFacts(supabase, rc.tenantId),
    findConfigRow(supabase, rc.tenantId),
    getAppointmentWord(rc.ctx, rc.tenantId),
    findAdAccountForPage(supabase, rc.tenantId, "meta"),
    findChannelNumber(supabase, rc.tenantId, "whatsapp"),
    keptRead.then((kept) => listAdPictures(rc, [...shown, keptPictureOf(kept)])),
    readAdsPageCounts(supabase, rc.tenantId, ADS_PAGE_DAYS),
    listServicesBookedSince(
      supabase,
      rc.tenantId,
      new Date(nowMs - BOOKED_LOOKBACK_DAYS * DAY_MS).toISOString(),
      BOOKED_READ,
    ),
    keptRead,
    findGoogleListingFacts(supabase, rc.tenantId),
  ]);
  if (number.error) throw new DbFailure(number.error, "the number AI answers");
  const parsed = parseTenantConfigResult(settings?.config ?? null);
  if (!parsed.ok)
    throw new AppError(
      "conflict",
      "Chanlytics couldn't read this workspace's settings, so no ad was drafted. Try again in a moment.",
      409,
    );
  const live = row?.status === "connected" ? row : null;
  const timezone = live?.timezone ?? named.timezone;
  const today = zoneDayKey(nowMs, timezone);
  const ads = live ? await listAdsOfAccount(supabase, rc.tenantId, live.id) : [];
  const aiNumber = number.data?.number_e164 ?? null;
  const account = draftAccountOf(live);
  const history = adHistoryOf(ads, counts);
  // The calendar is read only where the amount can lean on it (contracts ads/draft.ts amountFor).
  const forecast = history.booked >= AD_BOOKED_TO_FORECAST && history.costPerBookedMinor !== null;
  const [openTimes, kept] = await Promise.all([
    account && forecast ? readOpenTimes(rc) : null,
    keptDraftOf(rc, keptRow, account?.id ?? null),
  ]);
  return {
    today,
    business: businessOf(parsed.config, named, word),
    services: servicesOf(parsed.config, runningHereOf(ads, { today, timezone, nowMs }), bookedNames),
    address: parsed.config.brain?.profile?.address?.trim() || null,
    // A listing that could not be read says nothing of where the business serves: the draft keeps its circle.
    servesAt: listing.error ? null : servesAtOf(listing.data),
    proposedArea: null,
    whatsapp: aiNumber !== null,
    whatsappNumber: aiNumber,
    account,
    accountReading: live !== null && account === null,
    pictures,
    history,
    openTimes,
    // Before 00659 an account row holds no most: none said.
    ownerMostMinor: (account ? live?.most_minor : null) ?? null,
    kept,
    stopped: aiStoppedAt(settings?.config) !== null,
    owner: ROLE_PERMS[rc.role].ads,
  };
}
