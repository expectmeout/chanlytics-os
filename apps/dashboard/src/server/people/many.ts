/** The verbs on many people at once: their receptionist mode, a note appended to each, and their erasure. */
import { heldContactId, recordOrEmpty, DbFailure } from "@chanlytics/contracts";
import type { ContactId } from "@chanlytics/contracts";
import { NOTE_LINE_MAX, NOTE_REFUSALS, type PersonReceptionistMode } from "@chanlytics/contracts";
import { beginPeopleErasure } from "@chanlytics/db/erasure";
import { setPersonReplyMode } from "@chanlytics/db/workspace";
import type { RouteContext } from "@/server/shared/with-route";
import { recordDecision } from "@/server/shared/verbs";
import { NO_ADDRESS_TO_SORT } from "@/server/people/mailbox-senders";
import { addBulkNote, listPeopleWith } from "@chanlytics/db/people";
import type { TenantId } from "@chanlytics/contracts";

/**
 * The same change for many people at once, through the door each would go
 * through alone -- the pattern server/people/consent.ts set for a yes, applied to
 * the two other things a desk does to a selection: the receptionist's mode
 * and a note.
 *
 * The ids are read back under RLS and held to THIS workspace; an erased
 * person is not written on; what was not ours, or not there, comes back as
 * skipped rather than as a failure.
 */
interface ManyOutcome {
  done: number;
  failed: { id: string; message: string }[];
  skipped: string[];
}

async function ours<T extends { id: string; tenant_id: TenantId; erased_at: string | null }>(
  ctx: RouteContext,
  tenantId: TenantId,
  ids: ContactId[],
  columns: string,
): Promise<{ rows: T[]; skipped: string[] }> {
  const { data, error } = await listPeopleWith(ctx.supabase, ids, columns);
  if (error) throw new DbFailure(error);
  // The columns are the caller's, chosen at run time, past the client's typed parser: T is the columns it named.
  const rows = ((data ?? []) as unknown as T[]).filter((c) => c.tenant_id === tenantId && !c.erased_at);
  return { rows, skipped: ids.filter((id) => !rows.some((c) => c.id === id)) };
}

/**
 * The receptionist's mode for many: "auto" answers them, "ask" holds every
 * reply for a person, "never" stays out, "inherit" follows the workspace
 * again. The same policy row per person the single door writes
 * (setPersonReplyMode), and the same ledger verb with the mode in it.
 */
export async function setReceptionistMany(
  ctx: RouteContext,
  tenantId: TenantId,
  ids: string[],
  mode: PersonReceptionistMode,
): Promise<ManyOutcome> {
  const uniq = [...new Set(ids)].map(heldContactId);
  const { rows, skipped } = await ours<{ id: ContactId; tenant_id: TenantId; erased_at: string | null }>(
    ctx,
    tenantId,
    uniq,
    "id, tenant_id, erased_at",
  );
  const failed: ManyOutcome["failed"] = [];
  let done = 0;
  for (const row of rows) {
    try {
      await setPersonReplyMode(ctx.supabase, tenantId, row.id, mode === "inherit" ? null : mode);
    } catch (e) {
      failed.push({ id: row.id, message: e instanceof Error ? e.message : String(e) });
      continue;
    }
    await recordDecision(
      ctx,
      tenantId,
      "contact",
      row.id,
      mode === "auto" || mode === "inherit" ? "resume_agent" : "pause_agent",
      { receptionist_mode: mode, batch: uniq.length },
    );
    done += 1;
  }
  return { done, failed, skipped };
}

/**
 * One note on many people: "class of 12 Sep", "asked for the new stylist".
 * Each person gets it as a note of their own (0007), through the single door
 * a note on one person goes through (person_note_add, source bulk), dated and
 * signed by who wrote it. It used to be a line added under one field, and a
 * person whose field was full was refused.
 */
export async function appendNotesMany(
  ctx: RouteContext,
  tenantId: TenantId,
  ids: string[],
  line: string,
): Promise<ManyOutcome> {
  const uniq = [...new Set(ids)].map(heldContactId);
  const text = line.trim().slice(0, NOTE_LINE_MAX);
  const { rows, skipped } = await ours<{
    id: ContactId;
    tenant_id: TenantId;
    erased_at: string | null;
  }>(ctx, tenantId, uniq, "id, tenant_id, erased_at");
  const failed: ManyOutcome["failed"] = [];
  let done = 0;
  for (const row of rows) {
    const { data, error } = await addBulkNote(ctx.supabase, row.id, text);
    const refusal = recordOrEmpty(data).error;
    const refused = typeof refusal === "string" ? refusal : null;
    if (error || refused) {
      failed.push({ id: row.id, message: error?.message ?? NOTE_REFUSALS[refused ?? ""] ?? "Could not add the note." });
      continue;
    }
    done += 1;
  }
  return { done, failed, skipped };
}

/** Who a press handed the ledger, who it could not and why, and who was not ours to delete. */
interface ErasedMany {
  going: string[];
  failed: { id: string; message: string }[];
  skipped: string[];
}

/**
 * Many people deleted at one press (People's Delete…), however many: everyone named goes out of reach and onto the
 * ledger in one write (db legs.ts beginPeopleErasure), and the ledger erases them as Delete person erases one, paced so
 * nobody else's work waits behind them. The press does no erasing, so it cannot outrun anyone's wait, a tab closed
 * behind it loses nothing, and a press pressed again starts nothing beside the first. With `notAPersonToo`, each one's
 * address is said automated in the same write, the address alone: a selection is many senders, and a domain is many
 * people's. Someone with no address to say stays, and says why; an erased one, or another workspace's, is skipped. Each
 * list in the order they were picked.
 */
export async function eraseMany(
  ctx: RouteContext,
  tenantId: TenantId,
  ids: string[],
  notAPersonToo: boolean,
): Promise<ErasedMany> {
  const uniq = [...new Set(ids)];
  const { going, noAddress } = await beginPeopleErasure(ctx.supabase, {
    tenantId,
    ids: uniq,
    notAPerson: notAPersonToo,
  });
  const answered = new Set([...going, ...noAddress]);
  return {
    going,
    failed: noAddress.map((id) => ({ id, message: NO_ADDRESS_TO_SORT })),
    skipped: uniq.filter((id) => !answered.has(id)),
  };
}
