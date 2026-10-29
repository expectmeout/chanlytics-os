/**
 * Exports as files: a conversation's transcript and a call as text, everyone as a CSV, and the attachment response
 * that carries each (or streams the whole workspace's). Pure: the four export routes (calls/[id]/export,
 * contacts/export, conversations/[id]/export and export) fetch, and these format and name the download, so each
 * function is run by its tests and the routes only wire them to rows. The privacy policy promises a person's access
 * as well as deletion; these are the access.
 *
 * Times are written in the business's own zone, once, in the header, so a file read months later still says which
 * clock it used.
 */
import {
  THREAD_CHANNEL_WORDS,
  callLength,
  callNoteLines,
  callNotesOf,
  callOutcomeWords,
  coveredChannels,
  csvCell,
  isChatMessage,
  mmss,
  personName,
  reachedVoicemail,
  usableZone,
  whisperText,
  writtenChannelOf,
  zoneParts,
  type CsvCell,
} from "@chanlytics/contracts";
import type { CallDto, ConversationDto, MessageDto, PersonRowDto } from "@chanlytics/contracts";

interface ExportOpts {
  /** The workspace's name, for the header line. */
  business: string;
  /** IANA zone every timestamp is written in. */
  tz: string;
  exportedAt?: Date;
}

type ContactLike =
  | { display_name?: string | null; wa_profile_name?: string | null; phone_e164?: string | null; email?: string | null }
  | null
  | undefined;

/**
 * The name a person goes by -- contracts personName, the one rule every
 * surface reads. This file carried its own copy, which printed the raw
 * +19293709606 where every page prints +1 (929) 370-9606.
 */
export function personLabel(c: ContactLike): string {
  return personName(c);
}

const two = (n: number): string => String(n).padStart(2, "0");

/**
 * "2026-09-05 14:03" in the zone (zone-math); "" for a missing or unreadable time. An unknown zone name must not turn
 * an export into a 500: it is read as UTC (usableZone).
 */
export function stamp(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const p = zoneParts(usableZone(tz), ms);
  return `${p.key} ${two(p.hh)}:${two(p.mm)}`;
}

/** Who a line is from, in the words an owner uses. */
function speaker(m: Pick<MessageDto, "sender" | "direction">, customer: string): string {
  switch (m.sender) {
    case "customer":
      return customer;
    case "ai":
      return "Receptionist";
    case "human":
      return "Staff";
    default:
      return m.direction === "inbound" ? customer : "System";
  }
}

/** The wire a message travelled, in a thread's words (contracts writtenChannelOf: a row from before the column is WhatsApp). */
const channelWord = (m: Pick<MessageDto, "channel">): string => THREAD_CHANNEL_WORDS[writtenChannelOf(m.channel)];

/**
 * The wires a thread's messages travelled, in the order it first used each: a person has one thread across every channel
 * they write on, and the file said "WhatsApp" for all of them (the wiring's second audit, R14 X4). A call's note and a
 * system note travelled no wire, and none of a thread's words is WhatsApp's.
 */
function wiresOf(messages: readonly MessageDto[]): string[] {
  const said: string[] = [];
  for (const m of messages) {
    if (!isChatMessage(m)) continue;
    const word = channelWord(m);
    if (!said.includes(word)) said.push(word);
  }
  return said;
}

function messageLine(m: MessageDto, customer: string, tz: string, byChannel: boolean): string {
  const when = stamp(m.channel_ts ?? m.created_at, tz) || "time unknown";
  // Continuation lines are indented so a multi-line message reads as one entry.
  let body = (m.body ?? "").trim().replace(/\r?\n/g, "\n    ");
  if (m.type === "media") body = body || `[${m.media?.mime_type ?? "attachment"}]`;
  else if (m.type === "call_summary") body = `[call] ${body || "Phone call"}`;
  else if (m.type === "note") body = `[note] ${body}`;
  else if (m.type === "template") body = `[template] ${body}`;
  if (!body) body = "[empty]";
  const flag =
    m.status === "canceled"
      ? "[withdrawn] "
      : m.status === "failed"
        ? "[failed] "
        : m.status === "queued"
          ? "[queued] "
          : "";
  // Where a thread holds more than one wire, each line says which it came by.
  const wire = byChannel && isChatMessage(m) ? `${channelWord(m)} · ` : "";
  return `[${when}] ${wire}${speaker(m, customer)}: ${flag}${body}`;
}

function eventMs(m: MessageDto): number {
  const t = Date.parse(m.channel_ts ?? m.created_at);
  return Number.isNaN(t) ? Date.parse(m.created_at) : t;
}

/** A thread as plain text, oldest first, in channel time, saying the wires it travelled. */
export function transcriptText(
  conv: Pick<ConversationDto, "contact">,
  messages: MessageDto[],
  opts: ExportOpts,
): string {
  const customer = personLabel(conv.contact);
  const phone = conv.contact?.phone_e164 && conv.contact.phone_e164 !== customer ? ` (${conv.contact.phone_e164})` : "";
  const at = opts.exportedAt ?? new Date();
  const sorted = [...messages].sort((a, b) => eventMs(a) - eventMs(b));
  const n = sorted.length;
  const wires = wiresOf(sorted);
  const head = [
    `Conversation with ${customer}${phone}`,
    `${opts.business}${wires.length ? ` · ${wires.join(", ")}` : ""} · ${n} message${n === 1 ? "" : "s"} · exported ${stamp(at.toISOString(), opts.tz)} · times in ${opts.tz}`,
    "",
  ];
  const lines = n ? sorted.map((m) => messageLine(m, customer, opts.tz, wires.length > 1)) : ["(no messages)"];
  return [...head, ...lines, ""].join("\n");
}

/**
 * "2:05" from a count of SECONDS (a transcript turn's start), "--:--" for none: the one clock (contracts mmss, which takes
 * milliseconds), so a turn reads the second the page reads, in Conversations and on Live. It floored where they rounded.
 * A turn's start is not a call's length: that is callLength's, the call card's rule.
 */
function mmssFromSeconds(seconds: number | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "--:--";
  return mmss(seconds * 1000);
}

/** A phone call as plain text: the facts, the summary, then the turns. */
export function callText(call: CallDto, opts: ExportOpts): string {
  const named = personLabel(call.contact);
  const who = named !== "Unknown" ? named : (call.from_e164 ?? "Unknown caller");
  const phone = call.contact?.phone_e164 ?? call.from_e164;
  const at = opts.exportedAt ?? new Date();
  // The call's length as the call card says it (contracts callLength): rounded to the second, none for no length.
  const dur = callLength(call.duration_ms);
  const head = [
    `Phone call with ${who}${phone && phone !== who ? ` (${phone})` : ""}`,
    `${opts.business} · ${call.direction === "outbound" ? "Outbound" : "Inbound"} call · ${stamp(call.started_at, opts.tz) || "time unknown"}${dur ? ` · ${dur}` : ""} · exported ${stamp(at.toISOString(), opts.tz)} · times in ${opts.tz}`,
    "",
  ];
  const facts: string[] = [];
  if (reachedVoicemail(call)) facts.push("Reached voicemail");
  if (call.call_successful === true) facts.push("Marked successful");
  else if (call.call_successful === false) facts.push("Marked unsuccessful");
  if (call.sentiment) facts.push(`Caller sentiment: ${call.sentiment}`);
  // What the call card leads with: what they wanted, how it ended, and what the call left to do or to know, in its words
  // (contracts call-words.ts). The file held the summary and the turns, and none of it (the wiring's second audit, R14 X4).
  const ended = callOutcomeWords(call.outcome);
  const card = [
    call.wanted?.trim() ? `Wanted: ${call.wanted.trim()}` : null,
    // Voicemail is said in the facts above already.
    ended && !facts.includes(ended) ? `How it ended: ${ended}` : null,
    ...callNoteLines(callNotesOf(call)),
  ].filter((line): line is string => !!line);
  const summary = call.summary ? ["Summary", call.summary.trim(), ""] : [];
  const turns = (call.transcript_object ?? []).map((t) => {
    const clock = mmssFromSeconds(t.start ?? t.words?.[0]?.start);
    if (t.role === "injected") return `[${clock}] You whispered: ${whisperText(t.content)}`;
    const name = t.role === "agent" ? "Receptionist" : t.role === "user" ? who : t.role || "Unknown";
    return `[${clock}] ${name}: ${(t.content ?? "").trim()}`;
  });
  return [
    ...head,
    ...(facts.length ? [facts.join(" · "), ""] : []),
    ...(card.length ? [...card, ""] : []),
    ...summary,
    "Transcript",
    ...(turns.length ? turns : ["(no transcript)"]),
    "",
  ].join("\n");
}

type Cell = CsvCell;

/** One CSV cell: contracts' rule (csvCell), the same one the page's export of a selection spells (clients-a.jsx plCsv). */
export { csvCell };

export const PEOPLE_COLUMNS: ReadonlyArray<readonly [string, (r: PersonRowDto, tz: string) => Cell]> = [
  ["name", (r) => r.display_name],
  ["whatsapp_name", (r) => r.wa_profile_name],
  ["phone", (r) => r.phone_e164],
  ["email", (r) => r.email],
  ["consent", (r) => r.consent],
  ["consent_source", (r) => r.consent_source],
  ["consent_updated", (r, tz) => stamp(r.consent_updated_at, tz)],
  // The OTHER answer, which is the one an audit asks about. A carrier or a
  // regulator checking a promotional send wants to see express consent to receive
  // MARKETING specifically (CTIA §5.1) -- so of the two axes, this export carried
  // only the one that does not answer the question. Kept beside its own source and
  // timestamp, because "they said yes" without how and when is not a record.
  ["offers_consent", (r) => r.marketing_consent ?? "unknown"],
  ["offers_consent_source", (r) => r.marketing_consent_source ?? null],
  ["offers_consent_updated", (r, tz) => stamp(r.marketing_consent_updated_at ?? null, tz)],
  ["do_not_contact", (r) => !!r.dnc],
  ["channels", (r) => (r.channels ?? []).join(" ")],
  ["conversations", (r) => r.conversation_count ?? 0],
  ["calls", (r) => r.call_count ?? 0],
  ["escalations", (r) => r.escalation_count ?? 0],
  ["first_contact", (r, tz) => stamp(r.first_contact_at, tz)],
  ["last_message", (r, tz) => stamp(r.last_message_at, tz)],
  ["last_inbound", (r, tz) => stamp(r.last_inbound_at, tz)],
  ["last_call", (r, tz) => stamp(r.last_call_at, tz)],
  ["receptionist", (r) => r.effective_reply_mode ?? ""],
  // Email's own answer about offers, how and when it was given, and when the address stopped being sent to: a customer who
  // pressed Unsubscribe had the same row as anyone else, and a file taken to another mailing tool mailed them (the
  // wiring's second audit, R14 X3). Appended, so a sheet that reads the columns above by place reads them as before.
  ["email_offers", (r) => r.email_marketing ?? "unknown"],
  ["email_offers_source", (r) => r.email_marketing_source ?? null],
  ["email_offers_updated", (r, tz) => stamp(r.email_marketing_updated_at ?? null, tz)],
  ["email_unreachable_since", (r, tz) => stamp(r.email_suppressed_at ?? null, tz)],
  // The channels each yes covers: a yes recorded before the channels were covers WhatsApp alone (coveredChannels).
  ["consent_covers", (r) => (r.consent === "opted_in" ? coveredChannels(r.consent_channels).join(" ") : "")],
  ["offers_covers", (r) => (r.marketing_consent === "opted_in" ? coveredChannels(r.marketing_channels).join(" ") : "")],
];

/** Everyone, as a UTF-8 CSV with a BOM (so a spreadsheet opens accents right) and CRLF rows. */
export function peopleCsv(rows: PersonRowDto[], tz: string): string {
  const head = PEOPLE_COLUMNS.map(([name]) => name).join(",");
  const body = rows.map((r) => PEOPLE_COLUMNS.map(([, pick]) => csvCell(pick(r, tz))).join(","));
  return `\uFEFF${[head, ...body].join("\r\n")}\r\n`;
}

/** A filename-safe form of a name: letters, digits, dot, dash; never empty. */
export function safeName(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "export"
  );
}

/** YYYYMMDD in the zone, for filenames. */
export function dateTag(now: Date, tz: string): string {
  return stamp(now.toISOString(), tz).slice(0, 10).replace(/-/g, "");
}

/** The headers of a download. Private and never cached, like every other /v1 exit. */
function downloadHeaders(filename: string, mime: string): Record<string, string> {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return {
    "content-type": `${mime}; charset=utf-8`,
    "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  };
}

/** A download. */
export function attachment(filename: string, body: string, mime: string): Response {
  return new Response(body, { status: 200, headers: downloadHeaders(filename, mime) });
}

/**
 * A download produced as it is read. The whole-workspace bundle is written a
 * section at a time by an async generator, so a workspace of any size goes
 * out without being held in memory whole -- and a reader that gives up
 * stops the generator rather than leaving it paging to nobody.
 */
export function attachmentStream(filename: string, chunks: AsyncIterable<string>, mime: string): Response {
  const enc = new TextEncoder();
  const it = chunks[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await it.next();
      if (done) controller.close();
      else controller.enqueue(enc.encode(value));
    },
    async cancel() {
      await it.return?.(undefined);
    },
  });
  return new Response(body, { status: 200, headers: downloadHeaders(filename, mime) });
}
