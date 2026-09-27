/**
 * A call in progress reaches the phones of the workspace's people as a Live Activity (the PRD, PR 7): every device
 * that handed the site its push-to-start token is started, once, with who is on the line. Decided over the database
 * it is given and a port for Apple's service, so a test runs the rule without either. Best effort: a phone Apple
 * refuses is named in the outcome, never a reason to fail the call's own door.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { callActivityPropsOf, callActivityStart } from "../packages/contracts.js";
import type { ApnsPort } from "../ops/apns.js";

export interface CallForActivity {
  from_e164: string | null;
  from_raw: string | null;
  to_e164: string | null;
  started_at: string | null;
  who?: string | null;
}

export interface ActivityOutcome {
  started: number;
  refused: { token: string; error: string }[];
}

export async function tellPhonesCallStarted(
  db: SupabaseClient<Database>,
  tenantId: string,
  call: CallForActivity,
  port: ApnsPort | null,
  now: Date = new Date(),
): Promise<ActivityOutcome> {
  if (!port) return { started: 0, refused: [] };
  const { data: members, error: me } = await db.from("memberships").select("user_id").eq("tenant_id", tenantId);
  if (me) throw new Error(`call_activity: cannot read who is in the workspace: ${me.message}`);
  const readers = (members ?? []).map((m) => m.user_id);
  if (!readers.length) return { started: 0, refused: [] };
  const { data: devices, error: de } = await db
    .from("push_devices")
    .select("activity_token")
    .in("user_id", readers)
    .not("activity_token", "is", null);
  if (de) throw new Error(`call_activity: cannot read the phones: ${de.message}`);
  const tokens = [...new Set((devices ?? []).map((d) => d.activity_token).filter((t): t is string => !!t))];
  const payload = callActivityStart(callActivityPropsOf(call), now);
  const out: ActivityOutcome = { started: 0, refused: [] };
  for (const token of tokens) {
    try {
      await port.startActivity(token, payload);
      out.started += 1;
    } catch (e) {
      out.refused.push({ token, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
