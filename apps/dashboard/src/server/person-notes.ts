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
};

const NOTE_COLUMNS =
  "id, contact_id, body, author_kind, author_user_id, for_user_id, team_only, state, source, version, created_at, updated_at";

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
  };
}

/** The team by name: who wrote a note and who it is for. A member without a name is called by their address's name. */
async function teamNames(ctx: RouteContext, tenantId: string): Promise<PersonNoteTeamDto[] | null> {
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
