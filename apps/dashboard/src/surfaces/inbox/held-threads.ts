/**
 * The threads of open holds past the newest hundred, read by their ids in one read (contracts heldThreadIds: the holds
 * that wait on a person first). The Inbox reads them and Today reads them, the same ids in the same order, so the
 * client's read-sharing makes the two one read, and both judge every hold by its own thread (the wiring's second audit,
 * S7-7). Null where the read failed: each hold it asked for then counts as waiting (unknown is not handled).
 */
import { HELD_BY_ID_MAX, type ConversationDto } from "@chanlytics/contracts";
import { read } from "@/legacy-bridge/api";

export async function readHeldThreads(ids: readonly string[]): Promise<ConversationDto[] | null> {
  if (!ids.length) return [];
  return read("GET conversations", { query: { ids: ids.slice(0, HELD_BY_ID_MAX).join(",") } }).then(
    (d): ConversationDto[] => d.conversations,
    () => null,
  );
}
