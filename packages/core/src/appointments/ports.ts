/**
 * What the booking-notice read takes the world through (docs/plans/2026-10-07-bookings-arrive-by-email.md, step 3):
 * the notice as the intake fetched it, the model, the two tables (the notices ledger and the appointments record) and
 * the person the booking is for. No database client, provider or environment inside the verb; the jobs handler binds
 * these over packages/db and the edge's model door.
 */
import type { AppointmentStatus, NoticeHold } from "@chanlytics/contracts";

/** One received email as the read needs it: who sent it, its words, when it came, and the provider's id for it. */
export interface NoticeEmail {
  /** The provider's id for the delivery: the ledger's key, so a repeat delivery meets its row. */
  id: string;
  from: { address: string; name: string | null } | null;
  subject: string | null;
  text: string | null;
  receivedAt: string | null;
}

/** An appointment's life (decision 0002): a hold, a booking, what became of it. The one closed set is contracts'. */
export type { AppointmentStatus };

/** The row as the read needs it back: enough to tell a live booking from a finished one, and to move it. */
export interface StoredAppointment {
  id: string;
  status: AppointmentStatus;
  /** ISO instants. */
  starts_at: string;
  ends_at: string;
  external_id: string | null;
  contact_id: string | null;
}

/** The client as a notice names them. */
export interface NoticeClient {
  name: string | null;
  /** E.164. */
  phone: string | null;
  email: string | null;
}

/** A row the read writes: the booking as the notice stated it, under the one key a repeat meets. */
export interface NewAppointment {
  tenantId: string;
  tool: string;
  externalId: string;
  status: Extract<AppointmentStatus, "booked" | "cancelled">;
  startsAt: string;
  endsAt: string;
  service: string | null;
  staff: string | null;
  price: string | null;
  note: string | null;
  client: NoticeClient;
  contactId: string | null;
  timezone: string;
}

/** What a read may change on a row it found: the time (a change), the status (a cancellation), what the notice restated. */
export interface AppointmentPatch {
  externalId?: string;
  status?: AppointmentStatus;
  startsAt?: string;
  endsAt?: string;
  service?: string | null;
  staff?: string | null;
  price?: string | null;
  note?: string | null;
  client?: NoticeClient;
  contactId?: string | null;
}

/**
 * What became of a notice, as the ledger keeps it (appointment_notices.outcome). `dismissed` is one set aside: by a
 * person, from the held list, or by the read itself, for a tool's email that is about no booking.
 */
export type NoticeOutcome = "booked" | "changed" | "cancelled" | "held" | "dismissed";

export interface NoticeLedgerRow {
  outcome: NoticeOutcome;
  holdReason: NoticeHold | null;
  appointmentId: string | null;
}

export interface BookingNoticePorts {
  /** Why the model may not be asked now (no key, a workspace that may not spend), or null when it may. */
  mayRead(tenantId: string, atMs: number): Promise<Extract<NoticeHold, "no_model" | "may_not_spend"> | null>;
  /** The model's answer, unparsed; null when it answered nothing usable. Throws on a failed call: the ledger's retry. */
  ask(system: string, user: string): Promise<unknown>;
  /** What the ledger already holds for this delivery, or null. */
  noticeOf(tenantId: string, noticeId: string): Promise<NoticeLedgerRow | null>;
  /** Keep what became of the notice, once per delivery: a second keep for the same delivery replaces the first. */
  keepNotice(p: {
    tenantId: string;
    noticeId: string;
    tool: string;
    fromAddress: string | null;
    subject: string | null;
    receivedAt: string;
    outcome: NoticeOutcome;
    holdReason: NoticeHold | null;
    appointmentId: string | null;
  }): Promise<void>;
  /** The row under this key (appointments_source_uq, source booking_email), or null. */
  byKey(tenantId: string, externalId: string): Promise<StoredAppointment | null>;
  /**
   * The live row (proposed or booked) this client has that starts within `withinMs` of `startMs`, soonest first, or
   * null: how a change finds the booking it moves, and a cancellation the one it ends, when the key does not.
   */
  byClientStart(
    tenantId: string,
    client: NoticeClient,
    startMs: number,
    withinMs: number,
  ): Promise<StoredAppointment | null>;
  insert(row: NewAppointment): Promise<{ id: string }>;
  /** "refused" when the row's guard would not take the move (a finished appointment cancelled): nothing changed. */
  update(tenantId: string, id: string, patch: AppointmentPatch): Promise<"updated" | "refused">;
  /**
   * The person this booking is for, matched or made by the calendar sweep's own rules (a number makes a person, a name
   * fills only an empty one, an erased person is not brought back); null when the notice names no number and nobody
   * holds its address. `visit` is what the person's first event says of where they came from.
   */
  personFor(
    tenantId: string,
    client: NoticeClient,
    visit: { title: string; uid: string; startMs: number },
  ): Promise<string | null>;
  now(): number;
}
