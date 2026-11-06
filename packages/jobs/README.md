# @chanlytics/jobs

Background work: one ledger of jobs, and the handlers that run them. A job kind arrives with its handler, its caller, its
`job_kinds` row and its `KIND_POLICY`, in one change (decision 0089).

## What is where

- `runner/`: the ledger's rules and writes, the tick that claims what is due, scheduling, and what a job leaves behind
  when it will not finish.
- `handlers/`: one module a kind where a handler is large, and `handlers.ts` for the rest. A handler builds ports from
  the job's context and calls core; the rules stay in `@chanlytics/core`.

## What it may import

`@chanlytics/contracts`, `@chanlytics/db`, `@chanlytics/channels` and `@chanlytics/core`.

## Tests

`tests/jobs/`.
