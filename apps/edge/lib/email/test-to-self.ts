/**
 * Send me a test (a sequence step's, the parity review's W5): a message's words mailed to the member who pressed it, at
 * their own sign-in address, and to nobody else. The dashboard says the words (contracts stepTestMail); this says who
 * reads them: the person the token names, where they belong to its workspace (db ownAddressIn), never an address a body
 * gives, so the door relays nothing. Member mail from the platform's sender (notify post), as the alert test is: no
 * customer's send door, no thread, no consent read. How often a member may ask is the dashboard route's.
 */
import { SEQUENCE_TEST_LIMITS, UUID } from "../packages/contracts.js";
import { ownAddressIn } from "../packages/db.js";
import { personFor, workspaceFor, type Admitted } from "../admin-auth.js";
import { json, refuse } from "../http.js";
import { errField, logger } from "../log.js";
import { platformFrom, post } from "../ops/notify.js";
import { pg } from "../pg.js";

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
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant", "tenant_id is required");
  const userId = personFor(auth, body.user_id);
  if (!userId) return refuse(400, "bad_request", "the person the test is for is required");
  const subject = bounded(body.subject, SEQUENCE_TEST_LIMITS.subject);
  const text = bounded(body.text, SEQUENCE_TEST_LIMITS.text);
  if (!subject || !text) return refuse(400, "bad_request", "a subject and words, within their limits");
  const from = platformFrom();
  if (!from) return refuse(503, "no_platform_mailbox");
  const L = logger({ tenant_id: tenantId });
  let to: string | null;
  try {
    to = await ownAddressIn(db, { tenantId, userId });
  } catch (e) {
    L.error("test_to_self_unreadable", { error: errField(e) });
    return refuse(503, "unavailable", "That didn't go through. Try again in a minute.");
  }
  if (!to) {
    L.info("test_to_self_unaddressed", {});
    return json(200, { ok: true, sent: false, why: "no_address" });
  }
  const sent = await post(from, [to], subject, text);
  L.info("test_to_self_sent", { sent });
  return json(sent ? 200 : 502, { ok: sent, sent, to });
}
