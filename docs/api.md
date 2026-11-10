<!-- Written by tooling/scripts/gen/api-reference.mjs from each route's route() declaration: do not edit. -->

# The /api/v1 reference

Every member-facing route, by domain: who may call it, the rate bucket it counts against, whether it may spend
the workspace's money, and the fields it takes. A workspace-scoped route names its workspace with `?workspace=`
(`apps/dashboard/src/server/shared/route.ts`). What a route answers is its handler's return type, which the typed client
reads (`apps/dashboard/src/client/api.ts`). Regenerate with `corepack pnpm gen:api-reference`; the suite fails a
stale copy.

A write in a workspace that carries an `Idempotency-Key` header (at most 120 characters, one per intent) is answered
once per key for a day: the same request sent again is given the first answer and changes nothing, the same key on
another request (another method, path or body), or one that arrives while the first still runs, is refused with
409 (decision 0035). A write that keeps its own key, or has no workspace to keep one in, says so.

386 handlers in 57 domains.

## activity

### `GET /api/v1/activity`

Reads; for a member of the workspace the request names, owner or above; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `person` | string (uuid) | no |  |
| `kind` | string | no | at most 60 characters; matches `^[a-z_.]+$` |
| `family` | one of `"conversations"`, `"calls"`, `"people"`, `"lists"`, `"leads"`, `"deals"`, `"campaigns"`, `"calendar"`, `"google"`, `"connections"`, `"team"`, `"settings"`, `"billing"`, `"partner"`, `"records"` | no |  |
| `only` | `"problems"` | no |  |
| `actor` | string (uuid) or one of `"receptionist"`, `"system"` | no |  |
| `day` | string | no | matches `^\d{4}-\d{2}-\d{2}$` |
| `from` | string | no | matches `^\d{4}-\d{2}-\d{2}$` |
| `to` | string | no | matches `^\d{4}-\d{2}-\d{2}$` |
| `cursor` | string | no | at most 120 characters; matches `^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z\|[+-][\d:]+)?\\|[de]-[\w-]+$` |

## ask

### `POST /api/v1/ask`

Writes; for a member of the workspace the request names, viewer or above; counts against the `ask` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/ask/route.ts`).

### `POST /api/v1/ask/act`

Writes; for a member of the workspace the request names, operator or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `message_id` | string (uuid) | yes |  |
| `proposal_id` | string | yes | at most 40 characters; matches `^p-[a-z0-9-]+$` |
| `by` | string | no |  |

### `POST /api/v1/ask/act/undo`

Writes; for a member of the workspace the request names, operator or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `message_id` | string (uuid) | yes |  |
| `proposal_id` | string | yes | at most 40 characters; matches `^p-[a-z0-9-]+$` |
| `by` | string | no |  |

### `POST /api/v1/ask/alone`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `on` | boolean | yes |  |

### `GET /api/v1/ask/follow-ups`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/ask/follow-ups/route.ts`).

### `POST /api/v1/ask/idea`

Writes; for a member of the workspace the request names, partner or above; counts against the `ask` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/ask/idea/route.ts`).

### `GET /api/v1/ask/memory`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/ask/memory/route.ts`).

### `POST /api/v1/ask/memory`

Writes; for a member of the workspace the request names, operator or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/ask/memory/route.ts`).

### `PATCH /api/v1/ask/memory/[id]`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/ask/memory/[id]/route.ts`).

### `DELETE /api/v1/ask/memory/[id]`

Writes; for a member of the workspace the request names, operator or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/ask/memory/[id]/route.ts`).

### `POST /api/v1/ask/messages/[id]/proposals/[pid]`

Writes; for any signed-in person, for themselves; no rate bucket; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/ask/messages/[id]/proposals/[pid]/route.ts`).

### `GET /api/v1/ask/morning`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/ask/morning/route.ts`).

### `POST /api/v1/ask/morning`

Writes; for a member of the workspace the request names, operator or above; counts against the `ask` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/ask/morning/route.ts`).

### `GET /api/v1/ask/notice`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/ask/notice/route.ts`).

### `GET /api/v1/ask/openings`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `day` | string | no |  |
| `service` | string | no |  |

### `POST /api/v1/ask/quick`

Writes; for a member of the workspace the request names, viewer or above; counts against the `ask` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/ask/quick/route.ts`).

### `POST /api/v1/ask/speech`

Writes; for a member of the workspace the request names, viewer or above; counts against the `speech` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `text` | string | yes | at least 1 characters; at most 1500 characters |
| `purpose` | one of `"brief"`, `"answer"` | yes |  |
| `before` | string | no | at most 1500 characters |

### `POST /api/v1/ask/stop`

Writes; for a member of the workspace the request names, operator or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `stopped` | boolean | no |  |

### `GET /api/v1/ask/threads`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/ask/threads/route.ts`).

### `GET /api/v1/ask/threads/[id]`

Reads; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/ask/threads/[id]/route.ts`).

### `DELETE /api/v1/ask/threads/[id]`

Writes; for any signed-in person, for themselves; no rate bucket; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/ask/threads/[id]/route.ts`).

### `POST /api/v1/ask/voice`

Writes; for a member of the workspace the request names, viewer or above; counts against the `voice` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/ask/voice/route.ts`).

### `POST /api/v1/ask/voice/end`

Writes; for a member of the workspace the request names, viewer or above; no rate bucket; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `session` | string | yes | matches `^[0-9a-f]{64}$` |
| `reason` | string | no | at most 80 characters |
| `connect_ms` | integer or null | no |  |
| `first_audio_ms` | integer or null | no |  |

### `POST /api/v1/ask/voice/page`

Writes; for a member of the workspace the request names, viewer or above; counts against the `aggregate` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `session` | string | yes | matches `^[0-9a-f]{64}$` |
| `context` | object | yes |  |

### `POST /api/v1/ask/warm`

Writes; for a member of the workspace the request names, viewer or above; counts against the `aggregate` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `v` | `1` | yes |  |
| `surface` | one of `"today"`, `"inbox"`, `"people"`, `"leads"`, `"conversations"`, `"live"`, `"reports"`, `"settings"`, `"pipeline"`, `"calendar"`, `"campaigns"`, `"start"`, `"other"` | yes |  |
| `route` | string | yes | at most 200 characters |
| `view` | string or null | no |  |
| `focus` | object or null | no |  |
| `rows` | array of object | yes | at most 40 |
| `askedAt` | integer | yes | ≥ 0; ≤ 9007199254740991 |

### `POST /api/v1/ask/warm/model`

Writes; for a member of the workspace the request names, viewer or above; counts against the `ask` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/ask/warm/model/route.ts`).

## billing

### `GET /api/v1/billing`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/billing/route.ts`).

### `POST /api/v1/billing/checkout`

Writes; for a member of the workspace the request names, owner or above; counts against the `billing` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `return` | one of `"billing"`, `"start"` | no |  |
| `embedded` | boolean | no |  |

### `GET /api/v1/billing/invoices`

Reads; for a member of the workspace the request names, owner or above; counts against the `billing_read` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/billing/invoices/route.ts`).

### `POST /api/v1/billing/portal`

Writes; for a member of the workspace the request names, owner or above; counts against the `billing` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/billing/portal/route.ts`).

### `POST /api/v1/billing/resume`

Writes; for a member of the workspace the request names, owner or above; counts against the `billing` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/billing/resume/route.ts`).

### `POST /api/v1/billing/start-now`

Writes; for a member of the workspace the request names, owner or above; counts against the `billing` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/billing/start-now/route.ts`).

### `POST /api/v1/billing/sync`

Writes; for a member of the workspace the request names, operator or above; counts against the `billing` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/billing/sync/route.ts`).

## broadcasts

### `GET /api/v1/broadcasts`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/broadcasts/route.ts`).

### `POST /api/v1/broadcasts`

Writes; for a member of the workspace the request names, operator or above; counts against the `broadcast` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/broadcasts/route.ts`).

### `GET /api/v1/broadcasts/[id]`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/broadcasts/[id]/route.ts`).

### `POST /api/v1/broadcasts/[id]/approve`

Writes; for a member of the row's own workspace, operator or above; counts against the `broadcast` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/broadcasts/[id]/approve/route.ts`).

### `POST /api/v1/broadcasts/[id]/cancel`

Writes; for a member of the row's own workspace, operator or above; counts against the `broadcast` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/broadcasts/[id]/cancel/route.ts`).

### `POST /api/v1/broadcasts/[id]/recheck`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/broadcasts/[id]/recheck/route.ts`).

### `GET /api/v1/broadcasts/touches`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/broadcasts/touches/route.ts`).

## business-record

### `GET /api/v1/business-record`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/business-record/route.ts`).

### `PUT /api/v1/business-record`

Writes; for a member of the workspace the request names, partner or above; counts against the `business_record` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/business-record/route.ts`).

## calendar

### `GET /api/v1/calendar`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `from` | string | no |  |
| `days` | string | no |  |
| `around` | one of `"today"` | no |  |
| `fresh` | one of `"1"` | no |  |

### `POST /api/v1/calendar/freed`

Writes; for a member of the workspace the request names, operator or above; counts against the `playbook` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `visit_id` | string (uuid) | yes |  |

### `POST /api/v1/calendar/notices/[id]/dismiss`

Writes; for a member of the workspace the request names, operator or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/calendar/notices/[id]/dismiss/route.ts`).

### `POST /api/v1/calendar/notices/[id]/read-again`

Writes; for a member of the workspace the request names, operator or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/calendar/notices/[id]/read-again/route.ts`).

### `POST /api/v1/calendar/preview`

Writes; for a member of the workspace the request names, operator or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/calendar/preview/route.ts`).

### `GET /api/v1/calendar/runs`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `from` | string | no |  |
| `days` | string | no |  |
| `around` | one of `"today"` | no |  |

### `POST /api/v1/calendar/visits/[id]`

Writes; for a member of the row's own workspace, operator or above; counts against the `person_edit` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `status` | one of `"kept"`, `"missed"`, `"cancelled"` | yes |  |

## calls

### `GET /api/v1/calls`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `conversation_id` | string | no |  |
| `status` | one of `"registered"`, `"ongoing"`, `"ended"`, `"error"`, `"not_connected"` | no |  |
| `ids` | string | no |  |
| `q` | string | no | at most 100 characters |

### `POST /api/v1/calls/[id]/end`

Writes; for a member of the row's own workspace, operator or above; counts against the `call_control` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/calls/[id]/end/route.ts`).

### `GET /api/v1/calls/[id]/export`

Reads; for a member of the workspace the request names; counts against the `export` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/calls/[id]/export/route.ts`).

### `POST /api/v1/calls/[id]/hand-over`

Writes; for a member of the row's own workspace, operator or above; counts against the `call_control` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/calls/[id]/hand-over/route.ts`).

### `GET /api/v1/calls/[id]/recording`

Reads; for a member of the row's own workspace; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/calls/[id]/recording/route.ts`).

### `POST /api/v1/calls/[id]/whisper`

Writes; for a member of the row's own workspace, operator or above; counts against the `whisper` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `text` | string | yes | at least 1 characters; at most 500 characters |
| `trigger` | boolean | no |  |

## capabilities

### `POST /api/v1/capabilities/[kind]`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `note` | string | no | at most 200 characters |
| `first_run` | boolean | no |  |

### `DELETE /api/v1/capabilities/[kind]`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/capabilities/[kind]/route.ts`).

## changes

### `GET /api/v1/changes`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `since` | string (date-time) | yes |  |

## channels

### `GET /api/v1/channels`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/channels/route.ts`).

### `GET /api/v1/channels/instagram`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/channels/instagram/route.ts`).

### `GET /api/v1/channels/instagram/callback`

Reads; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/channels/instagram/callback/route.ts`).

### `GET /api/v1/channels/instagram/connect`

Reads; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/channels/instagram/connect/route.ts`).

### `POST /api/v1/channels/instagram/disconnect`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `channel_id` | string (uuid) | yes |  |

### `GET /api/v1/channels/meta`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/channels/meta/route.ts`).

### `GET /api/v1/channels/meta/callback`

Reads; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/channels/meta/callback/route.ts`).

### `GET /api/v1/channels/meta/connect`

Reads; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/channels/meta/connect/route.ts`).

### `POST /api/v1/channels/meta/disconnect`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `channel_id` | string (uuid) | yes |  |

### `POST /api/v1/channels/whatsapp/connect`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `code` | string or null | no |  |
| `phone_number_id` | string or null | no |  |
| `waba_id` | string or null | no |  |
| `keep_app` | boolean or null | no |  |

### `GET /api/v1/channels/whatsapp/signup`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/channels/whatsapp/signup/route.ts`).

### `POST /api/v1/channels/whatsapp/standing`

Writes; for a member of the workspace the request names, partner or above; counts against the `whatsapp_standing` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/channels/whatsapp/standing/route.ts`).

## client-errors

### `POST /api/v1/client-errors`

Writes; for any signed-in person, for themselves; counts against the `client_errors` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `boundary` | one of `"shell"`, `"os"`, `"root"` | yes |  |
| `page` | string or null | yes |  |
| `name` | string | yes | at most 60 characters |
| `message` | string | yes | at most 300 characters |
| `stack` | string or null | yes |  |
| `digest` | string or null | yes |  |
| `workspace` | string or null | yes |  |
| `build` | string or null | no |  |
| `device` | one of `"desk"`, `"phone"` or null | no |  |

## consent

### `GET /api/v1/consent/qr`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/consent/qr/route.ts`).

## contacts

### `GET /api/v1/contacts`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `q` | string | no | at most 80 characters |
| `offset` | integer | no | ≥ 0; ≤ 1000000 |
| `after` | string | no | at least 1 characters; at most 200 characters |
| `thread` | string (uuid) | no |  |

### `POST /api/v1/contacts`

Writes; for a member of the workspace the request names, operator or above; counts against the `person_create` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `phone` | string | no |  |
| `email` | string | no |  |
| `name` | string | no |  |
| `source` | string | no |  |

### `GET /api/v1/contacts/[id]`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/contacts/[id]/route.ts`).

### `DELETE /api/v1/contacts/[id]`

Writes; for a member of the row's own workspace, owner or above; counts against the `erase` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/contacts/[id]/route.ts`).

### `POST /api/v1/contacts/[id]/call`

Writes; for a member of the row's own workspace, operator or above; counts against the `person_edit` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `outcome` | one of `"spoke"`, `"interested"`, `"call_back"`, `"not_interested"`, `"voicemail"`, `"no_answer"`, `"wrong_number"` | yes |  |
| `said` | string | no | at most 280 characters |
| `due_on` | string or null | no |  |
| `tell` | boolean | no |  |
| `spoke_with` | string | no | at most 80 characters |
| `closes_call_back` | boolean | no |  |

### `PUT /api/v1/contacts/[id]/consent`

Writes; for a member of the row's own workspace, operator or above; counts against the `consent` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `consent` | one of `"unknown"`, `"opted_in"`, `"opted_out"` | yes |  |
| `source` | string | no |  |
| `note` | string | no |  |
| `message_id` | string (uuid) | no |  |

### `POST /api/v1/contacts/[id]/deal`

Writes; for a member of the row's own workspace, operator or above; counts against the `person_edit` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `stage` | one of `"proposed"`, `"won"`, `"lost"`, `"ended"` | yes |  |
| `deal_id` | string (uuid) | no |  |
| `version` | integer | no | ≥ 1; ≤ 9007199254740991 |
| `service` | string | no | at least 1 characters; at most 80 characters |
| `when` | string | no |  |
| `amount_cents` | integer | no | ≥ 0; ≤ 1000000000 |
| `per` | one of `"once"`, `"month"`, `"year"` | no |  |
| `note` | string | no | at most 200 characters |
| `message_id` | string (uuid) | no |  |
| `form_note` | string | no | at least 1 characters; at most 200 characters |
| `proposal_url` | string | no | at most 600 characters |
| `valid_until` | string or null | no |  |
| `lost_reason` | one of `"price"`, `"timing"`, `"elsewhere"`, `"no_reply"`, `"not_a_fit"`, `"other"` | no |  |
| `clear` | array of one of `"proposal_url"`, `"valid_until"`, `"amount"`, `"note"` | no | at most 4 |

### `PUT /api/v1/contacts/[id]/details`

Writes; for a member of the row's own workspace, operator or above; counts against the `person_edit` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | no |  |
| `notes` | string | no |  |
| `email` | string | no | at most 320 characters |
| `proposal` | string | no | at most 600 characters |

### `POST /api/v1/contacts/[id]/doubts/dismiss`

Writes; for a member of the row's own workspace, operator or above; counts against the `person_edit` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `doubt_id` | string (uuid) | yes |  |

### `PUT /api/v1/contacts/[id]/marketing-consent`

Writes; for a member of the row's own workspace, operator or above; counts against the `consent` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `consent` | one of `"unknown"`, `"opted_in"`, `"opted_out"` | yes |  |
| `source` | string | no |  |
| `note` | string | no |  |
| `message_id` | string (uuid) | no |  |

### `POST /api/v1/contacts/[id]/merge`

Writes; for a member of the row's own workspace, owner or above; counts against the `merge` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `merge` | string (uuid) | yes |  |

### `POST /api/v1/contacts/[id]/not-a-person`

Writes; for a member of the row's own workspace, owner or above; counts against the `erase` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `scope` | one of `"address"`, `"domain"` | yes |  |

### `POST /api/v1/contacts/[id]/notes`

Writes; for a member of the row's own workspace, operator or above; counts against the `person_edit` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `body` | string | yes | at least 1 characters; at most 600 characters |
| `for_user_id` | string (uuid) or null | no |  |
| `team_only` | boolean | no |  |
| `note_id` | string (uuid) | no |  |
| `version` | integer | no | ≥ 1; ≤ 9007199254740991 |
| `due_on` | string or null | no |  |
| `deal_id` | string (uuid) or null | no |  |
| `clear_due` | boolean | no |  |

### `POST /api/v1/contacts/[id]/notes/decide`

Writes; for a member of the row's own workspace, operator or above; counts against the `person_edit` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `note_id` | string (uuid) | yes |  |
| `keep` | boolean | yes |  |
| `body` | string | no | at least 1 characters; at most 600 characters |
| `team_only` | boolean | no |  |

### `POST /api/v1/contacts/[id]/notes/done`

Writes; for a member of the row's own workspace, operator or above; counts against the `person_edit` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `note_id` | string (uuid) | yes |  |
| `done` | boolean | no |  |
| `version` | integer | no | ≥ 1; ≤ 9007199254740991 |

### `POST /api/v1/contacts/[id]/notes/remove`

Writes; for a member of the row's own workspace, operator or above; counts against the `person_edit` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `note_id` | string (uuid) | yes |  |

### `POST /api/v1/contacts/[id]/notes/seen`

Writes; for a member of the row's own workspace, viewer or above; counts against the `seen_mark` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `note_id` | string (uuid) | yes |  |

### `PUT /api/v1/contacts/[id]/receptionist`

Writes; for a member of the row's own workspace, owner or above; counts against the `person_mode` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `mode` | one of `"auto"`, `"ask"`, `"never"`, `"inherit"` | yes |  |

### `PUT /api/v1/contacts/[id]/seen`

Writes; for a member of the row's own workspace, viewer or above; counts against the `seen_mark` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `seen` | boolean | yes |  |
| `heard_at` | string (date-time) | no |  |

### `POST /api/v1/contacts/[id]/signup-confirm`

Writes; for a member of the row's own workspace, operator or above; counts against the `person_edit` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/contacts/[id]/signup-confirm/route.ts`).

### `PUT /api/v1/contacts/consent`

Writes; for a member of the workspace the request names, operator or above; counts against the `consent` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `ids` | array of string (uuid) | yes | at least 1; at most 50 |
| `consent` | one of `"unknown"`, `"opted_in"`, `"opted_out"` | yes |  |
| `source` | string | no |  |
| `note` | string | no |  |

### `POST /api/v1/contacts/erase`

Writes; for a member of the workspace the request names, owner or above; counts against the `erase_many` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `ids` | array of string (uuid) | yes | at least 1; at most 100000 |
| `not_a_person` | boolean | no |  |

### `GET /api/v1/contacts/export`

Reads; for a member of the workspace the request names, owner or above; counts against the `export` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `list` | string | no | at most 80 characters |

### `POST /api/v1/contacts/import`

Writes; for a member of the workspace the request names, owner or above; counts against the `person_import` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `import_id` | string (uuid) | yes |  |
| `rows` | array of object | yes | at least 1; at most 50 |
| `part` | object | no |  |
| `via` | string | no | matches `^[a-z][a-z0-9_-]{0,39}$` |

### `PUT /api/v1/contacts/marketing-consent`

Writes; for a member of the workspace the request names, operator or above; counts against the `consent` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `ids` | array of string (uuid) | yes | at least 1; at most 50 |
| `consent` | one of `"unknown"`, `"opted_in"`, `"opted_out"` | yes |  |
| `source` | string | no |  |
| `note` | string | no |  |

### `PUT /api/v1/contacts/notes`

Writes; for a member of the workspace the request names, operator or above; counts against the `person_edit` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `ids` | array of string (uuid) | yes | at least 1; at most 50 |
| `append` | string | yes | at least 1 characters; at most 200 characters |

### `PUT /api/v1/contacts/receptionist`

Writes; for a member of the workspace the request names, owner or above; counts against the `person_mode` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `ids` | array of string (uuid) | yes | at least 1; at most 50 |
| `mode` | one of `"auto"`, `"ask"`, `"never"`, `"inherit"` | yes |  |

## conversations

### `GET /api/v1/conversations`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `ids` | string | no |  |
| `q` | string | no | at most 100 characters |

### `GET /api/v1/conversations/[id]`

Reads; for a member of the row's own workspace; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `before` | string | no |  |

### `POST /api/v1/conversations/[id]/archive`

Writes; for a member of the row's own workspace, operator or above; counts against the `thread_state` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/conversations/[id]/archive/route.ts`).

### `POST /api/v1/conversations/[id]/booking-request`

Writes; for a member of the row's own workspace, operator or above; counts against the `thread_state` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `booked` | boolean | yes |  |

### `POST /api/v1/conversations/[id]/draft`

Writes; for a member of the row's own workspace, operator or above; counts against the `person_draft` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `kind` | one of `"reply"`, `"brief"` | yes |  |
| `instruction` | string | no | at least 1 characters; at most 1000 characters |
| `given` | string | no | at least 1 characters; at most 8000 characters |

### `GET /api/v1/conversations/[id]/export`

Reads; for a member of the workspace the request names; counts against the `export` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/conversations/[id]/export/route.ts`).

### `POST /api/v1/conversations/[id]/hand-back`

Writes; for a member of the row's own workspace, operator or above; counts against the `thread_state` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/conversations/[id]/hand-back/route.ts`).

### `POST /api/v1/conversations/[id]/not-a-customer`

Writes; for a member of the row's own workspace, operator or above; counts against the `thread_state` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `undo` | boolean | no |  |

### `POST /api/v1/conversations/[id]/reply`

Writes; for a member of the row's own workspace, operator or above; counts against the `reply` rate; spends nothing. Keeps its own `Idempotency-Key`.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `text` | string | no | at most 20000 characters |
| `email_to` | string | no | at most 320 characters |
| `template` | object | no |  |

### `POST /api/v1/conversations/[id]/reply-anyway`

Writes; for a member of the row's own workspace, operator or above; counts against the `thread_state` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/conversations/[id]/reply-anyway/route.ts`).

### `POST /api/v1/conversations/[id]/snooze`

Writes; for a member of the row's own workspace, operator or above; counts against the `thread_state` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `until` | string | yes |  |

### `POST /api/v1/conversations/[id]/take-over`

Writes; for a member of the row's own workspace, operator or above; counts against the `thread_state` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/conversations/[id]/take-over/route.ts`).

### `POST /api/v1/conversations/[id]/wake`

Writes; for a member of the row's own workspace, operator or above; counts against the `thread_state` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/conversations/[id]/wake/route.ts`).

### `GET /api/v1/conversations/drafts`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `ids` | string | no | at least 1 characters |

## escalations

### `GET /api/v1/escalations`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `state` | one of `"open"`, `"resolved"` | no |  |

### `POST /api/v1/escalations/[id]/resolve`

Writes; for a member of the row's own workspace, operator or above; counts against the `thread_state` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/escalations/[id]/resolve/route.ts`).

## export

### `GET /api/v1/export`

Reads; for a member of the workspace the request names, owner or above; counts against the `export` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `person` | string (uuid) | no |  |

## fact-suggestions

### `POST /api/v1/fact-suggestions/[id]`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `keep` | boolean | yes |  |

## files

### `GET /api/v1/files`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `shelf` | one of `"all"`, `"inbox"`, `"place"`, `"work"`, `"team"`, `"products"`, `"brand"`, `"made"`, `"other"`, `"set_aside"` | no |  |
| `limit` | integer | no | ≥ 1; ≤ 1000 |
| `before` | string | no | at least 1 characters; at most 100 characters |

### `GET /api/v1/files/[id]`

Reads; for a member of the row's own workspace; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/files/[id]/route.ts`).

### `PATCH /api/v1/files/[id]`

Writes; for a member of the row's own workspace, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | no | at most 120 characters |
| `shows` | one of `"storefront"`, `"interior"`, `"work"`, `"team"`, `"product"`, `"menu"`, `"logo"`, `"graphic"`, `"other"` | no |  |
| `who_in_it` | one of `"no_one"`, `"agreed"` | no |  |
| `status` | one of `"filed"`, `"set_aside"` | no |  |

### `DELETE /api/v1/files/[id]`

Writes; for a member of the row's own workspace, partner or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/files/[id]/route.ts`).

### `POST /api/v1/files/[id]/done`

Writes; for a member of the workspace the request names, partner or above; counts against the `file_upload` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | at most 255 characters |
| `mime` | one of `"image/jpeg"`, `"image/png"`, `"image/webp"`, `"image/heic"`, `"image/heif"`, `"video/mp4"`, `"video/quicktime"`, `"video/webm"` | yes |  |

### `POST /api/v1/files/[id]/google`

Writes; for a member of the row's own workspace, partner or above; counts against the `file_google` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `summary` | string | yes | at least 1 characters; at most 1500 characters |

### `DELETE /api/v1/files/[id]/google`

Writes; for a member of the row's own workspace, partner or above; counts against the `file_google` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | at least 1 characters; at most 300 characters |

### `GET /api/v1/files/[id]/play`

Reads; for a member of the row's own workspace; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/files/[id]/play/route.ts`).

### `GET /api/v1/files/[id]/view`

Reads; for a member of the row's own workspace; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/files/[id]/view/route.ts`).

### `POST /api/v1/files/keep`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `ids` | array of string (uuid) | yes | at least 1; at most 1000 |

### `POST /api/v1/files/post`

Writes; for a member of the workspace the request names, partner or above; counts against the `file_upload` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `file_id` | string (uuid) | yes |  |
| `line` | string | yes | at least 1 characters; at most 60 characters |
| `over` | string or null | yes |  |
| `under` | string or null | yes |  |
| `book` | boolean | yes |  |
| `words_at` | one of `"top"`, `"bottom"` | yes |  |
| `voice` | one of `"classic"`, `"modern"` | yes |  |
| `layout` | one of `"over"`, `"left"`, `"band"`, `"frame"` | no |  |
| `language` | one of `"en"`, `"es"` | yes |  |
| `people_agreed` | boolean | yes |  |
| `at` | number or null | no |  |

### `POST /api/v1/files/post/preview`

Writes; for a member of the workspace the request names, partner or above; counts against the `file_post_preview` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `file_id` | string (uuid) | yes |  |
| `line` | string | yes | at least 1 characters; at most 60 characters |
| `over` | string or null | yes |  |
| `under` | string or null | yes |  |
| `book` | boolean | yes |  |
| `words_at` | one of `"top"`, `"bottom"` | yes |  |
| `voice` | one of `"classic"`, `"modern"` | yes |  |
| `layout` | one of `"over"`, `"left"`, `"band"`, `"frame"` | no |  |
| `language` | one of `"en"`, `"es"` | yes |  |
| `people_agreed` | boolean | yes |  |
| `at` | number or null | no |  |
| `shape` | one of `"portrait"`, `"square"`, `"story"`, `"wide"` | no |  |

### `POST /api/v1/files/start`

Writes; for a member of the workspace the request names, partner or above; counts against the `file_upload` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `mime` | one of `"image/jpeg"`, `"image/png"`, `"image/webp"`, `"image/heic"`, `"image/heif"`, `"video/mp4"`, `"video/quicktime"`, `"video/webm"` | yes |  |
| `bytes` | integer | yes | ≤ 500000000 |
| `name` | string | no | at most 255 characters |
| `seconds` | number or null | no |  |
| `fingerprint` | string | no | matches `^[0-9a-f]{64}$` |

## google

### `GET /api/v1/google`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/google/route.ts`).

### `GET /api/v1/google/callback`

Reads; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/google/callback/route.ts`).

### `GET /api/v1/google/connect`

Reads; for a member of the workspace the request names, partner or above; counts against the `google_link` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `back` | one of `"start"` | no |  |

### `DELETE /api/v1/google/connection`

Writes; for a member of the workspace the request names, partner or above; counts against the `google_link` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/google/connection/route.ts`).

### `POST /api/v1/google/link`

Writes; for a member of the workspace the request names, partner or above; counts against the `google_link` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `place_id` | string or null | no |  |

### `DELETE /api/v1/google/link`

Writes; for a member of the workspace the request names, partner or above; counts against the `google_link` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/google/link/route.ts`).

### `GET /api/v1/google/locations`

Reads; for a member of the workspace the request names, partner or above; counts against the `google_search` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/google/locations/route.ts`).

### `POST /api/v1/google/locations`

Writes; for a member of the workspace the request names, partner or above; counts against the `google_link` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `account_name` | string or null | no |  |
| `location_name` | string or null | no |  |

### `POST /api/v1/google/refresh`

Writes; for a member of the workspace the request names, operator or above; counts against the `google_refresh` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/google/refresh/route.ts`).

### `POST /api/v1/google/reviews/[id]/draft`

Writes; for a member of the workspace the request names, operator or above; counts against the `google_draft` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `instruction` | string | no | at least 1 characters; at most 1000 characters |
| `given` | string | no | at least 1 characters; at most 8000 characters |

### `POST /api/v1/google/reviews/[id]/reply`

Writes; for a member of the workspace the request names, operator or above; counts against the `google_reply` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/google/reviews/[id]/reply/route.ts`).

### `POST /api/v1/google/reviews/[id]/stop`

Writes; for a member of the workspace the request names, operator or above; counts against the `google_reply` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/google/reviews/[id]/stop/route.ts`).

### `POST /api/v1/google/search`

Writes; for a member of the workspace the request names, partner or above; counts against the `google_search` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/google/search/route.ts`).

## handovers

### `POST /api/v1/handovers/[id]/accept`

Writes; for any signed-in person, for themselves; counts against the `handover_answer` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/handovers/[id]/accept/route.ts`).

### `POST /api/v1/handovers/[id]/decline`

Writes; for any signed-in person, for themselves; counts against the `handover_answer` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/handovers/[id]/decline/route.ts`).

## imports

### `POST /api/v1/imports/again`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `source` | one of `"google_reviews"`, `"calendar"`, `"clients_file"`, `"mailbox"`, `"contacts"`, `"whatsapp_contacts"`, `"whatsapp_history"`, `"google_photos"` | yes |  |

## lead-operations

### `POST /api/v1/lead-operations/[id]/undo`

Writes; for a member of the workspace the request names, operator or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `version` | integer | yes | ≥ 0; ≤ 9007199254740991 |

## lead-previews

### `GET /api/v1/lead-previews`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/lead-previews/route.ts`).

## lead-searches

### `GET /api/v1/lead-searches`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/lead-searches/route.ts`).

### `POST /api/v1/lead-searches`

Writes; for a member of the workspace the request names, partner or above; counts against the `lead_search` rate; may spend the workspace's money.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `version` | integer | yes | ≥ 1; ≤ 9007199254740991 |
| `card` | `"local_businesses"` | yes |  |
| `name` | string | yes |  |
| `category_key` | string | no | matches `^[a-z][a-z0-9_]{0,39}$` |
| `from` | `"idea"` | no |  |
| `asked` | string | yes |  |
| `terms` | array of string | yes | at least 1; at most 5 |
| `area` | object | yes |  |
| `count` | integer | yes | ≥ 1; ≤ 1000 |
| `contact` | one of `"phone"`, `"email"` | yes |  |
| `criteria` | array of object | yes | at most 8 |
| `exclusions` | array of object | yes | at most 8 |
| `thread_id` | any | no |  |

### `PATCH /api/v1/lead-searches/[id]`

Writes; for a member of the row's own workspace, operator or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | at least 1 characters; at most 80 characters |

### `DELETE /api/v1/lead-searches/[id]`

Writes; for a member of the row's own workspace, partner or above; counts against the `lead_member` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/lead-searches/[id]/route.ts`).

### `POST /api/v1/lead-searches/[id]/aim`

Writes; for a member of the workspace the request names, operator or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `sequence_id` | string or null | yes |  |

### `POST /api/v1/lead-searches/[id]/answer`

Writes; for a member of the workspace the request names, partner or above; counts against the `lead_answer` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `answer` | one of `"keep"`, `"include"`, `"stop"` | yes |  |
| `plan` | object | no |  |

### `POST /api/v1/lead-searches/[id]/more`

Writes; for a member of the workspace the request names, partner or above; counts against the `lead_search` rate; may spend the workspace's money.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `purpose` | one of `"topup"`, `"renew"` | yes |  |
| `plan` | object | yes |  |

### `POST /api/v1/lead-searches/[id]/stop`

Writes; for a member of the workspace the request names, operator or above; counts against the `lead_answer` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/lead-searches/[id]/stop/route.ts`).

### `POST /api/v1/lead-searches/[id]/undo`

Writes; for a member of the row's own workspace, partner or above; counts against the `lead_member` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/lead-searches/[id]/undo/route.ts`).

### `POST /api/v1/lead-searches/chosen`

Writes; for a member of the workspace the request names, operator or above; counts against the `lead_bulk` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | at least 1 characters; at most 120 characters |
| `lead_ids` | array of string (uuid) | yes | at least 1; at most 500 |

### `POST /api/v1/lead-searches/import`

Writes; for a member of the workspace the request names, partner or above; counts against the `lead_search` rate; may spend the workspace's money.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | at least 1 characters; at most 120 characters |
| `asked` | string | no | at most 400 characters |
| `rows` | array of object | yes | at least 1; at most 500 |

### `POST /api/v1/lead-searches/people`

Writes; for a member of the workspace the request names, partner or above; counts against the `lead_search` rate; may spend the workspace's money.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `plan` | object | yes |  |
| `via` | one of `"people"`, `"ask"` | yes |  |
| `thread_id` | string (uuid) or null | no |  |

## lead-suggestions

### `GET /api/v1/lead-suggestions`

Reads; for a member of the workspace the request names; counts against the `lead_ideas_read` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/lead-suggestions/route.ts`).

### `POST /api/v1/lead-suggestions`

Writes; for a member of the workspace the request names, partner or above; counts against the `lead_suggest` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `again` | boolean or null | no |  |
| `ours` | boolean or null | no |  |

### `PUT /api/v1/lead-suggestions`

Writes; for a member of the workspace the request names, partner or above; counts against the `lead_line` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `business_line` | string | yes | at least 3 characters; at most 400 characters |

## leads

### `GET /api/v1/leads`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `list` | one of `"all"`, `"ready"`, `"nurture"`, `"converted"`, `"said_no"`, `"not_a_fit"` | no |  |
| `search` | string (uuid) | no |  |
| `class` | one of `"qualified"`, `"review"`, `"excluded"` | no |  |
| `sort` | one of `"fit"`, `"found"`, `"distance"`, `"business"`, `"rating"`, `"stage"`, `"reviews"`, `"contacted"`, `"category"`, `"city"`, `"region"`, `"pile"` | no |  |
| `dir` | one of `"asc"`, `"desc"` | no |  |
| `after_key` | string | no | at most 80 characters |
| `after_id` | string (uuid) | no |  |
| `limit` | integer | no | ≥ 1; ≤ 500 |
| `pile_list` | string (uuid) | no |  |
| `q` | string | no | at most 80 characters |
| `excluded_by` | string | no | matches `^[a-z][a-z0-9_]{0,59}$` |
| `fit` | one of `"strong"`, `"look"`, `"long"` | no |  |
| `reach` | array of one of `"email"`, `"phone"` or string | no |  |
| `status_group` | array of one of `"needs"`, `"in"`, `"none"` or string | no |  |

### `GET /api/v1/leads/[id]`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `search` | string (uuid) | no |  |

### `DELETE /api/v1/leads/[id]`

Writes; for a member of the row's own workspace, owner or above; counts against the `erase` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/leads/[id]/route.ts`).

### `POST /api/v1/leads/[id]/addressee`

Writes; for a member of the workspace the request names, partner or above; counts against the `lead_member` rate; may spend the workspace's money.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `person` | integer | yes | ≥ 0; ≤ 4 |

### `POST /api/v1/leads/[id]/draft`

Writes; for a member of the row's own workspace, operator or above; counts against the `lead_draft` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tone` | one of `"first"`, `"shorter"`, `"warmer"` | no |  |
| `previous` | object | no |  |

### `GET /api/v1/leads/[id]/emails`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/leads/[id]/emails/route.ts`).

### `POST /api/v1/leads/[id]/exclude`

Writes; for a member of the workspace the request names, partner or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `search_id` | string (uuid) | yes |  |

### `POST /api/v1/leads/[id]/keep`

Writes; for a member of the workspace the request names, partner or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `search_id` | string (uuid) | yes |  |

### `POST /api/v1/leads/[id]/later`

Writes; for a member of the workspace the request names, operator or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `search_id` | string (uuid) | yes |  |

### `GET /api/v1/leads/[id]/place`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/leads/[id]/place/route.ts`).

### `GET /api/v1/leads/[id]/preview`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/leads/[id]/preview/route.ts`).

### `POST /api/v1/leads/[id]/preview`

Writes; for a member of the workspace the request names, operator or above; counts against the `lead_member` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/leads/[id]/preview/route.ts`).

### `POST /api/v1/leads/[id]/put-back`

Writes; for a member of the workspace the request names, partner or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `search_id` | string (uuid) | yes |  |

### `POST /api/v1/leads/[id]/send`

Writes; for a member of the row's own workspace, operator or above; counts against the `lead_send` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `subject` | string | yes | at least 1 characters; at most 200 characters |
| `body` | string | yes | at least 1 characters; at most 4000 characters |

### `GET /api/v1/leads/[id]/sent/[send]`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/leads/[id]/sent/[send]/route.ts`).

### `POST /api/v1/leads/[id]/stage`

Writes; for a member of the row's own workspace, operator or above; counts against the `lead_member` rate; spends nothing.

One of 5 bodies.

Body 1:

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `kind` | `"stage"` | yes |  |
| `stage` | one of `"ready"`, `"nurture"`, `"converted"` | yes |  |

Body 2:

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `kind` | `"not_a_fit"` | yes |  |
| `why` | one of `"chain"`, `"wrong_kind"`, `"too_far"`, `"customer"`, `"other"` | yes |  |

Body 3:

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `kind` | `"said_no"` | yes |  |

Body 4:

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `kind` | `"outcome"` | yes |  |
| `outcome` | one of `"interested"`, `"call_back"`, `"not_interested"`, `"voicemail"`, `"no_answer"`, `"wrong_number"` | yes |  |
| `note` | string | no | at most 280 characters |
| `spoke_with` | string | no | at most 80 characters |

Body 5:

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `kind` | `"emailed"` | yes |  |
| `words` | object | no |  |

### `GET /api/v1/leads/[id]/words`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/leads/[id]/words/route.ts`).

### `GET /api/v1/leads/back`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/leads/back/route.ts`).

### `POST /api/v1/leads/bulk`

Writes; for a member of the workspace the request names, operator or above; counts against the `lead_bulk` rate; spends nothing.

One of 2 bodies.

Body 1:

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `by` | `"ids"` | yes |  |
| `action` | one of `"contacted"`, `"not_a_fit"`, `"keep"`, `"exclude"` | yes |  |
| `ids` | array of string (uuid) | yes | at least 1; at most 500 |
| `search_id` | string (uuid) | no |  |

Body 2:

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `by` | `"view"` | yes |  |
| `action` | one of `"contacted"`, `"not_a_fit"` | yes |  |
| `view` | object | yes |  |

### `POST /api/v1/leads/check-again`

Writes; for a member of the workspace the request names, partner or above; counts against the `lead_bulk` rate; may spend the workspace's money.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `ids` | array of string (uuid) | yes | at least 1; at most 500 |

### `POST /api/v1/leads/export`

Writes; for a member of the workspace the request names, owner or above; counts against the `export` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `list` | one of `"all"`, `"ready"`, `"nurture"`, `"converted"`, `"said_no"`, `"not_a_fit"` | no |  |
| `search` | string (uuid) | no |  |
| `class` | one of `"qualified"`, `"review"`, `"excluded"` | no |  |
| `sort` | one of `"fit"`, `"found"`, `"distance"`, `"business"`, `"rating"`, `"stage"`, `"reviews"`, `"contacted"`, `"category"`, `"city"`, `"region"`, `"pile"` | no |  |
| `dir` | one of `"asc"`, `"desc"` | no |  |
| `pile_list` | string (uuid) | no |  |
| `q` | string | no | at most 80 characters |
| `excluded_by` | string | no | matches `^[a-z][a-z0-9_]{0,59}$` |
| `fit` | one of `"strong"`, `"look"`, `"long"` | no |  |
| `reach` | array of one of `"email"`, `"phone"` or string | no |  |
| `status_group` | array of one of `"needs"`, `"in"`, `"none"` or string | no |  |
| `after_key` | string | no | at most 80 characters |
| `after_id` | string (uuid) | no |  |

## lines

### `POST /api/v1/lines/buy`

Writes; for a member of the workspace the request names, partner or above; counts against the `lines_buy` rate; may spend the workspace's money.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `number` | string | yes | matches `^\+[1-9]\d{6,14}$` |
| `area_code` | integer or string | no |  |

### `GET /api/v1/lines/codes`

Reads; for a member of the workspace the request names, partner or above; counts against the `lines_codes` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/lines/codes/route.ts`).

### `POST /api/v1/lines/forwarding`

Writes; for a member of the workspace the request names, partner or above; counts against the `lines_forwarding` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/lines/forwarding/route.ts`).

### `POST /api/v1/lines/forwarding/test`

Writes; for a member of the workspace the request names, partner or above; counts against the `lines_forwarding` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `line_id` | string or null | no |  |

### `POST /api/v1/lines/lookup`

Writes; for a member of the workspace the request names, partner or above; counts against the `lines_search` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `number` | string | yes | at least 7 characters; at most 32 characters |

### `POST /api/v1/lines/register`

Writes; for a member of the workspace the request names, partner or above; counts against the `lines_register` rate; may spend the workspace's money.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `line_id` | string | yes | at least 1 characters |

### `POST /api/v1/lines/retry`

Writes; for a member of the workspace the request names, partner or above; counts against the `lines_retry` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `line_id` | string or null | no |  |

### `POST /api/v1/lines/search`

Writes; for a member of the workspace the request names, partner or above; counts against the `lines_search` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `area_code` | number or string or null | no |  |

## mailbox-connections

### `PATCH /api/v1/mailbox-connections/[id]`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `paused` | boolean | no |  |
| `from_name` | string | no | at most 200 characters |
| `signature` | string or null | no |  |
| `signature_off` | boolean | no |  |
| `daily_cap` | integer | no | ≥ -9007199254740991; ≤ 9007199254740991 |

### `DELETE /api/v1/mailbox-connections/[id]`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/mailbox-connections/[id]/route.ts`).

### `POST /api/v1/mailbox-connections/[id]/check`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/mailbox-connections/[id]/check/route.ts`).

### `POST /api/v1/mailbox-connections/[id]/history`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `act` | one of `"stop"`, `"resume"`, `"bring"` | yes |  |

### `POST /api/v1/mailbox-connections/[id]/resume`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/mailbox-connections/[id]/resume/route.ts`).

### `POST /api/v1/mailbox-connections/[id]/test`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/mailbox-connections/[id]/test/route.ts`).

### `GET /api/v1/mailbox-connections/callback`

Reads; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/mailbox-connections/callback/route.ts`).

### `GET /api/v1/mailbox-connections/connect`

Reads; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `provider` | one of `"google"`, `"microsoft"` | yes |  |
| `mailbox_id` | string (uuid) | no |  |
| `admin` | one of `"1"` | no |  |
| `back` | one of `"start"`, `"new"`, `"cold_email"` | no |  |
| `history` | one of `"six_months"`, `"from_now"` | no |  |

## mailbox-senders

### `GET /api/v1/mailbox-senders`

Reads; for a member of the workspace the request names, viewer or above; counts against the `aggregate` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/mailbox-senders/route.ts`).

### `POST /api/v1/mailbox-senders`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `sender` | string | yes | at least 3 characters; at most 254 characters |
| `verdict` | one of `"automated"`, `"person"` or null | yes |  |

## mailboxes

### `POST /api/v1/mailboxes`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `local_part` | string | yes | at most 64 characters |
| `from_name` | string | yes | at most 200 characters |

### `PUT /api/v1/mailboxes/[id]`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `from_name` | string | yes | at most 200 characters |

## me

### `PUT /api/v1/me`

Writes; for any signed-in person, for themselves; counts against the `profile_set` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `display_name` | any | no |  |

### `DELETE /api/v1/me`

Writes; for any signed-in person, for themselves; counts against the `profile_set` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/me/route.ts`).

### `GET /api/v1/me/alerts`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/me/alerts/route.ts`).

### `PUT /api/v1/me/alerts`

Writes; for a member of the workspace the request names, viewer or above; counts against the `alert_choice` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `push_off` | array of string | yes | at most 40 |

### `PUT /api/v1/me/devices`

Writes; for any signed-in person, for themselves; counts against the `device_register` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/me/devices/route.ts`).

### `DELETE /api/v1/me/devices`

Writes; for any signed-in person, for themselves; counts against the `device_register` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `token` | string or null | no |  |

### `POST /api/v1/me/invitations/accept`

Writes; for any signed-in person, for themselves; counts against the `invitation_accept` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/me/invitations/accept/route.ts`).

### `POST /api/v1/me/web-push`

Writes; for any signed-in person, for themselves; no rate bucket; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `endpoint` | string | yes | at most 1000 characters; matches `^https:\/\/` |
| `keys` | object | yes |  |

### `DELETE /api/v1/me/web-push`

Writes; for any signed-in person, for themselves; no rate bucket; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `endpoint` | string | yes | at most 1000 characters |

## messages

### `POST /api/v1/messages/[id]/cancel-send`

Writes; for a member of the row's own workspace, operator or above; counts against the `thread_state` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/messages/[id]/cancel-send/route.ts`).

### `GET /api/v1/messages/[id]/media`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/messages/[id]/media/route.ts`).

### `POST /api/v1/messages/[id]/send-now`

Writes; for a member of the row's own workspace, operator or above; counts against the `thread_state` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/messages/[id]/send-now/route.ts`).

### `POST /api/v1/messages/[id]/steer`

Writes; for a member of the row's own workspace, operator or above; counts against the `whisper` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `text` | string | yes | at least 1 characters; at most 500 characters |

## metrics

### `GET /api/v1/metrics`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `days` | string | no |  |

## notifications

### `GET /api/v1/notifications`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/notifications/route.ts`).

### `PUT /api/v1/notifications`

Writes; for a member of the workspace the request names, viewer or above; counts against the `notify_mark` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `seen` | boolean | no |  |
| `id` | string | no |  |
| `read` | boolean | no |  |
| `dismissed` | boolean | no |  |

### `POST /api/v1/notifications/test`

Writes; for a member of the workspace the request names, partner or above; counts against the `alert_test` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/notifications/test/route.ts`).

## open

### `GET /api/v1/open`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `route` | one of `"today"`, `"inbox"` | yes |  |
| `period` | string | no | at most 16 characters |
| `thread` | string (uuid) | no |  |

## partner

### `GET /api/v1/partner`

Reads; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/partner/route.ts`).

### `POST /api/v1/partner`

Writes; for any signed-in person, for themselves; counts against the `partner_become` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `code` | string | yes | at least 1 characters; at most 64 characters |
| `terms` | `true` | yes |  |

### `PATCH /api/v1/partner`

Writes; for any signed-in person, for themselves; counts against the `partner_letters` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `letters` | boolean | yes |  |

### `GET /api/v1/partner/invitations`

Reads; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/partner/invitations/route.ts`).

### `POST /api/v1/partner/invitations/[id]/accept`

Writes; for any signed-in person, for themselves; counts against the `partner_invite_answer` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/partner/invitations/[id]/accept/route.ts`).

### `POST /api/v1/partner/invitations/[id]/decline`

Writes; for any signed-in person, for themselves; counts against the `partner_invite_answer` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/partner/invitations/[id]/decline/route.ts`).

### `GET /api/v1/partner/workspaces`

Reads; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/partner/workspaces/route.ts`).

### `POST /api/v1/partner/workspaces`

Writes; for any signed-in person, for themselves; counts against the `partner_handover` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | at least 2 characters; at most 120 characters |
| `timezone` | string or null | no |  |
| `email` | string | yes | at most 254 characters; matches `^[^@\s]+@[^@\s]+\.[^@\s]+$` |

### `POST /api/v1/partner/workspaces/[id]/resend`

Writes; for any signed-in person, for themselves; counts against the `partner_handover` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `email` | string | yes | at most 254 characters; matches `^[^@\s]+@[^@\s]+\.[^@\s]+$` |

## people

### `PUT /api/v1/people/[id]/business`

Writes; for a member of the row's own workspace, operator or above; counts against the `person_edit` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `lead_id` | string (uuid) | yes |  |

### `DELETE /api/v1/people/[id]/business`

Writes; for a member of the row's own workspace, operator or above; counts against the `person_edit` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/people/[id]/business/route.ts`).

### `POST /api/v1/people/[id]/draft`

Writes; for a member of the row's own workspace, operator or above; counts against the `person_draft` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `how` | one of `"message"`, `"call"` | yes |  |
| `wire` | one of `"whatsapp"`, `"sms"`, `"email"` | no |  |
| `about` | string | yes | at least 1 characters; at most 500 characters |
| `answers` | array of object | no | at most 2 |
| `previous` | object | no |  |
| `tone` | one of `"shorter"`, `"warmer"` | no |  |

### `POST /api/v1/people/[id]/message`

Writes; for a member of the row's own workspace, operator or above; counts against the `reply` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `wire` | one of `"whatsapp"`, `"sms"`, `"email"` | yes |  |
| `text` | string | no | at most 20000 characters |
| `subject` | string | no | at least 1 characters; at most 200 characters |
| `template` | object | no |  |
| `email_to` | string | no | at most 320 characters |
| `then` | one of `"receptionist"`, `"me"` | yes |  |
| `note` | string | no | at least 1 characters; at most 280 characters |

### `POST /api/v1/people/[id]/name`

Writes; for a member of the row's own workspace, operator or above; counts against the `person_edit` rate; spends nothing.

One of 3 bodies.

Body 1:

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `act` | `"adopt"` | yes |  |
| `message_id` | string (uuid) | yes |  |

Body 2:

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `act` | `"undo"` | yes |  |

Body 3:

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `act` | `"decline"` | yes |  |
| `message_id` | string (uuid) | yes |  |

### `GET /api/v1/people/[id]/reach`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/people/[id]/reach/route.ts`).

### `POST /api/v1/people/[id]/say`

Writes; for a member of the row's own workspace, operator or above; counts against the `person_draft` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `verb` | one of `"deal"`, `"note"` | yes |  |
| `words` | string | yes | at least 1 characters; at most 600 characters |

### `GET /api/v1/people/list-counts`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `lists` | string | yes | at most 800 characters |

## platform

### `GET /api/v1/platform/acts`

Reads; for platform staff; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `who` | string (uuid) | no |  |
| `before` | string (date-time) | no |  |
| `format` | one of `"rows"`, `"csv"` | no |  |

### `POST /api/v1/platform/claims`

Writes; for platform staff; counts against the `platform_claim` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string (uuid) | yes |  |
| `take` | boolean | yes |  |

### `POST /api/v1/platform/deliveries/redrive`

Writes; for platform staff; counts against the `platform_delivery_redrive` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `subscriber` | string | yes | matches `^[a-z][a-z0-9_]{1,62}$` |
| `why` | object | yes |  |

### `GET /api/v1/platform/find`

Reads; for platform staff; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `q` | string | yes | at least 2 characters; at most 80 characters |

### `GET /api/v1/platform/health`

Reads; for platform staff; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `days` | integer | no | ≥ -9007199254740991; ≤ 9007199254740991 |

### `GET /api/v1/platform/home`

Reads; for platform staff; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/platform/home/route.ts`).

### `POST /api/v1/platform/jobs/pause`

Writes; for platform staff; counts against the `platform_job_pause` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `kind` | one of `"outbound_send"`, `"broadcast_send"`, `"line_provision"`, `"email_ingest"`, `"lead_round_start"`, `"lead_collect"`, `"lead_check"`, `"push_send"`, `"push_receipts"`, `"reply_read"`, `"booking_read"`, `"event_deliver"`, `"inbound_answer"`, `"history_import"`, `"website_read"`, `"preview_build"`, `"erasure_finish"`, `"reply_draft"`, `"file_look"`, `"file_fetch"`, `"file_purge"`, `"video_digest"`, `"campaign_moments"`, `"reach_out_steps"`, `"calendar_read"`, `"google_read"`, `"canary"` | yes |  |
| `paused` | boolean | yes |  |
| `why` | object | yes |  |

### `POST /api/v1/platform/jobs/requeue`

Writes; for platform staff; counts against the `platform_job_requeue` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string (uuid) | yes |  |
| `job_id` | string (uuid) | yes |  |
| `why` | object | yes |  |

### `POST /api/v1/platform/jobs/requeue-kind`

Writes; for platform staff; counts against the `platform_job_requeue_kind` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `kind` | one of `"outbound_send"`, `"broadcast_send"`, `"line_provision"`, `"email_ingest"`, `"lead_round_start"`, `"lead_collect"`, `"lead_check"`, `"push_send"`, `"push_receipts"`, `"reply_read"`, `"booking_read"`, `"event_deliver"`, `"inbound_answer"`, `"history_import"`, `"website_read"`, `"preview_build"`, `"erasure_finish"`, `"reply_draft"`, `"file_look"`, `"file_fetch"`, `"file_purge"`, `"video_digest"`, `"campaign_moments"`, `"reach_out_steps"`, `"calendar_read"`, `"google_read"`, `"canary"` | yes |  |
| `since` | string (date-time) | yes |  |
| `why` | object | yes |  |

### `POST /api/v1/platform/lines/refile`

Writes; for platform staff; counts against the `platform_line_refile` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string (uuid) | yes |  |
| `line_id` | string (uuid) | yes |  |
| `why` | object | yes |  |

### `POST /api/v1/platform/lines/release`

Writes; for platform staff; counts against the `platform_line_release` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string (uuid) | yes |  |
| `line_id` | string (uuid) | yes |  |
| `why` | object | yes |  |

### `POST /api/v1/platform/lines/replace`

Writes; for platform staff; counts against the `platform_line_refile` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string (uuid) | yes |  |
| `line_id` | string (uuid) | yes |  |
| `why` | object | yes |  |

### `POST /api/v1/platform/lines/retry`

Writes; for platform staff; counts against the `platform_line_retry` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string (uuid) | yes |  |
| `line_id` | string (uuid) | yes |  |
| `why` | object | yes |  |

### `GET /api/v1/platform/me`

Reads; for platform staff; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/platform/me/route.ts`).

### `GET /api/v1/platform/overview`

Reads; for platform staff; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/platform/overview/route.ts`).

### `POST /api/v1/platform/partners/payout`

Writes; for platform staff; counts against the `platform_partner_payout` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `partner_id` | string (uuid) | yes |  |
| `currency` | string | yes | matches `^[a-z]{3}$` |
| `reference` | string | yes | at least 1 characters; at most 200 characters |
| `expected_cents` | integer | no | ≥ -9007199254740991; ≤ 9007199254740991 |
| `why` | object | yes |  |

### `POST /api/v1/platform/partners/second-factor`

Writes; for platform staff; counts against the `platform_partner_second_factor` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `partner_id` | string (uuid) | yes |  |
| `why` | object | yes |  |

### `POST /api/v1/platform/partners/standing`

Writes; for platform staff; counts against the `platform_partner_standing` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string (uuid) | yes |  |
| `standing` | one of `"qualified"`, `"review"`, `"disqualified"` | yes |  |
| `why` | object | yes |  |

### `POST /api/v1/platform/partners/status`

Writes; for platform staff; counts against the `platform_partner_status` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `partner_id` | string (uuid) | yes |  |
| `status` | one of `"active"`, `"paused"`, `"closed"` | yes |  |
| `why` | object | yes |  |

### `GET /api/v1/platform/requests`

Reads; for platform staff; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/platform/requests/route.ts`).

### `POST /api/v1/platform/requests`

Writes; for platform staff; counts against the `platform_request` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `kind` | one of `"delete_workspace"`, `"delete_person"`, `"copy"` | yes |  |
| `workspace` | string | yes | matches `^[a-z0-9][a-z0-9-]{0,62}$` |
| `asked_by` | string | yes | at least 3 characters; at most 200 characters |
| `asked_at` | string (date-time) | yes |  |
| `why` | object | yes |  |

### `POST /api/v1/platform/requests/step`

Writes; for platform staff; counts against the `platform_request` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `id` | string (uuid) | yes |  |
| `step` | one of `"confirmed"`, `"copy_sent"`, `"number_released"`, `"dry_run"`, `"deleted"`, `"passed_on"`, `"answered"`, `"sent"`, `"told"` or `"close"` | yes |  |
| `done` | boolean | yes |  |
| `why` | object | yes |  |

### `GET /api/v1/platform/support`

Reads; for platform staff; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `view` | one of `"needs"`, `"waiting"`, `"done"` | no |  |
| `kind` | one of `"all"`, `"question"`, `"ask"` | no |  |
| `topic` | one of `"whatsapp"`, `"forwarding"`, `"line"`, `"email"`, `"calendar"`, `"conversations"`, `"answers"`, `"facts"`, `"language"`, `"campaigns"`, `"leads"`, `"people"`, `"reviews"`, `"team"`, `"billing"`, `"other"` | no |  |
| `workspace` | string | no | matches `^[A-Za-z0-9][A-Za-z0-9-]{0,63}$` |
| `q` | string | no | at most 80 characters |
| `page` | integer | no | ≥ 1; ≤ 20 |

### `GET /api/v1/platform/support/bugs`

Reads; for platform staff; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/platform/support/bugs/route.ts`).

### `POST /api/v1/platform/support/kind`

Writes; for platform staff; counts against the `platform_support` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `id` | string (uuid) | yes |  |
| `kind` | one of `"how_to"`, `"setup"`, `"wrong"`, `"billing"` | yes |  |

### `POST /api/v1/platform/support/mark`

Writes; for platform staff; counts against the `platform_support` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `target` | one of `"report"`, `"ask"` | yes |  |
| `id` | string (uuid) | yes |  |
| `mark` | one of `"answered"`, `"done"`, `"reopened"` | yes |  |

### `POST /api/v1/platform/support/resend`

Writes; for platform staff; counts against the `platform_support_resend` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `id` | string (uuid) | yes |  |

### `GET /api/v1/platform/tenants/[id]`

Reads; for platform staff; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/platform/tenants/[id]/route.ts`).

### `POST /api/v1/platform/waitlist/invited`

Writes; for platform staff; counts against the `platform_waitlist_invited` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `id` | string (uuid) | yes |  |
| `why` | object | yes |  |

### `GET /api/v1/platform/workspaces/[slug]`

Reads; for platform staff; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/platform/workspaces/[slug]/route.ts`).

## playbooks

### `GET /api/v1/playbooks`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/playbooks/route.ts`).

### `POST /api/v1/playbooks`

Writes; for a member of the workspace the request names, operator or above; counts against the `playbook` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/playbooks/route.ts`).

### `PUT /api/v1/playbooks/[id]`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

One of 3 bodies.

Body 1:

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `state` | string | no |  |
| `name` | string | no |  |
| `run_hour` | number | no |  |
| `cap_per_run` | number | no |  |
| `gap_days` | number | no |  |
| `cadence_days` | number | no |  |
| `params` | array of any | no |  |
| `until` | string or null | no |  |
| `mode` | string | no |  |

Body 2:

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `channels` | array of string | yes |  |

Body 3:

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string or null | no |  |
| `trigger` | string | yes |  |
| `list_id` | string or null | no |  |
| `list_key` | string or null | no |  |
| `policy_class` | string or null | no |  |
| `template_id` | string | yes |  |
| `params` | array of any | no |  |
| `channels` | array of string | no |  |
| `run_hour` | number | no |  |
| `cap_per_run` | number | no |  |
| `gap_days` | number | no |  |
| `cadence_days` | number | no |  |

### `DELETE /api/v1/playbooks/[id]`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/playbooks/[id]/route.ts`).

### `POST /api/v1/playbooks/[id]/run`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/playbooks/[id]/run/route.ts`).

## policies

### `GET /api/v1/policies`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/policies/route.ts`).

### `PUT /api/v1/policies`

Writes; for a member of the workspace the request names, operator or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `class` | string | yes |  |
| `mode` | string | no |  |
| `reply_delay_ms` | number | no |  |
| `min_confidence` | number | no |  |
| `max_llm_tokens_day` | number | no |  |
| `max_replies_day` | number | no |  |
| `pause_hours` | number | no |  |
| `answer_within_hours` | number | no |  |

## preview-claims

### `POST /api/v1/preview-claims`

Writes; for any signed-in person, for themselves; counts against the `create_workspace` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `token` | string | yes | matches `^[A-Za-z0-9_-]{22}$` |

## reach-out-replies

### `GET /api/v1/reach-out-replies`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `since` | string (date-time) | no |  |
| `conversation_id` | string (uuid) | no |  |

### `POST /api/v1/reach-out-replies/[id]/undo`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/reach-out-replies/[id]/undo/route.ts`).

## reach-out-sends

### `POST /api/v1/reach-out-sends/[id]/decide`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `decision` | one of `"include"`, `"rewrite"`, `"skip"`, `"not_a_fit"` | yes |  |
| `change` | string | no | at most 280 characters |

### `POST /api/v1/reach-out-sends/[id]/said`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `outcome` | one of `"sent"`, `"not_sent"` | yes |  |

### `POST /api/v1/reach-out-sends/[id]/undo-rewrite`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/reach-out-sends/[id]/undo-rewrite/route.ts`).

### `POST /api/v1/reach-out-sends/check`

Writes; for a member of the workspace the request names, operator or above; counts against the `playbook` rate; may spend the workspace's money.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `send_ids` | array of string (uuid) | yes | at least 1; at most 20 |
| `stream` | boolean | no |  |

## reach-outs

### `GET /api/v1/reach-outs`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/reach-outs/route.ts`).

### `POST /api/v1/reach-outs`

Writes; for a member of the workspace the request names, operator or above; counts against the `playbook` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | at least 1 characters; at most 80 characters |
| `search_id` | string (uuid) | yes |  |
| `include_unconfirmed` | boolean | yes |  |
| `gap_minutes` | integer | yes | ≥ -9007199254740991; ≤ 9007199254740991 |
| `mailbox_ids` | array of string (uuid) | yes | at most 10 |
| `owner_sends` | boolean | no |  |
| `signed_by` | string or null | yes |  |
| `signs_with` | one of `"name"`, `"mailbox"` | no |  |
| `steps` | array of object | yes | at least 1; at most 5 |

### `GET /api/v1/reach-outs/[id]`

Reads; for a member of the row's own workspace; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/reach-outs/[id]/route.ts`).

### `PUT /api/v1/reach-outs/[id]`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | at least 1 characters; at most 80 characters |
| `search_id` | string (uuid) | yes |  |
| `include_unconfirmed` | boolean | yes |  |
| `gap_minutes` | integer | yes | ≥ -9007199254740991; ≤ 9007199254740991 |
| `mailbox_ids` | array of string (uuid) | yes | at most 10 |
| `owner_sends` | boolean | no |  |
| `signed_by` | string or null | yes |  |
| `signs_with` | one of `"name"`, `"mailbox"` | no |  |
| `steps` | array of object | yes | at least 1; at most 5 |

### `DELETE /api/v1/reach-outs/[id]`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/reach-outs/[id]/route.ts`).

### `POST /api/v1/reach-outs/[id]/leads`

Writes; for a member of the row's own workspace, operator or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `lead_ids` | array of string (uuid) | yes | at least 1; at most 500 |

### `POST /api/v1/reach-outs/[id]/leads/check`

Writes; for a member of the row's own workspace, operator or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `lead_ids` | array of string (uuid) | yes | at least 1; at most 500 |

### `POST /api/v1/reach-outs/[id]/leads/leave`

Writes; for a member of the row's own workspace, operator or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `lead_id` | string (uuid) | yes |  |

### `GET /api/v1/reach-outs/[id]/people`

Reads; for a member of the row's own workspace; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `limit` | integer | no | ≥ 1; ≤ 200 |

### `GET /api/v1/reach-outs/leads`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `search` | string (uuid) | no |  |
| `lead` | string (uuid) | no |  |

### `POST /api/v1/reach-outs/leads/[id]/said`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `intent` | one of `"interested"`, `"question"`, `"not_now"`, `"no"`, `"wrong_person"` | yes |  |
| `day` | string or null | no |  |
| `refer_to` | string or null | no |  |

### `POST /api/v1/reach-outs/leads/[id]/stop`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/reach-outs/leads/[id]/stop/route.ts`).

### `POST /api/v1/reach-outs/preview`

Writes; for a member of the workspace the request names, operator or above; counts against the `reach_out_preview` rate; may spend the workspace's money.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `search_id` | string (uuid) | yes |  |
| `index` | integer | yes | ≥ 0; ≤ 199 |
| `include_unconfirmed` | boolean | yes |  |
| `words` | object | yes |  |
| `signed_by` | string or null | yes |  |
| `signs_with` | one of `"name"`, `"mailbox"` | no |  |
| `mailbox_id` | string (uuid) or null | no |  |
| `language` | string | no | matches `^[a-z]{2,3}(_[A-Z]{2})?$` |

### `GET /api/v1/reach-outs/reach`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `search` | string (uuid) | yes |  |

### `GET /api/v1/reach-outs/sources`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/reach-outs/sources/route.ts`).

## receptionist

### `POST /api/v1/receptionist/agent`

Writes; for a member of the workspace the request names, partner or above; counts against the `receptionist_call` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/receptionist/agent/route.ts`).

### `POST /api/v1/receptionist/fix`

Writes; for a member of the workspace the request names, partner or above; counts against the `receptionist_review` rate; may spend the workspace's money.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `kind` | one of `"hours"`, `"closure"`, `"service"`, `"booking_link"`, `"note"`, `"tone"`, `"own_words"`, `"handoff"`, `"guardrail"`, `"languages"`, `"none"` | yes |  |
| `words` | string | yes | at most 2000 characters |
| `customer` | string | yes | at most 2000 characters |
| `answer` | string | yes | at most 4000 characters |
| `rule` | string or null | yes |  |

### `POST /api/v1/receptionist/keep`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `rehearsal_id` | string (uuid) | yes |  |
| `change` | object or object or object or object or object or object or object or object or object or object or object or object or object or object or object or object or object or object or object or object or object or object or object or object or object or object or object or object or object | yes |  |
| `via` | one of `"rehearsal"`, `"call_review"` | yes |  |
| `channel` | one of `"whatsapp"`, `"voice"` | yes |  |

### `POST /api/v1/receptionist/rehearsals`

Writes; for a member of the workspace the request names, partner or above; counts against the `receptionist_call` rate; may spend the workspace's money.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/receptionist/rehearsals/route.ts`).

### `GET /api/v1/receptionist/rehearsals/[id]`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/receptionist/rehearsals/[id]/route.ts`).

### `POST /api/v1/receptionist/review`

Writes; for a member of the workspace the request names, partner or above; counts against the `receptionist_review` rate; may spend the workspace's money.

One of 3 bodies.

Body 1:

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `rehearsal_id` | string (uuid) | yes |  |

Body 2:

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `call_id` | string (uuid) | yes |  |

Body 3:

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `turns` | array of object | yes | at least 2; at most 12 |
| `config_version` | integer or null | yes |  |

### `POST /api/v1/receptionist/try`

Writes; for a member of the workspace the request names, partner or above; counts against the `receptionist_try` rate; may spend the workspace's money.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `text` | string | yes | at least 1 characters; at most 500 characters |
| `history` | array of object | no | at most 12 |

## reports

### `GET /api/v1/reports`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `period` | one of `"7d"`, `"30d"`, `"90d"`, `"month"` | no |  |
| `from` | string | no |  |
| `to` | string | no |  |

### `GET /api/v1/reports/campaigns`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `period` | one of `"7d"`, `"30d"`, `"90d"`, `"month"` | no |  |
| `from` | string | no |  |
| `to` | string | no |  |

### `GET /api/v1/reports/campaigns/ledger`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `period` | one of `"7d"`, `"30d"`, `"90d"`, `"month"` | no |  |
| `from` | string | no |  |
| `to` | string | no |  |

### `GET /api/v1/reports/headline`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `period` | one of `"7d"`, `"30d"`, `"90d"`, `"month"` | no |  |

### `GET /api/v1/reports/people`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `period` | one of `"7d"`, `"30d"`, `"90d"`, `"month"` | no |  |
| `from` | string | no |  |
| `to` | string | no |  |

### `GET /api/v1/reports/reach-outs`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `period` | one of `"7d"`, `"30d"`, `"90d"`, `"month"` | no |  |
| `from` | string | no |  |
| `to` | string | no |  |

### `GET /api/v1/reports/receptionist`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `period` | one of `"7d"`, `"30d"`, `"90d"`, `"month"` | no |  |
| `from` | string | no |  |
| `to` | string | no |  |

### `GET /api/v1/reports/reviews`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `period` | one of `"7d"`, `"30d"`, `"90d"`, `"month"` | no |  |
| `from` | string | no |  |
| `to` | string | no |  |

## segments

### `GET /api/v1/segments`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/segments/route.ts`).

### `POST /api/v1/segments`

Writes; for a member of the workspace the request names, operator or above; counts against the `lists` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/segments/route.ts`).

### `PUT /api/v1/segments/[id]`

Writes; for a member of the row's own workspace, operator or above; counts against the `lists` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/segments/[id]/route.ts`).

### `DELETE /api/v1/segments/[id]`

Writes; for a member of the row's own workspace, operator or above; counts against the `lists` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/segments/[id]/route.ts`).

### `POST /api/v1/segments/draft`

Writes; for a member of the workspace the request names, operator or above; counts against the `ask` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `words` | string | yes | at least 4 characters; at most 300 characters |

## sequences

### `GET /api/v1/sequences`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/sequences/route.ts`).

### `POST /api/v1/sequences`

Writes; for a member of the workspace the request names, operator or above; counts against the `playbook` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `first` | object | yes |  |
| `then` | array of object | yes | at most 3 |
| `start` | boolean | yes |  |

### `GET /api/v1/sequences/[id]`

Reads; for a member of the row's own workspace; counts against the `aggregate` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/sequences/[id]/route.ts`).

### `DELETE /api/v1/sequences/[id]`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/sequences/[id]/route.ts`).

### `PUT /api/v1/sequences/[id]/chain`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | at least 1 characters; at most 80 characters |
| `include_unconfirmed` | boolean | yes |  |
| `gap_minutes` | integer | yes | ≥ -9007199254740991; ≤ 9007199254740991 |
| `mailbox_ids` | array of string (uuid) | yes | at most 10 |
| `owner_sends` | boolean | no |  |
| `signed_by` | string or null | yes |  |
| `signs_with` | one of `"name"`, `"mailbox"` | no |  |
| `steps` | array of object | yes | at least 1; at most 5 |
| `source_search_id` | string or null | no |  |

### `GET /api/v1/sequences/[id]/history`

Reads; for a member of the row's own workspace; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `before` | string | no |  |

### `POST /api/v1/sequences/[id]/leads`

Writes; for a member of the row's own workspace, operator or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `lead_ids` | array of string (uuid) | yes | at least 1; at most 500 |

### `POST /api/v1/sequences/[id]/leads/check`

Writes; for a member of the row's own workspace, operator or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `lead_ids` | array of string (uuid) | yes | at least 1; at most 500 |

### `POST /api/v1/sequences/[id]/leave`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `enrollment_ids` | array of string | no | at most 500 |
| `lead_ids` | array of string | no | at most 500 |

### `POST /api/v1/sequences/[id]/move`

Writes; for a member of the row's own workspace, operator or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `lead_id` | string | yes | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `GET /api/v1/sequences/[id]/people`

Reads; for a member of the row's own workspace; counts against the `aggregate` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/sequences/[id]/people/route.ts`).

### `GET /api/v1/sequences/[id]/reach`

Reads; for a member of the row's own workspace; counts against the `aggregate` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/sequences/[id]/reach/route.ts`).

### `GET /api/v1/sequences/[id]/replies`

Reads; for a member of the row's own workspace; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `period` | one of `"30"`, `"90"`, `"all"` | no |  |

### `POST /api/v1/sequences/[id]/return`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/sequences/[id]/return/route.ts`).

### `POST /api/v1/sequences/[id]/rewrite`

Writes; for a member of the row's own workspace, operator or above; counts against the `ask` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `subject` | string or null | yes |  |
| `body` | string | yes | at most 1200 characters |
| `change` | string | yes | at least 1 characters; at most 280 characters |

### `POST /api/v1/sequences/[id]/steps`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `after_days` | integer | yes | ≥ 1; ≤ 90 |
| `template_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `hand` | object | no | A call or a note for the team: { kind: call \| note, words } (1 to 280 characters) |
| `params` | array of any | no | at most 20 |
| `only_if` | array of one of `"no_booking"`, `"no_reply"` | no | at most 2 |
| `channels` | array of one of `"whatsapp"`, `"sms"`, `"email"` | no | at least 1; at most 3 |
| `name` | string | no | at least 1 characters; at most 120 characters |

### `PUT /api/v1/sequences/[id]/steps/[step]`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `after_days` | integer | no | ≥ 1; ≤ 90 |
| `only_if` | array of one of `"no_booking"`, `"no_reply"` | no | at most 2 |
| `channels` | array of one of `"whatsapp"`, `"sms"`, `"email"` | no | at least 1; at most 3 |
| `name` | string | no | at least 1 characters; at most 120 characters |
| `params` | array of any | no | at most 20 |
| `hand` | object | no | A call or a note for the team: { kind: call \| note, words } (1 to 280 characters) |

### `DELETE /api/v1/sequences/[id]/steps/[step]`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/sequences/[id]/steps/[step]/route.ts`).

### `POST /api/v1/sequences/[id]/steps/[step]/lead-words`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `lead_id` | string | yes | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `words` | object or null | yes |  |

### `POST /api/v1/sequences/[id]/steps/[step]/test`

Writes; for a member of the row's own workspace, operator or above; counts against the `step_test` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `lead_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/v1/sequences/[id]/steps/[step]/words`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `template_id` | string | yes | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `params` | array of any | no | at most 20 |

### `POST /api/v1/sequences/draft`

Writes; for a member of the workspace the request names, operator or above; counts against the `ask` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `words` | string | yes | at least 8 characters; at most 500 characters |
| `kind` | one of `"sequence"`, `"once"` | no |  |
| `audience` | one of `"people"`, `"leads"` | no |  |
| `who` | object or object or object or object or object | no |  |
| `previous` | object | no |  |

### `POST /api/v1/sequences/new`

Writes; for a member of the workspace the request names, operator or above; counts against the `broadcast` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `kind` | one of `"sequence"`, `"once"` | yes |  |
| `audience` | one of `"people"`, `"leads"` | yes |  |
| `name` | string | yes | at least 1 characters; at most 80 characters |
| `who` | object or object or object or object or object | yes |  |
| `run_hour` | integer | yes | ≥ 9; ≤ 20 |
| `at` | string or null | yes |  |
| `channels` | array of one of `"whatsapp"`, `"sms"`, `"email"` | yes | at most 3 |
| `mode` | one of `"auto"`, `"veto"`, `"ask"` or null | yes |  |
| `adds_new` | boolean | yes |  |
| `owner_sends` | `false` | no |  |
| `draft_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `as_drafted` | object | no |  |
| `steps` | array of object | yes | at least 1; at most 6 |
| `start` | boolean | yes |  |

### `POST /api/v1/sequences/voice`

Writes; for a member of the workspace the request names, operator or above; counts against the `ask` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `text` | string | yes | at least 40 characters; at most 4000 characters |

## settings

### `GET /api/v1/settings`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/settings/route.ts`).

### `PUT /api/v1/settings`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/settings/route.ts`).

### `GET /api/v1/settings/reach-out`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/settings/reach-out/route.ts`).

### `GET /api/v1/settings/reach-out/note`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/settings/reach-out/note/route.ts`).

### `POST /api/v1/settings/reach-out/provider-wanted`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `provider` | string | yes | at least 1 characters; at most 60 characters |

### `GET /api/v1/settings/reach-out/told`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `kind` | one of `"words"`, `"opening"` | yes |  |

### `POST /api/v1/settings/receptionist`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/settings/receptionist/route.ts`).

## setup

### `GET /api/v1/setup`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/setup/route.ts`).

### `PUT /api/v1/setup/choices`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `phone` | object or null | no |  |
| `whatsapp` | one of `"same"`, `"own"`, `"later"` | no |  |
| `marks` | array of one of `"receptionist-met"`, `"rehearse-skipped"`, `"channels-seen"` | no | at most 3 |
| `version` | integer | no | ≥ 0; ≤ 9007199254740991 |

### `POST /api/v1/setup/request`

Writes; for a member of the workspace the request names, operator or above; counts against the `setup_request` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `what` | string | yes |  |

## support

### `POST /api/v1/support/report`

Writes; for any signed-in person, for themselves; counts against the `support_report` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `kind` | one of `"how_to"`, `"setup"`, `"wrong"`, `"billing"` | no |  |
| `words` | string | yes | at least 1 characters; at most 2000 characters |
| `page` | string or null | yes |  |
| `error` | object or null | yes |  |
| `workspace` | string or null | yes |  |

## team

### `GET /api/v1/team`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/team/route.ts`).

### `PATCH /api/v1/team/[id]`

Writes; for a member of the workspace the request names, owner or above; counts against the `team` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `role` | one of `"owner"`, `"operator"`, `"viewer"` | yes |  |

### `DELETE /api/v1/team/[id]`

Writes; for a member of the workspace the request names, owner or above; counts against the `team` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/team/[id]/route.ts`).

### `POST /api/v1/team/invite`

Writes; for a member of the workspace the request names, owner or above; counts against the `invite` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `email` | string | yes | matches `^[^\s@]+@[^\s@]+\.[^\s@]+$` |
| `role` | one of `"operator"`, `"viewer"` | yes |  |

### `POST /api/v1/team/invite/[id]/resend`

Writes; for a member of the workspace the request names, owner or above; counts against the `invite` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/team/invite/[id]/resend/route.ts`).

### `POST /api/v1/team/leave`

Writes; for a member of the workspace the request names, viewer or above; counts against the `team` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/team/leave/route.ts`).

### `GET /api/v1/team/partner`

Reads; for a member of the workspace the request names, owner or above; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/team/partner/route.ts`).

### `POST /api/v1/team/partner`

Writes; for a member of the workspace the request names, owner or above; counts against the `partner_invite` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `code` | string | yes | at least 1 characters; at most 200 characters |

### `DELETE /api/v1/team/partner`

Writes; for a member of the workspace the request names, owner or above; counts against the `partner_invite` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/team/partner/route.ts`).

## templates

### `GET /api/v1/templates`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `all` | string | no |  |

### `POST /api/v1/templates`

Writes; for a member of the workspace the request names, operator or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/templates/route.ts`).

### `PUT /api/v1/templates/[id]`

Writes; for a member of the row's own workspace, operator or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `hidden` | boolean | no |  |
| `title` | string or null | no |  |

### `DELETE /api/v1/templates/[id]`

Writes; for a member of the row's own workspace, operator or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/templates/[id]/route.ts`).

### `POST /api/v1/templates/draft`

Writes; for a member of the workspace the request names, operator or above; counts against the `ask` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `brief` | string | no |  |
| `category` | one of `"marketing"`, `"utility"` | no |  |
| `language` | string | no |  |
| `translate` | object | no |  |

### `POST /api/v1/templates/message`

Writes; for a member of the workspace the request names, operator or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes |  |
| `language` | string | yes |  |
| `category` | one of `"marketing"`, `"utility"` | yes |  |
| `versions` | object | yes |  |
| `slots` | array of object | yes |  |

### `POST /api/v1/templates/starter`

Writes; for a member of the workspace the request names, operator or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/templates/starter/route.ts`).

### `POST /api/v1/templates/sync`

Writes; for a member of the workspace the request names, operator or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/templates/sync/route.ts`).

### `POST /api/v1/templates/versions`

Writes; for a member of the workspace the request names, operator or above; counts against the `playbook` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | at least 1 characters |
| `language` | string | yes |  |
| `channel` | one of `"email"`, `"sms"` | yes |  |
| `subject` | string or null | no |  |
| `body` | string | yes |  |
| `message` | object | no |  |

### `DELETE /api/v1/templates/versions/[id]`

Writes; for a member of the row's own workspace, operator or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/templates/versions/[id]/route.ts`).

### `POST /api/v1/templates/versions/rewrite`

Writes; for a member of the workspace the request names, operator or above; counts against the `ask` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `channel` | one of `"email"`, `"sms"` | yes |  |
| `language` | string | yes |  |
| `subject` | string or null | no |  |
| `body` | string | yes | at least 1 characters; at most 4000 characters |
| `tone` | one of `"warmer"`, `"shorter"` | yes |  |

## today

### `GET /api/v1/today`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/today/route.ts`).

## views

### `GET /api/v1/views`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/views/route.ts`).

### `PUT /api/v1/views/[page]`

Writes; for a member of the workspace the request names, viewer or above; counts against the `view_set` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `view` | object | yes |  |

## vitals

### `POST /api/v1/vitals`

Writes; for any signed-in person, for themselves; counts against the `vitals` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `page` | string | yes | matches `^[a-z][a-z0-9-]{0,31}$` |
| `device` | one of `"desk"`, `"phone"` | no |  |
| `build` | string | no | matches `^[0-9a-z]{3,40}$` |
| `vitals` | array of object | yes | at least 1; at most 100 |

## workspaces

### `GET /api/v1/workspaces`

Reads; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/workspaces/route.ts`).

### `PATCH /api/v1/workspaces`

Writes; for a member of the workspace the request names, partner or above; no rate bucket; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/workspaces/route.ts`).

### `PUT /api/v1/workspaces/accent`

Writes; for a member of the workspace the request names, partner or above; counts against the `workspace_logo` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `accent` | string | yes | matches `^#[0-9a-fA-F]{6}$` |

### `DELETE /api/v1/workspaces/accent`

Writes; for a member of the workspace the request names, partner or above; counts against the `workspace_logo` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/workspaces/accent/route.ts`).

### `POST /api/v1/workspaces/create`

Writes; for any signed-in person, for themselves; counts against the `create_workspace` rate; spends nothing. Takes no `Idempotency-Key`: there is no workspace to keep it in.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/workspaces/create/route.ts`).

### `PUT /api/v1/workspaces/logo`

Writes; for a member of the workspace the request names, partner or above; counts against the `workspace_logo` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `image` | string | yes | at least 1 characters; at most 349528 characters; matches `^[A-Za-z0-9+/]+={0,2}$` |

### `DELETE /api/v1/workspaces/logo`

Writes; for a member of the workspace the request names, partner or above; counts against the `workspace_logo` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/workspaces/logo/route.ts`).

### `POST /api/v1/workspaces/logo/lookup`

Writes; for a member of the workspace the request names, partner or above; counts against the `workspace_logo_lookup` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/workspaces/logo/lookup/route.ts`).

## The edge's doors

Every door on the edge whose body contracts declares (`packages/contracts/src/<domain>/edge-doors.ts`, decision 0109):
the dashboard's `callEdge` sends a declared door the body its schema takes, and the door reads its body through the same
schema. Who may knock on each is `tests/edge/door-policy.json`'s.

54 doors.

### `POST /api/admin/billing`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `op` | string | yes |  |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `email` | string or null | no |  |
| `return` | any | no |  |
| `embedded` | boolean | no |  |

### `POST /api/admin/calendar/feed`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `from` | number | no |  |
| `to` | number | no |  |

### `POST /api/admin/calendar/freed-time`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `appointment_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/draft`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `conversation_id` | string | yes | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `kind` | string | no |  |
| `instruction` | string | no |  |
| `given` | string | no |  |

### `POST /api/admin/email/alert-test`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/email/signup-confirm`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `contact_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/email/test-to-self`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `subject` | string | no |  |
| `text` | string | no |  |

### `POST /api/admin/email/wire`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `op` | string | yes |  |

### `POST /api/admin/eval`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `cases` | array of object | no |  |

### `POST /api/admin/files/copies`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `ids` | array of string | no |  |
| `pictures` | array of object | no |  |
| `moments` | array of object | no |  |
| `frames` | array of object | no |  |

### `POST /api/admin/files/listen`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `id` | string | yes | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `question` | string | yes |  |
| `from` | number or null | yes |  |
| `to` | number or null | yes |  |

### `POST /api/admin/files/play`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `id` | string | yes | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/files/video-start`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `id` | string | yes | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `name` | string | yes |  |
| `mime` | string | yes |  |
| `bytes` | number | yes |  |
| `seconds` | number or null | yes |  |
| `fingerprint` | string | yes |  |

### `POST /api/admin/google`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `op` | string | yes |  |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `place_id` | string | no |  |
| `query` | string | no |  |
| `code` | string | no |  |
| `account_name` | string | no |  |
| `location_name` | string | no |  |
| `id` | string | no |  |
| `instruction` | string | no |  |
| `given` | string | no |  |
| `comment` | string | no |  |
| `file_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `summary` | string | no |  |
| `photo_url` | string | no |  |
| `language` | string | no |  |
| `call` | boolean | no |  |
| `post_name` | string | no |  |

### `POST /api/admin/hand-over`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `call_id` | string | no |  |
| `line` | string | no |  |

### `POST /api/admin/handover-invite`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/imports/again`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `source` | string | no |  |

### `POST /api/admin/imports/logo-lookup`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/imports/website-read`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/instagram/account`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `op` | string | yes |  |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `code` | string | no |  |
| `channel_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/intake/replay`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `provider` | string | no |  |
| `provider_event_id` | string | no |  |

### `POST /api/admin/lines`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `op` | string | yes |  |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `area_code` | number or string | no |  |
| `number` | string | no |  |
| `line_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `by` | string | no |  |
| `record` | any | no |  |
| `path` | string | no |  |
| `mock` | boolean | no |  |
| `refile` | boolean | no |  |
| `replace` | boolean | no |  |

### `GET /api/admin/lines/codes`

Read with GET; takes no body.

### `POST /api/admin/llm`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `purpose` | string | no |  |
| `request` | any | no |  |

### `POST /api/admin/mailboxes`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `op` | string | yes |  |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `mailbox_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `provider` | string | no |  |
| `code` | string | no |  |
| `code_verifier` | string | no |  |
| `from_name` | string | no |  |
| `signature` | string or null | no |  |
| `signature_off` | boolean | no |  |
| `daily_cap` | number | no |  |
| `address` | string | no |  |
| `history` | any | no |  |

### `POST /api/admin/meta/connection`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `op` | string | yes |  |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `code` | string | no |  |
| `channel_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/partner-invite`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/playbooks-run`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `playbook_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/previews/make`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `lead_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/reach-out-preview`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `search_id` | string (uuid) | yes |  |
| `index` | integer | yes | ≥ 0; ≤ 199 |
| `include_unconfirmed` | boolean | yes |  |
| `words` | object | yes |  |
| `signed_by` | string or null | yes |  |
| `signs_with` | one of `"name"`, `"mailbox"` | no |  |
| `mailbox_id` | string (uuid) or null | no |  |
| `language` | string | no | matches `^[a-z]{2,3}(_[A-Z]{2})?$` |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/reach-out/check`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `send_ids` | array of string | no |  |
| `stream` | boolean | no |  |

### `POST /api/admin/rehearsal/agent`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/rehearsal/call`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/rehearsal/fix`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `kind` | string | no |  |
| `words` | string | no |  |
| `customer` | string | no |  |
| `answer` | string | no |  |
| `rule` | string | no |  |

### `POST /api/admin/rehearsal/review`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `rehearsal_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `call_id` | string | no |  |
| `turns` | array of object | no |  |
| `config_version` | number or null | no |  |

### `POST /api/admin/setup-request`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `what` | string | no |  |
| `by` | string or null | no |  |

### `POST /api/admin/signup-notify`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `email` | string | no |  |

### `POST /api/admin/steer`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `message_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `text` | string | no |  |

### `POST /api/admin/stop-call`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `call_id` | string | no |  |

### `POST /api/admin/support/report`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `report_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/voice-converge`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `agent_id` | string | no |  |
| `apply` | boolean | no |  |
| `publish` | boolean | no |  |
| `shell` | boolean | no |  |
| `pin_number` | string | no |  |

### `POST /api/admin/voice-provision`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `number` | string | no |  |
| `area_code` | number or string | no |  |
| `llm_id` | string | no |  |
| `agent_id` | string | no |  |
| `apply` | boolean | no |  |

### `POST /api/admin/voice/erase-calls`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `call_ids` | array of string | no |  |

### `POST /api/admin/voice/session`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/voice/speech`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `text` | string | no |  |
| `purpose` | string | no |  |
| `before` | string | no |  |

### `POST /api/admin/whatsapp/connect`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `code` | string | no |  |
| `phone_number_id` | string | no |  |
| `waba_id` | string | no |  |
| `keep_app` | boolean | no |  |

### `GET /api/admin/whatsapp/signup-config`

Read with GET; takes no body.

### `POST /api/admin/whatsapp/standing`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/whatsapp/templates-create`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `user_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `name` | string | no |  |
| `language` | string | no |  |
| `category` | string | no |  |
| `components` | array of any | no |  |
| `body` | string | no |  |
| `examples` | array of string | no |  |
| `labels` | array of string | no |  |

### `POST /api/admin/whatsapp/templates-delete`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |
| `template_id` | string | no |  |

### `POST /api/admin/whatsapp/templates-sync`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/admin/whisper`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `call_id` | string | no |  |
| `text` | string | no |  |
| `trigger` | boolean | no |  |

### `POST /api/admin/you-are-live`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tenant_id` | string | no | matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` |

### `POST /api/voice-canary`

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `op` | string | no |  |
| `since` | string | no |  |

## What a refusal answers

A route refuses with `{ ok: false, error: { code, message, details? } }`: a code from one closed set, a sentence a
person may read, and what the code's `ErrorDetailsByCode` says it carries. Every answer carries `x-request-id`, which
finds its lines in the log. A failure's own text is never in an answer.

| Code | Status | What it says |
| --- | --- | --- |
| `unauthorized` | 401 | Not signed in, or the session has ended. |
| `forbidden` | 403 | Signed in, and this role may not. |
| `not_found` | 404 | No such thing in this workspace. |
| `validation` | 400 | What was sent cannot be taken; the words say why. |
| `choose_workspace` | 400 | The account is in several workspaces and the request did not say which. |
| `mfa_required` | 403 | A partner's seat needs its second factor first. |
| `conflict` | 409 | It already exists, or what it depends on has moved. |
| `rate_limited` | 429 | Too many for now; `details.retry_after_s` says when it lifts. |
| `payment_required` | 402 | The workspace may not do this until it pays. |
| `window_closed` | 409 | The channel's reply window has closed. |
| `upstream_meta` | 502 | Meta refused or could not be reached. |
| `upstream_retell` | 502 | The voice provider refused or could not be reached. |
| `upstream_anthropic` | 502 | The model refused or could not be reached. |
| `upstream_email` | 502 | The email provider refused or failed. |
| `upstream_auth` | 503 | Sign-in could not be checked just now; the session stands. |
| `upstream_voice` | 503 | Ask's voice refused, could not be reached, or is not set up here. |
| `upstream_provider` | 502 | A provider, or the edge asked on our behalf, refused or never answered. |
| `unavailable` | 503 | It could not be done just now; trying again may do it. |
| `internal` | 500 | Something failed that nothing here expected; its text is only in the log. |

### What the database answers by

A failed reply from the database keeps its code (`DbFailure`). These codes a door raises on purpose, so a route answers
them as refusals, in the door's own sentence; a sentence Postgres wrote, which names a constraint or a table, is
answered in plain words instead. Any other failure is `internal`.

| Database code | Code | Status |
| --- | --- | --- |
| `22023` | `validation` | 400 |
| `23505` | `conflict` | 409 |
| `42501` | `forbidden` | 403 |
| `P0002` | `not_found` | 404 |
| `PE001` | `conflict` | 409 |

### The edge's codes

A door on the edge refuses with `{ ok: false, error, detail? }`: `error` is a code a caller compares, `detail` words a
person or support may read (`packages/contracts/src/shared/edge-errors.ts`). A door that crashes answers `door_failed`,
at 500, and logs `door_failed` with the stack and the request's name.

`accounts_unreadable`, `already_registered`, `already_sent`, `already_subscribed`, `ask_budget`, `bad_request`, `bad_signature`, `bad_template`, `bad_tenant`, `brain_failed`, `campaign_rejected`, `channel_read_failed`, `channel_write_failed`, `check_unset`, `config_broken`, `connection_write_failed`, `context_failed`, `could_not_queue`, `could_not_retire_old_draft`, `credentials_failed`, `direct`, `door_failed`, `draft_not_owed`, `draft_refused`, `email_off`, `empty_draft`, `erasure_unreadable`, `exchange_failed`, `free_mail`, `google_refused`, `grant_unreadable`, `in_flight`, `ingest_failed`, `instagram_account_taken`, `instagram_account_unreadable`, `instagram_accounts_several`, `instagram_messages_not_granted`, `invalid`, `key_unavailable`, `lane_unset`, `line_exists`, `line_failed_retry`, `line_not_retryable`, `line_retry_taken`, `listing_read_failed`, `listing_write_failed`, `mailbox_taken`, `message_read_failed`, `meta_failed`, `meta_off`, `meta_refused`, `mock_registration`, `model_failed`, `model_paused`, `model_unavailable`, `model_unreachable`, `no_account`, `no_app_credentials`, `no_billing_record`, `no_business_record`, `no_campaign_to_resubmit`, `no_channel`, `no_credentials`, `no_customer`, `no_database`, `no_fn_secret`, `no_line_credentials`, `no_line_provider`, `no_listing`, `no_location`, `no_locations`, `no_messaging_service`, `no_model_key`, `no_oauth_client`, `no_open_handover`, `no_open_invitation`, `no_persona`, `no_phone`, `no_places_key`, `no_platform_mailbox`, `no_primary_profile`, `no_provider`, `no_provider_credentials`, `no_provider_key`, `no_refresh_token`, `no_registration_readable`, `no_review`, `no_sender`, `no_subaccount`, `no_subscription`, `no_such_location`, `no_token`, `no_waba`, `no_workspace_readable`, `not_a_held_draft`, `not_connected`, `not_found`, `not_from_profile`, `not_held`, `not_on_maps`, `not_paused`, `not_ready`, `not_rejected`, `not_trialing`, `nothing_to_answer`, `nothing_to_do`, `number_ambiguous`, `number_missing`, `number_taken`, `number_unreadable`, `payment_required`, `pin_required`, `platform_hold`, `platform_only`, `policy_block_price`, `policy_never`, `preview_failed`, `provider_refused`, `provider_unauthorized`, `provider_unreachable`, `purge_failed`, `query_failed`, `reach_out_step`, `read_failed`, `record_incomplete`, `register_failed`, `registration_pending`, `rehearsal_empty`, `rehearsal_minutes_used`, `replace_failed`, `resubmit_failed`, `review_read_failed`, `review_write_failed`, `routing_unreadable`, `run_failed`, `scope_missing`, `signature`, `sole_proprietor_incomplete`, `stripe_refused`, `stripe_unreadable`, `subscribe_failed`, `token_audience`, `token_body`, `token_expired`, `token_malformed`, `token_replayed`, `token_required`, `token_signature`, `too_large`, `too_many`, `too_many_on_domain`, `unauthorized`, `unavailable`, `unfile_failed`, `unknown_op`, `unreadable`, `voice_canary_failed`, `voice_canary_too_soon`, `voice_canary_unset`, `waba_not_granted`, `waba_unreadable`, `workspace_mismatch`, `write_failed`
