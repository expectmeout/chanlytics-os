import { escapeHtml } from "../shared/html.js";
import { LETTER_WORDS, accentOf } from "./look.js";
const LETTER_INK = "#1f2026";
const INK_2 = "#4b4d5a";
const INK_3 = "#6b6d7a";
const LINE = "#e3e4ec";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif";
const DARK = `@media (prefers-color-scheme:dark){.bg{background:#121317!important}.card{background:#1d1e23!important;border-color:#2c2d35!important}.ink{color:#f1f1f4!important}.ink2{color:#c3c4cc!important}.ink3{color:#9a9ba6!important}}
@media (max-width:620px){.wrap{width:100%!important}.pad{padding:22px 20px!important}}`;
export function letterHtml(l) {
  const accent = accentOf(l.look);
  const name = escapeHtml(l.look.business);
  const mark = l.look.logo_url ? `<img src="${escapeHtml(l.look.logo_url)}" alt="${name}" height="40" style="display:block;height:40px;width:auto;border:0">` : `<span class="ink" style="font-size:18px;font-weight:700;color:${LETTER_INK}">${name}</span>`;
  const lines = l.lines.map(
    (p) => `<p class="ink2" style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${INK_2}">${escapeHtml(p)}</p>`
  ).join("\n");
  const button = l.button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 0"><tr><td style="border-radius:10px;background:${accent}"><a href="${escapeHtml(l.button.href)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;line-height:18px;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(l.button.words)}</a></td></tr></table>` : "";
  const foot = [...l.foot, LETTER_WORDS.sentFor(l.look.business)].map(
    (f) => `<p class="ink3" style="margin:0 0 4px;font-size:12px;line-height:1.6;color:${INK_3}">${escapeHtml(f)}</p>`
  ).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(l.subject)}</title><style>${DARK}</style></head>
<body class="bg" style="margin:0;padding:0;background:#f6f7fa">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(l.preview)}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fa;font-family:${FONT}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" class="wrap" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px">
<tr><td style="padding:0 4px 16px">${mark}</td></tr>
<tr><td class="card pad" style="background:#ffffff;border:1px solid ${LINE};border-radius:14px;padding:26px 28px">
${lines}
${button}
</td></tr>
<tr><td class="foot" style="padding:16px 4px 0">${foot}</td></tr>
</table></td></tr></table></body></html>`;
}
