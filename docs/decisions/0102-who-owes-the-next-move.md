# 0102 · A thread's word, its colour and its tab say who owes the next move

**Status:** Built on the lane `inbox/who-owes-the-next-move`, 6 November 2026. No migration.

## Context

A thread's pill ended in "anything else is Handled". Over 31 states run through the real view model (the Inbox review, 5
Nov 2026), 14 read a green Handled and four were true. The Handled tab held 24 of the 31, and eight of those needed the owner:
a customer left with no answer, a reply that never left. On production 20 of 21 threads read Handled, seven of them cold
emails nobody had answered. The head and the row each passed a tone by hand, so Needs you was coral on one and amber on the
other, and a failed send was red or amber depending on where it was read.

## Decision

**One rule answers it.** `threadMoveOf` (contracts `conversations/thread-move.ts`), first match wins: snoozed; set aside or
archived; they asked to stop; a reply of ours that never reached them; they wrote again while you held it; a teammate has
it; you have it; an open hold nobody has; a reply counting down; then who had the last word. Every thread gets a positive
reason for its word. The head, the row, the tabs, the counts, Conversations and Ask read it. Nothing new is stored.

**Four tabs.** Needs you is what is yours to do. Waiting is new: the next move is theirs or a teammate's, a follow-up list.
Handled was answered or closed, and is safe not to look at. Snoozed as it was. Set aside still shows only when it holds rows.
Archived leaves the lists; a search and a link still find it.

**The word Handled stays, and is earned.** Green only where something answered them.

**One colour per word.** The pill reads the tone map (`kind="thread"`, the move's key), and no pill passes a tone by hand:
Needs you amber, a countdown coral, a failure always red, Waiting blue.

**A move can end by the clock.** It says when and what it becomes, so a page needs no read to say a draft sent or a reply
never came: `threadMoveNow`. A reply being worked out lasts three minutes, the limit the sweep that finds an unfinished
message uses. Waiting and Unanswered go quiet after 30 days, People's own number, so one old thread never sits in a list
for good. An open hold does not: a person was asked for, and it stands until someone closes it.

**A call that connected after the last words is the last word.** Someone spoke to them since, so the thread reads Handled. A
missed call is not: what they wrote is still unanswered.

**Today's count reads it.** A thread the rule puts in Needs you with no hold open is a row of Need you, once. With no hold
to give back, Mark done archives it, as the thread's own No reply needed does.

## What it does not do

- **A campaign's send that fails is not in Needs you.** Its run reports it, and a thousand bounces would fill the list.
- **Booked and Hung up early are not words yet.** Neither is on the Inbox's read: an appointment and a call's ending each
  need a read beside the list. A booked thread reads Handled with its visit as the fact beside it, and a call reads Handled.
- **People's Needs you is unchanged.** It is SQL (`people_list`), and moving it takes a migration.

## What changes on the day it lands

Needs you and the badge rise, because they stop hiding things. A customer's last "Thanks!" with no reply and no call since reads
Unanswered until someone answers it or presses No reply needed. A reminder is an automated send, so a customer who was
reminded reads Campaign sent, in Waiting, until they write back or it goes quiet.
