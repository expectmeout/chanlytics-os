import { write, account } from "@/server/route";
import { joinFromInvitations } from "@/server/workspace/team";

/**
 * POST /api/v1/me/invitations/accept — seat the signed-in person in every workspace that invited their address, and say
 * which: `{ joined: [{ id, name, role }] }`, empty when no invitation was open. The shell makes it once when it boots,
 * before it trusts the list of workspaces, and says "You joined Harbor" when it seated someone.
 *
 * It used to be a side effect of GET /api/v1/workspaces, which accepted every open invitation on each same-origin read
 * (the document head's included) and told nobody. A read never writes (decision 0047, lane 6; decision 0034 section 4),
 * so the acceptance is this one write: declared on the account, since the person has no workspace yet when the
 * invitation is the way into their first, with no role to name. The authority is the address the session proved, never
 * anything sent; the body is not read. The invitation's own checks stand (open, not revoked, not expired), and so does the
 * `member.joined` event the owner's bell line follows, written before the invitation is stamped.
 *
 * A partner account opens the app on a session that showed its second factor (0013), as the list of workspaces always
 * asked, so the refusal that sends the tab to the second step comes before any seat is made.
 *
 * The handle is joinFromInvitations in src/server/workspace/team.ts: the route is its declaration (who may, how often),
 * the verb is what it does.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "invitation_accept",
  handle: ({ ctx }) => joinFromInvitations(ctx),
});
