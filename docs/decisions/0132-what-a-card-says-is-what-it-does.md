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
12. **Leads says what was asked and what it counts.** A running search's strip counts toward what the owner asked for,
    never the first 25 the probe sizes it with ("0 of 25" for 300); a search card's "About N min" is for the count its
    button finds, not the plan's; and over one search the count of every lead says "177 leads in all". (The estimate's
    speed is kept: it was measured on searches that checked emails, and the morning's ran fast only because none did.)
13. **Leads names things once and plainly.** Two searches of one name are listed by their places ("med spas · Brooklyn,
    NY"); a row says a business's name without the search words its listing strings after a bar; the owner-facing words
    name the assistant Ask, as every other page does; a phone's row with no email address says "No email" in words; and
    while a selection is on, a phone's bar is Select's alone, with no Sort, Import or Map.
14. **A nearby ZIP is in its own state.** The areas offered when a search runs dry are searched and said in their own state
    by the ZIP's prefix ("near 07310, NJ" beside a search in New York), never the search's.
15. **A search made for email counts only leads with an email.** Under a plan whose contact is email, a lead counts (is
    Qualified, and taken from the month) only once its email checks out; one with a phone alone goes to Needs review's "No
    email on their site", never counted, and one whose email is being checked waits for it and is counted when the
    mailbox answers ok (lead_check_commit already promotes it). A search made for calls keeps decision 0010's rule: a
    phone that dials or an email that checks out. Its sentence says "each with a checked email", and Ask is told to plan
    a search for leads the owner will email as one made for email. Reverses decision 0010 for email searches on Ruben's
    word ("if this is for cold email then we must generate only ones with email"): his two med spa searches counted 154
    leads against the month, each by its phone, none with an email.
16. **A held opening says what was read, and is written to them.** An opening held for a claim says "the opening says
    something we couldn't find in what we read of them" (or "nothing we read of them says so"), never "we found nothing
    on", which over a quote of their site read as the check contradicting itself. The writer writes to the business as
    "you" and its name, never about the owner or the sender in the third person ("…The owner saw that you work across
    channels."). The writer's one automatic rewrite before a hold stands (F2). A batch's place in the queue says "2 of 3
    waiting" on a phone too, never a bare "2 of 3".
17. **New says a moment's sequence plainly, and a new message once.** Its who line says "A sequence for Booking
    follow-up at 10:00 AM", where "to everyone" before the moment's name read as sending to everyone; the steps whose
    message Ask wrote are said once ("Steps 1 and 2 are new messages"), amber only where WhatsApp reads them first.

18. **A search whose fetches failed stopped; it never searched everything.** A place-finding run that failed or timed out
    is not a term that ran short, and any such run ends the round "Stopped at 57: the source stopped answering" with Try
    again, never "searched everything" with places nearby. (Brooklyn's three first fetches succeeded and its three bigger
    ones failed after 33 to 94 places; it said it had searched everything and offered JFK's ZIP.)
19. **A site never read says so.** The provider's item names a site's `domain` when it reads it for contacts; a place with
    a website and no domain and nothing found on it was never read, and its Needs review pile is "Their site couldn't be
    read", never "No email on their site" with "Their home, contact and about pages were read". (On 14 Nov none of 233 med
    spa sites was read: the runs took 16 seconds for 9 places, where 5 Nov's read 32 in 158, and left no record of the
    contact pages visited, with the same input and the same pinned build.)

20. **The Maps actor is pinned to its build of 13 November, and a run that reads no site pages us.** The run logs (read in
    Apify's console with Ruben signed in) said why: the pinned build 0.14.775 (image EH35UvIrsV0hnZG0Y, the same on 5 Nov
    when it read sites) logged "Failed to get contact details: Cannot destructure property 'originalStartUrl' of
    'response.data'" for every place, its calls to its own contacts service were refused ("User was not found or
    authentication token is not valid"), and a longer run crashed when its contacts monitor set its concurrency to NaN.
    The provider shipped 0.14.792 (laWvC2kq0M7jC95UN) at 09:15 UTC that day, taking the same input; the card is pinned to
    it. A page of five or more places with a website, none read, pages the platform once a pager window ("A lead source
    reading no websites"), with where to look and where the pin is.

21. **Ask acts on its own only on what it could read.** A day's count of what it did alone, or the week's undos, that could
    not be read was taken as none, and the business's facts as UTC; now nothing runs alone and every card waits for a press
    (Ruben, 14 Nov 2026: "Yes, add them", from an outside review). The atomic day's allowance across two turns at once
    stays the 13 Nov plan's Part 1.
22. **A yes presses only the cards of Ask's latest answer.** What a yes may press, and what Ask is told waits, are the cards
    of the latest answer that made any; one further up is out of view, so Ask makes it again with the same terms and is
    never told it is "already above". Ask's rules say so, and their plan rule now says one press starts everything it
    names (item 1), where it still said a later send is the next press. The approval bound to one card, with its own row,
    stays the 13 Nov plan's Part 4.
23. **Ask's cold-email card says who it can reach.** It reads the search's reach as Leads counts it: none with a checked
    email (or with an email, where those being checked are asked for) and no card is made, the model told to say why;
    otherwise its To says "“Med spas”: 12 of 57 with a checked email". A count that could not be read is not said.

Not done, and why: the writer's openings are not rewritten more than once before a hold (F2 stands); a cold email from a
search in one card is new work, not a fix.

Probed on Ruben's word ("Yes, run the check"), 14 Nov 2026 16:20 UTC: 0.14.792 (build laWvC2kq0M7jC95UN) with the card's own
input, three Brooklyn med spas, $0.015 (run shERZ5EHJsGgfEFZf). Succeeded in 27 seconds with no contact or sign-in error in its
log; each of the three items names its site's domain, all three carry Instagram, two Facebook, and ReVita Glow MedSpa
carries info@revitaglowspa.com, where the morning's run on 0.14.775 had returned nothing for the same place.

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
- Items 12 and 13: `tests/leads/finder/leads-vm.test.mjs` and `tests/leads/finder/leads-honest.test.mjs`.
- Item 14: `tests/leads/engine/lead-core.test.mjs`.
- Item 15: `tests/leads/engine/lead-search.test.mjs` (the class) and `tests/leads/engine/lead-runner.test.mjs` (nothing counted at
  collect).
- Item 16: `tests/reach-out/reach-out-opening.test.mjs` and `tests/sequences/sequence-tab-words.test.mjs`; the phone's
  "waiting" is drawn by `approval.tsx` roRunHead, held by no test.
- Item 17: `tests/campaigns/new-send-checks.test.mjs` (the rows); the who line is new-draft.tsx whoWords, held by no test.
- Items 18 and 19: `tests/leads/engine/lead-core.test.mjs` and `tests/leads/finder/leads-vm.test.mjs` (the pile).
- Item 20: `tests/leads/engine/lead-sources.test.mjs` (the pin, the page) and `tests/leads/engine/lead-runner.test.mjs` (a page of
  unread sites tells the platform once).
- Item 21: `tests/ask/act/what-a-turn-runs-alone.test.mjs`. Item 22: `tests/ask/ask-turn.test.mjs` (the thread's waiting cards,
  and the rules). Item 23: `tests/ask/plan/cold-email-card.test.mjs`.
