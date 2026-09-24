# Campaigns, compact: design spec

**Date:** 23 Sep 2026 · **Owner:** Ruben · **Status:** approved by the ask ("redesign as you suggest best") · **Branch:** `design/campaigns-compact`

**Analysis:** the three Campaigns tabs measured on the dashboard dev server against the salon's real workspace
(`/w/<workspace-slug>/`), at 1440×900, 1600×900 and 1920×1000 on a desk and at 390×844 with touch emulation,
on `c28ca4ba` (#948). Every number below is from that tab or from the file and line named beside it.

## 1. Goal

Campaigns reads like the rest of the app: one page edge and one scroll edge with Today, the lists in People's
dense-table family, nothing said twice, and on a phone the work first. The rows take a line or two, not a card each.

Ruben, 23 Sep: "make it more compact the rows take too much space too much unnecessary info the repetitive headlines
… more sophisticated efficient with space organized better … follow the other site pages where applicable like the
inbox and leads and people pages … the scroller to scroll up and down appears center in the screen not on the right
… the page width is not the same as the today page."

## 2. What the pages do today

**Two frame bugs, both real (desk).**

- *The scroll edge.* Playbooks and Templates are `pane` routes whose scroller is the page's own `.rp-body`, and that
  scroller is capped: `.pb-page .rp-body { max-width: var(--measure-wide) }` (components.css:1402) and
  `.tpl-page .rp-body { max-width: var(--measure-page) }` (components.css:2260). The scrollbar is drawn at the cap,
  not at the window: at 1600 Templates' scrollbar stands at x=1408 of 1600, at 1920 Playbooks' at x=1728. Broadcasts
  scrolls in the shell's `.main-scroll`, so its bar is at the edge. That is the "scroller in the centre".
- *The page width.* Three tabs, three measures: Playbooks takes `--measure-wide` (content to x=1700 at 1920),
  Broadcasts and Templates `--measure-page` (to x=1365). Today, Reports and a person's page take `--measure-wide`.

**The same title three times.** The crumb says "Campaigns / Playbooks", the tab says Playbooks, and the page opens on
a 22px "Playbooks" with a sentence under it (`CmHead`, campaign-bits.jsx:21). The same on the other two tabs.

**Heights, desk (1440×900).**

| | head | then | rows |
|---|---|---|---|
| Playbooks | 48px + a 4-cell tally | 8 cards in a 3-up grid, 689px; 5 of them "Not set up" with a paragraph each | 179–258px a card |
| Broadcasts | 48px | a band card 68px, "The week ahead" 209px (7 rows of dashed marks) | 66–76px a run; "Get their yes" 194px |
| Templates | 51px | a banner 62px, a column head 24px | 63px a row |

**Heights, phone (390×844).** The first card starts 273px down on Playbooks, the first run 687px down on
Broadcasts (below the tab bar), the first template 492px down. A playbook card is 174–290px, a run 203–231px, a
template 178–229px, "Get their yes" 543px. People's row is 84px and its first row starts 149px down.

**Words nobody acts on.** The template's code name on every card and row (`winback_offer`, `welcome_new`), the
language letters on every run, a policy chip on every past run, the moment blurbs, "The eight moments Chanlytics
acts on for you, each on its own clock", "Every run, once or standing — a playbook's runs land here too, so there is
one ledger", "WhatsApp reviews each message, usually within minutes" (twice), "Replies never sit — the receptionist
answers…", and the three "Always on" rules as a 78px card.

## 3. The design

### 3.1 The frame (all three tabs)

- **One page edge with Today.** Every tab takes `--measure-wide`, on the left, inside the `--gutter-page`.
- **One scroll edge.** The scroller is as wide as the pane; the measure is kept by its padding
  (`padding-right: max(gutter, 100% - measure + gutter)`), so the bar sits at the window's edge on every tab.
- **Said once.** No visible page title and no sub-headline: the tab says where you are. Each tab keeps an `h1` for a
  screen reader (visually hidden). What the head keeps is one line: the page's numbers as a sentence at the left, the
  page's tools and its one act at the right (People's controls row). "New playbook" moves from the top bar into that
  line, where "New broadcast" and "New template" already are, so the three tabs put their act in one place.
- **The tabs** sit 6px under the bar, not 14.
- **The lists are People's table**: one bordered list, a sunken head of 10px capitals, hairline rows, the row's hover.

### 3.2 Playbooks

- The set-up playbooks are **rows** under a column head (Playbook · State · Reaches · Next run · Runs), about 56px:
  the moment's mark, the name over its condition, the state pill, "1 of 5 on the list" over a 4px bar and the reasons
  on one line (the door "Get their yes" kept), the next run or "Approve it and it goes at 10:00", the last runs' shape
  and the count. The code name and the language letters leave the row (they are in the open row).
- A row **opens in place** under itself, as a template's does: the message as the customer sees it beside the
  sentence, the runs and the acts, two columns on a desk.
- The moments nobody set up are **one compact group** ("Not set up"), tiles of two lines — the name, the condition
  and who it would reach today — with Set up at the right. The blurb is the tile's hover.
- "Always on" is **one quiet line** under the list; each rule's longer words are its hover.
- The tally becomes the head's sentence: "3 set up · 1 needs you · 1 paused · 5 not set up — one running with nobody
  to send to".

### 3.3 Broadcasts

- The head's line: the states as **filters** (the band's legend without its bar: "1 waiting on you", "4 sent"), then
  what went out ("4 broadcasts sent — 2 by a playbook, 2 by hand · 13 messages, 100% delivered · 4 replies"), then
  New broadcast.
- **The week ahead is one strip**: seven day cells in a row, a dot per run in its state's tone (a ring for a
  playbook's run to come), the runs named on the cell's hover. It was seven rows and 209px.
- **The runs are rows** in one list, about 50px: the kind's mark, the name with its state, "Playbook · Win-back ·
  quiet 30 days" or "Broadcast · Everyone who said yes" under it, when it goes, who it reached with the reasons on one
  line, and — only on a run waiting on you — Approve the run and Skip. A run to come or going out is cancelled or
  stopped from its report. The whole row opens the run; "Open" goes. The template's code name and language leave the
  row (the run's report has them); the policy chip stays on a run that waits (it says why it waits) where the list is
  wide enough for it beside the name.
- **Get their yes folds** to one line under the runs ("Get their yes — only people who said yes get a broadcast"),
  open when the address is `broadcasts/get-yes`, so every door that lands there still lands on it open.
- The foot line about replies goes.

### 3.4 Templates

- The head's line keeps its numbers and the WhatsApp state; search and New template at the right.
- The starter-set notice is **one slim line** with its act.
- Rows take 52px, not 63: the title over the quote; the code name moves into the open row.
- The foot's "WhatsApp reviews each message, usually within minutes" goes (the head's hover says it); the fold of
  hidden templates stays.

### 3.5 On a phone (720px and under)

- The top bar says **Campaigns** once (as it says Inbox once); the tabs say which.
- The head is one slim bar: the numbers and the act ("New", its whole name kept for a screen reader); a warning
  ("Welcome has nobody to send to") takes a line of its own under them, and "not set up" is left to the group.
- Every list row is **People's row**, on the row tokens (`--row-pad-y/x`, `--row-gap`, the three lines):
  a playbook — name and state; who it reaches; the next run and the runs. A run — name and state; how it was sent,
  when, who it reached; Approve and Skip only when it waits. A template — its title; the quote; what sends it
  and what went out (its languages are its open row's).
- Not set up is a list of one-line rows; the week strip keeps its seven cells.

## 4. What does not change

Every sentence a number sits in is still the view model's or the bridge's; no count is added, none is derived here.
The composers (the playbook sheet, the send screen, a template), the run's report and its approval sheet, the routes,
the doors and the gates keep their shape, and so do the test ids, but for two a design change retired: `bc-waiting`
(the flag that repeated the filter) and `template-origin` (the chip that is now the open row's foot).

## 5. PRs

One program, merged in order, main green after each:

1. **The frame + Templates** — the scroll edge and the measure on all three tabs, the tabs' bar, the phone's top bar,
   the quiet head (`CmHead quiet`), and Templates' head, rows, notice and foot, desk and phone.
2. **Playbooks** — its one-line head with New playbook in it, rows, the open row, Not set up, the rules line, the
   phone rows.
3. **Broadcasts** — its one-line head with the filters, the week strip, the runs as rows, Get their yes folded, the
   phone rows.
