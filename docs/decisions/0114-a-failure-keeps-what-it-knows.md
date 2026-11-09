# 0114 · A failure keeps what it knows

**Status:** Accepted by Ruben, 7 November 2026 ("Approve all six"), and built on his word of 8 November ("Yes, start layer 9"). No migration. Either deploy order works.

## Context

Layer 9 of the road decision 0104 began: the scorecard's item 14, how a failure is raised, carried, caught, answered and written down. Read against eight production SaaS codebases by one parser, and against the Node.js best-practices guide, typescript-eslint's error rules, OWASP's error-handling guide, RFC 9457 and Google's AIP-193:

|                                                | The eight, median | Ours before |
| ---------------------------------------------- | ----------------- | ----------- |
| Catches that go quiet with no reason           | 12.6%             | 20.8% (241) |
| Throws that carry a name or a code             | 74%               | 41.3%       |
| A new error that keeps the one it replaces     | 7%                | 33%         |
| Failures logged and re-raised, so logged twice | 45%               | 23%         |

Most of it already failed well: `withRoute` answered every crash in plain words with its stack in the log, the request id ran through both apps, two closed sets of codes were held by tests, and two-thirds of the test files asserted a failure. Four things lost what a failure knows:

1. `throw new Error(error.message)` kept the sentence and left the code behind, in 934 places, and 25 more raised the client's reply object as it was. So nothing above could tell a door's own refusal ("Contact not found.", P0002) from a database that is down, and each reached a person as "Something went wrong."
2. The edge's `door()` named a request and caught nothing. A failure no door caught crashed the function: the platform answered with a page of its own, logged an unstructured stack, and the request's name was lost.
3. A failure's own text was handed to whoever asked: 50 edge answers put a database's sentence in `detail`, which the dashboard shows as it is, and 5 of Ask's checks gave any thrown failure's text to the model, which may say it.
4. 240 catches did nothing and said nothing, so a failed read looked the same as "nothing there", and a failed write the same as done.

## Decision

1. **A failed reply from the database is raised as a `DbFailure`** (contracts' `errors.ts`): `new DbFailure(error, "what was being done")`. It says the same sentence a re-raise said, byte for byte (`label: message`), and keeps the code, the database's sentence alone (`dbMessage`) and the reply (`cause`).
2. **A route answers one by its code, when a door raises that code on purpose** (`DOOR_REFUSALS`: not found, already exists, not allowed, cannot take): the door's sentence, without the label. A sentence Postgres wrote names a constraint or a table, so a person reads the code's plain words instead, in `dbRefusal` too, and the log keeps it. Any other code, a bare raise among them, stays what it was: 500, `route_failed`, its stack. Only a route that knows what a bare raise means may say (`dbRefusal`'s `raised`).
3. **The edge catches a crash in one place.** `door()` logs `door_failed` with the stack and the request's name, and answers the code `door_failed`, still a 500, so a provider redelivers and a clock counts a failed tick.
4. **A failure's text goes in the log, and a caller gets words it may read.** On the edge, `refuseFailure(status, code, failure)` and `logFailure(kind, failure)`: the line `door_reply_failed`, and a try-again in `detail`. In Ask's checks, `refuseThrown`: a sentence written for a person (an `AppError`, a door's refusal) is said, and anything else goes on up to `buildProposal`, which logs it and says its fixed sentence. What a provider said for a person stays (`stripe_refused`, `google_refused`): provider words are layer 12's.
5. **A quiet catch logs and goes on, or says why it need not.** `.catch(logAndGoOn("what", fallback))` (`packages/log`; `dbLogAndGoOn` through db's port) writes `kept_going` with what was being done and what went wrong, and answers the fallback; `logKeptGoing` for a `catch` block. Every event written after its fact (`emitEvent`) logs this way, which layer 10 relies on. A parser's failure is its answer, and says so beside it. The lint no longer lets an empty catch pass.
6. **A new error keeps the one it replaces**: `throw causedBy(new AppError(...), e)`. A refusal's line says what went wrong underneath it, and it stays out of anything that compares or serialises the refusal.
7. **`only-throw-error` and `no-misused-promises` are errors.**
8. **What a caller can be refused with is written down**, from the sets themselves: `docs/api.md`, "What a refusal answers".

9. **One status per code, so a caller compares codes.** On the app plane a refusal takes its code's status, or is a code of its own: a try-again is `unavailable` (503), a provider that refused or never answered is `upstream_provider` (502), and `internal` is 500 alone. `validation` is 400 everywhere. A key reused for another request is `conflict` at 409, where decision 0035 said 422. On the edge each code answers one status. `isFaultCode` says which codes are nobody's words.

`tests/repo/errors/errors.test.mjs` holds the backend to each of these at zero. They are tests, not ratchets: a `Debt:` line cannot argue past them.

## What this does not do

- It does not change how anything retries. A job's retry rule is layer 10's, and a provider's outcomes and breaker are layer 12's.
- It does not change where database code lives or how it queries (layer 8), nor the logger or alerts (layer 12). An alert on `door_failed` or `kept_going` is layer 12's.
- It does not read the browser's own catches: those are the frontend pillar's.
