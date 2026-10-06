# Connect WhatsApp says what Meta will ask, and the number says what Meta holds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connecting a WhatsApp number to Chanlytics says what Meta will ask, and a connected number says what Meta holds, in six parts and three additions. (1) Before Meta's window opens, the WhatsApp row says what Meta will ask (sign in with Facebook, a code texted to the number, a payment method), what WhatsApp costs and who bills it (Meta, to the card on the WhatsApp account, never Chanlytics), the 250-people limit of a new business and to keep the page open (Task 1, drawn in Task 11). (2) A code Meta texts to a Chanlytics line is shown to the owner within seconds, read from Twilio's own record and never stored (Tasks 2, 3, 8, 9, 11). (3) What Meta holds about the number (may it send, the display name's review, the verification and the tier, whether a payment method is on file) is read once by one function, kept through one database door, shown on the row, and told to the owner once when the number turns BLOCKED (Tasks 1, 5 to 11). (4) The receptionist never answers an automated code (Task 4). (5) A sign-up a reload left behind is named, and what to do is said (Tasks 1 and 11). (6) A partner's notice from Meta is routed by the account it names, not dropped as a fault (Task 12). And three additions made after the design: Meta's decision on a display name is heard (Task 13), the row says how to try a connected number from a phone and where to add a payment method, and Settings › Billing says where WhatsApp is billed (Tasks 1, 6 and 11). Task 14 is the documents and the verification of the whole.

**Architecture:** One rule per fact, said in one place. Contracts holds the words and the shapes (`lines/number-standing.ts`: `NumberStanding` and what it says, `lines/whatsapp-cost.ts`: what WhatsApp costs, `lines/line-codes.ts`, `lines/connection-note.ts`: a note is its words and, where there is somewhere to go, one link); `@chanlytics/channels` holds the one rule that says a text is a one-time code (`oneTimeCodeOf`, beside the STOP words) and the lines provider's one new question (`recentTexts`: Twilio's own record of a number's texts). The texting door asks the rule, after the line and the signature are proven, and answers nothing; an edge door behind the owner's route asks the provider and the rule for the codes of the last fifteen minutes. The edge reads Meta once (`numberStanding`: the phone's `health_status`, the display name and its review, and the account's verification and tier, funding and owner, each its own request so one Meta refuses costs only what it held) and keeps it through `channel_keep_standing`, a SQL door modelled on `channel_keep_quality`, which merges beside the rating and writes a `channel.standing` event when the word for whether the number may send changes; `readAndKeepStanding` is what the connection, the six-hourly sweep and the owner's check all call, and it tells the owner once when a number turns BLOCKED. The dashboard's two owner routes carry the codes and the check to the edge; the channels read passes the kept standing, so the Connections row, Ask and the Broadcasts page read one answer. The webhook routes a notice by the account it names.

**Tech Stack:** Next.js App Router routes and the Connections surface (`apps/dashboard`), Vercel functions (`apps/edge`), TypeScript packages (`packages/contracts`, `packages/channels`, `packages/db`), one SQL migration (PostgreSQL, proven on a throwaway Supabase stack of this branch's own), `node:test` through `tooling/scripts/checks/test.mjs`, the in-memory database double (`tooling/scripts/tests/_fake-db.mjs`). No new dependency, no new table.

**Spec:** `docs/superpowers/specs/2026-10-06-whatsapp-connect-says-what-meta-asks-design.md` (Parts 1 to 6, from Ruben's go-ahead of 6 Oct 2026; it is untracked in the worktree this plan was written in, and this plan does not commit it). Where the plan could not follow it as written, the choices below say so.

**Written against** `163f3678a` (origin/main, 6 Oct 2026, which holds #1444, #1445 (the bundle budget held by the byte) and #1446, and whose newest migration is 00329), on branch `connections/whatsapp-says-what-meta-asks`. Every path, name and line below was read on that tree; a line number is a locator, so re-find it by its text if main has moved. The plan was applied to that tree task by task (each task's edits, then the Prettier run its own steps name, before the next task's edits), its tests and the checks of Task 14 were run on the result, and its migration was proven on a database of its own.

---

## What this pull request is, and is not

It is one pull request, and it finishes what Ruben asked after connecting the Chanlytics workspace's own Twilio number to WhatsApp on 6 October: the four suggestions from that conversation, the account notices that were being dropped, and the cost and payment facts the owner met without being told. Its title: **"Connect WhatsApp says what Meta will ask, and the number says what Meta holds"** (77 characters). It adds one migration (00330: one function, no table, no data change), two edge doors, two dashboard routes and no dependency; every task ends green (its own tests, `corepack pnpm -r typecheck` where a package or a type moved, and the ratchets it touches), and Task 14 runs lint, dead exports and the format check over the whole, which no earlier task can (an export's reader arrives in a later task).

What an owner sees: before Connect, the WhatsApp row says what is coming and what it costs; a code Meta texts to a Chanlytics line appears on the Texting row and is no longer answered by the receptionist; a connected row says what Meta holds about the number, with the way to add a payment method where there is none, and how to try the number from a phone; an owner is told once when Meta stops a number from sending or declines its display name; a sign-up that was left behind is named; Settings › Billing says in one line that WhatsApp is billed by Meta. What the system does differently: Meta's partner notices reach the workspace they are about, and a notice for a sign-up nobody finished is logged as news, not as an error.

### Not in this plan

- **Coexistence** (a number that stays on the WhatsApp Business app): its own project, with Meta's own sign-up flow and states.
- **A code in a phone call**: the notes steer the owner to Text message, because a call would be answered by the receptionist.
- **Storing a code**: nothing here does. The codes are Twilio's record, read on demand.
- **Adding a payment method from Chanlytics**: Chanlytics is a Tech Provider and does not hold the account's card; the row links Meta's own page for it.
- **A cost report per workspace**: the facts are in `WHATSAPP_COST_WORDS`, and a message's `pricing` is already kept; a report that reads it is its own piece of work.
- **The two Meta senders that became people on 6 October** in the Chanlytics workspace are Ruben's to delete or keep; nothing here deletes data.
- **The standing on Today and in the phone app's alerts**: the standing is kept on the channel for them to read; this plan draws it on Connections and tells it in the owner's notice.
- **A "Check again" button**: the page asks as it opens when the kept standing is missing or old, and the sweep asks every six hours.

## Choices this plan makes where the design did not settle them, or could not be followed

1. **The migration is 00330, not the design's 00328.** The design numbered it when main's head was 00327. Since then main took 00328 (#1441, a person's every open deal) and 00329 (#1444, a campaign counted by its channel). Task 5 names the file `00330_a_number_s_standing_is_kept_and_said_when_it_changes.sql`, checks the number against `origin/main` and against every open pull request before it commits, and says what to renumber if one has taken it; Task 14 Step 11 checks again on the day the branch lands.
2. **A note is `{ text, link? }`, not a string.** The design has `notes: string[]`. The cost explainer and the payment-method note each end at a page of Meta's, so contracts' `ConnectionNote` carries the words and, where there is somewhere to go, one link (`label`, `href`). The row draws the words and then the kit's `LinkButton`, a door that opens in a new tab with `rel="noopener noreferrer"`. A note with no link is as the design had it.
3. **Nine notes before Connect, not four, and a payment wording that is true.** The design's four notes become: sign in with Facebook; the code Meta texts (and that on a Chanlytics number it shows on the Texting row, so choose Text message, not Phone call); what WhatsApp costs, in four lines; what a payment method is for; the 250-people limit; and to keep the page open. The design's third note said that without a payment method "WhatsApp will not send". On 6 October a customer's reply was delivered by the receptionist within eight seconds on an account with no payment method, and Meta's pricing documentation says the same: a message that is not a template, sent inside the 24 hours after a customer writes, is free and needs no card. What a missing payment method stops is what a business starts: reminders and campaigns, which are templates. The notes say that, and never that WhatsApp will not send. A connected row says, in the same words, what WhatsApp costs, and, until someone has written to the number, how to try it from a phone (`wa.me/<digits>`: on 6 October the phone's contact lookup said a number registered an hour before was not on WhatsApp, and the link forced a fresh lookup).
4. **No rate is written anywhere in Chanlytics.** Meta's prices change with the customer's country, the message's category and the month's volume. `WHATSAPP_COST_WORDS` says who bills, what is free and what is charged, and links "Meta's current prices" (`https://business.whatsapp.com/products/platform-pricing#rates`).
5. **`phone_number_name_update` is in this change, which the design left out.** The design's "Not in this change" said the sweep and the Connections check cover the display name. Meta's decision on a name is a webhook the app is already subscribed to and the webhook has been dropping, so the field joins `WABA_FIELDS` and the decision is heard as it is made (Task 13). Everything else the design left out stays out.
6. **The owner's door is `role: "partner"`.** The design says "owner only". The rung the Connect WhatsApp route is behind is `partner` (an owner, or the partner who set the workspace up), and a viewer or an operator is told "Only an owner can do this." The two new routes use it, so the page that offers Connect and the routes it calls agree on who may.
7. **The standing's account reads are three requests of their own, and the standing carries three more fields.** The design reads the phone and the account (two requests). The plan asks the phone's `health_status`, and of the account the verification and tier, `primary_funding_id` and `owner_business_info{id}`, together but apart, so a field Meta refuses (a permission the token lacks, a field the node does not have) costs only what it held. `NumberStanding` gains `has_payment_method` (true where Meta answered with a funding id, false where it answered without one, null where the read failed: never guessed), `owner_business_id` and `waba_id`, which build the link to Meta's page for adding a payment method. Meta's reference does not say what an account with no payment method answers, so Task 14 Step 10 is a live check, Ruben's, before the merge.
8. **The code rule is stricter than the design's, because a false positive silences a customer.** A text taken for a code is never answered and never becomes a person, and a text not taken for one only leaves things as they were. So every condition is a refusal first: at most 320 characters, no question mark, a code of four to eight digits (or six to eight digits split by one dash or space), and one of four things: "your <Name> code" with the code straight after it; "<code> is your <Name> ... code"; a leading `<#>`; or the don't-share words **together with** a word that says what the code is for (verify, confirm, sign in, one-time, ...) and exactly one code. A <Name> is one to three words that each hold a capital letter and are none of a customer's own things (door, gate, booking, ...). The design's don't-share words alone would take "the gate code is 4512, don't share it with anyone" for a code.
9. **The sweep reads both together.** The design says the standing is read "beside the quality (same token, same pacing, same outcomes counted)". Task 7 rewrites `number-quality.ts` whole so that a visit reads the rating and the standing together (one Graph timeout of the tick's time, not two), each failing apart from the other, and the standing's outcomes are counted flat beside the rating's, every number asked in exactly one of them.
10. **The standing is read at connection from the helper that already tells the platform's record of the connection** (`connected`), not from the connection function: the ratchet holds that function at its size, and the read is best effort (`readAndKeepStanding` never throws), so a failed read costs the row its notes and never the connection.
11. **The codes route has a rate bucket of its own, and so has the check.** The design says "the rate class of a read" for the codes. The page asks every three seconds while Meta's window is open, which a shared read bucket would spend, so `lines_codes` allows forty a minute and the owner's check, a Graph read each, has `whatsapp_standing` at twelve an hour.
12. **The page's two asks live in `whatsapp.ts`, the hooks that use them in `live.ts`.** The page tests stub a module's verbs by assignment (`waConnect`'s, held by `whatsapp-connect.test.mjs` as `config` and `start`, so the new verbs are exports of their own); the dead-exports check does not follow a test's dynamic import, so a verb that only its own module read would be counted dead.
13. **`broadcast-number.ts` learns Meta's `TIER_2K`.** `LIMIT_TIERS` knows Meta's tiers by their word and `dailyLimit` answers nothing for one it does not know. The WABA's messaging-limit field answers `TIER_2K`, which the table lacked, and the standing's notes say a tier in words, so a business at that tier would have been told nothing of its limit. It is one line, in the module Task 1 already edits.
14. **Every migration, generated file and dist the work needs is made by the repository's own commands**, never by hand and never from the shared local stack, which holds every lane's migrations and is never reset: the types, the schema snapshot and the ledger come from this branch's own stack (Task 5), the route table, the typed client and the API reference from their generators (Task 9), the browser entry and the builds where a barrel or a package moves.

---

## File map

| File | Change | Responsibility |
| --- | --- | --- |
| `packages/contracts/src/lines/{number-standing,whatsapp-cost,line-codes,connection-note}.ts` | create | `NumberStanding` and its words; what WhatsApp costs and the link to add a payment method; a code sent to the line and its notes; a note |
| `packages/contracts/src/setup/connections.ts`, `lines/channels.ts`, `lines/index.ts`, `broadcasts/broadcast-number.ts`, `shared/enums.ts`, `shared/index.ts`, `workspace/activity.ts` | modify | The rows' notes; the channel carries the standing; the barrel; `TIER_2K`; `waMeDigits`, `WABA_FIELDS`; the Activity words for `channel.standing` |
| `packages/contracts/src/browser.generated.ts`, `packages/*/dist` | modify, regenerate | The browser entry, the builds |
| `packages/channels/src/lines/{sms,lines,lines-twilio,lines-dry}.ts`, `packages/channels/src/index.ts` | modify | `oneTimeCodeOf`, `lineCodesFrom`; the provider's `recentTexts` |
| `packages/db/src/lines.ts` (create), `packages/db/src/sweeps.ts`, `packages/db/src/index.ts`, `packages/db/src/database.types.ts` | create, modify, regenerate | `ownLineOf`; `keepChannelStanding`, `whatsappNumberOf`; the function's type |
| `supabase/migrations/00330_a_number_s_standing_is_kept_and_said_when_it_changes.sql`, `supabase/migrations-ledger.json`, `supabase/schema.sql` | create, regenerate | `channel_keep_standing`, its ledger line and the schema snapshot |
| `apps/edge/lib/sms/{sms-ingress,inbound-text}.ts` | modify | The `code` verdict and `sms_code_skipped` |
| `apps/edge/lib/whatsapp/number-standing.ts` (create), `meta-graph.ts`, `connect-number.ts`, `number-quality.ts`, `waba-events.ts`, `webhook.ts` | create, modify | The reading, the keeping and the telling; the sweep; the routing and the name's decision |
| `apps/edge/lib/lines/line-codes.ts`, `apps/edge/api/admin/lines/codes.ts`, `apps/edge/api/admin/whatsapp/standing.ts` | create | The codes door and the owner's check door |
| `apps/edge/api/cron/channel-quality.ts`, `apps/edge/lib/log-events.ts`, `apps/edge/vercel.json` | modify | The sweep's answer; the closed set of log names; the check's time limit |
| `apps/dashboard/app/api/v1/lines/codes/route.ts`, `apps/dashboard/app/api/v1/channels/whatsapp/standing/route.ts` | create | `GET lines/codes`, `POST channels/whatsapp/standing` |
| `apps/dashboard/src/server/{rate-limit,connections/lines,connections/whatsapp,readers/channels}.ts` | modify | The two buckets; the two doors' callers; the channels read passes the standing |
| `apps/dashboard/src/client/routes.generated.ts`, `packages/contracts/src/route-keys.generated.ts`, `tooling/scripts/tests/route-policy.json`, `docs/api.md` | regenerate | The routes' rows, client keys and reference |
| `apps/dashboard/src/surfaces/settings/connections/live.ts` (create), `pane.tsx`, `row.tsx`, `whatsapp.ts`; `settings/billing/pane.tsx`; `legacy/styles/settings.css`; `legacy-bridge/refresh-map.ts` | create, modify | The two hooks; the notes and their links drawn; the asks and the sign-up's mark; Billing's line; the notes' rule; the check re-reads Settings |
| `tooling/scripts/tests/{sms/one-time-code,lines/line-codes-door,connections/{whatsapp-standing,connection-notes,standing-routes},whatsapp/{number-standing,whatsapp-standing-door,a-number-s-standing-is-kept-and-said-when-it-changes.db}}.test.mjs` | create | The new tests, each over the real code |
| `tooling/scripts/tests/{sms/{sms-ingress,sms-door},lines/lines-twilio,connections/channels-vm,whatsapp/{whatsapp-connect-door,whatsapp-connect,whatsapp-door,the-channel-quality-sweep-reads-its-numbers-from-the-database.db},cron/cron-channel-quality-door,edge/{every-door-reads-its-body-once,error-codes},repo/{event-kinds,ops-hygiene},workspace/{activity,settings-doors},ask/readers,routes/rate-limit}.test.mjs` | modify | The pins and fixtures that moved (named in each task) |
| `tooling/scripts/tests/baselines/complexity.json`, `tooling/scripts/tests/_unique-keys.generated.json`, `docs/data-model.md` | bank, regenerate | The two falls this lane causes; the generated key and table lists |
| `docs/system-prd.md`, `docs/runbook.md` | modify | Task 14: what the system does now, the log lines to know |

Folder counts (`tree-shape.json`, 20 modules at most; the ratchets read `git ls-files`, so stage new files before running them): `apps/dashboard/app/api/v1/lines/codes` and `apps/dashboard/app/api/v1/channels/whatsapp/standing` are new folders of one route each; `apps/dashboard/src/surfaces/settings/connections` 10 to 11; `apps/edge/api/admin/lines` is a new folder of one door; `apps/edge/api/admin/whatsapp` 5 to 6; `apps/edge/lib/lines` 13 to 14; `apps/edge/lib/whatsapp` 13 to 14; `packages/contracts/src/lines` 8 to 12; `packages/db/src` 17 to 18; `packages/contracts/src/shared` is **already over its limit (21) and gets no new file** (its changes go into existing modules); `tooling/scripts/tests/connections` 2 to 5, `lines` 18 to 19, `sms` 4 to 5, `whatsapp` 15 to 18; `tooling/scripts/tests/workspace`, `repo` and `edge` are full (20) and get **no** new file (their changes go into existing tests).

## Standing rules for how this is done

- **Local commits only.** Nothing is pushed and no pull request is opened until Ruben says so. One pull request for the whole plan, built end to end on this branch.
- **Main moves every few minutes.** Start from the newest: `git fetch origin`, and if it is past the commit under "Written against", merge it into the branch before Task 1 (a merge is not a push) and run `corepack pnpm install --frozen-lockfile` if the lockfile moved. The plan's `swap` blocks match exact text, so one that no longer matches the merged tree is a stop (the script writes nothing of the run): read what main changed there and write the edit again against it, never loosen it. The plan was written against `4813d3a2f` and applied again, task by task, to `163f3678a` when #1445 and #1446 landed: only Task 14's bundle steps and its row in `docs/debt.md` had to change.
- **Sub-agents run on Sonnet.** The plan never reads or writes production. The two things that touch it are Ruben's, before the merge: applying migration 00330 (the runbook's "Apply a migration") and the live read of Meta's answers for the Chanlytics workspace's own account (Task 14 Step 10).
- **Never `supabase db reset`, and never the shared local stack.** The shared stack holds every lane's migrations and is not this branch's truth. Task 5 starts a stack of this branch's own, on ports 563xx and a project name of its own, and stops and removes it when it is done; the database suites run only against it, and refuse a database that is not on this machine.
- **Never run the whole `pnpm test`.** Run the touched test files one per command, `node tooling/scripts/checks/test.mjs <one test file>`; the ratchets and the debt register where a task says so; `corepack pnpm -r typecheck` where a package or a type moved. Task 14 runs lint, dead exports and the format check over the whole, and `changed-tests.mjs` before the push.
- **Tests import `@chanlytics/contracts`, `@chanlytics/channels` and `@chanlytics/db` from `dist`.** After a package change: `corepack pnpm --filter "./packages/*" build`, then keep only the dist files that have a real diff, each by its own diff:
  `for f in $(git ls-files packages/contracts/dist packages/db/dist packages/jobs/dist packages/channels/dist packages/core/dist); do git diff -w --ignore-cr-at-eol --quiet -- "$f" && git checkout -- "$f"; done`.
  On this Windows machine `packages/db/dist/index.d.ts` gets four `agrees?:` comments spliced in by any build while `packages/db/src/database.types.ts` is CRLF, and that is a real diff the loop would keep. So, **before the first build of this work**, make that source LF in the working copy (git sees no change and it stays LF): `node -e "const fs=require('fs');const f='packages/db/src/database.types.ts';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n'))"`. After a build, `git status --short packages` shows only the dist files the task changed.
- **Contracts' browser entry.** After a contracts barrel changes: `node tooling/scripts/gen/contracts-browser-entry.mjs`, then the build above.
- **Generated files are made by their commands, never by hand:** the route policy only by the updater (`UPDATE_ROUTE_POLICY=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/route-policy.test.mjs`), the typed client by `node tooling/scripts/gen/route-types.mjs`, the API reference by `corepack pnpm gen:api-reference`, the types, the schema snapshot and the data model from this branch's stack (Task 5), the ledger by `node tooling/scripts/checks/migration-ledger.mjs --record`.
- **Edits are whole-file writes or exact replacements, never `sed`** (Git Bash's `sed` flips CRLF on this machine). The working copy is CRLF, so a multi-line replacement is made with `swap`, a Node script written once to the session scratchpad with the Write tool as `swap.mjs`. A task's `swap` block is saved as `<task>.swap` in the scratchpad and run from the worktree root with `node <scratchpad>/swap.mjs <scratchpad>/<task>.swap`; each edit is matched on LF-normalised text and must match exactly once, or the script stops with the first words of the text it did not find and writes nothing of the run; a file is written back in its own line endings.

  ```js
  // swap.mjs — node swap.mjs <edits file>. Edits are  ##FILE <path> / ##FROM / <old text> / ##TO / <new text> / ##END.
  import fs from "node:fs";
  const lines = fs.readFileSync(process.argv[2], "utf8").replace(/\r\n/g, "\n").split("\n");
  let file = null;
  let mode = null;
  let from = [];
  let to = [];
  const edits = [];
  for (const line of lines) {
    if (line.startsWith("##FILE ")) file = line.slice(7).trim();
    else if (line === "##FROM") {
      mode = "from";
      from = [];
      to = [];
    } else if (line === "##TO") mode = "to";
    else if (line === "##END") {
      edits.push({ file, from: from.join("\n"), to: to.join("\n") });
      mode = null;
    } else if (mode === "from") from.push(line);
    else if (mode === "to") to.push(line);
  }
  const texts = new Map();
  const endings = new Map();
  for (const e of edits) {
    if (!texts.has(e.file)) {
      const raw = fs.readFileSync(e.file, "utf8");
      endings.set(e.file, raw.includes("\r\n"));
      texts.set(e.file, raw.replace(/\r\n/g, "\n"));
    }
    const parts = texts.get(e.file).split(e.from);
    if (parts.length !== 2) throw new Error(`${e.file}: expected the text once, found ${parts.length - 1}:\n${e.from.slice(0, 120)}`);
    texts.set(e.file, parts.join(e.to));
  }
  for (const [file, text] of texts) fs.writeFileSync(file, endings.get(file) ? text.replace(/\n/g, "\r\n") : text);
  console.log(`${edits.length} edits in ${texts.size} files`);
  ```

  A deletion's `##FROM` carries the line after it so no blank line is left. A whole new file is written with the Write tool.
- **Prettier owns formatting, and each task formats what it touched.** Every task's "Format, run" step names its files in one `corepack pnpm exec prettier --write <files>` line, run before `git add`; the pre-commit hook formats what is staged too. A later task's `swap` matches the file **as the earlier task left it, formatted**, and the plan was applied that way (Prettier between tasks), so a swap that does not match is a stop, not a reason to loosen the text.
- **The ratchets read `git ls-files`.** A new file is unseen until it is added: each task's commit step names its files with `git add`, and a ratchet run before the commit is run again after it. **Bank every fall in the task that causes it** (`UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs`, then the same for `debt-register.test.mjs`): Tasks 12 and 13 bank the two falls this lane causes. A rise is a stop, not a bank: find what added it.
- **Three things a green test does not show, and Task 14 checks:** an `async` function with no `await` raises lint's `require-await` count (the dry provider's new method is not `async` for that reason); an export nothing outside its module imports is a dead export (the readers of Task 1's exports arrive in later tasks, so the check is first required at Task 14); a function past 150 lines, 30 branches or 5 levels of nesting that was not past them is a ratchet rise.
- **No customer in the code.** Fixtures say `harbor`, `Harbor Moving`, `+1555010xxxx`, `example.com`, and Meta's and Twilio's ids are made up (`1002003004005`, `PN…`); the two real bodies Meta texted on 6 October are used as bodies and their senders' numbers are not. **One look:** no `[data-look=...]` selector (the one new rule reads the hint tokens).
- **Disk:** check free space before a build or a stack (`df -h .`), and delete this worktree's `apps/dashboard/.next` after a dashboard build. A page change is looked at in the real app (`docs/runbook.md`, "See a real page"), never the standalone mockup.

## Review Focus

1. **A code is never taken for a customer's text, and a customer's text is never taken for a code.** Task 2's negatives are the customers who would be silenced (a door code, "can you send me the code?", a booking with a number in it, two numbers and a sharing word); Task 4 holds that a forged request, an unknown line and a switched-off channel are refused exactly as before, whatever their body says, because the verdict comes after those are proven.
2. **Nothing stores a code, and nothing logs one.** The route and the door read Twilio's record on every call; the log line holds the name of the service and never a body; a failed read names the workspace and never what a text said.
3. **The standing is one reading and one keeper.** `numberStanding` is the only function that asks Meta; `readAndKeepStanding` is the only one that keeps and tells, called by the connection, the sweep and the owner's check; `channel_keep_standing` merges beside the rating and never over the webhook's words, and says `first`, `changed`, `same` or `gone`. The owner is told once, never while it stays BLOCKED.
4. **A failed read fails nothing else.** Not a connection, not a sweep tick (its time budget is held under the door's limit by `ops-hygiene.test.mjs`), not a page: each failure is an outcome and a line.
5. **The words say what is true.** What a missing payment method stops is what a business starts, never replies; `null` is "not read", never "none"; no rate is written anywhere; the link to add a payment method is made only from two ids that are digits, and otherwise the note points at Meta Business Suite.
6. **Links to Meta open in a new tab with `rel="noopener noreferrer"`**, and nothing of this page's passes with them.
7. **The routes are the owner's door**, each declares its policy and its own bucket, and the check, a write, is in the refresh map (`refresh-coverage.test.mjs` fails a write in neither table).
8. **A partner's notice is attributed by an id Meta gives, to the workspace that holds it.** `accountOf` prefers `waba_info.waba_id` where the notice has one and the entry's id otherwise; an account no workspace holds is logged at info and kept nowhere; `waba_unroutable` stays an error for a notice about an account a workspace should hold.
9. **The migration is a function and nothing else**, `security definer`, the service role's alone, raising on a standing it would keep wrong; apply it to production before the merge (the runbook's "Apply a migration"), and re-check its number on the day (Task 14 Step 11).
10. **`has_payment_method` rests on one thing Meta's documentation does not say**, what an account with no payment method answers. The code tells the answers apart and guesses nothing, and Task 14 Step 10 is the live check on the Chanlytics workspace's own account, before the merge.
11. **What grew in the bundle** is measured against main built the same way on the same machine (Task 14 Steps 7 and 8), and a raise is argued by that growth only, in bytes, as the check names it.
### Task 1: Contracts: what Meta holds about a number, what WhatsApp costs, the codes sent to a line, and the notes a Connections row carries

**Why:** every sentence the page says comes from contracts, so the words come first and the rest of the plan reads them. This task adds four small modules, gives every `ConnectionRow` its notes, and teaches the channel to carry what Meta holds:

- **`lines/number-standing.ts`**: Meta's standing of a number as a type (may it send, what stands in the way, its display name's review, the business's verification and tier, and, from the account, **whether a payment method is on file, the business that owns the account, and the account itself**), read back from a channel's config, and put into words: the WhatsApp row's sentence and notes for a number Meta will not let send or limits, the note for a missing payment method with the way to add one, the owner's alert, the Activity words, and when a page that opens should ask Meta again.
- **`lines/whatsapp-cost.ts`**: **what WhatsApp costs and who bills it**, in one place: the four lines said under the WhatsApp row before it is connected and after, the one line Settings › Billing says (Task 11), and the address of the page Meta opens for adding a payment method (`addPaymentMethodLink`). No rate is written anywhere in Chanlytics; the words link Meta's own page.
- **`lines/line-codes.ts`**: a code sent to the line as the page holds it, and its notes. **`lines/connection-note.ts`**: the shape of a note, its words and, where there is somewhere to go, one link after them (`ConnectionNote`), which the page draws with the kit's link and opens in a new tab (Task 11). `ConnectionRow.notes` is an array of them.
- The two fields the channel carries (`standing`, `standingReadAt`), `dailyLimit` learning Meta's `TIER_2K` (the WABA's messaging-limit field answers it; `LIMIT_TIERS` held `TIER_1K` and not it), and `waMeDigits`, the one place that says what a `wa.me` link takes of a number, which the opt-in link already needed and now shares.

What the words say rests on four facts Meta publishes or the product has seen, and no number of money:

- **Who bills WhatsApp** (Meta's pricing documentation, read 6 October 2026): per-message pricing since 1 July 2025, an account is charged only when a **template** message is delivered, and Meta bills the WhatsApp Business Account's own card, not Chanlytics (Chanlytics is a Tech Provider, not the account's solution partner). Free: every message that is not a template inside an open customer service window (24 hours after the customer's last message), utility templates delivered inside an open window, and everything inside a 72-hour free entry point window. Charged: marketing templates, and utility and authentication templates outside a window; the rate depends on the recipient's country calling code, the category and the month's volume. The explainer says it in four lines (billed by Meta to the card on the WhatsApp account; free: replies within 24 hours, the receptionist's and the owner's; charged: reminders and notices after those 24 hours, and every campaign or offer; prices depend on the customer's country, with Meta's rates page linked), and Settings › Billing says one line of it.
- **What a payment method is for**: on 6 October a customer's reply to a text was delivered by the receptionist within eight seconds on an account with no payment method, so what a missing payment method stops is the messages the business starts (templates: reminders, campaigns), never replies to a customer who wrote first. The pre-flight note and the standing's notes say that, and never that WhatsApp "will not send".
- **Whether one is on file**: the WABA's `primary_funding_id` is present when a payment method is (Task 6 reads it; Meta's reference lists the field and does not say what is returned when none exists, which Task 6 says how it handles). Where the standing says none is on file, the row says so with a link, "Add one in Meta", to Meta's billing page opened on this business and this account (`business_id` is the account's owner, `asset_id` the WABA); where the owner is not known the note points at Meta Business Suite instead of at a link that would open on nothing; where the account's funding could not be read, a problem of Meta's that names a payment gets the note that says what a payment method is for.
- **How to try a connected number from a phone**: on 6 October a phone's WhatsApp said a number registered an hour before "isn't on WhatsApp" because its contact lookup was cached; opening `wa.me/<digits>` in the phone's browser forced a fresh lookup and the chat opened. A connected row nobody has written to yet says so, built from the channel's number by `waMeDigits`.

Nothing reads or writes a standing yet: the reader that fills the DTO is Task 10, the keeper is Tasks 5 to 7.

**Files:**
- Create: `packages/contracts/src/lines/number-standing.ts`, `packages/contracts/src/lines/line-codes.ts`, `packages/contracts/src/lines/whatsapp-cost.ts`, `packages/contracts/src/lines/connection-note.ts`, `tooling/scripts/tests/connections/whatsapp-standing.test.mjs`, `tooling/scripts/tests/connections/connection-notes.test.mjs`
- Modify: `packages/contracts/src/setup/connections.ts`, `packages/contracts/src/lines/channels.ts`, `packages/contracts/src/lines/index.ts`, `packages/contracts/src/broadcasts/broadcast-number.ts`, `packages/contracts/src/shared/enums.ts`, `packages/contracts/src/shared/index.ts`, `tooling/scripts/tests/connections/channels-vm.test.mjs`
- Regenerate: `packages/contracts/src/browser.generated.ts`, `packages/contracts/dist`

- [ ] **Step 1: Write the failing tests**

Create `tooling/scripts/tests/connections/whatsapp-standing.test.mjs`:

```js
/**
 * What Meta holds about a connected WhatsApp number, in the owner's words (contracts lines/number-standing.ts): the kept
 * answer read back from a channel's config without trusting it, the WhatsApp row for a number Meta will not let send, one
 * it limits and one it has said nothing about, whether the account has a payment method and what that means (said from what the
 * account holds, else from what Meta's problems name, with the way to add one), how to try a number nobody has written to yet from a
 * phone (and the digits a wa.me link takes), what WhatsApp costs, said last under every connected row, the owner's alert, and when
 * a page that opens should ask Meta again. Run on the real functions, over the shape the edge keeps
 * (apps/edge/lib/whatsapp/meta-graph.ts numberStanding writes it; the database door channel_keep_standing keeps it whole). The
 * Activity log's words for a change are held in workspace/activity.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  connectionRows,
  standingAlertWords,
  standingFromConfig,
  standingNeedsRead,
  toChannelVM,
  waMeDigits,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-10-06T15:00:00Z");
const MIN = 60_000;
const ago = (ms) => new Date(NOW - ms).toISOString();

/** What WhatsApp costs, said last under every connected row: Meta bills it, to the card on the WhatsApp account. */
const COST = [
  "WhatsApp is billed by Meta, straight to the card on your WhatsApp account — not on your Chanlytics bill.",
  "Free: replies to a customer within 24 hours of their last message — the receptionist's and yours.",
  "Charged by Meta for each one delivered: reminders and notices sent after those 24 hours, and every campaign or offer.",
  "Prices depend on the customer's country.",
];
const PRICES = { label: "Meta's current prices", href: "https://business.whatsapp.com/products/platform-pricing#rates" };
/** The same, as the row's notes: the last carries the link to Meta's rates (no rate is written in Chanlytics). */
const COST_NOTES = COST.map((text, at) => (at === COST.length - 1 ? { text, link: PRICES } : { text }));
/** What a row says beyond what WhatsApp costs: its notes' words, one to a note. */
const said = (r) => r.notes.slice(0, -COST.length).map((n) => n.text);

/** What a payment method is for: Meta delivers replies to a customer who wrote first without one, and not the messages the business starts. */
const PAYMENT_NOTE =
  "Without a payment method, Meta still delivers replies to customers who write first; it does not deliver the messages your business starts, like reminders and campaigns.";
/** What a number whose account has no payment method says: replies go out, what the business starts does not. */
const NO_PAYMENT =
  "No payment method on your WhatsApp account yet: replies still go out, but reminders and campaigns will not be delivered.";
/** The business that owns the WhatsApp account and the account (made up), and the page Meta opens to add a payment method to it. */
const BUSINESS = "410540000000001";
const ACCOUNT = "205540000000001";
const ADD_ONE = {
  label: "Add one in Meta",
  href: `https://business.facebook.com/billing_hub/accounts/details/?business_id=${BUSINESS}&asset_id=${ACCOUNT}&wizard_name=ADD_PM&account_type=whatsapp-business-account`,
};
const VERIFIED_2K = "Your business is verified with Meta: you can start conversations with up to 2,000 people a day.";

/** What the edge keeps for a number Meta reports BLOCKED: the account's missing payment method, in Meta's words, and the app's own trouble. */
const BLOCKED = {
  can_send: "BLOCKED",
  problems: [
    {
      entity: "WABA",
      code: 141006,
      said: "A payment method is required to send messages",
      fix: "Add a payment method in WhatsApp Manager",
    },
    { entity: "APP", code: 131000, said: "The app is in development mode", fix: null },
  ],
  notes: [],
  name: "Harbor Moving",
  name_status: "APPROVED",
  verification: "not_verified",
  limit: "TIER_250",
  has_payment_method: null,
  owner_business_id: null,
  waba_id: null,
};
/** A number Meta lets send, with its display name still in review and the business verified at a tier, a payment method on file. */
const LIMITED = {
  can_send: "LIMITED",
  problems: [],
  notes: ["Your display name has not been approved yet. Messages are limited until it is."],
  name: "Harbor Moving",
  name_status: "PENDING_REVIEW",
  verification: "verified",
  limit: "TIER_2K",
  has_payment_method: true,
  owner_business_id: BUSINESS,
  waba_id: ACCOUNT,
};
/** A number with nothing in the way and nothing to say about its name: what a row says of it is the account's and the business's. */
const AVAILABLE = { ...LIMITED, can_send: "AVAILABLE", notes: [], name_status: "APPROVED" };

const channel = (standing, over = {}) =>
  toChannelVM(
    {
      id: "ch-wa",
      kind: "whatsapp",
      number_e164: "+13055550188",
      status: "active",
      created_at: ago(30 * 24 * 60 * MIN),
      last_inbound_at: ago(120 * MIN),
      standing,
      standing_read_at: ago(5 * MIN),
      ...over,
    },
    new Date(NOW),
  );
const base = () => ({
  channels: [],
  whatsapp: null,
  lines: { rows: [], ready: false },
  lineRequestedAt: null,
  google: null,
  calendar: null,
});
const whatsappRow = (ch) => connectionRows({ ...base(), channels: [ch] }, NOW).find((r) => r.kind === "whatsapp");

test("a number Meta will not let send needs attention, says Meta's first problem in Meta's words, and gives the fix and the rest as notes", () => {
  const r = whatsappRow(channel(BLOCKED));
  assert.deepEqual([r.state, r.stateWords, r.group], ["attention", "Needs attention", "connected"]);
  assert.equal(r.sentence, "Meta: A payment method is required to send messages.");
  assert.deepEqual(said(r), [
    "Add a payment method in WhatsApp Manager.",
    "The app is in development mode.",
    PAYMENT_NOTE,
    "Your business isn't verified with Meta: you can start conversations with up to 250 people a day. Replies to customers who write first are not limited.",
  ]);
  assert.deepEqual(r.verb, { label: "Library", to: "messages", who: "operator" }, "the row's own verb stays");
});

test("a number Meta blocks without saying why says that much and nothing it did not say", () => {
  const r = whatsappRow(channel({ ...BLOCKED, problems: [], verification: null, limit: null }));
  assert.equal(r.state, "attention");
  assert.equal(r.sentence, "Meta says WhatsApp cannot send from this number right now.");
  assert.deepEqual(said(r), [], "no problem, no note, no verification read: nothing is invented");
});

test("a number Meta limits stays On with what Meta said, the name's review and the tier, each as a note", () => {
  const plain = whatsappRow(channel(null));
  const r = whatsappRow(channel(LIMITED));
  assert.deepEqual([r.state, r.stateWords], ["connected", "On"]);
  assert.equal(r.sentence, plain.sentence, "the sentence is the row's own: receiving, and its rating");
  assert.deepEqual(said(r), [
    "Your display name has not been approved yet. Messages are limited until it is.",
    "Meta is reviewing the display name “Harbor Moving”; until then customers see the number.",
    VERIFIED_2K,
  ]);
});

test("a declined name and a business with no daily limit are said; a name Meta approved, and a number it has said nothing about, say nothing of themselves", () => {
  const declined = whatsappRow(channel({ ...AVAILABLE, name_status: "DECLINED", limit: "TIER_UNLIMITED" }));
  assert.deepEqual(said(declined), [
    "Meta declined the display name “Harbor Moving” — change it in WhatsApp Manager.",
    "Your business is verified with Meta and has no daily limit on starting conversations.",
  ]);
  assert.equal(declined.state, "connected");
  const expired = whatsappRow(channel({ ...AVAILABLE, name: null, name_status: "EXPIRED", verification: null }));
  assert.deepEqual(said(expired), ["The request for your display name expired — submit it again in WhatsApp Manager."]);
  assert.deepEqual(said(whatsappRow(channel(AVAILABLE))), [VERIFIED_2K]);
  const unread = whatsappRow(channel(null));
  assert.deepEqual(said(unread), [], "nothing read yet: as it was, its quality and its last message");
  assert.match(unread.sentence, /^Receiving · last message 2h ago/);
});

test("an unverified business is said at the tier Meta gave, else at the start Meta gives a new business; a pending one is unverified too", () => {
  const at = (over) => said(whatsappRow(channel({ ...AVAILABLE, ...over })));
  assert.deepEqual(at({ verification: "pending", limit: "TIER_50" }), [
    "Your business isn't verified with Meta: you can start conversations with up to 50 people a day. Replies to customers who write first are not limited.",
  ]);
  assert.deepEqual(at({ verification: "not_verified", limit: "UNTIERED" }), [
    "Your business isn't verified with Meta: you can start conversations with up to 250 people a day. Replies to customers who write first are not limited.",
  ]);
  assert.deepEqual(at({ verification: "not_verified", limit: null }), at({ verification: "rejected", limit: "UNTIERED" }));
  assert.deepEqual(at({ verification: "verified", limit: "UNTIERED" }), ["Your business is verified with Meta."]);
});

test("a word of Meta's that is not one of the three is kept and not guessed: the row neither flags it nor calls it fine", () => {
  const r = whatsappRow(channel({ ...BLOCKED, can_send: "RESTRICTED", problems: [], verification: null, limit: null }));
  assert.deepEqual([r.state, r.stateWords], ["connected", "On"]);
  assert.equal(r.sentence, whatsappRow(channel(null)).sentence);
});

test("a switched-off number says nothing of what Meta holds or of what WhatsApp costs, and a flagged one is still flagged", () => {
  const off = whatsappRow(channel(BLOCKED, { status: "disabled" }));
  assert.deepEqual([off.state, off.stateWords, off.notes], ["off", "Off", []]);
  const flagged = whatsappRow(channel(LIMITED, { quality: "RED", quality_event: "FLAGGED" }));
  assert.equal(flagged.state, "attention", "Meta's rating still counts");
  assert.match(flagged.sentence, /WhatsApp flagged this number's quality/);
});

test("the kept answer is read back as it is held and no looser: a word and an object, else nothing; a malformed problem or note is dropped, never mended", () => {
  assert.deepEqual(standingFromConfig(BLOCKED), BLOCKED);
  assert.deepEqual(standingFromConfig(LIMITED), LIMITED);
  assert.deepEqual(
    standingFromConfig({
      can_send: " AVAILABLE ",
      problems: [
        null,
        "x",
        { entity: "APP", code: "141006", said: "  Too many  ", fix: 7 },
        { entity: 4, code: 1, said: "" },
        { said: "Kept", fix: "Fix it" },
      ],
      notes: ["  one ", 3, "", null, "two"],
      name: "",
      name_status: "APPROVED",
      verification: 5,
      limit: undefined,
      has_payment_method: "yes",
      owner_business_id: " 410540000000001 ",
      waba_id: 205540000000001,
    }),
    {
      can_send: "AVAILABLE",
      problems: [
        { entity: "APP", code: null, said: "Too many", fix: null },
        { entity: "UNKNOWN", code: null, said: "Kept", fix: "Fix it" },
      ],
      notes: ["one", "two"],
      name: null,
      name_status: "APPROVED",
      verification: null,
      limit: null,
      has_payment_method: null,
      owner_business_id: "410540000000001",
      waba_id: null,
    },
  );
  for (const held of [true, false])
    assert.equal(standingFromConfig({ can_send: "AVAILABLE", has_payment_method: held }).has_payment_method, held);
  for (const bad of [undefined, null, "AVAILABLE", 7, [], {}, { can_send: "" }, { can_send: 3 }, { problems: [] }])
    assert.equal(standingFromConfig(bad), null, JSON.stringify(bad));
});

test("a page that opens asks Meta again when nothing was kept, or when what was kept is not AVAILABLE and ten minutes old; an AVAILABLE number is the clock's to renew", () => {
  const held = (standing, readAgo) => ({ standing, standingReadAt: readAgo === null ? null : ago(readAgo) });
  assert.equal(standingNeedsRead(held(null, null), NOW), true, "never read");
  assert.equal(standingNeedsRead(held(null, 1 * MIN), NOW), true, "a stamp without an answer is nothing read");
  assert.equal(standingNeedsRead(held({ ...BLOCKED, can_send: "AVAILABLE" }, 3 * 24 * 60 * MIN), NOW), false);
  assert.equal(standingNeedsRead(held(BLOCKED, 9 * MIN), NOW), false, "a payment method fixed a minute ago is asked about at ten");
  assert.equal(standingNeedsRead(held(BLOCKED, 10 * MIN), NOW), false, "ten minutes exactly is not more than ten");
  assert.equal(standingNeedsRead(held(BLOCKED, 10 * MIN + 1), NOW), true);
  assert.equal(standingNeedsRead(held(LIMITED, 11 * MIN), NOW), true);
  assert.equal(standingNeedsRead(held(BLOCKED, null), NOW), true, "no stamp: asked");
  assert.equal(standingNeedsRead({ standing: BLOCKED, standingReadAt: "last tuesday" }, NOW), true, "a stamp that is no time is no stamp");
});

test("the owner's alert says which number, Meta's first problem and Meta's fix, in Meta's words", () => {
  assert.deepEqual(standingAlertWords("+13055550188", BLOCKED), {
    subject: "WhatsApp can't send from your number",
    body: "WhatsApp can't send from +1 (305) 555-0188: A payment method is required to send messages. Add a payment method in WhatsApp Manager.",
  });
  assert.equal(
    standingAlertWords("+13055550188", { ...BLOCKED, problems: [{ entity: "WABA", code: null, said: "Account restricted.", fix: null }] }).body,
    "WhatsApp can't send from +1 (305) 555-0188: Account restricted.",
  );
  assert.equal(
    standingAlertWords(null, { ...BLOCKED, problems: [] }).body,
    "WhatsApp can't send from your number. Meta did not say why; open Connections to read what it holds.",
  );
});

test("whether the account has a payment method is said where it matters, with the way to add one; where it could not be read, what a payment method is for is said wherever Meta's own problem names one", () => {
  const notes = (over) => whatsappRow(channel({ ...AVAILABLE, ...over })).notes.slice(0, -COST.length);
  const named = { entity: "WABA", code: 141006, said: "A payment method is required to send messages", fix: null };
  const NAMED = { text: "A payment method is required to send messages." };
  // None on file: said plainly, with the page Meta opens to add one for this business and this account.
  assert.deepEqual(notes({ has_payment_method: false }), [{ text: NO_PAYMENT, link: ADD_ONE }, { text: VERIFIED_2K }]);
  // The business, or the account, not known (or an id that is not digits): no link that would open on nothing; Business Suite instead.
  const SUITE = { text: `${NO_PAYMENT} Add one in Meta Business Suite › Billing.` };
  assert.deepEqual(notes({ has_payment_method: false, owner_business_id: null }), [SUITE, { text: VERIFIED_2K }]);
  assert.deepEqual(notes({ has_payment_method: false, waba_id: null }), [SUITE, { text: VERIFIED_2K }]);
  assert.deepEqual(notes({ has_payment_method: false, owner_business_id: "41054 x&y=1" }), [SUITE, { text: VERIFIED_2K }]);
  // One on file: nothing of it, even where Meta's own problem names a payment.
  assert.deepEqual(notes({ has_payment_method: true }), [{ text: VERIFIED_2K }]);
  assert.deepEqual(notes({ has_payment_method: true, problems: [named] }), [NAMED, { text: VERIFIED_2K }]);
  // None on file and Meta's problem names it too: the account's own word says it once, after Meta's.
  assert.deepEqual(notes({ has_payment_method: false, problems: [named] }), [
    NAMED,
    { text: NO_PAYMENT, link: ADD_ONE },
    { text: VERIFIED_2K },
  ]);
  // Not read: Meta's problem is what there is to go on, and a payment method's use is said once, however many problems name a payment.
  assert.deepEqual(notes({ has_payment_method: null, problems: [named] }), [NAMED, { text: PAYMENT_NOTE }, { text: VERIFIED_2K }]);
  const twice = [named, { entity: "BUSINESS", code: null, said: "The payment method on file was declined", fix: null }];
  assert.equal(notes({ has_payment_method: null, problems: twice }).filter((n) => n.text === PAYMENT_NOTE).length, 1);
  assert.deepEqual(notes({ has_payment_method: null, problems: [{ ...named, said: "The app is in development mode" }] }), [
    { text: "The app is in development mode." },
    { text: VERIFIED_2K },
  ]);
  assert.deepEqual(notes({ has_payment_method: null }), [{ text: VERIFIED_2K }], "nothing named, nothing known: nothing said");
});

test("every connected WhatsApp row says what WhatsApp costs, last: who bills it, what is free, what is charged, and Meta's own page for the prices; a switched-off number and every other row say none of it", () => {
  for (const ch of [channel(null), channel(LIMITED), channel(BLOCKED), channel(null, { quality: "RED", quality_event: "FLAGGED" })]) {
    const r = whatsappRow(ch);
    assert.deepEqual(r.notes.slice(-COST.length), COST_NOTES, `${r.state}: the four lines, the last with its link`);
  }
  assert.deepEqual(whatsappRow(channel(null, { status: "disabled" })).notes, []);
  const rows = connectionRows({ ...base(), channels: [channel(null)] }, NOW);
  for (const r of rows.filter((x) => x.kind !== "whatsapp")) assert.deepEqual(r.notes, [], r.kind);
});

test("a connected number nobody has written to yet says how to try it from a phone, built from its number; once a message has arrived, or when the row is off, needs attention or has no number, it says nothing of the kind", () => {
  const TRY = {
    text: "Try it from your phone: wa.me/13055550188 — if WhatsApp says the number isn't on WhatsApp yet, open this link instead of searching your contacts.",
  };
  const unwritten = { last_inbound_at: null };
  assert.deepEqual(whatsappRow(channel(null, unwritten)).notes, [TRY, ...COST_NOTES]);
  assert.deepEqual(
    whatsappRow(channel(AVAILABLE, unwritten)).notes,
    [TRY, { text: VERIFIED_2K }, ...COST_NOTES],
    "the way to try it first, then what Meta holds, then what it costs",
  );
  assert.deepEqual(whatsappRow(channel(null)).notes, COST_NOTES, "a message has arrived");
  assert.deepEqual(whatsappRow(channel(null, { ...unwritten, status: "disabled" })).notes, [], "off");
  assert.ok(!whatsappRow(channel(BLOCKED, unwritten)).notes.some((n) => n.text === TRY.text), "needing attention: Meta's words come first");
  assert.deepEqual(
    whatsappRow(channel(null, { ...unwritten, quality: "RED", quality_event: "FLAGGED" })).notes,
    COST_NOTES,
    "flagged: needs attention too",
  );
  assert.deepEqual(whatsappRow(channel(null, { ...unwritten, number_e164: null })).notes, COST_NOTES, "no number, no link");
  assert.match(
    whatsappRow(channel(null, { ...unwritten, number_e164: "+442079460958" })).notes[0].text,
    /^Try it from your phone: wa\.me\/442079460958 — /,
    "any country's number, digits only",
  );
});

test("a wa.me link takes a number's digits, no plus, spaces or brackets, from the number as E.164 or as it is shown; too few digits is no link", () => {
  assert.equal(waMeDigits("+13055550188"), "13055550188");
  assert.equal(waMeDigits("+1 (305) 555-0188"), "13055550188");
  for (const none of [null, undefined, "", "12", "+1 305", "abc"]) assert.equal(waMeDigits(none), null, String(none));
});
```

Create `tooling/scripts/tests/connections/connection-notes.test.mjs`:

```js
/**
 * The notes a Connections row carries beside its sentence (contracts setup/connections.ts, ConnectionRow.notes): what
 * Meta will ask and what WhatsApp costs, said before its sign-up window opens, on the WhatsApp row that offers Connect and nowhere
 * else; a sign-up that was started on the page and did not come back (a reload takes the window's listener with it), said while the
 * mark it left is under an hour old; and the one-time codes sent to the workspace's own line on the Texting row
 * (lines/line-codes.ts), newest first, each said with who sent it and how long ago, and what happens to a code sent to this
 * line, said once under them. A note is its words and, where there is somewhere to go, one link after them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { connectionRows, toChannelVM } from "@chanlytics/contracts";

const NOW = Date.parse("2026-10-06T15:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const ago = (ms) => new Date(NOW - ms).toISOString();

const base = () => ({
  channels: [],
  whatsapp: { ready: true, reason: null },
  lines: { rows: [], ready: false },
  lineRequestedAt: null,
  google: null,
  calendar: null,
});
const own = (over = {}) => ({
  id: "l1",
  e164: "+16465550100",
  kind: "chanlytics",
  provider: "twilio",
  area_code: 646,
  voice_state: "answering",
  sms_state: "active",
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: "none",
  step: null,
  last_error: null,
  state_since: ago(3 * 24 * 60 * MIN),
  created_at: ago(3 * 24 * 60 * MIN),
  ...over,
});
const by = (rows) => Object.fromEntries(rows.map((r) => [r.kind, r]));
const rowsOf = (inputs) => by(connectionRows({ ...base(), ...inputs }, NOW));

/** What WhatsApp costs: who bills it, what is free, what is charged, and Meta's own page for the prices (no rate is written here). */
const COST = [
  { text: "WhatsApp is billed by Meta, straight to the card on your WhatsApp account — not on your Chanlytics bill." },
  { text: "Free: replies to a customer within 24 hours of their last message — the receptionist's and yours." },
  { text: "Charged by Meta for each one delivered: reminders and notices sent after those 24 hours, and every campaign or offer." },
  {
    text: "Prices depend on the customer's country.",
    link: { label: "Meta's current prices", href: "https://business.whatsapp.com/products/platform-pricing#rates" },
  },
];
/** The notes the Connect row says before Meta's window opens: what it asks, in the order it asks, what it costs, and the one thing to do while it is open. */
const PREFLIGHT = [
  { text: "Meta asks you to sign in with Facebook and choose or create your business." },
  {
    text: "Meta texts a code to the number. On a Chanlytics number it shows on the Texting row here, so choose Text message, not Phone call (a call would be answered by the receptionist). Without a Chanlytics line: have the phone at hand.",
  },
  ...COST,
  {
    text: "Add a payment method when Meta asks for one: without it, replies still go out, and the messages your business starts, like reminders and campaigns, are not delivered.",
  },
  { text: "A new business on Meta can start conversations with 250 people a day until it is verified with Meta; replies to customers who write first are not limited." },
  { text: "Keep this page open until Meta's window closes." },
];
/** What the row says of a sign-up that was started here and did not come back. */
const LEFT_OPEN = {
  text: "A WhatsApp sign-up was started here and did not come back to Chanlytics — if you finished it in Meta's window, press Connect WhatsApp again and choose the WhatsApp account Meta already made.",
};

test("the WhatsApp row that offers Connect says what Meta will ask and what WhatsApp costs, in the order the owner meets them, and to keep the page open until the window closes; the limit it names is the one the product knows", () => {
  const r = rowsOf({}).whatsapp;
  assert.equal(r.verb.to, "verb:whatsapp-connect");
  assert.deepEqual(r.notes, PREFLIGHT);
  assert.deepEqual(r.notes.filter((n) => n.link).map((n) => n.link.href), [COST[3].link.href], "one link: Meta's rates");
});

test("a sign-up started on the page that did not come back is named first, while the mark it left is under an hour old and the workspace has no WhatsApp number", () => {
  const notes = (signupLeftOpenAt) => rowsOf({ signupLeftOpenAt }).whatsapp.notes;
  assert.deepEqual(notes(ago(5 * MIN)), [LEFT_OPEN, ...PREFLIGHT], "five minutes ago: the page was reloaded under Meta's window");
  assert.deepEqual(notes(ago(HOUR - 1)), [LEFT_OPEN, ...PREFLIGHT], "a millisecond short of an hour is still under it");
  for (const stale of [ago(HOUR), ago(2 * HOUR), ago(-5_000), "last tuesday", "", null, undefined])
    assert.deepEqual(notes(stale), PREFLIGHT, `${stale}: not a sign-up anyone is waiting on`);
  // The note says to press Connect WhatsApp again, so it is said only where that button is: not while the door is being asked,
  // not where this deployment cannot connect a number, and not once a number is connected.
  const mark = ago(5 * MIN);
  assert.deepEqual(rowsOf({ signupLeftOpenAt: mark, whatsapp: undefined }).whatsapp.notes, []);
  assert.deepEqual(rowsOf({ signupLeftOpenAt: mark, whatsapp: { ready: false, reason: "no_config_id" } }).whatsapp.notes, []);
  const connected = toChannelVM(
    {
      id: "ch-wa",
      kind: "whatsapp",
      number_e164: "+13055550188",
      status: "active",
      created_at: ago(30 * 24 * HOUR),
      last_inbound_at: ago(2 * MIN),
    },
    new Date(NOW),
  );
  assert.deepEqual(rowsOf({ signupLeftOpenAt: mark, channels: [connected] }).whatsapp.notes, COST, "a connected row says what it costs, and nothing of the sign-up");
});

test("a WhatsApp row that does not offer Connect says none of the sign-up: still asking, not set up here, or a number already connected", () => {
  assert.deepEqual(rowsOf({ whatsapp: undefined }).whatsapp.notes, []);
  assert.deepEqual(rowsOf({ whatsapp: null }).whatsapp.notes, []);
  assert.deepEqual(rowsOf({ whatsapp: { ready: false, reason: "no_config_id" } }).whatsapp.notes, []);
  const connected = toChannelVM(
    {
      id: "ch-wa",
      kind: "whatsapp",
      number_e164: "+13055550188",
      status: "active",
      created_at: ago(30 * 24 * 60 * MIN),
      last_inbound_at: ago(2 * MIN),
    },
    new Date(NOW),
  );
  // (What a connected number says of what Meta holds, and of how to try it from a phone: whatsapp-standing.test.mjs.)
  assert.deepEqual(rowsOf({ channels: [connected] }).whatsapp.notes, COST, "nothing read yet from Meta: what WhatsApp costs, and no more");
});

test("every other row has no notes", () => {
  const rows = connectionRows({ ...base(), lines: { rows: [own()], ready: true } }, NOW);
  for (const r of rows.filter((x) => x.kind !== "whatsapp")) assert.deepEqual(r.notes, [], r.kind);
});

test("the Texting row of a workspace's own line carries each code sent to it, newest first, with who sent it and when, and says once that such a code is never answered", () => {
  const codes = [
    { code: "482913", from: null, at: ago(20_000) },
    { code: "788-963", from: "WhatsApp", at: ago(2 * MIN) },
    { code: "123456", from: "Google", at: ago(9 * MIN) },
  ];
  const r = rowsOf({ lines: { rows: [own()], ready: true }, codes }).sms;
  assert.deepEqual(
    r.notes.map((n) => n.text),
    [
      "A code: 482913 · just now",
      "Code from WhatsApp: 788-963 · 2m ago",
      "Code from Google: 123456 · 9m ago",
      "Codes sent to this line are never answered and never become people.",
    ],
  );
  assert.deepEqual(r.notes.filter((n) => n.link), [], "no link under a code");
  assert.equal(r.state, "connected", "the row's own state is untouched");
});

test("no code, no note; no line of our own, no note; a code with no time is not said", () => {
  assert.deepEqual(rowsOf({ lines: { rows: [own()], ready: true } }).sms.notes, []);
  assert.deepEqual(rowsOf({ lines: { rows: [own()], ready: true }, codes: [] }).sms.notes, []);
  const code = { code: "788-963", from: "WhatsApp", at: ago(MIN) };
  assert.deepEqual(rowsOf({ lines: { rows: [], ready: false }, codes: [code] }).sms.notes, [], "no line to have received it");
  assert.deepEqual(
    rowsOf({ lines: { rows: [own({ provider: "carrier", kind: "forwarded" })], ready: true }, codes: [code] }).sms.notes,
    [],
    "a line the business kept at its carrier has no texts of ours",
  );
  assert.deepEqual(
    rowsOf({ lines: { rows: [own()], ready: true }, codes: [{ code: "788-963", from: "WhatsApp", at: "last tuesday" }] }).sms.notes,
    [],
  );
});
```

Append to `tooling/scripts/tests/connections/channels-vm.test.mjs` (`swap`):

```swap
##FILE tooling/scripts/tests/connections/channels-vm.test.mjs
##FROM
  assert.deepEqual(
    [said.quality, said.qualityEvent, said.messagingLimit],
    ["RED", "FLAGGED", "TIER_250"],
    "what Meta said rides the view model",
  );
});
##TO
  assert.deepEqual(
    [said.quality, said.qualityEvent, said.messagingLimit],
    ["RED", "FLAGGED", "TIER_250"],
    "what Meta said rides the view model",
  );
});

test("what Meta holds about the number, and when it was read, ride the view model; where nothing was read there is nothing", () => {
  const standing = {
    can_send: "LIMITED",
    problems: [],
    notes: ["Your display name has not been approved yet."],
    name: "Harbor Moving",
    name_status: "PENDING_REVIEW",
    verification: "not_verified",
    limit: "TIER_250",
    has_payment_method: true,
    owner_business_id: "410540000000001",
    waba_id: "205540000000001",
  };
  const held = toChannelVM(wa({ standing, standing_read_at: "2026-09-04T15:50:00Z" }), NOW);
  assert.deepEqual([held.standing, held.standingReadAt], [standing, "2026-09-04T15:50:00Z"]);
  const none = toChannelVM(wa(), NOW);
  assert.deepEqual([none.standing, none.standingReadAt], [null, null]);
  assert.deepEqual([toChannelVM(wa({ standing: null }), NOW).standing, toChannelVM(wa({ standing: null }), NOW).standingReadAt], [null, null]);
});
##END
```

- [ ] **Step 2: Run them to verify they fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/connections/whatsapp-standing.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/connections/connection-notes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/connections/channels-vm.test.mjs
```
Expected: the first fails at load ("does not provide an export named 'standingAlertWords'" from `@chanlytics/contracts`); the second fails all six of its tests (`r.notes` is `undefined`, the rows have none yet, and the test that maps over them throws `Cannot read properties of undefined (reading 'map')`); the third fails its new test (`held.standing` is `undefined`) and passes the five tests above it.

- [ ] **Step 3: The two modules**

Create `packages/contracts/src/lines/number-standing.ts`:

```ts
/**
 * What Meta holds about a connected WhatsApp number, and the words for it.
 *
 * Meta answers, for a phone number and for the account behind it (apps/edge/lib/whatsapp/meta-graph.ts `numberStanding`),
 * whether the number may send at all (`can_send_message`: AVAILABLE, LIMITED or BLOCKED), what stands in the way (each
 * entity's errors, with Meta's own fix), how the display name's review fares, whether the business is verified and how many
 * people it may start a conversation with in a day. The edge keeps that answer whole on the channel's config
 * (`channel_keep_standing`, 00330) and says a change of `can_send` as a `channel.standing` event. This is the one place it
 * is read back and put into words, for the Connections row, the owner's alert and the Activity log: what Meta said, and
 * nothing it did not. A word of Meta's that is not one of the three is kept as Meta said it and never turned into one that is.
 * The account's payment method (is one on file), the business that owns the account and the account itself ride with the standing,
 * so the row can say that none is on file and where to add one (whatsapp-cost.ts).
 */
import { dailyLimit } from "../broadcasts/broadcast-number";
import { formatPhoneDisplay } from "../shared/phone";
import { MIN_MS } from "../shared/time";
import type { ConnectionNote } from "./connection-note";
import { addPaymentMethodLink } from "./whatsapp-cost";

/**
 * One thing Meta says stands in the way, from an entity's errors: whose it is, Meta's code, what it said, and how to fix it.
 * A type alias and not an interface: an interface has no index signature, and the edge hands a standing whole to the
 * database as `Json`, which a type alias of plain fields is.
 */
export type StandingProblem = {
  entity: string;
  code: number | null;
  said: string;
  fix: string | null;
};

/** What Meta holds about a number, as the edge keeps it on the channel's config (a type alias, as the problem is). */
export type NumberStanding = {
  /** `can_send_message` of the number: AVAILABLE, LIMITED or BLOCKED, or a word of Meta's that is none of these. */
  can_send: string;
  problems: StandingProblem[];
  /** The `additional_info` Meta gave, each as it said it. */
  notes: string[];
  /** The display name, and where its review stands: APPROVED, AVAILABLE_WITHOUT_REVIEW, DECLINED, EXPIRED, PENDING_REVIEW or NONE. */
  name: string | null;
  name_status: string | null;
  /** The business's verification (`verified`, `not_verified`, `pending`, ...) and its tier (TIER_250, TIER_UNLIMITED, UNTIERED, ...). */
  verification: string | null;
  limit: string | null;
  /**
   * Whether the WhatsApp Business Account has a payment method on file (its `primary_funding_id` is there): false where Meta
   * answered without one, null where the account's funding could not be read (never guessed).
   */
  has_payment_method: boolean | null;
  /** The Meta business that owns the account (`owner_business_info.id`), where Meta's billing page opens; null where it could not be read. */
  owner_business_id: string | null;
  /** The WhatsApp Business Account the number belongs to; null where none is on file. */
  waba_id: string | null;
};

/**
 * How many people a business new to Meta may start a conversation with in a day, until it is verified (Meta, messaging
 * limits: a new business portfolio starts at 250, shared by every number in it). Replies to a customer who wrote first are
 * not counted. Said before Connect, and after it when Meta has not said a tier of its own.
 */
export const NEW_BUSINESS_LIMIT = 250;

/** How long a page that opens trusts a standing that is not AVAILABLE, before it asks Meta again. */
const STANDING_STALE_MS = 10 * MIN_MS;

const heldObject = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : []);

/** Text that says something: trimmed, and null where it is not a string or is blank. */
const textOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * The standing a channel's config holds, read back as held and no looser: an object with Meta's word for `can_send`,
 * else nothing. A problem with nothing said, or a note that is not text, is dropped; nothing is mended into a sentence.
 */
export function standingFromConfig(value: unknown): NumberStanding | null {
  const s = heldObject(value);
  const canSend = textOrNull(s?.can_send);
  if (!s || !canSend) return null;
  const problems = listOf(s.problems).flatMap((p): StandingProblem[] => {
    const r = heldObject(p);
    const said = textOrNull(r?.said);
    if (!r || !said) return [];
    return [
      { entity: textOrNull(r.entity) ?? "UNKNOWN", code: typeof r.code === "number" ? r.code : null, said, fix: textOrNull(r.fix) },
    ];
  });
  const notes = listOf(s.notes).flatMap((n): string[] => {
    const text = textOrNull(n);
    return text ? [text] : [];
  });
  return {
    can_send: canSend,
    problems,
    notes,
    name: textOrNull(s.name),
    name_status: textOrNull(s.name_status),
    verification: textOrNull(s.verification),
    limit: textOrNull(s.limit),
    has_payment_method: typeof s.has_payment_method === "boolean" ? s.has_payment_method : null,
    owner_business_id: textOrNull(s.owner_business_id),
    waba_id: textOrNull(s.waba_id),
  };
}

/**
 * Whether a page that has just opened should ask Meta again: nothing was kept, or what was kept is not AVAILABLE and was read
 * more than ten minutes ago (so a payment method added a minute ago shows as fixed without waiting for the six-hourly
 * read). An AVAILABLE number is the clock's to renew.
 */
export function standingNeedsRead(
  n: { standing: NumberStanding | null; standingReadAt: string | null },
  nowMs: number,
): boolean {
  if (!n.standing) return true;
  if (n.standing.can_send === "AVAILABLE") return false;
  const readAt = n.standingReadAt ? Date.parse(n.standingReadAt) : Number.NaN;
  return Number.isNaN(readAt) || nowMs - readAt > STANDING_STALE_MS;
}

/** Meta's text as a sentence: trimmed, and ended with a stop where it has none. */
const sentence = (text: string): string => {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/** A problem as a note: what Meta said, then how it said to fix it. */
const problemWords = (p: StandingProblem): string =>
  p.fix ? `${sentence(p.said)} ${sentence(p.fix)}` : sentence(p.said);

/** The sentence of a number Meta will not let send, where it named no problem. */
const BLOCKED_SENTENCE = "Meta says WhatsApp cannot send from this number right now.";

/**
 * What a payment method is for. Meta delivers the replies to customers who write first without one, and does not bill them, and does
 * not deliver the messages the business starts, like reminders and campaigns (6 October: a reply was delivered within eight seconds
 * on an account with none). Meta's own problem, "a payment method is required to send messages", says neither, so Chanlytics says it.
 */
const NO_PAYMENT_METHOD =
  "No payment method on your WhatsApp account yet: replies still go out, but reminders and campaigns will not be delivered.";
const PAYMENT_NOTE =
  "Without a payment method, Meta still delivers replies to customers who write first; it does not deliver the messages your business starts, like reminders and campaigns.";
const PAYMENT_PROBLEM = /\bpayment\b/i;

/**
 * The note for the account's payment method. Where the account says none is on file, that is said plainly, with the way to add one: Meta's
 * billing page for this business and this account, or Meta Business Suite where either is not known. Where it could not be read, a
 * problem of Meta's that names a payment gets the note that says what a payment method is for, once; where one is on file, nothing.
 */
function paymentNotes(s: NumberStanding): ConnectionNote[] {
  if (s.has_payment_method === false) {
    const href = addPaymentMethodLink(s.owner_business_id, s.waba_id);
    return href
      ? [{ text: NO_PAYMENT_METHOD, link: { label: "Add one in Meta", href } }]
      : [{ text: `${NO_PAYMENT_METHOD} Add one in Meta Business Suite › Billing.` }];
  }
  const named = s.has_payment_method === null && s.problems.some((p) => PAYMENT_PROBLEM.test(p.said));
  return named ? [{ text: PAYMENT_NOTE }] : [];
}

/** The WhatsApp row's sentence for a number Meta will not let send: Meta's first problem, in its words. */
export function standingSentence(s: NumberStanding): string {
  const first = s.problems.at(0);
  return first ? `Meta: ${sentence(first.said)}` : BLOCKED_SENTENCE;
}

/** What the display name's review says, where it says something an owner can act on. */
function nameNote(s: NumberStanding): string | null {
  const name = s.name ? `the display name “${s.name}”` : "your display name";
  switch (s.name_status) {
    case "PENDING_REVIEW":
      return `Meta is reviewing ${name}; until then customers see the number.`;
    case "DECLINED":
      return `Meta declined ${name} — change it in WhatsApp Manager.`;
    case "EXPIRED":
      return `The request for ${name} expired — submit it again in WhatsApp Manager.`;
    default:
      return null;
  }
}

/** How many people a day a tier is, in words: "up to 1,000 people a day". */
const peopleADay = (n: number): string => `up to ${n.toLocaleString("en-US")} people a day`;

/**
 * Where the business stands with Meta and what it may start: verified, at the tier Meta gave; or not verified, at the tier
 * Meta gave or at the start a new business has. Replies to customers who write first are never limited, and the note says so.
 */
function verificationNote(s: NumberStanding): string | null {
  if (s.verification === null) return null;
  const tier = dailyLimit(s.limit);
  if (s.verification.toLowerCase() === "verified") {
    if (tier === Number.POSITIVE_INFINITY) return "Your business is verified with Meta and has no daily limit on starting conversations.";
    return tier === null
      ? "Your business is verified with Meta."
      : `Your business is verified with Meta: you can start conversations with ${peopleADay(tier)}.`;
  }
  const cap = tier === null || tier === Number.POSITIVE_INFINITY ? NEW_BUSINESS_LIMIT : tier;
  return `Your business isn't verified with Meta: you can start conversations with ${peopleADay(cap)}. Replies to customers who write first are not limited.`;
}

/**
 * The notes under the WhatsApp row for a number with a standing read: Meta's problems (a blocked number's first is the
 * row's sentence, so its note is the fix and the rest), the note for the account's payment method, what Meta added, the display
 * name's review and the business's verification. Nothing for a number nothing was read for.
 */
export function standingNotes(s: NumberStanding | null): ConnectionNote[] {
  if (!s) return [];
  const out: ConnectionNote[] = [];
  const first = s.problems.at(0);
  if (s.can_send === "BLOCKED") {
    if (first?.fix) out.push({ text: sentence(first.fix) });
    for (const p of s.problems.slice(1)) out.push({ text: problemWords(p) });
  } else {
    for (const p of s.problems) out.push({ text: problemWords(p) });
  }
  out.push(...paymentNotes(s));
  for (const n of s.notes) out.push({ text: sentence(n) });
  const name = nameNote(s);
  if (name) out.push({ text: name });
  const verification = verificationNote(s);
  if (verification) out.push({ text: verification });
  return out.filter((n, at) => out.findIndex((m) => m.text === n.text) === at);
}

/**
 * The owner's alert for a number that has turned BLOCKED, as the bell and the owner's mail say it: which number, Meta's
 * first problem and Meta's fix. A number Meta blocked without a reason says so and sends the owner to Connections.
 */
export function standingAlertWords(number: string | null, s: NumberStanding): { subject: string; body: string } {
  const which = formatPhoneDisplay(number) ?? "your number";
  const first = s.problems.at(0);
  const body = first
    ? `WhatsApp can't send from ${which}: ${problemWords(first)}`
    : `WhatsApp can't send from ${which}. Meta did not say why; open Connections to read what it holds.`;
  return { subject: "WhatsApp can't send from your number", body };
}

const CAN_SEND_WORDS: Readonly<Record<string, string>> = { AVAILABLE: "can send", LIMITED: "limited", BLOCKED: "blocked" };

const sendWords = (w: unknown): string | null => {
  if (typeof w !== "string" || !w) return null;
  return Object.hasOwn(CAN_SEND_WORDS, w) ? (CAN_SEND_WORDS[w] ?? null) : w.toLowerCase().replace(/_/g, " ");
};

/** The Activity log's words for a `channel.standing` event { from?, to }: "from can send to blocked", or the first word read. */
export function standingChangeWords(p: Record<string, unknown>): string | null {
  const to = sendWords(p.to);
  const from = sendWords(p.from);
  if (!to) return null;
  return from ? `from ${from} to ${to}` : to;
}
```

Create `packages/contracts/src/lines/line-codes.ts`:

```ts
/**
 * The one-time codes texted to a workspace's own line, as the Connections page holds them.
 *
 * Meta texts a code to the number an owner connects to WhatsApp; when that number is the workspace's own Chanlytics line the
 * text reaches the line like a customer's, and nobody could see it. The receptionist never answers such a code and no
 * person or message is made of it (apps/edge/lib/sms/inbound-text.ts); the owner reads it from the provider's own record,
 * on demand (`GET /api/v1/lines/codes`), and it is never stored here. This is how the page says it.
 */
import { agoWords, MIN_MS } from "../shared/time";
import type { ConnectionNote } from "./connection-note";

/** A code that was sent to the line lately: the code as the sender wrote it, who sent it (a name it read, else null), and when. */
export interface LineCodeDto {
  code: string;
  from: string | null;
  /** When the provider says it was sent: an ISO instant. */
  at: string;
}

/** How far back a code is still one an owner is waiting for. */
export const LINE_CODES_WITHIN_MS = 15 * MIN_MS;
/** The most codes the page is told of: the newest. */
export const LINE_CODES_MAX = 3;
/** How often the page asks while Meta's sign-up window is open: a code is wanted within seconds of being sent. */
export const LINE_CODES_EVERY_MS = 3_000;

const FOOT = "Codes sent to this line are never answered and never become people.";

/**
 * The Texting row's notes for the codes sent to the line, newest first, then the one line that says what becomes of them. A
 * code with no time is not said (the time is what tells an owner it is the one they are waiting for). None, none.
 */
export function codeNotes(codes: readonly LineCodeDto[], nowMs: number): ConnectionNote[] {
  const said = codes.filter((c) => !Number.isNaN(Date.parse(c.at)));
  if (said.length === 0) return [];
  return [
    ...said.map((c) => ({
      text: `${c.from ? `Code from ${c.from}` : "A code"}: ${c.code} · ${agoWords(Date.parse(c.at), nowMs)}`,
    })),
    { text: FOOT },
  ];
}
```

Create `packages/contracts/src/lines/connection-note.ts`:

```ts
/**
 * One line a Connections row says beside its sentence: what Meta will ask before Connect, what WhatsApp costs, what Meta holds
 * about a connected number, the codes sent to the line. Plain words and, where there is somewhere to go, one link after them
 * (Meta's prices, Meta's page for adding a payment method): an external address, which the page opens in a new tab.
 */
export interface ConnectionNote {
  text: string;
  link?: { label: string; href: string };
}
```

Create `packages/contracts/src/lines/whatsapp-cost.ts`:

```ts
/**
 * What WhatsApp costs and who bills it, in the owner's words: one place, said under the WhatsApp row before it is connected and
 * after, and in one line on Settings > Billing, so nobody learns from a statement that Meta bills its own messages to the card on
 * the WhatsApp account and not on the Chanlytics bill.
 *
 * The facts are Meta's (its pricing documentation, 6 October 2026): per-message pricing since 1 July 2025; an account is charged
 * only when a template message is delivered; free are every message that is not a template inside an open customer service window
 * (24 hours after the customer's last message), utility templates delivered inside an open window, and every message inside a
 * 72-hour free entry point window; charged are marketing templates, and utility and authentication templates outside a window; the
 * rate depends on the recipient's country calling code, the category and the month's volume. NO RATE IS WRITTEN HERE: a rate moves
 * when Meta's does, so the words link Meta's own page for them.
 */
import type { ConnectionNote } from "./connection-note";

/** Meta's page of current rates, by country and category. */
const RATES_URL = "https://business.whatsapp.com/products/platform-pricing#rates";

export const WHATSAPP_COST_WORDS = {
  /** What the explainer is called where a page links to it. */
  title: "What WhatsApp costs",
  billed: "WhatsApp is billed by Meta, straight to the card on your WhatsApp account — not on your Chanlytics bill.",
  free: "Free: replies to a customer within 24 hours of their last message — the receptionist's and yours.",
  charged:
    "Charged by Meta for each one delivered: reminders and notices sent after those 24 hours, and every campaign or offer.",
  prices: "Prices depend on the customer's country.",
  pricesLink: "Meta's current prices",
  /** The one line Settings > Billing says, with `title` as the link to the explainer on Connections. */
  billingLine:
    "WhatsApp messages your business starts are billed by Meta to the card on your WhatsApp account, not on this bill.",
} as const;

/** The explainer as a row's notes: four lines, the last with the link to Meta's rates. */
export function whatsappCostNotes(): ConnectionNote[] {
  const w = WHATSAPP_COST_WORDS;
  return [
    { text: w.billed },
    { text: w.free },
    { text: w.charged },
    { text: w.prices, link: { label: w.pricesLink, href: RATES_URL } },
  ];
}

/**
 * Meta's page for adding a payment method to a WhatsApp Business Account, opened on the business that owns the account and on the
 * account (a payment method is the business's own: Chanlytics cannot add one for it). Null where either id is not known or is not
 * digits, so the note points at Meta Business Suite instead of at a link that would open on nothing.
 */
export function addPaymentMethodLink(ownerBusinessId: string | null, wabaId: string | null): string | null {
  const ids = /^\d+$/;
  if (!ownerBusinessId || !wabaId || !ids.test(ownerBusinessId) || !ids.test(wabaId)) return null;
  return `https://business.facebook.com/billing_hub/accounts/details/?business_id=${ownerBusinessId}&asset_id=${wabaId}&wizard_name=ADD_PM&account_type=whatsapp-business-account`;
}
```

Meta's `TIER_2K` joins the tiers (`swap`):

```swap
##FILE packages/contracts/src/broadcasts/broadcast-number.ts
##FROM
  TIER_1K: 1000,
  TIER_10K: 10000,
##TO
  TIER_1K: 1000,
  TIER_2K: 2000,
  TIER_10K: 10000,
##END
```

The channel carries what Meta holds (`swap`):

```swap
##FILE packages/contracts/src/lines/channels.ts
##FROM
import { formatPhoneDisplay } from "../shared/phone";
##TO
import { formatPhoneDisplay } from "../shared/phone";
import type { NumberStanding } from "./number-standing";
##END
##FILE packages/contracts/src/lines/channels.ts
##FROM
  quality_event?: string | null;
  messaging_limit?: string | null;
  quality_at?: string | null;
}
##TO
  quality_event?: string | null;
  messaging_limit?: string | null;
  quality_at?: string | null;
  /** What Meta holds about the number (channel_keep_standing, 00330): whether it may send, what stands in the way, its
   *  display name's review, the business's verification and tier; and when that was read. Null until it has been. */
  standing?: NumberStanding | null;
  standing_read_at?: string | null;
}
##END
##FILE packages/contracts/src/lines/channels.ts
##FROM
  quality: string | null;
  qualityEvent: string | null;
  messagingLimit: string | null;
##TO
  quality: string | null;
  qualityEvent: string | null;
  messagingLimit: string | null;
  /** What Meta holds about the number, and when it was read (the row's config): null until it has been read. */
  standing: NumberStanding | null;
  standingReadAt: string | null;
##END
##FILE packages/contracts/src/lines/channels.ts
##FROM
    messagingLimit: dto.messaging_limit ?? null,
    created_at: dto.created_at,
##TO
    messagingLimit: dto.messaging_limit ?? null,
    standing: dto.standing ?? null,
    standingReadAt: dto.standing_read_at ?? null,
    created_at: dto.created_at,
##END
```

The rows carry notes (`swap`):

```swap
##FILE packages/contracts/src/setup/connections.ts
##FROM
import { channelFor, type ChannelVM } from "../lines/channels";
##TO
import { channelFor, type ChannelVM } from "../lines/channels";
import type { ConnectionNote } from "../lines/connection-note";
import { codeNotes, type LineCodeDto } from "../lines/line-codes";
import { NEW_BUSINESS_LIMIT, standingNotes, standingSentence } from "../lines/number-standing";
import { whatsappCostNotes } from "../lines/whatsapp-cost";
##END
##FILE packages/contracts/src/setup/connections.ts
##FROM
import { agoWords } from "../shared/time";
##TO
import { waMeDigits } from "../shared/enums";
import { agoWords, HOUR_MS } from "../shared/time";
##END
##FILE packages/contracts/src/setup/connections.ts
##FROM
  /** The page's own hook for the parts a row cannot say in one line: a choice of locations, a form. */
  body: "google_choose" | "business_record" | "email_setup" | null;
}
##TO
  /** The page's own hook for the parts a row cannot say in one line: a choice of locations, a form. */
  body: "google_choose" | "business_record" | "email_setup" | null;
  /**
   * What the row says beside its sentence, each its own short line, with a link after it where there is somewhere to go: what Meta
   * will ask and what WhatsApp costs before Connect, what Meta holds about a connected number, how to try it, and what it costs,
   * the codes sent to the line. Empty for a row with none, which is nearly every row.
   */
  notes: ConnectionNote[];
}
##END
##FILE packages/contracts/src/setup/connections.ts
##FROM
  /** Email as Setup is told it (mailbox.ts); null or absent while Setup has not been read, or on a deployment without it. */
  email?: EmailSetupDto | null;
}
##TO
  /** Email as Setup is told it (mailbox.ts); null or absent while Setup has not been read, or on a deployment without it. */
  email?: EmailSetupDto | null;
  /** The one-time codes sent to the workspace's own line lately (`GET lines/codes`); absent where none were read. */
  codes?: LineCodeDto[];
  /**
   * When a WhatsApp sign-up was started on this page and never came back to it (the instant the page's mark in
   * sessionStorage holds: Meta's window outlives a reload, and a reload takes with it the listener the window answers to);
   * null or absent where there is none. Said by the WhatsApp row for an hour, while the workspace has no number.
   */
  signupLeftOpenAt?: string | null;
}
##END
##FILE packages/contracts/src/setup/connections.ts
##FROM
type Draft = Omit<ConnectionRow, "group" | "tone" | "body"> & { body?: ConnectionRow["body"] };

function row(d: Draft): ConnectionRow {
  return { ...d, group: GROUP[d.state], tone: TONE[d.state], body: d.body ?? null };
}
##TO
type Draft = Omit<ConnectionRow, "group" | "tone" | "body" | "notes"> & {
  body?: ConnectionRow["body"];
  notes?: ConnectionNote[];
};

function row(d: Draft): ConnectionRow {
  return { ...d, group: GROUP[d.state], tone: TONE[d.state], body: d.body ?? null, notes: d.notes ?? [] };
}
##END
##FILE packages/contracts/src/setup/connections.ts
##FROM
/** WhatsApp: the channel row when there is one; Meta's door when there is not. */
##TO
/**
 * What Meta's sign-up window asks of the owner, said before it opens, in the order the owner meets it: the sign-in, the code texted
 * to the number (the one thing the owner cannot see from here unless the number is Chanlytics's own: the Texting row shows it),
 * what WhatsApp costs and who bills it (Chanlytics is a Tech Provider: Meta bills the business, to its own card, for the messages
 * it starts), the payment method Meta asks for at the end (replies to a customer who wrote first are delivered without one, and
 * are not billed; what is not delivered is the messages the business starts), and the limit a new business starts at, and
 * the one thing to do while the window is open.
 */
const WHATSAPP_CONNECT_NOTES: readonly ConnectionNote[] = [
  { text: "Meta asks you to sign in with Facebook and choose or create your business." },
  {
    text: "Meta texts a code to the number. On a Chanlytics number it shows on the Texting row here, so choose Text message, not Phone call (a call would be answered by the receptionist). Without a Chanlytics line: have the phone at hand.",
  },
  ...whatsappCostNotes(),
  {
    text: "Add a payment method when Meta asks for one: without it, replies still go out, and the messages your business starts, like reminders and campaigns, are not delivered.",
  },
  {
    text: `A new business on Meta can start conversations with ${NEW_BUSINESS_LIMIT} people a day until it is verified with Meta; replies to customers who write first are not limited.`,
  },
  // The one thing to do while it is open: a reload takes with it the listener Meta's window answers to, and the one-time code
  // the window hands back has nowhere to go (6 October, 12:11 to 12:48 UTC: a sign-up Meta finished and Chanlytics never heard).
  { text: "Keep this page open until Meta's window closes." },
];

/** How long the mark a sign-up leaves is taken for a sign-up somebody is still finishing at Meta's. */
const SIGNUP_LEFT_OPEN_WITHIN_MS = HOUR_MS;

/**
 * What the Connect row says of a sign-up that was started on this page and did not come back to it. A reload cannot get the
 * code back (it rides the SDK's own callback), so the way on is to press Connect again and choose the account Meta already made.
 */
const SIGNUP_LEFT_OPEN_NOTE =
  "A WhatsApp sign-up was started here and did not come back to Chanlytics — if you finished it in Meta's window, press Connect WhatsApp again and choose the WhatsApp account Meta already made.";

/** The left-open note, while the mark is under an hour old (a mark in the future, or one that is no time, is no sign-up anyone is waiting on). */
function signupLeftOpenNotes(startedAt: string | null | undefined, nowMs: number): ConnectionNote[] {
  const age = startedAt ? nowMs - Date.parse(startedAt) : Number.NaN;
  return age >= 0 && age < SIGNUP_LEFT_OPEN_WITHIN_MS ? [{ text: SIGNUP_LEFT_OPEN_NOTE }] : [];
}

/**
 * What a connected number says until a customer has written to it: how to try it from a phone. WhatsApp keeps its own record of which
 * numbers are on WhatsApp, and a number registered a moment ago can read "isn't on WhatsApp" for an hour (6 October); opening its
 * wa.me link forces a fresh lookup, and the chat opens. The link's digits are waMeDigits's, the one place that says them.
 */
function tryItNotes(wa: ChannelVM): ConnectionNote[] {
  const digits = waMeDigits(wa.number);
  if (!digits || wa.lastInboundMs !== null) return [];
  return [
    {
      text: `Try it from your phone: wa.me/${digits} — if WhatsApp says the number isn't on WhatsApp yet, open this link instead of searching your contacts.`,
    },
  ];
}

/** WhatsApp: the channel row when there is one; Meta's door when there is not. */
##END
##FILE packages/contracts/src/setup/connections.ts
##FROM
    const flagged = wa.on && h.tone === "danger";
    const health = wa.on && h.tone !== "unknown" ? ` · ${h.label}` : "";
    return {
      ...base,
      detail: wa.number,
      state: !wa.on ? "off" : flagged ? "attention" : "connected",
      stateWords: !wa.on ? "Off" : flagged ? "Needs attention" : "On",
      sentence: `${wa.healthLabel}${health}`,
      verb: { label: "Library", to: "messages", who: "operator" },
    };
##TO
    const flagged = wa.on && h.tone === "danger";
    const health = wa.on && h.tone !== "unknown" ? ` · ${h.label}` : "";
    // What Meta holds about the number (channel.standing, 00330) outranks what its rating implies: a number Meta will not
    // let send is joined and not working whatever its quality was, and Meta's own words say why. A word of Meta's that is
    // not BLOCKED is never taken for it; a switched-off channel says nothing of Meta's.
    const standing = wa.on ? wa.standing : null;
    const blocked = standing?.can_send === "BLOCKED";
    const attention = flagged || blocked;
    return {
      ...base,
      detail: wa.number,
      state: !wa.on ? "off" : attention ? "attention" : "connected",
      stateWords: !wa.on ? "Off" : attention ? "Needs attention" : "On",
      sentence: standing && blocked ? standingSentence(standing) : `${wa.healthLabel}${health}`,
      verb: { label: "Library", to: "messages", who: "operator" },
      // How to try it from a phone, first, on a connected row nobody has written to yet; then what Meta holds; and last what
      // WhatsApp costs, on every row that is on.
      notes: [...(wa.on && !attention ? tryItNotes(wa) : []), ...standingNotes(standing), ...(wa.on ? whatsappCostNotes() : [])],
    };
##END
##FILE packages/contracts/src/setup/connections.ts
##FROM
function whatsappRow(i: ConnectionInputs, { wa }: ConnectionFacts): Draft {
##TO
function whatsappRow(i: ConnectionInputs, { wa, nowMs }: ConnectionFacts): Draft {
##END
##FILE packages/contracts/src/setup/connections.ts
##FROM
      verb: { label: "Connect WhatsApp", to: "verb:whatsapp-connect", who: "owner" },
    };
##TO
      verb: { label: "Connect WhatsApp", to: "verb:whatsapp-connect", who: "owner" },
      notes: [...signupLeftOpenNotes(i.signupLeftOpenAt, nowMs), ...WHATSAPP_CONNECT_NOTES],
    };
##END
##FILE packages/contracts/src/setup/connections.ts
##FROM
/** Texting: where the workspace's own line stands with the carriers. */
function smsRow(_i: ConnectionInputs, { own, nowMs }: ConnectionFacts): Draft {
  return smsStateRow(own, nowMs);
}
##TO
/**
 * Texting: where the workspace's own line stands with the carriers, and the one-time codes sent to it lately (Meta's, when
 * the owner connects that number to WhatsApp), which no one else will ever see: a line the business kept at its carrier
 * has no texts of ours, so it has no notes.
 */
function smsRow(i: ConnectionInputs, { own, nowMs }: ConnectionFacts): Draft {
  return { ...smsStateRow(own, nowMs), notes: own ? codeNotes(i.codes ?? [], nowMs) : [] };
}
##END
```

The one place that says what a wa.me link takes of a number moves out of `optInLink`, which says the same thing for the opt-in link, so the row's note and the link share it (`swap`; `optInLink` answers what it answered, and the broadcasts and consent tests that pin it hold that):

```swap
##FILE packages/contracts/src/shared/enums.ts
##FROM
/** WhatsApp opened on the workspace's number with the phrase ready to send; null without a usable number. */
export function optInLink(
  numberE164: string | null | undefined,
  phrase: string = OFFERS_OPT_IN_PHRASES.en,
): string | null {
  const digits = String(numberE164 ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(phrase)}`;
}
##TO
/**
 * What a wa.me link takes of a number: its digits, with no plus, spaces or brackets, from the number as E.164 or as it is shown, or
 * null where there are too few to be one. The one place that says it: the opt-in link below and the Connections row's "try it" note.
 */
export function waMeDigits(number: string | null | undefined): string | null {
  const digits = String(number ?? "").replace(/\D/g, "");
  return digits.length < 8 ? null : digits;
}

/** WhatsApp opened on the workspace's number with the phrase ready to send; null without a usable number. */
export function optInLink(
  numberE164: string | null | undefined,
  phrase: string = OFFERS_OPT_IN_PHRASES.en,
): string | null {
  const digits = waMeDigits(numberE164);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(phrase)}`;
}
##END
##FILE packages/contracts/src/shared/index.ts
##FROM
  optInLink,
##TO
  optInLink,
  waMeDigits,
##END
```

The barrel names what the apps import (`swap`):

```swap
##FILE packages/contracts/src/lines/index.ts
##FROM
export type { ChannelDto, ChannelPickable, ChannelHealth, ChannelVM } from "./channels";
##TO
export type { ChannelDto, ChannelPickable, ChannelHealth, ChannelVM } from "./channels";
export { standingFromConfig, standingNeedsRead, standingAlertWords } from "./number-standing";
export type { NumberStanding } from "./number-standing";
export { LINE_CODES_WITHIN_MS, LINE_CODES_MAX, LINE_CODES_EVERY_MS } from "./line-codes";
export type { LineCodeDto } from "./line-codes";
export { WHATSAPP_COST_WORDS } from "./whatsapp-cost";
##END
```

- [ ] **Step 4: Regenerate the browser entry, build, run**

```bash
corepack pnpm exec prettier --write packages/contracts/src/lines/number-standing.ts packages/contracts/src/lines/line-codes.ts packages/contracts/src/lines/whatsapp-cost.ts packages/contracts/src/lines/connection-note.ts packages/contracts/src/setup/connections.ts packages/contracts/src/lines/channels.ts packages/contracts/src/lines/index.ts packages/contracts/src/shared/enums.ts packages/contracts/src/shared/index.ts tooling/scripts/tests/connections/whatsapp-standing.test.mjs tooling/scripts/tests/connections/connection-notes.test.mjs tooling/scripts/tests/connections/channels-vm.test.mjs
node tooling/scripts/gen/contracts-browser-entry.mjs
node -e 'const fs=require("fs");const p="packages/db/src/database.types.ts";fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))'
corepack pnpm --filter "./packages/*" build
for f in $(git ls-files packages/contracts/dist packages/db/dist packages/jobs/dist packages/channels/dist packages/core/dist); do git diff -w --ignore-cr-at-eol --quiet -- "$f" && git checkout -- "$f"; done
git status --short packages
node tooling/scripts/checks/test.mjs tooling/scripts/tests/connections/whatsapp-standing.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/connections/connection-notes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/connections/channels-vm.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/connections/connections.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs
corepack pnpm -r typecheck
```
Expected: the browser entry gains `standingFromConfig`, `standingNeedsRead`, `standingAlertWords` and `LINE_CODES_WITHIN_MS`, `LINE_CODES_MAX`, `LINE_CODES_EVERY_MS` and `WHATSAPP_COST_WORDS` in its `./lines/...` lines, and `waMeDigits` in its `./shared/enums` line (`git diff --stat packages/contracts/src/browser.generated.ts` shows a handful of lines); the build changes `packages/contracts/dist` only (the other four packages' dist are restored by the loop); the four connections tests PASS, including every test that was in `connections.test.mjs` before (the rows are the rows they were: a new field the old tests never read); `browser-entry.test.mjs` PASSES; typecheck clean (`apps/dashboard` still compiles: no consumer builds a `ChannelVM` or a `ConnectionRow` by hand).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/lines/number-standing.ts packages/contracts/src/lines/line-codes.ts packages/contracts/src/lines/whatsapp-cost.ts packages/contracts/src/lines/connection-note.ts packages/contracts/src/lines/channels.ts packages/contracts/src/lines/index.ts packages/contracts/src/setup/connections.ts packages/contracts/src/broadcasts/broadcast-number.ts packages/contracts/src/shared/enums.ts packages/contracts/src/shared/index.ts packages/contracts/src/browser.generated.ts packages/*/dist tooling/scripts/tests/connections/whatsapp-standing.test.mjs tooling/scripts/tests/connections/connection-notes.test.mjs tooling/scripts/tests/connections/channels-vm.test.mjs
git commit -m "Connections rows carry notes: what Meta will ask and what WhatsApp costs before Connect, what Meta holds about the number, how to try it from a phone, and the codes sent to the line." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 2: One rule that says a text is a one-time code, and the codes a line was sent

**Why:** the receptionist texted Meta back twice on 6 October, because a code from Meta is a text to a line like any customer's and nothing read its words. A sender-based filter would not have caught either (two ordinary long numbers, one of them toll-free); the words must be read. `oneTimeCodeOf` is that reading, in `packages/channels/src/lines/sms.ts` beside the STOP words, the house's other classification of an inbound text: Task 4's door asks it, and Task 8's door asks it of the provider's own record. `lineCodesFrom` is the other half, pure: the texts a provider kept for a number, narrowed to the codes an owner is waiting for (the last fifteen minutes, the newest three, each with the time the provider says it was sent).

**The rule, and how each text a customer could write is excluded.** A text is a code when it is at most 320 characters, has no question mark, and **one** of four things holds: (1) "your <Name> code" with the code straight after it ("Your WhatsApp code: 788-963", "Your Apple ID Code is: 123456", "Your Chase one-time code is 482913"); (2) "<code> is your <Name> ... code" or "<code> is your verification/security/... code" ("G-123456 is your Google verification code.", "123 456 is your Instagram code."); (3) a leading `<#>`, which Android's SMS retriever asks every sender to put first; (4) "don't/do not/never share this/the/your/it" **and** a word that says what the code is for (verify, confirm, log in, sign in, security, one-time, authenticate, two-step), with exactly one code in the text. A code is four to eight digits, or six to eight digits split by one dash or space. A <Name> is one to three words that each hold a capital letter (WhatsApp, Apple ID, iCloud), none of them a thing a customer owns (door, gate, locker, booking, order, appointment and the like) or one of the kinds (verification, security, ...). Why those limits: **a false positive silences a customer** (their text is never answered and never becomes a person) and a false negative only leaves things as they were, so every condition above is a refusal first. The customer's texts the tests hold: "my door code is 4512" (no "your", no sender's name), "Can you send me the code?" (no digits, and a question), "Booking for 2 at 4512 Main St, code word blue" (digits, and none of the four), "your code didn't work, I paid 1234 dollars" ("your code" has no name between the words and no digits after "code"), "Your door code is 4512" and "Your Door code is 4512" ("door" is a thing a customer owns, whatever its case), "Is your Gate code 4512?" (a question), "the gate code is 4512, don't share it with anyone" (the sharing words stand with no word that says what the code is for), "Don't share this code, I paid 1234 and 5678" (two numbers: nothing says which is the code, so none is taken).

**Files:**
- Create: `tooling/scripts/tests/sms/one-time-code.test.mjs`
- Modify: `packages/channels/src/lines/sms.ts`, `packages/channels/src/lines/lines.ts` (the `ReceivedText` the provider answers in Task 3), `packages/channels/src/index.ts`
- Regenerate: `packages/channels/dist`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/sms/one-time-code.test.mjs`:

```js
/**
 * A one-time code texted to a line (channels lines/sms.ts `oneTimeCodeOf`), over the bodies senders write: the two
 * Meta sent the Chanlytics workspace's own line on 6 October 2026 (the real bodies; the numbers they came from are
 * Meta's and are not in any test), the shapes other services use, and what a customer could write that must never be
 * taken for one -- a text taken for a code is never answered and never becomes a person, so every negative here is a
 * customer who would be silenced. Then `lineCodesFrom`: the provider's own record of a number's texts, narrowed to what an
 * owner is waiting for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { oneTimeCodeOf, lineCodesFrom } from "@chanlytics/channels";

const CODES = [
  // The two Meta texts of 6 October (12:08 and 12:34 UTC): ordinary long numbers, no short code.
  ["Your WhatsApp code: 788-963\n\nDon't share this code with others", { code: "788-963", from: "WhatsApp" }],
  ["Your WhatsApp code: 353-343\n\nDon't share this code with others", { code: "353-343", from: "WhatsApp" }],
  // What other services write.
  ["G-123456 is your Google verification code.", { code: "123456", from: "Google" }],
  ["123 456 is your Instagram code. Don't share it.", { code: "123 456", from: "Instagram" }],
  ["Your Apple ID Code is: 123456. Don't share it with anyone.", { code: "123456", from: "Apple ID" }],
  ["<#> 482913 is your code", { code: "482913", from: null }],
  ["123456 is your verification code", { code: "123456", from: null }],
  ["PayPal: 123456 is your security code. Don't share your code.", { code: "123456", from: null }],
  ["Your Chase one-time code is 482913. Never share it.", { code: "482913", from: "Chase" }],
  ["Your Signal verification code: 123-456", { code: "123-456", from: "Signal" }],
  ["Your iCloud code is 4829", { code: "4829", from: "iCloud" }],
  ["Use 482913 to verify your account. Do not share this code with anyone.", { code: "482913", from: null }],
];

const CUSTOMERS = [
  "my door code is 4512",
  "Can you send me the code?",
  "Booking for 2 at 4512 Main St, code word blue",
  "your code didn't work, I paid 1234 dollars",
  "Your door code is 4512",
  "Your Door code is 4512",
  "Your Booking code is 4512",
  "Is your Gate code 4512?",
  "hi, the code is 4512 and please don't share it",
  "the gate code is 4512, don't share it with anyone",
  "Call me on 555-0142 about the code",
  "Don't share this code, I paid 1234 and 5678",
  "Your code is 4512",
  "Are you open Saturday?",
  "STOP",
  "",
];

test("a code is read from the shapes senders write it in, with the name it read and the code as it was written", () => {
  for (const [body, want] of CODES) assert.deepEqual(oneTimeCodeOf(body), want, JSON.stringify(body));
});

test("a customer's text is never taken for a code: a door code, a question, a street number, a price, a phone number, a shared secret", () => {
  for (const body of CUSTOMERS) assert.equal(oneTimeCodeOf(body), null, JSON.stringify(body));
});

test("a long text is not a code, however it begins; a code with a letter or more digits against it is not a code", () => {
  assert.equal(oneTimeCodeOf(`${"x".repeat(320)} Your WhatsApp code: 788-963`), null);
  assert.deepEqual(oneTimeCodeOf(`Your WhatsApp code: 788-963 ${"x".repeat(200)}`)?.code, "788-963", "a long one is still short enough");
  assert.equal(oneTimeCodeOf("Your WhatsApp code: 788963a"), null, "a letter against it");
  assert.equal(oneTimeCodeOf("Your WhatsApp code: 123456789"), null, "nine digits are not a code");
  assert.equal(oneTimeCodeOf("Your WhatsApp code: 78"), null, "two are not either");
  assert.deepEqual(oneTimeCodeOf("Your WhatsApp code: 78896"), { code: "78896", from: "WhatsApp" }, "five are");
});

const NOW = Date.parse("2026-10-06T15:00:00Z");
const MIN = 60_000;
const text = (body, agoMs, over = {}) => ({ sid: `SM${agoMs}`, from: "+15555550100", body, atMs: NOW - agoMs, ...over });

test("the line's codes are the ones in the last fifteen minutes, newest first, at most three, each with the time the provider says it was sent", () => {
  const texts = [
    text("Are you open Saturday?", 1 * MIN),
    text("Your WhatsApp code: 788-963\n\nDon't share this code with others", 2 * MIN),
    text("G-123456 is your Google verification code.", 5 * MIN),
    text("123 456 is your Instagram code. Don't share it.", 9 * MIN),
    text("Your Apple ID Code is: 123456. Don't share it with anyone.", 12 * MIN),
    text("<#> 482913 is your code", 16 * MIN),
  ];
  assert.deepEqual(lineCodesFrom(texts, NOW), [
    { code: "788-963", from: "WhatsApp", at: "2026-10-06T14:58:00.000Z" },
    { code: "123456", from: "Google", at: "2026-10-06T14:55:00.000Z" },
    { code: "123 456", from: "Instagram", at: "2026-10-06T14:51:00.000Z" },
  ]);
  assert.deepEqual(
    lineCodesFrom([...texts].reverse(), NOW).map((c) => c.code),
    ["788-963", "123456", "123 456"],
    "newest first, whatever order the provider listed them in",
  );
  assert.deepEqual(lineCodesFrom([], NOW), []);
  assert.deepEqual(lineCodesFrom([text("Are you open Saturday?", MIN)], NOW), [], "no code, none");
  assert.equal(lineCodesFrom([text("Your WhatsApp code: 788-963", 15 * MIN)], NOW).length, 1, "fifteen minutes is within");
  assert.equal(lineCodesFrom([text("Your WhatsApp code: 788-963", 15 * MIN + 1)], NOW).length, 0, "and a millisecond more is not");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/sms/one-time-code.test.mjs`
Expected: FAIL at load: `@chanlytics/channels` does not export `oneTimeCodeOf`.

- [ ] **Step 3: The rule, the provider's text, the exports**

The provider's own record of a text (`swap`; `LineProvider` itself learns to answer it in Task 3):

```swap
##FILE packages/channels/src/lines/lines.ts
##FROM
export interface SmsSendResult {
##TO
/**
 * A text that arrived on one of the account's numbers, as the provider keeps it: the provider's own record, never ours.
 * `atMs` is when the provider says it was sent (Twilio's `date_sent`, in milliseconds).
 */
export interface ReceivedText {
  sid: string;
  from: string;
  body: string;
  atMs: number;
}

export interface SmsSendResult {
##END
```

The rule and the narrowing, in `sms.ts` (`swap`):

```swap
##FILE packages/channels/src/lines/sms.ts
##FROM
import { SMS_OPT_OUT_PATTERN, utf8Bytes } from "@chanlytics/contracts";
##TO
import {
  LINE_CODES_MAX,
  LINE_CODES_WITHIN_MS,
  SMS_OPT_OUT_PATTERN,
  utf8Bytes,
  type LineCodeDto,
} from "@chanlytics/contracts";
import type { ReceivedText } from "./lines";
##END
##FILE packages/channels/src/lines/sms.ts
##FROM
  return { ...n, optOut: n.optOut || c.optOut, optIn: n.optIn || c.optIn };
}
##TO
  return { ...n, optOut: n.optOut || c.optOut, optIn: n.optIn || c.optIn };
}

/* ---- A one-time code texted to a line by some other service ---- */

/** The longest text taken for a code: a sender's is a line or two, and a customer's paragraph that mentions one is not. */
const ONE_TIME_CODE_MAX_CHARS = 320;
/** A code as a sender writes it: four to eight digits, or six to eight digits split by one dash or space (788-963, 123 456). */
const CODE_DIGITS = String.raw`(\d{3,4}[ -]\d{3,4}|\d{4,8})`;
/** A code on its own: no digit or letter against either side of it. */
const CODE = String.raw`(?<![\d\w])${CODE_DIGITS}(?![\d\w])`;
/** The words a sender puts between its name and "code". */
const CODE_KIND = String.raw`(?:verification|security|confirmation|login|log-in|sign-in|access|one-time|authentication)`;
/** The sender's name: one to three words, which a test of its own (serviceName) holds to what a brand looks like. */
const CODE_NAME = String.raw`([\p{L}\d&.'’-]+(?: [\p{L}\d&.'’-]+){0,2}?)`;
const CODE_WORD = String.raw`(?:code|passcode|otp|pin)`;
/** "Your WhatsApp code: 788-963", "Your Apple ID Code is: 123456": the code straight after the word. */
const YOUR_NAME_CODE = new RegExp(
  String.raw`\byour ${CODE_NAME} (?:${CODE_KIND} )?${CODE_WORD}\b[ :]{0,3}(?:is\b[ :]{0,3})?${CODE}`,
  "iu",
);
/** "123456 is your verification code": a kind of code and no name. */
const CODE_IS_YOUR_KIND = new RegExp(String.raw`${CODE} is your ${CODE_KIND} ${CODE_WORD}\b`, "iu");
/** "G-123456 is your Google verification code", "123 456 is your Instagram code". */
const CODE_IS_YOUR_NAME = new RegExp(String.raw`${CODE} is your ${CODE_NAME} (?:${CODE_KIND} )?${CODE_WORD}\b`, "iu");
const DONT_SHARE = /\b(?:don'?t|do not|never) share (?:this|the|your|it)\b/i;
/** What a text that tells you not to share it says the code is for. A customer who shares a gate code says none of it. */
const TO_VERIFY = /\b(?:verif\w*|confirm\w*|log ?in|sign ?in|security|one-time|authenticat\w*|2-?step|two-step)\b/i;
/** The mark Android's SMS retriever asks every sender to put first. */
const ANDROID_TAG = /^\s*<#>\s/;
/** What a customer's own sentence calls a thing that is not a sender, and the kinds of code: never the name of a service. */
const NOT_A_SERVICE =
  /^(?:door|gate|garage|locker|lock|building|entry|promo|discount|coupon|gift|referral|booking|appointment|order|reservation|alarm|wi-?fi|security|verification|confirmation|login|log-in|sign-in|access|one-time|authentication)$/i;

/** A name as a brand writes it: each word has a capital in it (WhatsApp, Apple ID, iCloud) and none is a thing a customer owns. */
function serviceName(name: string | undefined): string | null {
  if (!name) return null;
  return name.split(" ").every((w) => /\p{Lu}/u.test(w) && !NOT_A_SERVICE.test(w)) ? name : null;
}

/**
 * Whether a text is a one-time code some service sent (Meta's, when an owner connects the line's number to WhatsApp), and
 * which. The receptionist never answers one and no person or message is made of it (apps/edge/lib/sms/sms-ingress.ts), so
 * the rule is conservative on purpose: a text taken for a code silences a customer, and one missed is only answered as it
 * was. It is a text of at most 320 characters with no question mark, and one of four things: "your <Name> code" with the
 * code after it, "<code> is your <Name> ... code" (or a kind of code and no name), a leading `<#>`, or "don't share it"
 * together with a word that says what the code is for and exactly one code. Digits only, four to eight. It answers the code as it
 * was written, and the name of the service when the text says one.
 */
export function oneTimeCodeOf(body: string): { code: string; from: string | null } | null {
  if (body.length > ONE_TIME_CODE_MAX_CHARS || body.includes("?")) return null;
  const [, name, digits] = YOUR_NAME_CODE.exec(body) ?? [];
  const sender = serviceName(name);
  if (digits && sender) return { code: digits, from: sender };
  const [, unnamed] = CODE_IS_YOUR_KIND.exec(body) ?? [];
  if (unnamed) return { code: unnamed, from: null };
  const [, named, namedBy] = CODE_IS_YOUR_NAME.exec(body) ?? [];
  const namedFrom = serviceName(namedBy);
  if (named && namedFrom) return { code: named, from: namedFrom };
  if (ANDROID_TAG.test(body) || (DONT_SHARE.test(body) && TO_VERIFY.test(body))) {
    const found = [...body.matchAll(new RegExp(CODE, "gu"))].map((m) => m[1]);
    const only = found.length === 1 ? found[0] : undefined;
    if (only) return { code: only, from: null };
  }
  return null;
}

/**
 * The codes among a number's recent texts, as the page says them: the ones sent within LINE_CODES_WITHIN_MS of `nowMs`,
 * newest first, at most LINE_CODES_MAX, each with the instant the provider says it was sent. The provider's list is read
 * for the number (recentTexts); nothing here is stored.
 */
export function lineCodesFrom(texts: readonly ReceivedText[], nowMs: number): LineCodeDto[] {
  return [...texts]
    .filter((t) => nowMs - t.atMs <= LINE_CODES_WITHIN_MS)
    .sort((a, b) => b.atMs - a.atMs)
    .flatMap((t): LineCodeDto[] => {
      const read = oneTimeCodeOf(t.body);
      return read ? [{ code: read.code, from: read.from, at: new Date(t.atMs).toISOString() }] : [];
    })
    .slice(0, LINE_CODES_MAX);
}
##END
```

The package names them (`swap`):

```swap
##FILE packages/channels/src/index.ts
##FROM
  smsKeywordConsent,
  mergeConsent,
  withCarrierConsent,
##TO
  smsKeywordConsent,
  mergeConsent,
  withCarrierConsent,
  oneTimeCodeOf,
  lineCodesFrom,
##END
##FILE packages/channels/src/index.ts
##FROM
export type { LineProviderName, ProviderAccount, AvailableNumber, LineProvider, SmsSendResult } from "./lines/lines";
##TO
export type {
  LineProviderName,
  ProviderAccount,
  AvailableNumber,
  LineProvider,
  SmsSendResult,
  ReceivedText,
} from "./lines/lines";
##END
```

- [ ] **Step 4: Format, build, run**

```bash
corepack pnpm exec prettier --write packages/channels/src/lines/sms.ts packages/channels/src/lines/lines.ts packages/channels/src/index.ts tooling/scripts/tests/sms/one-time-code.test.mjs
corepack pnpm --filter "./packages/*" build
for f in $(git ls-files packages/contracts/dist packages/db/dist packages/jobs/dist packages/channels/dist packages/core/dist); do git diff -w --ignore-cr-at-eol --quiet -- "$f" && git checkout -- "$f"; done
git status --short packages
node tooling/scripts/checks/test.mjs tooling/scripts/tests/sms/one-time-code.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/sms/sms.test.mjs
corepack pnpm --filter @chanlytics/channels typecheck
```
Expected: the build changes `packages/channels/dist` only (contracts' dist is unchanged since Task 1 and is restored by the loop); `one-time-code.test.mjs` PASSES; `sms.test.mjs` PASSES (its tests of the STOP words and the signature are untouched); the channels package typechecks (`oneTimeCodeOf`'s three destructurings are `string | undefined` there: `noUncheckedIndexedAccess` is on in this package, and each is guarded before it is read).

- [ ] **Step 5: Commit**

```bash
git add packages/channels/src/lines/sms.ts packages/channels/src/lines/lines.ts packages/channels/src/index.ts packages/*/dist tooling/scripts/tests/sms/one-time-code.test.mjs
git commit -m "A text that is a one-time code is read by its words, never by who sent it, and a line's codes are the ones sent in the last fifteen minutes." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 3: A line provider says what texts a number was sent

**Why:** Chanlytics never stores a one-time code; the texts are already Twilio's record, kept for the number in the line's own subaccount. The owner reads them from there, on demand (Task 8's door), so the provider interface learns one more question: `recentTexts(acct, to, sinceMs)`, newest first, a page of twenty at most, each with the instant the provider says it was sent. Twilio answers it from `GET /2010-04-01/Accounts/{sid}/Messages.json?To=<e164>&PageSize=20` (the list is newest first; each message has `body`, `from`, `date_sent` in RFC 2822 and `direction`, which is "inbound" for a text that arrived); a read that fails throws, as every other method's does (`need`). The dry provider, which never reaches a carrier, answers what a test planted.

**Files:**
- Modify: `packages/channels/src/lines/lines.ts`, `packages/channels/src/lines/lines-twilio.ts`, `packages/channels/src/lines/lines-dry.ts`, `tooling/scripts/tests/lines/lines-twilio.test.mjs`
- Regenerate: `packages/channels/dist`

- [ ] **Step 1: Write the failing tests**

`lines-twilio.test.mjs` pins that the provider is exactly the methods listed (`Object.keys(twilioProvider())`), so the list learns the new one in the order the provider will hold it, and two tests follow (`swap`):

```swap
##FILE tooling/scripts/tests/lines/lines-twilio.test.mjs
##FROM
import { twilioProvider, TwilioError } from "@chanlytics/channels";
##TO
import { dryProvider, twilioProvider, TwilioError } from "@chanlytics/channels";
##END
##FILE tooling/scripts/tests/lines/lines-twilio.test.mjs
##FROM
  sendSms: (p) => p.sendSms(acct, { serviceSid: "MG1", to: "+16465550123", body: "hi" }),
};
##TO
  sendSms: (p) => p.sendSms(acct, { serviceSid: "MG1", to: "+16465550123", body: "hi" }),
  recentTexts: (p) => p.recentTexts(acct, "+16465550100", 0),
};
##END
##FILE tooling/scripts/tests/lines/lines-twilio.test.mjs
##FROM
  assert.deepEqual(await sent(500, null), { ok: false, sid: null, status: 500, code: null });
});
##TO
  assert.deepEqual(await sent(500, null), { ok: false, sid: null, status: 500, code: null });
});

test("Twilio: the texts that arrived on a number are the account's Messages to it, a page of twenty, and only the inbound ones sent since are kept, in the order Twilio lists them", async () => {
  const body = {
    messages: [
      {
        sid: "SM3",
        direction: "inbound",
        from: "+15555550101",
        body: "Your WhatsApp code: 788-963",
        date_sent: "Tue, 06 Oct 2026 14:58:00 +0000",
      },
      {
        sid: "SM2",
        direction: "outbound-api",
        from: "+16465550100",
        body: "We open at 9.",
        date_sent: "Tue, 06 Oct 2026 14:57:00 +0000",
      },
      {
        sid: "SM1",
        direction: "inbound",
        from: "+15555550102",
        body: "G-123456 is your Google verification code.",
        date_sent: "Tue, 06 Oct 2026 14:40:00 +0000",
      },
      { sid: "SM0", direction: "inbound", from: "+15555550103", body: "no date", date_sent: null },
      {
        sid: "",
        direction: "inbound",
        from: "+15555550104",
        body: "no sid",
        date_sent: "Tue, 06 Oct 2026 14:56:00 +0000",
      },
      null,
    ],
  };
  const { provider, calls } = over({ status: 200, body });
  const since = Date.parse("2026-10-06T14:45:00Z");
  assert.deepEqual(await provider.recentTexts(acct, "+16465550100", since), [
    { sid: "SM3", from: "+15555550101", body: "Your WhatsApp code: 788-963", atMs: Date.parse("2026-10-06T14:58:00Z") },
  ]);
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.deepEqual([call.acct, call.method, call.form], ["ACsub", "GET", undefined]);
  const url = new URL(call.url);
  assert.equal(url.pathname, "/2010-04-01/Accounts/ACsub/Messages.json", "the account's own Messages");
  assert.deepEqual([url.searchParams.get("To"), url.searchParams.get("PageSize")], ["+16465550100", "20"]);
  assert.deepEqual(await over({ status: 200, body: {} }).provider.recentTexts(acct, "+16465550100", 0), []);
  await assert.rejects(
    over({ status: 401, body: { code: 20003, message: "Authenticate" } }).provider.recentTexts(acct, "+16465550100", 0),
    (e) => e instanceof TwilioError && e.status === 401 && /list received texts/.test(e.message),
    "a read that fails is a failure, never an empty list",
  );
});

test("the dry provider answers the texts a test planted for a number, newest first and since a moment, and records what it was asked", async () => {
  const dry = dryProvider();
  dry.plantText("+16465550100", { sid: "SM1", from: "+15555550101", body: "Your WhatsApp code: 788-963", atMs: 2_000 });
  dry.plantText("+16465550100", { sid: "SM2", from: "+15555550102", body: "later", atMs: 3_000 });
  dry.plantText("+16465550199", { sid: "SM3", from: "+15555550103", body: "another number's", atMs: 2_500 });
  assert.deepEqual(
    (await dry.recentTexts(acct, "+16465550100", 0)).map((t) => t.sid),
    ["SM2", "SM1"],
  );
  assert.deepEqual(
    (await dry.recentTexts(acct, "+16465550100", 2_500)).map((t) => t.sid),
    ["SM2"],
  );
  assert.deepEqual(await dry.recentTexts(acct, "+16465550150", 0), []);
  assert.deepEqual(dry.calls.at(-1), { op: "recentTexts", args: ["ACsub", "+16465550150", 0] });
});
##END
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/lines/lines-twilio.test.mjs`
Expected: FAIL: the first test (the provider is every method listed) fails on `Object.keys` (no `recentTexts` yet) and on `p.recentTexts is not a function`; the two new tests fail the same way (`provider.recentTexts is not a function`, `dry.plantText is not a function`); the other tests PASS.

- [ ] **Step 3: The question, Twilio's answer, the dry provider's**

The interface (`swap`):

```swap
##FILE packages/channels/src/lines/lines.ts
##FROM
  sendSms(
    acct: ProviderAccount,
    o: { serviceSid: string; to: string; body: string; statusCallback?: string },
  ): Promise<SmsSendResult>;
}
##TO
  sendSms(
    acct: ProviderAccount,
    o: { serviceSid: string; to: string; body: string; statusCallback?: string },
  ): Promise<SmsSendResult>;
  /**
   * The texts that arrived on `to` since `sinceMs`, newest first, a page of twenty at most, from the provider's own record
   * (the account's list of messages): nothing of ours is kept. A read that FAILS throws, so a caller never mistakes it for
   * a number nobody wrote to.
   */
  recentTexts(acct: ProviderAccount, to: string, sinceMs: number): Promise<ReceivedText[]>;
}
##END
```

Twilio (`swap`):

```swap
##FILE packages/channels/src/lines/lines-twilio.ts
##FROM
import type { AvailableNumber, LineProvider, ProviderAccount } from "./lines";
##TO
import type { AvailableNumber, LineProvider, ProviderAccount, ReceivedText } from "./lines";
##END
##FILE packages/channels/src/lines/lines-twilio.ts
##FROM
export function twilioProvider(http: TwilioHttp = fetchTwilio): LineProvider {
##TO
/** How many of a number's latest texts one read asks for: Twilio lists them newest first. */
const RECENT_TEXTS_PAGE = "20";

/**
 * The texts that arrived on a number (Twilio's Messages, filtered by `To`), since a moment: the inbound ones with a sid, a
 * sender and a time (`date_sent`, RFC 2822). The filter by date is ours: Twilio's own takes a day, and a code is wanted
 * within minutes.
 */
async function recentTexts(http: TwilioHttp, acct: ProviderAccount, to: string, sinceMs: number) {
  const url = `${twilioUrls.messages(acct.sid)}?${new URLSearchParams({ To: to, PageSize: RECENT_TEXTS_PAGE })}`;
  const b = need(await http(acct, "GET", url), "list received texts");
  return rowsOf(b, "messages").flatMap((m): ReceivedText[] => {
    const sid = str(m, "sid");
    const from = str(m, "from");
    const body = str(m, "body");
    const atMs = Date.parse(str(m, "date_sent") ?? "");
    if (str(m, "direction") !== "inbound" || !sid || !from || body === null || Number.isNaN(atMs) || atMs < sinceMs)
      return [];
    return [{ sid, from, body, atMs }];
  });
}

export function twilioProvider(http: TwilioHttp = fetchTwilio): LineProvider {
##END
##FILE packages/channels/src/lines/lines-twilio.ts
##FROM
    sendSms: (acct, o) => sendSms(http, acct, o),
  };
##TO
    sendSms: (acct, o) => sendSms(http, acct, o),
    recentTexts: (acct, to, sinceMs) => recentTexts(http, acct, to, sinceMs),
  };
##END
```

The dry provider (`swap`):

```swap
##FILE packages/channels/src/lines/lines-dry.ts
##FROM
import type { AvailableNumber, LineProvider, ProviderAccount } from "./lines";
##TO
import type { AvailableNumber, LineProvider, ProviderAccount, ReceivedText } from "./lines";
##END
##FILE packages/channels/src/lines/lines-dry.ts
##FROM
  /** Numbers bought and not released, by SID. */
  readonly owned: Map<string, string>;
}
##TO
  /** Numbers bought and not released, by SID. */
  readonly owned: Map<string, string>;
  /** A text that "arrived" on `to`, for recentTexts to answer: the dry provider has no carrier to receive one. */
  plantText(to: string, text: ReceivedText): void;
}
##END
##FILE packages/channels/src/lines/lines-dry.ts
##FROM
  const originations = new Map<string, string>();
##TO
  const originations = new Map<string, string>();
  const received = new Map<string, ReceivedText[]>();
##END
##FILE packages/channels/src/lines/lines-dry.ts
##FROM
      rec("sendSms", acctOf(acct), o.serviceSid, o.to);
      return { ok: true, sid: next("SM"), status: 201, code: null };
    },
  };
##TO
      rec("sendSms", acctOf(acct), o.serviceSid, o.to);
      return { ok: true, sid: next("SM"), status: 201, code: null };
    },
    plantText(to, text) {
      received.set(to, [...(received.get(to) ?? []), text]);
    },
    // Not `async`: nothing here waits, and lint's `require-await` warnings in this file are a count that may only fall.
    recentTexts(acct, to, sinceMs) {
      rec("recentTexts", acctOf(acct), to, sinceMs);
      return Promise.resolve(
        (received.get(to) ?? [])
          .filter((t) => t.atMs >= sinceMs)
          .sort((a, b) => b.atMs - a.atMs)
          .slice(0, DRY_TEXTS_PAGE),
      );
    },
  };
##END
##FILE packages/channels/src/lines/lines-dry.ts
##FROM
const hex = (n: number, width = 32) => n.toString(16).padStart(width, "0");
##TO
const hex = (n: number, width = 32) => n.toString(16).padStart(width, "0");

/** The page a read of a number's texts is: twenty, as the real provider's. */
const DRY_TEXTS_PAGE = 20;
##END
```

The package already exports `dryProvider`, `twilioProvider` and the `LineProvider` type; `ReceivedText` was exported in Task 2.

- [ ] **Step 4: Format, build, run**

```bash
corepack pnpm exec prettier --write packages/channels/src/lines/lines.ts packages/channels/src/lines/lines-twilio.ts packages/channels/src/lines/lines-dry.ts tooling/scripts/tests/lines/lines-twilio.test.mjs
corepack pnpm --filter "./packages/*" build
for f in $(git ls-files packages/contracts/dist packages/db/dist packages/jobs/dist packages/channels/dist packages/core/dist); do git diff -w --ignore-cr-at-eol --quiet -- "$f" && git checkout -- "$f"; done
git status --short packages
node tooling/scripts/checks/test.mjs tooling/scripts/tests/lines/lines-twilio.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/lines/lines-saga.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/sms/sms.test.mjs
corepack pnpm -r typecheck
```
Expected: the build changes `packages/channels/dist` only; the three suites PASS (the saga's tests run the dry provider through every step: it gained a method and a planted list, and nothing it did before); typecheck clean: `apps/edge` builds a provider only through `twilioProvider()` and `dryProvider()`, so no object that implements `LineProvider` by hand is left short of the new method.

- [ ] **Step 5: Commit**

```bash
git add packages/channels/src/lines/lines.ts packages/channels/src/lines/lines-twilio.ts packages/channels/src/lines/lines-dry.ts packages/*/dist tooling/scripts/tests/lines/lines-twilio.test.mjs
git commit -m "A line provider says what texts a number was sent: Twilio from its own record of them, the dry provider from what a test planted." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 4: The receptionist never answers an automated code

**Why:** on 6 October at 12:08 and 12:34 UTC Meta texted the Chanlytics workspace's own line a code, and the receptionist answered Meta both times ("Looks like that verification code came to us by mistake..."); both senders became people and conversations. `planSmsIngress` gains the verdict `{ kind: "code", routed, from }`, reached **after** the line, the signature and the routing are proven (a forged request, an unknown number and a switched-off channel are refused exactly as before, whatever their body says) and **before** the line's state is judged (a line the carriers have not approved holds a customer's text for a person; a code is nobody's to hold). `receiveInboundText` logs `sms_code_skipped` (the name it read, never the code, never a number) and answers an empty TwiML 200: no person, no conversation, no message row, no reply, no consent read, no handoff, no alert. The owner reads the code from Twilio in Task 8; nothing is stored.

**Files:**
- Modify: `apps/edge/lib/sms/sms-ingress.ts`, `apps/edge/lib/sms/inbound-text.ts`, `apps/edge/lib/log-events.ts`, `tooling/scripts/tests/sms/sms-ingress.test.mjs`, `tooling/scripts/tests/sms/sms-door.test.mjs`

- [ ] **Step 1: Write the failing tests**

The decision, over the database in memory (`sms-ingress.test.mjs`; every case has its own number, the file's rule):

```swap
##FILE tooling/scripts/tests/sms/sms-ingress.test.mjs
##FROM
  assert.deepEqual(smsAfterThrow(false), { status: 200, alert: null });
});
##TO
  assert.deepEqual(smsAfterThrow(false), { status: 200, alert: null });
});

/** The two texts Meta sent the Chanlytics workspace's own line on 6 October 2026, from numbers that are no test's. */
const META = { From: "+18335550101", Body: "Your WhatsApp code: 788-963\n\nDon't share this code with others" };

test("a one-time code some service texted to the line is a verdict of its own, after the line, the signature and the routing are proven: the workspace it was for, and the name it read", async () => {
  const to = freshNumber();
  const v = await plan(to, world(to), { form: form(to, META) });
  assert.equal(v.kind, "code");
  assert.equal(v.from, "WhatsApp");
  assert.deepEqual([v.routed.tenantId, v.routed.channelId], [T, "c1"], "routed to the workspace whose line it came to");
  assert.deepEqual(Object.keys(v).sort(), ["from", "kind", "routed"], "no person, no line, no account: nothing to answer with");
  const unnamed = freshNumber();
  const other = await plan(unnamed, world(unnamed), { form: form(unnamed, { ...META, Body: "<#> 482913 is your code" }) });
  assert.deepEqual([other.kind, other.from], ["code", null], "a code whose sender said no name");
});

test("a line the carriers have not approved skips a code too: a customer's text is held for a person, and a code is nobody's to hold", async () => {
  const to = freshNumber();
  for (const state of ["registering", "pending", "failed", null]) {
    const v = await plan(to, world(to, { lines: [lineRow(to, { sms_state: state })] }), { form: form(to, META) });
    assert.equal(v.kind, "code", String(state));
  }
});

test("a code body buys nothing before the line and the signature are proven: a forged signature is 403, an unknown number 404, a switched-off channel 200 and told, whatever the text says", async () => {
  const forged = freshNumber();
  const f = form(forged, META);
  const bad = await plan(forged, world(forged, { lines: [lineRow(forged, { provider: "twilio" })] }), {
    form: f,
    signature: "not-a-signature",
  });
  assert.deepEqual([bad.kind, bad.status, bad.alert], ["refuse", 403, null]);
  const unknown = freshNumber();
  const none = await plan(unknown, world(unknown, { lines: [] }), { form: form(unknown, META) });
  assert.deepEqual([none.kind, none.status, none.log], ["refuse", 404, "sms_unknown_line"]);
  const off = freshNumber();
  const dead = await plan(off, world(off, { channels: [channelRow(off, { status: "disabled" })] }), { form: form(off, META) });
  assert.deepEqual([dead.kind, dead.status, dead.log], ["refuse", 200, "sms_unroutable"]);
});

test("a customer's text is accepted as it was, whatever it says about a code: the door never takes a person for a machine", async () => {
  for (const body of [
    "my door code is 4512",
    "Can you send me the code?",
    "Booking for 2 at 4512 Main St, code word blue",
    "your code didn't work, I paid 1234 dollars",
  ]) {
    const to = freshNumber();
    const v = await plan(to, world(to), { form: form(to, { Body: body }) });
    assert.equal(v.kind, "accept", body);
  }
});
##END
```

The door, run: the same text posted the way Twilio posts it (`sms-door.test.mjs`):

```swap
##FILE tooling/scripts/tests/sms/sms-door.test.mjs
##FROM
    assert.deepEqual(
      log.said("sms_inbound_failed").map((l) => [l.stream, l.error]),
      [["error", "cannot read properties of undefined (reading 'id')"]],
      "but it is said",
    );
  });
});
##TO
    assert.deepEqual(
      log.said("sms_inbound_failed").map((l) => [l.stream, l.error]),
      [["error", "cannot read properties of undefined (reading 'id')"]],
      "but it is said",
    );
  });
});

test("a one-time code texted to the line is skipped: an empty TwiML, no person, no conversation, no reply, no handoff and no page, a line that names the service and never the code or the number -- and the next customer's text is answered as ever", async () => {
  const w = world();
  w.line.sms_state = "registering"; // a line holding customers' texts for a person holds none of these
  w.open();
  const seen = receptionist();
  const meta = "+18335550101";
  const fields = w.form(meta, { Body: "Your WhatsApp code: 788-963\n\nDon't share this code with others" });
  await listening(async (log) => {
    assert.deepEqual(await heard(await text(fields, w.TOKEN)), twiml(200), "acknowledged: Twilio keeps the text in its own record");
    assert.deepEqual(
      [seen.runtimes, seen.ingested, seen.sent, seen.escalations, seen.alerts, seen.processed],
      [[], [], [], [], [], 0],
      "nothing reached the receptionist: no workspace runtime, no message kept, nothing said, nobody handed anything or told",
    );
    assert.deepEqual([w.left().texts, w.left().mail], [[], []], "nothing left the process: no reply to Meta, no page to the platform");
    assert.deepEqual(
      log.said("sms_code_skipped").map((l) => [l.stream, l.service, l.sid]),
      [["log", "WhatsApp", fields.MessageSid]],
    );
    assert.deepEqual(log.said("sms_inbound"), [], "and it is not an inbound text");
    const said = JSON.stringify(log.lines);
    for (const planted of ["788-963", "788963", meta, meta.slice(1), meta.slice(-7), w.TOKEN])
      assert.ok(!said.includes(planted), `${planted} is in a log line`);
  });
  // The same line, the next minute: a customer writes, and is answered or held as ever.
  const later = receptionist();
  await listening(async () => {
    assert.deepEqual(
      await heard(await text(w.form(w.customer(), { Body: "my door code is 4512" }), w.TOKEN)),
      twiml(200),
    );
  });
  assert.deepEqual(
    later.ingested.map((i) => i.body),
    ["my door code is 4512"],
    "a customer who writes of a code is a customer",
  );
});
##END
```

- [ ] **Step 2: Run them to verify they fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/sms/sms-ingress.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/sms/sms-door.test.mjs
```
Expected: FAIL: the first two new ingress tests (`v.kind` is not `"code"`: Meta's text is accepted, or held for a person on a line the carriers have not approved); the other two new ones, what a forged request, an unknown number and a switched-off channel are told, and that a customer's own text is accepted as it was, already PASS and are held from here on; the new door test (the assertion that says `nothing reached the receptionist` fails: the text was handed to the receptionist, and a reply was sent). Every older test PASSES.

- [ ] **Step 3: The verdict, and the door that skips it**

`apps/edge/lib/sms/sms-ingress.ts` (`swap`):

```swap
##FILE apps/edge/lib/sms/sms-ingress.ts
##FROM
  mergeConsent,
  SMS_HELD_REASON,
  SMS_HELD_DETAILS,
} from "../packages/channels.js";
##TO
  mergeConsent,
  oneTimeCodeOf,
  SMS_HELD_REASON,
  SMS_HELD_DETAILS,
} from "../packages/channels.js";
##END
##FILE apps/edge/lib/sms/sms-ingress.ts
##FROM
 * URL. Those name a constant instead, so the whole class is capped like one.
 */
type SmsVerdict =
  | { kind: "refuse"; status: number; log: LogEvent; level: "warn" | "error"; alert: string | null; alertKey?: string }
  | { kind: "accept"; line: SmsLine; acct: ProviderAccount; routed: RoutedChannel; held: boolean };
##TO
 * URL. Those name a constant instead, so the whole class is capped like one.
 *
 * A code is a text that proved to be a one-time code some other service sent to the line (oneTimeCodeOf, Meta's when the
 * owner connects the line's number to WhatsApp), whatever state the line is in: the line, the signature and the routing
 * were proven first, so it is a text to this workspace's line, and `from` is the name of the service when the text said
 * one. It is not answered and not kept; the owner reads it from the provider's own record (lib/lines/line-codes.ts).
 */
type SmsVerdict =
  | { kind: "refuse"; status: number; log: LogEvent; level: "warn" | "error"; alert: string | null; alertKey?: string }
  | { kind: "code"; routed: RoutedChannel; from: string | null }
  | { kind: "accept"; line: SmsLine; acct: ProviderAccount; routed: RoutedChannel; held: boolean };
##END
##FILE apps/edge/lib/sms/sms-ingress.ts
##FROM
  // Held: the carriers have not approved this line for texting yet, so the
  // text is kept for a person instead of answered.
  return { kind: "accept", line, acct, routed, held: line.sms_state !== "active" };
##TO
  // A one-time code is nobody's to answer or to hold: not the receptionist's, and not a person's, whatever the line's
  // state. The words are read, never the sender: Meta texted this line from two ordinary long numbers, one of them toll-free.
  const code = oneTimeCodeOf(inbound.body);
  if (code) return { kind: "code", routed, from: code.from };

  // Held: the carriers have not approved this line for texting yet, so the
  // text is kept for a person instead of answered.
  return { kind: "accept", line, acct, routed, held: line.sms_state !== "active" };
##END
```

`apps/edge/lib/sms/inbound-text.ts` (`swap`):

```swap
##FILE apps/edge/lib/sms/inbound-text.ts
##FROM
 * An accepted text then takes the same road a WhatsApp message takes: handleInbound (lib/whatsapp/inbound.ts, onto
##TO
 * A text that is a one-time code another service sent (planSmsIngress's `code`) takes none of it: nothing is answered, kept,
 * handed to a person or paged, and the line says which service it read and never the code (`sms_code_skipped`). Twilio keeps
 * the text; the owner reads it from there (lib/lines/line-codes.ts), so a code is neither lost nor stored here.
 *
 * An accepted text then takes the same road a WhatsApp message takes: handleInbound (lib/whatsapp/inbound.ts, onto
##END
##FILE apps/edge/lib/sms/inbound-text.ts
##FROM
  const { line, acct, routed, held } = verdict;
##TO
  if (verdict.kind === "code") {
    L.info("sms_code_skipped", { service: verdict.from });
    return twiml(200);
  }

  const { line, acct, routed, held } = verdict;
##END
```

The name joins the closed set (`swap`):

```swap
##FILE apps/edge/lib/log-events.ts
##FROM
  "sms_bad_signature",
  "sms_held_for_carriers",
##TO
  "sms_bad_signature",
  "sms_code_skipped",
  "sms_held_for_carriers",
##END
```

- [ ] **Step 4: Format, run**

```bash
corepack pnpm exec prettier --write apps/edge/lib/sms/sms-ingress.ts apps/edge/lib/sms/inbound-text.ts apps/edge/lib/log-events.ts tooling/scripts/tests/sms/sms-ingress.test.mjs tooling/scripts/tests/sms/sms-door.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/sms/sms-ingress.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/sms/sms-door.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/log-events.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/ops-hygiene.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/edge/request-id-doors.test.mjs
corepack pnpm --filter @chanlytics/edge typecheck
```
Expected: all PASS. The door test's last assertion is the proof the door still answers a person: a customer who writes "my door code is 4512" on the same line is handed to the receptionist.

- [ ] **Step 5: Commit**

```bash
git add apps/edge/lib/sms/sms-ingress.ts apps/edge/lib/sms/inbound-text.ts apps/edge/lib/log-events.ts tooling/scripts/tests/sms/sms-ingress.test.mjs tooling/scripts/tests/sms/sms-door.test.mjs
git commit -m "The receptionist never answers an automated code: a text that is a one-time code is skipped by the texting door, once the line and its signature are proven." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 5: What Meta holds about a number is kept by a database door, and said when it changes: migration 00330, `keepChannelStanding`, the `channel.standing` event

**Why:** the keeping is one SQL door, modelled on `channel_keep_quality` (00315): `channel_keep_standing(p_tenant_id, p_channel_id, p_standing jsonb)` merges the whole standing and its moment into the WhatsApp channel's config (`config.standing`, `config.standing_read_at`) with `||` in one statement, beside `quality_rating`, `quality_read` and the webhook's words and never over them, and writes the event `channel.standing { from?, to }` (the word of `can_send` only, no `from` on the first read) in the same transaction when that word changed. It answers `first`, `changed`, `same` or `gone` (not this workspace's WhatsApp channel), refuses (22023) a standing with no `can_send` of Meta's kind (two to twenty-four capital letters and underscores) or one over 16 KB, is `security definer`, the service role's alone, and says in its comment whose door it is. `packages/db` is the one place the table and the function are named: `keepChannelStanding` (the wrapper, beside `keepChannelQuality`), `whatsappNumberOf` (the one active number of a workspace, which Task 8's owner check reads) and the sweep's `WhatsappNumber` learns its WABA and number. The event kind joins `EVENT_KINDS` and the Activity words in the same task, because `event-kinds.test.mjs` holds the declarations to the emitters both ways (this migration is the emitter).

**The number.** The design named 00328, which was free on the morning of 6 October and is not now: `origin/main` (4813d3a2f) holds 00328 (`a_person_s_every_open_deal`, #1441) and 00329 (`a_campaign_is_counted_by_its_channel`, #1444), the ledger's head is 00329, and no open pull request holds a migration. This lane's migration is therefore **00330**. A number is free only until somebody else lands it, and the ledger refuses one at or below its head, so the number is **re-checked at landing**: Step 6 re-reads `origin/main` and the open pull requests before the commit, and the same three commands are run again when the branch is rebased onto a newer main or the pull request is about to merge (the file, its ledger line and the places this plan names the number are renumbered together; the ledger's `gaps` argue a number nobody used). The pull request says the number it landed with.

**No new closed set.** The standing is a JSON document in an existing column and the event kind is a text, so no `CHECK` changes and `gen:schema-sets` is not run; `gen:db-types`, `gen:schema-snapshot` and `gen:data-model` are.

**Files:**
- Create: `supabase/migrations/00330_a_number_s_standing_is_kept_and_said_when_it_changes.sql`, `tooling/scripts/tests/whatsapp/a-number-s-standing-is-kept-and-said-when-it-changes.db.test.mjs`
- Modify: `packages/contracts/src/shared/enums.ts`, `packages/contracts/src/workspace/activity.ts`, `packages/db/src/sweeps.ts`, `packages/db/src/index.ts`, `tooling/scripts/tests/workspace/activity.test.mjs`, `tooling/scripts/tests/whatsapp/the-channel-quality-sweep-reads-its-numbers-from-the-database.db.test.mjs`
- Regenerate: `packages/db/src/database.types.ts`, `tooling/scripts/tests/_unique-keys.generated.json` (if the generator moves it), `supabase/schema.sql`, `docs/data-model.md`, `supabase/migrations-ledger.json` (by `--record`), `packages/*/dist`

- [ ] **Step 1: Write the failing tests**

The Activity words, in the test that already holds a connection's (`swap`):

```swap
##FILE tooling/scripts/tests/workspace/activity.test.mjs
##FROM
  assert.equal(activityWords("channel.connected", { verified_name: null }), "A WhatsApp number was connected");
##TO
  assert.equal(activityWords("channel.connected", { verified_name: null }), "A WhatsApp number was connected");
  // What Meta holds about the number changed (00330): the word of can_send, from and to; the first read has no from.
  assert.equal(
    activityWords("channel.standing", { from: "AVAILABLE", to: "BLOCKED" }),
    "A WhatsApp number's standing with Meta changed · from can send to blocked",
  );
  assert.equal(
    activityWords("channel.standing", { to: "LIMITED" }),
    "A WhatsApp number's standing with Meta changed · limited",
    "the first read: no from",
  );
  assert.equal(
    activityWords("channel.standing", { from: "BLOCKED", to: "RESTRICTED_FOR_NOW" }),
    "A WhatsApp number's standing with Meta changed · from blocked to restricted for now",
    "a word of Meta's that is not one of three is said as Meta said it, plain",
  );
  assert.equal(activityWords("channel.standing", {}), "A WhatsApp number's standing with Meta changed");
  assert.equal(isActivityNoise("channel.standing"), false, "an owner reads that Meta changed what a number may do");
##END
```

The door, on a real Postgres:

Create `tooling/scripts/tests/whatsapp/a-number-s-standing-is-kept-and-said-when-it-changes.db.test.mjs`:

```js
/**
 * What Meta holds about a number is kept and said when it changes (00330 channel_keep_standing), on a real Postgres.
 *
 * The edge asks Meta what a connected WhatsApp number may do (can it send, what stands in the way, its display name, the
 * business's verification and tier) at connection, on the six-hourly clock and when an owner asks, and hands each answer
 * whole to channel_keep_standing. It keeps the standing and the moment it was read as standing and standing_read_at on the
 * channel's config, BESIDE what broadcasts are gated on and what the quality clock keeps (never over them), and says
 * channel.standing { from, to } when the word of can_send differs from the last one read. This makes a workspace with a
 * WhatsApp number, a voice line and a second workspace's number, and holds the door to what was written:
 *   - the first read is kept whole and said once with no from; the same word again keeps the new standing and says nothing
 *     new; a change says from and to;
 *   - a channel that is not this workspace's WhatsApp channel (another workspace's, a voice line's, none at all) is gone,
 *     and nothing is written;
 *   - a standing that is not an object with Meta's word for can_send, or is over 16 KB, is refused (22023) and written nowhere;
 *   - the merge and the event are one transaction: a ledger that refuses the event takes the standing with it;
 *   - the door is the service role's alone.
 *
 * Runs the way a-number-s-quality-is-kept-and-said-when-it-changes.db.test.mjs does: its own workspaces and channels, made
 * with the service key and removed after, against the database `supabase start` builds on this machine, never production.
 * One block goes through the CLI (SUPABASE_CLI names the binary when `supabase` is not on PATH; SUPABASE_DB_URL aims it), in
 * a transaction that never commits. The cases are in order: the second case reads what the first ended on.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { MIN_MS } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
// The database the CLI is pointed at: the one the environment names when it is on this machine, else the stack
// `supabase start` runs here.
const DB_URL = process.env.SUPABASE_DB_URL;
const CLI_TARGET =
  DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)
    ? ["--db-url", `${DB_URL}${DB_URL.includes("?") ? "&" : "?"}sslmode=disable`]
    : ["--local"];
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces and channels"
      : false;

const stamp = Date.now().toString(36);
let db;
let A;
let B;
let wa;
let voice;
let theirs;
const made = [];
const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const channel = async (tenant, kind, tag, config = {}) =>
  ok(
    await db
      .from("tenant_channels")
      .insert({ tenant_id: tenant, kind, external_id: `harbor-s-${tag}-${stamp}`, config })
      .select("id")
      .single(),
    `channel ${tag}`,
  ).id;
/** A standing as the edge keeps it (contracts NumberStanding). */
const standing = (can_send, over = {}) => ({
  can_send,
  problems: [],
  notes: [],
  name: "Harbor Moving",
  name_status: "APPROVED",
  verification: "verified",
  limit: "TIER_250",
  has_payment_method: true,
  owner_business_id: "410540000000001",
  waba_id: "205540000000001",
  ...over,
});
const keep = (tenant, id, value) =>
  db.rpc("channel_keep_standing", { p_tenant_id: tenant, p_channel_id: id, p_standing: value });
const config = async (id) =>
  ok(await db.from("tenant_channels").select("config").eq("id", id).single(), "config").config;
const said = async (id) =>
  ok(
    await db
      .from("events")
      .select("category, subject_type, data")
      .eq("kind", "channel.standing")
      .eq("subject_id", id)
      .order("created_at"),
    "events",
  );
const GATE = { quality_rating: "GREEN", quality_event: "UPGRADE", messaging_limit: "TIER_1K", quality_read: "GREEN" };

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  for (const tag of ["a", "b"]) {
    const id = ok(
      await db
        .from("tenants")
        .insert({ slug: `harbor-standing-${tag}-${stamp}`, name: `Harbor Standing ${tag}` })
        .select("id")
        .single(),
    ).id;
    made.push(id);
  }
  [A, B] = made;
  wa = await channel(A, "whatsapp", "wa", GATE);
  voice = await channel(A, "voice", "voice");
  theirs = await channel(B, "whatsapp", "theirs", GATE);
});

after(async () => {
  if (skip) return;
  for (const id of made) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

/**
 * A transaction on this machine's database that never commits. `body` runs inside a DO block that ends by raising what
 * it `seen`, so everything the block did goes with it: a function, a trigger, a row. What the block saw leaves as hex, so
 * nothing the CLI adds to a database error can run on into it.
 */
function rolledBack(body) {
  const sql = `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const told = [r.stdout, r.stderr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  const seen = /seen (7b[0-9a-f]*)/.exec(told);
  if (/not_this_database/.test(told))
    throw new Error(
      "the CLI reached a database that does not hold this suite's rows: point SUPABASE_DB_URL at the stack",
    );
  if (!seen) throw new Error(`the block did not get to say what it saw: ${told.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

test(
  "the first read is kept whole beside what broadcasts are gated on and said once, with no from; the same word again keeps the new standing and says nothing; a change says from and to",
  { skip },
  async () => {
    const first = standing("LIMITED", { notes: ["Your display name has not been approved yet."] });
    assert.equal(ok(await keep(A, wa, first), "first"), "first");
    let cfg = await config(wa);
    assert.deepEqual(cfg.standing, first, "kept whole, as it was handed");
    assert.ok(Math.abs(Date.parse(cfg.standing_read_at) - Date.now()) < MIN_MS, "read now");
    assert.deepEqual(
      [cfg.quality_rating, cfg.quality_event, cfg.messaging_limit, cfg.quality_read],
      ["GREEN", "UPGRADE", "TIER_1K", "GREEN"],
      "what broadcasts are gated on, what the webhook keeps and what the quality clock keeps are not touched",
    );
    assert.deepEqual(await said(wa), [{ category: "system", subject_type: "channel", data: { to: "LIMITED" } }]);

    const readAt = cfg.standing_read_at;
    const again = standing("LIMITED", { notes: ["Your display name is in review."] });
    assert.equal(ok(await keep(A, wa, again), "same"), "same");
    cfg = await config(wa);
    assert.deepEqual(cfg.standing, again, "the standing is kept whole each time: its notes moved");
    assert.ok(Date.parse(cfg.standing_read_at) >= Date.parse(readAt), "and it still says when it last looked");
    assert.equal((await said(wa)).length, 1, "and says nothing new");

    const blocked = standing("BLOCKED", {
      problems: [{ entity: "WABA", code: 141006, said: "A payment method is required", fix: null }],
    });
    assert.equal(ok(await keep(A, wa, blocked), "changed"), "changed");
    assert.deepEqual(
      (await said(wa)).map((e) => e.data),
      [{ to: "LIMITED" }, { from: "LIMITED", to: "BLOCKED" }],
    );
    assert.equal((await config(wa)).standing.can_send, "BLOCKED");
  },
);

test(
  "a channel that is not this workspace's WhatsApp channel is gone: another workspace's, a voice line's, none at all; nothing is written",
  { skip },
  async () => {
    const before_ = [await config(theirs), await config(voice)];
    for (const [tenant, id] of [
      [A, theirs],
      [B, wa],
      [A, voice],
      [A, "00000000-0000-4000-8000-000000000000"],
    ])
      assert.equal(ok(await keep(tenant, id, standing("AVAILABLE")), "gone"), "gone");
    assert.deepEqual([await config(theirs), await config(voice)], before_);
    assert.equal((await said(theirs)).length + (await said(voice)).length, 0);
  },
);

test("a standing that is no object, or has no word of Meta's for can_send, or is too large, is refused and written nowhere", { skip }, async () => {
  const cfg = await config(wa);
  const events = (await said(wa)).length;
  for (const value of [
    null,
    {},
    [],
    "BLOCKED",
    { can_send: "" },
    { can_send: 5 },
    { can_send: "blocked" },
    { can_send: "B" },
    { can_send: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
    { ...standing("AVAILABLE"), notes: ["x".repeat(20000)] },
  ]) {
    const r = await keep(A, wa, value);
    assert.equal(r.error?.code, "22023", `${JSON.stringify(value)?.slice(0, 60)}`);
  }
  assert.deepEqual(await config(wa), cfg);
  assert.equal((await said(wa)).length, events);
});

test(
  "the merge and its event are one: a ledger that refuses the event takes the standing with it",
  { skip },
  async () => {
    const c = await channel(A, "whatsapp", "atomic", GATE);
    // The block makes its trigger before the keeper's first insert and has it refuse only once a flag is set: DDL after an insert is a
    // lock upgrade on `events`, and two such blocks at once (`pnpm test:db` runs the files together) can each wait for the other.
    const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${A}') then raise exception 'not_this_database'; end if;
    create function public.__standing_refused() returns trigger language plpgsql as $f$
    begin
      if current_setting('standing.refuse', true) = 'on' then raise exception 'the ledger is unavailable'; end if;
      return new;
    end $f$;
    create trigger __standing_refused before insert on public.events
      for each row when (new.kind = 'channel.standing' and new.tenant_id = '${A}') execute function public.__standing_refused();
    perform public.channel_keep_standing('${A}', '${c}', '{"can_send":"AVAILABLE"}'::jsonb);
    seen := seen || jsonb_build_object('control', (select count(*) from public.events where kind = 'channel.standing' and subject_id = '${c}'));
    perform set_config('standing.refuse', 'on', true);
    begin
      perform public.channel_keep_standing('${A}', '${c}', '{"can_send":"BLOCKED"}'::jsonb);
      seen := seen || jsonb_build_object('raised', false);
    exception when others then
      seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
    end;
    seen := seen || jsonb_build_object('read', (select config -> 'standing' ->> 'can_send' from public.tenant_channels where id = '${c}'));
  `);
    assert.equal(seen.control, 1, "the control: a working ledger writes it");
    assert.deepEqual([seen.raised, seen.read], [true, "AVAILABLE"], JSON.stringify(seen));
    assert.equal((await config(c)).standing, undefined, "and nothing the block did was kept");
  },
);

test("the door is the service role's alone", { skip: skip || (!ANON && "no SUPABASE_ANON_KEY in env") }, async () => {
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const r = await anon.rpc("channel_keep_standing", {
    p_tenant_id: A,
    p_channel_id: wa,
    p_standing: standing("AVAILABLE"),
  });
  assert.ok(r.error, "refused");
  assert.equal((await config(wa)).standing.can_send, "BLOCKED", "and the row is as the service role left it");
});
```

The sweep's reads learn the WABA and number, and the wrapper is held beside `keepChannelQuality`'s (`swap`):

```swap
##FILE tooling/scripts/tests/whatsapp/the-channel-quality-sweep-reads-its-numbers-from-the-database.db.test.mjs
##FROM
let whatsappNumbersToRead;
let keepChannelQuality;
##TO
let whatsappNumbersToRead;
let keepChannelQuality;
let whatsappNumberOf;
let keepChannelStanding;
##END
##FILE tooling/scripts/tests/whatsapp/the-channel-quality-sweep-reads-its-numbers-from-the-database.db.test.mjs
##FROM
  ({ whatsappNumbersToRead, keepChannelQuality } = await import("@chanlytics/db"));
##TO
  ({ whatsappNumbersToRead, keepChannelQuality, whatsappNumberOf, keepChannelStanding } = await import("@chanlytics/db"));
##END
##FILE tooling/scripts/tests/whatsapp/the-channel-quality-sweep-reads-its-numbers-from-the-database.db.test.mjs
##FROM
      phone_number_id: `harbor-r-older-${stamp}`,
      read_at: older.read_at,
    });
##TO
      phone_number_id: `harbor-r-older-${stamp}`,
      waba_id: null,
      number_e164: null,
      read_at: older.read_at,
    });
##END
##FILE tooling/scripts/tests/whatsapp/the-channel-quality-sweep-reads-its-numbers-from-the-database.db.test.mjs
##FROM
  const after_ = ok(await db.from("tenant_channels").select("config").eq("id", ids.older).single()).config;
  assert.deepEqual(after_, before_);
});
##TO
  const after_ = ok(await db.from("tenant_channels").select("config").eq("id", ids.older).single()).config;
  assert.deepEqual(after_, before_);
});

test(
  "a workspace's own number is read as the sweep reads it, with its WABA and its number: the oldest active one, none for a workspace without; a disabled number and a voice line are not one",
  { skip },
  async () => {
    ok(
      await db.from("tenant_channels").update({ waba_id: "harbor-waba", number_e164: "+13055550142" }).eq("id", ids.newer),
      "give it a WABA and a number",
    );
    const mine = await whatsappNumberOf(db, A);
    assert.deepEqual(mine, {
      channel_id: ids.newer,
      tenant_id: A,
      phone_number_id: `harbor-r-newer-${stamp}`,
      waba_id: "harbor-waba",
      number_e164: "+13055550142",
      read_at: mine.read_at,
    });
    assert.equal((await whatsappNumberOf(db, B)).channel_id, ids.theirs);
    assert.equal(await whatsappNumberOf(db, "00000000-0000-4000-8000-000000000000"), null);
    const listed = (await whatsappNumbersToRead(db, 1000)).find((n) => n.channel_id === ids.newer);
    assert.deepEqual([listed.waba_id, listed.number_e164], ["harbor-waba", "+13055550142"], "the sweep reads the same two");
  },
);

test(
  "the standing it keeps is answered first, the same and changed as the door answers it, and gone for another workspace's channel; a standing the door refuses is refused in the door's words",
  { skip },
  async () => {
    const s = (can_send) => ({
      can_send,
      problems: [],
      notes: [],
      name: null,
      name_status: null,
      verification: null,
      limit: null,
      has_payment_method: null,
      owner_business_id: null,
      waba_id: null,
    });
    assert.equal(await keepChannelStanding(db, A, ids.older, s("AVAILABLE")), "first");
    assert.equal(await keepChannelStanding(db, A, ids.older, s("AVAILABLE")), "same");
    assert.equal(await keepChannelStanding(db, A, ids.older, s("BLOCKED")), "changed");
    assert.equal(
      await keepChannelStanding(db, A, ids.theirs, s("BLOCKED")),
      "gone",
      "B's channel is not A's to keep a standing for",
    );
    assert.equal(await keepChannelStanding(db, A, ids.voice, s("BLOCKED")), "gone", "a voice line holds no standing");
    await assert.rejects(
      keepChannelStanding(db, A, ids.older, s("not a word")),
      /^Error: channel_keep_standing: .*not a standing/,
    );
  },
);
##END
```

- [ ] **Step 2: Start this worktree's own database, and watch the tests fail**

The shared local stack holds every lane's migrations, so a snapshot or a db suite taken from it is not this branch's truth, and it is never reset. This branch gets a stack of its own on ports 563xx (Docker Desktop must be running; check `df -h .` first, the stack is a few GB). The CLI is the cached one the database workflow pins (2.116.0):

```bash
df -h .
SB="$HOME/AppData/Local/npm-cache/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-windows-x64/bin/supabase.exe"
"$SB" --version
STACK="$HOME/AppData/Local/Temp/cm-whatsapp-standing-stack"
rm -rf "$STACK" && mkdir -p "$STACK/supabase"
cp -r supabase/migrations supabase/templates supabase/seed.sql supabase/config.toml "$STACK/supabase/"
node -e '
const fs = require("fs");
const f = process.argv[1] + "/supabase/config.toml";
const t = fs.readFileSync(f, "utf8")
  .replace(/^project_id = ".*"$/m, () => "project_id = \"cm-whatsapp-standing-test\"")
  .replace(/^(\s*(?:port|shadow_port)\s*=\s*)543(\d\d)\b/gm, (_m, a, b) => a + "563" + b)
  .replace(/^(\s*inspector_port\s*=\s*)8083\b/m, (_m, a) => a + "56383");
fs.writeFileSync(f, t);
' "$STACK"
grep -nE "^(project_id|port|shadow_port|inspector_port)" "$STACK/supabase/config.toml"
```
Expected: `--version` says 2.116.0; the grep shows `project_id = "cm-whatsapp-standing-test"` and every port on 563xx (`56321`, `56322`, `56320`, `56329`, `56323`, `56324`, `56327`, `56383`), none on 543xx. Windows reserves some port ranges (`netsh int ipv4 show excludedportrange protocol=tcp`; on 6 October 56300 to 56399 is free): a port inside a reserved range fails as "dial ECONNREFUSED" with the container gone.

```bash
"$SB" start -x studio,imgproxy,mailpit,logflare,vector,edge-runtime,supavisor --workdir "$STACK"
eval "$("$SB" status -o env --workdir "$STACK" | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
export SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" SUPABASE_CLI="$SB" SUPABASE_WORKDIR="$STACK"
echo "$SUPABASE_URL"
```
Expected: the stack replays every migration up to 00329 (minutes); the last line prints `http://127.0.0.1:56321`. If it prints anything else, stop: the suites below make workspaces and channels, and refuse a database that is not on this machine.

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/a-number-s-standing-is-kept-and-said-when-it-changes.db.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/the-channel-quality-sweep-reads-its-numbers-from-the-database.db.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/workspace/activity.test.mjs
```
Expected: FAIL. The first fails every case on `Could not find the function public.channel_keep_standing(...)`; the second fails its older assertion (`older` lacks `waba_id`) and its two new cases (`whatsappNumberOf is not a function`); the third fails its words (`channel.standing` falls to the raw label).

- [ ] **Step 3: The migration, the kind, the words, the wrapper**

Create `supabase/migrations/00330_a_number_s_standing_is_kept_and_said_when_it_changes.sql`:

```sql
-- 00330 · What Meta holds about a number is kept, and said when it changes.
--
-- Connect WhatsApp says what Meta will ask, and the number says what Meta holds (docs/superpowers/specs/2026-10-06-whatsapp-connect-says-what-meta-asks-design.md,
-- part 3). A connected WhatsApp number's standing with Meta -- whether it may send at all (health_status.can_send_message:
-- AVAILABLE, LIMITED, BLOCKED), what stands in the way, how its display name's review fares, whether the business is verified
-- and the tier of people it may start a conversation with in a day -- was nowhere in Chanlytics: an owner who connected a number
-- and never added the payment method Meta asks for found that the messages the business starts (reminders, campaigns) were not
-- delivered while its replies were, and nothing said so. Now the edge asks
-- Meta (apps/edge/lib/whatsapp/meta-graph.ts, numberStanding) at connection, on the six-hourly channel-quality clock, and when an
-- owner opens Connections on a standing that is missing or not AVAILABLE, and keeps each answer through channel_keep_standing:
-- the whole standing and the moment it was read are merged into the channel's config as standing and standing_read_at, BESIDE
-- quality_rating, quality_read and what the webhook keeps and never over them, and a channel.standing event { from, to } is
-- written when the word of can_send differs from the last one read (the first read has no from). The merge and the event are
-- one transaction, so neither is ever kept without the other. The Connections row says what the standing says; the edge tells the
-- owner once when a number turns BLOCKED (waba-events.ts's alert path).
--
-- Why a door and not a trigger: it is a door the edge calls with what Meta answered, as channel_keep_quality (00315) is; if
-- it fails the read is counted unreadable and the next read tries again. Nothing is backfilled: a number reads absent until
-- its first read. Either deploy order works: an edge that calls this before the migration is applied counts the read as
-- unreadable (the door is not there), and the page reads a config with no standing as nothing read yet.
--
-- The lock. tenant_channels is read and updated one row at a time; nothing here alters it. The guard of 00259 is set all
-- the same, and every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.channel_keep_standing(p_tenant_id uuid, p_channel_id uuid, p_standing jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text;
  v_next text;
begin
  -- Meta's words are capital letters and underscores (AVAILABLE, LIMITED, BLOCKED); what is kept is a document with that
  -- word in it, and never one too large to be a few sentences of Meta's.
  v_next := p_standing ->> 'can_send';
  if jsonb_typeof(p_standing) is distinct from 'object'
     or v_next is null
     or v_next !~ '^[A-Z_]{2,24}$'
     or pg_column_size(p_standing) > 16384 then
    raise exception 'channel_keep_standing: not a standing' using errcode = '22023';
  end if;
  select c.config -> 'standing' ->> 'can_send' into v_prev
    from public.tenant_channels c
   where c.id = p_channel_id and c.tenant_id = p_tenant_id and c.kind = 'whatsapp'
     for update;
  if not found then
    return 'gone';
  end if;
  update public.tenant_channels
     set config = config || jsonb_build_object('standing', p_standing, 'standing_read_at', now())
   where id = p_channel_id and tenant_id = p_tenant_id;
  if v_prev is not distinct from v_next then
    return 'same';
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'channel.standing', 'system', 'channel', p_channel_id,
          jsonb_strip_nulls(jsonb_build_object('from', v_prev, 'to', v_next)));
  return case when v_prev is null then 'first' else 'changed' end;
end $$;
revoke all on function public.channel_keep_standing(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.channel_keep_standing(uuid, uuid, jsonb) to service_role;
comment on function public.channel_keep_standing(uuid, uuid, jsonb) is
  'Keeps what Meta holds about a workspace''s WhatsApp number (whether it may send, what stands in the way, its display name''s review, the business''s verification and tier): merges the whole standing and standing_read_at into the channel''s config beside quality_rating and quality_read, never over them, and writes channel.standing { from, to } when the word of can_send changed (no from on the first read), in one transaction. Answers first, changed, same, or gone (not this workspace''s WhatsApp channel); refuses (22023) a standing that is not an object with a can_send of two to 24 capital letters and underscores, or is over 16 KB. The edge''s door (readAndKeepStanding in apps/edge/lib/whatsapp/number-standing.ts): at connection, on the channel-quality clock, and when an owner asks.';
```

The kind and its words (`swap`):

```swap
##FILE packages/contracts/src/shared/enums.ts
##FROM
  "channel.quality_rating",
  /** An owner gave the workspace its email address, or changed the name beside it (00129). Who, never the address. */
##TO
  "channel.quality_rating",
  /** What Meta holds about a WhatsApp number (may it send, and what stands in the way) changed: read at connection, on a clock or when an owner asks (00330): { from?, to }, the word of can_send only. */
  "channel.standing",
  /** An owner gave the workspace its email address, or changed the name beside it (00129). Who, never the address. */
##END
##FILE packages/contracts/src/workspace/activity.ts
##FROM
import { domainHoldWords } from "../email/sending-domains";
##TO
import { domainHoldWords } from "../email/sending-domains";
import { standingChangeWords } from "../lines/number-standing";
##END
##FILE packages/contracts/src/workspace/activity.ts
##FROM
  "channel.quality_rating": "A WhatsApp number's quality rating changed",
##TO
  "channel.quality_rating": "A WhatsApp number's quality rating changed",
  "channel.standing": "A WhatsApp number's standing with Meta changed",
##END
##FILE packages/contracts/src/workspace/activity.ts
##FROM
  ["channel.connected", (p, base) => joinBits(base, [textAt(p, "verified_name")])],
##TO
  ["channel.connected", (p, base) => joinBits(base, [textAt(p, "verified_name")])],
  ["channel.standing", (p, base) => joinBits(base, [standingChangeWords(p)])],
##END
```

`packages/db` (`swap`):

```swap
##FILE packages/db/src/sweeps.ts
##FROM
 *   keepChannelQuality     the one write that sweep makes, through channel_keep_quality (00315).
##TO
 *   keepChannelQuality     the one write that sweep makes, through channel_keep_quality (00315).
 *   whatsappNumberOf       the one active WhatsApp number of a workspace, as that sweep reads a number: what an owner's
 *                          check of its standing reads (apps/edge/lib/whatsapp/number-standing.ts).
 *   keepChannelStanding    what Meta holds about the number, kept through channel_keep_standing (00330): the sweep's second
 *                          write, and the owner's check's and the connection's only one.
##END
##FILE packages/db/src/sweeps.ts
##FROM
import { PLAYBOOK_HOURS } from "@chanlytics/contracts";
##TO
import { PLAYBOOK_HOURS, type NumberStanding } from "@chanlytics/contracts";
##END
##FILE packages/db/src/sweeps.ts
##FROM
  /** Meta's phone number id: the channel's external_id. */
  phone_number_id: string;
  /** When a rating was last kept for it (config.quality_read_at); null before its first read. */
  read_at: string | null;
}
##TO
  /** Meta's phone number id: the channel's external_id. */
  phone_number_id: string;
  /** The WhatsApp Business Account the number belongs to, which the standing's verification and tier are read from; null where none is on the row. */
  waba_id: string | null;
  /** The number as the owner knows it, E.164; the words of an alert about it say it. */
  number_e164: string | null;
  /** When a rating was last kept for it (config.quality_read_at); null before its first read. */
  read_at: string | null;
}
##END
##FILE packages/db/src/sweeps.ts
##FROM
export async function whatsappNumbersToRead(db: Db, limit: number): Promise<WhatsappNumber[]> {
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, tenant_id, external_id, config")
    .eq("kind", "whatsapp")
    .eq("status", "active")
    .order("config->>quality_read_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`cannot read the WhatsApp numbers: ${error.message}`);
  return (data ?? []).map((r) => ({
    channel_id: r.id,
    tenant_id: r.tenant_id,
    phone_number_id: r.external_id,
    read_at: readAtOf(r.config),
  }));
}
##TO
export async function whatsappNumbersToRead(db: Db, limit: number): Promise<WhatsappNumber[]> {
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, tenant_id, external_id, waba_id, number_e164, config")
    .eq("kind", "whatsapp")
    .eq("status", "active")
    .order("config->>quality_read_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`cannot read the WhatsApp numbers: ${error.message}`);
  return (data ?? []).map((r) => ({
    channel_id: r.id,
    tenant_id: r.tenant_id,
    phone_number_id: r.external_id,
    waba_id: r.waba_id,
    number_e164: r.number_e164,
    read_at: readAtOf(r.config),
  }));
}

/**
 * One workspace's WhatsApp number: its oldest active channel, the one `channelFor` (contracts) picks, as the sweep reads a
 * number. Null where the workspace has none. A read that fails throws.
 */
export async function whatsappNumberOf(db: Db, tenantId: string): Promise<WhatsappNumber | null> {
  const { data, error } = await db
    .from("tenant_channels")
    .select("id, tenant_id, external_id, waba_id, number_e164, config")
    .eq("tenant_id", tenantId)
    .eq("kind", "whatsapp")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`cannot read the workspace's WhatsApp number: ${error.message}`);
  if (!data) return null;
  return {
    channel_id: data.id,
    tenant_id: data.tenant_id,
    phone_number_id: data.external_id,
    waba_id: data.waba_id,
    number_e164: data.number_e164,
    read_at: readAtOf(data.config),
  };
}
##END
##FILE packages/db/src/sweeps.ts
##FROM
  const kept = KEPT_ANSWERS.find((a) => a === data);
  if (kept === undefined) throw new Error(`channel_keep_quality: answered ${JSON.stringify(data)}`);
  return kept;
}
##TO
  const kept = KEPT_ANSWERS.find((a) => a === data);
  if (kept === undefined) throw new Error(`channel_keep_quality: answered ${JSON.stringify(data)}`);
  return kept;
}

/**
 * What Meta holds about a number, kept (channel_keep_standing, 00330): first read, changed (the word of `can_send`), the
 * same as the last, or gone (not this workspace's WhatsApp channel any more). The whole standing is kept each time, and the
 * event is written only when the word changed. Throws on the database's refusal and on an answer it does not know, so a
 * caller counts the number as unread and tries it again.
 */
export async function keepChannelStanding(
  db: Db,
  tenantId: string,
  channelId: string,
  standing: NumberStanding,
): Promise<(typeof KEPT_ANSWERS)[number]> {
  const { data, error } = await db.rpc("channel_keep_standing", {
    p_tenant_id: tenantId,
    p_channel_id: channelId,
    p_standing: standing,
  });
  if (error) throw new Error(`channel_keep_standing: ${error.message}`);
  const kept = KEPT_ANSWERS.find((a) => a === data);
  if (kept === undefined) throw new Error(`channel_keep_standing: answered ${JSON.stringify(data)}`);
  return kept;
}
##END
##FILE packages/db/src/index.ts
##FROM
export { duePlaybooks, dueCalendars, stampPlaybooksTried, whatsappNumbersToRead, keepChannelQuality } from "./sweeps";
##TO
export {
  duePlaybooks,
  dueCalendars,
  stampPlaybooksTried,
  whatsappNumbersToRead,
  whatsappNumberOf,
  keepChannelQuality,
  keepChannelStanding,
} from "./sweeps";
##END
```

- [ ] **Step 4: Apply it to the throwaway stack, regenerate what a migration changes, build**

```bash
cp supabase/migrations/00330_a_number_s_standing_is_kept_and_said_when_it_changes.sql "$STACK/supabase/migrations/"
"$SB" migration up --local --workdir "$STACK"
corepack pnpm gen:db-types
corepack pnpm gen:schema-snapshot
corepack pnpm gen:data-model
node tooling/scripts/checks/migration-ledger.mjs --record
git diff --stat -- packages/db/src/database.types.ts supabase/schema.sql docs/data-model.md supabase/migrations-ledger.json tooling/scripts/tests/_unique-keys.generated.json
```
Expected: `migration up` applies 00330 and says nothing else; `database.types.ts` gains one block, `channel_keep_standing: { Args: { p_channel_id: string; p_standing: Json; p_tenant_id: string }; Returns: string }`, beside `channel_keep_quality`; `supabase/schema.sql` gains the function, its comment and its ACL (about fifty lines, none removed); `docs/data-model.md` and `_unique-keys.generated.json` are unchanged; the ledger gains one line, `00330_a_number_s_standing_is_kept_and_said_when_it_changes.sql` with its sha256. These came from this branch's own stack, so nothing of another lane's is in them.

```bash
corepack pnpm exec prettier --write packages/contracts/src/shared/enums.ts packages/contracts/src/workspace/activity.ts packages/db/src/sweeps.ts packages/db/src/index.ts tooling/scripts/tests/workspace/activity.test.mjs tooling/scripts/tests/whatsapp/a-number-s-standing-is-kept-and-said-when-it-changes.db.test.mjs tooling/scripts/tests/whatsapp/the-channel-quality-sweep-reads-its-numbers-from-the-database.db.test.mjs
node tooling/scripts/gen/contracts-browser-entry.mjs
node -e 'const fs=require("fs");const p="packages/db/src/database.types.ts";fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"))'
corepack pnpm --filter "./packages/*" build
for f in $(git ls-files packages/contracts/dist packages/db/dist packages/jobs/dist packages/channels/dist packages/core/dist); do git diff -w --ignore-cr-at-eol --quiet -- "$f" && git checkout -- "$f"; done
git status --short packages
```
Expected: the browser entry gains nothing new (`standingChangeWords` is imported by `activity.ts` by its path and is not on a barrel); the builds change `packages/contracts/dist` (the kind) and `packages/db/dist` (the three functions and the type), and `git diff --stat -- packages/db/dist/index.d.ts` shows only the declarations this task adds.

- [ ] **Step 5: Run: the database suites on the stack, then the ones that need none**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/a-number-s-standing-is-kept-and-said-when-it-changes.db.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/the-channel-quality-sweep-reads-its-numbers-from-the-database.db.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/a-number-s-quality-is-kept-and-said-when-it-changes.db.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/privileges.db.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/generated/schema-snapshot.db.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/workspace/activity.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/event-kinds.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migrations.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migration-ledger.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/generated/check-db-types.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/generated/a-function-lives-as-its-newest-migration-wrote-it.test.mjs
corepack pnpm -r typecheck
```
Expected: all PASS, none SKIPPED in the first five (the stack's address is in the environment); `privileges.db.test.mjs` is the suite that holds the house's grant rules (a definer function with no `revoke` fails it) and passes because the migration revokes from `public, anon, authenticated` and grants the service role alone; `event-kinds.test.mjs` PASSES now both ways (the kind is declared and this migration emits it); typecheck clean (`keepChannelStanding` hands the standing to `p_standing: Json` with no cast: `NumberStanding` is a type alias of plain fields, which is a `Json`).

- [ ] **Step 6: Its number is still free; stop the stack; commit**

```bash
git fetch origin
git ls-tree --name-only origin/main supabase/migrations/ | tail -3
gh pr list --state open --json number,files -q '.[] | select(any(.files[]; .path | startswith("supabase/migrations/"))) | {number, migrations: [.files[].path | select(startswith("supabase/migrations/"))]}'
"$SB" stop --no-backup --workdir "$STACK"
rm -rf "$STACK"
unset SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_CLI SUPABASE_WORKDIR API_URL ANON_KEY SERVICE_ROLE_KEY
```
Expected: the `ls-tree` ends at 00329 (nothing above it), and the `gh` query prints nothing (no open pull request holds a migration). **If the `ls-tree` lists a 00330 or above, or the `gh` query names a pull request that holds one**, someone landed or is landing first: take the number above every one of them, `NNNNN`, then `git mv` the file to `supabase/migrations/NNNNN_a_number_s_standing_is_kept_and_said_when_it_changes.sql`, change the first line's `00330` and every place this lane's comments name it (`git grep -n 00330 -- apps packages tooling supabase/migrations` lists them: the file's header, `packages/db/src/sweeps.ts`'s header and comments, the contracts' and the edge's comments, the test headers), run `node tooling/scripts/checks/migration-ledger.mjs --record` (it re-hashes an entry this branch added and main does not hold), regenerate the schema snapshot against a stack built from the renumbered folder (the snapshot does not name the file, so it is unchanged), and say the new number in the pull request. The container is stopped and its folder removed either way.

```bash
git add supabase/migrations/00330_a_number_s_standing_is_kept_and_said_when_it_changes.sql supabase/migrations-ledger.json supabase/schema.sql packages/db/src/database.types.ts packages/db/src/sweeps.ts packages/db/src/index.ts packages/contracts/src/shared/enums.ts packages/contracts/src/workspace/activity.ts packages/*/dist tooling/scripts/tests/whatsapp/a-number-s-standing-is-kept-and-said-when-it-changes.db.test.mjs tooling/scripts/tests/whatsapp/the-channel-quality-sweep-reads-its-numbers-from-the-database.db.test.mjs tooling/scripts/tests/workspace/activity.test.mjs
git status --short docs/data-model.md tooling/scripts/tests/_unique-keys.generated.json
git commit -m "What Meta holds about a number is kept by a database door and said when it changes: migration 00330, keepChannelStanding, the channel.standing event." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 6: The edge reads what Meta holds about a number, keeps it through the door, tells the owner when it turns BLOCKED, and does so at connection

**Why:** this is the one reading. `numberStanding(token, phoneNumberId, wabaId)` (in `meta-graph.ts`, beside the other Graph calls) asks four things together, each its own request: `GET /{phone}?fields=health_status,name_status,verified_name` and, of the account, `GET /{waba}?fields=business_verification_status,whatsapp_business_manager_messaging_limit`, `GET /{waba}?fields=primary_funding_id` and `GET /{waba}?fields=owner_business_info{id}`. It answers contracts' `NumberStanding`: `can_send` (Meta's word for the number, upper-cased), `problems` (each entity's errors: `entity`, `code`, `said` = `error_description`, `fix` = `possible_solution`), `notes` (every entity's `additional_info`, once each), `name` and `name_status`, `verification`, `limit`, and from the account `has_payment_method`, `owner_business_id` and `waba_id`. Unknown words are kept as Meta said them; text is trimmed and cut at 300 characters, lists at ten; an account read that Meta refuses costs only what that read held (the verification and the tier, both null; or `has_payment_method` null; or `owner_business_id` null) and nothing else; a phone answer with no `health_status` and a word for it is a read that failed, never a standing guessed. `readAndKeepStanding` (new, `lib/whatsapp/number-standing.ts`) is what every reader calls: it reads with the workspace's token, keeps through `keepChannelStanding`, and **tells the owner once** when the number turns BLOCKED (`first` and BLOCKED, or `changed` to BLOCKED; never while it stays BLOCKED) on the path the webhook's restricted-account alert already uses (`notify`, kind "number", route Connections, the bell row and the owner's mail), in contracts' words. It never throws: a Graph refusal, a database that will not keep it and a notice that could not be sent are each an outcome and a line (`wa_standing_read_failed`, `wa_standing_keep_failed`, `wa_standing_tell_failed`, `wa_standing_told`; Meta's own words are never logged, as the quality sweep's are not, since they often name the number asked about). The connection calls it last, from the helper that already tells the platform's own record of the connection (`connected`, which is best effort and runs after the line, its token and its event are written, and which keeps the big function's size where its ratchet holds it: the call adds nothing to `connectWhatsAppNumber`), so **a failed read never fails a connection**; Task 7's sweep and Task 8's owner check call the same function.

**What this reading assumes, and the check that proves it.** Meta's reference for the WhatsApp Business Account lists `primary_funding_id` and does not say what it holds when no payment method is attached (an absent field, a null or an error), and it does not list `owner_business_info` among the account's fields. So the reading takes only what it can tell apart: an account answer with a funding id is `has_payment_method: true`, one without is `false`, and a read Meta refused or failed is `null`, which says nothing about payment; the owner's business is read from `owner_business_info{id}` and is `null` where Meta refuses it, and the note that points at Meta's page for adding a payment method then points at Meta Business Suite instead of at a link that would open on nothing (Task 1). The tests hold each of those answers. Whether Meta's real answers are the ones the code expects cannot be proven from its documentation, so it is settled once, live, by the check Task 14 ends with (Ruben's, before the merge, on the Chanlytics workspace's own account).

**Files:**
- Create: `apps/edge/lib/whatsapp/number-standing.ts`, `tooling/scripts/tests/whatsapp/number-standing.test.mjs`
- Modify: `apps/edge/lib/whatsapp/meta-graph.ts`, `apps/edge/lib/whatsapp/waba-events.ts` (`NUM` is exported), `apps/edge/lib/whatsapp/connect-number.ts`, `apps/edge/lib/log-events.ts`, `tooling/scripts/tests/whatsapp/whatsapp-connect-door.test.mjs`, `tooling/scripts/tests/edge/error-codes.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tooling/scripts/tests/whatsapp/number-standing.test.mjs`:

```js
/**
 * What Meta holds about a connected number (apps/edge/lib/whatsapp/meta-graph.ts numberStanding, number-standing.ts
 * readAndKeepStanding), run over a captured wire to Meta's Graph API that answers what the test writes, and a database in
 * memory whose keeping door answers as the SQL door does (00330: first, changed, same, gone).
 *   - the reading: the four Graph calls it makes and the token they carry (the phone's health, and three of the account's, asked
 *     apart: its verification and tier, whether it has a payment method, and the business that owns it); Meta's answer as a
 *     standing (every entity's errors and notes, its words kept as it said them, text and lists cut); an account read that Meta
 *     refuses costs only what it held, and a payment method that cannot be read is never taken for one that is missing; a number
 *     with no WABA on file asks only the phone; a phone that cannot be read, or whose answer says nothing about what it may do, is a
 *     failed read and never a standing;
 *   - the keeping and the telling: a number that turns BLOCKED is told to the owner once (the bell row and the owner's mail, in
 *     the words contracts says); one that stays BLOCKED, or turns LIMITED, or is read for the first time as AVAILABLE, is not;
 *     every way the work can fail is an outcome and a line, never a throw, and no line carries the token, a number or Meta's words.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

// The owner's mailbox is the workspace's own (tenant_config), the platform's is configured, and no environment pair exists.
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_PHONE_ID", "WHATSAPP_ACCESS_TOKEN"])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { GRAPH_VERSION, numberStanding } = await import(at("apps/edge/lib/whatsapp/meta-graph.ts"));
const { readAndKeepStanding } = await import(at("apps/edge/lib/whatsapp/number-standing.ts"));
beforeEach(() => resetBreakers());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "owner@harbor.test";
const PHONE = "106540000000001";
const WABA = "205540000000001";
const TOKEN = "EAAB-business-token-nobody-may-see";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const NUMBER = { tenant_id: A, channel_id: "ch-1", phone_number_id: PHONE, waba_id: WABA, number_e164: "+13055550142" };

/* -------------------------------- the wire -------------------------------- */

const requests = [];
const realFetch = globalThis.fetch;
/** Meta's answers, by the path asked (without the version); a case replaces it. */
let script = () => ({ status: 404, body: { error: { message: "no such thing", code: 100 } } });
globalThis.fetch = async (url, init) => {
  const u = String(url);
  requests.push({ url: u, init });
  if (u.startsWith("https://api.resend.com/")) return new Response("{}", { status: 200 });
  const a = script(u.replace(GRAPH, ""));
  if (a === "throws") throw new TypeError("fetch failed");
  return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200, headers: { "content-type": "application/json" } });
};
after(() => {
  globalThis.fetch = realFetch;
});
const graphCalls = () => requests.filter((r) => r.url.startsWith(GRAPH));
const mailSent = () => requests.filter((r) => r.url.startsWith("https://api.resend.com/")).map((r) => JSON.parse(r.init.body));
/** The business that owns the account, and the account's answers for what is asked of it apart: funded (a funding id), unfunded (none), its owner. */
const BUSINESS = "410540000000001";
const FUNDED = { body: { id: WABA, primary_funding_id: "100200300400500" } };
const UNFUNDED = { body: { id: WABA } };
const OWNED = { body: { id: WABA, owner_business_info: { id: BUSINESS } } };
/** Meta's answers by what is asked: the phone, and the account's verification and tier, its funding, and its owner. */
const asks = (phone, waba, funding = UNFUNDED, owner = OWNED) => (p) =>
  p.startsWith(`/${PHONE}?`)
    ? phone
    : p.startsWith(`/${WABA}?fields=primary_funding_id`)
      ? funding
      : p.startsWith(`/${WABA}?fields=owner_business_info`)
        ? owner
        : p.startsWith(`/${WABA}?`)
          ? waba
          : { status: 404, body: {} };

const BLOCKED_PHONE = {
  body: {
    id: PHONE,
    verified_name: "Harbor Moving",
    name_status: "APPROVED",
    health_status: {
      can_send_message: "BLOCKED",
      entities: [
        { entity_type: "PHONE_NUMBER", id: PHONE, can_send_message: "AVAILABLE" },
        {
          entity_type: "WABA",
          id: WABA,
          can_send_message: "BLOCKED",
          errors: [
            {
              error_code: 141006,
              error_description: "A payment method is required to send messages",
              possible_solution: "Add a payment method in WhatsApp Manager",
            },
          ],
        },
      ],
    },
  },
};
const WABA_ANSWER = {
  body: { id: WABA, business_verification_status: "not_verified", whatsapp_business_manager_messaging_limit: "TIER_250" },
};
/** What the keeping door is handed for the number above. */
const BLOCKED = {
  can_send: "BLOCKED",
  problems: [
    {
      entity: "WABA",
      code: 141006,
      said: "A payment method is required to send messages",
      fix: "Add a payment method in WhatsApp Manager",
    },
  ],
  notes: [],
  name: "Harbor Moving",
  name_status: "APPROVED",
  verification: "not_verified",
  limit: "TIER_250",
  has_payment_method: false,
  owner_business_id: BUSINESS,
  waba_id: WABA,
};

/* ------------------------------ the reading ------------------------------ */

test("the reading asks Meta four times, the phone's health and three things of the account, with the workspace's own token, and answers what Meta said as a standing", async () => {
  requests.length = 0;
  script = asks(
    {
      body: {
        id: PHONE,
        verified_name: "Harbor Moving",
        name_status: "PENDING_REVIEW",
        health_status: {
          can_send_message: "LIMITED",
          entities: [
            {
              entity_type: "PHONE_NUMBER",
              id: PHONE,
              can_send_message: "LIMITED",
              additional_info: ["Your display name has not been approved yet."],
            },
            { entity_type: "WABA", id: WABA, can_send_message: "AVAILABLE" },
            {
              entity_type: "BUSINESS",
              id: "5",
              can_send_message: "LIMITED",
              errors: [
                {
                  error_code: 141006,
                  error_description: "  A payment method is required to send messages  ",
                  possible_solution: "Add a payment method in WhatsApp Manager",
                },
                { error_code: "n/a", error_description: "No solution said" },
                { error_description: "" },
                null,
              ],
              additional_info: ["Your display name has not been approved yet.", 7],
            },
          ],
        },
      },
    },
    WABA_ANSWER,
    FUNDED,
  );
  const got = await numberStanding(TOKEN, PHONE, WABA);
  assert.deepEqual(got, {
    ok: true,
    data: {
      can_send: "LIMITED",
      problems: [
        {
          entity: "BUSINESS",
          code: 141006,
          said: "A payment method is required to send messages",
          fix: "Add a payment method in WhatsApp Manager",
        },
        { entity: "BUSINESS", code: null, said: "No solution said", fix: null },
      ],
      notes: ["Your display name has not been approved yet."],
      name: "Harbor Moving",
      name_status: "PENDING_REVIEW",
      verification: "not_verified",
      limit: "TIER_250",
      has_payment_method: true,
      owner_business_id: BUSINESS,
      waba_id: WABA,
    },
  });
  assert.deepEqual(
    graphCalls().map((r) => [r.init.method ?? "GET", r.url.replace(GRAPH, ""), r.init.headers.authorization]),
    [
      ["GET", `/${PHONE}?fields=health_status,name_status,verified_name`, `Bearer ${TOKEN}`],
      ["GET", `/${WABA}?fields=business_verification_status,whatsapp_business_manager_messaging_limit`, `Bearer ${TOKEN}`],
      ["GET", `/${WABA}?fields=primary_funding_id`, `Bearer ${TOKEN}`],
      ["GET", `/${WABA}?fields=owner_business_info{id}`, `Bearer ${TOKEN}`],
    ],
    "four reads, each with the business's own token, the account's three asked apart so that one Meta refuses costs only itself",
  );
});

test("a word of Meta's is kept as it said it, upper-cased where it is a status; text and lists are cut; the answer's own shape decides what is kept", async () => {
  script = asks(
    {
      body: {
        health_status: {
          can_send_message: "restricted",
          entities: Array.from({ length: 12 }, (_, i) => ({
            entity_type: "APP",
            id: String(i),
            errors: [{ error_code: 100 + i, error_description: `${i} ${"x".repeat(400)}` }],
          })),
        },
        name_status: "AVAILABLE_WITHOUT_REVIEW",
      },
    },
    { body: { business_verification_status: "pending_need_more_info", whatsapp_business_manager_messaging_limit: "UNTIERED" } },
  );
  const { ok, data } = await numberStanding(TOKEN, PHONE, WABA);
  assert.equal(ok, true);
  assert.deepEqual(
    [data.can_send, data.name, data.name_status, data.verification, data.limit],
    ["RESTRICTED", null, "AVAILABLE_WITHOUT_REVIEW", "pending_need_more_info", "UNTIERED"],
  );
  assert.equal(data.problems.length, 10, "ten at most");
  assert.ok(data.problems.every((p) => p.said.length === 300), "and each cut at three hundred characters");
});

test("each read of the account is asked apart, so one Meta refuses costs only what it held; a payment method that cannot be read is unknown and never missing; a number with no account on file asks only the phone", async () => {
  const refused = { status: 403, body: { error: { message: "(#200) Requires business_management", code: 200 } } };
  const nofield = {
    status: 400,
    body: { error: { message: "(#100) Tried accessing nonexisting field (owner_business_info) on node type (WhatsAppBusinessAccount)", code: 100 } },
  };
  const read = async (...answers) => {
    script = asks(BLOCKED_PHONE, ...answers);
    const got = await numberStanding(TOKEN, PHONE, WABA);
    assert.equal(got.ok, true, "the phone's answer is a standing whatever the account says");
    const d = got.data;
    return [d.verification, d.limit, d.has_payment_method, d.owner_business_id, d.waba_id];
  };
  assert.deepEqual(await read(WABA_ANSWER, FUNDED, OWNED), ["not_verified", "TIER_250", true, BUSINESS, WABA]);
  assert.deepEqual(await read(refused, FUNDED, OWNED), [null, null, true, BUSINESS, WABA], "no verification, no tier: the rest read");
  assert.deepEqual(await read(WABA_ANSWER, refused, OWNED), ["not_verified", "TIER_250", null, BUSINESS, WABA], "unknown, never missing");
  assert.deepEqual(await read(WABA_ANSWER, FUNDED, nofield), ["not_verified", "TIER_250", true, null, WABA], "no owner: the funding is still read");
  assert.deepEqual(await read(refused, refused, refused), [null, null, null, null, WABA], "the account refuses every read: the phone still stands");
  // An answered read with no funding id is a missing payment method; a funding id, as text or as a number, is one on file.
  assert.deepEqual((await read(WABA_ANSWER, UNFUNDED, OWNED))[2], false);
  assert.deepEqual((await read(WABA_ANSWER, { body: { id: WABA, primary_funding_id: null } }, OWNED))[2], false);
  assert.deepEqual((await read(WABA_ANSWER, { body: { id: WABA, primary_funding_id: "  " } }, OWNED))[2], false);
  assert.deepEqual((await read(WABA_ANSWER, { body: { id: WABA, primary_funding_id: 100200300 } }, OWNED))[2], true);
  // No account on file: nothing of the account is asked, and nothing of it is said.
  requests.length = 0;
  const alone = await numberStanding(TOKEN, PHONE, null);
  assert.equal(alone.ok, true);
  assert.equal(graphCalls().length, 1, "one read: there is no account to ask about");
  assert.deepEqual(
    [alone.data.verification, alone.data.limit, alone.data.has_payment_method, alone.data.owner_business_id, alone.data.waba_id],
    [null, null, null, null, null],
  );
});

test("a phone Meta will not answer, or answers with nothing about what it may do, is a read that failed: no standing is ever guessed", async () => {
  script = asks({ status: 400, body: { error: { message: "Unsupported get request.", code: 100 } } }, WABA_ANSWER);
  assert.deepEqual(await numberStanding(TOKEN, PHONE, WABA), { ok: false, error: "Unsupported get request.", code: 100, status: 400 });
  for (const body of [{ id: PHONE }, { health_status: {} }, { health_status: { can_send_message: "" } }, { health_status: "AVAILABLE" }]) {
    script = asks({ body }, WABA_ANSWER);
    const got = await numberStanding(TOKEN, PHONE, WABA);
    assert.deepEqual([got.ok, got.status, got.code], [false, 200, null], JSON.stringify(body));
  }
  script = asks("throws", WABA_ANSWER);
  assert.equal((await numberStanding(TOKEN, PHONE, WABA)).ok, false, "a dead network is a failed read, not an exception");
});

/* --------------------------- the keeping and the telling --------------------------- */

/** The log, kept: [level, event, fields]. */
function lines() {
  const said = [];
  const say = (level) => (event, fields) => said.push([level, event, fields]);
  return { said, log: { info: say("info"), warn: say("warn"), error: say("error") } };
}
/** The workspace's world: its owner's mailbox, a bell, and a keeping door that answers from `answers` in turn (or throws what it is handed). */
function world(...answers) {
  const kept = [];
  const tables = {
    notifications: [],
    tenant_config: [{ tenant_id: A, config: { notifications: { escalation_emails: [OWNER] } } }],
  };
  const db = fakeDb(tables, {}, {
    channel_keep_standing: (args) => {
      kept.push(args);
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  });
  return { tables, db, kept };
}

test("a number that turns BLOCKED is told to the owner, once: the bell row and the owner's mail say which number, Meta's problem and Meta's fix", async () => {
  requests.length = 0;
  script = asks(BLOCKED_PHONE, WABA_ANSWER);
  const w = world("first", "same", "changed");
  const { said, log } = lines();
  const ports = { db: w.db, log };
  assert.deepEqual(await readAndKeepStanding(ports, TOKEN, NUMBER), { outcome: "first", standing: BLOCKED, told: true });
  assert.deepEqual(w.kept, [{ p_tenant_id: A, p_channel_id: "ch-1", p_standing: BLOCKED }], "kept whole, for this workspace's channel");
  const body = "WhatsApp can't send from +1 (305) 555-0142: A payment method is required to send messages. Add a payment method in WhatsApp Manager.";
  assert.deepEqual(
    w.tables.notifications.map((n) => [n.tenant_id, n.kind, n.route, n.title, n.body]),
    [[A, "number", "admin/integrations", "WhatsApp can't send from your number", body]],
    "the workspace's bell, on the path the restricted-account alert uses",
  );
  const mail = mailSent();
  assert.deepEqual([mail.length, mail[0].to, mail[0].subject], [1, [OWNER], "WhatsApp can't send from your number"]);
  assert.ok(mail[0].text.includes(body), mail[0].text);
  assert.deepEqual(said.map(([level, event]) => [level, event]), [["info", "wa_standing_told"]]);

  // Still BLOCKED at the next read: nothing is said again.
  assert.deepEqual(await readAndKeepStanding(ports, TOKEN, NUMBER), { outcome: "same", standing: BLOCKED, told: false });
  assert.equal(w.tables.notifications.length + mailSent().length, 2, "no second row, no second mail");
  // Turned BLOCKED from another word: told.
  assert.equal((await readAndKeepStanding(ports, TOKEN, NUMBER)).told, true);
  assert.equal(w.tables.notifications.length, 2);
});

test("a number that is not BLOCKED is told to nobody: first read AVAILABLE, turned LIMITED, gone from the workspace", async () => {
  for (const [word, kept] of [
    ["AVAILABLE", "first"],
    ["LIMITED", "changed"],
    ["BLOCKED", "gone"],
  ]) {
    requests.length = 0;
    script = asks({ body: { health_status: { can_send_message: word, entities: [] } } }, WABA_ANSWER);
    const w = world(kept);
    const read = await readAndKeepStanding({ db: w.db, log: lines().log }, TOKEN, NUMBER);
    assert.deepEqual([read.outcome, read.told], [kept, false], `${word} ${kept}`);
    assert.deepEqual([w.tables.notifications.length, mailSent().length], [0, 0], `${word} ${kept}`);
  }
});

test("every way the work can fail is an outcome and a line, never a throw: Meta refuses, the database refuses, the owner cannot be told", async () => {
  // Meta refuses: nothing is kept, the line names the channel and what Meta said by its numbers, never its words.
  requests.length = 0;
  script = asks({ status: 400, body: { error: { message: "Object with ID '106540000000001' does not exist", code: 100 } } }, WABA_ANSWER);
  let w = world("first");
  let said = lines();
  assert.deepEqual(await readAndKeepStanding({ db: w.db, log: said.log }, TOKEN, NUMBER), { outcome: "unreadable", standing: null, told: false });
  assert.deepEqual(w.kept, [], "nothing asked of the database");
  assert.deepEqual(said.said, [["warn", "wa_standing_read_failed", { tenant_id: A, channel_id: "ch-1", status: 400, code: 100 }]]);
  // The database refuses the keeping.
  script = asks(BLOCKED_PHONE, WABA_ANSWER);
  w = world(new Error("the database refused"));
  said = lines();
  assert.deepEqual(await readAndKeepStanding({ db: w.db, log: said.log }, TOKEN, NUMBER), { outcome: "unreadable", standing: null, told: false });
  assert.deepEqual(said.said.map(([level, event]) => [level, event]), [["error", "wa_standing_keep_failed"]]);
  assert.equal(w.tables.notifications.length, 0, "a standing that was not kept is not told");
  // The owner cannot be told: the standing is kept all the same, and the outcome says so.
  w = world("first");
  said = lines();
  const read = await readAndKeepStanding(
    { db: w.db, log: said.log, tell: async () => { throw new Error("the mail provider is down"); } },
    TOKEN,
    NUMBER,
  );
  assert.deepEqual([read.outcome, read.told], ["first", false]);
  assert.deepEqual(said.said.map(([level, event]) => [level, event]), [["error", "wa_standing_tell_failed"]]);
  // A line carries the workspace and the channel, never the token, a number or Meta's own words.
  const text = JSON.stringify(said.said);
  assert.doesNotMatch(text, /EAAB|Bearer|10654000000000|3055550142|payment/);
});
```

The connection reads it too, once the line is written. The door's test world (`whatsapp-connect-door.test.mjs`) answers four Graph calls and refuses any other, so it learns the two reads, and a case holds the connection to them (`swap`):

```swap
##FILE tooling/scripts/tests/whatsapp/whatsapp-connect-door.test.mjs
##FROM
function use(over = {}, faults = {}, { vault } = {}) {
  const tables = { tenant_channels: [], events: [], ...over };
  const kept = [];
  const db = fakeDb(tables, faults, {
    put_channel_credentials:
      vault ??
      ((args) => {
        kept.push(args);
        return null;
      }),
  });
  setPg(db);
  return { tables, db, kept };
}
##TO
function use(over = {}, faults = {}, { vault } = {}) {
  const tables = { tenant_channels: [], events: [], ...over };
  const kept = [];
  const standings = [];
  const db = fakeDb(tables, faults, {
    put_channel_credentials:
      vault ??
      ((args) => {
        kept.push(args);
        return null;
      }),
    // What Meta holds about the number, kept (00330): the door's own words are held in a-number-s-standing-is-kept-and-said-when-it-changes.db.test.mjs.
    channel_keep_standing: (args) => {
      standings.push(args);
      return "first";
    },
  });
  setPg(db);
  return { tables, db, kept, standings };
}
##END
##FILE tooling/scripts/tests/whatsapp/whatsapp-connect-door.test.mjs
##FROM
function meta({ number = {}, numberRefused, register, exchange, waba, subscribe, onRegister } = {}) {
##TO
function meta({ number = {}, numberRefused, register, exchange, waba, subscribe, onRegister, health, wabaStanding, funding, owner } = {}) {
##END
##FILE tooling/scripts/tests/whatsapp/whatsapp-connect-door.test.mjs
##FROM
    if (p.startsWith(`/${PHONE}?fields=`))
      return (
##TO
    // What Meta holds about the number, read once the line is written: a number that may send, in a verified business.
    if (p.startsWith(`/${PHONE}?fields=health_status`))
      return (
        health ?? {
          body: {
            id: PHONE,
            verified_name: "Harbor Moving",
            name_status: "APPROVED",
            health_status: { can_send_message: "AVAILABLE", entities: [] },
          },
        }
      );
    if (p.startsWith(`/${WABA}?fields=business_verification_status`))
      return (
        wabaStanding ?? {
          body: {
            id: WABA,
            business_verification_status: "verified",
            whatsapp_business_manager_messaging_limit: "TIER_250",
          },
        }
      );
    // ...and whether the account has a payment method, and the business that owns it: a funded account, by default.
    if (p.startsWith(`/${WABA}?fields=primary_funding_id`))
      return funding ?? { body: { id: WABA, primary_funding_id: "100200300400500" } };
    if (p.startsWith(`/${WABA}?fields=owner_business_info`))
      return owner ?? { body: { id: WABA, owner_business_info: { id: "410540000000001" } } };
    if (p.startsWith(`/${PHONE}?fields=`))
      return (
##END
##FILE tooling/scripts/tests/whatsapp/whatsapp-connect-door.test.mjs
##FROM
      `GET /${WABA}`,
      `POST /${WABA}/subscribed_apps`,
      `POST /${PHONE}/register`,
    ],
    "the four Graph calls, in order",
  );
##TO
      `GET /${WABA}`,
      `POST /${WABA}/subscribed_apps`,
      `POST /${PHONE}/register`,
      `GET /${PHONE}`,
      `GET /${WABA}`,
      `GET /${WABA}`,
      `GET /${WABA}`,
    ],
    "the four Graph calls, in order, and then the four that read what Meta holds about the number",
  );
##END
##FILE tooling/scripts/tests/whatsapp/whatsapp-connect-door.test.mjs
##FROM
  assert.ok(
    log.lines.some((l) => l.includes('"event":"wa_connected"') && l.includes(row.id)),
    "the log says which channel connected",
  );
});
##TO
  assert.ok(
    log.lines.some((l) => l.includes('"event":"wa_connected"') && l.includes(row.id)),
    "the log says which channel connected",
  );
});

test("connect, what Meta holds about the number: read once the line and its token are written, kept whole through the door, and told to the owner when Meta says the number cannot send -- the payment method Meta asks for at the end of its window is the problem its fixture names; a read that fails never fails the connection", async () => {
  const blocked = {
    body: {
      id: PHONE,
      verified_name: "Harbor Moving",
      name_status: "APPROVED",
      health_status: {
        can_send_message: "BLOCKED",
        entities: [
          {
            entity_type: "WABA",
            id: WABA,
            can_send_message: "BLOCKED",
            errors: [
              {
                error_code: 141006,
                error_description: "A payment method is required to send messages",
                possible_solution: "Add a payment method in WhatsApp Manager",
              },
            ],
          },
        ],
      },
    },
  };
  const { tables, standings } = use({
    notifications: [],
    tenant_config: [{ tenant_id: A, config: { notifications: { escalation_emails: ["owner@harbor.test"] } } }],
  });
  // The account has no payment method on file (its funding read answers without a funding id), and says who owns it.
  const m = meta({ health: blocked, funding: { body: { id: WABA } } });
  const log = quiet();
  let status, body;
  try {
    [status, body] = await answer(await knock(signedUp()));
  } finally {
    log.restore();
    m.restore();
  }
  assert.equal(status, 200, printed(body));
  const [phoneRead, wabaRead, fundingRead, ownerRead] = m.seen.slice(-4);
  assert.equal(phoneRead.url, `${GRAPH}/${PHONE}?fields=health_status,name_status,verified_name`);
  assert.equal(
    wabaRead.url,
    `${GRAPH}/${WABA}?fields=business_verification_status,whatsapp_business_manager_messaging_limit`,
  );
  assert.equal(fundingRead.url, `${GRAPH}/${WABA}?fields=primary_funding_id`);
  assert.equal(ownerRead.url, `${GRAPH}/${WABA}?fields=owner_business_info{id}`);
  for (const r of [phoneRead, wabaRead, fundingRead, ownerRead])
    assert.equal(r.headers.authorization, `Bearer ${TOKEN}`, r.url);
  const row = tables.tenant_channels[0];
  assert.deepEqual(standings, [
    {
      p_tenant_id: A,
      p_channel_id: row.id,
      p_standing: {
        can_send: "BLOCKED",
        problems: [
          {
            entity: "WABA",
            code: 141006,
            said: "A payment method is required to send messages",
            fix: "Add a payment method in WhatsApp Manager",
          },
        ],
        notes: [],
        name: "Harbor Moving",
        name_status: "APPROVED",
        verification: "verified",
        limit: "TIER_250",
        has_payment_method: false,
        owner_business_id: "410540000000001",
        waba_id: WABA,
      },
    },
  ]);
  assert.deepEqual(
    tables.notifications.map((n) => [n.tenant_id, n.kind, n.route, n.title]),
    [[A, "number", "admin/integrations", "WhatsApp can't send from your number"]],
    "the owner's bell says it now, not at the next six-hourly read",
  );
  assert.ok(tables.notifications[0].body.includes("+1 (555) 123-4567: A payment method is required"));
  assert.ok(!printed(body).includes("BLOCKED"), "and the connection's answer is the connection's, unchanged");

  // Meta cannot be asked, or refuses: the connection stands.
  const down = use();
  const m2 = meta({ health: { status: 500, body: { error: { message: "Service unavailable", code: 2 } } } });
  const log2 = quiet();
  try {
    [status, body] = await answer(await knock(signedUp()));
  } finally {
    log2.restore();
    m2.restore();
  }
  assert.equal(status, 200, "a standing that could not be read does not undo a connection");
  assert.equal(down.tables.tenant_channels.length, 1);
  assert.deepEqual(down.standings, [], "nothing was kept");
  assert.ok(log2.lines.some((l) => l.includes('"event":"wa_standing_read_failed"')));
});
##END
```

- [ ] **Step 2: Run them to verify they fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/number-standing.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/whatsapp-connect-door.test.mjs
```
Expected: FAIL: the first at load (`apps/edge/lib/whatsapp/number-standing.ts` cannot be found); the second at its whole-way case (the Graph calls are the four, with no standing read after) and at the new one (`m.seen.slice(-2)` are the register and the subscribe, and `standings` is empty). Every other connect case PASSES.

- [ ] **Step 3: The reading, the module that keeps and tells, the connection that calls it**

The Graph calls and Meta's answer as a standing, in `meta-graph.ts` (`swap`):

```swap
##FILE apps/edge/lib/whatsapp/meta-graph.ts
##FROM
import { env } from "../env.js";
import { providerFetch } from "../packages/channels.js";
##TO
import { env } from "../env.js";
import { providerFetch } from "../packages/channels.js";
import type { NumberStanding } from "../packages/contracts.js";
##END
##FILE apps/edge/lib/whatsapp/meta-graph.ts
##FROM
/** Subscribe this app to the WABA's webhooks; without it, its messages never reach us. */
##TO
/** Meta's text cut to what an owner reads and a row keeps: a sentence, never a page. */
const STANDING_TEXT_MAX = 300;
/** The most problems, and the most notes, one standing keeps. */
const STANDING_LIST_MAX = 10;
/** What a read says when Meta answered and the answer holds no word for what the number may do (a Graph result's own sentence, never a refusal's code). */
const NO_HEALTH_STATUS = "the answer holds no health_status";

const graphRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const graphList = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : []);
const graphText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, STANDING_TEXT_MAX) : null;

/** Whether an answer holds a value that says something: text that is not blank, or a number (Meta's ids come as text, and as numbers in some answers). */
const graphPresent = (v: unknown): boolean => typeof v === "number" || graphText(v) !== null;

/** What the account said, one answer to each thing asked of it apart: the data Meta answered, or null where it refused or was not asked. */
interface AccountAnswers {
  verification: unknown;
  funding: unknown;
  owner: unknown;
}

/**
 * Meta's answers as a standing: the phone's `health_status` (the word for whether it may send, and every entity's errors and
 * `additional_info`), its display name and the name's review, and the account's verification and tier, whether it has a payment
 * method (its `primary_funding_id` is there) and the business that owns it. Null where the phone's answer holds no `health_status`
 * with a word for it: that is a read that failed, never a standing guessed. What Meta said is kept as it said it (the word for
 * `can_send_message` upper-cased; text trimmed and cut; lists cut). An account read that failed leaves what it held null. A funding
 * answer with no funding id is a payment method that is missing; a funding read that failed is one that is unknown, never missing.
 */
function standingFromGraph(phone: unknown, account: AccountAnswers, wabaId: string | null): NumberStanding | null {
  const p = graphRecord(phone);
  const health = graphRecord(p?.health_status);
  const canSend = graphText(health?.can_send_message)?.toUpperCase();
  if (!p || !health || !canSend) return null;
  const problems: NumberStanding["problems"] = [];
  const notes: string[] = [];
  for (const raw of graphList(health.entities)) {
    const entity = graphRecord(raw);
    if (!entity) continue;
    const kind = graphText(entity.entity_type) ?? "UNKNOWN";
    for (const e of graphList(entity.errors)) {
      const error = graphRecord(e);
      const said = graphText(error?.error_description);
      if (!error || !said) continue;
      problems.push({
        entity: kind,
        code: typeof error.error_code === "number" ? error.error_code : null,
        said,
        fix: graphText(error.possible_solution),
      });
    }
    for (const info of graphList(entity.additional_info)) {
      const note = graphText(info);
      if (note && !notes.includes(note)) notes.push(note);
    }
  }
  const w = graphRecord(account.verification);
  const funding = graphRecord(account.funding);
  const owner = graphRecord(graphRecord(account.owner)?.owner_business_info);
  return {
    can_send: canSend,
    problems: problems.slice(0, STANDING_LIST_MAX),
    notes: notes.slice(0, STANDING_LIST_MAX),
    name: graphText(p.verified_name),
    name_status: graphText(p.name_status),
    verification: graphText(w?.business_verification_status),
    limit: graphText(w?.whatsapp_business_manager_messaging_limit),
    has_payment_method: funding ? graphPresent(funding.primary_funding_id) : null,
    owner_business_id: graphText(owner?.id),
    waba_id: wabaId,
  };
}

/**
 * What Meta holds about a connected number now: may it send (AVAILABLE, LIMITED or BLOCKED, and what stands in the way), how its
 * display name's review fares, whether the business is verified and at which tier, whether the account has a payment method and
 * which business owns it. Four reads together with the business's own token: the phone's, and three of the account's, asked
 * apart so that one Meta refuses (a permission the token lacks, a field the node does not have) costs only what it held. A
 * number with no account on file asks only the phone; a phone that cannot be read, or answers nothing about what it may do,
 * is the failed read it is.
 */
export async function numberStanding(
  token: string,
  phoneNumberId: string,
  wabaId: string | null,
): Promise<GraphResult<NumberStanding>> {
  const account = (fields: string) =>
    wabaId
      ? graphCall<unknown>(`/${encodeURIComponent(wabaId)}?fields=${fields}`, { method: "GET", token })
      : Promise.resolve(null);
  const [phone, verification, funding, owner] = await Promise.all([
    graphCall<unknown>(`/${encodeURIComponent(phoneNumberId)}?fields=health_status,name_status,verified_name`, {
      method: "GET",
      token,
    }),
    account("business_verification_status,whatsapp_business_manager_messaging_limit"),
    account("primary_funding_id"),
    account("owner_business_info{id}"),
  ]);
  if (!phone.ok) return phone;
  const standing = standingFromGraph(
    phone.data,
    {
      verification: verification?.ok ? verification.data : null,
      funding: funding?.ok ? funding.data : null,
      owner: owner?.ok ? owner.data : null,
    },
    wabaId,
  );
  return standing
    ? { ok: true, data: standing }
    : { ok: false, error: NO_HEALTH_STATUS, code: null, status: 200 };
}

/** Subscribe this app to the WABA's webhooks; without it, its messages never reach us. */
##END
```

The alert path's own constant is shared, not copied (`swap`):

```swap
##FILE apps/edge/lib/whatsapp/waba-events.ts
##FROM
/** The number's own health: Connections, under a shield. */
const NUM = { kind: "number" as const, route: "admin/integrations" };
##TO
/** The number's own health: Connections, under a shield. Read by what tells an owner of a number's standing too (number-standing.ts). */
export const NUM = { kind: "number" as const, route: "admin/integrations" };
##END
```

Create `apps/edge/lib/whatsapp/number-standing.ts`:

```ts
/**
 * What Meta holds about a connected WhatsApp number, read, kept, and told when it turns bad.
 *
 * `readAndKeepStanding` is what every reader calls: the connection (right after the line is written), the channel-quality
 * sweep (lib/whatsapp/number-quality.ts, each due number beside its rating, with the same token) and an owner's check from
 * Connections. It reads (numberStanding), keeps whole through the database's door (channel_keep_standing, 00330), and tells the
 * owner ONCE when the number turns BLOCKED: the door's `first` or `changed` with a BLOCKED word, never `same`, so a number
 * that stays blocked is not said every six hours. The notice is the one the webhook's restricted-account alert is (waba-events
 * `NUM`, `notify`: the bell row and the owner's mail), in contracts' words (standingAlertWords).
 *
 * It never throws. A Graph refusal, a database that will not keep the standing and a notice that could not be sent are each an
 * outcome and a line (`wa_standing_read_failed`, `wa_standing_keep_failed`, `wa_standing_tell_failed`; `wa_standing_told` when
 * the owner was told). A line carries the workspace and the channel by id, Meta's answer by its status and code, and never a
 * token, a number or Meta's own words (they often name the number asked about, as the quality sweep's do not either).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { keepChannelStanding, type Database, type WhatsappNumber } from "../packages/db.js";
import { standingAlertWords, type NumberStanding } from "../packages/contracts.js";
import { errField, type Logger } from "../log.js";
import { notify } from "../ops/notify.js";
import { numberStanding } from "./meta-graph.js";
import { NUM, notificationsFor } from "./waba-events.js";

/** What one read came to: the door's own answer when the standing was kept, else that it could not be. */
export type StandingOutcome = "first" | "changed" | "same" | "gone" | "unreadable";

/** What one read did: the outcome, the standing it kept (null when it kept none), and whether the owner was told. */
interface StandingRead {
  outcome: StandingOutcome;
  standing: NumberStanding | null;
  told: boolean;
}

interface StandingPorts {
  db: SupabaseClient<Database>;
  log: Logger;
  /** Meta's read, and the owner's notice: the real ones unless a test hands others. */
  read?: typeof numberStanding;
  tell?: typeof notify;
}

/** The number as a read needs it: the channel, Meta's ids and the number the alert names. */
type NumberAsked = Pick<WhatsappNumber, "tenant_id" | "channel_id" | "phone_number_id" | "waba_id" | "number_e164">;

/** The owner told, on the bell and by mail. True where the notice was handed on; a notice that could not be is a line, never a throw. */
async function tellBlocked(p: StandingPorts, n: NumberAsked, standing: NumberStanding): Promise<boolean> {
  try {
    const words = standingAlertWords(n.number_e164, standing);
    const target = {
      tenantId: n.tenant_id,
      notifications: await notificationsFor(p.db, n.tenant_id),
      isEnvDefault: false,
    };
    await (p.tell ?? notify)(target, { ...NUM, subject: words.subject, body: words.body }, { db: p.db });
    p.log.info("wa_standing_told", { tenant_id: n.tenant_id, channel_id: n.channel_id });
    return true;
  } catch (e) {
    p.log.error("wa_standing_tell_failed", { tenant_id: n.tenant_id, channel_id: n.channel_id, error: errField(e) });
    return false;
  }
}

/** One number: Meta's answer, the door, and the owner's notice when it turned BLOCKED. Every failure is an outcome and a line. */
export async function readAndKeepStanding(p: StandingPorts, token: string, n: NumberAsked): Promise<StandingRead> {
  const read = p.read ?? numberStanding;
  try {
    const got = await read(token, n.phone_number_id, n.waba_id);
    if (!got.ok) {
      p.log.warn("wa_standing_read_failed", {
        tenant_id: n.tenant_id,
        channel_id: n.channel_id,
        status: got.status,
        code: got.code,
      });
      return { outcome: "unreadable", standing: null, told: false };
    }
    const kept = await keepChannelStanding(p.db, n.tenant_id, n.channel_id, got.data);
    const turned = (kept === "first" || kept === "changed") && got.data.can_send === "BLOCKED";
    return { outcome: kept, standing: got.data, told: turned ? await tellBlocked(p, n, got.data) : false };
  } catch (e) {
    p.log.error("wa_standing_keep_failed", { tenant_id: n.tenant_id, channel_id: n.channel_id, error: errField(e) });
    return { outcome: "unreadable", standing: null, told: false };
  }
}
```

The connection calls it last (`swap`):

```swap
##FILE apps/edge/lib/whatsapp/connect-number.ts
##FROM
} from "./meta-graph.js";
import { env } from "../env.js";
##TO
} from "./meta-graph.js";
import { readAndKeepStanding } from "./number-standing.js";
import { env } from "../env.js";
##END
##FILE apps/edge/lib/whatsapp/connect-number.ts
##FROM
/**
 * The connection told to the platform's own record: the event that a number was connected, and the workspace's first line
 * that answers, the funnel's first milestone (a phone line is the other door). Best effort: the connection stands either way.
 */
async function connected(
  db: NonNullable<ReturnType<typeof pg>>,
  tenantId: string,
  channelId: string,
  n: { phoneNumberId: string; wabaId: string; e164: string | null; name: string | null; by: string },
): Promise<void> {
##TO
/**
 * The connection told to the platform's own record: the event that a number was connected, and the workspace's first line
 * that answers, the funnel's first milestone (a phone line is the other door); then what Meta holds about the number now, kept
 * and told if Meta says it cannot send. The payment method Meta asks for at the end of its sign-up window is what a business that
 * skipped it finds out here, in the Connections row and a notice, instead of from the messages it starts that never go. Best
 * effort: the connection stands either way (readAndKeepStanding never throws, and says what it could not do), so a read that
 * fails costs the row its notes and never the connection.
 */
async function connected(
  db: NonNullable<ReturnType<typeof pg>>,
  tenantId: string,
  channelId: string,
  n: { phoneNumberId: string; wabaId: string; e164: string | null; name: string | null; by: string; token: string },
): Promise<void> {
##END
##FILE apps/edge/lib/whatsapp/connect-number.ts
##FROM
  await recordActivation(db, tenantId, "line_live", "whatsapp").catch(() => false);
}
##TO
  await recordActivation(db, tenantId, "line_live", "whatsapp").catch(() => false);
  const log = logger({ tenant_id: tenantId, phone_number_id: n.phoneNumberId, waba_id: n.wabaId });
  await readAndKeepStanding({ db, log }, n.token, {
    tenant_id: tenantId,
    channel_id: channelId,
    phone_number_id: n.phoneNumberId,
    waba_id: n.wabaId,
    number_e164: n.e164,
  });
}
##END
##FILE apps/edge/lib/whatsapp/connect-number.ts
##FROM
  await connected(db, tenantId, row.id, { phoneNumberId, wabaId, e164, name: config.verified_name, by: userId });
  L.info("wa_connected", { channel_id: row.id, number: e164, registration: config.registration });
##TO
  await connected(db, tenantId, row.id, { phoneNumberId, wabaId, e164, name: config.verified_name, by: userId, token });
  L.info("wa_connected", { channel_id: row.id, number: e164, registration: config.registration });
##END
```

The one sentence a read says of an answer that holds no `health_status` is a Graph result's own, in the same shape as the other Graph results (`{ ok: false, error, code, status }`), and the edge's error-code lint measures that shape: it is named, as Meta's own answers are, where the lint says what is no door's answer (`swap`):

```swap
##FILE tooling/scripts/tests/edge/error-codes.test.mjs
##FROM
  "apps/edge/lib/whatsapp/meta-graph.ts": ["String(res.error)", "body.error?.message ?? `graph ${res.status}`"],
##TO
  "apps/edge/lib/whatsapp/meta-graph.ts": [
    "String(res.error)",
    "body.error?.message ?? `graph ${res.status}`",
    "NO_HEALTH_STATUS", // numberStanding's: Meta answered, and nothing of it says what the number may do
  ],
##END
```

The names join the closed set (`swap`):

```swap
##FILE apps/edge/lib/log-events.ts
##FROM
  "wa_stale_escalated",
  "wa_state_unavailable",
##TO
  "wa_stale_escalated",
  "wa_standing_keep_failed",
  "wa_standing_read_failed",
  "wa_standing_tell_failed",
  "wa_standing_told",
  "wa_state_unavailable",
##END
```

- [ ] **Step 4: Format, run**

```bash
corepack pnpm exec prettier --write apps/edge/lib/whatsapp/meta-graph.ts apps/edge/lib/whatsapp/number-standing.ts apps/edge/lib/whatsapp/waba-events.ts apps/edge/lib/whatsapp/connect-number.ts apps/edge/lib/log-events.ts tooling/scripts/tests/whatsapp/number-standing.test.mjs tooling/scripts/tests/whatsapp/whatsapp-connect-door.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/number-standing.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/whatsapp-connect-door.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/whatsapp-connect.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/log-events.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/edge/error-codes.test.mjs
corepack pnpm --filter @chanlytics/edge typecheck
```
Expected: all PASS. `whatsapp-connect.test.mjs` (the alert path's own words, `describeWabaChange`) is untouched by `NUM` becoming an export; `whatsapp-door.test.mjs` runs the same webhook alert over the same `notify`.

- [ ] **Step 5: Commit**

```bash
git add apps/edge/lib/whatsapp/meta-graph.ts apps/edge/lib/whatsapp/number-standing.ts apps/edge/lib/whatsapp/waba-events.ts apps/edge/lib/whatsapp/connect-number.ts apps/edge/lib/log-events.ts tooling/scripts/tests/whatsapp/number-standing.test.mjs tooling/scripts/tests/whatsapp/whatsapp-connect-door.test.mjs tooling/scripts/tests/edge/error-codes.test.mjs
git commit -m "The edge reads what Meta holds about a number and keeps it through the door, tells the owner once when it turns blocked, and does so as a number is connected." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 7: The channel-quality sweep reads what Meta holds beside each rating, and tells the owner once when a number turns BLOCKED

**Why:** the six-hourly clock already visits every connected number with its own workspace's token. It now asks Meta what the number may do in the same visit: for each due number the rating and the standing are read **together** (`Promise.all`), so a number still costs one Graph timeout of the tick's time, and the standing goes through `readAndKeepStanding` (Task 6): kept whole through `channel_keep_standing`, and the owner told when it turns BLOCKED, never while it stays BLOCKED. The two reads fail apart: a rating that cannot be read leaves the standing's read to run, and the other way round. The tick's answer and its closing log line count the standing's outcomes beside the rating's, flat, so every number asked is in exactly one of `standing_first`, `standing_changed`, `standing_same`, `standing_gone` and `standing_unreadable` (a number with no credentials is asked of Meta for neither), and `standing_told` counts the owners told. `whatsappNumbersToRead` already answers each number's WABA and number (Task 5). The sweep's time budget is the one thing that moves: a read may now also end in a notice (`NOTIFY_TIMEOUT_MS`), so `ops-hygiene.test.mjs` holds the sum of the yield, Graph's bound, the notice and the writes under the door's limit (30 + 15 + 10 + 3 seconds against 60).

**Files:**
- Modify: `apps/edge/lib/whatsapp/number-quality.ts` (whole file), `apps/edge/api/cron/channel-quality.ts` (its header), `tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs`, `tooling/scripts/tests/repo/ops-hygiene.test.mjs`

- [ ] **Step 1: Write the failing tests**

The sweep's own tests ask Meta through a wire that answers by the phone number id, count its calls, and compare the tick's answer whole, so they learn the standing: a scripted `standing` per number (a number whose answer is not scripted leaves its standing unreadable), the keeping door as SQL answers it, and the new counts (`swap`):

```swap
##FILE tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs
##FROM
function world(channels, over = {}) {
  const tables = { tenant_channels: channels };
  const kept = [];
  const db = fakeDb(tables, over.faults ?? {}, {
##TO
function world(channels, over = {}) {
  // The owner's mailbox is the workspace's own, and the bell is a table: what a number that turns BLOCKED is told through.
  const tables = {
    tenant_channels: channels,
    notifications: [],
    tenant_config: channels.map((c) => ({ tenant_id: c.tenant_id, config: { notifications: { escalation_emails: ["owner@harbor.test"] } } })),
  };
  const kept = [];
  const standings = [];
  const db = fakeDb(tables, over.faults ?? {}, {
##END
##FILE tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs
##FROM
      return was === null ? "first" : was === p_rating ? "same" : "changed";
    },
  });
  setPg(db);
  return { tables, db, kept };
}
##TO
      return was === null ? "first" : was === p_rating ? "same" : "changed";
    },
    // What Meta holds about the number, kept as the SQL door keeps it (00330): whole, beside the rating.
    channel_keep_standing: ({ p_tenant_id, p_channel_id, p_standing }) => {
      if (over.refuseStanding?.includes(p_channel_id)) throw new Error("the database refused");
      if (over.goneStanding?.includes(p_channel_id)) return "gone";
      standings.push([p_tenant_id, p_channel_id, p_standing.can_send]);
      const ch = tables.tenant_channels.find((c) => c.id === p_channel_id);
      const was = ch.config.standing?.can_send ?? null;
      ch.config = { ...ch.config, standing: p_standing, standing_read_at: new Date().toISOString() };
      return was === null ? "first" : was === p_standing.can_send ? "same" : "changed";
    },
  });
  setPg(db);
  return { tables, db, kept, standings };
}
##END
##FILE tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs
##FROM
function graph(answers) {
  return wire((url) => {
    const id = /\/(\d{15})\?/.exec(url)?.[1];
    const a = answers[id] ?? { status: 404, body: { error: { message: "no such number" } } };
##TO
function graph(answers) {
  return wire((url) => {
    if (url.startsWith("https://api.resend.com/")) return new Response("{}", { status: 200 });
    const id = /\/(\d{15})\?/.exec(url)?.[1];
    // A number's rating is the answer itself; what Meta holds about it is more reads (the phone's health, and the account's
    // verification, funding and owner), scripted as `standing`, `waba`, `funding` and `owner`: a number with none scripted has a
    // standing that cannot be read.
    const asked = url.includes("fields=health_status")
      ? "standing"
      : url.includes("fields=business_verification_status")
        ? "waba"
        : url.includes("fields=primary_funding_id")
          ? "funding"
          : url.includes("fields=owner_business_info")
            ? "owner"
            : null;
    const a = (asked ? answers[id]?.[asked] : answers[id]) ?? { status: 404, body: { error: { message: "no such number" } } };
##END
##FILE tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs
##FROM
const rating = (word) => ({ body: { id: "x", quality_rating: word } });
##TO
const rating = (word) => ({ body: { id: "x", quality_rating: word } });
/** Meta's answer for a number that may send (AVAILABLE), is limited, or is blocked, naming a missing payment method as its problem. */
const health = (word) => ({
  body: {
    id: "x",
    verified_name: "Harbor Moving",
    name_status: "APPROVED",
    health_status: {
      can_send_message: word,
      entities:
        word === "BLOCKED"
          ? [
              {
                entity_type: "WABA",
                id: "1",
                errors: [
                  {
                    error_code: 141006,
                    error_description: "A payment method is required to send messages",
                    possible_solution: "Add a payment method in WhatsApp Manager",
                  },
                ],
              },
            ]
          : [],
    },
  },
});
/** The calls that read a rating: what the sweep asked before it asked what a number may do. */
const ratingCalls = (g) => g.calls.filter((c) => c.url.includes("quality_rating"));
/** A standing that is not asked in a test that calls the sweep with its own reads: nothing here may reach a wire. */
const NOT_ASKED = async () => ({ ok: false, error: "not asked in this test", code: null, status: 0 });
##END
##FILE tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs
##FROM
      due: 2,
      read: 2,
      first: 1,
      changed: 1,
      same: 0,
      gone: 0,
      no_token: 0,
      unreadable: 0,
      not_a_rating: 0,
      left: 0,
    });
##TO
      due: 2,
      read: 2,
      first: 1,
      changed: 1,
      same: 0,
      gone: 0,
      no_token: 0,
      unreadable: 0,
      not_a_rating: 0,
      left: 0,
      standing_first: 0,
      standing_changed: 0,
      standing_same: 0,
      standing_gone: 0,
      standing_unreadable: 2,
      standing_told: 0,
    });
##END
##FILE tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs
##FROM
    assert.equal(g.calls.length, 2, "two reads, not five");
    assert.deepEqual(
      g.calls.map((c) => [/\/(\d{15})\?/.exec(c.url)[1], c.init.headers.authorization]),
      [
        ["106540000000001", "Bearer token-ch-1"],
        ["106540000000003", "Bearer token-ch-3"],
      ],
      "each with its own workspace's token",
    );
    assert.ok(g.calls.every((c) => c.url.includes("fields=") && c.url.includes("quality_rating")));
##TO
    assert.equal(ratingCalls(g).length, 2, "two ratings read, not five");
    assert.deepEqual(
      ratingCalls(g).map((c) => [/\/(\d{15})\?/.exec(c.url)[1], c.init.headers.authorization]),
      [
        ["106540000000001", "Bearer token-ch-1"],
        ["106540000000003", "Bearer token-ch-3"],
      ],
      "each with its own workspace's token",
    );
    assert.ok(ratingCalls(g).every((c) => c.url.includes("fields=") && c.url.includes("quality_rating")));
    assert.equal(g.calls.length, 4, "and what each number may do, asked beside it (here unreadable: nothing is scripted)");
##END
##FILE tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs
##FROM
    started: t0,
    yieldAtMs: YIELD_AT_MS,
    read: async (_token, id) => (asked.push(id), { ok: true, data: { quality_rating: "GREEN" } }),
##TO
    started: t0,
    yieldAtMs: YIELD_AT_MS,
    standing: NOT_ASKED,
    read: async (_token, id) => (asked.push(id), { ok: true, data: { quality_rating: "GREEN" } }),
##END
##FILE tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs
##FROM
    started: Date.now(),
    yieldAtMs: YIELD_AT_MS,
    read: async (_token, id) => (asked.push(id), { ok: true, data: { quality_rating: "GREEN" } }),
##TO
    started: Date.now(),
    yieldAtMs: YIELD_AT_MS,
    standing: NOT_ASKED,
    read: async (_token, id) => (asked.push(id), { ok: true, data: { quality_rating: "GREEN" } }),
##END
##FILE tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs
##FROM
      due: 6,
      read: 2,
      first: 1,
      changed: 0,
      same: 1,
      gone: 1,
      no_token: 1,
      unreadable: 2,
      not_a_rating: 0,
      left: 0,
    });
##TO
      due: 6,
      read: 2,
      first: 1,
      changed: 0,
      same: 1,
      gone: 1,
      no_token: 1,
      unreadable: 2,
      not_a_rating: 0,
      left: 0,
      standing_first: 0,
      standing_changed: 0,
      standing_same: 0,
      standing_gone: 0,
      standing_unreadable: 4,
      standing_told: 0,
    });
##END
##FILE tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs
##FROM
    assert.deepEqual(
      g.calls.map((c) => /\/(\d{15})\?/.exec(c.url)[1]),
      ["106540000000002", "106540000000004", "106540000000001", "106540000000005"],
##TO
    assert.deepEqual(
      ratingCalls(g).map((c) => /\/(\d{15})\?/.exec(c.url)[1]),
      ["106540000000002", "106540000000004", "106540000000001", "106540000000005"],
##END
##FILE tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs
##FROM
    const events = said.map(([, event]) => event);
    assert.deepEqual(events.sort(), ["channel_quality_read_failed", "channel_quality_row_failed"]);
##TO
    const events = said.map(([, event]) => event).filter((event) => event.startsWith("channel_quality_"));
    assert.deepEqual(events.sort(), ["channel_quality_read_failed", "channel_quality_row_failed"]);
##END
##FILE tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs
##FROM
    gone: 0,
    tokenless: 2,
    unreadable: 0,
    not_a_rating: 0,
    left: 0,
  });
});
##TO
    gone: 0,
    tokenless: 2,
    unreadable: 0,
    not_a_rating: 0,
    left: 0,
    standing_first: 0,
    standing_changed: 0,
    standing_same: 0,
    standing_gone: 0,
    standing_unreadable: 1,
    standing_told: 0,
  });
});

test("beside each rating the sweep asks what Meta holds about the number, with the same token, and keeps it whole; the owner is told once when a number turns BLOCKED, and the tick counts every standing it asked for", async () => {
  const blocked = (can_send, extra = {}) => ({
    standing: {
      can_send,
      problems: [],
      notes: [],
      name: null,
      name_status: null,
      verification: null,
      limit: null,
      has_payment_method: null,
      owner_business_id: null,
      waba_id: null,
      ...extra,
    },
  });
  const w = world(
    [
      channel(1, { waba_id: "205540000000001", number_e164: "+13055550142" }), // never read: Meta says BLOCKED, and is asked of its account too
      channel(2, { config: { standing: blocked("BLOCKED").standing } }), // BLOCKED before, and still: not told again
      channel(3, { config: { standing: blocked("AVAILABLE").standing } }), // AVAILABLE before, LIMITED now: kept, not told
      channel(4, { config: { standing: blocked("AVAILABLE").standing } }), // AVAILABLE before, BLOCKED now: told
      channel(5), // the rating cannot be read; the standing can: the two fail apart
      channel(6), // Meta answers the standing with nothing about what the number may do
      channel(7), // the database door says it is not this workspace's channel any more
      channel(8), // the database refuses the keeping
      channel(9), // no credentials: neither is asked
    ],
    { goneStanding: ["ch-7"], refuseStanding: ["ch-8"], noToken: ["ch-9"] },
  );
  const g = graph({
    106540000000001: { ...rating("GREEN"), standing: health("BLOCKED") },
    // The account's own reads are answered by the account's id.
    205540000000001: {
      waba: { body: { business_verification_status: "not_verified", whatsapp_business_manager_messaging_limit: "TIER_250" } },
      funding: { body: { id: "205540000000001" } },
      owner: { body: { id: "205540000000001", owner_business_info: { id: "410540000000001" } } },
    },
    106540000000002: { ...rating("GREEN"), standing: health("BLOCKED") },
    106540000000003: { ...rating("GREEN"), standing: health("LIMITED") },
    106540000000004: { ...rating("GREEN"), standing: health("BLOCKED") },
    106540000000005: { status: 400, body: { error: { message: "token revoked", code: 190 } }, standing: health("AVAILABLE") },
    106540000000006: { ...rating("GREEN"), standing: { body: { id: "x" } } },
    106540000000007: { ...rating("GREEN"), standing: health("AVAILABLE") },
    106540000000008: { ...rating("GREEN"), standing: health("AVAILABLE") },
    106540000000009: { ...rating("GREEN"), standing: health("AVAILABLE") },
  });
  try {
    const [status, body] = await answer(await knock(POST, "channel-quality"));
    assert.equal(status, 200);
    assert.deepEqual(
      [body.due, body.standing_first, body.standing_changed, body.standing_same, body.standing_gone, body.standing_unreadable, body.standing_told],
      [9, 2, 2, 1, 1, 2, 2],
      "asked: ch-1 and ch-5 for the first time, ch-3 and ch-4 changed, ch-2 the same, ch-7 gone; ch-6 and ch-8 unreadable; ch-9 had no credentials. Told: ch-1 and ch-4",
    );
    assert.equal(
      body.standing_first + body.standing_changed + body.standing_same + body.standing_gone + body.standing_unreadable,
      8,
      "every number asked of Meta for its standing is counted once; the one without credentials is asked for neither",
    );
    assert.deepEqual(
      w.standings.map(([, id, word]) => [id, word]).sort(),
      [["ch-1", "BLOCKED"], ["ch-2", "BLOCKED"], ["ch-3", "LIMITED"], ["ch-4", "BLOCKED"], ["ch-5", "AVAILABLE"]],
      "kept: the standing of each number whose read and whose door answered",
    );
    assert.deepEqual(w.tables.tenant_channels[0].config.standing.problems, [
      {
        entity: "WABA",
        code: 141006,
        said: "A payment method is required to send messages",
        fix: "Add a payment method in WhatsApp Manager",
      },
    ]);
    assert.deepEqual(
      w.tables.notifications.map((n) => [n.tenant_id, n.kind, n.route, n.title]).sort(),
      [
        [T(1), "number", "admin/integrations", "WhatsApp can't send from your number"],
        [T(4), "number", "admin/integrations", "WhatsApp can't send from your number"],
      ],
      "the owners of the two numbers that turned BLOCKED are told, on the bell; the one that stayed BLOCKED is not",
    );
    assert.ok(w.tables.notifications.find((n) => n.tenant_id === T(1)).body.includes("+1 (305) 555-0142"));
    // The token each read carried is its own workspace's, the rating's and the standing's alike; the account is asked only where one is on file.
    for (const c of g.calls.filter((x) => x.url.includes("graph.facebook.com")))
      assert.equal(c.init.headers.authorization, `Bearer token-ch-${/\/\d{14}(\d)\?/.exec(c.url)[1]}`, c.url);
    for (const fields of ["business_verification_status", "primary_funding_id", "owner_business_info"]) {
      const reads = g.calls.filter((c) => c.url.includes(`fields=${fields}`));
      assert.deepEqual(reads.map((c) => c.url.includes("/205540000000001?")), [true], `one ${fields} read, for the one number with an account on file`);
    }
    const kept = w.tables.tenant_channels[0].config.standing;
    assert.deepEqual(
      [kept.verification, kept.limit, kept.has_payment_method, kept.owner_business_id, kept.waba_id],
      ["not_verified", "TIER_250", false, "410540000000001", "205540000000001"],
      "and what the account said is in the standing: its verification and tier, no payment method on file, and who owns it",
    );
  } finally {
    g.restore();
  }
});
##END
```

The sum the hygiene test holds learns the notice (`swap`):

```swap
##FILE tooling/scripts/tests/repo/ops-hygiene.test.mjs
##FROM
test("the channel-quality sweep yields before its limit, with a read of Meta still to come", () => {
  // Its last read may start just before QUALITY_YIELD_AT_MS (counted from the door's first line) and wait out Graph's own
  // bound, then write. Past the limit the platform kills the function mid-write.
  const WRITES_MS = 3_000;
  const ceiling = FUNCTIONS["api/cron/channel-quality.ts"].maxDuration * 1000;
  assert.ok(
    QUALITY_YIELD_AT_MS + GRAPH_TIMEOUT_MS + WRITES_MS <= ceiling,
    `${QUALITY_YIELD_AT_MS} + ${GRAPH_TIMEOUT_MS} + ${WRITES_MS} must fit in ${ceiling} ms`,
  );
});
##TO
test("the channel-quality sweep yields before its limit, with a read of Meta and a notice to the owner still to come", () => {
  // Its last read may start just before QUALITY_YIELD_AT_MS (counted from the door's first line) and wait out Graph's own
  // bound, then keep what Meta said and, for a number that turned BLOCKED, tell its owner (one notice, bound by
  // NOTIFY_TIMEOUT_MS), then write. Past the limit the platform kills the function mid-write.
  const WRITES_MS = 3_000;
  const ceiling = FUNCTIONS["api/cron/channel-quality.ts"].maxDuration * 1000;
  assert.ok(
    QUALITY_YIELD_AT_MS + GRAPH_TIMEOUT_MS + NOTIFY_TIMEOUT_MS + WRITES_MS <= ceiling,
    `${QUALITY_YIELD_AT_MS} + ${GRAPH_TIMEOUT_MS} + ${NOTIFY_TIMEOUT_MS} + ${WRITES_MS} must fit in ${ceiling} ms`,
  );
});
##END
```

- [ ] **Step 2: Run them to verify they fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/ops-hygiene.test.mjs
```
Expected: FAIL: the sweep's file fails every case that compares the tick whole (the answer has no `standing_*`) and the new one (`body.standing_first` is `undefined`; no standing is asked); the tests that call `readNumberQualities` with their own reads pass `standing: NOT_ASKED`, which nothing reads yet, and still pass. `ops-hygiene.test.mjs` PASSES (the sum with a notice already fits: 30 + 15 + 10 + 3 = 58 seconds against 60); it is held now so that the next number added to the visit cannot slip past it.

- [ ] **Step 3: The visit reads both**

Write the whole of `apps/edge/lib/whatsapp/number-quality.ts`:

```ts
/**
 * The reading behind the channel-quality sweep (the Reports lenses spec, K9): each connected WhatsApp number's quality
 * rating, asked of Meta with the token its own workspace already holds, and kept through the database's door
 * (channel_keep_quality, 00315), which says when the word changed. Beside it, in the same visit and with the same token,
 * what Meta holds about whether the number may send (numberStanding, kept through channel_keep_standing, 00330, and the
 * owner told once when it turns BLOCKED: lib/whatsapp/number-standing.ts).
 *
 * What is asked, and when. The numbers come from whatsappNumbersToRead, never read first and then the longest unread, and a
 * number is asked only when it was never read or was last read READ_EVERY_MS ago, so a tick that is late, or that ran long,
 * never reads a number twice in a day. A stamp that is no time counts as never read, so the number is asked and its read
 * writes a stamp that is one. The tick's own clock is the door's: no read starts after `yieldAtMs` from `started`, and what is
 * left is first in line next tick.
 *
 * Meta's rate. A number is asked once in five hours with its own workspace's token, so no workspace sees more than a
 * read a number in that time, and at most AT_ONCE reads are in the air together (the reach-out check's own four), each
 * bound by the Graph timeout. A visit asks the rating and the standing together, so it is still one Graph timeout wide
 * (the standing is itself two reads at once, the phone's and the account's). No other sweep reads Meta across workspaces, so
 * the nearest pacing to copy is the reach-out check's batches of four; the domains sweep's floor between batches answers
 * Resend's rate per account, and here each read carries its own workspace's token.
 *
 * What is kept. Only one of Meta's five words (mapNumberQuality), in capitals; and a standing only where Meta's answer says
 * what the number may do. Whatever else comes back, an error, a word that is not one of them, no word, no credentials, a
 * credential read that failed, a database that refuses, leaves the channel exactly as it was, is counted, and costs no other
 * number its read; the rating's failure costs the standing nothing and the standing's costs the rating nothing. Nothing here
 * ever throws for one number's sake; what throws is the read of the channels themselves, which the door answers as the one 503.
 *
 * The log carries the workspace and the channel by id, and Meta's answer by its status and code: never a token, never a
 * number (Meta's own words often name the number asked about, so they are not logged either).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { keepChannelQuality, whatsappNumbersToRead, type Database, type WhatsappNumber } from "../packages/db.js";
import { HOUR_MS } from "../packages/contracts.js";
import { errField, type Logger } from "../log.js";
import type { notify } from "../ops/notify.js";
import { waCredentialsForTenant } from "../tenant-runtime.js";
import { phoneNumber, type numberStanding } from "./meta-graph.js";
import { mapNumberQuality } from "./meta-templates.js";
import { readAndKeepStanding, type StandingOutcome } from "./number-standing.js";

/** How long a read holds: a number is asked again no sooner. */
const READ_EVERY_MS = 5 * HOUR_MS;
/** The most numbers a tick lists; its time budget is what bounds the work, and the longest unread are first. */
const MAX_DUE = 500;
/** How many numbers are asked together. */
const AT_ONCE = 4;

/**
 * What a tick did: every due number is in exactly one of read (first, changed, same), gone, no_token, unreadable,
 * not_a_rating and left. Of the numbers whose standing was asked of Meta (those with credentials), each is in exactly one of
 * `standing_first`, `standing_changed`, `standing_same`, `standing_gone` and `standing_unreadable`; `standing_told` is how
 * many owners were told that a number turned BLOCKED.
 */
interface QualityTick {
  due: number;
  read: number;
  first: number;
  changed: number;
  same: number;
  gone: number;
  no_token: number;
  unreadable: number;
  not_a_rating: number;
  left: number;
  standing_first: number;
  standing_changed: number;
  standing_same: number;
  standing_gone: number;
  standing_unreadable: number;
  standing_told: number;
}

interface QualityPorts {
  db: SupabaseClient<Database>;
  log: Logger;
  now: () => number;
  /** When the tick began, and how long into it a read may still be started: the door's YIELD_AT_MS. */
  started: number;
  yieldAtMs: number;
  /** Meta's reads of one number, the owner's notice, and a workspace's token: the real ones unless a test hands others. */
  read?: (token: string, phoneNumberId: string) => ReturnType<typeof phoneNumber>;
  standing?: typeof numberStanding;
  tell?: typeof notify;
  credentialsOf?: typeof waCredentialsForTenant;
}

/** What one number's rating came to: the door's own answer when its word was kept, else the way the read came to nothing. */
type Outcome = "first" | "changed" | "same" | "gone" | "no_token" | "unreadable" | "not_a_rating";

/** What one visit to a number did: its rating's outcome, its standing's (null where Meta was not asked), and whether its owner was told. */
interface Visit {
  quality: Outcome;
  standing: StandingOutcome | null;
  told: boolean;
}

/** Whether a number is asked at `now`: never read (a stamp that is no time too), or read at least READ_EVERY_MS ago. */
function isDue(n: WhatsappNumber, now: number): boolean {
  if (n.read_at === null) return true;
  const readAt = Date.parse(n.read_at);
  return Number.isNaN(readAt) || now - readAt >= READ_EVERY_MS;
}

/** One number's token, or the visit that ends there: no credentials, or a credential read that failed. */
async function tokenOf(p: QualityPorts, n: WhatsappNumber): Promise<string | Visit> {
  const credentialsOf = p.credentialsOf ?? waCredentialsForTenant;
  try {
    const held = await credentialsOf(p.db, n.tenant_id);
    if (held.outcome === "absent") return { quality: "no_token", standing: null, told: false };
    if (held.outcome === "unavailable") return { quality: "unreadable", standing: null, told: false };
    return held.credentials.accessToken;
  } catch (e) {
    p.log.error("channel_quality_row_failed", { tenant_id: n.tenant_id, channel_id: n.channel_id, error: errField(e) });
    return { quality: "unreadable", standing: null, told: false };
  }
}

/** One number's rating: Meta's word, the door. Every failure is an outcome and a line, never a throw. */
async function ratingOf(p: QualityPorts, n: WhatsappNumber, token: string): Promise<Outcome> {
  const read = p.read ?? phoneNumber;
  try {
    const got = await read(token, n.phone_number_id);
    if (!got.ok) {
      p.log.warn("channel_quality_read_failed", {
        tenant_id: n.tenant_id,
        channel_id: n.channel_id,
        status: got.status,
        code: got.code,
      });
      return "unreadable";
    }
    const word = mapNumberQuality(got.data.quality_rating);
    if (word === null) return "not_a_rating";
    return await keepChannelQuality(p.db, n.tenant_id, n.channel_id, word);
  } catch (e) {
    p.log.error("channel_quality_row_failed", {
      tenant_id: n.tenant_id,
      channel_id: n.channel_id,
      error: errField(e),
    });
    return "unreadable";
  }
}

/** One number: its workspace's token, then its rating and its standing together. */
async function visit(p: QualityPorts, n: WhatsappNumber): Promise<Visit> {
  const token = await tokenOf(p, n);
  if (typeof token !== "string") return token;
  const [quality, standing] = await Promise.all([
    ratingOf(p, n, token),
    readAndKeepStanding({ db: p.db, log: p.log, read: p.standing, tell: p.tell }, token, n),
  ]);
  return { quality, standing: standing.outcome, told: standing.told };
}

/**
 * One tick of the sweep: the due numbers read AT_ONCE at a time until the tick is out of time. Throws only when the
 * channels cannot be read.
 */
export async function readNumberQualities(p: QualityPorts): Promise<QualityTick> {
  const listed = await whatsappNumbersToRead(p.db, MAX_DUE);
  const asked = p.now();
  const due = listed.filter((n) => isDue(n, asked));
  const tick: QualityTick = {
    due: due.length,
    read: 0,
    first: 0,
    changed: 0,
    same: 0,
    gone: 0,
    no_token: 0,
    unreadable: 0,
    not_a_rating: 0,
    left: 0,
    standing_first: 0,
    standing_changed: 0,
    standing_same: 0,
    standing_gone: 0,
    standing_unreadable: 0,
    standing_told: 0,
  };
  for (let i = 0; i < due.length; i += AT_ONCE) {
    if (p.now() - p.started > p.yieldAtMs) {
      tick.left = due.length - i;
      break;
    }
    const visits = await Promise.all(due.slice(i, i + AT_ONCE).map((n) => visit(p, n)));
    for (const v of visits) {
      tick[v.quality] += 1;
      if (v.standing) tick[`standing_${v.standing}`] += 1;
      if (v.told) tick.standing_told += 1;
    }
  }
  tick.read = tick.first + tick.changed + tick.same;
  return tick;
}
```

The door's header says what the visit now does (`swap`):

```swap
##FILE apps/edge/api/cron/channel-quality.ts
##FROM
 * readNumberQualities (lib/whatsapp/number-quality.ts); nothing here decides what a number's rating means.
##TO
 * readNumberQualities (lib/whatsapp/number-quality.ts); nothing here decides what a number's rating means.
 *
 * Beside each rating the same visit asks Meta what the number may do (numberStanding: can it send, what stands in the way, its
 * display name's review, the business's verification and tier) with the same token, keeps it whole through channel_keep_standing
 * (00330) and tells the owner once when a number turns BLOCKED (lib/whatsapp/number-standing.ts). The tick's answer counts them as
 * `standing_*`, and the sum its limit must hold grows by one notice (ops-hygiene.test.mjs).
##END
```

- [ ] **Step 4: Format, run**

```bash
corepack pnpm exec prettier --write apps/edge/lib/whatsapp/number-quality.ts apps/edge/api/cron/channel-quality.ts tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs tooling/scripts/tests/repo/ops-hygiene.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/ops-hygiene.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/number-standing.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/log-events.test.mjs
corepack pnpm --filter @chanlytics/edge typecheck
```
Expected: all PASS, the new sweep case included. If the new case's per-call token assertion is off, it is the regular expression that reads the channel's number out of the URL, never the sweep: each read must carry the token of the workspace it is for (`token-ch-<n>`).

- [ ] **Step 5: Commit**

```bash
git add apps/edge/lib/whatsapp/number-quality.ts apps/edge/api/cron/channel-quality.ts tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs tooling/scripts/tests/repo/ops-hygiene.test.mjs
git commit -m "The channel-quality sweep asks what Meta holds beside each rating, keeps it whole, and tells the owner once when a number turns blocked." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 8: Two edge doors for the owner: what Meta holds about the number now, and the codes sent to the line

**Why:** both are the dashboard's sole call, behind a signed admin token (`authorizeAdmin`, one door, one workspace, one person, one minute) like `whatsapp/connect`.

- **`POST /api/admin/whatsapp/standing`**: the owner asks Meta what the workspace's number may do now (the page asks it when Connections opens on a standing that is missing, or not AVAILABLE and read more than ten minutes ago, so a payment method added a minute ago shows as fixed without waiting six hours). The door reads the workspace's active WhatsApp number (`whatsappNumberOf`, Task 5), its own token, and calls the one reading every caller makes (`readAndKeepStanding`, Task 6). Refused as the template doors refuse: no number is 409 `no_channel`, no credentials 503 `no_token`, Meta not answering 502 `meta_failed`; answered `{ ok, kept, can_send }` and nothing of Meta's words.
- **`GET /api/admin/lines/codes`**: the one-time codes texted to the workspace's own Chanlytics line in the last fifteen minutes, read from the provider's own record (`recentTexts`, Task 3) and narrowed by the one rule that says what a code is (`lineCodesFrom`, Task 2): `{ ok, codes: [{ code, from, at }] }`, newest first, at most three. The workspace is the token's (a GET has no body to name one). A line the business kept at its carrier has no texts of ours, a line of another provider than this deployment's has none here, and a workspace with no line has no codes: each is `{ ok: true, codes: [] }`, never an error. Nothing is stored and nothing is written; the answer carries no other text, and a failed read is a line (`line_codes_read_failed`) that names the workspace and never what a text said.

Tables stay in `packages/db`: the line is read by `ownLineOf` (new, `packages/db/src/lines.ts`: `packages/db/src/repositories` holds its twenty modules already and the tree-shape ratchet refuses a twenty-first, and a domain earns a folder at its second module), so the edge adds no table name of its own. Each door gets an explicit limit in `apps/edge/vercel.json` (sixty seconds, the lines door's: a Graph read, or Twilio's list asked twice, plus the keeping and a notice). The standing door joins the table of doors whose body must be read once (`every-door-reads-its-body-once.test.mjs`).

**Files:**
- Create: `packages/db/src/lines.ts`, `apps/edge/lib/lines/line-codes.ts`, `apps/edge/api/admin/lines/codes.ts`, `apps/edge/api/admin/whatsapp/standing.ts`, `tooling/scripts/tests/whatsapp/whatsapp-standing-door.test.mjs`, `tooling/scripts/tests/lines/line-codes-door.test.mjs`
- Modify: `packages/db/src/index.ts`, `apps/edge/lib/whatsapp/number-standing.ts`, `apps/edge/lib/log-events.ts`, `apps/edge/vercel.json`, `tooling/scripts/tests/edge/every-door-reads-its-body-once.test.mjs`
- Regenerate: `packages/db/dist`, `docs/data-model.md` (the module that reads `lines` is a new row of its table)

- [ ] **Step 1: Write the failing tests**

Create `tooling/scripts/tests/whatsapp/whatsapp-standing-door.test.mjs`:

```js
/**
 * POST /api/admin/whatsapp/standing, run: an owner asks what Meta holds about the workspace's number now. Over a database in
 * memory, a vault that answers the number's own credentials, and a captured wire to Meta's Graph API that answers what the
 * test writes (the reading itself, and the keeping and the telling, are held in number-standing.test.mjs; this holds the door
 * around them).
 *   - the knock: a token for another door, a forgery and no credential are 403; a body naming another workspace than the
 *     token is refused; no database is a 503; none of it reaches Meta;
 *   - the workspace's number: none (or a disabled one) is 409 no_channel, a channel that cannot be read 503, no credentials
 *     (or a vault that did not answer) 503 no_token; another workspace's number is never read;
 *   - Meta not answering is 502 meta_failed and keeps nothing; an answer is kept whole, told to the owner when the number is
 *     BLOCKED and new, and the door answers { ok, kept, can_send } and nothing of Meta's words;
 *   - the token Meta is asked with is the workspace's own, and no answer or log line carries it.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers, signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_ID"])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { GRAPH_VERSION } = await import(at("apps/edge/lib/whatsapp/meta-graph.ts"));
const door = await import(at("apps/edge/api/admin/whatsapp/standing.ts"));
after(() => setPg(null));
beforeEach(() => resetBreakers());

const AUD = "/api/admin/whatsapp/standing";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OWNER_MAIL = "owner@harbor.test";
const PHONE = "1234567890123";
const WABA = "9876543210987";
const TOKEN = "EAAB-business-token-nobody-may-see";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/* ------------------------------- the knock -------------------------------- */

const tokenFor = (raw, o = {}) =>
  signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, {
    workspace: "workspace" in o ? o.workspace : A,
    user: OWNER,
    body: raw,
  });
const knock = (body = {}, headers) => {
  const raw = JSON.stringify(body);
  return door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: { ...(headers ?? { "x-edge-token": tokenFor(raw) }), "content-type": "application/json" },
      body: raw,
    }),
  );
};
const answer = async (res) => [res.status, await res.json()];
/** The door's log lines, kept instead of printed. */
function quiet() {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...a) => lines.push(a.map(String).join(" "));
  return { lines, restore: () => Object.assign(console, real) };
}

/* -------------------------------- the world ------------------------------- */

const channel = (over = {}) => ({
  id: "wa-a",
  tenant_id: A,
  kind: "whatsapp",
  external_id: PHONE,
  number_e164: "+13055550142",
  waba_id: WABA,
  status: "active",
  credentials_ref: "wa-creds-wa-a",
  config: {},
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
/** The database the door will find: the workspace's number, its vault, its owner's mailbox, and the keeping door answering `answers` in turn. */
function use({ channels = [channel()], vault, faults = {}, answers = [] } = {}) {
  const tables = {
    tenant_channels: channels,
    notifications: [],
    tenant_config: [{ tenant_id: A, config: { notifications: { escalation_emails: [OWNER_MAIL] } } }],
  };
  const kept = [];
  const db = fakeDb(tables, faults, {
    get_channel_credentials: vault ?? (() => ({ access_token: TOKEN, phone_id: PHONE })),
    channel_keep_standing: (args) => {
      kept.push(args);
      return answers.shift() ?? "first";
    },
  });
  setPg(db);
  return { tables, db, kept };
}

/** Meta's Graph, as far as this door can see it, and the mail transport: every request kept. */
function wire(script) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    seen.push({ url: u, init });
    if (u.startsWith("https://api.resend.com/")) return new Response("{}", { status: 200 });
    const a = script(u.replace(GRAPH, ""));
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  };
  return {
    seen,
    graph: () => seen.filter((r) => r.url.startsWith(GRAPH)),
    mail: () => seen.filter((r) => r.url.startsWith("https://api.resend.com/")).map((r) => JSON.parse(r.init.body)),
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
const BLOCKED = {
  body: {
    id: PHONE,
    verified_name: "Harbor Moving",
    name_status: "APPROVED",
    health_status: {
      can_send_message: "BLOCKED",
      entities: [
        {
          entity_type: "WABA",
          id: WABA,
          can_send_message: "BLOCKED",
          errors: [
            {
              error_code: 141006,
              error_description: "A payment method is required to send messages",
              possible_solution: "Add a payment method in WhatsApp Manager",
            },
          ],
        },
      ],
    },
  },
};
const VERIFIED = {
  body: { id: WABA, business_verification_status: "not_verified", whatsapp_business_manager_messaging_limit: "TIER_250" },
};
/** The account has no payment method on file, and says which business owns it. */
const FUNDING = { body: { id: WABA } };
const OWNED = { body: { id: WABA, owner_business_info: { id: "410540000000001" } } };
const metaSays = (phone, waba = VERIFIED, funding = FUNDING, owner = OWNED) => (p) =>
  p.startsWith(`/${PHONE}?`)
    ? phone
    : p.startsWith(`/${WABA}?fields=primary_funding_id`)
      ? funding
      : p.startsWith(`/${WABA}?fields=owner_business_info`)
        ? owner
        : p.startsWith(`/${WABA}?`)
          ? waba
          : { status: 404 };
const unreachable = () => wire(() => {
  throw new Error("a refused knock must not reach Meta");
});

test("the knock: a token for another door, a forgery and no credential are 403; a body naming another workspace than the token is refused; no database is a 503 -- and none of it reaches Meta or the database", async () => {
  const { db } = use();
  const net = unreachable();
  try {
    assert.deepEqual(await answer(await knock({}, { "x-edge-token": tokenFor("{}", { aud: "/api/admin/whatsapp/connect" }) })), [
      403,
      { ok: false, error: "token_audience" },
    ]);
    assert.deepEqual(await answer(await knock({}, { "x-edge-token": tokenFor("{}", { secret: "not-the-secret" }) })), [
      403,
      { ok: false, error: "token_signature" },
    ]);
    assert.deepEqual(await answer(await knock({}, {})), [403, { ok: false }]);
    assert.deepEqual(await answer(await knock({ tenant_id: B })), [403, { ok: false, error: "workspace_mismatch" }]);
    assert.equal(db.seen.length, 0);
    setPg(null);
    assert.deepEqual(await answer(await knock({})), [503, { ok: false, error: "no_database" }]);
  } finally {
    net.restore();
  }
});

test("the workspace's number: none, or a disabled one, is a 409; a read that fails is a 503; no credentials, or a vault that did not answer, is a 503 -- and Meta is asked of none of them", async () => {
  const net = unreachable();
  try {
    for (const channels of [[], [channel({ status: "disabled" })], [channel({ tenant_id: B, id: "wa-b" })]]) {
      use({ channels });
      assert.deepEqual(await answer(await knock({})), [409, { ok: false, error: "no_channel" }], JSON.stringify(channels).slice(0, 60));
    }
    use({ faults: { "tenant_channels.select": { message: "connection reset" } } });
    const read = await answer(await knock({}));
    assert.deepEqual([read[0], read[1].error], [503, "channel_read_failed"]);
    use({ vault: () => ({}) });
    assert.deepEqual(await answer(await knock({})), [503, { ok: false, error: "no_token" }]);
    use({
      vault: () => {
        throw new Error("the vault did not answer");
      },
    });
    assert.deepEqual(await answer(await knock({})), [503, { ok: false, error: "no_token" }]);
  } finally {
    net.restore();
  }
});

test("Meta not answering is a 502 and keeps nothing; the owner's token is the number's own and nothing of Meta's words comes back", async () => {
  const { kept, tables } = use();
  const w = wire(metaSays({ status: 400, body: { error: { message: "Object with ID '1234567890123' does not exist", code: 100 } } }));
  const log = quiet();
  let res;
  try {
    res = await answer(await knock({}));
  } finally {
    log.restore();
    w.restore();
  }
  assert.deepEqual(res, [502, { ok: false, error: "meta_failed" }]);
  assert.deepEqual([kept, tables.notifications], [[], []]);
  assert.deepEqual(
    w.graph().map((r) => r.init.headers.authorization),
    Array(4).fill(`Bearer ${TOKEN}`),
    "the phone and the account's three reads, each with the business's own token, never the environment's",
  );
  assert.ok(!log.lines.some((l) => l.includes(TOKEN) || l.includes("1234567890123") || l.includes("3055550142")), "no token, no number in what the door said");
});

test("an answer is kept whole and told to the owner once: BLOCKED and new is a notice on the bell and in the owner's mail; the same again is not; the door answers what was kept and the word, never Meta's words", async () => {
  const { kept, tables } = use({ answers: ["first", "same", "gone"] });
  const w = wire(metaSays(BLOCKED));
  const log = quiet();
  let first, same, gone;
  try {
    first = await answer(await knock({}));
    same = await answer(await knock({}));
    gone = await answer(await knock({}));
  } finally {
    log.restore();
    w.restore();
  }
  assert.deepEqual(first, [200, { ok: true, kept: "first", can_send: "BLOCKED" }]);
  assert.deepEqual(same, [200, { ok: true, kept: "same", can_send: "BLOCKED" }]);
  assert.deepEqual(gone, [409, { ok: false, error: "no_channel" }], "a channel switched off while the read was out");
  assert.deepEqual(
    w.graph().slice(0, 4).map((r) => r.url.replace(GRAPH, "")),
    [
      `/${PHONE}?fields=health_status,name_status,verified_name`,
      `/${WABA}?fields=business_verification_status,whatsapp_business_manager_messaging_limit`,
      `/${WABA}?fields=primary_funding_id`,
      `/${WABA}?fields=owner_business_info{id}`,
    ],
    "the number as Meta knows it and the account it belongs to (its verification, its funding and its owner), both from the channel's row",
  );
  const held = (k) => [
    k.p_tenant_id,
    k.p_channel_id,
    k.p_standing.can_send,
    k.p_standing.verification,
    k.p_standing.has_payment_method,
    k.p_standing.owner_business_id,
  ];
  assert.deepEqual(kept.map(held), [
    [A, "wa-a", "BLOCKED", "not_verified", false, "410540000000001"],
    [A, "wa-a", "BLOCKED", "not_verified", false, "410540000000001"],
    [A, "wa-a", "BLOCKED", "not_verified", false, "410540000000001"],
  ]);
  assert.deepEqual(
    tables.notifications.map((n) => [n.tenant_id, n.kind, n.route, n.title]),
    [[A, "number", "admin/integrations", "WhatsApp can't send from your number"]],
    "told once: the second read was the same word, the third was gone",
  );
  assert.deepEqual(w.mail().map((m) => [m.to, m.subject]), [[[OWNER_MAIL], "WhatsApp can't send from your number"]]);
  for (const res of [first, same, gone]) assert.ok(!JSON.stringify(res).includes("payment"), "nothing of what Meta said");
  assert.ok(!log.lines.some((l) => l.includes(TOKEN)), "and no token in a line");
});

test("another workspace's number is never read: the door acts on the token's workspace and its own channel", async () => {
  const { kept } = use({ channels: [channel(), channel({ id: "wa-b", tenant_id: B, external_id: "5555555555555", waba_id: "6666666666666" })] });
  const w = wire(metaSays(BLOCKED));
  try {
    await answer(await knock({}));
  } finally {
    w.restore();
  }
  assert.ok(w.graph().every((r) => !r.url.includes("5555555555555") && !r.url.includes("6666666666666")), "B's ids are not on the wire");
  assert.deepEqual(kept.map((k) => k.p_channel_id), ["wa-a"]);
});
```

Create `tooling/scripts/tests/lines/line-codes-door.test.mjs`:

```js
/**
 * GET /api/admin/lines/codes, run: the one-time codes texted to a workspace's own line, read from the provider's own record,
 * over a database in memory, a vault that answers the line's own subaccount token, and a captured wire to Twilio that answers
 * what the test writes. The rule that says what a code is is held in sms/one-time-code.test.mjs and the provider's list in
 * lines-twilio.test.mjs; this holds the door around them.
 *   - the knock: a token for another door, a forgery and no credential are 403; a token that names no workspace is a 400 (a GET
 *     has no body to name one); no database is a 503;
 *   - the line: none, one the business kept at its carrier, one that failed, one with no subaccount or no token in the vault, and
 *     one of another provider than this deployment's each have no codes -- an empty list, never an error, and Twilio is not asked;
 *   - the codes: asked of the line's own subaccount with its own token, for the line's own number, and answered as { code, from,
 *     at } newest first, only the codes of the last fifteen minutes, none of the other texts and nothing written anywhere;
 *   - Twilio refusing is a 502 and a line that names the workspace, never what a text said; no provider at all is a 503.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resetBreakers, signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

const MASTER = { sid: "ACplatformmasteraccountforthisfile", token: "platform-master-token-for-this-file" };
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.TWILIO_ACCOUNT_SID = MASTER.sid;
process.env.TWILIO_AUTH_TOKEN = MASTER.token;
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "LINES_DRY_RUN", "VERCEL_ENV"])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const door = await import(at("apps/edge/api/admin/lines/codes.ts"));
after(() => setPg(null));
beforeEach(() => resetBreakers());

const AUD = "/api/admin/lines/codes";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "11111111-1111-4111-8111-111111111111";
const LINE = "+16465550100";
const SUB = "ACharborlinesubaccount000000000000";
const LINE_TOKEN = "harbor-line-token-nobody-may-see";
const MESSAGES = `https://api.twilio.com/2010-04-01/Accounts/${SUB}/Messages.json`;

/* ------------------------------- the knock -------------------------------- */

const tokenFor = (o = {}) =>
  signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, {
    workspace: "workspace" in o ? o.workspace : A,
    user: OWNER,
  });
const knock = (headers = { "x-edge-token": tokenFor() }) => door.GET(new Request(`http://edge${AUD}`, { headers }));
const answer = async (res) => [res.status, await res.json()];
/** Set variables for one call and put every one of them back afterwards; `undefined` unsets. */
async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
function quiet() {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...a) => lines.push(a.map(String).join(" "));
  return { lines, restore: () => Object.assign(console, real) };
}

/* -------------------------------- the world ------------------------------- */

const line = (over = {}) => ({
  id: "line-a",
  tenant_id: A,
  e164: LINE,
  provider: "twilio",
  subaccount_sid: SUB,
  messaging_service_sid: "MG1",
  sms_state: "active",
  voice_state: "active",
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
function use({ lines = [line()], secrets = { auth_token: LINE_TOKEN }, faults = {} } = {}) {
  const tables = { lines, events: [] };
  const db = fakeDb(tables, faults, { get_line_credentials: () => secrets });
  setPg(db);
  return { tables, db };
}
const writes = (db) => db.seen.filter((s) => ["insert", "update", "upsert", "delete"].includes(s.op));

/** Twilio's list of messages, answered with `reply`; every request kept. */
function twilio(reply) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    const a = reply();
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return {
    seen,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
/** A time as Twilio writes date_sent (RFC 2822), `agoMs` before now. */
const sentAt = (agoMs) => new Date(Date.now() - agoMs).toUTCString().replace("GMT", "+0000");
const isoOf = (rfc2822) => new Date(Date.parse(rfc2822)).toISOString();
const MIN = 60_000;
const text = (sid, from, body, agoMs, direction = "inbound") => ({ sid, from, body, direction, date_sent: sentAt(agoMs) });

test("the knock: a token for another door, a forgery and no credential are 403; a token that names no workspace is a 400; no database is a 503 -- and none of it reaches Twilio or the database", async () => {
  const { db } = use();
  const net = twilio(() => {
    throw new Error("a refused knock must not reach Twilio");
  });
  try {
    assert.deepEqual(await answer(await knock({ "x-edge-token": tokenFor({ aud: "/api/admin/lines" }) })), [403, { ok: false, error: "token_audience" }]);
    assert.deepEqual(await answer(await knock({ "x-edge-token": tokenFor({ secret: "not-the-secret" }) })), [403, { ok: false, error: "token_signature" }]);
    assert.deepEqual(await answer(await knock({})), [403, { ok: false }]);
    assert.deepEqual(await answer(await knock({ "x-edge-token": tokenFor({ workspace: null }) })), [
      400,
      { ok: false, error: "bad_tenant" },
    ]);
    assert.equal(db.seen.length, 0);
    setPg(null);
    assert.deepEqual(await answer(await knock()), [503, { ok: false, error: "no_database" }]);
  } finally {
    net.restore();
  }
});

test("a workspace with no line of ours has no codes: no line, a line kept at the carrier, a line that failed, one with no number yet, one with no subaccount or no token, one of another provider -- an empty list, and Twilio is not asked", async () => {
  const net = twilio(() => {
    throw new Error("there is nothing to ask Twilio");
  });
  try {
    for (const [what, world] of [
      ["no line", { lines: [] }],
      ["a line kept at the carrier", { lines: [line({ provider: "carrier", subaccount_sid: null })] }],
      ["a line that failed", { lines: [line({ voice_state: "failed" })] }],
      ["a line with no number yet", { lines: [line({ e164: null })] }],
      ["no subaccount", { lines: [line({ subaccount_sid: null })] }],
      ["no token in the vault", { secrets: {} }],
      ["a line of the dry provider on a deployment that texts through Twilio", { lines: [line({ provider: "dry" })] }],
    ]) {
      use(world);
      assert.deepEqual(await answer(await knock()), [200, { ok: true, codes: [] }], what);
    }
    assert.deepEqual(net.seen, []);
  } finally {
    net.restore();
  }
});

test("the codes of the last fifteen minutes, newest first, from the line's own record: asked of its subaccount with its own token for its own number, and nothing else of what was texted comes back or is written", async () => {
  const { db } = use();
  const messages = [
    text("SM6", "+18335550101", "Your WhatsApp code: 788-963\n\nDon't share this code with others", 2 * MIN),
    text("SM5", "+16465550123", "my door code is 4512", 1 * MIN),
    text("SM4", LINE, "We open at 9.", 90_000, "outbound-api"),
    text("SM3", "+15555550102", "123 456 is your Instagram code. Don't share it.", 5 * MIN),
    text("SM2", "+15555550103", "G-123456 is your Google verification code.", 20 * MIN),
    text("SM1", "+15555550104", "Your Apple ID Code is: 123456. Don't share it with anyone.", 14 * MIN),
  ];
  const w = twilio(() => ({ body: { messages } }));
  let res;
  try {
    res = await answer(await knock());
  } finally {
    w.restore();
  }
  assert.deepEqual(res, [
    200,
    {
      ok: true,
      codes: [
        { code: "788-963", from: "WhatsApp", at: isoOf(messages[0].date_sent) },
        { code: "123 456", from: "Instagram", at: isoOf(messages[3].date_sent) },
        { code: "123456", from: "Apple ID", at: isoOf(messages[5].date_sent) },
      ],
    },
  ]);
  assert.equal(w.seen.length, 1, "one read");
  const url = new URL(w.seen[0].url);
  assert.equal(`${url.origin}${url.pathname}`, MESSAGES, "the line's own subaccount's messages");
  assert.deepEqual([url.searchParams.get("To"), url.searchParams.get("PageSize")], [LINE, "20"]);
  assert.equal(
    w.seen[0].init.headers.Authorization,
    `Basic ${Buffer.from(`${SUB}:${LINE_TOKEN}`).toString("base64")}`,
    "the line's own token from the vault, never the platform's",
  );
  assert.ok(!JSON.stringify(res).includes("door code") && !JSON.stringify(res).includes("We open"), "no other text comes back");
  assert.deepEqual(writes(db), [], "nothing is written: a code is not stored");
});

test("a read Twilio refuses is a 502 and a line that names the workspace and never what was texted; with no provider at all the door is a 503", async () => {
  use();
  const w = twilio(() => ({ status: 401, body: { code: 20003, message: "Authenticate" } }));
  const log = quiet();
  let res;
  try {
    res = await answer(await knock());
  } finally {
    log.restore();
    w.restore();
  }
  assert.deepEqual([res[0], res[1].ok, res[1].error], [502, false, "provider_refused"]);
  const said = log.lines.filter((l) => l.includes('"event":"line_codes_read_failed"'));
  assert.equal(said.length, 1);
  assert.ok(said[0].includes(A), "the workspace");
  assert.ok(!log.lines.some((l) => l.includes(LINE_TOKEN) || l.includes(MASTER.token)), "no token in a line");
  use();
  const none = await withEnv({ TWILIO_ACCOUNT_SID: undefined, TWILIO_AUTH_TOKEN: undefined }, async () => answer(await knock()));
  assert.deepEqual(none, [503, { ok: false, error: "no_line_provider" }]);
});

test("a preview's dry line answers none: the dry provider holds no texts, and the door says so", async () => {
  use({ lines: [line({ provider: "dry" })] });
  const net = twilio(() => {
    throw new Error("the dry provider never reaches Twilio");
  });
  try {
    const res = await withEnv(
      { TWILIO_ACCOUNT_SID: undefined, TWILIO_AUTH_TOKEN: undefined, LINES_DRY_RUN: "1" },
      async () => answer(await knock()),
    );
    assert.deepEqual(res, [200, { ok: true, codes: [] }]);
    assert.deepEqual(net.seen, []);
  } finally {
    net.restore();
  }
});
```

The standing door joins the table of doors whose body is read once (`swap`):

```swap
##FILE tooling/scripts/tests/edge/every-door-reads-its-body-once.test.mjs
##FROM
  "whatsapp/connect",
  "whatsapp/templates-create",
##TO
  "whatsapp/connect",
  "whatsapp/standing",
  "whatsapp/templates-create",
##END
```

- [ ] **Step 2: Run them to verify they fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/whatsapp-standing-door.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/lines/line-codes-door.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/edge/every-door-reads-its-body-once.test.mjs
```
Expected: FAIL at load: neither door file exists (`apps/edge/api/admin/whatsapp/standing.ts`, `apps/edge/api/admin/lines/codes.ts`); the third fails its new `whatsapp/standing` case for the same reason, and passes the others.

- [ ] **Step 3: The line read, the two doors, their limits and names**

`packages/db` reads the line (the one table read this task adds), and names it (`swap`):

Create `packages/db/src/lines.ts`:

```ts
/**
 * A workspace's own line, as the edge's doors that read its texts need it.
 *
 * The line a workspace was given (provisioned through a provider: Twilio, or the dry one on a preview) as the Connections
 * page's rows say it (the oldest that is not a number the business kept at its carrier), with what a read of its texts takes:
 * which line, its number, its provider and its subaccount. Nothing here reads the vault: the account's token is the edge's
 * own door (lineAccount, apps/edge/lib/sms/sms.ts). A read that fails throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// No `type Db` alias here, as the repositories write one: the declaration bundler numbers every module's alias (`Db$x`), and a
// new one renumbers every alias after it, which is a diff of hundreds of lines in a committed file that says nothing new.

/** The workspace's own line that can have texts (not a carrier's, not one whose provisioning failed), or null. */
export async function ownLineOf(
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<Pick<
  Database["public"]["Tables"]["lines"]["Row"],
  "id" | "tenant_id" | "e164" | "provider" | "subaccount_sid" | "messaging_service_sid" | "sms_state" | "voice_state"
> | null> {
  const { data, error } = await db
    .from("lines")
    .select("id, tenant_id, e164, provider, subaccount_sid, messaging_service_sid, sms_state, voice_state")
    .eq("tenant_id", tenantId)
    .neq("provider", "carrier")
    .neq("voice_state", "failed")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`cannot read the workspace's own line: ${error.message}`);
  return data;
}
```

```swap
##FILE packages/db/src/index.ts
##FROM
export { readLeadOne } from "./repositories/leads";
##TO
export { readLeadOne } from "./repositories/leads";
export { ownLineOf } from "./lines";
##END
```

Create `apps/edge/lib/lines/line-codes.ts`:

```ts
/**
 * The one-time codes texted to a workspace's own line, read from the provider's own record, for the Connections page
 * (GET /api/admin/lines/codes; the dashboard's GET /api/v1/lines/codes is its sole caller).
 *
 * Meta texts a code to the number an owner connects to WhatsApp, and when that number is the workspace's own Chanlytics line
 * the text reaches the line like a customer's: the receptionist never answers it and nothing is made of it
 * (lib/sms/sms-ingress.ts), so the owner could not see it. It is read here, from the provider (recentTexts: the account's
 * own list of the messages to the line's number), narrowed to the codes of the last fifteen minutes by the one rule that says
 * what a code is (lineCodesFrom), and answered { code, from, at } newest first, at most three. Chanlytics never stores a code
 * and this writes nothing; the answer carries no other text, and a failed read is a line that names the workspace and never
 * what a text said (line_codes_read_failed).
 *
 * A workspace with no line of ours, a line the business kept at its carrier, a line whose subaccount or token is missing and
 * a line of another provider than this deployment's (a preview's dry line on a deployment that texts through Twilio) have no
 * texts to read: each answers an empty list, not an error, and the provider is not asked.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { json, refuse } from "../http.js";
import { tokenWorkspace, type Admitted } from "../admin-auth.js";
import { errorMessage } from "../admin-door.js";
import { pg } from "../pg.js";
import { errField, logger } from "../log.js";
import { lineCodesFrom, type ProviderAccount } from "../packages/channels.js";
import { LINE_CODES_WITHIN_MS, UUID } from "../packages/contracts.js";
import { ownLineOf, type Database } from "../packages/db.js";
import { lineAccount } from "../sms/sms.js";
import { lineProviderFromEnv } from "./lines.js";

/**
 * The workspace's own line, its number and the account it is read as, or null where there is nothing to read: no line, one that has
 * no number yet (provisioning has not reached it, so no text can have been sent to it) or one whose account cannot be had.
 */
async function ownLineAccount(db: SupabaseClient<Database>, tenantId: string) {
  const line = await ownLineOf(db, tenantId);
  const acct: ProviderAccount | null = line ? await lineAccount(db, line) : null;
  return line && line.e164 && acct ? { line, number: line.e164, acct } : null;
}

/** GET /api/admin/lines/codes: the codes sent to the token's workspace's own line lately. */
export async function lineCodes(auth: Admitted, aud: string): Promise<Response> {
  const tenantId = tokenWorkspace(auth, aud);
  if (!tenantId || !UUID.test(tenantId)) return refuse(400, "bad_tenant");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const held = await ownLineAccount(db, tenantId).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));
  if (held instanceof Error) return refuse(503, "read_failed", held.message);
  if (!held) return json(200, { ok: true, codes: [] });
  const choice = lineProviderFromEnv();
  if (!choice) return refuse(503, "no_line_provider");
  if (choice.name !== held.line.provider) return json(200, { ok: true, codes: [] });
  const now = Date.now();
  try {
    const texts = await choice.provider.recentTexts(held.acct, held.number, now - LINE_CODES_WITHIN_MS);
    return json(200, { ok: true, codes: lineCodesFrom(texts, now) });
  } catch (e) {
    logger({ tenant_id: tenantId }).warn("line_codes_read_failed", { error: errField(e) });
    return refuse(502, "provider_refused", errorMessage(e));
  }
}
```

Create `apps/edge/api/admin/lines/codes.ts`:

```ts
/**
 * GET /api/admin/lines/codes: the one-time codes texted to a workspace's own line in the last fifteen minutes, read from the
 * provider's own record. Signed admin token only, for the workspace the token names; the dashboard's GET /api/v1/lines/codes
 * (owners only) is its sole caller.
 *
 * The door is the knock (authorizeAdmin); lineCodes in lib/lines/line-codes.ts is everything after: the line, its account, the
 * provider's list and the one rule that says what a code is.
 */
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { lineCodes } from "../../../lib/lines/line-codes.js";

const AUD = "/api/admin/lines/codes";

export const GET = adminDoor(async function GET(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, AUD);
  if (!auth.ok) return auth.response;
  return lineCodes(auth, AUD);
});
```

The standing check, in the module that reads, keeps and tells (`swap`), and its door:

```swap
##FILE apps/edge/lib/whatsapp/number-standing.ts
##FROM
 * token, a number or Meta's own words (they often name the number asked about, as the quality sweep's do not either).
##TO
 * token, a number or Meta's own words (they often name the number asked about, as the quality sweep's do not either).
 *
 * `checkNumberStanding` is the owner's check from Connections (POST /api/admin/whatsapp/standing): the workspace's active
 * number, its own token, and this reading.
##END
##FILE apps/edge/lib/whatsapp/number-standing.ts
##FROM
import type { SupabaseClient } from "@supabase/supabase-js";
import { keepChannelStanding, type Database, type WhatsappNumber } from "../packages/db.js";
import { standingAlertWords, type NumberStanding } from "../packages/contracts.js";
import { errField, type Logger } from "../log.js";
import { notify } from "../ops/notify.js";
import { numberStanding } from "./meta-graph.js";
import { NUM, notificationsFor } from "./waba-events.js";
##TO
import type { SupabaseClient } from "@supabase/supabase-js";
import { json, refuse } from "../http.js";
import { workspaceFor, type Admitted } from "../admin-auth.js";
import { pg } from "../pg.js";
import { keepChannelStanding, whatsappNumberOf, type Database, type WhatsappNumber } from "../packages/db.js";
import { standingAlertWords, UUID, type NumberStanding } from "../packages/contracts.js";
import { errField, logger, type Logger } from "../log.js";
import { notify } from "../ops/notify.js";
import { waCredentialsForTenant } from "../tenant-runtime.js";
import { numberStanding } from "./meta-graph.js";
import { NUM, notificationsFor } from "./waba-events.js";
##END
##FILE apps/edge/lib/whatsapp/number-standing.ts
##FROM
    p.log.error("wa_standing_keep_failed", { tenant_id: n.tenant_id, channel_id: n.channel_id, error: errField(e) });
    return { outcome: "unreadable", standing: null, told: false };
  }
}
##TO
    p.log.error("wa_standing_keep_failed", { tenant_id: n.tenant_id, channel_id: n.channel_id, error: errField(e) });
    return { outcome: "unreadable", standing: null, told: false };
  }
}

/**
 * POST /api/admin/whatsapp/standing: an owner asks what Meta holds about the workspace's number now. The door is the knock
 * (authorizeAdmin) and the body (readBody); this is the rest: the workspace's active WhatsApp number, its own credentials,
 * and the one reading every caller makes. Refused as the template doors refuse: no number is 409 no_channel (a channel
 * switched off while the read was out too), no credentials 503 no_token, Meta not answering 502 meta_failed; answered
 * { ok, kept, can_send } and nothing of Meta's words.
 */
export async function checkNumberStanding(auth: Admitted, body: Partial<{ tenant_id?: unknown }>): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  let number: WhatsappNumber | null;
  try {
    number = await whatsappNumberOf(db, tenantId);
  } catch (e) {
    return refuse(503, "channel_read_failed", errField(e));
  }
  if (!number) return refuse(409, "no_channel");
  const creds = await waCredentialsForTenant(db, tenantId);
  // None on file, or none readable just now: a 503 either way, since this door is tried again by hand.
  if (creds.outcome !== "present") return refuse(503, "no_token");
  const read = await readAndKeepStanding(
    { db, log: logger({ tenant_id: tenantId }) },
    creds.credentials.accessToken,
    number,
  );
  if (read.outcome === "unreadable") return refuse(502, "meta_failed");
  if (read.outcome === "gone") return refuse(409, "no_channel");
  return json(200, { ok: true, kept: read.outcome, can_send: read.standing?.can_send ?? null });
}
##END
```

Create `apps/edge/api/admin/whatsapp/standing.ts`:

```ts
/**
 * POST /api/admin/whatsapp/standing: an owner asks what Meta holds about the workspace's WhatsApp number now: whether it may
 * send, what stands in the way, its display name's review, the business's verification and tier. Signed admin token only; the
 * dashboard's POST /api/v1/channels/whatsapp/standing (owners only) is its sole caller.
 *
 * The door is the knock (authorizeAdmin) and the body (readBody); checkNumberStanding in lib/whatsapp/number-standing.ts is
 * everything after: the workspace's number and its own credentials, the one reading, the keeping and the telling.
 */
import { readBody } from "../../../lib/admin-door.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { adminDoor } from "../../../lib/log.js";
import { checkNumberStanding } from "../../../lib/whatsapp/number-standing.js";

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/whatsapp/standing");
  if (!auth.ok) return auth.response;
  return checkNumberStanding(auth, await readBody(request));
});
```

Their limits (one place, `vercel.json`) and the new name (`swap`):

```swap
##FILE apps/edge/vercel.json
##FROM
    "api/admin/llm.ts": {
##TO
    "api/admin/lines/codes.ts": {
      "maxDuration": 60
    },
    "api/admin/llm.ts": {
##END
##FILE apps/edge/vercel.json
##FROM
    "api/apify-webhook.ts": {
##TO
    "api/admin/whatsapp/standing.ts": {
      "maxDuration": 60
    },
    "api/apify-webhook.ts": {
##END
##FILE apps/edge/lib/log-events.ts
##FROM
  "line_release_failed",
##TO
  "line_codes_read_failed",
  "line_release_failed",
##END
```

- [ ] **Step 4: Build, regenerate, run**

```bash
corepack pnpm exec prettier --write packages/db/src/lines.ts packages/db/src/index.ts apps/edge/lib/lines/line-codes.ts apps/edge/api/admin/lines/codes.ts apps/edge/api/admin/whatsapp/standing.ts apps/edge/lib/whatsapp/number-standing.ts apps/edge/lib/log-events.ts tooling/scripts/tests/whatsapp/whatsapp-standing-door.test.mjs tooling/scripts/tests/lines/line-codes-door.test.mjs tooling/scripts/tests/edge/every-door-reads-its-body-once.test.mjs
corepack pnpm --filter "./packages/*" build
for f in $(git ls-files packages/contracts/dist packages/db/dist packages/jobs/dist packages/channels/dist packages/core/dist); do git diff -w --ignore-cr-at-eol --quiet -- "$f" && git checkout -- "$f"; done
corepack pnpm gen:data-model
git status --short packages docs/data-model.md
git diff --stat -- docs/data-model.md
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/whatsapp-standing-door.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/lines/line-codes-door.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/edge/every-door-reads-its-body-once.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/edge/error-codes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/log-events.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/ops-hygiene.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/docs/data-model.test.mjs
corepack pnpm -r typecheck
```
Expected: the build changes `packages/db/dist` only (`ownLineOf`, and nothing renumbered: `git diff -w --ignore-cr-at-eol --stat -- packages/db/dist/index.d.ts` shows the declarations this lane has added so far, never a `Db$` alias moved, which a `type Db` of this module's own would have done); `gen:data-model` adds one module to the `lines` table's row (`packages/db/src/lines.ts`, beside `campaign-channels.ts`) and changes nothing else; every test PASSES (`ops-hygiene.test.mjs` holds that `apps/edge/vercel.json` names only doors that exist and no door states its limit twice); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/lines.ts packages/db/src/index.ts packages/*/dist docs/data-model.md apps/edge/lib/lines/line-codes.ts apps/edge/api/admin/lines/codes.ts apps/edge/api/admin/whatsapp/standing.ts apps/edge/lib/whatsapp/number-standing.ts apps/edge/lib/log-events.ts apps/edge/vercel.json tooling/scripts/tests/whatsapp/whatsapp-standing-door.test.mjs tooling/scripts/tests/lines/line-codes-door.test.mjs tooling/scripts/tests/edge/every-door-reads-its-body-once.test.mjs
git commit -m "Two edge doors for the owner: what Meta holds about the number now, and the one-time codes sent to the workspace's own line." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 9: The dashboard's two owner routes, `GET lines/codes` and `POST channels/whatsapp/standing`, each declaring its policy

**Why:** the browser never calls the edge; its own routes prove who is asking and speak to the edge with a token for the door, the workspace and the person. Both are **the owner's door**, the same one Connect WhatsApp is behind (`role: "partner"`: an owner, or the partner who set the workspace up, who is told "Only an owner can do this." as a viewer or an operator is): `GET /api/v1/lines/codes` answers `{ codes }` from the edge's door (Task 8) on every call, and is never cached (`private, no-store`, as every route; a code is wanted within seconds of being sent); `POST /api/v1/channels/whatsapp/standing` asks the edge to read what Meta holds now and answers `{ kept, can_send }`. Each has a bucket of its own, named by what it does (`lines_codes`: forty a minute, since the page asks every three seconds while Meta's window is open and once when it opens; `whatsapp_standing`: twelve an hour, a Graph read each, asked only when a page opens on a standing that is missing or not AVAILABLE). A preview, which holds no live providers, answers no codes and refuses the check in words, as every provider door of the dashboard does. The standing check is a write the shell must decide the refresh of (`refresh-coverage.test.mjs` fails a write in neither of its tables): it re-reads Settings, whose channels carry what the edge just kept. Task 10 makes the channels read carry it.

**Files:**
- Create: `apps/dashboard/app/api/v1/lines/codes/route.ts`, `apps/dashboard/app/api/v1/channels/whatsapp/standing/route.ts`, `tooling/scripts/tests/connections/standing-routes.test.mjs`
- Modify: `apps/dashboard/src/server/rate-limit.ts`, `apps/dashboard/src/server/connections/whatsapp.ts`, `apps/dashboard/src/server/connections/lines.ts`, `apps/dashboard/src/legacy-bridge/refresh-map.ts`, `tooling/scripts/tests/routes/rate-limit.test.mjs`, `tooling/scripts/tests/route-policy.json` (by its updater)
- Regenerate: `apps/dashboard/src/client/routes.generated.ts`, `packages/contracts/src/route-keys.generated.ts`, `docs/api.md`, `packages/contracts/dist`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/connections/standing-routes.test.mjs`:

```js
/**
 * The two routes Settings > Connections reads while it is open, run through route(): GET /api/v1/lines/codes (the one-time
 * codes texted to the workspace's own line) and POST /api/v1/channels/whatsapp/standing (what Meta holds about the number now).
 * The real route modules, their `run` called with a database in memory and a captured wire to the edge.
 *   - the policy each declares: the owner's or the partner's door, as Connect WhatsApp is, in a bucket of its own;
 *   - a viewer and an operator are refused in words and the edge is not asked; an owner and a partner's seat are let in;
 *   - what the edge is asked: a token for that door, bound to the workspace and the person the route is for (and to the body, for
 *     the one that sends one); what comes back is what the edge said, as the page holds it, a malformed code dropped and never mended;
 *   - what the edge refuses, said in the owner's words; the buckets count apart.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyEdgeToken, edgeBodyMatches } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

const SECRET = "edge-secret-for-this-file";
process.env.EDGE_CALL_SECRET = SECRET;
// A deployment that may reach its providers (the dashboard's own gate: a preview answers "not here"), and no key beside the token.
process.env.EDGE_PROVIDERS = "live";
for (const k of ["DIAG_KEY", "VERCEL_ENV", "EDGE_URL"]) delete process.env[k];
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore, RATE } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const codes = await import(at("apps/dashboard/app/api/v1/lines/codes/route.ts"));
const standing = await import(at("apps/dashboard/app/api/v1/channels/whatsapp/standing/route.ts"));
beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const membership = (role) => ({ user_id: USER, tenant_id: A, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" });
/** A member's session over these tables, past the second factor a partner's seat asks for (0013). */
const ctxFor = (role) => ({
  supabase: fakeDb({ memberships: [membership(role)] }),
  userId: USER,
  email: "ada@example.com",
  aal: "aal2",
  params: {},
});
const inA = `?workspace=${A}`;
const get = () => new Request(`http://localhost/api/v1/x${inA}`);
const post = () => new Request(`http://localhost/api/v1/x${inA}`, { method: "POST" });
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    assert.equal(e.status, status, e.message);
    assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

/** The edge, as far as these routes can see it: every request kept, answered by `reply(path)`. */
function edge(reply) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    seen.push({ path: u.pathname, method: init.method, init });
    const a = reply(u.pathname);
    if (a === "throws") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return {
    seen,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
/** What a captured request's token says for its own door, and whether it binds the body sent. */
function claimsOf({ path: aud, init }) {
  const v = verifyEdgeToken(SECRET, init.headers["x-edge-token"], aud);
  assert.equal(v.ok, true, `${aud}: a token for this door`);
  assert.equal(init.headers["x-diag-key"], undefined, "no key beside it");
  return { ws: v.claims.ws, user: v.claims.user, bound: init.body === undefined || edgeBodyMatches(v.claims, init.body) };
}

test("both declare the owner's door, as Connect WhatsApp does, each in a bucket of its own", () => {
  assert.deepEqual(codes.GET.policy, { kind: "read", scope: "workspace", role: "partner", rate: "lines_codes", spend: false });
  assert.deepEqual(standing.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "partner",
    rate: "whatsapp_standing",
    spend: false,
  });
  assert.deepEqual([RATE.lines_codes.limit, RATE.lines_codes.windowMs], [40, 60_000], "the page asks every three seconds while Meta's window is open, and once on opening");
  assert.deepEqual([RATE.whatsapp_standing.limit, RATE.whatsapp_standing.windowMs], [12, 3_600_000], "a Graph read each, asked only on a standing that is missing or not available");
});

test("a viewer and an operator are refused in words and the edge is not asked; an owner and a partner's seat are let in", async () => {
  const w = edge(() => ({ body: { ok: true, codes: [], kept: "same", can_send: "AVAILABLE" } }));
  try {
    for (const role of ["viewer", "operator"]) {
      await refused(codes.GET.run(get(), ctxFor(role)), "forbidden", 403, "Only an owner");
      await refused(standing.POST.run(post(), ctxFor(role)), "forbidden", 403, "Only an owner");
    }
    assert.deepEqual(w.seen, []);
    for (const role of ["owner", "partner"]) {
      assert.deepEqual(await codes.GET.run(get(), ctxFor(role)), { codes: [] }, role);
      assert.deepEqual(await standing.POST.run(post(), ctxFor(role)), { kept: "same", can_send: "AVAILABLE" }, role);
    }
  } finally {
    w.restore();
  }
});

test("GET lines/codes asks the edge for this workspace and this person, and answers the codes it read as the page holds them: a malformed one is dropped, never mended", async () => {
  const w = edge(() => ({
    body: {
      ok: true,
      codes: [
        { code: "788-963", from: "WhatsApp", at: "2026-10-06T14:58:00.000Z" },
        { code: "482913", from: null, at: "2026-10-06T14:50:00.000Z" },
        { code: "123456", at: "2026-10-06T14:40:00.000Z" },
        { code: 7, from: "x", at: "2026-10-06T14:30:00.000Z" },
        { code: "1", from: "x", at: 5 },
        null,
        "x",
      ],
    },
  }));
  let body;
  try {
    body = await codes.GET.run(get(), ctxFor("owner"));
  } finally {
    w.restore();
  }
  assert.deepEqual(body, {
    codes: [
      { code: "788-963", from: "WhatsApp", at: "2026-10-06T14:58:00.000Z" },
      { code: "482913", from: null, at: "2026-10-06T14:50:00.000Z" },
      { code: "123456", from: null, at: "2026-10-06T14:40:00.000Z" },
    ],
  });
  assert.deepEqual(
    w.seen.map((r) => [r.path, r.method]),
    [["/api/admin/lines/codes", "GET"]],
  );
  assert.deepEqual(claimsOf(w.seen[0]), { ws: A, user: USER, bound: true });
});

test("GET lines/codes: an edge that could not read them is said in words, never an empty list that reads as nobody writing", async () => {
  for (const reply of [() => ({ status: 502, body: { ok: false, error: "provider_refused" } }), () => ({ body: { ok: true } }), () => "throws"]) {
    const w = edge(reply);
    try {
      await refused(codes.GET.run(get(), ctxFor("owner")), "internal", 502, "could not be read");
    } finally {
      w.restore();
    }
  }
});

test("POST channels/whatsapp/standing asks the edge to read what Meta holds for this workspace, as this person, and answers what was kept and Meta's word -- and nothing else", async () => {
  const w = edge(() => ({ body: { ok: true, kept: "first", can_send: "BLOCKED", detail: "A payment method is required" } }));
  let body;
  try {
    body = await standing.POST.run(post(), ctxFor("owner"));
  } finally {
    w.restore();
  }
  assert.deepEqual(body, { kept: "first", can_send: "BLOCKED" });
  assert.deepEqual(
    w.seen.map((r) => [r.path, r.method, r.init.body]),
    [["/api/admin/whatsapp/standing", "POST", JSON.stringify({ tenant_id: A, user_id: USER })]],
  );
  assert.deepEqual(claimsOf(w.seen[0]), { ws: A, user: USER, bound: true });
});

test("POST channels/whatsapp/standing says what the edge refused in the owner's words: no number is a conflict, the rest is Meta's and ours to try again", async () => {
  const says = async (status, error) => {
    const w = edge(() => ({ status, body: { ok: false, error } }));
    try {
      return await standing.POST.run(post(), ctxFor("owner")).then(
        () => null,
        (e) => [e.code, e.status, e.message],
      );
    } finally {
      w.restore();
    }
  };
  assert.deepEqual(await says(409, "no_channel"), ["conflict", 409, "This workspace has no WhatsApp number connected."]);
  assert.deepEqual(await says(503, "no_token"), [
    "upstream_meta",
    502,
    "Chanlytics could not read this number's WhatsApp credentials. Connect the number again and try again.",
  ]);
  assert.deepEqual(await says(502, "meta_failed"), ["upstream_meta", 502, "Meta did not answer. Try again in a moment."]);
  assert.deepEqual(await says(503, "channel_read_failed"), [
    "upstream_meta",
    502,
    "Chanlytics could not read the workspace's WhatsApp number just now. Try again in a moment.",
  ]);
  assert.deepEqual(await says(500, "something_new"), [
    "upstream_meta",
    502,
    "Meta's answer about the number could not be read (something_new).",
  ]);
  // An edge that said yes and nothing of what Meta holds is a failed read, never a standing guessed.
  const w = edge(() => ({ body: { ok: true } }));
  try {
    await refused(standing.POST.run(post(), ctxFor("owner")), "upstream_meta", 502, "could not be read (edge 200)");
  } finally {
    w.restore();
  }
});

test("the two buckets count apart, and a refusal says which: forty a minute for the codes, twelve an hour for the check", async () => {
  const w = edge(() => ({ body: { ok: true, codes: [], kept: "same", can_send: "AVAILABLE" } }));
  try {
    for (let i = 0; i < RATE.whatsapp_standing.limit; i++) await standing.POST.run(post(), ctxFor("owner"));
    await refused(standing.POST.run(post(), ctxFor("owner")), "rate_limited", 429, "checks of your WhatsApp number");
    assert.deepEqual(await codes.GET.run(get(), ctxFor("owner")), { codes: [] }, "the check's count is not the codes'");
    for (let i = 1; i < RATE.lines_codes.limit; i++) await codes.GET.run(get(), ctxFor("owner"));
    await refused(codes.GET.run(get(), ctxFor("owner")), "rate_limited", 429, "checks for codes");
  } finally {
    w.restore();
  }
});
```

The one count the new door changes is a pin in the rate-limit test, which holds every door that reaches a live provider to its guard (`if (!deployment.providersLive)`); the number check is the third of the number connection's file and the twelfth in all (`swap`):

```swap
##FILE tooling/scripts/tests/routes/rate-limit.test.mjs
##FROM
    11,
    "the whisper, the steer, the sign-up config, the number connection, the template sync, create and delete, the playbook run, the end and the hand-over of a call, and a reach-out's preview",
##TO
    12,
    "the whisper, the steer, the sign-up config, the number connection, the check of what Meta holds about the number, the template sync, create and delete, the playbook run, the end and the hand-over of a call, and a reach-out's preview",
##END
```

- [ ] **Step 2: Run them to verify they fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/connections/standing-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/rate-limit.test.mjs
```
Expected: the first FAILS at load: `apps/dashboard/app/api/v1/lines/codes/route.ts` cannot be found; the second FAILS its F42 case (`11 !== 12`: the door that checks the number is not there yet) and passes every other.

- [ ] **Step 3: The buckets, the two verbs, the two routes, the refresh**

The buckets, named by what each route does (`swap`):

```swap
##FILE apps/dashboard/src/server/rate-limit.ts
##FROM
  lines_forwarding: { limit: 10, windowMs: HOUR_MS, noun: "forwarding changes" },
##TO
  lines_forwarding: { limit: 10, windowMs: HOUR_MS, noun: "forwarding changes" },
  /** The codes texted to the line, read while Meta's sign-up window is open: the page asks every three seconds (twenty a minute), and once when it opens. */
  lines_codes: { limit: 40, windowMs: MIN_MS, noun: "checks for codes" },
  /** Asking Meta what it holds about a number: a Graph read each, asked only when a page opens on a standing that is missing or not available. */
  whatsapp_standing: { limit: 12, windowMs: HOUR_MS, noun: "checks of your WhatsApp number" },
##END
```

The verbs (`swap`): the check beside Connect, in the module that holds the WhatsApp doors, and the codes beside the lines'.

```swap
##FILE apps/dashboard/src/server/connections/whatsapp.ts
##FROM
const CONNECT_TIMEOUT_MS = MIN_MS;
##TO
const CONNECT_TIMEOUT_MS = MIN_MS;
/** A check of the number is two Graph reads at once, a keeping and, when it turned bad, a notice: half a minute. */
const STANDING_TIMEOUT_MS = 30_000;
##END
##FILE apps/dashboard/src/server/connections/whatsapp.ts
##FROM
  return { ok: false, reason: edgeReasonOf(r), detail: j.detail };
}
##TO
  return { ok: false, reason: edgeReasonOf(r), detail: j.detail };
}

type StandingCheck =
  | { ok: true; kept: string; canSend: string }
  | { ok: false; reason: EdgeReason; detail?: string };

/**
 * The owner asks what Meta holds about the workspace's number now: the edge reads it with the business's own token, keeps it
 * on the channel (where Connections' row reads it from) and tells the owner if it turned BLOCKED. Answers what was kept and
 * Meta's word for whether the number may send; what Meta said stays on the channel. A preview never asks a real number.
 */
export async function checkWhatsAppStanding(tenantId: string, userId: string): Promise<StandingCheck> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await callEdge(
    "/api/admin/whatsapp/standing",
    { tenant_id: tenantId, user_id: userId },
    { workspace: tenantId, user: userId, timeoutMs: STANDING_TIMEOUT_MS },
  );
  const j = (r.body ?? {}) as { ok?: boolean; kept?: string; can_send?: string; detail?: string };
  if (edgeAnswered(r) && j.ok && typeof j.kept === "string" && typeof j.can_send === "string")
    return { ok: true, kept: j.kept, canSend: j.can_send };
  return { ok: false, reason: edgeReasonOf(r), detail: j.detail };
}
##END
##FILE apps/dashboard/src/server/connections/lines.ts
##FROM
import type { LineDto } from "@chanlytics/contracts";
##TO
import type { LineCodeDto, LineDto } from "@chanlytics/contracts";
##END
##FILE apps/dashboard/src/server/connections/lines.ts
##FROM
  statusCache = { at: now, value };
  return value;
}
##TO
  statusCache = { at: now, value };
  return value;
}

/** How long a read of the codes waits on the edge, which waits on the provider's list: the page asks again in three seconds. */
const LINE_CODES_TIMEOUT_MS = 12_000;

/** A code as the edge answered it, in the shape the page holds, or nothing: what is not a code is dropped and never mended. */
function lineCodeOf(c: unknown): LineCodeDto | null {
  if (c === null || typeof c !== "object") return null;
  const { code, from, at } = c as Record<string, unknown>;
  return typeof code === "string" && typeof at === "string"
    ? { code, from: typeof from === "string" ? from : null, at }
    : null;
}

/**
 * The one-time codes texted to the workspace's own line lately (GET lines/codes), read by the edge from the provider's own record
 * and never kept here. A deployment that reaches no providers (a preview) has none to read, which is no failure; a read that
 * failed is said (`ok: false`), for the route to refuse in words, never an empty list that reads as nobody writing.
 */
export async function lineCodesFor(
  tenantId: string,
  userId: string,
): Promise<{ ok: true; codes: LineCodeDto[] } | { ok: false }> {
  if (!edgeConfigured() || !deployment.providersLive) return { ok: true, codes: [] };
  const a = await callEdge("/api/admin/lines/codes", null, {
    workspace: tenantId,
    user: userId,
    method: "GET",
    timeoutMs: LINE_CODES_TIMEOUT_MS,
  });
  const raw = a.body?.codes;
  if (a.status !== 200 || a.body?.ok !== true || !Array.isArray(raw)) return { ok: false };
  return { ok: true, codes: raw.map(lineCodeOf).filter((c): c is LineCodeDto => c !== null) };
}
##END
```

The routes (the owner's door, as `channels/whatsapp/connect` and `google/connect` declare it):

Create `apps/dashboard/app/api/v1/lines/codes/route.ts`:

```ts
import { AppError } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { lineCodesFor } from "@/server/connections/lines";

/**
 * GET /api/v1/lines/codes — the one-time codes texted to the workspace's own line in the last fifteen minutes: Meta's, when the
 * owner is connecting that number to WhatsApp and its sign-up window asked for one. The owner's or the partner's, the door
 * Connect WhatsApp is behind (a code is the owner's to read). Read by the edge from the provider's own record on every call,
 * never kept here and never cached (private, no-store, as every route: a code is wanted within seconds of being sent); the
 * page asks when Connections opens and every three seconds while Meta's window is open, which is the codes' own bucket.
 *
 * The handle is lineCodesFor in src/server/connections/lines.ts: the route is its declaration (who may, how often), the verb is
 * what it does.
 */
export const GET = read({
  scope: workspace,
  role: "partner",
  rate: "lines_codes",
  handle: async ({ ctx, member }) => {
    const r = await lineCodesFor(member.tenantId, ctx.userId);
    if (!r.ok) throw new AppError("internal", "The texts sent to your line could not be read just now.", 502);
    return { codes: r.codes };
  },
});
```

Create `apps/dashboard/app/api/v1/channels/whatsapp/standing/route.ts`:

```ts
import { AppError } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { checkWhatsAppStanding } from "@/server/connections/whatsapp";

/**
 * POST /api/v1/channels/whatsapp/standing — ask Meta what it holds about the workspace's WhatsApp number now: whether it may
 * send, what stands in the way, its display name's review, the business's verification and tier. The edge reads it with the
 * business's own token and keeps it on the channel, which the settings read carries, so Connections' row says it; the owner is
 * told by notice if it turned BLOCKED. The owner's or the partner's, as Connect WhatsApp is; counted in its own bucket (a
 * Graph read each). The page asks only when it opens on a standing that is missing, or not AVAILABLE and read more than ten
 * minutes ago, so a payment method added a minute ago shows as fixed without waiting for the six-hourly read. Answers what was
 * kept and Meta's word for the number, never Meta's words.
 */
const SAID: Record<string, string> = {
  preview: "Checking only works on the production dashboard.",
  no_channel: "This workspace has no WhatsApp number connected.",
  no_token: "Chanlytics could not read this number's WhatsApp credentials. Connect the number again and try again.",
  channel_read_failed:
    "Chanlytics could not read the workspace's WhatsApp number just now. Try again in a moment.",
  meta_failed: "Meta did not answer. Try again in a moment.",
};

export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "whatsapp_standing",
  handle: async ({ ctx, member }) => {
    const r = await checkWhatsAppStanding(member.tenantId, ctx.userId);
    if (!r.ok) {
      const said = SAID[r.reason] ?? `Meta's answer about the number could not be read (${r.reason}).`;
      throw r.reason === "no_channel" ? new AppError("conflict", said, 409) : new AppError("upstream_meta", said, 502);
    }
    return { kept: r.kept, can_send: r.canSend };
  },
});
```

The refresh the shell makes after the check (`swap`):

```swap
##FILE apps/dashboard/src/legacy-bridge/refresh-map.ts
##FROM
  "POST channels/whatsapp/connect": () => [settingsOverride, setupOverride, ...readiness()],
##TO
  "POST channels/whatsapp/connect": () => [settingsOverride, setupOverride, ...readiness()],
  // What Meta holds about the number is kept on the channel's config, which the settings read carries: Connections' row repaints.
  "POST channels/whatsapp/standing": () => [settingsOverride],
##END
```

- [ ] **Step 4: Bank the policy, regenerate the client and the reference, build, run**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/server/rate-limit.ts apps/dashboard/src/server/connections/whatsapp.ts apps/dashboard/src/server/connections/lines.ts apps/dashboard/src/legacy-bridge/refresh-map.ts apps/dashboard/app/api/v1/lines/codes/route.ts apps/dashboard/app/api/v1/channels/whatsapp/standing/route.ts tooling/scripts/tests/connections/standing-routes.test.mjs
git add apps/dashboard/app/api/v1/lines/codes/route.ts apps/dashboard/app/api/v1/channels/whatsapp/standing/route.ts tooling/scripts/tests/connections/standing-routes.test.mjs
UPDATE_ROUTE_POLICY=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/route-policy.test.mjs
node tooling/scripts/gen/route-types.mjs
corepack pnpm gen:api-reference
git diff --stat -- tooling/scripts/tests/route-policy.json apps/dashboard/src/client/routes.generated.ts packages/contracts/src/route-keys.generated.ts docs/api.md
corepack pnpm --filter "./packages/*" build
for f in $(git ls-files packages/contracts/dist packages/db/dist packages/jobs/dist packages/channels/dist packages/core/dist); do git diff -w --ignore-cr-at-eol --quiet -- "$f" && git checkout -- "$f"; done
node tooling/scripts/checks/test.mjs tooling/scripts/tests/connections/standing-routes.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/route-policy.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/route-types.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/api-reference.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/rate-limit.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/refresh-coverage.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/edge/dashboard-names-its-callers.test.mjs
corepack pnpm -r typecheck
```
Expected: the policy file gains two blocks, `"GET lines/codes": { "kind": "read", "scope": "workspace", "role": "partner", "rate": "lines_codes", "spend": false }` between `POST lines/buy` and `POST lines/forwarding`, and `"POST channels/whatsapp/standing": { "kind": "write", "scope": "workspace", "role": "partner", "rate": "whatsapp_standing", "spend": false }` after `GET channels/whatsapp/signup` (the file's order is the routes' path order); the generated client and the contracts' route keys gain both keys; `docs/api.md` gains two sections; every test PASSES. `refresh-coverage.test.mjs` is the one that fails if the `POST channels/whatsapp/standing` row of the refresh map is left out ("a write in neither table"); typecheck clean.

- [ ] **Step 5: Commit**

```bash
for f in $(git ls-files packages/contracts/dist packages/db/dist packages/jobs/dist packages/channels/dist packages/core/dist); do git diff -w --ignore-cr-at-eol --quiet -- "$f" && git checkout -- "$f"; done
git add apps/dashboard/src/server/rate-limit.ts apps/dashboard/src/server/connections/whatsapp.ts apps/dashboard/src/server/connections/lines.ts apps/dashboard/src/legacy-bridge/refresh-map.ts apps/dashboard/src/client/routes.generated.ts packages/contracts/src/route-keys.generated.ts packages/*/dist tooling/scripts/tests/route-policy.json docs/api.md tooling/scripts/tests/connections/standing-routes.test.mjs tooling/scripts/tests/routes/rate-limit.test.mjs apps/dashboard/app/api/v1/lines/codes/route.ts apps/dashboard/app/api/v1/channels/whatsapp/standing/route.ts
git commit -m "The dashboard's two owner routes: the codes sent to the workspace's line and a check of what Meta holds about its number, each declaring its policy." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 10: The channels read carries what Meta holds, so the page, Ask and the Broadcasts page read one answer

**Why:** the WhatsApp row (Task 1) reads `ChannelVM.standing`, which `toChannelVM` takes from the channels read's DTO, and the settings surface builds every view model from `GET channels`, so the one place that has to change is `readers/channels.ts`: it passes the kept standing and when it was read, as it passes the quality. The standing is read back from the row's config through contracts' `standingFromConfig` (an object with Meta's word for `can_send`, else nothing: a config that holds something else is no standing, never a guess), so a row the keeping door wrote and one a person edited by hand read alike. Members see it, as they see quality: the route's policy (every member reads) is unchanged and this adds no route. Ask's tools map the DTO into their own answers field by field (`workspace.settings` says kind, status and number), so nothing they say moves; the reader is shared, so the number Ask says is the number the page shows.

**Files:**
- Modify: `apps/dashboard/src/server/readers/channels.ts`, `tooling/scripts/tests/ask/readers.test.mjs`

- [ ] **Step 1: Write the failing test**

The channels read's own test pins the DTO's keys in order, so it learns the two new ones, and a case holds what the reader does with a config (`swap`):

```swap
##FILE tooling/scripts/tests/ask/readers.test.mjs
##FROM
    "messaging_limit",
    "quality_at",
  ]);
##TO
    "messaging_limit",
    "quality_at",
    "standing",
    "standing_read_at",
  ]);
##END
##FILE tooling/scripts/tests/ask/readers.test.mjs
##FROM
    "by kind, each with when it last heard from a customer",
  );
});
##TO
    "by kind, each with when it last heard from a customer",
  );
});

test("the channels carry what Meta holds about the WhatsApp number, as the edge kept it on the row's config, and when it was read: read back as held, so a config that holds no standing says none -- the page's route says the same as the reader, byte for byte", async () => {
  const held = {
    can_send: "BLOCKED",
    problems: [
      {
        entity: "WABA",
        code: 141006,
        said: "A payment method is required to send messages",
        fix: "Add a payment method in WhatsApp Manager",
      },
    ],
    notes: [],
    name: "Harbor Moving",
    name_status: "APPROVED",
    verification: "not_verified",
    limit: "TIER_250",
    has_payment_method: false,
    owner_business_id: "410540000000001",
    waba_id: "205540000000001",
  };
  const world = (config) =>
    channelsWorld({
      tenant_channels: [{ ...channelsWorld().tenant_channels[0], config }, channelsWorld().tenant_channels[1]],
    });
  const first = async (config) =>
    (await kernel.load(turnIn(dayCtx(world(config))), channelsReader, undefined)).data.channels[0];
  const stamped = { quality_rating: "GREEN", standing: held, standing_read_at: "2026-10-06T14:55:00Z" };
  const ok = await first(stamped);
  assert.deepEqual([ok.standing, ok.standing_read_at, ok.quality], [held, "2026-10-06T14:55:00Z", "GREEN"]);
  const page = await channelsRoute.GET.run(req(`?workspace=${A}`), dayCtx(world(stamped)));
  assert.equal(JSON.stringify(page.channels[0]), JSON.stringify(ok), "the route says what the reader says");
  for (const standing of [undefined, null, "BLOCKED", [], {}, { can_send: "" }, { problems: [] }]) {
    const c = await first({ standing });
    assert.deepEqual([c.standing, c.standing_read_at], [null, null], JSON.stringify(standing));
  }
  assert.equal(channelsRoute.GET.policy.role, null, "every member reads it, as they read the quality: the policy is the route's and is not changed");
});
##END
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/readers.test.mjs`
Expected: FAIL: the keys test (the DTO has ten keys, not twelve) and the new case (`ok.standing` is `undefined`). Every other case in the file PASSES.

- [ ] **Step 3: The reader**

```swap
##FILE apps/dashboard/src/server/readers/channels.ts
##FROM
import type { ChannelDto } from "@chanlytics/contracts";
##TO
import { standingFromConfig, type ChannelDto } from "@chanlytics/contracts";
##END
##FILE apps/dashboard/src/server/readers/channels.ts
##FROM
 * the edge). The route's body, moved here whole, so Settings, the Broadcasts page's number and Ask's
##TO
 * the edge) and what Meta holds about the number (its standing, kept on the config by the edge: whether it may send, what
 * stands in the way, its display name's review, the business's verification and tier, and when it was read). The route's body,
 * moved here whole, so Settings, the Broadcasts page's number and Ask's
##END
##FILE apps/dashboard/src/server/readers/channels.ts
##FROM
        quality_at: s("quality_at"),
##TO
        quality_at: s("quality_at"),
        standing: standingFromConfig(cfg.standing),
        standing_read_at: s("standing_read_at"),
##END
```

- [ ] **Step 4: Format, run**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/server/readers/channels.ts tooling/scripts/tests/ask/readers.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/readers.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/connections/channels-vm.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-tool-names.test.mjs
corepack pnpm -r typecheck
```
Expected: all PASS; typecheck clean. The Broadcasts and playbooks pages read the quality fields only (`wa?.quality`, `wa?.quality_event`, `wa?.messaging_limit`), so they are untouched.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/server/readers/channels.ts tooling/scripts/tests/ask/readers.test.mjs
git commit -m "The channels read carries what Meta holds about the WhatsApp number and when it was read, so the Connections row can say it." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 11: The Connections page says it: the notes under each row and the links they carry, the codes while Meta's window is open, the standing when it is missing or stale, a sign-up a reload left behind, and on Billing where WhatsApp is billed

**Why:** the page draws what contracts say (every sentence, every note) and asks for the two things only an open page wants.

- **The notes and their links.** `row.tsx` draws `r.notes` under the row's sentence, each its own line, wrapped whole (the sentence is one line cut with an ellipsis; a note is a sentence an owner has to read), in the row's own hint style: one small rule in `settings.css` that reads the hint tokens (`--set-hint`, `--ink-dim`) and no literal. A note is its words and, where contracts gives one, a link after them (Meta's prices, Meta's page for adding a payment method): the kit's `LinkButton` as a door, `target="_blank"` and `rel="noopener noreferrer"`, since both go to Meta's own pages. The words and the link are separate elements, so a test reads each.
- **Where WhatsApp is billed, on Billing.** One row at the foot of the plan card, from contracts' `WHATSAPP_COST_WORDS` and the shell's own door (`routeDoor`, the house's "a door is a link"): "WhatsApp messages your business starts are billed by Meta to the card on your WhatsApp account, not on this bill." and, as a link, "What WhatsApp costs", which goes to Connections (`admin/integrations`), where the explainer is under the WhatsApp row whether the number is connected or not. It is said on every workspace's Billing, on Stripe or by arrangement, since nothing about whose card Meta bills depends on how the workspace pays Chanlytics.
- **The codes.** The page's two asks join `whatsapp.ts`, where its other asks of the server about WhatsApp are, as two exports of their own that a test stubs by assignment, as `waConnect`'s are (not keys of `waConnect`: `whatsapp-connect.test.mjs` holds its shape as `config` and `start`): `lineCodes.read` (`GET lines/codes`) and `waStanding.check` (`POST channels/whatsapp/standing`). A new module `live.ts` holds the hooks that use them (the dead-exports check does not follow a test's dynamic import, so a verb that only its own module read would be counted dead; the hooks are another module's). `useLineCodes` asks once when the page opens (an owner, on a workspace that has a line of its own: nothing else can receive one) and every three seconds while Meta's window is open (`LINE_CODES_EVERY_MS`); a read that fails changes nothing. The pane knows the window is open because it is the one that started it: `runVerb`'s Connect sets and clears a `signup` flag around `waConnect.start()`.
- **The standing.** `useStandingCheck` asks Meta once per opening (`standingNeedsRead`, Task 1: nothing kept, or not AVAILABLE and read more than ten minutes ago), for an owner, on an active WhatsApp channel; the write re-reads Settings (Task 9's refresh row), where the row reads what the edge kept.
- **A sign-up a reload left behind (design part 5).** On 6 October the page was loaded again at 12:11 while Meta's window was open; Meta finished at 12:48 and no connect was ever asked, because a reload takes the listener and the SDK's login callback with it and the one-time code has nowhere to go. A reloaded page cannot get the code back, so the page keeps a mark and says what to do: `startSignup` (the body of `waConnect.start()`) writes `chanlytics.whatsapp.signup` (the instant it began) to `sessionStorage` in try/catch, as the house keeps storage, and clears it however the sign-up ends (connected, cancelled, failed). `signupLeftOpenAt()` reads it: the mark of a sign-up that **this page is not itself running** (a page the owner left and came back to inside the same load is still running it, and has not failed to come back). The pane reads it once as it opens, passes it to `connectionRows` as `signupLeftOpenAt` (contracts says the note, for an hour, while the workspace has no WhatsApp number), and forgets it when Connect is pressed again.

**Files:**
- Create: `apps/dashboard/src/surfaces/settings/connections/live.ts`
- Modify: `apps/dashboard/src/surfaces/settings/connections/pane.tsx`, `apps/dashboard/src/surfaces/settings/connections/row.tsx`, `apps/dashboard/src/surfaces/settings/connections/whatsapp.ts`, `apps/dashboard/src/surfaces/settings/billing/pane.tsx`, `apps/dashboard/src/legacy/styles/settings.css`, `tooling/scripts/tests/workspace/settings-doors.test.mjs`, `tooling/scripts/tests/whatsapp/whatsapp-connect.test.mjs`

- [ ] **Step 1: Write the failing tests**

The sign-up's mark, run on the real module over a stand-in window (`whatsapp-connect.test.mjs`, whose browser-flow test pins the object's keys and the order of the route it calls; neither moves) (`swap`):

```swap
##FILE tooling/scripts/tests/whatsapp/whatsapp-connect.test.mjs
##FROM
  // The diag showing the gates that decide who is answered is run in diag-door.test.mjs.
});
##TO
  // The diag showing the gates that decide who is answered is run in diag-door.test.mjs.
});

test("a sign-up leaves a mark in the tab's sessionStorage while Meta's window is open and takes it away however it ends; a page that finds one left by a page that is gone can say so, and the page that is running the sign-up never does", async () => {
  const mod = await import(
    pathToFileURL(path.join(here, "../../../../apps/dashboard/src/surfaces/settings/connections/whatsapp.ts")).href
  );
  const MARK = "chanlytics.whatsapp.signup";
  const held = new Map();
  const ops = [];
  const storage = {
    getItem: (k) => held.get(k) ?? null,
    setItem: (k, v) => {
      ops.push(["set", k]);
      held.set(k, String(v));
    },
    removeItem: (k) => {
      ops.push(["remove", k]);
      held.delete(k);
    },
  };
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const whileRunning = [];
  const win = {
    sessionStorage: storage,
    location: { pathname: "/w/harbor", search: "", hash: "" },
    // Meta's door: asked first by every sign-up. While it is out the window has not opened, but the sign-up has begun.
    fetch: async () => {
      whileRunning.push([held.has(MARK), mod.signupLeftOpenAt(win)]);
      await gate;
      return new Response(
        JSON.stringify({
          ok: true,
          data: { app_id: null, config_id: null, graph_version: "v25.0", ready: false, reason: "no_config_id" },
        }),
        { status: 200 },
      );
    },
  };
  const realWindow = globalThis.window;
  globalThis.window = win;
  try {
    // A page that is gone left a mark: this one says when the sign-up began.
    const left = new Date(Date.now() - 5 * 60_000).toISOString();
    held.set(MARK, left);
    assert.equal(mod.signupLeftOpenAt(win), left);
    const running = mod.waConnect.start();
    await new Promise((resolve) => setImmediate(resolve));
    release();
    const result = await running;
    assert.deepEqual([result.ok, result.reason], [false, "not_ready"], "Meta's door says it cannot start: the sign-up ends at once");
    assert.deepEqual(
      whileRunning,
      [[true, null]],
      "while it ran there was a mark, and this page, which was running it, did not call it left behind",
    );
    assert.deepEqual(
      ops.map(([op]) => op),
      ["set", "remove"],
      "written when the sign-up began, taken away when it ended, whatever it came to",
    );
    assert.equal(held.has(MARK), false);
    assert.equal(mod.signupLeftOpenAt(win), null, "and nothing is left behind once it has ended");

    // Storage that is blocked: no mark is made, nothing throws, and no page claims a sign-up it cannot know of.
    const blocked = () => {
      throw new Error("storage is blocked");
    };
    win.sessionStorage = { getItem: blocked, setItem: blocked, removeItem: blocked };
    assert.equal(mod.signupLeftOpenAt(win), null);
    assert.equal((await mod.waConnect.start()).reason, "not_ready");
  } finally {
    if (realWindow === undefined) delete globalThis.window;
    else globalThis.window = realWindow;
  }
});
##END
```

The page, over the stub React the Connections tests share (`settings-doors.test.mjs`): the window learns timers, the module that holds the page's asks is stubbed beside `waConnect`, and four cases follow (`swap`):

```swap
##FILE tooling/scripts/tests/workspace/settings-doors.test.mjs
##FROM
import { IN_APP_CLASS, ROLE_PERMS, roleGate, stateOf, billingAccountDto } from "@chanlytics/contracts";
##TO
import {
  IN_APP_CLASS,
  ROLE_PERMS,
  roleGate,
  stateOf,
  billingAccountDto,
  toChannelVM,
} from "@chanlytics/contracts";
##END
##FILE tooling/scripts/tests/workspace/settings-doors.test.mjs
##FROM
globalThis.window = {
  location: {
    pathname: "/w/studio",
##TO
/** The timers a page set with window.setInterval, held and run by a test: a tick is a call of its function. */
const intervals = [];
globalThis.window = {
  location: {
    pathname: "/w/studio",
##END
##FILE tooling/scripts/tests/workspace/settings-doors.test.mjs
##FROM
  clearTimeout: (h) => clearTimeout(h),
  __roleGate: roleGate,
##TO
  clearTimeout: (h) => clearTimeout(h),
  setInterval: (fn, ms) => {
    intervals.push({ fn, ms, live: true });
    return intervals.length;
  },
  clearInterval: (h) => {
    if (intervals[h - 1]) intervals[h - 1].live = false;
  },
  __roleGate: roleGate,
##END
##FILE tooling/scripts/tests/workspace/settings-doors.test.mjs
##FROM
const { waConnect } = await import(`${SETTINGS}/whatsapp.ts`);
##TO
const { waConnect, lineCodes, waStanding } = await import(`${SETTINGS}/whatsapp.ts`);
##END
##FILE tooling/scripts/tests/workspace/settings-doors.test.mjs
##FROM
Object.assign(waConnect, { config: async () => null });
##TO
Object.assign(waConnect, { config: async () => null });
// ...and so are what the open page asks beside it: the codes sent to the line, and the check of the number.
Object.assign(lineCodes, { read: async () => [] });
Object.assign(waStanding, { check: async () => true });
##END
##FILE tooling/scripts/tests/workspace/settings-doors.test.mjs
##FROM
  assert.equal(byTestId(tree, "email-setup"), null, "the form closes; the row repaints from Setup's re-read");
});
##TO
  assert.equal(byTestId(tree, "email-setup"), null, "the form closes; the row repaints from Setup's re-read");
});

/* ------------------------------ what Connections asks while it is open ------------------------------ */

/** The workspace's own line, as Setup holds it, and what Setup says around it for the pane. */
const OWN_LINE = {
  id: "l1",
  e164: "+16465550100",
  kind: "chanlytics",
  provider: "twilio",
  area_code: 646,
  voice_state: "answering",
  sms_state: "active",
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: "none",
  step: null,
  last_error: null,
  state_since: "2026-09-01T00:00:00Z",
  created_at: "2026-09-01T00:00:00Z",
};
const setupWithLine = () => ({
  dto: {
    business: { name: "Best Movers" },
    lines: { rows: [OWN_LINE], ready: true },
    requests: { line: null },
    calendar: null,
    email: null,
  },
});
/** What a row says under its sentence, one string a note (the words, not the link after them). */
const noteTexts = (tree, kind) =>
  all(byTestId(tree, `connection-${kind}`), (n) => n.props?.["data-testid"] === "connection-note-text").map(textOf);
/** The links its notes carry: each one's words, where it goes, and how it opens. */
const noteLinks = (tree, kind) =>
  all(
    byTestId(tree, `connection-${kind}`),
    // The kit's link and what it draws carry one test id: the link itself is the first of them.
    (n) => n.props?.["data-testid"] === "connection-note-link" && n.type?.name === "LinkButton",
  ).map((n) => [
    textOf(n),
    n.props.href,
    n.props.target,
    n.props.rel,
  ]);
/** What WhatsApp costs, said last under a connected row and before Connect (contracts WHATSAPP_COST_WORDS). */
const COST = [
  "WhatsApp is billed by Meta, straight to the card on your WhatsApp account — not on your Chanlytics bill.",
  "Free: replies to a customer within 24 hours of their last message — the receptionist's and yours.",
  "Charged by Meta for each one delivered: reminders and notices sent after those 24 hours, and every campaign or offer.",
  "Prices depend on the customer's country.",
];
const PRICES = ["Meta's current prices", "https://business.whatsapp.com/products/platform-pricing#rates", "_blank", "noopener noreferrer"];
const MIN = 60_000;
/** The WhatsApp channel as the settings read holds it, with what Meta holds about the number and when it was read. */
const whatsappChannel = (standing, readAgoMs, over = {}) =>
  toChannelVM({
    id: "ch-wa",
    kind: "whatsapp",
    number_e164: "+13055550188",
    status: "active",
    created_at: "2026-09-01T00:00:00Z",
    last_inbound_at: null,
    standing,
    standing_read_at: readAgoMs === null ? null : new Date(Date.now() - readAgoMs).toISOString(),
    ...over,
  });

test("a Connect row draws what Meta will ask under its sentence; a sign-up an earlier page left open is named first, and forgotten the moment Connect is pressed again", async () => {
  asRole("owner");
  seam({ channels: [], google: null, setup: null });
  const realStart = waConnect.start;
  let finish;
  Object.assign(waConnect, {
    config: async () => ({ ready: true, reason: null }),
    start: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  // The page that began a sign-up five minutes ago is gone: its mark is what a page that opens now finds.
  globalThis.sessionStorage.setItem("chanlytics.whatsapp.signup", new Date(Date.now() - 5 * MIN).toISOString());
  try {
    render(Connections);
    await flush();
    let tree = settle(Connections);
    const notes = noteTexts(tree, "whatsapp");
    assert.equal(notes.length, 10, "the one it left behind, and the nine the owner meets before and in Meta's window");
    assert.match(notes[0], /^A WhatsApp sign-up was started here and did not come back to Chanlytics/);
    assert.match(notes[1], /^Meta asks you to sign in with Facebook/);
    assert.deepEqual(notes.slice(3, 7), COST, "what WhatsApp costs, between the code Meta texts and the payment method it asks for");
    assert.match(notes[7], /^Add a payment method when Meta asks for one: without it, replies still go out/);
    assert.equal(notes.at(-1), "Keep this page open until Meta's window closes.");
    assert.deepEqual(noteLinks(tree, "whatsapp"), [PRICES], "one link, to Meta's own prices, which opens in a new tab");
    const box = byTestId(tree, "connection-whatsapp-notes");
    assert.match(String(box.props.className), /\bset-int-notes\b/, "drawn in the row's own hint style, each note a line of its own");
    press(byTestId(tree, "connect-whatsapp-btn"));
    tree = settle(Connections);
    assert.equal(noteTexts(tree, "whatsapp").length, 9, "pressing Connect again forgets what the earlier page left behind");
    finish({ ok: false, reason: "cancelled", message: "The sign-up was closed before it finished. Nothing was connected." });
    await flush();
    assert.equal(noteTexts(settle(Connections), "whatsapp").length, 9, "and a sign-up that was cancelled does not bring it back");
  } finally {
    Object.assign(waConnect, { config: async () => null, start: realStart });
    globalThis.sessionStorage.removeItem("chanlytics.whatsapp.signup");
  }
});

test("the codes sent to the workspace's own line are asked for as Connections opens and every three seconds while Meta's window is open, and said on the Texting row; a read that fails changes nothing, and anyone but an owner asks nothing", async () => {
  asRole("owner");
  seam({ channels: [], google: null, setup: setupWithLine() });
  const asked = [];
  let codes = [];
  const realRead = lineCodes.read;
  const realStart = waConnect.start;
  let finish;
  Object.assign(lineCodes, {
    read: async () => {
      asked.push(asked.length);
      if (codes === "down") throw new Error("the edge is down");
      return codes;
    },
  });
  Object.assign(waConnect, {
    config: async () => ({ ready: true, reason: null }),
    start: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  intervals.length = 0;
  try {
    render(Connections);
    await flush();
    let tree = settle(Connections);
    assert.equal(asked.length, 1, "asked once as the page opens");
    assert.deepEqual(intervals.filter((i) => i.live), [], "and not again until Meta's window is open");
    assert.deepEqual(noteTexts(tree, "sms"), [], "no code, no note");

    codes = [{ code: "788-963", from: "WhatsApp", at: new Date(Date.now() - 2 * MIN).toISOString() }];
    press(byTestId(tree, "connect-whatsapp-btn"));
    tree = settle(Connections);
    const timer = intervals.filter((i) => i.live);
    assert.deepEqual(timer.map((i) => i.ms), [3000], "every three seconds while Meta's window is open");
    timer[0].fn();
    await flush();
    tree = settle(Connections);
    assert.equal(asked.length, 2);
    assert.deepEqual(noteTexts(tree, "sms"), [
      "Code from WhatsApp: 788-963 · 2m ago",
      "Codes sent to this line are never answered and never become people.",
    ]);
    codes = "down";
    timer[0].fn();
    await flush();
    tree = settle(Connections);
    assert.equal(asked.length, 3);
    assert.equal(noteTexts(tree, "sms").length, 2, "a read that fails changes nothing: the page keeps what it has");

    finish({ ok: false, reason: "cancelled", message: "The sign-up was closed before it finished. Nothing was connected." });
    await flush();
    settle(Connections);
    assert.deepEqual(intervals.filter((i) => i.live), [], "the sign-up ended: nobody is waiting for a code any more");

    asRole("operator");
    const before = asked.length;
    render(Connections);
    await flush();
    assert.equal(asked.length, before, "an operator is never shown a code, so it is never asked for");
  } finally {
    Object.assign(lineCodes, { read: realRead });
    Object.assign(waConnect, { config: async () => null, start: realStart });
    asRole("owner");
  }
});

test("a page that opens on a standing that is missing, or one that is not AVAILABLE and ten minutes old, asks Meta once; a fresh one, an AVAILABLE one, a number that is off, and a page that is not an owner's ask nothing", async () => {
  const checks = [];
  const realCheck = waStanding.check;
  Object.assign(waStanding, {
    check: async () => {
      checks.push("asked");
      return true;
    },
  });
  const LIMITED = {
    can_send: "LIMITED",
    problems: [],
    notes: [],
    name: null,
    name_status: null,
    verification: null,
    limit: null,
    has_payment_method: null,
    owner_business_id: null,
    waba_id: null,
  };
  const opens = async (channels, role = "owner") => {
    checks.length = 0;
    asRole(role);
    seam({ channels, google: null, setup: null });
    render(Connections);
    await flush();
    settle(Connections);
    return checks.length;
  };
  try {
    assert.equal(await opens([whatsappChannel(null, null)]), 1, "nothing was kept");
    assert.equal(await opens([whatsappChannel({ ...LIMITED, can_send: "AVAILABLE" }, 2 * 24 * 60 * MIN)]), 0, "AVAILABLE is the clock's to renew");
    assert.equal(await opens([whatsappChannel(LIMITED, 5 * MIN)]), 0, "not available, read five minutes ago");
    assert.equal(await opens([whatsappChannel(LIMITED, 11 * MIN)]), 1, "not available and eleven minutes old: a payment method added since shows as fixed now");
    assert.equal(await opens([whatsappChannel(LIMITED, 11 * MIN)], "operator"), 0, "an operator's page never asks");
    assert.equal(await opens([]), 0, "no number connected: nothing to ask about");
    assert.equal(await opens([whatsappChannel(null, null, { status: "disabled" })]), 0, "a number that is switched off");
    assert.equal(await opens(null), 0, "the channels could not be read");
  } finally {
    Object.assign(waStanding, { check: realCheck });
    asRole("owner");
  }
});

test("the WhatsApp row draws what Meta holds under its sentence, each note a line of its own: a number Meta will not let send needs attention, says Meta's problem, and gives its fix and the rest", async () => {
  asRole("owner");
  const blocked = {
    can_send: "BLOCKED",
    problems: [
      {
        entity: "WABA",
        code: 141006,
        said: "A payment method is required to send messages",
        fix: "Add a payment method in WhatsApp Manager",
      },
    ],
    notes: [],
    name: "Harbor Moving",
    name_status: "APPROVED",
    verification: "not_verified",
    limit: "TIER_250",
    // The account has no payment method on file, and says which business owns it: the row says so, with the way to add one.
    has_payment_method: false,
    owner_business_id: "410540000000001",
    waba_id: "205540000000001",
  };
  seam({ channels: [whatsappChannel(blocked, 0)], google: null, setup: null });
  render(Connections);
  await flush();
  const tree = settle(Connections);
  const row = byTestId(tree, "connection-whatsapp");
  assert.equal(row.props["data-state"], "attention");
  assert.equal(
    textOf(find(row, (n) => n.props?.className === "set-team-mail")),
    "Meta: A payment method is required to send messages.",
  );
  assert.deepEqual(noteTexts(tree, "whatsapp"), [
    "Add a payment method in WhatsApp Manager.",
    "No payment method on your WhatsApp account yet: replies still go out, but reminders and campaigns will not be delivered.",
    "Your business isn't verified with Meta: you can start conversations with up to 250 people a day. Replies to customers who write first are not limited.",
    ...COST,
  ]);
  assert.deepEqual(
    noteLinks(tree, "whatsapp"),
    [
      [
        "Add one in Meta",
        "https://business.facebook.com/billing_hub/accounts/details/?business_id=410540000000001&asset_id=205540000000001&wizard_name=ADD_PM&account_type=whatsapp-business-account",
        "_blank",
        "noopener noreferrer",
      ],
      PRICES,
    ],
    "the way to add a payment method, on Meta's own page for this business and this account; and Meta's prices: each opens in a new tab",
  );
  assert.deepEqual(noteTexts(tree, "google_profile"), [], "a row with no notes draws no box");
  assert.equal(byTestId(tree, "connection-google_profile-notes"), null);
});
##END
```

The Billing page's line, held on its own (`swap`):

```swap
##FILE tooling/scripts/tests/workspace/settings-doors.test.mjs
##FROM
/* ------------------------------ Connections ------------------------------ */
##TO
/* ------------------------------ Billing says where WhatsApp is billed ------------------------------ */

test("Billing says, in contracts' words, that the WhatsApp messages the business starts are billed by Meta to the card on its WhatsApp account and not on this bill, and links what WhatsApp costs, which is on Connections", () => {
  asRole("owner");
  for (const over of [{ status: "none" }, { status: "active" }, { mode: "direct" }]) {
    billing(over);
    stripe();
    const tree = render(Billing, { flash() {} });
    const row = byTestId(tree, "billing-whatsapp");
    assert.ok(row, JSON.stringify(over));
    assert.equal(
      textOf(byTestId(row, "billing-whatsapp-line")),
      "WhatsApp messages your business starts are billed by Meta to the card on your WhatsApp account, not on this bill.",
      JSON.stringify(over),
    );
    const link = byTestId(row, "billing-whatsapp-link");
    assert.deepEqual(
      [textOf(link), link.props.href],
      ["What WhatsApp costs", "#/admin/integrations"],
      "the shell's own address for Settings > Connections, where the explainer is under the WhatsApp row",
    );
  }
});

/* ------------------------------ Connections ------------------------------ */
##END
```

- [ ] **Step 2: Run them to verify they fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/whatsapp-connect.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/workspace/settings-doors.test.mjs
```
Expected: FAIL: the first on its new case (`mod.signupLeftOpenAt is not a function`; the older cases PASS); the second at load (`TypeError: Cannot convert undefined or null to object`: `whatsapp.ts` does not export `lineCodes` yet).

- [ ] **Step 3: The page's asks, the hooks, the mark, the row's notes**

Create `apps/dashboard/src/surfaces/settings/connections/live.ts`:

```ts
/**
 * What Settings > Connections asks while it is open, beyond what the surfaces it reads tell it: the one-time codes texted to the
 * workspace's own line (Meta sends one when an owner connects that number to WhatsApp, and nobody else could see it: the
 * receptionist never answers it), and what Meta holds about the WhatsApp number when the kept answer is missing or has gone
 * stale. Both are the owner's (the routes refuse anyone else, and the page does not ask).
 *
 * The asks are `lineCodes` and `waStanding` (whatsapp.ts), module objects a test stubs by assignment as `waConnect`'s are.
 */
import { useEffect, useRef, useState } from "react";
import {
  channelFor,
  LINE_CODES_EVERY_MS,
  standingNeedsRead,
  type ChannelVM,
  type LineCodeDto,
} from "@chanlytics/contracts";
import { canDo } from "../../legacy-verbs";
import { lineCodes, waStanding } from "./whatsapp";

/** One read of the codes, painted if the page that asked still wants it; a read that fails changes nothing: the page keeps what it has. */
function askCodes(paint: (codes: LineCodeDto[]) => void): void {
  lineCodes.read().then(paint, () => {});
}

/**
 * The codes sent to the workspace's own line lately: asked for once as the page opens (an owner, on a workspace with a line of its
 * own: nothing else can receive one) and every LINE_CODES_EVERY_MS while Meta's sign-up window is open. Nothing is kept.
 */
export function useLineCodes(hasOwnLine: boolean, windowOpen: boolean): LineCodeDto[] {
  const [codes, setCodes] = useState<LineCodeDto[]>([]);
  const asking = hasOwnLine && canDo("team");
  useEffect(() => {
    let on = true;
    if (asking) askCodes((c) => on && setCodes(c));
    return () => {
      on = false;
    };
  }, [asking]);
  useEffect(() => {
    let on = true;
    const timer =
      asking && windowOpen
        ? window.setInterval(() => askCodes((c) => on && setCodes(c)), LINE_CODES_EVERY_MS)
        : null;
    return () => {
      on = false;
      if (timer !== null) window.clearInterval(timer);
    };
  }, [asking, windowOpen]);
  return codes;
}

/**
 * Asks Meta once per opening when the standing the WhatsApp row would say is missing, or is not AVAILABLE and was read more than
 * ten minutes ago (standingNeedsRead), so a payment method added a minute ago shows as fixed without waiting for the six-hourly
 * read. An owner's, on a number that is switched on; the answer reaches the row through Settings' re-read.
 */
export function useStandingCheck(channels: ChannelVM[] | null | undefined): void {
  const asked = useRef(false);
  const wa = channels ? channelFor(channels, "whatsapp") : null;
  const due = canDo("team") && !!wa && wa.on && standingNeedsRead(wa, Date.now());
  useEffect(() => {
    if (!due || asked.current) return;
    asked.current = true;
    waStanding.check().catch(() => {});
  }, [due]);
}
```

The sign-up's mark, and the page's two other asks about WhatsApp, in `whatsapp.ts` (`swap`):

```swap
##FILE apps/dashboard/src/surfaces/settings/connections/whatsapp.ts
##FROM
import { api, read } from "@/legacy-bridge/api";
##TO
import type { LineCodeDto } from "@chanlytics/contracts";
import { api, read } from "@/legacy-bridge/api";
##END
##FILE apps/dashboard/src/surfaces/settings/connections/whatsapp.ts
##FROM
export const waConnect = { config: signupConfig, start: () => startSignup() };
##TO
export const waConnect = { config: signupConfig, start: () => startSignup() };

/** The codes sent to the line lately, newest first: the edge reads them from the provider's own record on every call. */
const readCodes = async (): Promise<LineCodeDto[]> => (await read("GET lines/codes")).codes;

/**
 * Ask Meta what it holds about the number now. The edge keeps the answer on the channel, and the refresh this write makes
 * re-reads Settings, where the row says it.
 */
const checkStanding = async (): Promise<boolean> => (await api()("POST channels/whatsapp/standing")).ok;

/** What the open Connections page asks beside the sign-up: the codes texted to the line, and the check of the number. */
export const lineCodes = { read: readCodes };
export const waStanding = { check: checkStanding };
##END
##FILE apps/dashboard/src/surfaces/settings/connections/whatsapp.ts
##FROM
const LATE_MESSAGE_MS = 300;
##TO
const LATE_MESSAGE_MS = 300;

/**
 * The mark a sign-up leaves in this tab's sessionStorage while Meta's window is open: the instant it began. A reload takes with
 * it the listener Meta's window answers to and the SDK's login callback, so a sign-up Meta finishes after one never reaches
 * Chanlytics (6 October: the window was open at 12:07, the page was loaded again at 12:11, Meta finished at 12:48 and no connect
 * was ever asked; the one-time code rides the SDK's own callback, which a reloaded page cannot get back). The mark survives the
 * reload (sessionStorage is the tab's), so Connections can say what to do. Kept in try/catch as the house keeps storage: where
 * it is blocked the mark is a courtesy that is not made.
 */
const SIGNUP_MARK = "chanlytics.whatsapp.signup";

/** Whether this page is running a sign-up now: a mark with none running is one a page that is gone left behind. */
let signupRunning = false;

/**
 * When a sign-up was started on this tab by a page that is gone and never came back (an ISO instant), else null: no mark, storage
 * blocked, a render with no window, or a sign-up this page is itself running (it has not failed to come back, it is still open).
 */
export function signupLeftOpenAt(win?: Window): string | null {
  if (signupRunning) return null;
  try {
    return (win ?? window).sessionStorage.getItem(SIGNUP_MARK);
  } catch {
    return null;
  }
}

function markSignup(win: Window): void {
  try {
    win.sessionStorage.setItem(SIGNUP_MARK, new Date().toISOString());
  } catch {
    /* storage blocked: the mark is a courtesy, and the sign-up goes on without it */
  }
}

function clearSignupMark(win: Window): void {
  try {
    win.sessionStorage.removeItem(SIGNUP_MARK);
  } catch {
    /* storage blocked: there is no mark to take away */
  }
}
##END
##FILE apps/dashboard/src/surfaces/settings/connections/whatsapp.ts
##FROM
/** The sign-up window, opened and followed to its end; the code and the ids go to the app's own route. */
async function startSignup(win: Window = window): Promise<ConnectResult> {
  const cfg = await signupConfig().catch(() => null);
##TO
/**
 * The sign-up, marked while it runs and unmarked however it ends (connected, cancelled, failed): a mark still there on the next
 * load is a sign-up the page that began it never finished (signupLeftOpenAt).
 */
async function startSignup(win: Window = window): Promise<ConnectResult> {
  signupRunning = true;
  markSignup(win);
  try {
    return await runSignup(win);
  } finally {
    signupRunning = false;
    clearSignupMark(win);
  }
}

/** The sign-up window, opened and followed to its end; the code and the ids go to the app's own route. */
async function runSignup(win: Window): Promise<ConnectResult> {
  const cfg = await signupConfig().catch(() => null);
##END
```

The pane (`swap`):

```swap
##FILE apps/dashboard/src/surfaces/settings/connections/pane.tsx
##FROM
 * settings read), Setup's facts, Google -- so this pane fetches nothing of its own and cannot disagree with Setup. Three
##TO
 * settings read), Setup's facts, Google -- so its rows cannot disagree with Setup. What it asks for itself (live.ts) is what
 * only an open page wants: the one-time codes sent to the workspace's own line, and what Meta holds about the number when the
 * kept answer is missing or stale. Three
##END
##FILE apps/dashboard/src/surfaces/settings/connections/pane.tsx
##FROM
  type ConnectionRow as Row,
  type SetupDto,
} from "@chanlytics/contracts";
##TO
  type ConnectionRow as Row,
  type LineCodeDto,
  type SetupDto,
} from "@chanlytics/contracts";
##END
##FILE apps/dashboard/src/surfaces/settings/connections/pane.tsx
##FROM
import { GoogleChoose } from "./google-choose";
import { BusinessRecordForm } from "./record-form";
import { ConnectionRow, type Arm } from "./row";
import { waConnect } from "./whatsapp";
##TO
import { GoogleChoose } from "./google-choose";
import { useLineCodes, useStandingCheck } from "./live";
import { BusinessRecordForm } from "./record-form";
import { ConnectionRow, type Arm } from "./row";
import { signupLeftOpenAt, waConnect } from "./whatsapp";
##END
##FILE apps/dashboard/src/surfaces/settings/connections/pane.tsx
##FROM
/** The rows, as contracts compute them from the reads the page already holds. */
function rowsOf(
  channels: Parameters<typeof connectionRows>[0]["channels"] | undefined,
  waCfg: WaConfig,
  S: SetupSurface | null | undefined,
  G: GoogleSurface | undefined,
): Row[] {
  return connectionRows(
    {
      channels: channels || [],
      whatsapp: waCfg,
##TO
/** What the open page asked beside the reads it holds: Meta's door, the codes sent to the line, and a sign-up an earlier page left behind. */
interface Asked {
  whatsapp: WaConfig;
  codes: LineCodeDto[];
  signupLeftOpenAt: string | null;
}

/** The rows, as contracts compute them from the reads the page already holds. */
function rowsOf(
  channels: Parameters<typeof connectionRows>[0]["channels"] | undefined,
  asked: Asked,
  S: SetupSurface | null | undefined,
  G: GoogleSurface | undefined,
): Row[] {
  return connectionRows(
    {
      channels: channels || [],
      whatsapp: asked.whatsapp,
##END
##FILE apps/dashboard/src/surfaces/settings/connections/pane.tsx
##FROM
      email: S ? (S.dto.email ?? null) : null,
    },
    Date.now(),
##TO
      email: S ? (S.dto.email ?? null) : null,
      codes: asked.codes,
      signupLeftOpenAt: asked.signupLeftOpenAt,
    },
    Date.now(),
##END
##FILE apps/dashboard/src/surfaces/settings/connections/pane.tsx
##FROM
    setArm: (a: Arm | null) => void;
    toggleEmail: () => void;
  },
##TO
    setArm: (a: Arm | null) => void;
    toggleEmail: () => void;
    setSignup: (open: boolean) => void;
    forgetLeftOpen: () => void;
  },
##END
##FILE apps/dashboard/src/surfaces/settings/connections/pane.tsx
##FROM
    case "verb:whatsapp-connect": {
      k.setBusy(true);
      const res = await waConnect.start();
      k.setBusy(false);
##TO
    case "verb:whatsapp-connect": {
      k.setBusy(true);
      // Meta's window is open from here to the end of the sign-up: the page asks for the codes sent to the line while it is, and a
      // sign-up an earlier page left behind is no longer what this row has to say.
      k.forgetLeftOpen();
      k.setSignup(true);
      const res = await waConnect.start();
      k.setSignup(false);
      k.setBusy(false);
##END
##FILE apps/dashboard/src/surfaces/settings/connections/pane.tsx
##FROM
  const [emailOpen, setEmailOpen] = useState(false);
  const [note, setNote] = useState<string | null>(googleNote);
  const [toastNode, flash] = useLegacyToast();
  const channels = read ? read.channels : undefined;
##TO
  const [emailOpen, setEmailOpen] = useState(false);
  const [note, setNote] = useState<string | null>(googleNote);
  // Meta's sign-up window is open (this page began it and it has not ended), and the sign-up an earlier page began on this tab and
  // never finished, read once as this page opens: nothing a later press of Connect should bring back.
  const [signup, setSignup] = useState(false);
  const [leftOpenAt, setLeftOpenAt] = useState<string | null>(() => signupLeftOpenAt());
  const [toastNode, flash] = useLegacyToast();
  const channels = read ? read.channels : undefined;
  // The workspace's own line: what a registration is filed for, and where a code Meta texts arrives.
  const ownLine = ((S && S.dto.lines && S.dto.lines.rows) || []).find((l) => l.provider !== "carrier") || null;
  // What an owner reads about the number Meta is connecting: the codes sent to the line (once as this opens, every three seconds
  // while Meta's window is open), and what Meta holds when the kept answer is missing or has gone stale.
  const codes = useLineCodes(!!ownLine, signup);
  useStandingCheck(channels);
##END
##FILE apps/dashboard/src/surfaces/settings/connections/pane.tsx
##FROM
  // The workspace's own line: what a registration is filed for.
  const ownLine = ((S && S.dto.lines && S.dto.lines.rows) || []).find((l) => l.provider !== "carrier") || null;
  const rows = rowsOf(channels, waCfg, S, G);
  const run = (r: Row) => {
    if (busy) return;
    void runVerb(r, { flash, setBusy, setArm, toggleEmail: () => setEmailOpen((o) => !o) });
  };
##TO
  const rows = rowsOf(channels, { whatsapp: waCfg, codes, signupLeftOpenAt: leftOpenAt }, S, G);
  const run = (r: Row) => {
    if (busy) return;
    void runVerb(r, {
      flash,
      setBusy,
      setArm,
      toggleEmail: () => setEmailOpen((o) => !o),
      setSignup,
      forgetLeftOpen: () => setLeftOpenAt(null),
    });
  };
##END
```

The Billing pane says where WhatsApp is billed, from contracts' words, with a link to what it costs (`swap`):

```swap
##FILE apps/dashboard/src/surfaces/settings/billing/pane.tsx
##FROM
 * name, which seed-globals publishes (settings/globals.ts), until Settings' frame moves.
 */
##TO
 * name, which seed-globals publishes (settings/globals.ts), until Settings' frame moves.
 *
 * One row at the foot of the plan card says where the WhatsApp bill is: Meta bills the messages a business starts, to the card on its
 * own WhatsApp account, and not here (contracts WHATSAPP_COST_WORDS), linked to what WhatsApp costs on Settings > Connections.
 */
##END
##FILE apps/dashboard/src/surfaces/settings/billing/pane.tsx
##FROM
import { IN_APP_CLASS, type BillingDto, type BillingInvoiceDto, type BillingVM } from "@chanlytics/contracts";
import { Confirm } from "../../kit/confirm/confirm";
import { FailedRead } from "../../kit/empty/empty";
import { canDo, gate, gateTitle, type LegacyFlash } from "../../legacy-verbs";
##TO
import {
  IN_APP_CLASS,
  WHATSAPP_COST_WORDS,
  type BillingDto,
  type BillingInvoiceDto,
  type BillingVM,
} from "@chanlytics/contracts";
import { Confirm } from "../../kit/confirm/confirm";
import { FailedRead } from "../../kit/empty/empty";
import { LinkButton } from "../../kit/link-button/link-button";
import { canDo, gate, gateTitle, routeDoor, type LegacyFlash } from "../../legacy-verbs";
##END
##FILE apps/dashboard/src/surfaces/settings/billing/pane.tsx
##FROM
      {vm.mode === "stripe" && !owner && (
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-hint">{gateTitle("billing", "start or manage the subscription")}</span>
          </div>
        </div>
      )}
    </section>
##TO
      {vm.mode === "stripe" && !owner && (
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-hint">{gateTitle("billing", "start or manage the subscription")}</span>
          </div>
        </div>
      )}
      {/* Meta bills the WhatsApp messages the business starts, to the card on its own WhatsApp account: said where a bill is read. */}
      <div className="set-row" data-testid="billing-whatsapp">
        <div className="set-row-info">
          <span className="set-row-hint">
            <span data-testid="billing-whatsapp-line">{WHATSAPP_COST_WORDS.billingLine}</span>{" "}
            <LinkButton {...routeDoor("admin/integrations")} data-testid="billing-whatsapp-link">
              {WHATSAPP_COST_WORDS.title}
            </LinkButton>
          </span>
        </div>
      </div>
    </section>
##END
```

The row draws the notes, and the stylesheet gives them their rule (`swap`):

```swap
##FILE apps/dashboard/src/surfaces/settings/connections/row.tsx
##FROM
import { Icon } from "../../kit/icon/icon";
import { MoreMenu } from "../../kit/more-menu/more-menu";
##TO
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { MoreMenu } from "../../kit/more-menu/more-menu";
##END
##FILE apps/dashboard/src/surfaces/settings/connections/row.tsx
##FROM
        <span className="set-team-mail">{r.sentence}</span>
        {armed === "remove" && (
##TO
        <span className="set-team-mail">{r.sentence}</span>
        {r.notes.length > 0 && (
          <span className="set-int-notes" data-testid={`connection-${r.kind}-notes`}>
            {r.notes.map((note, at) => (
              <span key={`${at}:${note.text}`} data-testid="connection-note">
                <span data-testid="connection-note-text">{note.text}</span>
                {note.link && (
                  <>
                    {" "}
                    {/* Both go to Meta's own pages: a new tab, and nothing of this page's passes with it. */}
                    <LinkButton
                      href={note.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="connection-note-link"
                    >
                      {note.link.label}
                    </LinkButton>
                  </>
                )}
              </span>
            ))}
          </span>
        )}
        {armed === "remove" && (
##END
##FILE apps/dashboard/src/legacy/styles/settings.css
##FROM
.set-team-mail { font-size: var(--set-hint); line-height: 1.5; color: var(--ink-dim); text-wrap: pretty; }
##TO
.set-team-mail { font-size: var(--set-hint); line-height: 1.5; color: var(--ink-dim); text-wrap: pretty; }
/* What a row says beside its sentence (contracts ConnectionRow.notes): each note a line of its own, wrapped whole -- never cut with an
   ellipsis as the sentence is, since an owner has to read it. */
.set-int-notes { display: flex; flex-direction: column; gap: 3px; font-size: var(--set-hint); line-height: 1.5; color: var(--ink-dim); text-wrap: pretty; }
##END
```

- [ ] **Step 4: Format, run**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/surfaces/settings/connections/live.ts apps/dashboard/src/surfaces/settings/connections/pane.tsx apps/dashboard/src/surfaces/settings/connections/row.tsx apps/dashboard/src/surfaces/settings/connections/whatsapp.ts apps/dashboard/src/surfaces/settings/billing/pane.tsx tooling/scripts/tests/workspace/settings-doors.test.mjs tooling/scripts/tests/whatsapp/whatsapp-connect.test.mjs
git add apps/dashboard/src/surfaces/settings/connections/live.ts
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/whatsapp-connect.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/workspace/settings-doors.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/connections/connections.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/refresh-coverage.test.mjs
corepack pnpm -r typecheck
corepack pnpm lint
corepack pnpm check:dead-exports
```
Expected: every test PASSES (`connections.test.mjs` reads the pane's source: its `connectionRows(` literal lines, the toast import and `<BusinessRecordForm line={ownLine} flash={flash} />` are all still there); typecheck clean; `corepack pnpm lint` and `corepack pnpm check:dead-exports` report no rise (every export this plan has added is read by shipped code by now: the dashboard's pages, the edge and `activity.ts`). A fall is banked with `-- --update`; a rise is a stop.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/surfaces/settings/connections/live.ts apps/dashboard/src/surfaces/settings/connections/pane.tsx apps/dashboard/src/surfaces/settings/connections/row.tsx apps/dashboard/src/surfaces/settings/connections/whatsapp.ts apps/dashboard/src/surfaces/settings/billing/pane.tsx apps/dashboard/src/legacy/styles/settings.css tooling/scripts/tests/workspace/settings-doors.test.mjs tooling/scripts/tests/whatsapp/whatsapp-connect.test.mjs
git commit -m "Connections says what Meta will ask and what WhatsApp costs, what Meta holds and where to add a payment method, shows the codes sent to the line, and names a sign-up a reload left behind; Billing says where WhatsApp is billed." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 12: A partner's notice is routed by the account it names, and one for an account no workspace holds is news, not a fault

**Why:** every sign-up sends Meta's `account_update` notices (`PARTNER_ADDED` and its kin) addressed to the **partner's** business portfolio (`entry.id`), with the customer's WhatsApp account in `value.waba_info.waba_id` (Meta, webhooks reference: account_update). `handleWabaChange` routed by `entry.id` alone, so all twelve of 6 October's were logged as `waba_unroutable` errors and dropped, and the one that matters most would have been dropped the same way: a `PARTNER_REMOVED` the business sends is the notice that says the receptionist can no longer answer on the number, and its alert (already written, in `describeWabaChange`) could never reach a workspace. The rule is one sentence, so it is one function:

- **The account a notice is about** is `value.waba_info.waba_id` when it is there (text, trimmed), else `entry.id`; none when the notice names no account and was addressed to none. `accountOf(entryId, value)` answers it, in `waba-events.ts`, and returns whether the notice named the account itself.
- **A notice about an account no workspace holds** (looked up, not found) is one of two things, and the lookup says which. A notice that **named** the account itself is a partner's: a sign-up finished at Meta that has not reached Chanlytics (6 October at 12:48, after a reload took the page's listener with it: Task 11), or one still on its way, since Meta's notice and Chanlytics' own connect race. That is news and not a fault: one line at info, `wa_signup_finished_unclaimed` (`waba_id`: the account; `entry_id`: what the notice was addressed to; `account_event`: Meta's event, named so because the logger's own envelope already has an `event` and renames a field that collides), the outcome `"unclaimed"`, and nothing kept. A notice **addressed** to an account we cannot find (`entry.id`, no `waba_info`) is what `waba_unroutable` always meant: an account we should hold and cannot find, an error, as before.

**Where the rule lives: the function, not the call site.** `handleWabaChange` has two callers today (the webhook and `a-template-s-quality-follows-its-webhook.test.mjs`) and will have more, and "which account is this about" must be the same answer for each, so it is decided inside, once. The call site stops guarding on `entry.id` (`wabaId ? handleWabaChange(...) : "unrouted"`): a notice with no account still returns `"unrouted"` before any read, now from the function, and the webhook's `wa_waba_event` line says the account the notice was about (`accountOf` again) where it said the id the notice was addressed to, which for every notice until now was the same value. The function's first parameter is named `entryId`, which is what it is.

**What this does not touch.** `routeByWaba` still finds the active WhatsApp channel by `waba_id`; the event kept is still `channel.<field>` with `waba_id` (now the account) and Meta's value as it came, so a partner notice keeps its `waba_info`; `describeWabaChange` is unchanged (Task 13 changes it, and says why it must). The webhook's two ratchet entries are held: `receiveWhatsappEvent` loses a line (170 to 169; its 51 branches and its depth of 8 are the same, since the ternary's branch is paid for by the `?.` and `??` of the log line that replace the old `||`), and `handleWabaChange` stays under the limits (27 branches of 30 after this task, depth 5 of 5) because the unclaimed log is a function of its own.

**Files:**
- Modify: `apps/edge/lib/whatsapp/waba-events.ts`, `apps/edge/lib/whatsapp/webhook.ts`, `apps/edge/lib/log-events.ts`, `tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs`

- [ ] **Step 1: Write the failing tests**

The tests run the real door over a database in memory, with a partner's notice as Meta delivers it (the ids are made up and this file's own: the partner's portfolio is `307650000000000 + i`, the customer's business `407650000000000 + i`), and `accountOf` on its own (`swap`):

```swap
##FILE tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs
##FROM
/* ------------------------------------------------- statuses and echoes */
##TO
/* ------------------------------------- a partner's notice names the account it is about */

/**
 * A partner's notice as Meta delivers it (webhooks reference, account_update): addressed to the PARTNER's business portfolio
 * (`entry.id`), with the customer's WhatsApp account in `value.waba_info`. On 6 October twelve of them arrived addressed so, and
 * every one was dropped as unroutable. The partner's portfolio and the customer's business are made up, and each case's own.
 */
const PORTFOLIO = (w) => String(307650000000000 + w.i);
const partnerNotice = (w, event, waba, entryId = PORTFOLIO(w)) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: entryId,
      time: Math.floor(Date.now() / 1000),
      changes: [
        {
          field: "account_update",
          value: {
            event,
            waba_info: {
              waba_id: waba,
              owner_business_id: String(407650000000000 + w.i),
              partner_app_id: "108340000000001",
            },
          },
        },
      ],
    },
  ],
});

test("a partner's notice is routed by the account it names, never by the portfolio it was addressed to: kept as the workspace's event with its waba_info, a removal told to the owner, an addition told to nobody", async () => {
  const w = world();
  const OWNER = "owner@harbor.test";
  w.tables.tenant_config.push({ tenant_id: w.T, config: { notifications: { escalation_emails: [OWNER] } } });
  const db = w.open();
  receptionist();
  const line = wire();
  try {
    await withEnv(MAIL, () =>
      listening(async (log) => {
        const added = partnerNotice(w, "PARTNER_ADDED", w.WABA);
        assert.deepEqual(await answer(await deliver(added)), [200, { ok: true }]);
        const channelReads = db.seen.filter((q) => q.table === "tenant_channels" && q.op === "select");
        assert.deepEqual(
          channelReads[0].filters,
          [
            ["eq", "kind", "whatsapp"],
            ["eq", "waba_id", w.WABA],
            ["eq", "status", "active"],
          ],
          "routed by the account the notice names: the portfolio it was addressed to holds no channel",
        );
        assert.deepEqual(
          kind(w.tables, "channel.account_update").map((e) => [e.tenant_id, e.subject_id, e.data]),
          [[w.T, `ch-${w.i}`, { waba_id: w.WABA, ...added.entry[0].changes[0].value }]],
          "kept as Meta sent it, under the account that routed it",
        );
        assert.deepEqual([w.tables.notifications.length, line.mail().length], [0, 0], "a partner added is nobody's alert");

        // Removed: the notice that says the receptionist can no longer answer, which an unrouted notice could never tell anyone.
        assert.deepEqual(await answer(await deliver(partnerNotice(w, "PARTNER_REMOVED", w.WABA))), [200, { ok: true }]);
        assert.deepEqual(
          w.tables.notifications.map((n) => [n.tenant_id, n.kind, n.route, n.title]),
          [[w.T, "number", "admin/integrations", "WhatsApp connection removed"]],
          "the workspace's bell",
        );
        const mail = line.mail();
        assert.deepEqual([mail.length, mail[0].to, mail[0].subject], [1, [OWNER], "WhatsApp connection removed"]);

        // Addressed to nobody: the account it names is enough.
        assert.deepEqual(await answer(await deliver(partnerNotice(w, "PARTNER_ADDED", w.WABA, ""))), [200, { ok: true }]);
        assert.equal(kind(w.tables, "channel.account_update").length, 3);

        assert.deepEqual(
          log.said("wa_waba_event").map((l) => l.fields),
          [
            { field: "account_update", waba_id: w.WABA, outcome: "kept" },
            { field: "account_update", waba_id: w.WABA, outcome: "alerted" },
            { field: "account_update", waba_id: w.WABA, outcome: "kept" },
          ],
          "the line says the account the notice was about",
        );
        assert.deepEqual([log.said("waba_unroutable").length, log.said("wa_signup_finished_unclaimed").length], [0, 0]);
      }),
    );
  } finally {
    line.restore();
  }
});

test("a partner's notice for an account no workspace holds is a sign-up that has not reached Chanlytics: one line at info, kept nowhere, nobody told; a notice addressed to an account we cannot find is still a fault", async () => {
  const w = world();
  const db = w.open();
  receptionist();
  const line = wire();
  const stranger = `${w.WABA}0`;
  try {
    await withEnv(MAIL, () =>
      listening(async (log) => {
        assert.deepEqual(
          await answer(await deliver(partnerNotice(w, "PARTNER_ADDED", stranger))),
          [200, { ok: true }],
        );
        assert.deepEqual(
          log.said("wa_signup_finished_unclaimed").map((l) => [l.stream, l.fields]),
          [["log", { waba_id: stranger, entry_id: PORTFOLIO(w), account_event: "PARTNER_ADDED" }]],
          "news, said at info: the account, what the notice was addressed to, and the event",
        );
        assert.equal(log.said("waba_unroutable").length, 0, "not the error it was on 6 October");
        assert.deepEqual(
          log.said("wa_waba_event").map((l) => l.fields),
          [{ field: "account_update", waba_id: stranger, outcome: "unclaimed" }],
        );
        const lookups = db.seen.filter((q) => q.table === "tenant_channels" && q.op === "select");
        assert.deepEqual(
          lookups.map((q) => q.filters.find(([, col]) => col === "waba_id")[2]),
          [stranger],
          "the account it names was looked up, and nothing else",
        );
        assert.deepEqual(
          [w.tables.events.length, w.tables.notifications.length, line.mail().length],
          [0, 0, 0],
          "kept nowhere, nobody told",
        );

        // A notice that names no account, addressed to one nobody holds, is what waba_unroutable always meant.
        const lost = {
          object: "whatsapp_business_account",
          entry: [{ id: stranger, changes: [{ field: "account_update", value: { event: "PARTNER_REMOVED" } }] }],
        };
        assert.deepEqual(await answer(await deliver(lost)), [200, { ok: true }]);
        assert.deepEqual(
          log.said("waba_unroutable").map((l) => [l.stream, l.fields]),
          [["error", { waba_id: stranger, field: "account_update" }]],
        );
        assert.equal(log.said("wa_signup_finished_unclaimed").length, 1, "and is not said again as a sign-up");
        assert.equal(log.said("wa_waba_event").at(-1).fields.outcome, "unrouted");
        assert.deepEqual([w.tables.events.length, w.tables.notifications.length], [0, 0]);
      }),
    );
  } finally {
    line.restore();
  }
});

test("accountOf: the account a notice names itself, else the one it was addressed to; an id that is not text names nothing, and a notice with neither is about no account", async () => {
  const { accountOf } = await import(at("apps/edge/lib/whatsapp/waba-events.ts"));
  assert.deepEqual(accountOf("2076", { event: "FLAGGED" }), { waba: "2076", named: false });
  assert.deepEqual(accountOf("3076", { waba_info: { waba_id: " 2076 " } }), { waba: "2076", named: true });
  assert.deepEqual(accountOf("", { waba_info: { waba_id: "2076" } }), { waba: "2076", named: true });
  for (const info of [undefined, null, "2076", 2076, [], {}, { waba_id: "" }, { waba_id: "  " }, { waba_id: 2076 }, { waba_id: null }])
    assert.deepEqual(accountOf("3076", { waba_info: info }), { waba: "3076", named: false }, JSON.stringify(info));
  assert.equal(accountOf("", {}), null);
  assert.equal(accountOf("", { waba_info: { waba_id: " " } }), null);
});

/* ------------------------------------------------- statuses and echoes */
##END
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs`
Expected: FAIL in the three new cases and PASS in every other: the first at its first assertion (the channel read is filtered by the portfolio, `waba_id` `3076...`, not the account the notice names); the second at `wa_signup_finished_unclaimed` (nothing says it; `waba_unroutable` was said instead); the third with `accountOf is not a function`.

- [ ] **Step 3: The rule, and its line**

`waba-events.ts`: the account a notice is about, the unheld account, and `handleWabaChange` taking the entry's id (`swap`):

```swap
##FILE apps/edge/lib/whatsapp/waba-events.ts
##FROM
 * ride the same alert path a failed send already uses.
 */
##TO
 * ride the same alert path a failed send already uses.
 *
 * A partner's notice (account_update: PARTNER_ADDED and its kin) is addressed
 * to the partner's business portfolio and names the customer's account in
 * value.waba_info.waba_id, so it is routed by that (accountOf).
 */
##END
##FILE apps/edge/lib/whatsapp/waba-events.ts
##FROM
  return data ? { tenantId: data.tenant_id, channelId: data.id, number: data.number_e164 } : null;
}
##TO
  return data ? { tenantId: data.tenant_id, channelId: data.id, number: data.number_e164 } : null;
}

/** The account a notice is about, and whether the notice named it itself. */
type Account = { waba: string; named: boolean };

/**
 * The WhatsApp account a notice is about. Most are addressed to it: entry.id is its WABA id. A partner's notice (account_update:
 * PARTNER_ADDED and its kin) is addressed to the PARTNER's business portfolio and names the customer's account in
 * value.waba_info.waba_id (Meta, webhooks reference: account_update), so that is the account when it is there. Null when the
 * notice names none and was addressed to none. 6 October: twelve partner notices arrived addressed to the partner's portfolio
 * and every one was dropped as unroutable, since this read entry.id alone.
 */
export function accountOf(entryId: string, value: Record<string, unknown>): Account | null {
  const info = value.waba_info;
  const named = typeof info === "object" && info !== null && "waba_id" in info ? info.waba_id : null;
  if (typeof named === "string" && named.trim()) return { waba: named.trim(), named: true };
  return entryId ? { waba: entryId, named: false } : null;
}

/**
 * A notice about an account no workspace holds. One that named the account itself is a partner's: a sign-up finished at Meta that has
 * not reached Chanlytics (6 October, 12:48: a reload had taken the page's listener with it) or one still on its way, since Meta's
 * notice and Chanlytics' own connect race. That is news and not a fault: said at info, with the account, what the notice was
 * addressed to and the event, and kept nowhere. One addressed to an account we cannot find is an account we should hold: an error.
 */
function unheld(about: Account, entryId: string, change: WabaChange): "unclaimed" | "unrouted" {
  if (!about.named) {
    logger().error("waba_unroutable", { waba_id: about.waba, field: change.field });
    return "unrouted";
  }
  const event = change.value.event;
  logger().info("wa_signup_finished_unclaimed", {
    waba_id: about.waba,
    entry_id: entryId || null,
    account_event: typeof event === "string" ? event : null,
  });
  return "unclaimed";
}
##END
##FILE apps/edge/lib/whatsapp/waba-events.ts
##FROM
 * Keep the change and, when it matters, tell the workspace. Returns what it
 * did, for the log; never throws — the webhook has already been acknowledged.
 */
##TO
 * Keep the change and, when it matters, tell the workspace. Returns what it
 * did, for the log; never throws — the webhook has already been acknowledged.
 * "unclaimed" is a partner's notice for an account no workspace holds (unheld).
 */
##END
##FILE apps/edge/lib/whatsapp/waba-events.ts
##FROM
export async function handleWabaChange(
  db: SupabaseClient<Database>,
  wabaId: string,
  change: WabaChange,
  loadNotifications: (tenantId: string) => Promise<NotificationsConfig | null>,
): Promise<"unrouted" | "kept" | "alerted"> {
  const routed = await routeByWaba(db, wabaId);
  if (!routed) {
    logger().error("waba_unroutable", { waba_id: wabaId, field: change.field });
    return "unrouted";
  }
  const L = logger({ tenant_id: routed.tenantId });
  const described = describeWabaChange(change, routed.number);
  await emitEvent(db, routed.tenantId, `channel.${change.field}` as WabaEventKind, "channel", routed.channelId, {
    waba_id: wabaId,
    ...change.value,
  }).catch((e: unknown) => {
##TO
export async function handleWabaChange(
  db: SupabaseClient<Database>,
  entryId: string,
  change: WabaChange,
  loadNotifications: (tenantId: string) => Promise<NotificationsConfig | null>,
): Promise<"unrouted" | "unclaimed" | "kept" | "alerted"> {
  const about = accountOf(entryId, change.value);
  if (!about) return "unrouted";
  const routed = await routeByWaba(db, about.waba);
  if (!routed) return unheld(about, entryId, change);
  const L = logger({ tenant_id: routed.tenantId });
  const described = describeWabaChange(change, routed.number);
  await emitEvent(db, routed.tenantId, `channel.${change.field}` as WabaEventKind, "channel", routed.channelId, {
    waba_id: about.waba,
    ...change.value,
  }).catch((e: unknown) => {
##END
```

The webhook asks the function and says the account the notice was about (`swap`):

```swap
##FILE apps/edge/lib/whatsapp/webhook.ts
##FROM
import { WABA_FIELDS, handleWabaChange, notificationsFor } from "./waba-events.js";
##TO
import { WABA_FIELDS, accountOf, handleWabaChange, notificationsFor } from "./waba-events.js";
##END
##FILE apps/edge/lib/whatsapp/webhook.ts
##FROM
          const wabaId = String(entry.id || "");
          const outcome = wabaId
            ? await handleWabaChange(db, wabaId, { field, value: v as unknown as Record<string, unknown> }, (tid) =>
                notificationsFor(db, tid),
              )
            : "unrouted";
          L.info("wa_waba_event", { field, waba_id: wabaId || null, outcome });
          continue;
##TO
          // What the notice was addressed to; which account it is about is the function's to say (a partner's notice is
          // addressed to the partner's portfolio and names the account itself).
          const entryId = String(entry.id || "");
          const value = v as unknown as Record<string, unknown>;
          const outcome = await handleWabaChange(db, entryId, { field, value }, (tid) => notificationsFor(db, tid));
          L.info("wa_waba_event", { field, waba_id: accountOf(entryId, value)?.waba ?? null, outcome });
          continue;
##END
```

The line's name (`swap`), between the two names it sorts between:

```swap
##FILE apps/edge/lib/log-events.ts
##FROM
  "wa_routing_lookup_failed",
  "wa_skip_budget",
##TO
  "wa_routing_lookup_failed",
  "wa_signup_finished_unclaimed",
  "wa_skip_budget",
##END
```

- [ ] **Step 4: Format, run, hold the ratchets**

```bash
corepack pnpm exec prettier --write apps/edge/lib/whatsapp/waba-events.ts apps/edge/lib/whatsapp/webhook.ts apps/edge/lib/log-events.ts tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/a-template-s-quality-follows-its-webhook.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/whatsapp-connect.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/log-events.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
corepack pnpm -r typecheck
```
Expected: the first four PASS (the existing account's-news case still pins `wa_waba_event`'s three outcomes and its `waba_id` values, which are the same for every notice that was addressed to its account; `log-events.test.mjs` holds the new name to its call site both ways). The ratchets test FAILS on one thing, a fall to bank: `apps/edge/lib/whatsapp/webhook.ts::receiveWhatsappEvent#1` is a line shorter (170 to 169) with its 51 branches and depth 8 unchanged, and no new offender and no rise is named (`handleWabaChange` is not on the list: it stays under the limits). Bank it, and only it:

```bash
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
git diff --stat -- tooling/scripts/tests/baselines docs/debt.md docs/takeover.md docs/architecture.md
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
```
Expected: `git diff --stat` shows `tooling/scripts/tests/baselines/complexity.json` with one changed line (`"lines": 170` to `169`) and nothing else under the baselines; both tests PASS after it. Typecheck is clean (`waba-events.ts` narrows `waba_info` with `in`, no cast).

- [ ] **Step 5: Commit**

```bash
git add apps/edge/lib/whatsapp/waba-events.ts apps/edge/lib/whatsapp/webhook.ts apps/edge/lib/log-events.ts tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs tooling/scripts/tests/baselines/complexity.json
git commit -m "A partner's notice is routed by the account it names, and one for an account no workspace holds is news, not a fault." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 13: Meta's decision on the display name is heard: the field joins the account's news, a decline is told to the owner, and the kept standing says it at once

**Why:** the Chanlytics app is subscribed at app level to eleven WhatsApp fields, `phone_number_name_update` among them, but `WABA_FIELDS` (contracts `shared/enums.ts`) does not list it, so the webhook has been dropping Meta's decision on a display name as an unnamed `wa_event`: an owner whose name was declined learned nothing, and a row that says "Meta is reviewing the display name" (Task 1) would go on saying it until the six-hourly read. This task is in the same file and the same world as Task 12, and is the other half of the account's news being heard whole. Its payload, from Meta's webhooks reference (`phone_number_name_update`): **`entry.id` is the WABA** (so the notice is routed like the other account fields, by the entry's id, with no `waba_info`), and `value` holds `display_phone_number`, `decision` (**`APPROVED`, `REJECTED`, `PENDING` or `DEFERRED`**), `requested_verified_name` and `rejection_reason` (`null`, or one of `NAME_EMPLOYEE_ISSUE`, `NAME_ENDCLIENT_NOTRELATED`, `NAME_FORMAT_UNACCEPTABLE`, `NAME_INDIVIDUAL_ISSUE`, `NAME_NOT_CONSISTENT`, `UNKNOWN`). The Graph says `DECLINED` for what this webhook calls `REJECTED`, and the standing keeps the Graph's word (Task 6 reads `name_status` from it), so contracts maps one to the other once and takes either.

- **The field joins `WABA_FIELDS`**, which makes its event kind `channel.phone_number_name_update` exist (the one computed family, held by `event-kinds.test.mjs`, whose pinned list learns it). The Activity log reads the family as words, not as a key, by design (`activity.test.mjs` pins it for another field), so "Channel · phone number name update" is how it reads; one assertion holds that and that it is not hidden as noise.
- **The owner's words** are contracts' (`nameDecisionWords`), beside the Connections row's note for the same status (`nameWords`, the Task 1 note, now shared), so a decline says the same sentence in the bell, in the mail and on the row: **approved** says "Meta approved the display name “X”." and is kept, not alerted (good news is not a bell row, as an unflagged number is not); **declined** says "Meta declined the display name “X” — change it in WhatsApp Manager." and Meta's reason when it gave one, and is alerted on the same path the account's other notices use (kind "number", Connections); **pending and deferred** have no notice (the row's own note says a name is in review).
- **The kept standing is corrected** (`standingAfterNameDecision`, pure, in contracts): the name the decision was about and the Graph's word for its status, and nothing else of the standing moves. The edge applies it through the one door the reading keeps standings by (`keepChannelStanding`, Task 5), from the standing read off the channel row that routing already fetched (`routeByWaba` now selects `config`), so the Connections row says it at the next read of Settings and not at the next clock. A workspace whose standing was never read has nothing to correct (the first read says all of it); a door that will not keep it is a line (`wa_standing_keep_failed`, the name Task 6 declared) and costs the row its new word, never the webhook its answer. The door stamps the moment it kept the standing, so the standing's other fields are as old as they were under a newer stamp: the page's ten-minute rule for a number that is not AVAILABLE can wait up to ten minutes longer after a name notice, which is the price of one door and one stamp. Meta's decision is about the *requested* name and the Graph's `name_status` is about the live one: after a declined *change* of an approved name, the next read puts the live name back on the row, and the bell and the mail the owner already got are what told them.
- **`describeWabaChange` is already over the limit** (35 branches, 115 lines, held at those numbers by `complexity.json`: the ratchet fails a rise in any of lines, branches or depth), and a new `case` is a branch, so the task first moves one existing case's words out. `template_category_update` becomes `categoryWords(v)`, a pure move held by value (Step 1 adds its three outputs to the test that already pins this function's kinds and routes: they pass before the move and after it), and the new field's case is one line calling `nameNotice(v)`. The function falls to 32 branches and 107 lines, and the baseline is banked, never raised.

**Files:**
- Modify: `packages/contracts/src/shared/enums.ts`, `packages/contracts/src/lines/number-standing.ts`, `packages/contracts/src/lines/index.ts`, `apps/edge/lib/whatsapp/waba-events.ts`, `tooling/scripts/tests/connections/whatsapp-standing.test.mjs`, `tooling/scripts/tests/repo/event-kinds.test.mjs`, `tooling/scripts/tests/workspace/activity.test.mjs`, `tooling/scripts/tests/whatsapp/whatsapp-connect.test.mjs`, `tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs`, `tooling/scripts/tests/baselines/complexity.json` (banked)
- Regenerate: `packages/contracts/src/browser.generated.ts`, `packages/contracts/dist`

- [ ] **Step 1: Write the failing tests**

The words and the correction, run on the real functions (`swap`):

```swap
##FILE tooling/scripts/tests/connections/whatsapp-standing.test.mjs
##FROM
import {
  connectionRows,
  standingAlertWords,
  standingFromConfig,
  standingNeedsRead,
  toChannelVM,
  waMeDigits,
} from "@chanlytics/contracts";
##TO
import {
  connectionRows,
  nameDecisionWords,
  standingAfterNameDecision,
  standingAlertWords,
  standingFromConfig,
  standingNeedsRead,
  toChannelVM,
  waMeDigits,
} from "@chanlytics/contracts";
##END
##FILE tooling/scripts/tests/connections/whatsapp-standing.test.mjs
##FROM
    "WhatsApp can't send from your number. Meta did not say why; open Connections to read what it holds.",
  );
});
##TO
    "WhatsApp can't send from your number. Meta did not say why; open Connections to read what it holds.",
  );
});

test("Meta's decision on a display name is said to the owner in the row's own words: approved is good news kept quiet, a decline says the way on and Meta's reason, and a decision that is in progress or none of Meta's four has no notice", () => {
  // The real shape (Meta, webhooks reference: phone_number_name_update): decision, requested_verified_name, rejection_reason.
  assert.deepEqual(nameDecisionWords("APPROVED", "Harbor Moving", null), {
    subject: "WhatsApp display name approved",
    body: "Meta approved the display name “Harbor Moving”.",
    alert: false,
  });
  assert.deepEqual(nameDecisionWords("REJECTED", "Harbor Moving", "NAME_FORMAT_UNACCEPTABLE"), {
    subject: "WhatsApp display name declined",
    body: "Meta declined the display name “Harbor Moving” — change it in WhatsApp Manager. Meta's reason: name format unacceptable.",
    alert: true,
  });
  for (const reason of [null, undefined, "UNKNOWN", "NONE", "", 7])
    assert.equal(
      nameDecisionWords("REJECTED", "Harbor Moving", reason).body,
      "Meta declined the display name “Harbor Moving” — change it in WhatsApp Manager.",
      `a reason Meta did not give is not said (${String(reason)})`,
    );
  assert.equal(
    nameDecisionWords("DECLINED", null, null).body,
    "Meta declined your display name — change it in WhatsApp Manager.",
    "the Graph's own word for the same decision, and a name the notice did not carry",
  );
  for (const quiet of ["PENDING", "DEFERRED", "approved", "MAYBE", "", null, undefined, 7])
    assert.equal(nameDecisionWords(quiet, "Harbor Moving", null), null, String(quiet));
  // The row says the decline in the same sentence the notice does: one fact, one set of words.
  const declined = standingAfterNameDecision({ ...LIMITED, notes: [] }, "REJECTED", "Harbor Moving & Sons");
  assert.equal(said(whatsappRow(channel(declined)))[0], nameDecisionWords("REJECTED", "Harbor Moving & Sons", null).body);
});

test("a decision on the display name corrects the kept standing and nothing else of it: the name it was about and the Graph's word for its status; a decision that is none of Meta's four corrects nothing", () => {
  const was = { ...LIMITED, name: "Harbor Nails" };
  const after = (decision, name) => standingAfterNameDecision(was, decision, name);
  assert.deepEqual(after("APPROVED", "Harbor Moving"), { ...was, name: "Harbor Moving", name_status: "APPROVED" });
  assert.deepEqual(after("REJECTED", "Harbor Moving"), { ...was, name: "Harbor Moving", name_status: "DECLINED" });
  assert.equal(after("DECLINED", "Harbor Moving").name_status, "DECLINED", "the Graph's word is taken too");
  assert.equal(after("PENDING", "Harbor Moving").name_status, "PENDING_REVIEW");
  assert.equal(after("DEFERRED", "Harbor Moving").name_status, "PENDING_REVIEW");
  for (const name of [undefined, null, "", "   ", 7])
    assert.equal(after("APPROVED", name).name, "Harbor Nails", `no name in the notice keeps the name (${String(name)})`);
  assert.equal(after("APPROVED", "  Harbor Moving  ").name, "Harbor Moving", "trimmed");
  for (const decision of ["MAYBE", "approved", "", null, undefined, 7, {}]) assert.equal(after(decision, "Harbor Moving"), null, String(decision));
  assert.deepEqual(was, { ...LIMITED, name: "Harbor Nails" }, "the standing it was given is not changed");
  const kept = after("APPROVED", "Harbor Moving");
  assert.deepEqual(
    [kept.can_send, kept.problems, kept.notes, kept.verification, kept.limit],
    [was.can_send, was.problems, was.notes, was.verification, was.limit],
    "the rest is as it was",
  );
  assert.deepEqual(
    said(whatsappRow(channel({ ...kept, notes: [] }))),
    [VERIFIED_2K],
    "an approved name leaves the row's review note: it says nothing of a name that is fine",
  );
});
##END
```

The computed family and the Activity log, held (`swap`):

```swap
##FILE tooling/scripts/tests/repo/event-kinds.test.mjs
##FROM
    "message_template_status_update",
    "phone_number_quality_update",
    "template_category_update",
  ]);
##TO
    "message_template_status_update",
    "phone_number_name_update",
    "phone_number_quality_update",
    "template_category_update",
  ]);
##END
##FILE tooling/scripts/tests/workspace/activity.test.mjs
##FROM
  assert.equal(isActivityNoise("channel.standing"), false, "an owner reads that Meta changed what a number may do");
##TO
  assert.equal(isActivityNoise("channel.standing"), false, "an owner reads that Meta changed what a number may do");
  // Meta's decision on a display name (phone_number_name_update) is one of the computed channel.<field> family: words, not a key.
  assert.equal(
    activityWords("channel.phone_number_name_update", { waba_id: "1", decision: "APPROVED" }),
    "Channel · phone number name update",
  );
  assert.equal(isActivityNoise("channel.phone_number_name_update"), false, "an owner reads a decision on a name");
##END
```

What `describeWabaChange` says for the new field, and the words it will move held by value (`swap`):

```swap
##FILE tooling/scripts/tests/whatsapp/whatsapp-connect.test.mjs
##FROM
  // The webhook handling the account's fields by entry.id, before and instead
  // of routing by number, is run in whatsapp-door.test.mjs.
});
##TO
  // A template moved to another category: to marketing it is a restriction, to anything else news kept quietly, and a notice
  // that names nothing still says something. Held by value: these words are a function of their own (categoryWords).
  const category = (value) => mod.describeWabaChange({ field: "template_category_update", value }, null);
  assert.deepEqual(category({ message_template_name: "save_our_number", new_category: "MARKETING" }), {
    kind: "template_blocked",
    route: "messages",
    subject: "Template “save_our_number” is now marketing",
    body: "Meta moved the template “save_our_number” to marketing. Sends that use it now need the customer's recorded yes.",
    alert: true,
  });
  assert.deepEqual(category({ message_template_name: "save_our_number", new_category: "UTILITY" }), {
    kind: "template_ready",
    route: "messages",
    subject: "Template “save_our_number” is now utility",
    body: "Meta moved the template “save_our_number” to utility.",
    alert: false,
  });
  assert.deepEqual(category({}), {
    kind: "template_ready",
    route: "messages",
    subject: "Template “a template” is now another category",
    body: "Meta moved the template “a template” to another category.",
    alert: false,
  });

  // Meta's decision on the display name (phone_number_name_update; entry.id is the WABA): approved is kept quietly, a decline is the
  // owner's to read with the way on and Meta's reason, in the words Connections' row uses; one in progress has no notice of its own.
  assert.ok(mod.WABA_FIELDS.has("phone_number_name_update"));
  const named = (value) => mod.describeWabaChange({ field: "phone_number_name_update", value }, "+15551234567");
  assert.deepEqual(
    named({
      display_phone_number: "15551234567",
      decision: "APPROVED",
      requested_verified_name: "Harbor Moving",
      rejection_reason: null,
    }),
    {
      kind: "number",
      route: "admin/integrations",
      subject: "WhatsApp display name approved",
      body: "Meta approved the display name “Harbor Moving”.",
      alert: false,
    },
  );
  assert.deepEqual(
    named({
      decision: "REJECTED",
      requested_verified_name: "Harbor Moving",
      rejection_reason: "NAME_FORMAT_UNACCEPTABLE",
    }),
    {
      kind: "number",
      route: "admin/integrations",
      subject: "WhatsApp display name declined",
      body: "Meta declined the display name “Harbor Moving” — change it in WhatsApp Manager. Meta's reason: name format unacceptable.",
      alert: true,
    },
  );
  for (const decision of ["PENDING", "DEFERRED", "SOMETHING_ELSE", undefined])
    assert.equal(named({ decision, requested_verified_name: "Harbor Moving" }), null, String(decision));
  // The webhook handling the account's fields by entry.id, before and instead
  // of routing by number, is run in whatsapp-door.test.mjs.
});
##END
```

The door, over the real shape (`swap`): the world learns to hand the database the functions a case needs, and four cases follow (a number whose standing is kept, a decline, a standing that was never read, a door that refuses):

```swap
##FILE tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs
##FROM
 * header). `open(faults)` hands the door a database over these tables.
##TO
 * header). `open(faults, rpcs)` hands the door a database over these tables, with the
 * functions a case needs beside the two every case has.
##END
##FILE tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs
##FROM
    open: (faults = {}) => {
      const db = fakeDb(tables, faults, {
        runtime_stamp: () => `stamp-${i}`,
##TO
    open: (faults = {}, rpcs = {}) => {
      const db = fakeDb(tables, faults, {
        ...rpcs,
        runtime_stamp: () => `stamp-${i}`,
##END
##FILE tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs
##FROM
/* ------------------------------------------------- statuses and echoes */
##TO
/* ------------------------------------- Meta's decision on the display name */

/** What Meta delivers when it decides a display name (webhooks reference, phone_number_name_update): entry.id is the WABA. */
const nameNotice = (w, decision, over = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: w.WABA,
      time: Math.floor(Date.now() / 1000),
      changes: [
        {
          field: "phone_number_name_update",
          value: {
            display_phone_number: w.LINE.slice(1),
            decision,
            requested_verified_name: "Harbor Moving",
            rejection_reason: null,
            ...over,
          },
        },
      ],
    },
  ],
});
/** What the edge kept about the number at its last read: its display name in review, the business not verified. */
const HELD = {
  can_send: "LIMITED",
  problems: [],
  notes: [],
  name: "Harbor Nails",
  name_status: "PENDING_REVIEW",
  verification: "not_verified",
  limit: "TIER_250",
  has_payment_method: true,
  owner_business_id: "410540000000001",
  waba_id: "205540000000001",
};
/** The keeping door as the database answers it for this workspace's channel: the whole standing and its moment onto the config. */
function keeper(w) {
  const kept = [];
  return {
    kept,
    rpcs: {
      channel_keep_standing: ({ p_tenant_id, p_channel_id, p_standing }) => {
        kept.push({ p_tenant_id, p_channel_id, p_standing });
        const row = w.tables.tenant_channels.find((c) => c.id === p_channel_id && c.tenant_id === p_tenant_id);
        if (!row) return "gone";
        const was = row.config.standing?.can_send;
        row.config = { ...row.config, standing: p_standing, standing_read_at: new Date().toISOString() };
        return was === undefined ? "first" : was === p_standing.can_send ? "same" : "changed";
      },
    },
  };
}
/** A workspace whose number was read: its standing and a rating on the config, and its owner's mailbox. */
function readWorld() {
  const w = world();
  w.tables.tenant_channels[0].config = {
    quality_rating: "GREEN",
    standing: HELD,
    standing_read_at: "2026-10-06T08:00:00.000Z",
  };
  w.tables.tenant_config.push({ tenant_id: w.T, config: { notifications: { escalation_emails: ["owner@harbor.test"] } } });
  return w;
}

test("Meta's decision on the display name is kept as the workspace's event and applied to the standing the channel keeps, through the door the reading keeps it by: approved and in review are told to nobody", async () => {
  for (const [decision, status] of [
    ["APPROVED", "APPROVED"],
    ["PENDING", "PENDING_REVIEW"],
    ["DEFERRED", "PENDING_REVIEW"],
  ]) {
    const w = readWorld();
    const k = keeper(w);
    const db = w.open({}, k.rpcs);
    receptionist();
    const line = wire();
    try {
      await withEnv(MAIL, () =>
        listening(async (log) => {
          const notice = nameNotice(w, decision);
          assert.deepEqual(await answer(await deliver(notice)), [200, { ok: true }], decision);
          const channelReads = db.seen.filter((q) => q.table === "tenant_channels" && q.op === "select");
          assert.deepEqual(
            channelReads[0].filters,
            [
              ["eq", "kind", "whatsapp"],
              ["eq", "waba_id", w.WABA],
              ["eq", "status", "active"],
            ],
            "routed by the entry's id, which is the account, as the other account fields are",
          );
          assert.deepEqual(
            kind(w.tables, "channel.phone_number_name_update").map((e) => [e.tenant_id, e.subject_id, e.data]),
            [[w.T, `ch-${w.i}`, { waba_id: w.WABA, ...notice.entry[0].changes[0].value }]],
            "kept as Meta sent it",
          );
          assert.deepEqual(
            k.kept,
            [
              {
                p_tenant_id: w.T,
                p_channel_id: `ch-${w.i}`,
                p_standing: { ...HELD, name: "Harbor Moving", name_status: status },
              },
            ],
            `${decision}: the name and its word move, and nothing else of the standing`,
          );
          const cfg = w.tables.tenant_channels[0].config;
          assert.deepEqual(
            [cfg.standing.name_status, cfg.quality_rating],
            [status, "GREEN"],
            "on the config, beside what was there",
          );
          assert.deepEqual([w.tables.notifications.length, line.mail().length], [0, 0], `${decision} is nobody's alert`);
          assert.deepEqual(
            log.said("wa_waba_event").map((l) => l.fields),
            [{ field: "phone_number_name_update", waba_id: w.WABA, outcome: "kept" }],
          );
        }),
      );
    } finally {
      line.restore();
    }
  }
});

test("a declined display name is told to the owner with the way on and Meta's reason, and the row says it at once: the bell, the owner's mail and the kept standing", async () => {
  const w = readWorld();
  const k = keeper(w);
  w.open({}, k.rpcs);
  receptionist();
  const line = wire();
  try {
    await withEnv(MAIL, () =>
      listening(async (log) => {
        const declined = nameNotice(w, "REJECTED", { rejection_reason: "NAME_FORMAT_UNACCEPTABLE" });
        assert.deepEqual(await answer(await deliver(declined)), [200, { ok: true }]);
        assert.deepEqual(
          w.tables.notifications.map((n) => [n.tenant_id, n.kind, n.route, n.title, n.body]),
          [
            [
              w.T,
              "number",
              "admin/integrations",
              "WhatsApp display name declined",
              "Meta declined the display name “Harbor Moving” — change it in WhatsApp Manager. Meta's reason: name format unacceptable.",
            ],
          ],
          "the workspace's bell",
        );
        const mail = line.mail();
        assert.deepEqual(
          [mail.length, mail[0].to, mail[0].subject],
          [1, ["owner@harbor.test"], "WhatsApp display name declined"],
          "and the owner's mailbox",
        );
        assert.deepEqual(
          [w.tables.tenant_channels[0].config.standing.name_status, w.tables.tenant_channels[0].config.standing.name],
          ["DECLINED", "Harbor Moving"],
          "and the row's note",
        );
        assert.deepEqual(
          log.said("wa_waba_event").map((l) => l.fields),
          [{ field: "phone_number_name_update", waba_id: w.WABA, outcome: "alerted" }],
        );
      }),
    );
  } finally {
    line.restore();
  }
});

test("a number whose standing was never read is left for the read, a decision that is none of Meta's four changes nothing, and a database that will not keep the standing costs the row its word and never the webhook its answer", async () => {
  // Never read: the event is kept, no door is asked, and an approval is told to nobody.
  const fresh = world();
  const kFresh = keeper(fresh);
  fresh.open({}, kFresh.rpcs);
  receptionist();
  const line = wire();
  try {
    await withEnv(MAIL, () =>
      listening(async (log) => {
        assert.deepEqual(await answer(await deliver(nameNotice(fresh, "APPROVED"))), [200, { ok: true }]);
        assert.equal(kind(fresh.tables, "channel.phone_number_name_update").length, 1);
        assert.deepEqual([kFresh.kept, fresh.tables.tenant_channels[0].config], [[], {}], "nothing to correct");

        // A word that is none of Meta's four: kept as the event, nothing corrected, nothing said.
        const odd = readWorld();
        const kOdd = keeper(odd);
        odd.open({}, kOdd.rpcs);
        assert.deepEqual(await answer(await deliver(nameNotice(odd, "MAYBE"))), [200, { ok: true }]);
        assert.deepEqual(
          [kind(odd.tables, "channel.phone_number_name_update").length, kOdd.kept, odd.tables.notifications.length],
          [1, [], 0],
        );

        // The database refuses the keeping: the owner is still told of a decline, the event is kept, the line says what failed.
        const refused = readWorld();
        refused.open({}, {
          channel_keep_standing: () => {
            throw new Error("the database is not keeping standings today");
          },
        });
        assert.deepEqual(await answer(await deliver(nameNotice(refused, "REJECTED"))), [200, { ok: true }]);
        assert.deepEqual(
          [
            kind(refused.tables, "channel.phone_number_name_update").length,
            refused.tables.notifications.map((n) => n.title),
            refused.tables.tenant_channels[0].config.standing.name_status,
          ],
          [1, ["WhatsApp display name declined"], "PENDING_REVIEW"],
          "kept, told, and the row's word waits for the read",
        );
        assert.deepEqual(
          log.said("wa_standing_keep_failed").map((l) => l.stream),
          ["error"],
        );
      }),
    );
  } finally {
    line.restore();
  }
});

/* ------------------------------------------------- statuses and echoes */
##END
```

- [ ] **Step 2: Run them to verify they fail**

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/connections/whatsapp-standing.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/event-kinds.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/workspace/activity.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/whatsapp-connect.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs
```
Expected: `whatsapp-standing.test.mjs` fails at load (`nameDecisionWords` is not exported by `@chanlytics/contracts`); `event-kinds.test.mjs` fails its computed-family test (the list has six, the test names seven); `activity.test.mjs` PASSES (a computed kind already reads as words and is not noise: this is a check, and it holds before and after); `whatsapp-connect.test.mjs` fails its account's-news case at `mod.WABA_FIELDS.has("phone_number_name_update")`, **after** the three `template_category_update` assertions, which pass (they hold the words about to move); `whatsapp-door.test.mjs` fails its three new cases, each at its first assertion (a notice for a field the set does not name is not routed, so no event is kept), and every other case PASSES.

- [ ] **Step 3: The field, the words, the correction**

The field joins the set, and contracts says the rest (`swap`). `nameNote` becomes `nameWords` over the two things it reads, so the row's note and the notice are one function:

```swap
##FILE packages/contracts/src/shared/enums.ts
##FROM
  "message_template_quality_update",
  "template_category_update",
] as const;
##TO
  "message_template_quality_update",
  "template_category_update",
  "phone_number_name_update",
] as const;
##END
##FILE packages/contracts/src/lines/number-standing.ts
##FROM
/** What the display name's review says, where it says something an owner can act on. */
function nameNote(s: NumberStanding): string | null {
  const name = s.name ? `the display name “${s.name}”` : "your display name";
  switch (s.name_status) {
    case "PENDING_REVIEW":
      return `Meta is reviewing ${name}; until then customers see the number.`;
    case "DECLINED":
      return `Meta declined ${name} — change it in WhatsApp Manager.`;
    case "EXPIRED":
      return `The request for ${name} expired — submit it again in WhatsApp Manager.`;
    default:
      return null;
  }
}
##TO
/** The display name as a phrase: “Harbor Moving”, or "your display name" while Meta has given none. */
const nameOf = (name: string | null): string => (name ? `the display name “${name}”` : "your display name");

/**
 * What the display name's review says, where it says something an owner can act on: the Connections row's note for the status the
 * standing keeps (the Graph's own words), and the sentence of a decline's notice (nameDecisionWords). One set of words.
 */
function nameWords(status: string | null, name: string | null): string | null {
  const who = nameOf(name);
  switch (status) {
    case "PENDING_REVIEW":
      return `Meta is reviewing ${who}; until then customers see the number.`;
    case "DECLINED":
      return `Meta declined ${who} — change it in WhatsApp Manager.`;
    case "EXPIRED":
      return `The request for ${who} expired — submit it again in WhatsApp Manager.`;
    default:
      return null;
  }
}

/**
 * Meta's decision on a display name (the phone_number_name_update webhook: APPROVED, REJECTED, PENDING or DEFERRED) as the status the
 * standing keeps it under, in the Graph's own words. DECLINED is the Graph's word for a rejection, and is taken too.
 */
const NAME_DECISIONS: Readonly<Record<string, string>> = {
  APPROVED: "APPROVED",
  REJECTED: "DECLINED",
  DECLINED: "DECLINED",
  PENDING: "PENDING_REVIEW",
  DEFERRED: "PENDING_REVIEW",
};

const nameStatusOf = (decision: unknown): string | null =>
  typeof decision === "string" && Object.hasOwn(NAME_DECISIONS, decision) ? (NAME_DECISIONS[decision] ?? null) : null;

/**
 * The standing with Meta's decision on the display name applied: the name the decision was about (the standing's own when the notice
 * carries none) and its status, and nothing else of it. A decision that is none of Meta's words corrects nothing (null). Meta's
 * decision is about the requested name and the Graph's `name_status` about the live one, so the next read may put the live name
 * back; the owner's notice (nameDecisionWords) is what told them.
 */
export function standingAfterNameDecision(
  s: NumberStanding,
  decision: unknown,
  requestedName: unknown,
): NumberStanding | null {
  const status = nameStatusOf(decision);
  if (!status) return null;
  return { ...s, name: textOrNull(requestedName) ?? s.name, name_status: status };
}

/**
 * What an owner is told when Meta decides a display name: approved (good news, kept and not alerted) or declined, with the way on
 * and Meta's reason when it gave one (alerted). A name still in review has no notice: the row's own note says so. Null for a decision
 * that is in progress or none of Meta's words.
 */
export function nameDecisionWords(
  decision: unknown,
  requestedName: unknown,
  reason: unknown,
): { subject: string; body: string; alert: boolean } | null {
  const status = nameStatusOf(decision);
  const name = textOrNull(requestedName);
  if (status === "APPROVED")
    return { subject: "WhatsApp display name approved", body: `Meta approved ${nameOf(name)}.`, alert: false };
  const declined = status === "DECLINED" ? nameWords(status, name) : null;
  if (!declined) return null;
  const why = textOrNull(reason);
  const said = why && why !== "UNKNOWN" && why !== "NONE" ? ` Meta's reason: ${why.toLowerCase().replace(/_/g, " ")}.` : "";
  return { subject: "WhatsApp display name declined", body: `${declined}${said}`, alert: true };
}
##END
##FILE packages/contracts/src/lines/number-standing.ts
##FROM
  const name = nameNote(s);
  if (name) out.push({ text: name });
##TO
  const name = nameWords(s.name_status, s.name);
  if (name) out.push({ text: name });
##END
##FILE packages/contracts/src/lines/index.ts
##FROM
export { standingFromConfig, standingNeedsRead, standingAlertWords } from "./number-standing";
##TO
export {
  standingFromConfig,
  standingNeedsRead,
  standingAlertWords,
  standingAfterNameDecision,
  nameDecisionWords,
} from "./number-standing";
##END
```

The edge: the words of the field, the case moved to make room for it, the standing read off the row routing already fetched, and the correction (`swap`):

```swap
##FILE apps/edge/lib/whatsapp/waba-events.ts
##FROM
 * value.waba_info.waba_id, so it is routed by that (accountOf).
 */
##TO
 * value.waba_info.waba_id, so it is routed by that (accountOf).
 *
 * Meta's decision on a display name (phone_number_name_update, addressed to
 * the account) is told to the owner when it declines one, and corrects the
 * name's word in the standing the channel keeps, so Connections says it now.
 */
##END
##FILE apps/edge/lib/whatsapp/waba-events.ts
##FROM
import { emitEvent, setTemplateQuality } from "../packages/db.js";
##TO
import { emitEvent, keepChannelStanding, setTemplateQuality } from "../packages/db.js";
##END
##FILE apps/edge/lib/whatsapp/waba-events.ts
##FROM
import {
  parseTenantConfig,
  WABA_FIELDS as WABA_FIELD_LIST,
##TO
import {
  nameDecisionWords,
  parseTenantConfig,
  standingAfterNameDecision,
  standingFromConfig,
  WABA_FIELDS as WABA_FIELD_LIST,
##END
##FILE apps/edge/lib/whatsapp/waba-events.ts
##FROM
interface Routed {
  tenantId: string;
  channelId: string;
  number: string | null;
}
##TO
interface Routed {
  tenantId: string;
  channelId: string;
  number: string | null;
  /** The channel's config as read, where the standing a name decision corrects is held. */
  config: Json;
}
##END
##FILE apps/edge/lib/whatsapp/waba-events.ts
##FROM
    .select("id, tenant_id, number_e164")
##TO
    .select("id, tenant_id, number_e164, config")
##END
##FILE apps/edge/lib/whatsapp/waba-events.ts
##FROM
  return data ? { tenantId: data.tenant_id, channelId: data.id, number: data.number_e164 } : null;
##TO
  return data
    ? { tenantId: data.tenant_id, channelId: data.id, number: data.number_e164, config: data.config }
    : null;
##END
##FILE apps/edge/lib/whatsapp/waba-events.ts
##FROM
const BLOCKED = { kind: "template_blocked" as const, route: "messages" };

export function describeWabaChange(c: WabaChange, number: string | null): WabaWords | null {
##TO
const BLOCKED = { kind: "template_blocked" as const, route: "messages" };

/**
 * A template moved to another category. Moved to marketing is a restriction, not a failure: it can still be sent, but only to a
 * recorded yes. It reads with the ones it cannot.
 */
function categoryWords(v: Record<string, unknown>): WabaWords {
  const name = typeof v.message_template_name === "string" ? v.message_template_name : "a template";
  const to = typeof v.new_category === "string" ? v.new_category.toLowerCase() : "another category";
  return {
    ...(to === "marketing" ? BLOCKED : READY),
    subject: `Template “${name}” is now ${to}`,
    body: `Meta moved the template “${name}” to ${to}.${to === "marketing" ? " Sends that use it now need the customer's recorded yes." : ""}`,
    alert: to === "marketing",
  };
}

/** Meta's decision on the display name, as the owner's line: contracts says the words, this says where it is read. */
function nameNotice(v: Record<string, unknown>): WabaWords | null {
  const words = nameDecisionWords(v.decision, v.requested_verified_name, v.rejection_reason);
  return words ? { ...NUM, ...words } : null;
}

export function describeWabaChange(c: WabaChange, number: string | null): WabaWords | null {
##END
##FILE apps/edge/lib/whatsapp/waba-events.ts
##FROM
    case "template_category_update": {
      const name = typeof v.message_template_name === "string" ? v.message_template_name : "a template";
      const to = typeof v.new_category === "string" ? v.new_category.toLowerCase() : "another category";
      // Moved to marketing is a restriction, not a failure: it can still be
      // sent, but only to a recorded yes. It reads with the ones it cannot.
      return {
        ...(to === "marketing" ? BLOCKED : READY),
        subject: `Template “${name}” is now ${to}`,
        body: `Meta moved the template “${name}” to ${to}.${to === "marketing" ? " Sends that use it now need the customer's recorded yes." : ""}`,
        alert: to === "marketing",
      };
    }
##TO
    case "template_category_update":
      return categoryWords(v);
    case "phone_number_name_update":
      return nameNotice(v);
##END
##FILE apps/edge/lib/whatsapp/waba-events.ts
##FROM
  } catch (e) {
    L.error("template_quality_write_failed", { error: errField(e) });
  }
}
##TO
  } catch (e) {
    L.error("template_quality_write_failed", { error: errField(e) });
  }
}

/**
 * Meta's decision on the display name, applied to the standing the channel keeps through the door the reading keeps it by, so
 * Connections says it now and not at the next read. A number whose standing was never read has nothing to correct: the first read
 * says all of it. The door stamps the moment it kept the standing; the standing's other fields are as old as they were. Best effort:
 * a refusal is a line and costs the row its new word, never the webhook its answer.
 */
async function keepNameDecision(
  db: SupabaseClient<Database>,
  routed: Routed,
  value: Record<string, unknown>,
  L: Logger,
): Promise<void> {
  const cfg = routed.config;
  const kept = standingFromConfig(typeof cfg === "object" && cfg !== null && !Array.isArray(cfg) ? cfg.standing : null);
  const next = kept && standingAfterNameDecision(kept, value.decision, value.requested_verified_name);
  if (!next) return;
  try {
    await keepChannelStanding(db, routed.tenantId, routed.channelId, next);
  } catch (e) {
    L.error("wa_standing_keep_failed", { error: errField(e) });
  }
}
##END
##FILE apps/edge/lib/whatsapp/waba-events.ts
##FROM
  if (change.field === "message_template_quality_update")
    await applyTemplateQuality(db, routed.tenantId, change.value, L);
  if (!described || !described.alert) return "kept";
##TO
  if (change.field === "message_template_quality_update")
    await applyTemplateQuality(db, routed.tenantId, change.value, L);
  if (change.field === "phone_number_name_update") await keepNameDecision(db, routed, change.value, L);
  if (!described || !described.alert) return "kept";
##END
```

- [ ] **Step 4: Regenerate the browser entry, build, run, bank the fall**

```bash
corepack pnpm exec prettier --write packages/contracts/src/shared/enums.ts packages/contracts/src/lines/number-standing.ts packages/contracts/src/lines/index.ts apps/edge/lib/whatsapp/waba-events.ts tooling/scripts/tests/connections/whatsapp-standing.test.mjs tooling/scripts/tests/repo/event-kinds.test.mjs tooling/scripts/tests/workspace/activity.test.mjs tooling/scripts/tests/whatsapp/whatsapp-connect.test.mjs tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs
node tooling/scripts/gen/contracts-browser-entry.mjs
corepack pnpm --filter "./packages/*" build
for f in $(git ls-files packages/contracts/dist packages/db/dist packages/jobs/dist packages/channels/dist packages/core/dist); do git diff -w --ignore-cr-at-eol --quiet -- "$f" && git checkout -- "$f"; done
git status --short packages
node tooling/scripts/checks/test.mjs tooling/scripts/tests/connections/whatsapp-standing.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/event-kinds.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/workspace/activity.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/whatsapp-connect.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/a-template-s-quality-follows-its-webhook.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/log-events.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs
corepack pnpm -r typecheck
```
Expected: the builds change `packages/contracts/dist` only; the browser entry gains the two new names in its `./lines/...` line and `phone_number_name_update` is in `WABA_FIELDS`' line in `./shared/enums`'s export (the list is data, not a name: the entry's text is unchanged there); every test PASSES, including the three `template_category_update` assertions after the move and `a-template-s-quality-follows-its-webhook.test.mjs` (its world's channel rows carry `config: {}`, which the routing read now selects); typecheck is clean (`routed.config` is `Json`, narrowed to an object before `.standing` is read; no cast).

The ratchets then name two falls and nothing else: `describeWabaChange#1` (35 branches, 115 lines, depth 2 to 32 branches, 107 lines, depth 2) and nothing raised (`handleWabaChange` is at 28 of 30 branches, depth 5 of 5, and is not on the list). Bank them, and only them:

```bash
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
git diff --stat -- tooling/scripts/tests/baselines docs/debt.md docs/takeover.md docs/architecture.md
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
corepack pnpm check:dead-exports
```
Expected: the first run FAILS naming the two falls to bank; the second banks them; `git diff --stat` shows `tooling/scripts/tests/baselines/complexity.json` with `describeWabaChange#1`'s two numbers changed and nothing else under the baselines; the later runs PASS; the dead-exports check reports no rise (both new exports are read by `waba-events.ts`).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/shared/enums.ts packages/contracts/src/lines/number-standing.ts packages/contracts/src/lines/index.ts packages/contracts/src/browser.generated.ts packages/*/dist apps/edge/lib/whatsapp/waba-events.ts tooling/scripts/tests/connections/whatsapp-standing.test.mjs tooling/scripts/tests/repo/event-kinds.test.mjs tooling/scripts/tests/workspace/activity.test.mjs tooling/scripts/tests/whatsapp/whatsapp-connect.test.mjs tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs tooling/scripts/tests/baselines/complexity.json
git commit -m "Meta's decision on the display name is heard: the field joins the account's news, a decline is told to the owner, and the kept standing says it at once." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 14: The documents say what moved, and the whole lane is checked before anything is pushed

**Why:** Tasks 1 to 13 each end green on the checks of what they touched. This one is the lane's. It brings the two documents that say what the system does up to date (`docs/system-prd.md`: how a partner's notice is routed, the connect flow and what is kept about the number, what the texting door does with a one-time code, the channel-quality sweep's row; `docs/runbook.md`: the log lines an operator will meet), then runs the checks no task ran over the whole tree: the packages' build, the typecheck of every package and app, lint, dead exports and `format:check`, the ratchets and the debt register, every test this lane wrote or changed and every one the changed-tests rule names, the dashboard's production build with its bundle compared with main's own build, and the browser specs' pins. It ends with the three things that are not the code's to settle: the one question only Meta can answer (Step 10, Ruben's), the migration's number on the day it lands, and what to read before a push (Step 11). Nothing in this task changes what the product does.

**Files:**
- Modify: `docs/system-prd.md`, `docs/runbook.md`
- Bank, only where a check names a fall: `tooling/scripts/tests/baselines/*.json`, `docs/debt.md`, `docs/takeover.md`; and, where Step 7 measures growth past the tolerance (it does: Step 8) or a fall past it, `tooling/scripts/tests/baselines/bundle-budget.json`, with its row under "Rises" in `docs/debt.md` for the growth

- [ ] **Step 1: The documents say what the system does now**

`docs/system-prd.md` gets three exact replacements (`swap`), its sweeps table's row a script (that table is padded to one column width, and the new clause must not move any other row), and `docs/runbook.md` one (`swap`). The words are the ones the code says: the account events and the routing are Task 12's and Task 13's, the standing is Tasks 5 to 8's, the code verdict is Task 4's.

```swap
##FILE docs/system-prd.md
##FROM
A template's new status, category and quality land on its row.
##TO
A template's new status, category and quality land on its row. A notice is routed by the account it names (`value.waba_info.waba_id` where it holds one, else the entry's id): Meta addresses a partner's `account_update` to the partner's own business portfolio and puts the customer's account inside it, so routing by the entry alone dropped every sign-up's notices as `waba_unroutable`. A notice for an account no workspace holds is news, logged at info (`wa_signup_finished_unclaimed`), not a fault. A display name's decision (`phone_number_name_update`) is heard too: an approval is kept on the number's standing, a decline is told to the owner with Meta's reason.
##END
##FILE docs/system-prd.md
##FROM
→ `put_channel_credentials` → ledger `connect_channel`.
##TO
→ `put_channel_credentials` → ledger `connect_channel` → what Meta holds about the number, read and kept (best effort).

What Meta holds about a connected number is read by one function, `numberStanding` (`apps/edge/lib/whatsapp/meta-graph.ts`): whether it may send (`can_send_message`: AVAILABLE, LIMITED or BLOCKED, with each entity's errors and what Meta says to do about them), its display name and the review of it, whether the business is verified and its messaging tier, and, from the account, whether a payment method is on file and which business owns the account. It is read as a number is connected (it never fails the connection), by the channel-quality sweep beside the rating, and when an owner opens Connections with nothing kept or a standing that is not AVAILABLE and more than ten minutes old (`POST /api/v1/channels/whatsapp/standing`, owner). `readAndKeepStanding` keeps it in the channel's config as `standing` and `standing_read_at` through `channel_keep_standing` (00330), which writes a `channel.standing { from, to }` event when the word for whether it may send changes (no `from` on the first read), and tells the owner once, by notice, when the number turns BLOCKED. The Connections row says what is kept in contracts' words (`standingNotes`): a missing payment method with the way to add one, and what WhatsApp costs and who bills it (Meta, to the card on the WhatsApp account, never Chanlytics: `WHATSAPP_COST_WORDS`), said under the row before it is connected and after, and on Settings › Billing. A sign-up that Meta finishes after the page that began it was loaded again never reaches Chanlytics (the one-time code rides the SDK's callback in that page): the page keeps a mark of a sign-up in `sessionStorage` and, finding one with no number connected, says what to do.
##END
##FILE docs/system-prd.md
##FROM
A text on a line the platform cannot handle is said out loud, never dropped in silence.
##TO
A text on a line the platform cannot handle is said out loud, never dropped in silence. A text that is a one-time code (`oneTimeCodeOf` in `@chanlytics/channels`, which reads its words and never its sender) is a verdict of its own, reached once the line and the signature are proven: no person, no conversation, no reply, and `sms_code_skipped` names the service it read and never the code. The owner reads the codes sent to the line from Twilio's own record of its texts (`GET /api/admin/lines/codes`: the last fifteen minutes, three at most, behind the owner's route); Chanlytics stores none.
##END
##FILE docs/runbook.md
##FROM
- `emit_event_failed`, `paged_read_capped`: the database package's, now in the same shape.
##TO
- `emit_event_failed`, `paged_read_capped`: the database package's, now in the same shape.
- `sms_code_skipped`: a text that was a one-time code (a service's "your code is ...") came to a Chanlytics line and was not
  answered: no person, no conversation, no reply. The line holds the service it read (`service`), never the code or a
  number. The owner reads the codes sent to the line on Settings, Connections, from Twilio's own record of them; nothing of
  ours stores one. `line_codes_read_failed` (a warning, with the workspace) is Twilio refusing to list them for that page.
- `wa_standing_read_failed`, `wa_standing_keep_failed`, `wa_standing_tell_failed`, `wa_standing_told`: what Meta holds about
  a connected WhatsApp number (whether it may send, its display name, the business's verification, whether a payment method
  is on file), read as a number is connected, by the channel-quality sweep and when an owner opens Connections. The first is
  Meta not answering or refusing (a warning, with its `status` and `code`; the row keeps what it held); the second is the
  database door refusing to keep the answer and the third the owner's notice failing to send (both errors, with the
  `channel_id`). None of them fails the thing that asked for the read. `wa_standing_told` is the owner told that Meta will
  not let the number send. Meta's own words are never logged: they often name the number.
- `wa_signup_finished_unclaimed`: at info, not error: Meta finished a WhatsApp sign-up for an account no workspace holds
  (the owner reloaded or left the page before Chanlytics heard back), so there is nothing to keep. The line holds the
  `waba_id`, the `entry_id` Meta addressed the notice to (the partner's portfolio) and the `account_event`. The owner presses
  Connect WhatsApp again and chooses the account Meta already made. `waba_unroutable` stays an error: a change about an
  account a workspace should hold and none does.
##END
```

The sweeps table's row (`S-09`) says what the sweep now also does. Write `docs-cell.mjs` to the scratchpad and run it from the worktree root; it adds the clause inside the cell's own padding and stops, writing nothing, if the cell has no room (Prettier would then re-pad every row of the table):

```js
import fs from "node:fs";
const f = "docs/system-prd.md";
const raw = fs.readFileSync(f, "utf8");
const crlf = raw.includes("\r\n");
const lines = raw.replace(/\r\n/g, "\n").split("\n");
const at = lines.findIndex((l) => l.startsWith("| `channel-quality-sweep`"));
if (at < 0) throw new Error("the sweeps table has no channel-quality-sweep row");
const OLD = "and says a change as a `channel.quality_rating` event (00315)";
const NEW =
  OLD +
  "; beside it, reads what Meta holds about the number (`numberStanding`), keeps it as `standing` through `channel_keep_standing` (00330), and tells the owner once when it turns BLOCKED";
const row = lines[at];
const cut = row.indexOf(OLD);
if (cut < 0 || row.indexOf(OLD, cut + 1) >= 0) throw new Error("the row does not end its last cell with that clause, once");
const pad = /^( *) \|$/.exec(row.slice(cut + OLD.length));
const grow = NEW.length - OLD.length;
if (!pad || pad[1].length < grow) throw new Error("the cell has no room for the clause");
lines[at] = row.slice(0, cut) + NEW + " ".repeat(pad[1].length - grow) + " |";
fs.writeFileSync(f, crlf ? lines.join("\n").replace(/\n/g, "\r\n") : lines.join("\n"));
console.log("the sweeps table's row says what the sweep reads now");
```

```bash
node <scratchpad>/docs-cell.mjs
```

- [ ] **Step 2: Format; the document tests pass**

```bash
corepack pnpm exec prettier --write docs/system-prd.md docs/runbook.md
git diff --stat -- docs/system-prd.md docs/runbook.md
node tooling/scripts/checks/test.mjs tooling/scripts/tests/docs/docs-paths.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/docs/counts-are-dated.test.mjs
node tooling/scripts/checks/test.mjs tooling/scripts/tests/docs/docs-tree.test.mjs
```
Expected: the stat shows `docs/system-prd.md` with the four places above (the table's row changes in place: its line is as wide as it was, and no other row of the table moves) and `docs/runbook.md` with the added bullets; the three document tests PASS (`docs-paths` finds every path the new text names; the other two read `README.md` and `docs/architecture.md`, which this task does not touch, and hold that this lane added no folder the drawn tree lacks).

- [ ] **Step 3: Commit the documents**

```bash
git add docs/system-prd.md docs/runbook.md
git commit -m "The docs say how a partner's notice is routed, what Meta holds about a number and where it is kept, what the texting door does with a code, and the log lines to know." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Everything that is not a test of a file**

```bash
corepack pnpm --filter "./packages/*" build
for f in $(git ls-files packages/contracts/dist packages/db/dist packages/jobs/dist packages/channels/dist packages/core/dist); do git diff -w --ignore-cr-at-eol --quiet -- "$f" && git checkout -- "$f"; done
git status --short packages
corepack pnpm -r typecheck
corepack pnpm lint
corepack pnpm check:dead-exports
corepack pnpm format:check
```
Expected: `git status --short packages` prints nothing (every dist file this lane changed was committed with the task that changed it, and a rebuild changes none); the typecheck is clean in every package, in `apps/dashboard` and in `apps/edge`; lint prints "no errors" and "as the baseline holds" (this lane adds no warning: the dry provider's new method is not `async`, so `require-await`'s count in `lines-dry.ts` does not rise); `check:dead-exports` prints "unchanged" (every export this lane added has a reader outside its module: `oneTimeCodeOf` the texting door and `lineCodesFrom` the edge's codes door, `standingFromConfig` the channels reader, `standingNotes`, `standingNeedsRead`, `codeNotes`, `whatsappCostNotes`, `addPaymentMethodLink` and the cost words the rows and the Billing pane, `standingAlertWords` and `standingChangeWords` the edge and Activity, `nameDecisionWords` and `standingAfterNameDecision` the name's keeper, `ownLineOf` the codes door, `lineCodes` and `waStanding` the page's hooks, `useLineCodes` and `useStandingCheck` the pane, `signupLeftOpenAt` the pane); `format:check` is clean. A number that rose is a stop: find what added it.

- [ ] **Step 5: The ratchets and the register**

```bash
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
git diff --stat -- tooling/scripts/tests/baselines docs/debt.md docs/takeover.md docs/architecture.md
```
Expected: the stat is empty. Tasks 12 and 13 banked the two falls this lane causes (`describeWabaChange` from 115 lines and 35 branches to 107 and 32, `receiveWhatsappEvent` from 170 lines to 169), and nothing else here moves a number: no new cast, no table name outside `packages/db`, no same-named helper in three files, no folder past twenty modules (the File map's counts), no function past a limit that was not past it. Banking writes the baselines with LF, so `git status` may list files as modified when `git diff --stat` shows none: the stat is the test. A line in the stat is a fall some task caused and did not bank (bank it here, and name the cause in the commit); a number that rose is a stop.

- [ ] **Step 6: The tests of what this branch changed**

```bash
for f in tooling/scripts/tests/sms/one-time-code.test.mjs tooling/scripts/tests/sms/sms-ingress.test.mjs tooling/scripts/tests/sms/sms-door.test.mjs tooling/scripts/tests/lines/lines-twilio.test.mjs tooling/scripts/tests/lines/line-codes-door.test.mjs tooling/scripts/tests/connections/whatsapp-standing.test.mjs tooling/scripts/tests/connections/connection-notes.test.mjs tooling/scripts/tests/connections/channels-vm.test.mjs tooling/scripts/tests/connections/standing-routes.test.mjs tooling/scripts/tests/whatsapp/number-standing.test.mjs tooling/scripts/tests/whatsapp/whatsapp-standing-door.test.mjs tooling/scripts/tests/whatsapp/whatsapp-connect-door.test.mjs tooling/scripts/tests/whatsapp/whatsapp-connect.test.mjs tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs tooling/scripts/tests/edge/every-door-reads-its-body-once.test.mjs tooling/scripts/tests/edge/error-codes.test.mjs tooling/scripts/tests/repo/event-kinds.test.mjs tooling/scripts/tests/repo/ops-hygiene.test.mjs tooling/scripts/tests/workspace/activity.test.mjs tooling/scripts/tests/workspace/settings-doors.test.mjs tooling/scripts/tests/ask/readers.test.mjs tooling/scripts/tests/routes/rate-limit.test.mjs; do node tooling/scripts/checks/test.mjs "$f" || break; done
node tooling/scripts/checks/changed-tests.mjs --list origin/main HEAD
```
The second command names the folders and files CI runs for this change (`N files changed; running ...`): the rules and ratchets it always runs (`repo`, `types`, `docs`), and a folder for each part of a changed path that names one (here `whatsapp`, `lines`, `sms`, `connections`, `edge`, `cron`, `routes`, `workspace`, `billing`, `styles`, `setup`, `shared`, `broadcasts`, `history` and `database`, and `ask/readers.test.mjs`). Run each target it names, one per command (`node tooling/scripts/checks/test.mjs <target>`, a folder or a file); expected all PASS. A `*.db.test.mjs` skips without a database: the two this lane owns ran on the throwaway stack in Task 5, nothing in SQL has changed since, and CI's replay runs them when database paths change. If `tooling/scripts/tests/google/review-reply.test.mjs` is in the list and fails on its last assertion (it pins `toHaveCount(7)` in `e2e/settings/settings-autonomy.spec.ts`, which #1440 changed to 8), that failure is on `origin/main` itself at the commit this plan was written against and is not this lane's: leave it, and tell Ruben.

- [ ] **Step 7: The build, the bundle against main's own build, and the browser specs' pins**

The bundle check holds each change to what it adds, by the byte. CI builds main on every push and records its measurement, a pull request is compared with the record of the commit it stands on, and a sum (the route's JavaScript or CSS, or one page's own JavaScript) that grew by more than 512 bytes gzipped beyond what the change raised its budget by is red, as is one that fell more than 512 bytes below its budget and was not banked. The same comparison is made here, before the push: a record of main's build, made by the same script on the same machine (`--record`, written under `.bundle/`, which git ignores), and this branch's build compared with it (`--against`). `git switch` carries nothing with it, so the tree is clean first: `git status --short` prints nothing (commit what Step 5 banked, if it banked anything, before this).

```bash
df -h .
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=build-placeholder
MAIN=$(git rev-parse origin/main)
git switch --detach "$MAIN"
corepack pnpm --filter @chanlytics/dashboard build
corepack pnpm check:bundle -- --record .bundle/main.json --sha "$MAIN"
git switch connections/whatsapp-says-what-meta-asks
corepack pnpm --filter @chanlytics/dashboard build
corepack pnpm check:bundle -- --against .bundle/main.json --base "$MAIN"
git grep -n -E "connection-note|billing-whatsapp|set-int-notes|Try it from your phone|Needs attention|payment method" -- e2e
```
Expected: the first `check:bundle` writes main's record and prints "within its budget" (main as built here sits within a few bytes of CI's own reading of it, which is what the budget holds); the second **fails**, which is the check working: it prints every sum beside main's, then what this change adds beyond what it raised, the exact command that argues it, and the pages whose budgets must be banked. Step 8 does what it says. The `git grep` prints nothing: the two specs that open these rows (`e2e/settings/settings-integrations.spec.ts`, `e2e/billing.spec.ts`) pin neither a note, nor Billing's new line, nor the pre-connect sentence; the one pin on a connected row's pill (`^On$|^Off$`) already leaves out every attention state, a number Meta blocks is one more of them, and the nightly's workspace holds a WhatsApp row with no credentials and no account, so the check the page makes there is refused by the edge and its row says nothing new. Then look at the real app (`docs/runbook.md`, "See a real page") at 1440 and 390 pixels in both themes, Settings › Connections and Settings › Billing: the WhatsApp row before it is connected says the nine things Meta will ask and cost, in the row's own hint style and wrapped whole, with "Meta's current prices" opening Meta's page in a new tab; a connected row says how to try it from a phone, then what WhatsApp costs; Billing's last row says where WhatsApp is billed and links to Connections. Against production's edge, which does not have the two new doors until this branch is deployed, the page's two new reads fail soft (the codes list stays empty, the check changes nothing), and the rows that show a standing, a code or a payment link are the page tests' to prove, as they do.

- [ ] **Step 8: The growth argued, the falls banked**

This lane grows what a workspace loads a little, and the comparison says exactly where. When this plan was checked (6 October 2026, main at `163f3678a`, both builds on one Windows machine, gzipped bytes) it printed:

| | main | this branch | change |
| --- | ---: | ---: | ---: |
| the route's JS | 731,830 | 733,927 | +2,097 |
| the route's CSS | 147,499 | 147,510 | +11 |
| the Settings page's own JS | 59,001 | 59,542 | +541 |
| the Broadcasts page's | 158,085 | 145,089 | -12,996 |
| the Campaigns page's | 206,616 | 193,594 | -13,022 |
| the People page's | 247,734 | 234,544 | -13,190 |
| the Templates page's | 163,586 | 150,673 | -12,913 |

Every other page moved by 80 bytes or less. Read it as the check does. The route's JS grew by 2,097 bytes (contracts' words for the Connections row, which the route loads whole) and the Settings page by 541 (the notes drawn with their links, the two reads, the sign-up's mark, Billing's one line): each is past the 512-byte tolerance, so each is argued, by exactly that growth, in the same commit as its row under "Rises". The CSS grew 11 bytes, inside the tolerance: nothing to argue. Four other pages fell by about 13 KB each, which is not this lane's code at work: the build regrouped those pages' chunks once this branch's modules joined the graph (the People page's five chunks became three, and 13 KB lighter), so the budgets of those pages (and every page that fell at all, by `--update`) are banked, which the check requires of any fall past the tolerance and which needs no row. Use the sums your own two builds printed, and the commands the second one named, not these numbers; the row below is written with these. Its first cell is the rise, its second says what grew and why nothing that exists would do, its third what takes it back down (`swap`: the new row goes above the newest one, and Prettier pads it to the table's width):

```swap
##FILE docs/debt.md
##FROM
| Workspace route JS budget 724,783 to 731,838 bytes gzipped, +7,055,
##TO
| Workspace route JS budget 731,838 to 733,935 bytes gzipped, +2,097, and the Settings page's own JS 59,001 to 59,542, +541 (Connect WhatsApp says what Meta will ask and the number says what Meta holds, 6 Oct 2026) | What the Connections row says and asks: in contracts, which the route loads whole, the words for it (the standing's sentence and notes, what WhatsApp costs and who bills it, the codes sent to the line, the nine things Meta's window asks and the note's link), and on the Settings page the notes drawn with their links, the two reads and the sign-up's mark, and Billing's one line. This branch and main were built here the same way and compared as CI compares (`163f3678a`): the route's JS 731,830 to 733,927 bytes gzipped, the Settings page 59,001 to 59,542, the CSS 147,499 to 147,510; the rise is that growth, not to the reading | Contracts' browser entry is split by page, so a page's words ride its own route alone |
| Workspace route JS budget 724,783 to 731,838 bytes gzipped, +7,055,
##END
```

```bash
corepack pnpm exec prettier --write docs/debt.md
corepack pnpm check:bundle -- --update
corepack pnpm check:bundle -- --raise js=2097 settings=541
UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/debt-register.test.mjs
corepack pnpm check:bundle -- --against .bundle/main.json --base "$MAIN"
git diff --stat -- tooling/scripts/tests/baselines/bundle-budget.json docs/debt.md docs/takeover.md
rm -rf apps/dashboard/.next .bundle
```
Expected: `--update` banks every fall as measured and still fails, on the route's JS and the Settings page (the rises, which the next command raises: its message says "grew past its budget"); `--raise` writes the budget (the route's JS 731,838 to 733,935, the Settings page 59,001 to 59,542, and the pages that fell at their new, lower numbers) and prints `within its budget (512 bytes under, 1024 over): route JS 733,935, route CSS 147,504, 14 pages gzipped`; `debt-register` PASSES and banks the register's two bundle lines ("workspace route JS, KB gzipped" 715 to 717 and "workspace pages' own JS, KB ... summed over 14 pages" 1257 to 1206, in `docs/debt.md` and again in `docs/takeover.md`); the last `check:bundle` prints, under "against main's own build", `route JS +2,097 bytes gzipped (raised +2,097)` and `page settings +541 bytes gzipped (raised +541)` and the same "within its budget" line; the stat lists `bundle-budget.json`, `docs/debt.md` (the new row and the two lines) and `docs/takeover.md` (the two lines), and no other file.

- [ ] **Step 9: Commit what the verification changed**

```bash
git status --short
git add tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
git commit -m "The checks over the whole lane bank what fell, and the bundle's growth is argued: the Connections row's words in the route, its notes and reads in the Settings page." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
`git status --short` lists the raise's three files, `tooling/scripts/tests/baselines/bundle-budget.json`, `docs/debt.md` and `docs/takeover.md`, and any fall Step 5 banked; a file it lists that is none of these is a stop.


- [ ] **Step 10: The one question only Meta can answer (Ruben's, before the merge)**

`has_payment_method` is true when the account's `primary_funding_id` is there and false when it is not, and Meta's reference does not say that an account with no payment method answers without one (Task 6 says what the code does with each answer). Read the real account once, in Meta's Graph API Explorer, signed in as the person who completed the sign-up, with the Chanlytics app selected and the `whatsapp_business_management` permission, for the Chanlytics workspace's own WhatsApp account (its id is `waba_id` in Meta Business Suite › WhatsApp accounts):

```
GET /{waba}?fields=primary_funding_id
GET /{waba}?fields=owner_business_info{id}
GET /{waba}?fields=business_verification_status,whatsapp_business_manager_messaging_limit
```

and set each answer against what Meta Business Suite › Billing says for that account.

- **No payment method on the account** (Meta asked for one at the end of the 6 October sign-up): the first answer holds no `primary_funding_id` (absent or null). That is what the code takes as "none on file". Press the row's "Add one in Meta" link (after the branch is deployed): it opens Meta's page for adding a payment method on this business and this account. Add one, read again: the answer now holds the id, and opening Connections shows the payment note gone. Both directions hold: merge as planned.
- **The read is refused** (a permission error, or "nonexisting field"): `has_payment_method` is null in production, which says nothing about payment where Meta's own problems do not name it. Nothing to change; say so in the pull request.
- **The answer holds a funding id on an account with no payment method, or none on an account that has one:** the rule is wrong. Stop. The fix is to take `has_payment_method` from Meta's own `health_status` errors only (they say a payment method is missing when it is): delete the funding read from `numberStanding` (four reads become three) and the `has_payment_method` line from `standingFromGraph`, and let `paymentNotes`' second branch, which keys on a problem of Meta's that names a payment, say it. Then run Tasks 6 and 11's tests again.
- **`owner_business_info{id}` present:** it is the portfolio that owns the account in Meta Business Settings, and the link above built from it opens on the right business. **Absent or refused:** `owner_business_id` stays null and the note points at Meta Business Suite › Billing, which is what Task 1 says it does.

- [ ] **Step 11: Landing: the migration's number, main, and what to read before a push**

```bash
git fetch origin
git log --oneline HEAD..origin/main
git ls-tree --name-only origin/main supabase/migrations/ | tail -3
gh pr list --state open --json number,files -q '.[] | select(any(.files[]; .path | startswith("supabase/migrations/"))) | {number, migrations: [.files[].path | select(startswith("supabase/migrations/"))]}'
```
Expected on the day this plan was written (`163f3678a`): the `log` prints nothing, the `ls-tree` ends at 00329 and the `gh` query prints nothing, so 00330 is this lane's. **If it has moved:** merge `origin/main` into this branch locally (a merge is not a push), take every generated file a conflict names from the commands under "Standing rules" rather than by hand, **renumber the migration** as Task 5's Step 6 says if a 00330 or above now exists (take the number above every migration on main and every open pull request's), run this task's Steps 4 to 8 again, and say the final number in the pull request. Before any push, read `git diff --stat origin/main...HEAD`: every file in it is in the File map, and a count larger than the map is a stop. Nothing is pushed until Ruben says so.

**What the pull request says** (its title: "Connect WhatsApp says what Meta will ask, and the number says what Meta holds", 77 characters; its body ends with the house's generated-by line): *For an owner:* before Connect, the WhatsApp row says what Meta's window will ask (sign in with Facebook, a code texted to the number, and, on a Chanlytics number, that the code is on the Texting row), what WhatsApp costs and who bills it (Meta, to the card on the WhatsApp account, never Chanlytics: free replies within 24 hours, charged reminders and campaigns, with Meta's own prices a click away), that a payment method is asked for and what it is for (replies still go out; reminders and campaigns do not), the 250-people limit, and to keep the page open. The code Meta texts to a Chanlytics line is shown on the Texting row within seconds, never stored, and is no longer answered by the receptionist: on 6 October it texted Meta back twice. Once a number is connected the row says what Meta holds (may it send, the display name's review, the verification and the tier, whether a payment method is on file with the way to add one, how to try the number from a phone), is refreshed when the owner opens the page and by the six-hourly sweep, and an owner is told once when Meta stops a number from sending or declines its display name. A sign-up a reload left behind is named, and Meta's notices about a sign-up reach the workspace they belong to instead of being logged as faults. Settings › Billing says in one line that WhatsApp is billed by Meta, not on this bill. *Before merging:* **apply migration 00330** to production by the runbook's "Apply a migration" (one new function, no table, no data change); make the live check in Step 10 and say its result; re-check the migration's number (Step 11). *Deploy order:* the migration, then the edge, then the dashboard; any other order fails soft (the page's two new reads fail quietly until the edge has the doors, and the edge's keeper logs `wa_standing_keep_failed` until the function exists). *What it does not do:* coexistence (a number that stays on the WhatsApp Business app); a code in a phone call (the notes steer to Text message); storing a code; a payment method added from Chanlytics (Meta's own page does it); the two Meta senders that became people on 6 October are Ruben's to delete or keep, and nothing here deletes data. *Measured:* quote Step 8's table (the route's JS +2,097 bytes gzipped, the Settings page +541, and the four pages whose own JS fell by about 13 KB each) and the row it adds under "Rises".

## What comes after this

When this lands, connecting a WhatsApp number says what Meta will ask and what it costs before the window opens, the number says what Meta holds about it after, and a sign-up that finishes at Meta reaches its workspace or says how to finish it. What waits, each its own piece of work: **coexistence** (a number that stays on the WhatsApp Business app: Meta's own sign-up flow, its own states and its own words); **a per-workspace cost report** (Meta's pricing facts are in `WHATSAPP_COST_WORDS`; what a workspace was charged is in the receipts' `pricing`, which a report could read); **a payment method added without leaving Chanlytics** (it is Meta's page by design, since Chanlytics is a Tech Provider and does not hold the account's card); and **the standing on Today and in the phone app's alerts**, which read the same `ChannelDto.standing` this lane keeps and could say a number that cannot send where an owner looks first.

## Self-review

**Spec coverage (the design's six parts, its "Not in this change" and "Rules this keeps", and the additions made after it):**

| Spec item | Where |
| --- | --- |
| Part 1: notes before the window, from contracts, a `notes` array on every row drawn under the sentence | Task 1 (`WHATSAPP_CONNECT_NOTES`, `ConnectionRow.notes`), Task 11 (`row.tsx`, the rule in `settings.css`). The notes are nine, not four, and each is a `{ text, link? }` (Choices 2 to 4) |
| Part 2: `oneTimeCodeOf`, over the two real Meta bodies and the customer texts that must not be taken for one | Task 2 |
| Part 2: the door's `code` verdict, `sms_code_skipped`, empty TwiML, no person, no reply | Task 4 |
| Part 2: `recentTexts` on the lines provider (Twilio, dry) | Task 3 |
| Part 2: the edge's `GET /api/admin/lines/codes` and the owner's `GET /api/v1/lines/codes` (policy, never cached, a read's rate) | Tasks 8 and 9 (the rung is `partner`, the owner's door: Choice 6) |
| Part 2: where it shows (the Texting row's notes, the line that says what becomes of them, read on open and every three seconds) | Task 1 (`codeNotes`, `smsRow`), Task 11 (`useLineCodes`) |
| Part 3: `numberStanding` and `NumberStanding` | Task 1 (the type and its words), Task 6 (the reading: four requests, Choice 7) |
| Part 3: kept through `channel_keep_standing`, the `channel.standing` event, first / changed / same / gone | Task 5 (migration 00330: Choice 1) |
| Part 3: read at connection, by the sweep, and by the owner's check (route and door) | Tasks 6, 7, 8, 9, 11 |
| Part 3: told once when it turns BLOCKED | Task 6 (`tellBlocked`), Task 7 |
| Part 3: shown on the row (BLOCKED, LIMITED, the name's review, verification and tier, nothing read yet); the channels reader passes `standing` | Tasks 1, 10, 11 |
| Part 4: the receptionist never answers an automated code | Task 4 |
| Part 5: the pre-flight "keep this page open", the mark of a sign-up, the note that names one left behind | Task 1 (`signupLeftOpenNotes`), Task 11 (`signupLeftOpenAt`, `startSignup`) |
| Part 6: a notice is routed by `waba_info.waba_id`, `wa_signup_finished_unclaimed` at info, `waba_unroutable` kept for an account that should be held | Task 12 |
| Not in this change: coexistence, a code in a call, storing codes | Held: nothing here does them |
| Not in this change: `phone_number_name_update` ("the sweep and the check cover the name") | **Added after the design:** Task 13 (Choice 5) |
| Rules this keeps: one rule per fact, words from contracts, the closed `LOG_EVENTS`, tables only in `packages/db`, a policy on every route, `EVENT_KINDS` and the Activity words, dists, the migration recorded, tests that execute the code | Tasks 1 to 13; Task 14 verifies each by its check |
| Added after the design: migration 00330, re-checked at landing, based on the newest main | Task 5 Step 6, Task 14 Step 11 |
| Added after the design: the `wa.me` "try it from your phone" note, and the payment wording (replies to a customer who wrote first are delivered without a payment method and are not billed; what is not delivered is what a business starts) | Task 1 (`tryItNotes`, `PAYMENT_NOTE`, the pre-flight note) |
| Added after the design: the cost explainer, notes that carry a link, `has_payment_method`, `owner_business_id` and `waba_id` on the standing, the link to add a payment method, Billing's one line | Task 1 (the words and `addPaymentMethodLink`), Task 6 (the reads), Task 11 (the link drawn, Billing), Task 14 Step 10 (the live check) |

**Placeholders:** none. Where a task edits a file it names the text it replaces, and every `swap` was applied in order, task by task, with Prettier run between tasks as the executor runs it, to the tree at `163f3678a`, and every edit matched exactly once. Two things are named as unproven rather than assumed: what Meta answers for an account with no payment method (Task 6 says what the code does with each answer, and Step 10 above is the check), and `check:bundle`'s figures, which only a build on the executor's machine can print (Step 7 says how they are compared and Step 8 argues them; the figures it quotes are the ones measured when this plan was checked, against main at `163f3678a`).

**Type and name consistency, checked by reading:** `ConnectionNote` (`{ text, link?: { label, href } }`) is what `standingNotes`, `codeNotes`, `whatsappCostNotes`, `signupLeftOpenNotes`, `tryItNotes` and `WHATSAPP_CONNECT_NOTES` make, what `ConnectionRow.notes` holds, and what `row.tsx` draws (`connection-note`, `connection-note-text`, `connection-note-link`); `NumberStanding` (ten fields: `can_send`, `problems`, `notes`, `name`, `name_status`, `verification`, `limit`, `has_payment_method`, `owner_business_id`, `waba_id`) is what the edge's `numberStanding` answers, what `channel_keep_standing` keeps under `standing`, what `standingFromConfig` reads back, what `ChannelDto.standing` carries and what `standingNotes`, `standingSentence`, `standingAlertWords` and `standingChangeWords` read; `StandingOutcome` (`first`, `changed`, `same`, `gone`, `unreadable`) is the keeper's four answers and the unread, and the sweep's counters are named for it; `LineCodeDto` (`{ code, from, at }`) is what `lineCodesFrom` makes, the edge door answers under `codes`, the route returns and `useLineCodes` holds; `ReceivedText` (`{ sid, from, body, atMs }`) is what `recentTexts` answers; `lineCodes.read` and `waStanding.check` (`whatsapp.ts`) are what `useLineCodes` and `useStandingCheck` (`live.ts`) call and what `settings-doors.test.mjs` stubs by assignment; `signupLeftOpenAt` (`whatsapp.ts`) is the pane's, handed to `connectionRows` as `signupLeftOpenAt`; `accountOf` (`waba-events.ts`) is what `webhook.ts` and `handleWabaChange` route by; the migration's function is `channel_keep_standing(p_tenant_id, p_channel_id, p_standing)`, its wrapper `keepChannelStanding(db, tenantId, channelId, standing)`, its event `channel.standing`; the rate buckets are `lines_codes` and `whatsapp_standing`; the log names are `sms_code_skipped`, `line_codes_read_failed`, `wa_standing_read_failed`, `wa_standing_keep_failed`, `wa_standing_tell_failed`, `wa_standing_told` and `wa_signup_finished_unclaimed`, each in `LOG_EVENTS` and the runbook.
