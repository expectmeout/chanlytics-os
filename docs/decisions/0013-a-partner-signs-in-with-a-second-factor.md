# 0013 · A partner signs in with a second factor

**Status:** decided. M1 and M2 built on the branch this note ships with (00217, merged as 00215 and renumbered in #1175), on `ef81c14a` (main, after #1177);
M3 is the next pull request and ships only once TOTP is switched on in the hosted project (M0). Written against
commit `c1cce84a` (main, 27 September 2026). Ruben answered the open questions: no grace (M3 refuses from its first
day), and partners only (owners are not offered a factor here). Where this note and the code disagree, the code wins.

## Context

### Why a partner, first

A partner (0012) sits on the team of every workspace they brought, with `settings`, `approve`, `autonomy`,
`disconnect` and `find` (`ROLE_PERMS.partner`, `packages/contracts/src/config.ts`). One partner account is the
receptionist's voice, its channels and its lead spend for many businesses at once. 0012's Risks said it plainly: _the
blast radius of a bad or hacked partner account is every workspace they brought_, and _MFA on partner accounts is
worth its own note before the programme is marketed_. 00206 gave the platform a pause after the fact; this note is the
lock before it.

### What exists today

- **Supabase Auth supports TOTP** (an authenticator app) and reports how a session was signed in: the access token
  carries `aal` (`aal1` for a password, a Google sign-in or a code; `aal2` once a second factor was verified) and `amr`.
- **It is off.** `supabase/config.toml` has `[auth.mfa.totp] enroll_enabled = false, verify_enabled = false`; the hosted
  project's setting (Supabase dashboard › Authentication › Multi-Factor) is what production reads.
- **Every request is verified the same way.** `with-route.ts` builds the session from `getClaims()` for the cookie
  (`cookieSession`) and for a bearer (`bearer.ts`, 0011), so the claims, `aal` among them, are in hand at the one door
  every route passes. RLS can read the same claim as `auth.jwt() ->> 'aal'`.
- **A partner's powers are read in two places, by design:** `requireRole` with `ROLE_RANK` at the route, and
  `is_acting_member` / `caller_has_permission` in SQL (00201). Both must say the same thing (0012, "one predicate per
  rule").

## Decision

1. **A partner seat needs an `aal2` session.** A request that acts as `partner` on a workspace, signed in without a
   verified second factor, is refused with `mfa_required` (403) and words that say how to fix it. Their own
   workspaces, where they are owner, are unchanged by this note.
2. **Enforced at both doors, from one predicate.** `requireRole` refuses a `partner` membership when the claims'
   `aal` is not `aal2`; SQL's `is_acting_member` and `caller_has_permission` treat a partner row as acting only when
   `auth.jwt() ->> 'aal' = 'aal2'`. contracts gains `seatNeedsSecondFactor(role)`, and a db test holds the SQL to it.
3. **Enrolling is part of becoming a partner.** Settings › Partner walks the person through TOTP enrolment (a QR code
   and a first code) before `partner_become`, and `partner_become` itself requires `aal2`. A partner who joined before
   this ships is asked on the pane and at sign-in, with a grace period (below).
4. **Sign-in asks for the code when the account has a factor.** After the password, Google or email code, the login
   page calls `mfa.challenge`/`mfa.verify` and only then lands the person; a session that skips it stays `aal1` and
   meets decision 1 at the first partner door.
5. **A lost authenticator is the platform's to reset**, from the back office beside Pause (00206), recorded as
   `platform.acted` against the person; the partner re-enrols at next sign-in.

## Steps

Each shippable on its own, in either deploy order.

1. **M0 — turn it on (yours).** Enable TOTP enrol and verify in the hosted project's Authentication settings;
   `config.toml` follows for local and CI. Nothing changes for anyone until M1 ships.
2. **M1 — enrol.** The pane's "Protect your partner account" step (browser code in `src/auth`, which may use
   `supabase.auth.mfa`); `partner_become` requires `aal2`; the sign-in challenge (decision 4). No enforcement yet.
3. **M2 — the reset.** `POST platform/partners/second-factor/reset` over the Auth admin API, in the back office.
4. **M3 — enforce.** `requireRole` and the two SQL predicates refuse an `aal1` partner, and `partner_become` requires
   `aal2`, from the day it ships (no grace, Ruben's answer).

## As built (M1, M2)

- **The second step has its own page, `/verify`.** The middleware sends a signed-in person away from `/login`, and a
  session that owes its code is signed in, so the sign-in page cannot ask for it. After a password or an email code,
  the page asks Supabase Auth where to land (`pathAfterSignIn`); after Google, the callback does
  (`landingAfter`, `oauth-callback.ts`). A session that owes nothing is sent straight in from `/verify`. The page has
  sign-out and says what to do without the phone.
- **Enrolment is a row on Settings › Partner** (`PartnerSecondFactor`): off says why and offers it; setting up shows
  the QR code and the key; the first code turns it on. A setup begun and never finished is cleared before the next.
  Supabase does not say ahead of time whether the project allows TOTP, so the row appears, and a project with it
  switched off says so when setup is pressed. A read that fails says so; it is never shown as off.
- **The reset (00217)** is `POST platform/partners/second-factor` (rate `platform_partner_second_factor`, 10 an
  hour), a button on the partner's first line in the back office. `partner_second_factor_reset` checks the caller,
  keeps who, when and why on the partner (`second_factor_reset_at`, `_by`, `_why`) and writes `platform.acted` on
  each workspace the partner sits on, before the dashboard's service client removes the factors in Supabase Auth.
- `partner_become` does not require `aal2` yet: until M0, nobody could become a partner. It moves to M3 with the rest
  of the enforcement.

## Tests

- contracts: `seatNeedsSecondFactor` for each role; the refusal's words.
- Routes, through `route()` over `_fake-db.mjs`: a partner with `aal1` claims is refused at a `role: "partner"` route
  and allowed with `aal2`; an owner with `aal1` is unaffected; a bearer carries the same rule.
- Database, on the replayed stack: `is_acting_member` and `caller_has_permission` answer false for a partner session
  whose JWT says `aal1`, true for `aal2`; `partner_become` refuses `aal1`.
- The pane and the login page, drawn: enrolment arms before it acts; a wrong code says so and changes nothing.

## Risks

- **Lockout.** A partner who loses their phone cannot work until reset; the reset is the platform's (decision 5), and
  the pane says so before they enrol.
- **Google sign-in is `aal1`.** A second factor is asked after Google as after a password; nothing about Google
  counts as the second factor.
- **The native app.** Its bearer tokens (0011) carry the same `aal`; its sign-in needs the same challenge before a
  partner's seat works there. Until it has one, a partner acts from the web.

## Open questions, answered

- Should owners be offered (not required) a second factor at the same time? **No: partners only**, for now.
- Fourteen days of grace, or refuse on day one because the programme is not marketed yet? **No grace**: M3 refuses
  an `aal1` partner seat from its first day.
