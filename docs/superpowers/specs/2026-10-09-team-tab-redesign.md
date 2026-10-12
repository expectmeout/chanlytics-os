# Settings › Team, redesigned (9 Oct 2026)

Approved by Ruben on 9 Oct 2026 ("approved as you suggest, build it locally"), from the canvas
https://claude.ai/artifact/5nU2iBg3xkY2rphw4Zza4U. Written against main `39857e8a4` (#1528). Branch
`settings/team-redesign`, worktree `cm-team`. One PR, after his look; nothing pushed before then.

## What changes for an owner

1. The people come first. View as leaves the top of the card.
2. A member's row: face, name (or address), a soft "You" tag on your own row (not a chip), a second line with the
   day they joined and, where they get alert emails, a bell and "Gets alerts".
3. The role on a row an owner may change is a quiet picker (the house `MoreMenu`, radio items, each with what the
   role does under it); everywhere else it is the plain word.
4. Making someone Owner asks first (`Confirm`, on the row). The last owner's picker greys Operator and Viewer with
   the reason, and so does Leave on their own ⋯.
5. ⋯ on someone else: Send them alerts / Stop alerts, Remove from team… (asks; offers "Also stop emailing <address>"
   when they get alerts, unless they are the last address). ⋯ on you: Add your name / Change your name (Profile),
   Leave this workspace… (asks).
6. Waiting to join: its own group under the members. Role and days left, or an amber Expired pill. Resend (pending) or
   Send again (expired) renews the invitation's 7 days and emails the link again. ⋯ holds Revoke invitation… (asks).
7. Invite: several addresses at once (typed, pasted, separated by commas, spaces or lines), each shown as a removable
   chip; the role as two choices with what each does; "Another owner? Invite them as Operator, then make them Owner";
   Send N invitations. Then a result per address, in the server's own words (emailed, added, already waiting with a
   Resend, already on the team, refused with the reason).
8. Roles row: Compare opens a can/can't table drawn from contracts `ROLE_PERMS`; Preview as… is a menu (An Operator,
   A Viewer; Stop previewing while one is on). While previewing, the shell's status line under the top bar says so on
   every page, with Exit preview.
9. Partner row: the partner card becomes the card's last row (owner only, hidden while previewing). Same states and
   test ids; the code form opens from "Ask a partner".
10. Activity: a quiet link in the card's head opens Settings › Activity on Team only (`settings/activity/team`).
11. An Operator or Viewer reads the roster with roles as words and a foot line naming the owners to ask.
12. Phone: a row is one press that opens the person's sheet (`RecordSheet`): role choices with their sentences, the
    alerts switch, Remove…; Cancel / Save. Invite opens in the card as on a desk.

## What changes underneath

- **contracts**
  - `config/workspace-config/alerts.ts`: `alertAddressesOf(notifications)`, `memberGetsAlerts(email, notifications)`,
    `withAlertAddress(notifications, email, on)` (spreads the section; refuses the last address and an 11th).
    `calendar-people.ts ownAddressesOf` reads `alertAddressesOf` (one normaliser). Agreed with the Notifications lane.
  - Role words move from the dashboard (`settings/shared.ts`) into `config/workspace-config/role-perms.ts`:
    `ROLE_SAYS` (label, what it can do, a short line for a picker) and `ROLE_TABLE` (the Compare rows, each naming
    its `ROLE_PERMS` key). Ask's invite card says the same words.
  - `shell/chrome.ts shellStatusLine`: a `previewing` role gives a `preview` line (info; Exit preview), after a pause
    and before a newer build.
  - `shell/identity.ts`: words for a member's joined day and an invitation's state ("invited Oct 7 · 5 days left",
    "Expired").
  - Activity words: an `invite` decision with `resent` says "Sent the invitation to x again"; a `remove_member`
    decision with `left` says "Left the team".
- **database**: one migration, `00371` (above #1527's 00361–00370; the Notifications lane takes 00372+):
  - `team_invite_renew(p_tenant_id, p_actor, p_invitation_id, p_via)`: owner only; an invitation not accepted or
    revoked gets `expires_at = now() + 7 days`; an `invite` decision with `{email, role, resent: true, was}`; returns
    the email, the role, the decision and the expiry it had.
  - `team_invite_renew_withdraw(p_tenant_id, p_invitation_id, p_decision_id, p_was)`: the mail did not go, so the
    expiry and that one decision are taken back (the ledger never says an email went that did not).
  - `team_leave(p_tenant_id, p_actor, p_via)`: any member leaves; the last owner stays (`last_owner`); takes the
    team's turn (the advisory lock 00271's trigger takes); a `remove_member` decision with `{left: true, had_role}`.
  - `lookup_user_for_invite` counts only a CONFIRMED account. An address invited before and never confirmed was read
    as an account, so a second invitation (here, or in another workspace) seated them with no email at all; now it is
    invited, and Supabase Auth sends its invite again to an unconfirmed user (internal/api/invite.go: `sendInvite`
    runs for an existing unconfirmed user too).
  - Each service role only, `revoke … from public, anon, authenticated`, comments, re-runnable.
- **server**: `teamRoster` passes `joined_at` (team_roster has returned it since 00068) as `joinedAt`, and an invite's
  `created_at`; `resendInvite`, `leaveTeam` in `server/workspace/team.ts`.
- **routes**: `POST team/invite/[id]/resend` (owner, rate `invite`, fresh) and `POST team/leave` (viewer, rate `team`,
  fresh); route-policy rows, route types, api reference, refresh map (`settings`).
- **settings route**: `settingsRowOf` takes a row on Activity too; `PaneActivity({ family })` opens narrowed.
- **shell**: `ShellStatusBar` hears `team:changed`, passes `previewing`, and its Exit calls `setViewAs(null)`.

## Constraints held

- No Base UI part newly imported on Settings (#1516): `MoreMenu`, `Confirm`, `Segmented` (already there),
  `RecordSheet` (Business draws it), `RecordSwitch`, `RecordField`, `Face`, `Button`, `LinkButton`.
- Page CSS: layout and tokens only; no class holding a primitive's word, no selector naming a kit class
  (kit-primitives), no literal sizes or colours (style-values), no `style` props.
- Test ids the e2e specs and unit tests read stay, or the spec moves with them in this change.
- A role change, a removal, a leave and a resend each go to the server and the card shows what it then reads.

## Build order

1. contracts (alerts, role words + table, status line, identity words, activity words) + their tests; dist.
2. migration 00371 + server + routes + server tests; on a throwaway stack: db test, db types, schema snapshot,
   data model, ledger record; route types, api reference.
3. team card modules (`team/`: section, rows, invite, roles, partner, sheet) + settings.css/mobile.css + Activity
   row + shell status line; unit tests (confirm, empty-failed, owner panes, doors, partner pane, new behaviour tests).
4. Run the real app (`/w/chanlytics-e2e/settings/team`) at 1440 and 390, both themes; draw the states the e2e
   workspace lacks (pending, expired, last owner, previewing).
5. Ratchets, lint, typecheck, the touched tests + the cross-folder grep, e2e spec update; one review round.
6. Report to Ruben; push only on his word (bundle raise by CI's number then).
