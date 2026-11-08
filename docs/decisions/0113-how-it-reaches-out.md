# 0113 · How it reaches out

**Status:** Accepted by Ruben, 7 November 2026 (the canvas _How it reaches out_, Version 3, reviewed against main; "Plan the build"; "Start
the build"). Built in lane `cm-reaches-out` on `reach-out/how-it-reaches-out`, not landed. No migration: the section is a key of the workspace's
config, and every count is read.

## Context

Settings had _How it answers_ for the receptionist answering people who write in, and nothing for the cold email it writes to businesses a search
found. That email is written by three writers, and what an owner could change of it was spread over five places, one of them no page at all:

- **The step's words**, written once by Ask in New (`drafts/sequence.ts`), from the owner's goal, what the business does
  (`business_records.about`, 00152, which no page lets an owner change), its services, the receptionist's tone, Ask's memory (the lines learned
  from an email the owner pasted, decision 0078) and the first emails the owner started before.
- **The line about each business**, written as its email comes due by the check at the edge (`campaigns/reach-out/opening.ts`), from the
  business's record and the owner's name, what they do and their tone, then read back by a second reader that holds every claim to the record.
- **An answer to a reply**, the receptionist's (`drafts/writer.ts`), gated by Autonomy › Replies, signed as the sequence signs.

What a reply sets off is one table in code (`replies/reading.ts readingPlan`): a sequence stops on any reply; interested and a question draft an
answer; not now drafts a thanks and puts a step on Today; no suppresses the address and the company; wrong person and away put a step on Today.
The name a sequence signs with was typed on each one. And a number about the owner's business Ask wrote had nothing to hold it to.

## Decision

1. **One page, under Receptionist, beside How it answers:** `admin/outreach`, a fourth part of the business's record, so each row is a fold of the
   one record saved through Settings' one saver. Its cards: What you offer, Proof you stand behind, How it writes, Sign-off, Where it sends from,
   When a lead writes back, Rules it always keeps, What it's told, Try it on a lead.
2. **One section of the config, `reach_out`** (never `outreach`, Autonomy's policy class): offer, who it's for, what it fixes, proof (up to five
   claims), a cold email's tone, the name it signs with, a signature, a phone, and what an answer to a lead offers.
3. **Each writer reads it, and falls back to what it read before.** The drafter is told the offer in the goal's place, who, what it fixes and the
   claims as data; the opening writer the offer, else what the business does; both the cold tone, else the receptionist's; the reply drafter what
   an answer offers, as a member's steer. Sign-off's signature and phone go under the name of every email Chanlytics
   sends, through the one ending rule (`coldEndingOf`): a mailbox's own signature stands in its place where a sequence
   signs with the mailbox, and an email the owner sends from their own mail app carries none, since that app adds theirs.
   A workspace that never opens the page is written for as before.
4. **A number Ask writes about the owner's business stands only in a claim** (or the business's name), word for word. The words the owner types
   are theirs and never judged: a step Ask drafts with an unbacked number is left for the owner to write, as a price is; a rewrite keeps the
   numbers the owner's email already said; the lead peek's draft asks once more, then refuses in words. A time claims nothing.
5. **What a reply sets off stays code's.** The page says each reading's effect, locked; only what the drafted answer offers is the owner's:
   the booking link (as before), a call, or the answer alone.
6. **What it's told is cut from the prompts the writers are given**, never written beside them: the drafter's prompt is now built from its parts
   (`draftAskedParts`), the opening's is read off its own lines' labels, and an answer's, which differ every reply, carry no share.
7. **Try it** goes through the preview door (`POST reach-outs/preview`), the check's own writer and reader: nothing stored, nothing sent.
8. **Ask changes a row by a card**, through propose_settings' answers action, each op's own field (`offer`, `who_for`, `fixes`, `claim`,
   `tone`, `name`, `signature`), judged by `AskSettingsChangeSchema` as How it answers' rows are. Its jump is _Reaching out_ (a jump is three
   words at most), found by the page's own name too. (Amended 8 November 2026: as built, the row's words rode as `text`, since an action
   of its own put the owner's tools at `ASK_TOOLS_CHARS_CEILING`, 129,976 of 130,000 characters; the tools' words were then tightened to
   120,691 with the fields in, and each op took its own.)

## Calls made, and how to undo them

- Under Receptionist, beside How it answers. Undo: a group of its own, Outreach (one line in `settings/frame/tabs.ts`).
- Replies to leads stay drafts: nothing on this page sends on its own. Only Autonomy › Replies' quiet mode stops a draft (`mayDraftReply`),
  and the rows say so themselves, since a phone hides a filled row's hint.
- The offer nudge is the page's own line, shown only where cold emails would have nothing to say of the offer; never the receptionist's gap
  line or the rail, where a business that sends no cold email would be asked on every page.
- Their preview (decision 0079) stays the only Chanlytics-only row, on New, not here.

## Steps

1. The section, its limits and the page's words (contracts).
2. The numbers rule (`campaigns/sequences/numbers.ts`, the one tree that uses it).
3. The page's read (`GET settings/reach-out`); the month's first emails counted by the service role, whose function it is.
4. The page.
5. The three writers.
6. What it's told (`GET settings/reach-out/told`).
7. Try it.
8. Ask's rows and its card.

Each step is shippable in either deploy order: an older edge leaves the section out, and an older dashboard never writes it.
