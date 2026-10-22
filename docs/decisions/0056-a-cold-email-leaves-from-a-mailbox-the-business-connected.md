# 0056 · A cold email leaves from a mailbox the business connected

**Status:** Built on the lane `reach-out/own-mailboxes`, 13 October 2026, and not yet merged. Decided the same day.
Ruben: "resend is a scrapped project we must remove from chanlytics it is more
likely to damage our domain than benefiting users. your plan is approved end to end". The plan is
`Claude Video/docs/2026-10-13-chanlytics-cold-email-own-mailbox-review.md`. Written against commit `38d3f2529`
(main, 13 October 2026, after #1578). Where this note and the code disagree, the code wins.

The cold lane's SQL this note left inert (the sending domains and their days, a send's `domain_id`, a step's
`domain_ids`, and the six doors only an edge from before it called) was dropped by 00472 on 22 October 2026, once
production's edge had run this note's code for a week.

This note supersedes:

- decision 3 of `docs/superpowers/specs/2026-09-25-reach-out-design.md` ("a second Resend account for cold mail");
- the wire in that spec's §4.6: own domains on a cold Resend account, the cold reply domain (D17) and the cold
  account's receipts;
- step 1 of `docs/superpowers/specs/2026-10-04-reach-out-drafts-the-owner-sends-design.md` ("the owner sends"), which
  was never built.

It also corrects the 11 October engine review's advice to "keep the cold-outreach account on a separate Resend team"
(`Claude Video/docs/2026-10-11-chanlytics-engine-and-tests-review.md`, §3.7).

## Context

Reach out is a finished engine with nothing to send through:

- **It never sent.** At `38d3f2529` production holds no sending domain, no reach-out step and no reach-out send. The
  cold lane (`coldLane()`) needs a Resend account whose acceptable-use policy forbids "unsolicited messages of any
  kind, including cold outreach, purchased lists, or scraped contact data".
- **One account for everyone.** That account would also be shared by every workspace, so one business's bounces would
  close it for all.
- **Nothing to connect.** No business can connect its own mailbox: no Gmail, Microsoft Graph or IMAP code exists. The
  products owners compare Chanlytics with (Instantly, Apollo) are built on exactly that.

The engine around the send does not depend on how an email leaves:

- the chain;
- the lead's own hours;
- the opening written and checked per lead;
- holds, stops, the reading of replies, the Inbox's drafted answer;
- reports.

`deliver()` routes a frozen request by lane (`packages/core/src/wire-senders.ts`). The intake's verb takes a
provider-neutral `IncomingEmail` (`packages/core/src/messages/email-ingest.ts`). Google Business Profile already
keeps an OAuth token in Vault and refreshes it by compare-and-set (00364).

## Decision

1. **The sender is a mailbox the business connected.**
   - A row of `mailbox_connections`, one per mailbox, says which provider (`google` or `microsoft`), its address, its
     name, its state and its day.
   - Its tokens are in Vault, never on the row, written only by `put_mailbox_credentials` and refreshed by
     compare-and-set as Google's are.
   - A mailbox belongs to the workspace and was connected by a member.
   - An address is connected by one workspace at a time.
   - A workspace holds at most ten, and at most three on one domain.
2. **Each email leaves through the mailbox's own provider.** Gmail's `users.messages.send` or Microsoft Graph, as
   plain-text MIME built from the frozen request (`packages/channels/src/mailbox`).
   - The wire's lane is still `own`, meaning _the business's own mailbox_, and `purpose: "outreach"` takes only it.
   - The real Message-ID is read back and stamped, so a reply finds its send by the Message-ID it cites, as it does
     today.
3. **Each lead keeps one mailbox for its whole chain.** A nudge comes from the same sender, in the same thread. A
   step's mailboxes take turns over new leads.
4. **Caps belong to the mailbox, and suit cold mail.**
   - The ramp counts days actually sent (D15 as before): 10 a day at first, 20 from the seventh, 30 from the
     fourteenth, 40 from the twenty-first.
   - The owner may set a lower cap, never a higher one.
   - A mailbox on the business's own customer domain (its website's) stops at 20.
   - The workspace's month (2,000) stays.
5. **Replies are read from the mailbox, and only the threads the product started.**
   - Gmail: `users.watch` publishes to Pub/Sub, an edge door wakes a sync, and the sync reads `history.list` from its
     cursor. Only messages in threads whose ids the product stored are fetched.
   - Microsoft: a Graph subscription wakes the sync, and a delta query reads it.
   - A sweep every few minutes covers a dropped push.
   - Each message is taken in as an `email_ingest` job whose payload names the connection, and enters `ingestEmail` as
     a Resend delivery does. A delivery report in such a thread is a bounce.
6. **Scopes are the least that does the job.**
   - Google: `openid email`, `gmail.send` (sensitive) and `gmail.readonly` (restricted, so the app passes Google's
     security assessment), in a Google Cloud project kept apart from Business Profile's.
   - Microsoft: `offline_access openid email User.Read Mail.ReadWrite Mail.Send`. ReadWrite creates the draft whose
     Message-ID is read back before it is sent.
7. **The first touch is plain text.**
   - No HTML twin and no link in the body.
   - The foot says why they are hearing from the business, that it is a marketing email, who and where, and "Reply
     'no thanks'". CAN-SPAM accepts a reply as the way out, and the reply reader keeps a no.
   - `List-Unsubscribe` with the one-click https link is carried in the header when `UNSUBSCRIBE_SECRET` is set.
   - The check holds a first email that carries a link.
8. **Health is counted from our own signals,** since Postmaster Tools v2 reports no reputation. A mailbox is held at:
   - permanent bounces over 3% of its last 150 sends (or 5 in its first 150);
   - any complaint;
   - unsubscribes over the same 3%. (Amended 20 Oct 2026, 00466: a "no thanks" is a reply, which helps a mailbox's
     standing, so it is counted and said, never held on; a server refusing the sender, 5.7.x, counts beside the
     permanent bounces, never against the address.)

   A held mailbox's sends wait. A provider's daily limit pauses it until tomorrow. A token Google or Microsoft revoked
   asks the owner to reconnect, once.

9. **Leads abroad are held.** The US, Canada and the United Kingdom go. Germany and Austria are refused. The rest of
   the European Union is held until the owner includes it.
10. **Resend leaves outreach entirely.**
    - The cold account, `RESEND_COLD_API_KEY`, `RESEND_COLD_WEBHOOK_SECRET`, `COLD_REPLY_DOMAIN`,
      `COLD_REPLY_DOMAIN_PREVIOUS`, the cold receipts, the domains sweep and sending domains are removed.
    - `sending_domains` and its functions are left inert in this change and dropped by the next, so either deploy
      order works.
    - The platform's own account still carries the receptionist's replies to people who wrote in, reminders and
      offers to people who said yes. Whether that goes too is a separate decision.

## Consequences

- An owner connects Google or Microsoft from Settings › Connections › Email, sees each mailbox's day, ramp, records
  and health, and picks mailboxes in the reach-out sheet. A mailbox Google or Microsoft signed out shows Reconnect.
  There are no dead doors.
- Until Google approves the restricted scope, Google mailboxes connect under Google's "unverified app" screen, capped
  at 100 users for the project. Microsoft mailboxes are not capped. The verification is Ruben's to start (the runbook,
  "Connect a mailbox").
- New switches on the edge:
  - Google: `GOOGLE_MAIL_CLIENT_ID`, `GOOGLE_MAIL_CLIENT_SECRET`, `GMAIL_PUSH_TOPIC`, `GMAIL_PUSH_AUDIENCE`.
  - Microsoft: `MICROSOFT_MAIL_CLIENT_ID`, `MICROSOFT_MAIL_CLIENT_SECRET`, `GRAPH_NOTIFY_SECRET`.
  - Both: `MAILBOX_OAUTH_REDIRECT`.

  A provider whose switches are unset is not offered.

- `reach_out_sends.mailbox_id` and `playbooks.mailbox_ids` take the place of `domain_id` and `domain_ids`, which stay
  unread until the next change drops them.
- What was decided about the reach-out itself stands: the check, the holds, approval, the stops and the reading.
