import { test, expect, type Locator, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { activeWorkspace, scoped, apiGet } from "../workspace";

/**
 * The conversation thread, in a real browser, in the nightly's own workspace.
 *
 * Every verb on the thread was tested from the inside and none from the page.
 * This drives them the way an operator does, on the one conversation
 * tooling/scripts/ops/e2e-workspace.mjs seeds: Robin Example, at a number set aside
 * for fiction, on a WhatsApp channel with no credentials.
 *
 * So the reply cannot leave. The job finds no wire, records the row `failed`,
 * opens a `send_failed` escalation and alerts the owner, and the owner's one
 * address is Resend's test inbox (the seed's header says why): nothing here
 * reaches a person or the platform's mailbox. The escalation is resolved before
 * the end, and afterAll resolves whatever a failed run left open and hands the
 * thread back, so the deadman never finds one two hours old.
 *
 * A quiet thread offers no Take over: the page offers it to a thread that is
 * waiting on a person and held by nobody, and a reply makes the thread yours.
 * So the thread is snoozed, which lets go of it and keeps what it was about
 * open, then woken, and then taken over from its own button.
 *
 * A write over the API carries the app's origin, as the app's own requests do
 * (steer.spec.ts), and names the workspace.
 */
const BASE = process.env.E2E_BASE_URL ?? "https://app.chanlytics.com";
const fromTheApp = { headers: { origin: new URL(BASE).origin } };

/** The seed's workspace and person (tooling/scripts/ops/e2e-workspace.mjs). */
const SLUG = "chanlytics-e2e";
const ROBIN = { name: "Robin Example", phone: "+12125550143" };
const ONLY_HERE =
  `this spec sends a reply, so it runs only in the nightly's own workspace (${SLUG}), on its seeded ` +
  `conversation with ${ROBIN.name}; tooling/scripts/ops/e2e-workspace.mjs --apply makes both`;

interface ThreadRead {
  conversation: {
    id: string;
    state: string;
    paused_until: string | null;
    assignee_user_id: string | null;
    assignee_is_me?: boolean;
  };
  messages: Array<{ id: string; sender: string; status: string | null }>;
}
interface EscalationRead {
  id: string;
  reason: string;
  details: string | null;
  conversation_id: string;
}

/** The workspace this session is in and Robin's conversation there, or null anywhere else. */
async function theSeededThread(page: Page): Promise<{ ws: string; id: string } | null> {
  const ws = await activeWorkspace(page);
  const { data } = await (await page.request.get("/api/v1/workspaces")).json();
  const here = ((data?.workspaces ?? []) as Array<{ id: string; slug: string }>).find((w) => w.id === ws);
  if (here?.slug !== SLUG) return null;
  const { data: list } = await (await apiGet(page, "/api/v1/conversations")).json();
  const robin = ((list?.conversations ?? []) as Array<{ id: string; contact?: { phone_e164?: string | null } }>).find(
    (c) => c.contact?.phone_e164 === ROBIN.phone,
  );
  return robin ? { ws, id: robin.id } : null;
}

async function readThread(page: Page, id: string): Promise<ThreadRead> {
  const res = await apiGet(page, `/api/v1/conversations/${id}`);
  expect(res.status(), "the thread reads").toBe(200);
  return (await res.json()).data as ThreadRead;
}

async function openEscalations(page: Page): Promise<EscalationRead[]> {
  const res = await apiGet(page, "/api/v1/escalations?state=open");
  expect(res.status(), "the open escalations read").toBe(200);
  return (await res.json()).data.escalations as EscalationRead[];
}

/**
 * The page as the server holds it now. A change the job or the API made does
 * not repaint a tab that read before it, and moving between hash routes is
 * not a load; a blank page in between is.
 */
async function freshLoad(page: Page, hash: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`/${hash}`);
  await page.waitForLoadState("networkidle");
}

/**
 * Robin's thread, opened from the bucket the page files it under. The pane
 * shows a thread of the selected bucket only, so finding the row there is
 * itself what the page says about the thread. Retried while a load settles.
 * Since #852 Needs you holds what waits on you and nothing else: a thread you
 * hold, by a reply or a take-over, is Handled however it is flagged.
 */
async function openRobin(page: Page, bucket: "Handled" | "Needs you" | "Snoozed"): Promise<Locator> {
  const list = page.locator(".ix-list");
  const pane = page.locator(".ix-thread-pane");
  await expect(async () => {
    await list.getByRole("button", { name: new RegExp(`^${bucket}`) }).click({ timeout: 5_000 });
    await list.locator(".ix-thread").filter({ hasText: ROBIN.name }).click({ timeout: 5_000 });
    await expect(pane.locator(".ix-th-name")).toContainText(ROBIN.name, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  return pane;
}

/**
 * The thread as the seed left it, whatever a run did: a reply still inside its
 * grace window called back, one the job already holds allowed to land, every
 * open escalation in the workspace resolved, and the thread handed back.
 */
async function putItBack(page: Page, ws: string, id: string): Promise<void> {
  for (const m of (await readThread(page, id)).messages) {
    // A 409 means the job has it already; the wait below lets it land.
    if (m.sender === "human" && m.status === "queued")
      await page.request.post(scoped(`/api/v1/messages/${m.id}/cancel-send`, ws), fromTheApp);
  }
  await expect
    .poll(async () => (await readThread(page, id)).messages.filter((m) => m.status === "queued").length, {
      timeout: 60_000,
      intervals: [2_000],
    })
    .toBe(0);
  for (const e of await openEscalations(page)) {
    const res = await page.request.post(scoped(`/api/v1/escalations/${e.id}/resolve`, ws), fromTheApp);
    expect(res.status(), `resolving the escalation ${e.id}`).toBe(200);
  }
  const { conversation: c } = await readThread(page, id);
  if (c.state !== "open" || c.paused_until || c.assignee_user_id) {
    const res = await page.request.post(scoped(`/api/v1/conversations/${id}/hand-back`, ws), fromTheApp);
    expect(res.status(), "handing the thread back").toBe(200);
  }
}

test.describe("The thread, in the nightly's own workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // A run that fails midway leaves nothing open for the deadman to find.
  test.afterAll(async ({ browser }) => {
    if (!HAVE_SESSION) return;
    test.setTimeout(120_000);
    const context = await browser.newContext({ baseURL: BASE });
    try {
      const page = await context.newPage();
      await signIn(page);
      const seeded = await theSeededThread(page);
      if (seeded) await putItBack(page, seeded.ws, seeded.id);
    } finally {
      await context.close();
    }
  });

  test("a reply the number cannot carry fails in the page's words, its escalation is resolved, and the thread is taken over and handed back", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const seeded = await theSeededThread(page);
    expect(seeded, ONLY_HERE).not.toBeNull();
    const { ws, id } = seeded!;
    // A run cut off before its afterAll leaves nothing for this one.
    await putItBack(page, ws, id);

    const words = `Checking in from the nightly run, ${new Date().toISOString()}`;
    let messageId = "";
    let escalationId = "";

    await test.step("the seeded thread is quiet: the receptionist answered and nobody asked for a person", async () => {
      await freshLoad(page, "#/inbox");
      const pane = await openRobin(page, "Handled");
      await expect(pane.getByText(/Answered by the receptionist/)).toBeVisible();
    });

    await test.step("a reply written in the composer is on its way, and the thread is now yours", async () => {
      const pane = await openRobin(page, "Handled");
      // The field by its name: its placeholder names the channel a reply goes out on ("WhatsApp to …").
      await pane.getByLabel(`Reply to ${ROBIN.name}`).fill(words);
      const replied = page.waitForResponse(
        (r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/api/v1/conversations/${id}/reply`,
      );
      await pane.getByRole("button", { name: /^Send/ }).click();
      const receipt = (await (await replied).json()).data as { message_id: string; status: string };
      expect(receipt.status, "queued through its grace window, never sent from the request").toBe("queued");
      messageId = receipt.message_id;
      await expect(page.getByText(/reply on its way/)).toBeVisible();
      const bubble = pane.locator(".tl-msg").filter({ hasText: words });
      await expect(bubble).toContainText("by you");
      await expect(bubble).toContainText("Sending");
      // A reply takes the thread: the receptionist steps back for the person who wrote.
      await expect(pane.getByText(/You have it/)).toBeVisible();
    });

    await test.step("the number has no credentials: the send fails, and the thread says so in its own words", async () => {
      await expect
        .poll(async () => (await readThread(page, id)).messages.find((m) => m.id === messageId)?.status, {
          timeout: 90_000,
          intervals: [3_000],
        })
        .toBe("failed");
      await expect
        .poll(async () => (await openEscalations(page)).filter((e) => e.conversation_id === id).map((e) => e.reason), {
          timeout: 30_000,
          intervals: [2_000],
        })
        .toEqual(["send_failed"]);
      const [opened] = (await openEscalations(page)).filter((e) => e.conversation_id === id);
      expect(opened.details, "the cause in words, not an HTTP status").toContain(
        "the WhatsApp number is not connected",
      );
      escalationId = opened.id;

      await freshLoad(page, "#/inbox");
      // Yours since the reply, so Handled (#852), with the failure said on the thread itself.
      const pane = await openRobin(page, "Handled");
      await expect(pane.locator(".tl-msg").filter({ hasText: words })).toContainText("Didn't send");
      const flag = pane.getByText(/Flagged for a human/);
      await expect(flag).toContainText("Reply failed to deliver");
      await expect(flag).toContainText("the WhatsApp number is not connected");
      await expect(pane.getByText(/The reply never reached them/)).toBeVisible();
    });

    await test.step("the decision fits the screen: the banner's words keep their width, every control stays on the pane, the Inbox ends where the screen does, and the thread opens at its newest entry, at 1280, on a short window, at 1024 and on a phone", async () => {
      for (const size of [
        { width: 1280, height: 800 },
        { width: 1280, height: 480 },
        { width: 1024, height: 768 },
        { width: 375, height: 812 },
      ]) {
        await page.setViewportSize(size);
        await freshLoad(page, `#/inbox/th-${id}`);
        const pane = page.locator(".ix-thread-pane");
        // The thread is yours since the reply: the state bar (IxState, ix-yours) carries the decision and its words
        // (I1), never the take banner beside it; the old take and owned divs draw only for a thread that is not real.
        await expect(pane.getByTestId("ix-yours")).toBeVisible();
        // Measured, not asked: toBeVisible passes a box an overflow has cut to nothing.
        const fit = await pane.evaluate((el) => {
          const edge = el.getBoundingClientRect();
          const words = el.querySelector(".ix-state-says")?.getBoundingClientRect();
          const inside = [...el.querySelectorAll(".ix-state-acts .btn, .ix-th-actions .btn")].every((b) => {
            const r = b.getBoundingClientRect();
            return r.width === 0 || (r.left >= edge.left - 1 && r.right <= edge.right + 1);
          });
          // The person gets the header, not a sliver of it: the name column was 35px at 1024 (I3). Measured on the
          // column, since the name and number inside it are only as wide as their own letters -- 156px for this one.
          const name = el.querySelector(".ix-th-head-main")?.getBoundingClientRect();
          // The list and the thread end at the screen's edge and scroll inside it. The grid had columns and no row,
          // so its one row grew to the taller of the two: the list never scrolled and Send sat below the fold.
          const list = document.querySelector(".ix-list")?.getBoundingClientRect();
          return {
            words: !!words && words.width >= Math.min(240, edge.width * 0.6),
            inside,
            name: !!name && name.width >= Math.min(240, edge.width * 0.6),
            height: edge.bottom <= window.innerHeight + 1 && (!list || list.bottom <= window.innerHeight + 1),
          };
        });
        expect(fit, `at ${size.width}x${size.height}`).toEqual({ words: true, inside: true, name: true, height: true });
        // The thread opens at its newest entry: it opened at the oldest, and on a phone the words to answer were two
        // scrolls down.
        await expect
          .poll(
            () =>
              pane.evaluate((el) => {
                const scroller = el.querySelector(".ix-th-scroll")?.getBoundingClientRect();
                const all = el.querySelectorAll(".ix-timeline > *");
                const last = all.length ? all[all.length - 1].getBoundingClientRect() : null;
                return !scroller || !last || (last.bottom <= scroller.bottom + 1 && last.bottom > scroller.top);
              }),
            { message: `the newest entry on screen at ${size.width}x${size.height}` },
          )
          .toBe(true);
      }
      await page.setViewportSize({ width: 1280, height: 720 });
    });

    await test.step("Today says the reply never reached them: the thread is yours since the reply, so the recap carries it, not the queue", async () => {
      await freshLoad(page, "#/today");
      const queue = page.getByTestId("today-queue");
      await expect(queue).toBeVisible();
      // One rule (standing.ts): a thread you took by replying is yours, not the queue's, escalation or not; the
      // Inbox lists it under Handled as yours (#852), Today's queue does not repeat it. What Today
      // must never be quiet about is the failure itself: the recap's warning line, with the door to the thread.
      await expect(queue.locator(".cl-attn-row").filter({ hasText: ROBIN.name })).toHaveCount(0);
      const failed = page
        .getByTestId("today-recap")
        .locator(".brief-beat")
        .filter({ hasText: /failed to deliver/ });
      await expect(failed).toHaveCount(1);
      await expect(failed).toContainText("the customer got no answer");
      await expect(failed.getByRole("button", { name: /See the thread/ })).toBeVisible();
    });

    await test.step("snoozed, the thread lets go of the person holding it and keeps the request; woken, it waits for someone", async () => {
      await freshLoad(page, "#/inbox");
      let pane = await openRobin(page, "Handled");
      // Snooze is in the thread's menu: the header had it as a button too, beside the menu that held it.
      await pane.getByRole("button", { name: "Actions", exact: true }).click();
      await pane.getByRole("menuitem", { name: "Snooze" }).click();
      await expect(page.getByText(/snoozed until/)).toBeVisible();
      pane = await openRobin(page, "Snoozed");
      await expect(pane.getByText(/still waiting for you/)).toBeVisible();
      await pane.getByRole("button", { name: /Wake now/ }).click();
      await expect(page.getByText(/back in the queue/)).toBeVisible();
      pane = await openRobin(page, "Needs you");
      await expect(pane.getByRole("button", { name: "I'll answer this" })).toBeVisible();
    });

    await test.step("taken over from the thread: the receptionist is paused and the thread is yours", async () => {
      let pane = await openRobin(page, "Needs you");
      await pane.getByRole("button", { name: "I'll answer this" }).click();
      await expect(page.getByText(/the receptionist is paused/)).toBeVisible();
      // Taken over, it is yours: Handled (#852).
      pane = await openRobin(page, "Handled");
      await expect(pane.getByText(/You have it/)).toBeVisible();
      const { conversation: c } = await readThread(page, id);
      expect(c.state).toBe("needs_human");
      expect(Date.parse(c.paused_until ?? ""), "paused into the future").toBeGreaterThan(Date.now());
      expect(c.assignee_is_me).toBe(true);
      // Taking a thread over leaves what it was about open.
      expect((await openEscalations(page)).map((e) => e.id)).toEqual([escalationId]);
    });

    await test.step("the escalation is resolved as the app resolves it, and none is left open", async () => {
      // The page offers Done for a call-back only; for a reply that failed its
      // one way is a hand-back, which is a verb of its own. So the route, as
      // the app calls it.
      const res = await page.request.post(scoped(`/api/v1/escalations/${escalationId}/resolve`, ws), fromTheApp);
      expect(res.status()).toBe(200);
      expect((await res.json()).data.state).toBe("resolved");
      expect(await openEscalations(page), "no escalation open in the workspace").toEqual([]);

      await freshLoad(page, "#/today");
      const queue = page.getByTestId("today-queue");
      await expect(queue).toBeVisible();
      await expect(queue.getByTestId("queue-handoff").filter({ hasText: ROBIN.name })).toHaveCount(0);

      await freshLoad(page, "#/inbox");
      const pane = await openRobin(page, "Handled");
      await expect(pane.getByText(/Flagged for a human/)).toHaveCount(0);
      // Resolving what the thread was about does not hand it back: it is still yours.
      await expect(pane.getByText(/You have it/)).toBeVisible();
    });

    await test.step("handed back from the thread: the receptionist answers again, and the words that never left still say so", async () => {
      let pane = await openRobin(page, "Handled");
      await pane.getByRole("button", { name: /^Hand back to/ }).click();
      await expect(page.getByText(/handed back/)).toBeVisible();
      pane = await openRobin(page, "Handled");
      await expect(pane.getByText(/Answered by the receptionist/)).toBeVisible();
      await expect(pane.locator(".tl-msg").filter({ hasText: words })).toContainText("Didn't send");
      const t = await readThread(page, id);
      expect(t.conversation.state).toBe("open");
      expect(t.conversation.paused_until).toBeNull();
      expect(t.messages.find((m) => m.id === messageId)?.status).toBe("failed");
    });
  });
});
