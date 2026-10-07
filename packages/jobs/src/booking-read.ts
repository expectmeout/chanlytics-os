/**
 * booking_read (docs/plans/2026-10-07-bookings-arrive-by-email.md, step 3): core's readBookingNotice, over the rows the
 * database keeps and the reader, the spend and the person-making the edge injects (ctx.bookings). payload:
 * { received_id, mailbox_id } -- the delivery the intake recognised as a booking tool's notice. The email is fetched
 * again here (the intake kept no row of it: a notice is never a conversation), read once, and written as a visit or
 * held with the reason; a delivery the ledger already holds as read pays nothing.
 */
import {
  DEFAULT_TIMEZONE,
  NOTICE_HOLD_WORDS,
  bookingNoticeOf,
  bookingToolName,
  isNoticeHold,
} from "@chanlytics/contracts";
import {
  readBookingNotice,
  type AppointmentPatch,
  type AppointmentStatus,
  type NewAppointment,
  type NoticeLedgerRow,
  type NoticeOutcome,
  type StoredAppointment,
} from "@chanlytics/core";
import { emailPlainText, logger } from "@chanlytics/channels";
import {
  appointmentByClientStart,
  appointmentByKey,
  appointmentNoticeOf,
  insertAppointment,
  keepAppointmentNotice,
  tenantZoneOf,
  updateAppointment,
  clearForwardingConfirmation,
  type AppointmentInsert,
  type AppointmentNoticeRow,
  type AppointmentRow,
  type AppointmentUpdate,
} from "@chanlytics/db";
import type { ClaimedJob, JobContext } from "./context";
import { MAX_ATTEMPTS } from "./ledger";

/** The closed sets as the tables hold them (00345): a row the verb cannot read as one is a failed read, not a missing one. */
const STATUSES: readonly AppointmentStatus[] = ["proposed", "booked", "kept", "missed", "cancelled"];
const OUTCOMES: readonly NoticeOutcome[] = ["booked", "changed", "cancelled", "held", "dismissed"];
const isStatus = (v: string): v is AppointmentStatus => (STATUSES as readonly string[]).includes(v);
const isOutcome = (v: string): v is NoticeOutcome => (OUTCOMES as readonly string[]).includes(v);

/** The row as the verb reads it: its life and its key, nothing it does not move. */
function stored(r: AppointmentRow): StoredAppointment {
  if (!isStatus(r.status)) throw new Error(`booking_read: an appointment is ${r.status}`);
  return {
    id: r.id,
    status: r.status,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    external_id: r.external_id,
    contact_id: r.contact_id,
  };
}

/** The ledger's row as the verb reads it. */
function ledgerOf(row: AppointmentNoticeRow): NoticeLedgerRow {
  if (!isOutcome(row.outcome)) throw new Error(`booking_read: a notice became ${row.outcome}`);
  if (row.hold_reason !== null && !isNoticeHold(row.hold_reason))
    throw new Error(`booking_read: a notice is held for ${row.hold_reason}`);
  return { outcome: row.outcome, holdReason: row.hold_reason, appointmentId: row.appointment_id };
}

/** A new row as the table takes it (00342): the notice's source, under its key. */
function appointmentRowOf(a: NewAppointment): AppointmentInsert {
  return {
    tenant_id: a.tenantId,
    source: "booking_email",
    tool: a.tool,
    external_id: a.externalId,
    status: a.status,
    starts_at: a.startsAt,
    ends_at: a.endsAt,
    service: a.service,
    staff: a.staff,
    price: a.price,
    note: a.note,
    client_name: a.client.name,
    client_phone: a.client.phone,
    client_email: a.client.email,
    contact_id: a.contactId,
    timezone: a.timezone,
  };
}

/** A patch as the table takes it: only what the notice moved or restated. */
function patchOf(p: AppointmentPatch): AppointmentUpdate {
  return {
    ...(p.externalId !== undefined ? { external_id: p.externalId } : {}),
    ...(p.status !== undefined ? { status: p.status } : {}),
    ...(p.startsAt !== undefined ? { starts_at: p.startsAt } : {}),
    ...(p.endsAt !== undefined ? { ends_at: p.endsAt } : {}),
    ...(p.service !== undefined ? { service: p.service } : {}),
    ...(p.staff !== undefined ? { staff: p.staff } : {}),
    ...(p.price !== undefined ? { price: p.price } : {}),
    ...(p.note !== undefined ? { note: p.note } : {}),
    ...(p.client !== undefined
      ? { client_name: p.client.name, client_phone: p.client.phone, client_email: p.client.email }
      : {}),
    ...(p.contactId !== undefined ? { contact_id: p.contactId } : {}),
  };
}

export async function bookingRead(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const bookings = ctx.bookings;
  if (!bookings) throw new Error("booking_read: this runtime holds no reader");
  const email = ctx.email;
  if (!email) throw new Error("booking_read: this runtime holds no email provider");
  const receivedId = typeof job.payload.received_id === "string" ? job.payload.received_id : "";
  if (!receivedId) throw new Error("booking_read: payload.received_id is required");
  const { db } = ctx;
  const log = logger({ tenant_id: job.tenant_id });

  const e = await email.fetch(receivedId);
  if (!e) {
    // The provider no longer has it: nothing can be read, and the delivery stays on the ledger as held, under the tool
    // the intake recognised, so a person sees it was a booking email that went unread rather than nothing at all.
    const tool = typeof job.payload.tool === "string" ? job.payload.tool : null;
    if (tool)
      await keepAppointmentNotice(db, {
        tenant_id: job.tenant_id,
        notice_id: receivedId,
        tool,
        from_address: null,
        subject: null,
        received_at: new Date().toISOString(),
        outcome: "held",
        hold_reason: "gone",
        appointment_id: null,
      });
    log.warn("booking_notice_held", { job: job.id, received_id: receivedId, tool, outcome: "gone" });
    return;
  }
  const text = emailPlainText(e);
  // Judged again here, from the email itself: the claim the intake made is not carried, and a delivery that is not a
  // tool's notice after all (the sender list changed between the two runs) is nothing to read.
  const notice = bookingNoticeOf({ from: e.from, subject: e.subject, text });
  if (!notice) {
    log.warn("booking_notice_held", { job: job.id, received_id: receivedId, outcome: "not_a_notice" });
    return;
  }
  const tz = (await tenantZoneOf(db, job.tenant_id)) ?? DEFAULT_TIMEZONE;
  const outcome = await readBookingNotice(
    {
      mayRead: (tenantId, at) => bookings.mayRead(tenantId, new Date(at)),
      ask: (system, user) =>
        bookings.ask(system, user, ctx.deadline, { tenantId: job.tenant_id, subjectId: receivedId }),
      noticeOf: async (tenantId, noticeId) => {
        const row = await appointmentNoticeOf(db, tenantId, noticeId);
        return row ? ledgerOf(row) : null;
      },
      keepNotice: (p) =>
        keepAppointmentNotice(db, {
          tenant_id: p.tenantId,
          notice_id: p.noticeId,
          tool: p.tool,
          from_address: p.fromAddress,
          subject: p.subject,
          received_at: p.receivedAt,
          outcome: p.outcome,
          hold_reason: p.holdReason,
          appointment_id: p.appointmentId,
        }),
      byKey: async (tenantId, key) => {
        const r = await appointmentByKey(db, tenantId, "booking_email", key);
        return r ? stored(r) : null;
      },
      byClientStart: async (tenantId, client, startMs, withinMs) => {
        const r = await appointmentByClientStart(db, tenantId, client, startMs, withinMs);
        return r ? stored(r) : null;
      },
      insert: (a) => insertAppointment(db, appointmentRowOf(a)),
      update: (tenantId, id, patch) => updateAppointment(db, tenantId, id, patchOf(patch)),
      personFor: bookings.personFor,
      now: Date.now,
    },
    {
      tenantId: job.tenant_id,
      tz,
      tool: notice.tool,
      email: { id: e.id, from: e.from, subject: e.subject, text, receivedAt: e.createdAt },
    },
  ).catch(async (err: unknown) => {
    // A read that threw. A row the table refuses (a check, 23514) will be refused again, and the last try has no next:
    // either way the delivery is kept on the ledger as held, so a person sees a booking email that went unread and
    // can press Read again, where a failed job alone would be all there was of it. Any other throw is the next try's.
    const refused = (err as { code?: unknown } | null)?.code === "23514";
    if (!refused && (job.attempts ?? 1) < MAX_ATTEMPTS) throw err;
    const reason = refused ? "unreadable" : "no_model";
    await keepAppointmentNotice(db, {
      tenant_id: job.tenant_id,
      notice_id: receivedId,
      tool: notice.tool,
      from_address: e.from?.address ?? null,
      subject: e.subject,
      received_at: e.createdAt ?? new Date().toISOString(),
      outcome: "held",
      hold_reason: reason,
      appointment_id: null,
    });
    log.error("booking_notice_held", {
      job: job.id,
      received_id: receivedId,
      tool: notice.tool,
      outcome: refused ? "refused" : "failed",
      attempts: job.attempts ?? 1,
      error: err instanceof Error ? err.message : String(err),
    });
    return `held:${reason}` as const;
  });
  log.info(outcome.startsWith("held:") ? "booking_notice_held" : "booking_notice_read", {
    job: job.id,
    received_id: receivedId,
    tool: notice.tool,
    forwarded: notice.forwarded,
    outcome,
  });
  if (outcome.startsWith("held:")) {
    // A person must look: the bell says so once, except when the reader was simply not there, which is not news.
    const reason = outcome.slice("held:".length);
    if (reason !== "no_model" && reason !== "may_not_spend")
      await bookings.tell(job.tenant_id, {
        noticeId: receivedId,
        // The tool as the product says it ("Booksy"), the words the bell shows.
        tool: bookingToolName(notice.tool) ?? notice.tool,
        subject: e.subject,
        reason: NOTICE_HOLD_WORDS[isNoticeHold(reason) ? reason : "unreadable"],
      });
  } else if (outcome !== "already") {
    // A notice read whole proves the forward works: Gmail's pending confirmation, if one was kept, is let go of.
    const mailboxId = typeof job.payload.mailbox_id === "string" ? job.payload.mailbox_id : null;
    if (mailboxId) await clearForwardingConfirmation(db, mailboxId).catch(() => undefined);
  }
}
