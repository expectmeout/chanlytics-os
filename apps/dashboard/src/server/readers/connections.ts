import "server-only";
import type { SetupDto } from "@chanlytics/contracts";
import { setupDtoFor } from "../workspace/setup";
import { stamp, type Reader, type ReaderContext } from "./index";

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
