/**
 * The people in a file and each one's own yes (00691; the content loop PRD's 5.3 and call 13): a member's two doors, on the
 * member's own session, each asking its permission itself (add_files to say who is in it, settings to keep a yes), and the
 * read of who is in a file with the uses each person's yes stands for; the ask a person was sent, a no, a yes taken
 * back (00692); and what a piece's sheet reads of each person in it.
 */
import {
  DbFailure,
  recordOrEmpty,
  type FileYesUse,
  type SubjectLabel,
  type SubjectsState,
} from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** Who is in a file, as said: nobody, not sure, or these people. Answers whether the file was there. */
export async function nameFileSubjects(
  db: Db,
  named: {
    tenantId: TenantId;
    fileId: string;
    state: Exclude<SubjectsState, "not_asked">;
    people: { name: string; label: SubjectLabel; contact_id: string | null }[];
  },
): Promise<{ fate: "kept" | "gone"; added: number }> {
  const { data, error } = await db.rpc("file_subjects_name", {
    p_tenant_id: named.tenantId,
    p_file_id: named.fileId,
    p_state: named.state,
    p_people: named.people,
  });
  if (error) throw new DbFailure(error, "file subjects name");
  const answer = recordOrEmpty(data);
  return { fate: answer.fate === "kept" ? "kept" : "gone", added: typeof answer.added === "number" ? answer.added : 0 };
}

/** A person's own yes for each use, where it was said and its evidence (the message it was said in). */
export async function recordSubjectYes(
  db: Db,
  yes: {
    tenantId: TenantId;
    subjectId: string;
    uses: FileYesUse[];
    saidIn: "ai" | "message" | "in_person";
    evidence: Json;
  },
): Promise<{ fate: "kept" | "gone"; kept: number }> {
  const { data, error } = await db.rpc("subject_yes_record", {
    p_tenant_id: yes.tenantId,
    p_subject_id: yes.subjectId,
    p_uses: yes.uses,
    p_said_in: yes.saidIn,
    p_evidence: yes.evidence,
  });
  if (error) throw new DbFailure(error, "subject yes record");
  const answer = recordOrEmpty(data);
  return { fate: answer.fate === "kept" ? "kept" : "gone", kept: typeof answer.kept === "number" ? answer.kept : 0 };
}

/** One person in a file, with the uses their own yes stands for now. */
export interface FileSubjectRow {
  id: string;
  name: string;
  label: string;
  contact_id: string | null;
  yes_for: string[];
}

/** The people in a file, in the order they were named, under the caller's RLS. */
export async function listFileSubjects(db: Db, tenantId: TenantId, fileId: string): Promise<FileSubjectRow[]> {
  const [people, yeses] = await Promise.all([
    db
      .from("file_subjects")
      .select("id, name, label, contact_id")
      .eq("tenant_id", tenantId)
      .eq("file_id", fileId)
      .order("created_at", { ascending: true }),
    db
      .from("file_consents")
      .select("subject_id, use")
      .eq("tenant_id", tenantId)
      .eq("file_id", fileId)
      .is("taken_back_at", null)
      .not("subject_id", "is", null),
  ]);
  if (people.error) throw new DbFailure(people.error, "file subjects");
  if (yeses.error) throw new DbFailure(yeses.error, "file subjects' yeses");
  return people.data.map((p) => ({
    ...p,
    yes_for: yeses.data.filter((y) => y.subject_id === p.id).map((y) => y.use),
  }));
}

/** That a person was asked for their yes (subject_ask_record), as the member who sent the ask. */
export async function recordSubjectAsk(
  db: Db,
  ask: { tenantId: TenantId; subjectId: string; via: string; uses: FileYesUse[] },
): Promise<{ fate: "kept" | "gone" }> {
  const { data, error } = await db.rpc("subject_ask_record", {
    p_tenant_id: ask.tenantId,
    p_subject_id: ask.subjectId,
    p_via: ask.via,
    p_uses: ask.uses,
  });
  if (error) throw new DbFailure(error, "subject ask record");
  return { fate: recordOrEmpty(data).fate === "kept" ? "kept" : "gone" };
}

/** That a person said no (subject_no_record), as the owner read their answer. */
export async function recordSubjectNo(
  db: Db,
  tenantId: TenantId,
  subjectId: string,
): Promise<{ fate: "kept" | "gone" }> {
  const { data, error } = await db.rpc("subject_no_record", { p_tenant_id: tenantId, p_subject_id: subjectId });
  if (error) throw new DbFailure(error, "subject no record");
  return { fate: recordOrEmpty(data).fate === "kept" ? "kept" : "gone" };
}

/** What taking one person's yes back came to, and how much it reached. */
export interface SubjectYesBack {
  fate: "taken_back" | "none" | "gone";
  held: number;
  down: number;
  ads: number;
}

/** One person's own yes taken back (subject_yes_take_back), and what that starts, as the member. */
export async function takeBackSubjectYes(
  db: Db,
  back: { tenantId: TenantId; subjectId: string; uses: FileYesUse[] | null; held: string | null },
): Promise<SubjectYesBack> {
  const { data, error } = await db.rpc("subject_yes_take_back", {
    p_tenant_id: back.tenantId,
    p_subject_id: back.subjectId,
    ...(back.uses ? { p_uses: back.uses } : {}),
    ...(back.held ? { p_held: back.held } : {}),
  });
  if (error) throw new DbFailure(error, "subject yes take back");
  const answer = recordOrEmpty(data);
  const count = (key: string) => (Array.isArray(answer[key]) ? answer[key].length : 0);
  const fate = answer.fate === "taken_back" || answer.fate === "none" ? answer.fate : "gone";
  return { fate, held: count("held"), down: count("down"), ads: count("ads") };
}

type SubjectRow = Database["public"]["Tables"]["file_subjects"]["Row"];
type ConsentRow = Database["public"]["Tables"]["file_consents"]["Row"];

/** A person in a piece as its sheet reads them, and every yes of theirs, standing or taken back. */
export interface PiecePersonRow {
  subject: Pick<
    SubjectRow,
    "id" | "file_id" | "name" | "label" | "contact_id" | "asked_at" | "asked_via" | "asked_uses" | "said_no_at"
  >;
  consents: Pick<ConsentRow, "use" | "said_in" | "said_at" | "evidence" | "taken_back_at">[];
}

/**
 * The people named in these files (a piece, and what it was drawn from), in the order they were named, each with their own
 * yeses, under the caller's RLS.
 */
export async function listPiecePeople(
  db: Db,
  tenantId: TenantId,
  fileIds: readonly string[],
): Promise<PiecePersonRow[]> {
  if (fileIds.length === 0) return [];
  const [people, yeses] = await Promise.all([
    db
      .from("file_subjects")
      .select("id, file_id, name, label, contact_id, asked_at, asked_via, asked_uses, said_no_at")
      .eq("tenant_id", tenantId)
      .in("file_id", [...fileIds])
      .order("created_at", { ascending: true })
      .order("name", { ascending: true }),
    db
      .from("file_consents")
      .select("subject_id, use, said_in, said_at, evidence, taken_back_at")
      .eq("tenant_id", tenantId)
      .in("file_id", [...fileIds])
      .not("subject_id", "is", null)
      .order("said_at", { ascending: false }),
  ]);
  if (people.error) throw new DbFailure(people.error, "piece people");
  if (yeses.error) throw new DbFailure(yeses.error, "piece people's yeses");
  return people.data.map((subject) => ({
    subject,
    consents: yeses.data.filter((y) => y.subject_id === subject.id),
  }));
}

/** Whether the people in each of these files are known (files.subjects_state), and a person's older word that no one is. */
export async function listSubjectsStates(
  db: Db,
  tenantId: TenantId,
  fileIds: readonly string[],
): Promise<{ id: string; subjects_state: string; who_in_it: string }[]> {
  if (fileIds.length === 0) return [];
  const { data, error } = await db
    .from("files")
    .select("id, subjects_state, who_in_it")
    .eq("tenant_id", tenantId)
    .in("id", [...fileIds]);
  if (error) throw new DbFailure(error, "files' people states");
  return data;
}
