/**
 * The mailboxes' intake, as the job runner is handed it (decision 0056; jobs context `mailboxIntake`): an email_ingest
 * job of source "mailbox" (scheduled by mailbox-sync.ts, once per message) fetches its message here, with the mailbox's
 * own grant, and core reads it as it reads any email (email-ingest.ts). The erasure check and the owner's note are the
 * hosted mailbox's (email.ts), so a reply that came to a connected mailbox is told as one that came to the hosted one.
 *
 * A mailbox that cannot be read now (its grant gone, the provider down) throws: the job is tried again, and a grant
 * gone is the mailbox's reconnect, said once.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { gmailEmailOf, gmailMessage, graphEmailOf, graphMessage } from "../../packages/channels.js";
import { mailboxConnectionById, type Database } from "../../packages/db.js";
import type { JobContext } from "../../packages/jobs.js";
import { erasedBeforeEmail } from "../../erased.js";
import { notify } from "../../ops/notify.js";
import { loadTenantNotifications } from "../../tenant-runtime.js";
import { emailWaitingMessage } from "../email.js";
import { errField, logger } from "../../log.js";
import { tokenFor } from "./mailbox-credentials.js";
import { markSignedOut } from "./mailbox-wire.js";

type Db = SupabaseClient<Database>;

export function mailboxIntake(db: Db): NonNullable<JobContext["mailboxIntake"]> {
  return {
    fetch: async (connectionId, providerId) => {
      const row = await mailboxConnectionById(db, connectionId);
      if (!row || row.state === "removed") return null;
      const now = Date.now();
      const t = await tokenFor(db, row, now);
      if (!t.ok) {
        if (t.why === "signed_out") await markSignedOut(db, row, logger({ tenant_id: row.tenant_id }), now);
        throw new Error(`the mailbox cannot be read now: ${t.why}`);
      }
      const r =
        row.provider === "microsoft"
          ? await graphMessage(t.token, providerId)
          : await gmailMessage(t.token, providerId);
      if (r.outcome !== "ok") {
        // The message is gone from the mailbox (deleted, moved out of reach): nothing to read, never a retry.
        if (r.status === 404) return null;
        throw new Error(`the mailbox's message could not be read: ${r.status}`);
      }
      return row.provider === "microsoft" ? graphEmailOf(r.json) : gmailEmailOf(r.json);
    },
    erasedBefore: (tenantId, address, receivedAtIso) => erasedBeforeEmail(db, tenantId, address, receivedAtIso),
    // Best effort, as the hosted mailbox's note is: the thread is flagged already, which is the durable half.
    tell: async (tenantId, note) => {
      try {
        const addressing = await loadTenantNotifications(db, tenantId);
        await notify({ tenantId, ...addressing }, emailWaitingMessage(note));
      } catch (e) {
        logger({ tenant_id: tenantId }).error("email_tell_failed", { error: errField(e) });
      }
    },
  };
}
