# 0142 · The Inbox has three tabs, and what waits for an OK stands under its people

**Status:** Built on the lane `inbox/three-tabs`, 19 November 2026, waiting for Ruben's word to push. No migration, no
server change. Written against main at `fc514b370d`. Amends 0102 (its tabs, and where a campaign's send stands) and
0048 as amended 15 November (where Needs you draws what is no conversation).

## Context

Ruben, 19 November 2026, on a phone's Inbox: two reach-outs filled the first screen of Needs you before anyone waiting
was drawn, and the list had five tabs ("perhaps some logic is duplicate ... clean ux ui efficiency with space to not
clutter users with bunch of lines of text").

Measured in the demo workspace at 450px:

- A run's row in Needs you stood 123px and 141px tall beside a conversation's 65 to 84, and said its state three times
  ("Cold email · ready", "Waits for you to approve…", "Waiting for your approval") over a row of two verbs. The same
  two runs were said on Today and on Campaigns, and Campaigns said each in one line.
- Five tabs: Needs you, Waiting, Handled, Snoozed and Set aside. Snoozed held nothing, as on most days. Set aside held
  one, and its fifth tab ran a phone's strip into its search glyph. Four of Waiting's six rows were campaign sends
  nobody had answered, in "your follow-up list" for thirty days.

## Decision

**Three tabs, one question each.** Needs you is yours to do. Waiting is someone else's move, or a clock's. Handled is
nobody's. `ThreadList` (contracts `waits/thread-move.ts`) loses `snoozed`.

**Snoozed stands in Waiting.** It is not yours to do now and it comes back by itself, which is what Waiting holds. Its
row says until when, the clock before the hour ("until tomorrow 10:00 AM"), which reads whole under a tab named
Waiting, and a reader hears that it is snoozed. It stands last in Waiting: a member put it out of sight. Its state, its
pane, Snooze and Wake are as they were.

**Set aside is a fold at Handled's head.** What a reading set aside as not a customer's (0093) keeps its list in the rule
(`aside`) and is one quiet row over Handled's rows, in Today's words for it ("Set aside · 2 not customers'"), which
opens in place into its conversations, each still asked whether they are a customer. At the head, not the foot: Handled
is the long list, and a pitch that was a customer after all must be one press from the tab. A link to one opens under
Handled with the fold open.

**A campaign's send asks nothing of anyone here.** What a campaign, a sequence or a reminder sent
(`isAutomatedSend`) and nobody answered keeps its word ("Campaign sent", "No reply") and stands in Handled, where
nobody owes a move: its own report counts who answered, and an answer brings the thread back by itself. A person's own
first words to someone who has not answered still wait in Waiting.

**People first in Needs you.** The order is: whoever the one count holds that is no conversation here, the
conversations, what waits for an OK (the runs, a search's question), the line that says that is all of it, then the
fold of whoever has waited past a week. The count is unchanged (0048): every row under the tab is one it counts.

**A row that waits for an OK is a conversation's height.** The one builder (`surfaces/waits/wait-rows.tsx`) takes
`slim`: the name, one fact and one verb. The fact is contracts' (`todayRunWords(...).short`, `TO_SEND_ALL_WORDS.short`,
`WAIT_ROW_WORDS.*.short`), in the words Campaigns' list says it: "2 wait for your approval · 7 held", "14 emails for
you to send". Three or more are one line ("4 to approve") that opens in place into them. Today's rows are as they were.

**A tab kept from before lands on today's.** The Inbox's place may hold Snoozed or Set aside: they open Waiting and
Handled.

**"Older than a week", never "waiting over a week".** Whoever has waited past a week waits on the owner, so they stay
in Needs you, folded at its foot and in no count (0048). Their row said "37 waiting over a week" under a tab named
Waiting, which holds whoever the owner waits on: one word for two opposite things on one screen. The fold and Today's
group say "N older than a week" (contracts `NEED_YOU_WORDS`). The Pipeline's "N waiting over a week" is a proposal
waiting on its customer, and keeps its word.

**The Inbox's fold has Mark all done**, as Today's has (`list-folds.tsx` OlderAll, the same hand-back): its only press
was opening each of them. It asks first, in the row's own place (contracts `NEED_YOU_WORDS.oldDone.ask`): one press let
every one of them go, and a conversation nobody answered has no request to hand back, so Mark done archives it, which
Undo does not bring back. The question says how many of them that is. The Inbox's own Archive of several asks for the
same reason; one person's Mark done, named on its row, goes at the press. Today's Mark all done asks the same question (`today/need-you/older.tsx` OlderSummary, on his word the same day),
and its press again for the rest of a refusal goes at once.

**Mark done counts everyone it marked** (`hand-back.ts`): one archived was left out of the count, so thirty-seven
marked done would have said "23 marked done", and one such person alone said, in red, that they couldn't be marked
done, having just been.

**Waiting's rows say who has them and for how long.** The reason a thread was flagged stood as a third line under every
row of Waiting, the same words under each; it is said in the open thread, and where a search spans the lists. On a
phone who has a thread was held to 42% of its own box, which had already taken its room ("Dana Ortiz has it" read
"Dana …" beside a third of an empty line): it gives way before the customer's name does, and only once the line is
full. A snoozed row is one element, never the word in a pill beside its hour, which left a name 64px of a phone's line.
And a phone says each tab's figure, as a desk does: three tabs have
room for them at 320px, and Waiting's said none.

## What it does not do

- **Today and Campaigns keep their own rows.** A run's row on Today says its whole sentence, and Campaigns' list reads
  the sequence, not the run: the Inbox said "14 emails to send" where Campaigns said "17 emails for you to send" of the
  same reach-out, a run beside its sequence's every run. One reading for both is its own change.
- **The newest hundred are still the Inbox's read.** A send to several hundred people fills that read with Handled rows;
  what the tabs hold of it is right, and what the read holds is not this change's.
- **A teammate with no name is still named by their address** ("ana@example.com has it").
- **People's Needs you and Ask's `snoozed` filter read the state, as before.** Ask's `waiting` filter reads the list, so
  it now holds a snoozed conversation and no campaign's send.

## What changes on the day it lands

Waiting falls to what a person is in the middle of, plus what was snoozed. Handled rises by every campaign's send
nobody answered. A phone's strip is three words wide and never scrolls. Needs you opens on people.
