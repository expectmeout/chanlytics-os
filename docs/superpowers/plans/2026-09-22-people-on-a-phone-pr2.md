# People on a phone, PR 2: selecting, finished

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At 900px and under, a selection is one docked row: ✕, the count, one act and ⋯. The ⋯ opens a sheet with the rest, and each act that asks something first is a step inside that sheet. More › Select people starts a selection with nobody picked yet. Leads' selection gets the same row.

**Architecture:** Spec 4.5, the second half. The sheet's step is the page's state (`bulkSheet` in `ClientsAReal`), so the page's one keyboard listener closes it on Esc. Everything the sheet draws is hookless: `PhoneSheet` gains a Back button, and `PhoneSheetRow` is one row of a sheet's list. `PeopleBulkBar` keeps its own drafts (the list's name, the note, the slips note) and draws a phone layout when `phone` is true. `LeadsBulkBar` stays hookless, with its step passed in. `selectMode` (More › Select people) is the page's too, and `PeopleTable` takes it as `selectMode`. On a desktop nothing changes.

**Tech Stack:** Legacy JSX pages, plain CSS on the tokens, `node:test` over the stub React (`people-honest`, `leads-honest`), Playwright (`e2e/phone.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-09-22-people-on-a-phone-design.md` 4.5, 4.6. Branch `design/people-phone-select` off main after #830 and #832.

Run a test file from the worktree root with `node --conditions=react-server --import tsx --test tooling/scripts/tests/<file>.test.mjs`.

---

## File map

| File | What changes |
|---|---|
| `apps/dashboard/src/legacy/pages/clients-a.jsx` | `PhoneSheet` gets `onBack`. `PhoneSheetRow` is new. `PeopleBulkBar`: phone layout and its sheet, plus `onSheet`, `sheet`, `onSelectAll`. Page state `bulkSheet` and `selectMode`, one `clearSelection`, the keys, the more-menu's Select people, `PeopleTable selectMode`, and Leads' bar props |
| `apps/dashboard/src/legacy/pages/people-table.jsx` | `selectMode` prop: the wrap is `selecting` with nobody picked yet |
| `apps/dashboard/src/legacy/pages/leads-scope.jsx` | `LeadsBulkBar`: phone layout and its sheet (Select all that match, the review acts, Copy emails, Not a fit › the five whys, Export). LeadsScope passes `phone`, `bulkSheet` and `onBulkSheet` |
| `apps/dashboard/src/legacy/styles/clients.css` | `.cl-bulk.pp-bulk` (both scopes) replaces PR 1's People-only dock. Sheet rows and Back. Toasts lift over the docked row. Room under the list for both scopes |
| `apps/dashboard/src/legacy/styles/mobile.css` | `.cl-bulk { flex-wrap: wrap }` gone: at 900px and under every bulk bar is `.pp-bulk` |
| `apps/dashboard/src/legacy/Chanlytics.html` | `?v=`: clients-a.jsx 38, people-table.jsx 6, leads-scope.jsx 26, clients.css 21, mobile.css 21 (the Leads-count fix took 37/25/20) |
| `apps/dashboard/src/legacy/CLAUDE.md`, `docs/system-prd.md` | the phone's selection |
| `tooling/scripts/tests/people-honest.test.mjs`, `tooling/scripts/tests/leads-honest.test.mjs` | phone selection tests; Esc keeps the Leads `allMatching` honest |
| `e2e/phone.spec.ts` | selecting on a phone: the row in the viewport, the sheet whole |

---

### Task 1: A sheet's rows, and a way back

**Files:** Modify `clients-a.jsx` (`PhoneSheet`, after `AddPersonButton`); `clients.css` (the sheet block, after `.pp-sheet .confirm-block …`). Test: `people-honest.test.mjs`.

- [ ] **Step 1: Failing test** (append after the phone tests, before `/* ----- the keyboard ----- */` or next to "Esc closes the phone's own sheet"):

```js
test("a phone sheet's list is rows of one shape, and a step inside a sheet has a way back", () => {
  const Row = globalThis.window.PhoneSheetRow;
  const Sheet = globalThis.window.PhoneSheet;
  let pressed = 0;
  const row = Row({ icon: "edit", label: "Add a note", next: true, onClick: () => { pressed += 1; }, testid: "r" });
  assert.equal(row.type, "button");
  assert.match(row.props.className, /\bpp-sheet-row\b/);
  assert.ok(find(row, (n) => n.props?.className === "pp-sheet-row-next"), "a row that opens a step says so");
  click(row);
  assert.equal(pressed, 1);
  // A refused row is the gate's: focusable, described, inert.
  const refused = Row({ label: "Export", onClick: () => { pressed += 1; }, gate: { "aria-disabled": true, onClick: () => {} } });
  click(refused);
  assert.equal(pressed, 1, "the gate's press, not the act");
  let backs = 0;
  const s = Sheet({ title: "Record a yes", onClose: () => {}, onBack: () => { backs += 1; }, testid: "x", children: [] });
  click(byTestId(s, "x-back"));
  assert.equal(backs, 1);
  assert.equal(byTestId(Sheet({ title: "3 selected", onClose: () => {}, testid: "y", children: [] }), "y-back"), null, "the first step has no way back");
});
```

- [ ] **Step 2: Run it.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-honest.test.mjs --test-name-pattern "a phone sheet's list"`. It fails because `PhoneSheetRow` is not on window.

- [ ] **Step 3: Implement.** In `clients-a.jsx`, replace `PhoneSheet` and add `PhoneSheetRow` after it:

```jsx
// A sheet from the bottom of a phone for People's own small jobs -- Add a person, the open list's rename, delete and
// "Save these", and what a selection can become: a handle, a title, one way out, and the job. A step inside a sheet
// (`onBack`) has a way back to the list it came from. The page's own dialog: `pl-sheet` keeps it out of PL_OVERLAY,
// and the page's one keyboard listener closes it on Esc. Hookless: the page holds what is in it.
const PhoneSheet = ({ title, onClose, closeLabel = "Cancel", onBack = null, testid, children }) => (
  <>
    <div className="sb-sheet-backdrop" onClick={onClose} />
    <div className="sb-sheet pl-sheet pp-sheet" role="dialog" aria-modal="true" aria-label={title} data-testid={testid}>
      <div className="pp-sheet-handle" aria-hidden="true" />
      <div className="pp-sheet-head">
        {onBack && <button type="button" className="pp-sheet-back" onClick={onBack} aria-label="Back" data-testid={`${testid}-back`}><Icon name="chevron" size={18} /></button>}
        <h2 className="pp-sheet-title">{title}</h2>
        {closeLabel && <button type="button" className="pp-sheet-close" onClick={onClose} data-testid={`${testid}-close`}>{closeLabel}</button>}
      </div>
      <div className="pp-sheet-body">{children}</div>
    </div>
  </>
);

// One row of a phone sheet's list: its glyph, its words, what it holds (a file's kind), and a chevron when it opens a
// step of its own. `gate` is window.gate's answer for a row the member's role refuses: focusable, described, inert.
const PhoneSheetRow = ({ icon = null, label, meta = null, next = false, danger = false, disabled = false, onClick, testid, gate = null }) => (
  <button type="button" className={`pp-sheet-row${danger ? " danger" : ""}`} disabled={disabled} onClick={onClick} data-testid={testid} {...(gate || {})}>
    {icon ? <Icon name={icon} size={16} /> : null}
    <span className="pp-sheet-row-words">{label}</span>
    {meta ? <span className="pp-sheet-row-meta">{meta}</span> : null}
    {next ? <Icon name="chevron" size={14} className="pp-sheet-row-next" /> : null}
  </button>
);
```

Add `PhoneSheet, PhoneSheetRow` to the file's `Object.assign(window, {…})`.

In `clients.css`, after `.pp-sheet .confirm-block .confirm-acts .btn {…}`:

```css
/* A step's way back, before its title; the glyph is the chevron, turned. */
.pp-sheet-back { flex: none; width: 36px; height: 44px; margin-left: -10px; display: grid; place-items: center; padding: 0; border: 0; background: transparent; color: var(--ink-muted); cursor: pointer; }
.pp-sheet-back .icon { transform: scaleX(-1); }
/* A sheet's list: rows edge to edge within the sheet's gutter, 48px, the glyph in the muted ink. */
.pp-sheet-rows { display: flex; flex-direction: column; margin: 0 -8px; }
.pp-sheet-rows-h { padding: 12px 8px 4px; font-size: var(--text-xs); font-weight: var(--weight-medium); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-dim); }
.pp-sheet-row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 0 8px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--ink); font: inherit; font-size: var(--text-md); text-align: left; text-decoration: none; cursor: pointer; }
.pp-sheet-row:hover, .pp-sheet-row:active { background: var(--bg-hover); }
.pp-sheet-row:disabled { opacity: 0.5; cursor: default; }
.pp-sheet-row .icon { flex: none; color: var(--ink-muted); }
.pp-sheet-row.danger, .pp-sheet-row.danger .icon { color: var(--danger); }
.pp-sheet-row-words { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-sheet-row-meta { flex: none; font-size: var(--text-sm); color: var(--ink-dim); }
.pp-sheet-row .pp-sheet-row-next { color: var(--ink-faint); }
```

(Check that `--text-xs` exists in tokens.css. If it does not, use `var(--text-sm)`.)

- [ ] **Step 4: Run it.** It passes. Run the whole of `people-honest` too: `PhoneSheet`'s callers (Add, the list acts) are unchanged.

- [ ] **Step 5: Commit.** `A phone sheet's rows, and a way back from a step`.

---

### Task 2: The page holds the selection's step, a Select-people mode, and one way to clear

**Files:** Modify `clients-a.jsx` (the PR 1 phone states, the view-change effect at `setSel(new Set()); setAllMatching(false);`, `keys.current`, `selecting`, `phoneMenu`, `PeopleTable` and `PeopleBulkBar` in the render, Leads' `onClearSel`); `people-table.jsx` (`selectMode`). Test: `people-honest.test.mjs`, `leads-honest.test.mjs`.

- [ ] **Step 1: Failing tests.** People:

```js
test("on a phone More › Select people starts a selection with nobody picked: the faces are rings, a tap selects, and ✕ ends it", () => onPhone(async () => {
  await freshPage({ people: [person(1), person(2)] });
  let tree = draw();
  phoneMenuOf(tree).find((i) => i.label === "Select people").onClick();
  tree = draw();
  assert.match(find(tree, (n) => /\bpl-table-wrap\b/.test(String(n.props?.className || ""))).props.className, /\bselecting\b/, "the faces are rings");
  const bar = byTestId(tree, "bulk-bar");
  assert.match(textOf(bar), /Tap people to select them/, "the bar says what to do, and offers nothing to do yet");
  assert.equal(byTestId(bar, "bulk-more"), null);
  const before = opened.length;
  rowOf(tree, "p1").props.onClick();
  tree = draw();
  assert.equal(opened.length, before, "a tap selects");
  assert.match(textOf(byTestId(tree, "bulk-bar")), /1 selected/);
  rowOf(tree, "p1").props.onClick();
  tree = draw();
  assert.match(textOf(byTestId(tree, "bulk-bar")), /Tap people to select them/, "the last one off, the mode stays");
  click(byTestId(tree, "bulk-clear"));
  tree = draw();
  assert.equal(byTestId(tree, "bulk-bar"), null, "✕ ends it");
  rowOf(tree, "p1").props.onClick();
  assert.equal(opened.at(-1), "p1", "and a tap opens again");
}));

test("Esc ends a Select-people selection, and a desktop never offers the mode", () => onPhone(async () => {
  await freshPage({ people: [person(1)] });
  let tree = draw();
  phoneMenuOf(tree).find((i) => i.label === "Select people").onClick();
  assert.ok(byTestId(draw(), "bulk-bar"));
  assert.equal(press("Escape"), true);
  assert.equal(byTestId(draw(), "bulk-bar"), null);
}));
```

Leads (in `leads-honest.test.mjs`, beside "the bulk bar acts on the leads loaded and selected"):

```js
test("REGRESSION: Esc after Select all N that match lets go of the view too -- the next lead selected counted as the whole view", () => {
  fresh();
  byTestId(draw(), "select-all").props.onChange();
  click(byTestId(draw(), "leads-select-matching"));
  assert.match(textOf(byTestId(draw(), "leads-bulk-bar")), /322 selected/);
  assert.equal(press("Escape"), true);
  assert.equal(byTestId(draw(), "leads-bulk-bar"), null);
  // x selects the lead under the cursor; with the view let go, that is one lead.
  press("j");
  press("x");
  assert.match(textOf(byTestId(draw(), "leads-bulk-bar")), /^\s*1 selected/, "REGRESSION: 322 selected");
});
```

(Check the Leads file's own `press` helper and the cursor keys it uses. The test at ~line 755 selects with `x`; follow it.)

- [ ] **Step 2: Run them.** The People tests fail: there is no `Select people` item. The Leads test fails with "322 selected" if the bug is real. If the Leads test passes on main, drop it and keep `clearSelection` for People only.

- [ ] **Step 3: Implement.**

`people-table.jsx`: add `selectMode = false` to the props and change the flag:

```jsx
  // `selectMode`: the page's Select people (a phone's more-menu): the faces are rings with nobody picked yet.
  const selecting = selectMode || rows.some((p) => sel.has(p.id));
```

`clients-a.jsx`, after `const [listDraft, setListDraft] = useState(PL_LIST_EMPTY);`:

```jsx
  // A selection on a phone: the step its sheet is on (null when shut), and More › Select people, a selection begun
  // with nobody picked yet. The page's, so the one keyboard listener closes the sheet on Esc and the sheet is hookless.
  const [bulkSheet, setBulkSheet] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
```

Put the clear in one place, just before `keys.current = {`:

```jsx
  // Clearing a selection lets go of everything that came with it: the view "all N that match" stood for, the
  // Select-people mode and the sheet's step. Esc, ✕ and a new view all clear it this way.
  const clearSelection = () => { setSel(new Set()); setAllMatching(false); setSelectMode(false); setBulkSheet(null); };
```

The view-change effect becomes:

```jsx
  React.useEffect(() => { setSel(new Set()); setAllMatching(false); setSelectMode(false); setBulkSheet(null); }, [tab, listId, savedId, viewRoute, chip]);
```

In `keys.current`:

```jsx
    // sel.size, not the rows shown as the bar counts them: Esc can still drop a selection nobody can see. A
    // Select-people selection with nobody picked is one too.
    selected: sel.size > 0 || (phone && selectMode),
    clearSel: clearSelection,
    …
    sheetOpen: listsOpen || addOpen || !!listAct || !!bulkSheet,
    closeSheet: addOpen || listAct ? closePhoneSheet : bulkSheet ? () => setBulkSheet(null) : null,
```

`selecting` (People):

```jsx
  const selecting = (phone && selectMode) || shown.some((p) => sel.has(p.id));
```

`phoneMenu`, first item:

```jsx
    ...((canEditLists || canExport) && shown.length > 0 ? [{ label: "Select people", icon: "check", onClick: () => setSelectMode(true) }] : []),
```

`<PeopleTable … selectMode={phone && selectMode} …/>`, and the bar:

```jsx
        {selecting && <PeopleBulkBar sel={sel} rows={shown} saved={saved} savedRead={people.savedRead !== false} canEdit={canEditLists} canExport={canExport} onClear={clearSelection} onKeep={(rest) => setSel(new Set(rest))} flash={plFlash} activeSaved={activeSaved || null} phone={phone} sheet={phone ? bulkSheet : null} onSheet={setBulkSheet} onSelectAll={() => setSel(new Set(shownIds))} />}
```

Leads' `onClearSel={clearSelection}`.

`PeopleBulkBar` (this task only makes the 0-selected phone bar honest; Task 3 draws the phone layout): add `sheet = null, onSheet = () => {}, onSelectAll = null` to its props.

- [ ] **Step 4: Run** `people-honest`, `leads-honest` and `calendar-people`. They pass, with the old desktop bulk tests unchanged.

- [ ] **Step 5: Commit.** `A phone's Select people, and one way to clear a selection`.

---

### Task 3: People's selection on a phone: one row, and a sheet with the rest

**Files:** Modify `clients-a.jsx` (`PeopleBulkBar`). Test: `people-honest.test.mjs`.

- [ ] **Step 1: Failing tests:**

```js
/** The bar's sheet on a phone, drawn: select p1 and p2 by their faces and open ⋯. */
const bulkSheetOpen = () => {
  let tree = draw();
  byTestId(rowOf(tree, "p1"), "row-select").props.onChange();
  byTestId(rowOf(draw(), "p2"), "row-select").props.onChange();
  tree = draw();
  click(byTestId(tree, "bulk-more"));
  return draw();
};

test("REGRESSION: on a phone a selection is one row -- ✕, the count, Add to list and ⋯ -- its seven controls stacked into a 312px pill over the rows", () => onPhone(async () => {
  await freshPage({ people: [person(1), person(2), person(3)], lists: [{ id: "s1", name: "Regulars", ids: [] }] });
  globalThis.window.__setPersonConsentMany = async () => ({ ok: true, done: 2 });
  try {
    let tree = draw();
    byTestId(rowOf(tree, "p1"), "row-select").props.onChange();
    byTestId(rowOf(draw(), "p2"), "row-select").props.onChange();
    tree = draw();
    const bar = byTestId(tree, "bulk-bar");
    assert.match(bar.props.className, /\bpp-bulk\b/);
    const controls = bar.props.children.filter(Boolean).map((k) => k.props?.["data-testid"] || (k.type === globalThis.MoreMenu ? `menu:${k.props.label}` : k.props?.className));
    assert.deepEqual(controls, ["bulk-clear", "cl-bulk-count", "menu:Add to list", "bulk-more"], "four things, in one row");
    assert.equal(byTestId(bar, "bulk-export"), null, "the rest are the sheet's");
    assert.equal(byTestId(bar, "bulk-note"), null);
    const add = find(bar, (n) => n.type === globalThis.MoreMenu);
    assert.equal(add.props.escape, true, "placed against the window");
    assert.deepEqual(add.props.items.map((i) => i.label || i.header), ["Add to", "Regulars", "New list…"]);
  } finally {
    delete globalThis.window.__setPersonConsentMany;
  }
}));

test("on a phone ⋯ opens the selection's sheet: Select all, Record a yes ›, Add a note ›, Export, each a row; the steps ask, then act, then shut", () => onPhone(async () => {
  await freshPage({ people: [person(1), person(2), person(3)] });
  const said = [];
  globalThis.window.__setPersonConsentMany = async (ids, body) => { said.push(["yes", ids, body]); return { ok: true, done: ids.length }; };
  globalThis.window.__appendPersonNotesMany = async (ids, line) => { said.push(["note", ids, line]); return { ok: true, done: ids.length }; };
  try {
    let tree = bulkSheetOpen();
    const sheet = byTestId(tree, "bulk-sheet");
    assert.equal(sheet.props?.["aria-label"] ?? find(sheet, (n) => n.props?.role === "dialog").props["aria-label"], "2 selected");
    assert.deepEqual(all(sheet, (n) => /\bpp-sheet-row\b/.test(String(n.props?.className || ""))).map((n) => n.props["data-testid"]), ["bulk-select-all", "bulk-yes", "bulk-note", "bulk-export"]);
    // Record a yes, by a sign-up form: the step asks which forms, then records, then the sheet shuts.
    click(byTestId(sheet, "bulk-yes"));
    tree = draw();
    const form = find(byTestId(tree, "bulk-sheet"), (n) => /^bulk-yes-conversational-/.test(n.props?.["data-testid"] || "") && /form/.test(n.props["data-testid"]));
    click(form);
    tree = draw();
    byTestId(tree, "bulk-form-note").props.onChange({ target: { value: "Saturday's slips" } });
    await byTestId(draw(), "bulk-form-save").props.onClick();
    await settle();
    tree = draw();
    assert.deepEqual(said.at(-1)[2], { consent: "opted_in", source: "form", note: "Saturday's slips" });
    assert.equal(byTestId(tree, "bulk-sheet"), null, "the sheet shuts once it lands");
    assert.match(textOf(byTestId(tree, "bulk-bar")), /2 selected/, "the selection stays");
    // Add a note: one line, Add; the selection is done with.
    click(byTestId(tree, "bulk-more"));
    click(byTestId(draw(), "bulk-note"));
    tree = draw();
    byTestId(tree, "bulk-note-line").props.onChange({ target: { value: "Called about the move" } });
    await byTestId(draw(), "bulk-note-save").props.onClick();
    await settle();
    assert.deepEqual(said.at(-1), ["note", ["p1", "p2"], "Called about the move"]);
    assert.equal(byTestId(draw(), "bulk-bar"), null, "noted, the selection clears, as on a desktop");
  } finally {
    delete globalThis.window.__setPersonConsentMany;
    delete globalThis.window.__appendPersonNotesMany;
  }
}));

test("on a phone Esc shuts the selection's sheet and keeps the selection; Back walks a step back; Select all picks everyone shown", () => onPhone(async () => {
  await freshPage({ people: [person(1), person(2), person(3)] });
  globalThis.window.__setPersonConsentMany = async () => ({ ok: true, done: 1 });
  try {
    let tree = bulkSheetOpen();
    click(byTestId(tree, "bulk-yes"));
    tree = draw();
    click(byTestId(tree, "bulk-sheet-back"));
    tree = draw();
    assert.ok(byTestId(tree, "bulk-select-all"), "back at the list");
    assert.equal(press("j"), false, "the sheet holds the keys");
    assert.equal(press("Escape"), true);
    tree = draw();
    assert.equal(byTestId(tree, "bulk-sheet"), null, "Esc shut the sheet");
    assert.match(textOf(byTestId(tree, "bulk-bar")), /2 selected/, "REGRESSION: and not the selection behind it");
    click(byTestId(tree, "bulk-more"));
    click(byTestId(draw(), "bulk-select-all"));
    tree = draw();
    assert.match(textOf(byTestId(tree, "bulk-bar")), /3 selected/);
    assert.equal(byTestId(tree, "bulk-sheet"), null);
  } finally {
    delete globalThis.window.__setPersonConsentMany;
  }
}));

test("on a phone Add to list › New list… names the list in the sheet, and a member who may not edit gets the reason in it", () => onPhone(async () => {
  await freshPage({ people: [person(1), person(2)] });
  const made = [];
  globalThis.window.__lists = lists({ create: async (n) => { made.push(n); return { ok: true, data: { id: "s9" } }; }, add: async () => ({ ok: true, data: {} }) });
  let tree = draw();
  byTestId(rowOf(tree, "p1"), "row-select").props.onChange();
  tree = draw();
  find(byTestId(tree, "bulk-bar"), (n) => n.type === globalThis.MoreMenu).props.items.find((i) => i.label === "New list…").onClick();
  tree = draw();
  assert.ok(byTestId(tree, "bulk-sheet"), "the name is asked in the sheet, not in the row");
  byTestId(tree, "bulk-list-name").props.onChange({ target: { value: "Saturday" } });
  await byTestId(draw(), "bulk-list-save").props.onClick();
  await settle();
  assert.deepEqual(made, ["Saturday"]);
  assert.equal(byTestId(draw(), "bulk-sheet"), null);
}));
```

(The read-only case: `__ME: { role: "viewer" }` in a `try/finally`, the sheet's `pp-sheet-hint` says "Only an owner or operator can add to lists or record a yes." Add it as a fourth assertion group in the last test if `canEditLists` comes from `__ME` in this file's harness. Check with `grep -n "canEditLists =" clients-a.jsx` first.)

- [ ] **Step 2: Run them.** They fail: the bar has no `pp-bulk`, and there is no `bulk-more`.

- [ ] **Step 3: Implement** in `PeopleBulkBar`:

1. Take `sheet = null, onSheet = () => {}, onSelectAll = null` (Task 2 added them).
2. Pull Take off out of the render into `const dropFromList = () => run(() => window.__lists.drop(activeSaved.id, batch), () => <>{batch.length} taken off <b>{activeSaved.name}</b>{restWords}</>, () => { if (rest.length) onKeep(rest); else onClear(); });`, and let the desktop's button call it.
3. When an act lands, it shuts the sheet (on a desktop `onSheet` does nothing). In `createAndAdd`'s success, `setBusy(false); setNaming(false); setName(""); onSheet(null);`. In `addNote`'s success, `setNoting(false); setNote(""); onSheet(null); …`. `closeSlips` becomes `() => { setSlips(null); setSlipsNote(""); onSheet(null); }`.
4. Before the desktop `return (`, add the phone layout:

```jsx
  // On a phone (spec 4.5): one row docked along the foot of the pane -- ✕, the count, Add to list and ⋯ -- and a
  // sheet with the rest, where every act that asks something first asks it as a step. The step is the page's
  // (`sheet`), so its one keyboard listener shuts the sheet on Esc; the drafts are this bar's, as on a desktop.
  if (phone) {
    const n = ids.length;
    const back = () => onSheet("more");
    const yesOnPhone = (purpose, s) => () => {
      if (s.id === "form") { setSlips({ purpose, source: s }); setSlipsNote(""); onSheet("slips"); return; }
      onSheet(null);
      yes(purpose, s);
    };
    const field = (props) => <input className="pp-input" autoFocus maxLength={200} disabled={busy} {...props} />;
    const steps = {
      more: {
        title: `${n} selected`,
        body: (
          <div className="pp-sheet-rows">
            {onSelectAll && n < rows.length ? <PhoneSheetRow icon="check" label={`Select all ${rows.length}`} onClick={() => { onSheet(null); onSelectAll(); }} testid="bulk-select-all" /> : null}
            {canEdit && window.__setPersonConsentMany && sources.length > 0 ? <PhoneSheetRow icon="shield" label="Record a yes" next disabled={busy} onClick={() => onSheet("yes")} testid="bulk-yes" /> : null}
            {canEdit && isOwner && window.__setPersonReceptionistMany ? <PhoneSheetRow icon="agents" label="Receptionist" next disabled={busy} onClick={() => onSheet("receptionist")} testid="bulk-receptionist" /> : null}
            {canEdit && window.__appendPersonNotesMany ? <PhoneSheetRow icon="edit" label="Add a note" next disabled={busy} onClick={() => { setNote(""); onSheet("note"); }} testid="bulk-note" /> : null}
            {canExport ? <PhoneSheetRow icon="external" label="Export" meta="CSV" disabled={busy} onClick={() => { onSheet(null); exportCsv(); }} testid="bulk-export" /> : null}
            {canEdit && window.__lists && activeSaved ? <PhoneSheetRow icon="x" label={`Take off ${activeSaved.name}`} disabled={busy} onClick={() => { onSheet(null); dropFromList(); }} testid="bulk-drop-list" /> : null}
            {!canEdit ? <p className="pp-sheet-hint">Only an owner or operator can add to lists or record a yes.</p> : null}
          </div>
        ),
      },
      yes: {
        title: "Record a yes",
        onBack: back,
        body: (
          <div className="pp-sheet-rows">
            <div className="pp-sheet-rows-h">To messages about their visit</div>
            {sources.map((s) => <PhoneSheetRow key={s.id} icon="check" label={s.label} next={s.id === "form"} disabled={busy} onClick={yesOnPhone("conversational", s)} testid={`bulk-yes-conversational-${s.id}`} />)}
            {window.__setPersonMarketingConsentMany && offersSources.length > 0 ? <div className="pp-sheet-rows-h">To offers and news</div> : null}
            {window.__setPersonMarketingConsentMany ? offersSources.map((s) => <PhoneSheetRow key={s.id} icon="tag" label={s.label} next={s.id === "form"} disabled={busy} onClick={yesOnPhone("marketing", s)} testid={`bulk-yes-marketing-${s.id}`} />) : null}
          </div>
        ),
      },
      slips: {
        title: "Which forms they signed",
        onBack: () => { setSlips(null); setSlipsNote(""); onSheet("yes"); },
        body: (
          <>
            {field({ value: slipsNote, placeholder: "Which slips, e.g. Saturday's", "aria-label": "Which forms they signed", onChange: (e) => setSlipsNote(e.target.value), onKeyDown: (e) => { if (e.key === "Enter") recordSlips(); if (e.key === "Escape") closeSlips(); }, "data-testid": "bulk-form-note" })}
            <button type="button" className="btn btn-primary pp-sheet-go" disabled={busy || !slipsNote.trim()} onClick={recordSlips} data-testid="bulk-form-save">Record</button>
          </>
        ),
      },
      receptionist: {
        title: "Receptionist",
        onBack: back,
        body: (
          <div className="pp-sheet-rows">
            <div className="pp-sheet-rows-h">For these people</div>
            {PL_MODES.map((m) => <PhoneSheetRow key={m.id} icon={m.icon} label={plModeWord(m.id)} disabled={busy} onClick={() => { onSheet(null); receptionist({ ...m, label: plModeWord(m.id) }); }} testid={`bulk-mode-${m.id}`} />)}
          </div>
        ),
      },
      note: {
        title: "Add a note",
        onBack: back,
        body: (
          <>
            {field({ value: note, placeholder: "One line, under their notes", "aria-label": "The note", onChange: (e) => setNote(e.target.value), onKeyDown: (e) => { if (e.key === "Enter") addNote(); if (e.key === "Escape") { setNote(""); onSheet(null); } }, "data-testid": "bulk-note-line" })}
            <button type="button" className="btn btn-primary pp-sheet-go" disabled={busy || !note.trim()} onClick={addNote} data-testid="bulk-note-save">Add</button>
          </>
        ),
      },
      naming: {
        title: "New list",
        body: (
          <>
            {field({ value: name, maxLength: 60, placeholder: "Name the list", "aria-label": "The list's name", onChange: (e) => setName(e.target.value), onKeyDown: (e) => { if (e.key === "Enter") createAndAdd(); if (e.key === "Escape") { setName(""); onSheet(null); } }, "data-testid": "bulk-list-name" })}
            <button type="button" className="btn btn-primary pp-sheet-go" disabled={busy || !name.trim()} onClick={createAndAdd} data-testid="bulk-list-save">Make it</button>
          </>
        ),
      },
    };
    const step = n > 0 && sheet ? steps[sheet] : null;
    return (
      <>
        <div className="cl-bulk pp-bulk" role="toolbar" aria-label="Selected people" data-testid="bulk-bar">
          <button type="button" className="pp-bar-icon" aria-label="Clear the selection" onClick={onClear} data-testid="bulk-clear"><Icon name="x" size={18} /></button>
          <span className="cl-bulk-count">{n ? <><b>{n}</b> selected</> : "Tap people to select them"}</span>
          {canEdit && window.__lists && n > 0 && (
            <MoreMenu
              btnClass="btn btn-sm"
              escape
              label="Add to list"
              title="Add to a list"
              gated={busy ? "One moment — the last change is still saving" : null}
              items={savedRead ? [
                { header: "Add to" },
                ...saved.map((s) => ({ label: s.name, icon: "filter", onClick: () => addTo(s) })),
                { label: "New list…", icon: "plus", onClick: () => { setName(""); onSheet("naming"); } },
              ] : [
                { header: "Your saved lists couldn't be read" },
                { label: "New list…", icon: "plus", onClick: () => { setName(""); onSheet("naming"); } },
              ]}
            />
          )}
          {n > 0 && <button type="button" className="pp-bar-icon" aria-label={`More for the ${n} selected`} aria-haspopup="dialog" onClick={() => onSheet("more")} data-testid="bulk-more"><Icon name="more" size={18} /></button>}
        </div>
        {step && (
          <PhoneSheet title={step.title} onBack={step.onBack || null} onClose={() => onSheet(null)} testid="bulk-sheet">
            {step.body}
          </PhoneSheet>
        )}
      </>
    );
  }
```

`PhoneSheet` and `PhoneSheetRow` are defined below `AddPersonButton`, after `PeopleBulkBar` in the file. They are consts read at render, so the order is fine: `PeopleBulkBar` only runs once the file has loaded.

- [ ] **Step 4: Run** `people-honest` whole. The four new tests pass. The desktop's bulk tests (form note, list name, Esc, export) pass unchanged: they draw at desktop width.

- [ ] **Step 5: Commit.** `On a phone a selection is one row, and ⋯ is a sheet with the rest`.

---

### Task 4: Leads' selection on a phone, the same row

**Files:** Modify `leads-scope.jsx` (`LeadsBulkBar`, and LeadsScope's call); `clients-a.jsx` (LeadsScope's props: `bulkSheet={bulkSheet}`, `onBulkSheet={setBulkSheet}`). Test: `leads-honest.test.mjs`.

- [ ] **Step 1: Failing test:**

```js
test("REGRESSION: on a phone Leads' selection is one row -- ✕, the count, Mark contacted, ⋯ -- and Not a fit asks its five whys in the sheet; the why list was the peek's, full screen", () => {
  fresh();
  globalThis.__phone = true;
  try {
    byTestId(draw(), "select-all").props.onChange();
    let tree = draw();
    const bar = byTestId(tree, "leads-bulk-bar");
    assert.match(bar.props.className, /\bpp-bulk\b/);
    assert.deepEqual(bar.props.children.filter(Boolean).map((k) => k.props?.["data-testid"] || k.props?.className), ["leads-bulk-clear", "cl-bulk-count", "leads-bulk-contacted", "leads-bulk-more"]);
    click(byTestId(tree, "leads-bulk-more"));
    tree = draw();
    const sheet = byTestId(tree, "leads-bulk-sheet");
    assert.ok(byTestId(sheet, "leads-select-matching"), "Select all N that match is the sheet's first row");
    assert.ok(byTestId(sheet, "leads-bulk-copy"));
    assert.ok(byTestId(sheet, "leads-bulk-export"));
    click(byTestId(sheet, "leads-bulk-not-a-fit"));
    tree = draw();
    assert.equal(byTestId(tree, "peek-why"), null, "REGRESSION: the peek's own list, which a phone draws full screen");
    const whys = byTestId(tree, "leads-bulk-why");
    assert.ok(whys, "the five whys, as the sheet's step");
    click(byTestId(whys, "leads-bulk-why-chain"));
    return settle().then(() => {
      // bulkNotAFit sends LeadsBulkSchema's body, which carries no reason (clients-a.jsx): the ids, as shown and selected.
      assert.deepEqual(calls.at(-1), ["bulk", { by: "ids", action: "not_a_fit", ids: ["l1", "l2", "l3", "l4", "l5"] }]);
      assert.equal(byTestId(draw(), "leads-bulk-why"), null, "the sheet shuts on the pick");
    });
  } finally {
    globalThis.__phone = false;
  }
});

test("REGRESSION: the bulk bar draws Check N again for a selection of leads to check -- it read V, which nothing in its scope defines, and threw", () => {
  // Leads whose review groups offer check_again (a mail server that would not answer), all selected, with the courier.
  // Build the surface the way the bench test at ~line 456 does (its rows and `__leadCheckAgain`), select them all with
  // `select-all`, and draw on a desktop and on a phone (⋯ opens the sheet): both show "Check N again" with its cost.
});
```

(Fill the second test from the bench test's own fixture. It must fail on main with `ReferenceError: V is not defined`; if it does not, the bar is not reached and the fixture is wrong.)

- [ ] **Step 2: Run it.** It fails: no `pp-bulk`, no `leads-bulk-more`.

- [ ] **Step 3: Implement.** In `LeadsBulkBar`, add props `phone = false, sheet = null, onSheet = () => {}`. After `const gate = …`:

```jsx
  // On a phone (spec 4.5): People's row -- ✕, the count, the one act most leads get (Mark contacted) and ⋯ -- and a
  // sheet with the rest. Not a fit asks its five whys as the sheet's step: the peek's own list (LeadNotFitWhy) wears
  // .pl-peek, which a phone draws full screen. The words are the peek's, from the one list (__LEAD_WORDS.whys).
  if (phone) {
    const Sheet = window.PhoneSheet;
    const Row = window.PhoneSheetRow;
    const W = window.__LEAD_WORDS || {};
    const scope = (action) => (allMatching ? { by: "view", action, view } : { by: "ids", action, ids });
    return (
      <>
        <div className="cl-bulk ld-bulk pp-bulk" role="toolbar" aria-label="Selected leads" data-testid="leads-bulk-bar">
          <button type="button" className="pp-bar-icon" aria-label="Clear the selection" onClick={onClear} data-testid="leads-bulk-clear"><Icon name="x" size={18} /></button>
          <span className="cl-bulk-count"><b>{count}</b> selected{hidden > 0 ? <span data-testid="leads-bulk-hidden"> · {hidden} more not shown</span> : null}</span>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onContacted(scope("contacted"))} data-testid="leads-bulk-contacted" {...(canFind ? {} : window.gate("find", "mark these leads contacted"))}>Mark contacted</button>
          <button type="button" className="pp-bar-icon" aria-label={`More for the ${count} selected`} aria-haspopup="dialog" onClick={() => onSheet("more")} data-testid="leads-bulk-more"><Icon name="more" size={18} /></button>
        </div>
        {sheet === "more" && (
          <Sheet title={`${count.toLocaleString()} selected`} onClose={() => onSheet(null)} testid="leads-bulk-sheet">
            <div className="pp-sheet-rows">
              {!allMatching && total > rows.length ? <Row icon="check" label={`Select all ${total.toLocaleString()} that match`} onClick={() => { onSheet(null); onSelectAllMatching(); }} testid="leads-select-matching" /> : null}
              {acts.includes("check_again") && review.canCheckAgain ? <Row icon="refresh" label={`Check ${ids.length} again`} meta={`about ${V.leadCheckAgainCents ? V.leadCheckAgainCents(ids.length) : ids.length}¢`} disabled={busy} onClick={() => { onSheet(null); review.onCheckAgain(ids); }} testid="leads-bulk-check-again" gate={canFind ? null : gate} /> : null}
              {acts.includes("find_email") && review.canFindEmail ? <Row icon="search" label={`Find ${ids.length === 1 ? "an email" : `${ids.length} emails`}`} disabled={busy} onClick={() => { onSheet(null); review.onFindEmail(ids); }} testid="leads-bulk-find-email" gate={canFind ? null : gate} /> : null}
              {acts.includes("keep") ? <Row icon="check" label={`Keep ${ids.length}`} disabled={busy} onClick={() => { onSheet(null); review.onKeep(ids); }} testid="leads-bulk-keep" gate={canFind ? null : gate} /> : null}
              {acts.includes("exclude") ? <Row icon="x" label={`Exclude ${ids.length}`} disabled={busy} onClick={() => { onSheet(null); review.onExclude(ids); }} testid="leads-bulk-exclude" gate={canFind ? null : gate} /> : null}
              <Row icon="copy" label="Copy emails" disabled={busy} onClick={() => { onSheet(null); onCopyEmails(picked); }} testid="leads-bulk-copy" />
              <Row icon="ban" label="Not a fit" next disabled={busy} onClick={() => onSheet("why")} testid="leads-bulk-not-a-fit" gate={canFind ? null : window.gate("find", "mark these leads not a fit")} />
              {canExport
                ? <a className="pp-sheet-row" href={exportHref} download onClick={() => onSheet(null)} data-testid="leads-bulk-export"><Icon name="external" size={16} /><span className="pp-sheet-row-words">Export</span><span className="pp-sheet-row-meta">CSV</span></a>
                : <Row icon="external" label="Export" meta="CSV" gate={window.gate("export", "export these leads")} testid="leads-bulk-export" />}
              {whyNot ? <p className="pp-sheet-hint">{whyNot}</p> : null}
            </div>
          </Sheet>
        )}
        {sheet === "why" && (
          <Sheet title={W.notFitTitle || "Not a fit"} onBack={() => onSheet("more")} onClose={() => onSheet(null)} testid="leads-bulk-why">
            <div className="pp-sheet-rows">
              {(W.whys || []).map((w) => <Row key={w.id} label={w.label} disabled={busy} onClick={() => { onSheet(null); onNotAFit(w.id, scope("not_a_fit")); }} testid={`leads-bulk-why-${w.id}`} />)}
            </div>
          </Sheet>
        )}
      </>
    );
  }
```

Add `const V = window.__LEAD_VM || {};` at the top of `LeadsBulkBar`. Its desktop Check again read `V` with no `V` in scope (the three `const V` in this file are other functions' own), so a selection of leads to check again threw on production. The phone branch reads the same `V`. LeadsScope's call gains `phone={phone}`, `sheet={p.bulkSheet}` and `onSheet={p.onBulkSheet}`. ClientsAReal's `<LeadsScope …>` gains `bulkSheet={phone ? bulkSheet : null}` and `onBulkSheet={setBulkSheet}`.

- [ ] **Step 4: Run** `leads-honest` whole. The desktop bulk test ("the bulk bar acts on the leads loaded and selected") passes unchanged.

- [ ] **Step 5: Commit.** `On a phone Leads' selection is People's row, and Not a fit asks in the sheet`.

---

### Task 5: The row docks, above the home bar, for both scopes

**Files:** Modify `clients.css` (PR 1's `.clients:not(.leads-scope) .cl-bulk` and `.pl-table-wrap.selecting` rules in the ≤900 phone block, and a new `.pp-bulk` block beside the sheet rules); `mobile.css` (`.cl-bulk { flex-wrap: wrap; row-gap: 6px; }` and its comment).

- [ ] **Step 1: Replace PR 1's dock** (the comment "The selection's bar, docked: …" and its three rules) with:

```css
  /* The list keeps room under its last row for the selection's docked row (.pp-bulk), both scopes. */
  .pl-table-wrap.selecting { margin-bottom: calc(64px + env(safe-area-inset-bottom, 0px)); }
  /* A toast rises over the docked row rather than covering it: its Undo and the row's ✕ are both a thumb's. From 721 to
     900px the row is at the screen's foot (mobile.css: toasts 14px up); at 720 and under it stands on the tab bar
     (.phone-tabs, 64px; mobile.css puts toasts 76px up, which is ON the row: measured 22 Sep, row 687-748, tabs 754-812). */
  body:has(.cl-bulk.pp-bulk) .pp-toast-stack { bottom: calc(78px + env(safe-area-inset-bottom, 0px)); }
}
@media (max-width: 720px) {
  body:has(.cl-bulk.pp-bulk) .pp-toast-stack { bottom: calc(140px + env(safe-area-inset-bottom, 0px)); }
  /* The tab bar under it clears the home bar; the row needs no inset of its own. */
  .cl-bulk.pp-bulk { padding-bottom: 6px; }
```

and, top level beside the `.pp-bar` rules:

```css
/* A selection on a phone (PeopleBulkBar and LeadsBulkBar with `phone`): one row docked along the foot of the pane,
   edge to edge and above the home bar -- ✕, the count, one act and ⋯, whose sheet holds the rest. It stood at
   left: 50% with the width the browser left it, 188px on a 375px phone, and its seven controls stacked into a 312px
   pill over the rows; its hairline sets it apart, no shadow. The home bar's inset is for 721 to 900px, where no tab bar
   stands under it (see the 720px block). */
.cl-bulk.pp-bulk { left: 0; right: 0; bottom: 0; transform: none; flex-wrap: nowrap; gap: 4px; padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px)) 4px; border-width: 1px 0 0; border-radius: 0; box-shadow: none; animation: none; }
.cl-bulk.pp-bulk .cl-bulk-count { flex: 1 1 auto; min-width: 0; margin: 0 0 0 2px; overflow: hidden; text-overflow: ellipsis; font-size: var(--text-md); }
.cl-bulk.pp-bulk > .btn, .cl-bulk.pp-bulk > .more-wrap, .cl-bulk.pp-bulk > .pp-bar-icon { flex: none; }
.cl-bulk.pp-bulk .btn { font-size: var(--text-md); padding: 0 14px; }
```

- [ ] **Step 2:** In `mobile.css` delete `/* A selection's bulk bar wraps on a phone instead of running off the edge. */` and `.cl-bulk { flex-wrap: wrap; row-gap: 6px; }`. At 900px and under every bulk bar is `.pp-bulk` now.

- [ ] **Step 3: Measure** with the scratchpad probe (`pass.mjs`) at 375×812 touch, People and Leads, and at 820 (no tab bar). Check: the row is one line, about 57px tall, and stands on the tab bar at 375 (production: pane foot 748, tabs 754); its left and right edges are at 0 and 375; the count ellipsizes, not wraps; the ⋯ sheet sits whole in the viewport and its rows are 48px; a toast (after Export) sits over the row, not on it; the page has no horizontal overflow. Take one screenshot of each scope's sheet for the PR. Also check 1280: the desktop's pill is unchanged.

- [ ] **Step 4: Commit.** `The selection's row docks above the home bar, on both scopes`.

---

### Task 6: The browser's word

**Files:** `e2e/phone.spec.ts` (the People phone test from PR 1).

- [ ] **Step 1:** After the Add sheet's checks, add a selection pass. Tap the first row's face (`[data-testid="row-select"]` in the first `tr.pl-card-row`, with `force: true`, since it is laid over the face at opacity 0) and expect `bulk-bar` to be visible. Then check: its box is within `[0, viewport.width]`, `height <= 64 + 34`, it sits at the bottom of the viewport (`box.y + box.height >= viewport.height - 1`), and its `scrollWidth <= clientWidth + 1` (one row, no sideways scroll). Press `bulk-more` and expect `bulk-sheet` to be visible with its last row inside the viewport. Press `bulk-sheet-close` (Cancel), then `bulk-clear`, and expect the bar gone.

- [ ] **Step 2:** `corepack pnpm exec playwright test --list e2e/phone.spec.ts` parses. The spec runs in the nightly.

- [ ] **Step 3: Commit.** `The browser holds a phone's selection row and its sheet`.

---

### Task 7: Versions, docs, the whole suite, the PR

- [ ] **Step 1: `Chanlytics.html`.** clients-a.jsx 37→38, people-table.jsx 5→6, leads-scope.jsx 25→26, clients.css 20→21, mobile.css 20→21. Re-check main's keys first: a peer may have taken one.
- [ ] **Step 2: `legacy/CLAUDE.md`.** Extend the "People on a phone" bullet: a selection is one docked row (`.pp-bulk`, both scopes) and a sheet with its steps; the step is the page's `bulkSheet`; `selectMode` is More › Select people; `clearSelection` is the one clear. **`docs/system-prd.md`**: People's phone line gains the selection.
- [ ] **Step 3: The whole suite:** build, typecheck, lint and test. Then `git status`: no dist drift (line endings only → `git checkout -- packages/*/dist`).
- [ ] **Step 4: PR.** `Selecting on a phone, finished`. The body says what changes for a member (the row, the sheet, Select people, Leads' row and whys, the toast lift, the Esc fix), the proof, and "nothing to set; either deploy order". Watch CI, squash-merge on green, and verify on production at 375×812 touch in both themes, and at 1280×800.
