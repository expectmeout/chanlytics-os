import "server-only";
import { addressOf, callerName, type CallDto } from "@chanlytics/contracts";
import { CALL_COLUMNS, toCallDto } from "../dto";
import { stamp, type Reader, type RowRef } from "./index";

/**
 * GET calls, as the route answers it: the workspace's phone calls, newest
 * first, a hundred at most, narrowed to one thread, one lifecycle state or the
 * calls `ids` names when handed them (the route checks each is an id). The
 * recording's storage path and provider URL never leave the server
 * (CALL_COLUMNS, toCallDto). Each is a call a citation may name, by the caller
 * as the Calls page names them.
 */
export const calls: Reader<{ conversationId?: string; status?: string; ids?: string[] }, { calls: CallDto[] }> = {
  name: "calls",
  async read(rc, { conversationId, status, ids }) {
    const tenantId = rc.tenantId;
    let q = rc.ctx.supabase
      .from("calls")
      .select(CALL_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(100);
    if (conversationId) q = q.eq("conversation_id", conversationId);
    if (status) q = q.eq("status", status);
    if (ids) q = q.in("id", ids);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const calls: CallDto[] = (data ?? []).map(toCallDto);
    return {
      data: { calls },
      // The caller as the Calls page names them (callerName, the view model's own `who`): no view model per row.
      rows: calls.map((c): RowRef => ({
        kind: "call",
        id: c.id,
        route: addressOf({ kind: "call", id: c.id }),
        label: callerName(c),
      })),
      stamp: stamp(),
    };
  },
};
