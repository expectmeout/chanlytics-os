# 0088 · A turn of cards fits the first screen: one card open, a warning said once

**Status:** Built on the lane `ask/a-card-turn-fits-the-first-screen` from main's `4c23772de`, 2 November 2026, on Ruben's
ask for what brings Ask to 9.2, with the product calls left to the builder ("product calls are yours: say the call and how
to undo it"). It amends the spec 2026-09-27-ask-chat-on-a-phone: D6 (the next questions ride above the field) and D16 (the
card). Each call below says how to undo it.

## Context

A turn with cards was too long, and the first Approve was below the fold. Measured on the running app on one scripted
turn of three campaigns (`dev-tools/ask-rig.mjs`, "set up a campaign"): a thread of 1,380 px in a column of 604 at 1280 by
800, and 1,616 px in 644 at 375 by 812, with the first Approve at 656 and 747 px. The same WhatsApp warning stood on all
three cards and again in the answer, and the next questions sat over the card. A real campaign's sheet is longer than the
rig's: eight rows to its five.

## Decision

1. **Cards stand together, one open at a time.** A turn's cards side by side are one group, a plan another (contracts
   `cardsTogether`). The first card with nothing pressed is open (`openCardOf`); the others fold to their title and one line
   (`AskProposal.line`, else the summary), with no press on them, and their head is the press that opens them, a real button
   with `aria-expanded`. Deciding a card opens the next. A plan's folded step still says what it waits for, beside its head,
   and why it cannot go yet. A card alone is drawn as it was. _Undo: hand `fold: null` to every card (`AskCards`, `AskPlan`)._
2. **A decided card in a group is its head and what became of it.** Its sheet goes, so the next card rises into the room.
   _Undo: `decided` in `AskCard`._
3. **A refused press stops no other card.** Its refusal and its Try again stand, and the next card opens; Try again opens
   it again. A plan's stop was already "the steps after it stay pressable".
4. **What holds every card is said once, over them** (`holdsAlike`), in the sheet's warn tone, led by whose it is ("All 3."),
   and stands until the last card is decided. A hold only some cards have stays on those cards. Each card's press still
   comes after the warning: it stands directly over the group. _Undo: an empty `alike`._
5. **The answer does not say it again.** A line of the answer that only repeats a hold of a card still waiting is not
   drawn (`wordsLessHolds`, by the line's words, whatever its marks). Copy and Read aloud keep the whole answer. A model's
   paraphrase is its own words and stays: see Not done.
6. **A sheet keeps what no press turns on behind Details** (`AskCardSheet` row `aside`). What goes out, to whom, when and by
   what channel never is, nor is a hold. On a campaign, Other messages and Sends are aside: its first batch waits for an OK
   whatever the mode, so neither changes what a press does. Open waits behind Details too, so a phone's acts are one row of
   three. _Undo: drop `aside` in `campaignSheet`._
7. **An answer with cards keeps its next questions in the thread, under them,** not over the field, where they stood on the
   card. That gives the column their 42 px back. Every other answer keeps D6. _Undo: `nextInThread` in `under.ts`._
8. **A press lands somewhere.** Approve keeps its focus while it runs (`aria-disabled`, since `disabled` dropped it on the
   page's body), then focus lands on what became of the card, which fills a `role="status"` drawn from the first; Try again
   lands on Approve. The field no longer takes focus back from a card as its outcome is noted. A failed turn offers neither
   Copy nor Read aloud.
9. **The sheet's labels are `--ink-muted`:** `--ink-dim` read 4.05:1 at a desk in dark, over the page's light through the
   glass.

## Measured

The same turn, unscrolled, in the real app. The column grows by the 42 px the next questions left. The rig's cards gained
what a real card carries, its `line` and an `aside` on Sends, so a card stored before this, with no `aside`, stands one row
taller.

|                                                      | Before     | After      |
| ---------------------------------------------------- | ---------- | ---------- |
| Desk, 1280 by 800: the thread                        | 1,380 px   | 832 px     |
| Desk: the first Approve's foot against the column's  | 750 of 670 | 616 of 712 |
| Phone, 375 by 812: the thread                        | 1,616 px   | 954 px     |
| Phone: the first Approve's foot against the column's | 843 of 696 | 713 of 738 |

`e2e/ask.spec.ts`, "A turn of cards", holds it on a scripted turn with no model behind it: the first Approve inside the
column at both widths, the warning once, and axe at each state of the turn, at both widths and in both themes, with no
serious or critical finding. One minor finding stands, `aria-allowed-role` on the field: a `textarea` as a combobox, which
is what lets it keep its rows' `aria-activedescendant`.

Axe says "incomplete", not a pass, for the contrast of words on Ask's glass, 25 to 30 nodes a state: it cannot read the
ground through a backdrop filter. The card turn's words were sampled by hand instead, each computed colour against the
ground as painted with the words hidden, at both widths and in both themes: 5.4:1 or better, and the labels of item 9 at
4.51:1 at their worst, a desk in dark.

## Not done, and why

- **The model is not told to leave a card's warning out.** The prompt already asks for one sentence over a card, and a
  rule more wants a paid evaluation to prove it. Until then a paraphrase in the answer is a second saying.
- **No Approve in a card's head, and none pinned to the field.** Either would put the press where it could be made before
  the facts it turns on were seen.
- **The answer's words are not clamped.** They are Ask's answer, and a warning in them must not fold away.
- **The cards do not stay collapsed to their line, as Today's are.** The owner comes to Ask to decide: the card reached is
  whole.

## Risks

- A plan's one press stands above steps that are folded. It approves only steps that send nothing, each saying its title
  and its line, and each opens by its head. A send is always its own press, and is open when pressed.
- The first screen is a phone at 812 px tall. The margin there is 25 px on the rig's turn, whose answer runs to eleven
  lines where a real one over cards is a sentence; a real sheet's rows may wrap. Safari's bars take more height.
- Nothing here has met a real turn: no model was run. WebKit was not walked.
