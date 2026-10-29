/**
 * An alert as an email's HTML, beside the words the text mail says (the emails-and-forms review, 28 Oct 2026). Every
 * alert went out as plain text: its one action a bare address at the bottom, a call's whole transcript pasted in, its
 * facts as "Label: value" lines. Its writers compose words, not markup, and keep doing so: this draws any alert's words
 * in one layout, as the text mail says them.
 *
 * How the words are read, a block at a time (blocks are split by a blank line):
 *   - lines that are all "Label: value" are the alert's facts, a table;
 *   - a block that opens with "Label:" alone is a section under that label ("Summary:"), set apart; a call's transcript
 *     is left to the page the mail links, where it is read whole;
 *   - anything else is a paragraph, its addresses links.
 *
 * Its tone (a chip: needs you, good news) and the words on its one button are the bell's for the same row
 * (serverNotificationRows), so the mail, the bell and the phone say one thing. Drawn in the frame a business's letter
 * to its customer is drawn in (look/mail-frame.ts), with Chanlytics' mark and coral.
 */
import { INK, INK_2, INK_3, LINE, mailButtonHtml, mailFrameHtml } from "../look/mail-frame";
import { escapeHtml, linkifyEscaped } from "../shared/html";
import { serverNotificationRows } from "../today/notifications";

/** One alert, as the edge mails it. */
export interface NoticeMail {
  /** The kept row's kind (null: an alert of no kind, as the platform's own). */
  kind: string | null;
  subject: string;
  /** The alert's words as the text mail says them, without the line that links its page. */
  body: string;
  /** The route the notice opens, as the bell keeps it: its button's words follow it. */
  route: string | null;
  /** The page the notice opens, the address the text mail ends with; null when there is none. */
  href: string | null;
  /** The workspace's name; null for the platform's own news. */
  workspace: string | null;
  /** Settings › Notifications in that workspace, where its emails are chosen; null with no workspace. */
  settingsHref: string | null;
}

const FACT = /^([A-Z][^:\n]{0,40}):\s+(\S.*)$/u;
const SECTION = /^([A-Z][^:\n]{0,40}):$/u;
/** The sections a mail leaves to the page it links: a call's transcript is long, and it is the customer's own words. */
const LEFT_TO_THE_PAGE = new Set(["Transcript"]);

type Block = { facts: Array<[string, string]> } | { section: string; lines: string[] } | { lines: string[] };

function blocksOf(body: string): Block[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((b) =>
      b
        .split("\n")
        .map((l) => l.trimEnd())
        .filter((l) => l.trim()),
    )
    .filter((lines) => lines.length > 0)
    .map((lines): Block => {
      const head = SECTION.exec(lines[0] ?? "");
      if (head && lines.length > 1) return { section: head[1] ?? "", lines: lines.slice(1) };
      const facts = lines.map((l) => FACT.exec(l));
      if (facts.every((f) => f)) return { facts: facts.map((f) => [f?.[1] ?? "", f?.[2] ?? ""]) };
      return { lines };
    });
}

const ACTION = "#c4452e";
const LINK_STYLE = `color:${ACTION};text-decoration:underline`;

/** Words into the mail: escaped, addresses linked, line breaks kept. */
const mailWords = (s: string): string => linkifyEscaped(escapeHtml(s), LINK_STYLE).replace(/\n/g, "<br>");

/** The chip a tone wears, in the app's own colours; none for plain news. */
const CHIPS: Record<"ok" | "warn", { words: string; bg: string; ink: string; cls: string }> = {
  warn: { words: "Needs you", bg: "#fbf0dc", ink: "#7a5718", cls: "chip-warn" },
  ok: { words: "Good news", bg: "#e3f3ea", ink: "#1f6b44", cls: "chip-ok" },
};

/** The bell's tone and button words for this alert: one derivation, the bell's (serverNotificationRows). */
function bellLookOf(m: Pick<NoticeMail, "kind" | "subject" | "route">): { tone: string; action: string } {
  const [row] = serverNotificationRows({
    seen_at: null,
    notifications: [
      {
        id: "mail",
        kind: m.kind ?? "alert",
        title: m.subject,
        body: "",
        route: m.route,
        subject_type: null,
        subject_id: null,
        created_at: new Date(0).toISOString(),
        read: true,
        dismissed: false,
      },
    ],
  });
  return { tone: row?.tone ?? "", action: row?.action ?? "Open Chanlytics" };
}

function blockHtml(b: Block, href: string | null): string {
  if ("facts" in b) {
    const rows = b.facts
      .map(
        ([label, value], i) =>
          `<tr><td class="ink3 line" style="padding:9px 12px 9px 0;width:132px;vertical-align:top;font-size:14px;color:${INK_3};${i ? `border-top:1px solid ${LINE};` : ""}">${escapeHtml(label)}</td>` +
          `<td class="ink line" style="padding:9px 0;vertical-align:top;font-size:14px;color:${INK};${i ? `border-top:1px solid ${LINE};` : ""}">${mailWords(value)}</td></tr>`,
      )
      .join("");
    return `<table role="presentation" class="line" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};margin:0 0 16px">${rows}</table>`;
  }
  if ("section" in b) {
    if (LEFT_TO_THE_PAGE.has(b.section))
      return href
        ? `<p class="ink3" style="margin:0 0 16px;font-size:13px;color:${INK_3}">The ${escapeHtml(b.section.toLowerCase())} is on its page: <a href="${escapeHtml(href)}" style="${LINK_STYLE}">read it there</a>.</p>`
        : "";
    return (
      `<p class="ink3" style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${INK_3}">${escapeHtml(b.section)}</p>` +
      `<p class="quote ink2" style="margin:0 0 16px;padding:12px 14px;border-radius:10px;background:#f2f3f7;font-size:15px;line-height:1.55;color:${INK_2}">${mailWords(b.lines.join("\n"))}</p>`
    );
  }
  return `<p class="ink2" style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${INK_2}">${mailWords(b.lines.join("\n"))}</p>`;
}

/** The mail's first line in an inbox's list, before it is opened: the alert's first words. */
function mailPreviewOf(blocks: Block[]): string {
  const first = blocks.find((b) => !("section" in b));
  if (!first) return "";
  const line = "facts" in first ? `${first.facts[0]?.[0]}: ${first.facts[0]?.[1]}` : first.lines.join(" ");
  return line.slice(0, 140);
}

/** The dark side of the alert's own classes: its rules, its mark's tile, a quote, the chips and its links. */
const DARK = `.line{border-color:#2c2d35!important}.tile{background:#f1f1f4!important;color:#17181c!important}.quote{background:#24252b!important}.chip-warn{background:#3a2e17!important;color:#f0cf8c!important}.chip-ok{background:#163828!important;color:#8fd6ae!important}.card p a,.card table.line a{color:#f19a85!important}.foot a{color:#c3c4cc!important}`;

/** An alert's HTML: the layout, the words as the text mail says them, the bell's chip and button. */
export function noticeMailHtml(m: NoticeMail): string {
  const blocks = blocksOf(m.body);
  const look = bellLookOf(m);
  const chip = look.tone === "warn" || look.tone === "ok" ? CHIPS[look.tone] : null;
  const button = m.href ? mailButtonHtml(look.action, m.href, ACTION) : "";
  const foot = m.workspace
    ? `You get this because this address is on ${escapeHtml(m.workspace)}’s alert list.` +
      (m.settingsHref
        ? ` Choose what’s emailed in <a href="${escapeHtml(m.settingsHref)}" style="color:${INK_2};text-decoration:underline">Settings › Notifications</a>.`
        : "")
    : "A Chanlytics platform alert.";
  return mailFrameHtml({
    subject: m.subject,
    preview: mailPreviewOf(blocks),
    top: `<tr><td style="padding:0 4px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:14px;font-weight:600;color:${INK}" class="ink"><span class="tile" style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:6px;background:${INK};color:#ffffff;text-align:center;font-size:12px;font-weight:700;vertical-align:middle">C</span>&nbsp;&nbsp;<span style="vertical-align:middle">Chanlytics</span></td>
<td align="right" class="ink3" style="font-size:12px;color:${INK_3}">${m.workspace ? escapeHtml(m.workspace) : ""}</td>
</tr></table></td></tr>`,
    card: `${chip ? `<p style="margin:0 0 14px"><span class="${chip.cls}" style="display:inline-block;padding:4px 10px;border-radius:999px;background:${chip.bg};color:${chip.ink};font-size:12px;font-weight:600">${chip.words}</span></p>` : ""}
<h1 class="ink" style="margin:0 0 14px;font-size:22px;line-height:1.25;font-weight:700;color:${INK}">${escapeHtml(m.subject)}</h1>
${blocks.map((b) => blockHtml(b, m.href)).join("\n")}
${button}`,
    foot: `<tr><td class="ink3 foot" style="padding:16px 4px 0;font-size:12px;line-height:1.6;color:${INK_3}">${foot}</td></tr>`,
    dark: DARK,
  });
}
