import "server-only";
import { AppError, addressOf, callerName, personName, type CallDto } from "@chanlytics/contracts";
import { toCallDto } from "../conversations/dto";
import { requireUuid } from "../shared/request-guards";
import { readerStamp, type Reader, type RowRef } from "../shared/reader";
import { findCallRow } from "@chanlytics/db/voice";

/**
 * One phone call by id, as the Calls page maps a call (CALL_COLUMNS,
 * toCallDto: the recording's storage path and provider URL never leave the
 * server). No GET route answers one call as JSON, so this is the one source for
 * Ask's calls.get and, from Phase 2, the context plane's focus. Read under RLS
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
    const { data, error } = await findCallRow(rc.ctx.supabase, rc.tenantId, callId);
    if (error) throw new Error(error.message);
    if (!data) throw new AppError("not_found", "Call not found.", 404);
    const dto = toCallDto(data);
    const rows: RowRef[] = [
      { kind: "call", id: dto.id, route: addressOf({ kind: "call", id: dto.id }), label: callerName(dto) },
    ];
    if (dto.contact_id) {
      rows.push({
        kind: "person",
        id: dto.contact_id,
        route: addressOf({ kind: "person", id: dto.contact_id }),
        label: personName(dto.contact),
      });
    }
    return { data: { call: dto }, rows, stamp: readerStamp() };
  },
};
