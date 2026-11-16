import "server-only";

/**
 * A preview's own receptionist changed: by the business it is for (decision 0079; contracts previews/theirs.ts: what it
 * teaches it and what it puts right, both in its record), and by its sender, who put the lead's name right (00631
 * lead_named; previews/named.ts withPreviewNamed). The one write to what AI is told on a preview. Through the settings' write
 * schema and its compare-and-swap, as its build writes it (the edge's previews/build.ts), so a receptionist the settings
 * would refuse is never kept, and two presses at once lose nothing: the one that lost reads again and writes once more.
 */
import {
  TenantConfigWriteSchema,
  parseTenantConfigResult,
  withStoredKeysKept,
  type BrainConfig,
  type BusinessProfile,
  type TenantId,
} from "@chanlytics/contracts";
import { getTenantConfig, putTenantConfig } from "@chanlytics/db/workspace";
import type { linkPageDb } from "../public/link-page";

type Db = NonNullable<ReturnType<typeof linkPageDb>>;

/** What a change came to: kept, refused by the rule itself ("full", or nothing to change), or a record that would not take it. */
export type PreviewChange = "changed" | "full" | "nothing" | "unwritten";

/** How often a write that lost its race is tried again: a second press landing between the read and the write. */
const WRITE_TRIES = 2;

/** What a change makes of the receptionist: it changed, its rule refused it ("full"), or there is nothing to change. */
type BrainChange = (brain: BrainConfig) => BrainConfig | "full" | null;

/** One read of the receptionist and one write of it changed; null where another write got there first. */
async function changeOnce(db: Db, tenantId: TenantId, change: BrainChange): Promise<PreviewChange | null> {
  const row = await getTenantConfig(db, tenantId);
  const parsed = row ? parseTenantConfigResult(row.config) : null;
  if (!row || !parsed?.ok || !parsed.config.brain) return "unwritten";
  const next = change(parsed.config.brain);
  if (next === "full") return "full";
  if (next === null) return "nothing";
  const config = TenantConfigWriteSchema.safeParse({ ...parsed.config, brain: next });
  if (!config.success) return "unwritten";
  const put = await putTenantConfig(db, tenantId, withStoredKeysKept(config.data, row.config), row.version, null);
  return put.ok ? "changed" : null;
}

/** The preview workspace's receptionist with `change` applied to it whole. */
export async function changePreviewBrain(db: Db, tenantId: TenantId, change: BrainChange): Promise<PreviewChange> {
  for (let attempt = 0; attempt < WRITE_TRIES; attempt += 1) {
    const outcome = await changeOnce(db, tenantId, change);
    if (outcome !== null) return outcome;
  }
  return "unwritten";
}

/** The preview workspace's record with `change` applied to its facts. */
export function changePreviewRecord(
  db: Db,
  tenantId: TenantId,
  change: (profile: BusinessProfile) => BusinessProfile | "full" | null,
): Promise<PreviewChange> {
  return changePreviewBrain(db, tenantId, (brain) => {
    const next = change(brain.profile ?? {});
    return next === "full" || next === null ? next : { ...brain, profile: next };
  });
}
