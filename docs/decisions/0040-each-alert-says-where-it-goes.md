# 0040 · Each alert says where it goes, and who chooses

**Status:** Built in one change on 9 October 2026 (00372), merged with #1533 and applied the next day. Decided by Ruben the same day ("approved as
you suggest"), with its four choices as recommended. Written against commit `39857e8a4` (main, 9 October 2026). Where
this note and the code disagree, the code wins.

## Context

Settings › Notifications listed eighteen kinds of alert as rows to read, each with a tip, and let the owner change two
things: the addresses alerts are emailed to, and whether this browser alerts. What the code does around it:

- **The bell** keeps a row for every kind a workspace is told (`notifications`, 00057), for every member.
- **Email** goes to `tenant_config.notifications.escalation_emails` for the kinds `NOTIFICATION_DELIVERY` marks
  "email" (`packages/contracts/src/today/notification-kinds.ts`), sent by the edge's `notify`, `notifyOnce` and `mail`
  (`apps/edge/lib/ops/notify.ts`). Nothing could turn one kind's email off. "After every phone call" emails every call.
- **Phones** are told, by the `push_send` job (`packages/jobs/src/handlers.ts`), every kept row of a `PUSH_KINDS` kind,
  to every phone of every member of the workspace, whatever their role, with no way to turn one off. The page never
  said so. Three of the kinds `PUSH_KINDS` lists never reached a phone: a review, a note left for you, and a declined
  card or an ending trial are written by `recordNotification` or a SQL function that queue no push.
- **This browser** alerts for what needs you right now (`ALERT_KINDS`), per browser (`legacy-bridge/notifications.ts`).

And four things the page said or did that were not so: Undo after Remove saved with the version read before the
remove, so the server refused it; "What is not listed here is not emailed" overlooked the first run's "you're live"
email; "This device, above" was said where the card it points at is not drawn; the two "to Chanlytics" rows named
Chanlytics' own alerts, which no workspace receives.

## Decision

The page answers three questions in order: where you are told, what you are told about, and who else is emailed. Every
control on it is one the code reads.

1. **Topics, not kinds.** Contracts' `ALERT_TOPICS` replaces `NOTIFICATION_KIND_GROUPS`. A topic is what an owner
   recognises ("After every phone call"), in one of three groups (Needs you, Worth knowing, For your information); it
   names its kinds, and every kind a workspace is told is in exactly one topic or in the bell's own line
   (`BELL_LINE_KINDS`). A topic says, by type, which channels carry it: email "always", "choice" or none, and whether a
   phone is told. A test holds each topic to what its senders do.
2. **Email is the business's.** `notifications.email_off` is the kinds the business is not emailed: optional, read
   leniently (an unknown kind is ignored, so a newer dashboard's write never breaks an older edge's parse, and an older
   edge that drops the field keeps emailing, the safe side). Written by the owner and the partner, as the addresses are,
   through the same whole-config save. The edge asks `emailsFor(notifications, kind)` before every mail: `notify`,
   `notifyOnce`, and `mail` when the caller names its kind (the lead runner's question). "A customer needs a person" and
   "Still waiting" are always emailed: the receptionist must reach someone, and the page shows them locked.
3. **A phone is its person's.** `memberships.push_off` (00372) is the kinds a member's phones are not told in that
   workspace, written by that member alone through `member_push_off_set`, read with their own membership row. The
   `push_send` job leaves out a reader whose `push_off` holds the row's kind; before 00372 is applied it reads as
   empty, so either order of deploy and migration works. `GET /api/v1/me/alerts` answers the member's choices and their
   phones (`push_devices`, their own rows); `PUT` writes the choices. Any role may, for themselves.
4. **Three kinds `PUSH_KINDS` listed and never pushed are pushed.** The Stripe billing notices and a new review keep
   their row and queue the push (`keepAndPush` in notify.ts); `note_for_you_notify` queues it in SQL, as
   `lead_rounds_notify` does. "Still waiting" (`deadman`) joins `PUSH_KINDS`: it is the second alert about a customer
   nobody answered, told once per hold (`notifyOnce` under `deadman:<escalation>`, 00419): the row and the phone go
   with the first try, and a sweep that retries an undelivered warning sends the mail alone, so the phone is told once
   and the bell keeps one row. (It was told with the mail that went, `push: "after_mail"`, until 12 October 2026: the
   phone was spared, but each retry kept a new bell row.) A line's own news of kind `number` (a number provisioned,
   forwarding set, a texting verdict) stays the bell's, as before: it is mostly good news.
5. **A test proves an address.** `POST /api/v1/notifications/test` (owner and partner, three an hour) asks the edge's
   `/api/admin/alert-test`, which emails the workspace's addresses once through `mail()`. Nothing goes to the platform
   when the workspace has no address of its own.
6. **The page** is two cards and a foot. "Where alerts reach you": the bell (always on), email (the addresses, a
   teammate's by their face and name, one not on the team said so; the owner adds, removes, adds a teammate in one
   press, sends a test), your phones (when you have one), this browser (where a browser can alert). "What you're told
   about": the topics in their groups, with an Email tick (the business's; locked where always; read-only for a role
   that may not change settings; off where there is no address) and a Phone tick (yours, when you have a phone), and the
   bell's own line. The foot says what is never sent. Kit parts and Settings' own classes; no Base UI (Settings' bundle).

Smaller corrections in the same change: Undo after Remove saves against the version the server last answered; a job's
failed delivery to a subscriber opens Activity, not Notifications; the settings route's and the profile pane's comments
say who may write and where the device switch is.

## Amended on 15 October 2026: the receptionist stopping is mailed

Point 4 kept every Stripe billing notice on the bell and the phone, and only a number going back was mailed. The wiring's
second audit (S6-11) found the owner first heard that the receptionist had stopped from a customer nobody answered: the
phone app is paused, so the bell was all there was. Ruben, 15 October 2026: the two notices that stop the receptionist are
mailed too, as the business's billing choice on Settings › Notifications allows, and the rest stay on the bell.

- **A plan paused** (`Your receptionist is paused`) and **a card declined** (`A payment did not go through`) go through
  `notifyOnce` (edge `billing/billing-notices.ts` `tellOnce`): the bell's row and the phones, then the mail, told once
  under the change or the Stripe event. A trial started or ending and the receptionist back stay the bell's and the
  phone's (`ringOnce`).
- **A pause never waits on its mail.** The bell is kept before the account's row is written; a mail that does not go is
  said (`billing_mail_owed`) and the row is written all the same, so a mail provider that is down cannot leave a
  workspace answering on a plan that has stopped. A declined card holds nothing back: its mail still owed gives the
  delivery back, and Stripe's retry sends the mail alone.
- **The topic says so:** "A declined card, a paused receptionist and the number going back are emailed."
- Whether Stripe's own customer emails (failed payments, in the Stripe dashboard's Billing settings) also go to the
  business is not readable through Stripe's API, so it was not checked: if they are on, a declined card is told by both.

## Not decided here

Quiet hours for phones; a daily summary email; alerts chosen per address; one email per address instead of one To line;
text or WhatsApp alerts to the owner; delivery checks per address; the owner choosing how long "Still waiting" waits.

## Steps

All in one change, shippable in either deploy order: contracts (topics, `emailsFor`, the config field, the alerts body),
the migration, packages/db (the member's alerts), jobs (the push's skip), the edge (email off, the pushes, the test door),
the dashboard (two routes, the settings read, the page), and their tests.
