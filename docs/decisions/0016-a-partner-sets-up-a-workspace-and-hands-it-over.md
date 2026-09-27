# 0016 · A partner sets up a workspace and hands it to its owner

**Status:** decided and built on the branch this note ships with (00214). Written against commit `519724e9` (main, 27
September 2026, after #1161), built on `0c508cad` (after #1165 merged 0014). Ruben answered the two questions at the
end: the share is earned, and the invitation is open 14 days and can be sent again. One change from the proposal:
the handover lives on `partner_tenants`, not in `invitations` (Shape says why). Proposed as 0015; numbered 0016 when
#1172 gave 0015 to the shell's exit. Where this note and the code disagree, the code wins.

## Context

0012 lets a business arrive through a partner's link: the business signs up, makes its own workspace, and is asked
whether to seat the partner. That is the only way a workspace is attributed, "once, at creation" (00202's header), and
never for a workspace the partner made themselves (`create_workspace_for`, `v_why := 'self'`). 0012 names the other way
as a later step: _a partner making the workspace and inviting the owner (needs "invite as owner" and a hand-over)_.

Partners ask for it because it is how the work is actually sold: the partner builds the receptionist first, shows it
working, and only then asks the business to take it over and pay. Today they cannot. What stands in the way, read at
`519724e9`:

- **An invitation cannot carry owner.** `invitations.role` is `check (role in ('operator','viewer'))` (00012:23); the
  route's schema says "Invites can grant operator or viewer" (`team/invite/route.ts`); the Ask tool refuses it too.
- **An invitation is accepted without being asked.** `inviteMember` seats an existing account at once, and
  `acceptOpenInvites` seats a new one on their first `GET /workspaces` (`server/workspace/team.ts`). Right for a
  teammate; wrong for ownership, which comes with the bill.
- **Nothing attributes a workspace after creation**, and the one writer of `partner_tenants` refuses the partner's own.
- **The payer is the workspace, not a person** (`billing_accounts` is keyed by tenant; checkout is `role: "owner"`), so
  whoever is owner when the card is added pays. The Stripe customer keeps the first payer's email.

## Decision

1. **The partner never owns it.** `create_workspace_for_business(p_name, p_timezone, p_owner_email)` makes the
   workspace with the calling (active) partner seated as `partner`, not owner, and writes its `partner_tenants` row at
   creation, as 00202 does for a link. A workspace with a partner and no owner yet is "waiting for its owner". The
   partner can do everything `ROLE_PERMS.partner` allows: set it up, connect channels, rehearse. They cannot pay
   (`billing` is the owner's) or invite a team (`team` is the owner's), and `maySpend` still refuses the spend doors
   until the workspace pays. So the economics of 0012 hold unchanged: a partner never pays for a workspace they are
   credited with.
2. **A handover, made only by this door.** Only `create_workspace_for_business` and `partner_handover_resend` write
   one, and a workspace has at most one (it lives on the workspace's `partner_tenants` row). `POST team/invite` and
   `invitations` are unchanged: operator and viewer.
3. **Ownership is accepted, never assumed.** Nothing seats the owner on sign-in. The invitee, new account or
   old, sees one screen: _"{code} set {workspace} up for you. Accept to become its owner: you'll choose a plan and pay
   for it, and {code} stays on your team as your partner, whom you can remove in Team at any time."_ Accept seats them
   as owner (the first and only one) and stamps the invitation. Decline revokes it, and the partner hears so (0014's
   letter). The same consent 0012 asks for at a link, asked of the person who will pay.
4. **Nobody can hand a workspace to themselves.** The accept door refuses the partner's own account. The nightly
   check judges the workspace exactly as a linked one: the card that pays for it also paying for a workspace the
   partner owns holds it for review. A handover accepted by an address on the partner's own domain is held for review
   too (a new check in `partner_earnings_sweep`: `checks.same_domain`).
5. **It does not wait for ever.** An owner invitation is open for 14 days (the teammate one is 7) and the partner may
   send it again, to the same address or another. At most 10 workspaces may be waiting for an owner per partner, the
   cap 00202 already puts on owned workspaces. A workspace nobody accepted is the platform's to erase, as an empty one
   is today.
6. **The share runs as for a link.** From the first payment the new owner makes, `share_bp`, held thirty days, judged
   by the same sweep. Nothing is earned before an owner exists, because nothing can be paid before one does.

## Shape

- **00214**: `partner_tenants` gains `origin` (`link` · `handover`) and the handover (`handover_email`, `_sent_at`,
  `_expires_at`, `_accepted_at`, `_accepted_by`, `_declined_at`), with a check that a link's row has none of it. The
  functions `create_workspace_for_business` (it calls `create_workspace_for` and turns the partner's seat into
  `partner`, so the name, zone, slug and provisioning stay in one place), `partner_handover_resend`, `handovers_mine`,
  `handover_accept`, `handover_decline`, each security definer with the caller checked first and only a confirmed
  address answered. `partner_earnings_sweep` gains `checks.same_domain` (a company's domain; a public mailbox's says
  nothing). `partner_letters_due` says a handover accepted or declined; "brought" stays the link's.
  - **Why not `invitations`.** The proposal widened `invitations.role` to `owner`. But `acceptOpenInvites` seats
    every open invitation at its role on sign-in, and a dashboard rolled back to a version before this one would
    have seated an owner without asking. On `partner_tenants` no version of that code can see a handover, a
    workspace has one by the table's key, and the partner already reads the row.
- **contracts** (`workspace/handover.ts`): `HandoverCreateSchema`, `HandoverResendSchema`, `HANDOVER_WORDS` (the
  form, the accept screen), `partnerHandoverVM` (the waiting row), `handoverRoom` (ten waiting),
  `handoverInviteEmail`. `PartnerLetterNewsSchema` gains `accepted` and `declined`.
- **Routes**: `POST partner/workspaces` and `POST partner/workspaces/[id]/resend` (`scope: account`, rate
  `partner_handover`); `POST handovers/[id]/accept|decline` (`scope: account`, rate `handover_answer`). `GET
workspaces` carries the person's open handovers on `user.handovers`; `GET partner/workspaces` carries each
  handover the partner made.
- **Pages**: Settings › Partner gains "Set up a workspace for a business" and a "Handed to their owners" list, each
  with where its handover stands and Send again. The shell asks about a waiting handover before anything else opens
  (`useHandoverAsk` in `CreateWorkspace.tsx`), with Accept, Decline and Not now.
- **Mail**: `auth.admin.inviteUserByEmail` for a new address, as teammates' invitations go, and the edge's
  `POST /api/admin/handover-invite` for an address with an account, which writes to the address the handover holds,
  never to one the call carries. The partner is answered the same either way.

## Either deploy order

- **Migration first**: nothing calls the new functions, and every existing row is a link's.
- **Dashboard first**: the partner's form is refused by the database (no function) and says so; `GET workspaces` reads
  no handovers (`handovers_mine` missing reads as none); the brought count reads every row as a link's.
- **Edge last**: until it has the door, an existing account's invitation answers 404 and the partner is told it did
  not go, and sends it again later.

## Tests

- `partners/handover.test.mjs`: the words; the four routes over a database in memory, their policies and refusals;
  the boot carrying handovers and living without them; the invitation's two ways; the edge's door.
- `partners/partner-pane.test.mjs`: the form, a paused partner, ten waiting, the list and Send again.
- `auth/create-workspace-screen.test.mjs`: the accept screen, Accept, Decline, Not now, a refusal.
- `partners/handover.db.test.mjs`, against the replayed stack: who may make, read and answer a handover; decline,
  resend, accept; the letter's news; the sweep's domain check.

## Risks

- **A partner with a second address.** Held by the card check and the domain check, and by the fact that the share is
  25% of what the second address pays: the worst case is a discount, as 0012 says, on a workspace a person can review.
- **A business that never accepts.** The partner's setup is lost with the workspace. The pane says so before they
  start, and the 14 days are shown on the waiting row.
- **The Stripe customer's email** is the first payer's, as today; the owner who accepts is that payer.

## Questions for Ruben, answered

1. **Credit for a workspace the partner set up.** 0012 says a partner is never credited with a workspace they made.
   Here they make it but never own or pay for it, and the business accepts before anything is paid. Is that "brought",
   and so earns the share? **Yes**, on the terms above.
2. **How long an owner invitation stays open.** **14 days**, which the partner can send again.
