import { AppError, NOTE_REFUSALS, type PersonNoteDto, type PersonNoteTeamDto } from "@chanlytics/contracts";
import type { RouteContext } from "@/server/with-route";

type NoteRow = {
  id: string;
  contact_id: string;
  body: string;
  author_kind: string;
  author_user_id: string | null;
  for_user_id: string | null;
  team_only: boolean;
  state: string;
  source: string;
  version: number;
  created_at: string;
  updated_at: string;
  due_on: string | null;
  done_at: string | null;
  done_by: string | null;
  deal_id: string | null;
};

const NOTE_COLUMNS =
  "id, contact_id, body, author_kind, author_user_id, for_user_id, team_only, state, source, version, created_at, updated_at, due_on, done_at, done_by, deal_id";

/** A stored note as the page reads it, with the names of who wrote it and who it is for (0007). */
export function toNoteDto(n: NoteRow, names: Map<string, string>, me: string): PersonNoteDto {
  return {
    id: n.id,
    body: n.body,
    author_kind: n.author_kind === "receptionist" ? "receptionist" : "member",
    author_name: n.author_user_id ? (names.get(n.author_user_id) ?? null) : null,
    mine: !!n.author_user_id && n.author_user_id === me,
    for_user_id: n.for_user_id,
    for_name: n.for_user_id ? (names.get(n.for_user_id) ?? null) : null,
    for_me: !!n.for_user_id && n.for_user_id === me,
    team_only: n.team_only,
    state: n.state === "suggested" ? "suggested" : "kept",
    source: (["page", "bulk", "moved", "call", "thread"] as const).find((s) => s === n.source) ?? "page",
    version: n.version,
    created_at: n.created_at,
    updated_at: n.updated_at,
    // A note with a day is a step (00166): its day, who did it and when, and the deal it moves.
    due_on: n.due_on ?? null,
    done_at: n.done_at ?? null,
    done_by_name: n.done_by ? (names.get(n.done_by) ?? null) : null,
    done_by_me: !!n.done_by && n.done_by === me,
    deal_id: n.deal_id ?? null,
  };
}

/** The team by name: who wrote a note and who it is for. A member without a name is called by their address's name. */
export async function teamNames(ctx: RouteContext, tenantId: string): Promise<PersonNoteTeamDto[] | null> {
  const { data, error } = await Promise.resolve()
    .then(() => ctx.supabase.rpc("team_roster", { p_tenant_id: tenantId }))
    .then(
      (r) => r,
      (e: unknown) => ({ data: null, error: { message: e instanceof Error ? e.message : String(e) } }),
    );
  if (error) return null;
  return ((data ?? []) as { member_user_id: string; display_name: string | null; email: string | null }[]).map((m) => ({
    id: m.member_user_id,
    name: (m.display_name ?? "").trim() || (m.email ?? "").split("@")[0] || "A teammate",
    me: m.member_user_id === ctx.userId,
  }));
}

/**
 * A person's notes and the team they can be for, for the person read. Never fatal: a database without the table
 * (a read before 00157) or a team that cannot be read costs the notes card, never the profile.
 */
export async function personNotesRead(
  ctx: RouteContext,
  tenantId: string,
  contactId: string,
): Promise<{ notes?: PersonNoteDto[]; team?: PersonNoteTeamDto[] }> {
  const [rows, team] = await Promise.all([
    Promise.resolve()
      .then(() =>
        ctx.supabase
          .from("person_notes")
          .select(NOTE_COLUMNS)
          .eq("tenant_id", tenantId)
          .eq("contact_id", contactId)
          .order("created_at", { ascending: false })
          .limit(200),
      )
      .then(
        (r) => r,
        (e: unknown) => ({ data: null, error: { message: e instanceof Error ? e.message : String(e) } }),
      ),
    teamNames(ctx, tenantId),
  ]);
  if (rows.error) {
    console.error("person_notes_read_failed", JSON.stringify({ contact: contactId, error: rows.error.message }));
    return team ? { team } : {};
  }
  const names = new Map((team ?? []).map((m) => [m.id, m.name]));
  return {
    notes: ((rows.data ?? []) as NoteRow[]).map((n) => toNoteDto(n, names, ctx.userId)),
    ...(team ? { team } : {}),
  };
}

/** The note a door acts on, read under RLS and on this person: a note on anyone else is a 404. */
export async function noteOn(ctx: RouteContext, contactId: string, noteId: string): Promise<NoteRow> {
  const { data, error } = await ctx.supabase
    .from("person_notes")
    .select(NOTE_COLUMNS)
    .eq("id", noteId)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AppError("not_found", NOTE_REFUSALS.not_found, 404);
  return data as NoteRow;
}

/**
 * A door's answer: the note it wrote, or the refusal in the owner's words. An answer this route does not know is
 * logged raw before the generic sentence, so a new refusal is found in the log rather than by its blandness.
 */
export function noteAnswer(
  door: string,
  data: unknown,
  error: { message: string } | null,
): { note?: NoteRow; removed?: string } {
  if (error) throw new AppError("validation", error.message);
  const r = (data ?? {}) as { error?: string; note?: NoteRow; removed?: string };
  if (r.note || r.removed) return { note: r.note, removed: r.removed };
  if (!(r.error && NOTE_REFUSALS[r.error])) {
    console.error("note_door_unknown_answer", JSON.stringify({ door, error: r.error ?? null }));
  }
  const status = r.error === "not_found" ? 404 : r.error === "not_yours" ? 403 : r.error === "moved" ? 409 : 400;
  throw new AppError(
    status === 404 ? "not_found" : status === 403 ? "forbidden" : status === 409 ? "conflict" : "validation",
    NOTE_REFUSALS[r.error ?? ""] ?? "Could not save this note.",
    status,
  );
}

/** The note a door wrote, as the page reads it: names come with the next read, so the writer's own is filled here. */
export function writtenNote(ctx: RouteContext, n: NoteRow, forName: string | null = null): PersonNoteDto {
  return toNoteDto(n, new Map(n.for_user_id && forName ? [[n.for_user_id, forName]] : []), ctx.userId);
}

/** Who a row's next step is for, by name and whether it is the reader (00166), from the team as a note's is. */
export function stepFor(
  row: { step_for_user_id?: string | null },
  team: PersonNoteTeamDto[] | null | undefined,
  me: string,
): { step_for_name?: string | null; step_for_me?: boolean } {
  const id = row.step_for_user_id;
  if (!id) return {};
  return { step_for_name: (team ?? []).find((m) => m.id === id)?.name ?? null, step_for_me: id === me };
}

/**
 * People's rows with who each next step is for: the team is read only when a step is for someone, alongside the
 * list's other reads, and answers a mapping the route lays over the rows. Never fatal: without the team a step names
 * no one.
 */
export async function stepNamer<R extends { step_for_user_id?: string | null }>(
  ctx: RouteContext,
  tenantId: string,
  rows: readonly R[],
): Promise<<T extends { step_for_user_id?: string | null }>(row: T) => T> {
  if (!rows.some((r) => r.step_for_user_id)) return (row) => row;
  const team = await teamNames(ctx, tenantId);
  return (row) => (row.step_for_user_id ? { ...row, ...stepFor(row, team, ctx.userId) } : row);
}
