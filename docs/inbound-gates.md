# The inbound gates

<!-- Written by `corepack pnpm gen:inbound-gates` from packages/core/src/inbound/order.ts. Do not edit by hand. -->

Every customer message on WhatsApp, a text or an Instagram DM is taken through this order, the same on every wire
(`answerInbound`, packages/core/src/inbound/answer.ts): recorded at its door, answered by its job (decision 0031).
A **gate** stops the message and says so in its log line; a **step** happens to every message that gets that far.
The hold is the one a gate opens for a person the ordinary way (the Inbox's reason); none means nobody is asked.
Every way out stamps what the message became (`meta.handled`).

| # | Kind | When | Then | Hold | Log line |
| --- | --- | --- | --- | --- | --- |
| 1 | gate | The sender is a short code: a carrier notice, a bank alert | Recorded and set aside: nothing can be sent back to a short code | none | `short_code_set_aside` |
| 2 | gate | The message is a one-time code a service sent (contracts `oneTimeCodeOf`, every wire's one reader) | Recorded and set aside | none | `one_time_code_set_aside` |
| 3 | gate | On the environment's own WhatsApp number, a sender off `WHATSAPP_TEST_ALLOWLIST` | Recorded and set aside | none | `wa_skip_allowlist` |
| 4 | step | Every other message | `ingest_inbound` keeps it, its STOP or START and the yeses it carries, in one transaction; a write that fails is a 503, and the provider sends it again | none |  |
| 5 | gate | A message already handled, or one a reply already names (a turn that died before its stamp) | Stopped before its memory is read: nothing is said twice | none | `wa_skip_pg_dupe` |
| 6 | step | This person's own receptionist mode | Read before any branch that can speak, and in force for this message | none |  |
| 7 | gate | The thread's history cannot be read | Nothing answered from an invented empty history; held for a person | `state_unavailable` | `wa_state_unavailable` |
| 8 | gate | This message is a STOP, or a stop is on record | No reply and no hold (decision 0048): the owner is told once, from the consent event | none | `wa_skip_opt_out` |
| 9 | gate | A text on a line the carriers have not approved for texting yet | Held for a person | `carriers` | `sms_held_for_carriers` |
| 10 | gate | A reaction, or a system notice | Recorded: nothing was asked | none | `wa_skip_no_request` |
| 11 | gate | A location, a contact card, or a post shared in a DM | Held for a person, with no apology: a person can read it | `non_text` | `wa_escalate_readable_nontext` |
| 12 | gate | More than two hours late (ten minutes to two hours late is answered, and logged) | Held for a person | `stale` | `wa_stale_escalated` |
| 13 | gate | Anything else that is not words the receptionist may read (a voice note, a document, a photo with vision off) | Acknowledged where the mode may speak, and held; the thread pauses when the acknowledgement left, and a thread a person has is held for them (`wrote_while_held`) | `non_text` | `wa_nontext` |
| 14 | gate | A START, or YES OFFERS on WhatsApp | The confirmation goes, and nothing else is said; one that cannot go is held (`send_failed`, or `paused`) | none | `wa_opt_in_confirmed` |
| 15 | gate | A person on the team has the thread (its pause) | Nothing said; held for them, one hold a stretch (00454) | `wrote_while_held` | `wa_skip_paused` |
| 16 | gate | The thread's automatic replies for the day are used (twenty, the owner's dial) | Held for a person | `rate_cap` | `wa_skip_ratecap` |
| 17 | gate | The workspace is paused (billing) | Held for a person | `paused` | `wa_skip_workspace_paused` |
| 18 | gate | Replies are set to Asks you or Stays quiet, for the workspace or for this person (decided with the three above, before the live hold and the budget are asked) | Held for a person (`person_hold` for a hold set on this person), told once a hold | `policy_block` | `wa_held_by_policy` |
| 19 | gate | A call in progress on the thread, or a person who took it over (00132) | Set aside: the call or the person has them, and the wire would refuse the words | none | `wa_refused_at_wire` |
| 20 | gate | The day of model tokens is spent (`limits.max_llm_tokens_day`), asked of a message bound for the model | Held for a person | `budget` | `wa_skip_budget` |
| 21 | gate | There is no persona, or the workspace's settings cannot be read or are broken | Held for a person, in words that say which: nothing is answered in a voice that may not be the business's | `policy_block` | `wa_held_by_policy` |
| 22 | gate | A photo the receptionist would look at, whose bytes could not be used | Handled as anything else that is not words | `non_text` | `wa_photo_not_seen` |
| 23 | gate | A newer message of the thread holds its reply turn (00284), asked as the turn is claimed and again before the words leave | Stopped: the newest message answers both | none | `wa_superseded` |
| 24 | step | The brain composes, by the job's deadline | No model key: the greeting, labelled a fallback, a person asked and the platform paged. An error, or past the deadline: the fallback words and `brain_error` | none |  |
| 25 | step | Layer two checks the words in code | A price it may not say is blocked (`policy_block`); money, and under Asks you a booking or a service question, are a person's (`policy_ask`) | none |  |
| 26 | gate | Veto, or a confidence below the owner's dial | The reply waits as a draft in the hold window, for a person to change or let go | none | `wa_reply_queued` |
| 27 | step | Everything else | Sent through the one send door (`deliver()`), which asks consent, the pause and the workspace's standing again at the wire; a handoff holds the thread and tells the owner | none |  |
