/**
 * Exports: a transcript as a text file, a call as a text file, everyone as a
 * CSV. Pure — the routes fetch, these format.
 *
 * Until now "Export transcript" was a menu item that opened an overlay stubbed
 * outside demos, and the privacy policy promised "access or deletion" while
 * only deletion existed. Each function here is executed by its tests; the
 * routes only wire them to rows.
 *
 * Times are written in the business's own zone, once, in the header, so a
 * file read months later still says which clock it used.
 */
import { csvCell, personName, whisperText, type CsvCell } from "@chanlytics/contracts";
import type { CallDto, ConversationDto, MessageDto, PersonRowDto } from "@chanlytics/contracts";

export interface ExportOpts {
  /** The workspace's name, for the header line. */
  business: string;
  /** IANA zone every timestamp is written in. */
  tz: string;
  exportedAt?: Date;
}

type ContactLike = { display_name?: string | null; wa_profile_name?: string | null; phone_e164?: string | null; email?: string | null } | null | undefined;

/**
 * The name a person goes by -- contracts personName, the one rule every
 * surface reads. This file carried its own copy, which printed the raw
 * +19293709606 where every page prints +1 (929) 370-9606.
 */
export function personLabel(c: ContactLike): string {
  return personName(c);
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(tz: string): Intl.DateTimeFormat {
  const hit = formatters.get(tz);
  if (hit) return hit;
  const opts: Intl.DateTimeFormatOptions = {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  };
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: tz });
  } catch {
    // An unknown zone name must not turn an export into a 500; UTC and say so.
    f = new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: "UTC" });
  }
  formatters.set(tz, f);
  return f;
}

/** "2026-09-05 14:03" in the zone; "" for a missing or unreadable time. */
export function stamp(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p: Record<string, string> = {};
  for (const part of formatterFor(tz).formatToParts(d)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Who a line is from, in the words an owner uses. */
export function speaker(m: Pick<MessageDto, "sender" | "direction">, customer: string): string {
  switch (m.sender) {
    case "customer": return customer;
    case "ai": return "Receptionist";
    case "human": return "Staff";
    default: return m.direction === "inbound" ? customer : "System";
  }
}

function messageLine(m: MessageDto, customer: string, tz: string): string {
  const when = stamp(m.channel_ts ?? m.created_at, tz) || "time unknown";
  // Continuation lines are indented so a multi-line message reads as one entry.
  let body = (m.body ?? "").trim().replace(/\r?\n/g, "\n    ");
  if (m.type === "media") body = body || `[${m.media?.mime_type ?? "attachment"}]`;
  else if (m.type === "call_summary") body = `[call] ${body || "Phone call"}`;
  else if (m.type === "note") body = `[note] ${body}`;
  else if (m.type === "template") body = `[template] ${body}`;
  if (!body) body = "[empty]";
  const flag = m.status === "canceled" ? "[withdrawn] " : m.status === "failed" ? "[failed] " : m.status === "queued" ? "[queued] " : "";
  return `[${when}] ${speaker(m, customer)}: ${flag}${body}`;
}

function eventMs(m: MessageDto): number {
  const t = Date.parse(m.channel_ts ?? m.created_at);
  return Number.isNaN(t) ? Date.parse(m.created_at) : t;
}

/** A WhatsApp thread as plain text, oldest first, in channel time. */
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
  const head = [
    `Conversation with ${customer}${phone}`,
    `${opts.business} · WhatsApp · ${n} message${n === 1 ? "" : "s"} · exported ${stamp(at.toISOString(), opts.tz)} · times in ${opts.tz}`,
    "",
  ];
  const lines = n ? sorted.map((m) => messageLine(m, customer, opts.tz)) : ["(no messages)"];
  return [...head, ...lines, ""].join("\n");
}

function mmss(seconds: number | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "--:--";
  const t = Math.max(0, Math.floor(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** A phone call as plain text: the facts, the summary, then the turns. */
export function callText(call: CallDto, opts: ExportOpts): string {
  const named = personLabel(call.contact);
  const who = named !== "Unknown" ? named : call.from_e164 ?? "Unknown caller";
  const phone = call.contact?.phone_e164 ?? call.from_e164;
  const at = opts.exportedAt ?? new Date();
  const dur = call.duration_ms ? mmss(call.duration_ms / 1000) : null;
  const head = [
    `Phone call with ${who}${phone && phone !== who ? ` (${phone})` : ""}`,
    `${opts.business} · ${call.direction === "outbound" ? "Outbound" : "Inbound"} call · ${stamp(call.started_at, opts.tz) || "time unknown"}${dur ? ` · ${dur}` : ""} · exported ${stamp(at.toISOString(), opts.tz)} · times in ${opts.tz}`,
    "",
  ];
  const facts: string[] = [];
  if (call.in_voicemail) facts.push("Reached voicemail");
  if (call.call_successful === true) facts.push("Marked successful");
  else if (call.call_successful === false) facts.push("Marked unsuccessful");
  if (call.sentiment) facts.push(`Caller sentiment: ${call.sentiment}`);
  const summary = call.summary ? ["Summary", call.summary.trim(), ""] : [];
  const turns = (call.transcript_object ?? []).map((t) => {
    const clock = mmss(t.start ?? t.words?.[0]?.start);
    if (t.role === "injected") return `[${clock}] You whispered: ${whisperText(t.content)}`;
    const name = t.role === "agent" ? "Receptionist" : t.role === "user" ? who : t.role || "Unknown";
    return `[${clock}] ${name}: ${(t.content ?? "").trim()}`;
  });
  return [
    ...head,
    ...(facts.length ? [facts.join(" · "), ""] : []),
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
    s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "export"
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
