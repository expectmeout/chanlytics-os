import { test, expect } from "@playwright/test";
import { signIn } from "./session";
import { motionSettled, pullHeld } from "./signals";
import { apiGet } from "./workspace";

/** A throwaway look at what the copy holds, removed before this branch lands. */
test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("reply box", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/inbox");
    await page.waitForLoadState("networkidle");
    const row = page.locator(".ix-thread").first();
    console.log("PROBE rows", await page.locator(".ix-thread").allInnerTexts());
    await row.click();
    const foot = page.locator(".ix-th-foot").first();
    await expect(foot).toBeVisible();
    const say = async (when: string) =>
      console.log(
        "PROBE",
        when,
        JSON.stringify(
          await page.evaluate(() => {
            const feet = [...document.querySelectorAll(".ix-th-foot")];
            const a = document.activeElement;
            const conv = document.querySelector(".ix-th-scroll");
            const at = (y: number) => {
              const el = document.elementFromPoint(195, y);
              return el ? `${el.tagName}.${String(el.className).slice(0, 40)}` : null;
            };
            return {
              feet: feet.map((f) => ({
                folded: f.getAttribute("data-folded"),
                h: Math.round(f.getBoundingClientRect().height),
                top: Math.round(f.getBoundingClientRect().top),
                cls: f.className,
              })),
              active: a ? `${a.tagName}.${String(a.className).slice(0, 40)}` : null,
              name: document.querySelector(".ix-th-name")?.textContent,
              conv: conv ? { h: conv.clientHeight, sh: conv.scrollHeight } : null,
              at400: at(400),
              at500: at(500),
            };
          }),
        ),
      );
    await say("opened");
    await motionSettled(page);
    await say("settled");
    const conversation = page.locator(".ix-th-scroll").first();
    await conversation.evaluate((el) => {
      el.scrollTop = 0;
    });
    const down = await pullHeld(page, 195, 400, 180);
    await say("pulled down");
    await down.letGo();
    await say("let go");
    await conversation.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const up = await pullHeld(page, 195, 500, -180);
    await say("pulled up");
    await up.letGo();
    await say("let go");
    await page.waitForTimeout(500);
    await say("half a second on");
  });
});

test("what the copy holds", async ({ page }) => {
  await signIn(page);
  await page.goto("/#/today");
  await page.waitForLoadState("networkidle");
  const list = (await (await apiGet(page, "/api/v1/sequences")).json()).data;
  console.log(
    "PROBE sequences",
    JSON.stringify(
      list.sequences.map((s: { name: string; starts: string; state: string; needs: unknown }) => ({
        n: s.name,
        s: s.starts,
        st: s.state,
        needs: s.needs,
      })),
    ),
  );
  await page.goto("/#/inbox");
  await page.waitForLoadState("networkidle");
  console.log("PROBE needs you", await page.getByTestId("inbox-runs-waiting").allInnerTexts());
  const toSend = page.getByTestId("brief-to-send");
  if (await toSend.count()) {
    await toSend.locator(".cl-attn-who").click();
    await expect(page.getByTestId("bc-to-send-body")).toBeVisible();
    await page.waitForLoadState("networkidle");
    console.log("PROBE to send", await page.getByTestId("bc-to-send-body").innerText());
  }
  await page.route("**/api/v1/setup?*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    console.log("PROBE setup", JSON.stringify({ google: body.data.google, business: body.data.business }));
    await route.fulfill({ response, json: body });
  });
  await page.goto("/#/start");
  await page.waitForLoadState("networkidle");
  console.log(
    "PROBE first run",
    await page.getByTestId("first-run").getAttribute("data-step"),
    await page.locator('[data-testid^="fr-rail-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid"))),
    await page.locator(".fr-rows").allInnerTexts(),
  );
});
