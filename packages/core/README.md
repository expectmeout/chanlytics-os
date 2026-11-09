# @chanlytics/core

The rules the product enforces, as verbs over ports. A verb takes a ports object and a command and returns an outcome:
no database client, framework, provider or environment inside it, so a test runs it with fakes.

## What is where

- `deliver/`: the one door a message leaves through, and what it holds a send to.
- `conversations/`, `inbound/`, `messages/`, `campaigns/`, `leads/`, `appointments/`, `look/`, `site/`, `events/`: the
  verbs of each domain.
- `shared/`: what every domain uses.

`index.ts` is the only way in: a name it does not name cannot be reached from an app.

## What it may import

`@chanlytics/contracts`, `@chanlytics/db` and `@chanlytics/channels`, types freely and values only in the named adapters
(`tests/repo/hygiene.test.mjs` holds the list). Browser code never imports its values.

## Tests

`tests/<domain>/`. The canonical example of a verb's test is `tests/conversations/core-thread-verbs.test.mjs`.
