# 0143 · A disconnected Instagram account is let go

**Status:** Decided by Ruben, 22 November 2026 (six calls, each as recommended), and built on the lane
`instagram/an-account-moves`, waiting for his word to push. Migration 00677, applied before the merge. Written against
main at `d6aa73916b`. Amends 0117 (its point 7, and what a disconnect is) and 0001, step 8.

## Context

On 21 November 2026 an Instagram account disconnected from one workspace was refused in another, twice, and the page
said nothing either time.

- `(kind, external_id)` is unique on `tenant_channels`, and a disconnect only set the account's row to `disabled`
  (`apps/edge/lib/instagram/connect.ts`, `meta-connect.ts`). The row kept the account's id, and its token stayed in the
  Vault with no end. `refuseIfHeldElsewhere` refused whatever another workspace's row was, so a disconnected account
  belonged to its first workspace until that workspace was deleted.
- A connect was three writes: the row written off, the token put in the Vault, the row turned on. One that died
  between them left a row that was off and still held the account, the same way.
- The Connections page read what a sign-in came back with from the address in a state initialiser, and took it off the
  address as it read it. On a desk the frame draws a page, sets it aside while its reads arrive and draws it again
  (`surfaces/frame/shell-hooks.ts` `useViewFade`): the second drawing found nothing. Reproduced on production at
  1440px (silent) and at a phone's width (said), for Meta's return and for Google's.
- Where a webhook's account goes is kept five minutes (`packages/db` `resolveChannelDetailed`). For a number that never
  changes workspace, that is right. An account that leaves one workspace and joins another inside those minutes would
  have had its customers' DMs filed in the business it left.
- Instagram's own login never asked Instagram to stop sending on a disconnect; a second, different account connected
  in a workspace was a second row the page never drew and Disconnect never reached; five refusals reached an owner as
  the reason's own word ("Meta did not connect (channel_read_failed).").

## Decision

1. **Disconnect lets the account go, at once.** One door, `instagram_account_disconnect` (00677): the row off, its
   `external_id` its own (`let-go:<row id>`, so the unique key frees), its token deleted from the Vault and
   `credentials_ref` cleared, its config keeping the handle with `account_id`, `disconnected_at` and
   `disconnected_by`. Then the edge asks Meta to stop sending the account's events with the token it had, through
   whichever login connected it, best effort. Disconnected means no token and no claim.
2. **A connected account is never taken.** Another workspace is refused (`instagram_account_taken`) while the
   account's row is `active`, lapsed or not: only its own Disconnect lets it go. A lapse can be a changed password, and
   that business never said goodbye. An owner locked out of the old workspace asks support.
3. **Connect is one write, all or nothing.** `instagram_account_connect` (00677), under a lock for the workspace and
   one for the account: the refusals asked again; a row of another workspace that is off and still holds the account
   (the code before this, or the deploy between) let go first; this workspace's own row for the account (the one
   holding it, else the one it let go last) or a new one given the account, its config and its token, and turned on.
   A token the Vault will not keep raises, and nothing is changed. 0117's point 7 holds by that: the hand-written
   "put the row back" is gone.
4. **Everything stays where it was made.** Conversations, people, messages and posts stay in the first workspace;
   nothing is copied; the second starts clean. Moving back gives the first workspace its own row again, so the line
   its threads name (`messages.meta.line`), a person's `acquired_ref` and Activity all point where they did. Posts
   waiting for their time are held at their time, as before, and the Disconnect question says how many there are.
5. **One account a workspace.** A connect of a different account while one is connected is refused
   (`instagram_another_connected`) with the handle of the one that stands.
6. **A DM follows its account now.** Instagram's door and AI's answer job ask `resolveChannelDetailed` with `fresh`,
   which reads the row every time and answers `lookupFailed`, never its last answer, when the read fails.
7. **The page keeps what came back until Ok.** What a sign-in left in the address is taken once and kept at the
   module's level (`connections/model/came-back.ts`) for Instagram's, Meta's, Google's, the mailbox's and Drive's
   returns on Connections. Every reason has a sentence (`connections/model/login-words.ts`), one nobody named is a
   plain one, and the reason's own word stays in the log. The workspace that has an account connected is named only to
   someone who is an owner or a manager there: the edge tells the dashboard which (`held_by`), the callback writes that
   workspace's own address's word (`at`) only for its own, and anyone else reads "another Chanlytics workspace".
8. **Activity says both.** `channel.connected` reads "An Instagram account was connected" for one, and a disconnect
   writes `channel.disconnected`.

The rows already off and still holding an account are let go by 00677, through the same door.

## What it does not change

A lapsed connection, its daily check and its one notice; the sign-in itself, its state and its permissions; the
webhook door's signature, replay gate and inbound shape; where a post is sent from (the workspace's connected account,
at its time). A WhatsApp number's disconnect is as it was.

## Not in this change

- Meta's own call when a business removes the app is not listened for: the daily check finds it within a day.
- A post does not keep which account it went to. A workspace that later connects a different account would ask that
  account for an old post's numbers. For the content loop.
- The same lost return can exist wherever a page reads a one-time word from its address at mount (the ad account's
  connect, Billing's return). Not tested there.

## Deploy order

00677 first, then the code. The code before it keeps working beside it; the code after it finds no door until it is
applied, refuses a connect with `channel_write_failed` and a disconnect with its own refusal, and changes nothing.
