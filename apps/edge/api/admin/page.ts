/**
 * POST /api/admin/page — the pager's door, for a platform condition seen outside the edge.
 *
 * The edge pages the platform for what it sees itself (lib/ops/page-operator.ts). Two conditions are seen only by
 * GitHub's workflows: the nightly red twice running, and production's migrations disagreeing with main's for a day
 * (docs/runbook.md). Both reached nobody outside GitHub, so both come here and page the way the edge's own do: one
 * page per condition per six hours, to the platform's addresses, remembered in operator_pages and shown on /api/diag.
 *
 * The platform's key only (DIAG_KEY, held by the workflows as a secret): nothing mints a token for this door, and a
 * token, which names a workspace, is refused. The conditions are a closed set, so a workflow cannot page anything
 * else; the words are the workflow's, cut to what a page carries.
 */
import { json, refuse } from "../../lib/http.js";
import { authorizeAdmin } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import { pageOperator } from "../../lib/ops/page-operator.js";
import { logger, adminDoor } from "../../lib/log.js";

/** What a workflow may page for, and the subject its page carries. */
const OUTSIDE_CONDITIONS = {
  nightly_red: "The nightly has been red two runs in a row",
  migration_ledger: "Production's migrations disagree with main's",
} as const;
type OutsideCondition = keyof typeof OUTSIDE_CONDITIONS;

/** The longest detail a page carries: the workflow's summary and its run's address, not a log. */
const DETAIL_MAX = 4000;

const isCondition = (v: unknown): v is OutsideCondition =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(OUTSIDE_CONDITIONS, v);

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/page", { platformKey: true });
  if (!auth.ok) return auth.response;
  if (auth.via !== "key") return refuse(403, "platform_only", "the platform's key pages; a workspace's token does not");

  let body: { condition?: unknown; detail?: unknown } = {};
  try {
    const parsed: unknown = JSON.parse(await request.text());
    if (typeof parsed === "object" && parsed !== null) body = parsed;
  } catch {
    /* validated below */
  }
  const condition = body.condition;
  if (!isCondition(condition))
    return refuse(400, "bad_request", `condition is one of ${Object.keys(OUTSIDE_CONDITIONS).join(", ")}`);
  const detail = typeof body.detail === "string" ? body.detail.trim().slice(0, DETAIL_MAX) : "";
  if (!detail) return refuse(400, "bad_request", "detail says what was seen and where");

  const db = pg();
  if (!db) return refuse(503, "no_database");
  const outcome = await pageOperator({ db }, `outside:${condition}`, OUTSIDE_CONDITIONS[condition], detail);
  logger().info("outside_page", { condition, outcome });
  return json(200, { ok: true, condition, outcome });
});
