# 0020 · An existing workspace brings in a partner

**Status:** decided and built on the branch this note ships with (00225), on `6aba49b6` (main, 27 September 2026,
after #1200). Ruben asked for it after trying it (a workspace he owned could not take on a partner) and left the
shape to this note. Where this note and the code disagree, the code wins.

Numbered 0018 until 28 September: #1205's note on the job lanes was opened first under 0018 and #1244 took 0019, so
this one is 0020. 00225's header still says 0018: the migration was applied to production under that text, and an
applied migration is never edited.

## Context

A partner (0012) comes onto a workspace two ways, both at its start: the business signs up through the partner's link
(00202, `create_workspace` with `p_partner_code`), or the partner sets the workspace up and hands it to its owner
(0016, 00214). 0012's decision 2 says why only then: _a workspace that exists is never attributed later_, so that a
partner cannot claim customers Chanlytics already had and be paid 25% of them.

That leaves out a real case: a business already on Chanlytics that finds a partner to run its receptionist. Today its
owner can invite that person under Team as an operator or a viewer (`team/invite/route.ts`: "Invites can grant
operator or viewer"), which gives access but not the partner role, and the partner's pane never counts it.

## Decision

1. **The owner asks, by the partner's code.** Settings › Team gains "Your partner": the owner types the partner's code,
   or pastes their link (`/p/<code>`), and the partner is asked. Owner only, like the rest of the team. A code, not an
   address, because a partner is someone with a partner account, and the code is what they hand out.
2. **The partner answers.** The invitation is on their Partner page ("Workspaces asking for you") and in an email to
   their account's own address. They join or decline. It is open 14 days, like a handover; one open invitation per
   workspace, and asking again replaces it. The owner can take it back until it is answered.
3. **Joining is a partner seat, so it needs the second factor** (0013): the function refuses an `aal1` session, and so
   does the route.
4. **Credit follows who brings the paying customer.** A workspace that has never paid for a plan credits the partner
   who joins it, exactly as if they had brought it: its first invoice after they join earns their share, and the
   nightly check judges it as any other. A workspace that was already paying seats the partner with no share: its
   standing is `disqualified` with the reason in words, a platform admin's to change in the back office, as for any
   other workspace (00207), when a case deserves it. _Already paying_ is billed directly, or a `last_paid_at` from
   the trial's end on, and none while the trial runs (`billing_accounts.trial_end`, Stripe's, kept after a cancel):
   Stripe sends `invoice.paid` for a trial's $0 first invoice, which stamped `last_paid_at` at the trial's start
   until this change (the webhook now stamps it only for an invoice that took money), so a workspace that trialed and
   never paid, whether still in its trial, cancelled, or refused at the trial's end, has not paid whatever the column
   says. The rule's decision is recorded as made when the partner joined (`checks.already_paying`, and
   `partner.standing_set` with `by: 'joining'`), and the back office says so, never "the nightly check".
5. **The nightly check judges an invitation as it judges a handover.** Its same-domain hold compares the address of
   the owner who asked (`partner_tenants.invited_by`) with the partner's, as 0016's compares the owner who accepted.
6. **Someone already on the team may be the one asked.** Joining makes them its partner, whatever they were, and the
   event keeps the role they had (`was`).
7. **One partner per workspace, as before.** `partner_tenants` is keyed by workspace; a workspace that has a partner,
   however it came, asks no second.
8. **An invitation stands while its sender is an owner and its partner is active.** The owner who asked must still be
   an owner when the partner joins: one who left, was made something else, or deleted their account asks nobody now,
   and the invitation leaves the partner's list and the other owners' card, where asking again replaces it. A partner
   paused, closed or erased loses the invitations waiting for them; a declined one stays for its owner to read. A code
   that names nobody and one whose partner is not active are refused alike, since which codes exist is not the
   asker's to learn a code at a time (the `/p/` page answers every code alike, 0012).

## Shape

- **00225:** `partner_invitations` (one row per workspace; RLS: its owner and the partner it names read it; written only
  by the functions); `partner_tenants.origin` admits `invite`; `partner_invite`, `partner_invite_withdraw`,
  `workspace_partner` (the owner's card), `partner_invitations_mine` (the partner's list), `partner_invite_accept` and
  `partner_invite_decline`, each a definer function that checks the caller through `is_workspace_owner` or the
  partner's own row; `partner_tenants.invited_by`; 00214's `partner_earnings_sweep` with the invitation beside the
  handover; `partner_invitations_lapse`, a trigger on `partners` that drops a partner's open invitations when they stop
  being active; 00214's `partner_letters_due` without the standing decided as a partner joined; 00205's
  `platform_partner_workspaces` with the `origin` and `joining` beside the sweep and a person. Events:
  `partner.invited`, `partner.invite_withdrawn`, `partner.invite_accepted` (with `earns` and `was`),
  `partner.invite_declined`, and `partner.standing_set` for a join to a workspace that was paying.
- **Edge webhook:** `invoice.paid` for an invoice that took no money no longer stamps `last_paid_at`.
- **Routes:** `GET/POST/DELETE team/partner` (workspace, owner, rate `partner_invite`); `GET partner/invitations`,
  `POST partner/invitations/[id]/accept|decline` (account, rate `partner_invite_answer`).
- **Email:** `POST /api/admin/partner-invite` on the edge writes to the partner's account's address, read there, never
  one a caller passes; its words are contracts' `partnerInviteEmail`.
- **Pages:** `TeamPartnerCard` below the team (`PanePartner.Team`, which Settings' `TeamWithPartner` draws for the
  Team tab; an owner's View as another role sees what that role does, no card), and `PartnerInvitations` on the
  partner's pane, both in `partner-real.jsx`; every sentence from `contracts/workspace/partner-invite.ts`. Joining
  reads the workspace list and the partner's account again; the workspace list's read now says so
  (`surface:workspace`), which the sidebar, the arrival line and the bell already listened for. The back office names
  how each partner came (`platformPartnerStanding`).

## Steps

One step, in either deploy order. Migration first: nothing calls the new functions. Dashboard first: the card's read
fails and says so, and the partner's list is empty ("no function" reads as none).

## Tests

- `partners/partner-invite.test.mjs`: a code or a link; the owner's card in each state; the six routes' policies and
  refusals; joining refused without the second factor before the database is asked; the email's one way; the edge's
  door writing only to the account the invitation names.
- `partners/partner-pane.test.mjs`: the partner's list, joining and declining, an answered row gone at once; the owner's
  card asking, a refusal read again, an email that did not go, and taking it back; View as and the team's gate; no
  card for anyone but the owner; and the bridge itself, over a network the test answers.
- `partners/partner-invite.db.test.mjs`, on the stack: who may ask; joining needs the second factor; a workspace that
  never paid earns (in its trial, or cancelled in it) and one that was paying does not (billed, or paid before its
  Stripe customer was deleted); the join-time decision on the row, the ledger, the back office and not in the letter;
  declined, asked again, withdrawn; a sender no longer an owner; a partner paused; a second partner refused.
- `platform/back-office.test.mjs`: the origin and who decided, in the back office's words.
- `database/tenancy.db.test.mjs` holds `partner_invitations` to its policy.

## Risks

- **An owner and a partner who are the same person with two accounts** get the 25% as a discount. The nightly check's
  same-card hold applies as for a link (0012), its same-domain hold as for a handover (0016), and the workspace must
  be one that has not paid.
- **A partner removed from the team keeps what they earned**, and the workspace cannot take another partner, as for a
  link. Letting a workspace change partners is a later note if it is asked for.
- **The daily letter (0014) does not mention invitations**, nor the standing decided as a partner joined: they were
  told then. The email and the pane say both; the letter can add invitations later.
- **The trial-end rule reads what Stripe left on the row.** A workspace whose Stripe customer was deleted keeps
  `last_paid_at` and loses `trial_end`, so one that only ever trialed before this change reads as paying, and one that
  paid, was deleted and came back through a second trial (only a deleted customer gets one) reads as never paid until
  its first real invoice. A 100%-off code stamped `last_paid_at` on its $0 invoices before this change too. Each is a
  standing a platform admin can change.
- **A partner with no workspace of their own** does not see invitations. Becoming a partner happens inside a workspace,
  so every partner has one; one who later leaves them all lands on the create screen, and the email's Settings ›
  Partner is out of reach until they are in a workspace again.
- **The role a partner had before joining is kept on the event only.** If the platform closes the partner, which takes
  their partner seats away, a former operator does not get their operator seat back.
