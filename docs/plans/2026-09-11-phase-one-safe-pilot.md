# Phase One: the Safe Pilot (G0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reach the Retail OS PRD's gate G0, the safe pilot: tenant and credential isolation fixed, the audited inbound loss paths removed, one final send policy enforced at the wire, human ownership protected, and essential paging live, so that adding an unrelated tenant is safe.

**Architecture:** The unmerged branch `claude/busy-bardeen-r5yrxt` (ten commits on 1d17837, verified green in a worktree and against a local database, never through CI) is split into independent PRs by safety boundary, safest first. Three regressions it carries are fixed with executed tests before its send door lands. Two audited loss paths in the SMS ingress get error boundaries and platform alerts. The operator pager from the refactor program's Phase 4 closes the gate. Migrations and auth code are opened as PRs but merged only on Ruben's yes; everything else merges when CI is green.

**Tech Stack:** pnpm 10 workspace (`corepack pnpm`), Node 22, TypeScript, Next.js dashboard, Vercel functions (edge), Supabase Postgres (migrations 00001..00101 applied), node:test with `tsx`, Playwright nightly, GitHub Actions (CI, Database, Nightly e2e).

**Source documents:** the launch audit (artifact 122dce36), the Retail OS PRD (`RetailOS_End_to_End_PRD.html`, G0 and W0/W1), the branch review in memory (`project_chanlytics_refactor_program`), the program doc `docs/plans/2026-09-09-the-system-it-should-be.md` (Phase 4).

---

## House rules for every task

- Work in the worktree `../cm-phase1`; never commit on `main`. One branch per task, from `origin/main`.
- Commit messages are one sentence in this repo's voice, then a blank line, then why. End every commit with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Write commit and PR texts to a file with the Write tool, never inside a shell `&&` chain.
- `pnpm` is not on the shell PATH: run `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm …`.
- A package change requires `corepack pnpm --filter "./packages/*" build`, then `git diff --ignore-cr-at-eol --stat -- packages/*/dist`; files that differ only in line endings are restored with `git checkout -- <file>`; real changes are committed (CI fails on dist drift).
- Never add a `readCode`/`readRaw` assertion. `tooling/scripts/tests/source-scan-ratchet.test.mjs` fails if a file's count rises.
- Merge rule: CI green on a PR I opened → `gh pr merge <n> --repo expectmeout/chanlytics-os --squash --delete-branch` run from the scratchpad directory. Carve-outs that WAIT for Ruben's yes: any PR whose diff adds a file under `supabase/migrations/`, and any PR touching sign-in or sign-up code. Report those as opened, with CI status.
- Migrations reach production only by `supabase db push --linked` after the merged code is deployed, in name order: 00102, 00103, 00104, 00105.

---

### Task 0: The worktree

**Files:** none in the repo.

- [x] **Step 1: Create the worktree from origin/main**

```bash
cd "/c/Users/Ruben/Documents/Claude Projects/Claude Video/chanlytics-messaging"
git fetch origin
git worktree add ../cm-phase1 -b phase1/nightly-green origin/main
```

Expected: `Preparing worktree (new branch 'phase1/nightly-green')`.

- [x] **Step 2: Install dependencies inside it (hoisted linker, no junctions)**

```bash
cd "/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-phase1"
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm install --frozen-lockfile --prefer-offline
```

Expected: ends with `Done in …s`. No `.env.local` is needed for tests or typecheck; `next build` is not run in this plan.

- [x] **Step 3: Prove the toolchain**

```bash
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm -r typecheck
```

Expected: seven projects, no errors.

---

### Task 1: The nightly is green again

The last two scheduled nightlies failed. The People and identity specs hit the profile crash fixed in #328 an hour after the run. `e2e/exports.spec.ts` fails on its own: its header constant predates the offers columns #313 added to the CSV, so it will fail again tonight.

**Files:**
- Modify: `e2e/exports.spec.ts:10`
- Create: `docs/plans/2026-09-11-phase-one-safe-pilot.md` (this document)

- [x] **Step 1: Read the header the export writes**

```bash
grep -n "offers_consent" apps/dashboard/src/server/export.ts
```

Expected: three columns `offers_consent`, `offers_consent_source`, `offers_consent_updated`, placed after `consent_updated`.

- [x] **Step 2: Update the constant**

Replace line 10 of `e2e/exports.spec.ts` with:

```ts
const PEOPLE_HEADER = "name,whatsapp_name,phone,consent,consent_source,consent_updated,offers_consent,offers_consent_source,offers_consent_updated,do_not_contact,channels,conversations,calls,escalations,first_contact,last_message,last_inbound,last_call,receptionist";
```

- [x] **Step 3: Prove the constant matches the writer without a browser**

```bash
node -e '
const fs=require("fs");
const src=fs.readFileSync("apps/dashboard/src/server/export.ts","utf8");
const cols=[...src.matchAll(/^\s*\["([a-z_]+)",/gm)].map(m=>m[1]);
const spec=fs.readFileSync("e2e/exports.spec.ts","utf8").match(/PEOPLE_HEADER = "([^"]+)"/)[1].split(",");
console.log(JSON.stringify(cols)===JSON.stringify(spec) ? "header matches writer" : "MISMATCH\n"+cols+"\n"+spec);'
```

Expected: `header matches writer`. (If the writer's column list is not a literal array of `["name", …]` pairs, compare by eye against the grep in Step 1.)

- [x] **Step 4: Commit, push, open the PR, merge when green**

Commit message (write to a file first):

```
The export spec expects the header the export writes: the offers columns are two days old

#313 split consent into two answers and the people CSV gained three columns.
The nightly's export spec still carried the old header and has failed every run
since. The People and identity specs in the same runs hit the profile crash
#328 fixed an hour after the last one; this PR touches only the spec.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

```bash
git add e2e/exports.spec.ts docs/plans/2026-09-11-phase-one-safe-pilot.md
git commit -F /path/to/commit-msg.txt
git push -u origin phase1/nightly-green
gh pr create --repo expectmeout/chanlytics-os --title "The export spec expects the header the export writes" --body-file /path/to/pr-body.md
gh pr checks <n> --repo expectmeout/chanlytics-os --watch --interval 20
gh pr merge <n> --repo expectmeout/chanlytics-os --squash --delete-branch   # from the scratchpad directory
```

Expected: CI and Database both `pass`; merged; `git fetch origin && git log --oneline -1 origin/main` shows the squash.

---

### Task 2: The carriers' opt-out words, on the texting line only

The branch's commit 234827d added CANCEL, END, QUIT and STOPALL to the one shared pattern, so a WhatsApp customer tapping a "Cancel" quick reply on an appointment template opted out of everything. Twilio's default list (updated for the FCC ruling) is STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE, OPTOUT, and a carrier blocks the number on any of them whatever our record says. So: a second pattern for SMS only, applied after normalisation the way the carrier's own verdict already is; WhatsApp keeps its list.

**Files:**
- Modify: `packages/contracts/src/enums.ts:125-126` (add `SMS_OPT_OUT_PATTERN` beside `OPT_OUT_PATTERN`; leave `OPT_OUT_PATTERN` as it is)
- Modify: `packages/channels/src/sms.ts` (add `CarrierConsent`, `carrierConsent`, `smsKeywordConsent`, `mergeConsent`, `withCarrierConsent`)
- Modify: `apps/edge/lib/whatsapp/inbound.ts` (`InboundCarrier.consent`, apply `withCarrierConsent`)
- Modify: `apps/edge/api/inbound-sms.ts:67-75` (pass the merged consent)
- Test: `tooling/scripts/tests/opt-out.test.mjs`, `tooling/scripts/tests/sms.test.mjs`

- [x] **Step 1: Branch and take the branch's commit without committing**

```bash
cd "/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-phase1"
git fetch origin && git checkout -b phase1/opt-out-words origin/main
git cherry-pick -n 234827d
git checkout HEAD -- packages/channels/dist packages/contracts/dist
git status --short
```

Expected: `enums.ts`, `sms.ts`, `inbound.ts`, `inbound-sms.ts`, `opt-out.test.mjs`, `sms.test.mjs` staged; dist untouched.

- [x] **Step 2: Put the shared pattern back and add the SMS one**

In `packages/contracts/src/enums.ts`, restore the original line and add the new constant under it:

```ts
/** Customer texts that mean opt-out (webhook consent handling, §4). */
export const OPT_OUT_PATTERN = /^\s*(stop|baja|unsubscribe|alto)\s*[.!]?\s*$/i;

/**
 * The carriers' opt-out words, for a TEXTING LINE only.
 *
 * Twilio's default list (STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE,
 * OPTOUT, per the FCC ruling) blocks the number at the carrier whatever our
 * record says, so on SMS our record must agree with theirs: a QUIT we did not
 * recognise left a customer opted in on our side and unreachable on the
 * carrier's, with the next send bouncing and an owner told a delivery failed.
 *
 * WhatsApp has no carrier rule, and its appointment templates carry "Cancel"
 * and "End" buttons that mean a booking, not a goodbye -- so these words are
 * never applied to a WhatsApp message. Whole-message only: "stop by at 4?" is
 * a booking on either channel.
 */
export const SMS_OPT_OUT_PATTERN = /^\s*(stop|stopall|end|cancel|quit|unsubscribe|revoke|optout|baja|alto)\s*[.!]?\s*$/i;
```

- [x] **Step 3: The SMS consent helpers**

In `packages/channels/src/sms.ts`, add `SMS_OPT_OUT_PATTERN` to its contracts import and replace the branch's `carrierConsent`/`withCarrierConsent` block with:

```ts
/**
 * What the carrier already decided about this text, and what the carriers'
 * own words say. Twilio reports OptOutType only when Advanced Opt-Out is on,
 * so the words are read as well: either source is enough, and neither is
 * applied to WhatsApp, which has no carrier rule.
 */
export interface CarrierConsent {
  optOut: boolean;
  optIn: boolean;
}

export function carrierConsent(s: Pick<SmsInbound, "optOutType">): CarrierConsent | null {
  if (s.optOutType === "STOP") return { optOut: true, optIn: false };
  if (s.optOutType === "START") return { optOut: false, optIn: true };
  return null;
}

/** The carriers' opt-out words, whole-message. Opt-in words stay the product's own (START, UNSTOP, RESUME). */
export function smsKeywordConsent(body: string | null | undefined): CarrierConsent | null {
  if (!body || !SMS_OPT_OUT_PATTERN.test(body)) return null;
  return { optOut: true, optIn: false };
}

export function mergeConsent(a: CarrierConsent | null, b: CarrierConsent | null): CarrierConsent | null {
  if (!a) return b;
  if (!b) return a;
  return { optOut: a.optOut || b.optOut, optIn: a.optIn || b.optIn };
}

/** The normalized message with the carrier's verdict added to its own. Either source is enough. */
export function withCarrierConsent(n: NormalizedInbound, c: CarrierConsent | null): NormalizedInbound {
  if (!c) return n;
  return { ...n, optOut: n.optOut || c.optOut, optIn: n.optIn || c.optIn };
}
```

- [x] **Step 4: The ingress passes the merged verdict**

In `apps/edge/api/inbound-sms.ts`, extend the import and the carrier object:

```ts
import { smsInboundFrom, smsAsWaMessage, smsBody, carrierConsent, smsKeywordConsent, mergeConsent, verifyTwilioSignature, SMS_HELD_REASON, SMS_HELD_DETAILS } from "../lib/workspace/channels.js";
…
  const carrier: InboundCarrier = {
    channel: "sms",
    send: async (to, body) => {
      if (!sender) return { ok: false, wamid: null, status: 503 };
      return sender.send(to.startsWith("+") ? to : `+${to}`, body);
    },
    body: (text, isFirstReply) => smsBody(text, isFirstReply),
    held: held ? { reason: SMS_HELD_REASON, details: SMS_HELD_DETAILS } : null,
    // The carrier's verdict and the carriers' words, for this wire only.
    consent: mergeConsent(carrierConsent(inbound), smsKeywordConsent(inbound.body)),
  };
```

`apps/edge/lib/whatsapp/inbound.ts` keeps the cherry-picked change: `consent?: CarrierConsent | null` on `InboundCarrier` and `const n = withCarrierConsent(normalizeInbound(m, value), carrier?.consent ?? null);`.

- [x] **Step 5: Tests, written before the build**

In `tooling/scripts/tests/opt-out.test.mjs`, revert the cherry-picked change to the first test (it must list only `STOP, stop, Stop, stop., BAJA, unsubscribe, alto`) and add:

```js
test("the carriers' words are not WhatsApp opt-outs: a Cancel button means an appointment", () => {
  for (const w of ["cancel", "Cancel", "END", "quit", "STOPALL", "revoke", "optout"]) {
    assert.equal(wa(w).optOut, false, `"${w}" must NOT opt out on WhatsApp`);
  }
  const tapped = normalizeInbound(
    { from: "13475550101", id: "wamid.2", type: "button", button: { payload: "cancel", text: "Cancel" } },
    { contacts: [{ wa_id: "13475550101", profile: { name: "Dana" } }] },
  );
  assert.equal(tapped.optOut, false, "a quick reply whose payload is cancel is a booking action");
});
```

In `tooling/scripts/tests/sms.test.mjs`, add `smsKeywordConsent, mergeConsent, withCarrierConsent` to the channels import and:

```js
test("on a texting line the carriers' words opt out, whole-message, and merge with the carrier's verdict", () => {
  for (const w of ["CANCEL", "cancel", "Quit.", "END", "stopall", "REVOKE", "optout", "Unsubscribe", "baja"]) {
    assert.deepEqual(smsKeywordConsent(w), { optOut: true, optIn: false }, w);
  }
  for (const w of ["can you cancel my 4pm?", "stop by at 4", "end of day is fine", null, ""]) {
    assert.equal(smsKeywordConsent(w), null, String(w));
  }
  assert.equal(mergeConsent(null, null), null);
  assert.deepEqual(mergeConsent({ optOut: false, optIn: true }, { optOut: true, optIn: false }), { optOut: true, optIn: true });
  const n = normalizeInbound(smsAsWaMessage(smsInboundFrom({ ...FORM, Body: "cancel" })), {});
  assert.equal(n.optOut, false, "the shared WhatsApp reading does not know the word");
  assert.equal(withCarrierConsent(n, smsKeywordConsent("cancel")).optOut, true, "the texting line's reading does");
});
```

- [x] **Step 6: Build, run the two files, typecheck**

```bash
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm --filter "./packages/*" build
git diff --ignore-cr-at-eol --stat -- packages/*/dist
node --conditions=react-server --import tsx --test tooling/scripts/tests/opt-out.test.mjs tooling/scripts/tests/sms.test.mjs
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm -r typecheck
```

Expected: both files pass with 0 failures; typecheck clean; only `channels` and `contracts` dist differ for real.

- [x] **Step 7: Full suite, commit, PR, merge when green**

```bash
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm test 2>&1 | tail -6
```

Expected: `# fail 0`. Commit message:

```
The carriers' opt-out words belong to the carriers' channel: a texting line honours them, WhatsApp keeps its own list

A US carrier blocks a number on STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT,
REVOKE or OPTOUT whatever our record says, so on SMS our record now agrees with
theirs, and Twilio's own OptOutType outranks our reading when it arrives.
WhatsApp has no carrier rule and its templates carry Cancel buttons that mean an
appointment, so its list is unchanged. The words are read after normalisation,
the way the carrier's verdict already was, and never applied to the other wire.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

Merge when green (no migration, no auth).

---

### Task 3: Credentials refuse rather than fall back

The branch's commit 4f1e1d9. It applies cleanly on `origin/main` (the branch was built on it). Production is safe by deduction: the pilot line's replies leave on the environment pair and reach customers on the pilot number, so `WHATSAPP_PHONE_ID` equals that channel row's `external_id`, the exact comparison the code makes.

**Files:** the commit's 17 source and test files (see `git show --stat 4f1e1d9`); dist rebuilt, not cherry-picked.

- [x] **Step 1: Branch and pick**

```bash
git fetch origin && git checkout -b phase1/credentials-refuse origin/main
git cherry-pick -n 4f1e1d9
git checkout HEAD -- packages/db/dist packages/jobs/dist packages/channels/dist packages/contracts/dist
```

Expected: no conflicts (if `apps/edge/lib/whatsapp/inbound.ts` conflicts on the import line touched by Task 2, keep both imports).

- [x] **Step 2: Build and prove**

```bash
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm --filter "./packages/*" build
git diff --ignore-cr-at-eol --stat -- packages/*/dist
node --conditions=react-server --import tsx --test tooling/scripts/tests/per-tenant-credentials.test.mjs tooling/scripts/tests/whatsapp-steps.test.mjs tooling/scripts/tests/sms.test.mjs tooling/scripts/tests/shared-limits.test.mjs tooling/scripts/tests/source-scan-ratchet.test.mjs
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm -r typecheck
```

Expected: 0 failures (the credentials test now RUNS the resolver against a fake db instead of reading it; the ratchet accepts the file's count falling to zero); typecheck clean.

- [x] **Step 3: Full suite, commit with the original message, PR, merge when green**

Use 4f1e1d9's commit message verbatim (it is correct), plus the trailer. No migration, no auth: merge when green.

---

### Task 4: One door out, with the three regressions closed

The branch's commits 8b56a35, c24261f, 836c0e9 and b5b8cea, then four fixes with executed tests.

**Files:**
- Cherry-picked: `packages/core/**` (new), `packages/jobs/src/handlers.ts`, `apps/edge/api/jobs/tick.ts`, `apps/edge/api/retell-fn.ts`, `apps/edge/lib/whatsapp/{inbound,persist,alerts}.ts`, `apps/edge/lib/workspace/core.ts`, `apps/edge/package.json`, `packages/jobs/package.json`, `pnpm-lock.yaml`, tests `deliver.test.mjs`, `outbound-send.test.mjs`, `_fake-db.mjs`, `broadcasts.test.mjs`, `veto-window.test.mjs`, `whatsapp-steps.test.mjs`, `brain-v2.test.mjs`, `sms.test.mjs`
- Modify (fixes): `packages/core/src/deliver.ts`, `apps/edge/lib/whatsapp/persist.ts`, `apps/edge/lib/whatsapp/inbound.ts`, `packages/db/src/repositories/thread.ts`, `apps/dashboard/src/server/verbs.ts`, `apps/dashboard/app/api/v1/conversations/[id]/reply/route.ts`
- Test: `tooling/scripts/tests/deliver.test.mjs`, `tooling/scripts/tests/outbound-send.test.mjs`, new `tooling/scripts/tests/reply-cap.test.mjs`

- [x] **Step 1: Branch and pick the four commits in order**

```bash
git fetch origin && git checkout -b phase1/one-door origin/main
for s in 8b56a35 c24261f 836c0e9 b5b8cea; do git cherry-pick -n $s || break; git checkout HEAD -- packages/db/dist packages/jobs/dist packages/channels/dist packages/contracts/dist 2>/dev/null; git commit -q -C $s; done
git log --oneline -5
```

Expected: four commits on top of main. `packages/core/dist` arrives with c24261f (new files, kept). If `inbound.ts` conflicts with Task 2's import line, keep both imports and continue with `git cherry-pick --continue`.

- [x] **Step 2: The failing tests for the regressions (deliver.test.mjs)**

Append to `tooling/scripts/tests/deliver.test.mjs`:

```js
test("a broadcast is a person's words but an automated send: it respects the thread's pause and the workspace's pause", async () => {
  for (const [row, expected] of [
    [thread({ paused_until: new Date(NOW + 60_000).toISOString() }), "human_has_it"],
    [thread({ tenants: { status: "paused" } }), "paused"],
  ]) {
    const t = tables({ conversations: [row] });
    const w = wireOf();
    const out = await deliver(ports(t, w), words({ sender: "human", proactive: true, purpose: "marketing", template: { name: "month_offer", language: "en_US", params: [] } , }));
    assert.equal(out.outcome, "refused", JSON.stringify(row));
    assert.equal(out.reason, expected);
    assert.equal(w.calls.length, 0);
  }
});

test("the receptionist's own escalation pauses the thread and queues its holding message: the queued draft still goes, unless a person spoke since", async () => {
  const paused = thread({ paused_until: new Date(NOW + 24 * 3600_000).toISOString() });
  const draft = { id: "m1", tenant_id: T, conversation_id: "c1", status: "queued", body: "I've passed this to the team.", sender: "ai", direction: "outbound", created_at: "2026-09-10T09:59:00.000Z" };
  {
    const t = tables({ conversations: [paused], messages: [draft] });
    const w = wireOf();
    const out = await deliver(ports(t, w), words({ sender: "ai", messageId: "m1", body: draft.body }));
    assert.equal(out.outcome, "sent", "the holding message reaches the customer");
    assert.equal(t.messages[0].status, "sent");
  }
  {
    const owner = { id: "m2", tenant_id: T, conversation_id: "c1", status: "sent", body: "Hi, Marisa here", sender: "human", direction: "outbound", created_at: "2026-09-10T09:59:30.000Z" };
    const t = tables({ conversations: [paused], messages: [draft, owner] });
    const w = wireOf();
    const out = await deliver(ports(t, w), words({ sender: "ai", messageId: "m1", body: draft.body }));
    assert.equal(out.outcome, "refused");
    assert.equal(out.reason, "superseded_by_human");
    assert.equal(w.calls.length, 0);
  }
});

test("a wire that cannot be read is a failure with its own name, never a throw past the door", async () => {
  const t = tables();
  const w = wireOf();
  const db = fakeDb(t, { "conversations.select": { message: "connection reset" } });
  const out = await deliverSafely({ db, wire: w.wire, now: () => NOW }, words({ sender: "ai" }));
  assert.equal(out.outcome, "failed");
  assert.equal(out.reason, "wire_unreadable");
  assert.match(out.errorBody, /connection reset/);
  assert.equal(w.calls.length, 0);
});
```

Add `deliverSafely` to the import at the top: `const { deliver, deliverSafely, templatePurpose, whatsappSender } = await import(…)`.

- [x] **Step 3: Run the file to see the three new tests fail**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/deliver.test.mjs 2>&1 | grep -E "^not ok|^# (pass|fail)"
```

Expected: `not ok` for the broadcast test (it currently sends), the escalation test (it currently refuses `human_has_it`) and the wire test (`deliverSafely` is not a function); `# fail 3`.

- [x] **Step 4: Fix the door (packages/core/src/deliver.ts)**

Replace `refusalFor`:

```ts
/** Why the door is shut for this send, or null when it may go. */
function refusalFor(d: Delivery, f: WireFacts, nowMs: number): DeliveryRefusal | null {
  // A person who asked to be forgotten is never messaged, whatever the row
  // that survived says.
  if (f.contact.erased_at) return "erased";
  // Consent outranks everything, asked with this message's own purpose.
  const may = mayMessageFor(f.contact, d.purpose, { proactive: d.proactive });
  if (!may.ok) return (may.reason ?? "opted_out") as DeliveryRefusal;
  // A person's own reply goes out even when the machine is told to stop: the
  // pause exists for them, and a paused workspace may still answer by hand.
  // A broadcast is a person's words too, but it is proactive and automated,
  // and it respects the pause like the machine it is.
  if (d.sender === "human" && !d.proactive) return null;
  if (f.tenantStatus === "paused") return "paused";
  // The thread's pause holds an IMMEDIATE send. A queued row was written
  // before the pause it now meets -- the receptionist's own escalation pauses
  // the thread and queues its holding message in the same breath -- so for a
  // queued row the question is not "is the thread paused" but "did a person
  // speak since", which overtakenByHuman answers below; and every take-over
  // path withdraws the draft explicitly besides.
  if (!d.messageId && f.pausedUntil && nowMs < new Date(f.pausedUntil).getTime()) return "human_has_it";
  return null;
}
```

Extend the failed reason union and add `deliverSafely` at the end of the file:

```ts
  | {
      outcome: "failed";
      /** Ours: no wire for the channel, no credentials for it, the provider said no, or the facts could not be read. */
      reason: "no_sender_for_channel" | "no_credentials" | "provider" | "wire_unreadable";
      status: number;
      errorBody: string | null;
      messageId: string | null;
    };
```

```ts
/**
 * The door for a caller that must never see it throw: the webhook, whose
 * outer catch only logs, so a thrown read used to be a customer's reply lost
 * with nobody told. A wire that cannot be read is a failure with its own
 * name, and the caller alerts a person the way it does for a provider's no.
 */
export async function deliverSafely(ports: DeliverPorts, d: Delivery): Promise<Delivered> {
  try {
    return await deliver(ports, d);
  } catch (e) {
    const errorBody = e instanceof Error ? e.message : String(e);
    console.error("deliver_threw", JSON.stringify({ tenant: d.tenantId, conversation: d.conversationId, error: errorBody }));
    return { outcome: "failed", reason: "wire_unreadable", status: 0, errorBody, messageId: d.messageId ?? null };
  }
}
```

- [x] **Step 5: The sink uses the safe door and takes plain meta; the webhook words the failure**

In `apps/edge/lib/whatsapp/persist.ts` replace the sink's `deliver` member:

```ts
    deliver: (to: string, text: string, meta?: Record<string, Json>): Promise<Delivered> =>
      on
        ? deliverSafely(
            { db: db!, wire },
            {
              tenantId: tenantId!, conversationId: ing!.conversation_id, contactId: ing!.contact_id,
              to, channel, sender: "ai", purpose: "conversational", proactive: false,
              body: text, ...(meta ? { meta } : {}),
            },
          )
        : Promise.resolve({ outcome: "failed", reason: "no_sender_for_channel", status: 0, errorBody: "no_database", messageId: null }),
```

and import `deliverSafely` instead of `deliver` from `../workspace/core.js`.

In `apps/edge/lib/whatsapp/inbound.ts`: the send helper becomes `const send = (text: string, meta?: Record<string, Json>) => sink.deliver(from, wire(text), meta);` (import `Json` from `../workspace/db.js` if not present); the reply call becomes `send(replyText, brainMeta as unknown as Record<string, Json>)`; the acknowledgement call (`send(brainCfg!.fallbacks.non_text)`) becomes `send(brainCfg!.fallbacks.non_text, { ack: true })`. In the failed branch, the escalation sentence:

```ts
      sink.escalate("send_failed", sent.reason === "wire_unreadable"
        ? "Auto-reply could not be sent: the thread could not be read at the wire. Customer got no answer."
        : `Auto-reply could not be delivered (HTTP ${sent.status}). Customer got no answer.`),
```

- [x] **Step 6: An acknowledgement does not spend the daily cap**

In `packages/db/src/repositories/thread.ts`, under `isBackfill`:

```ts
/** "Got it, a person will look" is a courtesy, not an answer: it must not spend the cap that stops loops. */
const isAcknowledgement = (m: { meta?: unknown }): boolean =>
  !!m.meta && typeof m.meta === "object" &&
  (m.meta as Record<string, unknown>).ack === true;
```

and the replies filter: `.filter((r) => !isBackfill(r) && !isAcknowledgement(r))`.

New `tooling/scripts/tests/reply-cap.test.mjs`:

```js
/**
 * The daily cap counts the receptionist's answers. An acknowledgement of a
 * photo ("a person will look") is recorded on the thread since the door
 * records every send, and it must not spend the cap that exists to stop
 * loops: three photos in a morning would otherwise silence the receptionist
 * for the day.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { readThreadState } = await import(pathToFileURL(path.join(ROOT, "packages/db/dist/index.js")).href);

const T = "t1", C = "c1";
const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const row = (over) => ({ tenant_id: T, conversation_id: C, direction: "outbound", sender: "ai", status: "sent", type: "text", body: "…", channel: "whatsapp", channel_ts: null, meta: {}, ...over });

test("answers count, acknowledgements and backfills do not", async () => {
  const db = fakeDb({ messages: [
    row({ id: "a1", created_at: at(10), body: "We open at 9" }),
    row({ id: "a2", created_at: at(20), body: "See you then" }),
    row({ id: "k1", created_at: at(30), body: "Got your photo, a person will look", meta: { ack: true } }),
    row({ id: "b1", created_at: at(40), body: "imported", meta: { backfill: true } }),
    row({ id: "h1", created_at: at(50), sender: "human", body: "a person's words" }),
    row({ id: "f1", created_at: at(60), status: "failed", body: "never left" }),
  ] });
  const state = await readThreadState(db, T, C, null);
  assert.equal(state.replies.length, 2, "two answers spent the cap; the ack, the backfill, the person and the failure did not");
});
```

- [x] **Step 7: The reply route refuses a promotional template to someone who has not said yes to offers, with a sentence**

`apps/dashboard/src/server/verbs.ts`: add `marketing_consent: string | null;` to `VerbConversation`, select it (`contacts (phone_e164, consent, dnc, marketing_consent)`), and return `marketing_consent: data.contacts?.marketing_consent ?? null,`.

`apps/dashboard/app/api/v1/conversations/[id]/reply/route.ts`: import `purposeOfTemplate` from `@chanlytics/contracts`; select `category` with the template (`.select("name, language, body_preview, meta_status, category")`); after the approval check:

```ts
    // Which yes this template needs is Meta's category, and the door will ask
    // again at the wire. Asked here too, so the operator hears a sentence now
    // instead of finding a canceled row later.
    if (purposeOfTemplate(tpl.category) === "marketing" && conv.marketing_consent !== "opted_in") {
      throw new AppError("forbidden", "This template is a promotion, and this person has not said yes to offers. Use an appointment template, or ask them first.");
    }
```

- [x] **Step 8: Update the outbox test that pinned the old pause rule**

In `tooling/scripts/tests/outbound-send.test.mjs`, replace the test "the receptionist's draft is retired while a person holds the thread; the person's own words are not" with:

```js
test("under a pause, the receptionist's queued draft goes unless a person spoke since; a person's own reply always goes", async () => {
  const paused = { id: "c1", tenant_id: T, paused_until: new Date(Date.now() + 3600_000).toISOString(), contacts: { consent: "opted_in", dnc: false, marketing_consent: "opted_out", erased_at: null }, tenants: { status: "active" } };
  {
    const db = wrap(tables({ conversations: [paused], messages: [{ id: "m1", tenant_id: T, conversation_id: "c1", status: "queued", body: "I've passed this on", sender: "ai", channel: "whatsapp", direction: "outbound", created_at: WRITTEN }] }));
    const { ctx } = ctxFor(db);
    assert.equal(await dispatchJob(ctx, job()), "done");
    assert.equal(message(db).status, "sent", "the escalation's own holding message reaches the customer");
  }
  {
    const later = new Date(Date.parse(WRITTEN) + 30_000).toISOString();
    const db = wrap(tables({ conversations: [paused], messages: [
      { id: "m1", tenant_id: T, conversation_id: "c1", status: "queued", body: "I've passed this on", sender: "ai", channel: "whatsapp", direction: "outbound", created_at: WRITTEN },
      { id: "m2", tenant_id: T, conversation_id: "c1", status: "sent", body: "Marisa here", sender: "human", channel: "whatsapp", direction: "outbound", created_at: later },
    ] }));
    const { ctx } = ctxFor(db);
    assert.equal(await dispatchJob(ctx, job()), "done");
    assert.equal(message(db).status, "canceled");
    assert.deepEqual(blocked(db).map((d) => d.reason), ["superseded_by_human"]);
  }
  {
    const db = wrap(tables({ conversations: [paused] }));
    const { ctx } = ctxFor(db);
    assert.equal(await dispatchJob(ctx, job()), "done");
    assert.equal(message(db).status, "sent", "a person's reply is never held by the pause that exists for them");
  }
});
```

- [x] **Step 9: Build, run the door files, then everything**

```bash
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm --filter "./packages/*" build
git diff --ignore-cr-at-eol --stat -- packages/*/dist
node --conditions=react-server --import tsx --test tooling/scripts/tests/deliver.test.mjs tooling/scripts/tests/outbound-send.test.mjs tooling/scripts/tests/reply-cap.test.mjs tooling/scripts/tests/broadcasts.test.mjs tooling/scripts/tests/whatsapp-steps.test.mjs tooling/scripts/tests/veto-window.test.mjs
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm -r typecheck
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm lint 2>&1 | tail -3
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm test 2>&1 | tail -6
```

Expected: 0 failures everywhere; lint 0 errors; `git diff --ignore-cr-at-eol` shows real changes in `core`, `db`, `jobs` dist (commit them).

- [x] **Step 10: Commit the fixes as one commit, PR, merge when green**

```
The door holds the pause for the machine, not for a person's reply; a queued draft yields only to a person's words; a wire that cannot be read is a failure with a name

Three regressions the door carried, each now proved by running it. A broadcast
sends as a person but is proactive and automated, so it respects the pause like
main did. The receptionist's own escalation pauses the thread and queues its
holding message in one breath; the queued draft now meets "did a person speak
since" instead of "is the thread paused", and every take-over path withdraws it
explicitly besides. And the sink's door no longer throws past the webhook's
catch: a wire that cannot be read comes back failed, wire_unreadable, and the
people are told. Also: an acknowledgement no longer spends the daily cap, and
the Inbox reply route refuses a promotional template to someone who has not
said yes to offers with a sentence, rather than a canceled row an hour later.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

No migration, no auth: merge when green.

---

### Task 5: A text is never dropped in silence

`apps/edge/api/inbound-sms.ts` throws outside its `try` when the line or its account cannot be read (a 500 to Twilio, which does not retry, and nothing persisted), and answers an unroutable text with 200 and a log line. Twilio retries nothing, so the honest outcomes are: a platform alert on every drop, a 503 when the database failed (so Twilio's error log shows it), and a 200 only when the text was handled or deliberately declined.

**Files:**
- Modify: `apps/edge/api/inbound-sms.ts:39-64`
- Modify: `apps/edge/lib/whatsapp/alerts.ts:71-101` (generalise `alertUnroutable`)
- Modify: `apps/edge/api/whatsapp.ts:145` (call site)

- [x] **Step 1: Generalise the unroutable alert**

Replace `alertUnroutable` in `apps/edge/lib/whatsapp/alerts.ts`:

```ts
const UNROUTABLE_WORDS = {
  whatsapp: {
    subject: "WhatsApp messages are arriving for a channel that is switched off",
    what: (key: string, count: number) => `${count} message(s) just arrived for phone_number_id ${key}, which the control plane will not route (the channel row is missing or its status is not 'active').`,
    fix: "Re-enable the channel in tenant_channels, or confirm this number is not ours.",
  },
  sms: {
    subject: "A text arrived on a line the platform could not handle",
    what: (key: string, count: number) => `${count} text(s) just arrived for ${key} and could not be handled.`,
    fix: "Check the line row, its vault token and its sms channel row; the customer's text was NOT recorded.",
  },
} as const;

export async function alertUnroutable(kind: keyof typeof UNROUTABLE_WORDS, key: string | undefined, count: number, why?: string): Promise<void> {
  const k = `${kind}:${key || "unknown"}`;
  const last = unroutableAlerted.get(k) ?? 0;
  if (Date.now() - last < UNROUTABLE_ALERT_MS) return;
  unroutableAlerted.set(k, Date.now());
  const words = UNROUTABLE_WORDS[kind];
  // Genuinely platform-level: by definition there is no tenant to address, so
  // this is the PLATFORM's own mailbox and carries no customer content — only
  // the number, a count and the reason.
  const delivered = await notify(
    { tenantId: null, notifications: null, isEnvDefault: true },
    {
      subject: words.subject,
      body:
        `${words.what(key || "unknown", count)}${why ? ` Reason: ${why}.` : ""}\n\n` +
        `Nobody is answering these customers and nothing is being recorded. ${words.fix}\n\n` +
        `Further notices for this number are suppressed for 15 minutes.`,
    },
  );
  // Only a delivered notice earns the quiet.
  if (!delivered) unroutableAlerted.delete(k);
}
```

(Keep the existing `UNROUTABLE_ALERT_MS` and `unroutableAlerted`; note the suppression stamp is now claimed before the send and released on failure, which is the existing intent.) Update the WhatsApp call site: `await alertUnroutable("whatsapp", phoneNumberId, v.messages.length);`.

- [x] **Step 2: The ingress with error boundaries**

Replace lines 39-64 of `apps/edge/api/inbound-sms.ts`:

```ts
  const db = pg();
  if (!db) return twiml(503);

  // The line and its account are read before anything is trusted, and a read
  // that fails is said out loud. Twilio does not retry an inbound text, so a
  // throw here was a customer's words gone behind a 500 nobody looked at.
  let line: SmsLine | null;
  let acct: ProviderAccount | null;
  try {
    line = await lineByNumber(db, inbound.to);
    acct = line ? await lineAccount(db, line) : null;
  } catch (e) {
    L.error("sms_line_unreadable", { error: e instanceof Error ? e.message : String(e) });
    await alertUnroutable("sms", inbound.to, 1, "the line or its token could not be read");
    return twiml(503);
  }
  if (!line) {
    L.warn("sms_unknown_line");
    await alertUnroutable("sms", inbound.to, 1, "no line row carries this number");
    return twiml(404);
  }
  if (!acct) {
    L.error("sms_line_without_account");
    await alertUnroutable("sms", inbound.to, 1, "the line has no subaccount or no token in the vault");
    return twiml(503);
  }
  // The dry provider signs nothing, and never exists in production.
  if (line.provider !== "dry") {
    const ok = await verifyTwilioSignature(acct.token, request.url, form, request.headers.get("x-twilio-signature"));
    if (!ok) {
      L.warn("sms_bad_signature");
      return twiml(403);
    }
  }

  const { channel: routed, lookupFailed } = await resolveChannelDetailed(db, "sms", inbound.to);
  if (!routed) {
    L.error(lookupFailed ? "sms_routing_lookup_failed" : "sms_unroutable");
    await alertUnroutable("sms", inbound.to, 1, lookupFailed ? "the sms channel row could not be read" : "the sms channel row is missing or not active");
    return twiml(lookupFailed ? 503 : 200);
  }
```

Add the imports: `import { lineByNumber, lineAccount, smsSenderFor, type SmsLine } from "../lib/sms.js";`, `import type { ProviderAccount } from "../lib/workspace/channels.js";`, `import { alertUnroutable } from "../lib/whatsapp/alerts.js";`.

- [x] **Step 3: Typecheck, the alerts test if one exists, full suite**

```bash
grep -ln "alertUnroutable" tooling/scripts/tests/*.mjs
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm -r typecheck
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm test 2>&1 | tail -6
```

Expected: any test naming `alertUnroutable(` updated to the new first argument; 0 failures. No executed test reaches this handler (it builds its database client from the environment); the change is reviewed by reading and proven by the next real text on the pilot line.

- [x] **Step 4: Commit, PR, merge when green**

```
A text on a line the platform cannot handle is said out loud, never dropped in silence

Two lookups threw outside the ingress's try, answering Twilio with a 500 and
persisting nothing, and an unroutable text answered 200 with a log line. Twilio
retries neither. Every such drop now pages the platform mailbox with the number,
a count and the reason, throttled per number like the WhatsApp alert it mirrors,
and a database failure answers 503 so the provider's own log shows it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

### Task 6: The money lock and the shared limiter (migrations; PR opened, merge on Ruben's yes)

The branch's commits 9481b51 (00102) and c09c3c6 (00103) with their database tests. Both migrations change functions or a column type, not a CHECK, so the generated value sets are unaffected. The dashboard's limiter code is unchanged: the migration alone makes the sign-up limit shared.

**Files:** `supabase/migrations/00102_the_money_lock_holds.sql`, `supabase/migrations/00103_a_limit_counts_a_stranger.sql`, `tooling/scripts/tests/money-lock.db.test.mjs`, `tooling/scripts/tests/rate-limit.db.test.mjs`, `tooling/scripts/tests/shared-limits.test.mjs`.

- [x] **Step 1: Branch and pick both commits with their messages**

```bash
git fetch origin && git checkout -b phase1/money-lock-and-limiter origin/main
git cherry-pick 9481b51 c09c3c6
```

- [x] **Step 2: Prove them on a local database (Docker Desktop must be running)**

```bash
"/c/Program Files/Docker/Docker/Docker Desktop.exe" &
until docker version --format '{{.Server.Version}}' >/dev/null 2>&1; do sleep 5; done
S=/c/Users/Ruben/AppData/Local/npm-cache/_npx/aa8e5c70f9d8d161/node_modules/supabase/dist/supabase.js
node "$S" start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector
node "$S" status -o env | grep -E "^(API_URL|SERVICE_ROLE_KEY)=" > /tmp/localdb.env
export SUPABASE_URL=$(grep ^API_URL /tmp/localdb.env | cut -d= -f2-)
export SUPABASE_SERVICE_ROLE_KEY=$(grep ^SERVICE_ROLE_KEY /tmp/localdb.env | cut -d= -f2-)
node tooling/scripts/gen-schema-sets.mjs --check
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm test:db 2>&1 | tail -6
node "$S" stop --no-backup
```

Expected: 101 + 2 migrations replay; schema sets current; `erasure.db`, `jobs-outbox.db`, `money-lock.db` (3) and `rate-limit.db` (2) all pass. `supabase/seed.sql` removes the production edge URL from Vault on start, so the local clocks post nothing.

- [x] **Step 3: Push and open the PR; do not merge**

PR body must say: "Adds migrations 00102 and 00103. Merge on Ruben's yes; push with `supabase db push --linked` after the deploy." Report CI status.

---

### Task 7: The workspace waits for its owner (sign-up; PR opened, merge on Ruben's yes)

The branch's commit 653f42a plus two fixes: the sign-up page's heading when the code did not send, and a pending time zone that Postgres would refuse.

**Files:** the commit's 14 files (`git show --stat 653f42a`), plus `packages/contracts/src/signup.ts`, `apps/dashboard/app/signup/page.tsx:81`, `tooling/scripts/tests/signup.test.mjs`.

- [x] **Step 1: Branch and pick**

```bash
git fetch origin && git checkout -b phase1/signup-waits-for-owner origin/main
git cherry-pick -n 653f42a
git checkout HEAD -- packages/contracts/dist
```

- [x] **Step 2: The failing test for the time zone**

Append to `tooling/scripts/tests/signup.test.mjs` (it already imports from `@chanlytics/contracts`; add `pendingWorkspaceOf` to that import):

```js
test("what sign-up kept is a prefill, and a clock Postgres would refuse is dropped rather than failing the first Create", () => {
  assert.deepEqual(pendingWorkspaceOf({ pending_workspace: { name: "Glow Studio", timezone: "America/New_York" } }), { name: "Glow Studio", timezone: "America/New_York" });
  assert.deepEqual(pendingWorkspaceOf({ pending_workspace: { name: "Glow Studio", timezone: "Mars/Olympus" } }), { name: "Glow Studio", timezone: null });
  assert.equal(pendingWorkspaceOf({ pending_workspace: { name: "G" } }), null, "a name below the minimum is not worth showing");
  assert.equal(pendingWorkspaceOf(null), null);
});
```

Run it: `node --conditions=react-server --import tsx --test tooling/scripts/tests/signup.test.mjs 2>&1 | grep -E "^not ok|^# fail"` → expected `not ok` on the Mars case.

- [x] **Step 3: Fix the schema and the heading**

In `packages/contracts/src/signup.ts`, import `isTimezone` from `./workspace` and change the schema's time zone to:

```ts
  timezone: z.string().trim().min(1).max(64).nullish().transform((v) => (v && isTimezone(v) ? v : null)),
```

Add to `SIGNUP_WORDS`: `notSentTitle: "We could not send your code",` and in `apps/dashboard/app/signup/page.tsx` line 81 replace `<h1>Your workspace is ready</h1>` with `<h1>{SIGNUP_WORDS.notSentTitle}</h1>`, and fix the comment above the `unsent` branch to say the workspace does not exist yet.

- [x] **Step 4: Build, run signup tests, typecheck, full suite**

```bash
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm --filter "./packages/*" build
node --conditions=react-server --import tsx --test tooling/scripts/tests/signup.test.mjs
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm -r typecheck && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm test 2>&1 | tail -6
```

- [x] **Step 5: Commit (653f42a's message plus a paragraph on the two fixes), push, open the PR; do not merge**

PR body must say: "Touches sign-up and adds migration 00104. Merge on Ruben's yes." Known and accepted: an address that a stranger signed up first keeps the stranger's business name as an editable prefill.

---

### Task 8: The operator pager (Phase 4 of the program; migration 00105; PR opened, merge on Ruben's yes)

Implement `docs/plans/2026-09-09-the-system-it-should-be.md` Phase 4 exactly, with the migration renumbered to `00105_operator_pages.sql`, and the provider-auth caller adapted to the door's outcome (`out.outcome === "failed" && (out.status === 401 || out.status === 403)`).

**Files:**
- Create: `supabase/migrations/00105_operator_pages.sql`, `apps/edge/lib/page-operator.ts`, `tooling/scripts/tests/page-operator.test.mjs`
- Modify: `apps/edge/lib/notify.ts` (export `post`, `platformFrom`, `platformTo`), `apps/edge/api/jobs/tick.ts`, `packages/jobs/src/handlers.ts` (`JobContext.page`), `apps/edge/api/cron/health.ts`, `apps/edge/api/diag.ts`

- [x] **Step 1: The failing behaviour test** (`page-operator.test.mjs`, a hand-rolled fake with `from("operator_pages")` returning canned rows; four cases: first call sends and stamps; second within the window suppresses and counts; after the window sends again; a send that throws leaves `alerted_at` unset). Set `LEAD_TO`/`LEAD_FROM` in the test process so the page is addressed.
- [x] **Step 2: Migration and `page-operator.ts`** as written in the program doc, `PAGE_WINDOW_MS = 6h`.
- [x] **Step 3: Three callers**: the tick pages `jobs_mass_failure` when `counts.failed + counts.gaveUp >= 10`; the outbox pages `provider_auth:<channel>` on a 401/403 from the door; the health sweep pages `jobs_backlog` when `jobs_backlog()` > 0 and reports the number on `/api/diag`.
- [x] **Step 4: Build, tests, typecheck, full suite, local db replay (00105), PR opened; do not merge.**

---

### Task 9: Release and observation (with Ruben)

- [x] Ruben's yes on Tasks 6, 7, 8 → merge in that order → confirm the Vercel deploys → `node $S db push --linked` (applies 00102..00105 in order) → `node $S migration list --linked` shows all five remote.
- [ ] Watch for 24 hours: `select data->>'reason', count(*) from public.events where kind = 'message.send_blocked' and created_at > now() - interval '1 day' group by 1;` (any `not_opted_in` or `no_marketing_consent` on a conversational send is a bug); the edge log for `wa_refused_at_wire` and `deliver_threw`; `sweep_health()` all healthy; tonight's nightly green.
- [ ] Ruben's switches, unchanged by this plan: store the pilot line's WhatsApp token in Vault; confirm `WHATSAPP_TEST_ALLOWLIST` is empty in production; SIGNUP_CODE posture; Stripe live keys; SMTP.
