# An error tracker: a proposal

28 November 2026, lane 16 of the "Prove it works" plan (told when red). **A proposal, not a build: nothing here is
installed.** It says what a tracker would add over the logs and Health, what it costs, and what it would see of
customers' data. Ruben decides.

Prices and vendors' words are theirs as read on 28 November 2026, each from the page named beside it. Read them again
before any yes.

## What there is today

- **The server's lines.** Both apps write through one logger: one JSON object a line, a closed set of event names,
  the request's name on every line of a click across both apps, and what a line might carry of a person taken out
  where it is written, by key and by shape (`docs/runbook.md`, "Read the logs"). An exception nothing caught is one
  line too: `door_failed` on the edge and `route_failed` on the dashboard, each with the failure and where it was.
- **Where those lines go.** Vercel keeps them for the plan's retention, which is short. Nothing ships a line anywhere
  else and nothing alerts on one. So an exception in a door is a 500 its provider tries again, and a line nobody is
  sent.
- **What pages.** About sixty conditions (counted on this day) page the platform by mail, once each per six hours, and Health shows them:
  a provider refusing our key, a quota spent, jobs failing for good, a clock stopped. These are failures the code
  expected and named. An exception is the kind it did not.
- **A member's page.** An error a page hit is sent to `POST /api/v1/client-errors` and kept for Health to group
  (`client_errors`, decision 0068): its fingerprint, its page, its first line, the build, the device and a short hash
  of who. Never the person, the workspace or the stack. Nobody is told.
- **From outside.** The edge's health door has no key so that a monitor outside could ask it. None does, but the
  morning line, once a day.

## What a tracker would add

1. **An exception reaches a person in minutes, as one issue.** Grouped by where it was thrown, so a bug hit two
   hundred times is one message and a count, with its stack, when it was first seen and how many requests it hit.
   Today it is two hundred lines that expire unread.
2. **It knows the release.** "First seen in the commit deployed at 13:07" ties an error to a merge, and "back after
   it was marked mended" is a message of its own.
3. **A member's page with its stack.** The stack as written, through the build's source maps, where today Health
   holds a first line and a fingerprint.
4. **A monitor from outside, and a check-in for a clock.** Most trackers ask an address every minute and expect a
   scheduled job to report in: the edge down between two mornings, and a clock that stopped along with the sweep that
   would have said so, are both rows of the runbook's table that show nowhere today.

## What it would not add

- The failures the pager already names. They are answers the code handled, not exceptions, and a tracker sees none
  of them unless they are sent to it too.
- A red check, or a check that does not run. That is the morning line's.
- A place to search a month of lines. That is a log drain, which is a different thing to buy (below).

## What it would see of customers' data

This is the cost that matters, and it is not the price.

Sentry's own page for the Next.js SDK says of its defaults: "By default the SDK collects rich debugging context
(including user identity, request/response bodies, and generative AI content)". Beside those: cookie names, header
names, query parameters, and the local variables of each frame of the stack
(docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options). In this product a request's body is a
customer's message, a phone number or a booking; the generative content is what a customer wrote to AI and what AI
answered; a frame's variables can hold any of them. Out of the box, a tracker would keep customers' conversations at
a third party. The logger's rule, and `client_errors`' "never the person, the workspace or the stack", exist to
prevent exactly that.

What it would take to be acceptable, all of it, before the first event leaves:

- Every collection switched off: no bodies, no cookie or header values, no query parameters, no identity, no
  generative content, no frame variables, no replay of a member's session, no tracing.
- One function every event passes through before it is sent (`beforeSend`), which keeps the kind of error, its words
  after the logger's own redaction, the stack's files and lines, the release, the route as a pattern and not an
  address, the request's name and the workspace's id, and drops everything else.
- The vendor's own scrubbing left on (it is on by default, and removes values that look like card numbers and keys
  named like passwords and tokens), and its storing of IP addresses switched off.
- The region chosen once, at the start: Iowa or Frankfurt, and "your data storage location can't be changed"
  (docs.sentry.io/organization/data-storage-location). The database is in `us-east-1`.
- A test that holds it: an event made from a request carrying a phone number, a message and a token comes out of
  that function carrying none of them. As the logger's redaction is held.
- The vendor named where the product names who else handles customers' data. That part is Ruben's, not code's.

Even then a stack trace and a workspace's id would sit with a third party. Whether that is acceptable at all is the
first question.

## What it costs

| Choice | Price | What it gives |
| --- | --- | --- |
| Sentry, Developer | Free | One user, 5,000 errors a month, 30 days kept, alerts by email, one uptime monitor, one cron monitor (sentry.io/pricing) |
| Sentry, Team | $26 a month paid yearly, $29 monthly | Any number of users, 50,000 errors a month, up to 90 days kept, alerts to other tools |
| Better Stack, free | Free | 100,000 exceptions a month, ten monitors and heartbeats, alerts by Slack and email, 3 GB of logs kept three days (betterstack.com/pricing) |
| Better Stack, a responder | $29 a month paid yearly, $34 monthly | Alerts by phone call and text, on call |
| A log drain from Vercel | $0.50 a GB drained, on the Pro and Enterprise plans only (vercel.com/docs/drains) | Every line both apps write, sent to a store |
| Axiom, as that store | Free: 500 GB a month taken in, 30 days kept. Then $25 a month (axiom.co/pricing) | A month of lines, searched by request and by event, with alerts on them |

And the work, which is larger than the price:

- An SDK is a dependency in two apps, so decision 0054 applies: pinned exactly, behind a seam of ours, on the server
  where it can be, its browser bytes argued.
- On the edge the one place to catch from is the door wrapper, and on the dashboard the route wrapper. Both are
  shared plumbing every request passes through.
- In the browser the SDK is tens of kilobytes on every page. `check:bundle` holds a route to 1 KB of growth and a
  page to 2 KB without a line arguing it, so it would be measured before any yes.
- Source maps uploaded at each build, and a release named at each deploy, in both projects.

## The recommendation

Two steps, and the second only if the first leaves something missing.

**Step 1, no SDK, nothing new about customers leaves.** The two switches the runbook's "Where the logs go" already
names as Ruben's:

- A log drain on both Vercel projects to a store that keeps thirty days, with one alert on `level = error` by
  `event`, and one on `breaker_open`. The lines are already redacted where they are written, so the store holds what
  the logs hold today and no more. `door_failed` and `route_failed` then reach a person the minute they happen, which
  is most of what a tracker is for.
- A monitor outside asking `GET /api/health` every minute, telling a person when it answers 503 or nothing.

Cost: the drain's $0.50 a GB, if the Vercel plan has drains, and a store and a monitor that are free at this size.
Work: settings, no code but this section of the runbook brought up to date.

**Step 2, only if grouping by release is missed after a month of step 1.** Sentry on the two servers alone, the free
plan, the United States region, every collection off and the one function above in front of it, with its test. The
browser stays on `client_errors`, which already groups by fingerprint and keeps the privacy rule and the bundle as
they are.

**Not recommended at any step:** a browser SDK with its defaults, and session replay.

## What Ruben decides

1. May a third party hold a stack trace and a workspace's id at all? If not, step 1 is the whole of it.
2. Step 1: is the Vercel plan one with drains, which store, and where does the outside monitor's alert go (email is
   free; a phone call or a text is a paid seat)?
3. Step 2: yes, no, or ask again in a month.
