/**
 * The letter (decision 0075): the one layout every email a business sends its customers is drawn in, when it is drawn
 * at all. A reply, a reminder and a cold email stay plain, as a person's email is; a sign-up's confirmation (its first
 * use) and, later, an offer wear this. The business's look at the top (its logo, else its name), its words, one button,
 * its foot, and who sent it, in the frame an alert to an owner is drawn in too (mail-frame.ts). Every word and address
 * is escaped here.
 */
import { escapeHtml } from "../shared/html";
import { LETTER_WORDS, accentOf, type WorkspaceLook } from "./look";
import { INK, INK_2, INK_3, mailButtonHtml, mailFrameHtml } from "./mail-frame";

export interface Letter {
  look: WorkspaceLook;
  subject: string;
  /** The first line an inbox's list shows, before the mail is opened. */
  preview: string;
  /** Paragraphs, in order. */
  lines: string[];
  button: { words: string; href: string } | null;
  /** Lines under the card, before the sender's own. */
  foot: string[];
}

export function letterHtml(l: Letter): string {
  const name = escapeHtml(l.look.business);
  const mark = l.look.logo_url
    ? `<img src="${escapeHtml(l.look.logo_url)}" alt="${name}" height="40" style="display:block;height:40px;width:auto;border:0">`
    : `<span class="ink" style="font-size:18px;font-weight:700;color:${INK}">${name}</span>`;
  const lines = l.lines
    .map(
      (p) =>
        `<p class="ink2" style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${INK_2}">${escapeHtml(p)}</p>`,
    )
    .join("\n");
  const button = l.button ? mailButtonHtml(l.button.words, l.button.href, accentOf(l.look)) : "";
  const foot = [...l.foot, LETTER_WORDS.sentFor(l.look.business)]
    .map(
      (f) =>
        `<p class="ink3" style="margin:0 0 4px;font-size:12px;line-height:1.6;color:${INK_3}">${escapeHtml(f)}</p>`,
    )
    .join("");
  return mailFrameHtml({
    subject: l.subject,
    preview: l.preview,
    top: `<tr><td style="padding:0 4px 16px">${mark}</td></tr>`,
    card: `${lines}\n${button}`,
    foot: `<tr><td class="foot" style="padding:16px 4px 0">${foot}</td></tr>`,
    dark: "",
  });
}
