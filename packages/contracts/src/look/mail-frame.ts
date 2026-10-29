/**
 * The frame every designed email is drawn in (the emails-and-forms review, 28 Oct 2026: one layout, two brands). The
 * head and its one dark rule, the line an inbox's list shows, the 560 px column, the white card and its one button are
 * this module's; the row above the card, the card's words and the row under it are the sender's. A business writes
 * to its customer on the letter (letter.ts, decision 0075), its logo and colour; Chanlytics writes to an owner on the
 * alert (notices/notice-mail.ts), its mark and coral. Table-built with inline styles, as inboxes draw mail; a dark
 * inbox reads the palette's dark side from the head's media rule. Every word and address given as words is escaped
 * here; the rows and the card come as HTML, escaped by the mail that drew them.
 */
import { escapeHtml } from "../shared/html";

/** The palette both mails are drawn in: the ink, its two quieter steps, and a rule's line. */
export const INK = "#1f2026";
export const INK_2 = "#4b4d5a";
export const INK_3 = "#6b6d7a";
export const LINE = "#e3e4ec";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif";

/** The frame's own classes on a dark inbox, and a mail's own beside them in the same rule. */
const darkRule = (extra: string): string =>
  `@media (prefers-color-scheme:dark){.bg{background:#121317!important}.card{background:#1d1e23!important;border-color:#2c2d35!important}.ink{color:#f1f1f4!important}.ink2{color:#c3c4cc!important}.ink3{color:#9a9ba6!important}${extra}}
@media (max-width:620px){.wrap{width:100%!important}.pad{padding:22px 20px!important}}`;

/** The mail's one button: its words and address, on the sender's colour. */
export function mailButtonHtml(words: string, href: string, colour: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 0"><tr><td style="border-radius:10px;background:${colour}"><a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;line-height:18px;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(words)}</a></td></tr></table>`;
}

/** What a mail puts in the frame. */
interface FramedMail {
  subject: string;
  /** The first line an inbox's list shows, before the mail is opened. */
  preview: string;
  /** The row above the card, whole: the sender's mark. */
  top: string;
  /** What the card holds. */
  card: string;
  /** The row under the card, whole: why this came, and from whom. */
  foot: string;
  /** The dark side of the mail's own classes ("" when it has none). */
  dark: string;
}

/** A designed email's HTML: the sender's rows and card in the one frame. */
export function mailFrameHtml(f: FramedMail): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(f.subject)}</title><style>${darkRule(f.dark)}</style></head>
<body class="bg" style="margin:0;padding:0;background:#f6f7fa">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(f.preview)}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fa;font-family:${FONT}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" class="wrap" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px">
${f.top}
<tr><td class="card pad" style="background:#ffffff;border:1px solid ${LINE};border-radius:14px;padding:26px 28px">
${f.card}
</td></tr>
${f.foot}
</table></td></tr></table></body></html>`;
}
