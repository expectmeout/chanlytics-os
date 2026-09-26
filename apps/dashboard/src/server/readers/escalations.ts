import "server-only";
import type { EscalationDto } from "@chanlytics/contracts";
import { stamp, type Reader } from "./index";

/**
 * GET escalations, as the route answers it: the workspace's escalations in
 * one state (the route's default is open), newest first, a hundred at most.
 * None is a row of its own: an escalation is cited by its thread.
 */
export const escalations: Reader<
  { state: string },
  { escalations: Array<EscalationDto & { conversation_id: string }> }
> = {
  name: "escalations",
  async read(rc, { state }) {
    const { supabase } = rc.ctx;
    const tenantId = rc.tenantId;
    const { data, error } = await supabase
      .from("escalations")
      .select("id, reason, details, state, created_at, conversation_id")
      .eq("tenant_id", tenantId)
      .eq("state", state)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    // The column is text under a CHECK; the contract names the two states, so the client reads the enum, not a string.
    const escalations: Array<EscalationDto & { conversation_id: string }> = (data ?? []).map((e) => ({
      ...e,
      state: e.state as EscalationDto["state"],
    }));
    return { data: { escalations }, rows: [], stamp: stamp() };
  },
};
