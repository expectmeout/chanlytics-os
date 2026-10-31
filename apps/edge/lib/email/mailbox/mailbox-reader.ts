/**
 * A stranger's first email to a connected mailbox, read for what its sender is (decision 0080): the smallest model (the
 * registry's sender_read route) through the platform's one JSON transport (model.ts askJson), told the business's name,
 * what the headers say and the first words, answering one of contracts' SENDER_KINDS. What it read is kept (00495
 * mailbox_sender_reads), so a sender is read once, by the live read and every import alike.
 *
 * Nothing waits on it. No key, a workspace the model may not answer for, no answer, an answer out of its shape, or too
 * little of the caller's minute left: the email is left to the rules (null), nothing is kept, and the sender is read
 * again with their next email.
 *
 * Who may be read for is the receptionist's rule (db workspaceMayUseModels: open to its customers, not paused, not
 * ended), not reach-out's spend: a mailbox is connected in the first run, inside the free trial reach-out waits out, and
 * a reading costs a hundredth of a cent.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailPlainText, replyToElsewhere, sentByAService, type MailboxEmail } from "../../packages/channels.js";
import {
  SECOND_MS,
  SENDER_READ_MAX_TOKENS,
  SENDER_READING_SCHEMA,
  normalizeEmail,
  senderReadingAsk,
  senderReadingOf,
  senderReadingSystem,
  type SenderFacts,
  type SenderReading,
} from "../../packages/contracts.js";
import {
  keepSenderReading,
  workspaceAbout,
  workspaceMayUseModels,
  workspaceNameAndConfig,
  type Database,
} from "../../packages/db.js";
import { askJson, promptHashOf } from "../../model.js";
import { env } from "../../env.js";
import { errField, type Logger } from "../../log.js";

type Db = SupabaseClient<Database>;

/** The most one reading takes: a short email into a fixed shape. */
const READ_MS = 10 * SECOND_MS;
/** What a reading leaves of its caller's minute: a sync or a part still ends inside its own line. */
const LINE_MARGIN_MS = 2 * SECOND_MS;

/** Reads a stranger's email for what its sender is, before `until` (epoch ms); null where nothing answered. */
export type SenderReader = (e: MailboxEmail, until: number) => Promise<SenderReading | null>;

/** Whether an email names one it answers. */
export const answersSomething = (e: Pick<MailboxEmail, "headers">): boolean =>
  !!(e.headers["in-reply-to"] || e.headers.references);

/** Where Gmail filed an email: its Primary tab or Updates, as the model is told; null where its labels say neither. */
function tabOf(e: Pick<MailboxEmail, "labels">): SenderFacts["tab"] {
  if (e.labels.includes("CATEGORY_UPDATES")) return "updates";
  return e.labels.includes("CATEGORY_PERSONAL") ? "primary" : null;
}

/** What the model is shown of one email: its sender, where its replies go, its subject and words, what its headers say. */
function senderFactsOf(e: MailboxEmail, from: string): SenderFacts {
  return {
    from: { address: from, name: e.from?.name ?? null },
    replyTo: replyToElsewhere(e),
    subject: e.subject,
    words: emailPlainText(e),
    service: sentByAService(e),
    tab: tabOf(e),
    answers: answersSomething(e),
  };
}

/**
 * The reader for one workspace, as a sync or an import part asks it: whether it may read, and the business's name and its
 * own words about what it does, are read once, at the first stranger.
 */
export function senderReaderFor(db: Db, tenantId: string, log: Logger): SenderReader {
  let may: Promise<{ name: string | null; about: string | null } | null> | null = null;
  const mayRead = () =>
    (may ??= (async () => {
      if (!env.ANTHROPIC_API_KEY) return null;
      if (!(await workspaceMayUseModels(db, tenantId))) return null;
      const [named, about] = await Promise.all([workspaceNameAndConfig(db, tenantId), workspaceAbout(db, tenantId)]);
      return { name: named.name, about };
    })().catch((err: unknown) => {
      log.warn("mailbox_sender_unread", { stage: "may_read", error: errField(err) });
      return null;
    }));
  return async (e, until) => {
    const from = normalizeEmail(e.from?.address);
    const ms = Math.min(READ_MS, until - Date.now() - LINE_MARGIN_MS);
    if (!from || ms <= 0) return null;
    const ready = await mayRead();
    if (!ready) return null;
    const system = senderReadingSystem(ready);
    try {
      const answered = await askJson({
        purpose: "sender_read",
        system,
        user: senderReadingAsk(senderFactsOf(e, from)),
        schema: SENDER_READING_SCHEMA,
        maxTokens: SENDER_READ_MAX_TOKENS,
        plainJsonHint: "Answer with only a JSON object in the shape asked.",
        timeoutMs: ms,
        signal: AbortSignal.timeout(ms),
        for: { tenantId, promptHash: promptHashOf(system) },
      });
      const reading = senderReadingOf(answered?.answer);
      if (!reading) return null;
      await keepSenderReading(db, { tenantId, address: from, reading, at: new Date().toISOString() });
      log.info("mailbox_sender_read", { kind: reading.kind });
      return reading;
    } catch (err) {
      log.warn("mailbox_sender_unread", { stage: "read", error: errField(err) });
      return null;
    }
  };
}
