# 0148 · A website's forms are forms: each site holds its keys and its forms, and a site's request is answered like any other

**Status:** Approved by Ruben, 23 November 2026 ("Yes, start Lane A", then "continue next lane", on the plan "Campaigns in
three tabs" v3 and its canvas, the six calls taken as drawn), and built on one branch, Lane B of the plan. One migration,
00709 (claimed 24 November 2026: production and main both at 00708, no open pull request adding one). Written against main at `56b557b3f4`. Follows 0147
(Lane A, Ads inside Content). Amends the Forms plan's F0 (00675): a key no longer stands for its site.

## Context

At `56b557b3f4` a request through a form made here showed in Forms, in the Inbox with AI's drafted reply, on Today and in
the results, while the same act through the business's own website form got a note on the person's page and a bell, and
nothing else: the open requests and the results joined each entry to its form version (`form_requests_open`,
`form_results`; 00680, 00691), and a website entry has none. Where the visitor came from was a second write after the
entry (`keepFormEntrySource`), lost where it failed. A site's own entry id was held unique across the workspace
(`form_entries_ref`, 00675), so two sites that both sent entry "123" lost the second as a repeat. And the keys lived in
Settings › Connections, apart from Forms, where Forms › Share told the owner something else.

## Decision

1. **A site, its keys and its forms are three records.** `form_sites` (a name, its host as its entries' pages name it,
   its first and last entry, its last test); every key names its site (`form_keys.site_id`), and a key changed keeps it.
   `outside_forms`: a form owned elsewhere (`website` now, Meta's later), one per site, kind and the site's own id for it
   (`ref`), with the name the site last sent and the owner's own, listed or hidden, and `requests_from`.
2. **An entry names a form made here or an outside form, never both** (`form_entries.outside_form_id`).
3. **One write.** `form_entry_take` finds the key's site (making one where a key has none), finds or makes the form,
   keeps the once rule within that form, and keeps the entry, its person, where they came from and its event together.
4. **Repeats per site and form.** A site's id is the same entry within its own form; the same id with other words is a
   new entry, logged (`form_entry_ref_clashed`), never merged. A hosted form keeps its own rule.
5. **A site's request is answered like any other** (call 3): from its form's `requests_from` it is an open request, read
   through one fixed description of what the website door takes (contracts `siteFormOf`, `SITE_FORM_FIELDS`): its notice
   opens it in the Inbox, AI drafts the reply, it counts in Needs you until answered, and its results count by its form.
   A sign-up stays as it was: a confirmation email first, never Needs you.
6. **The open count is counted whole** (`form_requests_open_count`): Needs you and Today add the requests past the 200 the
   list holds, and never draw them.
7. **Three optional lines a site may send** (call 5): `form_ref`, `form_name`, and `test`. A test keeps no person, owes
   nothing, names no form, writes no event, moves its site to "test received", and goes in 7 days.
8. **Forms holds every form** (call 2): the forms made here and each site's under their own heads, a hidden one folded
   away; a site's form opens on Form (what Chanlytics receives), Next (from what can go) and Site, at
   `campaigns/forms:site:<id>`. The website connection, each site with where it stands (waiting, test received,
   receiving, nothing lately), its keys and the forms found on it, opens at `campaigns/forms:website`; the empty page
   offers it as its second start. Settings › Connections keeps one line, "Website forms · In Campaigns › Forms".

9. **Ask hands a form to Forms on one card** (the plan's B4): asked for a form, AI proposes `form_draft` ("Draft it in
   Forms", `propose_form`, its guide the form skill's), carrying the owner's sentence alone. Its press is Forms' own
   (`POST forms`, act make, the same drafter), and opens Forms on the draft it made; AI writes none of the form in the
   conversation. Pressed twice (two tabs, or Try again after a press that timed out) it is one press: a card's write is
   kept under the card's own id, so the second is answered with the first's form and opens that draft. Where AI asked
   one question first, the receipt says it and nothing opens.

10. **A card's press waits as long as its slowest call** (found walking B4). A press goes from the tab to Ask's act
    door (`POST ask/act`), which calls the verb's route. At `56b557b3f4` the tab gave the door a write's 30 s, the door
    gave each call 50 s, and the door itself had 60 s: a call past 30 s left the tab to press the card itself while the
    door's call still ran, and be told the card is being approved already. A call now says its own wait
    (`ProposalCall.waitMs`; the drafter's is `FORM_PRESS_WAIT_MS`, 65 s, the one number Forms' own line also waits),
    held on both legs: the door gives the call that wait, the door's limit is the turn's 150 s (`app/api/v1/ask`; Vercel
    groups routes by their configuration, so the door is loaded in the function of the turn that just made the card,
    never one of its own left cold after each deploy), and the tab waits the door's limit and a little more
    (`ASK_ACT_WAIT_MS`, 155 s). A card whose calls are quick answers as quickly as before.

11. **What they asked is theirs to AI's reply** (the plan's B2, found writing its test). Inbox handed a request's note, which
    holds what the visitor typed, to the reply's drafter as "what the owner says it is about", unfenced, and the
    drafter's money check reads the owner's words as the prices it may write: a visitor who typed "$40, 50% off" into a
    form had given the reply a price. The draft now takes what they asked apart (`PersonDraftInput.asked`, at most
    `DRAFT_ASKED_MAX`), told to the model fenced as theirs (contracts `fenced("customer")`) and never among the owner's
    words the check reads; Inbox says the owner's part in its own words ("A reply to what they asked on the form", and
    what became of the time it asked for). A hosted form's request had the same gap; one change closes both.

12. **A sign-up's confirmed count.** Its Site part says how many signed up and how many confirmed from the email it
    sent them (`form_results`' `confirmed`: its person's yes to offers, source `confirmed_signup`, given after the
    sign-up came; a yes given another way, or before, is not its confirmation).

## Amended 28 November 2026 (00726; the whole-system plan's lane 3)

Three outside reviews of the model found it right and a handful of edges open. They are closed without a new record:

- **Point 4, repeats.** An entry whose id its form had with other words is still a new entry, said as a clash, never
  merged. It now keeps the id as sent in a column of its own (`form_entries.sent_ref`, not unique), and the same form,
  that id and the same words again are that entry with no time limit: its retry after ten minutes was a third entry.
- **The website door has a limit, and holds what passes it.** A key's entries in a minute and a site's in an hour are
  counted by the house's limiter (`take_rate`; `apps/edge/lib/website/form-limit.ts`). Past either, the entry is kept held
  for a look (`form_entry_take`'s `p_held_why`): who it is about as typed, no person, no event, nothing owed started,
  and the site answered ok. A member lets it through from its form's held pile (`form_entry_let_through`), and a
  member's "Not a real request" holds a site's request as it holds a hosted form's (`form_entry_hold`, which named
  hosted forms alone). Nothing is dropped and no visitor is refused. A test from the site is not counted.
- **Point 6, the open count.** The list still holds 200, and reads on from where it ended (`form_requests_open`'s
  `p_before`, `p_before_id`; `GET forms/requests/more`), so every request the count counts can be reached.
- **Where an entry stands is read, never kept** (`form_entries_standing`; `packages/contracts/src/forms/standing.ts`
  says each word): answered and how, sending (its only answer is a reply still waiting to go), open, or never answered past
  its sixty days. A form's own list, a site's and the request's page read it, where each called every entry outside
  the open list answered.

The plan called the record `form_sources` and the column `source_id`. An entry's `source` already means where the
visitor came from (the Ads tracking plan's T4), so one word would have meant two things: the record is `outside_forms`.

## Filling in the past

Every key gets a site (one per name a workspace's keys go by, the first key one of its own), every website entry its
form (one per site and kind), and every site its host and times, as plain SQL in the migration: no event, so no bell,
no draft, no second ask. Each form made so has `requests_from` at the switch, so no entry from before becomes a request.

## Not in this change

- **Meta's lead forms (F5)**: `outside_forms.kind` holds `website` alone until they come.

## Deploy order

The migration first, then the code; merged by hand. The code before it calls `form_entry_take`, `form_key_make` and
`form_key_change` as it did, and they answer as they did; its readers skip a request line with no version and a results
line with no form. Taking the code back leaves the migration harmless.

## Tests

The plan's section 5, for Lane B:

- **On a database** (`tests/forms/website/a-site-s-forms-are-forms.db.test.mjs`, CI's stack): each site and each of its
  forms keeps its own entry ids, a retry is a repeat after a key change too, other words are a clash, two posts at once
  with one id (the same words one entry, other words two), a key changed and ended leaving its site and forms, a form
  renamed on its site keeping its row, the source in the entry's own write, a test that tells nobody and moves its site
  to test received, a site's requests (a hidden form's too, a sign-up never, a reply failed then sent, a member's
  word), the open count past 200, results counted once, a sign-up's confirmed, the member's doors and a stranger
  reading nothing. `website-form-entry.db.test.mjs`'s once rule follows 00709. The tenancy suite seeds the two tables.
- **The past filled in firing nothing** cannot be replayed on CI's stack, which has no past: it is proved on
  PostgreSQL 18 (PGlite) against main's snapshot, the past written by main's own door before the file runs, with 61
  checks in all (`dev-tools/db-without-docker/example-doors-website-forms.mjs` in the workspace's tools). The file
  applies twice there, and its generated files are held to that engine.
- **In memory:** a site's request through Needs you, its Inbox page and its presses
  (`a-site-s-request-is-answered-like-any-other.test.mjs`); where a site stands and what it and its forms are called
  (`where-a-site-stands.test.mjs`); AI's card, pressed twice through the Forms route, one draft
  (`tests/forms/ask-hands-a-form-to-forms.test.mjs`); the reply's drafter with an answer that tries to instruct it
  (`tests/new-conversation/person-draft.test.mjs`); and the door, its keys and its fakes held to 00709
  (`website-form-door`, `website-form-keys`, `_form-entries.mjs`, `_form-requests.mjs`).
