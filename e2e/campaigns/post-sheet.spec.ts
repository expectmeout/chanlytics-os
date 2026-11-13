import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import {
  CONTENT_SHEET_WORDS,
  FILE_WORDS,
  ON_INSTAGRAM,
  fileSaidOf,
  type ContentMadeDto,
} from "../../packages/contracts/src/index";
import { contentMade, madePost, postSet, type ContentMade } from "./content-made";

/**
 * Campaigns › Content, a made post's sheet ("Post it"), in a real browser. The node suite runs the sheet's state and each
 * door on a stub React (tests/content/page/a-piece-opens.test.mjs, tests/instagram, tests/files); none of it types into the
 * caption's box and presses Post the way a person does, and that is where this sheet went wrong (Ruben, 12 Nov 2026: words
 * typed just before Post went out as they were before). So this presses it as it ships.
 *
 * Nothing is posted and nothing is written: the page is answered from two made posts of this spec's own, and every press on
 * them is answered in the browser (content-made.ts). The suite's workspace needs no Instagram, no Google and no made post.
 */
const FRESH = 1;
const SET = 2;
const STORY = 1;

/** Two made posts: one posted nowhere yet, and one whose story is set for tomorrow on Instagram. */
function pieces() {
  return [
    madePost(FRESH, "saturdays-fill-first"),
    madePost(SET, "two-chairs-left", [postSet(STORY, "instagram", { kind: "story", hours: 30 })]),
  ];
}

/**
 * The piece opened as a person opens it, from Made: its tile on a desk, where its pane then stands beside the list, and its
 * row on a phone, which lists what was made and opens the viewer over it.
 */
async function openPiece(page: Page, piece: ContentMadeDto) {
  await page.goto("/#/campaigns/content");
  const tile = page.locator(`[data-tile="${piece.file.id}"]`).getByTestId("fl-tile");
  const row = page.getByTestId("cnv-line").filter({ hasText: fileSaidOf(piece.file.name) });
  await tile.or(row).first().click();
  await expect(page.getByTestId("cnv-piece")).toBeVisible();
}

/** The list of places, opened from where the piece stands. */
async function openPlaces(page: Page) {
  await page.getByTestId("cnv-status-open").click();
  await expect(page.getByTestId("cnv-compose")).toBeVisible();
}

const toast = (page: Page) => page.locator(".pp-toast .pp-toast-msg");

/** Where the sheet is one pane's body (a desk) and where it is a sheet over the picture (a phone, where this went wrong). */
const SCREENS = [
  { on: "a desk", size: null },
  { on: "a phone", size: { width: 390, height: 844 } },
] as const;

test.describe("Campaigns › Content, a made post's sheet", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  let made: ContentMade;
  let fresh: ContentMadeDto;
  let set: ContentMadeDto;
  let story: string;
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    const all = pieces();
    [fresh, set] = all as [ContentMadeDto, ContentMadeDto];
    story = set.posts[0]!.id;
    made = await contentMade(page, all);
  });
  // A read the page starts as a test ends finds its answer gone: that is nothing of the test's.
  test.afterEach(({ page }) => page.unrouteAll({ behavior: "ignoreErrors" }));

  for (const screen of SCREENS)
    test(`words typed just before Post go with it, to both places, while their own save is still on its way: ${screen.on}`, async ({
      page,
    }) => {
      if (screen.size) await page.setViewportSize(screen.size);
      await openPiece(page, fresh);
      await page.getByTestId("cnv-next").click();
      await expect(page.getByTestId("cnv-compose")).toBeVisible();
      await expect(page.getByTestId("cnv-switch-instagram")).toBeChecked();
      await expect(page.getByTestId("cnv-switch-google")).toBeChecked();

      // The box keeps its words as it is left, and that save is held here: Post is pressed before it has answered.
      const saves = made.holdCaptionSaves();
      // Not the words the post was made with, which the box opens holding: only what was typed says the press took it.
      const words = "Walk-ins are welcome this Saturday.";
      await expect(page.getByTestId("cnv-caption-box")).not.toHaveValue(words);
      await page.getByTestId("cnv-caption-box").fill(words);
      await page.getByTestId("cnv-compose-send").click();
      await page.getByTestId("cnv-post-ask-yes").click();

      await expect.poll(() => made.at("POST", "files/[id]/instagram").length).toBe(1);
      await expect.poll(() => made.at("POST", "files/[id]/google").length).toBe(1);
      expect(made.at("POST", "files/[id]/instagram")[0]?.body).toEqual({ as: "picture", caption: words });
      expect(made.at("POST", "files/[id]/google")[0]?.body).toEqual({ summary: words });
      saves.release();

      // One post to each place, whatever the box's own save did; and the piece says where it stands now.
      await expect(toast(page)).toBeVisible();
      await expect(page.getByTestId("cnv-status")).toBeVisible();
      expect(made.at("POST", "files/[id]/instagram")).toHaveLength(1);
      expect(made.at("POST", "files/[id]/google")).toHaveLength(1);
      expect(made.captionOf(fresh.file.id)).toBe(words);
    });

  test("a story alone goes with no words, says so, and the words typed are kept on the piece", async ({ page }) => {
    await openPiece(page, fresh);
    await page.getByTestId("cnv-next").click();
    await page.getByTestId("cnv-switch-google").click();
    await page.getByTestId("cnv-as-story").click();
    await expect(page.getByTestId("cnv-story-words")).toHaveText(ON_INSTAGRAM.storyNoCaption);

    const words = "Kept for the post that follows.";
    await page.getByTestId("cnv-caption-box").fill(words);
    await page.getByTestId("cnv-compose-send").click();
    await page.getByTestId("cnv-post-ask-yes").click();

    await expect.poll(() => made.at("POST", "files/[id]/instagram").length).toBe(1);
    expect(made.at("POST", "files/[id]/instagram")[0]?.body).toEqual({ as: "story" });
    expect(made.at("POST", "files/[id]/google")).toHaveLength(0);
    await expect.poll(() => made.captionOf(fresh.file.id)).toBe(words);
  });

  test("Change time moves the post that waits, itself, in one step", async ({ page }) => {
    await openPiece(page, set);
    await openPlaces(page);
    const row = page.getByTestId("cnv-place-instagram");
    await expect(row).toHaveAttribute("data-stands", "timed");
    const before = await page.getByTestId("cnv-place-said-instagram").innerText();

    await page.getByTestId("cnv-move-instagram").click();
    await expect(page.getByTestId("cnv-move")).toBeVisible();
    // Another time that day: the last the list offers, or the first where it is set for the last already.
    const time = page.getByTestId("bc-when-time");
    const was = (await time.innerText()).trim();
    await time.click();
    const options = page.getByRole("option");
    await expect(options.first()).toBeVisible();
    const last = options.last();
    await ((await last.innerText()).trim() === was ? options.first() : last).click();
    await page.getByTestId("cnv-move-yes").click();

    await expect.poll(() => made.at("PATCH", "files/[id]/posts").length).toBe(1);
    const moved = made.at("PATCH", "files/[id]/posts")[0]!;
    expect(moved.fileId).toBe(set.file.id);
    expect(moved.body.post_id).toBe(story);
    expect(Date.parse(String(moved.body.when))).toBeGreaterThan(Date.now());
    // The post itself moved: none was stopped, and no second one was set.
    expect(made.pressed.filter((p) => p.method !== "PATCH")).toEqual([]);
    await expect(toast(page)).toHaveText(/^Now set for .+ on Instagram\.$/);
    expect(CONTENT_SHEET_WORDS.places.moved("instagram", "x")).toBe("Now set for x on Instagram.");
    await expect(row).toHaveAttribute("data-stands", "timed");
    await expect(page.getByTestId("cnv-place-said-instagram")).not.toHaveText(before);
  });

  test("Don't post stops the post that waits, and Undo sets it again for its time", async ({ page }) => {
    await openPiece(page, set);
    await openPlaces(page);
    const row = page.getByTestId("cnv-place-instagram");
    await expect(row).toHaveAttribute("data-stands", "timed");

    await page.getByTestId("cnv-pull-instagram").click();
    await expect.poll(() => made.at("DELETE", "files/[id]/instagram").length).toBe(1);
    expect(made.at("DELETE", "files/[id]/instagram")[0]?.body).toEqual({ post_id: story });
    await expect(toast(page)).toHaveText(ON_INSTAGRAM.pulledFlash);
    await expect(row).not.toHaveAttribute("data-stands", "timed");

    await page.locator(".pp-toast").getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => made.at("POST", "files/[id]/instagram").length).toBe(1);
    const back = made.at("POST", "files/[id]/instagram")[0]!;
    expect(back.body.as).toBe("story");
    // At the time it was set for, to the second: the same post, put back.
    expect(Math.abs(Date.parse(String(back.body.when)) - (Date.now() + 30 * 3_600_000))).toBeLessThan(120_000);
    await expect(toast(page)).toHaveText(FILE_WORDS.restored);
    await expect(row).toHaveAttribute("data-stands", "timed");
  });
});
