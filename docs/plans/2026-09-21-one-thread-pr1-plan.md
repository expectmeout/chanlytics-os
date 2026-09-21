# One thread, PR 1 — chats and email are one thread · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A conversation row in Conversations opens the same thread the Inbox opens — `InboxThread`, with its verbs — through one new `ThreadPane`, and that thread looks the same wherever it is mounted.

**Architecture:** `thread-pane.jsx` owns the thread's container: the real verbs (`threadVerbs`), the draft countdown, the repaint notice, and the thread-level helpers they need (moved out of `inbox.jsx`). The Inbox renders `ThreadPane` with the thread it holds and passes the mockup's handlers as `mock`; Conversations renders it by `threadId` for a conversation row. The thread's phone CSS moves from `.inbox …` onto `.ix-thread-pane`.

**Tech Stack:** legacy React JSX (global components on `window`), node:test + tsx stub-React harnesses, contracts in TypeScript (tsup dist).

Spec: `docs/plans/2026-09-21-one-thread.md`. Worktree: `cm-inbox`, branch `design/one-thread`.

**Commands** (from the worktree root; pnpm is `corepack pnpm`):
- one test file: `node --conditions=react-server --import tsx --test tooling/scripts/tests/<name>.test.mjs`
- the suite: `corepack pnpm test`
- packages: `corepack pnpm -r --if-present build` (the dashboard's `next build` fails without Supabase env; ignore it), then restore LF-only dist churn and `apps/dashboard/{tsconfig.json,next-env.d.ts}`.

---

## File map

| File | Responsibility | Change |
|---|---|---|
| `apps/dashboard/src/legacy/pages/thread-pane.jsx` | the one thread: verbs, countdown, repaint, helpers | **create** |
| `apps/dashboard/src/legacy/pages/inbox.jsx` | the Inbox page: list, buckets, bulk, mockup | use `threadVerbs`; render `ThreadPane`; drop repaint + moved helpers |
| `apps/dashboard/src/legacy/pages/conversations.jsx` | the Conversations page: list by channel | conversation rows render `ThreadPane`; a missing link opens nobody else's |
| `apps/dashboard/src/legacy/pages/inbox-thread.jsx` | the thread's drawing | Export in the `…` menu |
| `apps/dashboard/src/legacy-bridge/manifest.ts`, `apps/dashboard/src/legacy/Chanlytics.html` | load order | register `thread-pane.jsx` before `inbox.jsx`; bump `?v=` |
| `apps/dashboard/src/legacy/styles/mobile.css`, `ask.css` | phone rules | thread rules onto `.ix-thread-pane`; Conversations twins |
| `packages/contracts/src/viewmodels.ts` | view models | a Conversations row's words drop an email's quoted chain |
| `tooling/scripts/tests/one-thread.test.mjs` | proof | **create** |
| 7 harnesses | load `thread-pane.jsx` | one import each |

---

### Task 1: A Conversations row says what they wrote, not the chain

**Files:**
- Modify: `packages/contracts/src/viewmodels.ts` (`toConversationVM`)
- Test: `tooling/scripts/tests/email-quoted-reply.test.mjs`

- [ ] **Step 1: Write the failing test** — append to `email-quoted-reply.test.mjs`:

```js
import { toConversationVM } from "@chanlytics/contracts";

test("a Conversations row previews and is searched by what they wrote, not the chain they quoted", () => {
  const body = "Got it, thanks! On Thu, Sep 17, 2026 at 10:44 PM Foo <a@b.com> wrote: > testing back at you >";
  const dto = {
    id: "c1", state: "needs_human", paused_until: null, snooze_until: null, assignee_user_id: null, assignee_is_me: false,
    last_wa_inbound_at: ago(30), last_message_at: ago(30),
    contact: { id: "p1", display_name: "Ruben", wa_profile_name: null, phone_e164: "+16465550123", consent: "opted_in", dnc: false },
    messages: [{ id: "m1", direction: "inbound", sender: "customer", type: "text", body, media: null, meta: null, status: "received", channel: "email", created_at: ago(30), channel_ts: ago(30) }],
  };
  const row = toConversationVM(dto, ZONE, NOW);
  assert.equal(row.snippet, "Got it, thanks!", "REGRESSION: the list previewed the quoted chain");
  assert.equal(row.summary.headline, "Got it, thanks!");
  assert.equal(row.messages[0].text, "Got it, thanks!", "search reads their words, not ours quoted back");
});
```

(merge the `toConversationVM` import into the file's existing contracts import line.)

- [ ] **Step 2: Run it — expect FAIL** (`snippet` still holds the chain).
- [ ] **Step 3: Implement** — in `toConversationVM`, add beside `whoShort`:

```ts
  // What a message says on this surface: an email's own words, without the chain it quoted back
  // (splitQuotedReply) -- the same words its bubble in the thread says. The row previewed and
  // searched "On Thu, Sep 17, 2026 at 10:44 PM … wrote: >" while the thread said "Got it, thanks!".
  const said = (m: MessageDto) => (m.channel === "email" ? splitQuotedReply(messageText(m)).text : messageText(m));
```

and use `said(m)` / `said(last)` / `said(lastInbound)` in place of `messageText(…)` for `text:`, `snippet:` and `summary.headline:`.

- [ ] **Step 4: Rebuild contracts and run — expect PASS:** `corepack pnpm --filter @chanlytics/contracts build`, then the test file.
- [ ] **Step 5: Commit** — `A Conversations row says what they wrote` (with the dist, real diff only).

### Task 2: ThreadPane, the one thread

**Files:**
- Create: `apps/dashboard/src/legacy/pages/thread-pane.jsx`
- Modify: `apps/dashboard/src/legacy-bridge/manifest.ts`, `apps/dashboard/src/legacy/Chanlytics.html`
- Test: `tooling/scripts/tests/one-thread.test.mjs` (create)

- [ ] **Step 1: Write the failing tests** — `one-thread.test.mjs` mounts `ThreadPane` alone on the stub React (harness copied from `thread-on-a-phone.test.mjs`, plus `await import(".../thread-pane.jsx")` and `globalThis.InboxThread = window.InboxThread`), with `window.INBOX_DATA.THREADS = [toInboxThreadVM(conv, null, ZONE, NOW)]`:
  1. by id, it draws `InboxThread` for that thread (`find(tree, n => n.type === InboxThread).props.thread.id === "th-c1"`);
  2. its verbs reach the server with that thread — stub `window.__inboxVerb = async (t, v) => { calls.push([t.id, v]); return { ok: true, data: {} }; }`, `window.canDo = () => true`; call `onTakeOver`, `onSnooze`, `onArchive`, `onSend("th-c1", "hi")`; expect `[["th-c1","take-over"],["th-c1","snooze"],["th-c1","archive"],["th-c1","reply"]]` and `onSend` to resolve `true`;
  3. with the store empty it says it is opening (`data-testid="tp-opening"`) and draws no `InboxThread`;
  4. a `surface:inbox` re-read that moves the thread to Handled draws the pane again with `notice === "Moved to Handled"`; the same re-read landing inside your own verb draws `notice === null`.
- [ ] **Step 2: Run — expect FAIL** (`thread-pane.jsx` does not exist).
- [ ] **Step 3: Create `thread-pane.jsx`** with: `ixDraftKey`, `ixHeld`, `IX_READ_AGAIN_MS/TRIES`, `ixReadAgain`, `IX_BUCKET_WORDS`, `ixRepaintNotice` moved verbatim from `inbox.jsx`; `TP_OWN = window.__threadOwnVerbs`; `threadVerbs(flash)` returning `{ verb, hold }` — `verb` is `inbox.jsx`'s `realVerb` body with `ownVerbsRef` → `TP_OWN.n` and `ppFlash` → `flash`, `hold` is `realVetoAct`'s body with `setVetoTick` → a `bump` argument; `tpVetoLeft(t)`; and `ThreadPane({ thread, threadId, onBack, onOpenClient, notice, flash, mock })`:
  - `t = thread || INBOX_DATA.THREADS.find(id)`; with neither a thread nor an id asked for, draw `InboxThread thread={null}` (the Inbox's empty bucket); with an id not yet in the store, the `tp-opening` EmptyState with "Read it again" (`window.__refreshInbox`);
  - a seeded thread: `<InboxThread … {...mock} />`, as the Inbox always drew it;
  - a real thread: `InboxThread` with `veto={tpVetoLeft(t)}`, `vetoPaused`, and handlers that check `window.canDo("approve")` and call `verb`/`hold` exactly as `inbox.jsx`'s real branches do (`__HANDBACK__` → hand-back; snooze only when not snoozed; wake only when snoozed; hand-back only when taken over; reply-template forwards the chosen template);
  - `surface:inbox` → `ixRepaintNotice(before, after)` when `TP_OWN.n === 0`, kept as `{ threadId, words }` and shown only for that thread; the host's `notice` wins;
  - standing alone (no `thread` given): its own 1 s tick while a real draft counts down, and the re-read at zero (`ixReadAgain`, `window.__refreshInbox`);
  - its own `usePPToast` stack only when the host gave no `flash`.
  - publish `Object.assign(window, { ThreadPane, threadVerbs, ixDraftKey, ixHeld, ixReadAgain, ixRepaintNotice })`.
- [ ] **Step 4: Register it** — `manifest.ts`: `import "@/legacy/pages/thread-pane.jsx";` after `inbox-thread.jsx`; `Chanlytics.html`: `<script type="text/babel" src="pages/thread-pane.jsx?v=1"></script>` after `inbox-thread.jsx`.
- [ ] **Step 5: Run — expect PASS.** Commit: `The thread is one pane`.

### Task 3: The Inbox draws ThreadPane

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/inbox.jsx`
- Modify (one import each, before `inbox.jsx`): `inbox-counts`, `inbox-list-honest`, `inbox-place`, `inbox-reach`, `the-pages-say-only-what-is-true` `.test.mjs` — `await import("../../../apps/dashboard/src/legacy/pages/thread-pane.jsx"); globalThis.ThreadPane = globalThis.window.ThreadPane;`

- [ ] **Step 1: Edit `inbox.jsx`:**
  - delete the moved helpers; top of file: `const { ixDraftKey, ixHeld, ixReadAgain, threadVerbs } = window;`
  - drop `ixHeld`, `ixReadAgain`, `ixRepaintNotice` from its `Object.assign(window, …)` (thread-pane.jsx publishes them);
  - `realVerb` → `const { verb: realVerb, hold: realHold } = threadVerbs(ppFlash);` (after `usePPToast`); `realVetoAct` → `(t, act) => realHold(t, act, () => setVetoTick((n) => n + 1))`;
  - `ownVerbsRef` → `window.__threadOwnVerbs.n` in `runBulk`; delete the ref;
  - `onSwap`: keep the thread open (`setKeepOpenId`) without computing a notice; delete `repaint` state and its two resets;
  - render `<ThreadPane key={activeThread?.id} thread={activeThread} onBack={…} onOpenClient={onOpenClient} flash={ppFlash} mock={{ stale, onReconcile, onDismissStale, onDecide: decide, onVerdict: verdictDecide, veto, vetoPaused, onVetoAct: vetoAct, onSnooze: snooze, onSend: sendReply, onTakeOver: takeOver, onWake: wake, onHandBack: handBack, onMarkUnread: markUnread, onArchive: archiveThread, planParam, onPlanParam }} />` in place of `<InboxThread …/>`.
- [ ] **Step 2: Add the five harness imports.**
- [ ] **Step 3: Run the suite — expect PASS**, in particular `inbox-place`'s two repaint tests unchanged ("Moved to Handled"; no notice for your own archive). Commit: `The Inbox draws the one thread`.

### Task 4: Export is in the thread's menu

**Files:** Modify `apps/dashboard/src/legacy/pages/inbox-thread.jsx` (`ThreadHeader`'s `MoreMenu`); test in `one-thread.test.mjs`.

- [ ] **Step 1: Failing test:** open the header's `MoreMenu` items for a real thread; an item labelled `Export` whose `onClick` downloads `window.__href("GET conversations/[id]/export", { id: thread.conversationId })` (stub `__href` and capture the anchor `document.createElement` returns).
- [ ] **Step 2: Implement:** after Archive, for `thread.real && thread.conversationId && window.__href`: `{ label: "Export", icon: "external", onClick: () => ixDownload(window.__href("GET conversations/[id]/export", { id: thread.conversationId })) }`, with `ixDownload(href)` creating an `<a download>` and clicking it.
- [ ] **Step 3: PASS.** Commit: `Export is in the thread's menu`.

### Task 5: Conversations opens the one thread

**Files:** Modify `apps/dashboard/src/legacy/pages/conversations.jsx`; tests `conversations-doors.test.mjs`, `one-thread.test.mjs`, `e2e/phone.spec.ts`; imports in `conversations-doors`, `conversation-channels`.

- [ ] **Step 1: Failing tests** (`one-thread.test.mjs`, mounting `ConversationsPage` with a `toConversationVM` row and its `toInboxThreadVM` thread in `INBOX_DATA`): the reading pane is `ThreadPane` → `InboxThread` for `th-c1`; no "View thread in Inbox" button and no `cv-summary`; a `toCallVM` row still draws `cv-viewer`; `initialId: "c-gone"` draws `cv-missing-thread` and no `InboxThread`.
- [ ] **Step 2: Implement:** `cvOneThread = (c) => !!c && !window.__DEMO_MODE && !c.callId && !!c.threadId`; render `<ThreadPane key={selected.threadId} threadId={selected.threadId} onBack={() => setPhoneOpen(false)} onOpenClient={(id) => window.CHANLY.nav(window.CHANLY.R.client(id))} />` for such a row; a missing link (production) draws an EmptyState page (`cv-missing-thread`) in place of any conversation; call rows and the mockup's seeded rows keep `CvViewer`.
- [ ] **Step 3: Update `conversations-doors`**: A7/A9/A23 asserts the chat IS its thread (the pane draws `InboxThread` for `th-c1`, "by your team" in it) instead of a door button; A26 asserts the notice is the reading pane's (`cv-missing-thread`) and no other conversation opens. `e2e/phone.spec.ts`: the pane is `.cv-viewer, .ix-thread-pane`; Back is `cv-back` or `ix-back`.
- [ ] **Step 4: PASS.** Commit: `Conversations opens the one thread`.

### Task 6: One look wherever it is mounted

**Files:** `apps/dashboard/src/legacy/styles/mobile.css`, `ask.css`, `Chanlytics.html` (`?v=` bumps).

- [ ] **Step 1:** in the 720px block, `.inbox .ix-th-actions`, `.inbox .ix-th-actions .btn-icon`, `.inbox .ix-context-strip`, `.inbox.phone-thread .ix-take`, `.inbox .tl-event-time`, `.inbox .tl-msg-why-full`, `.inbox .tl-msg-why-short`, `.inbox .tl-msg-bubble`, `.inbox .more-menu`, `.inbox .more-backdrop`, `.inbox .more-item` → `.ix-thread-pane …`.
- [ ] **Step 2:** Conversations: `.conversations .ix-thread-pane` hidden with `.cv-viewer`; shown with `.phone-detail`; `.conversations.phone-detail > .empty-page` shown; `.main:has(.conversations.phone-detail) .stabs` hidden; `ask.css`: `body:has(.conversations.phone-detail) .phone-ask` hidden.
- [ ] **Step 3:** bump `?v=` in `Chanlytics.html` for every legacy file changed. Commit: `The thread looks the same wherever it opens`.

### Task 7: Prove it and ship

- [ ] `corepack pnpm test` (0 failures), typecheck, lint, rebuild every package, restore LF-only dist churn and Next's tsconfig churn, `check:dist`.
- [ ] Push `design/one-thread`, open the PR, watch CI.
- [ ] On Ruben's yes, squash-merge; after deploy, on production at 375 and desktop: ruben@rjcapital.io from each tab is the same thread (same header, bubbles, verbs), measured.
