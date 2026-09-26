# The phone app, PR 2: push, design

**Date:** 26 Sep 2026 · **Owner:** Ruben · **Status:** proposed, for Ruben's "go" ("merge it once android finishes and
start pr 2", 26 Sep) · **Checked against:** `origin/main` after PR 1 (#1122). PRD `2026-09-26-mobile-app-prd.md`, M6.

## The problem

PR 0 made a phone registrable and a kept row schedulable as a push; PR 1 put the app on the phone. Nothing yet asks
the phone for its token, hands it to the site, opens the right page when a notification is tapped, wears the unread
count on the icon, or reads Expo's receipts, where the dead-device signal mostly arrives. And a leaked device token
can be pushed to by anyone, because the push service takes no key until enhanced push security is on.

## The design

### 1. The phone registers through the page, not beside it

The shell asks for permission and a token (`expo-notifications`, the Android channel created first, as Android 13
requires), then hands the token to the page over the bridge, `{t:"device", token, platform, version}`. The page calls
`PUT me/devices` through its own typed client: the cookie, the same-origin rule and the rate bucket are the page's,
as for every other write. On token rotation the same message again. Before the page walks to `/auth/signout` the
shell asks `{t:"forget", token}` and waits for the page's `{t:"device", state:"forgotten"}` (two seconds at most), then
lets the sign-out go; a forget that never answers is not a reason to hold a person in.

### 2. A tap lands on the page it names

Every kept row carries a hash route (`inbox/th-<id>`, `reports`, `admin/setup`, ...) and the push carries it in
`data.route`. The shell maps the route to a tab: `inbox...` to Inbox, `today` to Today, `calendar` to Calendar,
`clients...` to People, everything else to More; then asks that tab's page to navigate. A tap that starts the app
cold is read with `useLastNotificationResponse`; the route waits in the store until the tab's page reports ready.

### 3. The badge is the bell's number

Unread is what the bell shows: kept rows of the last thirty days newer than the person's `seen_at` and not marked
read (`notification_reads`, `notification_marks`). Two writers, one rule (contracts `unreadFor`):
- the edge, per reader, in the push message's `badge`, so the icon is right while the app is closed;
- the page, on every bell change, `{t:"badge", n}` over the bridge, so opening the bell clears it.

### 4. Receipts, fifteen minutes on

`push_send` keeps the tickets Expo answered with and schedules one `push_receipts` job fifteen minutes later
(migration: `jobs.kind` gains it; `RETRY_WAITS_MS` five minutes then thirty, receipts live a day). The job reads the
receipts through the push port's second door and forgets every phone answered `DeviceNotRegistered`; any other
error is logged by name, once per receipt (`push_receipt_error`), never retried.

### 5. Enhanced push security

`EXPO_ACCESS_TOKEN` is already read by the edge; this PR's runbook step turns enhanced push security on in the Expo
dashboard and sets the variable on Vercel, in that order (the reverse leaves a window where sends are refused).

## What this PR does not do

Quiet hours (the PRD lists them under PR 5's hardening); a push for the held draft's cancel window; Live Activities.

## Decisions

1. **The page registers the phone.** A native fetch could carry the cookie and a hand-set Origin, but then two
   callers of one account route would hold the transport rule; the page already does.
2. **Badge counted twice, by one rule.** Two writers is the cost of a right icon while the app is closed.
3. **Receipts by a job, not inline.** Expo asks for fifteen minutes; a job is the ledger's way to wait.
