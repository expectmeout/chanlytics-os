/**
 * Where the person page reads a person from (decision 0015, step 5): the workspace's courier (people-detail.ts, the tab's
 * copy first). The demo's sample it read in a demo session went with demo mode (16 Nov 2026).
 */
import type { PersonVM } from "@chanlytics/contracts";
import { peekPerson, personDetail } from "../people-detail";

/** The person this tab already holds, drawn first. */
export function heldPerson(id: string): PersonVM | null {
  return peekPerson(id);
}

/** Read a person: the courier's; null for someone who is not here. */
export function readPerson(id: string): Promise<PersonVM | null> {
  return personDetail(id);
}
