/**
 * Two mails to a workspace's own alert addresses that the dashboard asks for.
 *
 * POST /api/admin/you-are-live — the first run's Finish recorded a workspace's first activation of its calls, and its
 * owner is emailed that the receptionist is answering (the "you're live" email, decision 4 of
 * docs/superpowers/specs/2026-09-24-first-run-design.md; canvas C2).
 *
 * The door is api/admin/you-are-live.ts: it checks who may knock (authorizeAdmin) and reads the body, then hands this
 * the knock (`auth`) and what the body carried; everything after is here, in the order the door had it.
 *
 * The dashboard's capability route calls it once, on the first activation, from production only, and treats a failure
 * as a shrug: the activation is already on record. What it says is the workspace's own: its numbers, where a caller who
 * asks for a person goes, and its test call (who called and how long). Every sentence is contracts' (youAreLiveEmail).
 * Addressed to the workspace's alert addresses only (mail(): no bell row, and nothing to the platform when there are
 * none). Signed admin token only.
 */
import { json, refuse } from "../shared/http.js";
import { workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { pg } from "../shared/pg.js";
import { sendOpsMail, reachesTenant } from "../shared/alerts/notify.js";
import { loadTenantNotifications } from "../shared/tenant-runtime.js";
import { logger, errField, refuseFailure } from "../shared/log.js";
import { dashboardOrigin } from "../shared/dashboard-origin.js";
import {
  alertTestMail,
  appLink,
  parseTenantConfigResult,
  spokenDuration,
  youAreLiveEmail,
  recordOrNull,
  isTenantId,
} from "@chanlytics/contracts";
import { findConfigRow, findWorkspaceCard, findWorkspaceNamed } from "@chanlytics/db/workspace";
import { findChannelNumber } from "@chanlytics/db/channels";
import { findForwardedLine } from "@chanlytics/db/lines";
import { findLastAnsweredCall } from "@chanlytics/db/voice";

export async function sendYouAreLive(auth: Admitted, body: Partial<{ tenant_id?: string }>): Promise<Response> {
  const log = logger();
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = typeof ws.tenantId === "string" ? ws.tenantId.trim() : "";
  if (!isTenantId(tenantId)) return refuse(400, "bad_tenant", "tenant_id is required");

  const [tenant, voice, kept, cfg, call, whatsapp] = await Promise.all([
    findWorkspaceCard(db, tenantId),
    findChannelNumber(db, tenantId, "voice"),
    findForwardedLine(db, tenantId),
    findConfigRow(db, tenantId),
    findLastAnsweredCall(db, tenantId),
    // Going live is any channel (decision 0091): the WhatsApp number it answers, where one is connected.
    findChannelNumber(db, tenantId, "whatsapp"),
  ]);
  // A read that failed would send a thinner email that says less than is true: none is sent instead.
  const failed = [tenant, voice, kept, cfg, call, whatsapp].find((q) => q.error);
  if (failed?.error) return refuseFailure(503, "read_failed", failed.error);
  if (!tenant.data) return refuse(404, "not_found", "no such workspace");

  const target = { tenantId, ...(await loadTenantNotifications(db, tenantId)) };
  // Only the workspace's own people: without an address of theirs there is nobody to tell.
  if (!reachesTenant(target)) {
    log.info("you_are_live_unaddressed", { tenant_id: tenantId });
    return json(200, { ok: true, sent: false, why: "no_address" });
  }
  const parsed = parseTenantConfigResult(cfg.data?.config);
  const brain = parsed.ok ? parsed.config.brain : null;
  // The kept number is said only once a call proved its forwarding, and with the mode saved.
  const proven = kept.data?.forwarding_state === "verified";
  const facts = recordOrNull(kept.data?.facts);
  const message = youAreLiveEmail({
    business: brain?.business_name || tenant.data.name,
    own: voice.data?.number_e164 ?? null,
    kept: proven ? (kept.data?.e164 ?? null) : null,
    always: facts?.mode === "always",
    handoff: brain?.profile?.handoff_number ?? null,
    test: call.data
      ? {
          from: call.data.from_e164,
          length: call.data.duration_ms ? spokenDuration(call.data.duration_ms) : null,
        }
      : null,
    todayUrl: `${dashboardOrigin()}${appLink(tenant.data.slug, "today")}`,
    whatsapp: whatsapp.data?.number_e164 ?? null,
  });
  const sent = await sendOpsMail(target, message);
  log.info("you_are_live_sent", { tenant_id: tenantId, sent });
  return json(sent ? 200 : 502, { ok: sent, sent });
}

/**
 * POST /api/admin/email/alert-test — Settings › Notifications' "Send a test" (decision 0040): one email to every address
 * the workspace's alerts go to, so an owner knows each one arrives. A mistyped address otherwise loses every handoff,
 * and only the log would say so. The door is api/admin/email/alert-test.ts.
 *
 * Addressed as the first run's mail above is, through mail(): no bell row, no phone, and nothing to the platform when
 * the workspace has no address of its own (a test of nobody's address is not news to Chanlytics). A test is no kind of
 * notice, so nothing the business turned off by email holds it back. The words are contracts' (alertTestMail). How
 * often a workspace may ask is the dashboard route's (three an hour).
 */
export async function sendAlertTest(auth: Admitted, body: Partial<{ tenant_id?: string }>): Promise<Response> {
  const log = logger();
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = typeof ws.tenantId === "string" ? ws.tenantId.trim() : "";
  if (!isTenantId(tenantId)) return refuse(400, "bad_tenant", "tenant_id is required");

  const target = { tenantId, ...(await loadTenantNotifications(db, tenantId)) };
  const to = target.notifications?.escalation_emails ?? [];
  // Only the workspace's own addresses: a test that would reach the platform's instead is not sent.
  if (!reachesTenant(target) || !to.length) {
    log.info("alert_test_unaddressed", { tenant_id: tenantId });
    return json(200, { ok: true, sent: false, why: "no_address", to: 0 });
  }
  const named = await findWorkspaceNamed(db, tenantId).catch((e: unknown) => {
    log.warn("notify_link_unavailable", { tenant_id: tenantId, error: errField(e) });
    return null;
  });
  const message = alertTestMail({
    business: named?.name || "your business",
    // The workspace's own page (contracts appLink); with its address word unread, the front door with the route as a hash,
    // which the home carries to the workspace this browser used last. Never the origin and a path the app does not have.
    link: `${dashboardOrigin()}${appLink(named?.slug, "admin/notifications")}`,
  });
  const sent = await sendOpsMail(target, message);
  log.info("alert_test_sent", { tenant_id: tenantId, sent, to: to.length });
  return json(sent ? 200 : 502, { ok: sent, sent, to: to.length });
}
