# 0141 · A booking's arrival is kept on its visit, and a week of bookings is counted from it

**Status:** Built on one branch, 18 November 2026, waiting for Ruben's word to push; migration 00647 and the fill go on after the build is live, on his word. Written against main at `b6bc6b3d2e`. Amends 0076 (the day's four figures) and adds a subscriber to 0032's list.

## Context

Today leads its four figures with what was booked (0076, amended 2 November). Since "Today, with colour" (#2400) three of the four carry the seven days behind them: answered, calls and new people, read from Reports' headline (`report_series`). Booked carries none, because nothing counts a day's bookings but today's own read:

- `apps/dashboard/src/server/metrics/bookings.ts` reads the ledger's `appointment.changed` events of the last 26 hours, newest first and **200 at most** (`packages/db/src/repositories/calendar/arrivals.ts`, `ARRIVALS_READ_MAX`), keeps those the bell's rule calls a booking arriving (contracts `bookingArriving`), reads those visits as they stand (db `listBookedVisits`) and counts each once (contracts `bookedOnce`).

Seven days by that read is wrong in two ways. It is cut at 200 changes, and a change is far more than a booking: a move, a cancellation, a member's "they came", every entry the owner adds to their own calendar, and every entry of a calendar on the day it is connected. And a count written in SQL beside it would be a second copy of the rule, which the repository refuses even when the copies agree.

## What was weighed

1. **A paged read in code.** Page the ledger for seven days of changes, run the rule, read the visits by id. No migration, nothing stored, right from its first minute. Refused on its cost at volume, not its effort: it is paid on every open of Today, it grows with every change of a visit and not with bookings, and the visits behind the events can only be asked for by id, a hundred to a request. A busy calendar is dozens of requests an open, and the week a calendar is connected is thousands of rows read to keep none.
2. **A count the database keeps as the event is written.** A trigger that adds one to a day. Refused: the trigger would have to decide what a booking arriving is, in SQL, beside `bookingArriving`; and a count cannot be kept right, since a cancellation, a visit gone from the calendar, a person erased and a booking's copy each change it later without the day's own event.
3. **The rule moved into SQL as its one home.** The doors that write the event already hold every fact the rule reads, so they could say the verdict themselves, and the bell would read it. It is the only way to a count the database returns as seven numbers. Refused here: it rewrites the bell's rule on the path that tells an owner of a booking, to draw seven columns. It stays open as a step of its own if a count ever has to be SQL's.
4. **The moment a booking arrived, stamped on its visit by the rule, where the rule already runs.** Chosen.

## Decision

1. **A visit keeps when its booking arrived: `appointments.arrived_at`** (00647). The ledger's own clock for the event that brought it (`events.created_at`), so a stamp written late says the same moment. Null for a visit that is no customer's booking: a member's own entry, the owner's own diary, a calendar's first read. Indexed by workspace and moment where it is set, so a week of arrivals is one range of a small index, whatever else happened to the calendar.
2. **The bell's rule stamps it, and nothing else does.** A new subscriber of `appointment.changed`, `visit_arrival` (core `SUBSCRIBERS`), asks `bookingArriving` of the event and hands the visit and the event's moment to the record (db `stampVisitArrival`). It is the path that already tells the owner of the booking and marks a reach-out's lead as booked, with the same promises: at least once, twice leaves the same row. The later moment wins, so a hold that was added and then confirmed arrived when it was confirmed, which is the day Today counted it.
3. **A day's bookings are one rule, asked by today's figure and by every day of the week** (`bookedOfDay`, beside today's count in `server/metrics/bookings.ts`): of the visits that arrived that day, those that still stand, start after that day began, each once (`bookedOnce`).
4. **What stands is a booking not taken back:** booked, or since said to have come or not (`kept`, `missed`). Today's figure asked for `booked` alone, which nobody saw go wrong inside one day; over a week it would empty each day as its visits happened and were marked. So today's figure asks the same, and a visit booked this morning that came this afternoon still counts as booked today.
5. **The headline carries the week as a fifth list, `daily.booked`:** up to seven numbers, oldest first and today last, counted in the workspace's own zone from one read of the visits that arrived (db `listArrivedVisits`). Today draws it beside the figure as it draws the other three: today's column is the figure itself, and a week of nothing draws nothing.
6. **The bookings from before the stamp are filled once, by the same rule** (`tooling/scripts/ops/calendar/visit-arrivals-fill.mjs`: a dry run unless told `--apply`, a backup first, a second run finds nothing). It reads the ledger's `appointment.changed` events and stamps through the door the subscriber uses. Production held 931 such events on 18 November.

## What a day counts, in a customer's words

- A booking counts on the day it reached the business, not the day of the visit.
- A booking and the calendar's copy of it are one.
- A booking cancelled since, or removed from the calendar, leaves its day: Tuesday's column falls by one when Tuesday's booking is cancelled on Thursday. The column says what the business still holds of that day's bookings, as today's figure does.
- A visit that has happened since still counts, whether they came or not.
- The owner's own entries, a member's own entry and a calendar's first read never count.

## What it does not do

- **Today's own figure still finds today's arrivals in the ledger**, with its 26 hours and its 200 changes. It can read the stamp instead, which lifts the limit; that waits until the stamp has run on production, since it would make the figure as late as the bell (seconds) where it is now immediate.
- **No count beyond the week.** Reports has no bookings by day. The stamp holds for any period; the read is seven days because seven is what is drawn.
- **Nothing is counted in SQL.** A calendar far past what one business books (thousands of bookings a week) reads its week in pages of a thousand visits.

## Deploy order

The build first, then 00647 (after 00646, the Ads lane's, which took that number first), as 00580 and 00599 were: a build that does not know `visit_arrival` must never be handed its deliveries (it would keep and alarm each as an unknown kind, 00456). Then the fill.

Until the migration is on, a dashboard reads no `arrived_at`, answers no `daily.booked` and says `booked_days_missing` once a read; Today draws booked as it did. The two apps may deploy in either order: a page from before ignores a list it does not read, and a page on a server from before reads no list and draws no week. Between the migration and the fill only the bookings that arrive in those minutes are stamped, so the fill follows at once.

The stamp is no change to the visit: 00647 makes `appointments_set_updated_at` pass a write that sets `arrived_at`, since a reminder drawn for a visit asks whether its row changed after the run read the calendar (contracts `appointmentHolds`), and a stamp landing in between would have held a reminder that should go.

## Tests

- `tests/today/record/a-week-of-bookings.test.mjs`: seven days over a record in memory: a booking cancelled since leaves its day, a booking and its copy are one, a visit that came still counts, a day ends at the workspace's own midnight, today's figure by the same rule, and a database with no stamp yet answers no week.
- `tests/events/a-booking-s-arrival-is-stamped.test.mjs`: the subscriber stamps what the bell's rule calls a booking and nothing else; the harness beside it runs it twice through the real job.
- `tests/calendar/appointments/a-visit-keeps-when-it-arrived.test.mjs`: the stamp's door (the later moment wins, a second delivery moves nothing) and the fill's plan and write.
- `tests/reports/headline/` and `tests/today/phone/today-phone-page.test.mjs`: the list on the wire read from its end, and the week drawn on a phone and a desk, none for a week of nothing or a day nobody counted.
- `tests/calendar/appointments/a-visit-keeps-when-it-arrived.db.test.mjs` (CI's replayed stack): the column, the stamp leaving `updated_at` and the ledger alone, a member's read with who booked, the subscription.

## Risks

- **A stamp follows its event by a job.** A delivery that fails is retried and pages the platform (0032); until it runs, that booking is missing from its day in the week, never from today's figure. The fill is the mend: it stamps whatever the ledger says arrived and no stamp says.
- **One more job for each change of a visit**, in the bell's lane, where nobody waits.
