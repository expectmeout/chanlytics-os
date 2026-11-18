import "server-only";

/**
 * A lead's own receptionist's page (decision 0079), read by its link's token on the service role: the person opening it
 * has no session, and the token is the only thing they hold. What it is drawn from: the preview's row (its state, its
 * clock, its chat), the preview workspace's name and look (0075's, as every link's page wears it, link-page.ts) and its
 * Business record, and the number on the lead the sender wrote to.
 *
 * A token that names nothing is no page (null): the proxy answers it Not found before the page renders
 * (public/page-gate.ts), and the page's own notFound() is the floor. A preview whose workspace is gone (ended, its lead
 * erased) still has a page, which says it ended.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPhoneDisplay, parseTenantConfig, type PreviewPageFacts } from "@chanlytics/contracts";
import { getTenantConfig } from "@chanlytics/db/workspace";
import { findLeadForPreview, findLeadPreviewByToken, type LeadPreviewRow } from "@chanlytics/db/campaigns";
import { listEndedRehearsalCalls } from "@chanlytics/db/facts";
import { logAndGoOn } from "@chanlytics/log";
import type { Database } from "@chanlytics/db/types";
import { linkPageDb, linkPageLookOf, NO_LOOK, type LinkPageLook } from "./link-page";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** What the page is drawn from, and the row its routes act on. */
interface PreviewPageRead {
  row: LeadPreviewRow;
  facts: PreviewPageFacts;
  look: LinkPageLook;
}

/** The preview workspace's record, or none where it cannot be read: the page says only what it knows. */
export async function previewProfileOf(db: Db, tenantId: TenantId): Promise<PreviewPageFacts["profile"]> {
  const row = await getTenantConfig(db, tenantId).catch(() => null);
  return parseTenantConfig(row?.config ?? null)?.brain?.profile ?? null;
}

/** What the page shows of the lead it was made from: its listing's number and its Google photo; none where it is gone. */
async function leadShownOf(db: Db, row: LeadPreviewRow): Promise<{ phone: string | null; photo: string | null }> {
  const lead = await findLeadForPreview(db, row.tenant_id, row.lead_id).catch(() => null);
  return { phone: formatPhoneDisplay(lead?.phone_e164 ?? null), photo: lead?.image_url ?? null };
}

/** The calls the page draws again on a visit after them: its newest few, as a preview's minutes allow. */
const CALLS_SHOWN = 3;

/** The preview's ended calls, or none where they cannot be read: the page is drawn without them, never refused. */
const endedCallsOf = (db: Db, tenantId: TenantId): Promise<NonNullable<PreviewPageFacts["calls"]>> =>
  listEndedRehearsalCalls(db, tenantId, CALLS_SHOWN).catch(logAndGoOn("reading a preview's ended calls", []));

/** The page's read for a token, or null where it names no preview. Throws where the database cannot be asked. */
export async function findPreviewPage(token: string, db: Db | null = linkPageDb()): Promise<PreviewPageRead | null> {
  if (!db) throw new Error("preview page: this deployment holds no service-role key");
  const row = await findLeadPreviewByToken(db, token);
  if (!row) return null;
  const ws = row.preview_tenant_id;
  const [look, profile, shown, calls] = ws
    ? await Promise.all([linkPageLookOf(db, ws), previewProfileOf(db, ws), leadShownOf(db, row), endedCallsOf(db, ws)])
    : [NO_LOOK, null, { phone: null, photo: null }, []];
  return {
    row,
    look,
    facts: {
      state: row.state,
      ends_at: row.ends_at,
      asked_count: row.asked_count,
      turns: row.turns,
      business: look.business ?? "",
      logo_url: look.logo_url,
      profile,
      phone_display: shown.phone,
      call_seconds: row.call_seconds,
      call_count: row.call_count,
      calls,
      photo_url: shown.photo,
    },
  };
}

/** Whether a token names a preview, for the proxy's question before the page renders. */
export async function previewNamed(token: string): Promise<boolean> {
  const db = linkPageDb();
  return !!db && !!(await findLeadPreviewByToken(db, token));
}
