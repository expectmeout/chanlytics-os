# People on a phone: design spec

**Date:** 22 Sep 2026 · **Owner:** Ruben · **Status:** approved (design review, 22 Sep) · **Canvas:** https://claude.ai/artifact/2VdWZAxkoP6KVwX7BVfUm9 · **Plan (PR 1):** `docs/superpowers/plans/2026-09-22-people-on-a-phone-pr1.md`

**Analysis:** the People area measured in Ruben's own signed-in tab at 375×812 with touch emulation, both themes, on production at `586b5458` (#825), then read in the code at `75fef029` (#827). Every number below is from that tab or from the file and line named beside it.

## 1. Goal

On a phone, People looks like one designed screen, not a desktop table folded into boxes: the people start under one slim bar, each person is a row that reads in one glance, and nothing is off the edge, squashed, or stacked into the middle of the list.

Ruben, 22 Sep: "on phones it looks all discombobulated … redesign components and interfaces … for a sophisticated modern sleek minimal … responsiveness."

## 2. Decisions taken in the review

| # | Decision | Why |
|---|---|---|
| D1 | All of it, in three PRs, each merged before the next starts: the list; selecting; the rest. | Ruben: "All of it, in 3 PRs". One thing to 100%, in order. |
| D2 | Select by tapping the face (Gmail's way). While anyone is selected, a tap on a row selects it too; More › Select people does the same. | Ruben's choice. A checkbox column on every row is a desktop's affordance. |
| D3 | The answer to offers leaves the phone row. It stays on the person's page and in the "Can receive offers" and "Said yes" lists. | Ruben's choice. "Not asked" sat unlabelled on 28 of 29 cards; "Opted out" is already the person's state. |
| D4 | Leads gets the same bar: search behind a button that opens a full-width field. Leads' cards stay as they are. | Ruben's choice; it is #802's option A. |
| D5 | The Inbox's row is the model for a person's row. | Ruben, 18 Sep: "i like the current inbox page leave it." One row grammar across the phone's lists. |
| D6 | The standing line's "N need you" stays red. | It is a count that asks for you, like the Inbox's Needs you count and the sidebar badge; the amber pill is one person's state. (The canvas drew it amber; this spec corrects it.) |
| D7 | Leads keeps no standing line on a phone; its strip is its one line (leads-honest "no standing line: a phone shows the work first"). | Already decided in release B. The canvas drew one; this spec corrects it. |

## 3. What a phone shows today

Measured at 375×812, touch, on the salon's 29 people.

**The list**
- The first person starts 299px down; with a list picked, 494px. Above them: the standing line (56px), a 57px search box, three 44px text buttons (Add a person, Export CSV, "Z → A"), a divider and an "Everyone" title.
- Each person is a boxed card 119 to 168px tall: 3½ people per screen, 3,659px of scrolling for 29.
- Faces are ovals, 15 to 19px wide by 26px tall: `.ix-thread-avatar` has no `flex: none` and shrinks to its initials (inbox.css:277, clients.css:917).
- State pills are 36px tall and touch the card's right border. The touch floor inflates every `.pill` (legacy.css:52-57), and `.cl-table td.shrink { padding: 0 }` (clients.css:1865, 0,2,1) beats `.pl-table tbody tr > td { padding: 0 10px }` (1954, 0,1,3), so every `.shrink` cell lost its side padding.
- The right column is 132px (`minmax(0, 40%)`), so the reason wraps and the visit breaks as "9:30 –" over "10:00 AM".
- Three left edges in one card: the checkbox, the face at 55px, the lines under it at 45px.
- "Not asked" at the foot of every card; "no contact recorded" twice in one card.
- A picked list wraps the standing line and leaves a lone "·" at the start of line two.
- A search that finds nobody centres its words in a 28px grid column (the empty row has no grid area, clients.css:1864) and says "0 of 29" for a list of 4.

**Acting on people**
- Ticking one person opens `.cl-bulk` at `left: 50%` with a shrink-to-fit width of what is left of the pane: 188px on a 375px phone. Its seven controls stack into a 312px pill over the rows (clients.css:1804; mobile.css:140 adds only `flex-wrap`).
- "Add a person" opens an inline form 479px wide (two 180px inputs, no wrap, clients.css:1811-1812): Add and Cancel are off the screen and the pane scrolls sideways.
- Every text field in People is 12.5px (clients.css:307, 1812 …), and the viewport does not lock scale (app/layout.tsx:37-41), so an iPhone zooms the page in on tap.

**Around it**
- The Lists sheet: a 40% accent bar (`.cl-rail-row.smart::before`) and an accent count on every smart list, "Lapsed 0" included; four left edges; and the People | Leads switch a second time.
- People | Leads sits in the bar on Leads but only inside the Lists sheet on People.
- Leads' search box is 64px ("Sear"); its list button is cut at 9ch.
- One person's page is in good shape since #559/#561.

## 4. The design

Everything below is at 900px and under (`PL_PHONE_QUERY`, the band People's cards and Leads' bar already use). The desktop is not touched.

### 4.1 One bar, both scopes (`PeoplePhoneBar`)

```
[ People | Leads ]  [ Everyone ▾ ]              [ 🔍 ]  [ ⋯ ]      People
[ People | Leads ]  [ All leads · 96 ▾ ]        [ 🔍 ]  [ ✦ ]      Leads
[ 🔍  rosa___________________________  ✕ ]  Cancel                 searching (either scope)
```

- One hookless component in `people.jsx`, drawn by People's page and by `LeadsPhoneBar` (leads-scope.jsx), which becomes a thin wrapper adding Find.
- The list button names what is shown: "Everyone", a smart list's label, or a kept list's name (People); the search or list with its count (Leads, as now). It opens the Lists sheet. Its words ellipsize inside a span, so the chevron stays.
- Search is a 44px button. Pressed, the bar becomes the field: full width, 16px text (no zoom), `type="search"`, focus taken; ✕ clears the words and keeps the field; Cancel clears them and gives the bar back. Words in the box keep the field open (a Leads view comes back with its own), without taking focus.
- People's last control is a more-menu (`MoreMenu escape`): Add a person; Sort (Needs you first, Latest contact first, Name A to Z, Name Z to A, and Soonest visit first with a calendar), the one in use ticked; Export everyone (CSV); and with a list open, that list's own acts: Rename this list, Delete this list…, or "Save these N as a list" for a smart list, a state or a search.
- `MoreMenu` learns one thing: an item with `checked` is a `menuitemradio` with `aria-checked` and a tick that hides when unchecked (the Columns menu's rule, generalised to components.css).

### 4.2 The one line

The standing line stays, counts only: "29 people · 2 need you · 13 reached this week", the middle part still the tap that filters. The Lists button leaves it (the bar has the list). On a touch screen its button keeps a 44px target with negative margins, so the line is about 24px tall instead of 44.

### 4.3 No list head on a phone

The section head (the "Everyone" title, a list's title with its rename, Show everyone, Delete list…, the state chip, "Filtered" / "Save these N") is not drawn on a phone: the bar names the list, the Lists sheet has Everyone, and the more-menu has the list's acts. A list's own step ("Nobody on this list has said yes to offers yet … Get their yes") stays, one compact card.

### 4.4 A person's row

On a phone each person is one cell (`plCardCell`), not the desktop's cells re-gridded:

```
( ZM )  Zoe Martin                                [ Needs you ]
        Sent something the receptionist can't read
        📅 Thu, Sep 24 · 9:30 – 10:00 AM    They wrote · 2d ago
```

- Edge to edge, a hairline between, 12px 16px padding: the Inbox's list. About 83px a person: seven to eight on a 812px screen instead of 3½.
- The face is 32px and round, spanning the lines.
- Line 1: the name (13.5px, 500, one line) and the state pill at its own 20px (the touch floor's pill rule is taken back inside the card: a pill is not a control).
- Line 2: why they need a person (`stateDetail`) when the state is Needs you or Waiting on you; otherwise their own last words; otherwise nothing. First letter capitalised in CSS.
- Line 3: the next visit (the calendar's green, with its glyph) and then the last contact, 12px apart. The visit is not a separate tap target on a phone; the row opens the person, whose page has "Open the day".
- Not on the row: the answer to offers (D3), the receptionist's one-word mark, where they came from, their lists, and "Name them" (all on their page, one tap away).
- The member's desktop column choices do not reach the phone row: it always says the state.

### 4.5 Selecting (tap the face)

- The row's checkbox is laid over the face, 44×44, drawn only while something is selected. A tap on the face selects; then every face is a ring and a picked one is the ink with a tick.
- While anyone is selected, a tap on a row selects it instead of opening the person (D2).
- PR 1 docks the bulk bar full width at the foot of the pane, one row that scrolls sideways, its menus placed against the window (`escape`), so the face-tap never leads into today's 188px pill. PR 2 finishes it: ✕, the count, Add to list, and ⋯ opening a sheet with the rest (Record a yes, Receptionist, Add a note, Export, Take off the list), the three inline forms in that sheet, More › Select people, and Leads' bulk bar on the same dock.

### 4.6 Sheets

One hookless frame, `PhoneSheet`: a sheet from the bottom with a handle, a title, one way out and its job; `pl-sheet`, so `PL_OVERLAY` leaves it to the page, whose one keyboard listener closes it on Esc.

- **Add a person** (PR 1): Name (optional) and Mobile number stacked, 48px fields at 16px, `type="tel"`; one full-width Add; "A number that is already here opens that person instead of adding them twice." On success the sheet closes and their page opens, as on a desktop.
- **A list's acts** (PR 1): Rename (one field, Save), Delete (the shared `Confirm`, "The people stay."), Save these N as a list (one field, Keep it). The doors are the desktop's; the verbs move into hookless helpers the desktop's title line, delete and "Save these" call too (`plRenameList`, `plDeleteList`, `plMakeListWith`).
- **The Lists sheet** (PR 1 and 3): PR 1 starts it with Everyone and drops its second People | Leads. PR 3 gives it the handle, 46px rows with the counts at the edge in the dim ink (Needs you and Waiting on you in the warn ink), no accent bar, one left edge.

### 4.7 The rest (PR 3)

- Text fields in People on touch at 16px: notes, email, a consent note, New list, the typed name in Delete this person.
- The person's page: the timeline's calendar rows stop repeating the person's own name ("Booked · Consultation", not "… · Zoe Martin"); "Add to…" says "Add to a list"; Right now's two actions side by side.
- The route skeleton on a phone draws no 220px rail (components.css:1221 beats 1235).
- "New list" from the shell opens the sheet at 900px and under, where the rail is hidden (it asked 720px, people.jsx:1665): moved into PR 1, one line.

## 5. What does not change

- The desktop: its controls row, its list head, its table, its columns, its keys.
- Leads' cards, peek, strip, finder, bench and map.
- The words: every sentence with a number is still contracts'. The phone's sort names are the page's, as the desktop's already are (`sortLabels`).
- The Inbox (Ruben, 18 Sep).

## 6. Rollout

| PR | Title | Holds |
|---|---|---|
| 1 | People on a phone: one bar, and rows that read like the Inbox's | 4.1, 4.2, 4.3, 4.4, 4.5's face-tap and dock, 4.6's Add, list acts and the Lists sheet's Everyone; the empty row's grid; Leads' bar |
| 2 | Selecting on a phone, finished | 4.5's one-row bar, its sheet and forms, More › Select people, Leads' bulk bar |
| 3 | The rest of People on a phone | 4.6's Lists sheet polish, 4.7 |

`?v=` keys taken in `Chanlytics.html` (coordinated with the loading-standard session, which holds People's family PR until these land): people.jsx 36+, people-table.jsx 6+, leads.css 29+, components.css 68+, and clients.css, mobile.css, leads-scope.jsx, data-bits.jsx as needed.

## 7. Proof

- Node: `people-honest.test.mjs` and `leads-honest.test.mjs` draw the real page on the stub React over the real surface. Each new rule gets a test that fails on main first. Two existing tests change with the rule they pin: the lists pick moves from the standing line to the bar, and the phone row becomes one cell that still says the state whatever the member chose.
- Browser: `e2e/phone.spec.ts` (390×844, `isMobile`, `hasTouch`) gains People: the bar whole in the viewport, the first row in the first screen, a round face, a 20px pill, no sideways scroll, search at 16px, the Add sheet's button on screen. `e2e/leads.spec.ts`'s phone test follows the search button.
- Production: after each deploy, Ruben's signed-in tab at 375×812 touch and at 1280×800, measured (first row, row heights, faces, pills, overflow, the sheets), both themes. No standalone-mockup screenshots.

## 8. Traps known going in

- The tests' stub React keys hooks by one global call order: every new component is hookless, its state the page's, and every new sheet is drawn last.
- `.cl-table td.shrink` (0,2,1) beats most phone cell rules: the card's cell is not `.shrink`, and its selectors are `tr.pl-card-row > td.pl-card-cell`.
- `html.legacy-on .pill` (0,2,1) needs `html.legacy-on .pl-card .pill` (0,3,1) to take the floor back.
- mobile.css loads after clients.css: its `.cl-bulk { flex-wrap: wrap }` has to go, or it undoes the dock.
- `.ld-bar` was also the rating card's star track (#789): only the bar's own rules go; `.ld-bar-row .ld-bar` stays.
- Measure glyphs, not boxes; re-check `innerWidth` and `pointer: coarse` inside every measuring call in the Browser pane.
