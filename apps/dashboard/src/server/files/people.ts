/**
 * Who is in a file, and each person's own yes (00682, 00683; the content loop PRD's 5.3 and call 13): the presses behind
 * POST, PUT and PATCH files/[id]/people, each through its door on the member's own session, with what the door answers
 * said in the owner's words; and who is in a piece as its sheet reads it (GET files/[id]).
 */
import "server-only";
import {
  AppError,
  FILE_WORDS,
  FILE_YES_USES,
  SUBJECT_LABELS,
  asContactId,
  isOneOf,
  recordOrEmpty,
  type FileYesUse,
  type PersonYesDto,
  type PiecePeopleDto,
  type PiecePersonDto,
  type SubjectLabel,
  type SubjectsState,
} from "@chanlytics/contracts";
import { findPersonsNewestConversation, listMessageWords, listPersonsWordsSince } from "@chanlytics/db/conversations";
import {
  listFileSubjects,
  listPiecePeople,
  listSubjectsStates,
  nameFileSubjects,
  recordSubjectAsk,
  recordSubjectNo,
  recordSubjectYes,
  takeBackSubjectYes,
  type FileMemberRow,
  type PiecePersonRow,
} from "@chanlytics/db/files";
import { replyChannelOf } from "@/server/shared/verbs";
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

/** PUT files/[id]/people: that the member sent a person the ask, on which channel and about which uses. */
export async function sayAsked(
  ctx: RouteContext,
  member: Member,
  input: { subject_id: string; via: string; uses: FileYesUse[] },
) {
  const kept = await recordSubjectAsk(ctx.supabase, {
    tenantId: member.tenantId,
    subjectId: input.subject_id,
    via: input.via,
    uses: input.uses,
  });
  if (kept.fate === "gone") throw new AppError("not_found", FILE_WORDS.gone, 404);
  return { asked: true };
}

/** PATCH files/[id]/people with `said: "no"`: the person said no, as the owner read their answer. */
export async function keepPersonsNo(ctx: RouteContext, member: Member, input: { subject_id: string }) {
  const kept = await recordSubjectNo(ctx.supabase, member.tenantId, input.subject_id);
  if (kept.fate === "gone") throw new AppError("not_found", FILE_WORDS.gone, 404);
  return { kept: 0 };
}

/** PATCH files/[id]/people with `said: "took_back"`: one person's own yes taken back, and what that starts. */
export async function takePersonsYesBack(
  ctx: RouteContext,
  member: Member,
  input: { subject_id: string; uses?: FileYesUse[] | undefined },
) {
  const back = await takeBackSubjectYes(ctx.supabase, {
    tenantId: member.tenantId,
    subjectId: input.subject_id,
    uses: input.uses?.length ? input.uses : null,
    held: null,
  });
  if (back.fate === "gone") throw new AppError("not_found", FILE_WORDS.gone, 404);
  return { kept: 0, held: back.held, down: back.down, ads: back.ads };
}

/** How much of a person's own words a line quotes. */
const QUOTE_CHARS = 200;
const quoteShort = (words: string): string => {
  const flat = words.trim().replace(/\s+/gu, " ");
  return flat.length > QUOTE_CHARS ? `${flat.slice(0, QUOTE_CHARS).trimEnd()}…` : flat;
};

const messageIdOf = (evidence: unknown): string | null => {
  const id = recordOrEmpty(evidence).message_id;
  return typeof id === "string" && id ? id : null;
};

/** A person's yeses that stand, the newest for each use, each with their own words where it was said in a message. */
function yesesOf(row: PiecePersonRow, quotes: ReadonlyMap<string, string>): PersonYesDto[] {
  return FILE_YES_USES.flatMap((use) => {
    const yes = row.consents.find((c) => c.use === use && !c.taken_back_at);
    if (!yes) return [];
    const words = quotes.get(messageIdOf(yes.evidence) ?? "");
    return [{ use, said_in: yes.said_in, at: yes.said_at, quote: words ? quoteShort(words) : null }];
  });
}

/** The uses a yes of theirs was taken back for and none stands since. */
function tookBackOf(row: PiecePersonRow, yes: readonly PersonYesDto[]): PiecePersonDto["took_back"] {
  return FILE_YES_USES.flatMap((use) => {
    const back = row.consents.find((c) => c.use === use && c.taken_back_at);
    return back?.taken_back_at && !yes.some((y) => y.use === use) ? [{ use, at: back.taken_back_at }] : [];
  });
}

/** One person as the sheet reads them: where an ask can go, what stands, and what they wrote since they were asked. */
async function piecePersonOf(
  ctx: RouteContext,
  member: Member,
  row: PiecePersonRow,
  quotes: ReadonlyMap<string, string>,
): Promise<PiecePersonDto> {
  const { subject } = row;
  const { tenantId } = member;
  const conversation = subject.contact_id
    ? await findPersonsNewestConversation(ctx.supabase, tenantId, asContactId(subject.contact_id))
    : null;
  const channel = conversation ? await replyChannelOf(ctx, { id: conversation, tenant_id: tenantId }) : null;
  const yes = yesesOf(row, quotes);
  const ask =
    subject.asked_at && subject.asked_via
      ? {
          at: subject.asked_at,
          via: subject.asked_via,
          uses: FILE_YES_USES.filter((use) => subject.asked_uses.includes(use)),
        }
      : null;
  // What they wrote since the ask is theirs to be read as a yes or a no, until one of the two is kept.
  const open = ask !== null && !subject.said_no_at && !yes.some((y) => y.at > ask.at);
  const wrote = open && conversation ? await listPersonsWordsSince(ctx.supabase, tenantId, conversation, ask.at) : [];
  const newest = wrote[0];
  return {
    id: subject.id,
    file_id: subject.file_id,
    name: subject.name,
    label: isOneOf(SUBJECT_LABELS, subject.label) ? subject.label : "other",
    contact_id: subject.contact_id,
    conversation: conversation && channel ? { id: conversation, channel } : null,
    yes,
    took_back: tookBackOf(row, yes),
    asked: ask,
    said_no_at: subject.said_no_at,
    answered: newest ? { at: newest.created_at, words: quoteShort(newest.body), message_id: newest.id } : null,
  };
}

/**
 * Whether a piece's people are known, across the piece and what it was drawn from: not sure in any of them is not sure;
 * anyone named is named; nobody in any of the files it shows is none; else nobody has said.
 */
function peopleStateOf(
  states: readonly { id: string; subjects_state: string; who_in_it: string }[],
  shows: readonly string[],
  named: number,
): SubjectsState {
  if (states.some((s) => s.subjects_state === "unsure")) return "unsure";
  if (named > 0) return "named";
  const none = (id: string) => {
    const state = states.find((s) => s.id === id);
    return state?.subjects_state === "none" || state?.who_in_it === "no_one";
  };
  return shows.length > 0 && shows.every(none) ? "none" : "not_asked";
}

/**
 * Who is in a piece (GET files/[id]): the people named in it and in each photo or clip it was drawn from, under the
 * member's own session. `drawnFrom` is those files' ids; a piece drawn from none shows what it is.
 */
export async function readPiecePeople(
  ctx: RouteContext,
  member: Member,
  piece: { id: string; drawnFrom: readonly string[] },
): Promise<PiecePeopleDto> {
  const fileIds = [piece.id, ...piece.drawnFrom];
  const [rows, states] = await Promise.all([
    listPiecePeople(ctx.supabase, member.tenantId, fileIds),
    listSubjectsStates(ctx.supabase, member.tenantId, fileIds),
  ]);
  const quotedIds = rows.flatMap((row) => row.consents.flatMap((c) => messageIdOf(c.evidence) ?? []));
  const words = await listMessageWords(ctx.supabase, member.tenantId, [...new Set(quotedIds)]);
  const quotes = new Map(words.map((m) => [m.id, m.body]));
  const people = await Promise.all(rows.map((row) => piecePersonOf(ctx, member, row, quotes)));
  return {
    state: peopleStateOf(states, piece.drawnFrom.length > 0 ? piece.drawnFrom : [piece.id], people.length),
    people,
  };
}
