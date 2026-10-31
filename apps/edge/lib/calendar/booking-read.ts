/**
 * The reading of a booking tool's notice, as the job runner is handed it (docs/plans/2026-10-07-bookings-arrive-by-email.md,
 * step 3): the three things the booking_read job needs from the edge, where the model's key, the spend and the
 * person-making rules are. The shape is contracts' (booking-notice.ts) and the verb is core's (readBookingNotice); this
 * asks and matches.
 *
 *   - ask: Haiku (the registry's booking_read route) through the platform's one JSON-model transport (lib/model.ts
 *     askJson), bounded by the job's time left; a plain-JSON second call when the schema format is refused is part of
 *     the one read. Each call is written to the usage ledger for the notice's workspace, stamped by the delivery it read.
 *   - mayRead: the model's key, and the workspace's one reading of whether it may spend (workspaceMaySpend). No cap of
 *     its own: a salon's notices are a few a day, and a forward loop is refused upstream (ours) and once per delivery.
 *   - personFor: the calendar sweep's own writer (addPeopleFromCalendar: a number makes a person, a name fills only an
 *     empty one, an erased person is not brought back), then the row the number names; an address alone is matched,
 *     never made from (00125).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CALENDAR_SETTING_ROUTE, NOTICE_READ_MAX_TOKENS, NOTICE_SCHEMA } from "../packages/contracts.js";
import { contactIdByEmail, contactIdByPhone, workspaceMaySpend, type Database } from "../packages/db.js";
import type { JobContext } from "../packages/jobs.js";
import { askJson, promptHashOf } from "../model.js";
import { env } from "../env.js";
import { notifyOnce } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";
import { addPeopleFromCalendar } from "./calendar-people.js";

type Db = SupabaseClient<Database>;
type Bookings = NonNullable<JobContext["bookings"]>;

/**
 * The most one read may take of the job's time: a short email into a fixed shape. The whole read's ceiling (both
 * tries, the fallback and the plain-JSON second call, through the signal); one try's bound is the registry's for
 * booking_read (contracts ai/models.ts, READ_TRY_MS), which a caller's bound narrows and never widens (channels
 * tryBound), so a try takes the job's time left only where that is the shorter.
 */
const NOTICE_CALL_MS = 30_000;

/** The reader over this database. The tests give their own clock. */
export function bookingReader(db: Db, over: { now?: () => number } = {}): Bookings {
  const now = over.now ?? Date.now;
  return {
    ask: async (system, user, deadline, forWhom) => {
      const ms = Math.min(NOTICE_CALL_MS, deadline - now());
      if (ms <= 0) throw new Error("booking_read: no time left for the reader");
      const answered = await askJson({
        purpose: "booking_read",
        system,
        user,
        schema: NOTICE_SCHEMA,
        maxTokens: NOTICE_READ_MAX_TOKENS,
        plainJsonHint: "Answer with only a JSON object in the shape asked.",
        timeoutMs: ms,
        signal: AbortSignal.timeout(ms),
        // The read is stamped by its ledger row: the delivery it read (subject) and the hash of what it was told.
        for: { ...forWhom, promptHash: promptHashOf(system) },
      });
      return answered?.answer ?? null;
    },
    mayRead: async (tenantId) => {
      if (!env.ANTHROPIC_API_KEY) return "no_model";
      if (!(await workspaceMaySpend(db, tenantId))) return "may_not_spend";
      return null;
    },
    personFor: async (tenantId, client, visit) => {
      if (client.phone) {
        await addPeopleFromCalendar(db, tenantId, [
          {
            phone: client.phone,
            name: client.name,
            title: visit.title,
            uid: visit.uid,
            start: visit.startMs,
            email: client.email,
          },
        ]);
        return contactIdByPhone(db, tenantId, client.phone);
      }
      return client.email ? contactIdByEmail(db, tenantId, client.email) : null;
    },
    // A notice held for a person: a row on the bell, once per delivery (notifyOnce), no mail. A notice the model could
    // not be asked about (no key, no spend) is not news: the card lists it, and it is read again when a person presses
    // Read again. One the reader failed on every try is told (packages/jobs booking-read.ts).
    tell: async (tenantId, notice) => {
      try {
        const target = await loadTenantNotifications(db, tenantId);
        await notifyOnce(
          { tenantId, ...target },
          {
            kind: "booking_notice",
            // Once per delivery and hold (00419): a Read again that holds it again for the same reason keeps no twin row.
            onceKey: `booking_notice:${tenantId}:${notice.noticeId}:${notice.hold}`,
            // The Business row that shows the emails held for a look (the booking tool's), open: not the top of the tab.
            route: CALENDAR_SETTING_ROUTE,
            about: { type: "booking_notice", id: notice.noticeId },
            // The words Settings › Business says it in: the email, where from, and why a person must look.
            subject: "A booking email needs a look",
            body: `${notice.subject ?? "A booking email"}, from ${notice.tool}: ${notice.reason}`,
          },
          { db },
        );
      } catch {
        // The bell is best effort: the ledger's row is the record, and the card lists it.
      }
    },
  };
}
