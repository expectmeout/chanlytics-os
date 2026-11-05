# 0093 · A reply is drafted once, by the receptionist, when it is owed

**Status:** Built on the lane `cm-reply-drafts` (`inbox/one-reply-draft`) from main's `ba52601b4c`, 4 November 2026, on
Ruben's word ("Approve, start P0", then "continue the PRD v2 end to end"), from the PRD
`Claude Video/docs/2026-11-04-reply-drafts-prd.md`. Migrations 00538 and 00539 (working numbers until the push claims them).
Not on main yet. It amends 0071 E2 (Today drafts the rows it draws) and 0017 (a sequence reply's draft is kept on its reading).

Written against commit `ba52601b4c`.

## Context

Three writers answered one question, "what should we reply?": the receptionist's live reply, Ask's draft for a held thread,
and a sequence reply's draft. A draft existed only if Today drew its row for a member who acts, so an owner who worked from
the Inbox had none. A change of the rules hid every kept draft until someone opened Today. Pages said a reply was drafted when
none was. The same draft had two names. A sales pitch sat in Needs you for days, and saying so led to a typed-name delete.

The receptionist's brain already wrote for the owner, in its draft audience (sequence replies). It knew the workspace's facts,
hours, policy and the thread, which the dashboard's Sonnet draft did not.

## Decision

1. **One writer.** Every reply a person may send is the receptionist's brain in its draft voice
   (`apps/edge/lib/drafts/draft-writer.ts`). What differs is the audience: the customer, or the person who sends it. The
   dashboard's person draft keeps only the owner's first word to someone and the brief they plan themselves.
2. **Draft when owed.** The hold's own events ask (`escalation.opened`, `.changed`, and `.refreshed`, new in 00538, since a
   subscriber on every message would cost a delivery and a job for six months of imports): the subscriber asks one question
   (contracts `replyDraftOwed`), the row says it is being written (`conversation_draft_claim`, the once-only), and a
   `reply_draft` job writes it. A sweep every five minutes catches a dropped event, a run that died and a change of the rules.
3. **One store, one state, one name.** `conversation_drafts` says where a draft stands (`writing`, `ready`, `pitch`, `asks`,
   `failed`) and is told on the live feed, so a page hears it land. Every page reads one answer of it (contracts `draftViewOf`).
   Words you send are Ask's draft; only words that send themselves are the receptionist's.
4. **The box is yours.** A draft enters it only on a press of Use draft, with an Undo. Hand back is a small quiet act in the
   same row over the box.
5. **One judge.** Whether a sender is a customer is the sender's reader (decision 0080), on both roads and at draft time where
   no reading exists, in the order a word outranks a reading: what the workspace said, whether the business talks with them,
   what they were read to be, a reading now. The brain never judges a pitch.
6. **Set aside, not held.** A thread read as a pitch or a program's mail has its hold resolved and is archived and said so
   (`conversations.set_aside_at`, 00539), since `deadman_candidates` warns of every open hold and the badge counts it. Not a
   customer says the address is automated, with an Undo. Reply anyway says it is a person and re-opens the hold.
7. **Checked in code before it is kept.** A price and money (as the receptionist's own), and a promise of our own follow-up by a
   time, which is asked for once more. The subject of an email and what Why this? says are said by code, never by the model.
8. **Its own spend, with headroom.** Every call is `reply_draft` on the usage ledger. A draft nobody is waiting on stops at 85% of
   the day's tokens, so live replies keep the rest. Only a reach-out asks the reply policy: a mode of ask or never on a held
   thread is exactly when the owner answers themself.
9. **Learning.** A reply says what it did with the draft that stood (`messages.meta.draft`: as written, edited, not used), and
   Health says the number.

## What is not built

The push's first line (the PRD's D6, off by default, a member's switch): the phone app is paused, so nothing would carry it.

## Deploy order

Each migration before the code that reads it. A dashboard from before reads the rows it always read, an edge from before keeps
the new subscriber's deliveries until one that knows it comes, and the DTO's new fields are optional both ways.
