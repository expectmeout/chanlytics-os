export function emailSubjectOf(m) {
  const email = m.meta?.email;
  return typeof email?.subject === "string" && email.subject.trim() ? email.subject.trim() : null;
}
export function emailLeftOutOf(meta) {
  const email = meta?.email;
  if (!email) return null;
  const files = Array.isArray(email.attachments) ? email.attachments : [];
  const unnamed = typeof email.more_attachments === "number" && email.more_attachments > 0 ? email.more_attachments : 0;
  const names = files.map((f) => f?.filename).filter((n) => typeof n === "string" && n.trim().length > 0);
  const total = files.length + unnamed;
  const said = [];
  if (total) {
    const rest = total - names.length;
    const listed = names.length ? `: ${names.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}` : "";
    said.push(`${total === 1 ? "1 attachment was" : `${total} attachments were`} not kept${listed}.`);
  }
  if (email.truncated === true) said.push("This email was longer than Chanlytics keeps; the rest was left out.");
  return said.length ? said.join(" ") : null;
}
const QUOTE_BLOCK = /^[ \t]*(?:(?:-{2,}[ \t]*Original Message[ \t]*-{2,})|(?:_{5,})|(?:>[ \t]?))/m;
const QUOTE_ATTRIBUTION = /\bOn\b[\s\S]{0,240}?\bwrote:[ \t]*(?=\r?\n|>)/;
export function splitQuotedReply(body) {
  const cuts = [QUOTE_ATTRIBUTION.exec(body), QUOTE_BLOCK.exec(body)].filter((m) => m !== null).map((m) => m.index);
  if (cuts.length === 0) return { text: body, quoted: null };
  const cut = Math.min(...cuts);
  const text = body.slice(0, cut).trim();
  const quoted = body.slice(cut).trim();
  if (!text || !quoted) return { text: body, quoted: null };
  return { text, quoted };
}
