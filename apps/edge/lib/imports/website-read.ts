/**
 * The business's website read for Check (decision 0073, R10; 00479's website_read), as the job runner is handed it: its
 * home page and up to two pages it links to for its services, prices, rules and questions (core sitePagesLinkedFrom),
 * each read by the platform's one page reader (lib/shared/public-page.ts findSitePage: Firecrawl's scrape, the page's main content
 * as Markdown), and drawn out by the smallest model into a fixed shape (contracts WEBSITE_READ_SCHEMA), its answer read
 * in code (businessReadFactsOf). Kept whole in business_reads, the newest read standing; one that could not be made
 * says why, which Check says. Where the site says its customers book is read off the same home page and kept with the
 * rest, for Check to offer. Nothing reaches a customer: the owner taps what is right into the record, a price with its
 * service.
 *
 * Platform-spent, as a booking notice's reading is: a few pages once, at the first run; never a workspace's spend.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WEBSITE_READ_SCHEMA,
  WEBSITE_READ_SYSTEM,
  WEBSITE_UNREAD_WORDS,
  SECOND_MS,
  UUID,
  bookingToolOfLink,
  businessReadFactsOf,
  feedUrlOk,
  fenced,
  listingFactsOf,
  parseTenantConfig,
  ANSWER_JSON_ONLY,
} from "@chanlytics/contracts";
import type { SitePage } from "@chanlytics/channels/website";
import { bookingPageOfSite, sitePagesLinkedFrom, sitePagesNamed } from "@chanlytics/core";
import { getTenantConfig } from "@chanlytics/db/workspace";
import { keepBusinessRead, findListingFactsStored } from "@chanlytics/db/imports";
import { type Database, type Json } from "@chanlytics/db/types";
import { scheduleJobOnce, type ClaimedJob, type JobContext } from "@chanlytics/jobs";
import { askJson, promptHashOf } from "../ai/model.js";
import { env } from "../shared/env.js";
import { findHomePage, PAGE_READS, findSitePage, listSiteLinks, sitePagesReadable } from "../shared/public-page.js";
import { wearSiteLook } from "./look.js";
import { askForFoundFiles, sitePhotosOf } from "../files/found.js";
import { json, refuse } from "../shared/http.js";
import { pg } from "../shared/pg.js";
import { workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { errField, logger } from "../shared/log.js";

type Db = SupabaseClient<Database>;

/** How much of each page's text the model is shown, in characters: a services page, a price list, a policy. */
const PAGE_TEXT_MAX = 12_000;
/** The most the reading may take of the job's time. */
const READ_CALL_MS = 30 * SECOND_MS;
/** What the pages beside the home page leave the reading: they are given what is over this, and skipped with less. */
const READING_ROOM_MS = 12 * SECOND_MS;
/** The least worth giving a page: the provider refuses a read of under a second, and few answer in so little. */
const PAGE_LEAST_MS = 2 * SECOND_MS;
/** A home page that links to none of its own pages leaves its reader's map to ask, for these words, this long. */
const MAP_SEARCH = "services prices menu about faq";
const MAP_MS = 3 * SECOND_MS;
/** The pages read beside the home page. */
const PAGES_BESIDE = 2;

/** What a read kept: its facts as business_reads holds them, and why it could not be read, or null where it was. */
export interface WebsiteReadKept {
  facts: Json;
  error: string | null;
}

/** The pages to read beside the home page: those it links to, else those the reader's map knows of (a credit, then). */
async function pagesBeside(home: SitePage): Promise<string[]> {
  const linked = sitePagesLinkedFrom(home.html, home.url, PAGES_BESIDE);
  if (linked.length) return linked;
  const links = await listSiteLinks(home.url, { search: MAP_SEARCH, limit: 20, timeoutMs: MAP_MS });
  return sitePagesNamed(links, home.url, PAGES_BESIDE);
}

/**
 * A workspace's website read and kept (business_reads), its look worn: the job's read, at an owner's press and so `fresh`
 * (as the site stands now), and a lead's preview's build (decision 0079, previews/build.ts), which reads the site of a
 * workspace nobody is a member of yet, where the reader's copy will do. Only the job asks for its photos (`photos`): a
 * preview's workspace is a stranger's, and what it kept would outlive it with no row to find it. No model call starts after
 * `deadline`. Answers what it kept.
 */
export async function readWebsite(
  db: Db,
  tenantId: string,
  raw: string | null,
  { deadline, fresh = false, photos = false }: { deadline: number; fresh?: boolean; photos?: boolean },
): Promise<WebsiteReadKept> {
  const log = logger({ tenant_id: tenantId });
  const url = feedUrlOk(raw);
  const keep = async (facts: Json, error: string | null): Promise<WebsiteReadKept> => {
    await keepBusinessRead(db, { tenantId, source: "website", facts, readFrom: url ?? raw, error });
    return { facts, error };
  };
  if (!url) return keep({}, WEBSITE_UNREAD_WORDS.address);
  // No reader is not a site that did not answer: an edge without its key would tell every owner their site is down.
  if (!sitePagesReadable()) {
    log.error("website_read_failed", { step: "no_reader" });
    return keep({}, WEBSITE_UNREAD_WORDS.failed);
  }
  const home = await findHomePage(url, { ...PAGE_READS.website, fresh });
  if (!home) return keep({}, WEBSITE_UNREAD_WORDS.silent);
  // The business's look, off the home page already in hand (decision 0075): its colour and the mark it declares,
  // worn where the workspace has none of its own and no person set them. Kept with the read, model or no model.
  const worn = await wearSiteLook(db, { tenantId, page: home });
  const look: Json = { logo_url: worn.logo_url, accent: worn.accent, worn: { ...worn.worn } };
  // Where it says its customers book, off the same home page (3c-4), kept for Check to offer, model or no model.
  const booking_page = bookingPageOfSite(url, home);
  if (!env.ANTHROPIC_API_KEY) return keep({ look, booking_page }, WEBSITE_UNREAD_WORDS.failed);
  // The booking platform's page, read beside the site's own (the onboarding PRD's P8): where a salon's services,
  // prices and minutes are kept. Read once, and said to the model as the page customers book on.
  const booking = await bookingPageToRead(db, tenantId, home.url, booking_page);
  // Side by side, and each short of what the reading needs: a page that is slow costs a page, never the whole read.
  const spare = () => deadline - Date.now() - READING_ROOM_MS;
  const linked = spare() >= PAGE_LEAST_MS ? await pagesBeside(home) : [];
  const pageMs = Math.min(PAGE_READS.websitePage.timeoutMs, spare());
  const reads =
    pageMs >= PAGE_LEAST_MS
      ? [...linked.map((at) => ({ at, booking: false })), ...(booking ? [{ at: booking, booking: true }] : [])]
      : [];
  const beside = await Promise.all(
    reads.map(async (r) => ({
      ...r,
      page: await findSitePage(r.at, { ...PAGE_READS.websitePage, fresh, timeoutMs: pageMs }),
    })),
  );
  const pages = [{ at: url, page: home, booking: false }, ...beside].filter(
    (p): p is { at: string; page: SitePage; booking: boolean } => !!p.page,
  );
  const booking_read = pages.some((p) => p.booking);
  // The photographs these pages show, for the Inbox of Files (decision 0099): the owner says which are theirs.
  if (photos) {
    // A booking platform's pictures are its own, not the business's.
    const own = pages.filter((p) => !p.booking).map((p) => p.page);
    await askForFoundFiles(db, tenantId, { source: "website", items: sitePhotosOf(own) }).catch((e: unknown) =>
      log.warn("file_fetch_failed", { source: "website", error: errField(e) }),
    );
  }
  // A page is someone else's words, and its address too, which a link on the site can make say anything: both in its
  // fence, and only the read's own word for it outside.
  const user = pages
    .map((p) => {
      const page = fenced("page", `${p.at}\n${p.page.markdown.slice(0, PAGE_TEXT_MAX)}`);
      return p.booking ? `Where customers book:\n${page}` : page;
    })
    .join("\n\n");
  const ms = Math.min(READ_CALL_MS, deadline - Date.now());
  if (ms <= 0) throw new Error("website_read: no time left for the reading");
  let answer: unknown;
  try {
    const answered = await askJson({
      purpose: "website_read",
      system: WEBSITE_READ_SYSTEM,
      user,
      schema: WEBSITE_READ_SCHEMA,
      maxTokens: 2500,
      plainJsonHint: ANSWER_JSON_ONLY,
      timeoutMs: ms,
      signal: AbortSignal.timeout(ms),
      for: { tenantId, subjectId: null, promptHash: promptHashOf(WEBSITE_READ_SYSTEM) },
    });
    answer = answered?.answer ?? null;
  } catch (e) {
    log.warn("website_read_failed", { step: "reading", error: errField(e) });
    return keep({ look, booking_page }, WEBSITE_UNREAD_WORDS.failed);
  }
  const facts = businessReadFactsOf(answer);
  const found = facts.services.length + facts.rules.length + facts.answers.length + facts.closed.length;
  log.info("website_read", { pages: pages.length, services: facts.services.length, found, booking: !!booking_page });
  const kept: Json = {
    services: facts.services,
    closed: facts.closed,
    rules: facts.rules,
    answers: facts.answers,
    description: facts.description,
    look,
    booking_page,
    booking_read,
  };
  return keep(kept, found || facts.description ? null : WEBSITE_UNREAD_WORDS.nothing);
}

/**
 * The booking platform's page to read beside the website: the booking link the business keeps, else the one this read
 * found on the home page; only a booking platform's page (contracts bookingToolOfLink), and only on another host than
 * the site read, since a site that is its booking page was read as the home page. Null for none, or a read that failed.
 */
async function bookingPageToRead(
  db: Db,
  tenantId: string,
  siteUrl: string,
  found: string | null,
): Promise<string | null> {
  try {
    const cfgRow = await getTenantConfig(db, tenantId);
    const link = parseTenantConfig(cfgRow?.config ?? null)?.brain?.booking_link ?? null;
    const page = [link, found].find((u) => !!u && !!bookingToolOfLink(u) && !!feedUrlOk(u)) ?? null;
    if (!page) return null;
    return new URL(page).hostname === new URL(siteUrl).hostname ? null : page;
  } catch {
    return null;
  }
}

export function websiteReader(db: Db): NonNullable<JobContext["website"]> {
  return {
    read: async (job: ClaimedJob, deadline: number) => {
      const url = typeof job.payload.url === "string" ? job.payload.url : null;
      await readWebsite(db, job.tenant_id, url, { deadline, fresh: true, photos: true });
    },
  };
}

/**
 * A read of the business's website asked for (a listing linked with one, a profile connected that names one, the first
 * run's basics saved with one): one job while one waits (its key, 00479), never a refusal of what asked. A website that
 * is not one on the public web is not asked at all.
 */
export async function scheduleWebsiteRead(db: Db, tenantId: string, website: string | null): Promise<void> {
  const url = feedUrlOk(website);
  if (!url) return;
  try {
    await scheduleJobOnce(db, { tenantId, kind: "website_read", dueAt: new Date(), payload: { url } });
  } catch (e) {
    logger({ tenant_id: tenantId }).warn("website_read_unscheduled", { error: errField(e) });
  }
}

/**
 * POST /api/admin/imports/website-read: a read of the workspace's website asked for by the dashboard (the first run's receptionist
 * set up, or its website saved): the address the settings hold, else the linked listing's. Answers whether one was asked.
 */
export async function askWebsiteRead(
  auth: Admitted,
  body: Partial<{ tenant_id: string; user_id: string }>,
): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const cfg = parseTenantConfig((await getTenantConfig(db, tenantId))?.config ?? null);
  const listing = listingFactsOf(await findListingFactsStored(db, tenantId).catch(() => null));
  const website = cfg?.brain?.profile?.website ?? listing?.website ?? null;
  if (!feedUrlOk(website)) return json(200, { ok: true, asked: false });
  await scheduleWebsiteRead(db, tenantId, website);
  return json(200, { ok: true, asked: true });
}
