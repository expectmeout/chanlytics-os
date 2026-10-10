# What pops wears one ground: a tier for every floating surface

10 October 2026. Ruben, of the Calendar's Settings menu and Services list against Settings › Activity's lists:
the glass is right but "a bit too transparent", Activity's is too "opaque/dark", and the same styling should be shared
and reused across the site, with Activity's scroller; then a plan for every other popover, because "so many different
popover styles on desktop and mobile… we need a clear set of which will be more glassy which will be less transparent".

Approved whole on 10 Oct 2026 ("all approved as you suggest best… do it locally"). **Phases 1 to 5 are built locally**
(branch `ux/inbox-search-people-kit` in cm-bell, uncommitted); his answers to the four questions are the plan's own:
hover cards and the bell on glass, toasts opaque, the order 2, 3, 4, 5. See "As built" at the end.

## The tiers

Five grounds, each for one kind of job. Every floating surface in the dashboard belongs to exactly one.

| Tier | For | Ground | Wash behind | Today |
| --- | --- | --- | --- | --- |
| **1. Pop glass** | What opens from a control and closes on a pick or a press outside: action menus, select / picker / combobox lists, date pickers, popovers, autocomplete lists, hover cards, the bell | `--surface-pop-glass` (the pop's fill at **72%**), the control layer's sheen, blur and depth, no hairline; one thin scroller | none on a desk; `--surface-veil` when it is a phone's bottom sheet | 9 kinds on it (Phase 1); 6 off it |
| **2. Sheet solid** | What you work in: side sheets, phone bottom sheets, dialogs (Ask's window, the Calendar's appointment panel), the shortcuts sheet, the lightbox | `--surface-pop-fill`, opaque, `--surface-pop-edge` + `--surface-pop-depth` | `--surface-scrim` on a desk, `--surface-veil` on a phone | one colour spelled three ways (`--surface-pop-fill`, `--surface-pop-solid`, `--bg-raised`), four washes |
| **3. Notice** | Toasts | as tier 2 (a flash must read over anything) | none | already one (`.pp-toast`) |
| **4. Control glass** | Chrome that lives on the page, not over it: the phone drawer, docked selection bars, a sheet's foot capsule | `--surface-control-fill` (8.5% / 50%) + sheen + blur + depth | n/a | already consistent; **no pop may use it** |
| **5. Tip** | One line of words on hover or focus | `--ink` with `--bg` words (inverted) | none | `.ui-tip`, `.pk-hint-tip`, `.ld-tip` (one of them broken, below) |

The call island (`--surface-island-fill`) stays its own: hardware, always dark, not a pop.

## Phase 1: built (10 Oct)

- `--surface-pop-glass` 88% to 72% (tokens.css). Menus had stood on the control layer's 8.5% (the Calendar's coral button
  glowed through its Settings menu), lists on 88% (a flat dark box); now one ground between them, in both themes.
- kit.css: one rule for `.more-menu, .panel-pop` (every kit Menu, MoreMenu, the sidebar's menus, Select, Picker,
  Combobox, DatePicker, Popover), and one thin scroller for `.more-menu, .rec-combo-list` (the Select's list had the
  page's 10px bar with a `--bg` border, a dark box on the glass).
- MoreMenu's `solid` retired: it existed only to put Activity's lists on the denser ground everything now wears.
- Checked in the running app at 1000x640: Calendar Settings, the date picker, Activity's filter, the light theme.
  **To watch:** Activity's amber and red log lines under a 72% list (the 8 Oct smear was at 8.5%; 72% held over the
  e2e workspace's log).

## Phase 2: the six pops still off the glass (tier 1)

| Surface | Today | Change |
| --- | --- | --- |
| Bell / Notifications (`.tbn-pop`, components.css:988) | `--bg-raised`, 1px line, `--shadow-lg` | tier 1 ground; its sticky heads and rows (components.css:1030, 1121) lose their own `--bg-raised` so the glass shows. Phone sheet keeps its veil |
| Leads finder pick list (`.lf-pop`, leads.css:71) | `--bg-raised`, line, shadow | tier 1; better, draw it with the kit's Popover or Picker |
| Leads "Not a fit?" menu (`.pk-nf`, leads.css:309) | `--bg-raised`, line, shadow | the kit's Menu (it is an action menu) |
| Leads hover card (`.ld-card`, leads.css:696/1440) | opaque `--surface-pop-fill` | tier 1 |
| Leads evidence card (`.pk-hint-tip.card`, leads.css:232) | `--bg-raised`, line, shadow | tier 1 |
| Today figure receipt (`.tc-receipt`, dashboard-a-v2.css:1031) | `--bg-raised`, line, literal 10px radius | tier 1 on a desk (inline on a phone stays) |

Also in this phase:

- **Bug to confirm first:** at more than 900px, `leads.css:1440` (`.main-scroll .ld-hover > :last-child`) also hits the dark
  tip `.ld-tip` (the Found cell and the slot cells), giving it the light pop fill under `--bg` words, which would be
  nearly invisible. Read from the CSS, not yet seen in a browser.
- Reports' date range popover (`.rpt-when`, reports.css:129) scrolls with the page's 10px bar: give it the pop scroller.
- The chart tooltip (`.ck-tip`, charts.css:82) holds a period's figures, so it is a card, not a tip: tier 1.

## Phase 3: one solid for sheets and dialogs (tier 2)

- One token: RecordSheet (`.rec-sheet`, kit.css:2003) is `--bg-raised` while the kit Sheet is `--surface-pop-fill`, and
  People's five phone sheets override to `--surface-pop-solid` (clients.css:3188-3199). Same colour in both themes; make
  every sheet read `--surface-pop-fill` with the pop edge and depth, and drop People's override.
- Ask's window and the Calendar's appointment panel: their border and shadow come from `.ask-modal` (`--line-strong`,
  `--shadow-lg`), outranking the pop edge and depth; take the tier's.
- The shortcuts sheet (`.sb-sheet`), the Leads plan sheet on a phone (`.pl-plan`) and the Leads lightbox: `--bg-raised` and
  a line; take the tier's ground, or move the two sheets onto the kit Sheet.
- Washes: four today (`--surface-scrim`; `--surface-veil`; ink at 35% + an 8px blur behind `sb-sheet`, Ask and the
  Calendar panel; black at 55% behind the lightbox). Two after: the scrim on a desk, the veil on a phone.
- The Inbox's "sending soon" strip writes a literal shadow (`rgba(0,0,0,.14)`, inbox.css:1766): the pop depth.

## Phase 4: phones

- **A phone's menu is a bottom action sheet, always.** The kit Menu already is one (kit.css:739); MoreMenu (Settings'
  Activity filters, Autonomy, Business, Connections, Team) stays a hanging popover with no veil. Move those twelve
  callers onto the kit Menu (or give MoreMenu the same phone form) and retire the house component.
- The sidebar's account and workspace menus become a foot sheet on a phone with no veil (components.css:1462): give
  them the veil.
- Breakpoints: the kit turns at 900px, the bell sheet, Ask's takeover and the Calendar panel at 720, RecordSheet at 760.
  Not a ground question, but it is why "the same popover" looks different at 721–900. A separate pass.

## Phase 5: native parts

- Three native `<select>`s without the kit's box: a note's For (notes.tsx:72, 122) and the new workspace's
  (CreateWorkspace.tsx:467). On a desk they open the browser's grey list: the kit Select. A phone's native picker is
  fine and stays.
- Native date and time inputs (deal sheet, notes, step sheet, Activity, Business hours): keep for now; the kit's
  DatePicker covers dates if he wants parity on a desk.
- About 54 `title` attributes still draw the browser's own tip: move to `data-tip` as each file is touched, no sweep.

## Questions for Ruben

1. Hover cards (Leads) on pop glass, or kept opaque because they sit over dense table rows?
2. The bell on glass (tier 1) or as a sheet (tier 2)? It opens from a control and closes on a press outside, so the plan
   says glass.
3. Toasts stay opaque (tier 3)?
4. Order: Phase 2 next (small, CSS, visible), then 3, then 4?

## Proof each phase owes

The kit's gallery spec and the style-values / kit-primitives ratchets (each page rule moved onto a token is a fall);
the running app at 1440 and 390, both themes, each surface opened over its busiest page.

## As built (10 Oct 2026)

- **Phase 2.** The bell, the Leads finder list, "Not a fit?", the hover card, the evidence card, Today's receipt and the
  chart tooltip draw the kit's pop panel (`panel panel-pop`) in their markup, and their stylesheets keep only placement.
  The bell is glass on a desk and a sheet's solid at 720px and under, where its notes slide over their grounds; its day
  heads blur the notes under them. The `.ld-tip` bug was real by specificity and is gone with the override that caused
  it. "Not a fit?" keeps its own markup on the kit's ground; moving it onto the kit Menu is left for its next change.
- **Phase 3.** RecordSheet, the shortcuts sheet, the Leads plan sheet and lightbox, Ask's window and the Inbox's
  sending-soon strip read the pop fill, edge and depth; People's phone-sheet override is gone. The washes are two:
  `--surface-scrim` on a desk (Ask, the Calendar panel, the shortcuts sheet, the lightbox), `--surface-veil` on a phone.
  The shortcuts sheet lost the browser's focus outline on itself, as the record sheet had.
- **Phase 4.** MoreMenu on a phone is the kit Menu's bottom action sheet, drawn on the body (`data-sheet`) because a
  `.rec-card` isolates its layers and held the sheet under the tab bar. The sidebar's foot menu has the veil. The
  720/760/900 breakpoints are not touched (a separate pass).
- **Phase 5, held in part.** The note's For and day selects and the new workspace's timezone keep the browser's list but
  on the pop's ground (the clear box let Chrome draw the device's white list). Swapping them for the kit Select is held:
  it puts Base UI on a person's page, whose bundle is at its ceiling, and a raise is his call from CI's number.
