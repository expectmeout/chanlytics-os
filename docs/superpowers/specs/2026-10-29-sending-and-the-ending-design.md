# Sending and the ending: which mailboxes, how often, how a cold email ends

**Asked by Ruben, 29 October 2026:** after a walk of cold email on his own workspace, the canvas "Cold email to leads,
redesigned" (https://claude.ai/artifact/JxWrCDtDgaSmzj96uMqVBt, board D) and its check against the code (Claude Doc
https://claude.ai/artifact/Ms47BSybUc5mhMsrkCiWr7), he approved D1 to D12, then "Write the spec and plan for lane 3
(sending and the ending), no building yet". This is lane 3. Written against main's `b2ce4d6d4` (#1915).

**Status:** written, not built (decision 0077). Nothing here is committed.

## Why

Read on production on 29 Oct, a workspace's first sequence to leads waits for its first OK. Its batch goes one every
12 minutes, from both of the workspace's mailboxes, and every email ends with its mailbox's Gmail signature, which no
preview and no test shows:

- From the first mailbox, on the business's own domain, the email ends with the owner's Gmail signature: their name, the
  business's web address and its street, then the foot names the same street again. That is a link in a first email,
  which the cold rules forbid in the words (contracts `reachOutRules`) and never read in the signature.
- The second mailbox is on another business's domain, with SPF and DKIM missing (1 of 3 records found), so the pitch is
  signed as that other business, its lines run together.
- How it runs offers "Your inbox · you send" or "Your 2 mailboxes": no way to leave the second one out, though the chain
  has held `mailbox_ids` since 00424.
- "A day, at most" offers "10 · one every 5 min or so"; the sequence's saved spacing, 12 minutes (New's create door,
  00465), matches no choice, while the contracts' first pace is 20 (`REACH_OUT_GAP_FIRST`).
- "Before each batch" offers "Hold it 30 minutes" or "Ask me", but every batch of first emails of a sequence fed by a
  list waits for an OK whatever it says (core `run-reach-out.ts` line 45), and every sequence New makes is fed by a list.

## Decisions (approved 29 Oct)

- **D4.** Mailboxes are a pick per sequence. A new sequence ticks the connected mailboxes whose SPF and DKIM are not
  missing; a mailbox with either missing starts unticked, with its line and Set up DNS beside it, and may be ticked
  anyway. A default, never a gate.
- **D7.** One first pace, 20 minutes, in the create door and the contracts. The day's choices keep the slowest spacing
  for each count, and the saved spacing always has its own choice.
- **D10.** A sequence to leads ends with its Signed line ("Ruben"), added under the words by the send. A mailbox's own
  signature only when the sequence chooses it, and then not on a first email when that signature carries a link. The
  preview and the test show the ending the send makes.
- **D11.** How it runs says "Every batch of first emails waits for your OK" as a fact. Its choice is for follow-ups: "Your
  OK first, then 30 minutes to stop" or "Each waits for your OK".

## What changes, part by part

### 1. The database (one migration, the next free number when the lane pushes: 00492, since main took 00491 in #1918)

1. `sequence_steps.signs_with text not null default 'name'`, `check (signs_with in ('name', 'mailbox'))`, read on a
   sequence's first step (its root), as `signed_by`, `owner_sends` and `include_unconfirmed` are. Every existing sequence
   takes `name`: its emails end with its Signed line from the deploy on. Members get no column grant: the save door
   writes it.
2. `reach_out_save` re-created as 00472 wrote it, plus `v_signs := case p_chain->>'signs_with' when 'mailbox' then
   'mailbox' when 'name' then 'name' end` (null when the body names neither): the root's insert writes
   `coalesce(v_signs, 'name')`, its update `coalesce(v_signs, signs_with)`, and a later step always `name`. A body
   without the key keeps what is stored, so a client from before the deploy cannot unset a choice it never showed.
3. `sequence_create_leads` re-created as 00465 wrote it, with two changes in its chain for a new sequence:
   `gap_minutes` 20 (was 12); `mailbox_ids` = the connected mailboxes whose `dns->>'spf'` and `dns->>'dkim'` are not
   `missing`, oldest first, and, where none is, every connected one (so DNS never turns a sequence into "you send each").
   `owner_sends` keeps its rule: no mailbox connected, or New said so.
4. Its comments say what each column and door does now; its grants stay as they were.

### 2. Contracts

1. `ReachOutChainSchema` gains `signs_with: z.enum(REACH_OUT_SIGNS_WITH).optional()`, optional so that a body
   without it keeps the stored choice (above); `ReachOutDraft` and `reachOutDraftOf` carry it (`name` for a chain that
   says none); `reachOutChainBodyOf` sends it.
2. `ReachOutChainDto` gains `signs_with` and `mailbox_choices: ReachOutMailboxChoice[]`: every mailbox of the workspace
   but removed ones, oldest first, each `{ id, address, state, sends_now, picked, dns: { spf, dkim, dmarc }, facts,
   signature: { words, has_link } | null, connected_at }`, where `facts` is the `ReachOutMailboxFacts` the pace reads
   (`sent_days`, `daily_cap`, `customer_domain`). `picked` is `reachOutWritesFrom(m, mailbox_ids)`, so a sequence that
   names none (an old one) shows every mailbox ticked. `mailboxes` (the ones its run writes from, for the pace) stays
   as it is.
3. `coldEndingOf({ signsWith, signedBy, signature, first, body }): { signOff: string | null; signature: string | null }`,
   the one rule the send, the owner's draft, the preview and the test take:
   - the mailbox's signature when `signsWith` is `mailbox`, it has words, and it has no link on a first email
     (`linkCount`, the words' own rule);
   - else the Signed line, unless the body's sign-off (its last few short lines) names `{{your name}}` already, or
     the Signed line is empty.
4. `leadPaceChoicesOf(mailboxes, saved)`: for each day count the slowest spacing that reaches it, largest count first;
   the saved spacing as its own choice where it is none of them. `REACH_OUT_GAP_FIRST` stays 20 and New reads it.
5. Words, in `LEAD_BUILD_WORDS.runs`: `firstEmails` "Every batch of first emails waits for your OK"; `followUps`
   "Follow-ups" with `followUpModes` `{ veto: "Your OK first, then 30 minutes to stop", ask: "Each waits for your OK" }`;
   the mailbox rows (`pickedNone` "One has to send, or choose You send each yourself", `everyMailbox` "Every mailbox,
   and any you connect later", `dnsMissing`, `setUpDns` "Set up DNS", `newMailbox`, `notSending` by state); the ending
   (`endsWith` "Ends with", `signOff(name)`, `mailboxSignature(address)`, `signatureHasLink(address)` "Its signature has
   a link, so first emails from it end with your name", `noName` "Write the name it ends with").
6. `leadStepTestMail` takes `ending: string | null` and puts it between the words and the foot.

### 3. The edge

1. `packages/db` `sendStanding` reads the root's `signs_with`.
2. `reach-out/request.ts`: `RequestInput` and `DraftInput` gain `signsWith`; `reachOutRequest` takes the body and the
   signature from `coldEndingOf` (the sign-off is the body's last line, the signature goes where it goes now);
   `reachOutDraft` adds the sign-off only (the owner's mail app adds their own signature).
3. `reach-out/preview.ts`: the preview writes from the first mailbox the chain would write from, with its signature,
   not the stand-in; with none, the stand-in and no signature. `preview-run.ts`'s body gains `signs_with` and
   `mailbox_id` (checked as the others are). The email it returns ends as a send would.

### 4. Channels

`mailbox-signature.ts` `gmailSignatureWords`: table cells and inline blocks keep their own lines, so a signature built
from a table or from spans reads line by line. Learned from the stored HTML of a real signature (read, never committed);
the test's fixture is synthetic, of the same shape.

### 5. The dashboard

1. `server/campaigns/reach-outs.ts` `chainsOf`: `signs_with` and `mailbox_choices` from the rows it reads already
   (`mailboxConnectionsOf`, with the signature's words from channels `mailboxSignatureOf`).
2. `server/sequences/test-mail.ts`: the ending from `coldEndingOf`, with the first picked mailbox's signature.
3. The record's preview request sends `signs_with` and the first picked mailbox.
4. `surfaces/campaigns/sequences/leads/runs-sheet.tsx`, Sending, top to bottom:
   - Sends from: "Your mailboxes send them" or "You send each yourself" (as now).
   - The mailbox rows, under the first (contracts `leadMailboxRowsOf`): a tick each (the kit's Switch), its address,
     "New" first on one connected after the sequence was made, its day ("10 a day, rising to 40"; one word "new" on a
     row at most), why it does not send now ("Done for today", "Paused"), its DNS line where a record is missing with
     Set up DNS (to Settings › Connections; no address opens one mailbox's DNS sheet yet). The last tick cannot be taken
     off (its row says `keepOne`), and a tick names its own list from then on (`leadMailboxesTicked`). A sequence that
     names no mailbox says `everyMailbox` under Sends from until a tick changes.
   - A day, at most: `leadPaceChoicesOf` over the ticked mailboxes that send now (`leadSendingFactsOf`), with the saved
     spacing.
   - `firstEmails` as a line, then Follow-ups with `followUpModes` (the same `playbook_change` verb, receipt and undo).
   - Ends with: "Ruben" (the Signed field, as now) or the first picked mailbox's signature; `signatureHasLink` under it
     when that signature has a link.
   - Footer, as now.
5. Every change saves as the sheet does now (`use-chain.ts`, `PUT sequences/:id/chain`).

## Not in this lane

Lane 1 (the one count, the add door's unconfirmed rule, Discard's list, the one fed_by reading, Ask's prompt), lane 2
(the one page, Leads in pick mode), lane 4 (short names), lane 5 (the batch on Today: held emails first, each opening,
Take out; the run sheet's own email, which should end as the send does, is that lane's). The New sheet's own How it
runs for leads keeps its words until lane 2 makes it the record's.

## Tests, written first

| What | Where | Proves |
| --- | --- | --- |
| `coldEndingOf` | `tooling/scripts/tests/reach-out/reach-out-ending.test.mjs` (new) | name; mailbox; a first email whose signature has a link ends with the name; a follow-up keeps that signature; words ending `{{your name}}` get no second name; empty Signed line, no sign-off |
| The send's text | `reach-out/reach-out-request.test.mjs` | words, "Ruben", foot; words, signature, foot; the owner's draft gets the sign-off only |
| The preview | `doors/doors.test.mjs` or the preview door's test | the preview ends as the send does, with the chosen mailbox's signature |
| The pace | `campaigns/lead-sequence-build.test.mjs` | one new mailbox: "10 · one every 30 min" and "9 · one every 60 min"; a saved 12 shows its own choice |
| A signature's lines | `email/mailboxes/mailbox-signature.test.mjs` | a table signature and a span signature each read line by line |
| The doors | a new `reach-out-sheet/a-sequence-ends-as-it-chooses.db.test.mjs` | the column's default and check; `reach_out_save` keeps `signs_with` and leaves it when the key is absent; `sequence_create_leads` ticks DNS-complete mailboxes only, all connected when none is, and writes 20 |
| The sheet | `campaigns/lead-sequence-build.test.mjs` | the rows, the last tick kept, the Follow-ups words, Ends with and the link line |
| The test mail | the sequence test-mail test | the ending between the words and the foot |

## Risks

- **Every live sequence's ending changes at deploy.** From then on its emails end with its Signed line and no mailbox
  signature. That is D10; the PR says it, and How it runs offers the signature back.
- **A sequence with an empty Signed line** ends with no name. The sheet asks for one (`noName`) while Ends with is the
  name, and Signed already starts as the member's first name.
- **The migration re-creates two long doors.** Each is copied from its last definition (00472, 00465) with only the
  lines named here changed, and the db test reads both back.
- **Deploy order.** The edge's `sendStanding` selects `signs_with`, so the migration goes to production before the merge
  (as 00490 did). After it, either app may deploy first: an old edge ignores the saved key and keeps signing as now; a
  new edge reads `name` for a sequence the old dashboard saved.
- **Mailbox ids are named per step** (`reach_out_save` writes them on every step): the pick writes them all, as now.

## Open, for the build

1. Where Set up DNS lands: Settings › Connections with that mailbox's DNS sheet open, if its route can name one;
   else Settings › Connections.
