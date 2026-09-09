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
 *
 * The provider is Twilio when the master credentials exist, the dry
 * provider on previews with LINES_DRY_RUN=1, and nothing on production
 * without credentials — then the Setup page keeps "we set it up with you".
 * A line that fails leaves its step and the provider's words on the row,
 * tells the workspace's bell and emails the platform; a retry resumes.
 */
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { notify, recordNotification } from "../../lib/notify.js";
import { emitEvent } from "../../lib/workspace/db.js";
import { formatPhoneDisplay } from "../../lib/workspace/contracts.js";
import { runLineSaga, isAreaCode, isE164, LINE_COSTS, type LineRow } from "../../lib/workspace/channels.js";
import { lineProviderFromEnv, linePorts, lineForClient, rowToLine, LINE_STEP_WORDS, type LineProviderChoice } from "../../lib/lines.js";
import { registerLine, syncRegistration, unfileMockRegistration, resubmitRejectedCampaign, campaignFactsFor } from "../../lib/a2p.js";
import { businessTypeOf, companyTypeOf, industryOf } from "../../lib/workspace/contracts.js";
import { dashboardOrigin } from "../../lib/billing.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/workspace/db.js";

interface Body {
  op?: string;
  tenant_id?: string;
  area_code?: number | string;
  number?: string;
  line_id?: string;
  /** The business on record, as the form sends it; validated field by field below. */
  record?: unknown;
  /** File against Twilio's free test registry instead of the carriers. */
  mock?: boolean;
  /** Replace a rehearsal filing with a real one. Refused on a real filing. */
  refile?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function areaCodeOf(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && /^\d{3}$/.test(v.trim())) return Number(v.trim());
  return null;
}

async function tenantOf(db: SupabaseClient<Database>, id: string) {
  const r = await db.from("tenants").select("id, name, slug").eq("id", id).maybeSingle();
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/** Run the saga on a row, then tell the workspace and the platform what happened. */
async function provision(
  db: SupabaseClient<Database>,
  choice: LineProviderChoice,
  cfg: { apiKey: string },
  secrets: { fnSecret: string },
  tenant: { id: string; name: string },
  line: LineRow,
) {
  const result = await runLineSaga(line, linePorts(db, cfg, secrets, tenant, line, choice));
  const shown = formatPhoneDisplay(result.line.e164) ?? result.line.e164 ?? "your number";
  if (result.ok) {
    await recordNotification(tenant.id, {
      kind: "number",
      title: `Your phone line is ready: ${shown}`,
      body: `The receptionist answers calls on ${shown}. Call it from your own phone to hear it; the Live page shows the call as it happens. Texting arrives once the carriers register the line.`,
      route: "admin/setup",
      about: { type: "line", id: line.id },
    });
    await emitEvent(db, tenant.id, "line.answering", "setup", "line", line.id, { e164: result.line.e164, provider: choice.name, agent_id: result.line.retell_agent_id }).catch(() => {});
  } else {
    const at = LINE_STEP_WORDS[result.step] ?? result.step;
    await recordNotification(tenant.id, {
      kind: "alert",
      title: "Your phone line hit a snag — a person at Chanlytics has it",
      body: `Setting up ${shown} stopped while ${at}. You can retry from Setup; we have been told and will finish it with you if the retry does not.`,
      route: "admin/setup",
      about: { type: "line", id: line.id },
    });
    await notify(
      { tenantId: null, notifications: null, isEnvDefault: true },
      {
        kind: "alert",
        subject: `Line failed · ${tenant.name}`,
        body: `${tenant.name} (${tenant.id}) — line ${line.id} for ${result.line.e164 ?? "no number"} stopped at step "${result.step}" (${at}).\n\n${result.error}\n\nRetry: POST /api/admin/lines { "op": "retry", "tenant_id": "${tenant.id}", "line_id": "${line.id}" } (x-diag-key).`,
      },
    );
    await emitEvent(db, tenant.id, "line.failed", "setup", "line", line.id, { step: result.step, error: result.error.slice(0, 300), provider: choice.name }).catch(() => {});
  }
  console.log("line_saga", JSON.stringify({ tenant: tenant.id, line: line.id, ok: result.ok, step: result.ok ? null : result.step, provider: choice.name }));
  return result;
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
  let body: Body = {};
  try { body = JSON.parse(await request.text()); } catch { /* validated below */ }
  const op = typeof body.op === "string" ? body.op : "";
  const choice = lineProviderFromEnv();

  if (op === "status") {
    return json(200, { ok: true, ready: !!choice, provider: choice?.name ?? null, costs: LINE_COSTS });
  }
  if (!choice) return json(503, { ok: false, error: "no_line_provider", hint: "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN, or LINES_DRY_RUN=1 outside production" });

  if (op === "search") {
    const areaCode = areaCodeOf(body.area_code);
    if (!isAreaCode(areaCode)) return json(400, { ok: false, error: "area_code must be three digits, like 305" });
    try {
      const numbers = await choice.provider.searchLocal(choice.master, { areaCode, limit: 8 });
      return json(200, { ok: true, provider: choice.name, area_code: areaCode, cost_month_usd: LINE_COSTS.local_number_month_usd, numbers });
    } catch (e) {
      return json(502, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Everything below writes: it needs the database, the receptionist's provider and a workspace.
  const apiKey = process.env.RETELL_API_KEY;
  const fnSecret = process.env.RETELL_FN_SECRET;
  if (!apiKey || !fnSecret) return json(503, { ok: false, error: !apiKey ? "no_provider_key" : "no_fn_secret" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
  if (!UUID.test(tenantId)) return json(400, { ok: false, error: "tenant_id (a workspace id) is required" });
  let tenant: { id: string; name: string; slug: string } | null;
  try { tenant = await tenantOf(db, tenantId); } catch (e) { return json(503, { ok: false, error: e instanceof Error ? e.message : String(e) }); }
  if (!tenant) return json(404, { ok: false, error: "no such workspace" });
  const cfg = { apiKey };
  const secrets = { fnSecret };

  if (op === "buy") {
    const number = typeof body.number === "string" ? body.number.trim() : "";
    if (!isE164(number)) return json(400, { ok: false, error: "number must be E.164, like +13055550100" });
    const areaCode = areaCodeOf(body.area_code) ?? (number.startsWith("+1") ? Number(number.slice(2, 5)) : null);
    const others = await db.from("lines").select("*").eq("tenant_id", tenantId).order("created_at");
    if (others.error) return json(503, { ok: false, error: others.error.message });
    const live = (others.data ?? []).find((l) => l.voice_state === "provisioning" || l.voice_state === "answering");
    if (live) return json(409, { ok: false, error: "line_exists", line: lineForClient(live) });
    const failed = (others.data ?? []).find((l) => l.voice_state === "failed");
    if (failed) return json(409, { ok: false, error: "line_failed_retry", line: lineForClient(failed) });
    const ins = await db
      .from("lines")
      .insert({ tenant_id: tenantId, e164: number, kind: "chanlytics", provider: choice.name, area_code: areaCode, voice_state: "provisioning", step: "subaccount", state_since: new Date().toISOString() })
      .select("*")
      .single();
    if (ins.error) return json(503, { ok: false, error: ins.error.message });
    const result = await provision(db, choice, cfg, secrets, tenant, rowToLine(ins.data));
    const after = await db.from("lines").select("*").eq("id", ins.data.id).single();
    return json(result.ok ? 200 : 502, { ok: result.ok, provider: choice.name, line: after.data ? lineForClient(after.data) : null, ...(result.ok ? {} : { step: result.step, error: result.error }) });
  }

  if (op === "retry" || op === "release") {
    const lineId = typeof body.line_id === "string" ? body.line_id.trim() : "";
    if (!UUID.test(lineId)) return json(400, { ok: false, error: "line_id is required" });
    const row = await db.from("lines").select("*").eq("id", lineId).eq("tenant_id", tenantId).maybeSingle();
    if (row.error) return json(503, { ok: false, error: row.error.message });
    if (!row.data) return json(404, { ok: false, error: "no such line" });

    if (op === "retry") {
      if (row.data.voice_state !== "failed") return json(409, { ok: false, error: `the line is ${row.data.voice_state}, not failed`, line: lineForClient(row.data) });
      const result = await provision(db, choice, cfg, secrets, tenant, rowToLine(row.data));
      const after = await db.from("lines").select("*").eq("id", lineId).single();
      return json(result.ok ? 200 : 502, { ok: result.ok, provider: choice.name, line: after.data ? lineForClient(after.data) : null, ...(result.ok ? {} : { step: result.step, error: result.error }) });
    }

    // release: give the number back, drop the trunk, forget the line; the
    // routing row it created is switched off, never deleted (calls keep their history).
    const line = rowToLine(row.data);
    const released: Record<string, unknown> = {};
    try {
      const creds = await db.rpc("get_line_credentials", { p_line_id: line.id });
      const token = creds.data && typeof creds.data === "object" && !Array.isArray(creds.data) ? (creds.data as { auth_token?: string }).auth_token : undefined;
      if (line.subaccount_sid && token) {
        const acct = { sid: line.subaccount_sid, token };
        if (line.number_sid) { await choice.provider.releaseNumber(acct, line.number_sid); released.number = line.number_sid; }
        if (line.trunk_sid) { await choice.provider.deleteTrunk(acct, line.trunk_sid); released.trunk = line.trunk_sid; }
      }
    } catch (e) {
      return json(502, { ok: false, error: `releasing at the provider: ${e instanceof Error ? e.message : String(e)}`, released });
    }
    if (typeof line.facts.channel_id === "string") {
      await db.from("tenant_channels").update({ status: "disabled" }).eq("id", line.facts.channel_id).eq("tenant_id", tenantId);
      released.channel_disabled = line.facts.channel_id;
    }
    const del = await db.from("lines").delete().eq("id", line.id);
    if (del.error) return json(503, { ok: false, error: del.error.message, released });
    await emitEvent(db, tenantId, "line.released", "setup", "line", line.id, { e164: line.e164, provider: choice.name, ...released }).catch(() => {});
    return json(200, { ok: true, released });
  }

  if (op === "record") {
    // The business on record: what every carrier registration asks, kept
    // once per workspace. Owners edit it through the dashboard's route;
    // this is the door that writes it.
    const b = body.record && typeof body.record === "object" ? (body.record as Record<string, unknown>) : null;
    if (!b) return json(400, { ok: false, error: "record is required" });
    const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");
    const need = ["legal_name", "street", "city", "region", "postal_code", "website_url", "contact_first_name", "contact_last_name", "contact_email", "contact_phone"];
    const missing = need.filter((k) => !str(k));
    if (missing.length) return json(400, { ok: false, error: `missing: ${missing.join(", ")}` });
    const row = {
      tenant_id: tenantId,
      legal_name: str("legal_name"),
      trade_name: str("trade_name") || null,
      ein: str("ein") || null,
      street: str("street"),
      street_secondary: str("street_secondary") || null,
      city: str("city"),
      region: str("region"),
      postal_code: str("postal_code"),
      country: str("country") || "US",
      website_url: str("website_url"),
      industry: industryOf(str("industry")),
      business_type: businessTypeOf(str("business_type")),
      company_type: companyTypeOf(str("company_type")),
      contact_first_name: str("contact_first_name"),
      contact_last_name: str("contact_last_name"),
      contact_email: str("contact_email"),
      contact_phone: str("contact_phone"),
      contact_title: str("contact_title") || "Owner",
      contact_job_position: str("contact_job_position") || "Director",
    };
    const up = await db.from("business_records").upsert(row, { onConflict: "tenant_id" }).select("*").single();
    if (up.error) return json(503, { ok: false, error: up.error.message });
    await emitEvent(db, tenantId, "business.recorded", "setup", "tenant", tenantId, { legal_name: row.legal_name, sole_proprietor: !row.ein }).catch(() => {});
    return json(200, { ok: true, record: { legal_name: up.data.legal_name, sole_proprietor: !up.data.ein, updated_at: up.data.updated_at } });
  }

  if (op === "register" || op === "registration-status") {
    const lineId = typeof body.line_id === "string" ? body.line_id.trim() : "";
    if (!UUID.test(lineId)) return json(400, { ok: false, error: "line_id is required" });
    const row = await db.from("lines").select("*").eq("id", lineId).eq("tenant_id", tenantId).maybeSingle();
    if (row.error) return json(503, { ok: false, error: row.error.message });
    if (!row.data) return json(404, { ok: false, error: "no such line" });

    if (op === "registration-status") {
      const r = await syncRegistration(db, row.data);
      // The campaign could not be filed while the carriers still had the
      // brand. Now that they are through with it, file it — this is what
      // makes "waiting on carriers" finish by itself.
      if (r.ok && r.brand === "APPROVED" && !row.data.campaign_sid) {
        const rec = await db.from("business_records").select("*").eq("tenant_id", tenantId).maybeSingle();
        const fresh = await db.from("lines").select("*").eq("id", lineId).single();
        if (rec.data && fresh.data) {
          const origin = dashboardOrigin();
          const filed = await registerLine(db, {
            line: fresh.data, record: rec.data, workspaceName: tenant.name,
            optInUrl: `${origin}/yes/${tenant.slug}`, privacyUrl: `${origin}/privacy`, termsUrl: `${origin}/terms`,
            mock: fresh.data.reg_mock,
          });
          return json(200, { ...r, campaign_filed: filed.ok, campaign_sid: filed.state.campaignSid, ...(filed.ok ? {} : { step: filed.step, error: filed.error }) });
        }
      }
      return json(r.ok ? 200 : 502, r);
    }

    const refile = body.refile === true;
    const rec = await db.from("business_records").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (rec.error) return json(503, { ok: false, error: rec.error.message });
    if (!rec.data) {
      await db.from("lines").update({ sms_state: "needs_record", state_since: new Date().toISOString() }).eq("id", lineId);
      return json(409, { ok: false, error: "no_business_record", hint: "op 'record' first" });
    }
    if (row.data.brand_sid && row.data.campaign_sid) {
      // A REAL filing is final here: it cost the workspace money, the carriers
      // vetted it, and re-filing would buy a second one. A MOCK filing is a
      // rehearsal against Twilio's test registry -- free, routes nothing, gone
      // in thirty days -- and the only way out of one used to be a 409 with no
      // next step, which is how a line sat looking registered while every text
      // it received was held for a person.
      // A campaign the carriers SENT BACK is the exception, and it has to be:
      // a rejection is a correction request, and refusing to re-send one means
      // a workspace whose filing was refused for a fixable reason -- a privacy
      // page missing its business address, a name that matched nothing -- can
      // never text at all. The first real filing this product made was
      // rejected on exactly that, twice over.
      //
      // The brand is kept: it was approved on its own, separately, and is the
      // expensive half. Only the campaign is replaced, which is what the
      // carriers actually refused.
      const rejected = row.data.sms_state === "rejected";
      if (!row.data.reg_mock && !rejected) {
        return json(409, { ok: false, error: "already_registered", brand_sid: row.data.brand_sid, campaign_sid: row.data.campaign_sid });
      }
      if (rejected && !refile) {
        return json(409, {
          ok: false,
          error: "campaign_rejected",
          hint: "the carriers sent this campaign back; correct what they named, then send refile: true to resubmit it (an edit, so no second vetting fee)",
          reason: row.data.last_error,
          brand_sid: row.data.brand_sid, campaign_sid: row.data.campaign_sid,
        });
      }
      if (!refile) {
        return json(409, {
          ok: false,
          error: "mock_registration",
          hint: "this line is registered against Twilio's test registry, which routes nothing; send refile: true to file a real one",
          brand_sid: row.data.brand_sid, campaign_sid: row.data.campaign_sid,
        });
      }
      if (rejected) {
        // CORRECTED IN PLACE, not replaced. Twilio assesses the campaign
        // vetting fee once per campaign, at its first vetting decision, so an
        // edit of the same QE resource costs nothing while a replacement is a
        // fresh $15. This path used to delete and re-file, which answered a
        // rejection by paying for it again -- every time, for every workspace.
        // The workspace's own name and slug, read HERE rather than reused from
        // the filing: a rejection is answered after the facts were corrected,
        // and those corrections are exactly what has to reach the carriers.
        const t = await db.from("tenants").select("name, slug").eq("id", tenantId).maybeSingle();
        if (!t.data) return json(503, { ok: false, error: "no_workspace" });
        const base = dashboardOrigin();
        const facts = campaignFactsFor({
          businessName: t.data.name,
          optInUrl: `${base}/yes/${t.data.slug}`,
          privacyUrl: `${base}/privacy`,
          termsUrl: `${base}/terms`,
        });
        const again = await resubmitRejectedCampaign(db, row.data, facts);
        if (!again.ok || !again.row) return json(502, { ok: false, error: again.error ?? "resubmit_failed" });
        const after = await db.from("lines").select("*").eq("id", lineId).single();
        return json(200, { ok: true, resubmitted: true, smsState: again.row.sms_state, line: after.data ? lineForClient(after.data) : null });
      }
      const off = await unfileMockRegistration(db, row.data);
      if (!off.ok || !off.row) return json(503, { ok: false, error: off.error ?? "unfile_failed" });
      row.data = off.row;
    }
    // A mock registration is Twilio's free test registry; the real one costs
    // the workspace money, so it is never the default.
    // Never the default: a real filing costs the workspace money. A refile is
    // always real -- there is no reason to replace one rehearsal with another.
    const mock = !refile && body.mock === true;
    const origin = dashboardOrigin();
    const result = await registerLine(db, {
      line: row.data,
      record: rec.data,
      workspaceName: tenant.name,
      optInUrl: `${origin}/yes/${tenant.slug}`,
      privacyUrl: `${origin}/privacy`,
      termsUrl: `${origin}/terms`,
      mock,
    });
    const after = await db.from("lines").select("*").eq("id", lineId).single();
    return json(result.ok ? 200 : 502, { ...result, mock, line: after.data ? lineForClient(after.data) : null });
  }

  return json(400, { ok: false, error: "op must be status, search, buy, retry, release, record, register or registration-status" });
}
