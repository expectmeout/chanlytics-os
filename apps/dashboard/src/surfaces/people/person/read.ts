/**
 * Where the person page reads a person from (decision 0015, step 5): a real workspace's courier (people-detail.ts, the tab's
 * copy first), or in a demo session the sample's (sample.ts), so a demo draws the one page there is, over made-up people, as
 * People does. The seeded twin the JSX forked to is gone. The sample is fetched as a demo reads it: People's crumbs read the
 * held person on every page, and a static import carried the whole sample, built from every part of a person's page,
 * into every first load (the loadability review, 19 Oct 2026).
 */
import type { PersonVM } from "@chanlytics/contracts";
import { demoSession } from "../../legacy-verbs";
import { demoCode } from "../hooks/demo";
import { peekPerson, personDetail } from "../people-detail";

/** The person this tab already holds, drawn first. A demo holds none: its sample is read as it opens. */
export function heldPerson(id: string): PersonVM | null {
  return demoSession() ? null : peekPerson(id);
}

/** Read a person: the courier's, or the sample's; null for someone who is not here. */
export function readPerson(id: string): Promise<PersonVM | null> {
  return demoSession() ? demoCode().then((m) => m.samplePerson(id)) : personDetail(id);
}
