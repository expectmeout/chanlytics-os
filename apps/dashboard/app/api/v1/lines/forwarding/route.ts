import { write, workspace } from "@/server/route";
import { setLineForwarding } from "@/server/connections/forwarding";

/**
 * POST /api/v1/lines/forwarding — {number, carrier, mode, test_from?}: keep
 * the number you have and forward its calls to the receptionist's line.
 * Owners only. The RPC keeps one forwarded row per workspace, instructed
 * until a test call proves it. The body is the route's own to read:
 * normalizePhone decides what a number is, and each refusal is a sentence.
 *
 * The handle is setLineForwarding in src/server/connections/forwarding.ts: the route is its declaration (who may, how
 * often), the verb is what it does.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lines_forwarding",
  handle: ({ ctx, req, member }) => setLineForwarding(ctx, req, member),
});
