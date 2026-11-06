# @chanlytics/dashboard

The product a team works in, and the API it calls. Next.js on Vercel (project `chanlytics-os`), with the packages
compiled in.

## What is where

- `app/(os)/`: the signed-in pages. Each is one prerender for every person and workspace, and reads no request.
- `app/api/v1/`: the member-facing routes. Every route declares its policy with `route()`.
- `src/server/<domain>/`: what a route calls, by domain. `src/server/shared/` is what every domain uses: the route
  pipeline, the environment, the logger, the rate limits. `src/server/readers/` is the one place a read lives, so the
  number Ask says is the number the page shows.
- `src/surfaces/<surface>/`: what a page draws, and `src/surfaces/kit/` the parts every page draws with.
- `src/client/`: the typed calls to the API. `src/legacy-bridge/`: the seam between the data layer and the pages.
- `src/legacy/`: the shell's stylesheets and the standalone mockup. Nothing new goes here.

## What it may import

Browser code (`legacy-bridge`, `client`, `yes`, `auth`, `surfaces`) never imports `src/server` or
`@chanlytics/core|jobs|channels`. Server code never imports the shell, the bridge or the client.

## Run and test

```bash
corepack pnpm --filter @chanlytics/dashboard dev
```

Then open `/w/<workspace-slug>/`. `docs/runbook.md`, "See a real page", has the three things that trip it up. Tests are in
`tests/<domain>/` and `tests/shell/`; journeys through a real browser are in `e2e/`.
