# 0092 · A call is proven every day, tells its owner once, and keeps only what it needs

**Status:** Built on the lane `cm-voice-ten` (`voice/to-a-ten`) from main's `6c4da4d1d`, 3 November 2026, on Ruben's word
("continue all lanes end to end"), from the plan `Claude Video/docs/2026-11-03-voice-to-a-ten.md`. Migrations 00519 and 00520
(working numbers until the push claims them). Not on main yet. The canary places no call until its four settings and the
GitHub secret are set; the shared secret stays open until `RETELL_DOORS_SIGNED` is set.

Written against commit `6c4da4d1d`.

## Context

The phone receptionist's design was sound: thin doors, pure plans, one row per call, the same gates and send door as
every message, a sweep that asks the provider rather than guessing. Production had held 63 calls by 3 November 2026,
none longer than two minutes, and what held it back was what nothing watched or proved:

- the owner's notice of a call was claimed before its mail went, so a mail that failed was lost behind the claim;
- a missed call left no line in the customer's thread, so the text receptionist did not know they rang;
- a spoken price's correction was held to once per server instance, not once per call;
- the provider's endings were three lists that disagreed, and nothing paged when a call ended our way (two real calls
  ended `credit_exhausted` on 6 October and nobody was told);
- nothing read the provider's limit on calls at once, which every workspace shares;
- shell drift was seen only by someone opening `/api/diag`, and converging an agent needed the provider key on a laptop;
- a call could run an hour, and the provider kept every call ninety days;
- every call row kept the provider's whole payload, readable by any member: the facts and the caller's memory the call
  was briefed with, the SIP headers, three more copies of the transcript;
- an erasure asked the provider to delete nothing;
- the shared secret was still open on three doors past its deadline, and the evidence to close it lived in a day of log.

## Decision

1. **A real call proves the whole road every day.** A GitHub schedule knocks `POST /api/voice-canary` with the
   canary's own key: the edge rings a workspace of ours from a platform number, played by a scripted caller, and ten
   minutes later judges what the call left (`judgeCanary`: the row, the facts composed, the analysis, the thread line,
   the notice claimed and told, the audio, the hold let go, the signature on the inbound door and the webhook). A
   failure pages the platform and opens one issue.
2. **The voice doors' evidence is rows.** Each knock let in is a `webhook.auth` row naming its door, once a minute per
   door and credential; `/api/diag` says each door's last seven days. `RETELL_DOORS_SIGNED` is set on that evidence.
3. **The shared secret follows the switch.** Once the signature alone opens the doors, nothing new is provisioned with
   the secret (no tool header, no `?key=`), the rehearsal and provisioning doors stop requiring it, and drift reads a
   header still carrying it as the drift. Removing the secret's code and its env is a later, small change after a
   clean week.
4. **The owner is told once, in full.** A call's notice is told under its name (`notifyOnce`, decision 0048): a mail
   that failed is owed, the delivery answers 503 so the provider redelivers, and the calls sweep finishes a notice the
   provider stopped retrying (`notice_told_at`).
5. **A missed call leaves its line** ("Missed call — they rang and it never connected.") as it ends, and the sweep
   writes one the webhook missed.
6. **A correction is once per call**, claimed on the row (`guard_corrected_at`).
7. **One table of the provider's endings** (contracts `voice/call-endings.ts`) gives the owner's words, the platform's,
   whose each is, whether Today calls it worth an ear, and whether it pages. The platform's own endings page at once.
8. **The provider is watched.** The health sweep reads the account's calls at once against its limit (pages at 80%),
   and once a day holds every live agent to the shell and its settings (pages on drift). The converger is the edge's
   door, now converging the LLM's shell too; the laptop script is its thin client.
9. **A call's limits.** Twenty minutes a call, thirty seconds of silence, a week at the provider (`CALL_LIMITS`): new
   agents are made with them and drift reads them on live agents.
10. **A call keeps only what it needs.** `scrub_call_raw` keeps an allowlist of the payload (ids, timings, status,
    cost, latency, token usage, the analysis, the metadata); the rows kept so far are cut the same way, and a live turn
    no longer rewrites the payload.
11. **An erasure reaches the provider.** Before the rows go, the person's calls are asked to be deleted at the provider
    (`POST /api/admin/erase-calls` from the route, the edge's own function from the finish job), best effort.
12. **Minutes are shown.** Settings › Billing says the month's call minutes. A plan's allowance and what happens past it
    wait for decision 0037's pricing.

## Product calls made here (Ruben's to reverse)

- **The heartbeat stays ten minutes.** The plan proposed two; a call can go quiet while it is still up (a hold, a warm
  transfer bridged to the owner), and the sweep only re-checks a quiet call every five to ten minutes, so a shorter bound
  would drop real calls from Live. Its comment now says so.
- **Recordings and transcripts stay readable by every member,** as today: a member who reads the transcript gains
  nothing by being refused the audio. Transcripts stay kept; the audio goes at ninety days.
- **The provider keeps a call a week.** Our copy is the record minutes after the call; the copy retries for two days.
- **No column grant on `calls`.** With the payload cut to the allowlist, it holds nothing a member cannot already read
  in the row's own columns.
- **Agents of workspaces that left are not deleted yet.** A preview's agent already is (decision 0079's sweep); a
  cancelled workspace's costs nothing at the provider, and deleting one is irreversible: left for a later change.
- **Search and paging of calls are unchanged.** A word search over the existing index matches whole words where the
  search box matches any part of one, and paging needs a "load more" on Conversations; no workspace has a hundred calls.

## Steps (either deploy order unless said)

1. Migrations 00519 and 00520 first: the two columns, the allowlist and its backfill, `ingest_call`, the wake rule,
   then the owed notices' index, built concurrently in its own file.
   An edge from before writes neither new column; this edge needs them.
2. The edge and the dashboard, together or in either order: the dashboard's erasure asks the edge's new door, and an
   edge without it answers 404, which the leg logs and passes.
3. Ruben: set `VOICE_CANARY_KEY` (the edge and the GitHub secret), `VOICE_CANARY_TENANT`, `VOICE_CANARY_FROM` and
   `VOICE_CANARY_CALLER_AGENT` (a scripted agent with no webhook); turn on auto-recharge at the provider; set
   `RETELL_DOORS_SIGNED=1` once `/api/diag`'s `retellAuth.doors` shows signed knocks on all three doors.
4. Converge every agent once from the edge (`tooling/scripts/ops/voice/voice-converge.mjs`, then `--apply --publish`),
   so the live agents take the call's limits and the week's retention.
