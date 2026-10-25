import { expect, type Page } from "@playwright/test";
import { atRoute } from "../address";

/**
 * A run that went is read as its campaign's report in Reports, over the day it went (apps/dashboard/src/surfaces/campaigns/
 * broadcasts/run.tsx RunToReport, #1776): its old address, its home under its sequence and a History day all land there,
 * the run's own screen taking its place in the history. A run still going or waiting for an OK keeps its own screen.
 */
export async function expectRunsReport(page: Page, sequenceId: string): Promise<void> {
  const day = String.raw`\d{4}-\d\d-\d\d`;
  await expect(page).toHaveURL(atRoute(new RegExp(`^reports/campaigns:${day}~${day}:seq:${sequenceId}$`)));
  await expect(page.getByTestId("rpt-cmp-figures")).toBeVisible();
}
