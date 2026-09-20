# Lead finder D3: Needs review is a queue with a next step

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Needs review is a queue grouped by what would resolve each lead, with the resolver on the bulk bar — check again, find an email, keep, exclude — and a search that ran dry offers the nearest areas to look in next.

**Architecture:** The class rule's own reason tokens (`email:unknown`, `unknown:<key>`, `inferred:<key>`, `out_of_area`, …) already say why a lead is in review; D3 exposes them on the row (`member.reasons`), groups the tab by what resolves them (contracts `leadReviewGroups`), and gives the bulk bar the acts: **Check again** schedules a mailbox check through a door that inserts the same `lead_check` job the engine schedules for itself; **Keep** / **Exclude** in bulk widen `lead_bulk`; **Find an email** is a second contacts pass over the emailless leads' own websites (a new actor, so a new source card, which needs Ruben's approval per PRD §0.3). "Look further out" gets real areas from the ZCTA centroids around the round's measured centre. Wave overlap is last and flagged: it changes when money is spent.

**Tech Stack:** as D1/D2. Migration **00145** (the doors), pushed to production before the merge per `production-db-push-is-mine`.

**Not in D3:** email from the hosted mailbox and the outbound agent (D4); calibrating the estimate from the workspace's own history (needs a round-timing door; folded into D4's migration).

---

## File map

| File | Responsibility | Tasks |
|---|---|---|
| `apps/dashboard/src/server/leads.ts` | `member.reasons` on the row DTO; the bulk route's new actions | 1, 3 |
| `packages/contracts/src/leads.ts` | `LeadRowDto.member.reasons`, `leadReviewGroups`, the words | 1 |
| `apps/dashboard/src/legacy/pages/leads-scope.jsx` | the Review tab's groups and chips; the bulk bar's acts | 2 |
| `apps/dashboard/src/legacy-bridge/leads.ts` | the couriers: `__leadCheckAgain`, `__leadsBulk` widened | 2, 3 |
| `supabase/migrations/00145_needs_review_has_a_next_step.sql` | `lead_check_again`, `lead_bulk` gains keep/exclude, `lead_email_found` | 3, 4 |
| `packages/core/src/leads/cards.ts`, `runner.ts`, `apps/edge/lib/lead-pipeline.ts` | the contacts pass: card, job kind `lead_contacts_more`, handler | 4 |
| `packages/core/src/leads/geo.ts` | `nearestAreas(center, exclude)` from the ZCTA centroids | 5 |
| `packages/core/src/leads/runner.ts` | the ending's `nearby`; wave overlap | 5, 6 |

---

### Task 1: The row says why it waits, and the tab knows what resolves it

**Files:**
- Modify: `apps/dashboard/src/server/leads.ts` (`toRowDto`, beside `checks: checksOf(r)` ~line 424)
- Modify: `packages/contracts/src/leads.ts` (`LeadRowDto.member`, new `leadReviewGroups`, `LEAD_REVIEW_GROUP_WORDS`)
- Test: `tooling/scripts/tests/leads-vm.test.mjs`, `tooling/scripts/tests/lead-routes.test.mjs`

- [ ] **Step 1: The failing tests.** `leads-vm.test.mjs`:

```js
test("Needs review is grouped by what resolves it, in the order an owner would work it", () => {
  const rows = [
    row({ id: "a", member: { ...row().member, class: "review", reasons: ["email:checking"] } }),
    row({ id: "b", member: { ...row().member, class: "review", reasons: ["email:unknown"] } }),
    row({ id: "c", member: { ...row().member, class: "review", reasons: ["email:none"] } }),
    row({ id: "d", member: { ...row().member, class: "review", reasons: ["email:catch_all"] } }),
    row({ id: "e", member: { ...row().member, class: "review", reasons: ["unknown:hosts_weddings"] } }),
    row({ id: "f", member: { ...row().member, class: "review", reasons: ["inferred:independent"] } }),
    row({ id: "g", member: { ...row().member, class: "review", reasons: ["out_of_area"] } }),
    row({ id: "h", member: { ...row().member, class: "review", reasons: ["email:unknown", "unknown:hosts_weddings"] } }),
  ];
  const groups = leadReviewGroups(rows, SEARCH_DONE);
  assert.deepEqual(groups.map((g) => [g.id, g.label, g.ids, g.acts]), [
    ["mailbox_waiting", "Waiting on the mailbox check", ["a"], []],
    ["mailbox_silent", "Their mail server wouldn't answer", ["b", "h"], ["check_again", "keep", "exclude"]],
    ["no_email", "No email on their site", ["c"], ["find_email", "keep", "exclude"]],
    ["catch_all", "Unconfirmed — the mailbox accepts any address", ["d"], ["keep", "exclude"]],
    ["unsure", "Couldn't tell if — hosts weddings", ["e"], ["keep", "exclude"]],
    ["read_only", "Only the listing says so — independent", ["f"], ["keep", "exclude"]],
    ["out_of_area", "Just outside the area you asked for", ["g"], ["keep", "exclude"]],
  ], "one group per resolver, a lead in the first group that fits it, the criterion named in the owner's words");
  assert.deepEqual(leadReviewGroups([], SEARCH_DONE), []);
});
```

`lead-routes.test.mjs`, where a `leads` GET row is pinned: `assert.deepEqual(rows[0].member.reasons, ["email:none"])` for the fixture member whose judgment carries that reason.

- [ ] **Step 2: Red. Step 3:** server: `reasons: Array.isArray((r.judgment as { reasons?: unknown } | null)?.reasons) ? ((r.judgment as { reasons: unknown[] }).reasons.filter((x) => typeof x === "string") as string[]) : []` beside `checks`. Contracts: `member.reasons: string[]` on `LeadRowDto` (optional, default `[]` in readers), and:

```ts
export const LEAD_REVIEW_GROUP_WORDS = {
  mailbox_waiting: "Waiting on the mailbox check",
  mailbox_silent: "Their mail server wouldn't answer",
  no_email: "No email on their site",
  catch_all: "Unconfirmed — the mailbox accepts any address",
  unsure: "Couldn't tell if",
  read_only: "Only the listing says so",
  out_of_area: "Just outside the area you asked for",
} as const;
export type LeadReviewGroupId = keyof typeof LEAD_REVIEW_GROUP_WORDS;
export type LeadReviewAct = "check_again" | "find_email" | "keep" | "exclude";
/** The order an owner would work the pile: what resolves itself first, then what one press resolves, then what needs a look. */
const REVIEW_GROUP_ORDER: LeadReviewGroupId[] = ["mailbox_waiting", "mailbox_silent", "no_email", "catch_all", "unsure", "read_only", "out_of_area"];
const REVIEW_GROUP_ACTS: Record<LeadReviewGroupId, LeadReviewAct[]> = {
  mailbox_waiting: [], mailbox_silent: ["check_again", "keep", "exclude"], no_email: ["find_email", "keep", "exclude"],
  catch_all: ["keep", "exclude"], unsure: ["keep", "exclude"], read_only: ["keep", "exclude"], out_of_area: ["keep", "exclude"],
};
function reviewGroupOf(reason: string): LeadReviewGroupId | null {
  if (reason === "email:checking") return "mailbox_waiting";
  if (reason === "email:unknown") return "mailbox_silent";
  if (reason === "email:none") return "no_email";
  if (reason === "email:catch_all") return "catch_all";
  if (reason.startsWith("unknown:")) return "unsure";
  if (reason.startsWith("inferred:")) return "read_only";
  if (reason === "out_of_area") return "out_of_area";
  return null;
}
/**
 * Needs review as a queue: one group per thing that would resolve it, each with the leads in it and the acts that
 * resolve it. A lead with two reasons sits in the first group that fits it, in the order above; the criterion a
 * group is about is named in the owner's own words from the plan.
 */
export function leadReviewGroups(rows: LeadRowDto[], search: LeadSearchDto | null): { id: LeadReviewGroupId; label: string; ids: string[]; acts: LeadReviewAct[] }[] {
  const by = new Map<string, { id: LeadReviewGroupId; label: string; ids: string[] }>();
  for (const r of rows) {
    if (r.member.class !== "review") continue;
    const reasons = r.member.reasons ?? [];
    const picked = REVIEW_GROUP_ORDER.map((g) => reasons.map(reviewGroupOf).includes(g) ? g : null).find((g) => g);
    if (!picked) continue;
    const reason = reasons.find((x) => reviewGroupOf(x) === picked) ?? "";
    const key = reason.includes(":") && (picked === "unsure" || picked === "read_only") ? reason.slice(reason.indexOf(":") + 1) : null;
    const word = key ? leadExclusionWord(search, key) : null;
    const label = key ? `${LEAD_REVIEW_GROUP_WORDS[picked]} — ${ldLower(word ?? key)}` : LEAD_REVIEW_GROUP_WORDS[picked];
    const id = key ? `${picked}:${key}` : picked;
    const g = by.get(id) ?? { id: picked, label, ids: [] };
    g.ids.push(r.id);
    by.set(id, g);
  }
  return [...by.values()].sort((a, b) => REVIEW_GROUP_ORDER.indexOf(a.id) - REVIEW_GROUP_ORDER.indexOf(b.id)).map((g) => ({ ...g, acts: REVIEW_GROUP_ACTS[g.id] }));
}
```

(`ldLower` lower-cases the first letter unless the word is a proper noun — the page has `ldLowerFirst`; move it to contracts as `leadLowerFirst` and read it from both.) **Step 4: green. Step 5: commit** — "A review row says why it waits, and the tab knows what resolves it".

---

### Task 2: The Review tab draws the queue, and the bulk bar carries its acts

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/leads-scope.jsx` (under `LeadClassTabs`, when `p.view.cls === "review"`: `LeadReviewGroups`; `LeadsBulkBar` gains `onCheckAgain`, `onFindEmail`, `onKeep`, `onExclude` over the selection)
- Modify: `apps/dashboard/src/legacy/pages/clients-a.jsx` (the handlers, through the couriers)
- Test: `tooling/scripts/tests/leads-honest.test.mjs`

- [ ] **Step 1: The failing test.** On the review view of a search whose rows carry the reasons above: `review-groups` draws one chip per group with its count (*"Their mail server wouldn't answer · 2"*), clicking a chip selects its leads (the bulk bar reads *"2 selected"*), and the bulk bar offers the group's acts and no other (*Check 2 again · about 1¢* when the act is `check_again`; *Find 1 email* for `find_email`); an empty review view says *"Nothing needs a look"*.

- [ ] **Step 2: Red. Step 3:** `LeadReviewGroups({ groups, onPick })` — a row of chips (`ld-chips`, the Excluded tab's own class), each `data-testid={\`review-group-${g.id}\`}`, click → `p.onSelectIds(g.ids)`. The bulk bar, when every selected lead is in review, shows the union of the selected groups' acts: **Check again** → `p.onCheckAgain(ids)`, **Find an email** → `p.onFindEmail(ids)`, **Keep** → `p.onKeep` over ids, **Exclude** → `p.onExclude` over ids; each labelled with its count, and a cost only when there is one (`Check ${n} again · about ${Math.max(1, Math.round(n * 0.089))}¢`). Empty: `<EmptyState title="Nothing needs a look" />`. **Step 4: green. Step 5: commit** — "Needs review is a queue with its resolvers on the bar".

---

### Task 3: Migration 00145 — the doors the acts go through

**Files:**
- Create: `supabase/migrations/00145_needs_review_has_a_next_step.sql`
- Modify: `apps/dashboard/src/legacy-bridge/leads.ts` (couriers), `apps/dashboard/src/server/leads.ts` + the routes (`POST leads/check-again`, `lead_bulk` actions)
- Test: `tooling/scripts/tests/leads.db.test.mjs`, `lead-routes.test.mjs`

- [ ] **Step 1: The failing db test.** As owner: `lead_check_again(p_tenant_id, p_lead_ids)` on two leads whose `email_state` is `unknown` sets both to `checking`, inserts **one** `lead_check` job for the tenant carrying `{lead_ids}` and `batch: 0`, refuses a lead with no email (`{error: "no_email"}` in its answer, the others still scheduled), refuses an operator, refuses another workspace's lead; `lead_bulk` with `p_action = 'keep'` over ids moves each review member to qualified through the same rule `lead_member_keep` uses and writes one operation row; `'exclude'` likewise.

- [ ] **Step 2: Red. Step 3:** the migration, in 00140's door style (SECURITY DEFINER, `auth.uid()` inside, `has_permission(…, 'find')`):

```sql
create or replace function public.lead_check_again(p_tenant_id uuid, p_lead_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ids uuid[]; v_skipped uuid[];
begin
  if v_user is null then raise exception 'Sign in required.' using errcode = '28000'; end if;
  if not public.has_permission(v_user, p_tenant_id, 'find') then raise exception 'Only an owner can find businesses for you.' using errcode = '42501'; end if;
  -- Only a lead with an address whose last check did not answer (unknown) or was never made (none with an alternate) is asked again;
  -- an address that answered (ok, catch_all, invalid) is not asked twice for the same answer.
  select coalesce(array_agg(l.id), '{}'), coalesce(array_agg(x.id) filter (where false), '{}') into v_ids, v_skipped
    from unnest(p_lead_ids) as x(id) join public.leads l on l.id = x.id and l.tenant_id = p_tenant_id and l.erased_at is null and l.blanked_at is null
   where l.email is not null and l.email_state in ('unknown');
  select coalesce(array_agg(x.id), '{}') into v_skipped from unnest(p_lead_ids) as x(id) where not (x.id = any (v_ids));
  if cardinality(v_ids) > 0 then
    update public.leads set email_state = 'checking', version = version + 1 where id = any (v_ids);
    insert into public.jobs (tenant_id, kind, due_at, payload)
    values (p_tenant_id, 'lead_check', now(), jsonb_build_object('lead_ids', to_jsonb(v_ids), 'batch', 0));
  end if;
  return jsonb_build_object('scheduled', cardinality(v_ids), 'skipped', cardinality(v_skipped));
end $$;
```

The edge's `lead_check` handler (`lead-pipeline.ts` → `runner.ts check()`) gains a second shape: a job with `lead_ids` and no `round_id` checks exactly those leads' addresses and commits through `lead_check_commit` with `p_round_id` null — read `check()` first; if it is round-bound throughout, add `checkLeads(p, leadIds)` beside it that builds the same checker run from the leads' emails and commits with a `lead_check_commit` overload `(p_lead_ids uuid[], p_run_id, p_results, p_usage_usd)` that updates `email_state` and promotes a review member whose only reason was the email to qualified (the same statement 00140's commit uses, keyed by lead). `lead_bulk`: `if p_action not in ('contacted', 'not_a_fit', 'keep', 'exclude')`; for `keep`/`exclude` it loops `perform public.lead_member_move(m.search_id, m.lead_id, p_action)` over the named or viewed members whose class is review and records one `bulk` operation. Couriers: `__leadCheckAgain(ids)` → `POST leads/check-again`; `__leadsBulk` passes the new actions.

- [ ] **Step 4:** apply locally, both db suites green, `database.types.ts` regenerated. **Step 5: commit** — "Needs review has a next step: the doors (00145)".

---

### Task 4: Find an email — a second pass over their own site (needs Ruben's yes on the actor)

**Files:**
- Modify: `packages/core/src/leads/cards.ts` (`CARDS.local_businesses.contacts`: actor, build, input, `mapItem` → `{ url, emails }`)
- Modify: `packages/core/src/leads/runner.ts` (`contactsMore(p, leadIds)`), `apps/edge/lib/lead-pipeline.ts` (job kind `lead_contacts_more`), `packages/jobs/src/handlers.ts` (the kind), the schema-sets (`LEAD_JOB_KINDS`)
- Migration 00145 also: `lead_email_found(p_lead_id uuid, p_email text, p_how text)` — sets `email`, `email_state = 'checking'`, `email_alternates` gains the rest with `why: "found on their site"`, bumps `version`; refuses an erased or blanked lead and a suppressed address
- Test: `lead-runner.test.mjs` with a fake contacts actor; `leads.db.test.mjs` for the door

- [ ] **Step 0 — the decision:** the actor. Apify's `vdrmota/contact-info-scraper` reads a site's pages for emails, phones and socials; the Maps actor's own contact enrichment is what found the first-pass emails. Per PRD §0.3 a new source card is Ruben's to approve; this task waits on that yes. Everything else in D3 stands without it.
- [ ] **Step 1: The failing test:** an emailless lead's website is handed to the contacts actor; a found `hello@<host>` lands through `lead_email_found` as `checking` and a `lead_check` follows; a found address on another domain is an alternate, never the email; a pattern guess (`info@`, `hello@`, `contact@`) is tried only when the site gave nothing and is stored only after the mailbox check says the mailbox **exists and is not catch-all**, labelled `how: "pattern"` so the peek says *"Found by pattern · mailbox exists"*.
- [ ] **Steps 2–5** as the plan's pattern: red, the code, green, commit — "Find an email: a second pass over their own site".

---

### Task 5: "Look further out" has real areas

**Files:**
- Modify: `packages/core/src/leads/geo.ts` (`nearestAreas`)
- Modify: `packages/core/src/leads/runner.ts` (the ending's `nearby`, from the round's measured centre), the round's `ending` payload → `lead_rounds.nearby jsonb` (in 00145) → `LeadSearchDto.round.nearby` → `ldEndingFacts`
- Test: `tooling/scripts/tests/lead-core.test.mjs`, `lead-runner.test.mjs`, `leads-vm.test.mjs`

- [ ] **Step 1: The failing test.** `nearestAreas({ lat: 30.2672, lng: -97.7431 }, { excludeWithinM: 15_000, take: 3 })` answers three ZCTA centroids between 15 and 60 km of downtown Austin, nearest first, each as a `LeadArea` of kind `zip` with its centre and `radius_m: 8_000` and a label the picker can show (*"near 78660"*); the ending `few_new_matches` on a round whose members have a median centre carries `nearby` with three labels, and the strip's step reads **Look further out**.

- [ ] **Step 2: Red. Step 3:**

```ts
/** The nearest ZCTA centroids past a ring around a centre: where to look when an area ran dry (§7 step 3, without the model). */
export function nearestAreas(center: LatLng, o: { excludeWithinM: number; take: number; maxM?: number }): LeadArea[] {
  const max = o.maxM ?? RADIUS_MAX_M;
  return ZCTA.map(([zip, lat, lng]) => ({ zip, lat, lng, d: haversineM(center, { lat, lng }) }))
    .filter((x) => x.d >= o.excludeWithinM && x.d <= max)
    .sort((a, b) => a.d - b.d)
    .slice(0, o.take)
    .map((x) => ({ kind: "zip" as const, label: `near ${x.zip}`, state: "", center: { lat: x.lat, lng: x.lng }, radius_m: 8_000, zip: x.zip, query: `${x.zip}, USA` }));
}
```

(`state` is filled from the plan's own area; `ZCTA` is the parsed centroid table `geo.ts` already loads for `zctaCenter`.) The runner, when it ends a round `few_new_matches`, computes `medianCenter` of the round's members' points, calls `nearestAreas(center, { excludeWithinM: Math.max(plan.area.radius_m, 15_000), take: 3 })`, and writes them on the round (`nearby`); the DTO passes them; `ldEndingFacts` reads `r.nearby.map((a) => a.label)`; the strip's `look_further` step opens the plan with the first as its area (the picker already lists `facts.nearby`). **Step 4: green. Step 5: commit** — "A search that ran dry offers the nearest places to look".

---

### Task 6: Wave overlap — flagged, last

Collection is $0.003 a place and judging is the cost; the gate after 25 exists so nothing is *judged* on a bad plan. Starting wave 2's discover runs while the probe is judged, and judging their items only once the gate passes, would cut a search's wall time by roughly a third at a risk of ~30¢ of collection on a plan the owner then changes. It changes the sentence the runner test pins — *"nothing more is started until it is answered"* — to *"nothing more is judged or counted until it is answered"*, and a question's **Stop here** must abort the speculative runs. That is a money-semantics change to PRD §0.5; it is written here so it is not lost, and it is **not done without Ruben's yes**.

---

### Task 7: Dists, types, the suite, the push, the record

- [ ] Rebuild dists (real diffs only); regenerate `database.types.ts`; typecheck; full suite; lint. PR. Dry run lists only 00145; push; read back the three doors' signatures and grants; merge; on production, open the Nashville search's Needs review tab and confirm the groups, press **Check again** on the "mail server wouldn't answer" group and watch them move.
- [ ] PRD v3 §14: "**D3 — Needs review has a next step (built).**", and Task 4/6 recorded as waiting on the two decisions.
