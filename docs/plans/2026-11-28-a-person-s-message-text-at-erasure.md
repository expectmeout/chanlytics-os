# A person's message text at erasure: the choices

28 November 2026, lane 9 of the "Prove it works" plan (doors refuse the wrong caller). **Choices, not a build: nothing
here is changed.** Decision 0150 left one question open, on Ruben's word of 6 October 2026, and the outside reviews
asked that it be made explicit. This says what an erasure does with message text today, as the code and its tests
hold it, and lays out what each way of closing the question would cost and leave behind. Ruben decides.

## What an erasure does today

Read from `erase_contact` (supabase/schema.sql), the erasure's registry (`packages/db/src/repositories/erasure/`) and
the suites that run them.

- **Their own conversations go whole.** Every message in a thread of theirs is deleted, both sides: what they wrote
  and what the business or AI wrote back. So is any message that carries their id in another thread, their calls, the
  recordings and pictures in storage, and their identities on each channel. Proved on a real database by
  `tests/people/erasure/erasure-completeness.db.test.mjs`.
- **What the team wrote about them is scrubbed by needle.** Notes, AI's kept turns, Ask's threads, jobs, events and
  the provider's deliveries are searched for their number and their address, and each is replaced with `[erased]` or
  the row is deleted. A name alone is never searched for (decision 0036: a name is not a key).
- **Their record stays as a tombstone** with no number, name or address, so the same person is recognised and not
  written to again. Rows that keep its id (a visit, a deal, a run's count) are named one by one, with why, in
  `tests/database/doors/_lists.mjs` (`AN_ERASURE_KEEPS`), and a database suite fails a new table that names a person
  until it is deleted with them or named there.
- **The one thing no leg reaches: their number or address inside a message in SOMEONE ELSE's thread.** Another
  customer who wrote "call my sister on 646 555 0199", or a teammate who typed a person's address into a reply to
  somebody else. Those words are `messages.body`, and for a template `messages.template_vars`. A message never
  changes once written (the `messages_guard` trigger: its words may only ever become nothing, once, for an Instagram
  message its sender took back), so the scrub that reaches notes cannot reach it. The registry says so in words, and
  `tests/people/erasure/erasure-registry.test.mjs` holds it: "in someone else's thread they stay".

How often this happens on production is not known to this lane (no lane reads production). One read-only count would
say: messages outside a person's own threads whose text holds that person's number or address.

## The choices

### 1. Keep as now

A person's words go with their own threads. A number or address quoted in someone else's thread stays.

- **Costs:** nothing to build.
- **Leaves behind:** the quoted number or address, for as long as the other person's thread lives. It can be found by
  the Inbox's text search. Nothing links it to the erased person any more, and nothing sends to it: the tombstone is
  blocked at the send door.
- **To weigh:** an erasure request is about the person's data wherever it is held. A regulator or the person could
  ask why a number they asked to have erased still reads in a search. The answer today is "it is in another
  customer's conversation, which we keep whole", and that is a position to take on purpose, with advice.

### 2. Blank the text and keep the row

The erasure also reaches messages outside the person's threads: where a message's words hold their number or
address, the words are cleared. Two ways to cut it:

- **2a. Only the needle.** The number or address becomes `[erased]`, as it does in a note; the rest of the sentence
  stays. Smallest loss to the other customer's thread.
- **2b. The whole text.** The message keeps its row (who, when, which way) and loses its words. Simpler to prove,
  and it cannot leave half a sentence that still identifies someone.

- **Costs:** one exception in `messages_guard`, as narrow as the Instagram one (only inside an erasure, only the
  words, only once); one more leg in the erasure and its strategy in the registry; a seed and a search in the
  completeness suite; the message search index follows by itself. A message's `content_hash` would no longer match
  its words: what reads it after a send is to be checked first. About a day, with its database proof. One migration.
- **Leaves behind:** the other person's thread with a gap or an `[erased]` in it, and a rule that is no longer
  absolute: "a message never changes" becomes "a message never changes, but an erasure may clear its words".
- **To weigh:** it is the only choice under which a search for an erased person's number finds nothing in message
  text. A name typed in another thread still stays, as everywhere else.

### 3. Keep the business's side only

A different line, drawn in the person's own threads: delete what the customer wrote and keep what the business sent
them, so the business keeps a record of what it said (a confirmation, a price, a refusal).

- **Costs:** `erase_contact` deletes by direction instead of by thread; the thread itself must then stay, attached to
  the tombstone; every page that lists threads learns to leave an erased person's out; the completeness suite is
  rewritten for the half that stays. Several days, and it touches the most destructive door in the product.
- **Leaves behind:** the business's own messages to the erased person, which often repeat what the person said
  ("see you Tuesday at 3 for the colour, Ana"). That is the person's data again, kept on purpose.
- **To weigh:** it keeps more than today, not less. It answers a different worry (the business losing its record of
  what it promised), and it does nothing for a number quoted in someone else's thread, so it does not close the open
  question by itself.

## What I would do

Choice 2, cut as 2a. It is the smallest change that makes the erasure's promise true of message text, it follows the
rule notes already keep, and it leaves the business's other conversations readable. I would take the production
count first: if it is zero today, choice 1 can stand a while longer with the reason written down, and 2a can wait
for the first real erasure request.

Choice 3 I would not take: it keeps more of the person than today.

## What is asked of Ruben

One answer: 1, 2a, 2b or 3. And, if he wants it before answering, his word for the one read-only count above.
