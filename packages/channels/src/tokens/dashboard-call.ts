/**
 * The edge's one call to the dashboard (00714; the content loop PRD's 12.4): a week a rung let AI approve, made by the
 * code the owner's press runs. Signed as the dashboard's own calls to the edge are (edge-token.ts): bound to the door's
 * path, the workspace and the exact body, valid for a minute. The dashboard verifies it with the secret the two already
 * share (EDGE_CALL_SECRET); without one, nothing is sent.
 *
 * No environment: the origin, the secret and the time limit are the caller's.
 */
import { fetchFromProvider } from "../shared/provider-fetch";
import { signEdgeToken } from "./edge-token";

/** What the dashboard answered: its status, or 0 where no answer came in time. */
export interface DashboardAnswer {
  status: number;
  ok: boolean;
}

/**
 * POST a declared door of the dashboard, signed for that door, that workspace and that body, through the one way out
 * (fetchFromProvider, as `dashboard`): always made, its time said under `out.dashboard`.
 */
export async function callDashboard(
  at: { origin: string; secret: string; path: string },
  call: { workspace: string; body: unknown; timeoutMs: number },
): Promise<DashboardAnswer> {
  const body = JSON.stringify(call.body);
  const res = await fetchFromProvider("dashboard", `${at.origin}${at.path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-edge-token": signEdgeToken(at.secret, at.path, { workspace: call.workspace, body }),
    },
    body,
    timeoutMs: call.timeoutMs,
    breaker: "count",
  });
  // No answer in time, or none at all, is status 0: the caller's job is tried again by its ledger.
  return { status: res.status, ok: res.outcome === "ok" };
}
