import { test, expect, type Page, type Route } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { activeWorkspace, scoped } from "../workspace";

/**
 * Files, from a photo to a post (decision 0099), on a real workspace: a photo goes up through real Storage, a press asks for a post,
 * the card is changed and kept for real, a phone's sheet is handed the picture inside the press, a new version keeps another file, and
 * Undo takes one back. Ask's answer alone is scripted, since a real turn costs money: the card it carries, and everything after it,
 * is the real thing. A photo's look runs as it does for anyone, at about $0.0005 a night.
 */
const BASE = process.env.E2E_BASE_URL ?? "https://app.chanlytics.com";
const fromTheApp = { headers: { origin: new URL(BASE).origin } };
const HEADLINE = "Open this Saturday";
const CHANGED = "Open late this Saturday";
const VERSION = "Open early this Saturday";

/** A photo no one has kept before: every run's is its own, or the library says it is already here. */
async function aPhotoOfItsOwn(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 900;
    const draw = canvas.getContext("2d");
    if (!draw) throw new Error("no canvas");
    for (let i = 0; i < 400; i += 1) {
      draw.fillStyle = `hsl(${Math.random() * 360} 55% ${25 + Math.random() * 50}%)`;
      draw.fillRect(Math.random() * 1200, Math.random() * 900, 40 + Math.random() * 200, 40 + Math.random() * 200);
    }
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "";
  });
  return Buffer.from(base64, "base64");
}

/** Ask's answer: what a turn streams, with a real card on it. An id that is no row's asks nothing of the server when it is pressed. */
function askAnswers(fileId: string): string {
  const said = "Here it is, from your photo.";
  const now = new Date().toISOString();
  const lines = [
    { t: "thread", id: "11111111-2222-4333-8444-555555555555", title: HEADLINE },
    {
      t: "final",
      message: {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: said,
        at: now,
        atMs: Date.now(),
        citations: [],
        followups: [],
        navigate: null,
        language: "en",
        ungrounded: false,
        tools: ["files.view"],
        latencyMs: 10,
        rounds: 1,
        failed: false,
        answer: {
          v: 2,
          form: "structured",
          say: { headline: said, detail: "" },
          show: { figures: [], items: [], breakdown: null, list: null, chart: null },
          do: { open: null, next: [] },
          language: "en",
        },
        proposals: [
          {
            id: `card-${Date.now()}`,
            kind: "post",
            needs: "partner",
            title: `Post: ${HEADLINE}`,
            summary: "From your photo. Comes in portrait, square and story.",
            payload: {
              file_id: fileId,
              line: HEADLINE,
              over: "E2E",
              under: null,
              book: false,
              words_at: "bottom",
              voice: "modern",
              layout: "over",
              language: "en",
              people_agreed: false,
            },
            undo: "Undo",
            made_at: now,
          },
        ],
      },
    },
  ];
  return `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
}

test.describe("Files, from a photo to a post", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.setTimeout(180_000);

  test("a press makes a post; it changes where it stands, shares inside the press, keeps a new version, and Undo takes one back", async ({
    page,
  }) => {
    // What a phone offers: a desktop's Chromium has no sheet to hand a picture to. `isActive` is the point: Safari refuses a share
    // that has left the tap, and a read before it is what loses one.
    await page.addInitScript(() => {
      const shared: { name: string; active: boolean }[] = [];
      Object.assign(window, { __shared: shared });
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: { files?: File[] }) => {
          shared.push({ name: data.files?.[0]?.name ?? "", active: navigator.userActivation.isActive });
        },
      });
    });
    await signIn(page);
    const made: string[] = [];
    page.on("response", async (res) => {
      const { pathname } = new URL(res.url());
      if (pathname !== "/api/v1/files/post" || res.request().method() !== "POST" || !res.ok()) return;
      const said = (await res.json().catch(() => null)) as { data?: { file_id?: string } } | null;
      if (said?.data?.file_id) made.push(said.data.file_id);
    });
    await page.goto("/#/admin/files");
    await expect(page.getByTestId("rec-card-files")).toBeVisible({ timeout: 30_000 });
    const workspace = await activeWorkspace(page);
    let photoId = "";

    try {
      // Up it goes, three steps: the door, real Storage, and the server's proof.
      const proven = page.waitForResponse(
        (res) => /\/api\/v1\/files\/[^/]+\/done/.test(res.url()) && res.request().method() === "POST",
        { timeout: 60_000 },
      );
      await page.getByTestId("fl-picker").setInputFiles({
        name: `e2e-${Date.now()}.jpg`,
        mimeType: "image/jpeg",
        buffer: await aPhotoOfItsOwn(page),
      });
      const done = await proven;
      expect(done.ok(), "the photo arrived").toBeTruthy();
      photoId = ((await done.json()) as { data: { file_id: string } }).data.file_id;

      // It stays where it landed through the read that ends the run: a first add once went back to saying the page held nothing.
      await expect(page.getByTestId("fl-tile").first(), "the photo stands on the grid").toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId("fl-empty"), "and the page never says it holds nothing").toHaveCount(0);

      // Said by a person, over whatever the look says of a picture of coloured blocks: a post is made from what shows a place.
      const said = await page.request.patch(scoped(`/api/v1/files/${photoId}`, workspace), {
        data: { shows: "storefront", who_in_it: "no_one" },
        ...fromTheApp,
      });
      expect(said.ok(), "what a person says of it").toBeTruthy();

      // Ask's answer is scripted; what it is asked is not, and a card's writes have no row to land on.
      const asked: { text?: string; scope?: { kind?: string; id?: string } }[] = [];
      await page.route(/\/api\/v1\/ask(\?|$)/, async (route: Route) => {
        if (route.request().method() !== "POST") return route.continue();
        asked.push(route.request().postDataJSON());
        return route.fulfill({
          status: 200,
          contentType: "application/x-ndjson; charset=utf-8",
          body: askAnswers(photoId),
        });
      });
      await page.route(/\/api\/v1\/ask\/(?!warm)/, async (route: Route) =>
        route.request().method() === "GET"
          ? route.continue()
          : route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"data":{}}' }),
      );

      // The press: the sheet goes, Ask comes with the photo in hand, and asks.
      await page.goto(`${new URL(page.url()).pathname}?do=file:${photoId}`);
      await expect(page.getByTestId("fl-sheet")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("fl-make-post").click();
      await expect(page.getByTestId("fl-sheet")).toBeHidden();
      await expect(page.getByTestId("ask-real")).toBeVisible();
      const card = page.getByTestId("ask-post");
      await expect(card).toBeVisible();
      expect(asked.at(0)?.text).toBe("Make a post from this photo");
      expect(asked.at(0)?.scope).toMatchObject({ kind: "file", id: photoId });
      const picture = card.getByTestId("post-picture");
      await expect(picture).toHaveAttribute("src", /^blob:/, { timeout: 30_000 });
      const firstPicture = await picture.getAttribute("src");

      // It changes where it stands, and the picture answers.
      await card.getByTestId("post-edit-open").click();
      const redrawn = page.waitForResponse((res) => res.url().includes("/api/v1/files/post/preview") && res.ok());
      await card.getByTestId("post-line").fill(CHANGED);
      await redrawn;
      await expect.poll(() => picture.getAttribute("src"), { timeout: 30_000 }).not.toBe(firstPicture);
      await expect(page.getByTestId("ask-card").filter({ hasText: CHANGED })).toBeVisible();
      await card.getByTestId("post-layout-band").click();
      await expect(card.getByTestId("post-layout-band")).toHaveAttribute("aria-pressed", "true");
      await card.getByTestId("post-shape-square").click();
      await expect(card.getByTestId("post-frame")).toHaveAttribute("data-shape", "square");
      await card.getByTestId("post-shape-portrait").click();

      // Words that can't be drawn hold Save, and say why.
      const approve = page.getByTestId("ask-card-approve");
      await card.getByTestId("post-line").fill("See www.example.com");
      await expect(card.getByTestId("post-refused")).toContainText("Links", { timeout: 30_000 });
      await expect(approve).toBeDisabled();
      await card.getByTestId("post-line").fill(CHANGED);
      await expect(approve).toBeEnabled({ timeout: 30_000 });

      // Kept for real: the picture on screen stays, and the way out comes.
      const kept = page.waitForResponse(
        (res) => new URL(res.url()).pathname === "/api/v1/files/post" && res.request().method() === "POST",
        { timeout: 60_000 },
      );
      await approve.click();
      expect((await kept).ok(), "the Save").toBeTruthy();
      await expect(card.getByTestId("post-download")).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => made.length).toBe(1);

      // A phone's sheet is handed the picture inside the press.
      const share = card.getByTestId("post-share");
      await expect(share).toBeEnabled({ timeout: 30_000 });
      await share.click();
      const shared = await page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared);
      expect(shared).toEqual([
        { name: expect.stringMatching(/^open-late-this-saturday.*-portrait\.jpg$/), active: true },
      ]);

      // In Files it says where it came from, and a new version starts from what it was asked to be.
      await card.getByTestId("post-open-files").click();
      const sheet = page.getByTestId("fl-sheet");
      await expect(sheet).toBeVisible({ timeout: 30_000 });
      await expect(sheet.getByTestId("fl-made-from")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("fl-new-version").click();
      const version = sheet.getByTestId("post-version");
      await expect(version.getByTestId("post-line")).toHaveValue(CHANGED);
      await expect(version.getByTestId("post-layout-band")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("post-save-new"), "nothing has changed yet").toBeDisabled();
      await version.getByTestId("post-line").fill(VERSION);
      await expect(page.getByTestId("post-save-new")).toBeEnabled({ timeout: 30_000 });
      await page.getByTestId("post-save-new").click();
      await expect.poll(() => made.length, { timeout: 60_000 }).toBe(2);
      await expect(sheet.locator("h2")).toContainText("Open early this saturday", { timeout: 30_000 });
      expect(made.at(0), "the first is left as it was").not.toBe(made.at(1));
      const first = await page.request.get(scoped(`/api/v1/files/${made.at(0) ?? ""}`, workspace));
      expect(first.ok(), "and is still there").toBeTruthy();

      // Where it came from opens that photo, whichever shelf is on show.
      await sheet.getByTestId("fl-made-from").click();
      await expect(page.getByTestId("fl-make-post"), "a photo's sheet: its press").toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("fl-made-from"), "and it came from nothing").toHaveCount(0);

      // Undo, on the card that made the first: it is gone, and the version made from it stays.
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      // Ask stood beside the sheet on a desk; a press of its door while open would close it.
      if (!(await card.isVisible())) await page.getByTestId("tb-ask").click();
      await expect(card).toBeVisible();
      await page.getByTestId("ask-card").getByRole("button", { name: "Undo", exact: true }).click();
      await expect
        .poll(async () => (await page.request.get(scoped(`/api/v1/files/${made.at(0) ?? ""}`, workspace))).status(), {
          timeout: 30_000,
        })
        .toBe(404);
      const version2 = await page.request.get(scoped(`/api/v1/files/${made.at(1) ?? ""}`, workspace));
      expect(version2.ok(), "the version stays").toBeTruthy();
    } finally {
      for (const id of [...made, photoId].filter(Boolean)) {
        const gone = await page.request.delete(scoped(`/api/v1/files/${id}`, workspace), fromTheApp);
        expect([200, 404], `${id} cleared`).toContain(gone.status());
      }
    }
  });
});
