/**
 * The verbs take ids that say whose they are (contracts' identity.ts): a thread's workspace arrives as a TenantId and
 * a reply's person as a ContactId, so a row read without the checks does not reach a verb, and one id cannot stand in
 * for the other. A port widened back to `string` would compile everywhere else; here the positives stop compiling and
 * the negatives start to.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts), and each line under
 * `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * package's `tsc --noEmit` fails. Nothing imports this file, so no build reaches it.
 */
import type { ContactId, Exactly, Holds, TenantId, Within } from "@chanlytics/contracts";
import type { Thread, ThreadPorts } from "./ports";
import type { QueuedReply, ReplyThread } from "./reply";
import type { snooze } from "./snooze";

/** A thread as a row read without asTenantId would carry it. */
type Unchecked = Omit<Thread, "tenant_id"> & { tenant_id: string };

type _Ports = [
  // The thread, the canonical verb's command and the ledger's port each take the brand.
  Holds<Exactly<Thread["tenant_id"], TenantId>>,
  Holds<Exactly<Parameters<typeof snooze>[1]["conv"]["tenant_id"], TenantId>>,
  Holds<Exactly<Parameters<ThreadPorts["record"]>[0], TenantId>>,
  Holds<Exactly<ReplyThread["contact_id"], ContactId | null>>,
  // @ts-expect-error had ReplyThread's contact_id been typed any, its positive would read so, and Exactly refuses any
  Holds<Exactly<any, ContactId | null>>,
  // @ts-expect-error a thread read without asTenantId carries a bare string, and no verb takes it
  Holds<Within<Unchecked, Thread>>,
  // @ts-expect-error a person's id does not stand in for the workspace's where a decision is recorded
  Holds<Within<ContactId, Parameters<ThreadPorts["record"]>[0]>>,
  // @ts-expect-error nor a workspace's id for the person a reply is queued to
  Holds<Within<TenantId, QueuedReply["contact_id"]>>,
];
