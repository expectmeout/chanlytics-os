# @chanlytics/contracts

The pure layer: what the server, the edge and the browser must agree on, and the code that works it out. It reads no
database, calls no provider and touches no framework, so anything here can run anywhere and be tested with plain values.

It holds more than its name says: types and zod schemas, the closed sets generated from the database, the view models
every page reads, the rules a page and a server both judge by, the prompt composer, and the words the product says.

## What is where

One folder a domain, each behind a barrel (`index.ts`) that names what it exports. `shared/` is what every domain uses:
time, identity, phone numbers, enums. A module imports another by its path, never through a barrel.

The package's entries sit at the root: `index.ts`, `browser.generated.ts` (what a page may load) and the classic schemas
a page asks for by `import()`.

## What it may import

Nothing of ours. Every other package and app imports it.

## Tests

`tests/<domain>/`, by the same domain names. A view model's canonical example is
`packages/contracts/src/calendar/vm.ts`.
