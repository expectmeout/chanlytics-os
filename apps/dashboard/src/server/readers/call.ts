import "server-only";
import { AppError, callerName, personName, type CallDto } from "@chanlytics/contracts";
import { CALL_COLUMNS, toCallDto } from "../dto";
import { requireUuid } from "../request-guards";
import { stamp, type Reader, type RowRef } from "./index";

/**
 * One phone call by id, as the Calls page maps a call (CALL_COLUMNS,
 * toCallDto: the recording's storage path and provider URL never leave the
 * server). No GET route answers one call as JSON, so this is the one source for
 * Ask's get_call and, from Phase 2, the context plane's focus. Read under RLS
 * and the workspace's own filter: RLS would show a member of two workspaces the
 * other's calls, and a turn reads its own. A call not here is the 404 the
 * call's routes answer, in their words, and an id that cannot be one never
 * reaches the database. The call is a row a citation may name, by the caller as
 * the Calls page names them, and so is the person it was with, when it was with
 * someone.
 */
export const call: Reader<{ id: string }, { call: CallDto }> = {
  name: "call",
  async read(rc, { id }) {
    const callId = requireUuid(id, "call");
    const { data, error } = await rc.ctx.supabase
      .from("calls")
      .select(CALL_COLUMNS)
      .eq("tenant_id", rc.tenantId)
      .eq("id", callId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new AppError("not_found", "Call not found.", 404);
    const dto = toCallDto(data);
    const rows: RowRef[] = [{ kind: "call", id: dto.id, route: `conversations/cv-${dto.id}`, label: callerName(dto) }];
    if (dto.contact_id) {
      rows.push({
        kind: "person",
        id: dto.contact_id,
        route: `clients/${dto.contact_id}`,
        label: personName(dto.contact),
      });
    }
    return { data: { call: dto }, rows, stamp: stamp() };
  },
};
