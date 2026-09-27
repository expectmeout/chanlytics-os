# 0018 · An existing workspace brings in a partner

**Status:** decided and built on the branch this note ships with (00220), on `6aba49b6` (main, 27 September 2026,
after #1200). Ruben asked for it after trying it (a workspace he owned could not take on a partner) and left the
shape to this note. Where this note and the code disagree, the code wins.

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
   nightly check judges it as any other. A workspace that was already paying (`billing_accounts.last_paid_at`, or
   billed directly) seats the partner with no share: its standing is `disqualified` with the reason in words. That is
   a platform admin's to change in the back office, as for any other workspace (00207), when a case deserves it.
5. **One partner per workspace, as before.** `partner_tenants` is keyed by workspace; a workspace that has a partner,
   however it came, asks no second.

## Shape

- **00220:** `partner_invitations` (one row per workspace; RLS: its owner and the partner it names read it; written only
  by the functions); `partner_tenants.origin` admits `invite`; `partner_invite`, `partner_invite_withdraw`,
  `workspace_partner` (the owner's card), `partner_invitations_mine` (the partner's list), `partner_invite_accept` and
  `partner_invite_decline`, each a definer function that checks the caller. Events: `partner.invited`,
  `partner.invite_withdrawn`, `partner.invite_accepted` (with `earns`) and `partner.invite_declined`.
- **Routes:** `GET/POST/DELETE team/partner` (workspace, owner, rate `partner_invite`); `GET partner/invitations`,
  `POST partner/invitations/[id]/accept|decline` (account, rate `partner_invite_answer`).
- **Email:** `POST /api/admin/partner-invite` on the edge writes to the partner's account's address, read there, never
  one a caller passes; its words are contracts' `partnerInviteEmail`.
- **Pages:** `TeamPartnerCard` below the team (`window.PaneTeam`), and `PartnerInvitations` on the partner's pane, both
  in `partner-real.jsx`; every sentence from `contracts/workspace/partner-invite.ts`.

## Steps

One step, in either deploy order. Migration first: nothing calls the new functions. Dashboard first: the card's read
fails and says so, and the partner's list is empty ("no function" reads as none).

## Tests

- `partners/partner-invite.test.mjs`: a code or a link; the owner's card in each state; the six routes' policies and
  refusals; joining refused without the second factor before the database is asked; the email's one way; the edge's
  door writing only to the account the invitation names.
- `partners/partner-pane.test.mjs`: the partner's list, joining and declining; the owner's card asking, a refusal, and
  taking it back; no card for anyone but the owner.
- `partners/partner-invite.db.test.mjs`, on the stack: who may ask; joining needs the second factor; a workspace that
  never paid earns and one that was paying does not; declined, asked again, withdrawn; a second partner refused.
- `database/tenancy.db.test.mjs` holds `partner_invitations` to its policy.

## Risks

- **An owner and a partner who are the same person with two accounts** get the 25% as a discount. The nightly check's
  same-card and same-domain holds apply as for a link (0012, 0016), and the workspace must be one that has not paid.
- **A partner removed from the team keeps what they earned**, and the workspace cannot take another partner, as for a
  link. Letting a workspace change partners is a later note if it is asked for.
- **The daily letter (0014) does not mention invitations.** The email and the pane do; the letter can add them later.
