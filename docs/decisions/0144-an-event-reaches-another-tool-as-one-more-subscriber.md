# 0144 · An event reaches another tool as one more subscriber

**Status:** Decided on 22 November 2026, and not built. Ruben took the rule's seven points as recommended that day
("take all recommended calls and continue what can start"), on the whole-product review
(`Claude Video/docs/2026-11-22-vision-four-features-checked.md`, section 4), with the build to follow the connector
for an owner's own AI agent, when a first customer names the tool they want linked. It replaces the sketch W9 of
`docs/plans/2026-09-24-every-business-every-channel.md` and closes that plan's decision 14. Written against commit
`7afb306c81` (main, 22 November 2026). Where this note and the code disagree, the code wins.

## Context

An owner cannot yet have another tool hear what happens in Chanlytics: a new lead, a time asked for, a yes to offers.
Nothing sends an event out, and there is no key an owner makes.

- The plan of 24 September 2026 sketched it as W9: a table of subscriptions, a sweep that "reads `events` past each
  subscription's watermark", and a job kind of its own, `webhook_deliver`. It left the shape to a decision note of its
  own. This is that note.
- Since then the events' own road was built (decision 0032, 00334 and 00336). A fact and its event share a
  transaction. A trigger copies a subscribed kind into `event_outbox`. A relay with no cursor drains it after the
  commit and writes one `event_deliveries` row and one job for each subscriber, and each delivery is retried, set
  aside and sent again apart from every other. Thirteen subscribers act on it today (contracts `EVENT_SUBSCRIBERS`),
  all inside the app.
- Decision 0032 says why its relay keeps no cursor: a cursor skips an event whose transaction committed late. W9's
  watermark is such a cursor.
- Not every event is written with its fact. Decision 0031 counted about eighty places that write theirs apart, on a
  best-effort basis (6 October 2026). They were not counted again for this note.
- Order is not kept for a subject: decision 0032's point 6 was not built, and its two columns were dropped (00571,
  decision 0115).
- What stands beside it: a bearer token beside the cookie (decision 0011), and a website's own key for its form
  (`form_keys`, 00675), which opens nothing else.

## Decision

1. **Sending events out is one more subscriber on the relay, never a second road.** No sweep over `events`, no
   watermark, and no job kind of its own.
2. **Only kinds on a short public list go out, and a kind is on the list only if it is written in its fact's
   transaction** (decision 0032, point 1). A kind written apart is made whole first.
3. **Each workspace's address has its own delivery record.** An address that fails delays no other workspace and no
   subscriber inside the app.
4. **Order is not promised.** A receiver takes an event as a nudge and reads the record as it stands.
5. **Signed and bounded.** Each delivery is signed and carries its time. An address on a private network is refused.
   A delivery is tried a set number of times, then set aside where the owner can see it and send it again.
6. **An erased person's events do not go out later.** A delivery that waits, and one sent again, is checked against
   the erasure first.
7. **A key an owner makes is the workspace's own:** named permissions, an end date, and a way to end it. What it
   writes goes through the same act a person's press does, with the same checks. A website form's key is not such a
   key.

## What it is not

- Not a builder of automations, and not a list of every event the app writes.
- Not the connector. That serves a person's own AI agent (`Claude Video/docs/2026-11-07-mcp-prd.md`); this serves
  tools that have no agent, and one does not replace the other.

## Steps

Nothing is built from this note. When its turn comes:

1. The public list: its first kinds, each read against point 2.
2. The addresses and their deliveries, as one subscriber of the relay; the signature; the refusal of a private
   address.
3. A key of the workspace's own, through the acts a person's press uses.
4. Where an owner sets it up, on Connections.

## Tests

- A kind written apart from its fact cannot be put on the public list.
- An address that fails holds nobody else's deliveries.
- A delivery for an erased person is not sent, the first time or again.
- A delivery to an address on a private network is refused.

## Risks

- An owner's address is a place Chanlytics does not control: what is sent there cannot be taken back.
- A kind made public is hard to change.

## Open questions

- Which kinds are first on the public list.
- How long a delivery set aside is kept.
- Whether a plan carries it (decision 0037's draft, #1039, is open).
