/**
 * A watched folder's push channel (the footage sources plan, D18): how its provider tells the edge something changed.
 * A channel carries no change, only "read"; it lasts a week at most and is never renewed, so a new one is opened two
 * days before the old ends and the old one closed. Opening rides the folder's own read, which every watched folder
 * has at least each hour or six, so no pass of its own is needed.
 *
 * The channel's token is made here and never kept: the row holds its sha256, and the push door checks the token a
 * signal carries against it. The channel's id names its folder (`src-<source id>-<nonce>`), so a signal from a channel
 * nobody holds any more can still be closed with its folder's own account.
 *
 * A deployment that does not know its own address opens none, and a channel that could not be opened is tried again at
 * the next read: the clock's floor reads every folder all the same.
 */
import { createHash, randomBytes } from "node:crypto";
import { patchMediaSource, stampSourceSignal, type MediaSourceRow } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errField } from "../../shared/log.js";
import { driveSignalAddress } from "./config.js";
import { isChannelDue } from "./pace.js";
import type { OpenSource } from "./standing.js";

/** The sha256 of a channel's token, in hex: what a folder's row keeps of it. */
const channelTokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");

/**
 * The push door's check: the folder a signal is for, only where the token the signal carries is the one its channel was
 * opened with (the row keeps the token's hash, and the token nowhere). The same statement stamps the folder as
 * signalled. Null for a channel nobody here holds, or a token that is not its own: nothing is read for either.
 */
export async function verifyChannelToken(
  db: SupabaseClient<Database>,
  signal: { channelId: string; token: string },
  at: Date,
): Promise<MediaSourceRow | null> {
  return stampSourceSignal(db, {
    channelId: signal.channelId,
    tokenHash: channelTokenHash(signal.token),
    at: at.toISOString(),
  });
}

/** The id a folder's channel is opened under: it names the folder, and no two are alike. */
const channelIdFor = (sourceId: string): string => `src-${sourceId}-${randomBytes(4).toString("hex")}`;

/** The folder a channel's id names, or null for an id that is not one of ours. */
export function channelSourceOf(channelId: string): string | null {
  const named = /^src-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-[0-9a-f]{8}$/.exec(channelId);
  return named?.[1] ?? null;
}

/**
 * The folder's channel opened where it is due (none kept, or one ending within the pace's span), and the one it
 * replaces closed. Never throws: a channel is the fast road, not the only one.
 */
export async function keepChannel(open: OpenSource, now = Date.now()): Promise<"kept" | "opened" | "none"> {
  const address = driveSignalAddress();
  if (!address) return "none";
  if (!isChannelDue(open.source.channel_expires_at, now)) return "kept";
  try {
    const token = randomBytes(32).toString("base64url");
    const reply = await open.drive.openChannel(open.token, open.folder, {
      id: channelIdFor(open.source.id),
      token,
      address,
    });
    if (reply.verdict !== "ok") {
      open.log.warn("source_channel_failed", { source: open.source.id, verdict: reply.verdict });
      return "none";
    }
    await patchMediaSource(open.db, {
      tenantId: open.source.tenant_id,
      id: open.source.id,
      from: ["watching"],
      patch: {
        channel_id: reply.answer.id,
        channel_resource_id: reply.answer.resourceId,
        channel_token_hash: channelTokenHash(token),
        channel_expires_at: reply.answer.expiresAt,
      },
    });
    await closeChannel(open, open.source.channel_id, open.source.channel_resource_id);
    return "opened";
  } catch (error) {
    open.log.warn("source_channel_failed", { source: open.source.id, error: errField(error) });
    return "none";
  }
}

/** A channel closed at its provider, best effort: one already gone is closed, and a failure leaves it to end by itself. */
export async function closeChannel(
  open: Pick<OpenSource, "drive" | "token" | "log" | "source">,
  channelId: string | null,
  resourceId: string | null,
): Promise<void> {
  if (!channelId || !resourceId) return;
  await open.drive
    .closeChannel(open.token, { id: channelId, resourceId })
    .catch((error: unknown) =>
      open.log.warn("source_channel_failed", { source: open.source.id, closing: true, error: errField(error) }),
    );
}
