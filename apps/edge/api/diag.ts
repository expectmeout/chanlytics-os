/**
 * Ops diagnostic: GET /api/diag. Internal endpoint, not part of the frozen surface, opened by the platform's key
 * (x-diag-key, DIAG_KEY) alone.
 *
 * The door is the knock: header only (the WhatsApp verify token used to open it from the query string, a value Meta
 * carries in its own verification URL and one that lands in access logs), and nothing mints a token for it, so the key
 * stays its credential on an edge that holds the secret too. diagnosticReport in lib/ops/diagnostic.ts is the report,
 * part by part.
 */
import { authorizeAdmin } from "../lib/admin-auth.js";
import { door } from "../lib/log.js";
import { diagnosticReport } from "../lib/ops/diagnostic.js";

export const GET = door(async function GET(request: Request): Promise<Response> {
  // Header only. The WhatsApp verify token used to open this door from the
  // query string — a value Meta also carries in its own verification URL,
  // and one that lands in access logs. The platform's door: nothing mints a
  // token for it (the runbook and the golden probe knock with the key), so
  // the key stays its credential on an edge that holds the secret too.
  const auth = await authorizeAdmin(request, "/api/diag", { platformKey: true });
  if (!auth.ok) return auth.response;
  return diagnosticReport();
});
