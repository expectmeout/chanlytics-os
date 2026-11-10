# 0121 · A business posts what it made

**Status:** Accepted by Ruben, 10 November 2026 ("Yes, as recommended", on the Meta link PRD's D4 to D16), and built as the
Meta link's second piece for pictures and picture stories. Reels, a story from a video and trending sounds wait for the first
real sign-in through Meta (whether Instagram takes Cloudflare Stream's video file, and what the Audio API gives a business
account). Migration 00611.

## Context

Decision 0117 connected a business's Instagram account through Meta. A post Chanlytics made (decision 0099, step 3) could be
saved to Files, shared from the phone or put on Google by a press; nothing put it on Instagram, and nothing kept one record of
where a post went. The content plan needs that record before it can put anything anywhere by itself: which exact version was
approved, by whom and when, and where it stands in each place.

Instagram takes a post in two calls (a container from a public picture, then its publish), and the second may time out with
the post already up. Sending it again could post it twice.

## Decision

1. **One placement per place a post goes** (`posts`): the exact file approved (a new version of a post is a new file), who
   approved it and when, its kind there (a picture or a story; a reel later), its caption, its time, and where it stands. One
   at a time per file and place. The press is the approval: `post_begin` writes the placement, and for Instagram its first
   job, in one transaction.
2. **Every send is a row of its own** (`publish_attempts`): the request as sent (the picture's host, never a token or a signed
   address), the answer as it came, the outcome. A finished send never changes; the placement's container and post ids are
   copies of the newest one's.
3. **Three jobs, in the bulk lane** (decision 0089): `post_prepare` signs the post's own picture for a day and makes the
   container, keeping its id on the send, so a run that comes back asks after the same container; `post_publish` sends it
   once; `post_reconcile` asks Instagram what it has after a send with no answer.
4. **The recheck, right before the send.** Whoever approved it may still post for the business, the post was not pulled or
   deleted, and Instagram is still connected with posting allowed. Anything moved holds the post in words, and nothing is
   sent. Until the send, Don't post stops it.
5. **Publishing works like a payment.** A refusal fails the post in the owner's words. No answer is Checking:
   `post_unanswered` writes it with its reconcile, together, and two minutes on the account's newest posts are read. Found,
   it is up; not found, one fresh attempt begins (`post_again`), never a third. A run that died while sending is settled the
   same way by the ledger.
6. **Google joins the record** (D16). The Google press writes its placement before the edge is asked, keeps its one send,
   and marks it up under Google's name for it, refused in words, or taken down. A post's sheet reads Google from its placement
   where that says up or down, and from the edge's events for older posts and one whose answer the press never heard.
7. **Words, never codes.** What a refusal says comes from Instagram's code and subcode, in contracts `ON_INSTAGRAM.refused`:
   the day's limit, a picture Instagram could not take, a connection it no longer accepts, a busy minute, or anything else.

## What it does not do yet

A hold is said on the post's sheet; the bell hears of a failure only (the ledger's own `job_failed`), since every hold today
comes from the owner's own act or is already said on Connections. Frozen facts (an hour or a price the post states, checked
again before the send) come with the content plan's renderer. No metrics are read yet (the Meta link's third piece). Ask's
card makes a post as before; the card that approves it for Instagram comes with the content plan's card.

## Amends

Decision 0099, step 3: a made post goes to Instagram as well as Google, each place a placement of its own.
