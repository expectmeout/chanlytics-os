import "server-only";
import { reviewReplyModeOf, type GoogleReadDto, type SetupDto } from "@chanlytics/contracts";
import { googleRead } from "../connections/google";
import { setupDtoFor } from "../workspace/setup";
import * as facts from "./facts";
import { load, stamp, type Reader, type ReaderContext } from "./index";

/**
 * GET setup, as the route answers it: what the workspace has, for the Setup page -- setupDtoFor's assembly for a
 * member reading their own workspace on their session client (the back office reads another's through the same
 * function, so support sees exactly what the customer sees), on the turn's clock, and the member's role beside it so
 * the page knows who may act. Its reads are setupDtoFor's own. Named for the pane it feeds, the workspace's
 * connections; the domains it sends cold email from are the rows a citation names, each opened on Connections.
 */
export const connections: Reader<undefined, { setup: SetupDto; role: ReaderContext["role"] }> = {
  name: "connections",
  async read(rc) {
    const setup = await setupDtoFor(rc.ctx.supabase, rc.tenantId, { kind: "member" }, rc.now);
    const domains = setup.email?.sending?.domains ?? [];
    return {
      data: { setup, role: rc.role },
      rows: domains.map((d) => ({ kind: "domain" as const, id: d.id, route: "admin/integrations", label: d.host })),
      stamp: stamp(),
    };
  },
};

/**
 * Google as the database holds it for the workspace: the listing, the connection, the newest reviews and the daily
 * readings (googleRead), and what the receptionist does under a new review (the Autonomy row, the turn's policies), read
 * once a turn. `GET google` answers it with what this deployment can do beside it, and the Reviews report draws its
 * rating and its reviews from it, so the two are one read's, and Ask's report tool at three periods in a turn reads it
 * once. No row of its own: it is drawn on Connections and on the Reports page.
 */
export const googleReader: Reader<undefined, GoogleReadDto> = {
  name: "google",
  async read(rc) {
    const [held, policies] = await Promise.all([
      googleRead(rc.ctx.supabase, rc.tenantId, rc.now.getTime()),
      load(rc, facts.policies, undefined),
    ]);
    return { data: { ...held, reply_mode: reviewReplyModeOf(policies.data) }, rows: [], stamp: stamp() };
  },
};
