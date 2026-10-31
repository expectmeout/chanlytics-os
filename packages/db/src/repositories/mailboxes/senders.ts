/**
 * The senders of a connected mailbox's mail (00483): what the workspace said of them (mailbox_senders), and what the
 * mailbox left where it was, one row a sender (mailbox_left). The edge's sync and import read the first and note the
 * second as the service role; a member reads both and says what a sender is on their own session. And what came in
 * today, as Connections' row says it: the people who wrote through a mailbox, and the senders it left.
 *
 * Beside them, what the sorting reads of a stranger (decision 0080): what Chanlytics read a sender to be, once
 * (mailbox_sender_reads, 00495), whether the business talks with an address, and whether other workspaces' owners said
 * a domain is automated.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SENDER_KINDS,
  senderLeftWhy,
  senderVerdictOf,
  type MailboxLeftWhy,
  type MailboxSenderVerdict,
  type MailboxSendersDto,
  type SenderKind,
  type SenderReading,
} from "@chanlytics/contracts";
import type { Database } from "../../database.types";
import { dbLog } from "../../observe";

type Db = SupabaseClient<Database>;

/** What the workspace said of its senders, by address or domain (contracts senderVerdictOf reads it). */
export async function mailboxSenderVerdicts(db: Db, tenantId: string): Promise<Map<string, MailboxSenderVerdict>> {
  const { data, error } = await db.from("mailbox_senders").select("sender, verdict").eq("tenant_id", tenantId);
  if (error) throw new Error(`cannot read what the workspace said of its senders: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.sender, r.verdict === "person" ? "person" : "automated"] as const));
}

/**
 * One more email the mailbox left where it was, from one sender (00483 mailbox_left_note). Best effort: the email is
 * left whether or not the line about it is written, so a refusal is logged and answered false, never thrown.
 */
export async function noteMailboxLeft(
  db: Db,
  p: { tenantId: string; address: string; name: string | null; why: MailboxLeftWhy; at: string },
): Promise<boolean> {
  const { error } = await db.rpc("mailbox_left_note", {
    p_tenant_id: p.tenantId,
    p_address: p.address,
    p_name: p.name ?? "",
    p_why: p.why,
    p_at: p.at,
  });
  if (!error) return true;
  dbLog().error("mailbox_left_note_failed", { tenant_id: p.tenantId, why: p.why, error: error.message });
  return false;
}

/** How many senders the list under the mailbox says, newest first. */
const LEFT_SHOWN = 200;

/**
 * The list under the mailbox (contracts MailboxSendersDto), on the member's session (RLS): who the mailbox left mail
 * from, newest first, leaving out a sender since said to be a person; and what the workspace said of senders.
 */
export async function mailboxSendersOf(db: Db, tenantId: string): Promise<MailboxSendersDto> {
  const [left, said] = await Promise.all([
    db
      .from("mailbox_left")
      .select("address, name, why, count, first_at, last_at")
      .eq("tenant_id", tenantId)
      .order("last_at", { ascending: false })
      .limit(LEFT_SHOWN),
    db
      .from("mailbox_senders")
      .select("sender, verdict, set_at")
      .eq("tenant_id", tenantId)
      .order("set_at", { ascending: false }),
  ]);
  if (left.error) throw new Error(`cannot read what the mailbox left: ${left.error.message}`);
  if (said.error) throw new Error(`cannot read what the workspace said of its senders: ${said.error.message}`);
  const verdicts = new Map(
    (said.data ?? []).map((r) => [r.sender, r.verdict === "person" ? "person" : "automated"] as const),
  );
  const shown = (left.data ?? []).filter((r) => senderVerdictOf(verdicts, r.address) !== "person");
  const about = await readingsAbout(
    db,
    tenantId,
    shown.filter((r) => LEFT_BY_A_READING.has(r.why)).map((r) => r.address),
  );
  return {
    left: shown.map((r) => ({ ...r, why: r.why as MailboxLeftWhy, about: about.get(r.address) ?? null })),
    said: (said.data ?? []).map((r) => ({ ...r, verdict: r.verdict === "person" ? "person" : "automated" })),
  };
}

/**
 * What a member says of a sender, on their own session (00483 mailbox_sender_sort, which judges who may): automated, a
 * person, or taken back (null). Throws with the door's code (42501 not theirs, 22023 not a sender) for the route to say.
 */
export async function sortMailboxSender(
  db: Db,
  p: { tenantId: string; sender: string; verdict: MailboxSenderVerdict | null },
): Promise<void> {
  const { error } = await db.rpc("mailbox_sender_sort", {
    p_tenant_id: p.tenantId,
    p_sender: p.sender,
    // A null verdict takes it back: the door reads it as SQL's null.
    p_verdict: p.verdict as string,
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
}

/**
 * The reasons a reading leaves a sender for (contracts senderLeftWhy: a pitch, a notice, a relayed message): the only
 * rows of the list that can carry what they wanted, so the only addresses asked about. Asked of every row, the read named
 * up to LEFT_SHOWN addresses in one request's address line.
 */
const LEFT_BY_A_READING: ReadonlySet<string> = new Set(
  SENDER_KINDS.map(senderLeftWhy).filter((w): w is NonNullable<typeof w> => w !== null),
);

/** What Chanlytics read these senders to want (00495), by address: only those it said something of. */
async function readingsAbout(db: Db, tenantId: string, addresses: string[]): Promise<Map<string, string>> {
  if (!addresses.length) return new Map();
  const { data, error } = await db
    .from("mailbox_sender_reads")
    .select("address, about")
    .eq("tenant_id", tenantId)
    .in("address", addresses);
  if (error) throw new Error(`cannot read what the senders were read to be: ${error.message}`);
  return new Map((data ?? []).flatMap((r) => (r.about ? [[r.address, r.about] as const] : [])));
}

const isSenderKind = (v: unknown): v is SenderKind => (SENDER_KINDS as readonly unknown[]).includes(v);

/** What Chanlytics read a sender to be (00495), or null where it has not read them. Throws when it cannot be asked. */
export async function senderReadingOf(db: Db, tenantId: string, address: string): Promise<SenderReading | null> {
  const { data, error } = await db
    .from("mailbox_sender_reads")
    .select("kind, about")
    .eq("tenant_id", tenantId)
    .eq("address", address.trim().toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`cannot read what the sender was read to be: ${error.message}`);
  return data && isSenderKind(data.kind) ? { kind: data.kind, about: data.about } : null;
}

/**
 * A sender read, kept so it is never read again (00495): the latest reading stands. Best effort: the email is sorted by
 * the reading either way, so a write that fails is logged and answered false, and the next email asks again.
 */
export async function keepSenderReading(
  db: Db,
  p: { tenantId: string; address: string; reading: SenderReading; at: string },
): Promise<boolean> {
  const { error } = await db.from("mailbox_sender_reads").upsert(
    {
      tenant_id: p.tenantId,
      address: p.address.trim().toLowerCase(),
      kind: p.reading.kind,
      about: p.reading.about,
      read_at: p.at,
    },
    { onConflict: "tenant_id,address" },
  );
  if (!error) return true;
  dbLog().error("mailbox_sender_read_failed", { tenant_id: p.tenantId, kind: p.reading.kind, error: error.message });
  return false;
}

/** The doors an owner chose a person through (contacts.acquired_via): never an email that arrived, nor an import. */
const OWNER_DOORS: ReadonlySet<string> = new Set([
  "calendar",
  "lead",
  "manual",
  "website",
  "ad",
  "whatsapp",
  "sms",
  "call",
  "instagram",
]);

/** How many people one address is looked for among: one, nearly always. */
const PEOPLE_AT_AN_ADDRESS = 5;
/** How many of their messages are read for one the business sent or another wire: one settles it. */
const SAID_READ = 20;

/**
 * Whether the business talks with an address (decision 0080): someone the business wrote an email to (a person's send,
 * the owner's own from the mailbox, one Chanlytics sent for them; never the receptionist's), someone on another wire
 * with it (WhatsApp, a text, a call, Instagram), or someone a door the owner chose made (OWNER_DOORS). A person a
 * mailbox's own mail made, and one an import brought, is not: the first notice from a program made its person, and
 * every later one came from "someone known" (30 Oct 2026). Throws when it cannot be asked.
 */
export async function talksWith(db: Db, tenantId: string, address: string): Promise<boolean> {
  const { data: people, error } = await db
    .from("contacts")
    .select("id, acquired_via")
    .eq("tenant_id", tenantId)
    .eq("email", address.trim().toLowerCase())
    .is("erased_at", null)
    .is("merged_into_contact_id", null)
    .limit(PEOPLE_AT_AN_ADDRESS);
  if (error) throw new Error(`cannot read who has the address: ${error.message}`);
  if (!people?.length) return false;
  if (people.some((p) => p.acquired_via !== null && OWNER_DOORS.has(p.acquired_via))) return true;
  const { data: said, error: saidError } = await db
    .from("messages")
    .select("channel, direction, sender")
    .eq("tenant_id", tenantId)
    .in(
      "contact_id",
      people.map((p) => p.id),
    )
    .or("channel.neq.email,direction.eq.outbound")
    .limit(SAID_READ);
  if (saidError) throw new Error(`cannot read what was said with the address: ${saidError.message}`);
  return (said ?? []).some((m) => m.channel !== "email" || m.sender !== "ai");
}

/**
 * Whether three or more other workspaces' owners said a domain, or an address at it, is automated (00495
 * sender_domain_said_automated): a yes or a no, never who. The caller never asks of a free-mail domain. Throws when it
 * cannot be asked.
 */
export async function domainSaidAutomated(db: Db, tenantId: string, domain: string): Promise<boolean> {
  const { data, error } = await db.rpc("sender_domain_said_automated", { p_tenant_id: tenantId, p_domain: domain });
  if (error) throw new Error(`cannot ask what others said of the domain: ${error.message}`);
  return data === true;
}

/** The most rows a count reads: past it, the count is this many (a mailbox's day is a few dozen). */
const CAME_IN_READ_MAX = 1000;

/**
 * The people whose email came in through this mailbox since `since`: its import's and its sync's alike, each stamped
 * with the mailbox (meta.mailbox_id), by when the email was written.
 */
export async function mailboxPeopleSince(db: Db, tenantId: string, mailboxId: string, since: Date): Promise<number> {
  const { data, error } = await db
    .from("messages")
    .select("contact_id")
    .eq("tenant_id", tenantId)
    .eq("channel", "email")
    .eq("direction", "inbound")
    .gte("channel_ts", since.toISOString())
    .contains("meta", { mailbox_id: mailboxId })
    .limit(CAME_IN_READ_MAX);
  if (error) throw new Error(`cannot read who wrote to the mailbox: ${error.message}`);
  return new Set((data ?? []).map((r) => r.contact_id)).size;
}

/**
 * The senders whose mail the workspace's mailboxes left where it was since `since`, leaving out one since said to be a
 * person, as the list under the mailbox does (mailboxSendersOf).
 */
export async function mailboxLeftSince(db: Db, tenantId: string, since: Date): Promise<number> {
  const [left, verdicts] = await Promise.all([
    db
      .from("mailbox_left")
      .select("address")
      .eq("tenant_id", tenantId)
      .gte("last_at", since.toISOString())
      .limit(CAME_IN_READ_MAX),
    mailboxSenderVerdicts(db, tenantId),
  ]);
  if (left.error) throw new Error(`cannot read what the mailbox left: ${left.error.message}`);
  return (left.data ?? []).filter((r) => senderVerdictOf(verdicts, r.address) !== "person").length;
}
