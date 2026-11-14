# 0132 · What a card says is what it does

**Status:** Accepted by Ruben, 14 November 2026 ("Leave apify for last let's fix everything else and refine it better"),
on the review of his phone walk of that morning (Ask, Campaigns, Leads). Written against main at `15f850bdca`. Being
built in one lane; nothing merged.

## Context

On 14 November Ruben set his own workspace up from his phone, through Ask, between 6:46 and 8:58 New York time, and
sent eleven screenshots. Read against the Ask thread, the cards' outcomes and the searches on production, the morning
showed a card, a count or a sentence saying one thing while the app did another:

- A card titled "Turn on the booking follow-up, fill a cancellation, 2-hour reminder and missed meeting campaigns", with
  one Start it, started the first of the four and turned two paused ones back on. The button stayed. Ask then said the
  other three "weren't approved". Each campaign is its own send, and a plan's press took one send at a time (D2 of the
  answers canvas), saying nothing of the rest.

The items below are each a place where that happened, and what it does now.

## Decision

1. **A card's one press does everything the card names.** Its press takes every send it holds, in order, where the old
   rule took the first: "Start all 4" on the button, "All 4 are on. Each says below when it starts." after it, and How it
   runs open with each one's own receipt. It stops only at a send that builds on another not made before this press
   (it needs what that one comes back with), and at one whose words WhatsApp reads first (the press files them; that
   send and those after it wait, so none goes out of the plan's order); then the card says how many start with the next
   press. Reverses D2 of the answers canvas on Ruben's word.

## Held by

- Item 1: `tests/ask/act/plan-press.test.mjs` (what one press takes, the live run of 14 November) and
  `tests/ask/ask-palette.test.mjs` (the card's press, its line after, How it runs, what is left).
