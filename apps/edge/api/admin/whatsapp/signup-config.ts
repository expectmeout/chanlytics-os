/**
 * GET /api/admin/whatsapp/signup-config — what the browser needs to start
 * Embedded Signup, and whether it can.
 *
 * The app id is public by nature (the browser hands it to Meta's SDK) and
 * defaults to the one live app; the configuration id names the Embedded
 * Signup flow created in that app's dashboard and lives only in this edge's
 * environment. When the configuration is missing the answer says so, and
 * the Integrations pane says so to the owner instead of drawing a button
 * that would open nothing.
 */
import { json } from "../../../lib/http.js";
import { GRAPH_VERSION, metaAppId } from "../../../lib/meta-graph.js";

export async function GET(request: Request): Promise<Response> {
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
  const appId = metaAppId();
  const configId = process.env.META_ES_CONFIG_ID || null;
  const secret = !!process.env.META_APP_SECRET;
  const reason = !secret ? "no_app_secret" : !configId ? "no_config_id" : null;
  return json(200, { ok: true, app_id: appId, config_id: configId, graph_version: GRAPH_VERSION, ready: reason === null, reason });
}
