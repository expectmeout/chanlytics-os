# 0136 · A call that asks for nothing holds nobody

**Status:** Decided by Ruben, 17 November 2026 ("All approved as you suggest best end to end do all in one pr and merge
main", on the analysis of the same day). Built in one pull request: the eight rules under Decision. What is not built
is listed apart, each with why; [0138](0138-a-caller-said-no-customer-is-turned-away.md) builds four of the five.
Written against main at `c3bd898`. It amends [0048](0048-one-list-of-what-needs-you.md) (who folds past a week, and how
one of them is drawn in the Inbox) and [0093](0093-a-reply-is-drafted-once-by-the-receptionist-when-it-is-owed.md) (a
call back is set aside as an email is, and Not a customer is said of a thread still held).

## Context

On 17 November 2026 the Inbox's Needs you, on a phone, said "Nobody's waiting on you" over a row that said "1 waiting
over a week", a toll-free number. The call was a telemarketer's.

**The two sentences.** Whoever has waited past a week is in no count and folds at the list's foot (0048, amended 15 Nov
2026; `apps/dashboard/src/surfaces/inbox/pages/needs-you-list.ts`). The empty card read the list without the fold
(`inbox/pages/list-empty.tsx`), so each sentence was true of its own rows and the two could not both be read as true.
Today drew the same people better: one person is their own row, with "toll-free" beside a toll-free number and Mark
done (`today/need-you/older.tsx`); the Inbox drew a fold of one.

**How a call comes to ask for a person.** Two roads open the thread's `callback` hold
(`apps/edge/lib/voice/call-event.ts` `planCallEvent`): the call's analysis says `callback_needed`; and, since the
closed-loop audit of 17 October 2026, any inbound call that never connected or was left without a word
(`owedACallBack`, contracts `unansweredCallTodo`). The second is how a dialler behaves, which hangs up when a machine
answers. It says nothing, so nothing can read it, and the one read there is (`CALL_SELLING_RULES`, asked of a call
back by the `reply_draft` job) says no when unsure. Where that read did say "selling", the row only wore a note: an
email read as a pitch is set aside (0093, rule 6), a call was not. A call the carrier itself flagged as spam kept its
notice back (`isMissedCall`) and still asked for the call back.

**What the receptionist was told.** Nothing about someone selling to the business, or a recording
(`packages/contracts/src/config/workspace-config/compose.ts`). It took a telemarketer's message and said the team
would follow up, as it does for a customer, and the analysis then asked for the call back.

**What the owner could say.** "Not a customer" exists only on a thread already set aside
(`conversation_not_a_customer`, 00539). On a call back still in Needs you the only word was Mark done, which says
nothing about the next call from the same number.

## Decision

1. **Three things say a call asks nobody for a call back**, in the order a word outranks a guess (contracts
   `voice/call-back-owed.ts` `callBackNotOwed`):
   - the workspace's own word: a member said the caller's thread is not a customer's. Either road, spoken or silent,
     and the owner is told nothing of the call;
   - the carrier's: it flagged the call as spam, and it never connected;
   - silence from a toll-free number the business does not talk with. A toll-free caller who speaks is read as any
     caller is (a bank, a pharmacy and a supplier ring from one); so is anyone the business talks with; and so is a
     caller whose record could not be read, since a customer's call is never dropped by a read that did not answer.
     A toll-free dial that never connected tells nobody: its notice would say "Call them back".
2. **The business talks with someone** when words went between them (anything it sent, anything they wrote; a call's
   own note is neither), when it phoned them, or when the owner brought them in or named them (contracts
   `callerStandingOf` over db `voice/caller.ts` `findCallerFacts`). Having rung is not talking.
3. **The thread remembers the owner's word.** A caller always lands on the one thread their person has
   (`conversations_tenant_id_contact_id_key`), and a call never reopens it. A thread a member said is not a customer's
   is set aside with its day gone (`set_aside_why` kept, `set_aside_at` null: what 00539's door leaves), and that is
   the word a later call reads. No table of numbers is kept, and no migration is needed.
4. **A call back read as someone selling is set aside**, as an email's pitch is: kept as what it is, then
   `conversation_set_aside` (core `writeReplyDraft`, kind `brief`). Never someone the business talks with, one a member
   answered anyway (the thread's newest `reply_anyway` decision), or one who could not be read: there the note says
   what they sell and the call back stays. The read's rules now name a recorded or automated message that sells, and
   their edition moves to 6, so every call back waiting is read again by the drafts sweep.
5. **Not a customer is said of a thread that still asks for you** (the thread's More, where it is no email's): set
   aside first, by the platform's door, then the member's word (core `markNotACustomer`). Its Undo is Reply anyway.
   A thread so said keeps a dock that says it was said, with Reply anyway beside it: once its toast had gone it had no
   way back. Reply anyway on such a thread undoes the word and answers it in one press (core `replyAnyway`).
6. **A silent call's hold lets itself go after a week**, where the business does not talk with the caller and no
   member said they are a person: resolved by the platform, no member named, as a thread set aside resolves its own
   (edge `receptionist/quiet-call-backs.ts`, from the deadman tick, once an hour). A week is counted from the last
   thing that happened to the hold, so a caller who rang again yesterday is held. A call back someone asked for in
   words is never let go.
7. **On a call, the receptionist is told** what someone selling to the business is, to take no message for them and
   promise no call back, and to end the call; that a recording is ended; and that anyone it is unsure of is a customer
   (`SELLING_CALL_RULE`, a standing rule, so a hand-written prompt carries it too). It reaches every call on deploy:
   the prompt is composed as a call starts, not kept at the provider.
8. **The Inbox draws who waited past a week as Today does.** One person is their own row, with "toll-free" and Mark
   done; several fold as before. With nobody else in Needs you the card says "Nothing needs you" and that the older
   ones may need nothing.

## What is not built

Four of these five are built since, by [0138](0138-a-caller-said-no-customer-is-turned-away.md), the same day: the
figure on Reports (from the ledger, with no migration), the marked caller refused, texts, and the carrier's
verification. The first is not, and 0138 says why.

- **A caller's kind in the call's own analysis** (a field the provider fills, for every call). The analysis fields are
  kept on each agent at the provider; a new one reaches a live agent only through `voice-converge.mjs`, run by hand
  with the edge's secret, and every line pages `voice_drift` each morning until it is. The read of step 4 needs
  neither and re-reads the calls already waiting.
- **A figure on Reports** ("sales calls screened"). Every call figure there is counted in SQL
  (`report_series`, `receptionist_series`), so it is a migration, and it wants the field above to count more than call
  backs.
- **A marked caller refused before the receptionist answers** (the provider's inbound webhook can decline a call).
  Unread at the source: the provider's documentation could not be opened when this was written.
- **Texts.** A member's word about a thread changes what its person's calls ask. A text from them reopens the thread
  and is answered as before: silence toward someone wrongly marked is a worse failure than an answer to a pitch.
- **The carrier's verification of the number** (STIR/SHAKEN, as a header on the trunk). Not confirmed to reach the
  webhook; to be logged for a week before anything reads it.

## Deploy order

Either. The edge alone decides what a call opens; the dashboard alone draws the list and takes the word. A dashboard
from before reads a thread set aside by a call as any thread set aside; an edge from before opens the holds it always
did, and the next pass lets the quiet ones go.

## Tests

- `tests/voice/provider/a-call-that-asks-for-nothing-holds-nobody.test.mjs`: the rule, the plan, and the real door over
  a database in memory.
- `tests/cron/a-call-back-nobody-asked-for-lets-itself-go.test.mjs`: the hourly pass.
- `tests/conversations/reply-draft-verbs.test.mjs`: a selling call set aside, and the two words on a held thread.
- `tests/conversations/inbox/inbox-status.test.mjs`, `inbox-counts.test.mjs`: the menu's word, the dock, the row.
- `tests/receptionist/prompt/prompt-sections.test.mjs`: the rule's words on a call, and none in a chat.
- `tests/voice/provider/call-backs-measure.test.mjs`: the count of `tooling/scripts/ops/voice/call-backs-measure.mjs`.

## Risks

- **A customer taken for a salesperson.** The read says no when unsure, the receptionist treats anyone it is unsure of
  as a customer, nobody the business talks with is ever set aside, and a thread set aside is on Today's Set aside line
  with Reply anyway. The cost of the other mistake is a row.
- **A toll-free caller worth ringing back who said nothing.** Their call is on Conversations and in their thread, with
  no row asking. `call-backs-measure.mjs` counts how many such holds a person closed in the last ninety days: a high
  share there says the rule hides calls worth making.
- **The first pass.** Every silent call's hold older than a week, from nobody the business talks with, is let go within
  hours of the deploy, twenty-five of each kind a pass. That is the rule applied to what stood, and it is logged hold by
  hold (`call_back_let_go`).

## Open questions

- Whether the week should be shorter for a toll-free number that connected and said nothing.
- Whether a thread a member said is not a customer's should also keep its person out of People, as an email's does.
