# People on a phone, PR 1: one bar, and rows that read like the Inbox's

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At 900px and under, People is one bar (both scopes), one line and flat rows a thumb reads at a glance, with its acts in a more-menu and two sheets, and nothing off the edge, squashed or stacked.

**Architecture:** Every phone piece is hookless and drawn by `ClientsAReal`, which holds its state (`searchOpen`, `addOpen`/`addDraft`, `listAct`/`listDraft`) with the rest of the page's hooks, because the tests' stub React keys hooks by one global call order. The phone row is one cell (`plCardCell`) drawn from the row's view model, chosen in place of `PL_COLUMNS` when `phone` is true, so the desktop's table is untouched. CSS lives in `clients.css` under `@media (max-width: 900px)`, scoped to People (`.clients:not(.leads-scope)`, `tr.pl-card-row`) wherever Leads shares a class.

**Tech Stack:** legacy JSX pages (script-mode globals, bundled by Next; Babel in the standalone harness), plain CSS on the app's tokens, `node:test` over the stub React (`people-honest`, `leads-honest`, `menu-escape`), Playwright (`e2e/phone.spec.ts`, `e2e/leads.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-09-22-people-on-a-phone-design.md`. Worktree `cm-people-phone`, branch `design/people-phone` off `75fef029` (#827).

Run a test file with: `node --test --conditions=react-server tooling/scripts/tests/<file>.test.mjs` from the worktree root.

---

## File map

| File | What changes |
|---|---|
| `apps/dashboard/src/legacy/components/data-bits.jsx` | `MoreMenu`: an item with `checked` is a `menuitemradio` with a tick |
| `apps/dashboard/src/legacy/styles/components.css` | `.more-item[aria-checked="false"] .icon { visibility: hidden }` |
| `apps/dashboard/src/legacy/pages/clients-a.jsx` | list and add verbs as helpers; `PeopleStanding` counts only; `PeoplePhoneBar`; `PhoneSheet`, `PeopleAddSheet`, `PeopleListActSheet`; `plCardCell`, `PL_PHONE_COLUMNS`; `PeopleRail` `scopeTabs`/`everyone`; page state, handlers, menu, render; `PeopleBulkBar` `phone` |
| `apps/dashboard/src/legacy/pages/leads-scope.jsx` | `LeadsPhoneBar` draws `PeoplePhoneBar` with Find |
| `apps/dashboard/src/legacy/styles/clients.css` | the phone block: bar, standing, list step, rows, face-select, bulk dock, sheets, empty row; `.pl-standing-lists` gone |
| `apps/dashboard/src/legacy/styles/mobile.css` | `.pl-standing-lists` gone |
| `apps/dashboard/src/legacy/styles/leads.css` | the old bar's rules gone (`.ld-bar-find` stays) |
| `apps/dashboard/src/legacy/Chanlytics.html` | `?v=`: data-bits 23, components.css 68, clients.css 19, leads.css 29, mobile.css 20, clients-a.jsx 36, leads-scope.jsx 24 |
| `apps/dashboard/src/legacy/CLAUDE.md` | People's phone bar, sheets and the phone row, one bullet |
| `tooling/scripts/tests/menu-escape.test.mjs` | radio items |
| `tooling/scripts/tests/people-honest.test.mjs` | new phone tests; 3 tests follow the moved lists pick and the one-cell row |
| `tooling/scripts/tests/leads-honest.test.mjs` | the bar's search is a button |
| `tooling/scripts/tests/saved-lists.test.mjs` | `people-lists-pick` leaves the source scan (a behaviour test holds it) |
| `e2e/phone.spec.ts`, `e2e/leads.spec.ts` | People on a phone; Leads' search button |

---

### Task 1: A menu item that is one of a set

**Files:** Modify `apps/dashboard/src/legacy/components/data-bits.jsx` (MoreMenu, ~104-170), `apps/dashboard/src/legacy/styles/components.css` (~1725). Test: `tooling/scripts/tests/menu-escape.test.mjs`.

- [ ] **Step 1: Write the failing test** (append to `menu-escape.test.mjs`)

```js
test("an item with `checked` is one of a set: a menuitemradio, ticked when chosen, the words in one column either way", () => {
  const items = [
    { header: "Sort" },
    { label: "Needs you first", checked: false, onClick() {} },
    { label: "Latest contact first", checked: true, onClick() {} },
    { label: "Export everyone", icon: "external", onClick() {} },
  ];
  cells = []; seq = 0;
  const shut = MoreMenu({ items });
  find(shut, (n) => n.type === "button" && n.props["aria-haspopup"] === "menu").props.onClick({ stopPropagation() {} });
  seq = 0;
  const open = MoreMenu({ items });
  const rows = [];
  walk(open, (n) => { if (n.type === "button" && /\bmore-item\b/.test(String(n.props?.className || ""))) rows.push(n); });
  const said = (n) => (n.props.children || []).flat(Infinity).find((k) => k && k.props && k.props.className === "more-item-label").props.children.join("");
  assert.deepEqual(rows.map((n) => [said(n), n.props.role, n.props["aria-checked"]]), [
    ["Needs you first", "menuitemradio", false],
    ["Latest contact first", "menuitemradio", true],
    ["Export everyone", "menuitem", undefined],
  ]);
  const icons = rows.map((n) => (n.props.children || []).flat(Infinity).find((k) => k && k.type === "Icon"));
  assert.deepEqual(icons.map((i) => i && i.props.name), ["check", "check", "external"], "a set's items all draw the tick, and CSS hides it where aria-checked is false");
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test --conditions=react-server tooling/scripts/tests/menu-escape.test.mjs`
Expected: FAIL, `role` is `"menuitem"` and `aria-checked` undefined for the first two rows.

- [ ] **Step 3: Implement.** In `MoreMenu`'s items map, replace the item button with:

```jsx
              // One of a set (a sort, say): a radio item with the tick drawn on every one, hidden where it is not the
              // one chosen (components.css), so the words stand in one column either way.
              const radio = typeof it.checked === "boolean";
              return (
                <button key={i} className={`more-item ${it.danger ? "danger" : ""}`} role={radio ? "menuitemradio" : "menuitem"} aria-checked={radio ? it.checked : undefined} onClick={() => run(it)} {...(it.gate || {})}>
                  {radio ? <Icon name="check" size={13} /> : it.icon && <Icon name={it.icon} size={13} />}
                  <span className="more-item-label">{it.label}</span>
                  {it.meta && <span className="more-item-meta">{it.meta}</span>}
                  {it.hint && <span className="more-item-hint">{it.hint}</span>}
                </button>
              );
```

and add to the comment above `MoreMenu`: `// An item with \`checked\` (true or false) is one of a set: a menuitemradio, ticked when true.`

In `components.css`, after `.more-item .icon { width: 16px; height: 16px; }`:

```css
/* One of a set (MoreMenu `checked`): the tick beside the one chosen and none beside the rest, the words in one column.
   The Columns menu's rule (clients.css .pl-cols), for any menu. */
.more-item[aria-checked="false"] .icon { visibility: hidden; }
```

- [ ] **Step 4: Run it and see it pass.** Same command. Expected: PASS, and every other test in the file still passes.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/legacy/components/data-bits.jsx apps/dashboard/src/legacy/styles/components.css tooling/scripts/tests/menu-escape.test.mjs
git commit -m "A menu item can be one of a set: a radio item with its tick"
```

### Task 2: The list and add verbs, one door each

Pure refactor under existing tests: `ListTitle`, `DeleteListButton`, `SaveShownAsList`, `PeopleBulkBar.createAndAdd` and `AddPersonButton` call hookless helpers the phone's sheets will call too.

**Files:** Modify `apps/dashboard/src/legacy/pages/clients-a.jsx`.

- [ ] **Step 1: Baseline.** Run `node --test --conditions=react-server tooling/scripts/tests/people-honest.test.mjs tooling/scripts/tests/saved-lists.test.mjs`. Expected: PASS. Note the count.

- [ ] **Step 2: Add the helpers** just above `DeleteListButton`:

```js
// A list's acts, one door each, for a desktop's title line and the phone's sheet alike: what the door answered, and the
// sentence to show where it refused. Rename and delete were written into their two components, and a list made with
// people on it into two more (Save these, the bulk bar's New list); the phone's sheet would have been a fifth copy.
const plRenameList = async (list, name) => {
  const r = await window.__lists.rename(list.id, name);
  return r.ok ? { ok: true } : { ok: false, error: r.message || "Could not rename the list." };
};
const plDeleteList = async (list) => {
  const r = await window.__lists.remove(list.id);
  return r.ok ? { ok: true } : { ok: false, error: r.message || "The list could not be deleted." };
};
// Made, then filled. A list whose filling the server refused (more people than it takes at once, say) is taken back,
// so no empty list is left behind. `made` is the make's answer, `filled` the fill's (null when nothing was made).
const plMakeListWith = async (name, ids) => {
  const made = await window.__lists.create(name);
  if (!made.ok) return { made, filled: null, id: null };
  const id = plMadeId(made, name);
  const filled = id ? await window.__lists.add(id, ids) : { ok: false, message: "The list was made but not found again." };
  if (!filled.ok && id) await window.__lists.remove(id);
  return { made, filled, id };
};
// Somebody the business meets before they ever write or call, added by hand through the door the calendar sweep uses:
// a number already here opens that person rather than making a second one. The desktop's form and the phone's sheet
// add through this and say it the same way.
const plAddPerson = async ({ name, phone }) => {
  const r = await window.__addPerson({ phone: phone.trim(), ...(name.trim() ? { name: name.trim() } : {}) });
  if (r.ok) return { ok: true, id: r.data.contact_id, existed: !!r.data.existed };
  // The field's own sentence where the route named one, else the refusal's.
  return { ok: false, error: (r.fields && Object.values(r.fields)[0]) || r.message || "Could not add them." };
};
const plAddedWords = ({ name, phone }, existed) => (existed ? <><b>{name.trim() || phone.trim()}</b> was already here — opened</> : <><b>{name.trim() || phone.trim()}</b> added</>);
```

- [ ] **Step 3: Call them.** `DeleteListButton.go` body after `setError(null);`: `const r = await plDeleteList(list); setBusy(false); if (!r.ok) { setError(r.error); return; } setArm(false); onDeleted();`. `ListTitle.save` after `setBusy(true); setError(null);`: `const r = await plRenameList(list, n); setBusy(false); if (!r.ok) { setError(r.error); return; } setEditing(false); onRenamed(n);`. `SaveShownAsList.submit` after `setBusy(true);`:

```js
    const { made, filled, id } = await plMakeListWith(n, ids);
    if (!made.ok) { setBusy(false); flash({ tone: "danger", msg: <>{made.message || "Could not make the list."}</> }); return; }
    setBusy(false); setOpen(false); setName("");
    flash(filled.ok ? { msg: <>{ids.length} kept as <b>{n}</b></>, undo: () => plUndoList(id, n, flash) } : window.refusalToast(filled, "Not kept as a list"));
```

`PeopleBulkBar.createAndAdd` after `setBusy(true);`:

```js
    const { made, filled, id } = await plMakeListWith(n, ids);
    if (!made.ok) { setBusy(false); flash({ tone: "danger", msg: <>{made.message || "Could not make the list."}</> }); return; }
    setBusy(false); setNaming(false); setName("");
    flash(filled.ok ? { msg: <>{ids.length} on the new list <b>{n}</b></>, undo: () => plUndoList(id, n, flash) } : window.refusalToast(filled, id ? `${n} was not made` : "Not added to the new list"));
```

`AddPersonButton.submit`:

```js
  const submit = async () => {
    if (busy || !phone.trim() || !window.__addPerson) return;
    setBusy(true); setError(null);
    const r = await plAddPerson({ name, phone });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    flash({ msg: plAddedWords({ name, phone }, r.existed) });
    close();
    onAdded(r.id);
  };
```

- [ ] **Step 4: Run the Step 1 command.** Expected: PASS, the same count.

- [ ] **Step 5: Commit** `git commit -am "People's list and add verbs, one door each"`

### Task 3: One bar for both scopes

**Files:** Modify `clients-a.jsx` (new `PeoplePhoneBar` after `PeopleStanding`; export), `leads-scope.jsx` (`LeadsPhoneBar`), `clients.css`, `leads.css`. Test: `leads-honest.test.mjs` (the phone section).

- [ ] **Step 1: Change the Leads bar test to the new rule** (replace the test "on a phone the switch, search and Find are one bar…" and let `bar()` take `searchOpen`):

```js
const bar = (over = {}) => {
  cells = []; seq = 0;
  return globalThis.window.LeadsPhoneBar({
    scope: "leads", onScope() {}, listLabel: "All leads · 322", onLists() {}, listsOpen: false,
    q: "", onQ() {}, searchRef: { current: null }, searchOpen: false, onSearchOpen() {}, onFind() {}, canFind: true, ...over,
  });
};

test("on a phone the switch, the list, search and Find are one bar; search is a button that opens the bar into the field", () => {
  fresh();
  const t = bar();
  const tabs = all(t, (n) => n.props?.role === "tab");
  assert.deepEqual(tabs.map((n) => [textOf(n), n.props["aria-selected"]]), [["People", false], ["Leads", true]]);
  assert.equal(byTestId(t, "leads-phone-search-open").props["aria-label"], "Search leads");
  assert.equal(byTestId(t, "leads-phone-search"), null, "REGRESSION: the box was 64px wide on a phone and said 'Sear'");
  assert.equal(byTestId(t, "leads-phone-find").props["aria-label"], "Find leads");
  assert.equal(textOf(byTestId(t, "leads-phone-lists")), "All leads · 322");
  assert.equal(all(t, (n) => n.props?.["data-testid"] === "leads-phone-bar").length, 1, "one bar, not a row of controls");
  const open = bar({ searchOpen: true });
  const field = byTestId(open, "leads-phone-search");
  assert.equal(field.props["aria-label"], "Search leads");
  assert.equal(field.props.autoFocus, true, "pressed, the field takes focus, so the keyboard comes up");
  assert.equal(byTestId(open, "leads-phone-lists"), null, "and the bar is the field");
  const kept = byTestId(bar({ q: "pilates" }), "leads-phone-search");
  assert.equal(kept.props.value, "pilates", "a view's own words keep the field open");
  assert.notEqual(kept.props.autoFocus, true, "without taking focus: a view coming back must not pull up the keyboard");
});
```

- [ ] **Step 2: Run it and see it fail.** `node --test --conditions=react-server tooling/scripts/tests/leads-honest.test.mjs` → FAIL (`leads-phone-search-open` not found).

- [ ] **Step 3: Implement `PeoplePhoneBar`** in `clients-a.jsx`, after `PeopleStanding`, and add it to the file's `Object.assign(window, {…})`:

```jsx
// The phone's one bar (900px and under, the band the rows and the Lists sheet use), the same for both scopes of
// People: the People | Leads switch, the list being shown, search behind a button, and the scope's own last control
// -- People's more-menu, Leads' Find. Nothing sits above the rows but the one line under it: the phone shows the work
// first. Searching, the bar is the field, full width and 16px, so a phone never zooms into it, and Cancel gives the
// bar back; words in the box keep it open (a view of Leads comes back with its own) without taking focus. The search
// was a box of its own: 64px wide on Leads ("Sear"), and on People a 57px row above three text buttons. Hookless: its
// state is the page's (`searchOpen`), so the tests' stub React counts one hook order.
const PeoplePhoneBar = ({ scope, onScope, listLabel, onLists, listsOpen = false, q, onQ, searchRef, searchOpen = false, onSearchOpen, searchLabel, trailing = null, testid }) => {
  const id = (part) => `${testid}-phone-${part}`;
  if (searchOpen || q) {
    return (
      <div className="pp-bar is-searching" data-testid={id("bar")}>
        <label className="pp-bar-field">
          <Icon name="search" size={16} />
          <input
            ref={searchRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoFocus={searchOpen}
            value={q}
            placeholder={searchLabel}
            aria-label={searchLabel}
            onChange={(e) => onQ(e.target.value)}
            data-testid={id("search")}
          />
          {q ? (
            <button type="button" className="pp-bar-clear" aria-label="Clear the search" onClick={() => { onQ(""); if (searchRef && searchRef.current) searchRef.current.focus(); }} data-testid={id("search-clear")}>
              <Icon name="x" size={12} />
            </button>
          ) : null}
        </label>
        <button type="button" className="pp-bar-cancel" onClick={() => { onQ(""); onSearchOpen(false); }} data-testid={id("search-cancel")}>Cancel</button>
      </div>
    );
  }
  return (
    <div className="pp-bar" data-testid={id("bar")}>
      <div className="pt-scope" role="tablist" aria-label="Which people">
        <button type="button" role="tab" aria-selected={scope === "people"} className={scope === "people" ? "on" : ""} onClick={() => onScope("people")}>People</button>
        <button type="button" role="tab" aria-selected={scope === "leads"} className={scope === "leads" ? "on" : ""} onClick={() => onScope("leads")}>Leads</button>
      </div>
      <button type="button" className="pp-bar-pick" aria-haspopup="dialog" aria-expanded={!!listsOpen} onClick={onLists} data-testid={id("lists")}>
        <span className="pp-bar-pick-words">{listLabel}</span>
        <Icon name="chevron-down" size={11} />
      </button>
      <span className="pp-bar-gap" />
      <button type="button" className="pp-bar-icon" aria-label={searchLabel} onClick={() => onSearchOpen(true)} data-testid={id("search-open")}>
        <Icon name="search" size={18} />
      </button>
      {trailing}
    </div>
  );
};
```

`LeadsPhoneBar` in `leads-scope.jsx` becomes:

```jsx
// The phone's one bar, Leads' way: People's bar (PeoplePhoneBar, clients-a.jsx) with Find as its last control. The
// switch, the list and search are the same bar on both scopes; nothing else sits above the rows (legacy/CLAUDE.md,
// the phone shows the work first).
const LeadsPhoneBar = ({ scope, onScope, listLabel, onLists, listsOpen, q, onQ, searchRef, searchOpen = false, onSearchOpen = () => {}, onFind, canFind }) => {
  const Bar = window.PeoplePhoneBar;
  return (
    <Bar
      scope={scope}
      onScope={onScope}
      listLabel={listLabel}
      onLists={onLists}
      listsOpen={listsOpen}
      q={q}
      onQ={onQ}
      searchRef={searchRef}
      searchOpen={searchOpen}
      onSearchOpen={onSearchOpen}
      searchLabel="Search leads"
      testid="leads"
      trailing={(
        <button type="button" className="ld-bar-find" aria-label="Find leads" data-testid="leads-phone-find" onClick={onFind} {...(canFind ? {} : window.gate("find", "find businesses for you"))}>
          <Icon name="sparkle" size={20} />
        </button>
      )}
    />
  );
};
```

and in `LeadsScope`'s `<LeadsPhoneBar …>` add `searchOpen={p.searchOpen}` and `onSearchOpen={p.onSearchOpen}`. In `ClientsAReal`, declare after `const [newListSignal, setNewListSignal] = useState(0);`:

```js
  // The phone's search: open, the bar is the field (PeoplePhoneBar). Words in the box keep it open.
  const [searchOpen, setSearchOpen] = useState(false);
```

and pass `searchOpen={searchOpen}` and `onSearchOpen={setSearchOpen}` to `<LeadsScope>`.

- [ ] **Step 4: The bar's CSS.** Append to `clients.css`:

```css
/* ==== People on a phone (docs/superpowers/specs/2026-09-22-people-on-a-phone-design.md) ============================
   The page draws these only at 900px and under (PL_PHONE_QUERY), the band the rows, the bar and the Lists sheet share. */

/* The one bar, for both scopes (PeoplePhoneBar): the switch, the list, search behind a button, the scope's own last
   control. Searching, the bar is the field, at 16px: a phone zooms into anything smaller. */
.pp-bar { display: flex; align-items: center; gap: 6px; padding: 8px 10px 6px 16px; flex: none; }
.pp-bar .pt-scope { margin: 0; }
.pp-bar .pt-scope button { height: 32px; min-width: 56px; padding: 0 8px; }
.pp-bar-pick { flex: 0 1 auto; min-width: 0; height: 40px; display: inline-flex; align-items: center; gap: 6px; padding: 0 10px 0 12px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--bg-raised); color: var(--ink); font: inherit; font-size: var(--text-sm); font-weight: var(--weight-medium); cursor: pointer; }
.pp-bar-pick .icon { flex: none; color: var(--ink-dim); }
/* The words give way, not the chevron: an ellipsis on the button itself does nothing, it is a flex box. */
.pp-bar-pick-words { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-bar-gap { flex: 1 1 0; min-width: 0; }
.pp-bar-icon { flex: none; width: 44px; height: 44px; display: grid; place-items: center; padding: 0; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--ink-muted); cursor: pointer; }
.pp-bar-icon:hover { background: var(--bg-hover); color: var(--ink); }
.pp-bar .more-wrap { flex: none; }
.pp-bar-field { flex: 1; min-width: 0; height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 2px 0 12px; border: 1px solid var(--line-strong); border-radius: var(--radius-md); background: var(--bg-raised); color: var(--ink-dim); }
.pp-bar-field:focus-within { border-color: var(--ink-faint); }
.pp-bar-field .icon { flex: none; }
.pp-bar-field input { flex: 1; min-width: 0; height: 40px; padding: 0; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: 16px; outline: none; }
.pp-bar-field input::placeholder { color: var(--ink-faint); }
.pp-bar-field input::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }
.pp-bar-clear { flex: none; width: 40px; height: 40px; display: grid; place-items: center; padding: 0; border: 0; border-radius: var(--radius-full); background: transparent; color: var(--ink-dim); cursor: pointer; }
html.legacy-on .pp-bar-field input, html.legacy-on .pp-bar-clear { min-height: 0; }
.pp-bar-cancel { flex: none; height: 44px; padding: 0 6px; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: var(--text-md); font-weight: var(--weight-medium); cursor: pointer; }
```

In `leads.css`: delete `.ld-bar { display: none; }`; in the first `@media (max-width: 900px)` block delete the `.ld-bar`, `.ld-bar .pt-scope`, `.ld-bar .pt-scope button`, `.ld-bar-lists` and `.ld-bar-search` rules (keep `.leads-scope .cl-controls { display: none; }` and `.ld-bar-find`), and rewrite the comment above them to say the bar is `PeoplePhoneBar` (clients.css `.pp-bar`) with Find as its last control; delete the whole `@media (max-width: 720px) { .ld-bar … .ld-bar-lists … }` block and its comment; in the star-track comment (`/* One star's track, named through its row: …`) say `.ld-bar` alone WAS also the phone's bar until the phone pass.

- [ ] **Step 5: Run it and see it pass.** The Step 2 command. Expected: PASS (all of `leads-honest`).

- [ ] **Step 6: Commit** `git commit -am "One bar for both scopes of People on a phone: search behind a button that opens the field"`

### Task 4: People draws the bar; the line holds counts; no controls row or list head on a phone

**Files:** Modify `clients-a.jsx` (`PeopleStanding`, the People render, `keys.current`, the listener, the `segments:new` handler), `clients.css`, `mobile.css`. Tests: `people-honest.test.mjs`, `saved-lists.test.mjs`.

- [ ] **Step 1: Write the failing tests** (add near the other phone tests in `people-honest.test.mjs`):

```js
/** A phone's width for the page's life: set before the first draw, as a phone opens the page. */
const onPhone = async (fn) => {
  globalThis.window.matchMedia = (q) => ({ matches: q === "(max-width: 900px)" });
  try { return await fn(); } finally { delete globalThis.window.matchMedia; }
};
const idsShown = (tree) => all(tree, (n) => n.type === "tr" && n.props?.id).map((n) => n.props.id);

test("REGRESSION: on a phone People is one bar, one line and the people -- a 57px search box, three text buttons and an 'Everyone' title stood between them", () => onPhone(async () => {
  await freshPage({ people: [person(1), person(2)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
  let tree = draw();
  const bar = byTestId(tree, "people-phone-bar");
  assert.ok(bar, "the bar");
  assert.deepEqual(all(bar, (n) => n.props?.role === "tab").map((n) => [textOf(n), n.props["aria-selected"]]), [["People", true], ["Leads", false]]);
  assert.equal(textOf(byTestId(bar, "people-phone-lists")).trim(), "Everyone", "the list being shown");
  assert.equal(byTestId(bar, "people-phone-search-open").props["aria-label"], "Search by name or phone");
  assert.ok(find(bar, (n) => n.type === globalThis.MoreMenu), "and the page's more-menu");
  assert.equal(find(tree, (n) => n.props?.className === "cl-controls"), null, "REGRESSION: the controls row");
  assert.equal(find(tree, (n) => n.props?.className === "cl-section-head"), null, "REGRESSION: the list head, under a bar that names the list");
  const standing = byTestId(tree, "people-standing");
  assert.match(textOf(standing), /2 people/, "the one line stays");
  assert.equal(byTestId(standing, "people-lists-pick"), null, "the line holds counts; the list is the bar's");
  // A pick in the sheet names the list in the bar.
  click(byTestId(tree, "people-phone-lists"));
  tree = draw();
  click(find(byTestId(tree, "people-lists-sheet"), (n) => n.type === "button" && textOf(n).includes("Regulars")));
  tree = draw();
  assert.equal(textOf(byTestId(tree, "people-phone-lists")).trim(), "Regulars");
  assert.deepEqual(idsShown(tree), ["person-p1"]);
}));

test("a desktop draws no phone bar, and keeps its controls row and its list head", async () => {
  await freshPage({ people: [person(1)] });
  const tree = draw();
  assert.equal(byTestId(tree, "people-phone-bar"), null);
  assert.ok(find(tree, (n) => n.props?.className === "cl-controls"));
  assert.ok(find(tree, (n) => n.props?.className === "cl-section-head"));
});

test("on a phone search is a button that opens the bar into the field; Cancel gives the bar back and clears the words", () => onPhone(async () => {
  await freshPage({ people: [person(1, { display_name: "Rosa Diaz" }), person(2, { display_name: "Ana Lee" })] });
  let tree = draw();
  assert.equal(byTestId(tree, "people-phone-search"), null, "no box until asked");
  click(byTestId(tree, "people-phone-search-open"));
  tree = draw();
  const field = byTestId(tree, "people-phone-search");
  assert.equal(field.props.type, "search");
  assert.equal(field.props.autoFocus, true);
  assert.equal(byTestId(tree, "people-phone-lists"), null, "the bar is the field while searching");
  field.props.onChange({ target: { value: "rosa" } });
  tree = draw();
  assert.deepEqual(idsShown(tree), ["person-p1"]);
  click(byTestId(tree, "people-phone-search-cancel"));
  tree = draw();
  assert.ok(byTestId(tree, "people-phone-lists"), "Cancel gives the bar back");
  assert.equal(idsShown(tree).length, 2, "and clears the words");
  // The page's / opens it too.
  press("/");
  assert.ok(byTestId(draw(), "people-phone-search"), "/ opens the field");
}));
```

Replace the test "on a phone the rail's lists are behind one tap on the standing line, as a sheet; …" with:

```js
test("on a phone the lists are behind the bar's list button, as a sheet; a pick closes it, and New list opens the box in it", () => onPhone(async () => {
  await freshPage({ people: [person(1)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
  let tree = draw();
  assert.equal(byTestId(tree, "people-lists-sheet"), null, "closed until asked");
  click(byTestId(tree, "people-phone-lists"));
  tree = draw();
  const sheet = byTestId(tree, "people-lists-sheet");
  assert.ok(sheet, "the sheet");
  assert.ok(find(sheet, (n) => n.type === "aside" && n.props?.className === "cl-rail"), "the rail's own rows, in the sheet");
  click(find(sheet, (n) => n.type === "button" && textOf(n).includes("Regulars")));
  tree = draw();
  assert.equal(byTestId(tree, "people-lists-sheet"), null, "a pick closes it");
  assert.equal(textOf(byTestId(tree, "people-phone-lists")).trim(), "Regulars", "and the bar names the list");
  // The shell's and a profile's New list: on a phone the sheet comes up with the box open.
  globalThis.window.dispatchEvent(new CustomEvent("segments:new"));
  tree = draw();
  tree = draw();
  assert.ok(byTestId(byTestId(tree, "people-lists-sheet"), "new-list-name"), "with the New list box open");
}));
```

In "Esc closes the phone's lists sheet first, and the selection stays; …" wrap the body in `onPhone(async () => { … })` and open the sheet with `click(byTestId(draw(), "people-phone-lists"));`.

In `saved-lists.test.mjs`, drop `"people-lists-pick"` from the scanned list (the bar's list button is a behaviour test in `people-honest` now).

- [ ] **Step 2: Run and see them fail.** `node --test --conditions=react-server tooling/scripts/tests/people-honest.test.mjs` → the new tests FAIL (`people-phone-bar` not found).

- [ ] **Step 3: `PeopleStanding` holds counts only.** Delete its `onLists = null, listWord = null` params and the whole `{onLists && (…people-lists-pick…)}` part. In the comment above it, replace the two sentences starting "On a phone, where the rail is not drawn, the line also holds the way to the lists" with: `On a phone the list being shown is the bar's (PeoplePhoneBar); the line keeps the counts.` In `clients.css` delete `/* The phone's way to the lists, on the standing line; … */` and `.pl-standing-lists { display: none; }`; in `mobile.css` delete the comment and `.pl-standing-lists { display: inline-flex; }`.

- [ ] **Step 4: The People render.** Replace from `<div className="cl-main-scroll pl-main" ref={scrollRef}>` down to the end of the `.cl-section` block with:

```jsx
        <div className="cl-main-scroll pl-main" ref={scrollRef}>
          {/* A phone's one bar: the switch, the list, search and the more-menu (PeoplePhoneBar). */}
          {phone && (
            <PeoplePhoneBar
              scope="people"
              onScope={(to) => nav(to === "leads" ? "clients/leads" : "clients")}
              listLabel={activeSaved ? activeSaved.name : activeList ? activeList.label : "Everyone"}
              onLists={() => setListsOpen(true)}
              listsOpen={listsOpen}
              q={q}
              onQ={setQ}
              searchRef={searchRef}
              searchOpen={searchOpen}
              onSearchOpen={setSearchOpen}
              searchLabel="Search by name or phone"
              testid="people"
              trailing={<MoreMenu items={phoneMenu} title="More" size={18} btnClass="pp-bar-icon" escape />}
            />
          )}
          <PeopleStanding
            scope="people"
            agg={agg}
            needsShown={tab === "needs_you"}
            onNeeds={() => setTab((t) => (t === "needs_you" ? "all" : "needs_you"))}
          />

          {!phone && (
            <div className="cl-controls">
              … the controls row, unchanged …
            </div>
          )}

          {/* A phone draws no list head: the bar names the list, the Lists sheet has Everyone and the more-menu the
              list's own acts. A list's own step stays, one card. */}
          {(!phone || listStep) && (
            <div className="cl-section">
              {!phone && (
                <div className="cl-section-head">
                  … the section head, unchanged …
                </div>
              )}
              {listStep && ( … the list-action block, unchanged … )}
            </div>
          )}
```

and `phoneMenu` for now (Task 5 fills it): `const phoneMenu = [];` just before `return (` of the People render.

- [ ] **Step 5: Keys and the listener.** In `keys.current` set `focusSearch: () => { if (phone) setSearchOpen(true); if (searchRef.current) searchRef.current.focus(); },`. In the `segments:new` handler replace `window.matchMedia && window.matchMedia("(max-width: 720px)").matches` with `plPhoneNow()` (the rail is hidden at 900px and under, so the box must open in the sheet there too).

- [ ] **Step 6: The line and the step on a phone** (append inside a `@media (max-width: 900px)` block in `clients.css`, and change the existing `@media (max-width: 900px) { .pl-standing { padding: 12px 16px 0; } }` to `padding: 4px 16px 10px`):

```css
@media (max-width: 900px) {
  /* A list's own step, alone in its section on a phone: one card, on the gutter. */
  .clients:not(.leads-scope) .cl-section { padding: 0 16px 10px; }
  .clients:not(.leads-scope) .cl-list-action { margin: 0; }
}
/* The line's one tap keeps a thumb's 44px without making the line 44px tall. */
@media (max-width: 900px) and (pointer: coarse) {
  html.legacy-on .pl-standing-needs { margin-top: -10px; margin-bottom: -10px; }
}
```

- [ ] **Step 7: Run and see them pass.** `node --test --conditions=react-server tooling/scripts/tests/people-honest.test.mjs tooling/scripts/tests/saved-lists.test.mjs tooling/scripts/tests/leads-honest.test.mjs` → PASS.

- [ ] **Step 8: Commit** `git commit -am "On a phone People is one bar and one line above the people"`

### Task 5: The more-menu and People's two sheets

**Files:** Modify `clients-a.jsx` (constants, `PhoneSheet`, `PeopleAddSheet`, `PeopleListActSheet`, page state, handlers, `phoneMenu`, keys, listener, render), `clients.css`. Test: `people-honest.test.mjs`.

- [ ] **Step 1: Write the failing test**

```js
test("the phone's more-menu adds a person in a sheet, sorts as a desktop's headings do, and holds the open list's own acts", () => onPhone(async () => {
  await freshPage({ people: [person(1, { display_name: "Zed" }), person(2, { display_name: "Abe" })], lists: [{ id: "s1", name: "Regulars", ids: ["p1", "p2"] }] });
  const calls = [];
  globalThis.window.__lists = lists({
    rename: async (id, name) => { calls.push(["rename", id, name]); return { ok: true, data: {} }; },
    remove: async (id) => { calls.push(["remove", id]); return { ok: true, data: {} }; },
  });
  globalThis.window.__addPerson = async (body) => { calls.push(["add", body]); return { ok: true, data: { contact_id: "p9", existed: false } }; };
  const menuOf = (tree) => find(byTestId(tree, "people-phone-bar"), (n) => n.type === globalThis.MoreMenu).props.items;
  let tree = draw();
  assert.deepEqual(menuOf(tree).filter((i) => typeof i.checked === "boolean").map((i) => [i.label, i.checked]), [
    ["Needs you first", false], ["Latest contact first", true], ["Name, A to Z", false], ["Name, Z to A", false],
  ], "the sorts, the one in use ticked; Soonest visit only with a calendar");
  menuOf(tree).find((i) => i.label === "Name, A to Z").onClick();
  tree = draw();
  assert.deepEqual(idsShown(tree), ["person-p2", "person-p1"], "A to Z");
  // Add a person: a sheet, not the desktop's row -- which was 479px wide on a 365px screen.
  menuOf(tree).find((i) => i.label === "Add a person").onClick();
  tree = draw();
  const sheet = byTestId(tree, "add-person-sheet");
  assert.equal(sheet.props.role, "dialog");
  assert.equal(byTestId(sheet, "add-person-phone").props.type, "tel", "a phone's number pad");
  byTestId(sheet, "add-person-phone").props.onChange({ target: { value: "+1 786 555 0100" } });
  tree = draw();
  await byTestId(tree, "add-person-save").props.onClick();
  tree = draw();
  assert.deepEqual(calls.at(-1), ["add", { phone: "+1 786 555 0100" }]);
  assert.equal(byTestId(tree, "add-person-sheet"), null, "added: the sheet closes");
  assert.equal(opened.at(-1), "p9", "and their page opens, as the desktop's form does");
  // A list open: its rename and its delete are the menu's.
  tree = draw({ initialSaved: "s1" });
  tree = draw({ initialSaved: "s1" });
  menuOf(tree).find((i) => i.label === "Rename this list").onClick();
  tree = draw({ initialSaved: "s1" });
  const name = byTestId(byTestId(tree, "list-act-sheet"), "list-rename-name");
  assert.equal(name.props.value, "Regulars", "the name to change, in the box");
  name.props.onChange({ target: { value: "VIP" } });
  tree = draw({ initialSaved: "s1" });
  await byTestId(tree, "list-rename-save").props.onClick();
  tree = draw({ initialSaved: "s1" });
  assert.deepEqual(calls.at(-1), ["rename", "s1", "VIP"]);
  assert.equal(byTestId(tree, "list-act-sheet"), null);
  assert.ok(flashes.some((f) => textOf(f.msg).includes("VIP")), "said");
  menuOf(tree).find((i) => i.label === "Delete this list…").onClick();
  tree = draw({ initialSaved: "s1" });
  const confirm = find(byTestId(tree, "list-act-sheet"), (n) => n.type === globalThis.Confirm);
  assert.equal(confirm.props.detail, "The people stay.", "asked through the one Confirm");
  await confirm.props.onYes();
  tree = draw({ initialSaved: "s1" });
  assert.deepEqual(calls.at(-1), ["remove", "s1"]);
  assert.equal(textOf(byTestId(tree, "people-phone-lists")).trim(), "Everyone", "the list gone, everyone shown");
}));

test("Esc closes the phone's own sheet, and the page holds its keys while one is open", () => onPhone(async () => {
  await freshPage({ people: [person(1), person(2)] });
  globalThis.window.__addPerson = async () => ({ ok: true, data: { contact_id: "p9" } });
  let tree = draw();
  find(byTestId(tree, "people-phone-bar"), (n) => n.type === globalThis.MoreMenu).props.items.find((i) => i.label === "Add a person").onClick();
  tree = draw();
  assert.equal(press("j"), false, "J walks nothing behind the sheet");
  assert.equal(press("Escape"), true);
  assert.equal(byTestId(draw(), "add-person-sheet"), null, "Esc closed it");
}));
```

- [ ] **Step 2: Run and see it fail** (`people-phone-bar`'s menu has no items).

- [ ] **Step 3: Constants and sheets.** Near `PL_RECEPT_MARK` add:

```js
// The sorts a phone offers from its more-menu, in the words it says them in. A desktop sorts by its headings, which a
// phone does not draw: its one button only turned the order round ("Z → A"), whatever the sort was.
const PL_PHONE_SORTS = [
  { by: "state", dir: "desc", label: "Needs you first" },
  { by: "last", dir: "desc", label: "Latest contact first" },
  { by: "name", dir: "asc", label: "Name, A to Z" },
  { by: "name", dir: "desc", label: "Name, Z to A" },
  { by: "visits", dir: "asc", label: "Soonest visit first", needs: (x) => x.withCalendar },
];
// An empty Add a person and an empty list draft: the phone's sheets' drafts are the page's state.
const PL_ADD_EMPTY = { name: "", phone: "", busy: false, error: null };
const PL_LIST_EMPTY = { name: "", busy: false, error: null };
```

After `AddPersonButton`:

```jsx
// A sheet from the bottom of a phone for People's own small jobs -- Add a person, and the open list's rename, delete
// and "Save these": a handle, a title, one way out, and the job. The page's own dialog: `pl-sheet` keeps it out of
// PL_OVERLAY, and the page's one keyboard listener closes it on Esc. Hookless: the page holds what is in it.
const PhoneSheet = ({ title, onClose, closeLabel = "Cancel", testid, children }) => (
  <>
    <div className="sb-sheet-backdrop" onClick={onClose} />
    <div className="sb-sheet pl-sheet pp-sheet" role="dialog" aria-modal="true" aria-label={title} data-testid={testid}>
      <div className="pp-sheet-handle" aria-hidden="true" />
      <div className="pp-sheet-head">
        <h2 className="pp-sheet-title">{title}</h2>
        {closeLabel && <button type="button" className="pp-sheet-close" onClick={onClose} data-testid={`${testid}-close`}>{closeLabel}</button>}
      </div>
      <div className="pp-sheet-body">{children}</div>
    </div>
  </>
);

// Add a person on a phone: the two fields stacked, 16px, a number pad for the number, one wide button. The desktop's
// form stands inline in its controls row; on a phone it was that row, 479px wide on a 365px screen, with Add and
// Cancel past the edge and the page scrolling sideways.
const PeopleAddSheet = ({ draft, onDraft, onAdd, onClose }) => (
  <PhoneSheet title="Add a person" onClose={onClose} testid="add-person-sheet">
    <label className="pp-field">
      <span className="pp-field-label">Name <span className="pp-field-opt">(optional)</span></span>
      <input className="pp-input" autoFocus value={draft.name} maxLength={80} autoComplete="name" disabled={draft.busy} onChange={(e) => onDraft({ name: e.target.value })} data-testid="add-person-name" />
    </label>
    <label className="pp-field">
      <span className="pp-field-label">Mobile number</span>
      <input className="pp-input" type="tel" inputMode="tel" autoComplete="tel" value={draft.phone} maxLength={24} disabled={draft.busy} aria-invalid={draft.error ? true : undefined} aria-describedby={draft.error ? "add-person-error" : undefined} onChange={(e) => onDraft({ phone: e.target.value, error: null })} onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }} data-testid="add-person-phone" />
    </label>
    <window.FieldError id="add-person-error" message={draft.error} testid="add-person-error" />
    <p className="pp-sheet-hint">A number that is already here opens that person instead of adding them twice.</p>
    <button type="button" className="btn btn-primary pp-sheet-go" disabled={draft.busy || !draft.phone.trim()} onClick={onAdd} data-testid="add-person-save">{draft.busy ? "Adding…" : "Add"}</button>
  </PhoneSheet>
);

// The open list's own acts on a phone, from the more-menu: rename it, delete it, or keep what is shown as a list. A
// desktop does these on the list's title line, which a phone does not draw. The doors are the desktop's.
const PeopleListActSheet = ({ act, list, count, draft, onDraft, onGo, onClose }) => {
  if (act === "delete") {
    return (
      <PhoneSheet title="Delete the list" onClose={onClose} closeLabel={null} testid="list-act-sheet">
        <Confirm block question={`Delete “${list.name}”?`} detail="The people stay." yes="Yes, delete" danger busy={draft.busy} error={draft.error} onYes={onGo} onNo={onClose} testid="delete-list" />
      </PhoneSheet>
    );
  }
  const renaming = act === "rename";
  return (
    <PhoneSheet title={renaming ? "Rename the list" : `Save these ${count} as a list`} onClose={onClose} testid="list-act-sheet">
      <label className="pp-field">
        <span className="pp-field-label">{renaming ? "Its name" : "Name the list"}</span>
        <input className="pp-input" autoFocus value={draft.name} maxLength={60} disabled={draft.busy} aria-invalid={draft.error ? true : undefined} aria-describedby={draft.error ? "list-act-error" : undefined} onChange={(e) => onDraft({ name: e.target.value, error: null })} onKeyDown={(e) => { if (e.key === "Enter") onGo(); }} data-testid={renaming ? "list-rename-name" : "save-shown-name"} />
      </label>
      <window.FieldError id="list-act-error" message={draft.error} testid="list-act-error" />
      <button type="button" className="btn btn-primary pp-sheet-go" disabled={draft.busy || !draft.name.trim()} onClick={onGo} data-testid={renaming ? "list-rename-save" : "save-shown-save"}>{draft.busy ? "Saving…" : renaming ? "Save" : "Keep it"}</button>
    </PhoneSheet>
  );
};
```

- [ ] **Step 4: Page state.** After `searchOpen`:

```js
  // People's own sheets on a phone -- Add a person, and the open list's rename, delete and "Save these" -- with their
  // drafts. The page holds them, so the sheets are hookless and the stub React's one hook order holds.
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState(PL_ADD_EMPTY);
  const [listAct, setListAct] = useState(null);
  const [listDraft, setListDraft] = useState(PL_LIST_EMPTY);
```

- [ ] **Step 5: Handlers,** after `const shownIds = rowsShown.map((r) => r.id);`:

```js
  // The phone's Add a person: the desktop's door (plAddPerson), the page's draft. Added, the sheet closes and their
  // page opens, as the desktop's form does.
  const addOnPhone = async () => {
    const d = addDraft;
    if (d.busy || !d.phone.trim() || !window.__addPerson) return;
    setAddDraft({ ...d, busy: true, error: null });
    const r = await plAddPerson(d);
    if (!r.ok) { setAddDraft((x) => ({ ...x, busy: false, error: r.error })); return; }
    plFlash({ msg: plAddedWords(d, r.existed) });
    setAddOpen(false);
    setAddDraft(PL_ADD_EMPTY);
    onOpenProfile(r.id);
  };
  const closePhoneSheet = () => { setAddOpen(false); setAddDraft(PL_ADD_EMPTY); setListAct(null); setListDraft(PL_LIST_EMPTY); };
  // The open list's acts on a phone (the more-menu's): the desktop's doors, the page's draft, the desktop's words.
  const listActGo = async () => {
    const d = listDraft;
    if (d.busy || !window.__lists) return;
    const n = d.name.trim();
    if (listAct !== "delete" && !n) return;
    if (listAct !== "save" && !activeSaved) return;
    if (listAct === "rename" && n === activeSaved.name) { closePhoneSheet(); return; }
    setListDraft({ ...d, busy: true, error: null });
    if (listAct === "delete") {
      const r = await plDeleteList(activeSaved);
      if (!r.ok) { setListDraft((x) => ({ ...x, busy: false, error: r.error })); return; }
      closePhoneSheet();
      setSavedId(null);
      return;
    }
    if (listAct === "rename") {
      const r = await plRenameList(activeSaved, n);
      if (!r.ok) { setListDraft((x) => ({ ...x, busy: false, error: r.error })); return; }
      closePhoneSheet();
      plFlash({ msg: <>Renamed to <b>{n}</b></> });
      return;
    }
    const ids = shownIds;
    const { made, filled, id } = await plMakeListWith(n, ids);
    if (!made.ok) { setListDraft((x) => ({ ...x, busy: false, error: made.message || "Could not make the list." })); return; }
    closePhoneSheet();
    plFlash(filled.ok ? { msg: <>{ids.length} kept as <b>{n}</b></>, undo: () => plUndoList(id, n, plFlash) } : window.refusalToast(filled, "Not kept as a list"));
  };
```

- [ ] **Step 6: Keys.** In `keys.current`: `sheetOpen: listsOpen || addOpen || !!listAct,` and `closeSheet: addOpen || listAct ? closePhoneSheet : null,`. In the listener replace `if (k.sheetOpen) return;` with:

```js
      // The phone's sheets hold every key; the Lists sheet closes on its own Esc listener, People's own two on this one.
      if (k.sheetOpen) { if (e.key === "Escape" && k.closeSheet) { e.preventDefault(); k.closeSheet(); } return; }
```

- [ ] **Step 7: The menu,** replacing `const phoneMenu = [];`:

```js
  // People's more-menu on a phone, the bar's last control: the acts a desktop spreads over its controls row and a
  // list's title line. Add a person; the sorts a desktop's headings give (a phone draws none); everyone as a file; and
  // with a list open, that list's own acts.
  const phoneMenu = [
    ...(canEditLists && window.__addPerson ? [{ label: "Add a person", icon: "plus", onClick: () => { setAddDraft(PL_ADD_EMPTY); setAddOpen(true); } }] : []),
    { header: "Sort" },
    ...PL_PHONE_SORTS.filter((s) => !s.needs || s.needs({ withCalendar })).map((s) => ({ label: s.label, checked: sortBy === s.by && sortDir === s.dir, onClick: () => { viewTouched.current = true; setSortBy(s.by); setSortDir(s.dir); } })),
    // The route's file of everyone: a download (it answers as an attachment), so the page stays where it is.
    ...(window.__href ? [{ divider: true }, { label: "Export everyone", icon: "external", meta: "CSV", onClick: () => window.location.assign(window.__href("GET contacts/export")), ...(canExport ? {} : { gate: window.gate("export") }) }] : []),
    ...(activeSaved && canEditLists && window.__lists ? [
      { divider: true },
      { label: "Rename this list", icon: "edit", onClick: () => { setListDraft({ ...PL_LIST_EMPTY, name: activeSaved.name }); setListAct("rename"); } },
      { label: "Delete this list…", icon: "x", danger: true, onClick: () => { setListDraft(PL_LIST_EMPTY); setListAct("delete"); } },
    ] : []),
    ...(!activeSaved && filtered && shown.length > 0 && canEditLists && window.__lists ? [
      { divider: true },
      { label: `Save these ${shown.length} as a list`, icon: "filter", onClick: () => { setListDraft({ ...PL_LIST_EMPTY, name: activeList ? activeList.label : tab !== "all" ? PL_TAB_LABEL[tab] : "" }); setListAct("save"); } },
    ] : []),
  ];
```

- [ ] **Step 8: Draw the sheets last,** after the `PeopleListsSheet` block:

```jsx
        {/* People's own two sheets on a phone, last in the tree like the Lists sheet. */}
        {phone && addOpen && (
          <PeopleAddSheet draft={addDraft} onDraft={(patch) => setAddDraft((d) => ({ ...d, ...patch }))} onAdd={addOnPhone} onClose={closePhoneSheet} />
        )}
        {phone && listAct && (listAct === "save" || activeSaved) && (
          <PeopleListActSheet act={listAct} list={activeSaved} count={shown.length} draft={listDraft} onDraft={(patch) => setListDraft((d) => ({ ...d, ...patch }))} onGo={listActGo} onClose={closePhoneSheet} />
        )}
```

- [ ] **Step 9: The sheets' CSS** (append to `clients.css`):

```css
/* People's own sheets on a phone (PhoneSheet): Add a person, and the open list's rename, delete and "Save these". From
   the bottom, edge to edge, a handle, a title and one way out; fields at 16px, one wide button. .sb-sheet.pp-sheet so
   mobile.css's .pl-sheet padding, which loads after this file, gives way. */
.sb-sheet.pp-sheet { padding: 0 0 calc(16px + env(safe-area-inset-bottom, 0px)); border-radius: var(--radius-xl) var(--radius-xl) 0 0; }
.pp-sheet-handle { width: 36px; height: 4px; margin: 8px auto 4px; border-radius: var(--radius-full); background: var(--line-strong); }
.pp-sheet-head { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 8px 4px 16px; }
.pp-sheet-title { flex: 1; min-width: 0; margin: 0; font-size: var(--text-lg); font-weight: var(--weight-semibold); line-height: var(--leading-snug); color: var(--ink); }
.pp-sheet-close { flex: none; height: 44px; padding: 0 8px; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: var(--text-md); font-weight: var(--weight-medium); cursor: pointer; }
.pp-sheet-body { display: flex; flex-direction: column; gap: 14px; padding: 4px 16px 8px; }
.pp-field { display: flex; flex-direction: column; gap: 6px; }
.pp-field-label { font-size: var(--text-sm); color: var(--ink-muted); }
.pp-field-opt { color: var(--ink-dim); }
.pp-input { width: 100%; height: 48px; padding: 0 14px; border: 1px solid var(--line-strong); border-radius: var(--radius-md); background: var(--bg); color: var(--ink); font: inherit; font-size: 16px; }
.pp-input:focus { outline: none; border-color: var(--ink-muted); box-shadow: 0 0 0 3px var(--bg-active); }
.pp-input[aria-invalid="true"] { border-color: var(--danger); }
.pp-sheet-hint { margin: -6px 0 0; font-size: var(--text-sm); line-height: var(--leading-normal); color: var(--ink-dim); }
.pp-sheet-go { width: 100%; height: 48px; justify-content: center; font-size: var(--text-md); }
.pp-sheet .confirm-block { max-width: none; margin: 0; padding: 14px; background: var(--bg); }
.pp-sheet .confirm-block .confirm-q { font-size: var(--text-md); color: var(--ink); }
.pp-sheet .confirm-block .confirm-acts { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 8px; }
.pp-sheet .confirm-block .confirm-acts .btn { height: 48px; justify-content: center; font-size: var(--text-md); }
```

- [ ] **Step 10: Run and see it pass.** `node --test --conditions=react-server tooling/scripts/tests/people-honest.test.mjs` → PASS.

- [ ] **Step 11: Commit** `git commit -am "The phone's more-menu: Add a person and a list's acts in sheets, the sorts a desktop's headings give"`

### Task 6: The Lists sheet starts with Everyone and draws one switch

**Files:** Modify `clients-a.jsx` (`PeopleRail`, its sheet instance). Test: `people-honest.test.mjs`.

- [ ] **Step 1: Write the failing test**

```js
test("REGRESSION: on a phone the Lists sheet starts with Everyone and draws no second People | Leads -- the switch was in the sheet and, since the bar, would be twice", () => onPhone(async () => {
  await freshPage({ people: [person(1), person(2)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
  let tree = draw({ initialSaved: "s1" });
  tree = draw({ initialSaved: "s1" });
  click(byTestId(tree, "people-phone-lists"));
  tree = draw({ initialSaved: "s1" });
  const sheet = byTestId(tree, "people-lists-sheet");
  assert.equal(byTestId(sheet, "people-scope"), null, "one switch, the bar's");
  const everyone = byTestId(sheet, "rail-everyone");
  assert.match(textOf(everyone), /Everyone\s*2/, "Everyone, first, with everyone's count");
  assert.equal(everyone.props["aria-current"], undefined, "not current while a list is open");
  click(everyone);
  tree = draw({ initialSaved: "s1" });
  assert.equal(byTestId(tree, "people-lists-sheet"), null, "a pick closes the sheet");
  assert.equal(textOf(byTestId(tree, "people-phone-lists")).trim(), "Everyone");
  assert.equal(idsShown(tree).length, 2);
}));
```

- [ ] **Step 2: Run and see it fail** (`rail-everyone` not found).

- [ ] **Step 3: Implement.** `PeopleRail` gains `scopeTabs = true, everyone = null` and draws:

```jsx
  <aside className="cl-rail">
    {scopeTabs && <PeopleScopeTabs scope={scope} onScope={onScope} />}
    {scope === "leads" ? children : (
    <>
    {/* The way back to everyone, first, where a phone looks for it: the desktop's is Show everyone, on the list's
        title line, which a phone does not draw. */}
    {everyone && (
      <div className="cl-rail-section cl-rail-everyone">
        <RailRow label="Everyone" count={everyone.count} active={everyone.active} onPick={everyone.onPick} testid="rail-everyone" />
      </div>
    )}
    <RailSection label="Smart lists" icon="sparkle">
```

and the sheet's instance passes `scopeTabs={false}` and `everyone={{ count: agg.total, active: !listId && !savedId, onPick: () => { setListId(null); setSavedId(null); setListsOpen(false); } }}`.

- [ ] **Step 4: Run and see it pass;** then **commit** `git commit -am "The phone's Lists sheet starts with Everyone and draws one switch"`

### Task 7: A person's row on a phone

**Files:** Modify `clients-a.jsx` (`plCardCell`, `PL_PHONE_COLUMNS`, `plCardRowClass`; the `columns` memo; the table's `rowClass`), `clients.css`. Test: `people-honest.test.mjs`.

- [ ] **Step 1: Write the failing test, and change the phone half of "REGRESSION: a member's columns are a desktop's, and a phone keeps its cards…"** to the one-cell rule:

```js
test("REGRESSION: a phone row is one cell -- the face, the name and the state; why they need a person, or their own words; the visit and the last contact -- and never the answer to offers", () => onPhone(async () => {
  const needs = person(1, { display_name: "Zoe M.", needs_human: true, open_escalation_reason: "human_token", open_escalation_since: iso(H), latest_state: "needs_human" });
  await freshPage({ people: [needs, person(2)], views: { people: { sortBy: "last", sortDir: "desc", columns: { state: false, offers: false } } } });
  const tree = draw();
  const row = rowOf(tree, "p1");
  assert.match(row.props.className, /\bpl-card-row\b/);
  const tds = row.props.children.filter((k) => k && k.type === "td");
  assert.deepEqual(tds.map((td) => String(td.props.className)), ["cl-sel", "pl-card-cell"], "REGRESSION: the desktop's eleven cells re-gridded into a box");
  const card = tds[1];
  const pill = find(card, (n) => /\bpill\b/.test(String(n.props?.className || "")));
  assert.equal(pill.props["data-state"], "needs_you", "the state, whatever the member hid on a desktop");
  assert.ok(byTestId(card, "row-state-detail"), "why they need a person");
  assert.equal(byTestId(card, "row-offers"), null, "the answer to offers is on their page");
  assert.ok(find(card, (n) => /\bpl-card-face\b/.test(String(n.props?.className || ""))), "their face");
  assert.match(textOf(byTestId(rowOf(tree, "p2"), "row-words") || {}), /Saturday/, "a person who needs nobody says their own words");
}));
```

In the old test, keep only its desktop half (from `// And a desktop builds none of them` down) and rename it "a desktop builds no cell of a column the member turned off".

- [ ] **Step 2: Run and see it fail** (two cells expected, eleven found).

- [ ] **Step 3: Implement** after `PL_COLUMNS`:

```jsx
// A person on a phone, in one cell (900px and under): the Inbox's row. Their face, their name and their state on the
// first line; on the second, why they need a person when they do, else their own last words; on the third, when they
// are coming and when you last spoke. The desktop's columns say the same things; a phone says them once, in this order,
// and leaves the answer to offers, the receptionist's word, where they came from and their lists to their page, one tap
// away. It was the desktop's cells re-gridded into a box: 119 to 168px a person, the face squeezed to an oval, the state
// 36px tall against the box's edge, the visit broken over two lines, three left edges in one card. The member's
// desktop columns do not reach it: whatever they hid, the row says the state.
const plCardCell = (p, { attention }) => {
  const byNumber = plIsNumber(p.name);
  const glyph = byNumber ? "phone" : plIsAddress(p) ? "mail" : null;
  const said = attention && attention[p.id];
  const words = said && (said.quoted || p.callSummary) ? (said.quoted ? `“${said.sentence}”` : said.sentence) : null;
  const asks = p.state === "needs_you" || p.state === "waiting_on_you";
  const lead = asks && p.stateDetail ? p.stateDetail : words;
  const time = p.nextVisitDay ? (p.nextVisit || "").split(" · ")[1] || "" : "";
  return (
    <td key="card" className="pl-card-cell">
      <div className="pl-card">
        <div className={`ix-thread-avatar pl-card-face${glyph ? " cl-row-avatar-glyph" : ""}`} aria-hidden="true">
          {glyph ? <Icon name={glyph} size={12} className="pl-card-glyph" /> : <span className="pl-card-initials">{p.initials}</span>}
          <Icon name="check" size={14} className="pl-card-tick" />
        </div>
        <div className={`pl-card-name${byNumber ? " tabular" : ""}`}>{p.name}</div>
        <PeopleStatePill state={p.state} label={p.stateLabel} />
        {lead ? <div className="pl-card-lead" data-testid={asks && p.stateDetail ? "row-state-detail" : "row-words"}>{lead}</div> : null}
        <div className="pl-card-facts">
          {p.nextVisitDay ? <span className="pl-card-visit" data-testid="row-next-visit"><Icon name="calendar" size={11} />{time ? `${p.nextVisitDay} · ${time}` : p.nextVisitDay}</span> : null}
          <span className="pl-card-last">{p.lastContact.label}</span>
        </div>
      </div>
    </td>
  );
};
// A phone's one column, and the class its rows wear (clients.css draws the row from it).
const PL_PHONE_COLUMNS = [{ key: "card", label: "Person", sortable: false, pinned: true, cell: plCardCell }];
const plCardRowClass = () => "pl-card-row";
```

The `columns` memo becomes `React.useMemo(() => (!onLeads && phone ? PL_PHONE_COLUMNS : plShownColumns(plDrawnColumns(cols, colChoices, colCtx), phone)), [cols, colChoices, onLeads, hasCenter, withCalendar, phone])`, and People's `<PeopleTable>` takes `rowClass={phone ? plCardRowClass : null}`.

- [ ] **Step 4: The row's CSS** (append to `clients.css`):

```css
@media (max-width: 900px) {
  /* People's rows: one card cell each (plCardCell), edge to edge, a hairline between -- the Inbox's list. The wrap's
     box and its 16px margin are a desktop's. */
  .clients:not(.leads-scope) .pl-table-wrap { margin: 0; border: 0; border-top: 1px solid var(--line); border-radius: 0; background: transparent; }
  .clients:not(.leads-scope) .cl-table-foot { padding: 12px 16px; border-top: 0; }
  .pl-table tbody tr.pl-card-row { display: block; position: relative; padding: 0; border-bottom: 1px solid var(--line); cursor: pointer; }
  /* A tap is not a keyboard's cursor: the accent edge and the hover ground belong to the desktop's J and K. */
  .pl-table tbody tr.pl-card-row.focused { background: transparent; box-shadow: none; }
  .pl-table tbody tr.pl-card-row.selected { background: var(--pl-selected); }
  .pl-table tbody tr.pl-card-row > td.pl-card-cell { display: block; min-width: 0; padding: 0; border: 0; }
  .pl-card { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; column-gap: 12px; row-gap: 2px; align-items: center; padding: 12px 16px; }
  .pl-card-face { grid-column: 1; grid-row: 1 / span 3; align-self: start; flex: none; width: 32px; height: 32px; }
  .pl-card:not(:has(> .pl-card-lead)) .pl-card-face { grid-row: 1 / span 2; }
  .pl-card-tick { display: none; }
  .pl-card-name { grid-column: 2; grid-row: 1; min-width: 0; font-size: var(--text-base); font-weight: var(--weight-medium); line-height: 20px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pl-card > .pill { grid-column: 3; grid-row: 1; justify-self: end; }
  /* A pill is words, not a control: the touch floor (legacy.css) made it 36px tall. */
  html.legacy-on .pl-card > .pill { min-height: 0; padding-top: 0; padding-bottom: 0; }
  .pl-card-lead { grid-column: 2 / 4; min-width: 0; font-size: var(--text-sm); line-height: 18px; color: var(--ink-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pl-card-lead::first-letter { text-transform: uppercase; }
  .pl-card-facts { grid-column: 2 / 4; min-width: 0; display: flex; align-items: center; gap: 12px; font-size: 11.5px; line-height: 17px; color: var(--ink-dim); white-space: nowrap; overflow: hidden; font-variant-numeric: tabular-nums; }
  .pl-card-visit { flex: none; display: inline-flex; align-items: center; gap: 4px; color: var(--ok-ink); font-weight: var(--weight-medium); }
  .pl-card-last { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  /* A table with nobody in it is one row of one cell across the card's whole width. It was placed in the grid's first
     track -- the checkbox's, 28px -- and its sentence stood in a column a word wide. */
  .cl-table tbody tr:not([id]):has(> td[colspan]) { display: block; padding: 0; }
  .cl-table tbody tr:not([id]) > td[colspan] { display: block; padding: 20px 16px; }
}
```

- [ ] **Step 5: Run and see it pass;** **commit** `git commit -am "A person's row on a phone is one cell, in the Inbox's shape"`

### Task 8: Tap the face; the bar docks

**Files:** Modify `clients-a.jsx` (the table's `onOpen`, `PeopleBulkBar`'s `phone` and its menus' `escape`), `clients.css`. Test: `people-honest.test.mjs`.

- [ ] **Step 1: Write the failing test**

```js
test("on a phone the face is the checkbox, and while anyone is selected a tap on a row selects them rather than opening them", () => onPhone(async () => {
  await freshPage({ people: [person(1), person(2)] });
  let tree = draw();
  byTestId(rowOf(tree, "p1"), "row-select").props.onChange();
  tree = draw();
  assert.match(rowOf(tree, "p1").props.className, /\bselected\b/);
  const before = opened.length;
  rowOf(tree, "p2").props.onClick();
  tree = draw();
  assert.equal(opened.length, before, "REGRESSION-to-be: a tap while selecting opened the person and lost the selection's place");
  assert.match(rowOf(tree, "p2").props.className, /\bselected\b/, "it selects them");
  const bar = byTestId(tree, "bulk-bar");
  assert.ok(bar, "the bar");
  assert.equal(find(bar, (n) => n.type === globalThis.MoreMenu).props.escape, true, "its menus are placed against the window: the docked row scrolls, and would cut them off");
  click(byTestId(tree, "bulk-clear"));
  tree = draw();
  rowOf(tree, "p2").props.onClick();
  assert.equal(opened.at(-1), "p2", "cleared, a tap opens again");
}));
```

- [ ] **Step 2: Run and see it fail.**

- [ ] **Step 3: Implement.** Before People's `return (`: `const selecting = shown.some((p) => sel.has(p.id));`. `<PeopleTable … onOpen={phone && selecting ? toggleSel : onOpenProfile} …>`. The bulk bar's mount becomes `{selecting && <PeopleBulkBar … phone={phone} />}`; `PeopleBulkBar` takes `phone = false` and passes `escape={phone}` to its three `MoreMenu`s.

- [ ] **Step 4: CSS** (append to `clients.css`):

```css
@media (max-width: 900px) {
  /* The face is the checkbox (tap a face to select): the row's own box lies over the face, a thumb wide and unseen, so a
     tap there selects and a tap on the rest opens the person. While anyone is selected every face is a ring and a
     picked one the ink with its tick, and a tap anywhere on a row selects it (clients-a.jsx, the table's onOpen). */
  .pl-table tbody tr.pl-card-row > td.cl-sel { position: absolute; left: 10px; top: 6px; z-index: 1; display: block; width: 44px; height: 44px; padding: 0; border: 0; }
  .pl-table tbody tr.pl-card-row > td.cl-sel .cl-check { display: block; width: 44px; height: 44px; margin: 0; opacity: 0; cursor: pointer; }
  .pl-table tbody tr.pl-card-row:has(.cl-check:focus-visible) .pl-card-face { outline: 2px solid var(--accent); outline-offset: 2px; }
  .pl-table-wrap.selecting tr.pl-card-row .pl-card-face { background: transparent; border: 1.5px solid var(--line-strong); }
  .pl-table-wrap.selecting tr.pl-card-row .pl-card-initials, .pl-table-wrap.selecting tr.pl-card-row .pl-card-glyph { visibility: hidden; }
  .pl-table tbody tr.pl-card-row.selected .pl-card-face { background: var(--ink); border-color: var(--ink); color: var(--bg); }
  .pl-table tbody tr.pl-card-row.selected .pl-card-tick { display: block; }
  .pl-table tbody tr.pl-card-row.selected .pl-card-initials, .pl-table tbody tr.pl-card-row.selected .pl-card-glyph { display: none; }
  /* The selection's bar, docked: full width along the foot of the pane, one row that scrolls sideways, its menus placed
     against the window (MoreMenu escape) so that scroll cannot cut them off. It stood at left: 50% with the width the
     browser left it -- 188px on a 375px phone -- and its seven controls stacked into a 312px pill over the rows. The
     list keeps room under its last row for it. PR 2 finishes it: the count, Add to list and one more-sheet. */
  .clients:not(.leads-scope) .cl-bulk { left: 0; right: 0; bottom: 0; transform: none; flex-wrap: nowrap; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; padding: 8px 16px; border-width: 1px 0 0; border-radius: 0; box-shadow: 0 -10px 28px -14px oklch(0 0 0 / 0.45); animation: none; }
  .clients:not(.leads-scope) .cl-bulk > * { flex: none; }
  .clients:not(.leads-scope) .pl-table-wrap.selecting { margin-bottom: 64px; }
}
```

- [ ] **Step 5: Run and see it pass;** **commit** `git commit -am "On a phone the face is the checkbox, and the selection's bar docks"`

### Task 9: The browser's word

**Files:** Modify `e2e/phone.spec.ts`, `e2e/leads.spec.ts`.

- [ ] **Step 1: People on a phone** (inside `phone.spec.ts`'s describe, which runs at 390×844 with `isMobile` and `hasTouch`):

```ts
  /**
   * People on a phone (docs/superpowers/specs/2026-09-22-people-on-a-phone-design.md): one bar, one line and the
   * rows. On 22 Sep the first person stood 299px down under a search box and three text buttons, each person a boxed
   * card 119 to 168px tall with the face squeezed to an oval and the state 36px tall, and Add a person opened a form
   * 479px wide on a 375px screen.
   */
  test("People is one bar, one line and the rows: a face is round, a state one line, nothing past the edge", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const bar = page.getByTestId("people-phone-bar");
    await expect(bar).toBeVisible();
    for (const id of ["people-phone-lists", "people-phone-search-open"]) await expect(bar.getByTestId(id)).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".cl-controls")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    const row = page.locator(".pl-table tbody tr.pl-card-row").first();
    test.skip((await row.count()) === 0, "nobody on this workspace");
    await expect(row).toBeInViewport({ ratio: 1 });
    expect((await row.boundingBox())!.y, "the first person is on the first screen").toBeLessThan(240);
    const face = (await row.locator(".pl-card-face").boundingBox())!;
    expect(Math.abs(face.width - face.height), "a face is round").toBeLessThanOrEqual(1);
    expect((await row.locator(".pill").boundingBox())!.height, "a state is a pill, not a button").toBeLessThanOrEqual(22);
    // Search: the bar becomes the field, at 16px (a phone zooms into anything smaller), and Cancel gives it back.
    await bar.getByTestId("people-phone-search-open").click();
    const field = page.getByTestId("people-phone-search");
    await expect(field).toBeFocused();
    expect(await field.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await page.getByTestId("people-phone-search-cancel").click();
    await expect(bar.getByTestId("people-phone-lists")).toBeVisible();
    // Add a person: a sheet whose one button is on the screen.
    await bar.locator(".more-wrap > button").click();
    const add = page.getByRole("menuitem", { name: "Add a person" });
    test.skip((await add.count()) === 0, "this member cannot add people");
    await add.click();
    await expect(page.getByTestId("add-person-sheet")).toBeVisible();
    await expect(page.getByTestId("add-person-save")).toBeInViewport({ ratio: 1 });
    await page.getByTestId("add-person-sheet-close").click();
    await expect(page.getByTestId("add-person-sheet")).toHaveCount(0);
  });
```

- [ ] **Step 2: Leads' search is a button.** In `leads.spec.ts`'s phone test, replace the two `leads-phone-search` assertions with `leads-phone-search-open` (visible, whole in the viewport), and after the card checks add:

```ts
    // Search is the bar's button; pressed, the bar is one full-width field (it was a 64px box that said "Sear").
    await bar.getByTestId("leads-phone-search-open").click();
    await expect(page.getByTestId("leads-phone-search")).toBeInViewport({ ratio: 1 });
    await page.getByTestId("leads-phone-search-cancel").click();
```

- [ ] **Step 3:** `corepack pnpm exec tsc --noEmit -p e2e` (or the repo's e2e typecheck) and **commit** `git commit -am "The browser holds People's phone shape and Leads' search button"`. The specs run in the 09:00 UTC nightly against production; they are proven there after the deploy (section 7 of the spec).

### Task 10: Versions, docs, the whole suite, the PR

- [ ] **Step 1: `?v=` in `Chanlytics.html`:** components.css 67→68, clients.css 18→19, leads.css 28→29, mobile.css 19→20, data-bits.jsx 22→23, clients-a.jsx 35→36, leads-scope.jsx 23→24.
- [ ] **Step 2: `apps/dashboard/src/legacy/CLAUDE.md`:** under UI patterns add one bullet: "**People on a phone** (900px and under): one bar for both scopes (`PeoplePhoneBar`: the switch, the list, search behind a button that opens a 16px field, and People's more-menu or Leads' Find), the standing line, then the rows. A person's row is one cell (`plCardCell`, `PL_PHONE_COLUMNS`): face, name and state; the reason or their words; the visit and the last contact. The face is the checkbox; while anyone is selected a tap selects. People's small jobs open as sheets (`PhoneSheet`), drawn last and hookless, closed by the page's one listener."
- [ ] **Step 3: Grep for stale words:** `grep -rn "standing line.*Lists\|people-lists-pick\|ld-bar-search\|ld-bar-lists" apps docs/system-prd.md e2e tooling` → none left but history.
- [ ] **Step 4: The suite.** `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test`. Expected: all pass, `git status` shows no dist drift.
- [ ] **Step 5: Push and open the PR** (title "People on a phone: one bar, and rows that read like the Inbox's"; body: what changes for an owner on a phone, measured before and after; nothing to set; either deploy order; ends with the attribution line). Watch CI; on green, squash-merge and delete the branch; then verify on production (spec section 7) in Ruben's tab at 375×812 touch, both themes, and at 1280×800.
