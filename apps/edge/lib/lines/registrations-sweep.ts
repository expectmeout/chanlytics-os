/**
 * The registration sweep: every hour, every line whose registration is
 * still with the carriers is asked where it stands, and a campaign that
 * could not be filed while the brand was in progress is filed now.
 *
 * The route is api/cron/registrations.ts: sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and
 * checks the sweep key, then hands this its tick, so nothing below runs for a knock without the key.
 *
 * Without this, "waiting on carriers" was a state nothing ever left: the
 * campaign is only filed by a status check, and nothing was calling one.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps;
 * pg_cron calls this from the database (migration 00077).
 *
 * Cross-workspace: the registration sweep asks after every workspace's waiting lines; each write is keyed by the line's own row.
 */
import { json, refuse } from "../http.js";
import { dashboardOrigin } from "../dashboard-origin.js";
import { registerLine } from "./a2p-register.js";
import { filingPages, sweepFilingHold } from "./line-ops.js";
import { workspaceOpenToCustomers } from "../packages/db.js";
import { syncRegistration } from "./a2p-sync.js";
import type { SweepTick } from "../ops/sweep-door.js";

/** A bound per tick; a backlog drains over successive hours rather than one long call. */
const REGISTRATIONS_PER_TICK = 20;

/**
 * The states asked about: the two that mean the carriers still have it, and a refusal. A refused campaign is corrected
 * and resubmitted in Twilio's console as often as through this product, and the carriers' next verdict lands there and
 * nowhere else: asked only about the waiting states, the Chanlytics line read `rejected` for weeks after the console
 * resubmit was approved (5 Oct 2026), and its texting stayed off. A refused line is only READ here, and only while it
 * has a campaign on file, which is the one thing about it the carriers can change: one whose campaign was taken off
 * reads as a brand approved with nothing filed, which for a waiting line means "file it now", and a filing is a new
 * vetting fee that is its owner's to spend (the replace door), never the sweep's.
 */
const ASKED = ["registering", "approved", "rejected"];
export async function sweepRegistrations({ db, L }: SweepTick): Promise<Response> {
  // Every line the carriers still hold, LEAST RECENTLY ASKED ABOUT first, so a
  // backlog drains in order. BOTH waiting states: a line that reaches
  // "approved" is still waiting on the last check, and filtering on
  // "registering" alone meant it was never asked about again and could never
  // become active.
  //
  // On `updated_at` rather than `state_since`: a brand in review sits in one
  // state for days and `state_since` deliberately does not move until the
  // state does (Setup reads it to say how long the carriers have had it), so
  // ordering on it meant the same twenty rows held the page every hour and a
  // twenty-first line was never asked about at all. Every read of a line
  // writes the row, so `updated_at` is exactly "when we last asked".
  const { data: lines, error } = await db
    .from("lines")
    .select("*")
    .in("sms_state", ASKED)
    // A refused line, only with its campaign on file (above).
    .or("sms_state.neq.rejected,campaign_sid.not.is.null")
    .not("brand_sid", "is", null)
    .order("updated_at", { ascending: true })
    .limit(REGISTRATIONS_PER_TICK);
  if (error) return refuse(503, "read_failed", error.message);
  if (!lines?.length) return json(200, { ok: true, checked: 0 });

  const origin = dashboardOrigin();
  let filed = 0;
  let moved = 0;
  // Lines we could not ASK about, as opposed to lines the carriers have not
  // answered yet. The difference was invisible: a refused credential and a
  // brand still in review both left the row exactly as it was, so a sweep that
  // could see nothing looked identical to a quiet hour.
  let unreadable = 0;
  // Filings the owner's own rules hold back: a workspace paused, ended or not able to spend on texting (sweepFilingHold).
  let held = 0;
  for (const line of lines) {
    try {
      const r = await syncRegistration(db, line);
      if (!r.ok) {
        // We could not ask: the provider refused the credentials (the platform's, or the line's after a refresh), or
        // refused to give this line's subaccount at all, or the line has none on file. A provider that could not be
        // asked just now (unavailable) is not that: the next tick asks again.
        if (
          r.error === "provider_unauthorized" ||
          r.error === "provider_refused" ||
          r.error === "no_line_credentials"
        ) {
          unreadable++;
          L.error("registration_unreadable", { line_id: line.id, error: r.error, detail: r.detail });
        }
        continue;
      }
      // Moved means CHANGED. Counting "not registering any more" called a
      // line that has sat in the same state for a week a move, every hour.
      if (r.smsState !== line.sms_state) moved++;
      // The wait's own ending: the brand is through, so the campaign can go. Never for a refused line (ASKED).
      if (r.brand === "APPROVED" && !line.campaign_sid && line.sms_state !== "rejected") {
        // Asked first, as the owner's press asks it: nothing is filed, and nothing spent, for a workspace that is not
        // open to its customers or may not spend. The line goes to the back of the queue and is asked again next hour.
        const hold = sweepFilingHold(await workspaceOpenToCustomers(db, line.tenant_id));
        if (hold) {
          held++;
          L.info("registration_filing_held", { line_id: line.id, tenant_id: line.tenant_id, why: hold });
          continue;
        }
        const rec = await db.from("business_records").select("*").eq("tenant_id", line.tenant_id).maybeSingle();
        const tenant = await db.from("tenants").select("name, slug").eq("id", line.tenant_id).maybeSingle();
        const fresh = await db.from("lines").select("*").eq("id", line.id).maybeSingle();
        if (rec.data && tenant.data && fresh.data) {
          const out = await registerLine(db, {
            line: fresh.data,
            record: rec.data,
            workspaceName: tenant.data.name,
            ...filingPages(origin, tenant.data.slug),
            mock: fresh.data.reg_mock,
          });
          if (out.ok) filed++;
        }
      }
    } catch (e) {
      L.error("registration_sweep_line_failed", {
        line_id: line.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  L.info("registration_sweep", {
    checked: lines.length,
    campaigns_filed: filed,
    campaigns_held: held,
    states_moved: moved,
    unreadable,
  });
  // Every line unreadable means the sweep ran and learned nothing -- our
  // credentials, not the carriers. 503 so sweep_health turns this red and the
  // platform is told, instead of the sweep reporting a cheerful 200 for ever
  // while a registration stands still. Some lines readable is a 200: the ones
  // that failed carry their reason on the row.
  if (unreadable > 0 && unreadable === lines.length) {
    return json(503, { ok: false, error: "no_registration_readable", checked: lines.length, unreadable });
  }
  return json(200, { ok: true, checked: lines.length, campaigns_filed: filed, states_moved: moved, unreadable });
}
