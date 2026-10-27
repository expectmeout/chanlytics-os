/**
 * An Instagram account's token, from the Vault, and the wires built on it (decision 0001, step 8).
 *
 * The connect door (connect.ts) writes the business's 60-day token through put_channel_credentials, under the account's
 * tenant_channels row (kind 'instagram', external_id the account's Instagram id, the id its webhooks are addressed to);
 * the token sweep (token-sweep.ts) writes it again each time it is refreshed. Everything that sends a DM reads it here:
 *
 *   instagramCarrier       the DM carrier a message routed to the account is answered through (the webhook's job,
 *                          dm-answer.ts): its sender on the account's token, its words as written, nothing held.
 *   instagramWireForTenant the job runner's DM wire (lib/ops/jobs-tick.ts): a member's reply and a held draft, sent from
 *                          the account the thread's person last wrote to, since a person's Instagram-scoped id is that
 *                          account's alone; the oldest account when nothing says.
 *
 * Three answers to a read, as WhatsApp's (core CredentialsRead): the token, none (refused at the door, said to the owner),
 * or a read that failed (nothing sent and nothing failed: the job waits for a heartbeat that can read the Vault).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendInstagramText, type InstagramConfig, type SendResult } from "../packages/channels.js";
import {
  activeChannelRows,
  lineWrittenTo,
  readChannelSecret,
  type Database,
  type WhatsappNumberRow,
} from "../packages/db.js";
import {
  wireUnavailable,
  WireUnavailableError,
  type CredentialsRead,
  type InboundCarrier,
  type Sender,
  type WireUnavailable,
} from "../packages/core.js";
import { errField, logger } from "../log.js";

type Db = SupabaseClient<Database>;

/** What the Vault keeps for an Instagram account: its 60-day token, the account it speaks for, and the token's clock. */
export interface InstagramSecret {
  access_token: string;
  account_id: string;
  /** When the token lapses unless refreshed (Meta's expires_in, from the moment it was given). */
  expires_at: string | null;
  /** When it was given or last refreshed: Meta refreshes a token only once it is a day old. */
  refreshed_at: string;
}

/** The account's token as a send needs it, from its row's Vault reference; a row with no reference holds none. */
export async function instagramCredentials(
  db: Db,
  row: Pick<WhatsappNumberRow, "id" | "credentials_ref">,
): Promise<CredentialsRead<InstagramConfig>> {
  if (!row.credentials_ref) return { outcome: "absent" };
  try {
    const c = (await readChannelSecret(db, row.id)) as Partial<InstagramSecret> | null;
    return c?.access_token && c.account_id
      ? { outcome: "present", credentials: { accessToken: c.access_token, accountId: c.account_id } }
      : { outcome: "absent" };
  } catch (e) {
    logger().error("ig_credentials_unreadable", { channel_id: row.id, error: errField(e) });
    return { outcome: "unavailable", error: errField(e) };
  }
}

/** What a send meets on an account whose token is not there, or could not be read: refused with its own words. */
const notSent = (read: Exclude<CredentialsRead<InstagramConfig>, { outcome: "present" }>): SendResult => ({
  ok: false,
  wamid: null,
  status: 503,
  errorBody: read.outcome === "absent" ? "no_credentials" : read.error,
});

/**
 * The DM carrier for a message the account was written to: replies leave on its token, as written (no footer, no
 * rates line), and nothing is held for a person by the wire itself. `speaking` is said the moment before Instagram is
 * called (a job's markSpoke), so a run that dies with the reply in flight is never run again to write twice.
 */
export function instagramCarrier(
  read: CredentialsRead<InstagramConfig>,
  speaking?: () => Promise<void>,
): InboundCarrier<"instagram"> {
  return {
    channel: "instagram",
    send: async (to, body) => {
      if (read.outcome !== "present") return notSent(read);
      if (speaking) await speaking();
      return sendInstagramText(read.credentials, to, body);
    },
    body: (text) => text,
    held: null,
  };
}

/**
 * The job runner's DM wire for one workspace: each send leaves from the account its person last wrote to (the line
 * their newest DM came in on), the oldest account when nothing says or the send names no thread. Null with no active
 * account; a read that failed is a wire that could not be bound (core WireUnavailable), never a refusal.
 */
export async function instagramWireForTenant(db: Db, tenantId: string): Promise<Sender | null | WireUnavailable> {
  let accounts: WhatsappNumberRow[];
  try {
    accounts = await activeChannelRows(db, tenantId, "instagram");
  } catch (e) {
    logger().error("ig_credentials_unreadable", { tenant_id: tenantId, error: errField(e) });
    return wireUnavailable(errField(e));
  }
  const [oldest] = accounts;
  if (!oldest) return null;
  const reads = new Map<string, Promise<CredentialsRead<InstagramConfig>>>();
  const credentialsOf = (row: WhatsappNumberRow) => {
    const read = reads.get(row.id) ?? instagramCredentials(db, row);
    reads.set(row.id, read);
    return read;
  };
  const first = await credentialsOf(oldest);
  if (first.outcome === "unavailable") return wireUnavailable(first.error);
  if (accounts.length === 1 && first.outcome === "absent") return null;
  return async (to, p) => {
    const line = accounts.length > 1 ? await lineOfThread(db, tenantId, p.conversationId) : null;
    const read = await credentialsOf(accounts.find((a) => a.id === line) ?? oldest);
    if (read.outcome === "unavailable") throw new WireUnavailableError("instagram", read.error);
    return read.outcome === "present" ? sendInstagramText(read.credentials, to, p.body) : notSent(read);
  };
}

/**
 * Which of the workspace's accounts a thread's person last wrote to (its row's id); null when nothing says, or the send
 * names no thread, and the oldest answers. A thread that could not be read is a wire that could not be bound: nothing
 * leaves.
 */
async function lineOfThread(db: Db, tenantId: string, conversationId: string | undefined): Promise<string | null> {
  if (!conversationId) return null;
  try {
    return await lineWrittenTo(db, tenantId, conversationId, "instagram");
  } catch (e) {
    throw new WireUnavailableError("instagram", errField(e));
  }
}
