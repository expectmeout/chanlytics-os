import type { Page } from "@playwright/test";

/**
 * The active workspace, and a URL that names it.
 *
 * The mirror of `scoped()` in apps/dashboard/src/bridge/surface-data.ts,
 * which appends ?workspace= to every URL the client fetches. A spec calling
 * page.request directly skips that, and is then exercising a request the
 * product never makes — so getMemberContext refuses it (with-route.ts, `choose_workspace`) the
 * moment the account holds a second membership, with a 400 that reads as a
 * validation error and says nothing about the thing under test.
 *
 * The comment on scoped() records this exact bug being fixed in the client
 * once already. The suite is where it came back.
 */
export async function activeWorkspace(page: Page): Promise<string> {
  // The BROWSER's workspace: the one its address names (/w/<slug>/…), which every read the page makes names too
  // (client/api.ts), resolved by the server to its id as the page's own workspace read resolves it. Unnamed,
  // /api/v1/workspaces answers with the server's default — the oldest membership — and those differ the moment a spec
  // switches workspace through the menu, as workspace-create.spec.ts does: the write would be scoped to the workspace the
  // person just left. (The page held the id on its window until 25 Nov 2026, decision 0151; it holds it in its bundle now.)
  const slug = /^\/w\/([^/]+)/.exec(new URL(page.url(), "http://page.invalid").pathname)?.[1];
  const url = slug ? scoped("/api/v1/workspaces", decodeURIComponent(slug)) : "/api/v1/workspaces";
  const { data } = await (await page.request.get(url)).json();
  const id = data?.active_workspace_id ?? data?.workspaces?.[0]?.id;
  if (!id) throw new Error("no workspace for this account");
  return id;
}

/** scoped()'s rule, with the id passed in rather than read from the window. */
export function scoped(url: string, workspaceId: string): string {
  if (url.includes("workspace=")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}workspace=${encodeURIComponent(workspaceId)}`;
}

/** A read the way the app makes it, naming the workspace; options pass through. */
export async function apiGet(page: Page, url: string, options?: Parameters<Page["request"]["get"]>[1]) {
  return page.request.get(scoped(url, await activeWorkspace(page)), options);
}
