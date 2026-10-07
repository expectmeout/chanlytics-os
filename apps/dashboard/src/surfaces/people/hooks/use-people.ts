/**
 * What a page reads of People (moved whole from legacy/pages/people.jsx `usePeople`, decision 0015): the surface once it
 * has landed, else, in a demo session, the sample (sample.ts), else what a scope has before its surface does. Drawn again
 * when People's rows land or its status moves (surface-status.ts). The Leads scope and the Pipeline read it by its old
 * name (people-globals.ts).
 */
import { demoSession } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { demoPeople } from "../sample";
import type { PeopleRead } from "../types";
import { PL_NO_PEOPLE } from "../words";

export const usePeople = (): PeopleRead => useSurface("people") ?? (demoSession() ? demoPeople() : PL_NO_PEOPLE);
