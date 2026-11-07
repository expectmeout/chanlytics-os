# @chanlytics/log

One logger and one request's name, for every runtime that runs on a server. One JSON object per line, redacted by key and by shape where it is written, carrying the request's
name as `request_id` and the workspace as `tenant_id`.

It sits under every other package and imports none of them, so a verb in `core` can write a line without reaching `channels`, where the providers are. The edge's
`lib/shared/log.ts` and the dashboard's `src/server/shared/log.ts` hold each app's closed list of event names over it. `docs/runbook.md`, "Read the logs", says what a line holds.

Decision 0106 says why it is a package.
