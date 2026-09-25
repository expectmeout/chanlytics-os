import { expect, type Page } from "@playwright/test";
import { apiGet } from "./workspace";

/**
 * The seed's search that stopped to ask (tooling/scripts/e2e-workspace.mjs, WAITING_SEARCH and WAITING_ROUND, which
 * own it). Restated rather than imported, as leads.spec.ts restates the Austin six: that file is ESM run by plain
 * node and a spec compiles to CJS. `waitingSearch` reads it back through the API and refuses a seed that drifted
 * from these words, so the two copies cannot quietly disagree.
 *
 * Nothing a spec does to it may answer it: an answer moves the round to running, which starts paid work. Every spec
 * that opens it watches the answer door and the Ask turn route with `refuseAnswers` and asserts neither was called.
 */
export const WAITING_SEARCH_NAME = "Pilates studios · Denver";
export const WAITING_QUESTION =
  "Most of the first 3 are franchise studios, which I'm leaving out. Is that what you meant?";
/** The three places the question is about, all left out (the seed's WAITING_LEADS). */
export const WAITING_PLACES = [
  "Mile High Reformer Co. LoDo",
  "Summit Pilates Cherry Creek",
  "Peak Core Pilates Highlands",
];

/** The waiting search as the page's own read answers it; fails on a seed that is not the committed one. */
export async function waitingSearch(page: Page): Promise<{ id: string; route: string }> {
  const res = await apiGet(page, "/api/v1/lead-searches");
  expect(res.status()).toBe(200);
  const searches = (await res.json()).data.searches as Array<{
    id: string;
    name: string;
    round: { state: string; question: { sentence: string } | null } | null;
  }>;
  const s = searches.find((x) => x.name === WAITING_SEARCH_NAME);
  expect(s, "the seed's waiting search is in the workspace").toBeTruthy();
  expect(s!.round?.state, "and it is waiting on the owner").toBe("waiting_on_owner");
  expect(s!.round?.question?.sentence).toBe(WAITING_QUESTION);
  // contracts leadQuestionRoute: the search, on the pile its question is about.
  return { id: s!.id, route: `clients/leads:s-${s!.id}:c-excluded` };
}

/**
 * Every request that would answer the search or spend, refused before it leaves the browser and counted: the answer
 * door (Yes, keep going / Include / Stop here / an approved amend), a new round (`more`), a new search, and a turn on
 * the Line. Reads (GET) pass. A spec that reads the waiting search ends with `expect(attempts).toEqual([])`.
 */
export async function refuseAnswers(page: Page): Promise<string[]> {
  const attempts: string[] = [];
  const refuse = async (route: Parameters<Parameters<Page["route"]>[1]>[0]) => {
    if (route.request().method() === "GET") return route.continue();
    attempts.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.abort();
  };
  // POST lead-searches (a new search) and its answer, stop and more doors; undo and a search's own read are not spend.
  await page.route(/\/api\/v1\/lead-searches(\/[^/?]+\/(answer|stop|more))?(\?|$)/, refuse);
  await page.route(/\/api\/v1\/ask(\?|$)/, refuse);
  return attempts;
}
