import { test, expect, type Page, type Route } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { activeWorkspace, scoped } from "../workspace";

/**
 * Files, from a photo to a post (decision 0099), on a real workspace: a photo goes up through real Storage, a press asks for a post,
 * the card is changed and kept for real, a phone's sheet is handed the picture inside the press, a change takes the post's place,
 * and Undo takes each back. Ask's answer alone is scripted, since a real turn costs money: the card it carries, and everything after
 * it, is the real thing. A photo's look runs as it does for anyone, at about $0.0005 a night.
 *
 * Settings › Files is Campaigns › Content's Library now (the content redesign's stage 2, 11 Nov 2026): the library is drawn in
 * Content's list pane (`campaigns/content:library`), and a file opens in Content's pane beside it, where Files' sheet was.
 */
/** Content's Library, where Settings › Files' old address lands too (contracts retiredRouteOf). */
const LIBRARY = "/#/campaigns/content:library";
const BASE = process.env.E2E_BASE_URL ?? "https://app.chanlytics.com";
const fromTheApp = { headers: { origin: new URL(BASE).origin } };
const HEADLINE = "Open this Saturday";
const CHANGED = "Open late this Saturday";
const VERSION = "Open early this Saturday";
/** The rows that chose how a post looks (its layout, its type) and its shape: drawn nowhere a person changes a post now. */
const LOOK_CHOICES = '[data-testid^="post-layout"], [data-testid^="post-voice"], [data-testid^="post-shape"]';

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

/**
 * A clip no one has kept before (stage B): three seconds of moving colour with a tone, recorded in the browser as a phone's own
 * camera would hand one over (MediaRecorder, WebM), so every run's is its own.
 */
async function aClipOfItsOwn(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const draw = canvas.getContext("2d");
    if (!draw) throw new Error("no canvas");
    const hue = Math.random() * 360;
    const audio = new AudioContext();
    const tone = audio.createOscillator();
    tone.frequency.value = 330 + Math.random() * 220;
    const out = audio.createMediaStreamDestination();
    tone.connect(out);
    tone.start();
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...out.stream.getAudioTracks()]);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    let frame = 0;
    const paint = setInterval(() => {
      frame += 1;
      draw.fillStyle = `hsl(${(hue + frame * 3) % 360} 60% 45%)`;
      draw.fillRect(0, 0, 640, 360);
      draw.fillStyle = "#fff";
      draw.fillRect((frame * 7) % 640, 140, 80, 80);
    }, 33);
    recorder.start(250);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    recorder.stop();
    await stopped;
    clearInterval(paint);
    tone.stop();
    await audio.close();
    const bytes = new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
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

  test("a press makes a post; it changes where it stands, shares inside the press, a change takes its place, and Undo takes each back", async ({
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
    await page.goto(LIBRARY);
    await expect(page.getByTestId("cnv-library")).toBeVisible({ timeout: 30_000 });
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

      // The press, from the photo open in Content's pane (read afresh, with what was said of it): Ask comes with the photo in
      // hand, and asks.
      await page.goto(`${new URL(page.url()).pathname}:${photoId}`);
      const pane = page.getByTestId("cnv-piece");
      await expect(pane).toBeVisible({ timeout: 30_000 });
      await expect(pane.getByTestId("cnv-next")).toHaveText("Make a post", { timeout: 30_000 });
      await pane.getByTestId("cnv-next").click();
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
      // Its words alone: how a post looks is Ask's to choose, as it chose it when it made the post, and it comes in every
      // shape, so the card offers no row of layouts and none of shapes (Ruben, 12 Nov 2026: no rows of presets). It drew
      // both here, and this pressed them, until then.
      await expect(card.getByTestId("post-edit")).toBeVisible();
      await expect(card.locator(LOOK_CHOICES)).toHaveCount(0);
      await expect(card.getByTestId("post-frame")).toHaveAttribute("data-shape", "portrait");

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

      // Open in Content, it says what it was made from, and a change starts from what it was asked to be: its words alone
      // there too.
      await card.getByTestId("post-open-files").click();
      await expect(pane).toBeVisible({ timeout: 30_000 });
      // Ask stands over the right of a desk's page, and that is where Content draws the piece it opened: a file's sheet came
      // over Ask while the library was Settings › Files' own, and the pane does not (a file opens in Content's pane since 12
      // Nov 2026, #2268, and a press on the pane was Ask's to take from then on). Its door closes it, as a person would to
      // reach the pane.
      await page.getByTestId("tb-ask").click();
      await expect(card).toBeHidden();
      // What it was made from is the photo itself, drawn small among the piece's facts (the content canvas, #2281): Files'
      // sheet had a press there that opened the photo, and the pane draws its picture.
      const facts = pane.getByTestId("cnv-facts");
      await expect(facts).toContainText("Made from", { timeout: 30_000 });
      await expect(facts.locator(`img[src*="/api/v1/files/${photoId}/view"]`)).toHaveCount(1);
      // Change it is the pane's own pencil, beside its lead (Ruben, 12 Nov 2026: one way to change a piece), not More's.
      await pane.getByTestId("cnv-change").click();
      const version = pane.getByTestId("post-version");
      await expect(version.getByTestId("post-line")).toHaveValue(CHANGED);
      await expect(version.locator(LOOK_CHOICES)).toHaveCount(0);
      await expect(page.getByTestId("post-save-new"), "nothing has changed yet").toBeDisabled();
      await version.getByTestId("post-line").fill(VERSION);
      await expect(page.getByTestId("post-save-new")).toBeEnabled({ timeout: 30_000 });
      await page.getByTestId("post-save-new").click();
      await expect.poll(() => made.length, { timeout: 60_000 }).toBe(2);
      // The new one opens in its place: the pane's title names it.
      await expect(pane.locator(".cm-pane-name")).toContainText("Open early this saturday", { timeout: 30_000 });
      // The post is out nowhere yet, so the change takes its place rather than standing as a twin beside it (Ruben, 12 Nov
      // 2026: a typo fixed left two): a file of its own is kept, and then the first is taken away. Until then this read
      // "a new version keeps another file", and looked for the first still there.
      const statusOf = async (id: string | undefined) =>
        (await page.request.get(scoped(`/api/v1/files/${id ?? ""}`, workspace))).status();
      expect(made.at(0), "the change is a file of its own").not.toBe(made.at(1));
      // "Changed." is said once the first is taken away (piece-presses.tsx usePieceDrafts), and lasts a few seconds: the
      // pointer rests on its Undo, which holds it, while the two are looked at.
      const changed = page.locator(".pp-toast").filter({ hasText: "Changed." });
      await expect(changed).toBeVisible({ timeout: 30_000 });
      const undoTheChange = changed.getByRole("button", { name: "Undo" });
      await undoTheChange.hover();
      expect(await statusOf(made.at(0)), "the first is taken away").toBe(404);
      expect(await statusOf(made.at(1)), "the change stands").toBe(200);

      // Undo, on the toast that said it changed: the first is back where it was, and the change is let go.
      await undoTheChange.click();
      await expect.poll(() => statusOf(made.at(0)), { timeout: 30_000 }).toBe(200);
      await expect.poll(() => statusOf(made.at(1)), { timeout: 30_000 }).toBe(404);
      await expect(pane.locator(".cm-pane-name")).toContainText("Open late this saturday", { timeout: 30_000 });

      // Undo, on the card that made the post: it is gone.
      // Ask was closed to reach the pane; its door opens it again on the turn it held (open, a press would close it).
      if (!(await card.isVisible())) await page.getByTestId("tb-ask").click();
      await expect(card).toBeVisible();
      await page.getByTestId("ask-card").getByRole("button", { name: "Undo", exact: true }).click();
      await expect.poll(() => statusOf(made.at(0)), { timeout: 30_000 }).toBe(404);
    } finally {
      for (const id of [...made, photoId].filter(Boolean)) {
        const gone = await page.request.delete(scoped(`/api/v1/files/${id}`, workspace), fromTheApp);
        expect([200, 404], `${id} cleared`).toContain(gone.status());
      }
    }
  });
});

/**
 * A video, for real (decision 0099, stage B): a three-second clip goes up through Stream over tus, Stream's webhook makes it a
 * file, its tile carries its length, and its pane in Content holds Stream's player; then it is deleted, which frees its minutes at Stream
 * at once. A run costs a fraction of a stored minute and a few thousandths of a cent of hearing. Only where the workspace takes
 * videos (`features.video_preview`): elsewhere Add offers photos alone, and this says so.
 *
 * Behind E2E_PAID_VIDEO=1, as a real model turn is behind E2E_PAID_MODEL and a real search behind E2E_PAID_LEADS: the clip is
 * reserved at Stream by the edge, and the nightly's whole suite runs on a copy whose edge is a stand-in that refuses every
 * call (tooling/scripts/e2e-harness/edge-stub.mjs), with no Stream behind it. There the journey can only fail, and it made
 * every night red from the day it was written: a skip the ceiling counted while the copy's workspace took no videos (7 to 10
 * Nov 2026), then "the reservation at Stream" refused once the seed turned them on (#2225). Where the edge is real, the
 * switch runs it, and a workspace that takes no videos there is a skip the ceiling counts.
 */
const PAID_VIDEO = process.env.E2E_PAID_VIDEO === "1";
const WHY_NO_VIDEO =
  "a real clip goes up at Stream through the real edge, which a copy's stand-in is not: set E2E_PAID_VIDEO=1 to run it";

test.describe("Files, a video", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.setTimeout(300_000);

  test("a clip goes up through Stream, is made ready with its length, plays in its pane, and is deleted", async ({
    page,
  }) => {
    test.skip(!PAID_VIDEO, WHY_NO_VIDEO);
    await signIn(page);
    await page.goto(LIBRARY);
    await expect(page.getByTestId("cnv-library")).toBeVisible({ timeout: 30_000 });
    const accepts = (await page.getByTestId("fl-picker").getAttribute("accept")) ?? "";
    test.skip(!accepts.includes("video/"), "this workspace does not take videos (features.video_preview is off)");
    const workspace = await activeWorkspace(page);
    let videoId = "";
    try {
      const started = page.waitForResponse(
        (res) => new URL(res.url()).pathname === "/api/v1/files/start" && res.request().method() === "POST",
        { timeout: 60_000 },
      );
      const proven = page.waitForResponse(
        (res) => /\/api\/v1\/files\/[^/]+\/done/.test(res.url()) && res.request().method() === "POST",
        { timeout: 120_000 },
      );
      await page.getByTestId("fl-picker").setInputFiles({
        name: `e2e-${Date.now()}.webm`,
        mimeType: "video/webm",
        buffer: await aClipOfItsOwn(page),
      });
      const start = await started;
      expect(start.ok(), "the reservation at Stream").toBeTruthy();
      videoId = ((await start.json()) as { data: { id: string } }).data.id;
      expect((await proven).ok(), "the clip went up").toBeTruthy();

      // Stream's webhook makes it a file: the tile goes from being made ready to its poster with its length.
      await expect(page.getByTestId("fl-length").first(), "made ready, with its length").toBeVisible({
        timeout: 180_000,
      });
      await expect(page.getByTestId("fl-length").first()).toHaveText(/^0:0[2-4]$/);

      // Its pane holds Stream's player, under a token for this session.
      await page.goto(`${new URL(page.url()).pathname}:${videoId}`);
      const pane = page.getByTestId("cnv-piece");
      await expect(pane).toBeVisible({ timeout: 30_000 });
      await expect(pane.getByTestId("fl-player")).toHaveAttribute("src", /cloudflarestream\.com\/.+\/iframe/, {
        timeout: 30_000,
      });
      await expect(pane.getByTestId("cnv-next"), "a ready video offers a post, drawn from one moment of it").toHaveText(
        "Make a post",
      );
      await expect(pane.getByTestId("cnv-save"), "and its own file stays with whoever sent it").toHaveCount(0);
    } finally {
      if (videoId) {
        const gone = await page.request.delete(scoped(`/api/v1/files/${videoId}`, workspace), fromTheApp);
        expect([200, 404], `${videoId} cleared`).toContain(gone.status());
      }
    }
  });
});
