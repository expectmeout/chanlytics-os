# People v1 — design

Approved 2026-09-04. Visual: https://claude.ai/code/artifact/1d9c1f1c-1480-490c-9e02-71d0e5628c51

## What it is

The People surface (`#/clients`, nav item "People") flipped from seed data to
real data: a list of everyone who has written to or phoned the business, and
a profile per person. The record is a **timeline**, not a form: what they
said, what the receptionist answered, when a human stepped in, whether they
phoned.

Every fact rendered comes from tables that already exist. No new tables.

## Rules it must honour

- Nothing in the UI states a fact the database cannot support (README).
  Unbacked mockup regions render only under `window.__DEMO_MODE`.
- Preserve the mockup design: branch inside the existing components
  (`XReal` / `XSeed`), never redesign.
- RLS is the floor; `memberContext` + `requireRole` is the door.
- First contact is decided by EVIDENCE (the `metrics_summary` rule): any
  backfilled message means pre-existing; otherwise the earliest real
  `channel_ts` or call `started_at`.

## The six states (one per person, evaluated in this order)

| State | Rule |
|---|---|
| needs_you | any conversation in `needs_human`, or an open escalation |
| waiting_on_you | you own the latest thread (assignee set, or paused by a take-over) and its last message is theirs |
| opted_out | `consent = 'opted_out'` or `dnc` |
| new | no backfill and first contact within 7 days |
| quiet | no message or call in 30 days (or no timestamp at all) |
| active | everyone else |

## List view (`clients-a.jsx`, real branch)

- Rail "Smart lists": Needs you · Waiting on you · New this week · Quiet 30+
  days · Phoned only · Opted out. Computed from the same rows as the table.
  "Saved" lists and "New segment" are demo-only.
- Header stats: People (total) · Needs you (count, oldest) · Reached this week
  (contacts with any message or call in 7 days; split "by the receptionist").
- Triage console: same five tabs (Needs you · Waiting on you · New · Quiet ·
  Active) with counts; the strip shows recency (days since last contact)
  instead of temperature; decision rows show the customer's last words, the
  state reason, and one CTA (Open in Inbox / Profile).
- Table: Client (name, channel glyphs, phone, threads/calls) · State · Last
  contact ("They wrote · 2h ago") · Receptionist · First contact. Sort by
  last contact / name / first contact. Search by name or phone.
- Hidden in real sessions: "New from Leads" strip, bulk bar, Leads / Deal
  board / Lists tabs.

## Profile (`client-profile.jsx`, real branch)

- Hero: initials, name (display_name → WhatsApp name → formatted phone),
  "Since {first contact} · N conversations · N calls · glyphs · consent".
  Actions: **Open thread** (deep link `inbox/<conversationId>`, hidden for
  phone-only people). Call / Book / tags / notes / export are demo-only.
- "Last exchange": last customer line and last reply, verbatim, timestamped.
- Facts strip: First contact · Last contact · Conversations · Calls ·
  Consent · Receptionist.
- "Right now": open escalation (reason, since, Open in Inbox) · queued reply
  · snoozed until · paused, you own it · silent, opted out · answering.
- Timeline: messages, calls and decisions merged, grouped by day, ordered by
  true event time. Calls link to Conversations for playback.
- Rail "About": phone, WhatsApp name, first contact + channel, channels,
  consent (+ source, date), reply window.
- Rail "Receptionist for {name}" ships in PR 3 with its enforcer.
- "Delete this person…" (owner only, typed name) ships in PR 2 on the
  existing erasure route.

## Data

- `people_list(p_tenant_id uuid, p_contact_id uuid default null)` —
  SECURITY INVOKER SQL function returning one row per live contact (not
  erased, not merged) with the facts above. RLS scopes every inner select.
- `GET /api/v1/contacts?workspace=` → `{ people: PersonRowDto[] }`.
- `GET /api/v1/contacts/:id?workspace=` → `{ person: PersonDetailDto }`:
  the row + identities + conversations with messages + calls + escalations
  + decisions.
- `DELETE /api/v1/contacts/:id` already exists.

## Contracts

`packages/contracts/src/people.ts`: `PersonRowDto`, `PersonDetailDto`,
`PersonState`, `personStateFor`, `PEOPLE_LISTS`, `peopleAggregates`,
`toPersonRowVM`, `toPersonVM`. Pure, tested by execution.

## Seam

`peopleOverride` (key `people`, global `__PEOPLE`, event `surface:clients`,
refresh on message inserts) in `surface-data.ts`; registry `clients: real`,
`ROUTE_SURFACE.clients = "people"`; courier `window.__personDetail(id)`.
`clientId` on the Inbox, Conversations and Call view models becomes the
contact id so the existing "Open client" buttons work.

## Out of scope (Tier 2 / 3)

Leads, deals, segments, tags, notes, calendar, visits, revenue, health
scores, multi-agent activity, CSV export.

## Build

PR 1 read-only surface · PR 2 verbs (Open thread, Delete) · PR 3
receptionist mode per person (policy row + runtime lookup + rail control).
