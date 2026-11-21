/**
 * A website's form entries and its keys (00674; the Forms plan, F0). The edge's door keeps an entry through one write,
 * form_entry_take: the key's last use, the once rule, the person through resolve_person, the entry and its event, all
 * in one transaction. What follows it (the note, the notice, a sign-up's ask) is each settled on the entry by
 * form_entry_settled. The keys are an owner's: made, changed and ended through their own doors on the caller's client,
 * read under its row security; the edge reads them by hash on the service role. A read that fails THROWS, but for a
 * database before 00674, whose missing tables read as no keys and no entries.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DbFailure,
  FORM_EFFECTS,
  heldContactId,
  recordOrEmpty,
  type ContactId,
  type FormEffect,
  type TenantId,
} from "@chanlytics/contracts";
import type { Database, Json } from "../../types";

type Db = SupabaseClient<Database>;

/** The codes PostgREST and Postgres answer for a table that is not there yet: before 00674, no keys and no entries. */
const NOT_THERE_YET = new Set(["PGRST205", "42P01"]);

/** What the door's one write came to: kept now, kept before (the same entry again), or a person who asked to be forgotten. */
export type FormEntryTaken =
  | { outcome: "accepted" | "again"; entryId: string; contactId: ContactId }
  | { outcome: "forgotten"; entryId: null; contactId: null };

/** What the door hands its one write. `keyId` null is the first key, made from the platform's own. */
interface FormEntryToTake {
  tenantId: TenantId;
  keyId: string | null;
  form: "signup" | "request";
  answers: Json;
  person: { name: string | null; email: string | null; phone: string | null; detail: Json };
  ref: string | null;
  words: string;
  owed: readonly FormEffect[];
}

/** The entry kept with its person and its event, or found again, or nothing for a person who asked to be forgotten. */
export async function takeFormEntry(db: Db, entry: FormEntryToTake): Promise<FormEntryTaken> {
  const { data, error } = await db.rpc("form_entry_take", {
    p_tenant_id: entry.tenantId,
    // An absent key is the first key: the door makes its row at its first use.
    p_key_id: entry.keyId ?? undefined,
    p_form: entry.form,
    p_answers: entry.answers,
    p_person: { ...entry.person },
    p_ref: entry.ref ?? undefined,
    p_words: entry.words,
    p_owed: [...entry.owed],
  });
  if (error) throw new DbFailure(error, "form_entry_take");
  const row = recordOrEmpty(data);
  if (row.outcome === "forgotten") return { outcome: "forgotten", entryId: null, contactId: null };
  if ((row.outcome !== "accepted" && row.outcome !== "again") || typeof row.entry_id !== "string")
    throw new Error("form_entry_take answered without an entry");
  if (typeof row.contact_id !== "string") throw new Error("form_entry_take answered without a person");
  return { outcome: row.outcome, entryId: row.entry_id, contactId: heldContactId(row.contact_id) };
}

/** One effect's outcome as the entry keeps it: done, or failed with why, and what else the effect says of itself. */
export interface FormEffectOutcome {
  state: "done" | "failed";
  why?: string | null;
  /** The ask's word (asked, or why not), for the notice to say. */
  outcome?: string | null;
  /** The notice's: the owner has a notice of it now (its bell row kept). */
  told?: boolean;
}

/** An entry as its effects read it. */
export interface FormEntryRow {
  id: string;
  contact_id: ContactId;
  form: "signup" | "request";
  answers: Json;
  owed: string[];
  effects: Partial<Record<FormEffect, FormEffectOutcome>>;
  created_at: string;
}

/** One effect's outcome as the entry kept it, or null where it kept none (or a row that is not one). */
function effectOf(kept: unknown): FormEffectOutcome | null {
  const row = recordOrEmpty(kept);
  if (row.state !== "done" && row.state !== "failed") return null;
  return {
    state: row.state,
    why: typeof row.why === "string" ? row.why : null,
    outcome: typeof row.outcome === "string" ? row.outcome : null,
    told: row.told === true,
  };
}

/** The entry an effect is for, or null where it is gone (its person erased since). */
export async function findFormEntry(db: Db, tenantId: TenantId, entryId: string): Promise<FormEntryRow | null> {
  const { data, error } = await db
    .from("form_entries")
    .select("id, contact_id, form, answers, owed, effects, created_at")
    .eq("tenant_id", tenantId)
    .eq("id", entryId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "form_entries");
  if (!data) return null;
  return {
    id: data.id,
    contact_id: heldContactId(data.contact_id),
    form: data.form === "signup" ? "signup" : "request",
    answers: data.answers,
    owed: data.owed,
    effects: Object.fromEntries(
      FORM_EFFECTS.flatMap((name) => {
        const kept = effectOf(recordOrEmpty(data.effects)[name]);
        return kept ? [[name, kept]] : [];
      }),
    ),
    created_at: data.created_at,
  };
}

/** An effect's outcome kept on its entry; `settled` false where it was not written (a step done already, an entry gone). */
export async function settleFormEffect(
  db: Db,
  settled: { tenantId: TenantId; entryId: string; effect: FormEffect; outcome: FormEffectOutcome },
): Promise<{ settled: boolean; gone: boolean }> {
  const { data, error } = await db.rpc("form_entry_settled", {
    p_tenant_id: settled.tenantId,
    p_entry_id: settled.entryId,
    p_effect: settled.effect,
    p_outcome: { ...settled.outcome },
  });
  if (error) throw new DbFailure(error, "form_entry_settled");
  const row = recordOrEmpty(data);
  return { settled: row.settled === true, gone: row.gone === true };
}

/** The entries accepted before `before` that told nobody yet, oldest first, at most `limit`: the watch's read. */
export async function listUntoldFormEntries(
  db: Db,
  before: string,
  limit: number,
): Promise<Array<{ tenant_id: string; id: string; created_at: string }>> {
  const { data, error } = await db
    .from("form_entries")
    .select("tenant_id, id, created_at")
    .is("told_at", null)
    .lt("created_at", before)
    .order("created_at")
    .limit(limit);
  if (error && NOT_THERE_YET.has(error.code)) return [];
  if (error) throw new DbFailure(error, "form_entries");
  return data;
}

/** A key as the door checks it: which one, and from when it is refused. */
interface FormKeyKnown {
  id: string;
  ends_at: string | null;
}

/** The workspace's key with this hash, or null. */
export async function findFormKeyByHash(db: Db, tenantId: TenantId, hash: string): Promise<FormKeyKnown | null> {
  const { data, error } = await db
    .from("form_keys")
    .select("id, ends_at")
    .eq("tenant_id", tenantId)
    .eq("hash", hash)
    .maybeSingle();
  if (error && NOT_THERE_YET.has(error.code)) return null;
  if (error) throw new DbFailure(error, "form_keys");
  return data;
}

/** The workspace's first key, made from the platform's own, where a site has used it; null where none has. */
export async function findFirstFormKey(db: Db, tenantId: TenantId): Promise<FormKeyKnown | null> {
  const { data, error } = await db
    .from("form_keys")
    .select("id, ends_at")
    .eq("tenant_id", tenantId)
    .eq("first", true)
    .maybeSingle();
  if (error && NOT_THERE_YET.has(error.code)) return null;
  if (error) throw new DbFailure(error, "form_keys");
  return data;
}

/** A website's key as Settings shows it: never its hash. */
interface FormKeyListed {
  id: string;
  name: string | null;
  first: boolean;
  created_at: string;
  last_used_at: string | null;
  ends_at: string | null;
}

/**
 * The workspace's keys: those with no end first, then the last to end, forty at most. So every key that still works is
 * among them however many were ended before (a workspace keeps at most ten that work); the reader says which still do.
 */
export async function listFormKeys(db: Db, tenantId: TenantId): Promise<FormKeyListed[]> {
  const { data, error } = await db
    .from("form_keys")
    .select("id, name, first, created_at, last_used_at, ends_at")
    .eq("tenant_id", tenantId)
    .order("ends_at", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(40);
  if (error && NOT_THERE_YET.has(error.code)) return [];
  if (error) throw new DbFailure(error, "form_keys");
  return data;
}

/** When the workspace's newest entry arrived, or null where none has. */
export async function findLastFormEntryAt(db: Db, tenantId: TenantId): Promise<string | null> {
  const { data, error } = await db
    .from("form_entries")
    .select("created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && NOT_THERE_YET.has(error.code)) return null;
  if (error) throw new DbFailure(error, "form_entries");
  return data?.created_at ?? null;
}

/** A key kept by its name and its hash, on the caller's client: its id. */
export async function makeFormKey(db: Db, key: { tenantId: TenantId; name: string; hash: string }): Promise<string> {
  const { data, error } = await db.rpc("form_key_make", {
    p_tenant_id: key.tenantId,
    p_name: key.name,
    p_hash: key.hash,
  });
  if (error) throw new DbFailure(error, "form_key_make");
  return String(data);
}

/** A key changed for a new one, the old one honoured a day: the new one's id, and the name the door kept for it. */
export async function changeFormKey(
  db: Db,
  changed: { tenantId: TenantId; keyId: string; hash: string },
): Promise<{ id: string; name: string }> {
  const { data, error } = await db.rpc("form_key_change", {
    p_tenant_id: changed.tenantId,
    p_key_id: changed.keyId,
    p_hash: changed.hash,
  });
  if (error) throw new DbFailure(error, "form_key_change");
  const row = recordOrEmpty(data);
  if (typeof row.id !== "string" || typeof row.name !== "string")
    throw new Error("form_key_change answered without a key");
  return { id: row.id, name: row.name };
}

/** A key refused from now on: whether one still working was ended. */
export async function endFormKey(db: Db, ended: { tenantId: TenantId; keyId: string }): Promise<boolean> {
  const { data, error } = await db.rpc("form_key_end", { p_tenant_id: ended.tenantId, p_key_id: ended.keyId });
  if (error) throw new DbFailure(error, "form_key_end");
  return data === true;
}
