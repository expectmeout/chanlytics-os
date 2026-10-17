# 0060 · Everything that sends on its own is a sequence

**Status:** Approved by Ruben "as recommended" on 15 October 2026 (the Sequences canvas, D1 to D8). Built on the lanes
`sequences/one-model` (from main's `7c9fbc91a`), `sequences/the-rest` and `sequences/finish`, the last (#1644) retiring the
pages it replaced and the old names (00451, 00452); its steps and where each stands are in
`docs/plans/2026-10-15-sequences.md`. Where this note and the code disagree, the code wins.

## Context

A reminder before a visit, a win-back, the month's offer, a one-off for Halloween and emails to leads were five shapes
with five names (moment, playbook, broadcast, campaign, reach-out), two clocks, two send tables and a page for each part
(the Campaigns home, its drawers and sheets, Sent, the Library, a run's pane, the reach-out sheet, To send). The storage
already leaned one way: a reach-out was stored as a chain of playbooks (00183), and every send of every kind went out as
a `broadcasts` row. Production on 15 October 2026 held 7 moment playbooks in one workspace, 6 broadcasts (3 one-offs,
3 runs), 17 sends, 26 messages and no reach-out, mailbox or lead send.

## Decision

1. **The word is sequence (D1).** Anything that sends on its own is a sequence: it starts for someone, takes its steps,
   and stops. A step is one message (one per person, on WhatsApp, email or text) or a call or note for the team. A
   sequence starts at a moment of a customer's journey (before a visit, after one, a proposal out, gone quiet), when
   someone joins a list, when a lead joins a list, or on a date. The page keeps the name Campaigns, over three views:
   Sequences, Messages and Ads. "Never 'sequence' on a page" leaves the glossary; reach-out, playbook, broadcast, run,
   chain, nudge, Library and Sent leave the pages.
2. **One storage for every sequence (D2).** Six tables: `sequences` (what it is and how it starts), `sequence_steps`
   (each step in its place), `sequence_enrollments` (someone in a sequence, where they stand and why they left),
   `sequence_batches` (what goes at one time, the unit you approve), `sequence_sends` (one message to one person) and
   `sequence_replies` (what came back, read once). They replace `playbooks`, `broadcasts`, `broadcast_recipients`,
   `reach_out_sends` and `reach_out_replies`, which stay as views of the new tables while the code moves, and then go.
3. **Sent becomes History (D3).** A one-off is a sequence that starts on a date. A run is a day in its sequence's
   History, opened in place with its replies.
4. **The Library becomes Messages (D4).** A message opens in the step editor: its WhatsApp, email and text versions, the
   words with each person's own words as tokens, and a preview as one real person will get it.
5. **Three tabs for every sequence (D5):** Steps, People (Leads for a sequence to leads) and History.
6. **A customer's sequence may take more steps (D6):** a follow-up after a wait, with a condition ("no booking"),
   stopping on a reply or a booking, as a sequence to leads already does.
7. **The receptionist leaves the list (D7).** It answers; it does not send on its own. One line points to it.
8. **One notice at most on a sequence (D8).** Anything else that needs you is a count on its tab, and the same count
   the badge, Today and the list say.

## Shape

- **Storage (S1):** the six tables, each workspace's own (the house fence: `(tenant_id, x_id)` keys), row security as
  the floor (members read; doors write), a door per change that writes its event in the same transaction, and the old
  five names as views over the new tables so every function and caller keeps working while it moves. The 30 production
  rows are carried by the migration itself.
- **The loop (S2):** one loop at two speeds runs every sequence: enter, plan, ask, send, read, move on. The hourly moment
  sweep and the minute clock of a sequence to leads become its two cadences over the same tables.
- **Readers and verbs (S3):** `sequence_overview`, `sequence_record`, `sequence_people`, `sequence_history`, read by the
  page, the badge, Today, the Calendar, Reports and Ask; one verb spec per press, shared by the page and Ask.
- **The page (S4):** Campaigns › Sequences · Messages · Ads, the record's Steps, People and History, the step editor,
  New with Ask, the phone, drawn with the kit's parts. A customer's step's Send me a test mails its message, filled for
  an example person, to the member who pressed it at their own sign-in address and to nobody else: member mail through
  the edge (`api/admin/email/test-to-self`), never the customer's send door (Ruben, 15 Oct 2026).
- **Every page's door (S5)** and **retiring what the page replaced (S6)**, the old tables last, after the deploy.
- **One way to make one** (the closed-loop audit of 17 Oct 2026, G): Campaigns' composer kept a second way to make a
  moment's sequence, its "Every time a moment comes", until it went. New sequence takes the moment a door asks for
  (`campaigns/sequences/new:moment:<trigger>`, the owner's line for it written in), the composer's old addresses land on
  New or on the sequence (contracts `sequenceLandingOf`), and the composer is Send once and Write to leads.
