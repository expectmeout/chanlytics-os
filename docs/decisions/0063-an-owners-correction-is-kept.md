# 0063 · An owner's correction is kept

**Status:** Decided 16 October 2026, and built on the lane `learning/an-owners-correction-is-kept` from main's
`6bafb6dc3`, as migration 00448, merged in #1639 the same day. This is the AI-native plan's item 3, the learning loop: "an owner's edit becomes a
suggested fact to Keep, as notes do; the edit rate per class beside the autonomy matrix". Ruben approved the plan on 9
October 2026 and picked the next lane on 16 October ("continue as you suggest"). The number is the next free one after 0062. Where this note and the code disagree, the code wins. The status was read again at `e9d6325f0` (26 October 2026).

## Context

When the receptionist gets something wrong, the owner fixes it in one of two ways, and the receptionist learns from
neither:

- **They rewrite a held draft** (steer: "tell her we're closed on Mondays now"). The rewrite goes out, and the
  instruction is kept on the new draft (`meta.steer`), but nothing reads it again. The next customer who asks about
  Monday gets the same wrong answer.
- **They answer a thread the receptionist handed to them**, because it did not know (`human_token`), because a booking
  or a question is set to Ask me first (`policy_ask`), or because a picked time needs a reply (`booking_reply`). The
  owner's answer is the fact the receptionist lacked. Nothing turns it into a note.

And nothing tells the owner how often they change what it writes. The Autonomy pane asks them to choose between Holds it
and Sends it with no evidence either way. Reports › Receptionist counts the held drafts by what became of them
(`receptionist_series`'s `hold`, 00380), but for the whole workspace and only on that page.

What exists already makes this cheap:

- The receptionist suggests a note on a **person** after a call or a quiet thread (decision 0007, phase 2): a cheap
  model reads once, code checks the answer, and the note waits for Keep or Dismiss (`note-suggest.ts`, 00159).
- A **business** note is `brain.profile.notes`: a title, a text and an optional last day, which the receptionist is told
  (compose.ts) and which Ask's cards already add (`add_note`, `ask-settings-change.ts`).
- Every held draft carries the intent the model stamped (`BrainMeta.intent`), and the intent names its Autonomy row
  (`policyClassOfIntent`).

## Decision

1. **How often you change what it writes, on the Autonomy pane.** Under the rows a held draft can belong to (Replies,
   Bookings, Questions), one line: the drafts held for the owner in the last 30 days, and how many went as written,
   were rewritten, were stopped, or were overtaken by the owner's own reply. A draft's row is its intent's
   (`policyClassOfIntent`), else Replies. The read is `held_drafts_by_intent(p_tenant_id, p_days)`, under the caller's RLS,
   counting the drafts the way `receptionist_series` counts its `hold` (one outcome per draft, by its status and its
   error: `held_draft_outcome`, which restates 00380's rule and is held to it by a test). The pane says nothing on a row with no held
   drafts, and draws no advice: the numbers are the evidence, and the choice stays the owner's.

2. **A correction is looked at once.** Two kinds of correction:
   - `steer`: a draft rewritten to the owner's instruction (the new row, `meta.source = 'steered'`); the owner's words
     are the instruction.
   - `reply`: the owner's own first text in a thread after the receptionist handed it to them for `human_token`,
     `policy_ask` or `booking_reply`, while that hold was open; the owner's words are the reply. A reply from the
     WhatsApp Business app on the owner's phone (an echo) counts too.

   Each is handed to the sweep once (a row in `fact_suggestions`, keyed by the correction's message), within three days.
   The sweep is the note sweep's (every thirty minutes, `trigger_notes_sweep`): no new clock.

3. **Three gates, as a person's note has.**
   - **Before the model:** the owner wrote at least four words, the workspace has had fewer than five suggestions in a
     day, and its notes are not full (ten, the profile's limit).
   - **The model** (the smallest, under the note sweep's purpose `note_suggest`): given the customer's message, what the
     receptionist said, the owner's words and what the business's notes and services already say, all as data, it
     answers whether the owner stated ONE lasting fact about the business the receptionist should know next time (hours
     and days, what is and is not offered, how booking works, where and how to arrive, what to bring, a policy that is
     not money), as a note: a title and one sentence, and the owner's own words that say it.
   - **After the model, in code:** the quote is the owner's own words; the note names no money (a price is the
     services list's to hold, and a note's figure would become a price the receptionist may say: `priceAllowance`),
     no link, email or phone number, and nothing the notes or the services already say; title and text fit.

   What passes is a suggestion. Nothing the receptionist reads changes until a member keeps it.

4. **Keep or Dismiss, on the Autonomy pane, and told on the bell.** Under the matrix, "Learned from your corrections"
   lists the suggestions waiting, newest first: the note as it would be kept, and what the owner wrote, with **Keep as a
   note** and **Dismiss**. Each suggestion is a line on the bell (a new kind, `note_to_keep`, a line and no more: no
   mail, no phone), which opens the pane. Keeping is a change to the settings, so the presses are the settings' role
   (owner and partner); anyone else is told so by the button, as every gated press is.
   - **Keep** adds the note through the settings write (the same schema, the version check, the settings history and
     the `settings.changed` event as a save on the page), then marks the suggestion kept with the version it wrote.
     Settings that moved since they were read are read again, never overwritten. A note the notes already say is
     marked kept without a second copy, and notes that are full (ten) are said so, nothing written.
   - **Dismiss** marks it dismissed. Neither sends anything to anyone.

5. **What it does not do.** It never changes what the receptionist reads on its own, never keeps a price, never learns
   from a single customer's details (the prompt says a fact about the business, and the person's own notes are 0007's),
   and never reads a draft the owner stopped without saying why. A person's reply that overtook a held draft is counted
   on the pane but not looked at for a fact in this step.

## Consequences

- One table, `fact_suggestions`: a row per correction looked at, `nothing` for most, `suggested` while it waits, then
  `kept` or `dismissed`, with who and when. RLS: members read their workspace's; the doors write.
- Doors: `fact_candidates` (the sweep's batch, service role, stamping what it hands over), `fact_suggest` (service
  role), `fact_suggestion_answer` (a member's, the caller as `auth.uid()`), and the read `held_drafts_by_intent`.
- Events: `settings.fact_suggested`, `settings.fact_kept` and `settings.fact_dismissed`, never the words.
- A bell kind, `note_to_keep`, written by `fact_suggest` for the workspace, read once the suggestion is answered.
- The note sweep's run reads facts after the people's notes; `NOTE_SUGGESTIONS=off` stops both.

## Owed

- An eval of the fact model on real corrections, once a month of them is kept (the eval key).
- A fact from a person's reply that overtook a held draft, and the same look for the phone (a whisper mid-call).
- Advice on the Autonomy pane ("ready to send right away?") once the numbers have been read against real workspaces.
