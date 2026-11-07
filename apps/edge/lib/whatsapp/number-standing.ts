/**
 * What Meta holds about a connected WhatsApp number, read, kept, and told when it turns bad.
 *
 * `readAndKeepStanding` is what every reader calls: the connection (right after the line is written), the channel-quality
 * sweep (lib/whatsapp/number-quality.ts, each due number beside its rating, with the same token) and an owner's check from
 * Connections. It reads (numberStanding), keeps whole through the database's door (channel_keep_standing, 00338), and tells the
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
import { json, refuse } from "../shared/http.js";
import { workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { pg } from "../shared/pg.js";
import { keepChannelStanding, findWhatsappNumber, type WhatsappNumber } from "@chanlytics/db/jobs";
import type { Database } from "@chanlytics/db/types";
import { standingAlertWords, UUID, type NumberStanding } from "@chanlytics/contracts";
import { errField, logger, type Logger } from "../shared/log.js";
import { notify } from "../shared/alerts/notify.js";
import { getWaCredentialsForTenant } from "../shared/tenant-runtime.js";
import { getNumberStanding } from "./meta-graph.js";
import { NUM, findNotifications } from "./waba-events.js";

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
  read?: typeof getNumberStanding;
  tell?: typeof notify;
}

/** The number as a read needs it: the channel, Meta's ids and the number the alert names. */
type NumberAsked = Pick<WhatsappNumber, "tenant_id" | "channel_id" | "phone_number_id" | "waba_id" | "number_e164">;

/** The owner told, on the bell and by mail. True where the notice was handed on; a notice that could not be is a line, never a throw. */
async function tellBlocked(
  standingPorts: StandingPorts,
  numberAsked: NumberAsked,
  standing: NumberStanding,
): Promise<boolean> {
  try {
    const words = standingAlertWords(numberAsked.number_e164, standing);
    const target = {
      tenantId: numberAsked.tenant_id,
      notifications: await findNotifications(standingPorts.db, numberAsked.tenant_id),
      isEnvDefault: false,
    };
    // The notice is the bell row, kept first (the workspace's own record), and the owner's mail; notify answers whether the
    // mail went. The line says it, so a notice whose mail did not go is seen: the door has kept BLOCKED, and a later read
    // will not tell it again.
    const mailed = await (standingPorts.tell ?? notify)(
      target,
      { ...NUM, subject: words.subject, body: words.body },
      { db: standingPorts.db },
    );
    standingPorts.log.info("wa_standing_told", {
      tenant_id: numberAsked.tenant_id,
      channel_id: numberAsked.channel_id,
      mailed: mailed === true,
    });
    return true;
  } catch (e) {
    standingPorts.log.error("wa_standing_tell_failed", {
      tenant_id: numberAsked.tenant_id,
      channel_id: numberAsked.channel_id,
      error: errField(e),
    });
    return false;
  }
}

/** One number: Meta's answer, the door, and the owner's notice when it turned BLOCKED. Every failure is an outcome and a line. */
export async function readAndKeepStanding(
  standingPorts: StandingPorts,
  token: string,
  numberAsked: NumberAsked,
): Promise<StandingRead> {
  const read = standingPorts.read ?? getNumberStanding;
  try {
    const result = await read(token, numberAsked.phone_number_id, numberAsked.waba_id);
    if (!result.ok) {
      standingPorts.log.warn("wa_standing_read_failed", {
        tenant_id: numberAsked.tenant_id,
        channel_id: numberAsked.channel_id,
        status: result.status,
        code: result.code,
      });
      return { outcome: "unreadable", standing: null, told: false };
    }
    // What Meta answered, by its shape alone: the word for whether it may send and each problem's entity and code (never its
    // words, which name the number). The codes are what tells a calling problem from a messaging one once they are known
    // (contracts number-standing.ts CALLING_PROBLEM reads the words until then).
    standingPorts.log.info("wa_standing_read", {
      tenant_id: numberAsked.tenant_id,
      channel_id: numberAsked.channel_id,
      can_send: result.data.can_send,
      problems: result.data.problems.map((x) => `${x.entity}:${x.code ?? "none"}`),
    });
    const kept = await keepChannelStanding(
      standingPorts.db,
      numberAsked.tenant_id,
      numberAsked.channel_id,
      result.data,
    );
    const turned = (kept === "first" || kept === "changed") && result.data.can_send === "BLOCKED";
    return {
      outcome: kept,
      standing: result.data,
      told: turned ? await tellBlocked(standingPorts, numberAsked, result.data) : false,
    };
  } catch (e) {
    standingPorts.log.error("wa_standing_keep_failed", {
      tenant_id: numberAsked.tenant_id,
      channel_id: numberAsked.channel_id,
      error: errField(e),
    });
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
    number = await findWhatsappNumber(db, tenantId);
  } catch (e) {
    return refuse(503, "channel_read_failed", errField(e));
  }
  if (!number) return refuse(409, "no_channel");
  const creds = await getWaCredentialsForTenant(db, tenantId);
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
