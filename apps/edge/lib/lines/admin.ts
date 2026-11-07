/**
 * POST /api/admin/lines — a workspace's own phone number, provisioned by the
 * product (plan §5, §7). Signed admin token only; the dashboard's /api/v1/lines
 * verbs call it for an owner.
 *
 * The door is api/admin/lines.ts: it checks who may knock (authorizeAdmin) and reads the body, then hands this the
 * knock (`auth`) and what the body carried; everything after is here, in the order the door had it.
 *
 *   { op: "status" }                                  → may this deployment get lines, and with which provider
 *   { op: "search", area_code }                       → local numbers to choose from, with the monthly cost
 *   { op: "lookup", number }                          → what the number's line is, by the carrier's records (R11)
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
 * read is decided in lib/lines/ops/filing.ts, pure over the rows; what is left
 * here is the knock, the reads in the order the ops need them, the writes and
 * the job, and the shape the dashboard wants back. The same split the texting
 * door (inbound-sms.ts with sms/ingress.ts) uses.
 */
import { json, refuse } from "../shared/http.js";
import { personFor, workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { errorMessage, respond, stop, workspaceOf, workspaceRow, type Refused } from "../shared/admin-door.js";
import { findBusinessOnRecord } from "@chanlytics/db/lines";
import { emitEvent } from "@chanlytics/db/events";
import { type Database } from "@chanlytics/db/types";
import {
  SPEND_NUMBER,
  SPEND_TEXTING,
  UUID,
  lineLookupOf,
  normalizePhone,
  type SpendWords,
} from "@chanlytics/contracts";
import { lookupLineType } from "@chanlytics/channels/lines";
import { lineForClient, lineProviderFromEnv, type LineProviderChoice } from "./lines.js";
import { releaseLine } from "./release.js";
import { registerLine } from "./a2p-register.js";
import { syncRegistration } from "./a2p-sync.js";
import { unfileMockRegistration, resubmitRejectedCampaign, replaceRejectedCampaign } from "./a2p-refile.js";
import { scheduleJob } from "@chanlytics/jobs";
import { claimLineForResume, type LineDbRow } from "./resume.js";
import { dashboardOrigin } from "../shared/dashboard-origin.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../shared/env.js";
import { secretToProvision } from "../shared/door-auth.js";
import {
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
  recordSaved,
  type LinesBody,
} from "./ops/search-buy.js";
import {
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
  type FilingPlan,
  type FilingPages,
} from "./ops/filing.js";

type Db = SupabaseClient<Database>;
type RecordRow = Database["public"]["Tables"]["business_records"]["Row"];

/** A writing op's call: the knock verified, the provider chosen, the keys and the database present, the workspace on record. */
interface LineCall {
  body: LinesBody;
  choice: LineProviderChoice;
  apiKey: string;
  db: Db;
  tenantId: string;
  tenant: { id: string; name: string; slug: string };
  /** The member the dashboard acted for (the token's, admin-auth.ts personFor), where one is named. */
  person: string | null;
}

type WritingOp = "buy" | "retry" | "release" | "record" | "register" | "registration-status";

/** Everything below the knock writes: each op reads what it needs, decides in lines/ops/filing.ts, applies and answers. */
const WRITES: Record<WritingOp, (c: LineCall) => Promise<Response>> = {
  buy,
  retry,
  release: releaseOp,
  record,
  register,
  "registration-status": registrationStatus,
};

/**
 * What a number's line is (decision 0073, R11): Twilio Lookup's line type intelligence on the master account, a few cents
 * a number, read as step 4 says it (contracts lineLookupOf). Not a write: nothing is kept. The dry provider, and a number
 * that is not one, answer no lookup; a lookup Twilio could not answer is none, and step 4 asks the owner instead.
 */
async function lookupNumber(choice: LineProviderChoice, body: LinesBody): Promise<Response> {
  const e164 = normalizePhone(body.number ?? "");
  if (!e164) return refuse(400, "bad_request", "number is a phone number");
  if (choice.name !== "twilio") return json(200, { ok: true, lookup: null });
  return json(200, { ok: true, lookup: lineLookupOf(await lookupLineType(choice.master, e164)) });
}

/** Local numbers to choose from, with the monthly cost: a question to the provider, not to the database. */
async function searchNumbers(choice: LineProviderChoice, body: LinesBody): Promise<Response> {
  const plan = planSearch(body.area_code);
  if (plan.kind === "refuse") return respond(plan.answer);
  try {
    const numbers = await choice.provider.searchLocal(choice.master, { areaCode: plan.areaCode, limit: 8 });
    return respond(searchAnswer(choice, plan.areaCode, numbers));
  } catch (e) {
    return refuse(502, "provider_refused", errorMessage(e));
  }
}

/** What every writing op needs -- the receptionist's provider, a database and a workspace on record -- refused in that order. */
async function writingCall(
  body: LinesBody,
  choice: LineProviderChoice,
  person: string | null,
): Promise<{ ok: true; value: LineCall } | Refused> {
  const apiKey = env.RETELL_API_KEY;
  // None once the doors open for the signature alone (secretToProvision): a line made then carries no secret.
  const fnSecret = secretToProvision();
  if (!apiKey || fnSecret === undefined) return stop(refuse(503, !apiKey ? "no_provider_key" : "no_fn_secret"));
  const ws = workspaceOf(body.tenant_id);
  if (!ws.ok) return ws;
  let read;
  try {
    read = await ws.db.from("tenants").select("id, name, slug").eq("id", ws.tenantId).maybeSingle();
  } catch (e) {
    // This door answers a read that throws as one that failed; the Google and billing doors let it throw.
    return stop(refuse(503, "read_failed", errorMessage(e)));
  }
  const tenant = workspaceRow(read);
  if (!tenant.ok) return tenant;
  return { ok: true, value: { body, choice, apiKey, db: ws.db, tenantId: ws.tenantId, tenant: tenant.row, person } };
}

/**
 * The spend rule, asked of the billing row on this side of the wire (lines/ops/filing.ts says why): a refusal, or null when
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
  if (!UUID.test(lineId)) return stop(refuse(400, "bad_request", "line_id is required"));
  const row = await c.db.from("lines").select("*").eq("id", lineId).eq("tenant_id", c.tenantId).maybeSingle();
  if (row.error) return stop(refuse(503, "read_failed", row.error.message));
  if (!row.data) return stop(refuse(404, "not_found", "no such line"));
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

async function buy(lineCall: LineCall): Promise<Response> {
  // The spend rule before the row exists, and before the number is even looked at.
  const refused = await spendGate(lineCall, SPEND_NUMBER);
  if (refused) return refused;
  const otherBuyRequest = buyRequest(lineCall.body.number, lineCall.body.area_code);
  if (otherBuyRequest.kind === "refuse") return respond(otherBuyRequest.answer);
  // ONE LINE PER WORKSPACE. Read here so the owner is answered with the line
  // that stands, or the failed one to retry; KEPT by the database
  // (lines_one_live_per_tenant_idx, 00195), because two buys can both read
  // nothing -- see the insert below.
  const ours = () => lineCall.db.from("lines").select("*").eq("tenant_id", lineCall.tenantId).order("created_at");
  const others = await ours();
  if (others.error) return refuse(503, "read_failed", others.error.message);
  const now = new Date();
  const plan = planBuy({
    tenantId: lineCall.tenantId,
    provider: lineCall.choice.name,
    number: otherBuyRequest.number,
    areaCode: otherBuyRequest.areaCode,
    others: others.data ?? [],
    now,
  });
  if (plan.kind === "refuse") return respond(plan.answer);
  const ins = await lineCall.db.from("lines").insert(plan.row).select("*").single();
  if (ins.error) {
    // THE DATABASE'S RULE, when two buys crossed. Both read no line above and
    // both inserted; a workspace holds one line that is being set up or
    // answers (lines_one_live_per_tenant_idx, 00195) and a number is live once
    // (lines_e164_live_idx, 00066), so the second insert fails here with 23505
    // -- before a saga is queued for it, and before the carrier hears of it.
    // Answered as the read above would have answered it, with the line that
    // stands. A conflict that leaves this workspace with no live line (a
    // number another workspace holds) is not its line_exists: a write that
    // failed, with the database's words in `detail`.
    if (ins.error.code === "23505") {
      const again = await ours();
      const stands = liveLineOf(again.data ?? []);
      if (stands) return json(409, { ok: false, error: "line_exists", line: lineForClient(stands) });
    }
    return refuse(503, "write_failed", ins.error.message);
  }
  return queue(lineCall, ins.data, "owner", now);
}

/* --------------------------------------------------------------- retry */

async function retry(lineCall: LineCall): Promise<Response> {
  const read = await lineRowOf(lineCall);
  if (!read.ok) return read.response;
  const now = new Date();
  const plan = planRetry(read.row, lineCall.body.by, now);
  if (plan.kind === "refuse") return respond(plan.answer);
  // TAKE THE ROW before running anything on it. The check above reads a
  // snapshot; between it and the saga, the sweep or a second person can have
  // restarted the same line, and two sagas on one row is two trunks at the
  // carrier. The take is a compare-and-swap, so exactly one caller wins it.
  let taken: LineDbRow | null;
  try {
    taken = await claimLineForResume(lineCall.db, read.row, now.getTime(), plan.by);
  } catch (e) {
    return refuse(503, "write_failed", errorMessage(e));
  }
  if (!taken) return respond(retryTakenAnswer(read.row));
  return queue(lineCall, taken, plan.by, now);
}

/* ------------------------------------------------------------- release */

/**
 * Give the number back (Retell's copy, the number, the trunk, the campaign, the subaccount), drop its token, forget the
 * line; the routing rows it created are switched off, never deleted (calls keep their history). The steps are line-release.ts's, which the lines sweep also
 * runs for a workspace whose subscription ended.
 */
async function releaseOp(c: LineCall): Promise<Response> {
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
async function record(lineCall: LineCall): Promise<Response> {
  const plan = planRecord(lineCall.body.record, lineCall.body.path, lineCall.tenantId);
  if (plan.kind === "refuse") return respond(plan.answer);
  // The workspace's numbers, which the record is checked against, and where each line's filing stands, which the save
  // speaks of. A read that fails checks against no number, as it did, and says nothing of a filing.
  const ours = await lineCall.db
    .from("lines")
    .select("e164, sms_state, reg_mock, brand_sid, facts")
    .eq("tenant_id", lineCall.tenantId);
  const lines = ours.error ? null : (ours.data ?? []);
  const ourNumbers = (lines ?? []).map((r) => r.e164).filter((n): n is string => !!n);
  const refused = recordRefusal(plan.row, plan.path, ourNumbers);
  if (refused) return respond(refused);
  // What was on record, so the save can say what it moved (the wiring's second audit, X4-3).
  let before: RecordRow | null;
  try {
    before = await findBusinessOnRecord(lineCall.db, lineCall.tenantId);
  } catch (e) {
    return refuse(503, "read_failed", errorMessage(e));
  }
  const up = await lineCall.db
    .from("business_records")
    .upsert(plan.row, { onConflict: "tenant_id" })
    .select("*")
    .single();
  if (up.error) return refuse(503, "write_failed", up.error.message);
  const saved = recordSaved(before, up.data, lines);
  await emitEvent(lineCall.db, lineCall.tenantId, "business.recorded", "tenant", lineCall.tenantId, {
    legal_name: plan.row.legal_name,
    path: plan.path,
    // Who saved it: the ledger said the record changed and never whose hand it was.
    by: lineCall.person,
    changed: saved.first ? null : saved.changed,
  }).catch(() => {});
  return respond(recordAnswer(up.data, saved));
}

/* ------------------------------------------------------------ register */

async function register(lineCall: LineCall): Promise<Response> {
  const read = await lineRowOf(lineCall);
  if (!read.ok) return read.response;
  const row = read.row;
  // What this filing will COST, read off the row rather than off a flag; only the one free path skips the rule.
  const flags = filingFlags(lineCall.body, row);
  if (!flags.correctingInPlace) {
    const refused = await spendGate(lineCall, SPEND_TEXTING);
    if (refused) return refused;
  }
  let onRecord: RecordRow | null;
  try {
    onRecord = await findBusinessOnRecord(lineCall.db, lineCall.tenantId);
  } catch (e) {
    return refuse(503, "read_failed", errorMessage(e));
  }
  if (!onRecord) {
    await lineCall.db
      .from("lines")
      .update({ sms_state: "needs_record", state_since: new Date().toISOString() })
      .eq("id", row.id)
      .eq("tenant_id", lineCall.tenantId);
    return json(409, { ok: false, error: "no_business_record", hint: "op 'record' first" });
  }
  const pages = filingPages(dashboardOrigin(), lineCall.tenant.slug);
  // Whether a customer has anywhere to say yes. The message flow filed with the
  // carriers says they opt in by texting this business, and that has to be true
  // of a workspace before it is said about one. Read here, above the branch,
  // because BOTH ways out state it to the carriers -- a first filing and a
  // resubmitted one.
  const saysYes = await lineCall.db
    .from("tenant_channels")
    .select("kind")
    .eq("tenant_id", lineCall.tenantId)
    .eq("status", "active")
    .in("kind", ["whatsapp", "sms"]);
  const plan = planFiling({
    row,
    record: onRecord,
    workspaceName: lineCall.tenant.name,
    saysYes: saysYes.data ?? [],
    flags,
    pages,
  });
  if (plan.kind === "refuse") return respond(plan.answer);
  if (plan.kind === "resubmit") return resubmit(lineCall, row, plan);
  return file(lineCall, row, plan, pages);
}

/** The rejected campaign, edited in place as the subaccount: no second vetting fee. */
async function resubmit(
  lineCall: LineCall,
  row: LineDbRow,
  plan: Extract<FilingPlan, { kind: "resubmit" }>,
): Promise<Response> {
  const again = await resubmitRejectedCampaign(lineCall.db, row, plan.facts, plan.check);
  const verdict = resubmitVerdict(again);
  if (verdict.kind === "refuse") return respond(verdict.answer);
  const after = await lineCall.db
    .from("lines")
    .select("*")
    .eq("id", row.id)
    .eq("tenant_id", lineCall.tenantId)
    .single();
  return respond(resubmittedAnswer(verdict.row, after.data));
}

/**
 * What comes off before the new filing, when the plan says so -- the refused campaign for a replacement, the
 * rehearsal for a real filing; either only for a filing that would pass, the check runs inside -- then the filing.
 */
async function file(
  lineCall: LineCall,
  row: LineDbRow,
  plan: Extract<FilingPlan, { kind: "file" }>,
  pages: FilingPages,
): Promise<Response> {
  let line = row;
  if (plan.takeOff) {
    const off =
      plan.takeOff === "replace"
        ? await replaceRejectedCampaign(lineCall.db, row, plan.check)
        : await unfileMockRegistration(lineCall.db, row, plan.check);
    const verdict = takeOffVerdict(off, plan.takeOff);
    if (verdict.kind === "refuse") return respond(verdict.answer);
    line = verdict.row;
  }
  const result = await registerLine(lineCall.db, {
    line,
    record: plan.check.record,
    workspaceName: plan.check.workspaceName,
    ...pages,
    hasOptInNumber: plan.check.hasOptInNumber,
    mock: plan.mock,
  });
  const after = await lineCall.db
    .from("lines")
    .select("*")
    .eq("id", row.id)
    .eq("tenant_id", lineCall.tenantId)
    .single();
  return respond(filingAnswer(result, plan.mock, after.data));
}

/* -------------------------------------------------- registration-status */

/** Where the carriers stand, written to the row; a campaign held for an approved brand is filed on the way. */
async function registrationStatus(lineCall: LineCall): Promise<Response> {
  const read = await lineRowOf(lineCall);
  if (!read.ok) return read.response;
  const result = await syncRegistration(lineCall.db, read.row);
  if (!campaignHeldFor(result, read.row)) return respond(syncAnswer(result));
  // A record that cannot be read files nothing this time, as one that is missing: the next status read tries again.
  const onRecord = await findBusinessOnRecord(lineCall.db, lineCall.tenantId).catch(() => null);
  const fresh = await lineCall.db
    .from("lines")
    .select("*")
    .eq("id", read.row.id)
    .eq("tenant_id", lineCall.tenantId)
    .single();
  if (!onRecord || !fresh.data) return respond(syncAnswer(result));
  const filed = await registerLine(lineCall.db, {
    line: fresh.data,
    record: onRecord,
    workspaceName: lineCall.tenant.name,
    ...filingPages(dashboardOrigin(), lineCall.tenant.slug),
    mock: fresh.data.reg_mock,
  });
  return respond(heldCampaignAnswer(result, filed));
}

export async function runLineOp(auth: Admitted, body: Partial<LinesBody>): Promise<Response> {
  const op = typeof body.op === "string" ? body.op : "";
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
  const choice = lineProviderFromEnv();

  if (op === "status") return respond(lineStatus(choice));
  if (!choice) return respond(NO_LINE_PROVIDER);
  if (op === "search") return searchNumbers(choice, body);
  if (op === "lookup") return lookupNumber(choice, body);

  const call = await writingCall(body, choice, personFor(auth, body.user_id));
  if (!call.ok) return call.response;
  const run = Object.hasOwn(WRITES, op) ? WRITES[op as WritingOp] : null;
  return run ? run(call.value) : respond(UNKNOWN_LINE_OP);
}
