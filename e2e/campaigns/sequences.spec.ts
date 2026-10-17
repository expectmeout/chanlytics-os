import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { atRoute } from "../address";
import { apiGet } from "../workspace";
import {
  SEQUENCE_GROUPS,
  SEQUENCE_WORDS,
  historyFigures,
  historyIn,
  historySince,
  sequenceGroupOf,
  sequenceTwinOf,
  type SequenceHistoryDto,
  type SequencesPageDto,
} from "../../packages/contracts/src/index";

/**
 * Campaigns › Sequences (decision 0060), which is Campaigns: everything a workspace sends on its own as one list, a
 * sequence's record beside it on its three tabs, a run's address landing on its day of History, the old addresses landing
 * on it, and a new one started from what starts it, its composers over the page. Every count is read from the API's answer
 * and compared with what the page says; nothing is made, changed or sent here (no draft is asked for, so no model is
 * called).
 */
test.describe("Campaigns › Sequences on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  /** GET sequences, as the list reads it. */
  const readList = async (page: Parameters<typeof apiGet>[0]): Promise<SequencesPageDto> => {
    const r = await apiGet(page, "/api/v1/sequences");
    expect(r.status()).toBe(200);
    return ((await r.json()) as { data: SequencesPageDto }).data;
  };

  test("the list is the workspace's sequences, its counts the API's, and the home lands on it", async ({ page }) => {
    await page.goto("/#/campaigns");
    // Where the preview is on, Campaigns' home is the list (contracts sequenceLandingOf), the address replaced.
    await expect(page).toHaveURL(atRoute(/^campaigns\/sequences$/));
    await expect(page.getByTestId("sq-page")).toBeVisible();
    const list = await readList(page);
    if (list.sequences.length === 0) {
      await expect(page.getByTestId("sq-empty")).toBeVisible();
      await expect(page.getByTestId("sq-empty-new")).toBeVisible();
      return;
    }
    const rows = page.getByTestId("sq-rows");
    await expect(rows).toBeVisible();
    for (const s of list.sequences.slice(0, 6)) await expect(page.getByTestId(`sq-row-${s.id}`)).toContainText(s.name);
    // The groups and their figures are the list's own (the filter tabs became groups, #1667): what needs you first,
    // then by how each starts, each group's count beside its name, and no group with nothing in it.
    const counts = new Map<string, number>();
    for (const s of list.sequences) {
      const g = sequenceGroupOf(s, sequenceTwinOf(list.sequences, s));
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    for (const g of SEQUENCE_GROUPS) {
      const group = rows.getByRole("region", { name: SEQUENCE_WORDS.groups[g], exact: true });
      const n = counts.get(g) ?? 0;
      if (n === 0) await expect(group).toHaveCount(0);
      else await expect(group.locator(".sq-group-name .tally")).toHaveText(String(n));
    }
    // A search narrows the rows to the names that hold it.
    const first = list.sequences[0];
    if (!first) throw new Error("a sequence was listed and is gone");
    await page.getByTestId("sq-search").fill(first.name.slice(0, 4));
    await expect(page.getByTestId(`sq-row-${first.id}`)).toBeVisible();
  });

  test("the old Playbooks and Sent addresses land on Sequences, and a campaign's on its sequence", async ({ page }) => {
    for (const old of ["/#/outbound", "/#/playbooks", "/#/broadcasts"]) {
      await page.goto(old);
      await expect(page).toHaveURL(atRoute(/^campaigns\/sequences$/));
      await expect(page.getByTestId("sq-page")).toBeVisible();
    }
    const list = await readList(page);
    const moment = list.sequences.find((q) => q.starts === "moment" || q.starts === "list");
    test.skip(!moment, "this workspace has no sequence on a moment or a list");
    if (!moment) return;
    await page.goto(`/#/campaigns/moment:${moment.id}`);
    await expect(page).toHaveURL(atRoute(new RegExp(`^campaigns/sequences/${moment.id}$`)));
    await expect(page.getByTestId("sq-record")).toContainText(moment.name);
  });

  test("a sequence opens beside the list on its three tabs, each an address Back walks", async ({ page }) => {
    const list = await readList(page);
    test.skip(list.sequences.length === 0, "this workspace has no sequence to open");
    const s = list.sequences[0];
    if (!s) return;
    await page.goto("/#/campaigns/sequences");
    await page.getByTestId(`sq-row-${s.id}`).click();
    await expect(page).toHaveURL(atRoute(new RegExp(`^campaigns/sequences/${s.id}$`)));
    const record = page.getByTestId("sq-record");
    await expect(record).toContainText(s.name);
    // Steps: what starts it, each step, what stops it, said once as a schedule (#1681); a one-off on a date is its one
    // message and stops nowhere.
    await expect(record.getByTestId("sq-steps")).toBeVisible();
    await expect(record.getByTestId("sq-starts")).toBeVisible();
    if (s.starts === "date") await expect(record.getByTestId("sq-stops")).toHaveCount(0);
    else await expect(record.getByTestId("sq-stops")).toBeVisible();
    await expect(record.getByTestId("sq-step-1")).toBeVisible();
    // People (Leads for leads), then History, each its own address.
    await record.getByRole("tab", { name: new RegExp(s.starts === "leads" ? "^Leads" : "^People") }).click();
    await expect(page).toHaveURL(atRoute(new RegExp(`^campaigns/sequences/${s.id}/people$`)));
    await expect(record.getByTestId("sq-people").or(record.locator(".sq-none"))).toBeVisible();
    await record.getByRole("tab", { name: /^History/ }).click();
    await expect(page).toHaveURL(atRoute(new RegExp(`^campaigns/sequences/${s.id}/history$`)));
    await expect(record.getByTestId("sq-history").or(record.locator(".sq-none"))).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(atRoute(new RegExp(`^campaigns/sequences/${s.id}/people$`)));
    await page.goBack();
    await expect(page).toHaveURL(atRoute(new RegExp(`^campaigns/sequences/${s.id}$`)));
  });

  test("History's figures are the batches' own counts over the last 30 days", async ({ page }) => {
    const list = await readList(page);
    const s = list.sequences.find((x) => x.last !== null);
    test.skip(!s, "no sequence here has sent anything yet");
    if (!s) return;
    const r = await apiGet(page, `/api/v1/sequences/${s.id}/history`);
    expect(r.status()).toBe(200);
    const history = ((await r.json()) as { data: SequenceHistoryDto }).data;
    await page.goto(`/#/campaigns/sequences/${s.id}/history`);
    const record = page.getByTestId("sq-record");
    await expect(record.getByTestId("sq-history")).toBeVisible();
    // Counted only where the first page reaches back past the period's first day; the page reads on until it does.
    const since = historySince("30", list.timezone, Date.now());
    const last = history.batches[history.batches.length - 1];
    test.skip(
      history.more && !!last && !!since && (last.run_for ?? "") >= since,
      "the period runs past the first page",
    );
    const sent = historyFigures(historyIn(history.batches, since, list.timezone)).find((f) => f.id === "sent");
    await expect(record.getByTestId("sq-figure-sent")).toContainText(sent?.value ?? "0");
    // A day opens in place, onto what came back and the door to its run (which the open day holds: the first of the two).
    const day = history.batches.find((b) => b.state === "sent");
    if (!day) return;
    await record.getByTestId(`sq-batch-${day.id}`).click();
    await expect(
      record.getByTestId(`sq-day-open-${day.id}`).or(record.getByTestId("sq-day-run")).first(),
    ).toBeVisible();
  });

  test("a run's address, as a bell row or Ask's card names it, lands on its sequence's History with that day open", async ({
    page,
  }) => {
    const list = await readList(page);
    const s = list.sequences.find((x) => x.last !== null);
    test.skip(!s?.last, "no sequence here has sent anything yet");
    if (!s?.last) return;
    await page.goto(`/#/broadcasts/run:${s.last.id}`);
    await expect(page).toHaveURL(atRoute(new RegExp(`^campaigns/sequences/${s.id}/history/${s.last.id}$`)));
    const record = page.getByTestId("sq-record");
    await expect(record.getByTestId(`sq-batch-${s.last.id}`)).toHaveAttribute("aria-expanded", "true");
    // Its sheet in Sent stays a door away, at an address no landing takes.
    await expect(record.getByTestId("sq-day-run").first()).toBeVisible();
  });

  test("New starts from what starts it; a date and leads open their own composers, and nothing is drafted here", async ({
    page,
  }) => {
    await page.goto("/#/campaigns/sequences/new");
    const pane = page.getByTestId("sq-new");
    await expect(pane).toBeVisible();
    // A moment is the default: the owner's line, and Draft it waits for one.
    await expect(pane.getByTestId("sq-new-words")).toBeVisible();
    await expect(pane.getByTestId("sq-new-draft")).toBeDisabled();
    // A date is the one-off composer's: it opens over Sequences, never over a page of its own, and closes back here.
    await pane.getByTestId("sq-new-on-date").click();
    await expect(pane.getByTestId("sq-new-open-date")).toBeVisible();
    await pane.getByTestId("sq-new-open-date").click();
    await expect(page).toHaveURL(atRoute(/^campaigns\/new$/));
    await expect(page.getByTestId("cmh-composer")).toBeVisible();
    await expect(page.getByTestId("sq-page")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(atRoute(/^campaigns\/sequences\/new$/));
    // Back is New again, on what starts it (the choice is not in the address yet, so it starts on a moment again).
    await expect(pane.getByTestId("sq-new-on-date")).toBeVisible();
    // Leads are the composer's on Write to leads.
    await pane.getByTestId("sq-new-on-leads").click();
    await expect(pane.getByTestId("sq-new-open-leads")).toBeVisible();
    // A list asks which list before the line can be drafted (its picker sits in the pane's body: the first of the two).
    await pane.getByTestId("sq-new-on-list").click();
    await expect(pane.getByTestId("sq-new-list").or(pane.locator(".sq-new-body")).first()).toBeVisible();
    await pane.getByTestId("sq-new-words").fill("Thank them and invite them back in a month");
    await expect(pane.getByTestId("sq-new-draft")).toBeDisabled();
  });
});
