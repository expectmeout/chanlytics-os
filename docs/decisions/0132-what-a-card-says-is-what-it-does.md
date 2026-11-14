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
6. **An answer of cards alone says what waits on the person.** Where Ask made cards and wrote nothing, its sentence is the
   card's own name and "Nothing happens until you press it." (several: "9 ready below. Nothing happens until you press
   them."), never "Here it is: Find 300 med spas." or "9 to look at.".
7. **A campaign is said as what it does, never "to 0 people".** Fill a cancellation offers each time a cancellation frees
   within the hour (decision 0082), and its line says so, where it said "Fill a cancellation to 0 people, daily at 10:00
   AM". Any moment nobody is counted for ahead is said by its name alone.
8. **WhatsApp's trouble is WhatsApp's, in the owner's words.** The payment lines say "The card on your WhatsApp account has
   a problem, so reminders and campaigns wait; they go once it is fixed." and "WhatsApp needs a card on file…; they wait and
   go once one is added.", never "Meta reports…" (Ruben, 12 Nov 2026), and the place to fix a failing card says Fix, not
   Add. WhatsApp's check of new words says "WhatsApp checks its new wording first. Its WhatsApp messages wait until then
   and go by themselves.", never "cannot be taken back"; no time is promised. New's check says "Email now, WhatsApp once it
   approves the words".
9. **Today's chip says what WhatsApp holds.** A number WhatsApp holds a payment against reads "WhatsApp: payment needed",
   never "WhatsApp connected" (one read of the channel rows, beside Today's others); it still counts as a line that takes
   messages in.
10. **A paused campaign turned on again is "Turn back on: …"**, never "Resume: …".
11. **New says before its press that leads with no email won't be written to.** Leads picked on Leads and taken to a new
    sequence: where none has an email, New says "None of these 35 has an email yet, so an email sequence can't reach them."
    and its press makes nothing; where some have none, it says how many won't be written to. Ask's draft is told the
    picked leads are who it goes to, so it never says no search is ready; a draft it could not write says "Nothing was made:
    Ask couldn't write a draft" before Ask's own words. New offers Ask's draft before a copy, since a copy is of another
    sequence's emails. (35 med spas, none with an email, went to "A draft by Ask", which failed: "No search of med spas is
    ready, so I can't choose who this goes to".)

## Held by

- Item 1: `tests/ask/act/plan-press.test.mjs` (what one press takes, the live run of 14 November) and
  `tests/ask/ask-palette.test.mjs` (the card's press, its line after, How it runs, what is left).
- Items 2, 3 and 5's press: `tests/ask/act/a-card-says-what-is-true.test.mjs`.
- Item 4: `tests/ask/act/plan-press.test.mjs` (the waiting cards with their terms).
- Item 5's door: `tests/leads/lead-routes.test.mjs` (a search past the month's room finds what is left).
- Item 6: `tests/ask/ask-answer.test.mjs`, `tests/ask/ask-turn.test.mjs`, `tests/ask/plan/plan-cards.test.mjs`.
- Item 7: `tests/playbooks/ask-setup/reaches-someone.test.mjs`.
- Item 8: `tests/connections/whatsapp-standing.test.mjs`, `tests/playbooks/ask-setup/starter-card.test.mjs`,
  `tests/whatsapp/whatsapp-connect-door.test.mjs`.
- Item 9: `tests/today/today-vm.test.mjs`, and Today's reads in `tests/email/mailbox-routes.test.mjs`.
- Item 10: `tests/playbooks/change/check-playbook-patch.test.mjs`.
- Item 11: `tests/leads/workbench/lead-sheet.test.mjs` (what New says) and `tests/sequences/sequence-draft.test.mjs` (what Ask
  is told of the picked leads).
