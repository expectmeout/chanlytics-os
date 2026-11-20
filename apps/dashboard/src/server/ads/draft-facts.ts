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
  metaAdConfigOf,
  parseTenantConfigResult,
  zoneDayKey,
  type AdAccountCard,
  type AdDraftInputs,
  type AdPlace,
  type AdServiceFacts,
} from "@chanlytics/contracts";
import { findAdAccountForPage, listAdsOfAccount, readAdsPageCounts, type AdRow } from "@chanlytics/db/ads";
import { listServicesBookedSince } from "@chanlytics/db/calendar";
import { findChannelNumber } from "@chanlytics/db/channels";
import type { AdBusinessFacts } from "../ask/skills/ad/brief";
import { appointmentWord, config, facts } from "../readers/facts";
import { load, type ReaderContext } from "../shared/reader";
import { listAdPictures, type AdPictures } from "./pictures";

/**
 * Everything a new ad's draft is picked and judged from, read once a request under the member's own session (the Ads
 * plan's 4.6, "Where each part comes from"): the business as Settings says it, its Services and how often each was
 * booked, the pictures Files holds that are fine in ads, the ad account Meta charges, and whether AI is stopped.
 *
 * Two parts of the plan's amount rule are not read here yet, and a draft says so by what it proposes: what a booking
 * from an ad has cost, and the Calendar's open times over a run. Until both are read, every draft proposes Meta's
 * least for its days, "A starting amount.", which is the plan's own rule under five booked and with no calendar link.
 */

/** How far back "booked most" looks, and the most visits it counts. */
const BOOKED_LOOKBACK_DAYS = 90;
const BOOKED_READ = 2_000;
/** The days the ads' own counts are read over: the Ads page's window. */
const ADS_WINDOW_DAYS = 30;

/** A service as a draft reads it: Services' own line, with how often it was booked and whether an ad already runs for it. */
export type AdDraftService = AdServiceFacts & { price: string | null; minutes: number | null };

/** The ad account a draft is for, as much of it as a draft reads. */
export interface AdDraftAccount {
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
  /** Whether AI answers a WhatsApp number an ad can open. */
  whatsapp: boolean;
  /** Null where no account is connected, or where Meta has not yet said the least it takes a day. */
  account: AdDraftAccount | null;
  /** An account is connected, and its first read is not in. */
  accountReading: boolean;
  pictures: AdPictures;
  history: AdDraftInputs["history"];
  /** AI is stopped (Stop everything): no draft is written while it is (decision 0050, call 11). */
  stopped: boolean;
  /** Whether this member is the owner. */
  owner: boolean;
}

const sameName = (first: string, second: string): boolean => first.trim().toLowerCase() === second.trim().toLowerCase();

/** The language an ad is written in: the first the business says it speaks, where that is Spanish; else English. */
const languageOf = (languages: readonly string[] | undefined): AdBusinessFacts["language"] =>
  /^\s*(?:es\b|espa|span)/i.test(languages?.[0] ?? "") ? "es" : "en";

/** The ads made here that still run, and the largest total one of them was turned on with. */
function madeHereOf(rows: readonly AdRow[], at: { today: string; timezone: string; nowMs: number }) {
  const made = rows.filter((row) => row.origin === "chanlytics" && row.status === "made");
  const running = made.filter((row) => {
    const state = adStateOfRow(row, at);
    return state !== "ended" && state !== "finished";
  });
  const totals = made.flatMap((row) =>
    row.budget_kind === "total" && row.budget_minor !== null ? [row.budget_minor] : [],
  );
  return { names: running.map((row) => row.name), largestTotalMinor: totals.length ? Math.max(...totals) : null };
}

/** What a draft is picked and judged from. Thrown where the workspace's settings cannot be read: nothing is guessed. */
export async function readAdDraftFacts(rc: ReaderContext): Promise<AdDraftFacts> {
  const { supabase } = rc.ctx;
  const nowMs = rc.now.getTime();
  const [named, settings, word, row, number, pictures, counts, bookedNames] = await Promise.all([
    load(rc, facts, undefined).then((read) => read.data),
    load(rc, config, undefined).then((read) => read.data),
    load(rc, appointmentWord, undefined).then((read) => read.data),
    findAdAccountForPage(supabase, rc.tenantId, "meta"),
    findChannelNumber(supabase, rc.tenantId, "whatsapp"),
    listAdPictures(rc),
    readAdsPageCounts(supabase, rc.tenantId, ADS_WINDOW_DAYS),
    listServicesBookedSince(
      supabase,
      rc.tenantId,
      new Date(nowMs - BOOKED_LOOKBACK_DAYS * DAY_MS).toISOString(),
      BOOKED_READ,
    ),
  ]);
  if (number.error) throw new DbFailure(number.error, "the number AI answers");
  const parsed = parseTenantConfigResult(settings?.config ?? null);
  if (!parsed.ok)
    throw new AppError(
      "conflict",
      "Chanlytics couldn't read this workspace's settings, so no ad was drafted. Try again in a moment.",
      409,
    );
  const profile = parsed.config.brain?.profile;
  const live = row?.status === "connected" ? row : null;
  const timezone = live?.timezone ?? named.timezone;
  const today = zoneDayKey(nowMs, timezone);
  const meta = live ? metaAdConfigOf(live.config) : null;
  const ads = live ? await listAdsOfAccount(supabase, rc.tenantId, live.id) : [];
  const madeHere = madeHereOf(ads, { today, timezone, nowMs });
  const aiNumber = number.data?.number_e164 ?? null;
  const booked = [...(counts?.people.values() ?? [])].reduce(
    (sum, one) => sum + one.booked,
    counts?.unnamed.booked ?? 0,
  );
  const account: AdDraftAccount | null =
    live && meta && live.currency !== null && meta.min_daily_minor !== null
      ? {
          name: live.name ?? "",
          currency: live.currency,
          minDailyMinor: meta.min_daily_minor,
          page: meta.page_name,
          places: meta.instagram_handle === null ? ["facebook"] : ["facebook", "instagram"],
          checks: adCardChecksOf({ standing: adStandingOf(live.standing), config: meta, aiNumber }),
        }
      : null;
  return {
    today,
    business: {
      name: parsed.config.brain?.business_name || named.name,
      tone: profile?.tone?.trim() || null,
      word,
      neverPrices: guardrailsInForce(profile?.guardrails).never_quote_prices,
      language: languageOf(profile?.languages),
    },
    services: (profile?.services ?? []).map((service) => ({
      id: service.name,
      name: service.name,
      price: service.price_note?.trim() || null,
      minutes: service.duration_min ?? null,
      advertised: madeHere.names.some((name) => sameName(name, service.name)),
      booked: bookedNames.filter((name) => sameName(name, service.name)).length,
    })),
    address: profile?.address?.trim() || null,
    whatsapp: aiNumber !== null,
    account,
    accountReading: live !== null && account === null,
    pictures,
    history: {
      booked,
      // What a booking from an ad has cost is not read into a draft yet (the head of this file).
      costPerBookedMinor: null,
      largestTotalMinor: madeHere.largestTotalMinor,
    },
    stopped: (parsed.config.ask?.stopped ?? null) !== null,
    owner: ROLE_PERMS[rc.role].ads,
  };
}

/** Whether ads have brought enough bookings here for a draft's amount to lean on them (the plan's 4.6). */
export const adsHaveHistory = (history: AdDraftFacts["history"]): boolean => history.booked >= AD_BOOKED_TO_FORECAST;
