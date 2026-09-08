import type { Page } from "@playwright/test";

/**
 * The active workspace, and a URL that names it.
 *
 * The mirror of `scoped()` in apps/dashboard/src/legacy-bridge/surface-data.ts,
 * which appends ?workspace= to every URL the client fetches. A spec calling
 * page.request directly skips that, and is then exercising a request the
 * product never makes — so `requireRole` refuses it (with-route.ts:180) the
 * moment the account holds a second membership, with a 400 that reads as a
 * validation error and says nothing about the thing under test.
 *
 * The comment on scoped() records this exact bug being fixed in the client
 * once already. The suite is where it came back.
 */
export async function activeWorkspace(page: Page): Promise<string> {
  const { data } = await (await page.request.get("/api/v1/workspaces")).json();
  const id = data?.activeWorkspaceId ?? data?.workspaces?.[0]?.id;
  if (!id) throw new Error("no workspace for this account");
  return id;
}

/** scoped()'s rule, with the id passed in rather than read from the window. */
export function scoped(url: string, workspaceId: string): string {
  if (url.includes("workspace=")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}workspace=${encodeURIComponent(workspaceId)}`;
}
