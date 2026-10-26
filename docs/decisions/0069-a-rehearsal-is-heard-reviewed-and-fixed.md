# 0069 · A rehearsal is heard, reviewed and fixed

**Status:** Decided 21 October 2026, and built on the lane `receptionist/hear-it-and-the-loop` from main's `9381ed0c3`,
brought onto main's `fbf72c019` on 22 October (Ask remembers, 0070, and the Supabase review had landed beside it).
These are lanes 1 and 2 of the onboarding rewiring plan (21 Oct 2026, "Hear it, fix it, go live"): R1, R6 and R2 (hear
it), R3, R4 and R5 (the loop). Ruben picked them on 21 October ("Build lanes 1 and 2 first"), with the plan's
recommendations for its decisions D1 and D3 to D7. The number is the next free one after 0068. Where this note and the
code disagree, the code wins.

## Context

An owner cannot hear the receptionist before paying for a number, and after any conversation, test or real, nothing
says how it did or lets them fix it there.

- **The agent exists only with a number.** The Retell LLM and agent are made inside the number's purchase
  (`voice-agent.ts`, from `lines.ts` and `voice-provision.ts`), and the voice row (`tenant_channels`, `external_id` = the
  agent) is written last, once a number answers. Ten readers take that row to mean "a phone line answers" (Connections,
  Setup, Live, the "you're live" email, the business tab's call rows, the public page, the diagnostic).
- **Nothing makes a browser call.** Retell's `POST /v3/create-web-call` takes the agent, its dynamic variables, a
  per-call `agent_override` and `metadata`, and answers an access token the browser joins with (`retell-client-js-sdk`).
- **Settings › How it answers has a typed Try it** (`receptionist/eval.ts` through `server/receptionist/try.ts`): the
  answer and why, six exchanges, nothing written. It cannot say whether an answer was right, and offers no fix.
- **The learning loop (0063)** turns a correction into a note to Keep, for text only, and refuses money, links,
  numbers and dates, which are exactly what an owner corrects after hearing a call.
- **What the receptionist knew is half kept.** Every saved version of the settings is kept whole
  (`tenant_config_versions`, 00402, decision 0039) and a text answer stamps the version it read (`BrainMeta`), but a call
  stamps none, so a call cannot be judged against what it knew.

## Decision

### Hear it

1. **The agent before the number (R1).** The workspace's Retell agent is kept on the workspace, in `voice_agents`, the
   first time it is needed: a rehearsal, or the number's purchase. `ensureVoiceAgent` reads the voice row's agent, else
   that row, else makes one and writes it there; the admin provisioning door adopts it. So a number bought after a
   rehearsal answers in the same agent, and the voice row still means what every reader takes it to mean: a line that
   answers. The plan's wording (a voice row with no number) is not taken: it would have taught ten readers a null.
2. **The config version on every conversation (R6).** A call carries the version it was composed from: the inbound
   webhook answers it as the call's `metadata`, and the call webhook writes it on the row (`calls.config_version`). A
   rehearsal keeps its version and the exact instructions it heard. "What it knew then" and "It now reads" are two
   compositions of two kept versions (`tenant_config_versions`).
3. **The browser call (R2).** Settings asks the edge for a call (`POST /api/admin/rehearsal/call`): the workspace's
   agent (made when there is none), the same plan a real call gets (`planCallStart`: the facts, the greeting, the
   voice) with no caller memory, `agent_override` for the voice and the call's length, and `metadata` naming the
   rehearsal. The rehearsal row is written before the token is answered. The browser joins through the vendor's client,
   loaded on the press (its own chunk), with its one request routed through our route, so no key reaches the browser.
4. **A test call is honest (D4).** A web call is a rehearsal wherever it arrives (`call_type: web_call`; every web call
   on the account is one of ours or the provider's own test): the call webhook keeps it out of the call pipeline (no row
   in `calls`, no note, no escalation, no email, nothing in People or Reports) and writes its transcript, its end and its
   seconds on the rehearsal; the booking-link tool sends nothing and answers that the link is shown on screen; a
   transfer dials nobody and says a person would take it now; the open times are read as on a real call.
5. **Free minutes (D1).** Three minutes a call. Before a plan, ten minutes a workspace, then "Go live to keep talking";
   with a plan, sixty minutes in thirty days. Typing stays free. The seconds are the provider's (`call_ended`), so a tab
   closed mid-call is still counted.
6. **The live transcript** comes from our own webhook: each `transcript_updated` delivery rewrites the rehearsal's
   transcript, and the page reads the rehearsal every two seconds while its call runs (three minutes at most), and once
   at its end. The vendor's own transcript stream needs a key in the browser, which is refused; and no other page hears a
   rehearsal, so it is not a table the workspace is told about.

### The loop

7. **The review (R3).** `POST /api/admin/rehearsal/review` judges a conversation, a rehearsal (spoken or typed) or a real
   call, against the instructions it had: each exchange gets one verdict, **Right** (from a fact in the instructions,
   with the block it came from), **Rule** (held by a switch), **Guessed** (nothing in the instructions to stand on: shown
   first, D5), **Didn't know** (it said so; the fact is missing) or **Off** (right facts, wrong manner), with one sentence
   why and the fix it calls for. One Sonnet call per conversation (purpose `receptionist_review`, D3), under the usage
   ledger. Code checks the answer as the learning loop checks its model: a quote of what the receptionist said must be in
   the transcript, a quote of the instructions must be in them, or the verdict is dropped. A review is kept on its
   rehearsal, so a second look costs nothing.
8. **The fix router (R4).** The owner's correction under an answer becomes one settings change, in the field the
   composer reads: a day's hours (`set_hours`), a date (`add_closure`), a service with its minutes and price
   (`add_service`, or `set_service` for one already listed), the booking link (`set_booking_link`), a fact (`add_note`),
   the manner (`set_tone`, `add_own_words`), "put X through to me" (`add_escalate_when`, new), a switch
   (`set_guardrail`, new), the languages (`set_languages`). Deterministic where the words decide (a time, a date, an
   amount, a link); the model's where they do not (purpose `fix_route`, Haiku, D3), its answer checked in code. The
   owner sees the field before Keep ("Add to Services: Balayage · $180 · about 3 h").
9. **Keep, then It now reads.** Keep is the settings' own write (the schema, the version check, the history and
   `settings.changed` with `via: rehearsal` or `via: call_review`), and it answers the block that changed, before and
   after, from the two versions' compositions. One change per Keep, kept on the rehearsal, so the count ("Trained: 3
   things") is read from there.
10. **Try again.** A typed rehearsal asks the same questions again with the new instructions, old and new answers side
    by side; a spoken one offers the questions as chips for the next call.
11. **One surface (R5, D6, D7).** One component draws all of it, in two places in this change: Settings › How it
    answers, where Rehearse replaces Try it (talk or type), and a real call in its thread, as "Review this call". The
    first run's own step 3 is the rewiring's R8 (lane 3), which draws the same component.

## Consequences

- **Tables:** `voice_agents` (the workspace's agent at the provider: one row each, the service role writes, members
  read), `rehearsals` (one per conversation rehearsed or call reviewed: its kind, the provider's call id, the agent, the
  version and instructions it ran on, its transcript, seconds, end, review and kept fixes; members read, the doors
  write), and `calls.config_version`. `ai_usage` purposes `receptionist_review` and `fix_route`. One migration,
  `00476` (00470 is Ask remembers', decision 0070, 00471 and 00472 the Supabase review's, 00473 to 00475 Leads' first day's and Need you's), whose
  purpose check restates 00470's set with the two.
  A fix kept is appended by the member's own door, `rehearsal_fix_keep` (00481), which asks that they may change the
  settings and writes `settings.fix_kept`; at first the dashboard appended it through the service role.
- **Doors:** the edge's `rehearsal/call`, `rehearsal/review` and `rehearsal/fix` (admin doors with a member's token, as
  eval's); the dashboard's `POST receptionist/rehearsals` (start), `GET receptionist/rehearsals/[id]` (its words, read
  while the call runs), `POST receptionist/review` (a rehearsal, a real call or typed turns), `POST receptionist/fix`
  (where a correction goes, nothing written) and `POST receptionist/keep`. Rates `receptionist_call` and
  `receptionist_review`, and Keep the settings' own; spend gated as Try it is.
- **The browser:** `retell-client-js-sdk` 3.0.2 (ISC), in the dashboard, behind `legacy-bridge/rehearse/call.ts`, loaded
  on the press. Its signalling goes to `https://api.retellai.com` (the CSP's `connect-src`); the microphone is already
  `self`.
- **Erasure:** a reviewed real call's rehearsal row keys the call (`on delete cascade`), so erasing the person, which
  deletes their calls, removes it. A rehearsal is the owner's own words and leaves with the workspace.

## Owed

- The first run's Rehearse step (R8, lane 3), and pace (R7).
- An eval of the review on real rehearsals, once there are some (the eval key, said first).
- A spoken "Try again" that replays the questions itself (today they are chips for the next call).
