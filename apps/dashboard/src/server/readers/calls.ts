import "server-only";
import { toCallVM, type CallDto } from "@chanlytics/contracts";
import { CALL_COLUMNS, toCallDto } from "../dto";
import { stamp, type Reader, type RowRef } from "./index";

/**
 * GET calls, as the route answers it: the workspace's phone calls, newest
 * first, a hundred at most, narrowed to one thread or one lifecycle state when
 * handed one (the route checks the thread is an id). The recording's storage
 * path and provider URL never leave the server (CALL_COLUMNS, toCallDto). Each
 * is a call a citation may name, by the caller as the Calls page names them.
 */
export const calls: Reader<{ conversationId?: string; status?: string }, { calls: CallDto[] }> = {
  name: "calls",
  async read(rc, { conversationId, status }) {
    const tenantId = rc.tenantId;
    let q = rc.ctx.supabase
      .from("calls")
      .select(CALL_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(100);
    if (conversationId) q = q.eq("conversation_id", conversationId);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const calls: CallDto[] = (data ?? []).map(toCallDto);
    return {
      data: { calls },
      // The caller as the Calls page names them: its own view model's `who`, which no zone or clock reaches.
      rows: calls.map((c): RowRef => ({
        kind: "call",
        id: c.id,
        route: `conversations/cv-${c.id}`,
        label: toCallVM(c, "UTC", rc.now).who,
      })),
      stamp: stamp(),
    };
  },
};
