# The first run, PR 1: the groundwork

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the product tell the truth about everything the first run will lean on — a kept, forwarded number is
not a conflict, a transfer can never loop back, a new owner is emailed, checkout can come back to the first run,
Google's listing says what it knows, and the number fee is not quoted — with nothing new appearing on a page.

**Architecture:** Five fixes and one wording change, each in the layer that owns it: the facts resolver and the
phone checks in `packages/contracts`, their readers in the dashboard's settings route, Setup builder and Business
tab, the first alert address in the workspace create route, the checkout return in the edge's billing library
behind a closed list in contracts, and Google's facts in `packages/channels` (the wire) with the week they map to in
contracts. The spec is `docs/superpowers/specs/2026-09-24-first-run-design.md`.

**Tech Stack:** TypeScript (contracts, channels, edge, dashboard server), classic-script JSX for the Business tab,
node:test (`corepack pnpm test`), committed `packages/*/dist`, no new dependencies, no migration.

**Worktree and branch:** `Claude Video/cm-first-run`, branch `fix/first-run-groundwork`, off `origin/main` at
`c28ca4ba`. One PR at the end. Baseline: 4654 tests, 4395 pass, 0 fail, 259 skipped (the database suites).

---

### Task 0: The worktree can run the gates

**Files:** none.

- [x] **Step 1:** `corepack pnpm install --frozen-lockfile --prefer-offline` — done.
- [x] **Step 2:** `corepack pnpm test` — 4395 pass, 0 fail, 259 skipped.

---

### Task 1: The number a business keeps is a fact (F1)

**Files:**
- Modify: `packages/contracts/src/facts.ts` (KnownFacts, ResolvedFacts, resolveFacts, a `knownForwarding` helper)
- Modify: `apps/dashboard/app/api/v1/settings/route.ts` (`knownFacts` reads the lines)
- Modify: `apps/dashboard/src/server/setup.ts` (the resolver gets the forwarding it already read)
- Test: `tooling/scripts/tests/facts.test.mjs`, `tooling/scripts/tests/settings-routes.test.mjs`

- [x] **Step 1: Write the failing tests** in `facts.test.mjs`:

```js
test("F1: the number the business keeps and forwards to its line is what it publishes, not a disagreement", () => {
  const known = {
    ...HARBOR.known,
    forwarding: [{ from_e164: "+12125550142", to_e164: "+13055550123" }],
  };
  const f = resolveFacts({ ...HARBOR.typed, profile: { ...HARBOR.typed.profile, handoff_number: "+19175550100" } }, known);
  assert.deepEqual(f.kept_line, { value: "+12125550142", source: "provisioned" });
  assert.deepEqual(f.phone_display, { value: "(212) 555-0142", source: "typed" }, "no dispute: calls to it forward to the line");
  assert.deepEqual(factConflicts(f), []);
});

test("F1: forwarding that points at a line the workspace no longer answers on is still the conflict it is", () => {
  const known = { ...HARBOR.known, forwarding: [{ from_e164: "+12125550142", to_e164: "+13055550199" }] };
  const f = resolveFacts({ ...HARBOR.typed, profile: { ...HARBOR.typed.profile, handoff_number: "+19175550100" } }, known);
  assert.equal(f.kept_line.value, "+12125550142", "the number is still kept");
  const [c] = factConflicts(f);
  assert.equal(c.severity, "serious");
  assert.match(c.sentence, /Anyone who calls the published number does not reach it/);
});

test("F1: knownForwarding reads Setup's lines: forwarded rows with a number, and where each one goes", () => {
  assert.deepEqual(
    knownForwarding([
      { kind: "own", e164: "+13055550123", forwarding: null },
      { kind: "forwarded", e164: "+12125550142", forwarding: { destination_e164: "+13055550123" } },
      { kind: "forwarded", e164: null, forwarding: { destination_e164: "+13055550123" } },
      { kind: "forwarded", e164: "+17185550100" },
    ]),
    [
      { from_e164: "+12125550142", to_e164: "+13055550123" },
      { from_e164: "+17185550100", to_e164: null },
    ],
  );
});
```

(`knownForwarding` joins the contracts import at the top of the file.)

- [x] **Step 2:** Run `corepack pnpm --filter @chanlytics/contracts build; node --test tooling/scripts/tests/facts.test.mjs` —
expected: the three new tests FAIL (`kept_line` undefined, a dispute present, `knownForwarding` not a function).

- [x] **Step 3: Implement in `facts.ts`.** Add to `KnownFacts`:

```ts
  /**
   * The numbers the business keeps that forward to one of its lines (lines of kind "forwarded"): the number
   * customers already call, and the line those calls reach when nobody picks up.
   */
  forwarding?: ReadonlyArray<{ from_e164: string | null; to_e164?: string | null }> | null;
```

Add to `ResolvedFacts`:

```ts
  /**
   * The number the business keeps and forwards to the receptionist. Provisioned by the forwarding the owner set
   * up, never typed here -- and never a number to transfer a caller to, since the call would come straight back.
   */
  kept_line: Fact<string>;
```

Add after `activeChannel`:

```ts
/** The first number the business keeps and forwards, wherever it forwards to. */
const keptNumber = (known: KnownFacts | null | undefined): string | null =>
  trimmed((known?.forwarding ?? []).find((r) => trimmed(r.from_e164))?.from_e164);

/** The kept number whose calls reach THIS line, when there is one: forwarding saved against a line since replaced does not. */
const keptReaching = (known: KnownFacts | null | undefined, line: string | null): string | null =>
  line
    ? trimmed((known?.forwarding ?? []).find((r) => trimmed(r.from_e164) && samePhone(r.to_e164, line))?.from_e164)
    : null;

/** The forwarding the platform knows about, from a workspace's lines as Setup reads them (dashboard server/lines.ts). */
export function knownForwarding(
  rows: ReadonlyArray<{ kind: string; e164: string | null; forwarding?: { destination_e164: string | null } | null }>,
): Array<{ from_e164: string; to_e164: string | null }> {
  return rows
    .filter((r): r is typeof r & { e164: string } => r.kind === "forwarded" && !!trimmed(r.e164))
    .map((r) => ({ from_e164: r.e164, to_e164: r.forwarding?.destination_e164 ?? null }));
}
```

In `resolveFacts`, compute `const kept = keptNumber(known);` beside `voice`, replace the `phone_display` entry with:

```ts
    // The number the business keeps and forwards to this line is the one typed value that is not a disagreement
    // with it: customers call it, and when nobody picks up they reach the receptionist.
    phone_display:
      trimmed(typed?.phone_display) && samePhone(trimmed(typed?.phone_display), keptReaching(known, voice))
        ? { value: trimmed(typed?.phone_display)!, source: "typed" }
        : typedOverKnown(trimmed(typed?.phone_display), voice ? formatPhoneDisplay(voice) : null, "provisioned", samePhone),
```

and add `kept_line: kept ? { value: kept, source: "provisioned" } : { value: null, source: "absent" },` after
`whatsapp_line`.

- [x] **Step 4:** Rebuild contracts and run `facts.test.mjs` — expected: PASS, including the existing
"nothing known and nothing typed is 'absent'" (it walks every key, `kept_line` included).

- [x] **Step 5: The readers.** In `settings/route.ts`, import `knownForwarding` from contracts and `linesFor` from
`@/server/lines`; `knownFacts` reads the lines beside the others and adds `forwarding`:

```ts
  const [ws, ch, gl, lines] = await Promise.all([
    ctx.supabase.from("tenants").select("name, timezone").eq("id", tenantId).maybeSingle(),
    ctx.supabase.from("tenant_channels").select("kind, number_e164, status").eq("tenant_id", tenantId),
    ctx.supabase.from("google_listings").select("name, address").eq("tenant_id", tenantId).maybeSingle(),
    // What the business keeps and forwards (F1): the same rows, read the same way, as Setup's line rows.
    linesFor(ctx.supabase, tenantId).catch(() => []),
  ]);
  return {
    workspace: ws.error ? null : ws.data,
    channels: ch.error ? [] : (ch.data ?? []),
    listing: gl.error ? null : gl.data,
    forwarding: knownForwarding(lines),
  };
```

In `server/setup.ts`, the `resolveFacts(brain, {...})` call gains `forwarding: knownForwarding(lineRows),` (the rows
`linesFor` already returned into the Setup read).

- [x] **Step 6: The route test.** In `settings-routes.test.mjs`, a test that reads settings for a workspace whose
brain publishes the kept number, with a voice channel and a forwarded line to it, and asserts `conflicts` is `[]` and
`facts.kept_line.value` is the kept number; the same read with the line's destination changed asserts one serious
conflict. (Seed `tenant_channels` with the voice row and `lines` with `{ tenant_id, kind: "forwarded", e164,
facts: { destination_e164 }, ... }` in the shape `linesFor` selects.)

- [x] **Step 7:** Run `node --test tooling/scripts/tests/settings-routes.test.mjs tooling/scripts/tests/facts.test.mjs` — PASS.

- [x] **Step 8: Commit** — `git add -A packages/contracts apps/dashboard tooling/scripts/tests && git commit -m "fix(facts): a number the business keeps and forwards to its line is not a published-number conflict (F1)"`

---

### Task 2: A transfer can never come straight back (F2)

**Files:**
- Modify: `packages/contracts/src/phone.ts` (`whyNotAHandoff` takes the kept number; `whyNotForward`)
- Modify: `apps/dashboard/src/legacy/pages/business-tab-save.jsx:339`, `business-tab-who.jsx` (~138, ~295)
- Modify: `apps/dashboard/src/legacy/data/bridge-stubs.jsx` (the mockup's stub, for parity)
- Modify: `apps/dashboard/app/api/v1/settings/route.ts` (PUT judges a changed transfer number)
- Modify: `apps/dashboard/app/api/v1/lines/forwarding/route.ts` (refuses forwarding the transfer number)
- Modify: `tooling/scripts/tests/webhook-auth-evidence.test.mjs:70` (the existing pin's string, not a new pin)
- Test: `tooling/scripts/tests/phone.test.mjs`, `settings-routes.test.mjs`, `business-tab-page.test.mjs`

- [x] **Step 1: Failing contracts test** in `phone.test.mjs` (import `whyNotAHandoff, whyNotForward`):

```js
test("F2: a transfer number that forwards to the receptionist is refused, and so is forwarding the transfer number", () => {
  const LINE = "+13055550123";
  const KEPT = "+12125550142";
  assert.equal(whyNotAHandoff("+1 917 555 0100", LINE, KEPT), null, "a cell a person answers is fine");
  assert.match(whyNotAHandoff("+1 (212) 555-0142", LINE, KEPT), /come straight back/);
  assert.match(whyNotAHandoff("+13055550123", LINE, KEPT), /own line/, "the own-line refusal is unchanged");
  assert.equal(whyNotAHandoff("+12125550142", LINE, null), null, "no forwarding, no loop");
  assert.equal(whyNotAHandoff("", LINE, KEPT), null, "empty is a choice: take a message");
  assert.match(whyNotForward("+12125550142", "+1 212 555 0142"), /transfer number/);
  assert.equal(whyNotForward("+12125550142", "+19175550100"), null);
  assert.equal(whyNotForward("+12125550142", null), null);
});
```

- [x] **Step 2:** Rebuild contracts; run it — FAIL (`whyNotForward` is not a function; the kept number passes).

- [x] **Step 3: Implement in `phone.ts`.** Extend the doc comment with the third refusal, change the signature to
`whyNotAHandoff(raw, ownLine?, keptLine?)`, and before `return null;` add:

```ts
  if (keptLine && normalizePhone(norm) && normalizePhone(norm) === normalizePhone(keptLine)) {
    return "That number sends the calls nobody picks up to your receptionist, so a caller put through to it would come straight back. Use a mobile or another line a person answers.";
  }
```

Add after it:

```ts
/**
 * The same loop from the other side: forwarding a number to the receptionist when that number is where the
 * receptionist puts callers through. Returns the owner's sentence, or null when the number may forward.
 */
export function whyNotForward(number: string | null | undefined, handoff: string | null | undefined): string | null {
  const n = normalizePhone(number);
  if (!n || !handoff || n !== normalizePhone(handoff)) return null;
  return "Your receptionist puts callers through to this number. Change the transfer number in Settings › Business first — once this number forwards to the receptionist, a caller put through to it would come straight back.";
}
```

- [x] **Step 4:** Rebuild; the phone test PASSES.

- [x] **Step 5: The Business tab.** `business-tab-save.jsx:339` becomes
`const btCheckTransfer = (d, line, kept) => (window.__whyNotAHandoff ? window.__whyNotAHandoff(d, line, kept) : null);`
In `business-tab-who.jsx`, beside the voice line read from `F` add
`const keptLine = (F.kept_line && F.kept_line.value) || null;` and the transfer row's check becomes
`check={(d) => S.CHECK_OF.handoff_number(d, voiceLine, keptLine)}`. In `bridge-stubs.jsx` the stub takes
`(raw, ownLine, kept)` and refuses the kept number with the same sentence. The pin in
`webhook-auth-evidence.test.mjs:70` reads `window.__whyNotAHandoff(d, line, kept)`.

- [x] **Step 6: The page test.** In `business-tab-page.test.mjs`, beside the test that presses the own-line
refusal, a case with `known.forwarding` naming the kept number: typing it into the transfer row shows the "come
straight back" sentence and saves nothing.

- [x] **Step 7: The two doors.** In `settings/route.ts` PUT, after `const before = …` and before the write:

```ts
    // The transfer number, judged again here when it changes (F2). The page asks the same question as the owner
    // types; this is the door, so a number that would ring the receptionist back cannot be saved from anywhere.
    // Only a CHANGED number is judged, so a save of something else never trips over a number stored before this rule.
    const nextHandoff = parsed.data.brain?.profile?.handoff_number ?? null;
    const prevHandoff = parseTenantConfig(before?.config ?? null)?.brain?.profile?.handoff_number ?? null;
    if (nextHandoff && !samePhone(nextHandoff, prevHandoff)) {
      const facts = resolveFacts(parsed.data.brain ?? null, await knownFacts(ctx, member.tenantId));
      const why = whyNotAHandoff(nextHandoff, facts.voice_line.value, facts.kept_line.value);
      if (why) throw new AppError("validation", why);
    }
```

In `lines/forwarding/route.ts`, after the body checks and before the RPC:

```ts
    // The loop from this side (F2): the transfer number cannot become a number that forwards to the receptionist.
    const cfg = await getTenantConfig(ctx.supabase, member.tenantId);
    const loop = whyNotForward(number, parseTenantConfig(cfg?.config ?? null)?.brain?.profile?.handoff_number);
    if (loop) throw new AppError("conflict", loop, 409);
```

(`getTenantConfig` from `@chanlytics/db`; `parseTenantConfig`, `samePhone`, `whyNotAHandoff`, `whyNotForward` from
contracts.)

- [x] **Step 8: The door tests** in `settings-routes.test.mjs`: (a) a PUT changing the transfer number to the kept
number is refused `validation` 400 with "come straight back" and writes nothing; (b) a PUT that changes only the
business name keeps a stored transfer number equal to the line (legacy data) and saves; (c) the forwarding POST for
the workspace's transfer number is refused `conflict` 409 with "transfer number" and never reaches the RPC.

- [x] **Step 9:** Run the four test files — PASS. **Commit:** `fix(transfer): a transfer number that forwards to the receptionist is refused from both sides (F2)`

---

### Task 3: A new owner is emailed (F3)

**Files:**
- Modify: `packages/contracts/src/config.ts` (`withFirstAlertAddress`, beside `NotificationsConfigSchema`)
- Create: `apps/dashboard/src/server/first-alert.ts`
- Modify: `apps/dashboard/app/api/v1/workspaces/create/route.ts`
- Test: `tooling/scripts/tests/notifications-first-address.test.mjs` (new), `account-routes.test.mjs`

- [x] **Step 1: Failing contracts test** (new file):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { withFirstAlertAddress, parseTenantConfigResult } from "@chanlytics/contracts";

test("F3: a new workspace's first alert address is its creator's, and only when that can be saved and read back", () => {
  const next = withFirstAlertAddress({}, "  Ada@Example.com ");
  assert.deepEqual(next, { notifications: { escalation_emails: ["ada@example.com"] } });
  assert.equal(parseTenantConfigResult(next).ok, true, "what is saved reads back: the receptionist never goes silent over it");
  assert.equal(withFirstAlertAddress({ notifications: { escalation_emails: ["x@y.co"] } }, "ada@example.com"), null, "an address already chosen is kept");
  assert.equal(withFirstAlertAddress({}, "not an email"), null, "an address the schema refuses is never written");
  assert.equal(withFirstAlertAddress({}, null), null);
  assert.equal(withFirstAlertAddress({ brain: "broken" }, "ada@example.com"), null, "a config that will not parse is left alone");
});
```

- [x] **Step 2:** Rebuild contracts; run it — FAIL (not a function).

- [x] **Step 3: Implement in `config.ts`** after `parseTenantConfig`:

```ts
/**
 * A new workspace's first alert address: its creator's (F3). Without one, the edge's chooseAddressing sends every
 * "a customer needs you" to the platform, redacted, and the owner is never told.
 *
 * Returns the config to save, or null when there is nothing to do: a config that already names its addresses, one
 * that will not parse, or an address the write schema refuses -- saved, a refused address would make the whole
 * config unreadable, and the receptionist silent.
 */
export function withFirstAlertAddress(config: unknown, email: string | null | undefined): TenantConfig | null {
  const current = parseTenantConfigResult(config ?? {});
  if (!current.ok || current.config.notifications) return null;
  const address = String(email ?? "").trim().toLowerCase();
  if (!address) return null;
  const next = TenantConfigWriteSchema.safeParse({ ...current.config, notifications: { escalation_emails: [address] } });
  return next.success ? next.data : null;
}
```

- [x] **Step 4:** Rebuild; PASS.

- [x] **Step 5: The door.** `apps/dashboard/src/server/first-alert.ts`:

```ts
import { getTenantConfig, putTenantConfig, type Db } from "@chanlytics/db";
import { withFirstAlertAddress } from "@chanlytics/contracts";

/**
 * Give a workspace just made its creator's address as its first alert address, through the same versioned write
 * the settings door uses. Best effort, like the platform's sign-up notice beside it: the workspace exists whether or
 * not this lands, and Settings › Notifications can always add one.
 */
export async function giveFirstAlertAddress(db: Db, tenantId: string, email: string | null | undefined, by: string | null): Promise<boolean> {
  try {
    const row = await getTenantConfig(db, tenantId);
    const next = row ? withFirstAlertAddress(row.config, email) : null;
    if (!row || !next) return false;
    const put = await putTenantConfig(db, tenantId, next, row.version, by);
    if (!put.ok) console.error("first_alert_address_not_saved", put.reason);
    return put.ok;
  } catch (e) {
    console.error("first_alert_address_not_saved", e instanceof Error ? e.message : String(e));
    return false;
  }
}
```

(Use the `Db` type the other `src/server` modules import for the session client.) In the create route, after
`notifyPlatformSignup(...)`: `await giveFirstAlertAddress(ctx.supabase, data.id, ctx.email, ctx.userId);` with a
comment saying why.

- [x] **Step 6: The door test** in `account-routes.test.mjs`: create with a seeded `tenant_config` row for the id
the `create_workspace` RPC returns; after the POST, the row's config is
`{ notifications: { escalation_emails: ["ada@example.com"] } }` at version 2 by `USER`; with `tenant_config` absent
the POST still answers the workspace.

- [x] **Step 7:** Run both tests — PASS. **Commit:** `fix(alerts): a new workspace's first alert address is its creator's (F3)`

---

### Task 4: Checkout can come back to the first run (F4)

**Files:**
- Modify: `packages/contracts/src/billing.ts` (`CHECKOUT_RETURNS`, `CheckoutReturn`, `CHECKOUT_RETURN_ROUTE`, `isCheckoutReturn`)
- Modify: `apps/edge/lib/billing.ts` (`billingReturnUrl`, `checkoutFor`), `apps/edge/api/admin/billing.ts` (op checkout)
- Modify: `apps/dashboard/app/api/v1/billing/checkout/route.ts`, `apps/dashboard/src/legacy-bridge/billing.ts`
- Test: `tooling/scripts/tests/billing-door.test.mjs`, `billing-routes.test.mjs`

- [x] **Step 1: Failing tests.** In `billing-door.test.mjs`, beside the checkout test that asserts
`success_url: BILLING_PAGE("harbor", "success")`: a checkout with `return: "start"` makes a session whose
`success_url` is `https://dash.test/w/harbor?billing=success#/start` and `cancel_url` the same with `cancel`;
`return: "elsewhere"` falls back to Billing. In `billing-routes.test.mjs`: the route sends `return: "start"` on to the
edge body, and refuses `{ return: "https://evil.example" }` with `validation` 400 before the edge is called.

- [x] **Step 2:** Run them — FAIL.

- [x] **Step 3: Contracts** (`billing.ts`):

```ts
/**
 * Where Stripe hands the browser back: Settings › Billing, or the first run that asked for the card. A closed list,
 * because the address is built on the edge from this word, and a free path would be an open redirect on our domain.
 */
export const CHECKOUT_RETURNS = ["billing", "start"] as const;
export type CheckoutReturn = (typeof CHECKOUT_RETURNS)[number];
export const CHECKOUT_RETURN_ROUTE: Record<CheckoutReturn, string> = { billing: "admin/billing", start: "start" };
export function isCheckoutReturn(v: unknown): v is CheckoutReturn {
  return typeof v === "string" && (CHECKOUT_RETURNS as readonly string[]).includes(v);
}
```

- [x] **Step 4: The edge.** `billingReturnUrl(slug, outcome, back: CheckoutReturn = "billing")` ends
`#/${CHECKOUT_RETURN_ROUTE[back]}`; `checkoutFor(..., slug = null, back: CheckoutReturn = "billing")` passes `back`
to both URLs; the door's checkout op reads `const back = isCheckoutReturn(body.return) ? body.return : "billing";`
and the op list in its header says `{ op: "checkout", tenant_id, email, return? }`. The portal keeps Billing.

- [x] **Step 5: The dashboard.** The route reads its body:

```ts
    const body = (await req.json().catch(() => ({}))) as { return?: unknown };
    if (body.return !== undefined && !isCheckoutReturn(body.return))
      throw new AppError("validation", "Checkout comes back to Billing or to setting up.", 400);
    const a = await edgeBilling(
      { op: "checkout", tenant_id: member.tenantId, email: ctx.email ?? null, ...(body.return ? { return: body.return } : {}) },
      25_000,
    );
```

The bridge's `checkout(back?: CheckoutReturn)` sends `{ return: back }` when it is given, `{}` otherwise (every
caller today passes nothing).

- [x] **Step 6:** Run — PASS. Run `node tooling/scripts/gen-route-types.mjs --check` — expected: in sync.
**Commit:** `fix(billing): checkout can come back to the first run, from a closed list (F4)`

---

### Task 5: Google says what it knows (F7)

**Files:**
- Modify: `packages/contracts/src/google.ts` (`GoogleListingFacts`, `GooglePeriod`, `hoursFromGoogle`)
- Modify: `packages/channels/src/google-places.ts` (the details mask, `PlaceDetails.facts`, the parse)
- Modify: `packages/channels/src/google-sync.ts` (`planListingCheck` keeps the facts on the listing)
- Test: `tooling/scripts/tests/google.test.mjs`, `tooling/scripts/tests/google-door.test.mjs`

The field names were checked against Google's Place reference on 24 Sep 2026: `regularOpeningHours` (periods of
`open`/`close` points, day 0 is Sunday, no `close` around the clock), `internationalPhoneNumber`,
`nationalPhoneNumber`, `websiteUri` (Enterprise), `primaryType`, `primaryTypeDisplayName`, `pureServiceAreaBusiness`,
`timeZone` (Pro). The details call already bills at Enterprise + Atmosphere for `reviews`, so none costs more. A wrong
name makes Google refuse the whole read — the mask is pinned name by name.

- [x] **Step 1: Failing tests** in `google.test.mjs`: the details mask includes each of the eight new names; the
`PLACE` fixture gains

```js
  regularOpeningHours: {
    periods: [2, 3, 4, 5, 6].map((day) => ({ open: { day, hour: 9, minute: 0 }, close: { day, hour: 19, minute: 0 } })),
    weekdayDescriptions: ["Tuesday: 9:00 AM – 7:00 PM"],
  },
  internationalPhoneNumber: "+1 718-555-0142",
  nationalPhoneNumber: "(718) 555-0142",
  websiteUri: "https://northsidemovers.example",
  primaryType: "moving_company",
  primaryTypeDisplayName: { text: "Moving company", languageCode: "en" },
  pureServiceAreaBusiness: true,
  timeZone: { id: "America/New_York" },
```

and `parsePlaceDetails(PLACE).facts` deep-equals `{ hours: [...5 periods], phone_e164: "+17185550142",
phone_display: "(718) 555-0142", website: "https://northsidemovers.example", primary_type: "moving_company",
primary_type_label: "Moving company", service_area_only: true, time_zone: "America/New_York" }`; a place with none
of them parses to `{ hours: null, phone_e164: null, phone_display: null, website: null, primary_type: null,
primary_type_label: null, service_area_only: false, time_zone: null }`. `hoursFromGoogle` cases: Tue–Sat 9–19 gives
`{ tue: { open: "09:00", close: "19:00" }, … sat: … }` with `unsure: []`; a lunch break gives `intervals`; a shift
past midnight, a period with no close, and a fifth shift each leave the day out and name it in `unsure`; a point
Google sent without `hour`/`minute` reads as 0. `planListingCheck(...).listing` carries `facts`.

- [x] **Step 2:** Run — FAIL.

- [x] **Step 3: Contracts** (`google.ts`, importing `DAYS` and `type Hours` from `./config`): the two types as in the
spec's F7, and

```ts
const GOOGLE_DAY: Record<number, (typeof DAYS)[number]> = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };
const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/**
 * Google's opening periods as the Business record's week (config.ts HoursSchema): a shift per period, up to four a
 * day. What the record cannot hold is left out and NAMED in `unsure` -- a shift past midnight, a place open around
 * the clock, a fifth shift, two that overlap -- so the owner is asked about that day rather than shown a week that
 * quietly differs from the listing.
 */
export function hoursFromGoogle(periods: readonly GooglePeriod[] | null | undefined): {
  hours: Partial<Record<(typeof DAYS)[number], Hours>>;
  unsure: Array<(typeof DAYS)[number]>;
} {
  const shifts = new Map<(typeof DAYS)[number], Array<{ open: string; close: string }>>();
  const unsure = new Set<(typeof DAYS)[number]>();
  for (const p of periods ?? []) {
    const day = GOOGLE_DAY[p.open.day];
    if (!day) continue;
    if (!p.close || p.close.day !== p.open.day) {
      unsure.add(day);
      continue;
    }
    const open = hhmm(p.open.hour, p.open.minute);
    const close = hhmm(p.close.hour, p.close.minute);
    if (close <= open) {
      unsure.add(day);
      continue;
    }
    shifts.set(day, [...(shifts.get(day) ?? []), { open, close }]);
  }
  const hours: Partial<Record<(typeof DAYS)[number], Hours>> = {};
  for (const day of DAYS) {
    const list = (shifts.get(day) ?? []).sort((a, b) => a.open.localeCompare(b.open));
    if (unsure.has(day) || !list.length) continue;
    if (list.length > 4 || list.some((s, i) => i > 0 && s.open < list[i - 1].close)) {
      unsure.add(day);
      continue;
    }
    hours[day] = list.length === 1 ? { open: list[0].open, close: list[0].close } : { intervals: list };
  }
  return { hours, unsure: DAYS.filter((d) => unsure.has(d)) };
}
```

- [x] **Step 4: The wire** (`google-places.ts`): append
`,regularOpeningHours,internationalPhoneNumber,nationalPhoneNumber,websiteUri,primaryType,primaryTypeDisplayName,pureServiceAreaBusiness,timeZone`
to `PLACES_DETAILS_MASK` (the header comment says why none costs more); `PlaceDetails` gains `facts:
GoogleListingFacts`; `parsePlaceDetails` sets `facts: factsOf(p)`:

```ts
/** A point in Google's week; a field Google left out is its zero (proto3 drops defaults). */
function pointOf(v: unknown): { day: number; hour: number; minute: number } | null {
  const o = obj(v);
  if (!o) return null;
  const day = num(o.day) ?? 0, hour = num(o.hour) ?? 0, minute = num(o.minute) ?? 0;
  return day >= 0 && day <= 6 && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? { day, hour, minute } : null;
}

function periodOf(v: unknown): GooglePeriod | null {
  const o = obj(v);
  const open = pointOf(o?.open);
  if (!o || !open) return null;
  if (o.close === undefined) return { open, close: null };
  const close = pointOf(o.close);
  return close ? { open, close } : null;
}

/** What the listing says beyond its name and address, kept for the owner to check (google_listings.facts). */
function factsOf(p: Obj): GoogleListingFacts {
  const periods = obj(p.regularOpeningHours)?.periods;
  return {
    hours: Array.isArray(periods) ? periods.map(periodOf).filter((x): x is GooglePeriod => x !== null) : null,
    phone_e164: normalizePhone(str(p.internationalPhoneNumber)),
    phone_display: str(p.nationalPhoneNumber),
    website: str(p.websiteUri),
    primary_type: str(p.primaryType),
    primary_type_label: localized(p.primaryTypeDisplayName).text,
    service_area_only: p.pureServiceAreaBusiness === true,
    time_zone: str(obj(p.timeZone)?.id),
  };
}
```

(`normalizePhone`, `GoogleListingFacts`, `GooglePeriod` from `@chanlytics/contracts`.) In `google-sync.ts`,
`planListingCheck`'s `listing` gains `facts: details.facts` so every good read (the link's first, and each day's)
keeps what Google says now. `listingForClient` is unchanged: the dashboard reads the facts from PR 3.

- [x] **Step 5:** Rebuild contracts and channels; run `google.test.mjs` and `google-door.test.mjs` (the link test also
asserts the row's `facts`) — PASS. **Commit:** `feat(google): the listing keeps what Google says about the hours, phone, website, category and area (F7)`

---

### Task 6: The number is part of the plan (decision 1)

**Files:**
- Modify: `packages/contracts/src/setup.ts:821`, `:834`
- Modify: `apps/dashboard/src/legacy/pages/setup.jsx:19`, `:50`, `:93`, `:133`
- Modify: `tooling/scripts/tests/setup.test.mjs:665`, `tooling/scripts/tests/lines-door.test.mjs:440` (the message)

- [x] **Step 1:** `setup.test.mjs:665` expects
`"A local number, included in your plan · your receptionist answers it · texting arrives when the carriers register it"`;
run it — FAIL.
- [x] **Step 2:** `setup.ts:821` says that; `:834` says `"A local number, included in your plan"`; `setup.jsx`
drops the `money` helper and `cost`, line 93 reads "A local number in your area code, included in your plan. Your
receptionist answers it within a minute of choosing." and line 133 "· included in your plan ·". The lines-door
assertion message becomes "what a number costs Chanlytics a month". Rebuild; PASS.
- [x] **Step 3: Commit** — `fix(setup): the number is part of the plan; nothing quotes a fee nothing bills (decision 1)`

---

### Task 7: The gates, the review, the pull request

- [ ] `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm format:check && corepack pnpm test`
- [ ] `node tooling/scripts/check-dist.mjs` after the last commit (expect "dist in sync with src"); keep only dists
with a real diff (`git diff -w --ignore-cr-at-eol`).
- [ ] One whole-branch review (spec + quality), one fix round, the suite green again.
- [ ] The PR says what changes for a customer (nothing visible except Setup's line no longer quoting a fee), what to
set before merging (nothing), and the deploy order (either).

---

## As built (24 September 2026)

One whole-branch review (standards and spec) and one fix round changed these from the steps above:

- **F1: `kept_line` is only a number that forwards to the line the workspace answers on now.** Forwarding that points
  anywhere else keeps nothing, so the replaced-line case reads `kept_line` as absent and the published number is
  the serious conflict it was. The tests use a made-up workspace (Harbor Moving, every number in 555-01xx), never a
  real business's numbers.
- **A transfer number stored before F2 that is the kept number** is a serious conflict of its own, on the transfer
  row (`factConflicts`, `fact: "handoff_number"`): said, and never offered as a one-press fix, because taking the
  other answer would make the loop (`BT_TAKE_NOTHING` in business-tab-who.jsx).
- **The published-number box** says "Your own number. The calls nobody picks up there go to your receptionist on …"
  for the kept number, on the Who you are row and on the create card, rather than that its callers never reach it.
- **`samePhone` lives in phone.ts**, and the two loop sentences are its constants (`HANDOFF_FORWARDS_BACK`,
  `FORWARD_IS_HANDOFF`). The settings route's lines read fails open, on purpose, and says so.
- **F3** normalises the creator's address before it is written.
- **F4** The checkout route declares its input through `route()` (`z.enum(CHECKOUT_RETURNS)`); on the edge the
  return place is a required argument, and the portal passes `"billing"`.
- **F7** Around the clock (a period with no close) leaves all seven days unsure; each day is judged by the record's
  own `dayProblems` (config.ts); the phone is Google's international form as E.164, never a +1 guessed for any ten
  digits; a link writes the facts its own read returned, so a failed second read never leaves the old place's, and
  a profile bound to a different place resets them to `{}` until the next Places read.
- **webhook-auth-evidence.test.mjs** runs `whyNotAHandoff` rather than pinning source text; its two source reads
  left the ratchet's baseline.
