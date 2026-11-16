/**
 * What Ask notices of People (the dashboard's ask/tools/read/seen.ts), read where the rows are: a count, or the few rows a
 * rule turns on, never everyone. People's own read (people_list, 00112) works out some eighty columns for each person,
 * their messages and calls among them, a thousand at a time; these ask for the three facts the notices say, so a business
 * of thousands costs what one of twenty does. Each reads the people People lists (`listedOr`, people_page's own rule,
 * 00547) by the columns people_list reads them from: the yes to offers, when they were asked for it and the do-not-contact
 * mark off `contacts`, the channels they reach the business on off `contact_identities`, the deals off `deals` and a next
 * step off `person_notes`. Read on the caller's client, under its row security, as people_list is. A read that fails THROWS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, type ContactId, type TenantId } from "@chanlytics/contracts";
import type { Database } from "../../types";
import { readAllRows } from "../../shared/paged";
import { IDS_PER_READ } from "./pages";

type Db = SupabaseClient<Database>;

/**
 * How many of the people People lists have never been asked for the yes to offers, among those a WhatsApp conversation
 * reaches (the question is asked on WhatsApp alone, contracts offers-ask.ts): no answer about offers, never asked, not on
 * the do-not-contact list, and a WhatsApp identity of their own (people_list's `channels`).
 */
export async function countNeverAskedOnWhatsApp(db: Db, tenantId: TenantId, listedOr: string): Promise<number> {
  const { count, error } = await db
    .from("contacts")
    .select("id, contact_identities!inner(channel)", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("erased_at", null)
    .is("merged_into_contact_id", null)
    .or(listedOr)
    .eq("marketing_consent", "unknown")
    .is("offers_asked_at", null)
    .eq("dnc", false)
    .eq("contact_identities.channel", "whatsapp");
  if (error) throw new DbFailure(error, "cannot count who was never asked about offers");
  return count ?? 0;
}

/** An open deal (0004): a proposal out, or a client, by whom and when it was made. */
export interface ListedOpenDeal {
  contact_id: ContactId;
  stage: string;
  created_at: string;
}

/**
 * Every open deal (proposed or won) of the people People lists: the deal the pages show of anyone with one open is among
 * them (contracts pickCurrentDeal: an open one first, then the newest), so whose shown deal is a proposal out is decided
 * over these alone. As many as are open, never everyone.
 */
export async function listOpenDealsOfListed(db: Db, tenantId: TenantId, listedOr: string): Promise<ListedOpenDeal[]> {
  return readAllRows<ListedOpenDeal>(
    "open deals",
    (from, to) =>
      db
        .from("deals")
        .select("contact_id, stage, created_at, contacts!inner(id)")
        .eq("tenant_id", tenantId)
        .in("stage", ["proposed", "won"])
        .is("contacts.erased_at", null)
        .is("contacts.merged_into_contact_id", null)
        .or(listedOr, { referencedTable: "contacts" })
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
        .then(({ data, error }) => ({
          data: (data ?? []).map(({ contact_id, stage, created_at }) => ({ contact_id, stage, created_at })),
          error,
        })),
    "whole",
  );
}

/**
 * Which of these people have a next step: a note with a day that is not done (people_list's `step_*`, the earliest such
 * note). A hundred ids a read, as every read by ids is.
 */
export async function listPeopleWithAStep(
  db: Db,
  tenantId: TenantId,
  contactIds: readonly ContactId[],
): Promise<Set<ContactId>> {
  const out = new Set<ContactId>();
  for (let from = 0; from < contactIds.length; from += IDS_PER_READ) {
    const { data, error } = await db
      .from("person_notes")
      .select("contact_id")
      .eq("tenant_id", tenantId)
      .in("contact_id", contactIds.slice(from, from + IDS_PER_READ))
      .not("due_on", "is", null)
      .is("done_at", null);
    if (error) throw new DbFailure(error, "cannot read who has a next step");
    for (const note of data) out.add(note.contact_id);
  }
  return out;
}
