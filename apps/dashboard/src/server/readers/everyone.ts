import "server-only";
import type { PersonRowDto } from "@chanlytics/contracts";
import { listEveryone as everyoneIn, listFirstPeople } from "../people/people";
import { load, readerStamp, type Reader } from "../shared/reader";

/**
 * People's first page as the database answers it (server/people/people.ts listFirstPeople), once a turn: what People's
 * first page (readers/people.ts) and everyone below both begin with. A Today load asked for it two and three times at
 * once, 350 KB a time on production's demo workspace, People's heaviest read three times over (16 Nov 2026): once for
 * what Today draws from People, once for everyone, and once for the calendar's board. A workspace-wide read, so no row
 * of its own.
 */
export const peopleFirstRows: Reader<undefined, PersonRowDto[]> = {
  name: "peopleFirstRows",
  async read(rc) {
    return { data: await listFirstPeople(rc.ctx, rc.tenantId), rows: [], stamp: readerStamp() };
  },
};

/**
 * Everyone in People, every page of them, each with the reply mode in force (server/people/people.ts everyone): what the
 * audience pool and the Playbooks page's pools both count from, so a turn that lists the audiences and the playbooks,
 * and proposes a send, reads everyone once. Its first page is the turn's (peopleFirstRows), which People's first page
 * reads too. A workspace-wide read, so no row of its own.
 */
export const everyone: Reader<undefined, PersonRowDto[]> = {
  name: "everyone",
  async read(rc) {
    const first = load(rc, peopleFirstRows, undefined).then((r) => r.data);
    return { data: await everyoneIn(rc.ctx, rc.tenantId, first), rows: [], stamp: readerStamp() };
  },
};
