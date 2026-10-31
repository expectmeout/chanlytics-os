# 0081 · An email from the hosted address signs as its sender

**Status:** Decided by Ruben on 30 October 2026; built on its lane the same day, not merged, no migration: the signer
(`signerOf`) in the reply's and the first email's freeze, what an email will be signed with said by the drafts read and
a person's reach, and the line under the words in the Inbox's box and a new conversation's email. Lane
`email/the-hosted-address-signs-as-its-sender`, written against main's `5d0394714` (#1961).

## Context

A person's email to a customer leaves from a mailbox the business connected or from the workspace's hosted address.
Read at `5d0394714`:

- **From a connected mailbox it is signed** as that mailbox signs (00487: its owner's words, Gmail's signature with its
  markup, or its name; contracts `mailboxSignsOf`, channels `mailboxSignatureOf`), the hosted twin of such a reply too
  (`apps/dashboard/src/server/connections/email.ts` `freezeReply`).
- **From the hosted address it is not.** A thread that came to the hosted address, a thread whose mailbox is paused,
  held, resting or signed out (`replyIdentityOf` `own_not_sending`), and every first email from the Inbox or People
  (`freezeFirst`, `signature: null`) left with what was typed alone. The hosted mailbox keeps a name and no signature
  (`mailboxes.from_name`); a connected one keeps who connected it (`mailbox_connections.connected_by`).
- **Nothing said it before Send** but Need you's draft card, for a connected mailbox's thread only.

Ruben, 30 October 2026, on why a cold email's signature is plainer than his Gmail's: cold emails stay plain (0056 #7,
0077), "for non cold emails I did want the proper cleaner signature".

## Decision

1. **A person's email from the hosted address signs as its sender's mailbox.** One rule, `signerOf`: the connected
   mailbox the thread answers from, or would while it does not send now, whichever address the email leaves from; else
   the first mailbox the member sending connected (`connected_by`, the oldest `connected_at`); else none, as before.
   What that mailbox signs with is unchanged (`mailboxSignatureOf`: off, their words, Gmail's signature, their name).
   Replies and first emails both, through the reply door and New conversation (`replyPorts`' two users).
2. **Never another member's.** A teammate who connected no mailbox sends what they typed, and is told nothing signs it.
3. **What is sent is what is seen.** The drafts read says, per thread and for the member reading, what an email reply
   would be signed with (`GET conversations/drafts` `signed`), and a person's reach what an email to them would be
   (`email_signed`). The Inbox's box says it under the words once it has any (`Signed Sam Reyes · Founder · …`, the
   whole on hover, Change to Settings › Connections); a new conversation's email under its words.
4. **A first email keeps its signature on the row** (`meta.email.signature`), as a reply does, so the thread says it.
5. **Untouched:** cold emails (0056, 0077), broadcasts, offers and appointment emails (their own foot), sign-up
   confirmations.

Rejected: the workspace's only connected mailbox (a workspace with two goes unsigned, and a teammate's email would end
with the owner's name), and a signature typed for the hosted address (words only, never Gmail's, and a second place to
keep a signature, with a migration and a door).

## Consequences

- From the deploy on, a member with a connected mailbox signs every email from the hosted address. To undo: `signerOf`'s
  second step answers none, and the reply-freeze test's hosted cases flip back; nothing is stored but the words a new
  email went with.
- A member with two mailboxes signs as the first they connected. A "signs like" pick on the hosted address waits until
  it is asked for.
- Open: whether a first email from the Inbox or People should leave from the sender's connected mailbox (0073, R13), a
  question of sending, not of signing.
