import "server-only";
import { z } from "zod";
import {
  AD_PAGE_DAYS,
  ROLE_PERMS,
  UUID,
  adCardChecksOf,
  adPictureFileOf,
  recordOrEmpty,
  adAmountAfter,
  adApprovedMiles,
  adChangeOnWayOf,
  adResumeRule,
  adStandingOf,
  parseTenantConfigResult,
  adStateOfRow,
  adWayClosedOf,
  isObjectRecord,
  metaAdConfigOf,
  personName,
  zoneDayKey,
  type AdLaunchLive,
  type AdLiveDto,
  type AdMadeHereLive,
  type AdOpens,
  type AdPausedBy,
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
  readAdChatsKept,
  readAdCommenters,
  readAdPeopleBack,
  readAdsEngaged,
  readAdsPageCounts,
  type AdAccountRow,
  type AdChatsKeptRow,
  type AdCommenter,
  type AdEngagedSum,
  type AdPeopleBack,
  type AdRow,
  type AdsPageCounts,
} from "@chanlytics/db/ads";
import { listAdPeopleWaitingOnYou, type AdPersonWaitingRow } from "@chanlytics/db/people";
import { listFilesByIds } from "@chanlytics/db/files";
import { logAndGoOn } from "@chanlytics/log";
import { readAdsPressesOn } from "../connections/ads-ready";
import { isGoing } from "../people/going";
import { getStoredConfig } from "../workspace/config-row";
import { readerStamp, type Reader, type ReaderContext } from "../shared/reader";

/** How many of an ad's people one page of the drawer's list holds. */
const ADS_PEOPLE_PAGE = 50;

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

/**
 * Why an ad that needs its owner does: the platform's own word for it first, then AI not able to answer the chat it opens
 * while it is on (call 11), then its being paused at the platform while the owner has it on.
 */
function needsOf(state: AdLiveDto["state"], row: AdRow, nowMs: number): AdLiveDto["needs"] {
  if (state !== "needs-you") return null;
  if (row.platform_state === "DISAPPROVED") return "refused";
  if (row.platform_state === "PENDING_BILLING_INFO") return "unpaid";
  if (row.platform_state === "WITH_ISSUES") return "troubled";
  return adWayClosedOf(row, nowMs) !== null ? "way_in" : "paused_at_platform";
}

const PAUSED_BYS: readonly AdPausedBy[] = ["stop", "remediation", "owner", "owner_all"];

const LAUNCH_STOPS: readonly AdStopped[] = [
  "refused",
  "differs",
  "unanswered",
  "ai_stopped",
  "way_in",
  "cancelled",
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
    sending: row.status === "sending",
    // A cancel kept and the job not yet at its next step: the drawer says it is stopping.
    cancelling: row.status === "sending" && launch.cancel != null,
  };
}

const WIDE_PLACE_KINDS = ["city", "region", "country"] as const;

/** The wider place approved for an ad made here, by its kind and its name; null for the circle, or one not named. */
function widePlaceOf(approved: Record<string, unknown>): AdMadeHereLive["place"] {
  const area = recordOrEmpty(approved.area);
  const kind = WIDE_PLACE_KINDS.find((one) => one === area.kind);
  const name = typeof area.name === "string" ? area.name.trim() : "";
  return kind && name ? { kind, name } : null;
}

/**
 * What an ad made here's drawer changes (the Ads plan's 4.5): where it is shown, its first day, a change on its way,
 * when Meta takes its next amount, and whether Meta holds a total or a last day other than the one approved here, which
 * the page says as changed in Meta and never puts back. Null for an ad made at the platform.
 */
function madeHereOf(row: AdRow, at: ReadAt): AdMadeHereLive | null {
  if (row.origin !== "chanlytics") return null;
  const approved = recordOrEmpty(row.approved);
  const change = adChangeOnWayOf(row.change);
  const approvedTotal = typeof approved.total_minor === "number" ? approved.total_minor : null;
  const approvedDay = typeof approved.end_day === "string" ? approved.end_day : null;
  const metaDay = row.ends_at === null ? null : zoneDayKey(Date.parse(row.ends_at), at.timezone);
  const moved =
    (approvedTotal !== null && row.budget_minor !== null && row.budget_minor !== approvedTotal) ||
    (approvedDay !== null && metaDay !== null && metaDay !== approvedDay);
  return {
    miles: adApprovedMiles(row.approved),
    place: widePlaceOf(approved),
    start_day: zoneDayKey(Date.parse(row.starts_at ?? row.created_at), at.timezone),
    change,
    amount_after: adAmountAfter(row.amounts_at ?? [], at.nowMs),
    changed_in_meta: row.status === "made" && change === null && moved,
  };
}

/**
 * What the page reads beside its counts (the tracking plan's T2 and T3, 00678): Meta's count beside Chanlytics' for each
 * ad, and the people ads brought back. Each null where its read failed or the database has none yet: the page then says
 * no line for it, and its counts stand.
 */
interface Beside {
  chats: ReadonlyMap<string, AdChatsKeptRow> | null;
  back: AdPeopleBack | null;
}

/** Both reads, side by side, each never at the page's cost: a read that fails is logged and claims nothing. */
async function readBeside(rc: ReaderContext): Promise<Beside> {
  const [chats, back] = await Promise.all([
    readAdChatsKept(rc.ctx.supabase, rc.tenantId, AD_PAGE_DAYS).catch(
      logAndGoOn<AdChatsKeptRow[] | null>("Meta's chats beside the ones kept", null),
    ),
    readAdPeopleBack(rc.ctx.supabase, rc.tenantId, AD_PAGE_DAYS).catch(
      logAndGoOn<AdPeopleBack | null>("the people ads brought back", null),
    ),
  ]);
  return { chats: chats && new Map(chats.map((one) => [one.ad_id, one])), back };
}

/** One ad's lines beside its counts: none for a read that failed, and nothing to say for an ad they hold nothing of. */
function besideOf(adId: string, beside: Beside): Pick<AdLiveDto, "chats" | "back"> {
  const kept = beside.chats?.get(adId);
  return {
    ...(beside.chats ? { chats: kept ? { meta: kept.meta, kept: kept.kept, through: kept.through } : null } : {}),
    ...(beside.back ? { back: beside.back.ads.get(adId) ?? { people: 0, booked: 0 } } : {}),
  };
}

/** The files the ads made here show, each named, or named null where it is gone from Made; null where they could not be read. */
type PictureNames = ReadonlyMap<string, string | null> | null;

/**
 * The piece each ad made here shows, named: one read of the files for them all (Campaigns in three tabs: an ad's Made from).
 * A read that fails names none, and the page says nothing of where its ads came from rather than call a piece gone.
 */
async function namePictures(
  rows: readonly AdRow[],
  listFiles: (ids: string[]) => Promise<{ id: string; name: string }[]>,
): Promise<PictureNames> {
  const ids = [...new Set(rows.flatMap((row) => adPictureFileOf(row.approved) ?? []))];
  if (ids.length === 0) return new Map();
  const files = await listFiles(ids).catch(logAndGoOn("the pieces the ads show", null));
  if (files === null) return null;
  const named = new Map<string, string | null>(ids.map((id) => [id, null]));
  for (const file of files) named.set(file.id, file.name);
  return named;
}

/** An ad's Made from: the file it shows and its name, where it shows one and the files were read. */
function madeFromOf(row: AdRow, pictures: PictureNames): AdLiveDto["made_from"] {
  const fileId = adPictureFileOf(row.approved);
  return fileId === null || pictures === null ? null : { file_id: fileId, name: pictures.get(fileId) ?? null };
}

/** A part of what the platform said of an ad (ads.said, 00648): a string that says something, or none. */
function saidPart(kept: unknown, part: string): string | null {
  if (!isObjectRecord(kept)) return null;
  const value = kept[part];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * What an ad shows people: the piece it was made from, else the platform's own small picture of it (an https address the
 * read kept), and its words, its body else its headline.
 */
function seenOf(row: AdRow): Pick<AdLiveDto, "picture" | "words" | "post_url"> {
  const fileId = adPictureFileOf(row.approved);
  const https = (part: string) => {
    const address = saidPart(row.said, part);
    return address && /^https:\/\//.test(address) ? address : null;
  };
  // The business's own file first; else Meta's whole image where the ad is one, else its small picture (64px).
  const image = https("image");
  const thumbnail = https("thumbnail");
  const picture = fileId
    ? { file_id: fileId }
    : image
      ? { url: image }
      : thumbnail
        ? { url: thumbnail, small: true }
        : null;
  return {
    picture,
    words: (saidPart(row.said, "body") ?? saidPart(row.said, "headline"))?.slice(0, 600) ?? null,
    post_url: https("permalink"),
  };
}

/** Who commented on an ad, as the page names them: their name, the moment of their latest comment. */
const commentersOf = (
  kept: { count: number; people: AdCommenter[] } | undefined,
): NonNullable<AdLiveDto["commenters"]> =>
  kept
    ? { count: kept.count, people: kept.people.map((p) => ({ id: p.id, name: personName(p.contact), at: p.at })) }
    : { count: 0, people: [] };

/**
 * Why an ad can't be paused or turned on from here, where it can't, so its drawer says the true reason (Ruben, 25 Nov 2026: an
 * owner was told only an owner could): this member may not run ads; turning ads on from here is not switched on for the
 * workspace yet; or Meta has not let Chanlytics change them. Null where it can, and on an account that is not connected.
 */
function pressOffOf(at: {
  status: AdsLiveDto["account"]["status"];
  role: boolean;
  presses: boolean;
  config: Parameters<typeof metaAdConfigOf>[0];
}): AdsLiveDto["press_off"] {
  if (at.status !== "connected") return null;
  if (!at.role) return "role";
  if (!at.presses) return "off";
  return metaAdConfigOf(at.config).scopes.includes("ads_management") ? null : "meta";
}

/**
 * The ad in Meta Ads Manager, opened at it: the account's id (without Meta's `act_`) and the ad's own, where both are held; Ads
 * Manager's list of ads otherwise.
 */
function metaPageOf(accountId: string | null, adId: string | null): string {
  const base = "https://adsmanager.facebook.com/adsmanager/manage/ads";
  if (!accountId || !adId) return base;
  const params = new URLSearchParams({ act: accountId.replace(/^act_/, ""), selected_ad_ids: adId });
  return `${base}?${params.toString()}`;
}

/** One ad as the page draws it: its row, with the window's two halves beside it. */
function adOf(
  row: AdRow,
  counts: AdsPageCounts | null,
  at: ReadAt & {
    left: ReadonlyMap<string, AdLaunchLive["left"]>;
    beside: Beside;
    pictures: PictureNames;
    /** The ad account's own id at Meta, where it is held: an ad's door into Ads Manager opens at it. */
    accountId: string | null;
    /** What each ad did and who commented on it (00719); null from a database a deploy behind. */
    engaged: ReadonlyMap<string, AdEngagedSum> | null;
    commenters: ReadonlyMap<string, { count: number; people: AdCommenter[] }> | null;
  },
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
    made_here: madeHereOf(row, at),
    made_from: madeFromOf(row, at.pictures),
    opens: opensOf(row.door),
    state,
    needs: needsOf(state, row, at.nowMs),
    issue: row.platform_issue,
    ends_at: row.ends_at,
    starts_at: row.starts_at,
    ...seenOf(row),
    meta_page: metaPageOf(at.accountId, row.platform_ad_id),
    ...(at.engaged ? { engaged: at.engaged.get(row.id) ?? {} } : {}),
    ...(at.commenters ? { commenters: commentersOf(at.commenters.get(row.id)) } : {}),
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
    paused_by: PAUSED_BYS.find((by) => by === row.paused_by) ?? null,
    way_in: row.origin === "chanlytics" && row.intent === "on" ? adWayClosedOf(row, at.nowMs) : null,
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
    ...besideOf(row.id, at.beside),
    // What its bookings are worth, summed with the counts (T6): none for an ad nobody booked from, and no claim at
    // all from a database a deploy behind.
    ...(counts?.worth ? { worth: counts.worth.get(row.id) ?? { sums: [], visits: 0, left_out: 0 } } : {}),
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

const accountStatusOf = (row: AdAccountRow): AdsLiveDto["account"]["status"] | null =>
  row.status === "connected" || row.status === "revoked" || row.status === "disconnected" ? row.status : null;

/** Whether every check the account's card counts passes, read from its row as the card reads it (readers/ad-account.ts). */
const cardReadyOf = (row: AdAccountRow): boolean =>
  adCardChecksOf({ standing: adStandingOf(row.standing), config: metaAdConfigOf(row.config) }).every(
    (check) => check.ok === true,
  );

/** How many of the people an ad brought who need you the page is handed by name: its line names each, and counts the rest. */
const NEEDS_YOU_NAMED = 2;

/**
 * Who an ad brought and needs you now, longest waiting first: the first by name, and how many in all. Read beside the
 * ads, and never at their cost: a read of it that fails is logged and the page says nothing of it, which claims nobody.
 */
const readNeedsYou = (rc: ReaderContext, nowMs: number): Promise<AdPersonWaitingRow[]> =>
  listAdPeopleWaitingOnYou(rc.ctx.supabase, rc.tenantId, nowMs).catch(
    logAndGoOn<AdPersonWaitingRow[]>("the people from ads who need you", []),
  );

/** Of who an ad brought and needs you, the ones still waiting: nobody waits on someone being erased (readers/escalations.ts). */
const stillWaiting = (rows: readonly AdPersonWaitingRow[], nowMs: number): AdPersonWaitingRow[] =>
  rows.filter((row) => !isGoing(row.erasing_since, nowMs));

/**
 * Who an ad brought and needs you now, every one, longest waiting first: the people the page's line counts. AI's Inbox
 * list answers "who from my ads is waiting" with it (the tracking plan's T1 and its call 6), so AI and the page name the
 * same people. A read that fails throws, as a tool's read says it.
 */
export const adPeopleWaiting: Reader<undefined, AdPersonWaitingRow[]> = {
  name: "ad-people-waiting",
  async read(rc) {
    const nowMs = rc.now.getTime();
    const rows = await listAdPeopleWaitingOnYou(rc.ctx.supabase, rc.tenantId, nowMs);
    return { data: stillWaiting(rows, nowMs), rows: [], stamp: readerStamp() };
  },
};

/** Who an ad brought and needs you now, as the page is handed it. */
function needsYouOf(rows: readonly AdPersonWaitingRow[], nowMs: number): AdsLiveDto["needs_you"] {
  const listed = stillWaiting(rows, nowMs);
  return {
    count: listed.length,
    people: listed.slice(0, NEEDS_YOU_NAMED).map((row) => ({
      id: row.contact_id,
      name: personName(row),
      conversation_id: row.conversation_id,
      since: row.since,
    })),
  };
}

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
    const status = account ? accountStatusOf(account) : null;
    if (!account || status === null) return { data: null, rows: [], stamp: readerStamp() };
    // The request's own moment: every state, day and wait on the page is said by one clock.
    const nowMs = rc.now.getTime();
    const [listed, counts, presses, settings, waiting, beside] = await Promise.all([
      listAdsOfAccount(supabase, rc.tenantId, account.id),
      readAdsPageCounts(supabase, rc.tenantId, AD_PAGE_DAYS),
      status === "connected" && ROLE_PERMS[rc.role].ads ? readAdsPressesOn(rc.tenantId) : false,
      getStoredConfig(supabase, rc.tenantId),
      readNeedsYou(rc, nowMs),
      readBeside(rc),
    ]);
    const { more, elsewhere } = await unlistedOf(rc, listed, counts, account.id);
    const rows = [...listed, ...more];
    const timezone = account.timezone ?? "UTC";
    const today = zoneDayKey(nowMs, timezone);
    const from = counts?.from ?? today;
    // What a launch that stopped part way left at Meta, read only for those and said in their drawers; beside it the
    // pieces of Content the ads made here show, named for their Made from; and what each ad did and who commented on it
    // over the page's days (00719), each said where it was read and left unsaid where it was not.
    const [left, pictures, engaged, commenters] = await Promise.all([
      listAdsLeftParts(
        supabase,
        rc.tenantId,
        rows.filter((row) => row.origin === "chanlytics" && row.status === "failed").map((row) => row.id),
      ),
      namePictures(rows, (ids) => listFilesByIds(supabase, rc.tenantId, ids)),
      readAdsEngaged(supabase, rc.tenantId, from).catch(logAndGoOn("the ads' engagement", null)),
      readAdCommenters(supabase, rc.tenantId, new Date(`${from}T00:00:00Z`).toISOString()).catch(
        logAndGoOn("who commented on the ads", null),
      ),
    ]);
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
        ready: cardReadyOf(account),
        min_daily_minor: metaAdConfigOf(account.config).min_daily_minor,
        most_minor: account.most_minor,
      },
      window: { from: counts?.from ?? today, to: counts?.to ?? today },
      today,
      ads: rows.map((row) =>
        adOf(row, counts, {
          today,
          timezone,
          nowMs,
          left,
          beside,
          pictures,
          accountId: account.external_id,
          engaged,
          commenters,
        }),
      ),
      unnamed: counts?.unnamed ?? { people: 0, booked: 0 },
      elsewhere,
      ...(beside.back ? { back: beside.back.all } : {}),
      can_press: presses && metaAdConfigOf(account.config).scopes.includes("ads_management"),
      press_off: pressOffOf({ status, role: ROLE_PERMS[rc.role].ads, presses, config: account.config }),
      stopped_at: aiStoppedAt(settings),
      needs_you: needsYouOf(waiting, nowMs),
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
      days: AD_PAGE_DAYS,
      limit: ADS_PEOPLE_PAGE + 1,
      offset: input.offset,
    });
    const people = rows.slice(0, ADS_PEOPLE_PAGE).map((row) => ({
      id: row.contact_id,
      name: personName(row),
      first_at: row.first_at,
      booked: row.booked,
    }));
    return { data: { people, more: rows.length > ADS_PEOPLE_PAGE }, rows: [], stamp: readerStamp() };
  },
};
