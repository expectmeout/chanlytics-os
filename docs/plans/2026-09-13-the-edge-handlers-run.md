# The edge handlers run

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **One task per session.** Each task below is sized to be held whole in one head; do not start the next in the same session.

**Goal:** Every handler in `apps/edge/api` that a customer, a provider or the scheduler can reach is *executed* by a test — a `Request` in, a `Response` out, over a database in memory and a captured `fetch` — and the source pins that held its text are deleted in the same PR, with the ratchet baseline banked. The path a real customer's message travels stops being the least-executed layer in the repository.

**Architecture:** Nothing new is invented. The harness already exists and four handlers already use it: `setPg()` hands a handler a fake database (`apps/edge/lib/pg.ts:22`), `fakeDb()` answers from memory and records every query (`tooling/scripts/tests/_fake-db.mjs`), `globalThis.fetch` is captured for the provider, env is set before the module is imported, and the handler's exported `POST`/`GET` is called with a `new Request(...)`. Precedents to copy: `billing-webhook.test.mjs` (a signed provider webhook over `fakeDb`), `call-controls.test.mjs` (admin doors behind a signed token, `fetch` captured), `cron-auth.test.mjs` (the cron door with the Vault rpc faked), `health-route.test.mjs`, and `inbound-executed.test.mjs` (the customer path with its world handed in through `InboundPorts`). One seam serves the two doors that call `handleInbound`, added in Task A (#476) and reused in Task B, and it is not a parameter: `setInboundPorts(p | null)` in `apps/edge/lib/whatsapp/ports.ts`, mirroring `setPg`. While a world is set, `realPorts()` answers with it; `handleInbound` falls back to `realPorts()` when a door passes no ports, and neither door passes any, so a test calls the door exactly as production does and no handler changes. *Corrected 14 Sep 2026:* this paragraph first proposed a second `POST` parameter, `ports = realPorts()`, and that is unsafe. Vercel does not call a method export with the request alone: its Node runtime wraps each one with `@edge-runtime/node-utils`, which calls `webHandler(request, new FetchEvent(request))`. The default would never apply in production; the handler would be handed the FetchEvent as its ports, and every message would throw inside the door's own catch and still be acknowledged. For the same reason every door test calls `POST(request, { waitUntil: () => {} })`, with the second argument production passes.

**Tech stack:** `node:test` under `tsx` (`corepack pnpm test`; one file: `node --conditions=react-server --import tsx --test tooling/scripts/tests/<file>.test.mjs`). `pnpm` is corepack-only. No package changes are expected, so `packages/*/dist` stays untouched; if a task does change a package, rebuild and commit `dist` (CI diffs it).

**Rules (house, and the ones this plan adds):**

- **Never add a `readCode`/`readRaw`.** The ratchet (`source-scan-ratchet.test.mjs`, `source-scan-baseline.json`) fails a file whose count rises. When a behaviour test lands, the pins it replaces are **deleted in the same PR** and the baseline is banked: `UPDATE_SOURCE_SCAN_BASELINE=1 corepack pnpm test`. A reduction that is not banked fails "the baseline is not stale". Files in the baseline's `lint` list (`ops-hygiene`, `hygiene`, `env-manifest`, `event-kinds`, `e2e-shape`, `workspace-scoping`, `runtime-freshness`) are repo-wide lints: leave their pins alone.
- **No new `process.env` read without a line in `apps/edge/.env.example`** (`env-manifest.test.mjs` pins the manifest). The seam adds none.
- **Assert what the world sees**, never internals: the status and body the provider hears, the rows written (`db.seen`), what left on the captured `fetch`, the `notifications`/`events`/`operator_pages` rows, the log line a person would search for (`fakeLog()`). A source scan is only ever replaced by a stronger assertion.
- **Every case owns its identifiers.** Two caches live in module state and neither can be reset from a test: the channel resolver keeps a routing answer for five minutes (a miss for sixty seconds; errors are never cached) keyed by kind and external id (`packages/db/src/repositories/routing.ts:16-20`), and `alertUnroutable` suppresses a repeat alert for fifteen minutes per `${kind}:${key}` (`apps/edge/lib/whatsapp/alerts.ts`). `sms-ingress.test.mjs` states the rule and the reason: a second case sharing a number reads the first's answer and passes while proving nothing. Use a fresh `phone_number_id` / agent id / number per case.
- **Set env before the import, in the test file's module scope.** Each test file is its own process. `store.ts` reads `BLOB_READ_WRITE_TOKEN` and `BLOB_SHADOW` at import (`apps/edge/lib/store.ts:56,58`): set `BLOB_SHADOW=off` so `storeBackend()` is `"off"` and nothing reaches Vercel Blob. `diag.ts:16` reads `META_APP_ID` at import.
- **Mail is `fetch`.** `notify()` → `post()` (`apps/edge/lib/notify.ts:82`) POSTs to Resend only when `RESEND_API_KEY` is set; unset, it logs `notify_skipped_no_api_key` and returns `false`. To assert "a human was told", set `RESEND_API_KEY`, `LEAD_TO`, `LEAD_FROM` and capture `fetch`; to keep a case quiet, leave the key unset.
- **The retired doors are not tested.** `jobs/fire.ts`, `admin/backfill.ts`, `admin/backfill-calls.ts`, `admin/pause.ts` have no caller and are slated for deletion under the system map's item 8. Do not write tests for them; do not delete them here either.
- **Commit messages** are one sentence in the house voice, no prefix. Every PR is green on `corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test`.

---

## Why (measured 13 September 2026, `763cd6a`)

41 handler files. Executed by a test: `health.ts` (`GET` and `judgeHealth`), `stripe-webhook.ts`, `admin/hand-over.ts`, `admin/stop-call.ts`; `retell-availability.ts` only lends its `spoken` helper — its `POST` is never invoked. 33 are pinned by text: 100 `readCode`/`readRaw` calls in 35 test files, including `whatsapp.ts` (6), `inbound-sms.ts` (3), `retell-webhook.ts` (13), `diag.ts` (11), `admin/lines.ts` (12), `jobs/tick.ts` (1) and all eight crons (16). Three are touched by nothing: `admin/backfill.ts`, `admin/signup-notify.ts`, `jobs/fire.ts`.

The libraries under those handlers are well executed (31 of 52 files in `apps/edge/lib`, `handleInbound` itself through `inbound-executed.test.mjs`, `planSmsIngress` through `sms-ingress.test.mjs`, `runTick` through the jobs tests). What has never run is the *binding*: the door, the routing, the branch that decides 200 from 503, the alert, the wire. That is exactly where the last two release blockers lived.

## The doors, in one table

| Door | Knock | Refusals |
|---|---|---|
| `whatsapp.ts` POST | `x-hub-signature-256: sha256=<hmac-sha256(META_APP_SECRET, raw body)>` | no secret → 401 `bad_signature`; bad sig → 401 |
| `whatsapp.ts` GET | `?hub.mode=subscribe&hub.verify_token=<WHATSAPP_VERIFY_TOKEN>&hub.challenge=x` | 200 challenge, else 403 `verification failed` |
| `inbound-sms.ts` POST | form body; `x-twilio-signature` checked inside `planSmsIngress` with the line's vault token (`get_line_credentials` rpc); the `dry` provider signs nothing | decided by the planner: 400/403/404/503/200 TwiML |
| cron `*.ts` POST, `jobs/tick.ts` POST | `x-cron-key: <key>` compared with `db.rpc("get_cron_sweep_key")` | rpc error/empty → 503 `key_unavailable`; mismatch → 401 `unauthorized`; no db → 503 `no_database` |
| `admin/*.ts`, `diag.ts` | `x-edge-token: signEdgeToken(EDGE_CALL_SECRET, aud, { workspace, user })` (aud is the door's path, e.g. `/api/admin/steer`), or `x-diag-key: <DIAG_KEY>` when no secret/token | 403 `token_<reason>` / 403 |
| `retell-webhook.ts` POST | `x-retell-signature: v=<ms>,d=<hex>` where hex = hmac-sha256(`RETELL_WEBHOOK_KEY` ∥ `RETELL_API_KEY`, raw body + ms), ms within 5 min (`packages/channels/src/voice-retell.ts:534`); or `?key=<RETELL_FN_SECRET>` (non-empty) | both fail → 401 `unauthorized`; a refused delivery writes one `webhook.auth` evidence row per minute per instance |
| `retell-fn.ts` POST | header `x-fn-secret` === `RETELL_FN_SECRET` | 401 `bad_secret` |
| `retell-inbound.ts` POST | `?key=` === `RETELL_FN_SECRET` | 401 |

The rpcs a door may reach, to hand `fakeDb` as its third argument (anything unmodelled throws by name — that is the double telling you what to model): `get_cron_sweep_key` (cron-auth) · `claim_due_jobs` (ledger) · `sweep_health`, `jobs_backlog` (health, diag, cron/health) · `sweep_mark_alerted` (cron/health) · `deadman_candidates`, `deadman_mark_alerted` (cron/deadman) · `note_sweep_backlog` (sweep-rotation) · `people_list` (playbooks) · `get_channel_credentials`, `runtime_stamp` (tenant-runtime) · `get_line_credentials`, `put_line_credentials` (sms, lines) · `get_google_credentials`, `put_google_credentials`, `drop_google_credentials` (google) · `put_channel_credentials` (whatsapp/connect) · `ingest_call` (calls repository) · `ingest_inbound`, `mark_processed`, `set_marketing_consent` (ingest repository) · `number_drift` (diag).

Module state to respect: `retell-webhook.ts:64` `corrected` (a Set), `:71-72` `lastRefusedAuthRow` (a refused delivery is recorded at most once a minute — order the refusal cases so the first asserts the row and the second asserts its absence); `admin/llm.ts:34` `budgetSeen`; the two caches above.

---

## Task A — The WhatsApp door

**Session 1 of 8.** `apps/edge/api/whatsapp.ts` (242 lines): the live customer path.

**Files:**
- Modify: `apps/edge/lib/whatsapp/ports.ts` — a module-level `setInboundPorts(p | null)` mirroring `setPg`, consulted by `realPorts()`. `apps/edge/api/whatsapp.ts` is not modified. *(Corrected 14 Sep 2026: this line first proposed `POST(request: Request, ports: InboundPorts = realPorts())`, with the module-level door as the fallback. The fallback is the only safe seam, because Vercel calls `POST(request, new FetchEvent(request))` and a defaulted second parameter would never apply in production; see Architecture. #476 shipped the module-level door.)*
- Create: `tooling/scripts/tests/whatsapp-door.test.mjs`
- Modify (pins that move): `settings-truth.test.mjs:65-68` (the echo honours the tenant's `pause_hours`), `store-retired.test.mjs:54-55` (with the store off, an echo writes no thread and still records the pause row; `:56` pins the file's contract sentence and may stay), `whatsapp-connect.test.mjs:127-129` (a WABA field is handled before any number routing), `whatsapp-steps.test.mjs:92-93` (the file exports `GET` and `POST` — redundant once both are imported and run; delete). `ops-hygiene.test.mjs` is a lint: leave it.
- Modify: `tooling/scripts/tests/source-scan-baseline.json` (banked, not edited by hand).

**The world:** env before import — `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_ID` (the env-default number), `BLOB_SHADOW=off`; `RESEND_API_KEY`/`LEAD_TO`/`LEAD_FROM` only in the cases that assert an alert. `setPg(fakeDb({ tenant_channels, tenants, events, notifications, ... }))`. Build the `ports` world as `inbound-executed.test.mjs` does (`world()` there is the shape; its `brain` throws so the model is never reached). Sign each body with `crypto.createHmac("sha256", secret).update(raw).digest("hex")`.

- [x] **Step 1: the two refusals and the handshake.** No `META_APP_SECRET` → 401 and `db.seen` empty; a wrong signature → 401 and nothing read; GET with the right verify token answers the challenge, a wrong one 403.
- [x] **Step 2: routing.** A change whose `metadata.phone_number_id` is an active `tenant_channels` row routes to that workspace and `handleInbound` runs with the routed channel (assert through the fake sink: the reply left on the wire for that tenant). A number the database *answers* is not ours → `wa_unroutable`: an `ingest.unroutable` event row under the platform tenant, an alert, 200, and `handleInbound` not called. A lookup that *fails* (`faults: { "tenant_channels.select": ... }`) on a non-default number → `whatsapp_unreadable` alert, **503** with `unrecorded`; the same failure on the env-default number rides its baked profile and keeps its 200.
- [x] **Step 3: the account's own news.** A `changes[].field` in `WABA_FIELDS` with `entry.id` set is handled by `handleWabaChange` and never consults phone routing (no `tenant_channels` select for a phone id in `db.seen`).
- [x] **Step 4: statuses and echoes.** A `statuses` batch records `sent/delivered/read/failed` by external id for the routed tenant only; an `smb_message_echoes` batch records the pause with the tenant's `pause_hours` (from `policy.reply.limits`) and, with the store off, touches no thread.
- [x] **Step 5: the ack rule.** A batch in which one message's ingest throws `IngestFailed` answers 503 with `unrecorded: 1` while the other messages in the batch were still handled (assert both were passed to the sink); any other throw inside a message is logged and the batch is still 200.
- [x] **Step 6: delete the pins listed above, bank the baseline, run the full suite.** Expect the count for `whatsapp.ts` in the handler→pins map to fall from 6 to the one exempt read.

## Task B — The SMS door and the ledger's heartbeat

**Session 2 of 8.** `apps/edge/api/inbound-sms.ts` (86 lines) and `apps/edge/api/jobs/tick.ts` (97 lines). Independent of Task A's tests; it reuses Task A's seam, `setInboundPorts`, and changes no handler.

**Files:**
- No handler is modified. *(Corrected 14 Sep 2026: this line first proposed `POST(request, ports = realPorts())` in `apps/edge/api/inbound-sms.ts`, passed as `handleInbound`'s eighth argument, and Vercel's FetchEvent makes that unsafe; see Architecture.)* The door already passes `handleInbound` no ports, so the world a test sets with `setInboundPorts` is what `realPorts()` answers with, and the test calls `POST(request, { waitUntil: () => {} })` as production does.
- Create: `tooling/scripts/tests/sms-door.test.mjs`, `tooling/scripts/tests/jobs-tick-door.test.mjs`
- Modify (pins that move, lines as measured on 14 Sep): `sms.test.mjs:170` (the call's text), `:175` (the read of the door behind `:181`, the call's text again, and `:182`, the empty TwiML), `:209` (the tick's sms wire). `ops-hygiene.test.mjs:84` is a lint: leave it.

**The world (SMS):** `planSmsIngress` is already executed by `sms-ingress.test.mjs` — copy its `lineRow`/`channelRow`/`form`/`world` builders and its `twilioSignature` use. What is new here is the wire: the form is parsed, a missing `pg()` → 503 TwiML, a `refuse` verdict → its status as TwiML with `alertUnroutable` called (or not, for the forged signature), an `accept` → `handleInbound` with `smsAsWaMessage(inbound)`, the routed tenant, `false, false`, and a carrier that is held or sends on the line; a throw from `handleInbound` → `smsAfterThrow`: 503 for `IngestFailed`, 200 otherwise. Every response body is the empty TwiML with `content-type: text/xml`. The receptionist's world is handed in through `setInboundPorts`, as `whatsapp-door.test.mjs` hands it.

**The world (tick):** rpcs `get_cron_sweep_key`, `claim_due_jobs` (return one claimed `outbound_send` row, then nothing); tables `jobs`, `tenant_channels`, `lines`, `messages`, `events`, `operator_pages`, `notifications`; `get_channel_credentials`/`get_line_credentials` for the wires; `fetch` captured for the Meta Graph send. `runTick` is executed in the jobs tests — assert the *binding*: the door (401/503), `no_database` 503, the claim throwing → 503 `jobs_tick_failed`, a job dispatched with the **tenant's** WhatsApp credentials (the captured `fetch` carries that tenant's token, never the environment's), a texting workspace's job sent on its line with `+` prefixed, and `counts.failed + gaveUp ≥ 10` paging `jobs_mass_failure` once.

- [x] **Step 1: SMS — the wire around the planner.** Cases: unparseable form → 400; no db → 503; each refusal status passes through as TwiML and pages (or, for the forged signature, pages nobody); a held line's text reaches `handleInbound` with `carrier.held` set and is escalated, not answered; an active line's text is answered on the carrier.
- [x] **Step 2: replace `sms.test.mjs:170`/`:175`** with the executed assertion that the allowlist and env-default flags are `false` on the SMS road (the fake sink records `allowlistSkip` never being called for a text).
- [x] **Step 3: the heartbeat.** The cases above; then delete `sms.test.mjs:209`.
- [x] **Step 4: bank, full suite.**

## Task C — The voice webhook

**Session 3 of 8.** `apps/edge/api/retell-webhook.ts` (464 lines; 13 pins in 12 files — the most-pinned handler in the repository).

**Files:**
- Create: `tooling/scripts/tests/retell-webhook-door.test.mjs`
- Modify (pins that move, one executed case each): `call-lifecycle.test.mjs:166`, `call-outcomes.test.mjs:123,158`, `calls-hardening.test.mjs:23`, `doors-and-rows.test.mjs:93`, `forwarding.test.mjs:146`, `notifications-durable.test.mjs:49`, `polish.test.mjs:38`, `store-retired.test.mjs:57`, `webhook-auth-evidence.test.mjs:48`, `webhook-delivery.test.mjs:18`, `webhook-transcript-source.test.mjs:34`, `whisper-voice.test.mjs:33`. Read each pin's intent first; the executed case must prove the same thing or more.

**The world:** env — `RETELL_WEBHOOK_KEY`, `RETELL_FN_SECRET`, `BLOB_SHADOW=off`; tables `tenant_channels` (kind `voice`, external id = agent id), `calls`, `conversations`, `messages`, `escalations`, `events`, `notifications`, `lines` (forwarding); rpcs `ingest_call`, `get_channel_credentials`, `runtime_stamp`; `fetch` captured for the recording copy and mail. Sign with `v=${Date.now()},d=${hmac}`. The post-auth path (`retell-webhook.ts:215-330`): `transcript_updated` marks an ongoing call; a call routes by agent id or, failing that, by a known call id; unrouted → `ingest.unroutable` event; routed → `ingestCall`, `markForwardingVerified` on an inbound call, `recordDelivery`, a call note on `call_analyzed` (and `linkCallMessage`), a `callback_needed` analysis pausing the conversation for the tenant's hours and opening a `callback` escalation.

- [ ] **Step 1: the door.** A valid signature over the raw body opens it; one that verifies only over the re-stringified body opens it and is recorded as such; `?key=` opens it when set and never when `RETELL_FN_SECRET` is empty; both failing → 401, with **one** `webhook.auth` row for two refusals inside a minute (module throttle — order these cases deliberately).
- [ ] **Step 2: routing and the record.** Unknown agent and unknown call → unroutable event, 200; known agent → `ingest_call` called with the normalised call; inbound → forwarding marked verified; every delivery → its `webhook.delivery` evidence row.
- [ ] **Step 3: the analysis.** `call_analyzed` writes the call note and links it; `callback_needed` pauses for `pause_hours` and opens one `callback` escalation; the owner is told (a `notifications` row of kind `call`; mail when addressed).
- [ ] **Step 4: delete the thirteen pins, bank, full suite.**

## Task D — The call-start door and the function bridge

**Session 4 of 8.** `apps/edge/api/retell-inbound.ts` (84 lines) and `apps/edge/api/retell-fn.ts` (273 lines).

**Files:**
- Create: `tooling/scripts/tests/retell-inbound-door.test.mjs`, `tooling/scripts/tests/retell-fn-door.test.mjs`
- Modify (pins that move): `doors-and-rows.test.mjs:101` (retell-inbound); `billing-pause.test.mjs:55`, `facts.test.mjs:225`, `marketing-consent.test.mjs:353`, `person-mode-enforcement.test.mjs:28`, `phone.test.mjs:77` (retell-fn).

**The world:** `planCallStart` is executed already (`call-start` tests) — for the door assert the 401, the `dynamic_variables` shape for a routed agent, the `unrouted`/`missing` warnings, and that the alert is *awaited* but bounded (a `fetch` that never resolves must not hold the answer past ~3 s — use a fake timer or a slow `fetch` and assert the response arrives). For `retell-fn`: `x-fn-secret`; an unparseable number → the "read it back" result; no db / no agent → `CANNOT_SEND`; unknown agent → `CANNOT_SEND`; a routed agent → `loadTenantRuntime`, `resolveOutboundTarget`, `personReplyMode`, `countSentToday`, then `outboundGate` (executed already) → a refusal script or `deliver` on the **tenant's** WhatsApp credentials (captured `fetch`), `paused: rt.paused` honoured, a caller's own number allowed, a third party's number allowed only when already a contact.

- [ ] **Step 1: the two doors' refusals.**
- [ ] **Step 2: retell-inbound's answer and its bounded alert.**
- [ ] **Step 3: retell-fn's decisions, one case per pin above, then the send.**
- [ ] **Step 4: delete the six pins, bank, full suite.**

## Task E — Four sweeps: health, deadman, playbooks, calendar

**Session 5 of 8.** `apps/edge/api/cron/health.ts` (101), `deadman.ts` (151), `playbooks.ts` (92), `calendar.ts` (82). All stand behind `authorizeCron`; `hygiene.test.mjs:97-110` lints that and stays.

**Files:**
- Create: `tooling/scripts/tests/cron-doors-a.test.mjs` (or one file per sweep)
- Modify (pins that move): `sweep-health.test.mjs:111,123`; `notifications-durable.test.mjs:50` (deadman), `:56` (calendar); `billing-pause.test.mjs:52`, `playbooks.test.mjs:111` (playbooks); `calendar-people.test.mjs:289`, `sweep-rotation.test.mjs:174` (calendar).

**The world:** rpcs `get_cron_sweep_key`; health → `sweep_health`, `jobs_backlog`, `sweep_mark_alerted`; deadman → `deadman_candidates`, `deadman_mark_alerted`; playbooks → `note_sweep_backlog`, `people_list`; calendar → `note_sweep_backlog`, `get_channel_credentials`/`runtime_stamp` as needed; `fetch` captured for the ICS feed (`availability.ts`) and for mail. Assert the sweep's *consequence*: health → which clocks were named unhealthy, who was paged, and `sweep_mark_alerted` called once per alerted clock; deadman → an unaddressable workspace is skipped and the platform paged once per tenant key (`deadman_unaddressable:<tenant>`), an addressable one gets its notification of kind `deadman` and `deadman_mark_alerted`; playbooks → a paused workspace is counted off and said once, a due playbook runs; calendar → the rotation (never-checked first, then oldest), `recordNotification(kind: "calendar_people")` as a row not a mail, `markCalendarChecked`, the backlog noted when more is due than a tick takes.

- [ ] **Step 1: one door test shared by the four** (401/503/no_database).
- [ ] **Step 2–5: each sweep's consequence, one case per pin above and one for the happy path.**
- [ ] **Step 6: delete the eight pins, bank, full suite.**

## Task F — Four sweeps that reach a provider: calls, google, lines, registrations

**Session 6 of 8.** `cron/calls.ts` (218), `google.ts` (88), `lines.ts` (96), `registrations.ts` (110).

**Files:**
- Create: `tooling/scripts/tests/cron-doors-b.test.mjs` (or one per sweep)
- Modify (pins that move): `call-lifecycle.test.mjs:174`, `calls-hardening.test.mjs:24` (calls); `google-profile.test.mjs:277`, `google.test.mjs:323` (google); `line-recovery.test.mjs:169` (lines); `a2p-refile.test.mjs:224`, `a2p.test.mjs:463`, `business-page.test.mjs:133` (registrations).

**The world:** calls → `getCall` (Retell, captured `fetch`), `ingest_call`, `copyRecording`/`purgeExpiredRecordings` (`call-recording.ts`; the copy has a timeout `SWEEP_COPY_TIMEOUT_MS` and `RECORDING_MAX_ATTEMPTS` — assert the attempt count advances on failure); google → `get_google_credentials`, `checkListing`/`syncProfile` over captured `fetch`, `connectionsDue`/`listingsDue` rotation; lines → `LINES_DRY_RUN=1` gives the dry provider (`apps/edge/lib/lines.ts` `lineProviderFromEnv`; no network), `sweepStuckLines` resumes a stuck saga by scheduling a `line_provision` job and `reportLineFailed` tells the bell and the platform; registrations → `registerLine`/`syncRegistration` (`a2p.ts`, five `fetch` sites to Twilio — capture and answer), `get_line_credentials`, the rotation by `updated_at`, and the no-credentials path writing `last_error` so the row's `updated_at` advances (the starvation fix of 12 Sep).

- [ ] **Step 1: the shared door test.**
- [ ] **Step 2–5: each sweep's consequence**, one case per pin above and one happy path; for calls, a recording copy that times out is retried up to the maximum and then left.
- [ ] **Step 6: delete the eight pins, bank, full suite.**

## Task G — The lines door

**Session 7 of 8.** `apps/edge/api/admin/lines.ts` (496 lines; 12 pins in 7 files: `a2p-refile`, `a2p`, `business-page`, `line-recovery`, `lines-saga`, `may-spend`, `registration-path`). The door that spends money: `buy` and `register` are refused unless the workspace may spend (`refuseIfCannotSpend`, keyed on the filing, not a flag — a rejected campaign being corrected in place is exempt).

**Files:**
- Create: `tooling/scripts/tests/lines-door.test.mjs`
- Modify (pins that move): every `readCode("apps/edge/api/admin/lines.ts")` in the seven files above — `grep -n 'admin/lines.ts' tooling/scripts/tests/*.test.mjs` lists them.

**The world:** `EDGE_CALL_SECRET` + `signEdgeToken` (or `DIAG_KEY`); `LINES_DRY_RUN=1`; tables `lines`, `tenants`, `billing_accounts`, `business_records`, `jobs`, `events`; rpcs `get_line_credentials`, `put_line_credentials`; `fetch` captured for Twilio only where the dry provider does not cover it (registration). Ops: `status`, `search`, `buy`, `retry`, `release`, `record`, `register`, `registration-status`. Assert per op: the door and `workspaceFor` (a token naming one workspace refuses a body naming another → 403 `workspace_mismatch`); `buy` refused for a workspace that may not spend and allowed for one that may, the saga scheduled as a `line_provision` job; `retry`/`release` on the right row only; `record` writes the business record and reports its problems; `register` refused when it cannot spend **unless** correcting a rejected filing in place; `registration-status` reads without spending.

- [ ] **Step 1: the door and the workspace rule.**
- [ ] **Step 2: each op, one case per pin plus the happy path.**
- [ ] **Step 3: delete the twelve pins, bank, full suite.**

## Task H — The diag door and the remaining back-office doors

**Session 8 of 8 — may be two PRs.** `apps/edge/api/diag.ts` (240 lines; 11 pins in 10 files) and sixteen admin doors, in this order (customer-nearest first): `steer` (181), `whisper` (47), `voice-provision` (219), `whatsapp/connect` (179), `whatsapp/templates-create` (95), `templates-sync` (87), `templates-delete` (74), `whatsapp/signup-config` (24), `google` (217), `eval` (90), `llm` (103), `billing` (85), `playbooks-run` (42), `setup-request` (71), `signup-notify` (55), `voice-converge` (106). Not `hand-over`/`stop-call` (executed), not `lines` (Task G), not the four retired doors.

**Files:**
- Create: one test file per door or per family (`diag-door.test.mjs`, `steer-door.test.mjs`, `templates-doors.test.mjs`, …)
- Modify (pins that move): `grep -n 'apps/edge/api/diag.ts\|apps/edge/api/admin/' tooling/scripts/tests/*.test.mjs` — 37 reads today, across `agent-settings`, `ask`, `billing`, `call-lifecycle`, `call-outcomes`, `doors-and-rows`, `eval-harness`, `google-profile`, `google`, `lines-saga`, `numbers-two-tables`, `playbooks`, `policy-classes`, `review-reply`, `setup`, `sms`, `starter-templates`, `steer`, `store-retired`, `templates-made-here`, `templates-truth`, `voice-provision`, `voice-provisioning`, `webhook-auth-evidence`, `webhook-delivery`, `whatsapp-connect`, `whisper-framing`, `whisper`.

**The world:** the admin knock; `steer` reaches the model (`brain.ts` → the Anthropic SDK). *Corrected 14 Sep 2026:* this line first said the door has no ports and offered "the same optional `ports` seam". `admin/steer.ts` and `admin/eval.ts` already take a second `POST` parameter, `brain?: BrainPort | null`, and in production that position holds Vercel's FetchEvent (see Architecture); they survive only because they read `brain?.generateReply` and fall back to the real brain when the object carries none. Any seam there keeps that check: never a parameter defaulted to the real modules, and never one that assumes the second argument is a test's; `llm` has a module-level budget map; `whatsapp/*` doors reach Meta Graph over `fetch`; `voice-provision`/`voice-converge` reach Retell over `fetch`; `diag` reads env at import (`META_APP_ID`), probes the store only when it is not `"off"`, and calls `sweep_health`, `jobs_backlog`, `number_drift`.

- [ ] **Step 1: `diag` — the door, the env report, the skipped probe with the store off, the clocks and pages it names.**
- [ ] **Step 2: `steer` — the held-draft rewrite (the door, the 409s, new-before-old, the race guard: a retire matching zero rows takes the rewrite back with 409 `already_sent`, the channel of the draft).**
- [ ] **Step 3 onwards: each door in the order above, deleting its pins as its test lands; bank at each PR boundary.**

---

## Done means

- `grep -c 'read\(Code\|Raw\)("apps/edge/api/' tooling/scripts/tests/*.test.mjs` sums to the lint files' reads only (`ops-hygiene`, `hygiene`) — everything else executes.
- Every handler in the table above has a test that calls its exported `POST`/`GET` and asserts a status, a body, and at least one consequence outside the handler.
- The baseline total has fallen by roughly the 100 reads this plan names; nothing else in it rose.
- `docs/system-map.md` item 3 is struck through with the PRs that did it, and the "Quality & CI" row's `apps/edge/api` line is rewritten from the new counts.
