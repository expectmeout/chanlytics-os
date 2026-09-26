import "server-only";
import type { PersonRowDto } from "@chanlytics/contracts";
import { everyone as everyoneIn } from "../people";
import { stamp, type Reader } from "./index";

/**
 * Everyone in People, every page of them, each with the reply mode in force (server/people.ts everyone): what the
 * audience pool and the Playbooks page's pools both count from, so a turn that lists the audiences and the playbooks,
 * and proposes a send, reads everyone once. A workspace-wide read, so no row of its own.
 */
export const everyone: Reader<undefined, PersonRowDto[]> = {
  name: "everyone",
  async read(rc) {
    return { data: await everyoneIn(rc.ctx, rc.tenantId), rows: [], stamp: stamp() };
  },
};
