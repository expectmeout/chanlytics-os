/**
 * Who is in a file, and each person's own yes (00691; the content loop PRD's 5.3 and call 13): the two presses behind
 * POST and PATCH files/[id]/people. Each goes through its door on the member's own session; what the door answers is
 * said in the owner's words.
 */
import "server-only";
import { AppError, FILE_WORDS, type FileYesUse, type SubjectLabel } from "@chanlytics/contracts";
import { listFileSubjects, nameFileSubjects, recordSubjectYes, type FileMemberRow } from "@chanlytics/db/files";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";

/** POST files/[id]/people: who is in it, or that nobody is, or that the owner is not sure. Answers the people now. */
export async function sayWhoIsInIt(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: {
    state: "named" | "none" | "unsure";
    people?: { name: string; label: SubjectLabel; contact_id?: string | null | undefined }[] | undefined;
  },
) {
  if (input.state === "named" && !input.people?.length) throw new AppError("validation", FILE_WORDS.people.nameSomeone);
  const kept = await nameFileSubjects(ctx.supabase, {
    tenantId: member.tenantId,
    fileId: row.id,
    state: input.state,
    people: (input.people ?? []).map((p) => ({ name: p.name, label: p.label, contact_id: p.contact_id ?? null })),
  });
  if (kept.fate === "gone") throw new AppError("not_found", FILE_WORDS.gone, 404);
  return { added: kept.added, people: await listFileSubjects(ctx.supabase, member.tenantId, row.id) };
}

/** PATCH files/[id]/people: one person's own yes, kept with where it was said. */
export async function keepPersonsYes(
  ctx: RouteContext,
  member: Member,
  input: {
    subject_id: string;
    uses: FileYesUse[];
    said_in: "ai" | "message" | "in_person";
    message_id?: string | undefined;
  },
) {
  const kept = await recordSubjectYes(ctx.supabase, {
    tenantId: member.tenantId,
    subjectId: input.subject_id,
    uses: input.uses,
    saidIn: input.said_in,
    evidence: input.message_id ? { message_id: input.message_id } : {},
  });
  if (kept.fate === "gone") throw new AppError("not_found", FILE_WORDS.gone, 404);
  return { kept: kept.kept };
}
