/**
 * Send me a test (a sequence step's, the parity review's W5): a message's words mailed to the member who pressed it, at
 * their own sign-in address, and to nobody else. The dashboard says the words (contracts stepTestMail); this says who
 * reads them: the person the token names, where they belong to its workspace (db findOwnAddressIn), never an address a body
 * gives, so the door relays nothing. Member mail from the platform's sender (notify post), as the alert test is: no
 * customer's send door, no thread, no consent read. How often a member may ask is the dashboard route's.
 */
import { SEQUENCE_TEST_LIMITS, TRY_AGAIN_IN_A_MINUTE, isTenantId } from "@chanlytics/contracts";
import { findOwnAddressIn } from "@chanlytics/db/notices";
import { personFor, workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { json, refuse } from "../shared/http.js";
import { errField, logger } from "../shared/log.js";
import { platformFrom, post } from "../shared/alerts/notify.js";
import { pg } from "../shared/pg.js";

/** Words within their bounds, trimmed, or null. */
const bounded = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s && s.length <= max ? s : null;
};

export async function sendTestToSelf(
  auth: Admitted,
  body: Partial<{ tenant_id: string; user_id: string; subject: string; text: string }>,
): Promise<Response> {
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId?.trim() ?? "";
  if (!isTenantId(tenantId)) return refuse(400, "bad_tenant", "tenant_id is required");
  const userId = personFor(auth, body.user_id);
  if (!userId) return refuse(400, "bad_request", "the person the test is for is required");
  const subject = bounded(body.subject, SEQUENCE_TEST_LIMITS.subject);
  const text = bounded(body.text, SEQUENCE_TEST_LIMITS.text);
  if (!subject || !text) return refuse(400, "bad_request", "a subject and words, within their limits");
  const from = platformFrom();
  if (!from) return refuse(503, "no_platform_mailbox");
  const log = logger({ tenant_id: tenantId });
  let to: string | null;
  try {
    to = await findOwnAddressIn(db, { tenantId, userId });
  } catch (e) {
    log.error("test_to_self_unreadable", { error: errField(e) });
    return refuse(503, "unavailable", TRY_AGAIN_IN_A_MINUTE);
  }
  if (!to) {
    log.info("test_to_self_unaddressed", {});
    return json(200, { ok: true, sent: false, why: "no_address" });
  }
  const sent = await post(from, [to], subject, text);
  log.info("test_to_self_sent", { sent });
  return json(sent ? 200 : 502, { ok: sent, sent, to });
}
