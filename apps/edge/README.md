# @chanlytics/edge

What the outside world knocks on: provider webhooks, the job tick, cron sweeps and the admin doors the dashboard calls.
"Edge" means the edge of our system. These are Node functions on Vercel, not Vercel's Edge Runtime (project
`chanlytics-messaging`), each bundled by esbuild with the packages' sources
(`tooling/scripts/edge-functions.mjs`). A member of the public experiences this code, so treat it that way.

## What is where

- `api/`: the doors. A folder here is a URL. A door verifies the wire and calls a verb, and every door's knock is pinned
  (`tests/edge/door-policy.json`).
- `lib/<domain>/`: what the doors call, by domain.
- `lib/shared/`: what every domain uses: the environment (`env.ts`), the logger (`log.ts`), responses and refusals
  (`http.ts`), the database handle (`pg.ts`), who may open a door (`admin-auth.ts`, `cron-auth.ts`).

## What it may import

The packages, by name. Never the dashboard, `next` or `react`. A `process.env` read outside `lib/shared/env.ts` or a
`console` call outside the logger is a lint error.

## Run and test

`docs/runbook.md` has running and deploying. Tests are in `tests/edge/` and `tests/<domain>/`; the canonical door test is
`tests/sms/sms-door.test.mjs`.
