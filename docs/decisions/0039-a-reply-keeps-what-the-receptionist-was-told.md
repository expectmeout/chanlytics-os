# 0039 · A reply keeps what the receptionist was told

**Status:** Decided on 9 October 2026 (Ruben: "all approved as you best suggest"). Steps 1 to 4 built with this note
(00401, 00402), step 4 as far as it goes without asking a model. Steps 5 and 6 to come: 5 waits on a model key for the
evals, which is Ruben's to set, and 6 on a month of kept turns.

Written against commit `d09bed1c9` (main, 9 October 2026), and every file and line below was read at it.

## Context

A reply the receptionist wrote cannot be read again. What is kept of a turn:

- the words, in `messages.body`, and the model's own record of them in `messages.meta`: intent, confidence, reason,
  facts used, language, the model, and two pointers, `prompt_hash` and `config_version`
  (`packages/contracts/src/config/brain.ts:107`, written by `packages/core/src/inbound/dispatch.ts`);
- one row of the usage ledger, `ai_usage`: tokens, dollars, the model and the same `prompt_hash` (00273).

Neither pointer opens anything. The hash names a prompt whose text is kept nowhere, and `config_version` names a row of
`tenant_config` that the next save overwrites; a writer that does not move the version (the nightly's seed,
`tooling/scripts/ops/e2e-workspace.mjs`) leaves two different configs under one number. The prompt is not the config
anyway: `resolveSystemPrompt` composes it from the config, the timezone, today's closures, the autonomy rows and the
provisioned facts (`packages/core/src/inbound/model-turn.ts:120`).

Beside the prompt the model reads three things that are gone the moment the turn ends
(`apps/edge/lib/receptionist/brain.ts:207-214`): who the person is (their notes, their deal, what they answered about
offers, their visits), the clock and the open times, and an owner's steer. The person's part is built from records that
change: a note kept tomorrow was not there today.

So three things cannot be done. An owner who asks why the receptionist said something on Tuesday cannot be shown what
it was told on Tuesday. A change to a prompt or to the composer cannot be tried against what customers really wrote,
because the turns it would be tried on are not kept. And the evals are written from imagination: none comes from a
reply an owner corrected, and of the nightly's twenty cases (`tooling/evals/nightly-cases.json`) none says what a right
answer holds, so a model that hands every customer to a person passes all of them
(`tooling/scripts/tests/ai/nightly-evals.test.mjs`, "a neutral hand-off reads right on every case").

## Decision

**A receptionist's turn is kept as the model read it, for thirty days, and the text of every prompt is kept once.**

Two tables, both written by one function the model port alone calls (`model_turn_keep`), both closed to every session:

- `model_prompts (tenant_id, prompt_hash, text, first_seen_at, last_seen_at)`: the composed system prompt, once per
  text. It is the business's own facts as the receptionist was given them; nothing of the person is in it (they are a
  separate block). Kept while it is in use and `RETENTION_DAYS.model_prompts` after (400, the ledger's own keep, so a
  kept turn's row of `ai_usage` opens its prompt for as long as the row stands). Its clock is moved by a turn at most
  once a day.
- `model_turns (id, tenant_id, conversation_id, prompt_hash, request, response, model, latency_ms, created_at)`: one
  turn about one conversation. `request` is what the model read beside the prompt (contracts `ModelTurnRequest`): the
  clock and open times, who the person is, an owner's steer, and the thread's turns as they were sent; a photo is said
  by its type and never kept. `response` is the model's own answer before layer two (`steps.ts` `layerTwo`) replaced
  any of it (contracts `ModelTurnResponse`): its words as they came, and beside them the record the platform read from
  those words, which caps a reason and the facts and makes an intent it does not know "other". Where the two differ the
  words are what the model wrote. A held reply and a holding reply can be read too. Null where no answer came. Kept
  `RETENTION_DAYS.model_turns` (30, the evidence ledger's keep).

**The reply names its turn**: `messages.meta.turn_id` (`BrainMeta.turn_id`), set only once the turn is kept. Two kinds
of turn have no row to carry the name and are found among their conversation's (`turn-read.mjs --conversation`): a
holding reply, which has no record and so no meta, and a lead's drafted reply, whose draft keeps its words alone
(`apps/edge/lib/reach-out/reply-draft.ts`).

**What is personal, and how it leaves.** A turn holds the person's words and the team's notes about them. It leaves
three ways, each proved on a real database:

- with its conversation: it is keyed to it in its own workspace (`(tenant_id, conversation_id)`, the house fence, 00279) on delete cascade, and an erasure deletes the person's conversations (`erase_contact`);
- with an erasure of anyone it names: `model_turns_scrub` deletes the workspace's turns, in anyone's thread, that spell
  the person's number or address (a note about another customer that named this one), by the needles the erasure
  already carries, fail-closed before the rows go and again after
  (`apps/dashboard/src/server/people/erase-contact.ts`; `erasure-completeness.db.test.mjs` plants both and finds none);
- by age: `purge_model_turns`, nightly, on a registered clock judged by its run, so a night it does not run is a page
  (`sweep_status`, as the other purges).

A prompt holds the business's facts; it leaves by its clock (`purge_model_prompts`, on the same job).

**Only a turn about a conversation is kept.** The port keeps a turn where its caller names the conversation it answers
(`BrainCall.subjectId`): the receptionist's own turn, an owner's steer of a held draft, and a lead's drafted reply. The
eval door names none; it keeps its ledger row and nothing more. The reads and drafts that do not go through the
receptionist's door are not turns (below).

**Keeping a turn never costs the answer.** It is the port's last act, waited on no longer than a second and a half
(`MODEL_TURN_WRITE_MS`), and a write that fails or is left behind is a log line (`model_turn_write_failed`); the reply
has been composed by then and goes as it would have, without a turn to name. It is one write on the reply's path, as
the usage ledger's row is. When the model itself gave no answer, the turn is kept as it was put and the failure goes on
to the caller, who sends the holding reply as before, later by that one write at most.

**No session reads either table yet.** Row security is on with no policy, and the grants are the service role's. The
first reader is the operator's (`tooling/scripts/ops/turn-read.mjs`, read only). An owner's own view of a reply ("what
it was told") is a page's decision, taken when a page asks for it; it will need a policy and a route, not a change
here.

## What this is not

- **Not the settings' history.** What an owner changed and when is a record of its own (step 3, and
  `settings.changed` before it). The prompt's text answers "what was it told"; it does not answer "who changed the
  hours".
- **Not Ask.** Ask keeps its turn already, in `ask_messages.content.raw`, under its own ninety days.
- **Not a trace of every model call.** The reads and drafts on Haiku and Sonnet (`reply_read`, `note_suggest`,
  `booking_read`, the lead judge, the review reply) keep their ledger row, and the `prompt_hash` on it opens nothing.
  Each can join later by naming a conversation and its request's shape.

## Steps

Each ships in either deploy order.

1. **The tables** (00401): `model_prompts`, `model_turns`, the write (`model_turn_keep`), the two clocks on one nightly
   job (`purge_model_turns`, `purge_model_prompts`; `sweep_status` `purge_model_turns`), an erasure's hand
   (`model_turns_scrub`), the erasure registry, the workspace-delete backup, the tenancy suite. **Built.**
2. **The port writes them.** `generateReply` keeps the prompt and the turn where it is given a conversation and stamps
   `turn_id` on the record once the turn is kept; the erasure route scrubs the turns that name the person; the privacy
   page states both keeps; `turn-read.mjs` prints a reply's turn. An edge deployed before the migration logs
   `model_turn_write_failed` once a turn and answers as before; a dashboard deployed before it erases as before (a
   database with no turns has none to scrub); a dashboard older than the edge reads a meta with one more key.
   **Built.**
3. **The settings keep what they said** (00402). Read at this commit: a save already writes `settings.changed` with
   the names of the fields that moved and who moved them, and Settings › Activity says so
   (`apps/dashboard/src/server/workspace/settings-write.ts:41`, `packages/contracts/src/workspace/activity.ts:635`). It
   is written after the save, best effort, by two of the three callers, and it carries no value. Added: the values.
   `tenant_config_versions` keeps the settings as they stood at each version, written by a trigger on `tenant_config`
   in the save's own transaction, so every writer is held to it, with who brought the version (the session's own user,
   else the name the write set, else nobody). The version is now the database's: a config that changed takes the next
   number whatever its writer sent, and a number never goes back, so a version names one config and
   `config_version` on a reply opens the settings it names (`turn-read.mjs --message` says them). A version is kept
   while it is in force and `RETENTION_DAYS.tenant_config_versions` (400) after it is replaced, by a nightly clock of
   its own (`purge_config_versions`), which the privacy page states; old settings can hold a calendar link, the alert
   addresses and an owner's notes, so no session reads the table. Activity's words are as they were: showing a value
   that changed, or a way back to it, is a page's decision. **Built.**
4. **The evals know a right answer.** The nightly already asks a made-up business's composed prompt of a sandbox key
   (`tooling/evals/nightly-workspace.json`, `tooling/scripts/evals/nightly.mjs`). Added: ten cases whose answer is a
   fact of that business (an hour, a closed day, the address, a service, how long one takes, the booking link), and the
   judge's `grounded`: an answer that is a fact names a fact it relied on (`facts_used`). A new case is on trial
   (`provisional`): asked and reported, and counted in neither the bound nor the gate until a run has held it and what
   was said has been read. **Built; never asked of a model**, which needs `ANTHROPIC_EVAL_KEY` (Ruben's). Promoting the
   cases is the first act once a run exists.
5. **A customer's words are fenced.** The receptionist's `user` turns go to the model as Ask's page data does
   (`packages/contracts/src/ai/fence.ts`). It changes what the model reads on every message, so it ships only with
   step 4's cases held before and after. **Not built.**
6. **A corrected reply becomes a case.** Once a month of turns is kept: the turns an owner steered, and the ones handed
   to a person, redacted (`packages/channels/src/log/redact.ts`), written as cases on trial for review. Nothing enters
   the eval set unread. **Not built**: there is no kept turn to write one from yet.

## Open

- Whether an owner sees what a setting said before a change, and may put it back (step 3 keeps the values; no page
  reads them). How long they are kept was decided with step 3: 400 days after a version is replaced, the version in
  force always (Ruben, 9 October 2026: "whatever you suggest best is fine").
- Whether an owner sees "what it was told" on a reply, and which roles. Not decided here.
- Whether thirty days is the right keep once step 6 runs monthly. It is the evidence ledger's keep, chosen so the
  privacy page says one number for one kind of thing.
- The order of the two deploys at step 2's merge: the migration first is the quiet order (an edge ahead of it logs one
  error a turn until it lands).
