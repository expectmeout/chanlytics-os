/**
 * A Google grant, given back only when nothing else rides it.
 *
 * Google does not take back one token. A revoke removes every scope the Google account granted the whole project and
 * ends every token issued under it, whichever token was named and whichever client asked (Google's OAuth guide for web
 * servers, "Token revocation"; `include_granted_scopes=false` on a consent does not change it). Every Google connection
 * here is one project's (decision 0073, R18), so a grant handed back for one connection signs out every other
 * connection the same Google account made, in this workspace or another: a Business Profile connect refused for having
 * no listing ended the owner's mailbox, and a mailbox removed ended the profile.
 *
 * The rule, in this one place: a grant goes back to Google only when no live connection, the one leaving aside, was
 * made with its Google account. Otherwise the caller drops its own token and its row, Google is not asked, and the
 * grant goes back with the last connection that leaves. Not knowing is not alone: a grant that names no account, or
 * whose holders could not be read, is kept. A grant left with Google costs its owner nothing they cannot undo from
 * their Google account; one taken back costs them a connection that was working.
 *
 * A footage source's connection (a Drive folder watched, 00639) is the third kind, counted from the day its table
 * exists so no connect is ever written that this rule does not know. A new kind of Google connection joins as one line
 * in HOLDERS.
 */
import { DbFailure, type TenantId } from "@chanlytics/contracts";
import { findLiveGoogleMailboxOfAccount } from "@chanlytics/db/email";
import { findGoogleSourceConnectionOfAccount } from "@chanlytics/db/files";
import { findGoogleConnectionOfAccount } from "@chanlytics/db/google";
import { logAndGoOn } from "@chanlytics/log";
import type { Db } from "./rows.js";

/** The connection that is leaving: it does not count among those that hold its own grant. */
type Leaving = { profile: TenantId } | { mailbox: string } | { source: string };

/** One kind of connection: whether a live one, the one leaving aside, was made with this Google account. */
type Holder = (db: Db, account: string, leaving: Leaving | null) => Promise<boolean>;

/** A Business Profile, in any workspace: its row is there while it is connected. */
const profileHolds: Holder = async (db, account, leaving) => {
  const found = await findGoogleConnectionOfAccount(
    db,
    account,
    leaving && "profile" in leaving ? leaving.profile : null,
  );
  if (found.error) throw new DbFailure(found.error, "cannot read the Google account's profiles");
  return found.data !== null;
};

/** A Gmail mailbox, in any workspace, until it is removed: one signed out or on hold still keeps its row and its token. */
const mailboxHolds: Holder = async (db, account, leaving) =>
  (await findLiveGoogleMailboxOfAccount(db, account, leaving && "mailbox" in leaving ? leaving.mailbox : null)) !==
  null;

/** A footage source's connection, in any workspace: its row is there while it is connected, working or signed out. */
const sourceHolds: Holder = async (db, account, leaving) =>
  (await findGoogleSourceConnectionOfAccount(db, account, leaving && "source" in leaving ? leaving.source : null)) !==
  null;

/** Every kind of connection that rides a Google account's grant to this project. */
const HOLDERS: readonly Holder[] = [profileHolds, mailboxHolds, sourceHolds];

/** Whether any live connection, the one leaving aside, was made with this Google account. */
async function isHeldElsewhere(db: Db, account: string, leaving: Leaving | null): Promise<boolean> {
  for (const holds of HOLDERS) if (await holds(db, account, leaving)) return true;
  return false;
}

/**
 * What became of a grant: Google took it back (`given`), Google would not or could not be asked (`refused`), another
 * connection rides it so Google was not asked (`held`), or whose it is could not be told, so it was left (`unknown`).
 */
type GaveBack = "given" | "refused" | "held" | "unknown";

/**
 * The grant given back to Google, when nothing else rides it. `account` is Google's own id for the account (an id
 * token's `sub`); `token` is the grant's refresh token, or its access token where that is all there is; `ask` is the
 * caller's own transport to Google's revoke, reached only when the grant is alone.
 */
export async function giveGoogleGrantBack(
  db: Db,
  grant: { account: string | null; token: string; leaving?: Leaving | null },
  ask: (token: string) => Promise<{ status: number } | null>,
): Promise<GaveBack> {
  if (!grant.account) return "unknown";
  const held = await isHeldElsewhere(db, grant.account, grant.leaving ?? null).catch(
    logAndGoOn("reading who else holds a Google account", null),
  );
  if (held === null) return "unknown";
  if (held) return "held";
  const answer = await ask(grant.token).catch(logAndGoOn("giving a Google grant back", null));
  return answer?.status === 200 ? "given" : "refused";
}
