import type { Page } from "@playwright/test";
import { sequencesPreviewOf } from "../../packages/contracts/src/index";
import { apiGet } from "../workspace";

/**
 * Whether the suite's workspace draws Campaigns › Sequences (decision 0060): its preview on (`features.sequences_preview`,
 * read from GET settings as the page reads it, campaigns/sequences/shown.ts). While it is, Campaigns' home and a campaign's
 * drawer land on Sequences, so a spec of the home steps aside and sequences.spec.ts walks the page; while it is not,
 * sequences.spec.ts steps aside. Either way one of the two runs.
 */
export async function sequencesShownIn(page: Page): Promise<boolean> {
  const r = await apiGet(page, "/api/v1/settings");
  if (r.status() !== 200) return false;
  return sequencesPreviewOf(((await r.json()) as { data?: { config?: unknown } }).data?.config);
}

/** Why a spec of Campaigns' home steps aside. */
export const HOME_GIVES_WAY =
  "Campaigns' home lands on Sequences while its preview is on in this workspace: e2e/campaigns/sequences.spec.ts walks it";
