# 0135 · A follow-up WhatsApp files as an offer goes in the open chat

**Status:** Decided by Ruben, 15 November 2026 ("Accept the note", after "Approve the design" on its outline), not built.
Written against main at `b2f058d8e2`. It amends [0006](0006-a-proposal-follow-up.md) for one case, said under Decision.
Corrected against the code the same day, before any of it was built: the row a run reads already carries the chat's
clock, so the note's first step (putting it there, perhaps by a migration) went, and four remain.

## Context

**The follow-up.** Someone is sent the booking link and does not book. Each sequence that starts on `asked_no_booking`
takes them in for the next day at its hour (`askFollowUpAt`, `packages/contracts/src/campaigns/playbooks/occasions.ts:120`;
enrolled by `enrolFromAsk`, `apps/edge/lib/campaigns/occasions/enrol.ts:176`), once in seven days (`ASK_REST_DAYS`, `:146`),
and leaves them out if they booked since. Its ready-made message is `booking_follow_up`, which the product files with
WhatsApp as a notice (`packages/contracts/src/campaigns/templates/starter-templates/table.ts:96`).

**What WhatsApp did with it.** On 14 November 2026, on Ruben's own workspace, WhatsApp filed that message as an offer
eight minutes after it was written, and approved it as one the next day. That is WhatsApp's standing rule and no
accident: since 9 April 2025 a message filed as a notice that it reads as an offer is approved as an offer (Meta,
Template categorization, read 15 November 2026). "Still want to book? Here's the link again" asks someone to buy, and
will be read so again.

**What the product does then.** Decision 0006 says the wire has the last word: "If Meta files it as marketing, the send
needs the offers yes and says so" (`docs/decisions/0006-a-proposal-follow-up.md:130`). A run enrols by the stricter of
its moment's class and its message's category (`enrolPurpose`, `packages/contracts/src/campaigns/playbooks/purpose.ts:55`),
and the door asks the same of every send, whichever channel it goes by (`purposeAtTheDoor`,
`packages/core/src/messages/broadcast-channels.ts:75`). For a workspace whose WhatsApp number is a US one, that leaves:

- **WhatsApp:** held. Meta delivers no offer to a US number (`whatsappOffersOpen`,
  `packages/contracts/src/campaigns/broadcasts/whatsapp-offers.ts:32`).
- **Text:** never. No text carries an offer (`channelNeverCarries`,
  `packages/contracts/src/campaigns/broadcasts/reach-for.ts:117`).
- **Email:** only where offers by email are on, to someone who said yes or has dealt with the business
  (`mayMessageFor`, `packages/contracts/src/consent/consent.ts:211`).

On Ruben's workspace on 15 November the step was on, offers by email were off, and nobody had been due yet: the first
person due would have been reached by nothing. The step said "WhatsApp, else text, else email".

**What is already there.** The person the follow-up is for wrote to the business within the day. WhatsApp lets a
business write freely for 24 hours after a person's last message: no approval of the words, and no category (Meta,
Service messages, read 15 November 2026). The product keeps that clock (`conversations.last_inbound_on_whatsapp`) and
judges it in one place (`replyWindow`, `packages/contracts/src/config/policy/prices.ts:428`, over `WA_WINDOW_MS`, `:402`), which
a person's reply asks (`packages/core/src/conversations/reply.ts:433`). The send door already reads words with no
template as words in a conversation (`packages/core/src/deliver/deliver.ts:22`, and `getTemplatePurpose`, `:779`), and
WhatsApp's wire sends either a template or plain words (`whatsappSender`, `packages/core/src/deliver/wire-senders.ts:111`).
A campaign's WhatsApp send names its template every time, and already holds the same words filled in beside it
(`prepare`, `packages/core/src/messages/broadcast-channels.ts:327`, the `template` at `:359`). The row a run reads each
person from carries when they last wrote on WhatsApp (`latest_wa_inbound_at`,
`packages/contracts/src/people/person-dto.ts:69`), and People already says from it whether a reply may be written
(`rowReplyOf`, `packages/contracts/src/people/person-row/row-facts.ts:499`). No campaign asks it.

**What it costs.** Since 1 October 2026 WhatsApp charges for words sent in an open chat, per message, at the rate of a
notice (Meta, pricing of non-template messages, read 15 November 2026). An offer costs more, and to a US number is not
delivered at any price.

## Decision

1. **A follow-up about the person's own request, whose message WhatsApp approved as an offer, goes to a person whose
   WhatsApp chat is open as a reply in that chat:** the message's own words with their values, as plain words, naming no
   template. Open is `replyWindow`'s answer at the moment it is sent.
2. **In the open chat it is judged by its moment, not by WhatsApp's filing of the saved message.** It asks what a
   visit reminder asks: the person's yes to messages, covering WhatsApp (`mayMessageFor`, the moment's own purpose, a
   message that starts, about something of theirs). This amends 0006: WhatsApp's category rules a message WhatsApp
   carries as a saved message, and words in an open chat are not one. Everything else of the door holds as it does:
   a stop, the workspace's pause, a teammate holding the conversation, and the 24 hours after a teammate's own reply
   (`passesHandoverPause`, `packages/contracts/src/campaigns/playbooks/purpose.ts:37`: only a reminder passes it).
3. **It applies to one kind of step and no other:** its moment is about something of theirs (the follow-ups and
   Booking), and its message has a WhatsApp version approved as an offer. An offer's own moment, a one-off and the
   business's news are offers wherever they go, and are untouched. A message WhatsApp approved as a notice goes as
   it always did.
4. **WhatsApp only.** By text and by email the message is judged as it is today.
5. **It goes while the chat is open.** The follow-up is due the next day at the sequence's hour, or earlier that day
   where that keeps it inside the person's 24 hours, leaving room for the half hour a sequence may hold its batch
   (`PLAYBOOK_VETO_DELAY_MS`, `packages/contracts/src/campaigns/playbooks/triggers/kinds.ts:263`) and a quarter of an hour
   to spare. Never the same day, and never before the first sending hour (`PLAYBOOK_HOURS`, `:183`). Where no such time
   exists, it is due when it is today and goes by today's rules.
6. **The chat is asked again at the send.** A person whose chat has closed by then, because the batch waited for an OK
   or the door held it, is not sent the reply. They go by today's rules for the message, and the run's record says why.
7. **The step says what it does**, on its box and in its sheet, in the words of `docs/words.md`: where it goes in the
   open chat, and who gets it otherwise.

## What it does not do

- **The proposal follow-up and the freed time** go days after the person last wrote, outside any open chat: they stay
  as they are, and their steps say who gets them.
- **Someone who never wrote on WhatsApp** (they called, texted or emailed) has no chat to reply in.
- **Text.** A nudge to finish a booking is read as marketing in the texting providers' compliance guides, as an
  abandoned cart's reminder is (read 15 November 2026; guides, not legal advice). It is not sent by text to someone who
  has not said yes to offers, and offers do not go by text at all.
- **Words AI writes for the moment.** The reply is the saved message's words. AI writing each one is a later step,
  with its own check.
- **A message WhatsApp is still checking, or asked a change to.** Those wait as they do today.

## Shape

- **The clock is on the row already.** A run reads each person as People does, and that row carries when they last
  wrote on WhatsApp. No migration, and no read is added.
- **One pick.** `reachFor` stays the one place a person's channel is chosen. It learns one thing: for a step of this
  kind, a person whose chat will be open is picked on WhatsApp under the moment's purpose, and Meta's pause on offers
  to US numbers is not asked of them. No second consent rule, and `mayMessageFor` is unchanged.
- **One door.** `prepare` leaves the template off for a person picked that way, and names the moment's purpose. The
  send door, the wire and the thread's record are the ones every send uses. The thread shows the message as the
  campaign's, as it does today.
- **One clock.** `askFollowUpAt` takes when the person's chat closes, and answers the earlier time.
- **The words.** The step's box and sheet (`packages/contracts/src/campaigns/sequences/schedule.ts`), and the run's
  record of who was held and why.
- **A switch, per workspace, off.** The pick reads it. It is on for Ruben's workspace first.

## Steps

Each step ships by itself, in either deploy order.

1. **The pick and the send**, behind the switch, off for everyone: `reachFor`, `prepare`, the run's record.
2. **The hour**: `askFollowUpAt`, read by the enrolment.
3. **The words** on the step and in the run's record.
4. **On for Ruben's workspace**, one real walk on a test number: asked, link sent, not booked, the reply the next
   day in the same chat, the thread and the step read back. Then on for everyone, on his word.

## Tests

Written first, each seen to fail.

- **The pick:** a person whose chat is open is picked on WhatsApp under the moment's yes, on a US number too; one whose
  chat is closed is judged as an offer; one who said stop, or never said yes to messages, is not picked; an offer's
  own moment and a one-off are judged as today whatever the chat.
- **The send:** the reply names no template and carries the message's words filled in; the chat is asked again at the
  send, and one that closed since is not sent the reply; a teammate's reply within 24 hours holds it.
- **The hour:** next day at the sequence's hour where that is inside the 24 hours; earlier where it is not; never the
  same day or before the first sending hour; as today where no time fits.
- **The words:** the step's box and sheet, and the run's line for someone held.

## Risks

- **A nudge nobody asked for, in a chat they opened.** One for each ask, once in seven days, never after a booking,
  never while a teammate holds the conversation, and a stop ends it.
- **The rule is a consent rule.** Someone who never said yes to offers is asked whether they still want to book. By
  0006 the follow-up is about their own request; in an open chat WhatsApp's own rules allow it; and it still asks
  their yes to messages. It is Ruben's decision, and question 1 below.
- **WhatsApp's own rules for free words still apply** (its Business Messaging Policy), and a person can block or
  report a business for any message: the number's standing is at stake as with every send.
- **It costs.** A reply in an open chat is charged since 1 October 2026, at a notice's rate.
- **A hold can outlast the chat.** A sequence that asks for an OK may get it after the 24 hours: decision 6 sends
  nothing in the chat then. Step 3 tells the owner what the wait cost, as a waiting batch already tells them of people
  it left behind (`leftBehindNotice`, read by `apps/edge/lib/campaigns/occasions/due.ts`).

## Open questions

None open. Answered by Ruben on 15 November 2026, each as it was recommended:

1. **May the follow-up go, in an open WhatsApp chat, to someone who has not said yes to offers?** Yes, under their yes
   to messages.
2. **May it go earlier than the sequence's hour to stay inside the 24 hours?** Yes, never the same day and never
   before the first sending hour.
3. **Whose words?** The saved message's, and AI's later.
4. **Someone who last wrote early in the morning** has no time the next day inside their 24 hours. They go by today's
   rules, and "never the same day" stays.
5. **A switch first, on for Ruben's workspace alone,** with one real walk before everyone.
