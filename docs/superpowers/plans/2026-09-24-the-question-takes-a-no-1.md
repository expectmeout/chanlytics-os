# The question can be answered — Implementation Plan (PR 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A search that stops to ask can be answered yes, include, change what I asked, or stop, and the owner hears
about it where they are (bell, Today, email, device alert), landing on the places the question is about.

**Architecture:** The spec is `docs/superpowers/specs/2026-09-24-the-question-takes-a-no-design.md`. This PR is items
1–4 and 6–9 of it; PR 2 (`…-2.md`, written after this merges) is item 5, the re-judge. Contracts hold every word;
the finder's existing answer mode (`finderMore.answer`) becomes whole; the runner tells the edge when it asks; the
trigger stays the one writer of the bell's row.

**Tech stack:** TypeScript contracts/core/edge, the legacy classic-script JSX pages, Postgres (Supabase), node:test on
tsx, the stub-React harnesses.

**Worktree:** `Claude Video/cm-lead-question`, branch `feat/the-question-takes-a-no`, off `5df49c26`.

**Run a test file:** `node --conditions=react-server --import tsx --test tooling/scripts/tests/<file>` from the
worktree root. DB tests need the local stack (`SUPABASE_URL`, keys); without it they skip and CI runs them.

---

## File map

| File | Responsibility | Tasks |
| --- | --- | --- |
| `apps/dashboard/src/server/leads.ts` | the question's key read off the stored shape | 1 |
| `packages/contracts/src/notifications.ts` | `clients/leads` verb, the kind's own verb, `ALERT_KINDS` | 2 |
| `packages/contracts/src/today.ts` | `AWAY_NOUN.leads_question` | 2 |
| `packages/contracts/src/leads.ts` | `leadQuestionTitle`, `LEAD_QUESTION_WAIT_LINE`, `leadQuestionRoute`, `leadQuestionMail` | 3 |
| `apps/dashboard/src/legacy-bridge/notifications.ts` | alerts on kept rows | 4 |
| `supabase/migrations/00163_the_question_says_where_it_waits.sql` | the trigger's title, route, silence | 5 |
| `packages/core/src/leads/{ports,runner}.ts` | `tell` port; the term dropped on keep only | 6 |
| `apps/edge/lib/ops/notify.ts` | `mail`, the addressing half of `notify` | 7 |
| `apps/edge/lib/leads/lead-tell.ts` (new), `lead-pipeline.ts` | the question's email | 7 |
| `apps/dashboard/src/legacy/pages/leads-finder.jsx` | the strip's four answers; answer mode in the finder and card | 8, 9 |
| `apps/dashboard/src/legacy/pages/clients-a.jsx`, `leads-scope.jsx` | the page's answer mode, fresh Find, the waiting view | 10 |
| `apps/dashboard/src/legacy/styles/leads.css` | the four answers on a phone, the question over the input | 9 |
| `apps/dashboard/src/legacy-bridge/seed-globals.ts` | the wait line in `__LEAD_VM` | 3 |

---

### Task 1: The question reaches the page

**Files:** Modify `apps/dashboard/src/server/leads.ts` (`toSearchDto`, ~line 384). Test
`tooling/scripts/tests/lead-routes.test.mjs`.

- [ ] **Step 1: Failing test.** Add after the "the searches read brings the rail's counts" test. It builds the
  question with core's own `afterProbe`, stores it on the view row exactly as `lead_collect_commit` keeps it, and reads
  it through `GET lead-searches`.

```js
test("the question the runner asks reaches the page with its exclusion's key: the stored shape is core's own", async () => {
  const { afterProbe } = await import("../../../packages/core/src/leads/question.ts");
  const members = [
    ...Array.from({ length: 8 }, () => ({ class: "excluded", excluded_by: "chains", term: "gym", phone: null, email: null })),
    ...Array.from({ length: 4 }, () => ({ class: "qualified", excluded_by: null, term: "gym", phone: "+15125550100", email: null })),
  ];
  const plan = { ...PLAN, exclusions: [{ key: "chains", text: "Chain gyms", origin: "claude" }] };
  const asked = afterProbe(plan, members, new Date("2026-09-24T04:30:00Z"));
  assert.equal(asked.kind, "ask");
  const ctx = ctxFor("owner", {}, {}, { lead_searches_view: [view({ plan, question: asked.question })] });
  const res = await searches.GET.run(get(inA), ctx);
  assert.deepEqual(res.searches[0].round.question, {
    sentence: asked.question.sentence,
    criterion_key: "chains",
  });
});
```

(`view`, `ctxFor`, `get`, `inA`, `searches` are the file's own helpers; if `view()` takes no overrides, spread:
`{ ...view(), plan, question: asked.question }`. If the route's `.run` answers `{ data }`, read `res.data.searches`
the way the neighbouring GET test does.)

- [ ] **Step 2: Run, expect FAIL** — `criterion_key: ""` against `"chains"`.
- [ ] **Step 3: Implement.** In `toSearchDto`:

```ts
/** The key lead_rounds.question is kept under: core's RoundQuestion writes criterionKey (ports.ts). */
const questionKeyOf = (q: { criterionKey?: unknown; criterion_key?: unknown }): string =>
  typeof q.criterionKey === "string" ? q.criterionKey : typeof q.criterion_key === "string" ? q.criterion_key : "";
```

and the cast becomes `{ sentence?: unknown; criterionKey?: unknown; criterion_key?: unknown }`, the DTO field
`criterion_key: questionKeyOf(q)`.

- [ ] **Step 4: Run, expect PASS.** Also update the file's `view()` default `question: { sentence: "…" }` to the real
  shape `{ sentence: "…", criterionKey: "chains", dropTerm: null, asked_at: "2026-09-19T00:00:00Z" }` and re-run the
  file.
- [ ] **Step 5: Commit** — "The question reaches the page with the key the runner keeps it under".

### Task 2: The bell says Leads, and the question says Answer it

**Files:** `packages/contracts/src/notifications.ts`, `packages/contracts/src/today.ts`. Tests
`notifications-durable.test.mjs`, `today-away-page.test.mjs` (or the file whose other tests call `todayAwayGrouped`
directly; read its first test for the row shape).

- [ ] **Step 1: Failing tests.** In `notifications-durable.test.mjs`:

```js
test("a search's rows say Leads: a finished one opens Leads, and one that asks keeps its own verb", () => {
  const [asks, done] = serverNotificationRows({
    notifications: [
      row({ id: "44444444-4444-4444-8444-444444444444", kind: "leads_question", title: "Your search for wedding photographers is waiting for your answer", body: "Some of the first 16 are large studio chains.", route: "clients/leads:s-a516a5a6-ecb5-4ad1-96bf-56a65afceac8:c-excluded" }),
      row({ id: "55555555-5555-4555-8555-555555555555", kind: "leads_ready", title: "Your search for florists is done", body: "12 found.", route: "clients/leads:s-a516a5a6-ecb5-4ad1-96bf-56a65afceac8", created_at: new Date(NOW - 120_000).toISOString() }),
    ],
    seen_at: null,
  });
  assert.deepEqual([asks.action, asks.tone, asks.to], ["Answer it", "warn", "clients/leads:s-a516a5a6-ecb5-4ad1-96bf-56a65afceac8:c-excluded"]);
  assert.equal(done.action, "Open Leads", "not People: the route names Leads");
  assert.ok(ALERT_KINDS.includes("leads_question"), "a question that waits a day wakes the device");
});
```

(import `ALERT_KINDS` beside `serverNotificationRows`). In the Today file, a test that two unread `leads_question`
rows group as one line titled "2 searches are waiting for your answer".

- [ ] **Step 2: Run, expect FAIL** ("Open People", no group).
- [ ] **Step 3: Implement.**
  - `SERVER_LOOK`'s type gains `own?: true`; `leads_question: { icon: "alert", tone: "warn", action: "Answer it", to: "clients/leads", own: true }`.
  - `ROUTE_VERBS`: before `[/^clients/, "Open People"]` add `[/^clients\/leads/, "Open Leads"]`.
  - `serverNotificationRows`: `action: look.own ? look.action : (verbForRoute(n.route) ?? look.action)`.
  - `ALERT_KINDS = ["needs_you", "held_draft", "missed_call", "leads_question"]`.
  - `today.ts` `AWAY_NOUN`: `leads_question: ["search is waiting for your answer", "searches are waiting for your answer"]`.
- [ ] **Step 4: Run both files, expect PASS.**
- [ ] **Step 5: Commit** — "The bell says Leads for a search, and a question says Answer it".

### Task 3: The question's words, once

**Files:** `packages/contracts/src/leads.ts`, `apps/dashboard/src/legacy-bridge/seed-globals.ts`. Test
`leads-vm.test.mjs`.

- [ ] **Step 1: Failing test.**

```js
test("a question's words are said once: the bell's title, the wait line, where it opens, and the email", () => {
  assert.equal(leadQuestionTitle("wedding photographers"), "Your search for wedding photographers is waiting for your answer");
  assert.equal(LEAD_QUESTION_WAIT_LINE, "Nothing is spent while this waits. With no answer in a day, it stops and keeps what it found.");
  assert.equal(leadQuestionRoute("s1"), "clients/leads:s-s1:c-excluded");
  const m = leadQuestionMail({ name: "wedding photographers", sentence: "Some of the first 16 are large studio chains, which I'm leaving out. Is that what you meant?", link: "https://app.chanlytics.com/w/salon#/clients/leads:s-s1:c-excluded" });
  assert.equal(m.subject, "Your search for wedding photographers is waiting for your answer");
  assert.equal(m.body, [
    "Some of the first 16 are large studio chains, which I'm leaving out. Is that what you meant?",
    "",
    "Nothing is spent while this waits. With no answer in a day, it stops and keeps what it found.",
    "",
    "Answer it: https://app.chanlytics.com/w/salon#/clients/leads:s-s1:c-excluded",
  ].join("\n"));
});
```

- [ ] **Step 2: Run, expect FAIL** (not exported).
- [ ] **Step 3: Implement** in `leads.ts` near `leadsStanding`:

```ts
/** The bell's title and the email's subject when a search stops to ask (00163 writes the same words in SQL). */
export const leadQuestionTitle = (name: string): string => `Your search for ${name} is waiting for your answer`;
/** What waiting costs and how long it lasts (lead_rounds_notify, the sweep's QUESTION_WAIT_MS): the strip and the email. */
export const LEAD_QUESTION_WAIT_LINE =
  "Nothing is spent while this waits. With no answer in a day, it stops and keeps what it found.";
/** Where a question opens: its search, on the pile it asks about (a question is only asked about places left out). */
export const leadQuestionRoute = (searchId: string): string => leadsRoute({ searchId, cls: "excluded" });
/** The email the runner sends when a search stops to ask. */
export function leadQuestionMail(x: { name: string; sentence: string; link: string }): { subject: string; body: string } {
  return {
    subject: leadQuestionTitle(x.name),
    body: [x.sentence, "", LEAD_QUESTION_WAIT_LINE, "", `Answer it: ${x.link}`].join("\n"),
  };
}
```

and in `seed-globals.ts` add `LEAD_QUESTION_WAIT_LINE` to the `__LEAD_VM` object and its type.

- [ ] **Step 4: Run, expect PASS.** **Step 5: Commit** — "A question's words live once".

### Task 4: A kept question wakes the device

**Files:** `apps/dashboard/src/legacy-bridge/notifications.ts`. Test `notifications.test.mjs`.

- [ ] **Step 1: Failing test.**

```js
test("a kept row of an alerting kind wakes the device like a derived one: not the backlog, only new, only in the background", async () => {
  const mod = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/legacy-bridge/notifications.ts")).href);
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const handlers = {};
  const fired = [];
  class FakeNotification {
    static permission = "granted";
    constructor(title, opts) { fired.push({ title, tag: opts.tag, body: opts.body }); this.close = () => {}; }
    static async requestPermission() { return "granted"; }
  }
  const kept = (id, kind, title, body, route) => ({ id, kind, title, body, route, subject_type: "lead_round", subject_id: id, created_at: new Date().toISOString(), read: false, dismissed: false });
  const win = {
    addEventListener: (ev, fn) => { handlers[ev] = fn; },
    document: { visibilityState: "hidden" }, focus: () => {}, location: { hash: "" },
    Notification: FakeNotification,
    INBOX_DATA: { THREADS: [] }, __LIVE: { now: [], recent: [] }, __TEAM_INVITES: [],
  };
  const api = mod.installNotifications(win, storage);
  await api.setAlerts(true);
  handlers["surface:inbox"](); // a first look before the bell's rows have loaded
  win.__NOTIFICATIONS = { dto: { seen_at: null, notifications: [kept("11111111-1111-4111-8111-111111111111", "leads_question", "Your search for florists is waiting for your answer", "Most of the first 25 are chains.", "clients/leads:s-1:c-excluded")] } };
  handlers["surface:notifications"]();
  assert.deepEqual(fired, [], "the rows there when the bell first loads are the backlog");
  win.__NOTIFICATIONS.dto.notifications.unshift(
    kept("22222222-2222-4222-8222-222222222222", "leads_question", "Your search for wedding photographers is waiting for your answer", "Some of the first 16 are large studio chains.", "clients/leads:s-2:c-excluded"),
    kept("33333333-3333-4333-8333-333333333333", "leads_ready", "Your search for bakers is done", "9 found.", "clients/leads:s-3"),
  );
  handlers["surface:notifications"]();
  assert.deepEqual(fired, [{ title: "Your search for wedding photographers is waiting for your answer", tag: "n:22222222-2222-4222-8222-222222222222", body: "Some of the first 16 are large studio chains." }], "the new question only; a finished search waits for the bell");
});
```

- [ ] **Step 2: Run, expect FAIL** (nothing fires).
- [ ] **Step 3: Implement** in `installNotifications`: import `serverNotificationRows`; keep a second `knownKept: Set<string> | null`, set the first time `win.__NOTIFICATIONS?.dto` exists; in `notice()`:

```ts
const keptNow = win.__NOTIFICATIONS?.dto
  ? serverNotificationRows(win.__NOTIFICATIONS.dto).filter((r) => r.unread && ALERT_KINDS.includes(r.kind))
  : null;
let freshKept: typeof keptNow = [];
if (keptNow) {
  const keys = new Set(keptNow.map((r) => r.key));
  freshKept = knownKept === null ? [] : keptNow.filter((r) => !knownKept!.has(r.key));
  knownKept = keys;
}
```

and the alert loop takes `[...fresh, ...freshKept]` (each has `title`, `message`, `key`, `to`). The derived `known`
logic is unchanged.

- [ ] **Step 4: Run the file, expect PASS.** **Step 5: Commit** — "A kept question wakes the device".

### Task 5: The bell's row says where it waits (migration, red run first)

**Files:** Test `tooling/scripts/tests/leads.db.test.mjs` (the "the bell rings twice" test, ~line 474). Create
`supabase/migrations/00163_the_question_says_where_it_waits.sql` (re-list `supabase/migrations` on origin/main and
#959's `00162` before choosing; take the next free number).

- [ ] **Step 1: Change the test first.** The stored question takes the real shape
  `{ sentence, criterionKey: "chain", dropTerm: null, asked_at }`; expect title
  `"Your search for personal trainers is waiting for your answer"` and route `` `clients/leads:s-${ids.search}:c-excluded` ``.
  Add: a second search's round moved `probing → waiting_on_owner`, then ended with
  `db.rpc("lead_round_end", { p_round_id, p_ending: "question_unanswered" })`, rings no `leads_ready` row for that round.
- [ ] **Step 2: Commit the test alone and push; wait for the database workflow to go red** (house rule).
- [ ] **Step 3: The migration.** `create or replace function public.lead_rounds_notify()`: 00142's body word for word
  except the title `'Your search for ' || v_name || ' is waiting for your answer'`, the route
  `'clients/leads:s-' || NEW.search_id::text || ':c-excluded'`, and the ending test
  `coalesce(NEW.ending, '') not in ('stopped', 'question_unanswered')`. Re-state the `comment on function` and the
  `revoke execute … from public, anon, authenticated`. Header comment: why (the bell sent the owner to an empty view and
  rang "is done" over a question nobody answered).
- [ ] **Step 4:** Apply on the local stack in a rolled-back transaction (docker cp + psql `begin; \i …; rollback;`) and
  run `migrations.test.mjs`. **Step 5: Commit** — "The question says where it waits (00163)".

### Task 6: The runner tells, and drops the term only on yes

**Files:** `packages/core/src/leads/ports.ts`, `packages/core/src/leads/runner.ts`. Test `lead-runner.test.mjs`.

- [ ] **Step 1: Failing tests.**

```js
test("an answer that changed the plan keeps every term; a yes drops the one the question named, and asking tells the owner once", async () => {
  for (const [answer, expectTerm] of [["keep", false], ["include", true]]) {
    const told = [];
    const { w, p } = await probed();
    const [r1, r2] = w.runs();
    await collect(p("c1", { tell: async (e) => told.push(e) }), r1.id, "p0", "c1");
    await collect(p("c2", { tell: async (e) => told.push(e) }), r2.id, "p0", "c2");
    assert.deepEqual(told, [{ kind: "question", roundId: w.round().id }], "the owner is told once, when it asks");
    const plan = answer === "include" ? { ...w.round().plan, version: 2, exclusions: [] } : undefined;
    w.rpcs.lead_round_answer({ p_round_id: w.round().id, p_answer: answer, p_plan: plan });
    await startRound(p("job-3"), w.round().id, "job-3", true);
    const terms = w.apify.calls.filter((c) => c.op === "startRun").slice(2).map((c) => c.input.searchStringsArray?.[0] ?? c.input.searchString);
    assert.equal(terms.includes("strength coach"), expectTerm, `${answer}: ${terms.join(", ")}`);
  }
});
```

(Read one `startRun` call's `input` in the ACCEPTANCE test to name the term field the Maps card writes; use that.)

- [ ] **Step 2: Run, expect FAIL** (`tell` never called; include drops the term).
- [ ] **Step 3: Implement.**
  - `ports.ts`, `LeadPorts`: `tell?(e: { kind: "question"; roundId: string }): Promise<void>;` with a doc line: told
    after the commit that made the round ask; best effort, never throws into the collect.
  - `runner.ts` `roundDecision`, the ask branch:
    `return { round: {…}, next: null, after: async () => { await p.tell?.({ kind: "question", roundId: round.id }).catch(() => undefined); } };`
  - `startRound`: `mainAsk(plan, targetOf(round) - counted, y, round.answered === "keep" ? (round.question?.dropTerm ?? null) : null)`
    with a comment: the question said "I'm dropping X" and a yes accepted it; an answer that changed the plan is a new
    plan, whose terms are the owner's.
- [ ] **Step 4: Run the file, expect PASS.** **Step 5: Commit** — "Asking tells the owner, and only a yes drops the term".

### Task 7: The question's email

**Files:** `apps/edge/lib/ops/notify.ts`; create `apps/edge/lib/leads/lead-tell.ts`; bind in
`apps/edge/lib/leads/lead-pipeline.ts` `portsFor`. Tests `notify-transport.test.mjs` (mail) and a new
`lead-tell.test.mjs`.

- [ ] **Step 1: Failing tests.** `lead-tell.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./_fake-db.mjs";
import { tellLeadQuestion } from "../../../apps/edge/lib/leads/lead-tell.ts";

const T = "11111111-1111-4111-8111-111111111111";
const R = "22222222-2222-4222-8222-222222222222";
const S = "a516a5a6-ecb5-4ad1-96bf-56a65afceac8";
const tables = (config) => ({
  lead_rounds: [{ id: R, tenant_id: T, search_id: S, state: "waiting_on_owner", question: { sentence: "Some of the first 16 are large studio chains, which I'm leaving out. Is that what you meant?", criterionKey: "large_studio_chains", dropTerm: null, asked_at: "2026-09-24T04:30:11Z" } }],
  lead_searches: [{ id: S, tenant_id: T, name: "wedding photographers" }],
  tenants: [{ id: T, slug: "melanys-beauty-salon" }],
  tenant_config: config ? [{ tenant_id: T, config }] : [],
  tenant_channels: [],
});

test("a search that stops to ask mails the workspace's own addresses, with the words and the way back to the left-out pile", async () => {
  const sent = [];
  const send = async (from, to, subject, text) => (sent.push({ from, to, subject, text }), true);
  const cfg = { notifications: { escalation_emails: ["owner@example.com"], from: "Chanlytics <alerts@example.com>" } };
  assert.equal(await tellLeadQuestion(fakeDb(tables(cfg)), R, { send }), true);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ["owner@example.com"]);
  assert.equal(sent[0].subject, "Your search for wedding photographers is waiting for your answer");
  assert.match(sent[0].text, /^Some of the first 16 are large studio chains/);
  assert.match(sent[0].text, /Answer it: https:\/\/app\.chanlytics\.com\/w\/melanys-beauty-salon#\/clients\/leads:s-a516a5a6-ecb5-4ad1-96bf-56a65afceac8:c-excluded$/);
});

test("a workspace with nowhere to send is not mailed, and the platform is not told about a question", async () => {
  const sent = [];
  const send = async (...a) => (sent.push(a), true);
  assert.equal(await tellLeadQuestion(fakeDb(tables(null)), R, { send }), false);
  assert.deepEqual(sent, []);
});

test("a round that is no longer asking sends nothing", async () => {
  const sent = [];
  const t = tables({ notifications: { escalation_emails: ["owner@example.com"], from: "a@example.com" } });
  t.lead_rounds[0].state = "running";
  assert.equal(await tellLeadQuestion(fakeDb(t), R, { send: async (...a) => (sent.push(a), true) }), false);
  assert.deepEqual(sent, []);
});
```

(Check `parseTenantConfigResult`'s accepted shape for `notifications` and `fakeDb`'s signature against the test that
already calls `loadTenantNotifications`; copy that config exactly.)

- [ ] **Step 2: Run, expect FAIL** (module missing).
- [ ] **Step 3: Implement.**
  - `notify.ts`: move the `switch (addressing.kind)` out of `notify` into

    ```ts
    /** The mail half of notify: who gets told and whether they may see the contents; no row is kept. */
    export async function mail(target: NotifyTarget, msg: Pick<NotifyMessage, "subject" | "body" | "redactedBody">, ports: Pick<NotifyPorts, "send"> = {}): Promise<boolean>
    ```

    and `notify` becomes record then `return mail(target, msg, ports)`.
  - `lead-tell.ts`:

    ```ts
    /**
     * A search that stops to ask tells the workspace by email (the bell's row is lead_rounds_notify's, written in the
     * same transaction as the question). Best effort, after the commit: never throws, answers whether a mail went.
     */
    export async function tellLeadQuestion(db: Db, roundId: string, ports: Pick<NotifyPorts, "send"> = {}): Promise<boolean> {
      const L = logger();
      try {
        const { data: r } = await db.from("lead_rounds").select("tenant_id, search_id, state, question").eq("id", roundId).maybeSingle();
        const q = r?.question as { sentence?: unknown } | null | undefined;
        if (!r || r.state !== "waiting_on_owner" || typeof q?.sentence !== "string") return false;
        const [{ data: s }, { data: t }] = await Promise.all([
          db.from("lead_searches").select("name").eq("id", r.search_id).maybeSingle(),
          db.from("tenants").select("slug").eq("id", r.tenant_id).maybeSingle(),
        ]);
        const page = t?.slug ? `/w/${encodeURIComponent(t.slug)}` : "/";
        const words = leadQuestionMail({ name: s?.name ?? "leads", sentence: q.sentence, link: `${dashboardOrigin()}${page}#/${leadQuestionRoute(r.search_id)}` });
        const target = await loadTenantNotifications(db, r.tenant_id);
        return await mail({ tenantId: r.tenant_id, ...target }, words, ports);
      } catch (e) {
        L.error("lead_tell_failed", { round: roundId, error: errField(e) });
        return false;
      }
    }
    ```

    No `redactedBody`: an unaddressable workspace's question is nothing the platform acts on.
  - `lead-pipeline.ts` `portsFor`: `tell: async (e) => { if (e.kind === "question") await tellLeadQuestion(ctx.db, e.roundId); }`.
- [ ] **Step 4: Run `lead-tell`, `notify-transport`, `notify-addressing`, `lead-pipeline`, expect PASS.**
- [ ] **Step 5: Commit** — "A search that stops to ask emails the workspace".

### Task 8: The strip's four answers

**Files:** `apps/dashboard/src/legacy/pages/leads-finder.jsx` (`ldStripOf`), `leads.css`. Test
`leads-finder.test.mjs` (the question strip test, ~line 723; add `LEAD_QUESTION_WAIT_LINE` to the file's `__LEAD_VM`).

- [ ] **Step 1: Change the test.** Buttons `["Yes, keep going", "Include chain gyms", "Change what I asked", "Stop here"]`;
  parts equal `LEAD_QUESTION_WAIT_LINE`; pressing each hands back `["keep"]`, `["include", "chain"]`, `["change"]`,
  `["stop_here"]`. The unknown-key case: `ids(unknown)` is `["keep", "change", "stop_here"]` — no Include that cannot work.
  A criterion's key (not an exclusion's) draws no Include either.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** in the `waiting_on_owner` branch:

```js
const lifted = (plan.exclusions || []).some((x) => x.key === r.question.criterion_key) ? ldLeftOut(plan, r.question.criterion_key) : null;
return {
  state: "question", alert: true, title: r.question.sentence,
  parts: C.LEAD_QUESTION_WAIT_LINE ? [C.LEAD_QUESTION_WAIT_LINE] : [],
  progress,
  actions: [
    { id: "keep", label: "Yes, keep going", primary: true },
    // Include lifts one of the plan's own exclusions; a key the plan no longer holds has nothing to lift.
    ...(lifted ? [{ id: "include", label: `Include ${lifted}`, arg: r.question.criterion_key }] : []),
    { id: "change", label: "Change what I asked" },
    { id: "stop_here", label: "Stop here" },
  ],
};
```

  `leads.css` phone block: `.lf-strip.ask .lf-acts { flex-wrap: wrap; }` and
  `.lf-strip.ask .lf-acts .btn { flex: 1 1 calc(50% - 4px); }` (two by two at 375).
- [ ] **Step 4: Run, expect PASS.** **Step 5: Commit** — "The question has four answers, and Include only when it can lift something".

### Task 9: Answer mode in the finder and the card

**Files:** `apps/dashboard/src/legacy/pages/leads-finder.jsx` (`leadFinderAsk` neighbours, `leadFinderPlan`,
`leadFinderApprove`, `LeadFinder`, `LeadPlanCard`), `leads.css`. Test `leads-finder.test.mjs`.

- [ ] **Step 1: Failing tests.**

```js
const ANSWERING = { searchId: "s-b", answer: true, question: "Most of the first 25 are chain gyms, which I'm leaving out. Is that what you meant?", baseVersion: 1, count: 200, name: "personal trainers", asked: PLAN.asked, leavingOut: ["Chain gyms"] };

test("answering: the composer says the question, sends one turn that names the search and the answer, and the card comes back as the next version at the same count", async () => {
  const sent = [];
  globalThis.window.__ask = { send: async (input, on) => { sent.push(input); on({ t: "final", message: { text: "", proposals: [{ ...CARD, payload: { ...CARD.payload, plan: { ...PLAN, count: 50, exclusions: [] } } }] } }); } };
  const { st, set } = page({ words: "include the chains too" });
  set.more = ANSWERING;
  const tree = drawFinder(st, { answering: ANSWERING });
  assert.equal(textOf(byTestId(tree, "finder-answering")), ANSWERING.question);
  assert.equal(byTestId(tree, "finder-input").props.placeholder, "Tell Claude what you meant");
  assert.equal(byTestId(tree, "finder-suggestions"), null, "no suggestions while answering");
  await globalThis.window.leadFinderPlan(st.words, set);
  assert.match(sent[0].text, /personal trainers/);
  assert.match(sent[0].text, /Most of the first 25 are chain gyms/);
  assert.match(sent[0].text, /include the chains too/);
  assert.deepEqual([st.plan.version, st.plan.count], [2, 200], "the next version, the count the round reserved");
});

test("answering: the card's count is words, its button updates the search, and approving answers include at the next version even from Ask's card and after picks", async () => {
  const st = { plan: { ...PLAN, version: 2, exclusions: [] }, pick: null, refusal: null };
  const tree = drawCard(st, { answering: ANSWERING });
  assert.equal(byTestId(tree, "plan-count"), null, "the reservation was made for this count");
  assert.equal(textOf(byTestId(tree, "plan-approve")).includes("Update the search"), true);
  assert.equal(byTestId(tree, "plan-title"), null);
  const answered = [];
  globalThis.window.__leadSearchAnswer = async (id, a, plan) => (answered.push([id, a, plan.version, plan.count]), { ok: true });
  globalThis.window.__ask = { commit: async () => { throw new Error("an answer never starts a new search"); } };
  const { st: s2, set } = page({ stage: "plan", proposal: CARD, plan: { ...PLAN, version: 4, count: 50 } });
  set.more = ANSWERING;
  const r = await globalThis.window.leadFinderApprove(s2.proposal, s2.plan, set);
  assert.equal(r.ok, true);
  assert.deepEqual(answered, [["s-b", "include", 2, 200]]);
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
  - Beside `leadFinderAsk`:

    ```js
    /** The one turn that amends a search waiting on its question: what it is, what it asked, what the owner answered. */
    const leadFinderAmendAsk = (a, words) =>
      `On People › Leads, my search for ${a.name} stopped to ask: “${a.question}” ` +
      `I had asked: “${a.asked}”${a.leavingOut && a.leavingOut.length ? `, leaving out ${a.leavingOut.join(", ")}` : ""}. ` +
      `My answer: ${String(words || "").trim()}. Propose the same search with my answer applied, and keep everything I did not change.`;
    ```

  - `leadFinderPlan`: `const answering = set.more && set.more.answer ? set.more : null;` the text is
    `answering ? leadFinderAmendAsk(answering, words) : leadFinderAsk(words)`; on a card,
    `set.plan(answering && p ? { ...p, version: answering.baseVersion + 1, count: answering.count } : p)`.
  - `leadFinderApprove`: the answer branch moves first —
    `if (set.more && set.more.answer && window.__leadSearchAnswer) r = await window.__leadSearchAnswer(set.more.searchId, "include", { ...plan, version: (set.more.baseVersion || plan.version - 1) + 1, count: set.more.count || plan.count }); else if (proposal) … else if (set.more && window.__leadSearchMore) …`
    with the comment: an answer amends the round that is waiting, whatever card it came from; the version is the one
    after the round's and the count is the one it reserved, however many words were picked.
  - `LeadFinder` takes `answering = null`: `aria-label` "Change the search" when answering; a
    `<p className="lf-answering" data-testid="finder-answering">{answering.question}</p>` above `.lf-compose` while
    composing; placeholder and `aria-label` of the input "Tell Claude what you meant"; `ideas` empty; passes
    `answering` to `LeadPlanCard`.
  - `LeadPlanCard` takes `answering = null`: a `count` word is a plain `<span>` when answering;
    `ask = answering ? { count: plan.count, label: "Update the search", covers: null } : C.leadPlanAsk(plan, f)`;
    `view.title` is not drawn when answering.
  - `leads.css`: `.lf-answering { margin: 0 0 8px; color: var(--ink-dim); font-size: var(--text-sm); }`.
  - Export `leadFinderAmendAsk` on `window` beside `leadFinderAsk`.
- [ ] **Step 4: Run, expect PASS** (and the whole file). **Step 5: Commit** — "The finder answers a question: the next version of the same search".

### Task 10: The page — change, include, fresh Find, the waiting view

**Files:** `apps/dashboard/src/legacy/pages/clients-a.jsx`, `leads-scope.jsx`. Test `leads-honest.test.mjs` (add
`LEAD_QUESTION_WAIT_LINE` and `planSentence` to its `__LEAD_VM` if the strip needs them; add a
`__leadSearchAnswer` recorder if the file lacks one — it has `["answer", …]` calls already).

- [ ] **Step 1: Failing tests.**
  - The existing Yes/Stop test expects actions `["keep", "include", "change", "stop_here"]`.
  - "Change what I asked opens the finder under the question, empty, and approving answers the round": draw
    `leads:s-${SEARCH_B}`, `strips.at(-1).onAction("change")`, draw; the finder is open at `compose`, words `""`,
    `answering.question` is the waiting round's sentence, `answering.baseVersion` 1, `answering.count` 200; no call but
    `view`. Then set `__ask.send` to answer a card with `{ ...PLAN, exclusions: [] }` at version 1, `onPlan("include
    chains")`, settle, draw, `onApprove(finders.at(-1).plan)`, settle: the last call is
    `["answer", { id: SEARCH_B, answer: "include", plan: { …version: 2, count: 200 } }]`, the flash says "Carrying on
    with your change.", no `ask.commit` upload.
  - "a fresh Find after an abandoned answer starts a new search": change → close with Esc (or `onCloseFinder`) is not
    needed; instead press `f` while the answer finder is still set, then the finder's `answering` is null.
  - "a waiting search opens on its left-out pile, and its counted view says it waits": the rail's `onPickSearch(SEARCH_B)`
    and the standing line's `onNeedsYou(SEARCH_B)` navigate to `` `clients/leads:s-${SEARCH_B}:c-excluded` ``; drawn at
    `leads:s-${SEARCH_B}` (no class), the table's empty state title is "Nothing is counted yet." with body "It is
    waiting for your answer above." and no action.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** in `clients-a.jsx`:

```js
// What answer mode carries (leadFinderAmendAsk, leadFinderApprove): the question, the round's version and count.
const answerOf = (s) => ({
  answer: true,
  question: s.round && s.round.question ? s.round.question.sentence : "",
  baseVersion: s.plan_version || (s.plan && s.plan.version) || 1,
  count: s.plan.count,
  name: s.name,
  asked: s.asked,
  leavingOut: (s.plan.exclusions || []).map((x) => x.text),
});
// A fresh Find is never an answer: an abandoned answer must not turn the next search into one.
const openFind = () => { setFinderMore(null); setFinderProposal(null); setFinderPlan(null); setFinderRefusal(null); setFinderStage("compose"); setFinderOpen(true); };
```

  - `openPlanFor`: `setFinderMore({ searchId: s.id, purpose: "topup", ...(how === "answer" ? answerOf(s) : { answer: false }) })`.
  - `onStripAction`: `if (id === "change") { setFinderWords(""); setFinderProposal(null); setFinderPlan(null); setFinderRefusal(null); setFinderPick(null); setFinderMore({ searchId: s.id, purpose: "topup", ...answerOf(s) }); setFinderStage("compose"); setFinderOpen(true); return undefined; }`
  - `keysWith.find`, `onFind`, the empty state's Find: `openFind`.
  - `finderApprove`: `const answering = !!(finderMore && finderMore.answer);` before the call; on `r.ok && answering`,
    `plFlash({ msg: <>Carrying on with your change.</> })`.
  - `const waitsOn = (id) => { const s = searchById(id); return !!(s && s.round && s.round.state === "waiting_on_owner"); };`
    `pickSearchRoute = (id) => { const to = railToggle(leadView.searchId, id); return window.__leadsRouteOf({ searchId: to, list: "all", cls: to && waitsOn(to) ? "excluded" : null }); }`;
    `onNeedsYou={(id) => nav(window.__leadsRouteOf({ searchId: id, list: "all", cls: "excluded" }))}`.
  - `empty`: before the generic case, `openSearch && openSearch.round && openSearch.round.state === "waiting_on_owner" && !leadView.cls ? { title: "Nothing is counted yet.", body: "It is waiting for your answer above.", action: null } : …`.
  - Pass `finderAnswering={finderMore && finderMore.answer ? finderMore : null}` to `LeadsScope`; in `leads-scope.jsx`
    hand `answering={p.finderAnswering}` to `LeadFinder`.
- [ ] **Step 4: Run leads-honest and leads-finder, expect PASS.** **Step 5: Commit** — "The page answers a question in place, and a waiting search opens on what it asks about".

### Task 11: Whole-branch verification, review, PR, production

- [ ] `corepack pnpm -r --filter "./packages/*" --if-present build`; commit only dists with a real diff
  (`git diff --ignore-cr-at-eol --stat -- packages/*/dist`); `corepack pnpm check:dist`.
- [ ] `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm format:check`, `corepack pnpm test` — all green,
  failures reported with their output.
- [ ] Grep `e2e/*.spec.ts` for "needs you", "Include what I left out", "Open People" pins and update any this changed.
- [ ] One combined review subagent over `git diff origin/main...HEAD` against the spec (spec compliance + quality);
  fix what it finds; no re-review.
- [ ] Push; open the PR (house-voice title, body with what changed and why, the production push note, the
  "🤖 Generated with Claude Code" line). Wait for Typecheck, Secret scan, Migrations replay, Vercel Preview Comments.
- [ ] Production: re-list migrations against origin/main; dry run lists only 00163; `db push --linked --yes`; read back
  `pg_get_functiondef('public.lead_rounds_notify()'::regprocedure)` contains "is waiting for your answer".
- [ ] Squash-merge with `--match-head-commit`; verify on app.chanlytics.com (reload twice for the service worker): the
  wedding photographers strip shows four answers and "Include large studio chains"; the bell row's button says
  "Answer it"; nothing is pressed on the owner's live search.
