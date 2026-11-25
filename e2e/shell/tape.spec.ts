import { test, expect, type Response } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";

/**
 * A tape of the copy's answers: what each page's reads were answered with, kept with the run's report.
 *
 * Two builds of the app can only be compared page by page when both draw the same answers, and a page drawn from kept
 * answers asks no database anything. Walks of the live app for such comparisons, from several desks at once, helped
 * take production's database down on 25 November 2026 (docs/runbook.md, "See a real page"). So the answers are kept
 * here instead, where nothing is production's: on the copy of the app the nightly runs on its own stack
 * (nightly-e2e.yml, the `whole` job), from the run's own workspace. A manual run of that workflow with
 * `specs=e2e/shell/tape.spec.ts` makes a tape in a few minutes and reads nothing else.
 *
 * It is declared ONLY where the app under test is on this machine: against a deployment (a preview, production) there
 * is no test here at all, so no run can walk a live app with it.
 *
 * What is kept: every GET a page made of the app's own API and of the database's doors, the first answer of each,
 * under the method and the address without its origin (`db:` and the path for the database's doors, whatever host the
 * build names). The page's clock is held at the moment the walk began, and that moment is kept, so a draw from the
 * tape asks for the same days. It is one attachment on the report, `tape.json`, with the pages that did not go quiet
 * in time under `notReady`.
 */
const ON_THIS_MACHINE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(process.env.E2E_BASE_URL ?? "");

/** Every page of the frame, by its address under the workspace: the walk the stylesheet work was measured on. */
const TAPED_PAGES = [
  "today",
  "inbox",
  "conversations",
  "people",
  "people/leads",
  "people/pipeline",
  "calendar",
  "campaigns",
  "campaigns/messages",
  "campaigns/sequences",
  "campaigns/content",
  "campaigns/content:library",
  "campaigns/content:week",
  "campaigns/ads",
  "campaigns/forms",
  "campaigns/sequences/new",
  "reports",
  "reports/people",
  "reports/receptionist",
  "reports/campaigns",
  "live",
  "settings/workspace",
  "settings/hours",
  "settings/receptionist",
  "settings/integrations",
  "settings/team",
  "settings/billing",
  "settings/outreach",
  "start",
];

const DATABASE_DOORS = ["/rest/v1/", "/auth/v1/", "/storage/v1/"];

interface TapedAnswer {
  key: string;
  status: number;
  type: string;
  body: string;
}

/** The key an answer is kept under, or null for a request that is not one of a page's reads. */
function tapeKeyOf(response: Response): string | null {
  const request = response.request();
  if (request.method() !== "GET") return null;
  const at = new URL(request.url());
  if (DATABASE_DOORS.some((door) => at.pathname.startsWith(door))) return `GET db:${at.pathname}${at.search}`;
  return at.pathname.startsWith("/api/") ? `GET ${at.pathname}${at.search}` : null;
}

if (ON_THIS_MACHINE) {
  test.describe("a tape of the copy's answers", () => {
    test.skip(!HAVE_SESSION, WHY_SKIPPED);

    test("every page's reads are kept with the report, each page loaded once", async ({ page }, testInfo) => {
      test.setTimeout(20 * 60_000);
      const began = new Date();
      const answers = new Map<string, TapedAnswer>();
      const reading = new Set<Promise<void>>();
      page.context().on("response", (response) => {
        const key = tapeKeyOf(response);
        if (!key || answers.has(key)) return;
        // Kept by listening, never by standing in the way: an answer that never ends is simply not kept.
        const read = response.body().then(
          (body) => {
            if (answers.has(key)) return;
            answers.set(key, {
              key,
              status: response.status(),
              type: response.headers()["content-type"] ?? "application/json",
              body: body.toString("utf8"),
            });
          },
          () => {},
        );
        reading.add(read);
        void read.finally(() => reading.delete(read));
      });

      await signIn(page);
      await page.clock.setFixedTime(began);
      await page.goto("/#/today");
      await page.waitForURL(/\/w\/[^/]+\/today/, { timeout: 30_000 });
      const slug = new URL(page.url()).pathname.split("/")[2] ?? "";

      const notReady: string[] = [];
      const keptBy: Record<string, number> = {};
      for (const address of TAPED_PAGES) {
        const before = answers.size;
        await page.goto(`/w/${slug}/${address}`);
        // Settled is quiet twice, a moment apart: a read a page makes just after its first ones is part of it. Not the
        // frame's own "ready" measure, which a page whose clock is held never shows: the held clock stands in for the
        // page's performance entries too, and every page waited out its twenty seconds (run 45536570064).
        const quiet = () => page.waitForLoadState("networkidle", { timeout: 20_000 });
        const settled = await quiet()
          .then(() => page.waitForTimeout(1_500))
          .then(quiet)
          .then(
            () => true,
            () => false,
          );
        if (!settled) notReady.push(address);
        await Promise.all([...reading]);
        keptBy[address] = answers.size - before;
      }

      const who = (() => {
        try {
          const said = JSON.parse(answers.get(`GET /api/v1/workspaces?workspace=${slug}`)?.body ?? "{}") as {
            data?: { user?: { id?: string; email?: string } };
            user?: { id?: string; email?: string };
          };
          return said.data?.user ?? said.user ?? null;
        } catch {
          return null;
        }
      })();
      await testInfo.attach("tape.json", {
        contentType: "application/json",
        body: JSON.stringify({
          tape: 1,
          meta: { slug, clock: began.toISOString(), user: who, pages: TAPED_PAGES, keptBy, notReady },
          answers: [...answers.values()],
        }),
      });

      expect(answers.size, "the pages' reads were kept").toBeGreaterThan(TAPED_PAGES.length);
      expect(notReady, "every page went quiet within 20 s").toEqual([]);
    });
  });
}
