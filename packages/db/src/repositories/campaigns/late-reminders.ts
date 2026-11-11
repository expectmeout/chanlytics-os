/**
 * A late booking's reminder, as the database holds what it is decided over (decision 0118), read with the service role:
 * the workspace's step on `visit_tomorrow`, the booking an event is about as it stands now, and whether that visit was
 * reminded already. A batch is given a random id when it is made (assemble_broadcast), so "once per visit" is asked here,
 * before the run, of the reminders the step's batches hold. A read that fails throws, so whatever asked tries again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY_MS, DEFAULT_TIMEZONE, DbFailure, recordOrEmpty, type SequenceMode } from "@chanlytics/contracts";
import type { Database } from "../../types";
import { getSequenceModes } from "./sequences/reads";
import type { ContactId, TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;
type StepRow = Database["public"]["Tables"]["sequence_steps"]["Row"];
/** The reminder's step as a run takes it: its row, the message it surely holds, and its sequence's mode. */
type ReminderStep = Omit<StepRow, "template_id" | "template_name" | "template_language"> & {
  template_id: string;
  template_name: string;
  template_language: string;
  mode: SequenceMode | undefined;
};

/** How far back a batch may be and still hold this visit's reminder: a late one is made within a day of its visit. */
const REMINDED_SINCE_MS = 3 * DAY_MS;
/** A customer's send that stands: on its way, a waiting batch's among them, or gone (sequence_sends_customer_states). */
const SEND_STANDS: readonly string[] = ["queued", "sent"];

/**
 * The workspace's step on a visit's moment (`moment`): the running one, with its sequence's mode as a run reads it (the oldest,
 * should two sequences hold one: a visit is reminded once), else whether one stands paused, else none.
 */
export async function findReminderStep(
  db: Db,
  tenantId: TenantId,
  /** The visit's moment the step is on: the reminder the day before (0118), or the thank-you the day after (0123). */
  moment: "visit_tomorrow" | "visited",
): Promise<{ state: "running"; step: ReminderStep } | { state: "paused" | "none" }> {
  const { data, error } = await db
    .from("sequence_steps")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("trigger", moment)
    .order("created_at", { ascending: true });
  if (error) throw new DbFailure(error, "cannot read the step that reminds of an appointment");
  const steps = data;
  const running = steps.find((s) => s.state === "running");
  if (!running) return { state: steps.length ? "paused" : "none" };
  // A moment's step always holds its message (sequence_steps' own check); one that did not would remind nobody.
  const { template_id, template_name, template_language } = running;
  if (!template_id || !template_name || !template_language) return { state: "none" };
  const modes = await getSequenceModes(db, tenantId, [running.sequence_id]);
  const mode = modes.get(running.sequence_id);
  return { state: "running", step: { ...running, template_id, template_name, template_language, mode } };
}

/**
 * The booking an event is about, as the record holds it now: booked, not vanished from the calendar, still ahead, with
 * its person and the business's zone (DEFAULT_TIMEZONE where it keeps none); null when it is none of those.
 */
export async function findBookingForReminder(
  db: Db,
  tenantId: TenantId,
  appointmentId: string,
  nowMs: number,
): Promise<{ contactId: ContactId | null; startsAt: string; tz: string } | null> {
  const [appt, tenant] = await Promise.all([
    db
      .from("appointments")
      .select("contact_id, starts_at")
      .eq("tenant_id", tenantId)
      .eq("id", appointmentId)
      .eq("status", "booked")
      .is("vanished_at", null)
      .gt("starts_at", new Date(nowMs).toISOString())
      .maybeSingle(),
    db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle(),
  ]);
  if (appt.error) throw new DbFailure(appt.error, "late_reminder: the appointment");
  if (tenant.error) throw new DbFailure(tenant.error, "late_reminder: the workspace");
  if (!appt.data) return null;
  return {
    contactId: appt.data.contact_id,
    startsAt: appt.data.starts_at,
    tz: tenant.data?.timezone || DEFAULT_TIMEZONE,
  };
}

/**
 * Whether the step already holds a reminder for this person's visit at this start: on its way or gone, in the day's own
 * batch or a late one a first delivery of the booking's event made, or in a batch that was stopped. A reminder its owner
 * stopped, or the sweep skipped for want of an OK, is still the visit's reminder: a later word about the same booking
 * never makes another. A batch that failed holds none. A visit moved since is another start, and is owed its own (the
 * send door refuses the old one: contracts appointmentHolds).
 */
export async function findReminderOfVisit(
  db: Db,
  tenantId: TenantId,
  visit: { stepId: string; contactId: ContactId; startsAt: string; nowMs: number },
): Promise<boolean> {
  const batches = await db
    .from("sequence_batches")
    .select("id, state")
    .eq("tenant_id", tenantId)
    .eq("step_id", visit.stepId)
    .neq("state", "failed")
    .gte("created_at", new Date(visit.nowMs - REMINDED_SINCE_MS).toISOString());
  if (batches.error) throw new DbFailure(batches.error, "late_reminder: the step's batches");
  if (batches.data.length === 0) return false;
  const stopped = new Set(batches.data.filter((b) => b.state === "canceled").map((b) => b.id));
  const sends = await db
    .from("sequence_sends")
    .select("batch_id, state, facts")
    .eq("tenant_id", tenantId)
    .eq("contact_id", visit.contactId)
    .in(
      "batch_id",
      batches.data.map((b) => b.id),
    );
  if (sends.error) throw new DbFailure(sends.error, "late_reminder: the visit's reminders");
  const start = Date.parse(visit.startsAt);
  return sends.data.some((s) => {
    const reminded = recordOrEmpty(s.facts).visit_start;
    if (typeof reminded !== "string" || Date.parse(reminded) !== start) return false;
    return SEND_STANDS.includes(s.state) || (s.batch_id !== null && stopped.has(s.batch_id));
  });
}
