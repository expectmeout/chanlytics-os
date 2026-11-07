# How data flows

The paths a piece of data takes through the system, hop by hop, and where the request's name reaches. `docs/architecture.md` says how the parts are built; this page says the order they run in.
`docs/conversation-flow.md` has the inbound path step by step.

## A customer's message, in

1. A provider calls a door in `apps/edge/api` (`apps/edge/api/whatsapp.ts`, `apps/edge/api/inbound-sms.ts`). The door is `door(verb)`: it names the request and calls the verb.
2. The verb verifies the wire and keeps the delivery as it came (`apps/edge/lib/shared/keep-event.ts`).
3. `apps/edge/lib/whatsapp/persist.ts` writes the person and the message through `packages/db`.
4. `packages/core/src/inbound/` decides: a plan over ports, with no database or provider inside a verb.
5. A reply leaves through the one send door, `packages/core/src/deliver/deliver.ts`, which writes the outbound ledger and puts the message on the wire through `packages/channels`.

## A page's read

1. The document is a prerender, the same for everyone (`apps/dashboard/app/(os)`). Its first reads leave from its head (`packages/contracts/src/shell/route-prefetch.ts`).
2. A surface reads through `useSurface` (`apps/dashboard/src/surfaces/use-surface.ts`), over the browser's caches: `apps/dashboard/src/bridge/surface-cache.ts` and `apps/dashboard/src/bridge/read-cache.ts`.
3. The call reaches a GET route under `apps/dashboard/app/api/v1`, through the typed client (`apps/dashboard/src/client/api.ts`).
4. `withRoute` (`apps/dashboard/src/server/shared/with-route.ts`) checks scope, role, spend, rate and input, then the route answers from a reader in `apps/dashboard/src/server/readers/`.
5. The reader reads through `packages/db` on the session's client, so RLS is the floor. Ask's tools read the same readers, so the number Ask says is the number the page shows.

## A member's write

1. A verb in `apps/dashboard/src/bridge/verbs/` calls a route with `POST`, `PATCH` or `DELETE`.
2. `withRoute` does the same checks. A rule runs as a core verb over ports (`apps/dashboard/src/server/conversations/ports.ts`) or a SQL door.
3. What must reach a provider or run later goes to the edge through `callEdge` (`apps/dashboard/src/server/shared/edge.ts`), or to the job ledger (`packages/jobs`).

## A sweep or a job

1. A cron calls a door in `apps/edge/api/cron`, wrapped in `sweepDoor`. The sweep lives in its domain, on top of what it reads.
2. `apps/edge/api/jobs/tick.ts` claims what is due (`claim_due_jobs`, a lease and a heartbeat). `packages/jobs/src/handlers/` builds ports from the job's context and calls core.

## Where the request's name reaches

- `withRoute` names a request (`requestId`, `packages/log/src/request.ts`) and answers `x-request-id`, and `edgeHeaders` carries it to the edge's admin doors.
- Every edge door is wrapped in `door()` or `adminDoor()`, so a line in the request's log carries `request_id`.
- A client `packages/db` makes sends it with every call (`DB_REQUEST_HEADER`), and `events.request_id` takes it from there.
- It stops at the job row: a job's lines carry the job, not the request that scheduled it (layer 10).

## Which way the code leans

`docs/architecture.md`, "Which way the code leans", has the map these paths keep to.
