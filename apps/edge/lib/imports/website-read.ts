/**
 * The business's website read for Check (decision 0073, R10; 00479's website_read), as the job runner is handed it: its
 * home page and up to two pages it links to for its services, prices, rules and questions (core sitePagesLinkedFrom),
 * each read by the platform's one page reader (lib/public-page.ts sitePage: Firecrawl's scrape, the page's main content
 * as Markdown), and drawn out by the smallest model into a fixed shape (contracts WEBSITE_READ_SCHEMA), its answer read
 * in code (businessReadFactsOf). Kept whole in business_reads, the newest read standing; one that could not be made
 * says why, which Check says. Nothing reaches a customer: the owner taps what is right into the record, a price with
 * its service.
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
  businessReadFactsOf,
  feedUrlOk,
  listingFactsOf,
  parseTenantConfig,
} from "../packages/contracts.js";
import type { SitePage } from "../packages/channels.js";
import { sitePagesLinkedFrom } from "../packages/core.js";
import { getTenantConfig, keepBusinessRead, listingFactsStored, type Database, type Json } from "../packages/db.js";
import { scheduleJobOnce, type ClaimedJob, type JobContext } from "../packages/jobs.js";
import { askJson, promptHashOf } from "../model.js";
import { env } from "../env.js";
import { sitePage } from "../public-page.js";
import { wearSiteLook } from "./look.js";
import { json, refuse } from "../http.js";
import { pg } from "../pg.js";
import { workspaceFor, type Admitted } from "../admin-auth.js";
import { errField, logger } from "../log.js";

type Db = SupabaseClient<Database>;

/** How long a page may take, its scripts run, and how much of it is read: a site's own pages, never a download. */
const PAGE_READ = { timeoutMs: 10 * SECOND_MS, maxChars: 400_000 };
/** How much of each page's text the model is shown, in characters: a services page, a price list, a policy. */
const PAGE_TEXT_MAX = 12_000;
/** The most the reading may take of the job's time. */
const READ_CALL_MS = 30 * SECOND_MS;

/** What a read kept: its facts as business_reads holds them, and why it could not be read, or null where it was. */
export interface WebsiteReadKept {
  facts: Json;
  error: string | null;
}

/**
 * A workspace's website read and kept (business_reads), its look worn: the job's read, and a lead's preview's build
 * (decision 0079, previews/build.ts), which reads the site of a workspace nobody is a member of yet. No model call
 * starts after `deadline`. Answers what it kept.
 */
export async function readWebsite(
  db: Db,
  tenantId: string,
  raw: string | null,
  deadline: number,
): Promise<WebsiteReadKept> {
  const L = logger({ tenant_id: tenantId });
  const url = feedUrlOk(raw);
  const keep = async (facts: Json, error: string | null): Promise<WebsiteReadKept> => {
    await keepBusinessRead(db, { tenantId, source: "website", facts, readFrom: url ?? raw, error });
    return { facts, error };
  };
  if (!url) return keep({}, WEBSITE_UNREAD_WORDS.address);
  const home = await sitePage(url, PAGE_READ);
  if (!home) return keep({}, WEBSITE_UNREAD_WORDS.silent);
  // The business's look, off the home page already in hand (decision 0075): its colour and the mark it declares,
  // worn where the workspace has none of its own and no person set them. Kept with the read, model or no model.
  const worn = await wearSiteLook(db, { tenantId, html: home.html, origin: new URL(home.url).origin });
  const look: Json = { logo_url: worn.logo_url, accent: worn.accent, worn: { ...worn.worn } };
  if (!env.ANTHROPIC_API_KEY) return keep({ look }, WEBSITE_UNREAD_WORDS.failed);
  const more = sitePagesLinkedFrom(home.html, home.url, 2);
  const pages = [
    { at: url, page: home },
    ...(await Promise.all(more.map(async (at) => ({ at, page: await sitePage(at, PAGE_READ) })))),
  ].filter((p): p is { at: string; page: SitePage } => !!p.page);
  const user = pages.map((p) => `Page ${p.at}\n${p.page.markdown.slice(0, PAGE_TEXT_MAX)}`).join("\n\n---\n\n");
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
      plainJsonHint: "Answer with only a JSON object in the shape asked.",
      timeoutMs: ms,
      signal: AbortSignal.timeout(ms),
      for: { tenantId, subjectId: null, promptHash: promptHashOf(WEBSITE_READ_SYSTEM) },
    });
    answer = answered?.answer ?? null;
  } catch (e) {
    L.warn("website_read_failed", { error: errField(e) });
    return keep({ look }, WEBSITE_UNREAD_WORDS.failed);
  }
  const facts = businessReadFactsOf(answer);
  const found = facts.services.length + facts.rules.length + facts.answers.length + facts.closed.length;
  L.info("website_read", { pages: pages.length, services: facts.services.length, found });
  const kept: Json = {
    services: facts.services,
    closed: facts.closed,
    rules: facts.rules,
    answers: facts.answers,
    description: facts.description,
    look,
  };
  return keep(kept, found || facts.description ? null : WEBSITE_UNREAD_WORDS.nothing);
}

export function websiteReader(db: Db): NonNullable<JobContext["website"]> {
  return {
    read: async (job: ClaimedJob, deadline: number) => {
      await readWebsite(db, job.tenant_id, typeof job.payload.url === "string" ? job.payload.url : null, deadline);
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
  const listing = listingFactsOf(await listingFactsStored(db, tenantId).catch(() => null));
  const website = cfg?.brain?.profile?.website ?? listing?.website ?? null;
  if (!feedUrlOk(website)) return json(200, { ok: true, asked: false });
  await scheduleWebsiteRead(db, tenantId, website);
  return json(200, { ok: true, asked: true });
}
