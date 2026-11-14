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
2. **A batch decided on Campaigns is decided everywhere.** Before Ask is told which cards wait in its thread, and before a
   batch card is pressed, the batch is read again: one approved, skipped or gone is never named as waiting, and its card
   says "This batch was already decided on Campaigns (scheduled), so there is nothing to do here." with nothing sent.
   (He approved "Agency owner outreach" on its page at 7:05; at 7:07 Ask said its card still waited, and his yes failed.)
3. **A yes presses only what is in view.** A yes in the thread presses a card made in the last half hour; an older one is
   made again with the same terms, so the person presses the card they can see. The yes check reads the card's own terms
   beside its title, so a yes to one place or number is checked against the place and number the card names. ("Yes, run
   the New York City search" pressed a card made 1 h 40 min before, and he asked whether it ran without a card.)
4. **Ask says what a card does from the card.** The cards waiting in a thread are named to Ask with their own terms, and
   it is told to say what a card does from them, never from memory. (Ask twice said the waiting New York search kept only
   med spas with an email; the card never said so.)
5. **A search's press asks for what its button said.** A search card's press posts the count its button shows, bound to
   the month's room as the card read it, the same reading on the Line and on the server, which presses a saved card. At the
   door, a count still past what the month has left now starts with what is left, never a question nobody can answer from
   a card, and the receipt says how many more were asked and the day they can follow. (The button said "Find 64 leads";
   the press sent the plan's 300, and the door asked "Find 267 now, or all 300 when your leads renew on Dec 1?")

## Held by

- Item 1: `tests/ask/act/plan-press.test.mjs` (what one press takes, the live run of 14 November) and
  `tests/ask/ask-palette.test.mjs` (the card's press, its line after, How it runs, what is left).
- Items 2, 3 and 5's press: `tests/ask/act/a-card-says-what-is-true.test.mjs`.
- Item 4: `tests/ask/act/plan-press.test.mjs` (the waiting cards with their terms).
- Item 5's door: `tests/leads/lead-routes.test.mjs` (a search past the month's room finds what is left).
