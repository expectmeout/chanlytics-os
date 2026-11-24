import "server-only";
import {
  ROLE_PERMS,
  reviewReplyModeOf,
  type GoogleReadDto,
  type SetupDto,
  type WebsiteFormsDto,
} from "@chanlytics/contracts";
import { findLastFormEntryAt } from "@chanlytics/db/people";
import { readWebsiteSites } from "../connections/outside-forms";
import { getGoogle } from "../connections/google";
import { edgeUrl } from "../shared/edge";
import { setupDtoFor } from "../setup/setup";
import * as facts from "./facts";
import { load, readerStamp, type Reader, type ReaderContext } from "../shared/reader";

/**
 * GET setup, as the route answers it: what the workspace has, for the Setup page -- setupDtoFor's assembly for a
 * member reading their own workspace on their session client (the back office reads another's through the same
 * function, so support sees exactly what the customer sees), on the turn's clock, and the member's role beside it so
 * the page knows who may act. Its reads are setupDtoFor's own. Named for the pane it feeds, the workspace's
 * connections; the mailboxes it writes its reach-outs from are the rows a citation names, each opened on Connections.
 */
export const connections: Reader<undefined, { setup: SetupDto; role: ReaderContext["role"] }> = {
  name: "connections",
  async read(rc) {
    const setup = await setupDtoFor(rc.ctx.supabase, rc.tenantId, { kind: "member" }, rc.now);
    const mailboxes = setup.email?.sending?.mailboxes ?? [];
    return {
      data: { setup, role: rc.role },
      rows: mailboxes.map((m) => ({
        kind: "mailbox" as const,
        id: m.id,
        route: "admin/integrations",
        label: m.address,
      })),
      stamp: readerStamp(),
    };
  },
};

/**
 * Google as the database holds it for the workspace: the listing, the connection, the newest reviews and the daily
 * readings (getGoogle), and what the receptionist does under a new review (the Autonomy row, the turn's policies), read
 * once a turn. `GET google` answers it with what this deployment can do beside it, and the Reviews report draws its
 * rating and its reviews from it, so the two are one read's, and Ask's report tool at three periods in a turn reads it
 * once. No row of its own: it is drawn on Connections and on the Reports page.
 */
export const googleReader: Reader<undefined, GoogleReadDto> = {
  name: "google",
  async read(rc) {
    const [held, policies] = await Promise.all([
      getGoogle(rc.ctx.supabase, rc.tenantId, rc.now.getTime()),
      load(rc, facts.policies, undefined),
    ]);
    return { data: { ...held, reply_mode: reviewReplyModeOf(policies.data) }, rows: [], stamp: readerStamp() };
  },
};

/**
 * The website connection as Campaigns › Forms shows it (GET website-forms; 00675, 00709): each site the business sends
 * entries from, where it stands, its keys that still work on the turn's clock (contracts websiteKeyWorks, the door's own
 * rule), newest first, and the forms found on it (server/connections/outside-forms.ts readWebsiteSites); when an entry last arrived;
 * the door a site's server posts to; and whether this member may change a key. Read on the member's own session,
 * under its row security. No row a citation names.
 */
export const websiteForms: Reader<undefined, WebsiteFormsDto> = {
  name: "website_forms",
  async read(rc) {
    const db = rc.ctx.supabase;
    const [sites, lastReceived] = await Promise.all([
      readWebsiteSites(db, rc.tenantId, rc.now.getTime()),
      findLastFormEntryAt(db, rc.tenantId),
    ]);
    const data: WebsiteFormsDto = {
      sites,
      last_received_at: lastReceived,
      door: { address: `${edgeUrl()}/api/website-form`, workspace: rc.tenantId },
      can_change: ROLE_PERMS[rc.role].settings,
    };
    return { data, rows: [], stamp: readerStamp() };
  },
};
