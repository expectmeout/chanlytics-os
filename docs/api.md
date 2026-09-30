<!-- Written by tooling/scripts/gen/api-reference.mjs from each route's route() declaration: do not edit. -->

# The /api/v1 reference

Every member-facing route, by domain: who may call it, the rate bucket it counts against, whether it may spend
the workspace's money, and the fields it takes. A workspace-scoped route names its workspace with `?workspace=`
(`apps/dashboard/src/server/route.ts`). What a route answers is its handler's return type, which the typed client
reads (`apps/dashboard/src/client/api.ts`). Regenerate with `corepack pnpm gen:api-reference`; the suite fails a
stale copy.

205 handlers in 46 domains.

## activity

### `GET /api/v1/activity`

Reads; for a member of the workspace the request names, owner or above; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `person` | string (uuid) | no |  |
| `kind` | string | no | at most 60 characters; matches `^[a-z_.]+$` |
| `day` | string | no | matches `^\d{4}-\d{2}-\d{2}$` |
| `cursor` | string | no | at most 120 characters; matches `^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z\|[+-][\d:]+)?\\|[de]-[\w-]+$` |

## ask

### `POST /api/v1/ask`

Writes; for a member of the workspace the request names, viewer or above; counts against the `ask` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/ask/route.ts`).

### `POST /api/v1/ask/messages/[id]/proposals/[pid]`

Writes; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/ask/messages/[id]/proposals/[pid]/route.ts`).

### `GET /api/v1/ask/openings`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `day` | string | no |  |
| `service` | string | no |  |

### `GET /api/v1/ask/threads`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/ask/threads/route.ts`).

### `GET /api/v1/ask/threads/[id]`

Reads; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/ask/threads/[id]/route.ts`).

### `DELETE /api/v1/ask/threads/[id]`

Writes; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/ask/threads/[id]/route.ts`).

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

## billing

### `GET /api/v1/billing`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/billing/route.ts`).

### `POST /api/v1/billing/checkout`

Writes; for a member of the workspace the request names, owner or above; counts against the `billing` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `return` | one of `"billing"`, `"start"` | no |  |

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
| `fresh` | one of `"1"` | no |  |

### `POST /api/v1/calendar/preview`

Writes; for a member of the workspace the request names, operator or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/calendar/preview/route.ts`).

## calls

### `GET /api/v1/calls`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `conversation_id` | string | no |  |
| `status` | string | no |  |

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

## channels

### `GET /api/v1/channels`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/channels/route.ts`).

### `POST /api/v1/channels/whatsapp/connect`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/channels/whatsapp/connect/route.ts`).

### `GET /api/v1/channels/whatsapp/signup`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/channels/whatsapp/signup/route.ts`).

## client-errors

### `POST /api/v1/client-errors`

Writes; for any signed-in person, for themselves; counts against the `client_errors` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `boundary` | one of `"shell"`, `"os"`, `"root"` | yes |  |
| `page` | string or null | yes |  |
| `name` | string | yes | at most 60 characters |
| `message` | string | yes | at most 300 characters |
| `stack` | string or null | yes |  |
| `digest` | string or null | yes |  |
| `workspace` | string or null | yes |  |

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

### `POST /api/v1/contacts`

Writes; for a member of the workspace the request names, operator or above; counts against the `person_create` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/contacts/route.ts`).

### `GET /api/v1/contacts/[id]`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/contacts/[id]/route.ts`).

### `DELETE /api/v1/contacts/[id]`

Writes; for a member of the row's own workspace, owner or above; counts against the `erase` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/contacts/[id]/route.ts`).

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

### `PUT /api/v1/contacts/[id]/marketing-consent`

Writes; for a member of the row's own workspace, operator or above; counts against the `consent` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `consent` | one of `"unknown"`, `"opted_in"`, `"opted_out"` | yes |  |
| `source` | string | no |  |
| `note` | string | no |  |
| `message_id` | string (uuid) | no |  |

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

### `PUT /api/v1/contacts/[id]/receptionist`

Writes; for a member of the row's own workspace, owner or above; counts against the `person_mode` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `mode` | one of `"auto"`, `"ask"`, `"never"`, `"inherit"` | yes |  |

### `PUT /api/v1/contacts/consent`

Writes; for a member of the workspace the request names, operator or above; counts against the `consent` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `ids` | array of string (uuid) | yes | at least 1; at most 50 |
| `consent` | one of `"unknown"`, `"opted_in"`, `"opted_out"` | yes |  |
| `source` | string | no |  |
| `note` | string | no |  |

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

### `GET /api/v1/conversations/[id]`

Reads; for a member of the row's own workspace; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `before` | string | no |  |

### `POST /api/v1/conversations/[id]/archive`

Writes; for a member of the row's own workspace, operator or above; counts against the `thread_state` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/conversations/[id]/archive/route.ts`).

### `GET /api/v1/conversations/[id]/export`

Reads; for a member of the workspace the request names; counts against the `export` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/conversations/[id]/export/route.ts`).

### `POST /api/v1/conversations/[id]/hand-back`

Writes; for a member of the row's own workspace, operator or above; counts against the `thread_state` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/conversations/[id]/hand-back/route.ts`).

### `POST /api/v1/conversations/[id]/reply`

Writes; for a member of the row's own workspace, operator or above; counts against the `reply` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `text` | string | no | at most 20000 characters |
| `email_to` | string | no | at most 320 characters |
| `template` | object | no |  |

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

## escalations

### `GET /api/v1/escalations`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `state` | string | no |  |

### `POST /api/v1/escalations/[id]/resolve`

Writes; for a member of the row's own workspace, operator or above; counts against the `thread_state` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/escalations/[id]/resolve/route.ts`).

## export

### `GET /api/v1/export`

Reads; for a member of the workspace the request names, owner or above; counts against the `export` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/export/route.ts`).

## google

### `GET /api/v1/google`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/google/route.ts`).

### `GET /api/v1/google/callback`

Reads; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/google/callback/route.ts`).

### `GET /api/v1/google/connect`

Reads; for a member of the workspace the request names, partner or above; counts against the `google_link` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/google/connect/route.ts`).

### `DELETE /api/v1/google/connection`

Writes; for a member of the workspace the request names, partner or above; counts against the `google_link` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/google/connection/route.ts`).

### `POST /api/v1/google/link`

Writes; for a member of the workspace the request names, partner or above; counts against the `google_link` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/google/link/route.ts`).

### `DELETE /api/v1/google/link`

Writes; for a member of the workspace the request names, partner or above; counts against the `google_link` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/google/link/route.ts`).

### `GET /api/v1/google/locations`

Reads; for a member of the workspace the request names, partner or above; counts against the `google_search` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/google/locations/route.ts`).

### `POST /api/v1/google/locations`

Writes; for a member of the workspace the request names, partner or above; counts against the `google_link` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/google/locations/route.ts`).

### `POST /api/v1/google/refresh`

Writes; for a member of the workspace the request names, operator or above; counts against the `google_refresh` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/google/refresh/route.ts`).

### `POST /api/v1/google/reviews/[id]/draft`

Writes; for a member of the workspace the request names, operator or above; counts against the `google_draft` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/google/reviews/[id]/draft/route.ts`).

### `POST /api/v1/google/reviews/[id]/reply`

Writes; for a member of the workspace the request names, operator or above; counts against the `google_reply` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/google/reviews/[id]/reply/route.ts`).

### `POST /api/v1/google/search`

Writes; for a member of the workspace the request names, partner or above; counts against the `google_search` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/google/search/route.ts`).

## handovers

### `POST /api/v1/handovers/[id]/accept`

Writes; for any signed-in person, for themselves; counts against the `handover_answer` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/handovers/[id]/accept/route.ts`).

### `POST /api/v1/handovers/[id]/decline`

Writes; for any signed-in person, for themselves; counts against the `handover_answer` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/handovers/[id]/decline/route.ts`).

## lead-operations

### `POST /api/v1/lead-operations/[id]/undo`

Writes; for a member of the workspace the request names, partner or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `version` | integer | yes | ≥ 0; ≤ 9007199254740991 |

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
| `asked` | string | yes |  |
| `terms` | array of string | yes | at least 1; at most 5 |
| `area` | object | yes |  |
| `count` | integer | yes | ≥ 1; ≤ 1000 |
| `contact` | one of `"phone"`, `"email"` | yes |  |
| `criteria` | array of object | yes | at most 8 |
| `exclusions` | array of object | yes | at most 8 |
| `thread_id` | any | no |  |

### `GET /api/v1/lead-searches/[id]`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/lead-searches/[id]/route.ts`).

### `PATCH /api/v1/lead-searches/[id]`

Writes; for a member of the row's own workspace, operator or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | at least 1 characters; at most 80 characters |

### `DELETE /api/v1/lead-searches/[id]`

Writes; for a member of the row's own workspace, partner or above; counts against the `lead_member` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/lead-searches/[id]/route.ts`).

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

## lead-suggestions

### `GET /api/v1/lead-suggestions`

Reads; for a member of the workspace the request names; counts against the `lead_suggest` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/lead-suggestions/route.ts`).

### `PUT /api/v1/lead-suggestions`

Writes; for a member of the workspace the request names, partner or above; counts against the `lead_suggest` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `business_line` | string | yes | at least 3 characters; at most 160 characters |

## leads

### `GET /api/v1/leads`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `list` | one of `"all"`, `"ready"`, `"nurture"`, `"converted"`, `"said_no"`, `"not_a_fit"` | no |  |
| `search` | string (uuid) | no |  |
| `class` | one of `"qualified"`, `"review"`, `"excluded"` | no |  |
| `sort` | one of `"fit"`, `"found"`, `"distance"`, `"business"`, `"rating"`, `"stage"` | no |  |
| `dir` | one of `"asc"`, `"desc"` | no |  |
| `after_key` | string | no | at most 80 characters |
| `after_id` | string (uuid) | no |  |
| `limit` | integer | no | ≥ 1; ≤ 500 |

### `GET /api/v1/leads/[id]`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `search` | string (uuid) | no |  |

### `DELETE /api/v1/leads/[id]`

Writes; for a member of the row's own workspace, owner or above; counts against the `erase` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/leads/[id]/route.ts`).

### `POST /api/v1/leads/[id]/draft`

Writes; for a member of the row's own workspace, operator or above; counts against the `lead_draft` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `tone` | one of `"first"`, `"shorter"`, `"warmer"` | no |  |
| `previous` | object | no |  |

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

### `POST /api/v1/leads/[id]/put-back`

Writes; for a member of the workspace the request names, partner or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `search_id` | string (uuid) | yes |  |

### `POST /api/v1/leads/[id]/stage`

Writes; for a member of the row's own workspace, operator or above; counts against the `lead_member` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| (input) | object or object or object or object or object | yes |  |

### `POST /api/v1/leads/bulk`

Writes; for a member of the workspace the request names, operator or above; counts against the `lead_bulk` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| (input) | object or object | yes |  |

### `POST /api/v1/leads/check-again`

Writes; for a member of the workspace the request names, partner or above; counts against the `lead_bulk` rate; may spend the workspace's money.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `ids` | array of string (uuid) | yes | at least 1; at most 500 |

### `GET /api/v1/leads/export`

Reads; for a member of the workspace the request names, owner or above; counts against the `export` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `list` | one of `"all"`, `"ready"`, `"nurture"`, `"converted"`, `"said_no"`, `"not_a_fit"` | no |  |
| `search` | string (uuid) | no |  |
| `class` | one of `"qualified"`, `"review"`, `"excluded"` | no |  |
| `sort` | one of `"fit"`, `"found"`, `"distance"`, `"business"`, `"rating"`, `"stage"` | no |  |
| `dir` | one of `"asc"`, `"desc"` | no |  |

## lines

### `POST /api/v1/lines/buy`

Writes; for a member of the workspace the request names, partner or above; counts against the `lines_buy` rate; may spend the workspace's money.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `number` | string | yes | matches `^\+[1-9]\d{6,14}$` |
| `area_code` | integer or string | no |  |

### `POST /api/v1/lines/forwarding`

Writes; for a member of the workspace the request names, partner or above; counts against the `lines_forwarding` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/lines/forwarding/route.ts`).

### `POST /api/v1/lines/forwarding/test`

Writes; for a member of the workspace the request names, partner or above; counts against the `lines_forwarding` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/lines/forwarding/test/route.ts`).

### `POST /api/v1/lines/register`

Writes; for a member of the workspace the request names, partner or above; counts against the `lines_register` rate; may spend the workspace's money.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `line_id` | string | yes | at least 1 characters |

### `POST /api/v1/lines/retry`

Writes; for a member of the workspace the request names, partner or above; counts against the `lines_retry` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/lines/retry/route.ts`).

### `POST /api/v1/lines/search`

Writes; for a member of the workspace the request names, partner or above; counts against the `lines_search` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/lines/search/route.ts`).

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

Writes; for any signed-in person, for themselves; counts against the `profile_set` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/me/route.ts`).

### `DELETE /api/v1/me`

Writes; for any signed-in person, for themselves; counts against the `profile_set` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/me/route.ts`).

### `PUT /api/v1/me/devices`

Writes; for any signed-in person, for themselves; counts against the `device_register` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/me/devices/route.ts`).

### `DELETE /api/v1/me/devices`

Writes; for any signed-in person, for themselves; counts against the `device_register` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/me/devices/route.ts`).

## messages

### `POST /api/v1/messages/[id]/cancel-send`

Writes; for a member of the row's own workspace, operator or above; counts against the `thread_state` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/messages/[id]/cancel-send/route.ts`).

### `GET /api/v1/messages/[id]/media`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/messages/[id]/media/route.ts`).

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

## partner

### `GET /api/v1/partner`

Reads; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/partner/route.ts`).

### `POST /api/v1/partner`

Writes; for any signed-in person, for themselves; counts against the `partner_become` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `code` | string | yes | at least 1 characters; at most 64 characters |
| `terms` | `true` | yes |  |

### `PATCH /api/v1/partner`

Writes; for any signed-in person, for themselves; counts against the `partner_letters` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `letters` | boolean | yes |  |

### `GET /api/v1/partner/invitations`

Reads; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/partner/invitations/route.ts`).

### `POST /api/v1/partner/invitations/[id]/accept`

Writes; for any signed-in person, for themselves; counts against the `partner_invite_answer` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/partner/invitations/[id]/accept/route.ts`).

### `POST /api/v1/partner/invitations/[id]/decline`

Writes; for any signed-in person, for themselves; counts against the `partner_invite_answer` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/partner/invitations/[id]/decline/route.ts`).

### `GET /api/v1/partner/workspaces`

Reads; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/partner/workspaces/route.ts`).

### `POST /api/v1/partner/workspaces`

Writes; for any signed-in person, for themselves; counts against the `partner_handover` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `name` | string | yes | at least 2 characters; at most 120 characters |
| `timezone` | string or null | no |  |
| `email` | string | yes | at most 254 characters; matches `^[^@\s]+@[^@\s]+\.[^@\s]+$` |

### `POST /api/v1/partner/workspaces/[id]/resend`

Writes; for any signed-in person, for themselves; counts against the `partner_handover` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `email` | string | yes | at most 254 characters; matches `^[^@\s]+@[^@\s]+\.[^@\s]+$` |

## platform

### `POST /api/v1/platform/jobs/requeue`

Writes; for platform staff; counts against the `platform_job_requeue` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/platform/jobs/requeue/route.ts`).

### `POST /api/v1/platform/lines/refile`

Writes; for platform staff; counts against the `platform_line_refile` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/platform/lines/refile/route.ts`).

### `POST /api/v1/platform/lines/release`

Writes; for platform staff; counts against the `platform_line_release` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/platform/lines/release/route.ts`).

### `POST /api/v1/platform/lines/replace`

Writes; for platform staff; counts against the `platform_line_refile` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/platform/lines/replace/route.ts`).

### `POST /api/v1/platform/lines/retry`

Writes; for platform staff; counts against the `platform_line_retry` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/platform/lines/retry/route.ts`).

### `GET /api/v1/platform/overview`

Reads; for platform staff; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/platform/overview/route.ts`).

### `POST /api/v1/platform/partners/payout`

Writes; for platform staff; counts against the `platform_partner_payout` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/platform/partners/payout/route.ts`).

### `POST /api/v1/platform/partners/second-factor`

Writes; for platform staff; counts against the `platform_partner_second_factor` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `partner_id` | string (uuid) | yes |  |
| `why` | string | yes | at least 1 characters; at most 500 characters |

### `POST /api/v1/platform/partners/standing`

Writes; for platform staff; counts against the `platform_partner_standing` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/platform/partners/standing/route.ts`).

### `POST /api/v1/platform/partners/status`

Writes; for platform staff; counts against the `platform_partner_status` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/platform/partners/status/route.ts`).

### `GET /api/v1/platform/tenants/[id]`

Reads; for platform staff; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/platform/tenants/[id]/route.ts`).

### `POST /api/v1/platform/waitlist/invited`

Writes; for platform staff; counts against the `platform_waitlist_invited` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/platform/waitlist/invited/route.ts`).

## playbooks

### `GET /api/v1/playbooks`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/playbooks/route.ts`).

### `POST /api/v1/playbooks`

Writes; for a member of the workspace the request names, operator or above; counts against the `playbook` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/playbooks/route.ts`).

### `PUT /api/v1/playbooks/[id]`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/playbooks/[id]/route.ts`).

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
| `domain_ids` | array of string (uuid) | yes | at most 5 |
| `signed_by` | string or null | yes |  |
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
| `domain_ids` | array of string (uuid) | yes | at most 5 |
| `signed_by` | string or null | yes |  |
| `steps` | array of object | yes | at least 1; at most 5 |

### `DELETE /api/v1/reach-outs/[id]`

Writes; for a member of the row's own workspace, operator or above; counts against the `playbook` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/reach-outs/[id]/route.ts`).

### `GET /api/v1/reach-outs/leads`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `search` | string (uuid) | no |  |
| `lead` | string (uuid) | no |  |

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
| `language` | string | no | matches `^[a-z]{2,3}(_[A-Z]{2})?$` |

### `GET /api/v1/reach-outs/reach`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `search` | string (uuid) | yes |  |

## reports

### `GET /api/v1/reports`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `days` | string | no |  |

### `GET /api/v1/reports/campaigns`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `days` | string | no |  |

### `GET /api/v1/reports/reach-outs`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `days` | string | no |  |

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

## sending-domains

### `POST /api/v1/sending-domains`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `host` | string | yes | at most 253 characters |
| `from_local` | string | yes | at most 64 characters |
| `from_name` | string | yes | at most 200 characters |

### `DELETE /api/v1/sending-domains/[id]`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/sending-domains/[id]/route.ts`).

### `POST /api/v1/sending-domains/[id]/check`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/sending-domains/[id]/check/route.ts`).

### `POST /api/v1/sending-domains/[id]/resume`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/sending-domains/[id]/resume/route.ts`).

## settings

### `GET /api/v1/settings`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/settings/route.ts`).

### `PUT /api/v1/settings`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/settings/route.ts`).

### `POST /api/v1/settings/receptionist`

Writes; for a member of the workspace the request names, partner or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/settings/receptionist/route.ts`).

## setup

### `GET /api/v1/setup`

Reads; for a member of the workspace the request names; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/setup/route.ts`).

### `POST /api/v1/setup/request`

Writes; for a member of the workspace the request names, operator or above; counts against the `setup_request` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `what` | string | yes |  |

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
| `category` | string | no |  |
| `language` | string | no |  |
| `translate` | object | no |  |

### `POST /api/v1/templates/starter`

Writes; for a member of the workspace the request names, operator or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/templates/starter/route.ts`).

### `POST /api/v1/templates/sync`

Writes; for a member of the workspace the request names, operator or above; counts against the `settings` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/templates/sync/route.ts`).

## today

### `GET /api/v1/today`

Reads; for a member of the workspace the request names; counts against the `aggregate` rate; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/today/route.ts`).

## usage

### `GET /api/v1/usage`

Reads; for a member of the workspace the request names, owner or above; counts against the `aggregate` rate; spends nothing.

| Query field | Type | Required | Limits |
| --- | --- | --- | --- |
| `month` | string | no | matches `^\d{4}-(0[1-9]\|1[0-2])$` |

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

Writes; for any signed-in person, for themselves; counts against the `vitals` rate; spends nothing.

| Body field | Type | Required | Limits |
| --- | --- | --- | --- |
| `page` | string | yes | matches `^[a-z][a-z0-9-]{0,31}$` |
| `vitals` | array of object | yes | at least 1; at most 5 |

## workspaces

### `GET /api/v1/workspaces`

Reads; for any signed-in person, for themselves; no rate bucket; spends nothing.

Declares no query schema: it takes none beyond the workspace, or reads its own (`apps/dashboard/app/api/v1/workspaces/route.ts`).

### `PATCH /api/v1/workspaces`

Writes; for a member of the workspace the request names, partner or above; no rate bucket; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/workspaces/route.ts`).

### `POST /api/v1/workspaces/create`

Writes; for any signed-in person, for themselves; counts against the `create_workspace` rate; spends nothing.

Declares no body schema: it takes none, or reads its own (`apps/dashboard/app/api/v1/workspaces/create/route.ts`).
