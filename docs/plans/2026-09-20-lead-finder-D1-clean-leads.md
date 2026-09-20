# Lead finder D1: clean leads — the contract and the words

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A lead is something the owner can reach, and every sentence the Leads scope says about a search is true of it.

**Architecture:** Contracts decide (`classify`, the words, the estimate); the pages draw what contracts say. No migration, no new model call, no new spend. Everything here was found by running five real searches on production on 20 September (PRs #698–#708 record the run); this plan is what the results asked for and Ruben approved ("all approved as you best suggest").

**Tech Stack:** TypeScript contracts (`packages/contracts`), hookless legacy JSX pages under a stub React in tests, `node --test` with `tsx`. Run tests with `node --conditions=react-server --import tsx --test <files>`. Rebuild dists with `corepack pnpm -r --filter "./packages/*" build` (commit real diffs only, `git diff -w --ignore-cr-at-eol`). Edit CRLF files with a newline-preserving script, never `sed -i`.

**Not in D1 (their own plans):** the peek's fields and the Reach column (D2, a migration), Needs review as a queue with bulk checks and a second contacts pass, wave overlap and nearby centroids (D3), email sent from the hosted mailbox and the outbound agent (D4).

---

## File map

| File | Responsibility | Tasks |
|---|---|---|
| `packages/contracts/src/lead-search.ts` | `classify` (the contract), `placesPerMinute`, `planCeiling` | 1, 5 |
| `packages/contracts/src/leads.ts` | `leadExclusionWord`, `leadEndingLine`, the check words, the card's fact lines, `leadUndoable` | 1, 3, 4, 6 |
| `apps/dashboard/src/legacy/pages/leads-finder.jsx` | the strip (no Undo; the summary links), the picker's honest note, the criterion chip without a standard picker | 3, 5, 7 |
| `apps/dashboard/src/legacy/pages/leads-scope.jsx` | the search menu gains "Remove the N you haven't touched" | 3 |
| `apps/dashboard/src/legacy/pages/clients-a.jsx` | hands the menu `onUndo` | 3 |
| `tooling/scripts/tests/lead-search.test.mjs`, `leads-vm.test.mjs`, `leads-honest.test.mjs`, `leads-finder.test.mjs`, `lead-runner.test.mjs` | the pins | all |

---

### Task 1: The contract — no phone and no email is not a lead

**Files:**
- Modify: `packages/contracts/src/lead-search.ts` (`classify`, after the rubric is built)
- Modify: `packages/contracts/src/leads.ts` (`leadExclusionWord`)
- Test: `tooling/scripts/tests/lead-search.test.mjs`

- [ ] **Step 1: The failing test.** In `lead-search.test.mjs`, after the `classify` test's `wrongKind` block:

```js
  // A place nobody can reach is not a lead: it used to land in Needs review as "phone:none" or "email:none",
  // which is work dressed as a lead. It is left out, by a key with words, and the row says why.
  const unreachable = classify(p, answer([{ key: "website", answer: "pass", facts: ["host"] }, { key: "chain", answer: "pass", facts: ["name"] }]), facts({ emails: [], phone_matches_site: null }), "none", true);
  assert.deepEqual(unreachable, { class: "excluded", excluded_by: "unreachable", fit: null, reasons: ["unreachable"] }, "no phone and no email: left out, never review");
  const phoneOnly = classify(p, answer([{ key: "website", answer: "pass", facts: ["host"] }, { key: "chain", answer: "pass", facts: ["name"] }]), facts({ emails: [], phone_matches_site: true }), "none", true);
  assert.deepEqual([phoneOnly.class, phoneOnly.reasons], ["review", ["email:none"]], "a phone with no email under an email standard is still review: reachable, not yet to the standard");
  assert.equal(searchWords.LEAD_UNREACHABLE_KEY, "unreachable");
```

Check `facts()` in that file accepts overrides (`const facts = (over = {}) => ({ ...BASE, ...over })`); if it takes none, give it `over` the same way `answer` takes `over`.

- [ ] **Step 2: Run it red.** `node --conditions=react-server --import tsx --test --test-name-pattern "classify" tooling/scripts/tests/lead-search.test.mjs` → fails: class is `review`, `excluded_by` null.

- [ ] **Step 3: The contract.** In `lead-search.ts`, beside `LEAD_KIND_KEY`:

```ts
/**
 * A place with no phone and no email is not a lead. It used to reach Needs
 * review as "phone:none" or "email:none" -- work dressed as a lead, and the
 * largest share of the review pile on the first five real searches. It is
 * left out under this key, and the chip says why (leadExclusionWord).
 */
export const LEAD_UNREACHABLE_KEY = "unreachable";
```

and in `classify`, first line of the body, before `reasons`:

```ts
  // Nothing to call and nothing to write to: not a lead, whatever the judge said.
  if (facts.phone_matches_site === null && facts.emails.length === 0) return { class: "excluded", excluded_by: LEAD_UNREACHABLE_KEY, fit: null, reasons: [LEAD_UNREACHABLE_KEY] };
```

(`phone_matches_site === null` is the existing "no phone at all" signal: the `phone:none` reason reads it the same way.)

In `leads.ts`, import `LEAD_UNREACHABLE_KEY` from `./lead-search` beside `LEAD_KIND_KEY`, add the word beside `LEAD_LEFT_OUT_WORD`:

```ts
/** The Excluded chip for a place with no phone and no email (lead-search.ts LEAD_UNREACHABLE_KEY). */
export const LEAD_UNREACHABLE_WORD = "No way to reach them";
```

and in `leadExclusionWord`, after the `LEAD_KIND_KEY` line:

```ts
  if (key === LEAD_UNREACHABLE_KEY) return LEAD_UNREACHABLE_WORD;
```

- [ ] **Step 4: Run it green**, then the runner and pipeline suites (they classify through fixtures): `node --conditions=react-server --import tsx --test tooling/scripts/tests/lead-search.test.mjs tooling/scripts/tests/lead-runner.test.mjs tooling/scripts/tests/lead-pipeline.test.mjs tooling/scripts/tests/lead-core.test.mjs`. A fixture place with neither contact that a test expected in review must be changed to carry one, or its expectation moved to excluded — read each such failure; do not weaken the contract.

- [ ] **Step 5: Commit** — "A place nobody can reach is not a lead".

---

### Task 2: Pin that a found email is checked on a phone search too

**Files:**
- Test: `tooling/scripts/tests/lead-runner.test.mjs`

- [ ] **Step 1: The pin.** Find the collect test that judges a place with an email under a phone-standard plan (search the file for `contact: "phone"`); assert the committed member carries `email_state: "checking"`:

```js
  // "Ideally both": a phone search that finds an email still checks it (0.09¢), so most leads arrive with both.
  assert.equal(committed.find((m) => m.place.email).place.email_state, "checking", "a found email is checked whatever the standard asked for");
```

- [ ] **Step 2: Run it** — it passes today (`runner.ts:258`, `emailState = picked ? "checking" : "none"`); it is here so the behaviour cannot be "optimised" away. Commit — "A found email is checked whatever the standard, pinned".

---

### Task 3: The ending says what happened; Undo leaves the strip for the menu

**Files:**
- Modify: `packages/contracts/src/leads.ts` (`leadEndingLine` `few_new_matches`; new `leadUndoable`)
- Modify: `apps/dashboard/src/legacy/pages/leads-finder.jsx` (`ldStripOf`: no `undo` action)
- Modify: `apps/dashboard/src/legacy/pages/leads-scope.jsx` (`LeadSearchMenu` + `LeadsRailRows` gain `onUndo`)
- Modify: `apps/dashboard/src/legacy/pages/clients-a.jsx` (passes `onUndo`)
- Test: `tooling/scripts/tests/leads-vm.test.mjs`, `tooling/scripts/tests/leads-honest.test.mjs`

- [ ] **Step 1: The failing tests.** In `leads-vm.test.mjs`, where `leadEndingLine` is tested:

```js
  // "All 117 … are already yours" read as dedupe, and "Undo" beside it read as "delete what I paid for".
  const dry = leadEndingLine("few_new_matches", { ...FACTS, seen: 117, counted: 24, name: "wedding planners", area: "Nashville, TN", nearby: [] });
  assert.equal(dry.title, "Found all 117 wedding planners in Nashville, TN");
  assert.deepEqual(dry.parts, ["the 24 found are yours"]);
  assert.equal(leadUndoable({ round: { undo_op_id: null, ended_at: new Date(NOW - 60_000).toISOString() } }, new Date(NOW)), true);
  assert.equal(leadUndoable({ round: { undo_op_id: "op-1", ended_at: new Date(NOW - 60_000).toISOString() } }, new Date(NOW)), false, "used once");
  assert.equal(leadUndoable({ round: { undo_op_id: null, ended_at: new Date(NOW - 25 * 3_600_000).toISOString() } }, new Date(NOW)), false, "a day is the window");
  assert.equal(leadUndoable({ round: null }, new Date(NOW)), false);
```

In `leads-honest.test.mjs`, beside the test "Undo on an ended strip removes the untouched leads…":

```js
test("Undo is not on the strip: the search's menu offers it, named for what it removes and gives back", () => {
  fresh();
  const tree = draw({ leadsRoute: `leads:s-${SEARCH_A}` });
  assert.ok(!strips.at(-1).vm.actions.some((a) => a.id === "undo"), "the strip carries the ending and its next step, never a control that removes leads");
  const menu = menus.find((m) => m.title === `What ${search().name} asked for`);
  const item = menu.items.find((i) => /^Remove the \d+ you haven't touched$/.test(i.label || ""));
  assert.ok(item, "the menu names what it removes");
  assert.match(item.meta, /given back this month/);
  item.onClick();
  assert.deepEqual(calls.at(-1), ["search_undo", { id: SEARCH_A }]);
});
```

(The existing Undo test drives `strips.at(-1).onAction("undo", …)`; change it to drive the menu item the same way, so it tests the door through the new control.)

- [ ] **Step 2: Run them red.**

- [ ] **Step 3: Contracts.** In `leadEndingLine`, the `few_new_matches` case:

```ts
    case "few_new_matches":
      return {
        mark,
        // "already yours" read as dedupe; "Found all" says what happened: the area ran dry.
        title: `Found all ${plural(f.seen, one, f.name)} in ${f.area}`,
        parts: [yours, ...(f.nearby.length ? [`Look further out, in ${leadAnd(f.nearby)}?`] : [])],
        step: f.nearby.length ? { id: "look_further", label: "Look further out" } : null,
      };
```

Add, beside `leadExclusionWord`:

```ts
/** A day, from the round's end, in which the untouched leads may be removed and the month credited (§8.6). */
export const LEAD_UNDO_MS = 24 * 60 * 60_000;
/** Whether a search's latest round may still be undone: ended within the day, and not undone already. */
export function leadUndoable(s: { round: { undo_op_id: string | null; ended_at: string | null } | null } | null, now: Date): boolean {
  const r = s?.round;
  return !!r && !r.undo_op_id && !!r.ended_at && now.getTime() - Date.parse(r.ended_at) < LEAD_UNDO_MS;
}
```

Remove the page's own `LEAD_UNDO_MS` in `leads-finder.jsx` if it declares one, and read `C.leadUndoable` / `C.LEAD_UNDO_MS` off `window.__LEAD_VM` instead (add both to the `__LEAD_VM` bag in `seed-globals.ts`, its type and its value).

- [ ] **Step 4: The strip loses Undo.** In `ldStripOf` (leads-finder.jsx) delete the `undoable`/`undo` lines and `...undo` from the ended return: `actions: [...step, ...sorts]`. Update the comment above to say the menu offers it.

- [ ] **Step 5: The menu gains it.** In `leads-scope.jsx` `LeadSearchMenu`, add props `undoable` and `onUndo`, and after "Export these N":

```jsx
      ...(undoable ? [{ label: `Remove the ${s.untouched} you haven't touched`, icon: "undo", meta: `${s.untouched} given back this month`, onClick: () => onUndo(s), gate: canFind ? undefined : window.gate("find", "remove these leads") }] : []),
```

`s.untouched` comes from `leadRail` (contracts): the rail's search row gains `untouched: number` = the latest round's `counted` minus leads with a stage beyond ready — if the view does not carry that, use `counted` and word it "Remove the leads you haven't touched" with meta "up to N given back this month". Say only what the view knows. `LeadsRailRows` passes `undoable={C.leadUndoable(dto, new Date())}` and `onUndo` through; `clients-a.jsx` passes `onUndo={(s) => undoRound(s.id)}` where the rail is drawn.

- [ ] **Step 6: Run green**, then `leads-honest`, `leads-vm`, `leads-finder`. Commit — "The ending says what happened, and removing leads is a menu item named for what it does".

---

### Task 4: The card claims no fact it does not have

**Files:**
- Modify: `packages/contracts/src/leads.ts` (the card's fact lines, near `Skips the ${facts.dupes} already yours`)
- Test: `tooling/scripts/tests/leads-vm.test.mjs` (or wherever `leadPlanFacts`/the card lines are pinned; search for "already yours")

- [ ] **Step 1: The failing test.** Replace the pin of `Skips the 14 already yours` with:

```js
  assert.ok(lines.includes("Anything already yours is skipped"), "no number: the card cannot know how many of THIS search's places are already here until it has looked");
  assert.ok(!lines.some((l) => /Skips the \d+ already yours/.test(l)));
```

- [ ] **Step 2: Red. Step 3:** the line becomes `"Anything already yours is skipped"` unconditionally; drop the `dupes` read from the sentence (leave `facts.dupes` in the DTO — D3 computes the real overlap after the probe). **Step 4: green. Step 5: commit** — "The card does not count what it has not looked at".

---

### Task 5: The estimate is measured, and the picker says when an area cannot hold the count

**Files:**
- Modify: `packages/contracts/src/lead-search.ts` (`placesPerMinute: 50` → `8`; new `planCeiling`)
- Modify: `apps/dashboard/src/legacy/pages/leads-finder.jsx` (the count picker's note)
- Modify: `apps/dashboard/src/legacy-bridge/seed-globals.ts` (`planCeiling` into `__LEAD_VM`)
- Test: `tooling/scripts/tests/lead-search.test.mjs`, `tooling/scripts/tests/leads-finder.test.mjs`

- [ ] **Step 1: The failing tests.** `lead-search.test.mjs`:

```js
test("the estimate is what five real searches measured, and the ceiling is what one area's terms can yield", () => {
  const p = plan();
  assert.equal(planMinutes({ ...p, count: 50 }), 12, "about 12 minutes for 50 with checks: 8 places a minute, not 50");
  assert.equal(planCeiling(p), 180, "three terms, 120 places each, half of them qualifying: what one area holds");
  assert.ok(planMinutes({ ...p, count: 500 }) > planMinutes({ ...p, count: 200 }) || planCeiling(p) < 200, "500 is never quoted at 200's price");
});
```

`leads-finder.test.mjs`, where the count picker's options are pinned:

```js
  assert.deepEqual(counts.map((o) => o.note), ["about 12 min", "about 21 min", "more than this area likely holds", "more than this area likely holds"]);
```

- [ ] **Step 2: Red. Step 3:** in `lead-search.ts` the card's `placesPerMinute: 8` with the comment `// measured over five real searches, 20 Sep 2026: 10–25 minutes for 50 with checks`; add:

```ts
/** The most one area's terms can yield at the assumed rate: terms × the card's per-term cap × the yield. Above it the picker says so. */
export function planCeiling(plan: LeadSearchPlan): number {
  return Math.floor(plan.terms.length * cardOf(plan).maxPerTerm * LEAD_ASSUMED_YIELD);
}
```

In the picker (`leads-finder.jsx` ~272): `note: n > C.planCeiling(plan) ? "more than this area likely holds" : \`about ${C.planMinutes({ ...plan, count: n })} min\``. Add `planCeiling` to `__LEAD_VM` (import, type, value).

- [ ] **Step 4: green. Step 5: commit** — "About 12 minutes, measured; a count the area cannot hold says so".

---

### Task 6: The peek's words name their subject

**Files:**
- Modify: `packages/contracts/src/leads.ts` (`LEAD_CHECK_WORDS` unknowns; the peek VM's fit word for an excluded lead)
- Test: `tooling/scripts/tests/leads-vm.test.mjs`

- [ ] **Step 1: The failing test.**

```js
  // "Couldn't tell" under four rows told the owner nothing; each unknown names what could not be told.
  assert.equal(LEAD_CHECK_WORDS.phone_two_sources.unknown, "Phone on two sources — couldn't tell");
  assert.equal(LEAD_CHECK_WORDS.in_area.unknown, "In the area — couldn't tell");
  // "venues. Venue brand on 828venues host." glued the chip to the reason; the word says what happened first.
  const out = toLeadPeekVM(rowWith({ member: { class: "excluded", excluded_by: "venues", reason: "Venue brand on 828venues host." } }), search(), TZ, NOW_DATE);
  assert.deepEqual([out.fit.word, out.fit.sentence], ["Left out — venues", "Venue brand on 828venues host."]);
```

- [ ] **Step 2: Red. Step 3:** in the check words, replace each `unknown: LEAD_CHECK_UNSURE` with the row's own phrase: `on_maps` "On Google Maps — couldn't tell", `in_area` "In the area — couldn't tell", `phone_two_sources` "Phone on two sources — couldn't tell", `mailbox` "Mailbox — couldn't tell", `independent` "Independent — couldn't tell", `right_kind` "The right kind — couldn't tell", `own_address` "Their own address — couldn't tell". Keep `LEAD_CHECK_UNSURE` exported for any other reader. In `toLeadPeekVM`, where `fitWord` is chosen for `m.class === "excluded"`, make it `` `Left out — ${leadExclusionWord(search, m.excluded_by)}` `` (lower-case chip text as the plan wrote it).

- [ ] **Step 4: green** (`leads-vm`, `leads-peek`). **Step 5: commit** — "Each unknown names what could not be told; a left-out lead says so before its reason".

---

### Task 7: The card keeps the planner's standard; the ended strip's numbers are links

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/leads-finder.jsx` (`LeadPlanCard` `options` for a criterion; `ldStripOf` ended actions)
- Test: `tooling/scripts/tests/leads-finder.test.mjs`, `tooling/scripts/tests/leads-honest.test.mjs`

- [ ] **Step 1: The failing tests.** `leads-finder.test.mjs`, where a criterion's picker options are pinned:

```js
  // "How sure this has to be" is the planner's call now (#708); the owner's choice on a criterion is whether it stays.
  assert.deepEqual(criterionOptions.map((o) => o.id), ["drop"]);
  assert.equal(pickTitle("website"), "Keep or take out");
```

`leads-honest.test.mjs`, an ended search:

```js
  const acts = strips.at(-1).vm.actions;
  assert.deepEqual(acts.filter((a) => a.id === "review" || a.id === "excluded").map((a) => [a.id, a.label]), [["review", "14 need a look"], ["excluded", "4 left out"]], "the ending's numbers are the way into each pile");
  strips.at(-1).onAction("review", "review");
  assert.equal(went.at(-1), `clients/leads:s-${SEARCH_A}:c-review`);
```

(Use the fixture's own counts; `search()` in that file has `round.review` and `round.excluded`.)

- [ ] **Step 2: Red. Step 3:** in `LeadPlanCard.options` for a criterion return only the `drop` option; the title map's fallback becomes `"Keep or take out"`. In `ldStripOf`'s ended branch, before the return:

```js
  const piles = [
    ...(r.review > 0 ? [{ id: "review", label: `${r.review} need a look`, arg: "review" }] : []),
    ...(r.excluded > 0 ? [{ id: "excluded", label: `${r.excluded} left out`, arg: "excluded" }] : []),
  ].filter((a) => !line.step || line.step.id !== a.id);
```

and `actions: [...step, ...sorts, ...piles]`. (`onStripAction` already routes `review`/`excluded` to `goto({ cls })`; `quiet` already lists both, so they draw as quiet links.)

- [ ] **Step 4: green. Step 5: commit** — "A criterion stays or goes; the ending's numbers open their piles".

---

### Task 8: Dists, the whole suite, and the record

- [ ] `corepack pnpm -r --filter "./packages/*" build`; restore whitespace-only `.d.ts` churn (`git diff -w --ignore-cr-at-eol --stat`); `corepack pnpm typecheck`; `corepack pnpm test`; `corepack pnpm lint`.
- [ ] Add to PRD v3 §14 a line: "D1 (20 Sep): a lead is reachable or it is not; the words say what happened; the estimate is measured." Commit — "D1: clean leads — the contract and the words".
- [ ] PR to main; after deploy, open one ended search on production and confirm: the ending reads "Found all…", no Undo on the strip, the menu names the removal, the count picker's notes, the peek's rows.
