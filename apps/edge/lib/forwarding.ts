/**
 * Keep my number, proven: a call that reaches the receptionist's line inside
 * a forwarded line's test window marks that line verified (the rule is
 * contracts/forwarding.ts forwardingMatch). Called from the call webhook on
 * every inbound delivery; idempotent — a verified line is left alone, and the
 * update is guarded on the state it expects.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./packages/db.js";
import { emitEvent } from "./packages/db.js";
import { forwardingMatch, formatPhoneDisplay, type ForwardingFacts } from "./packages/contracts.js";
import { recordNotification } from "./notify.js";
import { logger, errField } from "./log.js";

export interface ForwardingCall {
  fromE164: string | null;
  toE164: string | null;
  startedAtIso: string | null;
  callId: string;
}

export async function markForwardingVerified(db: SupabaseClient<Database>, tenantId: string, call: ForwardingCall): Promise<boolean> {
  const L = logger({ tenant: tenantId });
  try {
    const { data, error } = await db
      .from("lines")
      .select("id, e164, facts")
      .eq("tenant_id", tenantId)
      .eq("kind", "forwarded")
      .eq("forwarding_state", "instructed");
    if (error || !data?.length) return false;
    const now = new Date().toISOString();
    for (const row of data) {
      const facts = (row.facts && typeof row.facts === "object" && !Array.isArray(row.facts) ? row.facts : {}) as ForwardingFacts & Record<string, unknown>;
      if (!forwardingMatch(facts, call)) continue;
      const upd = await db
        .from("lines")
        .update({
          forwarding_state: "verified",
          state_since: now,
          facts: { ...facts, verified_at: now, verified_call_id: call.callId, verified_from: call.fromE164 } as unknown as Json,
        })
        .eq("id", row.id)
        .eq("forwarding_state", "instructed")
        .select("id");
      if (upd.error || !upd.data?.length) continue;
      const kept = formatPhoneDisplay(row.e164) ?? row.e164 ?? "your number";
      await recordNotification(tenantId, {
        kind: "number",
        title: `Forwarding works: calls to ${kept} reach your receptionist`,
        body: `Your test call came through. Calls to ${kept} that you don't pick up now reach the receptionist; Setup reads the number as kept.`,
        route: "admin/setup",
        about: { type: "line", id: row.id },
      });
      await emitEvent(db, tenantId, "line.forwarding_verified", "setup", "line", row.id, { from: call.fromE164, call_id: call.callId }).catch(() => {});
      L.info("forwarding_verified", { line: row.id, call: call.callId });
      return true;
    }
  } catch (e) {
    L.error("forwarding_verify_failed", { error: errField(e) });
  }
  return false;
}
