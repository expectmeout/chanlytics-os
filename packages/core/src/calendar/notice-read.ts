/**
 * booking_read: one booking tool's notice, read into the appointments record (docs/plans/
 * 2026-10-07-bookings-arrive-by-email.md, step 3).
 *
 * The intake recognised the tool and scheduled this once per delivery. Here the model reads the notice into one shape
 * (contracts NOTICE_SCHEMA), the answer is held to that shape strictly (noticeAnswerOf), and the booking it states is
 * written under the one key a repeat meets (appointmentKey): a booking is a row, a change moves the row the old time
 * named, a cancellation ends the row the time names. A notice that cannot be read whole is kept on the ledger with the
 * reason and held for a person; nothing is dropped and nothing is invented. A tool's email that is about no booking (a
 * receipt, a digest, its newsletter, a confirmation written to a client about a visit somewhere else) is kept on the
 * ledger and set aside: nobody is asked to look at one. The receptionist is not a source: a notice is the tool's word
 * about a booking the tool made.
 *
 * It resumes. The ledger's row is written last, so a run that died after the appointment was written finds the row by
 * its key on the next try and writes it again in place; a run that died before writes it then. A delivery the ledger
 * already holds as read is answered `already` and pays nothing; one it holds as held is read again, since a held read
 * may have been the model's absence rather than the notice's shape.
 *
 * A time that was withdrawn and is booked again. A visit's key is its tool, its client and its start, so a client who
 * cancels Thursday at three and books Thursday at three again states the key of a row that has ended, and a row that
 * has ended does not come back (the table's guard). The ended row leaves the key (asideKey) and the visit is written
 * anew under it, for a time still ahead: left as it was, the time would be offered to someone else.
 */
import {
  appointmentKey,
  appointmentTitle,
  noticeAnswerOf,
  noticePrompt,
  SAME_VISIT_MS,
  type BookingTool,
  type NoticeHold,
  type NoticeReading,
} from "@chanlytics/contracts";
import type {
  BookingNoticePorts,
  NewAppointment,
  NoticeClient,
  NoticeEmail,
  NoticeOutcome,
  StoredAppointment,
} from "./ports";

export interface ReadBookingNoticeCommand {
  tenantId: string;
  /** The business's zone: the notice's clock times are its own. */
  tz: string;
  tool: BookingTool;
  email: NoticeEmail;
}

/** What one run came to, for the log. */
export type ReadBookingNoticeOutcome =
  | "already"
  | "booked"
  | "booked_again"
  | "changed"
  | "changed_unknown"
  | "cancelled"
  | "cancelled_unknown"
  | "cancel_refused"
  // A tool's email about no booking: on the ledger, and nobody's to look at.
  | "set_aside"
  | `held:${NoticeHold}`;

/** A row the notice may still move: a hold or a booking ahead, never one that happened or was already withdrawn. */
const stillAhead = (row: StoredAppointment | null): StoredAppointment | null =>
  row && (row.status === "proposed" || row.status === "booked") ? row : null;

/** The key an ended row is left with when its time is booked again: its own, so the visit's key is free for the visit. */
const asideKey = (key: string, row: StoredAppointment): string => `${key}|ended:${row.id}`;

export async function readBookingNotice(
  ports: BookingNoticePorts,
  cmd: ReadBookingNoticeCommand,
): Promise<ReadBookingNoticeOutcome> {
  const { tenantId, tz, tool, email } = cmd;
  const nowMs = ports.now();
  const receivedAt = email.receivedAt ?? new Date(nowMs).toISOString();
  const ledger = {
    tenantId,
    noticeId: email.id,
    tool,
    fromAddress: email.from?.address ?? null,
    subject: email.subject,
    receivedAt,
  };
  const hold = async (reason: NoticeHold): Promise<ReadBookingNoticeOutcome> => {
    await ports.keepNotice({ ...ledger, outcome: "held", holdReason: reason, appointmentId: null });
    return `held:${reason}`;
  };

  const seen = await ports.noticeOf(tenantId, email.id);
  if (seen && seen.outcome !== "held") return "already";

  const may = await ports.mayRead(tenantId, nowMs);
  if (may) return hold(may);

  const words = noticePrompt({
    tool,
    subject: email.subject,
    text: email.text ?? "",
    tz,
    receivedAtMs: Date.parse(receivedAt) || nowMs,
  });
  const answer = await ports.ask(words.system, words.user);
  const read = noticeAnswerOf(answer, tz, nowMs);
  if (read.hold === "not_a_booking") {
    // Kept, so a repeat of the delivery pays nothing, and set aside: a held one would ring the bell for every receipt
    // and newsletter a tool sends, and the list a person is asked to look at would be those.
    await ports.keepNotice({ ...ledger, outcome: "dismissed", holdReason: "not_a_booking", appointmentId: null });
    return "set_aside";
  }
  if (read.hold) return hold(read.hold);
  const r = read.reading;

  const key = appointmentKey(tool, r.client, r.start);
  const title = appointmentTitle({ title: null, service: r.service, client_name: r.client.name });
  const contactId = await ports.personFor(tenantId, r.client, { title, uid: `notice:${email.id}`, startMs: r.start });
  const stated = {
    service: r.service,
    staff: r.staff,
    price: r.price,
    note: r.note,
    client: r.client,
    contactId,
  };
  const fresh = (status: NewAppointment["status"]): NewAppointment => ({
    tenantId,
    tool,
    externalId: key,
    status,
    startsAt: new Date(r.start).toISOString(),
    endsAt: new Date(r.end).toISOString(),
    timezone: tz,
    ...stated,
  });
  const keep = async (outcome: Written[0], id: string | null) => {
    await ports.keepNotice({ ...ledger, ...ledgerOutcomeOf(outcome), appointmentId: id });
    return outcome;
  };

  const visit: Visit = { tenantId, key, r, fresh, stated, ahead: r.start > nowMs };
  if (r.kind === "booked") return keep(...(await booked(ports, visit)));
  if (r.kind === "changed") return keep(...(await changed(ports, visit)));
  return keep(...(await cancelled(ports, visit)));
}

type Stated = {
  service: string | null;
  staff: string | null;
  price: string | null;
  note: string | null;
  client: NoticeClient;
  contactId: string | null;
};
type Written = [Exclude<ReadBookingNoticeOutcome, "already" | "set_aside" | `held:${NoticeHold}`>, string | null];
/**
 * One visit as it was read, for the three kinds: whose, its key, the reading, the row it would make, what it states,
 * and whether its time is still ahead of the moment it is read.
 */
type Visit = {
  tenantId: string;
  key: string;
  r: NoticeReading;
  fresh: (s: NewAppointment["status"]) => NewAppointment;
  stated: Stated;
  ahead: boolean;
};

/**
 * What the ledger keeps of a run that read a booking. A cancellation the visit's guard refused (a member already said
 * kept or missed, and that is final) cancelled nothing: it is set aside, so neither the ledger nor Activity says a
 * visit was cancelled that stands. The ledger has no word of its own for it yet, and a notice set aside carries a
 * reason (appointment_notices_check), so it carries the one the read sets aside with.
 */
function ledgerOutcomeOf(outcome: Written[0]): { outcome: NoticeOutcome; holdReason: NoticeHold | null } {
  if (outcome === "cancel_refused") return { outcome: "dismissed", holdReason: "not_a_booking" };
  const said = outcome.startsWith("booked") ? "booked" : outcome.startsWith("changed") ? "changed" : "cancelled";
  return { outcome: said, holdReason: null };
}

/**
 * The visit written anew over a row that ended under its key (withdrawn, or long past): the ended row keeps its
 * history under a key of its own, and the key is the new visit's.
 */
async function bookedAgainOver(
  ports: BookingNoticePorts,
  { tenantId, key, fresh }: Visit,
  ended: StoredAppointment,
): Promise<string> {
  await ports.update(tenantId, ended.id, { externalId: asideKey(key, ended) });
  return (await ports.insert(fresh("booked"))).id;
}

/** A booking: the row under its key restated, else written; a time that was withdrawn and is ahead, booked anew. */
async function booked(ports: BookingNoticePorts, visit: Visit): Promise<Written> {
  const { tenantId, key, r, fresh, stated } = visit;
  const have = await ports.byKey(tenantId, key);
  if (have && have.status === "cancelled" && visit.ahead) return ["booked", await bookedAgainOver(ports, visit, have)];
  if (have) {
    // The same visit said again (a repeat, a forward beside the tool's own copy): what it restates, restated; a hold
    // the tool now confirms, booked. A row past its visit is left as it ended.
    await ports.update(tenantId, have.id, {
      ...stated,
      endsAt: new Date(r.end).toISOString(),
      ...(have.status === "proposed" ? { status: "booked" as const } : {}),
    });
    return ["booked_again", have.id];
  }
  const made = await ports.insert(fresh("booked"));
  return ["booked", made.id];
}

/** A change: the live row the old time named moves to the new one; with none to move, the new time is a booking. */
async function changed(ports: BookingNoticePorts, visit: Visit): Promise<Written> {
  const { tenantId, key, r, fresh, stated } = visit;
  const at = { startsAt: new Date(r.start).toISOString(), endsAt: new Date(r.end).toISOString() };
  const moved =
    r.previousStart !== null
      ? stillAhead(await ports.byClientStart(tenantId, r.client, r.previousStart, SAME_VISIT_MS))
      : null;
  if (moved) {
    // Moved onto a time this client already holds a live row for: that row is the visit now, and the old one is
    // withdrawn. A row that ended there (withdrawn earlier) is not the visit: it leaves the key, and the row that
    // moves takes it. Without that, the ended row refused the booking and the moved one was withdrawn: no visit left.
    const already = await ports.byKey(tenantId, key);
    if (already && already.id !== moved.id) {
      if (stillAhead(already)) {
        await ports.update(tenantId, already.id, { ...stated, ...at, status: "booked" });
        await ports.update(tenantId, moved.id, { status: "cancelled" });
        return ["changed", already.id];
      }
      await ports.update(tenantId, already.id, { externalId: asideKey(key, already) });
    }
    await ports.update(tenantId, moved.id, { ...stated, ...at, externalId: key, status: "booked" });
    return ["changed", moved.id];
  }
  const have = await ports.byKey(tenantId, key);
  if (have && have.status === "cancelled" && visit.ahead)
    return ["changed_unknown", await bookedAgainOver(ports, visit, have)];
  if (have) {
    await ports.update(tenantId, have.id, {
      ...stated,
      ...at,
      ...(have.status === "proposed" ? { status: "booked" as const } : {}),
    });
    return ["changed_unknown", have.id];
  }
  const made = await ports.insert(fresh("booked"));
  return ["changed_unknown", made.id];
}

/** A cancellation: the row the time names ends; with none, the fact is kept as a cancelled row, so it is not lost. */
async function cancelled(ports: BookingNoticePorts, { tenantId, key, r, fresh }: Visit): Promise<Written> {
  const have =
    (await ports.byKey(tenantId, key)) ?? (await ports.byClientStart(tenantId, r.client, r.start, SAME_VISIT_MS));
  if (have) {
    if (have.status === "cancelled") return ["cancelled", have.id];
    const done = await ports.update(tenantId, have.id, { status: "cancelled" });
    return done === "refused" ? ["cancel_refused", have.id] : ["cancelled", have.id];
  }
  const made = await ports.insert(fresh("cancelled"));
  return ["cancelled_unknown", made.id];
}
