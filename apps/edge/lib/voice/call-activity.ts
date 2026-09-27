/**
 * A call in progress reaches the phones of the people who take calls as a Live Activity (the PRD, PR 7): every device
 * that handed the site its push-to-start token is started, once per call, with who is on the line. Decided over the
 * database it is given and a port for Apple's service, so a test runs the rule without either. Best effort: a phone
 * Apple refuses is named in the outcome, and one Apple calls gone is forgotten, never a reason to fail the call's own
 * door.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { activityTokensOf, callerNameOf, claimCallActivity, forgetActivityTokens } from "../packages/db.js";
import { CALL_ACTIVITY_ROLES, callActivityPropsOf, callActivityStart } from "../packages/contracts.js";
import type { ApnsPort } from "../ops/apns.js";

export interface CallForActivity {
  /** Our call's id and the person on it, as the call's row was filed (ingest_call). */
  call_id: string;
  contact_id: string | null;
  from_e164: string | null;
  from_raw: string | null;
  to_e164: string | null;
  started_at: string | null;
}

interface ActivityOutcome {
  started: number;
  refused: { token: string; error: string }[];
  /** Tokens Apple called gone, forgotten so no later call tries them. */
  gone: number;
  /** A redelivered call_started: another delivery already started it. */
  already: boolean;
}

const NO_ACTIVITY: ActivityOutcome = { started: 0, refused: [], gone: 0, already: false };

export async function tellPhonesCallStarted(
  db: SupabaseClient<Database>,
  tenantId: string,
  call: CallForActivity,
  port: ApnsPort | null,
  now: Date = new Date(),
): Promise<ActivityOutcome> {
  if (!port) return NO_ACTIVITY;
  const tokens = await activityTokensOf(db, tenantId, CALL_ACTIVITY_ROLES);
  if (!tokens.length) return NO_ACTIVITY;
  if (!(await claimCallActivity(db, tenantId, call.call_id))) return { ...NO_ACTIVITY, already: true };
  const name = call.contact_id ? await callerNameOf(db, tenantId, call.contact_id) : null;
  const sends = await port.startActivities(tokens, callActivityStart(callActivityPropsOf({ ...call, name }), now));
  const gone = sends.filter((s) => s.state === "gone").map((s) => s.token);
  await forgetActivityTokens(db, gone);
  return {
    started: sends.filter((s) => s.state === "started").length,
    refused: sends.flatMap((s) => (s.state === "refused" ? [{ token: s.token, error: s.error }] : [])),
    gone: gone.length,
    already: false,
  };
}
