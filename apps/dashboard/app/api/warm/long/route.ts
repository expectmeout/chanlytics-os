import { routesWarmed } from "@/server/workspace/routes-warm";
import * as playbooks from "../../v1/playbooks/route";

/**
 * GET /api/warm/long — the warm-up of the function that holds the routes given a minute to answer (warm/route.ts says what
 * a warm-up is). The playbooks' read lives there, and Campaigns › New's first draw waits for it: 3.1 s to its first byte on
 * the first visit after a deploy, 0.6 s once loaded (production, 12 Nov 2026). Its `maxDuration` is theirs, which is what
 * puts it in their function; tests/checks/routes-warm.test.mjs holds the two equal.
 */
const HELD = { playbooks };

export const maxDuration = 60;

export const GET = routesWarmed(Object.keys(HELD));
