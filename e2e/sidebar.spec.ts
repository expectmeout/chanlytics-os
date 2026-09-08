import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * The sidebar's chrome on a real workspace: the account menu with who you
 * are and the theme, the workspace menu, the rail on ⌘B that survives a
 * reload, the shortcuts sheet on "?", and no floating pill anywhere. The
 * device's preferences are put back afterwards.
 */
test.describe("sidebar on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  test("account menu, theme, workspace menu, rail, sheet", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".brief")).toBeVisible();
    const prefsBefore = await page.evaluate(() => localStorage.getItem("chanlytics-os-prefs"));
    try {
      await expect(page.locator(".bridge-pill")).toHaveCount(0);

      // The account menu: who you are, the role, the theme.
      await page.getByTestId("sb-account").click();
      const me = page.getByTestId("sb-account-menu");
      await expect(me).toBeVisible();
      // The address this run signed in as, not a literal: session.ts mints the
      // session for E2E_USER_EMAIL, and asserting anything else is a spec
      // checking a different person than the one it logged in.
      await expect(me.getByTestId("sb-me")).toContainText(process.env.E2E_USER_EMAIL!);
      await expect(me.getByTestId("sb-me-role")).toHaveText("Owner");
      await expect(me.getByTestId("sb-signout")).toHaveText("Sign out");
      await me.getByTestId("sb-theme-light").click();
      await expect(page.locator(".app-root")).toHaveAttribute("data-theme", "light");
      await me.getByTestId("sb-theme-dark").click();
      await expect(page.locator(".app-root")).toHaveAttribute("data-theme", "dark");
      await page.keyboard.press("Escape");
      await expect(me).toHaveCount(0);

      // The workspace menu: the one being viewed, checked, with the role.
      await page.getByTestId("sb-workspace").click();
      const ws = page.getByTestId("sb-workspace-menu");
      await expect(ws).toBeVisible();
      const items = ws.getByTestId("sb-ws-item");
      // However many there are, exactly one is current. An absolute count
      // assumed this account owned a single workspace; self-serve sign-up
      // makes a second one ordinary, and workspace-create.spec.ts makes one
      // on purpose. What the sidebar promises is that one is marked, and it
      // is the one whose role is shown.
      await expect(items.first()).toBeVisible();
      const active = ws.locator('[data-testid="sb-ws-item"][aria-checked="true"]');
      await expect(active).toHaveCount(1);
      await expect(active).toContainText("Owner");
      await page.keyboard.press("Escape");

      // The rail: ⌘B folds it, the preference survives a reload, ⌘B opens it.
      await page.keyboard.press("Control+b");
      await expect(page.getByTestId("sidebar")).toHaveClass(/collapsed/);
      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(page.getByTestId("sidebar")).toHaveClass(/collapsed/);
      await page.getByTestId("sb-collapse").click();
      await expect(page.getByTestId("sidebar")).not.toHaveClass(/collapsed/);

      // The sheet on "?", closed on Escape.
      await page.keyboard.press("?");
      await expect(page.getByTestId("shortcuts-sheet")).toBeVisible();
      await expect(page.getByTestId("shortcuts-sheet")).toContainText("Ask Chanlytics");
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("shortcuts-sheet")).toHaveCount(0);
    } finally {
      await page.evaluate((p) => { if (p === null) localStorage.removeItem("chanlytics-os-prefs"); else localStorage.setItem("chanlytics-os-prefs", p); }, prefsBefore);
    }
  });
});
