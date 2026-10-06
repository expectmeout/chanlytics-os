/**
 * What Meta holds about a connected WhatsApp number, read, kept, and told when it turns bad.
 *
 * `readAndKeepStanding` is what every reader calls: the connection (right after the line is written), the channel-quality
 * sweep (lib/whatsapp/number-quality.ts, each due number beside its rating, with the same token) and an owner's check from
 * Connections. It reads (numberStanding), keeps whole through the database's door (channel_keep_standing, 00330), and tells the
 * owner ONCE when the number turns BLOCKED: the door's `first` or `changed` with a BLOCKED word, never `same`, so a number
 * that stays blocked is not said every six hours. The notice is the one the webhook's restricted-account alert is (waba-events
 * `NUM`, `notify`: the bell row and the owner's mail), in contracts' words (standingAlertWords).
 *
 * It never throws. A Graph refusal, a database that will not keep the standing and a notice that could not be sent are each an
 * outcome and a line (`wa_standing_read_failed`, `wa_standing_keep_failed`, `wa_standing_tell_failed`; `wa_standing_told` when
 * the owner was told). A line carries the workspace and the channel by id, Meta's answer by its status and code, and never a
 * token, a number or Meta's own words (they often name the number asked about, as the quality sweep's do not either).
 *
 * `checkNumberStanding` is the owner's check from Connections (POST /api/admin/whatsapp/standing): the workspace's active
 * number, its own token, and this reading.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { json, refuse } from "../http.js";
import { workspaceFor, type Admitted } from "../admin-auth.js";
import { pg } from "../pg.js";
import { keepChannelStanding, whatsappNumberOf, type Database, type WhatsappNumber } from "../packages/db.js";
import { standingAlertWords, UUID, type NumberStanding } from "../packages/contracts.js";
import { errField, logger, type Logger } from "../log.js";
import { notify } from "../ops/notify.js";
import { waCredentialsForTenant } from "../tenant-runtime.js";
import { numberStanding } from "./meta-graph.js";
import { NUM, notificationsFor } from "./waba-events.js";

/** What one read came to: the door's own answer when the standing was kept, else that it could not be. */
export type StandingOutcome = "first" | "changed" | "same" | "gone" | "unreadable";

/** What one read did: the outcome, the standing it kept (null when it kept none), and whether the owner was told. */
interface StandingRead {
  outcome: StandingOutcome;
  standing: NumberStanding | null;
  told: boolean;
}

interface StandingPorts {
  db: SupabaseClient<Database>;
  log: Logger;
  /** Meta's read, and the owner's notice: the real ones unless a test hands others. */
  read?: typeof numberStanding;
  tell?: typeof notify;
}

/** The number as a read needs it: the channel, Meta's ids and the number the alert names. */
type NumberAsked = Pick<WhatsappNumber, "tenant_id" | "channel_id" | "phone_number_id" | "waba_id" | "number_e164">;

/** The owner told, on the bell and by mail. True where the notice was handed on; a notice that could not be is a line, never a throw. */
async function tellBlocked(p: StandingPorts, n: NumberAsked, standing: NumberStanding): Promise<boolean> {
  try {
    const words = standingAlertWords(n.number_e164, standing);
    const target = {
      tenantId: n.tenant_id,
      notifications: await notificationsFor(p.db, n.tenant_id),
      isEnvDefault: false,
    };
    await (p.tell ?? notify)(target, { ...NUM, subject: words.subject, body: words.body }, { db: p.db });
    p.log.info("wa_standing_told", { tenant_id: n.tenant_id, channel_id: n.channel_id });
    return true;
  } catch (e) {
    p.log.error("wa_standing_tell_failed", { tenant_id: n.tenant_id, channel_id: n.channel_id, error: errField(e) });
    return false;
  }
}

/** One number: Meta's answer, the door, and the owner's notice when it turned BLOCKED. Every failure is an outcome and a line. */
export async function readAndKeepStanding(p: StandingPorts, token: string, n: NumberAsked): Promise<StandingRead> {
  const read = p.read ?? numberStanding;
  try {
    const got = await read(token, n.phone_number_id, n.waba_id);
    if (!got.ok) {
      p.log.warn("wa_standing_read_failed", {
        tenant_id: n.tenant_id,
        channel_id: n.channel_id,
        status: got.status,
        code: got.code,
      });
      return { outcome: "unreadable", standing: null, told: false };
    }
    const kept = await keepChannelStanding(p.db, n.tenant_id, n.channel_id, got.data);
    const turned = (kept === "first" || kept === "changed") && got.data.can_send === "BLOCKED";
    return { outcome: kept, standing: got.data, told: turned ? await tellBlocked(p, n, got.data) : false };
  } catch (e) {
    p.log.error("wa_standing_keep_failed", { tenant_id: n.tenant_id, channel_id: n.channel_id, error: errField(e) });
    return { outcome: "unreadable", standing: null, told: false };
  }
}

/**
 * POST /api/admin/whatsapp/standing: an owner asks what Meta holds about the workspace's number now. The door is the knock
 * (authorizeAdmin) and the body (readBody); this is the rest: the workspace's active WhatsApp number, its own credentials,
 * and the one reading every caller makes. Refused as the template doors refuse: no number is 409 no_channel (a channel
 * switched off while the read was out too), no credentials 503 no_token, Meta not answering 502 meta_failed; answered
 * { ok, kept, can_send } and nothing of Meta's words.
 */
export async function checkNumberStanding(auth: Admitted, body: Partial<{ tenant_id?: unknown }>): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  let number: WhatsappNumber | null;
  try {
    number = await whatsappNumberOf(db, tenantId);
  } catch (e) {
    return refuse(503, "channel_read_failed", errField(e));
  }
  if (!number) return refuse(409, "no_channel");
  const creds = await waCredentialsForTenant(db, tenantId);
  // None on file, or none readable just now: a 503 either way, since this door is tried again by hand.
  if (creds.outcome !== "present") return refuse(503, "no_token");
  const read = await readAndKeepStanding(
    { db, log: logger({ tenant_id: tenantId }) },
    creds.credentials.accessToken,
    number,
  );
  if (read.outcome === "unreadable") return refuse(502, "meta_failed");
  if (read.outcome === "gone") return refuse(409, "no_channel");
  return json(200, { ok: true, kept: read.outcome, can_send: read.standing?.can_send ?? null });
}
