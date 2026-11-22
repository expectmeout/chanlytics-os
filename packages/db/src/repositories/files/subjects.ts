/**
 * The people in a file and each one's own yes (00691; the content loop PRD's 5.3 and call 13): a member's two doors, on the
 * member's own session, each asking its permission itself (add_files to say who is in it, settings to keep a yes), and the
 * read of who is in a file with the uses each person's yes stands for.
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
  said: {
    tenantId: TenantId;
    fileId: string;
    state: Exclude<SubjectsState, "not_asked">;
    people: { name: string; label: SubjectLabel; contact_id: string | null }[];
  },
): Promise<{ fate: "kept" | "gone"; added: number }> {
  const { data, error } = await db.rpc("file_subjects_name", {
    p_tenant_id: said.tenantId,
    p_file_id: said.fileId,
    p_state: said.state,
    p_people: said.people,
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
