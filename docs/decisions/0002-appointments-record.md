# 0002 · An appointments record

**Status:** decided, not built. Written against commit `b729bdf`, and verified
against the code at it, with the working tree as it stood. Where this note and
the code disagree, the code wins.

## Context

### There is no appointments table, by decision

The README says it plainly: _"It does not book... there is no appointments
table here, and nothing in the product can create, move or cancel one."_
`CalendarConfigSchema` (`packages/contracts/src/config.ts:578-585`) enforces it
in the schema: the only field is `ical_url`, _"never credentials to write with.
Nothing is ever booked from here."_

### The calendar is read from the owner's feed, at read time

One iCal address per workspace, fetched and parsed on demand. The board, a
profile and the People list read it through
`apps/dashboard/src/server/calendar.ts` (452 lines); the open windows through
`freeWindows` (`packages/contracts/src/availability.ts`); who the feed names,
and their next and last visit, through
`packages/contracts/src/calendar-people.ts` (630 lines); the hourly sweep
through `apps/edge/api/cron/calendar.ts` (82 lines); the receptionist through
`openingsFor` and `visitsFor` (`apps/edge/lib/availability.ts:144`, `:163`).
`calendar.ts:78` caches the _parse_ while the text is the same and `loadFeed`
caches the text for a few minutes, but nothing is stored: every page load, run
and message that mentions a time re-derives it from the same file.

The only durable trace is a person: `addPeopleFromCalendar`
(`apps/edge/lib/calendar-people.ts:28`) creates a contact from an event that
carries a phone number and writes one `contact.added` event with
`{ source: "calendar", title, uid, start }` (`:68-72`). The appointment is
never kept.

### Bookings are inferred, and not in SQL

`metrics_summary` was last replaced in `supabase/migrations/00037_hygiene.sql`
and `report_series` in `00139_reports_say_where_and_when.sql`; **neither names
a booking, an appointment or a visit**. A search of every migration for `book`
finds only the `booking` policy class (`00012_control_plane.sql:44`), the
`booking_link_v1` template (`00004_inbox.sql:63`), the `booking_link_sent` call
outcome (`00061_call_outcomes.sql:21`) and prose. It is computed **in
TypeScript at read time**: `bookingReport`
(`apps/dashboard/src/server/calendar.ts:435-452`) calls `peopleVisits`, which
fetches and parses the feed, then counts each person for whom `bookedAfterAsk`
holds (`packages/contracts/src/calendar-people.ts:601-605`: an upcoming visit,
or a past one starting no more than a day before they asked);
`toBookingReportVM` (`:607-629`) writes the headline. So the one conversion
line in Reports is a **live parse of an iCal file**, `—` when it cannot be read.

### Playbooks read the calendar too

Two of the six triggers are visit triggers
(`packages/contracts/src/playbooks.ts:30-37`): `visit_tomorrow`, class
`booking`, eligible when `r.nextVisitDate === localDate(r.calendarTz, now + 1
day)` (`:123`); and `visited`, class `reengage`, eligible when
`r.lastVisitDate === localDate(r.calendarTz, now − 1 day) && !r.booked`
(`:124`). Both are day-keyed by the calendar's own clock, never by hours.
`runPlaybook` refuses a visit run with no readable calendar — _"A visit
playbook without a calendar has nothing to read: off, and the run says so"_
(`packages/core/src/campaigns/run-playbook.ts:62-63`). Its context carries
`calendar: "ok" | "unavailable" | "none"` and a `visits` map
(`packages/core/src/campaigns/ports.ts:77-80`), built from the feed in
`apps/edge/lib/playbooks.ts:176-191`; `visitFactsFor`
(`contracts/playbooks.ts:305-310`) then freezes each person's visit time and
service onto their recipient row _"so the send fills the slots without reading
the calendar again"_ (`run-playbook.ts:83-85`).

### `booking_link` is required, and read in four places

`BrainConfigSchema` requires it: `booking_link: z.string().url().max(500)`
(`packages/contracts/src/config.ts:431`) — no `.optional()`, unlike
`phone_display` one line above, whose comment explains at length why absence
became the right answer there (`:415-430`). Its readers: the prompt composer,
unconditionally (`:1110`, resolved at `:1350`); `fallbackMessages`
(`:1499-1508`), which fills `{booking link}` into the greeting, the error and
the non-text messages and already drops a sentence naming a detail the
workspace does not have (`:1495-1497`); the voice tool `send_booking_link`
(`packages/channels/src/voice-shell.ts:137-158`), whose edge door reads
`brain.booking_link.replace(...)` **with no guard**
(`apps/edge/api/retell-fn.ts:270`); and `layerTwo`
(`apps/edge/lib/whatsapp/steps.ts:103`), which already guards on `!!`. Yet
Setup **already says what absence means** — _"No booking link — the
receptionist answers, but cannot send one"_ (`setup.ts:456`).

### The uniform floor a new table must meet

`00120_the_floor_is_uniform.sql` set it: a `revoke all ... from public, anon,
authenticated` beside every deny-all table, and `to authenticated` on every
policy. `00121_a_column_grant_is_a_fence.sql` added that a column grant fences
nothing until the table-wide grant is revoked, and
`00122_a_new_object_starts_closed.sql:30-37` revoked anon's default privileges
in `public`. `00126_a_workspace_has_a_mailbox.sql` is the worked example:
create, unique indexes, a `moddatetime` trigger, RLS on, one `..._member_select
... to authenticated` keyed on `memberships`, a `comment on table`, `alter
publication supabase_realtime add table`.
`tooling/scripts/tests/tenancy.db.test.mjs:15-17` enumerates tenant tables from
PostgREST's own schema, so _"a tenant table nobody added a proof for fails here
by name"_. `00106_a_state_machine_keeps_its_edges.sql` is the guard-trigger
pattern: a `BEFORE UPDATE` trigger that raises on a move the machine does not
permit, a same-state update always allowed _"because refreshing a row's details
is not a move"_ (`:9-10`).

## Decision

An `appointments` table, and a rule about who may write it: **the product never
creates one on its own initiative.** Three sources, each named on the row:
`calendar_feed`, the hourly sweep, which already reads every event and every
attendee and throws them away — the source that backfills; `booking_tool`, a
webhook from whatever does the booking, a generic iCal push first and a named
provider later, the column saying which; and `person`, somebody typing one in
through a `route()`-declared write.

The receptionist is not a source. Its charter is unchanged: it reads the
calendar, offers the open times, sends the link, never confirms a slot.
`check_availability` keeps its sentence — _"Never confirm a slot yourself"_
(`voice-shell.ts:163`) — and no verb writes a row on the model's word.

**The status set comes from the code's own words.** The feed speaks in `next`
and `last` visits; the ICS parser drops `STATUS:CANCELLED`
(`contracts/availability.ts:409-411`); a booking tool says tentative or
confirmed. None of them says whether somebody turned up. So:

| Status      | Who writes it        | Meaning                                                   |
| ----------- | -------------------- | --------------------------------------------------------- |
| `proposed`  | booking tool, person | a hold that is not yet a booking (ICS `TENTATIVE`)        |
| `booked`    | all three            | on the calendar, ahead (ICS `CONFIRMED`, or nothing said) |
| `kept`      | person, or a sweep   | it happened                                               |
| `missed`    | person               | it did not                                                |
| `cancelled` | booking tool, person | withdrawn before it happened                              |

`kept` is the one a sweep may infer, and only from time: an end that has passed
with nobody saying otherwise. Nothing infers `missed` — a calendar cannot know
it, and an invented no-show is what the honesty rule forbids.

**Reports and playbooks read the table, not the feed.** `bookingReport` counts
rows instead of parsing on a page load, and `report_series` gains the number so
Reports can draw it over time. The visit playbooks read the table's day keys
instead of `PersonRowVM`'s derived ones, which keeps `eligibleForPlaybook`'s
rule (`contracts/playbooks.ts:123-124`) letter for letter and changes only
where the dates come from. `run-playbook.ts`'s `calendar !== "ok"` refusal
stays: a workspace whose feed has not synced has nothing to read.

**`booking_link` becomes optional**, the way `phone_display` already is. When
it is absent the prompt omits the line (`config.ts:1110` becomes conditional,
like `phone_display` on `:1109`) and gains one instruction in its place — offer
a call back, and hand the thread to a person; `fallbackMessages` needs no
change, because it already drops a sentence naming a detail that is not there;
`send_booking_link` refuses with an honest sentence a caller can hear rather
than reading `undefined` (`retell-fn.ts:270` is the unguarded read); and the
Setup row, which already says it (`setup.ts:456`), gains the alternative.

That alternative is named, not invented: a **call-back promise**. The
receptionist may say a person will call, because that is a promise the product
can keep — it opens an escalation, the mechanism the whole handoff path already
runs on. A second calendar link is a configuration item, not a capability.

## Shape

```sql
-- <next free number> · An appointment is a record.
create table public.appointments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  contact_id    uuid references public.contacts (id) on delete set null,
  lead_id       uuid references public.leads (id) on delete set null,   -- 00140:197
  -- Where it came from. The product never writes 'receptionist': it does not book.
  source        text not null check (source in ('calendar_feed','booking_tool','person')),
  external_id   text,           -- the source's own id (an ICS UID): the replay gate
  status        text not null default 'booked'
                  check (status in ('proposed','booked','kept','missed','cancelled')),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null check (ends_at > starts_at),
  all_day       boolean not null default false,
  title         text,           -- the calendar's own words, as the feed gave them
  service       text,
  timezone      text not null,  -- a playbook's day key is the business's, never UTC
  vanished_at   timestamptz,    -- the feed stopped naming it: NOT a cancellation (Risks)
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One row per event per source: a re-sync updates, never duplicates.
create unique index appointments_source_uq on public.appointments (tenant_id, source, external_id)
  where external_id is not null;
create index appointments_tenant_start on public.appointments (tenant_id, starts_at);
create index appointments_contact on public.appointments (tenant_id, contact_id, starts_at);
create trigger appointments_set_updated_at before update on public.appointments
  for each row execute function extensions.moddatetime('updated_at');
alter table public.appointments enable row level security;
create policy appointments_member_select on public.appointments for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
-- 00121's rule: revoke the table grant before a column grant fences anything.
revoke insert, update, delete on public.appointments from authenticated, anon;

-- The guard, in 00106's shape: proposed -> booked | cancelled; booked -> kept |
-- missed | cancelled; those three final; a same-status update is not a move.
create or replace function public.appointments_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if NEW.status is distinct from OLD.status then
    if OLD.status in ('kept','missed','cancelled') then
      raise exception 'appointments.status is terminal (% -> % refused)', OLD.status, NEW.status;
    end if;
    if OLD.status = 'proposed' and NEW.status not in ('booked','cancelled') then
      raise exception 'a proposed appointment may only be booked or cancelled (% refused)', NEW.status;
    end if;
  end if; return NEW;
end $$;
create trigger appointments_guard before update on public.appointments
  for each row execute function public.appointments_guard();
```

The verbs, in the house shape — `packages/core/src/appointments/` with
`ports.ts`, `sync-feed.ts` and `set-status.ts`, and the adapter that knows the
table in `apps/edge/lib`:

```ts
export interface AppointmentPorts {
  /** What this source already holds for the window; the sync diffs against it. */
  known(tenantId: string, source: AppointmentSource, fromIso: string, toIso: string): Promise<StoredAppointment[]>;
  upsert(rows: NewAppointment[]): Promise<{ added: number; updated: number }>;
  /** Moved, only FROM the status given: zero rows means somebody moved it first. */
  moveStatus(id: string, from: AppointmentStatus, to: AppointmentStatus): Promise<boolean>;
  /** The person this event names, by the match calendar-people.ts already makes. */
  contactFor(
    tenantId: string,
    who: { phone: string | null; email: string | null; name: string | null },
  ): Promise<string | null>;
  record: ThreadPorts["record"]; // the decisions ledger
  now(): number;
}

export async function syncFeedAppointments(
  ports: AppointmentPorts,
  cmd: {
    tenantId: string;
    tz: string;
    items: FeedItem[];
    window: { fromIso: string; toIso: string };
  },
): Promise<{ added: number; updated: number; vanished: number }>;
```

## Steps

The README rule governs every step: the two apps deploy independently, so each
must be correct whichever goes first.

**1 · The table, written by nothing.** The migration, the guard trigger, the
RLS policy, the revokes, the `tenancy.db.test.mjs` fixture. No reader, no
writer. _Both orders:_ a table neither app has heard of.

**2 · The feed sync fills it.** `apps/edge/api/cron/calendar.ts` already
fetches and parses every workspace's feed each hour and walks every item
(`:55-58`). Add `syncFeedAppointments` beside `addPeopleFromCalendar`, over the
same `FeedItem[]`, matching a contact the way `calendar-people.ts` does. Still
no reader; _both orders:_ the dashboard does not know the table exists.

**3 · Backfill.** A `tooling/scripts` writer at the house bar — dry run by
default, a JSONL backup first, idempotent, `--apply` to mean it — running the
same parse over each workspace's feed and inserting what step 2 would have. A
feed carries only its own horizon (`max_days_ahead`, default 14,
`apps/edge/lib/availability.ts:133`), so the backfill reaches no further back
than that; Reports must say so rather than showing a short history as a real one.

**4 · Reports read the table.** `bookingReport`
(`apps/dashboard/src/server/calendar.ts:435`) counts rows instead of parsing;
`bookedAfterAsk` (`calendar-people.ts:601`) keeps its rule over the stored row;
`BookingReportDto` (`:569-574`) does not change, so neither the view model nor
the page does. _Both orders:_ the edge does not read Reports, and an older
dashboard still parses the feed for the same answer.

**5 · Playbooks read the table.** `apps/edge/lib/playbooks.ts:176-191` builds
its `visits` map from rows; `eligibleForPlaybook`'s two visit branches
(`contracts/playbooks.ts:123-124`) are untouched; `ctx.calendar !== "ok"`
becomes "this feed has not synced since its last due time", a fact the sweep
already stamps (`markCalendarChecked`, `cron/calendar.ts:63`). _Both orders:_
the dashboard does not run playbooks.

**6 · `booking_link` becomes optional.** Add `.optional()` at `config.ts:431`,
make `:1110` conditional, guard `retell-fn.ts:270`, add the call-back sentence
to the prompt and to the Setup row (`setup.ts:456`). _Both orders is the whole
question here:_ the schema is not `.strict()` at the top level but each
**section** is (`config.ts:556-571`), so a config omitting `booking_link` is
rejected by an older edge and the receptionist goes silent on a live line.
Therefore **the edge deploys first, alone**, and the dashboard's save rules
stop requiring the field only in a later release; until then every saved config
still carries one, so both versions parse it.

**7 · A booking-tool webhook.** A signed door under `apps/edge/api`, judged by
a pure `planBookingEvent` the way `planResendEvent`
(`apps/edge/lib/email-ingress.ts:49`) is, writing through step 2's verb with
`source: 'booking_tool'`.

**8 · Status beyond the feed.** The `kept` sweep, and the routes that let a
person say `kept`, `missed` or `cancelled` — each declared with `route()`, each
writing a `decisions` row. In 7 and 8 both apps act on rows the other already
understands, so either order works.

## Tests

**Convert.** `tooling/scripts/tests/calendar-people.test.mjs:511` asserts on
**source text**: it matches `calendar.ts` for two function names. That proves
they exist, not that the count is right, and it breaks in step 4 for the wrong
reason. It becomes a behavioural test of `bookingReport`. **Keep** `:488-494`,
which pins `bookedAfterAsk`'s four cases directly and stays green over the
stored row, and the playbook eligibility tests, which stay green through step 5
unchanged — the proof the day-key rule did not move.

**New.** `appointments.db.test.mjs` — the guard trigger refuses each edge it
should and allows a same-status update, and another workspace's member reads
and writes nothing (`tenancy.db.test.mjs`'s fixture covers the second half).
`sync-feed.test.mjs` — the same feed synced twice adds nothing the second time,
an event that moves updates in place, and an event that disappears is **not**
cancelled (see Risks). `booking-link-optional.test.mjs` — with none, the prompt
omits the line and carries the call-back instruction, `send_booking_link`
refuses in words a caller can hear, and the Setup row says so.

## Risks

- **A vanished event is not a cancellation.** `parseIcs` drops
  `STATUS:CANCELLED` outright (`contracts/availability.ts:409-411`), and an
  unreadable feed returns null (`edge/lib/availability.ts:109-112`) — "gone" and
  "we could not look" are one observation. The sync never writes `cancelled`
  from an absence: it stamps `vanished_at`. Only a webhook or person cancels.
- **Two facts, one appointment.** After step 2 the feed and the table describe
  the same visit, and until step 5 the playbooks read one and Reports the
  other; they can disagree for up to an hour. The cost of 2-4 shipping apart.
- **The optional field.** Step 6 is the one change here that can silence a
  live receptionist if shipped in the wrong order: hence edge-first, with the
  dashboard half a separate release.
- **A table invites a booking verb.** The charter is a decision, not a
  limitation of the schema; once rows exist, "why can't the receptionist just
  write one?" is an easy question to answer wrongly. Relatedly `lead_id` is
  cheap now and awkward later: a lead that becomes a contact must not leave two
  rows pointing at one visit.

## Open questions for the owner

1. **Which is authoritative when they disagree** — the feed or a booking-tool
   webhook? The unique index is per source, so one appointment may hold two
   rows. Does the sync reconcile them, or does Reports count distinct
   `(contact_id, starts_at)`?
2. **How far back does the history go?** The backfill reaches only as far as
   the feed's horizon. Does Reports say "since we started keeping these", or
   does the owner upload one?
3. **Who may say `kept` or `missed`?** `ROLE_PERMS`
   (`packages/contracts/src/config.ts:21-34`) has no permission that fits;
   `approve` (owner and operator) is the closest. Is marking a no-show an
   operator's job or an owner's?
4. **Does `missed` reach the customer?** A no-show is the most natural win-back
   trigger and the likeliest to land badly; as a trigger it needs its own class
   in the Autonomy matrix.
5. **May the receptionist create a `proposed` row** — a hold it offered and the
   customer has not confirmed? This note says no. It is the one place where
   "never books" and "useful" pull apart.
