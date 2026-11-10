The inbound review's B3 (docs/2026-11-03-inbound-whatsapp-sms-review.md, in the lane's notes): the pilot-era road production
never needs. The edge held a WhatsApp pair of its own (`WHATSAPP_PHONE_ID`, `WHATSAPP_ACCESS_TOKEN`) and a tester list
(`WHATSAPP_TEST_ALLOWLIST`). A workspace whose number was the pair's (`isEnvDefault`, `envNumber`) sent on the
environment's token, answered only the testers, and had its alert notes go in full to the platform's mailbox. Every
WhatsApp channel with a real Meta phone id carries its credentials in the vault (read on production, 10 Nov: the two
without a vault reference, the e2e and demo workspaces, hold made-up ids nothing can send on), so the pair is nobody's
credentials. It goes, and so does the allowlist gate, with the branches that carried them through core and the edge.

## What changes for a customer

- Nothing for any business: each number sends on its own credentials from the vault, as it did.
- Whichever number the environment's pair named is now a workspace number like any other: everyone who writes to it is
  answered, not only the testers, and its notes go to its own owners.
- A notice about no workspace (the platform's own news: a number nobody routes, a line stuck, a sign-up) still goes in
  full to the platform's mailbox. It says so by having no workspace (`tenantId: null`), where it used to carry the
  pilot's flag (`isEnvDefault: true`).

## What moved

- core `inbound`: the allowlist gate (`setAside`), `isEnvDefault` on the message and the handoff target, `envNumber` on
  the runtime, `env.allowlist` and `allowlistSkip` on the ports, `waCfg`'s second argument; `INBOUND_GATES` loses
  `pilot_allowlist` (docs/inbound-gates.md regenerated).
- edge `tenant-runtime`: `isEnvNumber`, `envPair`, and the runtime's `envNumber` go; `waCfgFor` answers the vault's pair or
  nothing; `loadTenantNotifications` reads the settings and the workspace, and no longer the WhatsApp number.
- edge `notify`: `NotifyTarget.isEnvDefault` goes; `chooseAddressing` addresses the platform in full for a notice with no
  workspace. The nine platform notices drop the flag.
- edge `inbound`, `intake`: the arrival carries no `isEnvDefault`; the persist sink writes no `ingest.allowlist_skip`,
  and the kind leaves contracts (`EVENT_KINDS`, its words, tone, mark and retention) and the events repository, since a
  kind nothing writes is refused (`event-kinds.test.mjs`). Production holds no row of it (read 10 Nov); the retention
  purge (00565) still names it, and purges nothing by it.
- `tests/shared/phone.test.mjs`: the short code is checked before the one-time code, the set-aside beside it, where it
  was checked before the allowlist.
- edge `diag`: the environment token's introspection (`waTokenCheck`), `allowlist_numbers` and `env_fallback_token`
  go; `whatsapp.signup_ready` stays.
- edge `env.ts`, `.env.example`, `ai-flags.ts` (the `WHATSAPP_TEST_ALLOWLIST` switch), `LOG_EVENTS` (`wa_skip_allowlist`,
  `pg_allowlist_evt_failed`, `tenant_notifications_channel_unreadable`, which nothing says now).
- `tooling/scripts/ops/golden-edge.mjs`: its ingest probe was kept silent by the allowlist; it is now a one-time code,
  which every number records and never answers.
- Tests: the cases that proved the pilot line are gone or turned around. Three door tests still set the old pair, as a
  deployment that never unset it holds it, and prove nothing sends on it; `per-tenant-credentials.test.mjs` proves the
  pair is nobody's, the number it named included.
- docs: system-prd and runbook say it; the PRD's WhatsApp settings line is corrected (`WHATSAPP_ANSWERS_AS_JOBS` went
  with #2065).

## To set or apply before merging

Nothing. After both hosts serve it: remove `WHATSAPP_PHONE_ID`, `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_TEST_ALLOWLIST`
from the edge's production settings on Vercel. Nothing reads them, and leaving them costs nothing but a stale token.

## Deploy order

Either. No migration, and the dashboard does not change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
