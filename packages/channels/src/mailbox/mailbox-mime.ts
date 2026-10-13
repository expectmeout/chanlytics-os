/**
 * A frozen request as the RFC 5322 message a mailbox sends (decision 0056): Gmail's users.messages.send and Graph's
 * MIME draft take these bytes. Pure.
 *
 * The request (email/request.ts) is what was approved and kept on the row; this only writes it out: From, To, Subject,
 * Date, its own Message-ID, the thread's In-Reply-To and References, the unsubscribe headers, and the words. A request
 * with no HTML twin (a reach-out's: plain text, decision 0056, 7) is one text/plain part; one with a twin is
 * multipart/alternative, the text first. Every line ends in CRLF and none passes 998 octets: a long header is folded at
 * its spaces, the words are quoted-printable, and a name or a subject outside ASCII is an encoded-word (RFC 2047).
 */
import { messageIdHeader } from "../email/header-values";
import type { EmailRequest } from "../email/request";

const CRLF = "\r\n";

/** The Message-ID a mailbox's email is sent under: the row's id, on the mailbox's own host, so it is ours to find. */
export function mailboxMessageId(rowId: string, host: string): string {
  return `<cl.${rowId.replace(/[^0-9a-f]/gi, "").toLowerCase()}@${host.toLowerCase()}>`;
}

const ASCII = /^[\x20-\x7e]*$/;

/** A header value's words, as an encoded-word when they are not plain ASCII (RFC 2047, base64, UTF-8). */
function encodedWord(s: string): string {
  if (ASCII.test(s)) return s;
  const bytes = new TextEncoder().encode(s);
  // An encoded-word is 75 characters at most: 45 bytes encode to 60, with the 12 around them.
  const words: string[] = [];
  for (let i = 0; i < bytes.length;) {
    let end = Math.min(bytes.length, i + 45);
    // Never split a character: step back off a continuation byte.
    while (end < bytes.length && end > i && ((bytes[end] ?? 0) & 0xc0) === 0x80) end -= 1;
    let bin = "";
    for (const b of bytes.subarray(i, end)) bin += String.fromCharCode(b);
    words.push(`=?UTF-8?B?${btoa(bin)}?=`);
    i = end;
  }
  return words.join(" ");
}

/** `"Name" <address>` with the name as an encoded-word when it needs one; the address stays as written. */
function mailboxHeaderOf(value: string): string {
  const m = /^\s*"?(.*?)"?\s*<([^<>]+)>\s*$/.exec(value);
  if (!m) return value.trim();
  const name = (m[1] ?? "").trim();
  const address = (m[2] ?? "").trim();
  if (!name) return address;
  return ASCII.test(name) ? `"${name.replace(/["\\]/g, "")}" <${address}>` : `${encodedWord(name)} <${address}>`;
}

/** A header line, folded at its spaces so no line passes 78 characters where it can help it (RFC 5322 2.2.3). */
function headerLine(name: string, value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ");
  const words = `${name}: ${clean}`.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && line.length + 1 + w.length > 78) {
      lines.push(line);
      line = ` ${w}`;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines.join(CRLF);
}

/** Text as quoted-printable (RFC 2045 6.7): UTF-8, soft breaks before 76, hard breaks as CRLF. */
function quotedPrintable(text: string): string {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const bytes = new TextEncoder().encode(raw);
    let line = "";
    const push = (piece: string) => {
      if (line.length + piece.length > 75) {
        out.push(`${line}=`);
        line = "";
      }
      line += piece;
    };
    bytes.forEach((b, i) => {
      const last = i === bytes.length - 1;
      // A space or a tab is encoded at the end of a line, where a mail system may strip it.
      if ((b === 0x20 || b === 0x09) && last) push(`=${b.toString(16).toUpperCase().padStart(2, "0")}`);
      else if ((b >= 33 && b <= 126 && b !== 61) || b === 0x20 || b === 0x09) push(String.fromCharCode(b));
      else push(`=${b.toString(16).toUpperCase().padStart(2, "0")}`);
    });
    out.push(line);
  }
  return out.join(CRLF);
}

/** RFC 5322's date: "Tue, 13 Oct 2026 14:02:09 +0000". */
function mimeDate(at: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${days[at.getUTCDay()]}, ${p(at.getUTCDate())} ${months[at.getUTCMonth()]} ${at.getUTCFullYear()} ${p(
    at.getUTCHours(),
  )}:${p(at.getUTCMinutes())}:${p(at.getUTCSeconds())} +0000`;
}

/** The headers a request carries that a mailbox sends too: the thread, and how to stop it. Its own names, as written. */
const CARRIED_HEADERS = ["In-Reply-To", "References", "List-Unsubscribe", "List-Unsubscribe-Post", "Auto-Submitted"];

/**
 * The message, written out. `messageId` is the one it is sent under (mailboxMessageId); `boundary` is the
 * multipart's, given by the caller so the same request writes the same bytes.
 */
export function buildMime(r: EmailRequest, p: { messageId: string; at: Date; boundary?: string }): string {
  const id = messageIdHeader(p.messageId);
  if (!id) throw new Error("buildMime: a Message-ID is <local@host>");
  const head: string[] = [
    headerLine("From", mailboxHeaderOf(r.from)),
    headerLine("To", r.to.join(", ")),
    headerLine("Subject", encodedWord(r.subject)),
    headerLine("Date", mimeDate(p.at)),
    headerLine("Message-ID", id),
    "MIME-Version: 1.0",
  ];
  // A Reply-To that only says the From again is left out: a mailbox's own replies come back to it.
  const replyTo = r.reply_to.filter((a) => !r.from.toLowerCase().includes(a.toLowerCase()));
  if (replyTo.length) head.push(headerLine("Reply-To", replyTo.join(", ")));
  for (const name of CARRIED_HEADERS) {
    const v = r.headers[name];
    if (typeof v === "string" && v.trim()) head.push(headerLine(name, v.trim()));
  }
  const text = quotedPrintable(r.text);
  if (!r.html.trim())
    return [
      ...head,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      text,
    ].join(CRLF);
  const b = p.boundary ?? `cl-${id.replace(/[^0-9a-z]/gi, "").slice(0, 40)}`;
  return [
    ...head,
    `Content-Type: multipart/alternative; boundary="${b}"`,
    "",
    `--${b}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    text,
    `--${b}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    quotedPrintable(r.html),
    `--${b}--`,
    "",
  ].join(CRLF);
}
