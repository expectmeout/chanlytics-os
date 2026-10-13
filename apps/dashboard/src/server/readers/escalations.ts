import "server-only";
import { HAND_BACK_REASONS, OPEN_HOLDS_READ_MAX, type EscalationDto } from "@chanlytics/contracts";
import { stamp, type Reader } from "./index";

/**
 * GET escalations, as the route answers it: the workspace's escalations in one state (the route's default is open),
 * newest first. Read in two halves under one table name, a hundred each: the holds that wait on a person (every reason
 * but a hand-back's), then those that wait on nobody (a customer's STOP, contracts HAND_BACK_REASONS). A workspace with
 * many legacy STOP holds left open (00409) had them crowd the oldest waiting customers out of a hundred read together,
 * and every count read from this dropped them (the wiring's second audit, S7-7). The complement is the waiting half, so a
 * reason added later is read as waiting, as contracts holdActOf counts it. None is a row of its own: an escalation is
 * cited by its thread.
 */
export const escalations: Reader<
  { state: string },
  { escalations: Array<EscalationDto & { conversation_id: string }> }
> = {
  name: "escalations",
  async read(rc, { state }) {
    const { supabase } = rc.ctx;
    const tenantId = rc.tenantId;
    const base = () =>
      supabase
        .from("escalations")
        .select("id, reason, details, state, created_at, conversation_id")
        .eq("tenant_id", tenantId)
        .eq("state", state);
    const [waiting, handBack] = await Promise.all([
      base()
        .not("reason", "in", `(${HAND_BACK_REASONS.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(OPEN_HOLDS_READ_MAX),
      base()
        .in("reason", [...HAND_BACK_REASONS])
        .order("created_at", { ascending: false })
        .limit(OPEN_HOLDS_READ_MAX),
    ]);
    if (waiting.error) throw new Error(waiting.error.message);
    if (handBack.error) throw new Error(handBack.error.message);
    // The column is text under a CHECK; the contract names the two states, so the client reads the enum, not a string.
    const escalations: Array<EscalationDto & { conversation_id: string }> = [
      ...(waiting.data ?? []),
      ...(handBack.data ?? []),
    ]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((e) => ({ ...e, state: e.state as EscalationDto["state"] }));
    return { data: { escalations }, rows: [], stamp: stamp() };
  },
};
