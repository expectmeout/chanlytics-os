/**
 * The mailboxes' intake, as the job runner is handed it (decision 0056; jobs context `mailboxIntake`): an email_ingest
 * job of source "mailbox" (scheduled by mailbox/sync.ts, once per message) fetches its message here, with the mailbox's
 * own grant, and core reads it as it reads any email (email-ingest.ts). The erasure check and the owner's note are the
 * hosted mailbox's (email.ts), so a reply that came to a connected mailbox is told as one that came to the hosted one.
 *
 * A mailbox that cannot be read now (its grant gone, the provider down) throws: the job is tried again, and a grant
 * gone is the mailbox's reconnect, said once.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { gmailEmailOf, readGmailMessage, graphEmailOf, readGraphMessage } from "@chanlytics/channels/email";
import { findMailboxConnectionById } from "@chanlytics/db/email";
import type { Database } from "@chanlytics/db/types";
import type { JobContext } from "@chanlytics/jobs";
import { wasErasedBeforeEmail } from "../../shared/erased.js";
import { tellOfWaitingEmail } from "../email.js";
import { logger } from "../../shared/log.js";
import { getToken } from "./credentials.js";
import { markSignedOut } from "./wire.js";

type Db = SupabaseClient<Database>;

export function mailboxIntake(db: Db): NonNullable<JobContext["mailboxIntake"]> {
  return {
    fetch: async (connectionId, providerId) => {
      const row = await findMailboxConnectionById(db, connectionId);
      if (!row || row.state === "removed") return null;
      const now = Date.now();
      const token = await getToken(db, row, now);
      if (!token.ok) {
        if (token.why === "signed_out") await markSignedOut(db, row, logger({ tenant_id: row.tenant_id }), now);
        throw new Error(`the mailbox cannot be read now: ${token.why}`);
      }
      const item =
        row.provider === "microsoft"
          ? await readGraphMessage(token.token, providerId)
          : await readGmailMessage(token.token, providerId);
      if (item.outcome !== "ok") {
        // The message is gone from the mailbox (deleted, moved out of reach): nothing to read, never a retry.
        if (item.status === 404) return null;
        throw new Error(`the mailbox's message could not be read: ${item.status}`);
      }
      return row.provider === "microsoft" ? graphEmailOf(item.json) : gmailEmailOf(item.json);
    },
    erasedBefore: (tenantId, address, receivedAtIso) => wasErasedBeforeEmail(db, tenantId, address, receivedAtIso),
    // Best effort, as the hosted mailbox's note is: the thread is flagged already, which is the durable half.
    tell: tellOfWaitingEmail(db),
  };
}
