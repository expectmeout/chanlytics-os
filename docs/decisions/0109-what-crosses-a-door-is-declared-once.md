# 0109 · What crosses a door is declared once

**Status:** Accepted by Ruben, 7 November 2026 ("Build layer 6 first"). Built on `org/names-say-what-they-do`, 7 November 2026. No migration. Nothing a page sends is refused that was taken before; what changes for a caller is named under Decisions 3 and 4.

## Context

Layer 6 of the road decision 0104 began: the scorecard's items 5, 7 and 30, how a route is built, what it takes, and what two deploys agree on. Every module of ours that takes what a request carries was read by one parser, and so was a seeded sample of 200 request handlers (route files, routers, controllers, actions) from each of the same eight production monorepos.

| Handlers that take a request's input | Read through a schema | Read by hand |
| ------------------------------------ | --------------------- | ------------ |
| The eight                            | 61-99%, median 86%    | 1-30%        |
| Ours, whole                          | 69%                   | 30%          |
| Ours, the dashboard                  | 86%                   | 13%          |
| Ours, the edge                       | 0%                    | 98%          |

The dashboard's routes were already among the best of these: `route()` declares each one's scope, role, rate, spend and input, parses the input before the handler runs, keeps every write's `Idempotency-Key`, and writes the typed client and `docs/api.md` from what it declared. Nineteen writes and two reads still picked their body apart by hand.

The edge was the gap, and the wire between the two deploys with it. None of its doors parsed a body: each read `Partial<T>` of a type it kept to itself and checked fields one by one. The dashboard wrote each door's path as a string and its body as an object of its own, sent as `unknown`, and cast ten of the answers it read. Nothing tied what one side sent to what the other read, and reading the two side by side found that they had drifted: the calendar door's type said it took four fields where the dashboard sent one, two doors called required what the dashboard sends as optional, billing's email arrives as null where the door's type said a string, and a rehearsal's version arrives as null where the review's type said a number.

## Decision

1. **Each edge door is declared once, in contracts**, beside its domain's other contracts (`packages/contracts/src/<domain>/edge-doors.ts`): `edgeDoor(path, schema)`, its path and the zod schema of its body. Fifty doors in seventeen modules: every door the dashboard calls, and the four an operator does.
2. **The dashboard calls a declared door with its body.** `callEdge` takes a declared path and that door's body (`EdgeBody<A>`), and so do its five wrappers and the two calls that stream (the model gateway, Ask's speech). The path stays a string at the call, where the reads trace and the tests follow it. These are types alone: the dashboard's JavaScript is the same before and after, module by module.
3. **The door reads its body through the same declaration**, `readBody(request, LINES_DOOR)`, which parses it by the door's schema. A body the schema does not hold is said in one line, `door_body_unexpected`, by field and never by value, and read as it always was: the op still refuses what it refuses, in its own words. Once production has sent nothing the schema refuses for a week, the door refuses at the schema, and that is a change of one function. Two op types the dashboard's calls showed were narrower than what is sent (billing's email, a rehearsal's version) now say null.
4. **The app plane's hand-read routes declare what they take**: Google's link and locations, the lines' search, retry and forwarding test, `PUT me`, `DELETE me/devices`, WhatsApp's connect and the lead suggestions. Each handler keeps its own checks and words; the schema types what arrives, a field a page leaves out or sends as null reads as absent, and a field of the wrong JSON type is refused by name instead of by the handler's sentence. Ask's eight routes are Ask's pillar's and stay counted, as do the phone's device registration and the sign-up, each with a reader of its own, and two reads of a query value (the calendar feed's token, the sign-in callback's code). `GET escalations?state=` takes one of `ESCALATION_STATES`, not any string.
5. **What a refusal carries beside its words is one shape per code** (`ErrorDetailsByCode` in contracts' errors.ts), and `AppError` holds the details it is given to its code's. They were `unknown`, in seven shapes nothing declared. Types alone.
6. **What still falls is counted** (`API_RATCHETS`): `hand-read-requests`, a request read no schema parses; `edge-answer-casts`, an edge answer cast instead of read; `codes-off-their-status`, a refusal answered with a status its code does not have; `edge-codes-with-two-statuses`; and `page-shapes`, the shapes a page of results comes in. `repo/api/api.test.mjs` holds the doors outright: no path declared twice, each a door the edge has, each body read through its own door, and each call the dashboard makes named for a declared one.

## What this does not do

- **Statuses stay as they are.** The app plane answers `validation` with 422 in 37 places and `internal` with 502 or 503 in 53, and the browser reads some of those statuses (a new sequence's 422, a list's 400 as gone, a retry below 500). Moving them is a change to the browser, so they are counted, not moved.
- **One page shape** waits for the data layer (layer 8): four shapes, counted.
- **The edge's answers** are typed on the edge's side by each op's `json()`, not declared; the dashboard's ten casts are counted, for the answers to join their doors' declarations when both sides read them.
- **A provider's delivery** (Twilio, Meta, Retell, Stripe, Resend, Apify, ElevenLabs, Google) is read by its own verb after its signature: a provider's wire is `packages/channels`', and layer 12's to give a schema.
- **Ask's routes** (the turn, quick, voice, the morning, memory, the idea card, a proposal) read their body by hand, counted, for the AI pillar.

## Either deploy order

The dashboard's changes are types. The edge's door reads what it always read and adds a line; a field one side adds is optional in the declaration until the other reads it.

## How to reverse

Each step on its own: a door's `readBody(request, DOOR)` back to `readBody(request)` with the old signature; `callEdge`'s path back to `string`; a route's `input` back to its own read. The test then names what it no longer holds.
