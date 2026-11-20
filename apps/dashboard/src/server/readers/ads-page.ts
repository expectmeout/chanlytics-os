import "server-only";
import { z } from "zod";
import {
  ROLE_PERMS,
  UUID,
  recordOrEmpty,
  adResumeRule,
  parseTenantConfigResult,
  adStateOfRow,
  metaAdConfigOf,
  personName,
  zoneDayKey,
  type AdLaunchLive,
  type AdLiveDto,
  type AdOpens,
  type AdStopped,
  type AdPeopleLiveDto,
  type AdsLiveDto,
} from "@chanlytics/contracts";
import {
  findAdAccountForPage,
  listAdPeople,
  listAdsByIds,
  listAdsLeftParts,
  listAdsOfAccount,
  readAdsPageCounts,
  type AdAccountRow,
  type AdRow,
  type AdsPageCounts,
} from "@chanlytics/db/ads";
import { readAdsPressesOn } from "../connections/ads-ready";
import { getStoredConfig } from "../workspace/config-row";
import { readerStamp, type Reader } from "../shared/reader";

/** The days the page counts: the same thirty Reports' people lens opens on, and a draft reads its bookings over. */
export const ADS_PAGE_DAYS = 30;
/** How many of an ad's people one page of the drawer's list holds. */
const PEOPLE_PAGE = 50;

const OPENS: readonly AdOpens[] = ["whatsapp", "instagram", "messenger", "call", "form", "website", "other"];
const opensOf = (door: string): AdOpens => OPENS.find((one) => one === door) ?? "other";

/** A press of the owner's the platform has not been told yet: an ask newer than the telling. */
function pendingOf(row: AdRow): AdLiveDto["pending"] {
  if (row.intent_at === null || (row.told_at !== null && row.told_at >= row.intent_at)) return null;
  if (row.intent === "on") return "resuming";
  return row.intent === "paused" ? "pausing" : null;
}

/** When the page is read: today in the account's zone, the zone, and the moment. */
interface ReadAt {
  today: string;
  timezone: string;
  nowMs: number;
}

/** Why an ad that needs its owner does, from the platform's own word for it. */
function needsOf(state: AdLiveDto["state"], platformWord: string | null): AdLiveDto["needs"] {
  if (state !== "needs-you") return null;
  if (platformWord === "DISAPPROVED") return "refused";
  if (platformWord === "PENDING_BILLING_INFO") return "unpaid";
  return platformWord === "WITH_ISSUES" ? "troubled" : "paused_at_platform";
}

const LAUNCH_STOPS: readonly AdStopped[] = [
  "refused",
  "differs",
  "unanswered",
  "ai_stopped",
  "disconnected",
  "signed_out",
  "picture",
  "business",
  "off",
];

/** How the launch of an ad made here went: why it stopped where it did, Meta's own words, and what it left there. */
function launchOf(row: AdRow, left: ReadonlyMap<string, AdLaunchLive["left"]>): AdLaunchLive | null {
  if (row.origin !== "chanlytics") return null;
  const launch = recordOrEmpty(row.launch);
  const metaWords = typeof launch.said === "string" && launch.said.trim() ? launch.said.trim().slice(0, 1000) : null;
  return {
    stopped: LAUNCH_STOPS.find((stop) => stop === launch.stopped) ?? null,
    said: metaWords,
    left: left.get(row.id) ?? [],
  };
}

/** One ad as the page draws it: its row, with the window's two halves beside it. */
function adOf(
  row: AdRow,
  counts: AdsPageCounts | null,
  at: ReadAt & { left: ReadonlyMap<string, AdLaunchLive["left"]> },
): AdLiveDto {
  const people = counts?.people.get(row.id) ?? { people: 0, booked: 0 };
  const spend = counts?.spend.get(row.id);
  const state = adStateOfRow(row, at);
  return {
    id: row.id,
    name: row.name,
    made_in_platform: row.origin === "platform",
    shown_on: row.shown_on,
    launch: launchOf(row, at.left),
    opens: opensOf(row.door),
    state,
    needs: needsOf(state, row.platform_state),
    issue: row.platform_issue,
    ends_at: row.ends_at,
    budget:
      row.budget_kind === null || row.budget_minor === null
        ? null
        : {
            kind: row.budget_kind === "total" ? "total" : "daily",
            minor: row.budget_minor,
            left_minor: row.budget_left_minor,
            shared: row.budget_shared === true,
          },
    pending: pendingOf(row),
    version: row.version,
    resume: adResumeRule(row, at.nowMs),
    people: people.people,
    booked: people.booked,
    spend_minor: spend?.spend_minor ?? 0,
    settling: spend?.settling ?? false,
    theirs: {
      impressions: spend?.impressions ?? 0,
      clicks: spend?.clicks ?? 0,
      results: spend?.platform_results ?? null,
    },
  };
}

/**
 * The ads a window's counts name that the account's own list did not hold, read by id: one of this account past the
 * most a page lists joins the list; one of another account of the workspace (connected before this one) is not this
 * page's to list, and its people are counted beside it. So the page's people are always everyone the counts hold.
 */
async function unlistedOf(
  rc: { ctx: { supabase: Parameters<typeof listAdsByIds>[0] }; tenantId: Parameters<typeof listAdsByIds>[1] },
  listed: readonly AdRow[],
  counts: AdsPageCounts | null,
  accountId: string,
): Promise<{ more: AdRow[]; elsewhere: { people: number; booked: number } }> {
  const held = new Set(listed.map((row) => row.id));
  const named = counts === null ? [] : [...new Set([...counts.people.keys(), ...counts.spend.keys()])];
  const missing = named.filter((id) => !held.has(id));
  const rows = await listAdsByIds(rc.ctx.supabase, rc.tenantId, missing);
  const more = rows.filter((row) => row.account_id === accountId);
  const mine = new Set([...held, ...more.map((row) => row.id)]);
  const elsewhere = { people: 0, booked: 0 };
  for (const [id, one] of counts?.people ?? []) {
    if (mine.has(id)) continue;
    elsewhere.people += one.people;
    elsewhere.booked += one.booked;
  }
  return { more, elsewhere };
}

/**
 * When AI was stopped (Stop everything, decision 0050 call 11), as the workspace's settings keep it: null while AI
 * runs, or where the settings cannot be read. The one reading of the stop for Ads: the page's read, a press that
 * would turn an ad back on, and New ad's draft all ask it (the Ads plan's G17).
 */
export function aiStoppedAt(config: unknown): string | null {
  const parsed = parseTenantConfigResult(config ?? null);
  return parsed.ok ? (parsed.config.ask?.stopped?.at ?? null) : null;
}

const statusOf = (row: AdAccountRow): AdsLiveDto["account"]["status"] | null =>
  row.status === "connected" || row.status === "revoked" || row.status === "disconnected" ? row.status : null;

/**
 * GET ads/page, as the route answers it (decision 0049's adsPage): the workspace's ad account once it is or was
 * connected, each ad Chanlytics holds for it with what its platform says it spent and who Chanlytics counts it
 * brought, the people from an ad it cannot name, and the people from an ad of an account connected before this one.
 * Null where no account was ever connected: the page then draws what is true with nothing connected. The people are
 * the ones Reports › People counts under "An ad", every one of them, so the page's total and the report's agree, and
 * AI reads the same answer.
 */
export const adsPage: Reader<undefined, AdsLiveDto | null> = {
  name: "ads-page",
  async read(rc) {
    const { supabase } = rc.ctx;
    const account = await findAdAccountForPage(supabase, rc.tenantId, "meta");
    const status = account ? statusOf(account) : null;
    if (!account || status === null) return { data: null, rows: [], stamp: readerStamp() };
    const [listed, counts, presses, settings] = await Promise.all([
      listAdsOfAccount(supabase, rc.tenantId, account.id),
      readAdsPageCounts(supabase, rc.tenantId, ADS_PAGE_DAYS),
      status === "connected" && ROLE_PERMS[rc.role].ads ? readAdsPressesOn(rc.tenantId) : false,
      getStoredConfig(supabase, rc.tenantId),
    ]);
    const { more, elsewhere } = await unlistedOf(rc, listed, counts, account.id);
    const rows = [...listed, ...more];
    // What a launch that stopped part way left at Meta: read only for those, and said in their drawers.
    const left = await listAdsLeftParts(
      supabase,
      rc.tenantId,
      rows.filter((row) => row.origin === "chanlytics" && row.status === "failed").map((row) => row.id),
    );
    const nowMs = Date.now();
    const timezone = account.timezone ?? "UTC";
    const today = zoneDayKey(nowMs, timezone);
    const data: AdsLiveDto = {
      account: {
        status,
        name: account.name,
        currency: account.currency,
        timezone: account.timezone,
        read_at: account.read_at,
        read_failed: account.read_error !== null,
        revoked_at: account.revoked_at,
        disconnected_at: account.disconnected_at,
      },
      window: { from: counts?.from ?? today, to: counts?.to ?? today },
      today,
      ads: rows.map((row) => adOf(row, counts, { today, timezone, nowMs, left })),
      unnamed: counts?.unnamed ?? { people: 0, booked: 0 },
      elsewhere,
      can_press: presses && metaAdConfigOf(account.config).scopes.includes("ads_management"),
      stopped_at: aiStoppedAt(settings),
    };
    return { data, rows: [], stamp: readerStamp() };
  },
};

/** What GET ads/people takes: an ad's own id, or `unnamed` for the people of an ad Chanlytics cannot name. */
export const AdPeopleQuery = z.object({
  ad: z.union([z.literal("unnamed"), z.string().regex(UUID)]),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

/**
 * GET ads/people, as the route answers it (decision 0049's adPeople): the people one ad brought in the page's window,
 * newest first, a page at a time, each with whether they have booked since. The same people the page's number counts.
 */
export const adPeople: Reader<z.infer<typeof AdPeopleQuery>, AdPeopleLiveDto> = {
  name: "ad-people",
  async read(rc, input) {
    const adId = input.ad === "unnamed" ? null : input.ad;
    // One more than a page, to say whether there are more.
    const rows = await listAdPeople(rc.ctx.supabase, rc.tenantId, adId, {
      days: ADS_PAGE_DAYS,
      limit: PEOPLE_PAGE + 1,
      offset: input.offset,
    });
    const people = rows.slice(0, PEOPLE_PAGE).map((row) => ({
      id: row.contact_id,
      name: personName(row),
      first_at: row.first_at,
      booked: row.booked,
    }));
    return { data: { people, more: rows.length > PEOPLE_PAGE }, rows: [], stamp: readerStamp() };
  },
};
