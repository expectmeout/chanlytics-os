import "server-only";
import type { PersonRowDto } from "@chanlytics/contracts";
import { listEveryone as everyoneIn } from "../people/people";
import { readerStamp, type Reader } from "../shared/reader";

/**
 * Everyone in People, every page of them, each with the reply mode in force (server/people/people.ts everyone): what the
 * audience pool and the Playbooks page's pools both count from, so a turn that lists the audiences and the playbooks,
 * and proposes a send, reads everyone once. A workspace-wide read, so no row of its own.
 */
export const everyone: Reader<undefined, PersonRowDto[]> = {
  name: "everyone",
  async read(rc) {
    return { data: await everyoneIn(rc.ctx, rc.tenantId), rows: [], stamp: readerStamp() };
  },
};
