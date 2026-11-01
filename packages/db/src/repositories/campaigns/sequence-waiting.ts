/**
 * What a sequence's reads add of the emails waiting for an owner's OK (30 Oct 2026: an OK sent openings its owner never
 * read, and "Approve · 5 people" sent four): each batch to leads counted as what an OK sends, and each waiting or held
 * email's opening. Read off the sends, under the caller's row security, as sequences.ts's readers are.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SequencePlaceDto, SequenceRowDto } from "@chanlytics/contracts";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** Sends read by id in one request at most: an `in` list this long stays well inside a URL. */
const SENDS_IN_CHUNK = 200;

/**
 * A batch to leads counted as the emails an OK sends: those planned, checked or being checked. One the check held waits
 * for its own answer, in Needs you, and an OK never sends it (30 Oct 2026: "Approve · 5 people" sent four). Its next and
 * the sequence's waiting people follow; a customer's batch is counted as the read counts it.
 */
export async function withReadyCounts(db: Db, tenantId: string, rows: SequenceRowDto[]): Promise<SequenceRowDto[]> {
  const ids = [
    ...new Set(
      rows.flatMap((r) => (r.needs?.batches ?? []).filter((b) => b.audience?.kind === "reach_out").map((b) => b.id)),
    ),
  ];
  if (ids.length === 0) return rows;
  const ready = new Map<string, number>();
  await Promise.all(
    ids.map(async (id) => {
      const { count, error } = await db
        .from("sequence_sends")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("batch_id", id)
        .eq("state", "planned");
      if (error) throw new Error(`cannot count the batch's emails: ${error.message}`);
      ready.set(id, count ?? 0);
    }),
  );
  return rows.map((r) => {
    if (!(r.needs?.batches ?? []).some((b) => ready.has(b.id))) return r;
    const batches = r.needs.batches.map((b) => ({ ...b, people: ready.get(b.id) ?? b.people }));
    const next = r.next && ready.has(r.next.id) ? { ...r.next, people: ready.get(r.next.id) ?? r.next.people } : r.next;
    return {
      ...r,
      next,
      needs: { ...r.needs, batches, waiting_people: batches.reduce((n, b) => n + b.people, 0) },
    };
  });
}

/** The rows whose email is read before it goes: waiting for an OK, or held by the check. */
const READ_BEFORE_IT_GOES: ReadonlySet<string> = new Set(["waiting", "held"]);

/**
 * Each email waiting for an OK or held, with the opening its send goes with and whether the check has read it (30 Oct
 * 2026: an OK sent openings its owner never read): read off the sends, this workspace's alone. One the read cannot find
 * is said as not written yet, never as another's words.
 */
export async function withOpenings<R extends { group: string; send_id: string | null }>(
  db: Db,
  tenantId: string,
  rows: R[],
): Promise<R[]> {
  const ids = rows.filter((r) => READ_BEFORE_IT_GOES.has(r.group) && r.send_id).map((r) => r.send_id ?? "");
  if (ids.length === 0) return rows;
  const found = new Map<string, { opening: string | null; checked: boolean }>();
  for (let j = 0; j < ids.length; j += SENDS_IN_CHUNK) {
    const sends = await db
      .from("sequence_sends")
      .select("id, opening, checked_at")
      .eq("tenant_id", tenantId)
      .in("id", ids.slice(j, j + SENDS_IN_CHUNK));
    if (sends.error) throw new Error(`cannot read the emails' openings: ${sends.error.message}`);
    for (const s of sends.data ?? []) found.set(s.id, { opening: s.opening, checked: s.checked_at !== null });
  }
  return rows.map((r) =>
    READ_BEFORE_IT_GOES.has(r.group) && r.send_id
      ? { ...r, ...(found.get(r.send_id) ?? { opening: null, checked: false }) }
      : r,
  );
}

/**
 * The leave Put back would undo for one lead (00450 sequence_return): the latest of its sequence that names their place,
 * where it took this lead alone out, so the press brings back nobody else, and nothing ever went to them; and where their
 * place still stands out for that leave's reason, which a Put back already pressed changes. None otherwise: a business
 * that was written to stays as it is. Read off the decision the leave wrote, under the caller's row security.
 */
export async function putBackOf(
  db: Db,
  tenantId: string,
  place: SequencePlaceDto,
): Promise<{ decision_id: string } | null> {
  const id = place.place.enrollment_id;
  if (place.place.group !== "left" || !id || place.sends.some((s) => s.sent_at)) return null;
  const { data, error } = await db
    .from("decisions")
    .select("id, payload")
    .eq("tenant_id", tenantId)
    .eq("verb", "leave_sequence")
    .eq("subject_type", "sequence")
    .eq("subject_id", place.sequence.id)
    .contains("payload", { put_back: { places: [{ id }] } })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`cannot read the leave to put back: ${error.message}`);
  const [leave] = data ?? [];
  const said = leave ? (leave.payload as { left?: unknown; put_back?: { why?: unknown } } | null) : null;
  return leave && said && said.left === 1 && said.put_back?.why === place.place.why ? { decision_id: leave.id } : null;
}
