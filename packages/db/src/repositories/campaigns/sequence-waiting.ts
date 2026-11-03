/**
 * What a sequence's reads add of the emails waiting for an owner's OK (30 Oct 2026: an OK sent openings its owner never
 * read, and "Approve · 5 people" sent four): each batch to leads counted as what an OK sends, and each waiting or held
 * email's opening; and why a lead on a sequence's list is not planned (00533). Read off the sends, under the caller's row
 * security, as sequences.ts's readers are.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SequencePlaceDto, SequencePlaceOfDto, SequencePlaceRowDto, SequenceRowDto } from "@chanlytics/contracts";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** Sends read by id in one request at most: an `in` list this long stays well inside a URL. */
const SENDS_IN_CHUNK = 200;

/** How many of a batch's sends stand in one state. */
async function batchSendsIn(db: Db, tenantId: string, id: string, state: "planned" | "held"): Promise<number> {
  const { count, error } = await db
    .from("sequence_sends")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("batch_id", id)
    .eq("state", state);
  if (error) throw new Error(`cannot count the batch's emails: ${error.message}`);
  return count ?? 0;
}

/**
 * A batch to leads counted as the emails an OK sends: those planned, checked or being checked. One the check held waits
 * for its own answer, in Needs you, and an OK never sends it (30 Oct 2026: "Approve · 5 people" sent four); how many
 * were held rides beside the count, which Approve's ask on a lead's sheet says stay with you (3 Nov 2026). Its next and
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
  const held = new Map<string, number>();
  await Promise.all(
    ids.map(async (id) => {
      const [planned, kept] = await Promise.all([
        batchSendsIn(db, tenantId, id, "planned"),
        batchSendsIn(db, tenantId, id, "held"),
      ]);
      ready.set(id, planned);
      held.set(id, kept);
    }),
  );
  return rows.map((r) => {
    if (!(r.needs?.batches ?? []).some((b) => ready.has(b.id))) return r;
    const batches = r.needs.batches.map((b) =>
      ready.has(b.id) ? { ...b, people: ready.get(b.id) ?? b.people, held: held.get(b.id) ?? 0 } : b,
    );
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

/** A lead on a sequence's list, and the sequence whose list it is. */
interface Listed {
  lead_id: string;
  sequence_id: string;
}

/**
 * Why each lead on a sequence's list would not be planned by its next batch, by lead (00533 sequence_queued_why_not: the
 * door's one predicate, reach_out_why_not, at the list's own setting), none where its batch would take it. Asked only for
 * the leads on a list: the places' reads said "In its next batch" of a lead no batch could take (3 Nov 2026). A read that
 * fails, or a database before 00533, answers nothing, and the place stays as it was read.
 */
async function listedWhyNotOf(db: Db, tenantId: string, listed: readonly Listed[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (listed.length === 0) return out;
  const { data, error } = await db.rpc("sequence_queued_why_not", {
    p_tenant_id: tenantId,
    p_lead_ids: listed.map((l) => l.lead_id),
    p_sequence_ids: listed.map((l) => l.sequence_id),
  });
  if (error || !Array.isArray(data)) return out;
  for (const r of data) if (r && typeof r.why === "string" && r.why) out.set(r.lead_id, r.why);
  return out;
}

/** Many leads' places (sequence_places_of), each on a list and not planned with why no batch takes it, where one cannot. */
export async function withListedWhyNot(
  db: Db,
  tenantId: string,
  rows: SequencePlaceOfDto[],
): Promise<SequencePlaceOfDto[]> {
  const listed = rows
    .filter((r) => r.group === "queued")
    .map((r) => ({ lead_id: r.lead_id, sequence_id: r.sequence_id }));
  const why = await listedWhyNotOf(db, tenantId, listed);
  return why.size === 0
    ? rows
    : rows.map((r) => (r.group === "queued" ? { ...r, why: why.get(r.lead_id) ?? r.why } : r));
}

/** One lead's place (sequence_place), on a list and not planned, with why no batch takes it, where one cannot. */
export async function withPlaceWhyNot(
  db: Db,
  tenantId: string,
  leadId: string,
  place: SequencePlaceDto,
): Promise<SequencePlaceRowDto> {
  if (place.place.group !== "queued") return place.place;
  const why = await listedWhyNotOf(db, tenantId, [{ lead_id: leadId, sequence_id: place.sequence.id }]);
  return { ...place.place, why: why.get(leadId) ?? place.place.why };
}
