# The phone app, PR 2: push

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone registered the first time its person is in, told for every kept row of a `PUSH_KINDS` kind with the
bell's number on the icon, tapped into the page the row names, forgotten before a sign-out and when its receipt says
it is gone. The spec is `docs/superpowers/specs/2026-09-26-mobile-2-push-design.md`; the PRD's M6.

**Architecture:** the edge and the ledger gain `push_receipts` (migration 00189, the contracts kind, its retry waits,
its handler, the push port's receipts door); `push_send` counts each reader's bell number (contracts `unreadFor`) into
the message and keeps its tickets for the receipts job. The bridge gains four shapes (`badge` and `device` from the
page; `device` and `forget` from the shell); the page registers and forgets the phone through its own client and says
the bell's number on every change. The app asks for the token (`expo-notifications`, on a device, the Android channel
first), hands it to the page in front once per token per person, opens a tapped route in the tab that owns it, sets the
icon's number, and has the page forget the phone before a sign-out goes ahead.

**Tech Stack:** as PR 1, plus `expo-notifications` and `expo-device` at the SDK's versions; `sharp` (already in the
tree) generated the white status-bar icon from the mark, once.

**Worktree and branch:** `claude/fervent-brahmagupta-dj2o1e`, off `origin/main` at `5d8b665c` (PR 1 merged).

---

### Task 1: The ledger learns push_receipts, and push_send keeps its tickets

- [x] Migration `00189_a_phone_is_forgotten_by_its_receipt.sql`: the `jobs.kind` CHECK gains `push_receipts`.
- [x] Contracts: `JOB_KINDS`, `schema-sets.generated.ts` (by hand; CI's replay is the check), the kind's words in
      `JOB_WORK`; `PushMessage.badge`, `PushTarget`, `unreadFor` (the bell's rule, once, for both writers),
      `PUSH_RECEIPTS_AFTER_MS`, `BELL_WINDOW_DAYS`.
- [x] Jobs: `PushReceipt.id`, `PushTicket`, `PushPort.receipts`; `push_send` reads each reader's seen moment and
      marks, sends the badge, schedules one `push_receipts` with the tickets a quarter of an hour on; `push_receipts`
      forgets the phones answered `DeviceNotRegistered`; `RETRY_WAITS_MS.push_receipts` five minutes then thirty.
- [x] Edge: `lib/ops/push.ts` keeps the ticket id and asks `getReceipts`, a thousand at a time.
- [x] Tests: `push.test.mjs` (the badge rule, both kinds), `expo-push.test.mjs` (receipts), `push-send.test.mjs`
      (the badge per reader, the tickets, the receipts job), `store-retired.test.mjs` (the kind).

### Task 2: The page registers, forgets, and says the bell's number

- [x] Contracts `app-bridge.ts`: `badge`, `device` (page); `device`, `forget` (shell); `PUSH_TOKEN_MAX`.
- [x] `legacy-bridge/app-bridge.ts`: the two doors through the page's client (injectable), the bell's number at
      install and on every change through `__notifs.onChange`.
- [x] Tests: `app-bridge.test.mjs`, `app-bridge-page.test.mjs`.

### Task 3: The app asks, hands over, opens, counts, forgets

- [x] `shell/notifications-pure.ts` (`tabOf`, `routeOfData`, `badgeOfData`) and `shell/notifications.ts` (the
      foreground handler, `askForToken` on a device after the channel, `setBadge`, `coldStartRoute`, `listen`).
- [x] `state.ts`: `token`, `registered`, `pendingRoute`, `badge`. `bridge.ts`: the badge effect, the device answer,
      `shouldRegister`.
- [x] `Surface.tsx`: asks the page in front to register once per token per person; opens a pending route in its own
      tab; intercepts `/auth/signout` to have the page forget the phone first (two seconds at most).
- [x] `_layout.tsx`: the token at launch and on rotation, the cold-start tap, every warm tap into its tab.
- [x] `app.config.ts`: the `expo-notifications` plugin with the mark in white and the ring's teal.
- [x] Tests: `test/notifications.test.mjs`, `test/bridge.test.mjs`.

### Task 4: The gates and the PR

- [x] `corepack pnpm --filter "./packages/*" build && -r typecheck && lint && test`, `format:check`, the app's
      `tsc`, `expo lint`, a Metro export.
- [x] The squash-merge (#1128), then the production `db push` of 00189 from a linked laptop (either order is safe: an edge
      ahead of the migration swallows the refused receipts insert, never sending an alert twice).

---

## As built (26 Sep 2026)

- **Not proven on a phone here**: no device build exists yet (the Apple account is enrolling; Android's APK from
  PR 1 predates this PR). The first push to a real phone is the day the APNs key and the FCM V1 service account are
  in EAS credentials: `eas credentials` on each platform, then a new build.
- **The receipts' other errors are not logged.** The jobs package has no log port; a receipt that is not "gone" is
  left alone by design (a receipt is never a reason to send again). The spec's "logged by name" waits for a log port.
- **Enhanced push security** is a dashboard switch and a Vercel variable, in that order (docs/runbook.md, "Turn on
  push"). Until both are set, sends work unsigned.
