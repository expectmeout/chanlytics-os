import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { activeWorkspace, apiGet } from "../workspace";

/**
 * A message's words stay inside its bubble, and an email's inside its card, on a phone and on a desk.
 *
 * A body is sized by what it holds, and a link is drawn whole on one line, cut to the width it is given
 * (inbox.css .tl-msg-link). Twice a body was given no width to be cut to: a WhatsApp bubble with a booking link drew its
 * body 552px wide in a 259px bubble, and an email took the width of its longest link, folded out of sight or not, so
 * every line of it ran past the card and was cut at its edge (2 Nov 2026). Sam Example's thread in the nightly's
 * workspace holds an automated email whose tracking link is longer than a phone's line, and Robin's a WhatsApp reply
 * with a booking link (tooling/scripts/ops/e2e-workspace.mjs). Read-only: nothing here writes.
 */
const SLUG = "chanlytics-e2e";
const SAM = { name: "Sam Example", phone: "+12125550145" };

/** Sam's conversation in the nightly's own workspace, or null in any other. */
async function samsThread(page: Page): Promise<string | null> {
  const ws = await activeWorkspace(page);
  const { data } = await (await page.request.get("/api/v1/workspaces")).json();
  const here = ((data?.workspaces ?? []) as Array<{ id: string; slug: string }>).find((w) => w.id === ws);
  if (here?.slug !== SLUG) return null;
  const { data: list } = await (await apiGet(page, "/api/v1/conversations")).json();
  const sam = ((list?.conversations ?? []) as Array<{ id: string; contact?: { phone_e164?: string | null } }>).find(
    (c) => c.contact?.phone_e164 === SAM.phone,
  );
  return sam ? sam.id : null;
}

/** Each drawn message whose body reaches past its bubble or card, by how far, and the page's own sideways overflow. */
async function overflowsOf(page: Page) {
  return page.evaluate(() => {
    const past = [...document.querySelectorAll(".ix-thread-pane .tl-msg")].flatMap((el) => {
      const bubble = el.querySelector(".tl-msg-bubble");
      const body = el.querySelector(".tl-msg-body");
      if (!bubble || !body) return [];
      const reach = Math.round(body.getBoundingClientRect().right - bubble.getBoundingClientRect().right);
      const cut = body.scrollWidth - body.clientWidth;
      return reach > 1 || cut > 1 ? [{ text: (body.textContent ?? "").slice(0, 60), reach, cut }] : [];
    });
    const page = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    return { past, page };
  });
}

for (const [where, viewport] of [
  ["a phone", { width: 390, height: 844 }],
  ["a desk", { width: 1440, height: 900 }],
] as const) {
  test.describe(`Words stay in their bubbles, on ${where}`, () => {
    test.skip(!HAVE_SESSION, WHY_SKIPPED);
    test.use({ viewport });

    test("an email with a long link keeps every line inside its card", async ({ page }) => {
      await signIn(page);
      await page.goto("/#/inbox");
      const id = await samsThread(page);
      test.skip(!id, `this spec reads ${SAM.name}'s seeded thread in the nightly's own workspace (${SLUG})`);
      await page.goto(`/#/inbox/th-${id}`);
      // The thread opens at its newest; the email is three days back, drawn as its top is scrolled near (earlier.ts).
      await expect(async () => {
        await page.evaluate(() => {
          for (const el of document.querySelectorAll(".ix-th-scroll")) el.scrollTop = 0;
          window.scrollTo(0, 0);
        });
        expect(await page.locator(".ix-thread-pane .tl-email .tl-msg-link").count()).toBeGreaterThan(0);
      }).toPass({ timeout: 30_000 });
      const { past, page: sideways } = await overflowsOf(page);
      expect(past, "no message's words reach past its bubble or card").toEqual([]);
      expect(sideways, "and the page scrolls nowhere sideways").toBeLessThanOrEqual(1);
    });
  });
}
