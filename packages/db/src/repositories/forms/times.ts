/**
 * A time asked for on a form (00688; the Forms plan, F3; decision 0061). The door's one write with a time
 * (form_time_request_take) is form_request_take's with the same request a chat opens held beside it: a proposed visit,
 * the receptionist's, held for its owner a day at most, in no thread and with no hold, named from the entry by its
 * visit link. The owner answers it with the chat's own door (calendar's answerBookingRequest). A business's own booking
 * page opened from a form is counted by day (form_booking_open). A read that fails THROWS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import { tenantDb } from "../../shared/tenant-db";
import type { Database } from "../../types";
import { takenFrom, type FormRequestTaken, type FormRequestToTake } from "./requests";

type Db = SupabaseClient<Database>;

/** A time asked for: its start and end, the service it is for where the business lists it, and the business's clock. */
export interface FormTimeAsked {
  startsAt: string;
  endsAt: string;
  service: string | null;
  timezone: string;
}

/** What became of the time: held until `expiresAt`, too soon to hold (an hour away or less), or not asked of the door. */
export type FormTimeHeld = { appointmentId: string; expiresAt: string } | { refused: "too_soon" } | null;

/** The entry kept as form_request_take keeps it, and the time held for its owner beside it (form_time_request_take). */
export async function takeFormTimeRequest(
  db: Db,
  entry: FormRequestToTake,
  time: FormTimeAsked,
): Promise<{ taken: FormRequestTaken; time: FormTimeHeld }> {
  const { data, error } = await db.rpc("form_time_request_take", {
    p_tenant_id: entry.tenantId,
    p_form_id: entry.formId,
    p_version_id: entry.versionId,
    p_ref: entry.ref,
    p_answers: entry.answers,
    p_reach: { ...entry.reach },
    p_words: entry.words,
    p_starts_at: time.startsAt,
    p_ends_at: time.endsAt,
    // No service is an empty one: the door keeps none.
    p_service: time.service ?? "",
    p_timezone: time.timezone,
    p_source: entry.source ?? undefined,
    p_link_code: entry.linkCode ?? undefined,
    p_test: entry.test,
    p_held_why: entry.heldWhy ?? undefined,
  });
  if (error) throw new DbFailure(error, "form_time_request_take");
  const held = recordOrEmpty(recordOrEmpty(data).time);
  const kept: FormTimeHeld =
    held.error === "too_soon"
      ? { refused: "too_soon" }
      : typeof held.appointment_id === "string" && typeof held.expires_at === "string"
        ? { appointmentId: held.appointment_id, expiresAt: held.expires_at }
        : null;
  return { taken: takenFrom(data), time: kept };
}

/** One more open of a live form's business's own booking page today (form_booking_open). Answers whether it counted. */
export async function countFormBookingOpen(db: Db, tenantId: TenantId, formId: string): Promise<boolean> {
  const { data, error } = await db.rpc("form_booking_open", { p_tenant_id: tenantId, p_form_id: formId });
  if (error) throw new DbFailure(error, "form_booking_open");
  return data === true;
}

/**
 * The requests some visits were asked for from, where a form asked for them, by the visit's id: what the Calendar
 * answers a form's request through. None asked, none read.
 */
export async function listFormEntriesOfVisits(
  db: Db,
  tenantId: TenantId,
  appointmentIds: readonly string[],
): Promise<Map<string, string>> {
  if (appointmentIds.length === 0) return new Map();
  const { data, error } = await tenantDb(db, tenantId)
    .from("form_entry_links")
    .select("entry_id, appointment_id")
    .in("appointment_id", [...appointmentIds])
    .eq("kind", "visit")
    .order("created_at");
  if (error) throw new DbFailure(error, "form_entry_links");
  return new Map(data.flatMap((row) => (row.appointment_id ? [[row.appointment_id, row.entry_id] as const] : [])));
}
