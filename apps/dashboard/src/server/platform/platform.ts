import "server-only";

/**
 * The Console's server side (decision 0066, once the back office): who may look across workspaces, in which of the
 * three roles, and the reads and acts that do.
 *
 * THE ONE RULE. Every path to cross-tenant data passes `backOffice(ctx)`, and
 * that function asks the DATABASE — `platform_staff_state()`, which reads
 * `platform_admins` for `auth.uid()` and the session's second factor, and can
 * answer about nobody else. Every act then goes through `takeAct()` (acts.ts),
 * which asks the role and writes the Admin log's row before it runs. There is
 * no env var, no key, and no list in this file: an answer that lives in two
 * places is an answer that can disagree with itself, and the copy that says
 * "yes" wins by accident.
 *
 * THE CAPABILITY IS THE CHECK. The first version exported `platformDb()` — a
 * service-role client, no arguments, available to any module that imported it —
 * and relied on a test walking one directory to prove nothing else did. That is
 * the wrong shape for the one boundary in this product where reading another
 * business's data is a feature: a grep cannot see a route that has not been
 * written yet, and the route that matters is the one somewhere ELSE that
 * imports it.
 *
 * So the client is unreachable except as a property of a `BackOffice` handle,
 * and the only way to construct one is to await `backOffice(ctx)`, which throws
 * unless the database says yes. The type is branded so it cannot be forged from
 * an object literal either. Nothing is exported that hands out authority.
 *
 * Cross-workspace: the back office; its service-role client exists only behind backOffice(ctx)'s admin check.
 */
import {
  deleteSecondFactor,
  getPlatformPartners,
  listSecondFactors,
  markPartnerPaid,
  markWaitlistInvited,
  setPartnerStanding,
  recordPartnerSecondFactorReset,
  setPartnerStatus,
  staffStateOf,
  waitlistWaiting,
  type PartnerPayoutAnswer,
} from "@chanlytics/db";
import { recordEvent, type Database } from "@chanlytics/db";
import { requeueFailedJob } from "@chanlytics/jobs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AppError,
  SECOND_FACTOR_WORDS,
  STAFF_STATES,
  platformHealthOf,
  QUEUE_SHOWN,
  type PlatformHealth,
  type PlatformPartnerBalanceDto,
  type PlatformPartnerWorkspaceDto,
  type PlatformQueue,
  type PlatformTenantDto,
  type SweepHealthRow,
  type StaffRole,
  type StaffState,
} from "@chanlytics/contracts";
import type { RouteContext } from "../with-route";
import { serviceDb } from "../service-db";
import { takeAct } from "./acts";
import { log } from "@/server/log";

declare const backOfficeBrand: unique symbol;

/**
 * Proof that the database said this session is on the Console's staff and showed its second factor, carrying the
 * client that proof unlocks and who it is. Only `backOffice()` can make one.
 */
export interface BackOffice {
  readonly [backOfficeBrand]: true;
  /** Service-role, RLS off, every workspace. Reachable only through the check above it. */
  readonly db: SupabaseClient<Database>;
  /** The session client, for the reads whose own RPC carries the same check. */
  readonly session: SupabaseClient<Database>;
  /** What the database says they may do (decision 0066): owner, support or billing. */
  readonly role: StaffRole;
  /** Who: the act log's actor. */
  readonly userId: string;
  readonly email: string | null;
}

/**
 * Ask the database what this session is to the Console (platform_staff_state, 00466): its role once it showed its
 * second factor, `needs_second_factor` before, `none` for everybody else.
 *
 * Three answers, not two, and the third is the one that was wrong: a database that cannot answer is not a "no".
 * Telling a real admin "No such page" during a Postgres hiccup is exactly the moment they opened the Console for.
 */
async function staffState(ctx: RouteContext): Promise<StaffState> {
  const { data, error } = await staffStateOf(ctx.supabase);
  if (error) throw new AppError("internal", "Could not check that just now — try again in a moment.", 503);
  return (STAFF_STATES as readonly string[]).includes(String(data)) ? (data as StaffState) : "none";
}

/**
 * The Console, or a refusal.
 *
 * 404, not 403: a customer who guessed the URL learns nothing about whether there is a Console behind it. Staff who
 * have not shown their second factor this session are told so (mfa_required), and the tab goes to the second step,
 * which sets an authenticator up for an account that has none (decision 0066: no grace).
 */
export async function backOffice(ctx: RouteContext): Promise<BackOffice> {
  const state = await staffState(ctx);
  if (state === "none") throw new AppError("not_found", "No such page.", 404);
  if (state === "needs_second_factor") throw new AppError("mfa_required", SECOND_FACTOR_WORDS.staffRequired, 403);
  return {
    db: serviceDb(),
    session: ctx.supabase,
    role: state,
    userId: ctx.userId,
    email: ctx.email ?? null,
  } as BackOffice;
}

/**
 * Whether this session is on the Console's staff, its second factor shown or not: the bit the boot hands the nav, so
 * Settings links to the Console, which asks for the factor itself.
 */
export async function isPlatformAdmin(ctx: RouteContext): Promise<boolean> {
  return staffState(ctx).then(
    (state) => state !== "none",
    () => false,
  );
}

/**
 * Every workspace, from the guarded RPC.
 *
 * Read on the SESSION client on purpose. The check inside the function is
 * `auth.uid()`, so it only passes for a real signed-in admin — the service-role
 * key gets a 403 from it like everybody else, which is a property worth keeping
 * rather than routing around.
 */
export async function platformOverview(office: BackOffice): Promise<PlatformTenantDto[]> {
  const { data, error } = await office.session.rpc("platform_overview");
  if (error) {
    // 42501 is the function's own refusal — which the caller has already been
    // cleared past, so seeing it here means the two checks disagree.
    if (error.code === "42501") throw new AppError("not_found", "No such page.", 404);
    throw new Error(error.message);
  }
  // No cast: the generated Functions type is precise, so a column renamed in a
  // future migration fails the build here rather than shipping `undefined` to
  // the page.
  const rows: PlatformTenantDto[] = data ?? [];
  return rows;
}

/**
 * Whether the machinery under every workspace is running.
 *
 * Read on `office.db`, the service-role client, because both functions are
 * granted to that role alone — `revoke ... from authenticated` in 00105 and
 * 00107, deliberately: they count across every workspace, and no session
 * should be able to ask. Reaching them needs no new grant and no migration,
 * only the door that is already in front of this file.
 *
 * NEITHER READ IS FATAL. The back office exists to be opened when something
 * is wrong, and a page that 500s because the health read failed is useless at
 * exactly that moment. A backlog that could not be read stays null, which the
 * judgement treats as "not healthy" rather than "all clear".
 */
export async function platformHealth(office: BackOffice, now = new Date()): Promise<PlatformHealth> {
  const [health, backlog] = await Promise.all([
    office.db.rpc("sweep_health").then(
      (r) => r,
      () => ({ data: null, error: { message: "unreadable" } }),
    ),
    office.db.rpc("jobs_backlog").then(
      (r) => r,
      () => ({ data: null, error: { message: "unreadable" } }),
    ),
  ]);
  const rows = (!health.error && Array.isArray(health.data) ? health.data : []) as SweepHealthRow[];
  const due = !backlog.error && typeof backlog.data === "number" ? backlog.data : null;
  return platformHealthOf(rows, due, now);
}

/**
 * The people waiting for a workspace, oldest first.
 *
 * Read on `office.db`. `public.waitlist` is deny-all with no policies (00088):
 * nobody on it has a workspace to be scoped to, so there is no membership that
 * could make a row legitimately readable by a session, and the service-role
 * client is the only thing that can see it at all.
 *
 * NOT FATAL, and null is not empty. The back office is opened when something is
 * wrong, so a read that failed must not take the page down with it -- and it
 * must not come back as "nobody is waiting" either, which is the one answer a
 * queue must never give by accident.
 */
export async function platformWaitlist(office: BackOffice, limit = QUEUE_SHOWN): Promise<PlatformQueue> {
  const { data, error, count } = await waitlistWaiting(office.db, limit);
  if (error) {
    log.error("platform_waitlist_unreadable", { error: error.message });
    return { waiting: null, total: null };
  }
  return { waiting: data ?? [], total: count ?? (data ?? []).length };
}

/**
 * Somebody was invited. The product sent nothing and says so (QUEUE_SENDS_NOTHING):
 * this records that a person did, which is what takes the row out of the queue.
 *
 * Conditional on the row still waiting, so two admins working the same list do
 * not both claim it, and the row count says which of them this was. `invited_by`
 * is the attribution the table was given a column for.
 */
export async function platformWaitlistInvited(
  office: BackOffice,
  id: string,
  why: ConsoleWhy,
): Promise<"marked" | "already"> {
  return takeAct(
    office,
    { act: "waitlist_invited", why, tenantId: null, target: "waitlist", targetId: id },
    async () => {
      const { data, error } = await markWaitlistInvited(office.db, id, office.userId, new Date().toISOString());
      if (error)
        throw new AppError("internal", "That could not be recorded, so it was not done. Try again in a moment.", 503);
      return data && data.length > 0 ? ("marked" as const) : ("already" as const);
    },
    (out) => ({ outcome: "done", note: out === "already" ? "Someone had marked them already." : null }),
  );
}

/** One workspace's identity, for the detail view's heading. */
export async function platformTenant(
  office: BackOffice,
  tenantId: string,
): Promise<{ id: string; slug: string; name: string; status: string; timezone: string; created_at: string } | null> {
  const { data, error } = await office.db
    .from("tenants")
    .select("id, slug, name, status, timezone, created_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

interface PlatformEvent {
  kind: string;
  category: string;
  subject_type: string | null;
  created_at: string;
}

/**
 * What has happened in a workspace lately.
 *
 * The ledger `emitEvent` already writes on every provisioning step, filing,
 * connection and billing change — the trail that was only ever readable by
 * hand. Capped and newest-first: this answers "what changed just before it
 * broke", which is a short question.
 *
 * `data` is deliberately NOT selected. It is the one unbounded field on this
 * route — emitEvent's payloads carry numbers, addresses and provider ids from
 * every corner of the product — and the page renders none of it. Sending
 * another business's payloads to a browser to be thrown away is the kind of
 * quiet over-reach a cross-tenant surface has no excuse for. If support ever
 * needs one, it should be a deliberate per-event read with a named field list.
 */
export async function platformEvents(office: BackOffice, tenantId: string, limit = 40): Promise<PlatformEvent[]> {
  const { data, error } = await office.db
    .from("events")
    .select("kind, category, subject_type, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/* -------------------------------------------------------------------------- *
 * The ops door: the write half of the back office.
 *
 * WHY IT EXISTS. `/api/admin/lines` — retry, refile, release — is gated on
 * DIAG_KEY, which Vercel holds as a SENSITIVE variable: write-only, unreadable
 * by anyone including the person who set it. So every one of those actions has
 * been performed by importing the library into a local script and recovering
 * four values from Twilio and the database by hand. That is fine once. It is not
 * an operations model, and refiling a rejected campaign is the single most
 * common A2P support action there is.
 *
 * The key stays where it is and stays unreadable. What changes is that a
 * PERSON'S SESSION can now authorise these, through the same `platform_admins`
 * check as every other back-office read.
 *
 * NEVER A PASSTHROUGH. Each route names its own operation. A route that forwards
 * an arbitrary `op` to the edge is a back door with extra steps, and this is the
 * one surface in the product where that would be handing out the master key.
 * -------------------------------------------------------------------------- */

import { EDGE_LINES_TIMEOUT_MS, edgeLines } from "../connections/lines";
import { LINE_ACTS, whyWords, type ConsoleWhy, type PlatformLineAction } from "@chanlytics/contracts";

/** The edge call each action makes. Written out so the set is a list somebody can read, not a parameter. */
const EDGE_OP: Record<PlatformLineAction, (tenantId: string, lineId: string) => Record<string, unknown>> = {
  retry: (tenant_id, line_id) => ({ op: "retry", tenant_id, line_id, by: "support" }),
  // `refile` is the same edge operation as an owner's own registration, with the
  // flag that lets it replace a rehearsal or resend a rejected campaign -- the
  // two things an owner may not do and support must.
  refile: (tenant_id, line_id) => ({ op: "register", tenant_id, line_id, refile: true }),
  // `replace` is the same door once more, with the flag that deletes a refused
  // campaign and files a new one -- a second vetting fee, so never implied by
  // refile and never reachable from an owner's own registration.
  replace: (tenant_id, line_id) => ({ op: "register", tenant_id, line_id, refile: true, replace: true }),
  release: (tenant_id, line_id) => ({ op: "release", tenant_id, line_id }),
};

interface PlatformActionResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
}

/**
 * The edge's answer in its own words, for the log: its detail, its code, or its status. A wait that ran out says so,
 * since the edge may still have finished what it was asked.
 */
function edgeWords(r: PlatformActionResult): string {
  if (r.body?.error === "edge_timeout")
    return "The edge did not answer in time. It may still have finished: look at the line before trying again.";
  const said = r.body?.detail ?? r.body?.error ?? r.body?.message;
  return typeof said === "string" && said ? said : `The edge answered ${r.status}.`;
}

/**
 * Do one thing to one workspace's line, and record who asked, and why, before doing it.
 *
 * The order is the point. The Admin log's row and the workspace's own `platform.acted` event are written FIRST and
 * the action is refused if either cannot be — an action taken on somebody else's business that nobody can be held to is
 * worse than an action that did not happen. What happened next is the line's own event, written by the edge moments
 * later, so the pair reads in order in the workspace's ledger, and the log row says what the edge answered.
 */
export async function platformLineAct(
  office: BackOffice,
  action: PlatformLineAction,
  tenantId: string,
  lineId: string,
  why: ConsoleWhy,
): Promise<PlatformActionResult> {
  return takeAct(
    office,
    { act: LINE_ACTS[action], why, tenantId, target: "line", targetId: lineId },
    async () => {
      const { error: auditErr } = await recordEvent(office.db, tenantId, "platform.acted", "line", lineId, {
        action,
        by: office.userId,
        by_email: office.email,
      });
      if (auditErr)
        throw new AppError("internal", "That could not be recorded, so it was not done. Try again in a moment.", 503);
      const a = await edgeLines(EDGE_OP[action](tenantId, lineId), EDGE_LINES_TIMEOUT_MS);
      return { ok: a.status === 200, status: a.status, body: a.body };
    },
    // Refused only when the edge said no (a 4xx), so nothing was done; a fault, or no answer, failed.
    (r) =>
      r.ok
        ? { outcome: "done", note: null }
        : { outcome: r.status >= 400 && r.status < 500 ? "refused" : "failed", note: edgeWords(r) },
  );
}

/* ------------------------------------------------------------------------ partners (decision 0012, P5) */

/**
 * Every partner, and who brought each workspace, for the back office.
 *
 * On the SESSION client, as platform_overview is: both functions check `is_platform_admin()` for `auth.uid()`
 * themselves. NOT FATAL, like the health read: the workspaces are the page's work, and a partner list that could
 * not be read is said as such rather than taking them down with it.
 */
export async function platformPartners(
  office: BackOffice,
): Promise<{ balances: PlatformPartnerBalanceDto[]; workspaces: PlatformPartnerWorkspaceDto[] } | null> {
  return getPlatformPartners(office.session).then(
    (r) => ({
      balances: r.balances,
      workspaces: r.workspaces.map((w) => ({ ...w, checks: (w.checks ?? null) as Record<string, unknown> | null })),
    }),
    () => null,
  );
}

/** The function's refusals, as the route answers them: its own words for a bad input, the page's for the rest. */
/**
 * What the partner verbs keep and a partner may read: the note the Console asks for on them (PartnerWhySchema), not the
 * reason's kind or ticket, which are the log's.
 */
function partnerReads(why: ConsoleWhy): string {
  return why.note ?? whyWords(why);
}

function partnerVerbError(r: { code: string; message: string }): AppError {
  if (r.code === "22023") return new AppError("validation", r.message, 400);
  if (r.code === "P0002") return new AppError("not_found", r.message, 404);
  if (r.code === "42501") return new AppError("not_found", "No such page.", 404);
  return new AppError("internal", "That could not be recorded, so it was not done. Try again in a moment.", 503);
}

/**
 * A person's decision on a workspace a partner brought. The function records it (platform.acted and
 * partner.standing_set, against the caller) in the same transaction as the change, so there is no order to get
 * wrong here: it is recorded, or it did not happen.
 */
export async function platformPartnerStanding(
  office: BackOffice,
  tenantId: string,
  standing: string,
  why: ConsoleWhy,
): Promise<{ standing: string; from: string | null; voided: number; matured: number }> {
  return takeAct(
    office,
    { act: "partner_standing", why, tenantId, target: "workspace", targetId: tenantId },
    async () => {
      const r = await setPartnerStanding(office.session, tenantId, standing, partnerReads(why));
      if (!r.ok) throw partnerVerbError(r);
      return r.value;
    },
  );
}

/** Record a payout sent to a partner by hand: every payable earning in the currency, netted, into one payout. */
export async function platformPartnerPayout(
  office: BackOffice,
  partnerId: string,
  payout: { currency: string; reference: string; expectedCents?: number },
  why: ConsoleWhy,
): Promise<PartnerPayoutAnswer> {
  return takeAct(
    office,
    { act: "partner_payout", why, tenantId: null, target: "partner", targetId: partnerId },
    async () => {
      const r = await markPartnerPaid(
        office.session,
        partnerId,
        payout.currency,
        payout.reference,
        payout.expectedCents,
      );
      if (!r.ok) throw partnerVerbError(r);
      return r.value;
    },
  );
}

/**
 * Pause, close or restore a partner. A pause takes their seat on every workspace they brought (a viewer's until they
 * are restored) and releases what they held there; the function does it, and records it, in one transaction.
 */
export async function platformPartnerStatus(
  office: BackOffice,
  partnerId: string,
  status: string,
  why: ConsoleWhy,
): Promise<{ status: string; from: string; seats: number }> {
  return takeAct(
    office,
    { act: "partner_status", why, tenantId: null, target: "partner", targetId: partnerId },
    async () => {
      const r = await setPartnerStatus(office.session, partnerId, status, partnerReads(why));
      if (!r.ok) throw partnerVerbError(r);
      return r.value;
    },
  );
}

/**
 * A partner's second factor removed, so they can set up a new one at their next sign-in (decision 0013, M2). The
 * function checks the caller is a platform admin and records who, when and why (00217) before anything is removed;
 * the factor itself lives in Supabase Auth, so the platform's own client removes it. A record with nothing removed is
 * a partner who had no authenticator, and says so.
 */
export async function platformPartnerSecondFactorReset(
  office: BackOffice,
  partnerId: string,
  why: ConsoleWhy,
  svc: SupabaseClient<Database> = serviceDb(),
): Promise<{ removed: number }> {
  return takeAct(
    office,
    { act: "partner_second_factor", why, tenantId: null, target: "partner", targetId: partnerId },
    async () => {
      const r = await recordPartnerSecondFactorReset(office.session, partnerId, partnerReads(why));
      if (!r.ok) {
        if (r.code === "55000") throw new AppError("conflict", r.message, 409);
        throw partnerVerbError(r);
      }
      const userId = r.value;
      const { data, error } = await listSecondFactors(svc, userId);
      if (error) throw new AppError("upstream_auth", "Could not reach sign-in just now. Try again in a moment.", 503);
      let removed = 0;
      for (const f of data?.factors ?? []) {
        const gone = await deleteSecondFactor(svc, userId, f.id);
        if (gone.error)
          throw new AppError("upstream_auth", "Could not remove the authenticator. Try again in a moment.", 503);
        removed += 1;
      }
      return { removed };
    },
    (out) => ({ outcome: "done", note: out.removed ? null : "They had no authenticator to remove." }),
  );
}

/* ------------------------------------------------------------------------ the ledger's dead letters */

/**
 * A failed job of another workspace, run again (the requeue door). A failed row is final, so it stays as the record
 * and a fresh one of its kind and payload is due now; who asked is written first (platform.acted, as the lines' doors
 * write it), once the row is known to be one that may go again, and nothing is run when that record cannot be written. A kind that speaks to a person is refused:
 * a send whose outcome nobody knows goes again from its thread or its broadcast, where a person can see whether it
 * left, never from here.
 */
export async function platformJobRequeue(
  office: BackOffice,
  tenantId: string,
  jobId: string,
  why: ConsoleWhy,
): Promise<{ ok: true; job_id: string; kind: string }> {
  return takeAct(office, { act: "job_requeue", why, tenantId, target: "job", targetId: jobId }, () =>
    requeueOnce(office, tenantId, jobId),
  );
}

/** The requeue itself, its refusals in words: each one is the Admin log's outcome too. */
async function requeueOnce(
  office: BackOffice,
  tenantId: string,
  jobId: string,
): Promise<{ ok: true; job_id: string; kind: string }> {
  const r = await requeueFailedJob(office.db, tenantId, jobId, async (kind) => {
    const { error } = await recordEvent(office.db, tenantId, "platform.acted", "job", jobId, {
      action: `requeue:${kind}`,
      by: office.userId,
      by_email: office.email,
    });
    if (error)
      throw new AppError("internal", "That could not be recorded, so it was not done. Try again in a moment.", 503);
  });
  switch (r.outcome) {
    case "requeued":
      return { ok: true, job_id: jobId, kind: r.kind };
    case "not_found":
      throw new AppError("not_found", "That job does not exist in that workspace.", 404);
    case "not_failed":
      throw new AppError("conflict", `That job is ${r.state}, not failed: only a failed job is run again.`, 409);
    case "speaks_to_a_person":
      throw new AppError(
        "conflict",
        "A send is never run again from here: it may have reached the person. Send it again from its thread or its broadcast.",
        409,
      );
    case "unknown_kind":
      throw new AppError(
        "conflict",
        "This deploy does not know that kind of job yet: run it again once the deploy that does is live.",
        409,
      );
    case "redrive":
      throw new AppError(
        "conflict",
        `An event's delivery goes again with its subscriber, once the subscriber is mended: event_deliveries_redrive('${r.subscriber}') replays every failed or paused delivery of it, each once.`,
        409,
      );
    case "already_scheduled":
      throw new AppError("conflict", "That work is on the ledger again already.", 409);
  }
}
