import "server-only";
/**
 * A week a rung let AI approve, made here (00712; the content loop PRD's 12.4, canvas v18 board B5). The edge keeps the
 * time (its content_week_go job approves the held week under the rung at 8:00 AM, or as soon as it is ready where the
 * owner lets AI send it) and asks this door to make the week; the making is the code the owner's own press runs
 * (make-week.ts), run as AI: no person, the service role at the doors, each placement approved via rung.
 *
 * Opened only by a token the edge signs for this door, this workspace and this exact body, with the secret the two apps
 * share (EDGE_CALL_SECRET, channels/tokens). It answers at once and makes after it has answered, as the owner's press
 * does. It makes only a week approved under the rung, and only what is not made yet, so the job asked again (or the same
 * call seen twice) makes nothing twice.
 *
 * The making queue (00712): the edge asks this door for no more weeks at once than WEEKS_MAKING_AT_ONCE. A held week is
 * PREPARED here overnight (its pictures drawn, each placement readied, nothing approved), and what is left after the 8:00
 * approval is MADE; each pass holds its place until it is said done here (content_week_made), which begins the next in
 * turn. A pass that throws is not said done: its place frees when its lease ends, and the queue begins it again.
 */
import { after } from "next/server";
import { edgeBodyMatches, verifyEdgeToken } from "@chanlytics/channels/tokens";
import { asTenantId, WEEK_MADE_DOOR, WEEK_MAKING_QUEUE } from "@chanlytics/contracts";
import { findWeekForAI, markWeekMade } from "@chanlytics/db/files";
import { logAndGoOn } from "@chanlytics/log";
import { env } from "@/server/shared/env";
import { log } from "@/server/shared/log";
import { mint } from "@/server/shared/route";
import { serviceDb } from "@/server/shared/service-db";
import { getTenantFacts } from "@/server/shared/tenant";
import type { RouteContext } from "@/server/shared/with-route";
import { makeWeek, prepareWeek } from "./make-week";

/** What the door answers: its status and a word for the edge's log, never a reason a stranger could learn from. */
interface WeekMadeAnswer {
  status: 202 | 400 | 401 | 409 | 503;
  said: "making" | "malformed" | "unsigned" | "not_the_rung_s" | "unconfigured";
}

/** Some text as JSON, or nothing where it is none: a body that is no JSON is no week to make. */
function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Not JSON: the schema refuses the nothing this gives.
    return undefined;
  }
}

/** What runs the making once the answer has gone: next/server's after(); a test hands its own. */
type Later = (task: () => Promise<void>) => void;

/** The door: the token, the body it names, the week the rung approved; then the making, after the answer. */
export async function takeWeekMade(request: Request, later: Later = after): Promise<WeekMadeAnswer> {
  const secret = env.EDGE_CALL_SECRET;
  if (!secret) return { status: 503, said: "unconfigured" };
  const text = await request.text();
  const token = request.headers.get("x-edge-token") ?? "";
  const verdict = verifyEdgeToken(secret, token, WEEK_MADE_DOOR.path);
  if (!verdict.ok || !edgeBodyMatches(verdict.claims, text)) return { status: 401, said: "unsigned" };
  const body = WEEK_MADE_DOOR.body.safeParse(jsonOf(text));
  if (!body.success || verdict.claims.ws !== body.data.tenant_id) return { status: 400, said: "malformed" };
  const tenantId = asTenantId(body.data.tenant_id);
  const db = serviceDb();
  // Held: prepared ahead. Approved by the rung: what is left made. Anything else is not AI's.
  const week = await findWeekForAI(db, tenantId, body.data.plan_id);
  if (!week) return { status: 409, said: "not_the_rung_s" };
  // AI under the rung: the service role at the doors (00712), nobody as its person, the business's own clock and name.
  const ctx: RouteContext = { supabase: db, userId: "", email: undefined, metadata: {} };
  // The rung is the owner's grant, so AI acts as the owner's press would: the role the making's checks read.
  const member = mint({ tenantId, role: "owner", facts: await getTenantFacts(db, tenantId) });
  const planId = body.data.plan_id;
  later(() =>
    (week.pass === "prepare"
      ? prepareWeek(ctx, member, week.weekOf)
      : makeWeek(ctx, member, { weekOf: week.weekOf, by: "rung" })
    )
      .then(async (done) => {
        // Its pass done: its place in the queue is free, and the next week in turn begins.
        const started = await markWeekMade(db, tenantId, { planId, pass: week.pass }, WEEK_MAKING_QUEUE);
        log.info("week_made_as_ai", { tenant_id: tenantId, plan_id: planId, pass: week.pass, done, started });
      })
      .catch(logAndGoOn("making a week AI approved under the rung")),
  );
  return { status: 202, said: "making" };
}
