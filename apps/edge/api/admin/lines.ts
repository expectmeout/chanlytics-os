/**
 * POST /api/admin/lines — a workspace's own phone number, provisioned by the
 * product (plan §5, §7). Diagnostic-key only; the dashboard's /api/v1/lines
 * verbs call it for an owner.
 *
 *   { op: "status" }                                  → may this deployment get lines, and with which provider
 *   { op: "search", area_code }                       → local numbers to choose from, with the monthly cost
 *   { op: "buy", tenant_id, number }                  → the saga: subaccount → number → trunk → agent → import → row
 *   { op: "retry", tenant_id, line_id }               → resume a failed line at its step
 *   { op: "release", tenant_id, line_id }             → give the number back and forget the line (hygiene)
 *   { op: "record", tenant_id, record, path? }        → the business on record, once per workspace
 *   { op: "register", tenant_id, line_id, ... }       → the carrier registration: a brand and a campaign, filed
 *   { op: "registration-status", tenant_id, line_id } → where the carriers stand, written to the row
 *
 * The provider is Twilio when the master credentials exist, the dry
 * provider on previews with LINES_DRY_RUN=1, and nothing on production
 * without credentials — then the Setup page keeps "we set it up with you".
 * A line that fails leaves its step and the provider's words on the row,
 * tells the workspace's bell and emails the platform; a retry resumes.
 *
 * THIS FILE IS THE WIRE, NOT THE JUDGEMENT. What each op does with what it
 * read is decided in lib/lines/line-ops.ts, pure over the rows; what is left
 * here is the knock, the reads in the order the ops need them, the writes and
 * the job, and the shape the dashboard wants back. The same split the texting
 * door (inbound-sms.ts with sms-ingress.ts) uses.
 */
import { json } from "../../lib/http.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import {
  errorMessage,
  readBody,
  respond,
  stop,
  workspaceOf,
  workspaceRow,
  type Refused,
} from "../../lib/admin-door.js";
import { emitEvent } from "../../lib/packages/db.js";
import { SPEND_NUMBER, SPEND_TEXTING, UUID, type SpendWords } from "../../lib/packages/contracts.js";
import { lineForClient, lineProviderFromEnv, type LineProviderChoice } from "../../lib/lines/lines.js";
import { releaseLine } from "../../lib/lines/line-release.js";
import { registerLine } from "../../lib/lines/a2p-register.js";
import { syncRegistration } from "../../lib/lines/a2p-sync.js";
import {
  unfileMockRegistration,
  resubmitRejectedCampaign,
  replaceRejectedCampaign,
} from "../../lib/lines/a2p-refile.js";
import { scheduleJob } from "../../lib/packages/jobs.js";
import { claimLineForResume, type LineDbRow } from "../../lib/lines/line-resume.js";
import { dashboardOrigin } from "../../lib/dashboard-origin.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/packages/db.js";
import { env } from "../../lib/env.js";
import {
  type LinesBody,
  type FilingPlan,
  type FilingPages,
  UNKNOWN_LINE_OP,
  NO_LINE_PROVIDER,
  lineStatus,
  planSearch,
  searchAnswer,
  spendRefusal,
  buyRequest,
  liveLineOf,
  planBuy,
  provisionJob,
  queuedAnswer,
  notScheduledAnswer,
  planRetry,
  retryTakenAnswer,
  releaseAnswer,
  planRecord,
  recordRefusal,
  recordAnswer,
  filingPages,
  filingFlags,
  planFiling,
  resubmitVerdict,
  resubmittedAnswer,
  takeOffVerdict,
  filingAnswer,
  campaignHeldFor,
  syncAnswer,
  heldCampaignAnswer,
} from "../../lib/lines/line-ops.js";

type Db = SupabaseClient<Database>;

/** A writing op's call: the knock verified, the provider chosen, the keys and the database present, the workspace on record. */
interface LineCall {
  body: LinesBody;
  choice: LineProviderChoice;
  apiKey: string;
  db: Db;
  tenantId: string;
  tenant: { id: string; name: string; slug: string };
}

type WritingOp = "buy" | "retry" | "release" | "record" | "register" | "registration-status";

/** Everything below the knock writes: each op reads what it needs, decides in line-ops.ts, applies and answers. */
const WRITES: Record<WritingOp, (c: LineCall) => Promise<Response>> = {
  buy,
  retry,
  release,
  record,
  register,
  "registration-status": registrationStatus,
};

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/lines");
  if (!auth.ok) return auth.response;
  const body = await readBody<LinesBody>(request);
  const op = typeof body.op === "string" ? body.op : "";
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
  const choice = lineProviderFromEnv();

  if (op === "status") return respond(lineStatus(choice));
  if (!choice) return respond(NO_LINE_PROVIDER);
  if (op === "search") return search(choice, body);

  const call = await writingCall(body, choice);
  if (!call.ok) return call.response;
  const run = Object.hasOwn(WRITES, op) ? WRITES[op as WritingOp] : null;
  return run ? run(call.value) : respond(UNKNOWN_LINE_OP);
}

/** Local numbers to choose from, with the monthly cost: a question to the provider, not to the database. */
async function search(choice: LineProviderChoice, body: LinesBody): Promise<Response> {
  const plan = planSearch(body.area_code);
  if (plan.kind === "refuse") return respond(plan.answer);
  try {
    const numbers = await choice.provider.searchLocal(choice.master, { areaCode: plan.areaCode, limit: 8 });
    return respond(searchAnswer(choice, plan.areaCode, numbers));
  } catch (e) {
    return json(502, { ok: false, error: errorMessage(e) });
  }
}

/** What every writing op needs -- the receptionist's provider, a database and a workspace on record -- refused in that order. */
async function writingCall(
  body: LinesBody,
  choice: LineProviderChoice,
): Promise<{ ok: true; value: LineCall } | Refused> {
  const apiKey = env.RETELL_API_KEY;
  const fnSecret = env.RETELL_FN_SECRET;
  if (!apiKey || !fnSecret) return stop(json(503, { ok: false, error: !apiKey ? "no_provider_key" : "no_fn_secret" }));
  const ws = workspaceOf(body.tenant_id);
  if (!ws.ok) return ws;
  let read;
  try {
    read = await ws.db.from("tenants").select("id, name, slug").eq("id", ws.tenantId).maybeSingle();
  } catch (e) {
    // This door answers a read that throws as one that failed; the Google and billing doors let it throw.
    return stop(json(503, { ok: false, error: errorMessage(e) }));
  }
  const tenant = workspaceRow(read);
  if (!tenant.ok) return tenant;
  return { ok: true, value: { body, choice, apiKey, db: ws.db, tenantId: ws.tenantId, tenant: tenant.row } };
}

/**
 * The spend rule, asked of the billing row on this side of the wire (line-ops.ts says why): a refusal, or null when
 * the workspace may.
 */
async function spendGate(c: LineCall, doing: SpendWords): Promise<Response | null> {
  const bill = await c.db.from("billing_accounts").select("mode, status").eq("tenant_id", c.tenantId).maybeSingle();
  const refused = spendRefusal(bill, doing);
  return refused ? respond(refused) : null;
}

/** The named line of the named workspace, or the refusal: another workspace's row does not exist as far as this one can see. */
async function lineRowOf(c: LineCall): Promise<{ ok: true; row: LineDbRow } | Refused> {
  const lineId = typeof c.body.line_id === "string" ? c.body.line_id.trim() : "";
  if (!UUID.test(lineId)) return stop(json(400, { ok: false, error: "line_id is required" }));
  const row = await c.db.from("lines").select("*").eq("id", lineId).eq("tenant_id", c.tenantId).maybeSingle();
  if (row.error) return stop(json(503, { ok: false, error: row.error.message }));
  if (!row.data) return stop(json(404, { ok: false, error: "no such line" }));
  return { ok: true, row: row.data };
}

/** The saga, scheduled as a line_provision job -- never run here. The row stands when the ledger refuses. */
async function queue(c: LineCall, row: LineDbRow, by: "owner" | "support", now: Date): Promise<Response> {
  try {
    await scheduleJob(c.db, provisionJob(c.tenantId, row.id, by, now));
  } catch (e) {
    return respond(notScheduledAnswer(e, row));
  }
  return respond(queuedAnswer(c.choice, row));
}

/* ----------------------------------------------------------------- buy */

async function buy(c: LineCall): Promise<Response> {
  // The spend rule before the row exists, and before the number is even looked at.
  const refused = await spendGate(c, SPEND_NUMBER);
  if (refused) return refused;
  const asked = buyRequest(c.body.number, c.body.area_code);
  if (asked.kind === "refuse") return respond(asked.answer);
  // ONE LINE PER WORKSPACE. Read here so the owner is answered with the line
  // that stands, or the failed one to retry; KEPT by the database
  // (lines_one_live_per_tenant_idx, 00195), because two buys can both read
  // nothing -- see the insert below.
  const ours = () => c.db.from("lines").select("*").eq("tenant_id", c.tenantId).order("created_at");
  const others = await ours();
  if (others.error) return json(503, { ok: false, error: others.error.message });
  const now = new Date();
  const plan = planBuy({
    tenantId: c.tenantId,
    provider: c.choice.name,
    number: asked.number,
    areaCode: asked.areaCode,
    others: others.data ?? [],
    now,
  });
  if (plan.kind === "refuse") return respond(plan.answer);
  const ins = await c.db.from("lines").insert(plan.row).select("*").single();
  if (ins.error) {
    // THE DATABASE'S RULE, when two buys crossed. Both read no line above and
    // both inserted; a workspace holds one line that is being set up or
    // answers (lines_one_live_per_tenant_idx, 00195) and a number is live once
    // (lines_e164_live_idx, 00066), so the second insert fails here with 23505
    // -- before a saga is queued for it, and before the carrier hears of it.
    // Answered as the read above would have answered it, with the line that
    // stands. A conflict that leaves this workspace with no live line (a
    // number another workspace holds) is not its line_exists and keeps the
    // provider's words.
    if (ins.error.code === "23505") {
      const again = await ours();
      const stands = liveLineOf(again.data ?? []);
      if (stands) return json(409, { ok: false, error: "line_exists", line: lineForClient(stands) });
    }
    return json(503, { ok: false, error: ins.error.message });
  }
  return queue(c, ins.data, "owner", now);
}

/* --------------------------------------------------------------- retry */

async function retry(c: LineCall): Promise<Response> {
  const read = await lineRowOf(c);
  if (!read.ok) return read.response;
  const now = new Date();
  const plan = planRetry(read.row, c.body.by, now);
  if (plan.kind === "refuse") return respond(plan.answer);
  // TAKE THE ROW before running anything on it. The check above reads a
  // snapshot; between it and the saga, the sweep or a second person can have
  // restarted the same line, and two sagas on one row is two trunks at the
  // carrier. The take is a compare-and-swap, so exactly one caller wins it.
  let taken: LineDbRow | null;
  try {
    taken = await claimLineForResume(c.db, read.row, now.getTime(), plan.by);
  } catch (e) {
    return json(503, { ok: false, error: errorMessage(e) });
  }
  if (!taken) return respond(retryTakenAnswer(read.row));
  return queue(c, taken, plan.by, now);
}

/* ------------------------------------------------------------- release */

/**
 * Give the number back (Retell's copy, the number, the trunk), forget the line; the routing rows it created are
 * switched off, never deleted (calls keep their history). The steps are line-release.ts's, which the lines sweep also
 * runs for a workspace whose subscription ended.
 */
async function release(c: LineCall): Promise<Response> {
  const read = await lineRowOf(c);
  if (!read.ok) return read.response;
  const r = await releaseLine(c.db, c.choice, { apiKey: c.apiKey }, c.tenantId, read.row);
  return respond(releaseAnswer(r));
}

/* -------------------------------------------------------------- record */

/**
 * The business on record: what every carrier registration asks, kept once per workspace. Owners edit it through the
 * dashboard's route; this is the door that writes it.
 */
async function record(c: LineCall): Promise<Response> {
  const plan = planRecord(c.body.record, c.body.path, c.tenantId);
  if (plan.kind === "refuse") return respond(plan.answer);
  const ours = await c.db.from("lines").select("e164").eq("tenant_id", c.tenantId);
  const ourNumbers = (ours.data ?? []).map((r) => r.e164).filter((n): n is string => !!n);
  const refused = recordRefusal(plan.row, plan.path, ourNumbers);
  if (refused) return respond(refused);
  const up = await c.db.from("business_records").upsert(plan.row, { onConflict: "tenant_id" }).select("*").single();
  if (up.error) return json(503, { ok: false, error: up.error.message });
  await emitEvent(c.db, c.tenantId, "business.recorded", "setup", "tenant", c.tenantId, {
    legal_name: plan.row.legal_name,
    path: plan.path,
  }).catch(() => {});
  return respond(recordAnswer(up.data));
}

/* ------------------------------------------------------------ register */

async function register(c: LineCall): Promise<Response> {
  const read = await lineRowOf(c);
  if (!read.ok) return read.response;
  const row = read.row;
  // What this filing will COST, read off the row rather than off a flag; only the one free path skips the rule.
  const flags = filingFlags(c.body, row);
  if (!flags.correctingInPlace) {
    const refused = await spendGate(c, SPEND_TEXTING);
    if (refused) return refused;
  }
  const rec = await c.db.from("business_records").select("*").eq("tenant_id", c.tenantId).maybeSingle();
  if (rec.error) return json(503, { ok: false, error: rec.error.message });
  if (!rec.data) {
    await c.db
      .from("lines")
      .update({ sms_state: "needs_record", state_since: new Date().toISOString() })
      .eq("id", row.id);
    return json(409, { ok: false, error: "no_business_record", hint: "op 'record' first" });
  }
  const pages = filingPages(dashboardOrigin(), c.tenant.slug);
  // Whether a customer has anywhere to say yes. The message flow filed with the
  // carriers says they opt in by texting this business, and that has to be true
  // of a workspace before it is said about one. Read here, above the branch,
  // because BOTH ways out state it to the carriers -- a first filing and a
  // resubmitted one.
  const saysYes = await c.db
    .from("tenant_channels")
    .select("kind")
    .eq("tenant_id", c.tenantId)
    .eq("status", "active")
    .in("kind", ["whatsapp", "sms"]);
  const plan = planFiling({
    row,
    record: rec.data,
    workspaceName: c.tenant.name,
    saysYes: saysYes.data ?? [],
    flags,
    pages,
  });
  if (plan.kind === "refuse") return respond(plan.answer);
  if (plan.kind === "resubmit") return resubmit(c, row, plan);
  return file(c, row, plan, pages);
}

/** The rejected campaign, edited in place as the subaccount: no second vetting fee. */
async function resubmit(
  c: LineCall,
  row: LineDbRow,
  plan: Extract<FilingPlan, { kind: "resubmit" }>,
): Promise<Response> {
  const again = await resubmitRejectedCampaign(c.db, row, plan.facts, plan.check);
  const verdict = resubmitVerdict(again);
  if (verdict.kind === "refuse") return respond(verdict.answer);
  const after = await c.db.from("lines").select("*").eq("id", row.id).single();
  return respond(resubmittedAnswer(verdict.row, after.data));
}

/**
 * What comes off before the new filing, when the plan says so -- the refused campaign for a replacement, the
 * rehearsal for a real filing; either only for a filing that would pass, the check runs inside -- then the filing.
 */
async function file(
  c: LineCall,
  row: LineDbRow,
  plan: Extract<FilingPlan, { kind: "file" }>,
  pages: FilingPages,
): Promise<Response> {
  let line = row;
  if (plan.takeOff) {
    const off =
      plan.takeOff === "replace"
        ? await replaceRejectedCampaign(c.db, row, plan.check)
        : await unfileMockRegistration(c.db, row, plan.check);
    const verdict = takeOffVerdict(off, plan.takeOff);
    if (verdict.kind === "refuse") return respond(verdict.answer);
    line = verdict.row;
  }
  const result = await registerLine(c.db, {
    line,
    record: plan.check.record,
    workspaceName: plan.check.workspaceName,
    ...pages,
    hasOptInNumber: plan.check.hasOptInNumber,
    mock: plan.mock,
  });
  const after = await c.db.from("lines").select("*").eq("id", row.id).single();
  return respond(filingAnswer(result, plan.mock, after.data));
}

/* -------------------------------------------------- registration-status */

/** Where the carriers stand, written to the row; a campaign held for an approved brand is filed on the way. */
async function registrationStatus(c: LineCall): Promise<Response> {
  const read = await lineRowOf(c);
  if (!read.ok) return read.response;
  const r = await syncRegistration(c.db, read.row);
  if (!campaignHeldFor(r, read.row)) return respond(syncAnswer(r));
  const rec = await c.db.from("business_records").select("*").eq("tenant_id", c.tenantId).maybeSingle();
  const fresh = await c.db.from("lines").select("*").eq("id", read.row.id).single();
  if (!rec.data || !fresh.data) return respond(syncAnswer(r));
  const filed = await registerLine(c.db, {
    line: fresh.data,
    record: rec.data,
    workspaceName: c.tenant.name,
    ...filingPages(dashboardOrigin(), c.tenant.slug),
    mock: fresh.data.reg_mock,
  });
  return respond(heldCampaignAnswer(r, filed));
}
