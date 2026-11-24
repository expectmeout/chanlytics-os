/**
 * The edge's one call to the dashboard (00712; the content loop PRD's 12.4): a week a rung let AI approve, made by the
 * code the owner's press runs. Signed as the dashboard's own calls to the edge are (edge-token.ts): bound to the door's
 * path, the workspace and the exact body, valid for a minute. The dashboard verifies it with the secret the two already
 * share (EDGE_CALL_SECRET); without one, nothing is sent.
 *
 * No environment: the origin, the secret and the time limit are the caller's.
 */
import { signEdgeToken } from "./edge-token";

/** What the dashboard answered: its status, or 0 where no answer came in time. */
export interface DashboardAnswer {
  status: number;
  ok: boolean;
}

/** POST a declared door of the dashboard, signed for that door, that workspace and that body. */
export async function callDashboard(
  at: { origin: string; secret: string; path: string },
  call: { workspace: string; body: unknown; timeoutMs: number },
): Promise<DashboardAnswer> {
  const body = JSON.stringify(call.body);
  try {
    const res = await fetch(`${at.origin}${at.path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-edge-token": signEdgeToken(at.secret, at.path, { workspace: call.workspace, body }),
      },
      body,
      signal: AbortSignal.timeout(call.timeoutMs),
    });
    return { status: res.status, ok: res.ok };
  } catch {
    // No answer in time, or none at all: the caller's job is tried again by its ledger.
    return { status: 0, ok: false };
  }
}
