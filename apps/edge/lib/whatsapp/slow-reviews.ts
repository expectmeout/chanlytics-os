/**
 * A message WhatsApp has been checking for over a day, asked about again (the WhatsApp notices plan, step 4; Ruben chose
 * "ask again, then say so", 16 Nov 2026). WhatsApp most often answers in minutes and sometimes in a day, by a notice to
 * the webhook; a notice that never came left a message saying "Being checked" for days, and nobody asked.
 *
 * On the six-hourly visit to the workspaces' WhatsApp numbers (api/cron/channel-quality.ts), each version WhatsApp holds
 * that has been in review past a day (contracts REVIEW_SLOW_MS) is asked of WhatsApp by its id, with its workspace's own
 * key. A decision WhatsApp made goes through the webhook's own door (waba-events.ts handleWabaChange): the row takes it,
 * a warning it answers is mended, and the owner is told as on any day; the event it keeps says it was asked again. One
 * still in review, or under a word the webhook does not take, is told to Chanlytics' own people once (the operator pager,
 * its memory read first), in the words Ruben approved; the owner is not emailed, and the message's pages say "Taking
 * longer than usual" (contracts reviewIsSlow). A sample nobody sent has no id and is not asked.
 *
 * Bounded by the visit's time: no message is asked after the visit's yield point, so the sweep's sum (one Graph read, one
 * notice, the writes) holds as it does for a number (ops-hygiene.test.mjs), and what is left is first in line next time.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_TIMEZONE,
  DbFailure,
  REVIEW_SLOW_MS,
  SLOW_REVIEW_WORDS,
  asTenantId,
  clockDate,
  clockTime,
  languageName,
  templateTitle,
  type TenantId,
} from "@chanlytics/contracts";
import { listSlowReviews } from "@chanlytics/db/campaigns";
import { findWhatsAppAccount } from "@chanlytics/db/channels";
import { findOperatorPage } from "@chanlytics/db/ops";
import type { Database } from "@chanlytics/db/types";
import { findWorkspaceName, findWorkspaceZoneStatus } from "@chanlytics/db/workspace";
import { errField, type Logger } from "../shared/log.js";
import { getWaCredentialsForTenant } from "../shared/tenant-runtime.js";
import { getTemplate } from "./meta-templates.js";
import { decidesTemplate, findNotifications, handleWabaChange } from "./waba-events.js";

/** At most this many messages are asked in one visit, the oldest first: the rest are next visit's. */
const MAX_SLOW = 20;

/** The subject of the one page about a message still in review, as Ruben approved it. */
const SLOW_SUBJECT = "WhatsApp has been checking a message for over a day";

/** What one visit did: every message listed is decided, still in review (told now or before), unreadable, or left. */
interface SlowReviewCounts {
  slow: number;
  decided: number;
  still: number;
  told: number;
  unreadable: number;
  left: number;
}

interface SlowReviewPorts {
  db: SupabaseClient<Database>;
  log: Logger;
  now: () => number;
  /** When the visit began, and how long into it a message may still be asked: the door's YIELD_AT_MS. */
  started: number;
  yieldAtMs: number;
  /** The operator pager (shared/alerts/page-operator.ts): it keeps its own memory, which "once" is read from. */
  page: (key: string, subject: string, body: string) => Promise<unknown>;
  /** WhatsApp's read of one template, a workspace's key, and its notice addresses: the real ones unless a test hands others. */
  get?: typeof getTemplate;
  credentialsOf?: typeof getWaCredentialsForTenant;
  loadNotifications?: Parameters<typeof handleWabaChange>[3];
}

type SlowRow = NonNullable<Awaited<ReturnType<typeof listSlowReviews>>["data"]>[number];

/** The pager's key for one message: one page each, for good. */
const pageKey = (row: Pick<SlowRow, "id">): string => `whatsapp_review_slow:${row.id}`;

/** A workspace's WhatsApp key and account, or null where either is not to be had now. */
async function accessOf(ports: SlowReviewPorts, tenantId: TenantId): Promise<{ token: string; waba: string } | null> {
  const held = await (ports.credentialsOf ?? getWaCredentialsForTenant)(ports.db, tenantId);
  if (held.outcome !== "present") return null;
  const { data, error } = await findWhatsAppAccount(ports.db, tenantId);
  if (error) throw new DbFailure(error, "slow reviews: the workspace's WhatsApp account");
  return data?.waba_id ? { token: held.credentials.accessToken, waba: data.waba_id } : null;
}

/** The page's words, as Ruben approved them, with WhatsApp's own word where it is not "in review". */
async function pageWords(ports: SlowReviewPorts, row: SlowRow, word: string): Promise<string> {
  const tenantId = asTenantId(row.tenant_id);
  const [named, zoned] = await Promise.all([
    findWorkspaceName(ports.db, tenantId),
    findWorkspaceZoneStatus(ports.db, tenantId),
  ]);
  const tz = zoned.data?.timezone || DEFAULT_TIMEZONE;
  const since = Date.parse(row.updated_at);
  return [
    `${named.data?.name ?? "A workspace"} · “${templateTitle(row.name, row.title)}” (${languageName(row.language)}).`,
    `Sent to WhatsApp ${clockDate(since, tz, ports.now())}, ${clockTime(since, tz)}, still being checked.`,
    word === "PENDING" ? null : `WhatsApp's own word for it now: ${word}.`,
    `Its owner sees “${SLOW_REVIEW_WORDS.list}”.`,
    "Ask WhatsApp Manager, or send it again.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Chanlytics' people told of a message still in review, once: true where this visit told them. */
async function tellOnce(ports: SlowReviewPorts, row: SlowRow, word: string): Promise<boolean> {
  const key = pageKey(row);
  const seen = await findOperatorPage(ports.db, key);
  if (seen.error) throw new DbFailure(seen.error, "slow reviews: whether its people were told");
  if (seen.data) return false;
  await ports.page(key, SLOW_SUBJECT, await pageWords(ports, row, word));
  return true;
}

/** One message asked of WhatsApp: what came of it. */
async function askOne(ports: SlowReviewPorts, row: SlowRow): Promise<"decided" | "still" | "told" | "unreadable"> {
  const access = row.meta_id ? await accessOf(ports, asTenantId(row.tenant_id)) : null;
  if (!access || !row.meta_id) return "unreadable";
  const answer = await (ports.get ?? getTemplate)(access.token, row.meta_id);
  if (!answer.ok) return "unreadable";
  const word = answer.template.status.toUpperCase();
  if (!decidesTemplate(word)) return (await tellOnce(ports, row, word)) ? "told" : "still";
  const change = {
    field: "message_template_status_update",
    value: {
      event: word,
      message_template_id: row.meta_id,
      message_template_name: row.name,
      message_template_language: row.language,
      message_template_category: answer.template.category,
      reason: answer.template.rejected_reason ?? "NONE",
      asked_again: true,
    },
  };
  await handleWabaChange(
    ports.db,
    access.waba,
    change,
    ports.loadNotifications ?? ((t) => findNotifications(ports.db, t)),
  );
  return "decided";
}

/**
 * One visit's asking: the messages in review past a day, the oldest first, one at a time until the visit is out of time.
 * Throws only where the messages cannot be listed; one message's failure is a line, and it is asked again next visit.
 */
export async function askSlowReviews(ports: SlowReviewPorts): Promise<SlowReviewCounts> {
  const { data, error } = await listSlowReviews(ports.db, new Date(ports.now() - REVIEW_SLOW_MS), MAX_SLOW);
  if (error) throw new DbFailure(error, "slow reviews: the messages in review");
  const counts: SlowReviewCounts = { slow: data.length, decided: 0, still: 0, told: 0, unreadable: 0, left: 0 };
  for (const [index, row] of data.entries()) {
    if (ports.now() - ports.started > ports.yieldAtMs) {
      counts.left = data.length - index;
      break;
    }
    const outcome = await askOne(ports, row).catch((e: unknown) => {
      ports.log.error("channel_quality_row_failed", {
        tenant_id: row.tenant_id,
        template_id: row.id,
        error: errField(e),
      });
      return "unreadable" as const;
    });
    if (outcome === "told") counts.told += 1;
    counts[outcome === "told" ? "still" : outcome] += 1;
  }
  return counts;
}
